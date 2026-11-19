import { AgentError, assertRevision } from './common.mjs';

const FIELDS = ['schemaVersion', 'expectedRevision', 'gelType', 'orientationConfirmed', 'laneLabels', 'markers',
  'markerPolicy', 'groups', 'conditions', 'annotations', 'layout', 'image', 'exports', 'provenance', 'conflicts',
  'acknowledgements', 'allowUnlabelledLanes'];
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const FONTS = ['Arial', 'Helvetica', 'Times New Roman', 'Calibri', 'Cambria'];
const UNITS = ['bp', 'kb', 'auto', 'bp-inline', 'kb-inline', 'kDa', 'kDa-inline', 'none'];
const own = (value, key) => Object.hasOwn(value, key);
const invalid = (field, message) => { throw new AgentError('INVALID_SPEC', message, { field }); };
const object = (value, field) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(field, 'Expected a plain object.');
};

// Inspect before reading values: no accessors, prototypes, holes or unbounded nested input.
function inspect(value) {
  let nodes = 0, characters = 0;
  const ancestors = new Set();
  function visit(value, field, depth) {
    if (++nodes > 20_000 || depth > 12) invalid(field, 'Spec exceeds nesting or item limits.');
    if (typeof value === 'string') {
      if (value.length > 4096 || (characters += value.length) > 262_144) invalid(field, 'Spec text exceeds limits.');
      return;
    }
    if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object' || ancestors.has(value)) invalid(field, 'Expected finite JSON data.');
    const array = Array.isArray(value);
    if (array) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 512) invalid(field, 'Array exceeds 512 items or has a custom prototype.');
    } else object(value, field);
    const keys = Reflect.ownKeys(value);
    if (keys.length > 513) invalid(field, 'Object exceeds field limits.');
    if (array && keys.length !== value.length + 1) invalid(field, 'Sparse or extended arrays are not supported.');
    ancestors.add(value);
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string' || key.length > 128 || FORBIDDEN.has(key) ||
        array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) invalid(field, 'Unknown or prototype field.');
      if ((characters += key.length) > 262_144) invalid(field, 'Spec text exceeds limits.');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor.enumerable || !own(descriptor, 'value')) invalid(field, 'Only enumerable JSON values are supported.');
      visit(descriptor.value, `${field}.${key}`, depth + 1);
    }
    ancestors.delete(value);
  }
  visit(value, 'spec', 0);
}

