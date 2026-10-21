/* Interface language (Chinese / English). Strings stay next to the code that uses them:
 *   JS:   L('中文', 'English')                       — evaluated at call time, so re-rendering switches language
 *   HTML: <span data-en="English">中文</span>         — text
 *         data-en-html / data-en-title / data-en-placeholder for markup and attributes
 * The figure itself is always English (journal convention); only the interface is translated. */
(function (G) {
  'use strict';
  const KEY = 'gelfig.lang';
  const fromUrl = new URLSearchParams(location.search).get('lang');
  const savedLang = G.PrefStorage.getItem(KEY);
  let lang = fromUrl === 'en' || fromUrl === 'zh' ? fromUrl
    : (savedLang === 'en' || savedLang === 'zh' ? savedLang : (/^zh\b/i.test(navigator.language || '') ? 'zh' : 'en'));
  const listeners = [];

  const L = (zh, en) => (lang === 'en' ? en : zh);

  // swap one kind of content, remembering the Chinese original the first time
  function swap(el, enAttr, zhAttr, get, set) {
    if (!el.hasAttribute(enAttr)) return;
    if (!el.hasAttribute(zhAttr)) el.setAttribute(zhAttr, get());
    set(lang === 'en' ? el.getAttribute(enAttr) : el.getAttribute(zhAttr));
  }
  function apply(root) {
    (root || document).querySelectorAll('[data-en],[data-en-html],[data-en-title],[data-en-placeholder]').forEach(el => {
      swap(el, 'data-en', 'data-zh', () => el.textContent, v => { el.textContent = v; });
      swap(el, 'data-en-html', 'data-zh-html', () => el.innerHTML, v => { el.innerHTML = v; });
      swap(el, 'data-en-title', 'data-zh-title', () => el.title, v => { el.title = v; });
      swap(el, 'data-en-placeholder', 'data-zh-placeholder', () => el.placeholder, v => { el.placeholder = v; });
    });
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    const b = document.getElementById('btnLang');
    if (b) { b.textContent = lang === 'en' ? '中文' : 'EN'; b.title = lang === 'en' ? '切换到中文' : 'Switch to English'; }
  }
  function set(l) {
    if (l !== 'en' && l !== 'zh') return;
    lang = l;
    G.PrefStorage.setItem(KEY, l);
    apply();
    listeners.forEach(fn => fn(l));
  }

  G.I18N = { L, apply, set, get lang() { return lang; }, onChange: fn => listeners.push(fn) };
  G.L = L;
  apply();   // loaded at the end of <body>: the static page is already parsed
})(window);
