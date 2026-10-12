import { esc, api, toast, head, ApiError } from '../core.js';

export const title = 'Тексты и контакты';

export function mount(root, ctx) {
  const q = ctx.query();
  const SECS = ctx.state.schema.sections;
  const st = {
    tab: q.get('tab') === 'contacts' ? 'contacts' : 'parts',
    block: SECS[q.get('block')] && q.get('block') !== 'contacts' ? q.get('block') : 'hero',
    device: 'desk', tried: {}, errs: {}, saving: false, vals: {}
  };
  const saved = (k) => ctx.state.draft[k];
  const valsOf = (k) => (st.vals[k] ||= { ...saved(k) });
  const key = () => (st.tab === 'contacts' ? 'contacts' : st.block);
  const isDirty = (k) => !!st.vals[k] && SECS[k].fields.some((f) => !f.locked && (st.vals[k][f.k] || '') !== (saved(k)[f.k] || ''));
  const anyDirty = () => Object.keys(st.vals).some(isDirty);
  const LIST = [['hero', 'Первый экран'], ['about', 'О клинике'], ['svc', 'Услуги', '/admin/services', 'в разделе «Услуги»'],
    ['doc', 'Врачи', '/admin/doctors', 'в разделе «Врачи»'], ['visit', 'Как проходит приём'],
    ['int', 'Интерьер', '/admin/media', 'в разделе «Фото»'], ['form', 'Запись'], ['footer', 'Подвал сайта']];

  function fieldsHtml(k) {
    const v = valsOf(k);
    const errs = st.tried[k] ? st.errs[k] || {} : {};
    return SECS[k].fields.map((f) => {
      const val = f.locked ? saved(k)[f.k] : v[f.k] || '';
      const err = errs[f.k];
      const id = `a4-${k}-${f.k}`;
      const attrs = `id="${id}" data-f="${f.k}" ${err ? 'aria-invalid="true"' : ''} ${f.locked ? 'readonly' : ''} ${f.max && !f.locked && !['inn', 'ogrn'].includes(f.k) ? '' : ''}`;
      const control = f.area
        ? `<textarea class="ta" rows="3" ${attrs}>${esc(val)}</textarea>`
        : `<input class="inp" type="text" placeholder="${esc(f.ph || '')}" ${attrs} value="${esc(val)}">`;
      const countable = f.max && !f.locked && !['inn', 'ogrn'].includes(f.k);
      return `<div class="field"><label for="${id}">${esc(f.label)}</label>${control}
<div class="hint"><span class="${err ? 'err' : ''}" data-hint="${f.k}">${esc(err || f.hint)}</span>${countable ? `<span data-count="${f.k}" class="${val.length > f.max ? 'over' : ''}">${val.length} из ${f.max}</span>` : ''}</div></div>`;
    }).join('');
  }

  function previewHtml() {
    const k = key();
    const bk = k === 'contacts' ? 'footer' : k;
    const d = (s) => (st.vals[s] || saved(s));
    const mob = st.device === 'mob';
    const hero = ctx.state.draft.media.find((m) => m.id === ctx.state.draft.slots.hero);
    let box = '', title = '', text = '', meta = '', btn = '', btnStyle = '', bg = '', fg = '';
    if (bk === 'hero') { bg = '#2E3323'; fg = '#fff'; title = d('hero').h1 || 'Заголовок'; const lic = d('contacts').license; meta = lic ? 'Лицензия № ' + lic : ''; btn = d('hero').btn || 'Кнопка'; btnStyle = 'background:#fff;color:#2E3323'; }
    else if (bk === 'about') { bg = '#EDE9DC'; fg = '#2E3323'; title = d('about').heading; text = d('about').text; }
    else if (bk === 'visit') { bg = '#4E5530'; fg = '#FAF9F5'; const v = d('visit'); title = v.heading; text = `01 ${v.s1}\n02 ${v.s2}\n03 ${v.s3}\n04 ${v.s4}`; }
    else if (bk === 'form') { bg = '#F0EEE5'; fg = '#2E3323'; title = d('form').heading; text = d('form').text; btn = 'Записаться на приём'; btnStyle = 'background:#2E3323;color:#fff'; }
    else { bg = '#4E5530'; fg = '#E4E0D0'; const c = d('contacts'); title = k === 'contacts' ? c.org || '[Юрлицо]' : d('footer').org; text = [c.address, c.hours, c.phone || '[телефон]', 'Лицензия № ' + (c.license || '[номер]'), d('footer').note].join('\n'); }
    const isHero = bk === 'hero';
    box = `<div class="prev ${mob ? 'prev--mob' : ''}" style="background:${bg};color:${fg};${bk === 'about' || bk === 'visit' || bk === 'form' ? 'justify-content:center' : ''}">
${isHero && hero ? `<img src="${esc(hero.url)}" alt=""><div class="shade"></div>` : ''}
<div class="in"><div class="pt" style="color:${isHero || bk === 'visit' ? '#fff' : bk === 'about' ? '#3E4526' : 'inherit'}">${esc(title)}</div>
${text ? `<div class="px">${esc(text)}</div>` : ''}${meta ? `<div class="pm">${esc(meta)}</div>` : ''}${btn ? `<span class="pb" style="${btnStyle}">${esc(btn)}</span>` : ''}</div></div>`;
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><span style="font-size:14px;font-weight:500">Так будет на сайте</span>
<span class="seg" role="tablist"><button type="button" role="tab" aria-selected="${!mob}" data-act="dev" data-d="desk">Компьютер</button><button type="button" role="tab" aria-selected="${mob}" data-act="dev" data-d="mob">Телефон</button></span></div>
${box}<p class="note">Предпросмотр обновляется, пока вы печатаете.</p>`;
  }

  function formHtml() {
    const k = key();
    const def = SECS[k];
    const lic = (valsOf('contacts').license || '').trim();
    const dirty = isDirty(k);
    return `<section class="card" style="flex:1.1 1 400px;min-width:0;padding:28px">
<div><h2 style="font-size:22px;letter-spacing:-0.02em">${esc(def.title)}</h2><p class="note" style="font-size:14px;margin-top:4px">${esc(def.subtitle)}</p></div>
${k === 'hero' ? `<div class="lic ${lic ? 'lic--ok' : 'lic--no'}"><span>${lic ? `Лицензия: ${esc(lic)}. Этот номер показан на первом экране.` : 'Номер лицензии не заполнен. Без него сайт опубликовать нельзя. Он указывается один раз во вкладке «Контакты и реквизиты».'}</span>
<button type="button" class="btn btn--line btn--sm" style="min-height:44px" data-act="tab" data-t="contacts">${lic ? 'Изменить' : 'Заполнить'}</button></div>` : ''}
<div id="fields" style="display:flex;flex-direction:column;gap:20px">${fieldsHtml(k)}</div>
<div class="foot-actions" style="padding-top:4px"><button type="button" class="btn btn--olive ${dirty ? '' : 'is-saved'}" style="min-height:52px;font-size:16px" data-act="save" id="save-btn" ${st.saving ? 'disabled' : ''}>${dirty ? 'Сохранить' : 'Сохранено'}</button>
<button type="button" class="btn btn--line" style="min-height:52px" data-act="cancel" id="cancel-btn" ${dirty ? '' : 'hidden'}>Отмена</button>
<span class="note" id="dirty-note" style="color:#6E4F0F" ${dirty ? '' : 'hidden'}>Есть несохранённые правки</span></div>
<p class="note">«Сохранить» не меняет сайт сразу. Изменения появятся там после кнопки «Опубликовать».</p></section>`;
  }

  function render() {
    const s = ctx.state;
    const dot = (k) => (isDirty(k) ? '<span class="dot" aria-label="Не сохранено"></span>' : '');
    const nav = st.tab === 'parts' ? `<nav class="parts" aria-label="Части сайта"><div class="cap">Сверху вниз, как на сайте</div>
${LIST.map(([k, label, href, note]) => href
    ? `<a class="part" data-link href="${href}"><span class="grip" aria-hidden="true">⋮⋮</span><span class="grow">${label} <small>${note}</small></span></a>`
    : `<button type="button" class="part ${st.block === k ? 'on' : ''}" data-act="block" data-b="${k}"><span class="grip" aria-hidden="true">⋮⋮</span><span class="grow">${label}</span>${dot(k)}</button>`).join('')}</nav>` : '';
    root.innerHTML = `${head('Тексты и контакты', 'Выберите часть сайта и поправьте текст.', s)}
<div class="tabs" role="tablist"><button type="button" class="tab" role="tab" aria-selected="${st.tab === 'parts'}" data-act="tab" data-t="parts">Части сайта</button>
<button type="button" class="tab" role="tab" aria-selected="${st.tab === 'contacts'}" data-act="tab" data-t="contacts">Контакты и реквизиты ${dot('contacts')}</button></div>
<div class="cols">${nav}${formHtml()}<aside class="prev-wrap" id="prev">${previewHtml()}</aside></div>`;
  }

  function refreshLive() {
    const k = key();
    const dirty = isDirty(k);
    const b = root.querySelector('#save-btn');
    b.textContent = dirty ? 'Сохранить' : 'Сохранено';
    b.classList.toggle('is-saved', !dirty);
    root.querySelector('#cancel-btn').hidden = !dirty;
    root.querySelector('#dirty-note').hidden = !dirty;
    root.querySelector('#prev').innerHTML = previewHtml();
    root.querySelectorAll('.part[data-b], .tab[data-t="contacts"]').forEach((el) => {
      const kk = el.dataset.b || 'contacts';
      const has = el.querySelector('.dot');
      if (isDirty(kk) && !has) el.insertAdjacentHTML('beforeend', '<span class="dot" aria-label="Не сохранено"></span>');
      if (!isDirty(kk) && has) has.remove();
    });
    SECS[k].fields.forEach((f) => {
      const c = root.querySelector(`[data-count="${f.k}"]`);
      if (c) { const n = (st.vals[k][f.k] || '').length; c.textContent = `${n} из ${f.max}`; c.classList.toggle('over', n > f.max); }
    });
  }

  async function save() {
    const k = key();
    if (!isDirty(k) || st.saving) return;
    st.saving = true;
    try {
      const out = await api('PUT', '/sections/' + k, st.vals[k]);
      ctx.setState(out.state);
      delete st.vals[k]; st.tried[k] = false; st.errs[k] = {};
      toast('Сохранено. Сайт изменится после публикации');
    } catch (err) {
      if (err instanceof ApiError && err.data.errors) { st.errs[k] = err.data.errors; st.tried[k] = true; }
      toast(err.message, { err: true });
    }
    st.saving = false;
    render();
    const bad = root.querySelector('[aria-invalid="true"]');
    if (bad) bad.focus();
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'tab') { st.tab = b.dataset.t; render(); }
    else if (a === 'block') { st.block = b.dataset.b; render(); }
    else if (a === 'dev') { st.device = b.dataset.d; root.querySelector('#prev').innerHTML = previewHtml(); }
    else if (a === 'save') save();
    else if (a === 'cancel') { const k = key(); delete st.vals[k]; st.tried[k] = false; st.errs[k] = {}; render(); }
  });
  root.addEventListener('input', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    const k = key();
    valsOf(k)[f] = e.target.value;
    if (st.errs[k]?.[f]) { delete st.errs[k][f]; e.target.removeAttribute('aria-invalid'); const h = root.querySelector(`[data-hint="${f}"]`); if (h) { h.classList.remove('err'); h.textContent = SECS[k].fields.find((x) => x.k === f).hint; } }
    refreshLive();
  });

  render();
  return { dirty: anyDirty };
}
