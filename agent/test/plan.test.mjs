import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AgentError, canonical, digest, revision, sealPlan, verifyPlan, assertRevision } from '../src/common.mjs';
import { normalizeSpec, mergeSpec, semanticQuestions } from '../src/plan.mjs';

const sha = 'a'.repeat(64);
const analysis = {
  revision: sha, gelType: { value: 'dna', confidence: 0.99 },
  lanes: [
    { id: 'lane_001', number: 1, name: 'Detected M', marker: true, hidden: false },
    { id: 'lane_002', number: 2, name: 'Inferred sample', marker: false, hidden: false },
    { id: 'lane_003', number: 3, name: '', marker: false, hidden: true }
  ], markers: [{ laneId: 'lane_001', ladderId: 'dna1', fitScore: 1 }]
};
const ladders = [
  { id: 'dna1', name: 'DNA ladder', kind: 'dna', sizes: [1000, 500], ref: [1000] },
  { id: 'protein1', name: 'Protein ladder', kind: 'protein', sizes: [100, 50], ref: [] }
];
const spec = (extra = {}) => ({
  schemaVersion: '1', expectedRevision: sha, gelType: 'dna', orientationConfirmed: true,
  laneLabels: [{ laneId: 'lane_001', text: 'M' }, { laneId: 'lane_002', text: 'Sample' }],
  markerPolicy: 'specified', markers: [{ laneId: 'lane_001', ladderId: 'dna1', unit: 'bp' }],
  ...extra
});
const codes = input => semanticQuestions(analysis, input, ladders).map(q => q.id.split(':')[0]);
const invalid = fn => assert.throws(fn, e => e instanceof AgentError && e.code === 'INVALID_SPEC');
const plan = () => ({
  apiVersion: '1', kind: 'gelfigure-plan', status: 'ready_to_render', engineVersion: 'test-1',
  analysisRevision: sha, revision: sha, sourceSha256: sha, project: 'project.gelfig',
  spec: normalizeSpec(spec()), questions: [], quality: []
});

test('AgentError preserves public code, message and optional details', () => {
  const error = new AgentError('INVALID_SPEC', 'Invalid dpi', { field: 'exports.dpi' });
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'AgentError');
  assert.equal(error.message, 'Invalid dpi');
  assert.deepEqual(error.details, { field: 'exports.dpi' });
  assert.equal(Object.hasOwn(new AgentError('X', 'x'), 'details'), false);
});

test('canonical JSON sorts every object key lexically and retains array order and literal text', () => {
  const value = { z: [{ b: 2, a: '  <x>β\n' }, 1], '2': 2, '10': 10, a: false };
  const expected = '{"10":10,"2":2,"a":false,"z":[{"a":"  <x>β\\n","b":2},1]}';
  assert.equal(canonical(value), expected);
  assert.equal(digest(value), createHash('sha256').update(expected).digest('hex'));
  assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 }));
  assert.notEqual(digest([1, 2]), digest([2, 1]));
});

test('canonical rejects unsupported values, exotic objects, cycles, holes and accessors', () => {
  const cycle = {}; cycle.self = cycle;
  let reads = 0;
  const accessor = { get x() { reads++; return 1; } };
  const hidden = Object.defineProperty({}, 'x', { value: 1 });
  const arrayExtra = Object.assign([1], { extra: 2 });
  for (const value of [undefined, NaN, Infinity, 1n, () => 1, Symbol(), new Date(), new Map(),
    new Uint8Array(1), /x/, { a: undefined }, cycle, [, 1], accessor, hidden, arrayExtra, { [Symbol()]: 1 }]) {
    assert.throws(() => canonical(value), AgentError);
  }
  assert.equal(reads, 0);
});

test('revision hashes only source SHA and complete state; envelope dates do not affect it', () => {
  const project = { source: { sha256: sha, name: 'original', bytes: 'abc' },
    state: { lanes: [{ agentId: 'lane_001', name: 'A' }], date: 'meaningful', time: 8 }, savedAt: 'today' };
  assert.equal(revision(project), digest({ sourceSha256: sha, ladders: [], state: project.state }));
  assert.equal(revision(project), revision({ ...project, savedAt: 'tomorrow', app: 'new',
    source: { ...project.source, bytes: 'else', name: 'renamed' } }));
  for (const changed of [
    { ...project, source: { sha256: 'b'.repeat(64) } },
    { ...project, state: { ...project.state, date: 'different' } },
    { ...project, state: { ...project.state, time: 9 } },
    { ...project, state: { ...project.state, lanes: [{ agentId: 'lane_002', name: 'A' }] } }
  ]) assert.notEqual(revision(changed), revision(project));
  assert.throws(() => revision({ state: {} }), AgentError);
  assert.throws(() => revision({ source: { sha256: sha } }), AgentError);
});

