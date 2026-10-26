/* Editable PPTX export, entirely offline and dependency-free.
 * Reads ONLY the SVG subset produced by Render.build (not a general SVG importer). Its layout is
 * reused verbatim; annotations become DrawingML text/shapes, not a screenshot or an embedded SVG.
 * Pictures refer to ONE processed, uncropped PNG, with native a:srcRect crop percentages. Insets and
 * splices use separate picture objects referencing the same media. No original file metadata is copied.
 * Unsupported SVG elements fail explicitly so a future renderer change cannot silently lose data.
 */
(function (G) {
  'use strict';
  const MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const enc = new TextEncoder();
  const esc = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const emu = x => Math.round(x * 12700); // SVG viewBox units and font sizes are points
  const num = (el, key, def = 0) => el.hasAttribute(key) ? +el.getAttribute(key) : def;
  const rect = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  const emptyTree = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

  // ZIP STORE: PNG is already compressed, XML is small. No ZIP library, CDN or browser compression API.
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); t[i] = c >>> 0; }
    return t;
  })();
  function zip(entries) {
    const local = [], central = []; let offset = 0, cdSize = 0;
    entries.forEach(([name, data]) => {
      const n = enc.encode(name), b = typeof data === 'string' ? enc.encode(data) : data;
      let c = 0xffffffff; for (const v of b) c = (c >>> 8) ^ crcTable[(c ^ v) & 255]; c = (c ^ 0xffffffff) >>> 0;
      const l = new Uint8Array(30 + n.length), lv = new DataView(l.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true);
      lv.setUint16(12, 33, true); // 1980-01-01; deterministic, no local identity/date metadata
      lv.setUint32(14, c, true); lv.setUint32(18, b.length, true); lv.setUint32(22, b.length, true); lv.setUint16(26, n.length, true); l.set(n, 30);
      const d = new Uint8Array(46 + n.length), dv = new DataView(d.buffer);
      dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true); dv.setUint16(8, 0x800, true); dv.setUint16(14, 33, true);
      dv.setUint32(16, c, true); dv.setUint32(20, b.length, true); dv.setUint32(24, b.length, true); dv.setUint16(28, n.length, true); dv.setUint32(42, offset, true); d.set(n, 46);
      offset += l.length + b.length; cdSize += d.length;
      if (offset + cdSize > 0xffffffff) throw new Error(G.L('PPTX 过大，无法导出', 'PPTX is too large to export'));
      local.push(l, b); central.push(d);
    });
    const end = new Uint8Array(22), v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true); v.setUint16(8, entries.length, true); v.setUint16(10, entries.length, true); v.setUint32(12, cdSize, true); v.setUint32(16, offset, true);
    return new Blob([...local, ...central, end], { type: MIME });
  }
  function rels(items) {
    return XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type.startsWith('http') ? type : REL + type}" Target="${target}"/>`).join('') + '</Relationships>';
  }
  function color(s) {
    if (!s || s === 'none' || s === 'transparent') return null;
    if (/^#[0-9a-f]{3}$/i.test(s)) return s.slice(1).split('').map(v => v + v).join('').toUpperCase();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.slice(1).toUpperCase();
    throw new Error('Unsupported export colour: ' + s);
  }
  const fill = s => { const c = color(s); return c ? `<a:solidFill><a:srgbClr val="${c}"/></a:solidFill>` : '<a:noFill/>'; };
  function stroke(o) {
    if (!color(o.stroke)) return '<a:ln><a:noFill/></a:ln>';
    const dash = o.dash ? `<a:custDash><a:ds d="${Math.max(1, Math.round(o.dash[0] / o.sw * 100000))}" sp="${Math.max(1, Math.round(o.dash[1] / o.sw * 100000))}"/></a:custDash>` : '';
    return `<a:ln w="${emu(o.sw)}" cap="flat">${fill(o.stroke)}${dash}<a:miter lim="800000"/></a:ln>`;
  }
  function xfrm(o) {
    const rot = o.rot ? ` rot="${Math.round(((o.rot % 360 + 360) % 360) * 60000)}"` : '';
    return `<a:xfrm${rot}${o.flipH ? ' flipH="1"' : ''}${o.flipV ? ' flipV="1"' : ''}><a:off x="${emu(o.x)}" y="${emu(o.y)}"/><a:ext cx="${Math.max(0, emu(o.w))}" cy="${Math.max(0, emu(o.h))}"/></a:xfrm>`;
  }
  const nameXml = (id, name) => `<p:cNvPr id="${id}" name="${esc(name)}"/>`;
  const fontXml = family => {
    const name = esc(G.Render.fontName(family));
    return `<a:latin typeface="${name}"/><a:ea typeface="${name}"/><a:cs typeface="${name}"/>`;
  };
  function textShape(o, id) {
    const font = fontXml(o.fontFamily);
    const props = r => `sz="${Math.round((r.pt||o.pt)*100)}" b="${r.bold ? 1 : 0}" i="${r.italic ? 1 : 0}"${r.baseline?` baseline="${Math.round(r.baseline/(r.pt||o.pt)*100000)}"`:''}`;
    const lines = o.lines.map(runs => '<a:p>' + `<a:pPr algn="${o.align}" marL="0" marR="0" indent="0"><a:lnSpc><a:spcPts val="${Math.round(o.leading * 100)}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:buNone/></a:pPr>` + runs.map(r => `<a:r><a:rPr ${props(r)} dirty="0">${fill(r.fill)}${font}</a:rPr><a:t xml:space="preserve">${esc(r.text)}</a:t></a:r>`).join('') + `<a:endParaRPr sz="${Math.round(o.pt * 100)}">${font}</a:endParaRPr></a:p>`).join('');
    return `<p:sp><p:nvSpPr>${nameXml(id, o.name)}<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(o)}${rect}<a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="${emu(o.insetTop||0)}" rIns="0" bIns="0" anchor="t" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${lines}</p:txBody></p:sp>`;
  }
  function picture(o, id) {
    return `<p:pic><p:nvPicPr>${nameXml(id, o.name)}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:srcRect l="${o.crop.l}" t="${o.crop.t}" r="${o.crop.r}" b="${o.crop.b}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(o)}${rect}</p:spPr></p:pic>`;
  }
  function shape(o, id) {
    if (o.kind === 'text') return textShape(o, id);
    if (o.kind === 'picture') return picture(o, id);
    if (o.kind === 'line') return `<p:cxnSp><p:nvCxnSpPr>${nameXml(id, o.name)}<p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm(o)}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${stroke(o)}</p:spPr></p:cxnSp>`;
    const path = o.points ? '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>' + `<a:path w="${Math.max(1, emu(o.w))}" h="${Math.max(1, emu(o.h))}" fill="${color(o.fill) ? 'norm' : 'none'}">` + o.points.map((p, i) => `<a:${i ? 'lnTo' : 'moveTo'}><a:pt x="${emu(p.x - o.x)}" y="${emu(p.y - o.y)}"/></a:${i ? 'lnTo' : 'moveTo'}>`).join('') + (o.closed ? '<a:close/>' : '') + '</a:path></a:pathLst></a:custGeom>' : rect;
    return `<p:sp><p:nvSpPr>${nameXml(id, o.name)}<p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(o)}${path}${fill(o.fill)}${stroke(o)}</p:spPr></p:sp>`;
  }

  const I = () => new DOMMatrix();
  function inherited(el, key, fallback) {
    for (let e = el; e && e.getAttribute; e = e.parentElement) if (e.hasAttribute(key)) return e.getAttribute(key);
    return fallback;
  }
  function transformedBox(x, y, w, h, m) {
    const c = m.transformPoint({ x: x + w / 2, y: y + h / 2 });
    const sw = w * Math.hypot(m.a, m.b), sh = h * Math.hypot(m.c, m.d);
    return { x: c.x - sw / 2, y: c.y - sh / 2, w: sw, h: sh, rot: Math.atan2(m.b, m.a) * 180 / Math.PI };
  }
  function getRuns(el) {
    const out = [];
    function visit(n) {
      if (n.nodeType === 3) {
        if (n.textContent) out.push({ text: n.textContent, italic: inherited(n.parentElement, 'font-style', '') === 'italic', bold: inherited(n.parentElement, 'font-weight', '') === 'bold', fill: inherited(n.parentElement, 'fill', '#000'),pt:+inherited(n.parentElement,'font-size',0)||undefined,baseline:+inherited(n.parentElement,'data-name-baseline',0)||0 });
      } else n.childNodes.forEach(visit);
    }
    visit(el); return out;
  }
  function collect(fig, gel, crop, fullW, fullH) {
    const parsed = new DOMParser().parseFromString(fig.svg, 'image/svg+xml');
    if (parsed.querySelector('parsererror')) throw new Error('Invalid figure SVG');
    const svg = document.importNode(parsed.documentElement, true), host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none';
    host.appendChild(svg); document.body.appendChild(host);
    const objects = [], sc = fig.scale;
    const add = o => { o.name = o.name || `GelFigure ${o.kind} ${objects.length + 1}`; objects.push(o); };
    function text(nodes, m) {
      const first = nodes[0], pt = num(first, 'font-size', 7), anchor = first.getAttribute('text-anchor') || 'start';
      const boxes = nodes.map(n => n.getBBox()), widest = Math.max(...boxes.map(b => b.width));
      // Zero margins and fixed line spacing. A small width cushion prevents Office from clipping
      // italic overhangs; no auto-fit, so per-item font sizes survive editing/imports.
      const w = widest + pt * 0.12, leading = nodes.length > 1 ? num(nodes[1], 'y') - num(first, 'y') : pt * 1.18;
      const x = num(first, 'x') - (anchor === 'middle' ? w / 2 : anchor === 'end' ? w : 0);
      const y0=num(first,'y')-pt*.91,rich=first.hasAttribute('data-lane-name');
      const insetTop=rich?Math.max(0,y0-Math.min(...boxes.map(b=>b.y))):0,y=y0-insetTop;
      const h=Math.max((nodes.length-1)*leading+pt*1.3+insetTop,rich?Math.max(...boxes.map(b=>b.y+b.height))-y:0);
      const lines = nodes.map(getRuns);
      add(Object.assign({ kind: 'text', name: lines.map(r => r.map(s => s.text).join('')).join(' / ').slice(0, 100), fontFamily: fig.fontFamily, pt, lines, leading, insetTop,align: { middle: 'ctr', end: 'r', start: 'l' }[anchor] || 'l' }, transformedBox(x, y, w, h, m)));
    }
    function image(region, m, inset) {
      // White gaps in a composed inset must remain white even if that inset overlays another object.
      if (inset) add(Object.assign({ kind: 'rect', fill: '#fff', stroke: 'none' }, transformedBox(region.x, region.y, region.w, region.h, m)));
      gel.segs.forEach((seg, i) => {
        const x0 = Math.max(region.x, seg.off * sc), x1 = Math.min(region.x + region.w, (seg.off + seg.px1 - seg.px0) * sc);
        const y0 = Math.max(0, region.y), y1 = Math.min(fig.gelH, region.y + region.h);
        if (x1 <= x0 || y1 <= y0) return;
        const sx = Math.round(crop.x) + seg.px0 + (x0 / sc - seg.off), sy = Math.round(crop.y) + y0 / sc;
        const sw = (x1 - x0) / sc, sh = (y1 - y0) / sc;
        const p0 = m.transformPoint({ x: x0, y: y0 }), p1 = m.transformPoint({ x: x1, y: y1 });
        const pct = x => Math.round(x * 100000);
        add({ kind: 'picture', name: `${inset ? 'Enlarged region' : 'Gel'} ${i + 1} (editable crop)`, x: p0.x, y: p0.y, w: p1.x - p0.x, h: p1.y - p0.y,
          crop: { l: pct(sx / fullW), t: pct(sy / fullH), r: pct((fullW - sx - sw) / fullW), b: pct((fullH - sy - sh) / fullH) } });
      });
    }
    function walk(el, parent) {
      const tr = el.transform && el.transform.baseVal.consolidate(), m = tr ? parent.multiply(tr.matrix) : parent;
      const tag = el.localName;
      if (tag === 'g') {
        if (el.hasAttribute('data-pptx-lines')) text(Array.from(el.children), m);
        else Array.from(el.children).forEach(c => walk(c, m));
      } else if (tag === 'svg') {
        // Render's only nested SVG is a zoom inset of the composed image, with an explicit viewBox.
        const v = el.viewBox.baseVal;
        if (!el.hasAttribute('viewBox') || el.children.length !== 1 || el.firstElementChild.localName !== 'image') throw new Error('Unsupported PPTX inset');
        const map = m.translate(num(el, 'x'), num(el, 'y')).scale(num(el, 'width') / v.width, num(el, 'height') / v.height).translate(-v.x, -v.y);
        image({ x: v.x, y: v.y, w: v.width, h: v.height }, map, true);
      } else if (tag === 'image') image({ x: 0, y: 0, w: fig.gelW, h: fig.gelH }, m, false);
      else if (tag === 'text') text([el], m);
      else if (tag === 'line') {
        const a = m.transformPoint({ x: num(el, 'x1'), y: num(el, 'y1') }), b = m.transformPoint({ x: num(el, 'x2'), y: num(el, 'y2') });
        add({ kind: 'line', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y), flipH: a.x > b.x, flipV: a.y > b.y, stroke: inherited(el, 'stroke', 'none'), sw: num(el, 'stroke-width', 0.5) });
      } else if (tag === 'rect' || tag === 'path') {
        const style = { kind: tag, fill: inherited(el, 'fill', '#000'), stroke: inherited(el, 'stroke', 'none'), sw: num(el, 'stroke-width', 0.5), dash: el.hasAttribute('stroke-dasharray') ? el.getAttribute('stroke-dasharray').split(/[ ,]+/).map(Number) : null };
        if (tag === 'rect') add(Object.assign(style, transformedBox(num(el, 'x'), num(el, 'y'), num(el, 'width'), num(el, 'height'), m)));
        else {
          const d = el.getAttribute('d'), tokens = d.match(/[MLZ]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || [], points = [];
          if (d.replace(/[MLZ\s,\-+.\de]/gi, '')) throw new Error('Unsupported PPTX path');
          let closed = false;
          for (let i = 0; i < tokens.length;) {
            const op = tokens[i++];
            if (op === 'Z') { closed = true; continue; }
            if (op !== 'M' && op !== 'L') throw new Error('Unsupported PPTX path command');
            const x = +tokens[i++], y = +tokens[i++]; if (!Number.isFinite(x + y)) throw new Error('Invalid PPTX path');
            points.push(m.transformPoint({ x, y }));
          }
          const xs = points.map(p => p.x), ys = points.map(p => p.y), x = Math.min(...xs), y = Math.min(...ys);
          add(Object.assign(style, { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, points, closed }));
        }
      } else throw new Error('Unsupported figure element for PPTX: ' + tag);
    }
    try { const m = I().translate(-fig.vx, -fig.vy); Array.from(svg.children).forEach(el => walk(el, m)); }
    finally { host.remove(); }
    if (!objects.some(o => o.kind === 'picture')) throw new Error('No gel image in PPTX');
    return objects;
  }

  function theme(family) {
    const scheme = [['dk1','000000'],['lt1','FFFFFF'],['dk2','111827'],['lt2','F3F4F6'],['accent1','2563EB'],['accent2','16A34A'],['accent3','DC2626'],['accent4','9333EA'],['accent5','EA580C'],['accent6','0891B2'],['hlink','0563C1'],['folHlink','954F72']];
    const fonts = fontXml(family);
    const sf = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
    return XML + `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="GelFigure"><a:themeElements><a:clrScheme name="GelFigure">${scheme.map(([n,c]) => `<a:${n}><a:srgbClr val="${c}"/></a:${n}>`).join('')}</a:clrScheme><a:fontScheme name="Figure font"><a:majorFont>${fonts}</a:majorFont><a:minorFont>${fonts}</a:minorFont></a:fontScheme><a:fmtScheme name="GelFigure"><a:fillStyleLst>${sf.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${[6350,12700,19050].map(w => `<a:ln w="${w}">${sf}<a:prstDash val="solid"/></a:ln>`).join('')}</a:lnStyleLst><a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${sf.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  }
  function packageFile(fig, objects, png) {
    // PowerPoint's supported slide range is 1–56 inches. Tiny figures get blank margins (never
    // resized); huge figures fail rather than silently changing the requested physical/font sizes.
    const w = Math.max(72, fig.w), h = Math.max(72, fig.h);
    if (w > 4032 || h > 4032) throw new Error(G.L('成图超过 PPT 页面上限（1422 mm），请减小图宽或文字范围', 'Figure exceeds the PowerPoint slide limit (56 inches); reduce its width or label extent'));
    const parts = [
      ['ppt/presentation.xml', 'presentationml.presentation.main+xml'], ['ppt/slides/slide1.xml','presentationml.slide+xml'],
      ['ppt/slideMasters/slideMaster1.xml','presentationml.slideMaster+xml'], ['ppt/slideLayouts/slideLayout1.xml','presentationml.slideLayout+xml'], ['ppt/theme/theme1.xml','theme+xml']
    ];
    const clr = '<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>';
    const entries = [
      ['[Content_Types].xml', XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' + parts.map(([n,t]) => `<Override PartName="/${n}" ContentType="application/vnd.openxmlformats-officedocument.${t}"/>`).join('') + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'],
      ['_rels/.rels', rels([['rId1','officeDocument','ppt/presentation.xml'],['rId2','http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties','docProps/core.xml'],['rId3','extended-properties','docProps/app.xml']])],
      ['docProps/core.xml', XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>GelFigure editable figure</dc:title><dc:creator>GelFigure</dc:creator><dc:description>The slide shows the finished cropped figure. Pictures retain the uncropped, rotated and contrast-adjusted image so their crop can be edited. Annotations are independent editable objects; they do not follow crop changes automatically. Fonts are referenced, not embedded. Keep the original image and processing log separately.</dc:description></cp:coreProperties>'],
      ['docProps/app.xml', XML + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>GelFigure</Application><Slides>1</Slides></Properties>'],
      ['ppt/presentation.xml', XML + `<p:presentation ${NS} autoCompressPictures="0"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="${emu(w)}" cy="${emu(h)}" type="custom"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`],
      ['ppt/_rels/presentation.xml.rels', rels([['rId1','slideMaster','slideMasters/slideMaster1.xml'],['rId2','slide','slides/slide1.xml']])],
      ['ppt/slideMasters/slideMaster1.xml', XML + `<p:sldMaster ${NS}><p:cSld><p:spTree>${emptyTree}</p:spTree></p:cSld>${clr}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`],
      ['ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['rId1','slideLayout','../slideLayouts/slideLayout1.xml'],['rId2','theme','../theme/theme1.xml']])],
      ['ppt/slideLayouts/slideLayout1.xml', XML + `<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`],
      ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rId1','slideMaster','../slideMasters/slideMaster1.xml']])],
      ['ppt/theme/theme1.xml', theme(fig.fontFamily)],
      ['ppt/slides/slide1.xml', XML + `<p:sld ${NS}><p:cSld><p:bg><p:bgPr>${fill('#fff')}<a:effectLst/></p:bgPr></p:bg><p:spTree>${emptyTree}${objects.map((o,i) => shape(o,i+2)).join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`],
      ['ppt/slides/_rels/slide1.xml.rels', rels([['rId1','slideLayout','../slideLayouts/slideLayout1.xml'],['rId2','image','../media/gel.png']])],
      ['ppt/media/gel.png', png]
    ];
    return zip(entries);
  }
  async function build() {
    if (!G.App.S) throw new Error(G.L('先打开一张胶图', 'Open a gel image first'));
    // Snapshot geometry before the first await; edits during PNG encoding cannot mix two states.
    const fig = G.App.buildFigure(false), canvas = G.App.fullCanvas;
    const objects = collect(fig, G.App._lastGel, G.App.S.crop, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error(G.L('图片编码失败，可能超出浏览器内存限制', 'Could not encode the image; the browser may be out of memory'));
    return packageFile(fig, objects, new Uint8Array(await blob.arrayBuffer()));
  }
  async function exportFile(name) { G.Export.download(await build(), name); }
  G.PPTX = { build, exportFile, MIME };
})(window);
