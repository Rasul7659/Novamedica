import { esc, api, toast, head, ICON, ApiError } from '../core.js';

export const title = 'Врачи';

export function mount(root, ctx) {
  const st = { mode: 'doctor', spEdit: {}, spErr: {}, newSpec: '', spBusy: false, filter: 'all', sel: null, isNew: false, tried: false, errs: {}, draft: null, saving: false, uploading: false };
  const docs = () => ctx.state.draft.doctors;
  const media = (id) => ctx.state.draft.media.find((m) => m.id === id);
  const specs = () => ctx.state.draft.specialties;
  const specName = (id) => (specs().find((x) => x.id === id) || {}).name || '';
  const specUsed = (id) => docs().filter((d) => d.spec === id).length;
  const KEYS = ['name', 'spec', 'exp', 'bio', 'photoId', 'visible'];
  const cur = () => docs().find((d) => d.id === st.sel);
  const dirty = () => {
    if (st.sel === null) return false;
    if (st.isNew) return !!(st.draft.name || st.draft.exp || st.draft.bio || st.draft.photoId);
    const c = cur();
    return !!c && KEYS.some((k) => c[k] !== st.draft[k]);
  };
  const fresh = () => ({ name: '', spec: (specs()[0] || {}).id || '', exp: '', bio: '', photoId: null, visible: true });
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
<div class="meta"><small>${esc(specName(d.spec))}</small><b>${esc(d.name || '[Без имени]')}</b></div>
<div class="foot"><span class="${state[1]}">${state[0]}</span><button type="button" class="btn btn--sm ${on ? 'btn--dark' : 'btn--line'}" style="min-height:36px;padding:0 14px;font-size:13px" data-act="pick" data-id="${d.id}">${on ? 'Изменяете' : 'Изменить'}</button></div></article>`;
    }).join('') + `<button type="button" class="add-card" data-act="new"><i>${ICON.plus}</i><span style="font-weight:600">Добавить врача</span></button>`;
  }

  function specsPanelHtml() {
    const rows = specs().map((sp) => {
      const val = st.spEdit[sp.id] ?? sp.name;
      const used = specUsed(sp.id);
      const err = st.spErr[sp.id];
      const changed = val.trim() !== sp.name;
      return `<div class="sp-row"><input class="inp" data-sp="${esc(sp.id)}" maxlength="40" value="${esc(val)}" aria-label="Название специальности" ${err ? 'aria-invalid="true"' : ''}>
<span class="cnt">${used ? 'врачей: ' + used : 'нет врачей: на сайте не видна'}</span>
<button type="button" class="btn btn--sm ${changed ? 'btn--olive' : 'btn--line'}" data-act="sp-save" data-id="${esc(sp.id)}" ${changed ? '' : 'disabled'}>Сохранить</button>
<button type="button" class="btn btn--line btn--sm" data-act="sp-del" data-id="${esc(sp.id)}" ${used ? 'disabled title="Сначала переведите врачей на другую специальность"' : ''}>Удалить</button>
${err ? `<div class="hint" style="flex-basis:100%"><span class="err">${esc(err)}</span></div>` : ''}</div>`;
    }).join('');
    const nerr = st.spErr.__new;
    return `<aside class="card side-card">
<div class="panel-head"><h2>Специальности врачей</h2><button type="button" class="iconbtn" aria-label="Закрыть" data-act="specs-close">${ICON.close}</button></div>
<p class="note" style="font-size:14px">Эти названия видят посетители сайта: ими подписаны карточки врачей и кнопки фильтра над ними. Кнопка фильтра появляется, когда у специальности есть хотя бы один врач на сайте. Удалить можно только специальность, у которой нет врачей.</p>
<div>${rows}</div>
<div class="field"><label for="a3-newsp">Новая специальность</label>
<div style="display:flex;gap:10px;flex-wrap:wrap"><input class="inp" id="a3-newsp" style="flex:1 1 200px" maxlength="40" placeholder="Например: Трихолог" value="${esc(st.newSpec)}" ${nerr ? 'aria-invalid="true"' : ''}>
<button type="button" class="btn btn--dark" style="min-height:52px" data-act="sp-add" ${st.spBusy ? 'disabled' : ''}>${ICON.plus}Добавить</button></div>
<div class="hint"><span class="${nerr ? 'err' : ''}">${esc(nerr || 'Коротко, как в документах: «Трихолог», «Эндокринолог»')}</span><span>${st.newSpec.length} из 40</span></div></div>
<p class="note">Новая специальность, как и всё остальное, появится на сайте после кнопки «Опубликовать».</p>
${st.sel !== null ? '<button type="button" class="btn btn--line" style="align-self:flex-start" data-act="specs-close">← К карточке врача</button>' : ''}</aside>`;
  }

  function panelHtml() {
    if (st.mode === 'specs') return specsPanelHtml();
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
<div class="field"><label for="a3-spec">Специальность</label><select class="sel" id="a3-spec" data-f="spec">${specs().map((x) => `<option value="${esc(x.id)}" ${d.spec === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
${e.spec ? `<span class="hint"><span class="err">${esc(e.spec)}</span></span>` : ''}
<span class="note">По специальности работают фильтры на сайте. Нет нужной? <button type="button" class="linkbtn" style="margin:0;font-size:13px" data-act="specs">Управлять специальностями</button></span></div>
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
    if (st.filter !== 'all' && !specs().some((x) => x.id === st.filter)) st.filter = 'all';
    const n = (k) => k === 'all' ? docs().length : docs().filter((d) => d.spec === k).length;
    const tab = (k, label) => `<button type="button" class="tab" role="tab" aria-selected="${st.filter === k}" data-act="filter" data-k="${k}">${label} · ${n(k)}</button>`;
    root.innerHTML = `${head('Врачи', 'Карточки врачей в блоке «Врачи» на сайте.', s)}
<div class="cols"><section class="grow" style="flex:1.2 1 480px">
<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px"><div class="tabs" role="tablist" aria-label="Специальность">${tab('all', 'Все')}${specs().map((x) => tab(x.id, esc(x.name))).join('')}</div>
<button type="button" class="btn btn--line btn--sm" data-act="specs">Специальности</button></div>
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

  async function specCall(fn, okMsg) {
    st.spBusy = true;
    try {
      const out = await fn();
      ctx.setState(out.state);
      st.spErr = {};
      if (okMsg) toast(okMsg);
      return out;
    } catch (err) {
      if (err instanceof ApiError && err.data.errors) st.spErr = { ...st.spErr, ...err.data.errors };
      toast(err.message, { err: true });
      return null;
    } finally { st.spBusy = false; }
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
    else if (act === 'specs') { st.mode = 'specs'; st.spErr = {}; render(); root.querySelector('#a3-newsp')?.focus(); }
    else if (act === 'specs-close') { st.mode = 'doctor'; render(); }
    else if (act === 'sp-add') {
      specCall(() => api('POST', '/specialties', { name: st.newSpec }), 'Специальность добавлена. Чтобы она появилась на сайте, выберите её у врача и опубликуйте').then((out) => {
        if (out) st.newSpec = ''; else st.spErr.__new = st.spErr.name || 'Проверьте название';
        render();
      });
    }
    else if (act === 'sp-save') {
      const id = b.dataset.id;
      specCall(() => api('PUT', '/specialties/' + id, { name: st.spEdit[id] }), 'Название сохранено. Сайт изменится после публикации').then((out) => {
        if (out) delete st.spEdit[id]; else st.spErr[id] = st.spErr.name || 'Проверьте название';
        render();
      });
    }
    else if (act === 'sp-del') {
      const id = b.dataset.id;
      if (!confirm(`Удалить специальность «${specName(id)}»?`)) return;
      specCall(() => api('DELETE', '/specialties/' + id), 'Специальность удалена. С сайта уйдёт после публикации').then(() => render());
    }
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
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'a3-newsp') { e.preventDefault(); root.querySelector('[data-act="sp-add"]').click(); }
    else if (e.target.dataset.sp) { e.preventDefault(); root.querySelector(`[data-act="sp-save"][data-id="${e.target.dataset.sp}"]`).click(); }
  });
  root.addEventListener('input', (e) => {
    if (e.target.dataset.sp) {
      const id = e.target.dataset.sp;
      st.spEdit[id] = e.target.value; delete st.spErr[id];
      const btn = root.querySelector(`[data-act="sp-save"][data-id="${id}"]`);
      const changed = e.target.value.trim() !== specName(id);
      btn.disabled = !changed; btn.classList.toggle('btn--olive', changed); btn.classList.toggle('btn--line', !changed);
      return;
    }
    if (e.target.id === 'a3-newsp') { st.newSpec = e.target.value; delete st.spErr.__new; const c = root.querySelector('#a3-newsp').closest('.field').querySelector('.hint span:last-child'); if (c) c.textContent = st.newSpec.length + ' из 40'; return; }
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