test('assertRevision requires a present matching revision and reports stale bindings', () => {
  assert.doesNotThrow(() => assertRevision(sha, sha));
  for (const [expected, actual] of [[sha, 'b'.repeat(64)], [undefined, sha], ['', ''], [sha, undefined]]) {
    assert.throws(() => assertRevision(expected, actual), e => e.code === 'STALE_REVISION');
  }
});

test('sealing copies input, verification survives JSON roundtrip and rejects nested mutation', () => {
  const input = plan(), sealed = sealPlan(input);
  assert.equal(Object.hasOwn(input, 'digest'), false);
  assert.notEqual(sealed, input);
  assert.equal(verifyPlan(JSON.parse(JSON.stringify(sealed))), true);
  input.spec.laneLabels[0].text = 'input changed';
  assert.equal(sealed.spec.laneLabels[0].text, 'M');
  for (const mutate of [p => { p.status = 'needs_review'; }, p => { p.spec.laneLabels[0].text = 'changed'; },
    p => { p.revision = 'b'.repeat(64); }, p => { p.questions.push({ id: 'X', field: 'x', message: 'x' }); },
    p => { p.createdAt = 'added'; }]) {
    const copy = structuredClone(sealed); mutate(copy);
    assert.throws(() => verifyPlan(copy), e => e.code === 'PLAN_INTEGRITY');
  }
});

test('plan kind, version and required fields are validated even with a recomputed checksum', () => {
  for (const patch of [{ kind: 'analysis' }, { apiVersion: '2' }, { project: '../escape.gelfig' },
    { questions: {} }, { quality: null }, { status: 'invented' }, { spec: null }, { revision: '' },
    { sourceSha256: 'no' }, { engineVersion: '' }]) {
    const value = { ...plan(), ...patch };
    value.digest = digest(value);
    assert.throws(() => verifyPlan(value), e => e.code === 'INVALID_PLAN');
  }
  const value = plan();
  assert.throws(() => verifyPlan(value), e => e.code === 'PLAN_INTEGRITY');
});

test('revision rejects getters without executing them', () => {
  let reads = 0;
  const project = { get source() { reads++; return { sha256: sha }; }, state: {} };
  assert.throws(() => revision(project), e => e.code === 'INVALID_PROJECT');
  assert.equal(reads, 0);
});

test('normalization defaults only presentation and preserves all label text literally', () => {
  const bare = normalizeSpec({});
  for (const field of ['expectedRevision', 'gelType', 'orientationConfirmed', 'laneLabels', 'markerPolicy', 'markers',
    'allowUnlabelledLanes', 'provenance', 'conflicts']) assert.equal(Object.hasOwn(bare, field), false, field);
  assert.deepEqual(bare.layout, { fontPt: 7, fontFamily: 'Arial', labelAngle: 'auto', laneNumbers: false });
  assert.deepEqual(bare.image, { display: 'gray', gamma: 1 });
  assert.deepEqual(bare.exports, { dpi: 600, formats: ['png', 'svg'] });
  const input = spec({ laneLabels: [{ laneId: 'lane_001', text: '  <b>β & *DNA*</b>\n A  ' }] });
  const normalized = normalizeSpec(input);
  assert.equal(normalized.laneLabels[0].text, input.laneLabels[0].text);
  assert.deepEqual(normalizeSpec(normalized), normalized);
  normalized.laneLabels[0].text = 'new';
  assert.notEqual(input.laneLabels[0].text, 'new');
});

