import { esc, api, toast, head, money, fieldHint, ICON, ApiError } from '../core.js';

export const title = 'Услуги и цены';

export function mount(root, ctx) {
  const MAX_T = 50, MAX_D = 60;
  const st = { q: '', sel: null, isNew: false, tried: false, errs: {}, draft: { title: '', desc: '', price: '' }, saving: false };
  const items = () => ctx.state.draft.services;
  const cur = () => items().find((i) => i.id === st.sel);
  const dirty = () => {
    if (st.sel === null) return false;
    if (st.isNew) return !!(st.draft.title || st.draft.desc || st.draft.price);
    const c = cur();
    return !!c && (c.title !== st.draft.title || c.desc !== st.draft.desc || c.price !== st.draft.price);
  };
  const fmt = (p) => String(p || '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const clientErrs = () => {
    const e = {};
    if (!st.draft.title.trim()) e.title = 'Напишите название — оно покажется на карточке';
    if (!st.draft.price) e.price = 'Укажите цену цифрами. Например: 3500';
    return e;
  };

  function open(id) {
    const it = items().find((i) => i.id === id);
    st.sel = id; st.isNew = false; st.tried = false; st.errs = {};
    st.draft = { title: it.title, desc: it.desc, price: it.price };
  }
  const startNew = () => { st.sel = '__new'; st.isNew = true; st.tried = false; st.errs = {}; st.draft = { title: '', desc: '', price: '' }; };

  function listHtml() {
    const q = st.q.trim().toLowerCase();
    const rows = items().filter((i) => !q || (i.title + ' ' + i.desc).toLowerCase().includes(q));
    if (!rows.length) return '<div class="card--empty" style="display:flex;flex-direction:column;gap:6px;padding:40px 24px;text-align:center"><b style="font-size:18px">Ничего не нашли</b><span class="note" style="font-size:14px">Попробуйте другое слово или добавьте новую услугу.</span></div>';
    return rows.map((i) => {
      const on = st.sel === i.id && !st.isNew;
      return `<div class="item ${on ? 'on' : ''} ${i.visible ? '' : 'off'}">
<div class="grow"><div class="t">${esc(i.title)}</div><div class="s">${i.visible ? esc(i.desc) : 'Скрыта: не видна на сайте'}</div></div>
<span class="price">${esc(money(i.price))}</span>
<button type="button" class="sw" role="switch" aria-checked="${i.visible}" aria-label="Показывать на сайте: ${esc(i.title)}" data-act="toggle" data-id="${i.id}"><span class="track"></span>${i.visible ? 'На сайте' : 'Скрыта'}</button>
<button type="button" class="btn btn--sm ${on ? 'btn--dark' : 'btn--line'}" data-act="pick" data-id="${i.id}">${on ? 'Изменяете' : 'Изменить'}</button></div>`;
    }).join('');
  }

  function panelHtml() {
    if (st.sel === null) return `<aside class="card card--empty side-card"><b>Выберите услугу слева</b><span>Нажмите «Изменить» у нужной строки или «Добавить услугу».</span></aside>`;
    const d = st.draft;
    const e = st.tried ? { ...clientErrs(), ...st.errs } : st.errs;
    const c = cur();
    const prices = d.price ? 'от ' + fmt(d.price) + ' ₽' : 'Цена не указана';
    return `<aside class="card side-card" aria-label="${st.isNew ? 'Новая услуга' : 'Изменить услугу'}">
<div class="panel-head"><h2>${st.isNew ? 'Новая услуга' : 'Изменить услугу'}</h2><button type="button" class="iconbtn" aria-label="Закрыть" data-act="close">${ICON.close}</button></div>
<div class="field"><label for="a2-title">Название</label>
<input class="inp" id="a2-title" data-f="title" maxlength="${MAX_T}" value="${esc(d.title)}" ${e.title ? 'aria-invalid="true"' : ''}>
<div class="hint"><span class="${e.title ? 'err' : ''}" data-hint="title">${esc(e.title || 'Коротко, как на вывеске')}</span><span data-count="title">${d.title.length} из ${MAX_T}</span></div></div>
<div class="field"><label for="a2-desc">Короткое описание</label>
<input class="inp" id="a2-desc" data-f="desc" maxlength="${MAX_D}" value="${esc(d.desc)}">
<div class="hint"><span>Одна строка под названием</span><span data-count="desc">${d.desc.length} из ${MAX_D}</span></div></div>
<div class="field"><label for="a2-price">Цена, ₽</label>
<div class="price-row"><span>от</span><input class="inp" id="a2-price" data-f="price" inputmode="numeric" maxlength="7" value="${esc(d.price)}" ${e.price ? 'aria-invalid="true"' : ''}><span>₽</span></div>
<div class="hint"><span class="${e.price ? 'err' : ''}" data-hint="price">${esc(e.price || 'Только цифры. «от» и «₽» добавим сами.')}</span></div></div>
<div class="field"><span class="lbl">Как будет выглядеть на сайте</span>
<div class="preview-card"><div><div class="t" data-pv="title">${esc(d.title || 'Название услуги')}</div><div class="d" data-pv="desc">${esc(d.desc || 'Короткое описание')}</div></div>
<div class="f"><span data-pv="price">${esc(prices)}</span><i>→</i></div></div></div>
<div class="foot-actions"><button type="button" class="btn btn--olive btn--lg ${dirty() ? '' : 'is-saved'}" style="font-size:16px;min-height:52px" data-act="save" ${st.saving ? 'disabled' : ''}>${dirty() ? 'Сохранить' : 'Сохранено'}</button>
<button type="button" class="btn btn--line" style="min-height:52px" data-act="cancel">Отмена</button></div>
<p class="note">«Сохранить» не меняет сайт сразу. Изменения появятся там после кнопки «Опубликовать».</p>
${c && !st.isNew ? `<div class="sep"><button type="button" class="linkbtn" style="margin:0;font-size:15px" data-act="hide">${c.visible ? 'Скрыть с сайта' : 'Вернуть на сайт'}</button>
<span class="note">Услуга останется здесь, и её можно вернуть в любой момент. Удалять не нужно.</span></div>` : ''}
</aside>`;
  }

  function render() {
    const s = ctx.state;
    const shown = s.draft.services.filter((i) => i.visible).length;
    root.innerHTML = `${head('Услуги и цены', 'Так они выглядят на сайте в блоке «Услуги».', s)}
<div class="cols"><section class="grow" style="flex:1.5 1 560px">
<div class="tools"><label class="sr" for="a2-search">Поиск по услугам</label>
<input class="inp" id="a2-search" type="search" placeholder="Найти услугу" value="${esc(st.q)}">
<button type="button" class="btn btn--dark" data-act="new">${ICON.plus}Добавить услугу</button></div>
<div class="list" id="list">${listHtml()}</div>
<div class="note" id="counts">Показано услуг на сайте: ${shown} из ${s.draft.services.length}. Порядок на сайте — как в этом списке.</div></section>
<div id="panel" class="side-card" style="flex:1 1 380px;max-width:460px;min-width:0">${panelHtml()}</div></div>`;
  }
  const renderPanel = () => { root.querySelector('#panel').innerHTML = panelHtml(); };
  const renderList = () => {
    root.querySelector('#list').innerHTML = listHtml();
    const s = ctx.state;
    root.querySelector('#counts').textContent = `Показано услуг на сайте: ${s.draft.services.filter((i) => i.visible).length} из ${s.draft.services.length}. Порядок на сайте — как в этом списке.`;
  };

  function updateLive() {
    const d = st.draft;
    const set = (k, v) => { const el = root.querySelector(`[data-pv="${k}"]`); if (el) el.textContent = v; };
    set('title', d.title || 'Название услуги'); set('desc', d.desc || 'Короткое описание');
    set('price', d.price ? 'от ' + fmt(d.price) + ' ₽' : 'Цена не указана');
    root.querySelector('[data-count="title"]').textContent = d.title.length + ' из ' + MAX_T;
    root.querySelector('[data-count="desc"]').textContent = d.desc.length + ' из ' + MAX_D;
    const b = root.querySelector('[data-act="save"]');
    b.textContent = dirty() ? 'Сохранить' : 'Сохранено';
    b.classList.toggle('is-saved', !dirty());
  }

  async function save() {
    if (!dirty() || st.saving) return;
    st.errs = {};
    const ce = clientErrs();
    if (Object.keys(ce).length) { st.tried = true; renderPanel(); toast('Проверьте поля, отмеченные красным', { err: true }); return; }
    st.saving = true;
    try {
      const body = { title: st.draft.title, desc: st.draft.desc, price: st.draft.price };
      const out = st.isNew ? await api('POST', '/services', body) : await api('PUT', '/services/' + st.sel, body);
      ctx.setState(out.state);
      if (st.isNew) { open(out.id); toast('Услуга добавлена в конец списка. На сайте появится после публикации'); }
      else { open(st.sel); toast('Сохранено. Сайт изменится после публикации'); }
    } catch (err) {
      if (err instanceof ApiError && err.data.errors) { st.errs = err.data.errors; st.tried = true; }
      toast(err.message, { err: true });
    }
    st.saving = false;
    render();
  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const warn = dirty();
    if (act === 'pick') { open(b.dataset.id); render(); if (warn) toast('Несохранённые правки отменены'); }
    else if (act === 'new') { startNew(); render(); root.querySelector('#a2-title').focus(); }
    else if (act === 'close') { st.sel = null; st.isNew = false; st.errs = {}; render(); if (warn) toast('Несохранённые правки отменены'); }
    else if (act === 'cancel') {
      if (st.isNew) { st.sel = null; st.isNew = false; } else if (cur()) open(st.sel);
      st.errs = {}; st.tried = false; render();
    }
    else if (act === 'save') save();
    else if (act === 'toggle' || act === 'hide') {
      const id = act === 'toggle' ? b.dataset.id : st.sel;
      const it = items().find((i) => i.id === id);
      if (!it) return;
      try {
        const out = await api('PATCH', `/services/${id}/visible`, { visible: !it.visible });
        ctx.setState(out.state);
        toast(it.visible ? `«${it.title}» скрыта. Удалять не пришлось — вернуть можно в один клик` : `«${it.title}» снова на сайте (после публикации)`);
        render();
      } catch (err) { toast(err.message, { err: true }); }
    }
  });
  root.addEventListener('input', (e) => {
    if (e.target.id === 'a2-search') { st.q = e.target.value; renderList(); return; }
    const f = e.target.dataset.f;
    if (!f) return;
    st.draft[f] = f === 'price' ? e.target.value.replace(/\D/g, '') : e.target.value;
    if (f === 'price' && e.target.value !== st.draft.price) e.target.value = st.draft.price;
    if (st.errs[f]) { delete st.errs[f]; }
    updateLive();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.f) { e.preventDefault(); save(); }
  });

  render();
  if (ctx.query().get('new')) { startNew(); render(); }
  return { dirty };
}
