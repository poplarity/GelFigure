import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright';
import { AgentError } from '../src/common.mjs';
import { Workspace } from '../src/files.mjs';
import { createMcpServer } from '../src/mcp.mjs';
import { runCli } from '../bin/gelfigure.mjs';

const cli = fileURLToPath(new URL('../bin/gelfigure.mjs', import.meta.url));
let workspace;
test.before(async () => { workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'gelfigure-transport-')); });
test.after(async () => { await fs.rm(workspace, { recursive: true, force: true }); });

function execute(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { shell: false, timeout: 30_000 });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}
function capture() {
  let text = '';
  return { write(chunk) { text += chunk; }, get text() { return text; } };
}
async function linked(t, service) {
  const server = createMcpServer(service);
  const client = new Client({ name: 'gelfigure-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

test('CLI help/version need no workspace and importing the entry has no side effects', async () => {
  const help = await execute(['--help']);
  assert.equal(help.code, 0, help.stderr);
  for (const command of ['doctor', 'ladders', 'analyze', 'prepare', 'render', 'revise', 'validate', 'mcp', 'setup']) {
    assert.ok(help.stdout.includes(command), command);
  }
  assert.equal(help.stderr, '');
  const version = await execute(['--version']);
  assert.equal(version.code, 0, version.stderr);
  assert.match(version.stdout, /^\d+\.\d+\.\d+\n$/);
});

test('CLI rejects missing/relative/nonexistent workspaces with one JSON failure', async () => {
  for (const args of [ ['doctor'], ['doctor', '--workspace', '.'],
    ['doctor', '--workspace', path.join(workspace, 'absent')] ]) {
    const result = await execute(args);
    assert.equal(result.code, 1, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.apiVersion, '1'); assert.equal(data.status, 'failed');
    assert.equal(data.error.code, 'WORKSPACE_REQUIRED');
    assert.equal(result.stdout.trim().split('\n').length, 1);
    assert.equal(result.stderr, '');
  }
});

test('CLI rejects unknown commands, flags, duplicate flags and missing required paths', async () => {
  for (const args of [['unknown'], ['doctor', '--arbitrary', 'x'],
    ['doctor', '--workspace', workspace, '--workspace', workspace],
    ['render', '--workspace', workspace], ['ladders', '--workspace', workspace, '--plan', 'x'],
    ['doctor', '--workspace', workspace, 'unexpected']]) {
    const result = await execute(args);
    assert.equal(result.code, 1, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'failed');
  }
});

test('CLI spec paths use the real bounded workspace JSON reader before calling the service', async () => {
  await fs.writeFile(path.join(workspace, 'bad.json'), '{not json');
  await fs.writeFile(path.join(workspace, 'large.json'), ' '.repeat(4 * 1024 * 1024 + 1));
  for (const [spec, code] of [['bad.json', 'INPUT_INVALID'], ['large.json', 'INPUT_SIZE_LIMIT'],
    ['../escape.json', 'PATH_OUTSIDE_WORKSPACE'], ['https://example.invalid/spec.json', 'INVALID_PATH']]) {
    const result = await execute(['prepare', '--workspace', workspace, '--analysis', 'missing.json', '--spec', spec, '--out', 'out']);
    assert.equal(result.code, 1, result.stderr);
    assert.equal(JSON.parse(result.stdout).error.code, code);
  }
});

test('CLI prepare/revise pass parsed objects, preserve service results and use exit 0/2/1', async () => {
  const spec = { expectedRevision: 'revision', laneLabels: [{ laneId: 'lane_001', text: '  β <x>  ' }] };
  await fs.writeFile(path.join(workspace, 'spec.json'), JSON.stringify(spec));
  for (const [status, exit] of [['succeeded', 0], ['ready_to_render', 0], ['awaiting_answers', 2], ['needs_review', 2], ['failed', 1]]) {
    for (const command of ['prepare', 'revise']) {
      const stdout = capture(), stderr = capture(); let received, closed = 0, created = 0;
      const service = { files: new Workspace(workspace),
        [command]: async args => { received = args; return { apiVersion: '1', status, questions: [] }; },
        close: async () => { closed++; } };
      const sourceFlag = command === 'prepare' ? '--analysis' : '--plan';
      const code = await runCli([command, '--workspace', workspace, sourceFlag, 'source.json', '--spec', 'spec.json', '--out', 'new-run'],
        { stdout, stderr, createService: async () => { created++; return service; } });
      assert.equal(code, exit); assert.equal(JSON.parse(stdout.text).status, status);
      assert.deepEqual(received, { [command === 'prepare' ? 'analysis' : 'plan']: 'source.json', spec, out: 'new-run' });
      assert.equal(closed, 1); assert.equal(created, 1); assert.equal(stderr.text, '');
    }
  }
});

test('CLI AgentError carries details without a stack and closes the service', async () => {
  const stdout = capture(), stderr = capture(); let closed = 0;
  const result = await runCli(['validate', '--workspace', workspace, '--plan', 'plan.json'], { stdout, stderr,
    createService: async () => ({ files: new Workspace(workspace), validate: async () => {
      throw new AgentError('STALE_REVISION', 'Project changed', { expected: 'a', actual: 'b' });
    }, close: async () => { closed++; } }) });
  assert.equal(result, 1); assert.equal(closed, 1);
  assert.deepEqual(JSON.parse(stdout.text), { apiVersion: '1', status: 'failed', error: {
    code: 'STALE_REVISION', message: 'Project changed', details: { expected: 'a', actual: 'b' }
  } });
});

test('CLI analyze parses bounded geometry files and converts only a valid lane count', async () => {
  const crop = { x: 10, y: 20, w: 400, h: 300, space: 'oriented-image-px' };
  const positions = [30, 80, 130];
  await fs.writeFile(path.join(workspace, 'crop.json'), JSON.stringify(crop));
  await fs.writeFile(path.join(workspace, 'positions.json'), JSON.stringify(positions));
  const stdout = capture(); let received;
  const code = await runCli(['analyze', '--workspace', workspace, '--input', 'gel.tif', '--out', 'corrected',
    '--crop', 'crop.json', '--lane-positions', 'positions.json'], { stdout, stderr: capture(),
    createService: async () => ({ files: new Workspace(workspace), analyze: async args => {
      received = args; return { apiVersion: '1', status: 'succeeded' };
    }, close: async () => {} }) });
  assert.equal(code, 0, stdout.text);
  assert.deepEqual(received, { input: 'gel.tif', out: 'corrected', crop, lanePositions: positions });
  const countOutput = capture();
  assert.equal(await runCli(['analyze', '--workspace', workspace, '--input', 'gel.tif', '--out', 'counted', '--lane-count', '3'], {
    stdout: countOutput, stderr: capture(), createService: async () => ({ files: new Workspace(workspace),
      analyze: async args => { received = args; return { status: 'succeeded' }; }, close: async () => {} }) }), 0);
  assert.deepEqual(received, { input: 'gel.tif', out: 'counted', laneCount: 3 });
  let calls = 0;
  for (const value of ['0', '61', '2.5', 'NaN', 'Infinity', '0x3', '3e0', '']) {
    const output = capture();
    const result = await runCli(['analyze', '--workspace', workspace, '--input', 'gel.tif', '--out', 'x', '--lane-count', value], {
      stdout: output, stderr: capture(), createService: async () => ({ files: new Workspace(workspace),
        analyze: async () => { calls++; return { status: 'succeeded' }; }, close: async () => {} }) });
    assert.equal(result, 1); assert.equal(JSON.parse(output.text).error.code, 'INVALID_SPEC');
  }
  assert.equal(calls, 0);
});

test('CLI rejects conflicting geometry and explicitly empty enum options', async () => {
  await fs.writeFile(path.join(workspace, 'positions.json'), '[30,80,130]');
  for (const flags of [['--lane-count', '3', '--lane-positions', 'positions.json'], ['--gel-type', ''], ['--orientation', '']]) {
    let calls = 0; const output = capture();
    const code = await runCli(['analyze', '--workspace', workspace, '--input', 'gel.tif', '--out', 'out', ...flags], {
      stdout: output, stderr: capture(), createService: async () => ({ files: new Workspace(workspace),
        analyze: async () => { calls++; return { status: 'succeeded' }; }, close: async () => {} }) });
    assert.equal(code, 1); assert.equal(JSON.parse(output.text).error.code, 'INVALID_SPEC'); assert.equal(calls, 0);
  }
});

test('CLI geometry JSON rejects wrong types, units, extra fields and nonfinite values', async () => {
  for (const [flag, value] of [
    ['--crop', { x: '10', y: 0, w: 10, h: 10, space: 'oriented-image-px' }],
    ['--crop', { x: 0, y: 0, w: 0, h: 10, space: 'oriented-image-px' }],
    ['--crop', { x: 0, y: 0, w: 10, h: 10, space: 'raw-px' }],
    ['--crop', { x: 0, y: 0, w: 10, h: 10, space: 'oriented-image-px', extra: 1 }],
    ['--lane-positions', ['10', 30]], ['--lane-positions', []], ['--lane-positions', [10, 1e309]]
  ]) {
    await fs.writeFile(path.join(workspace, 'geometry.json'), JSON.stringify(value));
    const output = capture(); let calls = 0;
    const result = await runCli(['analyze', '--workspace', workspace, '--input', 'gel.tif', '--out', 'x', flag, 'geometry.json'], {
      stdout: output, stderr: capture(), createService: async () => ({ files: new Workspace(workspace),
        analyze: async () => { calls++; return { status: 'succeeded' }; }, close: async () => {} }) });
    assert.equal(result, 1); assert.equal(JSON.parse(output.text).error.code, 'INVALID_SPEC'); assert.equal(calls, 0);
  }
});

test('MCP startup failure stays on stderr and closes the service', async () => {
  const stdout = capture(), stderr = capture(); let closed = 0;
  const code = await runCli(['mcp', '--workspace', workspace], { stdout, stderr,
    createService: async () => ({ files: { get ready() { return Promise.reject(new AgentError('WORKSPACE_REQUIRED', 'Invalid workspace')); } }, close: async () => { closed++; } }) });
  assert.equal(code, 1); assert.equal(stdout.text, ''); assert.equal(closed, 1);
  assert.equal(JSON.parse(stderr.text).error.code, 'WORKSPACE_REQUIRED');
});

async function portableFixture(name) {
  const root = path.join(workspace, name);
  await fs.mkdir(path.join(root, 'agent/bin'), { recursive: true });
  await fs.mkdir(path.join(root, 'agent/src'), { recursive: true });
  await fs.mkdir(path.join(root, 'runtime/browsers'), { recursive: true });
  await fs.copyFile(cli, path.join(root, 'agent/bin/gelfigure.mjs'));
  await fs.copyFile(new URL('../src/common.mjs', import.meta.url), path.join(root, 'agent/src/common.mjs'));
  await fs.writeFile(path.join(root, 'agent/package.json'), JSON.stringify({ version: '0.1.0' }));
  return root;
}

test('portable browser path is configured before service import', async () => {
  const root = await portableFixture('portable path with spaces');
  await fs.writeFile(path.join(root, 'agent/src/service.mjs'), `
    const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
    export class AgentService {
      files = {ready: Promise.resolve()};
      async doctor() { return {apiVersion:'1',status:'succeeded',browserPath}; }
      async close() {}
    }
  `);
  const child = spawn(process.execPath, [path.join(root, 'agent/bin/gelfigure.mjs'), 'doctor', '--workspace', workspace], {
    shell: false, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '/should-be-overridden' }
  });
  let stdout = ''; child.stdout.on('data', chunk => { stdout += chunk; });
  const code = await new Promise((resolve, reject) => { child.on('close', resolve); child.on('error', reject); });
  assert.equal(code, 0, stdout);
  assert.equal(JSON.parse(stdout).browserPath, await fs.realpath(path.join(root, 'runtime/browsers')));
});

test('setup invokes the current Node with exact Playwright args and redirects installer logs', async () => {
  const root = await portableFixture('setup fixture');
  const playwright = path.join(root, 'agent/node_modules/playwright');
  await fs.mkdir(playwright, { recursive: true });
  await fs.writeFile(path.join(playwright, 'package.json'), JSON.stringify({ name: 'playwright', exports: { './package.json': './package.json' } }));
  await fs.writeFile(path.join(playwright, 'cli.js'), `console.log(JSON.stringify({exec:process.execPath,args:process.argv.slice(2)})); console.error('installer log');`);
  const child = spawn(process.execPath, [path.join(root, 'agent/bin/gelfigure.mjs'), 'setup'], { shell: false });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => { child.on('close', resolve); child.on('error', reject); });
  assert.equal(code, 0, stderr); assert.equal(JSON.parse(stdout).status, 'succeeded');
  const invocation = JSON.parse(stderr.trim().split('\n')[0]);
  assert.equal(invocation.exec, process.execPath);
  assert.deepEqual(invocation.args, ['install', '--only-shell', 'chromium']);
  assert.ok(stderr.includes('installer log'));
});

test('real SDK initializes, lists exactly seven strict tools and calls ladders directly', async t => {
  const calls = [];
  const service = { ladders: async args => { calls.push(args); return { apiVersion: '1', status: 'succeeded', ladders: [{ id: 'p', kind: 'protein' }] }; }, close: async () => {} };
  const { client } = await linked(t, service);
  assert.equal(client.getServerVersion().name, 'gelfigure');
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(),
    ['doctor', 'ladders', 'analyze', 'prepare', 'render', 'revise', 'validate'].map(name => `gelfigure_${name}`).sort());
  for (const tool of listed.tools) assert.equal(tool.inputSchema.additionalProperties, false);
  const result = await client.callTool({ name: 'gelfigure_ladders', arguments: { query: 'Precision', kind: 'protein' } });
  assert.deepEqual(calls, [{ query: 'Precision', kind: 'protein' }]);
  assert.equal(result.isError, false);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.equal(result.structuredContent.ladders[0].id, 'p');
});

