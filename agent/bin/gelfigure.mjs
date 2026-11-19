#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { AgentError } from '../src/common.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const commandOptions = {
  doctor: [], ladders: ['query', 'kind'], analyze: ['input', 'out', 'gel-type', 'orientation', 'crop', 'lane-count', 'lane-positions'],
  prepare: ['analysis', 'spec', 'out'], render: ['plan', 'out'], revise: ['plan', 'spec', 'out'],
  validate: ['plan'], mcp: [], setup: []
};
const required = { analyze: ['input', 'out'], prepare: ['analysis', 'spec', 'out'],
  render: ['plan', 'out'], revise: ['plan', 'spec', 'out'], validate: ['plan'] };
const help = `GelFigure Agent — local, evidence-first gel figures
Usage: gelfigure COMMAND --workspace /absolute/existing/directory [options]

  doctor                    Check managed Chromium, engine and fonts
  ladders [--query TEXT] [--kind dna|protein]
  analyze --input PATH --out NEW_DIR [--gel-type dna|protein] [--orientation TRANSFORM]
          [--crop JSON_PATH] [--lane-count 1..60 | --lane-positions JSON_PATH]
  prepare --analysis PATH --spec JSON_PATH --out NEW_DIR
  render --plan PATH --out NEW_DIR
  revise --plan PATH --spec JSON_PATH --out NEW_DIR
  validate --plan PATH
  mcp                       Start MCP stdio; stdout is protocol only
  setup                     Install managed Chromium (network required)

Paths must stay in the workspace. --spec is a JSON file, not inline JSON.
Crop {x,y,w,h,space:"oriented-image-px"} and lane-position [x,...] files use
absolute oriented-image pixels after orientation and deskew, not crop-relative coordinates.
Orientation: h, r90, r180, r270, r90h, r180h, r270h; omit for unchanged.
--help / --version / setup do not require a workspace. Output directories must be new.
Exit: 0 succeeded/ready; 2 awaiting_answers/needs_review; 1 failure.
`;

function failure(error) {
  return { apiVersion: '1', status: 'failed', error: error instanceof AgentError ? {
    code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details })
  } : { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unexpected failure.' } };
}
function argumentsFor(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, tokens: true,
      options: { ...Object.fromEntries(['workspace', ...new Set(Object.values(commandOptions).flat())].map(name => [name, { type: 'string' }])),
        help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' } } });
  } catch (error) { throw new AgentError('INVALID_ARGUMENT', error.message); }
  const seen = new Set();
  for (const token of parsed.tokens) if (token.kind === 'option') {
    if (seen.has(token.name)) throw new AgentError('INVALID_ARGUMENT', `Duplicate option --${token.name}.`);
    seen.add(token.name);
  }
  return parsed;
}
async function portableEnvironment() {
  const browsers = path.join(root, 'runtime', 'browsers');
  try { if ((await fs.stat(browsers)).isDirectory()) process.env.PLAYWRIGHT_BROWSERS_PATH = await fs.realpath(browsers); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function geometry(args) {
  const fail = field => { throw new AgentError('INVALID_SPEC', 'Invalid analysis geometry.', { field }); };
  const pixel = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (Object.hasOwn(args, 'laneCount') && (!Number.isInteger(args.laneCount) || args.laneCount < 1 || args.laneCount > 60)) fail('laneCount');
  if (Object.hasOwn(args, 'lanePositions') && (!Array.isArray(args.lanePositions) || !args.lanePositions.length ||
    args.lanePositions.length > 60 || !args.lanePositions.every(pixel) || new Set(args.lanePositions).size !== args.lanePositions.length)) fail('lanePositions');
  if (Object.hasOwn(args, 'crop')) {
    const crop = args.crop;
    if (!crop || typeof crop !== 'object' || Array.isArray(crop) || Object.keys(crop).length !== 5 ||
      Object.keys(crop).some(key => !['x', 'y', 'w', 'h', 'space'].includes(key)) || crop.space !== 'oriented-image-px' ||
      !['x', 'y', 'w', 'h'].every(key => pixel(crop[key])) || crop.w <= 0 || crop.h <= 0) fail('crop');
  }
}
async function setup(stderr) {
  const require = createRequire(import.meta.url);
  let cli;
  try { cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js'); }
  catch { throw new AgentError('SETUP_FAILED', 'Playwright is missing; install the pinned agent dependencies first.'); }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'install', '--only-shell', 'chromium'], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => stderr.write(data));
    child.stderr.on('data', data => stderr.write(data));
    child.on('error', error => reject(new AgentError('SETUP_FAILED', error.message)));
    child.on('close', (code, signal) => code === 0 ? resolve({ apiVersion: '1', status: 'succeeded', runtime: 'chromium-headless-shell' }) :
      reject(new AgentError('SETUP_FAILED', 'Managed Chromium installation failed.', { exitCode: code, signal })));
  });
}
async function serveMcp(service, stderr, stdout) {
  const [{ createMcpServer }, { StdioServerTransport }] = await Promise.all([
    import('../src/mcp.mjs'), import('@modelcontextprotocol/sdk/server/stdio.js')
  ]);
  const server = createMcpServer(service);
  server.onerror = error => stderr.write(JSON.stringify(failure(error)) + '\n');
  await new Promise((resolve, reject) => {
    const shutdown = () => { server.close().catch(reject); };
    const cleanup = () => {
      process.stdin.off('end', shutdown); process.off('SIGINT', shutdown); process.off('SIGTERM', shutdown);
    };
    // runCli owns this service and closes it in finally, including failed startup.
    server.onclose = () => { cleanup(); resolve(); };
    process.stdin.once('end', shutdown); process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
    server.connect(new StdioServerTransport(process.stdin, stdout, { maxBufferSize: 4 * 1024 * 1024 }))
      .catch(error => { cleanup(); reject(error); });
  });
}

