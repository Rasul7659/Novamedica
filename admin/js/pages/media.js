import { esc, api, toast, head, ICON, ApiError } from '../core.js';

export const title = 'Фото и видео';

export function mount(root, ctx) {
  const st = { filter: 'all', sel: null, draft: null, errs: {}, confirming: false, busy: false, drag: false };
  const items = () => ctx.state.draft.media;
  const SLOTS = () => ctx.state.schema.slots;
  const cur = () => items().find((m) => m.id === st.sel);
  const slotsOf = (m) => Object.keys(SLOTS()).filter((s) => ctx.state.draft.slots[s] === m.id);
  const inF = (m, f) => f === 'all' || (f === 'unused' ? !m.usedBy.length : m.kind === f);
  const dirty = () => {
    const c = cur();
    if (!c || !st.draft) return false;
    return c.name !== st.draft.name || c.alt !== st.draft.alt || slotsOf(c).slice().sort().join() !== st.draft.slots.slice().sort().join();
  };
  function pick(id) {
    const m = items().find((x) => x.id === id);
    st.sel = id; st.confirming = false; st.errs = {};
    st.draft = m ? { name: m.name, alt: m.alt, slots: slotsOf(m) } : null;
  }
  const crop = (m) => m.crop ? `style="object-position:${m.crop.pos || '50% 50%'};transform:scale(${m.crop.scale});transform-origin:${m.crop.origin}"` : '';
  const thumb = (m) => m.kind === 'video' ? `<video src="${esc(m.url)}" preload="metadata" muted></video>` : `<img src="${esc(m.url)}" alt="" ${crop(m)}>`;

  function cardsHtml() {
    const list = items().filter((m) => inF(m, st.filter));
    if (!list.length) return '<div class="card card--empty" style="width:100%"><b>Здесь пока ничего нет</b><span>Загрузите файл кнопкой выше — он появится в этом разделе.</span></div>';
    return list.map((m) => `<button type="button" class="mcard ${st.sel === m.id ? 'on' : ''}" data-act="pick" data-id="${m.id}">
<span class="im">${thumb(m)}</span><span class="mpad"><b>${esc(m.name)}</b><small style="color:${m.usedBy.length ? 'var(--ok)' : 'var(--muted)'}">${m.usedBy.length ? 'На сайте: ' + esc(m.usedBy.join(', ').toLowerCase()) : 'Не используется'}</small></span></button>`).join('');
  }

  function asideHtml() {
    const c = cur();
    if (!c || !items().some((m) => m.id === c.id) || !inF(c, st.filter)) {
      return '<aside class="card card--empty side-card" style="padding:40px 24px"><b>Выберите файл слева</b><span>Здесь можно переименовать файл и посмотреть, где он стоит на сайте.</span></aside>';
    }
    const d = st.draft, e = st.errs;
    const used = c.usedBy.length > 0;
    const canSlots = c.kind === 'interior';
    return `<aside class="card side-card" style="padding:24px;gap:18px">
<div class="mprev">${thumb(c).replace('muted', 'controls')}</div>
<div class="field"><label for="a5-name">Название</label><input class="inp" id="a5-name" data-f="name" maxlength="80" value="${esc(d.name)}" ${e.name || !d.name.trim() ? 'aria-invalid="true"' : ''}>
<div class="hint"><span class="${e.name || !d.name.trim() ? 'err' : ''}">${esc(e.name || (!d.name.trim() ? 'Дайте файлу название, чтобы его легко найти' : 'Видно только вам'))}</span></div></div>
${c.kind !== 'video' ? `<div class="field"><label for="a5-alt">Что на фото</label><input class="inp" id="a5-alt" data-f="alt" maxlength="200" value="${esc(d.alt)}">
<span class="note">Одно предложение. Читают поисковики и люди, которые плохо видят.</span></div>` : ''}
${canSlots ? `<div class="field"><span class="lbl">Где поставить на сайте</span><div class="slots">${Object.entries(SLOTS()).map(([k, label]) => `<label><input type="checkbox" data-slot="${k}" ${d.slots.includes(k) ? 'checked' : ''}>${esc(label)}</label>`).join('')}</div>
<span class="note">Если место уже занято другим фото, оно заменится на это.</span></div>` : ''}
<div class="info-box"><b style="font-weight:600;display:block">Где стоит на сайте</b>${used ? esc(c.usedBy.join(', ')) : 'Нигде. Можно поставить на сайт или удалить'}</div>
<div class="foot-actions"><button type="button" class="btn btn--olive ${dirty() ? '' : 'is-saved'}" style="min-height:52px;font-size:16px" data-act="save" ${st.busy ? 'disabled' : ''}>${dirty() ? 'Сохранить' : 'Сохранено'}</button>
<button type="button" class="btn btn--line" style="min-height:52px" data-act="replace">Заменить файл</button></div>
<input type="file" id="a5-replace" accept="${c.kind === 'video' ? 'video/mp4' : 'image/jpeg,image/png,image/webp'}" hidden>
<div class="sep" style="gap:8px">${used
    ? '<span style="font-size:15px;color:#7A7D6A">Удалить</span><span class="note">Этот снимок сейчас стоит на сайте, поэтому удалить его нельзя. Сначала замените его на другой в нужном разделе.</span>'
    : st.confirming
      ? `<div class="alert alert--err" style="flex-direction:column;gap:10px"><span><b>Удалить «${esc(c.name)}»?</b> Вернуть файл будет нельзя.</span><span style="display:flex;gap:10px"><button type="button" class="btn btn--sm" style="background:#8A3A28;color:#fff" data-act="del-yes">Да, удалить</button><button type="button" class="btn btn--line btn--sm" data-act="del-no">Не удалять</button></span></div>`
      : '<button type="button" class="danger" data-act="del">Удалить файл</button><span class="note">Файл нигде не используется, его можно удалить.</span>'}</div></aside>`;
  }

  function render() {
    const s = ctx.state;
    const n = (f) => items().filter((m) => inF(m, f)).length;
    const defs = [['all', 'Всё'], ['interior', 'Интерьер'], ['doctor', 'Врачи'], ['video', 'Видео'], ['unused', 'Не используются']];
    root.innerHTML = `${head('Фото и видео', 'Все снимки клиники в одном месте. Отсюда их можно поставить на сайт.', s)}
<div class="upload ${st.drag ? 'drag' : ''}" id="drop"><i>${ICON.upload}</i><div class="grow"><div class="t">${st.busy ? 'Загружаем…' : 'Перетащите файлы сюда'}</div>
<div class="s">Фото: JPG или PNG до 10 МБ. Видео: MP4 до 30 МБ. Мы сами уменьшим их и подгоним под сайт.</div></div>
<button type="button" class="btn btn--dark btn--lg" style="min-height:52px;font-size:16px" data-act="upload" ${st.busy ? 'disabled' : ''}>Выбрать на компьютере</button>
<input type="file" id="a5-file" accept="image/jpeg,image/png,image/webp,video/mp4" multiple hidden></div>
<div class="cols"><section class="grow" style="flex:1.5 1 520px"><div class="tabs" role="tablist" aria-label="Тип файлов">${defs.map(([k, l]) => `<button type="button" class="tab" style="min-height:40px;font-size:14px" role="tab" aria-selected="${st.filter === k}" data-act="filter" data-k="${k}">${l} · ${n(k)}</button>`).join('')}</div>
<div class="cards" id="cards">${cardsHtml()}</div></section>
<div id="aside" class="side-card" style="flex:1 1 340px;max-width:420px;min-width:0">${asideHtml()}</div></div>`;
  }
  const renderAside = () => { root.querySelector('#aside').innerHTML = asideHtml(); };
  const refreshSave = () => { const b = root.querySelector('[data-act="save"]'); if (b) { b.textContent = dirty() ? 'Сохранить' : 'Сохранено'; b.classList.toggle('is-saved', !dirty()); } };

  async function upload(files) {
    if (!files.length || st.busy) return;
    st.busy = true; render();
    let last = null, fail = 0;
    for (const f of files) {
      try {
        const form = new FormData();
        form.append('file', f);
        const out = await api('POST', '/media', undefined, form);
        ctx.setState(out.state); last = out.id;
      } catch (err) { fail++; toast(`${f.name}: ${err.message}`, { err: true, ms: 5000 }); }
    }
    st.busy = false; st.filter = 'all';
    if (last) { pick(last); if (!fail) toast('Файл загружен и уменьшен. Дайте ему название'); }
    render();
  }

  async function save() {
    if (!dirty() || st.busy) return;
    if (!st.draft.name.trim()) { toast('Дайте файлу название', { err: true }); renderAside(); return; }
    st.busy = true;
    try {
      const out = await api('PUT', '/media/' + st.sel, { name: st.draft.name, alt: st.draft.alt, slots: cur().kind === 'interior' ? st.draft.slots : undefined });
      ctx.setState(out.state); pick(st.sel);
      toast('Сохранено. Сайт изменится после публикации');
    } catch (err) {
      if (err instanceof ApiError && err.data.errors) st.errs = err.data.errors;
      toast(err.message, { err: true });
    }
    st.busy = false; render();
  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act, warn = dirty();
    if (a === 'filter') { st.filter = b.dataset.k; const first = items().find((m) => inF(m, st.filter)); pick(first ? first.id : null); render(); }
    else if (a === 'pick') { pick(b.dataset.id); render(); if (warn) toast('Несохранённые правки отменены'); }
    else if (a === 'upload') root.querySelector('#a5-file').click();
    else if (a === 'save') save();
    else if (a === 'replace') root.querySelector('#a5-replace').click();
    else if (a === 'del') { st.confirming = true; renderAside(); }
    else if (a === 'del-no') { st.confirming = false; renderAside(); }
    else if (a === 'del-yes') {
      try {
        const out = await api('DELETE', '/media/' + st.sel);
        ctx.setState(out.state);
        const next = items().find((m) => inF(m, st.filter));
        pick(next ? next.id : null); toast('Файл удалён'); render();
      } catch (err) { st.confirming = false; toast(err.message, { err: true }); renderAside(); }
    }
  });
  root.addEventListener('change', async (e) => {
    if (e.target.id === 'a5-file') { upload(Array.from(e.target.files)); e.target.value = ''; }
    else if (e.target.id === 'a5-replace') {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const form = new FormData(); form.append('file', f);
        const out = await api('POST', `/media/${st.sel}/replace`, undefined, form);
        ctx.setState(out.state); pick(st.sel); toast('Файл заменён. Сайт изменится после публикации'); render();
      } catch (err) { toast(err.message, { err: true, ms: 5000 }); }
    } else if (e.target.dataset.slot) {
      const s = e.target.dataset.slot;
      st.draft.slots = e.target.checked ? [...new Set([...st.draft.slots, s])] : st.draft.slots.filter((x) => x !== s);
      refreshSave();
    }
  });
  root.addEventListener('input', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    st.draft[f] = e.target.value; refreshSave();
  });
  const drop = () => root.querySelector('#drop');
  root.addEventListener('dragover', (e) => { if (e.target.closest('#drop')) { e.preventDefault(); drop().classList.add('drag'); } });
  root.addEventListener('dragleave', (e) => { if (e.target.closest('#drop')) drop().classList.remove('drag'); });
  root.addEventListener('drop', (e) => { if (e.target.closest('#drop')) { e.preventDefault(); drop().classList.remove('drag'); upload(Array.from(e.dataTransfer.files)); } });

  const first = items()[0];
  if (first) pick(first.id);
  render();
  return { dirty };
}