test('strict nested spec fields, scalar types, enums and ranges are enforced', () => {
  const cases = [null, [], { extra: 1 }, { schemaVersion: 1 }, { schemaVersion: '2' },
    { gelType: 'DNA' }, { orientationConfirmed: 'true' }, { allowUnlabelledLanes: 1 },
    { markerPolicy: 'auto' }, { layout: { typo: true } }, { image: { rotation: 361 } },
    { exports: { dpi: '600' } }, { exports: { dpi: NaN } }, { exports: { dpi: Infinity } },
    { exports: { dpi: 0 } }, { exports: { dpi: 1201 } }, { exports: { formats: ['png', 'exe'] } },
    { layout: { figureWidthMm: 1001 } }, { layout: { fontPt: 0 } },
    { layout: { fontFamily: 'Arial; url(bad)' } }, { layout: { labelAngle: '45' } },
    { layout: { labelAngle: 91 } }, { image: { gamma: 0 } }, { image: { display: 'sepia' } },
    { laneLabels: [{ laneId: 'lane_001', text: 42 }] },
    { laneLabels: [{ laneId: 'lane_001', text: 'ok', extra: 1 }] },
    { markers: [{ laneId: 'lane_001', ladderId: 'dna1', unit: 'BP' }] },
    { groups: [{ from: 'lane_001', to: 'lane_002', text: 'x', hidden: true }] },
    { conditions: [{ name: 'Drug', values: { lane_001: 1 } }] },
    { annotations: [{ type: 'sideText', text: 'x', position: 'diagonal' }] },
    { annotations: [{ type: 'text', text: 'x', at: { x: 1.1, y: 0, space: 'crop-fraction' } }] },
    { annotations: [{ type: 'text', text: 'x', at: { x: 0, y: 0, space: 'pixels' } }] },
    { annotations: [{ type: 'arrow', laneId: 'lane_001', size: '1000', text: 'x' }] },
    { annotations: [{ type: 'arrow', laneId: 'lane_001', size: 1000, text: 'x', at: { x: 0, y: 0 } }] },
    { provenance: [{ field: 'laneLabels', source: 'internet', reference: 'x', confirmed: true }] },
    { provenance: [{ field: 'laneLabels', source: 'record', reference: 3, confirmed: true }] },
    { provenance: [{ field: 'laneLabels', source: 'user', reference: 'x', confirmed: 'yes' }] },
    { conflicts: [{ id: 'c1', field: 'gelType', message: 'x', resolved: 'false' }] },
    { acknowledgements: ['X', 'X'] }, { expectedRevision: '' }];
  for (const input of cases) invalid(() => normalizeSpec(input));
});

test('spec rejects missing and duplicate bindings and prototype fields at all depths', () => {
  for (const input of [
    { laneLabels: [{ text: 'x' }] }, { markers: [{ laneId: 'lane_001', unit: 'bp' }] },
    { laneLabels: [{ laneId: 'lane_001', text: 'a' }, { laneId: 'lane_001', text: 'b' }] },
    { markers: [{ laneId: 'lane_001', ladderId: 'dna1', unit: 'bp' }, { laneId: 'lane_001', ladderId: 'protein1', unit: 'kDa' }] },
    { conditions: [{ name: 'Drug', values: {} }, { name: 'Drug', values: {} }] },
    { conflicts: [{ id: 'c', field: 'x', message: 'x', resolved: false }, { id: 'c', field: 'y', message: 'y', resolved: true }] },
    { provenance: [{ field: 'gelType', source: 'user', reference: 'r', confirmed: true },
      { field: 'gelType', source: 'user', reference: 'r', confirmed: true }] },
    JSON.parse('{"__proto__":{}}'), JSON.parse('{"conditions":[{"name":"x","values":{"constructor":"+"}}]}'),
    { layout: Object.create({ fontPt: 7 }) }, { laneLabels: new Array(10000) },
    { laneLabels: [{ laneId: 'lane_001', text: 'x'.repeat(10000) }] },
    { provenance: [{ field: 'x', source: 'user', reference: {}, confirmed: true }] }
  ]) invalid(() => normalizeSpec(input));
});

test('spec bounds include sparse-array camouflage, accessors, keys and aggregate text', () => {
  const sparse = new Array(2); sparse[1] = 'png'; sparse[4294967295] = 'svg';
  let reads = 0;
  const getter = { get gelType() { reads++; return 'dna'; } };
  const lotsOfText = Array.from({ length: 140 }, (_, i) => ({ laneId: `lane_${i}`, text: 'x'.repeat(2048) }));
  for (const input of [
    { exports: { formats: sparse } }, getter,
    { conditions: [{ name: 'x', values: { ['x'.repeat(10000)]: '+' } }] },
    { laneLabels: lotsOfText }
  ]) invalid(() => normalizeSpec(input));
  assert.equal(reads, 0);
});