function fields(value, allowed, field, required = []) {
  object(value, field);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) invalid(`${field}.${key}`, 'Unknown field.');
  for (const key of required) if (!own(value, key)) invalid(`${field}.${key}`, 'Required field is missing.');
}
function text(value, field, max = 2048, nonempty = true) {
  if (typeof value !== 'string' || value.length > max || nonempty && !value.trim() ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) invalid(field, 'Expected bounded literal text.');
}
function id(value, field) {
  if (typeof value !== 'string' || value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value) || FORBIDDEN.has(value)) {
    invalid(field, 'Expected a nonempty identifier.');
  }
}
function enumeration(value, options, field) {
  if (!options.includes(value)) invalid(field, `Expected one of: ${options.join(', ')}.`);
}
function number(value, min, max, field, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) {
    invalid(field, `Expected ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  }
}
function boolean(value, field) { if (typeof value !== 'boolean') invalid(field, 'Expected a boolean.'); }
function array(value, field, validate, key, limit = 512) {
  if (!Array.isArray(value) || value.length > limit) invalid(field, `Expected at most ${limit} items.`);
  const seen = new Set();
  value.forEach((item, i) => {
    const at = `${field}[${i}]`;
    validate(item, at);
    if (key) {
      const identity = key(item);
      if (seen.has(identity)) invalid(at, 'Duplicate identifier or reference.');
      seen.add(identity);
    }
  });
}
const label = (value, at) => {
  fields(value, ['laneId', 'text'], at, ['laneId', 'text']);
  id(value.laneId, `${at}.laneId`); text(value.text, `${at}.text`, 2048, false);
};
const marker = (value, at) => {
  fields(value, ['laneId', 'ladderId', 'unit'], at, ['laneId', 'ladderId', 'unit']);
  id(value.laneId, `${at}.laneId`); id(value.ladderId, `${at}.ladderId`);
  enumeration(value.unit, UNITS, `${at}.unit`);
};
function annotation(value, at) {
  object(value, at);
  enumeration(value.type, ['sideText', 'arrow', 'text'], `${at}.type`);
  const allowed = value.type === 'sideText' ? ['type', 'text', 'position'] :
    value.type === 'arrow' ? ['type', 'text', 'laneId', 'size'] : ['type', 'text', 'at'];
  fields(value, allowed, at, allowed.filter(key => key !== 'size'));
  text(value.text, `${at}.text`);
  if (value.type === 'sideText') enumeration(value.position, ['below', 'left', 'right'], `${at}.position`);
  if (value.type === 'arrow') {
    id(value.laneId, `${at}.laneId`);
    if (own(value, 'size')) number(value.size, Number.MIN_VALUE, 1e9, `${at}.size`);
  }
  if (value.type === 'text') {
    fields(value.at, ['x', 'y', 'space'], `${at}.at`, ['x', 'y', 'space']);
    enumeration(value.at.space, ['crop-fraction'], `${at}.at.space`);
    number(value.at.x, 0, 1, `${at}.at.x`); number(value.at.y, 0, 1, `${at}.at.y`);
  }
}

function validate(spec) {
  inspect(spec);
  fields(spec, FIELDS, 'spec');
  for (const [key, value] of Object.entries(spec)) {
    switch (key) {
      case 'schemaVersion': enumeration(value, ['1'], key); break;
      case 'expectedRevision': text(value, key, 256); break;
      case 'gelType': enumeration(value, ['dna', 'protein'], key); break;
      case 'orientationConfirmed': case 'allowUnlabelledLanes': boolean(value, key); break;
      case 'markerPolicy': enumeration(value, ['specified', 'omit'], key); break;
      case 'laneLabels': array(value, key, label, v => v.laneId); break;
      case 'markers': array(value, key, marker, v => v.laneId, 128); break;
      case 'groups': array(value, key, (v, at) => {
        fields(v, ['from', 'to', 'text'], at, ['from', 'to', 'text']);
        id(v.from, `${at}.from`); id(v.to, `${at}.to`); text(v.text, `${at}.text`);
      }, v => JSON.stringify([v.from, v.to]), 128); break;
      case 'conditions': array(value, key, (v, at) => {
        fields(v, ['name', 'values'], at, ['name', 'values']); text(v.name, `${at}.name`, 256);
        object(v.values, `${at}.values`);
        for (const [laneId, label] of Object.entries(v.values)) { id(laneId, `${at}.values`); text(label, `${at}.values.${laneId}`, 256, false); }
      }, v => v.name, 128); break;
      case 'annotations': array(value, key, annotation); break;
      case 'layout':
        fields(value, ['figureWidthMm', 'fontPt', 'fontFamily', 'labelAngle', 'laneNumbers'], key);
        if (own(value, 'figureWidthMm')) number(value.figureWidthMm, 10, 1000, `${key}.figureWidthMm`);
        if (own(value, 'fontPt')) number(value.fontPt, 1, 72, `${key}.fontPt`);
        if (own(value, 'fontFamily')) enumeration(value.fontFamily, FONTS, `${key}.fontFamily`);
        if (own(value, 'labelAngle') && value.labelAngle !== 'auto') number(value.labelAngle, 0, 90, `${key}.labelAngle`);
        if (own(value, 'laneNumbers')) boolean(value.laneNumbers, `${key}.laneNumbers`);
        break;
      case 'image':
        fields(value, ['display', 'invert', 'gamma'], key);
        if (own(value, 'display')) enumeration(value.display, ['gray', 'colour'], `${key}.display`);
        if (own(value, 'invert')) boolean(value.invert, `${key}.invert`);
        if (own(value, 'gamma')) number(value.gamma, 0.1, 10, `${key}.gamma`);
        break;
      case 'exports':
        fields(value, ['dpi', 'formats'], key);
        if (own(value, 'dpi')) number(value.dpi, 72, 1200, `${key}.dpi`, true);
        if (own(value, 'formats')) {
          array(value.formats, `${key}.formats`, (v, at) => enumeration(v, ['png', 'svg', 'tiff', 'pptx'], at), v => v, 4);
          if (!value.formats.length) invalid(`${key}.formats`, 'At least one export format is required.');
        }
        break;
      case 'provenance': array(value, key, (v, at) => {
        fields(v, ['field', 'source', 'reference', 'confirmed'], at, ['field', 'source', 'reference', 'confirmed']);
        text(v.field, `${at}.field`, 256); text(v.reference, `${at}.reference`);
        enumeration(v.source, ['user', 'record', 'detector', 'default'], `${at}.source`);
        boolean(v.confirmed, `${at}.confirmed`);
      }, v => JSON.stringify([v.field, v.source, v.reference])); break;
      case 'conflicts': array(value, key, (v, at) => {
        fields(v, ['id', 'field', 'message', 'resolved'], at, ['id', 'field', 'message', 'resolved']);
        id(v.id, `${at}.id`); text(v.field, `${at}.field`, 256); text(v.message, `${at}.message`);
        boolean(v.resolved, `${at}.resolved`);
      }, v => v.id, 256); break;
      case 'acknowledgements': array(value, key, (v, at) => id(v, at), v => v, 128); break;
    }
  }
}

export function normalizeSpec(spec) {
  validate(spec);
  const copy = JSON.parse(JSON.stringify(spec));
  return { ...copy, schemaVersion: '1',
    layout: { fontPt: 7, fontFamily: 'Arial', labelAngle: 'auto', laneNumbers: false, ...copy.layout },
    image: { display: 'gray', gamma: 1, ...copy.image },
    exports: { dpi: 600, formats: ['png', 'svg'], ...copy.exports } };
}

export function mergeSpec(base, patch) {
  validate(base); validate(patch);
  const merged = { ...base, ...patch };
  for (const key of ['layout', 'image', 'exports']) {
    if (own(patch, key)) merged[key] = { ...base[key], ...patch[key] };
  }
  return normalizeSpec(merged);
}

export function semanticQuestions(analysis, input, ladders) {
  const spec = normalizeSpec(input), questions = [], asked = new Set();
  const ask = (code, field, message, extra = {}, suffix = field) => {
    const id = `${code}:${suffix}`;
    if (!asked.has(id)) { questions.push({ id, field, message, ...extra }); asked.add(id); }
  };
  if (!spec.expectedRevision) ask('REVISION_REQUIRED', 'expectedRevision', 'Bind this spec to the analysis or previous plan revision.');
  else if (analysis.revision !== undefined) assertRevision(spec.expectedRevision, analysis.revision);
  if (!spec.gelType) ask('GEL_TYPE_REQUIRED', 'gelType', 'Confirm whether this gel is DNA or protein.',
    { options: [{ value: 'dna', label: 'DNA' }, { value: 'protein', label: 'Protein' }] });
  if (spec.orientationConfirmed !== true) ask('ORIENTATION_REQUIRED', 'orientationConfirmed', 'Confirm the oriented image and lane order.');
  const lanes = new Map(analysis.lanes.map(lane => [lane.id, lane]));
  const checkLane = (id, field) => {
    if (!lanes.has(id)) ask('UNKNOWN_LANE', field, `Unknown analysis lane: ${id}.`, { evidence: { laneId: id } });
  };
  const labels = new Map((spec.laneLabels || []).map(label => [label.laneId, label.text]));
  if (spec.allowUnlabelledLanes !== true) {
    for (const lane of lanes.values()) if (!lane.hidden && !labels.get(lane.id)?.trim()) {
      ask('LANE_LABELS_REQUIRED', 'laneLabels', `Provide a label for ${lane.id} or explicitly allow unlabelled lanes.`,
        { evidence: { laneId: lane.id, number: lane.number ?? null } }, lane.id);
    }
  }
  (spec.laneLabels || []).forEach((v, i) => checkLane(v.laneId, `laneLabels[${i}].laneId`));
  if (!spec.markerPolicy) ask('MARKER_POLICY_REQUIRED', 'markerPolicy', 'Specify marker assignments or explicitly omit markers.',
    { options: [{ value: 'specified', label: 'Specify markers' }, { value: 'omit', label: 'Omit markers and sizes' }] });
  const assignments = spec.markers || [], library = new Map(ladders.map(ladder => [ladder.id, ladder]));
  if (spec.markerPolicy === 'specified' && !assignments.length) ask('MARKER_ASSIGNMENTS_REQUIRED', 'markers', 'Provide at least one explicit marker assignment.');
  if (spec.markerPolicy === 'omit' && assignments.length) ask('MARKER_POLICY_CONFLICT', 'markers', 'Remove marker assignments or choose the specified marker policy.');
  assignments.forEach((v, i) => {
    const field = `markers[${i}]`, ladder = library.get(v.ladderId);
    checkLane(v.laneId, `${field}.laneId`);
    if (!ladder) ask('UNKNOWN_LADDER', `${field}.ladderId`, `Unknown ladder model: ${v.ladderId}.`);
    const unitKind = ['auto', 'none'].includes(v.unit) ? null : v.unit.startsWith('kDa') ? 'protein' : 'dna';
    if (v.unit==='auto'&&(spec.gelType==='protein'||ladder?.kind==='protein') || ladder && spec.gelType && ladder.kind !== spec.gelType ||
      unitKind && (ladder && ladder.kind !== unitKind || spec.gelType && spec.gelType !== unitKind)) {
      ask('UNIT_CONFLICT', `${field}.unit`, 'Confirm a ladder model and units consistent with the declared gel type.',
        { evidence: { gelType: spec.gelType ?? null, ladderId: v.ladderId, ladderKind: ladder?.kind ?? null, unit: v.unit } });
    }
  });
  (spec.groups || []).forEach((v, i) => {
    checkLane(v.from, `groups[${i}].from`); checkLane(v.to, `groups[${i}].to`);
  });
  (spec.conditions || []).forEach((v, i) => {
    for (const laneId of Object.keys(v.values).sort()) checkLane(laneId, `conditions[${i}].values.${laneId}`);
  });
  (spec.annotations || []).forEach((v, i) => {
    if (v.type !== 'arrow') return;
    checkLane(v.laneId, `annotations[${i}].laneId`);
    if (v.size === undefined) ask('ARROW_SIZE_REQUIRED', `annotations[${i}].size`, 'Provide the target size for this arrow.');
    else if (spec.markerPolicy !== 'specified' || !assignments.length) {
      ask('MARKER_REQUIRED', `annotations[${i}].size`, 'A sized arrow needs an explicit marker assignment and size calibration.');
    }
  });
  const legacyText=[...(spec.groups||[]).map((v,i)=>[`groups[${i}].text`,v.text]),...(spec.conditions||[]).flatMap((v,i)=>[[`conditions[${i}].name`,v.name],...Object.entries(v.values).map(([laneId,text])=>[`conditions[${i}].values.${laneId}`,text])]),...(spec.annotations||[]).map((v,i)=>[`annotations[${i}].text`,v.text])];
  for(const [field,value]of legacyText)if(value.includes('*'))ask('UNSUPPORTED_LITERAL_TEXT',field,'This annotation field uses legacy star markup. Use a plain-text label without asterisks; lane labels preserve literal stars.');
  const provenance = spec.provenance || [];
  const external = v => ['user', 'record'].includes(v.source) && v.confirmed;
  for (const v of provenance) {
    if (!/^(gelType|orientationConfirmed|laneLabels|markers|markerPolicy|allowUnlabelledLanes|groups|conditions|annotations)(?:$|[.\[])/.test(v.field)) continue;
    const confirmed = provenance.some(p => external(p) &&
      (p.field === v.field || v.field.startsWith(`${p.field}.`) || v.field.startsWith(`${p.field}[`)));
    if (!confirmed) ask('PROVENANCE_CONFIRMATION_REQUIRED', v.field, 'Confirm this semantic value using user knowledge or a referenced record.',
      { evidence: { source: v.source, reference: v.reference } });
  }
  for (const v of spec.conflicts || []) if (!v.resolved) {
    ask('UNRESOLVED_CONFLICT', v.field, v.message, { evidence: { conflictId: v.id } }, v.id);
  }
  return questions;
}
