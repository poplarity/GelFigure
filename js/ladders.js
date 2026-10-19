/* DNA ladder presets. Sizes in bp, largest -> smallest, as visible bands.
 * ref = reference (brighter) bands. Verified against manufacturer datasheets (2026-10).
 * Sources are listed in docs/ladders.md; never add a ladder without one.
 */
(function (G) {
  'use strict';
  const L = [
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
  ];

  const CUSTOM_KEY = 'gelfig.customLadders', FAV_KEY = 'gelfig.favLadders';
  function loadCustom() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveCustom(name, sizes) {
    const list = loadCustom().filter(l => l.name !== name);
    const lad = { id: 'custom_' + Date.now(), name, sizes: sizes.slice().sort((a, b) => b - a), ref: [], custom: true };
    list.push(lad);
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
    return lad;
  }
  // register a ladder definition carried by a template / project (keeps its id); true if it was new
  function importDef(def) {
    if (!def || !def.id || !Array.isArray(def.sizes) || get(def.id)) return false;
    const list = loadCustom();
    list.push({ id: def.id, name: def.name || def.id, sizes: def.sizes.slice().sort((a, b) => b - a), ref: def.ref || [], custom: true });
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
    return true;
  }
  function removeCustom(id) {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(loadCustom().filter(l => l.id !== id)));
    setFavorites(favorites().filter(f => f !== id));
  }
  function all() { return L.concat(loadCustom()); }
  function get(id) { return all().find(l => l.id === id); }
  // portable definitions of the custom ladders among `ids` (built-ins never need to travel)
  function defsFor(ids) { return [...new Set(ids)].map(get).filter(l => l && l.custom).map(l => ({ id: l.id, name: l.name, sizes: l.sizes, ref: l.ref || [] })); }

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
  // favourites first (in their order), then the rest
  function ordered() { const f = favorites(); return f.map(get).concat(all().filter(l => !f.includes(l.id))); }

  function fmt(bp, unit) {
    if (unit === 'kb') {
      const kb = bp / 1000;
      return (Math.round(kb * 100) / 100).toString();
    }
    if (unit === 'auto') return bp >= 1000 ? (Math.round(bp / 10) / 100) + ' kb' : bp + ' bp';
    return String(bp);
  }

  G.Ladders = { all, get, saveCustom, importDef, removeCustom, defsFor, favorites, setFavorites, isFavorite, toggleFavorite, ordered, fmt };
})(window);
