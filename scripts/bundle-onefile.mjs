/* Build GelFigure.html: a single file with every JS and CSS inlined, so it runs by double-click.
 * The app itself does not change: the bundled scripts keep their load order and page structure. */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const indexPath = path.join(root, 'index.html');
const outPath = path.join(root, 'dist', 'GelFigure.html');

const read = p => fs.readFileSync(p, 'utf8');
let html = read(indexPath);
const supportSource=read(path.join(root,'js/support-config.js')),configMarker='window.GelFigureSupport = ';
const supportConfig=JSON.parse(supportSource.slice(supportSource.indexOf(configMarker)+configMarker.length).trim().replace(/;$/,''));
const expectedConnect="connect-src 'self' file: data: blob:"+(supportConfig.feedbackEndpoint?' '+supportConfig.feedbackEndpoint:'')+';';
const csp=html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
if(!csp||!csp[1].includes(expectedConnect))throw new Error('Feedback configuration and CSP differ; run scripts/configure-feedback.mjs with the intended endpoint');

// inline css
const cssFiles = fs.readdirSync(path.join(root, 'css')).filter(f => f.endsWith('.css')).sort((a, b) => a === 'style.css' ? -1 : b === 'style.css' ? 1 : a.localeCompare(b));
let style = '';
for (const f of cssFiles) style += `/* css/${f} */\n` + read(path.join(root, 'css', f)) + '\n';
html = html.replace(/<link rel="stylesheet" href="css\/[^"]+"\s*\/?>/g, `<style>\n${style}\n</style>`);

// inline scripts in the same order as index.html
// script order must match index.html exactly
for (const f of ['storage', 'i18n', 'tiff', 'colour', 'ladder-cache', 'ladders', 'engine', 'name-text', 'render', 'export', 'pptx', 'demo', 'app', 'library', 'editor', 'ui', 'figedit', 'mobile', 'marker-ui', 'history-ui', 'support-config', 'feedback', 'export-support']) {
  const code = read(path.join(root, 'js', f + '.js'));
  const tag = new RegExp(`<script src="js/${f}\\.js"><\\/script>`, 'g');
  html = html.replace(tag, `<script>/* js/${f}.js */\n${code}\n</script>`);
}
// a script added to index.html but not to the list above would silently be missing from the single file
const left = html.match(/<script src="js\/(?!uitest)[^"]+"><\/script>/g);
if (left) { console.error('not inlined:', left.join(' ')); process.exit(1); }

// test scripts (test/test.html loads uitest.js too): inline if present
if (html.includes('js/uitest.js')) {
  html = html.replace(/<script src="js\/uitest\.js"><\/script>/g, `<script>/* js/uitest.js */\n${read(path.join(root, 'js', 'uitest.js'))}\n</script>`);
}

// Single-file mode needs inline scripts. Preserve the exact feedback endpoint allowance, if any,
// rather than replacing the whole policy with a broader or stale one.
html = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]+)(">)/,(_,before,policy,after)=>before+policy.replace(/script-src ([^;]+);/,(_,sources)=>"script-src "+sources+" 'unsafe-inline';")+after);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
console.log(`${outPath}  ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB`);
