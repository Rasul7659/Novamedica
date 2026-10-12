'use strict';
// Сравнение черновика с опубликованной версией: список изменений «для людей»
// и применение исключений («Не публиковать»).
const { SECTIONS, SPECS, SLOTS } = require('./schema');
const { clone } = require('./store');

const SECTION_KEYS = Object.keys(SECTIONS);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byId = (list) => new Map((list || []).map((x) => [x.id, x]));
const money = (p) => (p ? 'от ' + String(p).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽' : 'не указана');

function diffContent(draft, published) {
  const out = [];

  // Тексты и контакты
  for (const key of SECTION_KEYS) {
    if (same(draft[key], published[key])) continue;
    const def = SECTIONS[key];
    const changed = def.fields.filter((f) => (draft[key][f.k] || '') !== (published[key][f.k] || ''));
    if (changed.length === 1) {
      const f = changed[0];
      out.push({
        key: 'text:' + key,
        where: (key === 'contacts' ? 'Контакты · ' : def.title + ' · ') + f.label,
        old: published[key][f.k] || '',
        now: draft[key][f.k] || '(пусто)',
        page: key === 'contacts' ? 'content?tab=contacts' : 'content?block=' + key
      });
    } else {
      out.push({
        key: 'text:' + key,
        where: 'Тексты · ' + def.title,
        old: '',
        now: 'Изменено: ' + changed.map((f) => f.label).join(', '),
        page: key === 'contacts' ? 'content?tab=contacts' : 'content?block=' + key
      });
    }
  }

  // Услуги
  const pubS = byId(published.services);
  const drS = byId(draft.services);
  for (const s of draft.services) {
    const p = pubS.get(s.id);
    if (!p) {
      out.push({ key: 'svc:' + s.id, where: 'Услуги', old: '', now: 'Добавлена: ' + s.title + (s.visible ? '' : ' (скрыта)'), page: 'services' });
    } else if (!same(s, p)) {
      if (s.price !== p.price && s.title === p.title && s.desc === p.desc && s.visible === p.visible) {
        out.push({ key: 'svc:' + s.id, where: 'Цена · ' + s.title, old: money(p.price), now: money(s.price), page: 'services' });
      } else if (s.visible !== p.visible && s.title === p.title && s.desc === p.desc && s.price === p.price) {
        out.push({ key: 'svc:' + s.id, where: 'Услуги', old: '', now: (s.visible ? 'Снова на сайте: ' : 'Скрыта: ') + s.title, page: 'services' });
      } else {
        out.push({ key: 'svc:' + s.id, where: 'Услуга · ' + p.title, old: '', now: 'Изменены данные услуги', page: 'services' });
      }
    }
  }
  for (const p of published.services) {
    if (!drS.has(p.id)) out.push({ key: 'svc:' + p.id, where: 'Услуги', old: '', now: 'Убрана: ' + p.title, page: 'services' });
  }

  // Врачи
  const pubD = byId(published.doctors);
  const drD = byId(draft.doctors);
  for (const d of draft.doctors) {
    const p = pubD.get(d.id);
    if (!p) {
      out.push({ key: 'doc:' + d.id, where: 'Врачи', old: '', now: 'Добавлен врач: ' + d.name + (d.visible ? '' : ' (скрыт)'), page: 'doctors' });
    } else if (!same(d, p)) {
      const parts = [];
      if (d.name !== p.name) parts.push('ФИО');
      if (d.spec !== p.spec) parts.push('специальность');
      if (d.exp !== p.exp || d.bio !== p.bio) parts.push('стаж и образование');
      if (d.photoId !== p.photoId) parts.push('фото');
      if (d.visible !== p.visible) parts.push(d.visible ? 'показан на сайте' : 'скрыт');
      out.push({ key: 'doc:' + d.id, where: 'Врач · ' + p.name, old: '', now: 'Изменено: ' + parts.join(', '), page: 'doctors' });
    }
  }
  for (const p of published.doctors) {
    if (!drD.has(p.id)) out.push({ key: 'doc:' + p.id, where: 'Врачи', old: '', now: 'Убран: ' + p.name, page: 'doctors' });
  }

  // Фото и видео
  const pubM = byId(published.media);
  const drM = byId(draft.media);
  for (const m of draft.media) {
    const p = pubM.get(m.id);
    if (!p) out.push({ key: 'media:' + m.id, where: 'Фото и видео', old: '', now: 'Загружено: ' + m.name, page: 'media' });
    else if (!same(m, p)) out.push({ key: 'media:' + m.id, where: 'Фото · ' + p.name, old: '', now: 'Изменены название, описание или файл', page: 'media' });
  }
  for (const p of published.media) {
    if (!drM.has(p.id)) out.push({ key: 'media:' + p.id, where: 'Фото и видео', old: '', now: 'Удалено: ' + p.name, page: 'media' });
  }
  for (const slot of Object.keys(SLOTS)) {
    if ((draft.slots[slot] || null) !== (published.slots[slot] || null)) {
      const m = drM.get(draft.slots[slot]);
      out.push({ key: 'slot:' + slot, where: 'Фото на сайте', old: '', now: SLOTS[slot] + ': ' + (m ? m.name : 'не выбрано'), page: 'media' });
    }
  }
  return out;
}

// Возвращает копию черновика, в которой исключённые изменения заменены опубликованными значениями.
function applyExclusions(draft, published, excluded) {
  const next = clone(draft);
  for (const key of excluded || []) {
    const [type, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (type === 'text' && SECTIONS[id]) {
      next[id] = clone(published[id]);
    } else if (type === 'svc' || type === 'doc' || type === 'media') {
      const field = { svc: 'services', doc: 'doctors', media: 'media' }[type];
      const pub = published[field].find((x) => x.id === id);
      const idx = next[field].findIndex((x) => x.id === id);
      if (pub && idx >= 0) next[field][idx] = clone(pub);
      else if (pub) next[field].push(clone(pub));
      else if (idx >= 0) next[field].splice(idx, 1);
    } else if (type === 'slot' && SLOTS[id]) {
      next.slots[id] = published.slots[id] || null;
    }
  }
  // Ссылки на удалённые файлы не должны «висеть»
  const mediaIds = new Set(next.media.map((m) => m.id));
  for (const d of next.doctors) if (d.photoId && !mediaIds.has(d.photoId)) d.photoId = null;
  for (const s of Object.keys(next.slots)) if (next.slots[s] && !mediaIds.has(next.slots[s])) next.slots[s] = null;
  return next;
}

function plural(n) {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? 'изменение' : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? 'изменения' : 'изменений';
}

module.exports = { diffContent, applyExclusions, plural, SPECS };