test('MCP awaiting/review are normal results; failures carry structuredContent and isError', async t => {
  const spec = { expectedRevision: 'r' }; let received;
  const { client } = await linked(t, {
    prepare: async args => { received = args; return { apiVersion: '1', status: 'awaiting_answers', questions: [{ id: 'GEL_TYPE_REQUIRED', field: 'gelType', message: 'Confirm type' }] }; },
    validate: async () => ({ apiVersion: '1', status: 'needs_review', quality: [] }),
    render: async () => { throw new AgentError('PLAN_NOT_READY', 'Answer questions', { plan: 'plan.json' }); },
    doctor: async () => ({ apiVersion: '1', status: 'failed', error: { code: 'RUNTIME_MISSING', message: 'Setup needed' } }),
    close: async () => {}
  });
  const pending = await client.callTool({ name: 'gelfigure_prepare', arguments: { analysis: 'analysis.json', spec, out: 'prepared' } });
  assert.deepEqual(received, { analysis: 'analysis.json', spec, out: 'prepared' });
  assert.equal(pending.isError, false); assert.equal(pending.structuredContent.status, 'awaiting_answers');
  const review = await client.callTool({ name: 'gelfigure_validate', arguments: { plan: 'plan.json' } });
  assert.equal(review.isError, false); assert.equal(review.structuredContent.status, 'needs_review');
  const failure = await client.callTool({ name: 'gelfigure_render', arguments: { plan: 'plan.json', out: 'result' } });
  assert.equal(failure.isError, true); assert.equal(failure.structuredContent.error.code, 'PLAN_NOT_READY');
  assert.deepEqual(failure.structuredContent.error.details, { plan: 'plan.json' });
  const failedStatus = await client.callTool({ name: 'gelfigure_doctor', arguments: {} });
  assert.equal(failedStatus.isError, true);
});

