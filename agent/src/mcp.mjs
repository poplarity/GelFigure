import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema,
  ReadResourceRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { AgentError } from './common.mjs';
import { normalizeSpec } from './plan.mjs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const string = maxLength => ({ type: 'string', minLength: 1, maxLength });
const choices = values => ({ type: 'string', enum: values });
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const array = (items, maxItems = 512) => ({ type: 'array', items, maxItems });
const pathSchema = { ...string(4096), description: 'Local path contained in the configured workspace; no URLs.' };
const literal = { type: 'string', maxLength: 2048 };
const identifier = string(128);
// The service remains authoritative for all nested bounds and semantic gates.
const specSchema = object({
  schemaVersion: { const: '1' }, expectedRevision: string(256), gelType: choices(['dna', 'protein']),
  orientationConfirmed: { type: 'boolean' }, allowUnlabelledLanes: { type: 'boolean' },
  laneLabels: array(object({ laneId: identifier, text: literal }, ['laneId', 'text'])),
  markerPolicy: choices(['specified', 'omit']),
  markers: array(object({ laneId: identifier, ladderId: identifier,
    unit: choices(['bp', 'kb', 'auto', 'bp-inline', 'kb-inline', 'kDa', 'kDa-inline', 'none']) }, ['laneId', 'ladderId', 'unit']), 128),
  groups: array(object({ from: identifier, to: identifier, text: literal }, ['from', 'to', 'text']), 128),
  conditions: array(object({ name: string(256), values: { type: 'object', additionalProperties: { type: 'string', maxLength: 256 } } }, ['name', 'values']), 128),
  annotations: array({ oneOf: [
    object({ type: { const: 'sideText' }, text: literal, position: choices(['left', 'right', 'below']) }, ['type', 'text', 'position']),
    object({ type: { const: 'arrow' }, text: literal, laneId: identifier, size: { type: 'number', exclusiveMinimum: 0, maximum: 1e9 } }, ['type', 'text', 'laneId']),
    object({ type: { const: 'text' }, text: literal, at: object({ x: { type: 'number', minimum: 0, maximum: 1 },
      y: { type: 'number', minimum: 0, maximum: 1 }, space: { const: 'crop-fraction' } }, ['x', 'y', 'space']) }, ['type', 'text', 'at'])
  ] }),
  layout: object({ figureWidthMm: { type: 'number' }, fontPt: { type: 'number' },
    fontFamily: choices(['Arial', 'Helvetica', 'Times New Roman', 'Calibri', 'Cambria']),
    labelAngle: { anyOf: [{ const: 'auto' }, { type: 'number', minimum: 0, maximum: 90 }] }, laneNumbers: { type: 'boolean' } }),
  image: object({ display: choices(['gray', 'colour']), invert: { type: 'boolean' }, gamma: { type: 'number' } }),
  exports: object({ dpi: { type: 'integer' }, formats: { ...array(choices(['png', 'svg', 'tiff', 'pptx']), 4), minItems: 1, uniqueItems: true } }),
  provenance: array(object({ field: string(256), source: choices(['user', 'record', 'detector', 'default']),
    reference: string(2048), confirmed: { type: 'boolean' } }, ['field', 'source', 'reference', 'confirmed'])),
  conflicts: array(object({ id: identifier, field: string(256), message: string(2048), resolved: { type: 'boolean' } }, ['id', 'field', 'message', 'resolved']), 256),
  acknowledgements: { ...array(identifier, 128), uniqueItems: true }
});
const definitions = [
  ['doctor', 'Check the local managed browser, engine and font environment.', object({})],
  ['ladders', 'Find known DNA/protein ladder models. Scores do not confirm model identity.', object({ query: { type: 'string', maxLength: 200 }, kind: choices(['dna', 'protein']) })],
  ['analyze', 'Inspect a local gel/project; save analysis, editable project and diagnostic without final export.',
    { ...object({ input: pathSchema, out: pathSchema, gelType: choices(['dna', 'protein']),
      orientation: choices(['h', 'r90', 'r180', 'r270', 'r90h', 'r180h', 'r270h']),
      crop: { ...object({ x: { type: 'number', minimum: 0 }, y: { type: 'number', minimum: 0 },
        w: { type: 'number', exclusiveMinimum: 0 }, h: { type: 'number', exclusiveMinimum: 0 },
        space: { const: 'oriented-image-px' } }, ['x', 'y', 'w', 'h', 'space']),
        description: 'Crop in image pixels after orientation and deskew.' },
      laneCount: { type: 'integer', minimum: 1, maximum: 60 },
      lanePositions: { ...array({ type: 'number', minimum: 0 }, 60), minItems: 1, uniqueItems: true,
        description: 'Absolute lane x coordinates in image pixels after orientation and deskew.' }
    }, ['input', 'out']), not: { required: ['laneCount', 'lanePositions'] } }],
  ['prepare', 'Prepare a gated plan from analysis and a spec object; unanswered semantics return questions.',
    object({ analysis: pathSchema, spec: specSchema, out: pathSchema }, ['analysis', 'spec', 'out'])],
  ['render', 'Export only a ready plan after integrity, revision and current quality checks.', object({ plan: pathSchema, out: pathSchema }, ['plan', 'out'])],
  ['revise', 'Merge a spec patch into a new plan; bind expectedRevision to the prior plan revision.',
    object({ plan: pathSchema, spec: specSchema, out: pathSchema }, ['plan', 'spec', 'out'])],
  ['validate', 'Recheck plan integrity, semantic answers and quality without final export.', object({ plan: pathSchema }, ['plan'])]
];

