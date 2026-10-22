/* Local project history, adapted from BlotFigure's library. Original bytes are addressed by SHA-256;
 * metadata, migration and garbage collection use atomic transactions in the existing draft store. */
(function (G) {
  'use strict';
  const App = G.App, L = G.L, STORE = 'drafts';
  const range = prefix => IDBKeyRange.bound(prefix, prefix + '\uffff');
  const clone = x => JSON.parse(JSON.stringify(x));
  let dbPromise, queue = Promise.resolve(), timer = 0, generation = 0;
  const callbackErrors = new WeakMap();
  // Request callbacks run after transaction() returns. Catch synchronous write errors there too,
  // so quota/clone failures abort atomically instead of becoming unhandled page exceptions.
  function success(rq, fn) {
    rq.onsuccess = () => {
      try { fn(); } catch (e) { callbackErrors.set(rq.transaction, e); try { rq.transaction.abort(); } catch (_) { /* already aborted */ } }
    };
  }
  function database() {
    if (!dbPromise) {
      const pending = new Promise((resolve, reject) => {
        let done = false, rq;
        const fail = e => { if (done) return; done = true; clearTimeout(timeout); reject(e); };
        const timeout = setTimeout(() => fail(new Error('IndexedDB timeout')), 3000);
        try { rq = G.indexedDB.open('gelfigure', 1); } catch (e) { fail(e); return; }
        rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains(STORE)) rq.result.createObjectStore(STORE); };
        rq.onsuccess = () => {
          if (done) { rq.result.close(); return; }
          done = true; clearTimeout(timeout);
          rq.result.onversionchange = () => { rq.result.close(); dbPromise = null; };
          resolve(rq.result);
        };
        rq.onerror = rq.onblocked = () => fail(rq.error || new Error('IndexedDB blocked'));
      });
      dbPromise = pending;
      pending.catch(() => { if (dbPromise === pending) dbPromise = null; });
    }
    return dbPromise;
  }
  async function transaction(mode, fn) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode); let result;
      tx.oncomplete = () => resolve(result && result.result);
      tx.onabort = tx.onerror = () => reject(callbackErrors.get(tx) || tx.error || new Error('Storage transaction aborted'));
      try { result = fn(tx.objectStore(STORE)); } catch (e) { tx.abort(); reject(e); }
    });
  }
  const enqueue = fn => { const next = queue.catch(() => {}).then(fn); queue = next; return next; };
  function status(value, error) {
    App.cacheStatus = value; App.cacheError = error ? error.message : '';
    G.dispatchEvent(new Event('gelfigure-cache'));
  }
  function migrate(st, next) {
    const rq = st.get('meta');
    success(rq, () => {
      const old = rq.result;
      if (!old || old.projectId) { next(); return; }
      const src = st.get('src');
      success(src, () => {
        const meta = { ...old, projectId: 'legacy_' + old.savedAt, projectName: old.name,
          sources: [{ name: old.name, sha256: old.sha256 }], summary: { images: 1 } };
        if (src.result) st.put(src.result, 'img:' + old.sha256);
        st.put(meta, 'project:' + meta.projectId); st.put(meta, 'meta'); st.delete('src');
        next();
      });
    });
  }
  function withMigration(fn) { return transaction('readwrite', st => migrate(st, () => fn(st))); }
  App.newCachedProject = function (projectId, name) {
    clearTimeout(timer); generation++;
    App.projectId = projectId || 'project_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    App.projectName = name || ''; App.cachedSnapshot = null;
    status('pending');
  };
  App.saveDraftSoon = function () {
    if (!App.S || !App.srcBuffer) return;
    clearTimeout(timer); status('pending');
    timer = setTimeout(() => App.saveDraft(), 800);
  };
  App.saveDraft = async function () {
    clearTimeout(timer);
    if (!App.S || !App.srcBuffer) return true;
    if (!App.projectId) App.newCachedProject();
    // Capture before awaiting. A queued save must never read the next project's pixels or settings.
    const state = App.snapshot(), projectId = App.projectId, gen = generation;
    const records = App.exposures ? App.exposures.slice() : [{ name: App.S.file.name, sha256: App.S.file.sha256, buffer: App.srcBuffer }];
    if (!records.some(r => r.sha256 === App.S.file.sha256)) records.push({ name: App.S.file.name, sha256: App.S.file.sha256, buffer: App.srcBuffer });
    const buffers = records.map(r => r.buffer);
    const sources = records.map(({ buffer, ...rec }) => clone(rec));
    const meta = { projectId, projectName: App.projectName || App.S.file.name, name: App.S.file.name,
      sha256: App.S.file.sha256, state, initial: App.initial, autoRotation: App.autoRotation,
      savedAt: Date.now(), app: 'GelFigure ' + App.VERSION,
      ladders: clone(G.Ladders.defsFor(App.S.markers.map(m => m.ladderId))), sources,
      expIdx: App.exposures ? App.expIdx : null,
      summary: { images: sources.length, lanes: App.figureLanes().length, gelType: App.gelKind() } };
    status('pending');
    try {
      await enqueue(() => withMigration(st => {
        sources.forEach((s, i) => {
          const key = 'img:' + s.sha256, rq = st.getKey(key);
          success(rq, () => { if (rq.result === undefined) st.put(buffers[i], key); });
        });
        const existing = st.get('project:' + projectId);
        success(existing, () => {
          // A rename may have been queued while this snapshot was being captured.
          const saved = { ...meta, projectName: existing.result?.projectName || meta.projectName };
          st.put(saved, 'project:' + projectId); st.put(saved, 'meta');
        });
      }));
      if (gen === generation) {
        App.cachedSnapshot = state;
        status(App.snapshot() === state ? 'saved' : 'pending');
      }
      return true;
    } catch (e) { if (gen === generation) status('error', e); return false; }
  };
  App.listHistory = () => enqueue(async () => {
    await withMigration(() => {});
    const all = await transaction('readonly', st => st.getAll(range('project:')));
    return all.sort((a, b) => b.savedAt - a.savedAt).map(({ state, initial, sources, ladders, ...meta }) => meta);
  });
  App.peekDraft = async () => {
    try { await queue.catch(() => {}); return await transaction('readonly', st => st.get('meta')); }
    catch (e) { return null; }
  };
  App.restoreHistory = async projectId => {
    const saved = await enqueue(async () => {
      await withMigration(() => {});
      let meta, buffers;
      await transaction('readonly', st => {
        const rq = st.get('project:' + projectId);
        success(rq, () => {
          meta = rq.result; if (!meta) return;
          buffers = new Array(meta.sources.length);
          meta.sources.forEach((s, i) => { const b = st.get('img:' + s.sha256); success(b, () => { buffers[i] = b.result; }); });
        });
      });
      return { meta, buffers };
    });
    const { meta, buffers } = saved;
    if (!meta) throw new Error(L('找不到这个历史项目', 'Project not found in local history'));
    if (buffers.some(b => !b)) throw new Error(L('缓存图片缺失，请打开保存的项目文件', 'A cached image is missing; open the saved project file'));
    // Undo can restore an earlier exposure's file metadata. Resolve its bytes by the saved hash,
    // rather than assuming the exposure picker still points at the same file.
    const at = meta.expIdx != null && meta.sources[meta.expIdx]?.sha256 === meta.sha256
      ? meta.expIdx : meta.sources.findIndex(s => s.sha256 === meta.sha256);
    const rec = meta.sources[at], raw = buffers[at];
    if (!rec || !raw) throw new Error(L('缓存项目不完整', 'Incomplete cached project'));
    const state = JSON.parse(meta.state);
    // Decode and validate before replacing the working session. Restoring never re-runs detection.
    const input = await App.readInput({ name: rec.name, buffer: raw });
    if (input.sha256 !== meta.sha256) throw new Error(L('缓存原图校验失败', 'Cached image checksum mismatch'));
    (meta.ladders || []).forEach(d => G.Ladders.importDef(d));
    App.newCachedProject(meta.projectId, meta.projectName);
    const exposures = meta.expIdx == null ? null : meta.sources.map((s, i) => ({ ...s, buffer: buffers[i] }));
    App.restoreSnapshot(input, state, meta.initial, meta.autoRotation, exposures, exposures ? at : null);
    App.cachedSnapshot = App.snapshot();
    await App.saveDraft();
  };
  App.restoreDraft = async () => {
    const meta = await App.peekDraft();
    if (!meta) throw new Error(L('没有可恢复的项目', 'No project to restore'));
    return App.restoreHistory(meta.projectId || 'legacy_' + meta.savedAt);
  };
  App.renameHistory = (projectId, name) => enqueue(async () => {
    const cleaned = name.trim().slice(0, 160); if (!cleaned) return;
    await withMigration(st => {
      const rq = st.get('project:' + projectId);
      success(rq, () => {
        if (!rq.result) return;
        const meta = { ...rq.result, projectName: cleaned }; st.put(meta, 'project:' + projectId);
        const latest = st.get('meta'); success(latest, () => { if (latest.result?.projectId === projectId) st.put(meta, 'meta'); });
      });
    });
    if (App.projectId === projectId) App.projectName = cleaned;
  });
  App.deleteHistory = projectId => {
    if (projectId === App.projectId) clearTimeout(timer);
    return enqueue(() => withMigration(st => {
      const rq = st.getAll(range('project:'));
      success(rq, () => {
        const keep = rq.result.filter(p => p.projectId !== projectId);
        const refs = new Set(keep.flatMap(p => p.sources.map(s => 'img:' + s.sha256)));
        st.delete('project:' + projectId);
        const latest = st.get('meta'); success(latest, () => {
          if (latest.result?.projectId === projectId) {
            const last = keep.sort((a, b) => b.savedAt - a.savedAt)[0];
            if (last) st.put(last, 'meta'); else st.delete('meta');
          }
        });
        const cursor = st.openCursor(range('img:'));
        success(cursor, () => { const c = cursor.result; if (c) { if (!refs.has(c.key)) c.delete(); c.continue(); } });
      });
    }));
  };
  App.dropDraft = async () => { clearTimeout(timer); const meta = await App.peekDraft(); if (meta) await App.deleteHistory(meta.projectId || 'legacy_' + meta.savedAt); };
  App.on(what => {
    if (what === 'loaded' || (what === 'refresh' && App.S && App.cachedSnapshot !== App.snapshot())) App.saveDraftSoon();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && App.S) App.saveDraft(); });
})(window);