test('MCP rejects unknown tools/arguments and malformed types without invoking service', async t => {
  let calls = 0;
  const { client } = await linked(t, { ladders: async () => { calls++; }, analyze: async () => { calls++; }, close: async () => {} });
  for (const [name, args] of [['gelfigure_ladders', { query: 4 }], ['gelfigure_ladders', { arbitrary: true }],
    ['gelfigure_ladders', { kind: 'rna' }], ['gelfigure_analyze', { input: 'gel.tif', out: 'a', orientation: '360' }],
    ['gelfigure_analyze', { input: 'gel.tif' }], ['gelfigure_eval', { script: 'bad' }]]) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true); assert.equal(result.structuredContent.status, 'failed');
  }
  assert.equal(calls, 0);
});

test('MCP analyze publishes geometry types, forwards values and rejects malformed corrections', async t => {
  const calls = [];
  const { client } = await linked(t, { analyze: async args => { calls.push(args); return { apiVersion: '1', status: 'succeeded' }; }, close: async () => {} });
  const crop = { x: 10, y: 20, w: 400, h: 300, space: 'oriented-image-px' };
  const args = { input: 'gel.tif', out: 'corrected', crop, lanePositions: [30, 80, 130] };
  const result = await client.callTool({ name: 'gelfigure_analyze', arguments: args });
  assert.equal(result.isError, false); assert.deepEqual(calls, [args]);
  const schema = (await client.listTools()).tools.find(tool => tool.name === 'gelfigure_analyze').inputSchema;
  assert.equal(schema.properties.crop.additionalProperties, false);
  assert.equal(schema.properties.laneCount.type, 'integer');
  for (const patch of [{ laneCount: 3 }, { laneCount: '3' }, { laneCount: 61 }, { laneCount: 1.5 }, { lanePositions: ['30'] },
    { lanePositions: [] }, { crop: { ...crop, x: '10' } }, { crop: { ...crop, extra: true } }, { crop: { ...crop, space: 'raw-px' } }]) {
    const failed = await client.callTool({ name: 'gelfigure_analyze', arguments: { ...args, ...patch } });
    assert.equal(failed.isError, true); assert.equal(failed.structuredContent.error.code, 'INVALID_SPEC');
  }
  assert.equal(calls.length, 1);
});

const previewPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=', 'base64');
const resourceLinks = result => result.content.filter(item => item.type === 'resource_link');
const invalidResource = error => error.code === -32602;

test('MCP resources register only returned diagnostic/preview PNGs and read through the SDK', async t => {
  await fs.mkdir(path.join(workspace, 'resources'), { recursive: true });
  for (const name of ['diagnostic.png', 'preview.png', 'source.png', 'figure.png']) {
    await fs.writeFile(path.join(workspace, 'resources', name), previewPng);
  }
  const analysisResult = { apiVersion: '1', status: 'succeeded', diagnostic: 'resources/diagnostic.png',
    project: 'project.gelfig', source: 'resources/source.png', artifacts: ['resources/figure.png'] };
  const { client } = await linked(t, { files: new Workspace(workspace), analyze: async () => analysisResult,
    prepare: async () => ({ apiVersion: '1', status: 'awaiting_answers', questions: [], preview: 'resources/preview.png' }), close: async () => {} });
  assert.ok(client.getServerCapabilities().resources);
  assert.deepEqual((await client.listResources()).resources, []);
  const result = await client.callTool({ name: 'gelfigure_analyze', arguments: { input: 'resources/source.png', out: 'analysis' } });
  assert.deepEqual(result.structuredContent, analysisResult);
  assert.equal(resourceLinks(result).length, 1);
  const link = resourceLinks(result)[0];
  assert.equal(link.mimeType, 'image/png'); assert.equal(link.size, previewPng.length);
  assert.ok(!link.uri.startsWith('file:'));
  const read = await client.readResource({ uri: link.uri });
  assert.equal(read.contents[0].mimeType, 'image/png');
  assert.deepEqual(Buffer.from(read.contents[0].blob, 'base64'), previewPng);
  const pending = await client.callTool({ name: 'gelfigure_prepare', arguments: { analysis: 'analysis.json', spec: {}, out: 'pending' } });
  assert.equal(pending.isError, false); assert.equal(resourceLinks(pending).length, 1);
  const listed = (await client.listResources()).resources;
  assert.equal(listed.length, 2);
  assert.deepEqual(listed.map(item => item.uri), [link.uri, resourceLinks(pending)[0].uri]);
  await client.callTool({ name: 'gelfigure_analyze', arguments: { input: 'resources/source.png', out: 'analysis2' } });
  assert.equal((await client.listResources()).resources.length, 2, 'duplicate paths reuse registered resources');
});

