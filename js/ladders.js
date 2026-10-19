/* Ladder presets for both gel types. Sizes largest -> smallest, as visible bands:
 * DNA ladders in bp, protein ladders in kDa (apparent molecular weight of the prestained bands).
 * ref = reference (brighter / indicator) bands.
 * Verified against manufacturer datasheets (2026-10). Sources: docs/ladders.md.
 * Never add a ladder without one.
 */
(function (G) {
  'use strict';
  const DNA = [
    { id: 'gr1kb', name: 'Thermo GeneRuler 1 kb (SM0311)', sizes: [10000, 8000, 6000, 5000, 4000, 3500, 3000, 2500, 2000, 1500, 1000, 750, 500, 250], ref: [6000, 3000, 1000] },
    { id: 'gr1kbplus', name: 'Thermo GeneRuler 1 kb Plus (SM1331)', sizes: [20000, 10000, 7000, 5000, 4000, 3000, 2000, 1500, 1000, 700, 500, 400, 300, 200, 75], ref: [5000, 1500, 500] },
    { id: 'gr100plus', name: 'Thermo GeneRuler 100 bp Plus (SM0321)', sizes: [3000, 2000, 1500, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100], ref: [1000, 500] },
    { id: 'gr100', name: 'Thermo GeneRuler 100 bp (SM0241)', sizes: [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100], ref: [500] },
    { id: 'gr50', name: 'Thermo GeneRuler 50 bp (SM0371)', sizes: [1000, 900, 800, 700, 600, 500, 400, 300, 250, 200, 150, 100, 50], ref: [500, 250] },
    { id: 'grmix', name: 'Thermo GeneRuler DNA Ladder Mix (SM0331)', sizes: [10000, 8000, 6000, 5000, 4000, 3500, 3000, 2500, 2000, 1500, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100], ref: [3000, 1000, 500] },
    { id: 'grlow', name: 'Thermo GeneRuler Low Range (SM1191)', sizes: [700, 500, 400, 300, 200, 150, 100, 75, 50, 25], ref: [300, 100] },
    { id: 'grulow', name: 'Thermo GeneRuler Ultra Low Range (SM1211)', sizes: [300, 200, 150, 100, 75, 50, 35, 25, 20, 15, 10], ref: [50] },
    { id: 'grexpress', name: 'Thermo GeneRuler Express (SM1553)', sizes: [5000, 3000, 2000, 1500, 1000, 750, 500, 300, 100], ref: [1500, 500] },
    { id: 'neb1kb', name: 'NEB 1 kb DNA Ladder (N3232)', sizes: [10000, 8000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 500], ref: [3000] },
    { id: 'neb100', name: 'NEB 100 bp DNA Ladder (N3231)', sizes: [1517, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100], ref: [1000, 500] },
    { id: 'neb1kbplus', name: 'NEB 1 kb Plus DNA Ladder (N3200)', sizes: [10000, 8000, 6000, 5000, 4000, 3000, 2000, 1500, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100], ref: [3000, 1000, 500] },
    { id: 'dl2000', name: 'Takara DL2000 (3427A)', sizes: [2000, 1000, 750, 500, 250, 100], ref: [750] },
    { id: 'dl5000', name: 'Takara DL5000 (3428A)', sizes: [5000, 3000, 2000, 1500, 1000, 750, 500, 250, 100], ref: [1000] },
    { id: 'dl15000', name: 'Takara DL15000 (3582A)', sizes: [15000, 10000, 7500, 5000, 2500, 1000, 250], ref: [] },
    { id: 'trans2k', name: 'TransGen Trans2K (BM101)', sizes: [2000, 1000, 750, 500, 250, 100], ref: [750] },
    { id: 'trans2kplus', name: 'TransGen Trans2K Plus (BM111)', sizes: [5000, 3000, 2000, 1000, 750, 500, 250, 100], ref: [750] },
    { id: 'trans2kplus2', name: 'TransGen Trans2K Plus II (BM121)', sizes: [8000, 5000, 3000, 2000, 1000, 750, 500, 250, 100], ref: [750] },
    { id: 'trans5k', name: 'TransGen Trans5K', sizes: [5000, 3000, 2000, 1500, 1000, 800, 500, 300], ref: [1500] },
    { id: 'trans15k', name: 'TransGen Trans15K (BM161)', sizes: [15000, 10000, 7500, 5000, 3000, 1500, 1000, 500], ref: [5000] },
    { id: 'tiangen2000', name: 'Tiangen Marker D2000 (MD114)', sizes: [2000, 1000, 750, 500, 250, 100], ref: [750] },
    { id: 'yeasen1kb', name: 'Yeasen GoldBand 1 kb (10510ES)', sizes: [12000, 8000, 6000, 5000, 4000, 3000, 2500, 2000, 1500, 1000, 750, 500, 250], ref: [4000, 1500] },
    { id: 'yeasen100plus', name: 'Yeasen GoldBand 100 bp Plus (10516ES)', sizes: [3000, 2000, 1500, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100], ref: [1200, 500] }
  ].map(l => Object.assign({ kind: 'dna' }, l));

  /* Protein ladders: kDa as the manufacturer prints them. Prestained sizes are apparent molecular
   * weights calibrated in a Tris-glycine Laemmli system; they shift with gel percentage and buffer,
   * so a size read off a prestained ladder is an estimate (stated in the pre-flight check). */
  const PROTEIN = [
    { id: 'yeasen_p180', name: 'Yeasen GoldBand Plus 3-color 10–180 kDa (26616ES)', sizes: [180, 130, 100, 70, 55, 40, 35, 25, 15, 10], ref: [70, 25, 10] },
    { id: 'thermo_26616', name: 'Thermo PageRuler 10–180 kDa (26616)', sizes: [180, 130, 100, 70, 55, 40, 35, 25, 15, 10], ref: [70, 25, 10] },
    { id: 'thermo_26619', name: 'Thermo PageRuler Plus 10–250 kDa (26619)', sizes: [250, 130, 100, 70, 55, 35, 25, 15, 10], ref: [70, 25, 10] },
    { id: 'biorad_dual', name: 'Bio-Rad Precision Plus Dual Color (161-0374)', sizes: [250, 150, 100, 75, 50, 37, 25, 20, 15, 10], ref: [75, 25] },
    { id: 'yeasen_p250', name: 'Yeasen 3-color 10–250 kDa', sizes: [250, 130, 100, 70, 50, 40, 30, 25, 20, 15, 10], ref: [70, 25] }
  ].map(l => Object.assign({ kind: 'protein' }, l));

  const L = DNA.concat(PROTEIN);
  const BY_ID = new Map(L.map(l => [l.id, l]));

  function kindOf(l) { return (l && l.kind) === 'protein' ? 'protein' : 'dna'; }
  const unitOf = (l) => (kindOf(l) === 'protein' ? 'kDa' : 'bp');
  const unitOfKind = k => (k === 'protein' ? 'kDa' : 'bp');

  const CUSTOM_KEY = 'gelfig.customLadders', FAV_KEY = 'gelfig.favLadders';
  function loadCustom() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]').map(l => Object.assign({ custom: true }, l, { kind: kindOf(l) })); } catch (e) { return []; }
  }
  function saveCustom(name, sizes, kind) {
    const list = loadCustom().filter(l => l.name !== name);
    const lad = { id: 'custom_' + Date.now(), name, sizes: sizes.slice().sort((a, b) => b - a), ref: [], custom: true, kind: kind === 'protein' ? 'protein' : 'dna' };
    list.push(lad);
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
    return lad;
  }
  // register a ladder definition carried by a template / project (keeps its id); true if it was new
  function importDef(def) {
    if (!def || !def.id || !Array.isArray(def.sizes) || get(def.id)) return false;
    const list = loadCustom();
    list.push({ id: def.id, name: def.name || def.id, sizes: def.sizes.slice().sort((a, b) => b - a), ref: def.ref || [], custom: true, kind: def.kind === 'protein' ? 'protein' : 'dna' });
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
    return true;
  }
  function removeCustom(id) {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(loadCustom().filter(l => l.id !== id)));
    setFavorites(favorites().filter(f => f !== id));
  }
  // all(kind): only that gel type; no argument: everything
  function all(kind) { const l = L.concat(loadCustom()); return kind ? l.filter(x => kindOf(x) === kind) : l; }
  function get(id) { return BY_ID.get(id) || loadCustom().find(l => l.id === id); }
  // portable definitions of the custom ladders among `ids` (built-ins never need to travel)
  function defsFor(ids) { return [...new Set(ids)].map(get).filter(l => l && l.custom).map(l => ({ id: l.id, name: l.name, sizes: l.sizes, ref: l.ref || [], kind: kindOf(l) })); }

  // "my ladders": ordered favourites, built-in and custom alike
  function favorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]').filter(id => get(id)); } catch (e) { return []; }
  }
  function setFavorites(ids) { localStorage.setItem(FAV_KEY, JSON.stringify([...new Set(ids)])); }
  function isFavorite(id) { return favorites().includes(id); }
  function toggleFavorite(id) {
    const f = favorites();
    setFavorites(f.includes(id) ? f.filter(x => x !== id) : f.concat([id]));
    return isFavorite(id);
  }
  // favourites first (in their order), then the rest; optionally restricted to one gel type
  function ordered(kind) {
    const f = favorites().map(get).filter(l => l && (!kind || kindOf(l) === kind));
    return f.concat(all(kind).filter(l => !f.some(x => x.id === l.id)));
  }
  function favoritesOf(kind) { return favorites().map(get).filter(l => l && kindOf(l) === kind); }

  // number formatting by unit; v is the size in the unit's own base (bp for DNA, kDa for protein).
  // Like 'kb', 'kDa' is a bare number: the unit goes in the column header (rendered as "(kDa)").
  function fmt(v, unit) {
    const k = unit === 'kDa' ? 'kDa' : (unit === 'kb' ? 'kb' : 'bp');
    if (k === 'kDa') return String(v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);
    if (k === 'kb') { const kb = v / 1000; return (Math.round(kb * 100) / 100).toString(); }
    if (unit === 'auto') return v >= 1000 ? (Math.round(v / 10) / 100) + ' kb' : v + ' bp';
    return String(v);
  }

  G.Ladders = {
    all, get, saveCustom, importDef, removeCustom, defsFor, favorites, favoritesOf, setFavorites,
    isFavorite, toggleFavorite, ordered, fmt, kindOf, unitOf, unitOfKind
  };
})(window);