function failure(error) {
  const detail = error instanceof AgentError ? { code: error.code, message: error.message,
    ...(error.details === undefined ? {} : { details: error.details }) } :
    { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected service failure.' };
  return { apiVersion: '1', status: 'failed', error: detail };
}

function previewRegistry(files) {
  const resources = new Map(), byFile = new Map(), prefix = `gelfigure://preview/${randomUUID()}/`;
  const limit = 4 * 1024 * 1024, signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  async function png(file) {
    const { full, bytes } = await files.read(file, limit);
    if (bytes.length > limit || !bytes.subarray(0, 8).equals(signature)) throw new Error('Invalid preview PNG.');
    return { full, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  return {
    list: () => [...resources.values()].map(record => record.resource),
    clear() { resources.clear(); byFile.clear(); },
    async register(result) {
      const links = [];
      if (result.status === 'failed') return links;
      for (const field of ['diagnostic', 'preview']) {
        const file = result[field];
        if (typeof file !== 'string' || !/\.png$/i.test(file)) continue;
        try {
          const data = await png(file);
          let record = resources.get(byFile.get(data.full));
          if (record && record.sha256 !== data.sha256) continue;
          if (!record) {
            if (resources.size >= 128) continue;
            const resource = { uri: prefix + (resources.size + 1), name: basename(file), mimeType: 'image/png', size: data.bytes.length };
            record = { file: data.full, sha256: data.sha256, resource };
            resources.set(resource.uri, record); byFile.set(data.full, resource.uri);
          }
          if (!links.some(link => link.uri === record.resource.uri)) links.push({ type: 'resource_link', ...record.resource });
        } catch {
          // Preview delivery is optional; keep the successful service result and its local paths.
        }
      }
      return links;
    },
    async read(uri) {
      const record = resources.get(uri);
      if (!record) throw new McpError(ErrorCode.InvalidParams, 'Preview resource is not registered in this session.');
      try {
        const data = await png(record.file);
        if (data.sha256 !== record.sha256) throw new Error('Preview changed.');
        return { contents: [{ uri, mimeType: 'image/png', blob: data.bytes.toString('base64') }] };
      } catch {
        throw new McpError(ErrorCode.InvalidParams, 'Preview is unavailable or changed; use a local file viewer to review the artifact.');
      }
    }
  };
}

export function createMcpServer(service) {
  const validator = new AjvJsonSchemaValidator();
  const tools = definitions.map(([method, description, inputSchema]) => ({
    name: `gelfigure_${method}`, description, inputSchema
  }));
  const handlers = new Map(definitions.map(([method, , schema]) => [`gelfigure_${method}`, {
    method, validate: validator.getValidator(schema)
  }]));
  const previews = previewRegistry(service.files);
  const server = new Server({ name: 'gelfigure', version }, { capabilities: { tools: {}, resources: {} },
    instructions: 'Use analyze → prepare → answer all questions/review warnings → revise → render. Files remain in the configured workspace.' });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: previews.list() }));
  server.setRequestHandler(ReadResourceRequestSchema, async request => previews.read(request.params.uri));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    let result;
    try {
      const handler = handlers.get(request.params.name);
      if (!handler) throw new AgentError('UNKNOWN_TOOL', 'Unknown GelFigure tool.');
      const args = request.params.arguments ?? {};
      const checked = handler.validate(args);
      if (!checked.valid) throw new AgentError('INVALID_SPEC', 'Invalid tool arguments.', { reason: checked.errorMessage });
      if (handler.method === 'prepare' || handler.method === 'revise') normalizeSpec(args.spec);
      result = await service[handler.method](args);
    } catch (error) { result = failure(error); }
    return { content: [{ type: 'text', text: JSON.stringify(result) }, ...await previews.register(result)],
      structuredContent: result, isError: result.status === 'failed' };
  });
  let closing;
  server.onclose = () => {
    previews.clear();
    return closing ??= Promise.resolve().then(() => service.close()).catch(error => server.onerror?.(error));
  };
  return server;
}