test('MCP resources reject unregistered, outside and other-session URIs', async t => {
  const file = path.join(workspace, 'session-diagnostic.png');
  await fs.writeFile(file, previewPng);
  const { client } = await linked(t, { files: new Workspace(workspace), analyze: async () => ({ apiVersion: '1', status: 'succeeded', diagnostic: 'session-diagnostic.png' }), close: async () => {} });
  const result = await client.callTool({ name: 'gelfigure_analyze', arguments: { input: 'gel.tif', out: 'analysis' } });
  const links = resourceLinks(result); assert.equal(links.length, 1);
  for (const uri of [pathToFileURL(file).href, 'file:///etc/passwd', 'gelfigure://preview/unregistered', links[0].uri + '/../source.png']) {
    await assert.rejects(client.readResource({ uri }), invalidResource);
  }
  const other = await linked(t, { close: async () => {} });
  assert.deepEqual((await other.client.listResources()).resources, []);
  await assert.rejects(other.client.readResource({ uri: links[0].uri }), invalidResource);
});

test('MCP resources omit invalid, oversized, outside and failed-result previews', async t => {
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'gelfigure-preview-outside-'));
  t.after(async () => { await fs.rm(outside, { recursive: true, force: true }); });
  await fs.writeFile(path.join(outside, 'outside.png'), previewPng);
  await fs.writeFile(path.join(workspace, 'not-png.png'), 'not a PNG');
  const oversized = Buffer.alloc(4 * 1024 * 1024 + 1); previewPng.copy(oversized);
  await fs.writeFile(path.join(workspace, 'oversized.png'), oversized);
  await fs.writeFile(path.join(workspace, 'failed-diagnostic.png'), previewPng);
  const { client } = await linked(t, { files: new Workspace(workspace), analyze: async ({ input }) => ({ apiVersion: '1',
    status: input === 'failed-diagnostic.png' ? 'failed' : 'succeeded', diagnostic: input }), close: async () => {} });
  const paths = ['not-png.png', 'oversized.png', path.join(outside, 'outside.png'), 'failed-diagnostic.png'];
  try {
    await fs.symlink(path.join(outside, 'outside.png'), path.join(workspace, 'outside-link.png'));
    paths.push('outside-link.png');
  } catch (error) { if (!['EPERM', 'EACCES'].includes(error.code)) throw error; }
  for (const input of paths) {
    const result = await client.callTool({ name: 'gelfigure_analyze', arguments: { input, out: 'analysis' } });
    assert.deepEqual(resourceLinks(result), [], input);
  }
  assert.deepEqual((await client.listResources()).resources, []);
});

