import { esc, api, toast, head, fmtAgo, fmtDateTime, telHref, digits, isMobile, ICON, refreshChrome } from '../core.js';

export const title = 'Заявки';

const LABEL = { new: 'Новая', wait: 'Ждём ответа', booked: 'Записан(а)', refused: 'Отказ' };

export function mount(root, ctx) {
  const st = { tab: 'new', sel: null, items: [], loading: true, telegram: ctx.state.telegram, mobile: isMobile() };
  let noteTimer;
  const inTab = (it, t) => t === 'all' || it.status === t;
  const list = () => st.items.filter((it) => inTab(it, st.tab));
  const count = (k) => st.items.filter((it) => it.status === k).length;
  const cur = () => st.items.find((it) => it.id === st.sel);
  const chip = (s) => `<span class="chip chip--${s}">${LABEL[s]}</span>`;
  const syncBadge = (n) => { ctx.state.newRequests = n; refreshChrome(ctx.state); };

  function desktopList() {
    const l = list();
    if (!l.length) return `<div class="card card--empty"><b>Здесь пока пусто</b><span>Новые заявки появятся сами${st.telegram ? ' и придут вам в Telegram' : ''}.</span></div>`;
    return l.map((r) => `<button type="button" class="rq ${r.id === st.sel ? 'on' : ''}" data-act="pick" data-id="${r.id}">
<span class="top"><b>${esc(r.name)}</b><small>${esc(fmtAgo(r.createdAt))}</small></span><span class="svc">${esc(r.service)}</span>
<span class="bot">${chip(r.status)}<span>${esc(r.phone)}</span></span></button>`).join('');
  }

  function detail() {
    const r = cur();
    if (!r || !inTab(r, st.tab)) return '';
    const wa = digits(telHref(r.phone));
    return `<aside class="card side-card" style="flex:1.2 1 440px;gap:22px">
<div style="display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px"><div><h2 style="font-size:24px;letter-spacing:-0.02em">${esc(r.name)}</h2>
<div class="note" style="font-size:14px;margin-top:2px">Оставил(а) заявку: ${esc(fmtAgo(r.createdAt))}</div></div>${chip(r.status)}</div>
<div style="display:flex;flex-wrap:wrap;gap:10px"><a class="callbtn" href="tel:${esc(telHref(r.phone) || r.phone)}">${ICON.phone}${esc(r.phone)}</a>
${wa ? `<a class="btn btn--line" style="flex:0 1 180px;min-height:60px;font-size:16px" href="https://wa.me/${wa}" target="_blank" rel="noopener">Написать в WhatsApp</a>` : ''}</div>
<div class="dl"><div><span class="k">Что выбрал(а)</span><span>${esc(r.service)}</span></div>
<div><span class="k">Согласие на обработку данных</span><span style="color:var(--ok)">Получено ${esc(fmtDateTime(r.consentAt || r.createdAt))}</span></div></div>
<div class="field"><span class="lbl" style="font-size:14px;font-weight:500">Что с этой заявкой?</span>
<div class="statuses">${[['new', 'Новая'], ['wait', 'Позвонили, ждём ответа'], ['booked', 'Записали на приём'], ['refused', 'Отказ']].map(([k, l]) => `<button type="button" aria-pressed="${r.status === k}" data-act="status" data-s="${k}">${l}</button>`).join('')}</div></div>
<div class="field"><label for="a6-note">Заметка для себя</label><textarea class="ta" id="a6-note" rows="3" maxlength="500" placeholder="Например: просила перезвонить после 18:00">${esc(r.note)}</textarea>
<span class="note" id="note-state">Клиент эту заметку не видит. Сохраняется сама.</span></div></aside>`;
  }

  function mobileCards() {
    const l = list();
    if (!l.length) return '<div class="card card--empty"><b>Здесь пока пусто</b><span>Новые заявки придут сами' + (st.telegram ? ' и появятся в Telegram' : '') + '.</span></div>';
    const next = { new: ['wait', 'Позвонили'], wait: ['booked', 'Записали'], booked: ['wait', 'Вернуть в ожидание'], refused: ['new', 'Вернуть в новые'] };
    return l.map((r, i) => {
      const wa = digits(telHref(r.phone));
      return `<article class="rq-m ${st.tab === 'new' && i === 0 ? 'first' : ''}">
<div class="top"><div><b>${esc(r.name)}</b><span class="svc">${esc(r.service)}</span></div><small>${esc(fmtAgo(r.createdAt))}</small></div>
<a class="call" href="tel:${esc(telHref(r.phone) || r.phone)}">${ICON.phone}Позвонить</a>
<div class="btns">${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<button type="button" data-act="advance" data-id="${r.id}" data-to="${next[r.status][0]}">${next[r.status][1]}</button></div></article>`;
    }).join('');
  }

  function render() {
    const s = ctx.state;
    const tab = (k, label, badge) => `<button type="button" class="tab" role="tab" aria-selected="${st.tab === k}" data-act="tab" data-k="${k}">${label}${badge ? `<span class="badge">${count(k)}</span>` : ` · ${k === 'all' ? st.items.length : count(k)}`}</button>`;
    const tg = st.telegram
      ? '<div class="tg"><i></i>Новые заявки приходят в Telegram</div>'
      : '<div class="tg tg--off"><i></i>Telegram не подключён: заявки видны только здесь</div>';
    root.innerHTML = `${head('Заявки', 'Люди, которые оставили телефон на сайте.', s, { publish: false, extra: st.mobile ? '' : tg })}
<div class="tabs" role="tablist" style="${st.mobile ? 'flex-wrap:nowrap;overflow-x:auto' : ''}">${tab('new', 'Новые', true)}${tab('wait', 'Ждём ответа')}${tab('booked', 'Записаны')}${st.mobile ? '' : tab('all', 'Все')}</div>
${st.loading ? '<p class="note">Загружаем заявки…</p>' : st.mobile
    ? `<section class="list-col" id="mlist">${mobileCards()}</section>`
    : `<div class="cols"><section class="grow list-col" style="flex:1 1 400px" id="dlist">${desktopList()}<div class="note" style="padding:12px 4px 0">Заявки старше 90 дней уходят в архив автоматически.</div></section>
<div id="detail" style="flex:1.2 1 440px;min-width:0;display:contents">${detail()}</div></div>`}`;
  }

  async function load() {
    try {
      const out = await api('GET', '/requests');
      st.items = out.items; st.telegram = out.telegram; st.loading = false;
      const first = list()[0];
      if (!cur() || !inTab(cur(), st.tab)) st.sel = first ? first.id : null;
      syncBadge(count('new'));
    } catch (err) { st.loading = false; toast(err.message, { err: true }); }
    render();
  }

  async function setStatus(id, status, msgIfMoved) {
    const it = st.items.find((x) => x.id === id);
    if (!it || it.status === status) return;
    try {
      const out = await api('PUT', '/requests/' + id, { status });
      it.status = out.item.status; syncBadge(out.newRequests);
      const stay = inTab(it, st.tab);
      if (!stay) { const nx = list()[0]; st.sel = nx ? nx.id : null; }
      toast(msgIfMoved || (stay ? 'Статус изменён' : `Заявка перенесена: «${{ wait: 'Ждём ответа', booked: 'Записаны', new: 'Новые', refused: 'Отказ' }[status]}»`));
      render();
    } catch (err) { toast(err.message, { err: true }); }
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'tab') { st.tab = b.dataset.k; const f = list()[0]; st.sel = f ? f.id : null; render(); }
    else if (a === 'pick') { st.sel = b.dataset.id; render(); }
    else if (a === 'status') setStatus(st.sel, b.dataset.s);
    else if (a === 'advance') setStatus(b.dataset.id, b.dataset.to, b.dataset.to === 'booked' ? 'Отлично, клиент записан' : 'Готово. Заявка перенесена');
  });
  root.addEventListener('input', (e) => {
    if (e.target.id !== 'a6-note') return;
    const r = cur(); if (!r) return;
    r.note = e.target.value;
    const stateEl = root.querySelector('#note-state');
    stateEl.textContent = 'Сохраняем…';
    clearTimeout(noteTimer);
    const id = r.id, note = r.note;
    noteTimer = setTimeout(async () => {
      try { await api('PUT', '/requests/' + id, { note }); if (stateEl.isConnected) stateEl.textContent = 'Сохранено'; }
      catch (err) { toast(err.message, { err: true }); if (stateEl.isConnected) stateEl.textContent = 'Не удалось сохранить заметку'; }
    }, 600);
  });
  const mq = window.matchMedia('(max-width:900px)');
  const onMq = () => { st.mobile = mq.matches; render(); };
  mq.addEventListener('change', onMq);

  render(); load();
  return { destroy() { mq.removeEventListener('change', onMq); clearTimeout(noteTimer); } };
}
