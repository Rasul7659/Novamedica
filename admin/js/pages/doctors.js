import { esc, api, toast, head, ICON, ApiError } from '../core.js';

export const title = 'Врачи';

export function mount(root, ctx) {
  const st = { filter: 'all', sel: null, isNew: false, tried: false, errs: {}, draft: null, saving: false, uploading: false };
  const docs = () => ctx.state.draft.doctors;
  const media = (id) => ctx.state.draft.media.find((m) => m.id === id);
  const SP = () => ctx.state.schema.specs;
  const KEYS = ['name', 'spec', 'exp', 'bio', 'photoId', 'visible'];
  const cur = () => docs().find((d) => d.id === st.sel);
  const dirty = () => {
    if (st.sel === null) return false;
    if (st.isNew) return !!(st.draft.name || st.draft.exp || st.draft.bio || st.draft.photoId);
    const c = cur();
    return !!c && KEYS.some((k) => c[k] !== st.draft[k]);
  };
  const fresh = () => ({ name: '', spec: 'derm', exp: '', bio: '', photoId: null, visible: true });
  function open(id) { const d = docs().find((x) => x.id === id); st.sel = id; st.isNew = false; st.tried = false; st.errs = {}; st.draft = { ...d }; }
  const startNew = () => { st.sel = '__new'; st.isNew = true; st.tried = false; st.errs = {}; st.draft = fresh(); };

  function photoBox(photoId, cls = '') {
    const m = photoId && media(photoId);
    return m ? `<div class="photo ${cls}"><img src="${esc(m.url)}" alt=""></div>` : '';
  }

  function cardsHtml() {
    const list = docs().filter((d) => st.filter === 'all' || d.spec === st.filter);
    return list.map((d) => {
      const on = st.sel === d.id && !st.isNew;
      const m = d.photoId && media(d.photoId);
      const state = !d.visible ? ['Скрыт', 'st-off'] : !m ? ['Нужно фото', 'st-warn'] : ['На сайте', 'st-ok'];
      return `<article class="dcard ${on ? 'on' : ''} ${d.visible ? '' : 'off'}">
<div class="photo">${m ? `<img src="${esc(m.url)}" alt="">` : 'Нет фото. Без фото карточка выглядит пустой'}</div>
<div class="meta"><small>${esc(SP()[d.spec])}</small><b>${esc(d.name || '[Без имени]')}</b></div>
<div class="foot"><span class="${state[1]}">${state[0]}</span><button type="button" class="btn btn--sm ${on ? 'btn--dark' : 'btn--line'}" style="min-height:36px;padding:0 14px;font-size:13px" data-act="pick" data-id="${d.id}">${on ? 'Изменяете' : 'Изменить'}</button></div></article>`;
    }).join('') + `<button type="button" class="add-card" data-act="new"><i>${ICON.plus}</i><span style="font-weight:600">Добавить врача</span></button>`;
  }

  function panelHtml() {
    if (st.sel === null) return `<aside class="card card--empty side-card"><b>Выберите врача слева</b><span>Нажмите «Изменить» на карточке или «Добавить врача».</span></aside>`;
    const d = st.draft;
    const e = st.tried ? { ...(d.name.trim() ? {} : { name: 'Напишите ФИО — оно подписывает карточку' }), ...st.errs } : st.errs;
    const m = d.photoId && media(d.photoId);
    return `<aside class="card side-card">
<div class="panel-head"><h2>${st.isNew ? 'Новый врач' : 'Изменить врача'}</h2><button type="button" class="iconbtn" aria-label="Закрыть" data-act="close">${ICON.close}</button></div>
<div class="photo-edit"><div class="photo">${m ? `<img src="${esc(m.url)}" alt="">` : 'Нет фото'}</div>
<div><button type="button" class="btn btn--dark btn--sm" style="min-height:44px" data-act="photo" ${st.uploading ? 'disabled' : ''}>${st.uploading ? 'Загружаем…' : m ? 'Заменить фото' : 'Загрузить фото'}</button>
${m ? '<button type="button" class="linkbtn" style="margin:0" data-act="rmphoto">Убрать фото</button>' : ''}
<p class="note" style="line-height:1.4">Лицо по центру, халат, светлый фон. Подойдёт любое фото от 800 пикселей: мы сами обрежем под рамку.</p>
${e.photo ? `<p class="hint"><span class="err">${esc(e.photo)}</span></p>` : ''}</div></div>
<input type="file" id="a3-file" accept="image/jpeg,image/png,image/webp" hidden>
<div class="field"><label for="a3-name">ФИО</label><input class="inp" id="a3-name" data-f="name" placeholder="Фамилия Имя Отчество" maxlength="100" value="${esc(d.name)}" ${e.name ? 'aria-invalid="true"' : ''}><div class="hint"><span class="err">${esc(e.name || '')}</span></div></div>
<div class="field"><label for="a3-spec">Специальность</label><select class="sel" id="a3-spec" data-f="spec">${Object.entries(SP()).map(([k, v]) => `<option value="${k}" ${d.spec === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
<span class="note">По специальности работают фильтры на сайте.</span></div>
<div class="field"><label for="a3-exp">Стаж, лет</label><input class="inp" id="a3-exp" data-f="exp" inputmode="numeric" maxlength="2" style="width:140px" value="${esc(d.exp)}"></div>
<div class="field"><label for="a3-bio">Образование и сертификаты <span class="opt">(по желанию)</span></label><textarea class="ta" id="a3-bio" data-f="bio" rows="3" maxlength="500" placeholder="Например: ПМГМУ им. Сеченова, 2012. Сертификат дерматовенеролога.">${esc(d.bio)}</textarea></div>
<div class="toggle-row"><span><b>Показывать на сайте</b><small>Можно скрыть на время отпуска</small></span>
<button type="button" class="switch" role="switch" aria-checked="${d.visible}" aria-label="Показывать на сайте" data-act="vis"></button></div>
<div class="foot-actions"><button type="button" class="btn btn--olive ${dirty() ? '' : 'is-saved'}" style="min-height:52px;font-size:16px" data-act="save" ${st.saving ? 'disabled' : ''}>${dirty() ? 'Сохранить' : 'Сохранено'}</button>
<button type="button" class="btn btn--line" style="min-height:52px" data-act="cancel">Отмена</button></div>
<p class="note">«Сохранить» не меняет сайт сразу. Изменения появятся там после кнопки «Опубликовать».</p></aside>`;
  }

  function render() {
    const s = ctx.state;
    const n = (k) => k === 'all' ? docs().length : docs().filter((d) => d.spec === k).length;
    const tab = (k, label) => `<button type="button" class="tab" role="tab" aria-selected="${st.filter === k}" data-act="filter" data-k="${k}">${label} · ${n(k)}</button>`;
    root.innerHTML = `${head('Врачи', 'Карточки врачей в блоке «Врачи» на сайте.', s)}
<div class="cols"><section class="grow" style="flex:1.2 1 480px">
<div class="tabs" role="tablist" aria-label="Специальность">${tab('all', 'Все')}${tab('derm', 'Дерматологи')}${tab('cosm', 'Косметологи')}</div>
<div class="cards" id="cards">${cardsHtml()}</div>
<div class="note">На сайте показано врачей: ${docs().filter((d) => d.visible).length} из ${docs().length}. Фильтры на сайте работают по специальности.</div></section>
<div id="panel" class="side-card" style="flex:1 1 420px;max-width:520px;min-width:0">${panelHtml()}</div></div>`;
  }
  const renderPanel = () => { root.querySelector('#panel').innerHTML = panelHtml(); };

  async function save() {
    if (!dirty() || st.saving) return;
    st.errs = {};
    if (!st.draft.name.trim()) { st.tried = true; renderPanel(); toast('Напишите ФИО врача', { err: true }); return; }
    st.saving = true;
    try {
      const body = { ...st.draft };
      const out = st.isNew ? await api('POST', '/doctors', body) : await api('PUT', '/doctors/' + st.sel, body);
      ctx.setState(out.state);
      const hadPhoto = !!st.draft.photoId;
      if (st.isNew) { open(out.id); toast(hadPhoto ? 'Врач добавлен. На сайте появится после публикации' : 'Врач добавлен, но без фото. Лучше загрузить фото'); }
      else { open(st.sel); toast('Сохранено. Сайт изменится после публикации'); }
    } catch (err) {
      if (err instanceof ApiError && err.data.errors) { st.errs = err.data.errors; st.tried = true; }
      toast(err.message, { err: true });
    }
    st.saving = false;
    render();
  }

  async function uploadPhoto(file) {
    if (!file) return;
    st.uploading = true; renderPanel();
    try {
      const form = new FormData();
      form.append('kind', 'doctor');
      form.append('file', file);
      const out = await api('POST', '/media', undefined, form);
      ctx.setState(out.state);
      st.draft.photoId = out.id;
      toast('Фото добавлено. Не забудьте нажать «Сохранить»');
    } catch (err) { toast(err.message, { err: true }); }
    st.uploading = false;
    renderPanel();
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const warn = dirty();
    if (act === 'filter') { st.filter = b.dataset.k; render(); }
    else if (act === 'pick') { open(b.dataset.id); render(); if (warn) toast('Несохранённые правки отменены'); }
    else if (act === 'new') { startNew(); render(); root.querySelector('#a3-name').focus(); }
    else if (act === 'close') { st.sel = null; st.isNew = false; render(); if (warn) toast('Несохранённые правки отменены'); }
    else if (act === 'cancel') { if (st.isNew) { st.sel = null; st.isNew = false; } else if (cur()) open(st.sel); st.errs = {}; st.tried = false; render(); }
    else if (act === 'save') save();
    else if (act === 'photo') root.querySelector('#a3-file').click();
    else if (act === 'rmphoto') { st.draft.photoId = null; renderPanel(); }
    else if (act === 'vis') { st.draft.visible = !st.draft.visible; renderPanel(); }
  });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'a3-file') { uploadPhoto(e.target.files[0]); e.target.value = ''; }
    else if (e.target.dataset.f === 'spec') { st.draft.spec = e.target.value; refreshSave(); }
  });
  function refreshSave() {
    const b = root.querySelector('[data-act="save"]');
    if (!b) return;
    b.textContent = dirty() ? 'Сохранить' : 'Сохранено';
    b.classList.toggle('is-saved', !dirty());
  }
  root.addEventListener('input', (e) => {
    const f = e.target.dataset.f;
    if (!f || f === 'spec') return;
    st.draft[f] = f === 'exp' ? e.target.value.replace(/\D/g, '') : e.target.value;
    if (f === 'exp') e.target.value = st.draft.exp;
    delete st.errs[f];
    refreshSave();
  });

  render();
  if (ctx.query().get('new')) { startNew(); render(); }
  return { dirty };
}