test('MCP resources recheck PNG bytes, size, workspace boundaries and digest on every read', async t => {
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'gelfigure-preview-change-'));
  t.after(async () => { await fs.rm(outside, { recursive: true, force: true }); });
  await fs.writeFile(path.join(outside, 'source.png'), previewPng);
  const { client } = await linked(t, { files: new Workspace(workspace), analyze: async ({ input }) => ({ apiVersion: '1', status: 'succeeded', diagnostic: input }), close: async () => {} });
  const mutations = [
    file => fs.writeFile(file, 'not a PNG'),
    file => fs.writeFile(file, Buffer.alloc(4 * 1024 * 1024 + 1)),
    file => fs.writeFile(file, Buffer.concat([previewPng, Buffer.from('changed')])),
    async file => {
      await fs.unlink(file);
      try { await fs.symlink(path.join(outside, 'source.png'), file); }
      catch (error) { if (!['EPERM', 'EACCES'].includes(error.code)) throw error; }
    }
  ];
  for (const [i, mutate] of mutations.entries()) {
    const input = `changing-preview-${i}.png`, file = path.join(workspace, input);
    await fs.writeFile(file, previewPng);
    const result = await client.callTool({ name: 'gelfigure_analyze', arguments: { input, out: 'analysis' } });
    const links = resourceLinks(result); assert.equal(links.length, 1);
    await mutate(file);
    await assert.rejects(client.readResource({ uri: links[0].uri }), invalidResource);
  }
});

test('closing the SDK session releases its service once', async () => {
  let closed = 0;
  const server = createMcpServer({ close: async () => { closed++; } });
  const client = new Client({ name: 'lifecycle-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b); await client.connect(a); await client.close(); await server.close();
  assert.equal(closed, 1);
});

test('CLI stdio runs a genuine SDK handshake without emitting nonprotocol stdout', async t => {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [cli, 'mcp', '--workspace', workspace], stderr: 'pipe' });
  let stderr = ''; transport.stderr.on('data', data => { stderr += data; });
  const client = new Client({ name: 'stdio-test', version: '1' });
  t.after(async () => { await client.close(); });
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 7);
  assert.equal(stderr, '');
});

test('CLI doctor uses the real offline service when managed Chromium is installed', async t => {
  try { await fs.access(chromium.executablePath()); }
  catch { t.skip('Managed Chromium not installed; this test never downloads it.'); return; }
  const result = await execute(['doctor', '--workspace', workspace]);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.status, 'succeeded'); assert.equal(data.network, 'offline');
  assert.equal(data.workspace, await fs.realpath(workspace));
});
