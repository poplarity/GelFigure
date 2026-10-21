/* Build GelFigure.html: a single file with every JS and CSS inlined, so it runs by double-click.
 * The app itself does not change: the bundled scripts keep their load order and page structure. */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const indexPath = path.join(root, 'index.html');
const outPath = path.join(root, 'dist', 'GelFigure.html');

const read = p => fs.readFileSync(p, 'utf8');
let html = read(indexPath);

// inline css
const cssFiles = fs.readdirSync(path.join(root, 'css')).filter(f => f.endsWith('.css')).sort((a, b) => a === 'style.css' ? -1 : b === 'style.css' ? 1 : a.localeCompare(b));
let style = '';
for (const f of cssFiles) style += `/* css/${f} */\n` + read(path.join(root, 'css', f)) + '\n';
html = html.replace(/<link rel="stylesheet" href="css\/[^"]+"\s*\/?>/g, `<style>\n${style}\n</style>`);

// inline scripts in the same order as index.html
// script order must match index.html exactly
for (const f of ['storage', 'i18n', 'tiff', 'ladders', 'engine', 'render', 'export', 'demo', 'app', 'editor', 'ui', 'figedit']) {
  const code = read(path.join(root, 'js', f + '.js'));
  const tag = new RegExp(`<script src="js/${f}\\.js"><\\/script>`, 'g');
  html = html.replace(tag, `<script>/* js/${f}.js */\n${code}\n</script>`);
}

// test scripts (test/test.html loads uitest.js too): inline if present
if (html.includes('js/uitest.js')) {
  html = html.replace(/<script src="js\/uitest\.js"><\/script>/g, `<script>/* js/uitest.js */\n${read(path.join(root, 'js', 'uitest.js'))}\n</script>`);
}

// single-file mode needs inline scripts; replace the CSP with one that allows them, keeps everything else
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' file: data: blob:; script-src \'self\' file: \'unsafe-inline\'; style-src \'self\' file: \'unsafe-inline\'; img-src \'self\' file: data: blob:; connect-src \'self\' file: data: blob:; object-src \'none\'; base-uri \'none\'; form-action \'none\'">');

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
console.log(`${outPath}  ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB`);