test('merge replaces arrays, shallow-merges presentation objects and validates both inputs', () => {
  const base = spec({ layout: { fontPt: 9, figureWidthMm: 85 }, image: { invert: true }, exports: { formats: ['tiff'] } });
  const patch = { laneLabels: [{ laneId: 'lane_002', text: 'B' }], layout: { fontFamily: 'Helvetica' },
    exports: { dpi: 300 }, conflicts: [] };
  const result = mergeSpec(base, patch);
  assert.deepEqual(result.laneLabels, patch.laneLabels);
  assert.equal(result.layout.fontPt, 9);
  assert.equal(result.layout.fontFamily, 'Helvetica');
  assert.equal(result.layout.figureWidthMm, 85);
  assert.deepEqual(result.exports, { formats: ['tiff'], dpi: 300 });
  assert.equal(result.image.invert, true);
  assert.deepEqual(result.conflicts, []);
  assert.equal(base.layout.fontFamily, undefined);
  invalid(() => mergeSpec(base, { layout: { extra: true } }));
  invalid(() => mergeSpec({ ...base, exports: { dpi: '600' } }, { exports: { dpi: 300 } }));
  invalid(() => mergeSpec(base, JSON.parse('{"__proto__":{}}')));
});

test('missing critical semantics produce deterministic structured questions without detector defaults', () => {
  const questions = semanticQuestions(analysis, {}, ladders);
  assert.deepEqual(questions, semanticQuestions(analysis, {}, ladders));
  for (const code of ['GEL_TYPE_REQUIRED', 'ORIENTATION_REQUIRED', 'LANE_LABELS_REQUIRED', 'MARKER_POLICY_REQUIRED']) {
    assert.ok(questions.some(q => q.id.startsWith(code)), code);
  }
  for (const q of questions) {
    assert.equal(typeof q.field, 'string'); assert.equal(typeof q.message, 'string');
  }
  assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
  assert.deepEqual(semanticQuestions(analysis, spec(), ladders), []);
  assert.ok(codes(spec({ orientationConfirmed: false })).includes('ORIENTATION_REQUIRED'));
  assert.ok(codes(spec({ laneLabels: [{ laneId: 'lane_001', text: 'M' }] })).includes('LANE_LABELS_REQUIRED'));
  assert.ok(codes(spec({ laneLabels: [{ laneId: 'lane_001', text: 'M' }, { laneId: 'lane_002', text: '  ' }] })).includes('LANE_LABELS_REQUIRED'));
  assert.deepEqual(semanticQuestions(analysis, spec({ laneLabels: [], allowUnlabelledLanes: true }), ladders), []);
});

test('semantic bindings reject an explicitly stale revision', () => {
  assert.throws(() => semanticQuestions(analysis, spec({ expectedRevision: 'b'.repeat(64) }), ladders),
    e => e.code === 'STALE_REVISION');
});

test('every explicit lane reference is checked, including groups, condition keys and annotations', () => {
  for (const extra of [
    { laneLabels: [{ laneId: 'ghost', text: 'x' }] },
    { markers: [{ laneId: 'ghost', ladderId: 'dna1', unit: 'bp' }] },
    { groups: [{ from: 'ghost', to: 'lane_001', text: 'x' }] },
    { groups: [{ from: 'lane_001', to: 'ghost', text: 'x' }] },
    { conditions: [{ name: 'Drug', values: { ghost: '+' } }] },
    { annotations: [{ type: 'arrow', laneId: 'ghost', size: 1000, text: 'x' }] }
  ]) assert.ok(codes(spec(extra)).includes('UNKNOWN_LANE'));
  assert.ok(codes(spec({ markers: [{ laneId: 'lane_001', ladderId: 'unknown', unit: 'bp' }] })).includes('UNKNOWN_LADDER'));
});

