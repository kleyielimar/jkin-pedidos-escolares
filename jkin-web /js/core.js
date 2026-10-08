// Utilidades compartidas (público y panel). Sin dependencias del entorno de diseño.
window.JK = (function () {
  let lang = localStorage.getItem('jk_lang') || ((navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'es');
  let client = null;
  const T = (k, l) => { const e = window.JK_DICT[k]; return e ? e[(l || lang) === 'es' ? 0 : 1] : k; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => n == null ? '—' : '$' + (Number.isInteger(+n) ? +n : (+n).toFixed(2));
  const loc = (o, l) => o ? (o[l || lang] == null ? '' : o[l || lang]) : '';
  const loc2 = l => (l || lang) === 'es' ? 'es-US' : 'en-US';
  const fd = (d, l) => d ? new Date(String(d).length > 10 ? d : d + 'T12:00:00').toLocaleDateString(loc2(l), { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const fdt = (d, l) => new Date(d).toLocaleString(loc2(l), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const szl = (l, lg) => l.age ? T(l.age === 'child' ? 'youth' : 'adultW', lg) + ' ' + l.size : l.size;
  const dsc = (l, lg) => loc(l.product_name, lg) + (l.code ? ' · ' + l.code : '') + (l.model_label ? ' · ' + loc(l.model_label, lg) : '');
  const price = (p, age, size) => (p.price_map && p.price_map[size] != null) ? p.price_map[size] : p.base_price;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
  const configured = () => { const c = window.APP_CONFIG || {}; return c.SUPABASE_URL && !/PEGAR_AQUI/.test(c.SUPABASE_URL) && c.SUPABASE_ANON_KEY && !/PEGAR_AQUI/.test(c.SUPABASE_ANON_KEY); };
  const sb = () => client || (client = window.supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY));
  const img = p => p ? esc(p) : '';
  return { get lang() { return lang; }, setLang(l) { lang = l; localStorage.setItem('jk_lang', l); document.documentElement.lang = l; }, T, esc, money, loc, fd, fdt, szl, dsc, price, uuid, configured, sb, img };
})();
