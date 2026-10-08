// Formulario público: solo registra pedidos y muestra la confirmación. Toda validación se repite en el servidor.
(function () {
  const { T, esc, money, loc, fd, szl, price, uuid } = JK;
  const root = document.getElementById('app');
  const slug = new URLSearchParams(location.search).get('p') || '';
  const blank = () => ({ group: '', prod: '', model: '', age: '', color: '', size: '', qty: '1', text: '' });
  const S = { data: null, fatal: '', step: 1, f: { name: '', role: '', contact: '' }, o: blank(), lines: [], errs: {}, ack: false, sending: false, done: null, reqKey: uuid(), added: '', zoom: '', submitErr: '' };

  const P = id => S.data.products.find(p => p.id === id);
  const G = id => S.data.groups.find(g => g.id === id);
  const gl = g => [g.teacher, g.grade, g.room ? T('room') + ' ' + g.room : ''].filter(Boolean).join(' · ');
  const orderable = p => !p.sizes_pending;
  const needsAge = p => p.ages && p.ages.length > 0;
  const sizeList = (p, age) => (p.sizes && p.sizes[age]) || [];
  const range = p => {
    const ps = [p.base_price, ...Object.values(p.price_map || {})].filter(x => x != null);
    if (!ps.length) return T('priceTbd');
    const a = Math.min(...ps), b = Math.max(...ps); return a === b ? money(a) : money(a) + ' – ' + money(b);
  };
  const colorOf = (p, id) => p.colors.find(c => c.id === id);
  const photoOf = (p, c) => (c && c.photo) || p.photo || '';

  async function load() {
    if (!JK.configured()) S.fatal = T('eConfig');
    else if (!slug) S.fatal = T('eLink');
    else {
      const { data, error } = await JK.sb().rpc('public_get_period', { p_slug: slug });
      if (error) S.fatal = T('eServer'); else if (!data) S.fatal = T('eLink'); else S.data = data;
    }
    render();
  }

  const langBtns = () => ['es', 'en'].map(l => `<button class="lang ${JK.lang === l ? 'on' : ''}" data-act="lang" data-v="${l}">${l.toUpperCase()}</button>`).join('');
  const head = () => `<div class="row between"><img src="assets/logo-color.svg" alt="JKINnovations" style="height:58px;width:auto"/><div class="row" style="gap:6px">${langBtns()}</div></div>`;
  const opts = (arr, sel) => arr.map(o => `<option value="${esc(o.v)}" ${o.v === sel ? 'selected' : ''} ${o.dis ? 'disabled' : ''}>${esc(o.l)}</option>`).join('');
  const err = k => `<span class="err">${esc(S.errs[k] || '')}</span>`;

  function schoolCard() {
    const d = S.data, lg = d.school.logo;
    const mark = lg ? `<img src="${esc(lg)}" alt="${esc(d.school.name)}" style="height:84px;width:auto;max-width:110px;object-fit:contain"/>`
      : `<div style="width:56px;height:56px;border-radius:12px;background:var(--blue-tint);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px">${esc((d.school.name.match(/\b\w/g) || []).slice(0, 2).join('').toUpperCase())}</div>`;
    return `<div class="card row" style="gap:16px">${mark}<div style="flex:1;min-width:200px"><div class="eyebrow">${T('school')}</div><h2>${esc(d.school.name)}</h2>
      <div class="muted">${T('openFrom')}: <b>${fd(d.open)}</b> · ${T('openUntil')}: <b>${fd(d.close)}</b></div></div></div>
      ${d.state !== 'open' ? `<div class="card" style="border-color:#B3261E"><b class="err">${d.state === 'pending' ? T('pendingMsg') : T('closedMsg')}</b></div>` : ''}`;
  }
  const steps = () => `<div class="row" style="gap:8px">${[1, 2, 3, 4].map(n => `<div class="step ${S.step === n ? 'on' : S.step > n ? 'past' : ''}"><b>${n}</b> ${T('s' + n)}</div>`).join('')}</div>`;

  function step1() {
    const roles = S.data.mode === 'coord' ? [{ v: 'coord', l: T('roleCoord') }] : [{ v: 'teacher', l: T('roleTeacher') }, { v: 'rep', l: T('roleRep') }];
    return `<div class="card col"><h2>${T('s1')}</h2><div class="grid">
      <label>${T('name')}<input data-f="name" value="${esc(S.f.name)}" autocomplete="name"/>${err('name')}</label>
      <label>${T('role')}<select data-f="role" data-re>${opts([{ v: '', l: T('pick') }, ...roles], S.f.role)}</select>${err('role')}</label>
      <label>${T('contact')}<input data-f="contact" value="${esc(S.f.contact)}" autocomplete="email"/>${err('contact')}</label></div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-act="to2" ${S.data.state !== 'open' ? 'disabled' : ''}>${T('next')} →</button></div></div>`;
  }

  function catalog() {
    return [['school', 'catSchool'], ['staff', 'catStaff']].map(([k, l]) => {
      const ps = S.data.products.filter(p => p.category === k); if (!ps.length) return '';
      return `<div class="col"><h3>${T(l)}</h3><div class="cards">${ps.map(p => {
        const ok = orderable(p), codes = p.models.map(m => m.code).join(' / ');
        return `<div class="pcard"><div class="ph">${p.photo ? `<img src="${esc(p.photo)}" alt="${esc(loc(p.name))}" loading="lazy"/>` : `<span class="muted">${T('photoTbd')}</span>`}</div>
        <div class="bd"><b>${esc(loc(p.name))}</b><div class="muted">${esc(codes)}</div><div style="font-weight:700;color:var(--terracotta)">${range(p)}</div>
        ${ok ? '' : `<div class="warn">${T('sizesTbd')}</div>`}<div style="margin-top:auto;padding-top:6px"><button class="btn sec sm" data-act="choose" data-id="${p.id}" ${ok ? '' : 'disabled'}>${T('chooseOpts')}</button></div></div></div>`;
      }).join('')}</div></div>`;
    }).join('');
  }

  function panel(p) {
    const o = S.o, col = colorOf(p, o.color), mdl = p.models.find(m => m.id === o.model), ph = photoOf(p, col);
    const ind = p.personalization !== 'none';
    const sizes = needsAge(p) && o.age ? [...sizeList(p, o.age).map(z => ({ v: z, l: z })), ...(o.age === 'adult' ? (p.pending_sizes || []).map(z => ({ v: z, l: z + ' — ' + T('pendingSz'), dis: true })) : [])] : [];
    const u = o.size && o.age ? price(p, o.age, o.size) : null, q = ind ? 1 : Number(o.qty);
    return `<div id="panel" style="border:2px solid var(--deep-blue);border-radius:16px;padding:16px" class="col">
      <div class="row between"><div><div class="eyebrow">${T('chooseOpts')}</div><h3 style="font-size:20px">${esc(loc(p.name))}${mdl ? ' · ' + esc(loc(mdl.label)) : ''}</h3><div class="muted">${esc(mdl ? mdl.code : p.models.map(m => m.code).join(' / '))}</div></div><button class="lk" data-act="closePanel">${T('done')} ✕</button></div>
      <div class="row" style="align-items:flex-start;gap:18px">
      <div class="col" style="flex:1 1 220px;max-width:340px"><div style="border:1px solid var(--line);border-radius:12px;background:#fff;padding:8px;min-height:240px;display:flex;align-items:center;justify-content:center">
        ${ph ? `<img src="${esc(ph)}" alt="" data-act="zoom" data-src="${esc(ph)}" style="max-width:100%;max-height:300px;object-fit:contain;cursor:zoom-in"/>` : `<span class="muted">${T('photoTbd')}</span>`}</div>
        ${ph ? `<button class="lk" data-act="zoom" data-src="${esc(ph)}" style="text-align:left">${T('enlarge')}</button>` : ''}
        ${col && !col.photo && ph ? `<div class="muted">${T('refPhoto').replace('{c}', esc(loc(col)))}</div>` : ''}</div>
      <div class="col" style="flex:2 1 300px">
        ${p.models.length ? `<label>${T('model')}<select data-o="model" data-re>${opts([{ v: '', l: T('pick') }, ...p.models.map(m => ({ v: m.id, l: loc(m.label) + ' · ' + m.code }))], o.model)}</select>${err('model')}</label>` : ''}
        ${needsAge(p) ? `<label>${T('ageType')}<select data-o="age" data-re data-clr="size">${opts([{ v: '', l: T('pick') }, ...p.ages.map(a => ({ v: a, l: T(a === 'child' ? 'youth' : 'adultW') }))], o.age)}</select>${err('age')}</label>` : ''}
        <div><div style="font-size:13px;font-weight:600;margin-bottom:6px">${T('color')}: <span style="color:var(--terracotta)">${col ? esc(loc(col)) : '—'}</span></div>
          <div class="row">${p.colors.map(c => `<button class="chip ${o.color === c.id ? 'on' : ''}" data-act="color" data-id="${c.id}"><i style="background:${esc(c.sw || '#ccc')}"></i>${esc(loc(c))}</button>`).join('')}</div>${err('color')}
          ${col && col.flag ? `<div class="warn">${T('confirmColor')}</div>` : ''}</div>
        <label>${T('size')}<select data-o="size" data-re>${opts([{ v: '', l: T('pick') }, ...sizes], o.size)}</select>${err('size')}</label>
        <div class="grid"><label>${T('qty')}<input type="number" min="1" step="1" inputmode="numeric" data-o="qty" value="${ind ? 1 : esc(o.qty)}" ${ind ? 'disabled' : ''}/>${err('qty')}</label>
          ${ind ? `<label>${p.personalization === 'nameNumber' ? T('persNN') : T('persName')}<input data-o="text" value="${esc(o.text)}" maxlength="60"/>${err('text')}</label>` : ''}</div>
        <div style="background:var(--paper);border-radius:12px;padding:10px 14px"><div class="row between"><span>${T('unitPrice')}</span><b>${u == null ? (o.size ? T('priceTbd') : '—') : money(u)}</b></div>
          <div class="row between"><span>${T('subtotal')}</span><b>${u == null || !(q > 0) ? '—' : money(u * q)}</b></div><div class="muted">${T('priceRef')}</div></div>
        <div class="row"><button class="btn" data-act="addLine">+ ${T('addLine')}</button><button class="btn ghost" data-act="closePanel">${T('done')}</button></div>
        ${S.added ? `<div class="ok">${S.added}</div>` : ''}</div></div></div>`;
  }

  function groupedLines(review) {
    const by = {}; S.lines.forEach(l => (by[l.group] = by[l.group] || []).push(l));
    let sum = 0, unk = false;
    const html = Object.keys(by).map(gid => {
      const g = G(gid), tot = by[gid].reduce((a, l) => a + l.qty, 0);
      const rows = by[gid].map(l => {
        const p = P(l.prod), c = colorOf(p, l.color), m = p.models.find(x => x.id === l.model), u = price(p, l.age, l.size), ph = photoOf(p, c);
        if (u == null) unk = true; else sum += u * l.qty;
        const nm = `<td style="width:60px">${ph ? `<img class="thumb" src="${esc(ph)}" alt=""/>` : ''}</td><td><b>${esc(loc(p.name))}${m ? ' · ' + esc(m.code) : ''}</b><div class="muted">${m ? esc(loc(m.label)) + ' · ' : ''}${esc(loc(c))}${review ? '' : ' · ' + esc(szl(l))}</div>${l.text ? `<div style="font-weight:700">“${esc(l.text)}”</div>` : ''}</td>`;
        const act = `<td style="white-space:nowrap"><button class="lk" data-act="edit" data-id="${l.id}">${T('edit')}</button><button class="lk" data-act="del" data-id="${l.id}">${T('remove')}</button></td>`;
        return review ? `<tr>${nm}<td>${esc(szl(l))}</td><td class="num">${l.qty}</td><td class="num">${money(u)}</td><td class="num">${u == null ? '—' : money(u * l.qty)}</td>${act}</tr>` : `<tr>${nm}<td class="num">× ${l.qty}</td>${act}</tr>`;
      }).join('');
      const head = review ? `<thead><tr><th></th><th>${T('product')}</th><th>${T('size')}</th><th class="num">${T('qty')}</th><th class="num">${T('unitPrice')}</th><th class="num">${T('subtotal')}</th><th></th></tr></thead>` : '';
      return `<div style="border:1px solid var(--line);border-radius:12px;padding:12px" class="scroll"><div style="font-weight:700;color:var(--terracotta);margin-bottom:6px">${esc(g ? gl(g) : '?')} <span class="muted">· ${tot} ${T('pcs')}</span></div><table>${head}<tbody>${rows}</tbody></table></div>`;
    }).join('');
    return { html, sum: money(sum) + (unk ? ' + ' + T('priceTbd') : '') };
  }
  const count = () => S.lines.reduce((a, l) => a + l.qty, 0);

  function step2() {
    const p = S.o.prod ? P(S.o.prod) : null, locked = S.data.mode === 'each' && S.lines.length > 0;
    const gl2 = groupedLines(false);
    return `<div class="card col"><h2>${T('s2')}</h2>
      <div class="col" style="background:var(--blue-tint);border-radius:12px;padding:12px 14px"><label>${T('addingFor')}<select data-o="group" data-re ${locked ? 'disabled' : ''}>${opts([{ v: '', l: T('pick') }, ...S.data.groups.map(g => ({ v: g.id, l: gl(g) }))], S.o.group)}</select></label>${err('group')}${locked ? `<div class="muted">${T('lockNote')}</div>` : ''}</div>
      ${p ? panel(p) : catalog()}<hr style="border:0;border-top:1px solid var(--line);width:100%"/>
      <h3>${T('items')} (${count()})</h3>${S.lines.length ? gl2.html : `<div class="muted">${T('noItems')}</div>`}${err('lines')}
      <div class="row between"><button class="btn ghost" data-act="to1">← ${T('back')}</button><button class="btn" data-act="to3">${T('review')} →</button></div></div>`;
  }
  function step3() {
    const g = groupedLines(true), roleL = { coord: T('roleCoord'), teacher: T('roleTeacher'), rep: T('roleRep') }[S.f.role];
    return `<div class="card col"><h2>${T('review')}</h2>
      <div class="grid"><div><div class="muted">${T('name')}</div><b>${esc(S.f.name)}</b></div><div><div class="muted">${T('role')}</div><b>${roleL}</b></div><div><div class="muted">${T('contact')}</div><b>${esc(S.f.contact)}</b></div></div>
      ${g.html}<div class="row" style="gap:24px"><div style="font-weight:800;font-size:18px">${T('totalItems')}: ${count()}</div><div style="font-weight:700">${T('refTotal')}: ${g.sum}</div></div><div class="muted">${T('priceRef')}</div>
      <label style="flex-direction:row;align-items:center;gap:10px;font-weight:700"><input type="checkbox" data-ack ${S.ack ? 'checked' : ''}/> ${T('ack')}</label>${err('ack')}
      ${S.submitErr ? `<div class="err">${S.submitErr}</div>` : ''}
      <div class="row between"><button class="btn ghost" data-act="to2" ${S.sending ? 'disabled' : ''}>← ${T('back')}</button><button class="btn" data-act="submit" ${S.sending ? 'disabled' : ''}>${S.sending ? T('sending') : T('submit')}</button></div></div>`;
  }
  function step4() {
    return `<div class="card col" style="border-color:var(--deep-blue)"><div class="eyebrow">${T('doneTitle')}</div>
      <div style="font-size:34px;font-weight:800;color:var(--terracotta)">${esc(S.done.number)}</div><div class="muted">${T('doneNum')}</div>
      <p style="margin:0">${T('doneMsg')}</p>${S.done.duplicate ? `<div style="background:var(--blue-tint);padding:10px 14px;border-radius:10px;font-weight:600">${T('dupMsg')}</div>` : ''}
      <div class="row"><button class="btn" data-act="another">${T('another')}</button></div></div>`;
  }

  function render() {
    document.documentElement.lang = JK.lang;
    if (S.fatal) { root.innerHTML = `<div class="col" style="max-width:640px;margin:0 auto;padding:22px 16px">${head()}<div class="card"><b class="err">${esc(S.fatal)}</b></div></div>`; return; }
    if (!S.data) { root.innerHTML = `<div style="padding:40px;text-align:center" class="muted">…</div>`; return; }
    const body = [null, step1, step2, step3, step4][S.step]();
    root.innerHTML = `<div class="col" style="max-width:880px;margin:0 auto;padding:22px 16px 70px">${head()}${schoolCard()}${steps()}${body}</div>${S.zoom ? `<div class="zoom" data-act="unzoom"><img src="${esc(S.zoom)}" alt=""/></div>` : ''}`;
    if (window.parent !== window) parent.postMessage({ type: 'jk-height', h: document.documentElement.scrollHeight + 20 }, '*');
  }

  function validLine() {
    const o = S.o, e = {}, p = P(o.prod); if (!G(o.group)) e.group = T('eGroup'); if (!p) { e.prod = T('eProd'); return { e }; }
    if (p.models.length && !o.model) e.model = T('eModel'); if (needsAge(p) && !o.age) e.age = T('eAge');
    if (!colorOf(p, o.color)) e.color = T('eColor'); if (!o.size || !sizeList(p, o.age).includes(o.size)) e.size = T('eSize');
    const ind = p.personalization !== 'none', q = ind ? 1 : Number(o.qty);
    if (!Number.isInteger(q) || q < 1 || q > 999) e.qty = T('eQty'); if (ind && !o.text.trim()) e.text = T('ePers');
    return { e, q, ind };
  }
  const acts = {
    lang: el => { JK.setLang(el.dataset.v); render(); },
    to1: () => { S.step = 1; S.errs = {}; render(); },
    to2: () => {
      if (S.step === 1) { const e = {}; if (!S.f.name.trim()) e.name = T('eName'); if (!S.f.role) e.role = T('eRole'); if (!S.f.contact.trim()) e.contact = T('eContact'); if (Object.keys(e).length) { S.errs = e; return render(); } }
      S.step = 2; S.errs = {}; render();
    },
    to3: () => { if (!S.lines.length) { S.errs = { lines: T('eLines') }; return render(); } S.step = 3; S.errs = {}; S.ack = false; S.o = { ...blank(), group: S.o.group }; render(); },
    choose: el => { S.o = { ...blank(), group: S.o.group, prod: el.dataset.id }; S.errs = {}; S.added = ''; render(); const pn = document.getElementById('panel'); if (pn) window.scrollTo({ top: pn.getBoundingClientRect().top + window.scrollY - 12 }); },
    closePanel: () => { S.o = { ...blank(), group: S.o.group }; S.errs = {}; S.added = ''; render(); },
    color: el => { S.o.color = el.dataset.id; render(); },
    addLine: () => {
      const { e, q, ind } = validLine(); if (Object.keys(e).length) { S.errs = e; S.added = ''; return render(); }
      const o = S.o; S.lines.push({ id: uuid(), group: o.group, prod: o.prod, model: o.model, age: o.age, color: o.color, size: o.size, qty: q, text: ind ? o.text.trim() : '' });
      S.o = { ...o, size: '', qty: '1', text: '' }; S.errs = {}; S.added = T('added'); render();
    },
    edit: el => { const l = S.lines.find(x => x.id === el.dataset.id); if (!l) return; S.lines = S.lines.filter(x => x !== l); S.o = { group: l.group, prod: l.prod, model: l.model, age: l.age, color: l.color, size: l.size, qty: String(l.qty), text: l.text }; S.step = 2; S.added = ''; render(); },
    del: el => { S.lines = S.lines.filter(x => x.id !== el.dataset.id); render(); },
    zoom: el => { S.zoom = el.dataset.src; render(); }, unzoom: () => { S.zoom = ''; render(); },
    another: () => { S.lines = []; S.done = null; S.reqKey = uuid(); S.step = 1; S.ack = false; S.o = blank(); S.errs = {}; render(); },
    submit: async () => {
      if (S.sending) return;
      if (!S.ack) { S.errs = { ack: T('eAck') }; return render(); }
      S.sending = true; S.submitErr = ''; render();
      const { data, error } = await JK.sb().rpc('public_submit_order', {
        p_slug: slug, p_request_key: S.reqKey, p_name: S.f.name.trim(), p_role: S.f.role, p_contact: S.f.contact.trim(),
        p_lines: S.lines.map(l => ({ group_id: l.group, product_id: l.prod, model_id: l.model, color_id: l.color, age: l.age, size: l.size, qty: l.qty, personalization: l.text }))
      });
      S.sending = false;
      if (error) { S.submitErr = /period_closed/.test(error.message) ? T('eClosed') : T('eServer'); return render(); }
      S.done = data; S.step = 4; render();
    }
  };
  root.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && acts[el.dataset.act]) acts[el.dataset.act](el); });
  const setVal = (t, rerender) => {
    if (t.dataset.f) S.f[t.dataset.f] = t.value;
    else if (t.dataset.o) { S.o[t.dataset.o] = t.value; if (t.dataset.clr) S.o[t.dataset.clr] = ''; }
    else if ('ack' in t.dataset) S.ack = t.checked; else return;
    if (rerender || t.dataset.re !== undefined) render();
  };
  root.addEventListener('input', e => { if (e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') setVal(e.target, false); });
  root.addEventListener('change', e => setVal(e.target, false));
  render(); load();
})();
