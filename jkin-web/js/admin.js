// Panel privado de Norma. La protección real está en el servidor (Supabase Auth + RLS + funciones admin_*).
(function () {
  const { T, esc, money, loc, fd, fdt, szl, dsc } = JK;
  const root = document.getElementById('app');
  const A = { user: null, ok: false, msg: '', D: null, loading: false, view: 'summary', fSchool: 'all', fPeriod: 'all', orderSel: null, delSel: null, cfg: null, newFor: null, schoolForm: null,
    toast: '', rType: 'production', rGroup: 'all', rLang: JK.lang, rPaper: 'letter', f: {}, pq: {}, eq: {}, dq: {}, pf: {}, zoom: '' };
  const sb = () => JK.sb();
  const todayLA = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const eff = p => { const d = todayLA(); return p.status === 'closed' || d > p.close_date ? 'closed' : (p.status === 'open' && d >= p.open_date ? 'open' : 'pending'); };
  const stl = p => T({ pending: 'stPending', open: 'stOpen', closed: 'stClosed' }[eff(p)]);
  const rng = (p, l) => fd(p.open_date, l) + ' – ' + fd(p.close_date, l);
  const opts = (arr, sel) => arr.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(sel) ? 'selected' : ''}>${esc(o.l)}</option>`).join('');
  const toast = m => { A.toast = m; render(); clearTimeout(toast.t); toast.t = setTimeout(() => { A.toast = ''; render(); }, 6000); };
  const errMsg = e => { const m = (e && e.message) || String(e); const code = (m.match(/[a-z_]+$/) || [''])[0]; const k = 'x_' + code; return window.JK_DICT[k] ? T(k) : m; };

  async function all(table, order = 'id') {
    let out = [], from = 0;
    for (;;) { const { data, error } = await sb().from(table).select('*').order(order).range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) break; from += 1000; }
    return out;
  }
  async function loadAll() {
    A.loading = true; render();
    try {
      const [schools, periods, groups, products, orders, lines, deliveries, dlines, progress, logs, hist] = await Promise.all([all('schools'), all('periods'), all('groups'), all('products'), all('orders'), all('order_lines'), all('deliveries'), all('delivery_lines'), all('production_progress', 'variant_key'), all('period_date_log'), all('order_history')]);
      const D = { schools, periods: periods.sort((a, b) => b.open_date.localeCompare(a.open_date)), groups, products, orders, lines, deliveries, dlines, progress, logs, hist, ord: {}, del: {}, prog: {}, prod: {}, sch: {}, per: {}, grp: {} };
      orders.forEach(o => D.ord[o.id] = o); schools.forEach(s => D.sch[s.id] = s); periods.forEach(p => D.per[p.id] = p); groups.forEach(g => D.grp[g.id] = g); products.forEach(p => D.prod[p.id] = p);
      dlines.forEach(x => D.del[x.line_id] = (D.del[x.line_id] || 0) + x.qty);
      progress.forEach(p => D.prog[p.period_id + '|' + p.variant_key] = p);
      A.D = D;
    } catch (e) { A.toast = errMsg(e); }
    A.loading = false; render();
  }
  async function rpc(name, args) { const { data, error } = await sb().rpc(name, args); if (error) { toast(errMsg(error)); return { error }; } return { data }; }

  // ---- datos derivados ----
  const D = () => A.D;
  const act = pid => D().lines.filter(l => l.period_id === pid && D().ord[l.order_id] && D().ord[l.order_id].status === 'active');
  const delq = id => D().del[id] || 0;
  const gl = (g, l) => [g.teacher, g.grade, g.room ? T('room', l) + ' ' + g.room : ''].filter(Boolean).join(' · ');
  const pname = p => D().sch[p.school_id].name + ' · ' + rng(p);
  const fPeriods = () => D().periods.filter(p => (A.fSchool === 'all' || p.school_id === A.fSchool) && (A.fPeriod === 'all' || p.id === A.fPeriod));
  const sortKey = r => [r.design, loc(r.product_name, 'es'), loc(r.model_label, 'es'), loc(r.color_name, 'es'), r.age, String(r.size).padStart(3, '0')].join('~');
  function prodRows(pid, gid) {
    const m = {};
    act(pid).forEach(l => { if (gid && gid !== 'all' && l.group_id !== gid) return; (m[l.variant_key] = m[l.variant_key] || { key: l.variant_key, src: l, ordered: 0 }).ordered += l.qty; });
    if (!gid || gid === 'all') D().progress.filter(p => p.period_id === pid).forEach(p => { if (!m[p.variant_key]) m[p.variant_key] = { key: p.variant_key, src: p.meta, ordered: 0 }; });
    return Object.values(m).map(r => { const pr = D().prog[pid + '|' + r.key], prepared = pr ? pr.prepared : 0; return { ...r.src, key: r.key, ordered: r.ordered, prepared, pending: Math.max(0, r.ordered - prepared), flag: !!pr && pr.at_total !== r.ordered, was: pr ? pr.at_total : 0 }; })
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }
  function stat(p) {
    const ls = act(p.id); let ordered = 0, delivered = 0; ls.forEach(l => { ordered += l.qty; delivered += delq(l.id); });
    const rows = prodRows(p.id); let prep = 0, flag = false; rows.forEach(r => { prep += Math.min(r.prepared, r.ordered); if (r.flag) flag = true; });
    return { ordered, delivered, pending: ordered - delivered, prd: flag ? 'review' : !ordered || !prep ? 'none' : prep >= ordered ? 'done' : 'partial', del: !ordered || !delivered ? 'none' : delivered >= ordered ? 'done' : 'partial', orders: D().orders.filter(o => o.period_id === p.id && o.status === 'active').length };
  }
  const tone = k => ({ done: 'blue', partial: 'light', review: 'red', none: '' }[k]);
  const badge = (k) => `<span class="badge ${tone(k)}">${T('st_' + k)}</span>`;
  const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
  const csv = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);
  const publicUrl = p => new URL('index.html', location.href).href + '?p=' + p.slug;

  // ---- validaciones previas a abrir (el servidor las repite) ----
  function validate(p) {
    const e = [], w = [], gs = D().groups.filter(g => g.period_id === p.id), ps = D().products.filter(x => x.period_id === p.id && x.enabled);
    if (!gs.length) e.push(T('vGroups')); if (!ps.some(x => !x.sizes_pending)) e.push(T('vProducts'));
    ps.forEach(x => { const n = loc(x.name); if (x.sizes_pending) w.push(T('wStaff').replace('{n}', n)); else if (x.pending_sizes.length) w.push(T('wSizes').replace('{n}', n + ' ' + x.pending_sizes.join('/'))); if (x.colors.some(c => c.flag)) w.push(T('wColor').replace('{n}', n)); });
    return { e, w };
  }

  // ---- vistas ----
  function filters() {
    const ps = D().periods.filter(p => A.fSchool === 'all' || p.school_id === A.fSchool);
    return `<div class="no-print card row" style="gap:14px;padding:14px 18px"><label style="flex:1 1 200px">${T('school')}<select data-s="fSchool" data-re data-clr="fPeriod">${opts([{ v: 'all', l: T('fAll') }, ...D().schools.map(s => ({ v: s.id, l: s.name }))], A.fSchool)}</select></label>
      <label style="flex:1 1 240px">${T('orderPeriod')}<select data-s="fPeriod" data-re>${opts([{ v: 'all', l: T('fAll') }, ...ps.map(p => ({ v: p.id, l: (A.fSchool === 'all' ? D().sch[p.school_id].name + ' · ' : '') + rng(p) }))], A.fPeriod)}</select></label></div>`;
  }
  function vSummary() {
    const st = fPeriods().map(p => ({ p, x: stat(p) })), tot = { o: 0, d: 0, p: 0, n: 0 }; st.forEach(({ x }) => { tot.o += x.ordered; tot.d += x.delivered; tot.p += x.pending; tot.n += x.orders; });
    const stats = [['ordered', tot.o], ['delivered', tot.d], ['pending', tot.p]].map(([k, v]) => `<div class="card"><div class="stat">${v}</div><div class="muted">${T(k)}</div></div>`).join('');
    const checks = st.map(({ p, x }) => { const a = x.ordered, b = prodRows(p.id).reduce((q, r) => q + r.ordered, 0), c = D().groups.filter(g => g.period_id === p.id).reduce((q, g) => q + act(p.id).filter(l => l.group_id === g.id).reduce((z, l) => z + l.qty, 0), 0), d = x.delivered + x.pending, ok = a === b && b === c && c === d;
      return `<tr><td>${esc(pname(p))}</td><td class="num">${a}</td><td class="num">${b}</td><td class="num">${c}</td><td class="num">${d}</td><td><b style="color:${ok ? '#2E6B4A' : '#B3261E'}">${ok ? T('okTxt') : T('badTxt')}</b></td></tr>`; }).join('');
    return `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">${stats}</div><div class="muted">${T('ordersN')}: <b>${tot.n}</b> · ${T('sumNote')}</div>
      <div class="card scroll"><h3 style="margin-bottom:10px">${T('nSchools')}</h3><table><thead><tr><th>${T('school')}</th><th>${T('orderPeriod')}</th><th>${T('status')}</th><th class="num">${T('ordered')}</th><th class="num">${T('delivered')}</th><th class="num">${T('pendingShort')}</th><th>${T('stProd')}</th><th>${T('stDel')}</th></tr></thead><tbody>
      ${st.map(({ p, x }) => `<tr><td>${esc(D().sch[p.school_id].name)}</td><td>${rng(p)}</td><td>${stl(p)}</td><td class="num">${x.ordered}</td><td class="num">${x.delivered}</td><td class="num">${x.pending}</td><td>${badge(x.prd)}</td><td>${badge(x.del)}</td></tr>`).join('')}</tbody></table></div>
      <div class="card scroll"><h3>${T('checks')}</h3><div class="muted" style="margin-bottom:10px">${T('checksNote')}</div><table><thead><tr><th>${T('orderPeriod')}</th><th class="num">${T('cOrders')}</th><th class="num">${T('cProd')}</th><th class="num">${T('cPack')}</th><th class="num">${T('cDel')}</th><th></th></tr></thead><tbody>${checks}</tbody></table></div>`;
  }
  function vSchools() {
    const sf = A.schoolForm, f = A.f;
    const form = sf ? `<div style="border:1px solid var(--line);border-radius:12px;padding:16px;background:var(--paper)" class="col"><h3>${sf === 'new' ? T('addSchool') : T('editSchool')}</h3>
      <div class="grid"><label>${T('name')}<input data-k="sc_name" value="${esc(f.sc_name)}"/></label><label>${T('collector')}<input data-k="sc_collector" value="${esc(f.sc_collector)}"/></label><label>${T('contactData')}<input data-k="sc_contact" value="${esc(f.sc_contact)}"/></label><label>${T('logoFile')}<input data-k="sc_logo" value="${esc(f.sc_logo)}" placeholder="assets/img/school-harder.png"/></label></div>
      <div class="muted">${T('logoSlot')}</div><div class="row"><button class="btn" data-act="saveSchool">${T('save')}</button><button class="btn ghost" data-act="cancelSchool">${T('cancel')}</button></div></div>` : '';
    const schools = `<div class="card col"><div class="row between"><h2>${T('nSchoolsOnly')}</h2><button class="btn sm" data-act="newSchool">+ ${T('addSchool')}</button></div><div class="scroll"><table><thead><tr><th>${T('name')}</th><th>${T('collector')}</th><th>${T('contactData')}</th><th></th></tr></thead><tbody>
      ${D().schools.map(s => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.collector)}</td><td>${esc(s.contact)}</td><td><button class="btn ghost sm" data-act="editSchool" data-id="${s.id}">${T('edit')}</button></td></tr>`).join('')}</tbody></table></div>${form}</div>`;
    const blocks = D().schools.filter(s => A.fSchool === 'all' || s.id === A.fSchool).map(s => {
      const nf = A.newFor === s.id ? `<div style="border:1px solid var(--line);border-radius:12px;padding:16px;background:var(--paper)" class="col"><h3>${T('newPeriod')}</h3><div class="grid"><label>${T('openFrom')}<input type="date" data-k="np_open" value="${esc(f.np_open)}"/></label><label>${T('openUntil')}<input type="date" data-k="np_close" value="${esc(f.np_close)}"/></label>
        <label>${T('mode')}<select data-k="np_mode">${opts([{ v: 'coord', l: T('mCoord') }, { v: 'each', l: T('mEach') }], f.np_mode || 'coord')}</select></label></div><div class="muted">${T('copyNote')}</div>
        <div class="row"><button class="btn" data-act="createPeriod" data-id="${s.id}">${T('create')}</button><button class="btn ghost" data-act="cancelNew">${T('cancel')}</button></div></div>` : '';
      return `<div class="card col"><div class="row between"><h2>${esc(s.name)}</h2><button class="btn sm" data-act="newPeriod" data-id="${s.id}">+ ${T('newPeriod')}</button></div>${nf}<div class="scroll"><table><thead><tr><th>${T('dates')}</th><th>${T('mode')}</th><th>${T('status')}</th><th>${T('publicLink')}</th><th></th></tr></thead><tbody>
        ${D().periods.filter(p => p.school_id === s.id).map(p => `<tr><td><b>${rng(p)}</b></td><td>${T(p.mode === 'coord' ? 'mCoord' : 'mEach')}</td>
        <td><div class="row" style="gap:8px"><select data-act="setStatus" data-id="${p.id}" style="width:200px">${opts([{ v: 'pending', l: T('stPending') }, { v: 'open', l: T('stOpen') }, { v: 'closed', l: T('stClosed') }], p.status)}</select><span class="muted">${stl(p)}</span></div></td>
        <td><button class="lk" data-act="copyLink" data-id="${p.id}">${T('copyLink')}</button></td><td><button class="btn sec sm" data-act="cfg" data-id="${p.id}">${T('configure')}</button></td></tr>`).join('')}</tbody></table></div></div>`;
    }).join('');
    return schools + blocks + cfgPanel();
  }
  function cfgPanel() {
    const p = A.cfg && D().per[A.cfg]; if (!p) return '';
    const v = validate(p), f = A.f, gs = D().groups.filter(g => g.period_id === p.id), ps = D().products.filter(x => x.period_id === p.id).sort((a, b) => a.sort - b.sort), log = D().logs.filter(x => x.period_id === p.id);
    const pfv = (x, k, d) => (A.pf[x.id] && A.pf[x.id][k] !== undefined) ? A.pf[x.id][k] : d;
    const prodRowsH = ps.map(x => { const map = Object.entries(x.price_map || {}).map(([k, v2]) => k + ':' + v2).join(', ');
      return `<tr><td style="width:60px">${x.photo ? `<img class="thumb" src="${esc(x.photo)}" alt=""/>` : ''}</td><td><b>${esc(loc(x.name))}</b><div class="muted">${T(x.category === 'school' ? 'catSchool' : 'catStaff')} ${esc(x.models.map(m => m.code).join(' / '))}</div>${x.sizes_pending ? `<div class="warn">${T('sizesTbd')}</div>` : x.pending_sizes.length ? `<div class="warn">${T('wSizes').replace('{n}', x.pending_sizes.join('/'))}</div>` : ''}</td>
      <td style="font-size:13px">${esc(x.colors.map(c => loc(c)).join(', '))}<div style="margin-top:6px;grid-template-columns:1fr 1fr" class="grid"><label>${T('youth')}<input data-m="pf" data-k="${x.id}:child" value="${esc(pfv(x, 'child', (x.sizes.child || []).join(', ')))}"/></label><label>${T('adultW')}<input data-m="pf" data-k="${x.id}:adult" value="${esc(pfv(x, 'adult', (x.sizes.adult || []).join(', ')))}"/></label></div></td>
      <td><div class="col" style="gap:6px"><label>${T('refPrice')}<input class="sm" data-m="pf" data-k="${x.id}:price" value="${esc(pfv(x, 'price', x.base_price == null ? '' : x.base_price))}" inputmode="decimal"/></label><label>${T('priceMapLbl')}<input data-m="pf" data-k="${x.id}:map" value="${esc(pfv(x, 'map', map))}" placeholder="2XL:14, 3XL:16"/></label><button class="btn sec sm" data-act="saveProduct" data-id="${x.id}">${T('save')}</button></div></td>
      <td><input type="checkbox" data-act="toggleProduct" data-id="${x.id}" ${x.enabled ? 'checked' : ''}/></td></tr>`; }).join('');
    return `<div class="card col" style="border-color:var(--deep-blue)"><div class="row between"><div><div class="eyebrow">${T('configure')}</div><h2>${esc(pname(p))}</h2></div><button class="lk" data-act="closeCfg">${T('close2')} ✕</button></div>
      <div style="background:var(--paper);border-radius:12px;padding:12px 16px" class="col"><b>${T('validation')}</b>${v.e.length ? '' : `<div class="ok">${T('validOk')}</div>`}${v.e.map(t => `<div class="err">• ${esc(t)}</div>`).join('')}${v.w.map(t => `<div class="warn">• ${esc(t)}</div>`).join('')}</div>
      <div class="col" style="gap:6px"><b>${T('publicLink')}</b><input readonly value="${esc(publicUrl(p))}" onclick="this.select()"/></div>
      <h3>${T('editDates')}</h3><div class="grid"><label>${T('openFrom')}<input type="date" data-k="ed_open" value="${esc(f.ed_open)}"/></label><label>${T('openUntil')}<input type="date" data-k="ed_close" value="${esc(f.ed_close)}"/></label></div>
      <div class="row"><button class="btn sec sm" data-act="saveDates">${T('saveDates')}</button></div>${log.length ? `<div class="muted"><b>${T('dateLog')}</b>${log.map(h => `<div>${fdt(h.at)} · ${esc(h.by_email || '')} · ${esc(h.detail)}</div>`).join('')}</div>` : ''}
      <h3>${T('groups')}</h3><div class="scroll"><table><thead><tr><th>${T('teacher')}</th><th>${T('grade')}</th><th>${T('room')}</th><th></th></tr></thead><tbody>${gs.map(g => `<tr><td>${esc(g.teacher)}</td><td>${esc(g.grade) || '—'}</td><td>${esc(g.room) || '—'}</td><td><button class="lk" data-act="delGroup" data-id="${g.id}">${T('remove')}</button></td></tr>`).join('')}</tbody></table></div>
      <div class="grid"><label>${T('teacher')}<input data-k="gr_teacher" value="${esc(f.gr_teacher)}"/></label><label>${T('grade')}<input data-k="gr_grade" value="${esc(f.gr_grade)}"/></label><label>${T('room')}<input data-k="gr_room" value="${esc(f.gr_room)}"/></label></div><div class="row"><button class="btn sec sm" data-act="addGroup">+ ${T('addGroup')}</button></div>
      <h3>${T('catalog')}</h3><div class="scroll"><table><thead><tr><th></th><th>${T('product')}</th><th>${T('catVariants')}</th><th>${T('refPrice')}</th><th>${T('available')}</th></tr></thead><tbody>${prodRowsH}</tbody></table></div><div class="muted">${T('priceNote')}</div>
      <div style="border:1px solid var(--line);border-radius:12px;padding:16px;background:var(--paper)" class="col"><h3>${T('addProduct')}</h3><div class="grid">
        <label>${T('nameEs')}<input data-k="pr_es" value="${esc(f.pr_es)}"/></label><label>${T('nameEn')}<input data-k="pr_en" value="${esc(f.pr_en)}"/></label>
        <label>${T('category')}<select data-k="pr_cat">${opts([{ v: 'school', l: T('catSchool') }, { v: 'staff', l: T('catStaff') }], f.pr_cat || 'school')}</select></label>
        <label>${T('colorsCsv')}<input data-k="pr_colors" value="${esc(f.pr_colors)}"/></label><label>${T('childCsv')}<input data-k="pr_child" value="${esc(f.pr_child)}"/></label><label>${T('adultCsv')}<input data-k="pr_adult" value="${esc(f.pr_adult)}"/></label>
        <label>${T('refPrice')}<input data-k="pr_price" value="${esc(f.pr_price)}" inputmode="decimal"/></label><label>${T('design')}<input data-k="pr_design" value="${esc(f.pr_design)}"/></label>
        <label>${T('pers')}<select data-k="pr_pers">${opts([{ v: 'none', l: T('pNone') }, { v: 'name', l: T('pName') }, { v: 'nameNumber', l: T('pNameNum') }], f.pr_pers || 'none')}</select></label></div>
        <div class="muted">${T('photoSlot')}</div><div class="row"><button class="btn sec sm" data-act="addProduct">+ ${T('addProduct')}</button></div></div></div>`;
  }

  function vOrders() {
    const ids = fPeriods().map(p => p.id), g = A.f.o_group || 'all';
    const sig = o => o.period_id + '|' + o.registrant_name.toLowerCase() + '|' + D().lines.filter(l => l.order_id === o.id).map(l => [l.group_id, l.variant_key, l.qty, l.personalization].join(':')).sort().join(',');
    const sigs = {}; D().orders.filter(o => o.status === 'active').forEach(o => { const k = sig(o); sigs[k] = (sigs[k] || 0) + 1; });
    const rows = D().orders.filter(o => ids.includes(o.period_id) && (g === 'all' || D().lines.some(l => l.order_id === o.id && l.group_id === g))).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const gopts = [{ v: 'all', l: T('fAll') }, ...fPeriods().flatMap(p => D().groups.filter(x => x.period_id === p.id).map(x => ({ v: x.id, l: (fPeriods().length > 1 ? rng(p) + ' · ' : '') + gl(x) })))];
    return `<div class="card col"><div class="row between"><h3>${T('nOrders')} (${rows.length})</h3><label style="min-width:240px">${T('teacher')}<select data-k="o_group" data-re>${opts(gopts, g)}</select></label></div><div class="scroll"><table><thead><tr><th>#</th><th>${T('registeredAt')}</th><th>${T('registeredBy')}</th><th>${T('orderPeriod')}</th><th class="num">${T('ordered')}</th><th>${T('status')}</th><th></th></tr></thead><tbody>
      ${rows.map(o => `<tr><td><b>${esc(o.number)}</b></td><td>${fdt(o.created_at)}</td><td>${esc(o.registrant_name)}<div class="muted">${esc(o.registrant_contact)}</div></td><td>${esc(pname(D().per[o.period_id]))}</td><td class="num">${D().lines.filter(l => l.order_id === o.id).reduce((a, l) => a + l.qty, 0)}</td><td>${T(o.status === 'active' ? 'stActive' : 'stCancelled')}${o.status === 'active' && sigs[sig(o)] > 1 ? `<div class="err">${T('dupFlag')}</div>` : ''}</td><td><button class="btn sec sm" data-act="openOrder" data-id="${o.id}">${T('detail')}</button></td></tr>`).join('')}</tbody></table></div></div>${orderDetail()}`;
  }
  function orderDetail() {
    const o = A.orderSel && D().ord[A.orderSel]; if (!o) return '';
    const p = D().per[o.period_id], ls = D().lines.filter(l => l.order_id === o.id), gs = D().groups.filter(g => g.period_id === p.id), editable = o.status === 'active';
    const ev = (l, k, d) => (A.eq[l.id + ':' + k] !== undefined ? A.eq[l.id + ':' + k] : d);
    const corr = editable ? `<h3>${T('correction')}</h3><div class="muted">${T('corrNote')}</div>` + ls.map(l => { const pr = D().prod[l.product_id];
      return `<div style="border:1px solid var(--line);border-radius:12px;padding:12px" class="col"><div style="font-weight:700">${esc(dsc(l))} · ${esc(szl(l))} · ${esc(loc(l.color_name))}</div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
        <label>${T('group')}<select data-m="eq" data-k="${l.id}:g">${opts(gs.map(g => ({ v: g.id, l: gl(g) })), ev(l, 'g', l.group_id))}</select></label>
        <label>${T('color')}<select data-m="eq" data-k="${l.id}:c">${opts(pr.colors.map(c => ({ v: c.id, l: loc(c) })), ev(l, 'c', l.color_id))}</select></label>
        <label>${T('size')}<select data-m="eq" data-k="${l.id}:s">${opts(((pr.sizes || {})[l.age] || [l.size]).map(z => ({ v: z, l: z })), ev(l, 's', l.size))}</select></label>
        <label>${T('qty')}<input data-m="eq" data-k="${l.id}:q" value="${esc(ev(l, 'q', l.qty))}" ${l.personalization ? 'disabled' : ''}/></label>
        ${l.personalization ? `<label>${T('pers')}<input data-m="eq" data-k="${l.id}:t" value="${esc(ev(l, 't', l.personalization))}"/></label>` : ''}</div>
        <div class="row"><button class="btn sm" data-act="saveLine" data-id="${l.id}">${T('saveCorr')}</button></div></div>`; }).join('') +
      `<div class="row" style="align-items:flex-end"><label style="flex:1 1 260px">${T('cancelReason')}<input data-k="cancel" value="${esc(A.f.cancel)}"/></label><button class="btn sec" data-act="cancelOrder" data-id="${o.id}">${T('cancelOrder')}</button></div>` : '';
    return `<div class="card col" style="border-color:var(--deep-blue)"><div class="row between"><div><div class="eyebrow">${T('detail')}</div><h2>${esc(o.number)}</h2></div><button class="lk" data-act="closeOrder">${T('close2')} ✕</button></div>
      <div class="grid"><div><div class="muted">${T('registeredBy')}</div><b>${esc(o.registrant_name)}</b> · ${T({ coord: 'roleCoord', teacher: 'roleTeacher', rep: 'roleRep' }[o.registrant_role])}<div class="muted">${esc(o.registrant_contact)}</div></div><div><div class="muted">${T('registeredAt')}</div><b>${fdt(o.created_at)}</b></div><div><div class="muted">${T('orderPeriod')}</div><b>${esc(pname(p))}</b></div><div><div class="muted">${T('status')}</div><b>${T(editable ? 'stActive' : 'stCancelled')}</b>${editable ? '' : `<div class="err">${T('cancelledInfo')} ${esc(o.cancel_reason)}</div>`}</div></div>
      <div class="scroll"><table><thead><tr><th>${T('teacher')}</th><th>${T('product')}</th><th>${T('color')}</th><th>${T('size')}</th><th class="num">${T('qty')}</th><th class="num">${T('delivered2')}</th><th>${T('pers')}</th></tr></thead><tbody>
      ${ls.map(l => `<tr><td>${esc(D().grp[l.group_id].teacher)}</td><td>${esc(dsc(l))}</td><td>${esc(loc(l.color_name))}</td><td>${esc(szl(l))}</td><td class="num">${l.qty}</td><td class="num">${delq(l.id)}</td><td><b>${l.personalization ? '“' + esc(l.personalization) + '”' : ''}</b></td></tr>`).join('')}</tbody></table></div>${corr}
      <h3>${T('history')}</h3><table><thead><tr><th>${T('registeredAt')}</th><th>${T('by')}</th><th>${T('action')}</th><th>${T('detail')}</th></tr></thead><tbody>${D().hist.filter(h => h.order_id === o.id).sort((a, b) => a.at.localeCompare(b.at)).map(h => `<tr><td>${fdt(h.at)}</td><td>${esc(h.by_email || '')}</td><td>${T('a_' + h.action)}</td><td>${esc(h.detail)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function vProduction() {
    return fPeriods().map(p => { const rows = prodRows(p.id), ds = {}; rows.forEach(r => (ds[r.design] = ds[r.design] || []).push(r));
      return `<div class="card col"><div><div class="eyebrow">${esc(D().sch[p.school_id].name)}</div><h2>${rng(p)}</h2></div>${Object.keys(ds).map(d => `<div class="scroll"><div style="font-weight:700;color:var(--terracotta);margin:6px 0">${T('design')}: ${esc(d)} · ${ds[d].reduce((a, r) => a + r.ordered, 0)} ${T('pcs')}</div>
        <table><thead><tr><th></th><th>${T('product')}</th><th>${T('color')}</th><th>${T('size')}</th><th class="num">${T('ordered2')}</th><th class="num">${T('prepared')}</th><th class="num">${T('pendingShort')}</th><th>${T('setPrepared')}</th><th></th></tr></thead><tbody>
        ${ds[d].map(r => `<tr><td style="width:60px">${r.photo ? `<img class="thumb" src="${esc(r.photo)}" alt=""/>` : ''}</td><td>${esc(dsc(r))}</td><td>${esc(loc(r.color_name))}</td><td>${esc(szl(r))}</td><td class="num">${r.ordered}</td><td class="num">${r.prepared}</td><td class="num">${r.pending}</td>
        <td><div class="row" style="gap:6px"><input class="sm" data-m="pq" data-k="${esc(p.id + '#' + r.key)}" value="${esc(A.pq[p.id + '#' + r.key] !== undefined ? A.pq[p.id + '#' + r.key] : r.prepared)}" inputmode="numeric"/><button class="lk" data-act="savePrep" data-p="${p.id}" data-key="${esc(r.key)}">${T('save')}</button><button class="lk" style="color:var(--deep-blue)" data-act="allPrep" data-p="${p.id}" data-key="${esc(r.key)}" data-n="${r.ordered}">${T('allPrepared')}</button></div></td>
        <td>${r.flag ? `<div class="err">${T('flagTxt').replace('{a}', r.was).replace('{b}', r.ordered)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`).join('') || `<div class="muted">${T('noItems')}</div>`}</div>`; }).join('') + `<div class="muted">${T('prodNote')}</div>`;
  }
  function vDeliveries() {
    return fPeriods().map(p => { const ls = act(p.id);
      const packs = D().groups.filter(g => g.period_id === p.id).map(g => { const gl2 = ls.filter(l => l.group_id === g.id); if (!gl2.length) return ''; const key = p.id + '|' + g.id, open = A.delSel === key;
        let q = 0, d = 0; gl2.forEach(l => { q += l.qty; d += delq(l.id); }); const sk = d === 0 ? 'none' : d >= q ? 'done' : 'partial';
        const hist = D().deliveries.filter(x => x.period_id === p.id && x.group_id === g.id).map(x => { const n = D().dlines.filter(z => z.delivery_id === x.id).reduce((a, z) => a + z.qty, 0); return `<div class="muted">${fd(x.delivered_on)} · ${esc(x.received_by)} · ${n} ${T('pcs')}${x.notes ? ' · ' + esc(x.notes) : ''}</div>`; }).join('');
        return `<div class="card col"><div class="row between"><div><h3 style="color:var(--terracotta)">${esc(gl(g))}</h3><div class="muted">${T('ordered2')} ${q} · ${T('delivered2')} ${d} · ${T('pendingShort')} ${q - d}</div></div><div class="row">${badge(sk)}<button class="btn sec sm" data-act="toggleDel" data-key="${key}" ${q - d === 0 ? 'disabled' : ''}>${open ? T('closeDelivery') : T('openDelivery')}</button></div></div>
        ${open ? `<div class="grid" style="background:var(--paper);padding:14px;border-radius:12px"><label>${T('date')}<input type="date" data-k="dl_date" value="${esc(A.f.dl_date || todayLA())}"/></label><label>${T('receivedBy')}<input data-k="dl_by" value="${esc(A.f.dl_by)}"/></label><label>${T('notes')}<input data-k="dl_notes" value="${esc(A.f.dl_notes)}"/></label></div>` : ''}
        <div class="scroll"><table><thead><tr><th>${T('product')}</th><th>${T('color')}</th><th>${T('size')}</th><th class="num">${T('ordered2')}</th><th class="num">${T('delivered2')}</th><th class="num">${T('pendingShort')}</th>${open ? `<th>${T('deliverNow')}</th>` : ''}</tr></thead><tbody>
        ${gl2.map(l => `<tr><td>${esc(dsc(l))}<div class="muted">${l.personalization ? '“' + esc(l.personalization) + '”' : ''}</div></td><td>${esc(loc(l.color_name))}</td><td>${esc(szl(l))}</td><td class="num">${l.qty}</td><td class="num">${delq(l.id)}</td><td class="num">${l.qty - delq(l.id)}</td>${open ? `<td><input class="sm" data-m="dq" data-k="${l.id}" value="${esc(A.dq[l.id] || '')}" inputmode="numeric"/></td>` : ''}</tr>`).join('')}</tbody></table></div>
        ${open ? `<div class="row"><button class="btn" data-act="regDelivery" data-p="${p.id}" data-g="${g.id}">${T('registerDelivery')}</button></div>` : ''}${hist ? `<div><b style="font-size:13px">${T('deliveryHistory')}</b>${hist}</div>` : ''}</div>`; }).join('');
      return `<div class="col"><div><div class="eyebrow">${esc(D().sch[p.school_id].name)}</div><h2>${rng(p)}</h2></div>${packs}</div>`; }).join('');
  }

  // ---- reportes imprimibles ----
  function sheets() {
    const rl = A.rLang, R = k => T(k, rl), ps = fPeriods(), out = [], now = new Date(), ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
    const code = { production: 'PRD', prep: rl === 'es' ? 'PRE' : 'PREP', individual: 'IND', delivery: rl === 'es' ? 'ENT' : 'DEL' }[A.rType];
    const rowT = (l, extra = '') => `<tr>${extra}<td>${esc(dsc(l, rl))}</td><td>${esc(loc(l.color_name, rl))}</td><td>${esc(szl(l, rl))}</td>`;
    const rg = ps.length === 1 && D().groups.some(g => g.id === A.rGroup && g.period_id === ps[0].id) ? A.rGroup : 'all';
    ps.forEach(p => {
      const s = D().sch[p.school_id], gsel = rg === 'all' ? null : D().grp[rg];
      const head = (title, g) => `<div class="sheet"><div class="row between" style="align-items:flex-start;border-bottom:2px solid var(--deep-blue);padding-bottom:12px;margin-bottom:14px"><div><h1>${title}</h1><div style="font-size:15px;font-weight:700;margin-top:4px">${esc(s.name)} · ${rng(p, rl)}</div><div style="font-size:13px">${g ? esc(gl(g, rl)) : ''}</div></div><div class="row" style="gap:14px">${s.logo_path ? `<img src="${esc(s.logo_path)}" alt="" style="height:64px;width:auto"/>` : ''}<img src="assets/logo-color.svg" alt="" style="height:52px;width:auto"/></div></div>
        <div style="font-size:12px;color:#555;margin-bottom:14px">${R('filters')}: ${R('school')}: ${esc(s.name)} · ${R('orderPeriod')}: ${rng(p, rl)} · ${R('teacher')}: ${gsel ? esc(gsel.teacher) : R('fAll')} · ${R('generated')}: ${now.toLocaleString(rl === 'es' ? 'es-US' : 'en-US')} · ID: <b>RPT-${code}-${p.id.slice(0, 4).toUpperCase()}${g ? '-' + g.id.slice(0, 4).toUpperCase() : ''}-${ymd}</b></div>`;
      const gs = D().groups.filter(g => g.period_id === p.id && (rg === 'all' || g.id === rg));
      if (A.rType === 'production') {
        const rows = prodRows(p.id, rg).filter(r => r.ordered > 0), ds = {}; rows.forEach(r => (ds[r.design] = ds[r.design] || []).push(r));
        out.push(head(R('r_production'), null) + Object.keys(ds).map(d => `<div style="margin-bottom:14px"><div style="font-weight:700;margin-bottom:4px">${R('design')}: ${esc(d)}</div><table><thead><tr><th>${R('product')}</th><th>${R('color')}</th><th>${R('size')}</th><th class="num">${R('ordered2')}</th><th class="num">${R('prepared')}</th><th class="num">${R('pendingShort')}</th></tr></thead><tbody>
          ${ds[d].map(r => rowT(r) + `<td class="num">${r.ordered}</td><td class="num">${r.prepared}</td><td class="num">${r.pending}</td></tr>`).join('')}<tr><td colspan="3"><b>${R('subtotal')}</b></td><td class="num"><b>${ds[d].reduce((a, r) => a + r.ordered, 0)}</b></td><td class="num"><b>${ds[d].reduce((a, r) => a + r.prepared, 0)}</b></td><td class="num"><b>${ds[d].reduce((a, r) => a + r.pending, 0)}</b></td></tr></tbody></table></div>`).join('') + `<div style="font-weight:800;font-size:16px">${R('total')}: ${rows.reduce((a, r) => a + r.ordered, 0)}</div></div>`);
      } else if (A.rType === 'prep') {
        gs.forEach(g => { const ls = act(p.id).filter(l => l.group_id === g.id); if (!ls.length) return;
          out.push(head(R('r_prep'), g) + `<table><thead><tr><th style="width:30px"></th><th>${R('product')}</th><th>${R('color')}</th><th>${R('size')}</th><th class="num">${R('qty')}</th><th>${R('pers')}</th></tr></thead><tbody>${ls.map(l => rowT(l, '<td><span class="box"></span></td>') + `<td class="num">${l.qty}</td><td>${l.personalization ? '“' + esc(l.personalization) + '”' : ''}</td></tr>`).join('')}</tbody></table><div style="font-weight:800;font-size:16px;margin-top:12px">${R('packTotal')}: ${ls.reduce((a, l) => a + l.qty, 0)}</div><div style="font-size:12px;color:#555;margin-top:10px">${R('paperNote')}</div></div>`); });
      } else if (A.rType === 'delivery') {
        gs.forEach(g => { const ls = act(p.id).filter(l => l.group_id === g.id); if (!ls.length) return; const q = ls.reduce((a, l) => a + l.qty, 0), d = ls.reduce((a, l) => a + delq(l.id), 0);
          out.push(head(R('r_delivery'), g) + `<table><thead><tr><th>${R('product')}</th><th>${R('color')}</th><th>${R('size')}</th><th class="num">${R('ordered2')}</th><th class="num">${R('delivered2')}</th><th class="num">${R('pendingShort')}</th></tr></thead><tbody>${ls.map(l => rowT(l) + `<td class="num">${l.qty}</td><td class="num">${delq(l.id)}</td><td class="num">${l.qty - delq(l.id)}</td></tr>`).join('')}<tr><td colspan="3"><b>${R('total')}</b></td><td class="num"><b>${q}</b></td><td class="num"><b>${d}</b></td><td class="num"><b>${q - d}</b></td></tr></tbody></table>
            <div class="sigs"><div>${R('date')}:</div><div>${R('receivedBy')}:</div><div style="grid-column:1 / 3">${R('signature')}:</div></div><div style="font-size:12px;color:#555;margin-top:10px">${R('paperNote')}</div></div>`); });
      } else {
        const rows = []; gs.forEach(g => act(p.id).filter(l => l.group_id === g.id && l.personalization).forEach(l => rows.push({ g, l })));
        out.push(head(R('r_individual'), gsel) + (rows.length ? `<table><thead><tr><th>${R('teacher')}</th><th>${R('product')}</th><th>${R('color')}</th><th>${R('size')}</th><th>${R('exactText')}</th></tr></thead><tbody>${rows.map(({ g, l }) => rowT(l, `<td>${esc(g.teacher)}</td>`) + `<td><b>“${esc(l.personalization)}”</b></td></tr>`).join('')}</tbody></table>` : `<div>${R('noInd')}</div>`) + '</div>');
      }
    });
    return out.join('') || `<div class="muted">${T('noItems')}</div>`;
  }
  function vReports() {
    const ps = fPeriods(), gopts = [{ v: 'all', l: T('fAll') }, ...(ps.length === 1 ? D().groups.filter(g => g.period_id === ps[0].id).map(g => ({ v: g.id, l: gl(g) })) : [])];
    return `<div class="no-print card col"><div class="grid"><label>${T('reportType')}<select data-s="rType" data-re>${opts(['production', 'prep', 'individual', 'delivery'].map(k => ({ v: k, l: T('r_' + k) })), A.rType)}</select></label>
      <label>${T('teacher')}<select data-s="rGroup" data-re>${opts(gopts, A.rGroup)}</select></label><label>${T('reportLang')}<select data-s="rLang" data-re>${opts([{ v: 'es', l: 'Español' }, { v: 'en', l: 'English' }], A.rLang)}</select></label>
      <label>${T('paper')}<select data-s="rPaper" data-re>${opts([{ v: 'letter', l: T('letterOpt') }, { v: 'a4', l: 'A4' }], A.rPaper)}</select></label></div>
      <div class="row"><button class="btn" data-act="print">${T('print')}</button><span class="muted">${T('printNote')}</span></div></div>${sheets()}`;
  }

  // ---- armado ----
  const VIEWS = [['summary', 'nSummary', vSummary], ['schools', 'nSchools', vSchools], ['orders', 'nOrders', vOrders], ['production', 'nProduction', vProduction], ['deliveries', 'nDeliveries', vDeliveries], ['reports', 'nReports', vReports]];
  const langBtns = () => ['es', 'en'].map(l => `<button class="lang ${JK.lang === l ? 'on' : ''}" data-act="lang" data-v="${l}">${l.toUpperCase()}</button>`).join('');
  function render() {
    document.documentElement.lang = JK.lang;
    const pg = document.getElementById('pgsize') || Object.assign(document.head.appendChild(document.createElement('style')), { id: 'pgsize' });
    pg.textContent = '@page{size:' + (A.rPaper === 'a4' ? 'A4' : 'letter') + ';margin:14mm}';
    if (!JK.configured()) { root.innerHTML = `<div class="card" style="max-width:560px;margin:40px auto"><b class="err">${T('eConfig')}</b></div>`; return; }
    if (!A.user) {
      root.innerHTML = `<div class="col" style="max-width:420px;margin:40px auto;padding:0 16px"><div class="row between"><img src="assets/logo-color.svg" alt="JKINnovations" style="height:60px;width:auto"/><div class="row" style="gap:6px">${langBtns()}</div></div>
        <div class="card col"><h2>${T('login')}</h2><label>${T('email')}<input type="email" data-k="li_email" value="${esc(A.f.li_email)}" autocomplete="username"/></label><label>${T('password')}<input type="password" data-k="li_pass" autocomplete="current-password"/></label>
        ${A.msg ? `<div class="err">${esc(A.msg)}</div>` : ''}<button class="btn" data-act="login">${T('login')}</button></div></div>`; return;
    }
    if (!A.ok) { root.innerHTML = `<div class="card col" style="max-width:520px;margin:40px auto"><b class="err">${T('noAccess')}</b><div class="muted">${esc(A.user.email)}</div><button class="btn sec" data-act="logout">${T('logout')}</button></div>`; return; }
    if (!A.D) { root.innerHTML = `<div style="padding:40px;text-align:center" class="muted">${A.toast ? esc(A.toast) : '…'}</div>`; return; }
    const cur = VIEWS.find(v => v[0] === A.view);
    root.innerHTML = `<div class="shell"><aside class="side no-print"><img src="assets/logo-white.svg" alt="JKINnovations" style="height:56px;width:auto;align-self:flex-start"/><nav>${VIEWS.map(v => `<button class="${A.view === v[0] ? 'on' : ''}" data-act="nav" data-v="${v[0]}">${T(v[1])}</button>`).join('')}</nav><button data-act="logout" style="margin-top:auto;border:1px solid #8aa0b6">${T('logout')}</button></aside>
      <main class="main"><div class="no-print row between" style="align-items:flex-end"><div><div class="eyebrow">${T('app')}</div><h1>${T(cur[1])}</h1></div><div class="row" style="gap:6px">${langBtns()}<button class="btn sec sm" data-act="reload">${A.loading ? '…' : T('refresh')}</button></div></div>
      ${filters()}${A.toast ? `<div class="no-print toast">${esc(A.toast)}</div>` : ''}${cur[2]()}</main></div>`;
  }

  // ---- acciones ----
  const num = s => { const n = String(s).trim() === '' ? null : Number(s); return n !== null && isNaN(n) ? undefined : n; };
  const acts = {
    lang: el => { JK.setLang(el.dataset.v); A.rLang = el.dataset.v; render(); },
    nav: el => { A.view = el.dataset.v; render(); }, reload: () => loadAll(), print: () => window.print(),
    login: async () => { A.msg = ''; const { data, error } = await sb().auth.signInWithPassword({ email: (A.f.li_email || '').trim(), password: document.querySelector('[data-k=li_pass]').value }); if (error) { A.msg = T('eLogin'); return render(); } await afterAuth(data.user); },
    logout: async () => { await sb().auth.signOut(); A.user = null; A.ok = false; A.D = null; render(); },
    newSchool: () => { A.schoolForm = 'new'; Object.assign(A.f, { sc_name: '', sc_collector: '', sc_contact: '', sc_logo: '' }); render(); },
    editSchool: el => { const s = D().sch[el.dataset.id]; A.schoolForm = s.id; Object.assign(A.f, { sc_name: s.name, sc_collector: s.collector, sc_contact: s.contact, sc_logo: s.logo_path || '' }); render(); },
    cancelSchool: () => { A.schoolForm = null; render(); },
    saveSchool: async () => { const f = A.f; if (!(f.sc_name || '').trim()) return toast(T('msgSchoolInvalid'));
      const row = { name: f.sc_name.trim(), collector: f.sc_collector || '', contact: f.sc_contact || '', logo_path: (f.sc_logo || '').trim() || null };
      const { error } = A.schoolForm === 'new' ? await sb().from('schools').insert(row) : await sb().from('schools').update(row).eq('id', A.schoolForm); if (error) return toast(errMsg(error)); A.schoolForm = null; await loadAll(); toast(T('msgSaved')); },
    newPeriod: el => { A.newFor = el.dataset.id; Object.assign(A.f, { np_open: todayLA(), np_close: '', np_mode: 'coord' }); render(); }, cancelNew: () => { A.newFor = null; render(); },
    createPeriod: async el => { const f = A.f; if (!f.np_open || !f.np_close || f.np_close < f.np_open) return toast(T('msgPeriodInvalid'));
      const r = await rpc('admin_create_period', { p_school: el.dataset.id, p_open: f.np_open, p_close: f.np_close, p_mode: f.np_mode || 'coord' }); if (r.error) return; A.newFor = null; await loadAll(); acts.cfg({ dataset: { id: r.data } }); toast(T('msgCreated')); },
    setStatus: async el => { const r = await rpc('admin_set_period_status', { p_period: el.dataset.id, p_status: el.value }); await loadAll(); if (!r.error) toast(T('msgSaved')); },
    copyLink: async el => { const u = publicUrl(D().per[el.dataset.id]); try { await navigator.clipboard.writeText(u); toast(T('copied')); } catch (e) { prompt(T('publicLink'), u); } },
    cfg: el => { const p = D().per[el.dataset.id]; A.cfg = p.id; A.f.ed_open = p.open_date; A.f.ed_close = p.close_date; render(); }, closeCfg: () => { A.cfg = null; render(); },
    saveDates: async () => { if (!A.f.ed_open || !A.f.ed_close || A.f.ed_close < A.f.ed_open) return toast(T('dateErr')); const r = await rpc('admin_update_dates', { p_period: A.cfg, p_open: A.f.ed_open, p_close: A.f.ed_close }); await loadAll(); if (!r.error) toast(T('msgSaved')); },
    addGroup: async () => { const f = A.f; if (!(f.gr_teacher || '').trim()) return; const { error } = await sb().from('groups').insert({ period_id: A.cfg, teacher: f.gr_teacher.trim(), grade: f.gr_grade || '', room: f.gr_room || '', sort: 999 }); if (error) return toast(errMsg(error)); Object.assign(f, { gr_teacher: '', gr_grade: '', gr_room: '' }); await loadAll(); },
    delGroup: async el => { const { error } = await sb().from('groups').delete().eq('id', el.dataset.id); if (error) return toast(T('msgGroupUsed')); await loadAll(); },
    toggleProduct: async el => { await sb().from('products').update({ enabled: el.checked }).eq('id', el.dataset.id); await loadAll(); },
    saveProduct: async el => { const x = D().prod[el.dataset.id], g = k => A.pf[x.id] && A.pf[x.id][k]; const price = g('price') !== undefined ? num(g('price')) : x.base_price; if (price === undefined) return toast(T('msgQty'));
      const map = {}; if (g('map') !== undefined) { for (const pair of csv(g('map'))) { const [k, v] = pair.split(':'); const n = Number(v); if (!k || isNaN(n)) return toast(T('msgQty')); map[k.trim()] = n; } } else Object.assign(map, x.price_map);
      const child = g('child') !== undefined ? csv(g('child')) : (x.sizes.child || []), adult = g('adult') !== undefined ? csv(g('adult')) : (x.sizes.adult || []);
      const ages = [child.length ? 'child' : '', adult.length ? 'adult' : ''].filter(Boolean), pend = (x.pending_sizes || []).filter(z => !adult.includes(z) && !child.includes(z));
      const { error } = await sb().from('products').update({ base_price: price, price_map: map, sizes: { child, adult }, ages, pending_sizes: pend, sizes_pending: ages.length ? false : x.sizes_pending }).eq('id', x.id); if (error) return toast(errMsg(error)); delete A.pf[x.id]; await loadAll(); toast(T('msgSaved')); },
    addProduct: async () => { const f = A.f, child = csv(f.pr_child), adult = csv(f.pr_adult), colors = csv(f.pr_colors); if (!(f.pr_es || f.pr_en) || !colors.length || (!child.length && !adult.length)) return toast(T('msgProductInvalid')); const price = num(f.pr_price || ''); if (price === undefined) return toast(T('msgQty'));
      const { error } = await sb().from('products').insert({ period_id: A.cfg, key: slug(f.pr_en || f.pr_es), category: f.pr_cat || 'school', name: { es: f.pr_es || f.pr_en, en: f.pr_en || f.pr_es }, design: f.pr_design || '', personalization: f.pr_pers || 'none', base_price: price, ages: [child.length ? 'child' : '', adult.length ? 'adult' : ''].filter(Boolean), sizes: { child, adult }, colors: colors.map(c => ({ id: slug(c), es: c, en: c, sw: '#cccccc', photo: '' })), enabled: true, sort: 500 });
      if (error) return toast(errMsg(error)); Object.assign(f, { pr_es: '', pr_en: '', pr_colors: '', pr_child: '', pr_adult: '', pr_price: '', pr_design: '' }); await loadAll(); toast(T('msgSaved')); },
    openOrder: el => { A.orderSel = el.dataset.id; render(); }, closeOrder: () => { A.orderSel = null; render(); },
    saveLine: async el => { const l = D().lines.find(x => x.id === el.dataset.id), g = (k, d) => A.eq[l.id + ':' + k] !== undefined ? A.eq[l.id + ':' + k] : d;
      const r = await rpc('admin_correct_line', { p_line: l.id, p_group: g('g', l.group_id), p_color: g('c', l.color_id), p_size: g('s', l.size), p_qty: Number(g('q', l.qty)), p_text: g('t', l.personalization) });
      Object.keys(A.eq).filter(k => k.startsWith(l.id)).forEach(k => delete A.eq[k]); await loadAll(); if (!r.error) toast(r.data && r.data.production_started ? T('msgCorr') + ' ' + T('msgProdStarted') : T('msgCorr')); },
    cancelOrder: async el => { const r = await rpc('admin_cancel_order', { p_order: el.dataset.id, p_reason: A.f.cancel || '' }); A.f.cancel = ''; await loadAll(); if (!r.error) toast(T('msgSaved')); },
    savePrep: async el => { const k = el.dataset.p + '#' + el.dataset.key, row = prodRows(el.dataset.p).find(r => r.key === el.dataset.key), v = A.pq[k] !== undefined ? A.pq[k] : row.prepared; if (!/^\d+$/.test(String(v))) return toast(T('msgProd'));
      const r = await rpc('admin_set_prepared', { p_period: el.dataset.p, p_key: el.dataset.key, p_qty: Number(v) }); delete A.pq[k]; await loadAll(); if (!r.error) toast(T('msgSaved')); },
    allPrep: async el => { const r = await rpc('admin_set_prepared', { p_period: el.dataset.p, p_key: el.dataset.key, p_qty: Number(el.dataset.n) }); delete A.pq[el.dataset.p + '#' + el.dataset.key]; await loadAll(); if (!r.error) toast(T('msgSaved')); },
    toggleDel: el => { A.delSel = A.delSel === el.dataset.key ? null : el.dataset.key; A.dq = {}; render(); },
    regDelivery: async el => { const ls = act(el.dataset.p).filter(l => l.group_id === el.dataset.g), out = []; let ok = true;
      ls.forEach(l => { const raw = A.dq[l.id], q = raw === undefined || raw === '' ? 0 : Number(raw); if (!Number.isInteger(q) || q < 0 || q > l.qty - delq(l.id)) ok = false; else if (q > 0) out.push({ line_id: l.id, qty: q }); });
      if (!ok || !out.length || !A.f.dl_by || !(A.f.dl_date || todayLA())) return toast(T('msgDelInvalid'));
      const r = await rpc('admin_register_delivery', { p_period: el.dataset.p, p_group: el.dataset.g, p_date: A.f.dl_date || todayLA(), p_by: A.f.dl_by, p_notes: A.f.dl_notes || '', p_lines: out }); if (r.error) return;
      A.delSel = null; A.dq = {}; A.f.dl_by = ''; A.f.dl_notes = ''; await loadAll(); toast(T('msgDelOk')); }
  };
  root.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || el.type === 'checkbox') return; if (acts[el.dataset.act]) acts[el.dataset.act](el); });
  root.addEventListener('change', e => { const t = e.target;
    if (t.dataset.act && (t.tagName === 'SELECT' || t.type === 'checkbox')) { acts[t.dataset.act](t); return; }
    set(t, true); });
  root.addEventListener('input', e => { if (e.target.tagName !== 'SELECT' && e.target.type !== 'checkbox') set(e.target, false); });
  function set(t, fire) {
    if (t.dataset.m) { A[t.dataset.m][t.dataset.k] = t.value; return; }
    if (t.dataset.k) { A.f[t.dataset.k] = t.value; if (fire && t.dataset.re !== undefined) render(); return; }
    if (t.dataset.s) { A[t.dataset.s] = t.value; if (t.dataset.clr) A[t.dataset.clr] = 'all'; if (fire) render(); }
  }
  async function afterAuth(user) {
    A.user = user; const { data } = await sb().from('admins').select('user_id').maybeSingle(); A.ok = !!data; render(); if (A.ok) loadAll();
  }
  (async function init() {
    render(); if (!JK.configured()) return;
    const { data } = await sb().auth.getSession(); if (data.session) await afterAuth(data.session.user);
  })();
})();