test('marker assignments must agree with gel kind and exact supported unit families', () => {
  for (const markers of [
    [{ laneId: 'lane_001', ladderId: 'dna1', unit: 'kDa' }],
    [{ laneId: 'lane_001', ladderId: 'protein1', unit: 'auto' }],
    [{ laneId: 'lane_001', ladderId: 'protein1', unit: 'bp' }]
  ]) assert.ok(codes(spec({ markers })).includes('UNIT_CONFLICT'));
  for (const unit of ['bp', 'kb', 'bp-inline', 'kb-inline', 'auto', 'none']) {
    assert.deepEqual(semanticQuestions(analysis, spec({ markers: [{ laneId: 'lane_001', ladderId: 'dna1', unit }] }), ladders), []);
  }
  for (const unit of ['kDa', 'kDa-inline', 'none']) {
    assert.deepEqual(semanticQuestions(analysis, spec({ gelType: 'protein', markers: [{ laneId: 'lane_001', ladderId: 'protein1', unit }] }), ladders), []);
  }
});

test('specified policy needs assignments; omit is explicit and cannot support sized arrows', () => {
  assert.ok(semanticQuestions(analysis, spec({ markers: [] }), ladders).some(q => q.field === 'markers'));
  const missing = spec(); delete missing.markers;
  assert.ok(semanticQuestions(analysis, missing, ladders).some(q => q.field === 'markers'));
  invalid(() => semanticQuestions(analysis, spec({ markers: undefined }), ladders));
});

test('omit permits no markers but questions sized arrows and contradictory assignments', () => {
  const omitted = spec({ markerPolicy: 'omit', markers: [] });
  assert.deepEqual(semanticQuestions(analysis, omitted, ladders), []);
  assert.ok(semanticQuestions(analysis, { ...omitted, annotations: [{ type: 'arrow', laneId: 'lane_002', size: 1000, text: 'Target' }] }, ladders)
    .some(q => q.field === 'annotations[0].size'));
  assert.ok(semanticQuestions(analysis, spec({ markerPolicy: 'omit' }), ladders).some(q => q.field === 'markers'));
});

test('provenance never silently promotes detector/default identities; conflicts remain questions', () => {
  for (const source of ['detector', 'default']) {
    for (const field of ['laneLabels', 'laneLabels[1].text', 'markers', 'markers[0].ladderId', 'gelType']) {
      const provenance = [{ field, source, reference: 'detected evidence', confirmed: true }];
      assert.ok(semanticQuestions(analysis, spec({ provenance }), ladders).some(q => q.field === field));
    }
  }
  for (const source of ['user', 'record']) {
    assert.deepEqual(semanticQuestions(analysis, spec({ provenance: [{ field: 'laneLabels', source, reference: 'ELN / lanes', confirmed: true }] }), ladders), []);
  }
  const conflicts = [{ id: 'c1', field: 'laneLabels', message: 'ELN differs', resolved: false }];
  assert.ok(codes(spec({ conflicts, acknowledgements: ['UNRESOLVED_CONFLICT'] })).includes('UNRESOLVED_CONFLICT'));
  assert.deepEqual(semanticQuestions(analysis, spec({ conflicts: [{ ...conflicts[0], resolved: true }] }), ladders), []);
});

test('the public annotation directions and protein units match the actual renderer',()=>{
 assert.throws(()=>normalizeSpec({annotations:[{type:'sideText',position:'above',text:'Unsupported'}]}),e=>e.code==='INVALID_SPEC');
 const a={revision:'v',lanes:[{id:'lane_001',number:1}],gelType:{value:'protein'}};
 const q=semanticQuestions(a,{schemaVersion:'1',expectedRevision:'v',gelType:'protein',orientationConfirmed:true,laneLabels:[{laneId:'lane_001',text:'M'}],markerPolicy:'specified',markers:[{laneId:'lane_001',ladderId:'p',unit:'auto'}]},[{id:'p',kind:'protein'}]);assert(q.some(q=>q.id.startsWith('UNIT_CONFLICT')));
});

test('plain text in legacy annotation fields is never silently interpreted as star markup',()=>{
 const q=semanticQuestions(analysis,spec({groups:[{from:'lane_001',to:'lane_002',text:'WT *'}]}),ladders);assert(q.some(x=>x.id.startsWith('UNSUPPORTED_LITERAL_TEXT')));
});
