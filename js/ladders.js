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
  /* Sizes are the Tris-glycine (Laemmli) values unless the name says otherwise; several markers read
   * differently on Bis-Tris (NuPAGE) or Tricine gels. ref = the coloured / brighter indicator bands. */
  const PROTEIN = [
    // Bio-Rad (161-0374, -0373, -0375 and -0363 share one size list)
    { id: 'biorad_dual', name: 'Bio-Rad Precision Plus Dual Color (161-0374)', sizes: [250, 150, 100, 75, 50, 37, 25, 20, 15, 10], ref: [75, 25] },
    { id: 'biorad_allblue', name: 'Bio-Rad Precision Plus All Blue (161-0373)', sizes: [250, 150, 100, 75, 50, 37, 25, 20, 15, 10], ref: [75, 50, 25] },
    { id: 'biorad_kaleido', name: 'Bio-Rad Precision Plus Kaleidoscope (161-0375)', sizes: [250, 150, 100, 75, 50, 37, 25, 20, 15, 10], ref: [150, 75, 37, 25, 10] },
    { id: 'biorad_unstained', name: 'Bio-Rad Precision Plus Unstained (161-0363)', sizes: [250, 150, 100, 75, 50, 37, 25, 20, 15, 10], ref: [75, 50, 25] },
    { id: 'biorad_dualxtra', name: 'Bio-Rad Precision Plus Dual Xtra (161-0377)', sizes: [250, 150, 100, 75, 50, 37, 25, 20, 15, 10, 5, 2], ref: [75, 25, 2] },
    // Thermo / Invitrogen
    { id: 'thermo_26616', name: 'Thermo PageRuler Prestained 10–180 kDa (26616)', sizes: [180, 130, 100, 70, 55, 40, 35, 25, 15, 10], ref: [70, 25, 10] },
    { id: 'thermo_26619', name: 'Thermo PageRuler Plus Prestained 10–250 kDa (26619)', sizes: [250, 130, 100, 70, 55, 35, 25, 15, 10], ref: [70, 25, 10] },
    { id: 'thermo_26614', name: 'Thermo PageRuler Unstained 10–200 kDa (26614)', sizes: [200, 150, 120, 100, 85, 70, 60, 50, 40, 30, 25, 20, 15, 10], ref: [50] },
    // seven purified proteins on an 8–16 % Tris-glycine gel; no band is marked as an indicator (MAN0011769)
    { id: 'thermo_26610', name: 'Thermo Pierce Unstained Protein MW Marker 14.4–116 kDa (26610)', sizes: [116, 66.2, 45, 35, 25, 18.4, 14.4], ref: [] },
    { id: 'thermo_26632', name: 'Thermo PageRuler Unstained Low Range 3.4–100 kDa (26632, Tricine)', sizes: [100, 30, 25, 20, 15, 10, 5, 3.4], ref: [25] },
    { id: 'thermo_26634', name: 'Thermo Spectra Multicolor Broad Range (26634)', sizes: [260, 140, 100, 70, 50, 40, 35, 25, 15, 10], ref: [260, 70, 50, 40, 10] },
    { id: 'thermo_26625', name: 'Thermo Spectra Multicolor High Range (26625)', sizes: [300, 250, 180, 130, 100, 70, 50, 40], ref: [300, 70, 50] },
    { id: 'thermo_26628', name: 'Thermo Spectra Multicolor Low Range (26628, Tricine)', sizes: [40, 25, 15, 10, 4.6, 1.7], ref: [40, 10] },
    { id: 'novex_lc5800', name: 'Invitrogen Novex Sharp Pre-stained (LC5800)', sizes: [260, 160, 110, 80, 60, 50, 40, 30, 20, 15, 10, 3.5], ref: [] },
    { id: 'seeblue_lc5925', name: 'Invitrogen SeeBlue Plus2 (LC5925, Tris-glycine values)', sizes: [250, 148, 98, 64, 50, 36, 22, 16, 6, 4], ref: [] },
    // NEB, Abcam, GenScript
    { id: 'neb_p7719', name: 'NEB Color Prestained Broad Range (P7719)', sizes: [250, 180, 130, 95, 72, 55, 43, 34, 26, 17, 10], ref: [72, 26] },
    { id: 'neb_p7717', name: 'NEB Unstained Broad Range (P7717)', sizes: [200, 150, 100, 85, 70, 60, 50, 40, 30, 25, 20, 15, 10], ref: [] },
    { id: 'abcam_ab116028', name: 'Abcam Prestained Broad Range (ab116028, Tris-glycine values)', sizes: [245, 180, 135, 100, 75, 63, 48, 35, 25, 20, 17, 11], ref: [75, 25] },
    { id: 'genscript_m00624', name: 'GenScript Broad Multi Color (M00624)', sizes: [270, 175, 130, 95, 65, 50, 35, 30, 15, 10], ref: [270, 50, 30] },
    // Chinese vendors
    { id: 'yeasen_p180', name: 'Yeasen GoldBand Plus 3-color 10–180 kDa (26616ES)', sizes: [180, 130, 100, 70, 55, 40, 35, 25, 15, 10], ref: [70, 25, 10] },
    { id: 'epizyme_wj101', name: 'Epizyme 15–150 kDa (WJ101)', sizes: [150, 100, 70, 50, 40, 35, 25, 20, 15], ref: [70, 25] },
    { id: 'epizyme_wj102', name: 'Epizyme Two-color 10–250 kDa (WJ102)', sizes: [250, 150, 100, 70, 50, 40, 35, 25, 20, 15, 10], ref: [70, 25] },
    { id: 'epizyme_wj103', name: 'Epizyme Three-color 10–250 kDa (WJ103)', sizes: [250, 150, 100, 70, 50, 40, 35, 25, 20, 15, 10], ref: [70, 25] },
    { id: 'epizyme_wj106', name: 'Epizyme NIR 10–250 kDa (WJ106)', sizes: [250, 150, 100, 70, 50, 40, 35, 25, 20, 15, 10], ref: [70, 25] },
    { id: 'epizyme_wj107', name: 'Epizyme Three-color 10–180 kDa (WJ107)', sizes: [180, 130, 100, 70, 55, 40, 35, 25, 15, 10], ref: [70, 10] },
    { id: 'beyotime_p0068', name: 'Beyotime Prestained 10–180 kDa (P0068/P0069)', sizes: [180, 130, 95, 72, 55, 43, 34, 26, 17, 10], ref: [72, 10] },
    { id: 'beyotime_p0071', name: 'Beyotime BeyoColor 6.5–270 kDa (P0071/P0072)', sizes: [270, 175, 130, 95, 66, 52, 37, 30, 16, 6.5], ref: [270, 52, 30] },
    { id: 'beyotime_p0075', name: 'Beyotime BeyoColor 10–170 kDa (P0075/P0076/P0077)', sizes: [170, 130, 100, 70, 55, 45, 35, 25, 15, 10], ref: [70, 15] },
    { id: 'beyotime_p0776', name: 'Beyotime BeyoColor 10–250 kDa (P0776)', sizes: [250, 130, 100, 70, 50, 40, 30, 25, 20, 15, 10], ref: [70, 25] },
    { id: 'beyotime_p0773', name: 'Beyotime BeyoColor 8–180 kDa (P0773)', sizes: [180, 130, 100, 70, 55, 43, 33, 25, 17, 8], ref: [70, 8] },
    { id: 'beyotime_p0779', name: 'Beyotime BeyoColor 25–300 kDa (P0779)', sizes: [300, 250, 200, 160, 130, 100, 70, 45, 25], ref: [70, 25] },
    { id: 'beyotime_p0771', name: 'Beyotime BeyoColor 2.7–40 kDa (P0771, Tricine)', sizes: [40, 30, 25, 20, 15, 10, 6.5, 4.2, 2.7], ref: [40, 10] },
    { id: 'beyotime_p0060', name: 'Beyotime Unstained 10–150 kDa (P0060)', sizes: [150, 95, 80, 66, 52, 42, 35, 25, 15, 10], ref: [] },
    { id: 'beyotime_p0063', name: 'Beyotime Unstained 10–200 kDa (P0063)', sizes: [200, 150, 120, 100, 85, 70, 60, 50, 40, 30, 25, 20, 15, 10], ref: [50] },
    { id: 'transgen_dm111', name: 'TransGen Blue Plus II (DM111)', sizes: [120, 100, 70, 50, 40, 30, 25, 14], ref: [120, 50, 14] },
    { id: 'transgen_dm141', name: 'TransGen Blue Plus V (DM141)', sizes: [190, 140, 95, 70, 55, 43, 33, 26, 20, 15, 10], ref: [70, 20] },
    { id: 'transgen_dm151', name: 'TransGen Blue Plus VI (DM151)', sizes: [250, 130, 100, 72, 50, 40, 30, 25, 20, 15, 10], ref: [72, 25] },
    { id: 'transgen_dr201', name: 'TransGen ProteinRuler II unstained (DR201)', sizes: [120, 100, 80, 60, 50, 40, 30, 20, 12], ref: [50] },
    { id: 'solarbio_pr1910', name: 'Solarbio Rainbow 180 (PR1910)', sizes: [180, 135, 100, 75, 63, 48, 35, 25, 17, 11], ref: [75, 25] },
    { id: 'solarbio_pr1920', name: 'Solarbio Rainbow 245 (PR1920)', sizes: [245, 180, 135, 100, 75, 63, 48, 35, 25, 20, 17, 11], ref: [75, 25] },
    { id: 'sangon_c610110', name: 'Sangon RealBand Marker II (C610110)', sizes: [180, 130, 95, 72, 52, 41, 31, 25, 17, 10], ref: [72, 10] },
    { id: 'sangon_c610210', name: 'Sangon RealBand Two-color 10–250 kDa (C610210)', sizes: [250, 150, 100, 70, 50, 40, 35, 25, 20, 15, 10], ref: [70, 25] }
  ].map(l => Object.assign({ kind: 'protein' }, l));

  const L = DNA.concat(PROTEIN);
  const BY_ID = new Map(L.map(l => [l.id, l]));

  function kindOf(l) { return (l && l.kind) === 'protein' ? 'protein' : 'dna'; }
  const unitOf = (l) => (kindOf(l) === 'protein' ? 'kDa' : 'bp');
  const unitOfKind = k => (k === 'protein' ? 'kDa' : 'bp');

  function cleanDef(l){
    if(!l||typeof l.id!=='string'||!/^[-\w.:]{1,120}$/.test(l.id)||BY_ID.has(l.id)||typeof l.name!=='string'||!l.name.trim()||l.name.length>200||!Array.isArray(l.sizes)||l.sizes.length>100)return null;
    if(l.sizes.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<=0||v>1e9))return null;
    const sizes=[...new Set(l.sizes)].sort((a,b)=>b-a);if(sizes.length<2)return null;
    return {id:l.id,name:l.name.trim(),sizes,ref:Array.isArray(l.ref)?[...new Set(l.ref)].filter(v=>sizes.includes(v)):[],kind:kindOf(l),custom:true};
  }
  function cleanLibrary(v){
    if(!v||v.version!==1||!Array.isArray(v.custom)||!Array.isArray(v.favorites))return null;
    const custom=v.custom.map(cleanDef);if(custom.some(l=>!l)||new Set(custom.map(l=>l.id)).size!==custom.length)return null;
    const ids=new Set([...BY_ID.keys(),...custom.map(l=>l.id)]);
    return {version:1,custom,favorites:[...new Set(v.favorites)].filter(id=>ids.has(id)),updatedAt:Number.isFinite(v.updatedAt)&&v.updatedAt>=0?v.updatedAt:0};
  }
  const cache=G.LadderCache,ready=cache.start(cleanLibrary);
  const loadCustom=()=>cache.data.custom;
  const newId=()=> 'custom_'+(G.crypto?.randomUUID?G.crypto.randomUUID():Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));
  const sameDef=(a,b)=>kindOf(a)===kindOf(b)&&a.name===b.name&&JSON.stringify(a.sizes)===JSON.stringify(b.sizes)&&JSON.stringify(a.ref||[])===JSON.stringify(b.ref||[]);
  function saveCustom(name, sizes, kind) {
    const lad=cleanDef({id:newId(),name,sizes,kind,ref:[]});
    if(!lad)throw new Error(G.L('请输入名称和至少 2 个不同的有效条带大小','Enter a name and at least 2 distinct valid band sizes'));
    const same=loadCustom().find(l=>sameDef(l,lad));if(same)return same;
    // Adding a new definition must not silently delete another gel type or break old projects.
    const base=lad.name;let n=2;while(loadCustom().some(l=>kindOf(l)===lad.kind&&l.name===lad.name))lad.name=base+' ('+(n++)+')';
    cache.change({type:'put',ladder:lad});
    return lad;
  }
  // register a ladder definition carried by a template / project (keeps its id); true if it was new
  function importDef(def) {
    if (!def || get(def.id)) return false;
    const lad=cleanDef({...def,name:def.name||def.id});if(!lad)return false;
    cache.change({type:'put',ladder:lad});
    return true;
  }
  function removeCustom(id) {
    cache.change({type:'remove',id});
  }
  // all(kind): only that gel type; no argument: everything
  function all(kind) { const l = L.concat(loadCustom()); return kind ? l.filter(x => kindOf(x) === kind) : l; }
  function get(id) { return BY_ID.get(id) || loadCustom().find(l => l.id === id); }
  // portable definitions of the custom ladders among `ids` (built-ins never need to travel)
  function defsFor(ids) { return [...new Set(ids)].map(get).filter(l => l && l.custom).map(l => ({ id: l.id, name: l.name, sizes: l.sizes, ref: l.ref || [], kind: kindOf(l) })); }

  // "my ladders": ordered favourites, built-in and custom alike
  function favorites() {
    return cache.data.favorites.filter(id=>get(id));
  }
  function setFavorites(ids) { cache.change({type:'favorites',ids:[...new Set(ids)].filter(id=>get(id))}); }
  function isFavorite(id) { return favorites().includes(id); }
  function toggleFavorite(id) {
    if(!get(id))return false;cache.change({type:'favorite',id,on:!isFavorite(id)});
    return isFavorite(id);
  }
  // favourites first (in their order), then the rest; optionally restricted to one gel type
  function ordered(kind) {
    const f = favorites().map(get).filter(l => l && (!kind || kindOf(l) === kind));
    return f.concat(all(kind).filter(l => !f.some(x => x.id === l.id)));
  }
  function favoritesOf(kind) { return favorites().map(get).filter(l => l && kindOf(l) === kind); }
  function backup(){return {gelfigureMarkerLibrary:1,version:1,custom:defsFor(loadCustom().map(l=>l.id)),favorites:favorites()};}
  function importLibrary(value){
    const v=value?.gelfigureMarkerLibrary===1&&cleanLibrary(value);
    if(!v)throw new Error(G.L('不是有效的 GelFigure Marker 库文件','Not a valid GelFigure marker library file'));
    const remap=new Map();let count=0;
    v.custom.forEach(def=>{
      const same=loadCustom().find(l=>sameDef(l,def));if(same){remap.set(def.id,same.id);return;}
      const lad={...def,id:get(def.id)?newId():def.id};cache.change({type:'put',ladder:lad});remap.set(def.id,lad.id);count++;
    });
    v.favorites.map(id=>remap.get(id)||id).forEach(id=>{if(get(id))cache.change({type:'favorite',id,on:true});});
    return count;
  }

  // number formatting by unit; v is the size in the unit's own base (bp for DNA, kDa for protein).
  // 'bp' / 'kb' / 'kDa' are bare numbers: the unit goes in the column header ("(bp)").
  // '-inline' variants repeat the unit after every number ("5000 bp", "5 kb", "55 kDa"), which is
  // how many hand-written marker lists are labelled; those suppress the header.
  const INLINE_UNITS = ['bp-inline', 'kb-inline', 'kDa-inline'];
  const isInlineUnit = unit => INLINE_UNITS.includes(unit);
  const proteinNumber = v => (v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100);
  const kbNumber = v => (Math.round(v / 100) / 10).toString();
  function fmt(v, unit) {
    if (unit === 'none') return String(v);
    const k = unit === 'kDa' || unit === 'kDa-inline' ? 'kDa' : (unit === 'kb' || unit === 'kb-inline' ? 'kb' : 'bp');
    if (k === 'kDa') return proteinNumber(v) + (unit === 'kDa-inline' ? ' kDa' : '');
    if (k === 'kb') return kbNumber(v) + (unit === 'kb-inline' ? ' kb' : '');
    if (unit === 'bp-inline') return v + ' bp';
    if (unit === 'auto') return v >= 1000 ? (Math.round(v / 10) / 100) + ' kb' : v + ' bp';
    return String(v);
  }

  /* Band-size entry as people actually write it: "5000bp, 3000bp", "5 kb / 1.5kb", "100 kDa".
   * Units may be attached or spaced; kb is converted to bp for storage. With no unit at all the
   * gel's own base unit is assumed. Mistakes are reported in words rather than saved as NaN. */
  function parseSizes(text, defaultKind) {
    const raw = String(text == null ? '' : text).trim();
    if (!raw) throw new Error(G.L('请输入条带大小，例如 5000bp, 3000bp', 'Enter band sizes, e.g. 5000bp, 3000bp'));
    const chunks = raw.split(/[,，;；、+\n\/／|]+/).map(t => t.trim()).filter(Boolean);
    // Join only a recognised unit to its preceding number; bare runs remain separate sizes.
    const tokens = [];
    for (const ch of chunks) {
      const words = ch.split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i++) {
        if (/^[0-9]*\.?[0-9]+$/.test(words[i]) && /^(kbp|kb|bp|kda|kd|da|k)$/i.test(words[i + 1] || '')) tokens.push(words[i] + words[++i]);
        else tokens.push(words[i]);
      }
    }
    const nums = [], bad = [];
    for (const tok of tokens) {
      const m = tok.match(/^([0-9]*\.?[0-9]+)\s*(kbp|kb|bp|kda|kd|da|k)?$/i);
      if (!m) { bad.push(tok); continue; }
      const v = Number(m[1]), u = (m[2] || '').toLowerCase();
      if (!Number.isFinite(v) || v <= 0) { bad.push(tok); continue; }
      const unit = u === 'kb' || u === 'kbp' || u === 'k' ? 'kb' : u === 'bp' ? 'bp' : u === 'kda' || u === 'kd' ? 'kDa' : u === 'da' ? 'Da' : '';
      nums.push({ v: unit === 'kb' ? v * 1000 : unit === 'Da' ? v / 1000 : v, unit });
    }
    if (bad.length) throw new Error(G.L(`无法识别：${bad.join('、')}。可用写法：5000、5000bp、5kb、100kDa`, `Could not read: ${bad.join(', ')}. Use 5000, 5000bp, 5kb or 100kDa`));
    if (nums.length < 2) throw new Error(G.L('至少需要 2 个条带大小', 'At least 2 band sizes are needed'));
    const explicitDna = nums.some(n => n.unit === 'bp' || n.unit === 'kb'), explicitProtein = nums.some(n => n.unit === 'kDa' || n.unit === 'Da');
    // a bare number follows the current gel type, so it never turns a protein gel into a mix
    const bare = nums.some(n => !n.unit);
    const dna = explicitDna || (bare && defaultKind !== 'protein'), protein = explicitProtein || (bare && defaultKind === 'protein');
    if (dna && protein) throw new Error(G.L('bp 和 kDa 不能混用：DNA 胶用 bp/kb，蛋白胶用 kDa', 'Do not mix bp and kDa: use bp/kb for DNA gels and kDa for protein gels'));
    const kind = protein ? 'protein' : dna ? 'dna' : (defaultKind === 'protein' ? 'protein' : 'dna');
    const want = defaultKind === 'protein' ? 'protein' : 'dna';
    if ((dna || protein) && kind !== want) throw new Error(want === 'protein'
      ? G.L('输入的是 bp/kb，但当前是蛋白胶；请先在第 1 步切换到 DNA 胶', 'Those are bp/kb sizes but this is a protein gel; switch to DNA in step 1 first')
      : G.L('输入的是 kDa，但当前是 DNA 胶；请先在第 1 步切换到蛋白胶', 'Those are kDa sizes but this is a DNA gel; switch to protein in step 1 first'));
    const sizes = [...new Set(nums.map(n => n.v))].sort((a, b) => b - a);
    if (sizes.length < 2) throw new Error(G.L('至少需要 2 个不同的条带大小', 'At least 2 distinct band sizes are needed'));
    if (sizes.length > 100) throw new Error(G.L('最多 100 条带', 'At most 100 bands'));
    // remember how it was written: a list typed entirely in kb is offered back as kb
    const unit = protein ? 'kDa' : nums.every(n => n.unit === 'kb') ? 'kb' : 'bp';
    return { sizes, kind, unit, count: sizes.length };
  }

  G.Ladders = {
    all, get, saveCustom, importDef, removeCustom, defsFor, favorites, favoritesOf, setFavorites,
    isFavorite, toggleFavorite, ordered, fmt, parseSizes, isInlineUnit, INLINE_UNITS, kindOf, unitOf, unitOfKind,
    ready, flush:()=>cache.flush(), backup, importLibrary, get cacheStatus(){return cache.status;}
  };
})(window);
