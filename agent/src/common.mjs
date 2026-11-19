import { createHash, timingSafeEqual } from 'node:crypto';

export class AgentError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

// Serialize directly: inserting sorted numeric keys into an object would reorder them again.
export function canonical(value) {
  const ancestors = new Set();
  let nodes = 0, characters = 0;
  const fail = () => { throw new AgentError('INVALID_DATA', 'Expected bounded, plain JSON data.'); };
  const write = (value, depth) => {
    if (++nodes > 250_000 || depth > 64) fail();
    if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
      if (typeof value === 'number' && !Number.isFinite(value)) fail();
      const json = JSON.stringify(value);
      if ((characters += json.length) > 32 * 1024 * 1024) fail();
      return json;
    }
    if (typeof value !== 'object' || ancestors.has(value)) fail();
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    if (!array && proto !== Object.prototype && proto !== null) fail();
    if (array && proto !== Array.prototype) fail();
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string')) fail();
    if (keys.length > 250_000) fail();
    ancestors.add(value);
    const read = key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
      return write(descriptor.value, depth + 1);
    };
    let result;
    if (array) {
      if (value.length > 250_000 || keys.length !== value.length + 1) fail();
      const items = [];
      for (let i = 0; i < value.length; i++) items.push(read(String(i)));
      result = `[${items.join(',')}]`;
    } else {
      result = `{${keys.sort().map(key => {
        const name = JSON.stringify(key);
        if ((characters += name.length) > 32 * 1024 * 1024) fail();
        return `${name}:${read(key)}`;
      }).join(',')}}`;
    }
    ancestors.delete(value);
    return result;
  };
  return write(value, 0);
}

export const digest = value => createHash('sha256').update(canonical(value), 'utf8').digest('hex');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isSha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const dataField = (object, key) => {
  if (!isObject(object) || ![Object.prototype, null].includes(Object.getPrototypeOf(object))) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor?.enumerable && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
};

export function revision(projectData) {
  // Envelope save dates, source filenames/bytes and application metadata are not state.
  // Do not recursively strip keys like "date" or "time": they can be meaningful user data.
  const sourceSha256 = dataField(dataField(projectData, 'source'), 'sha256');
  const state = dataField(projectData, 'state');
  if (!isSha(sourceSha256) || !isObject(state)) {
    throw new AgentError('INVALID_PROJECT', 'A project needs source.sha256 and a JSON state object.');
  }
  return digest({ sourceSha256, state, ladders: dataField(projectData, 'ladders') || [] });
}

export function assertRevision(expected, actual) {
  if (typeof expected !== 'string' || !expected || typeof actual !== 'string' || !actual || expected !== actual) {
    throw new AgentError('STALE_REVISION', 'The expected revision does not match the current project.', { expected, actual });
  }
}

function checkPlan(plan) {
  const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 4096;
  if (!isObject(plan) || plan.apiVersion !== '1' || plan.kind !== 'gelfigure-plan' ||
    !['awaiting_answers', 'ready_to_render', 'needs_review'].includes(plan.status) ||
    !text(plan.engineVersion) || !isSha(plan.analysisRevision) || !isSha(plan.revision) || !isSha(plan.sourceSha256) ||
    plan.project !== 'project.gelfig' || !isObject(plan.spec) ||
    !Array.isArray(plan.questions) || plan.questions.length > 4096 ||
    !Array.isArray(plan.quality) || plan.quality.length > 4096 ||
    plan.questions.some(q => !isObject(q) || !text(q.id) || !text(q.field) || !text(q.message)) ||
    plan.quality.some(q => !isObject(q) || !text(q.code) || !text(q.message) || !['error', 'warning', 'info'].includes(q.severity)) ||
    (plan.status === 'ready_to_render' && plan.questions.length !== 0)) {
    throw new AgentError('INVALID_PLAN', 'Invalid plan kind, version or required fields.');
  }
}

export function sealPlan(plan) {
  // Canonical roundtrip validates JSON and detaches all nested objects from the caller.
  let copy;
  try { copy = JSON.parse(canonical(plan)); }
  catch (error) { throw new AgentError('INVALID_PLAN', 'Plan must contain plain JSON data.', { reason: error.message }); }
  checkPlan(copy);
  delete copy.digest;
  return { ...copy, digest: digest(copy) };
}

export function verifyPlan(plan) {
  try {
    const copy = JSON.parse(canonical(plan));
    if (!isObject(copy)) throw new AgentError('INVALID_PLAN', 'Expected a plan object.');
    if (!isSha(copy.digest)) throw new AgentError('PLAN_INTEGRITY', 'Plan checksum is missing or invalid.');
    const checksum = copy.digest;
    delete copy.digest;
    if (!timingSafeEqual(Buffer.from(checksum, 'hex'), Buffer.from(digest(copy), 'hex'))) {
      throw new AgentError('PLAN_INTEGRITY', 'Plan checksum does not match; prepare or revise it again.');
    }
    checkPlan(copy);
    return true;
  } catch (error) {
    if (error instanceof AgentError && ['INVALID_PLAN', 'PLAN_INTEGRITY'].includes(error.code)) throw error;
    throw new AgentError('INVALID_PLAN', 'Plan must contain plain JSON data.', { reason: error.message });
  }
}