// Dependency injection exercises command dispatch without downloading or starting a browser.
export async function runCli(argv, { stdout = process.stdout, stderr = process.stderr, createService } = {}) {
  let command = argv[0];
  try {
    const { values, positionals } = argumentsFor(argv);
    command = positionals[0];
    if (values.help || command === 'help') { stdout.write(help); return 0; }
    if (values.version || command === 'version') {
      stdout.write(JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')).version + '\n'); return 0;
    }
    if (!Object.hasOwn(commandOptions, command) || positionals.length !== 1) throw new AgentError('INVALID_ARGUMENT', 'Choose one command; use --help for usage.');
    for (const option of Object.keys(values)) if (!commandOptions[command].includes(option) && !(option === 'workspace' && command !== 'setup')) {
      throw new AgentError('INVALID_ARGUMENT', `Option --${option} is not valid for ${command}.`);
    }
    if (command !== 'setup' && (!values.workspace || !path.isAbsolute(values.workspace))) {
      throw new AgentError('WORKSPACE_REQUIRED', 'An absolute existing workspace directory is required.');
    }
    for (const option of required[command] || []) if (!values[option]) throw new AgentError('INVALID_ARGUMENT', `Missing --${option}.`);
    if (Object.hasOwn(values, 'lane-count') && !/^(?:[1-9]|[1-5]\d|60)$/.test(values['lane-count'])) {
      throw new AgentError('INVALID_SPEC', '--lane-count must be an integer from 1 to 60.');
    }
    if (Object.hasOwn(values, 'lane-count') && Object.hasOwn(values, 'lane-positions')) {
      throw new AgentError('INVALID_SPEC', 'Provide lane count or lane positions, not both.');
    }
    if (Object.hasOwn(values, 'kind') && !['dna', 'protein'].includes(values.kind) || Object.hasOwn(values, 'gel-type') && !['dna', 'protein'].includes(values['gel-type']) ||
      Object.hasOwn(values, 'orientation') && !['h', 'r90', 'r180', 'r270', 'r90h', 'r180h', 'r270h'].includes(values.orientation)) {
      throw new AgentError('INVALID_SPEC', 'Invalid gel type, ladder kind or orientation.');
    }
    // Playwright resolves its browser location at import time.
    await portableEnvironment();
    if (command === 'setup') { stdout.write(JSON.stringify(await setup(stderr)) + '\n'); return 0; }
    const service = await (createService ? createService({ workspace: values.workspace }) :
      import('../src/service.mjs').then(({ AgentService }) => new AgentService({ workspace: values.workspace })));
    let result;
    try {
      try { await service.files.ready; }
      catch (error) { throw error instanceof AgentError ? error : new AgentError('WORKSPACE_REQUIRED', 'Workspace must be an existing directory.', { reason: error.code }); }
      if (command === 'mcp') { await serveMcp(service, stderr, stdout); return 0; }
      const names = { 'gel-type': 'gelType', 'lane-count': 'laneCount', 'lane-positions': 'lanePositions' };
      const args = Object.fromEntries(commandOptions[command].filter(name => Object.hasOwn(values, name)).map(name => [names[name] || name, values[name]]));
      if (command === 'prepare' || command === 'revise') args.spec = (await service.files.json(args.spec)).data;
      if (command === 'analyze') {
        for (const key of ['crop', 'lanePositions']) if (Object.hasOwn(args, key)) args[key] = (await service.files.json(args[key])).data;
        if (Object.hasOwn(args, 'laneCount')) args.laneCount = Number(args.laneCount);
        geometry(args);
      }
      result = await service[command](args);
    } finally { await service.close(); }
    stdout.write(JSON.stringify(result) + '\n');
    return ['awaiting_answers', 'needs_review'].includes(result.status) ? 2 : result.status === 'failed' ? 1 : 0;
  } catch (error) {
    // An MCP startup failure must not put an unframed object into protocol stdout.
    (command === 'mcp' ? stderr : stdout).write(JSON.stringify(failure(error)) + '\n');
    return 1;
  }
}

const entry = process.argv[1] && await fs.realpath(process.argv[1]).catch(() => undefined);
// Both sides must resolve filesystem aliases: Windows temp paths may use 8.3 names,
// and --preserve-symlinks-main retains the caller's spelling in import.meta.url.
const moduleEntry = await fs.realpath(fileURLToPath(import.meta.url));
if (entry && entry === moduleEntry) {
  process.exitCode = await runCli(process.argv.slice(2));
}
