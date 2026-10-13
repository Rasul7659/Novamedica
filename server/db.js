'use strict';
const { JsonFile, uid, clone } = require('./store');
const { seedContent } = require('./seed');
const { diffContent, applyExclusions, plural } = require('./diff');
const { SLOTS, digits, DEFAULT_SPECIALTIES } = require('./schema');

const MAX_VERSIONS = 30;
const ARCHIVE_DAYS = 90;

const contentFile = new JsonFile('content.json', () => {
  const c = seedContent();
  const now = new Date().toISOString();
  return {
    draft: clone(c),
    published: clone(c),
    publishedAt: now,
    currentVersionId: 1,
    nextVid: 2,
    versions: [{ id: 1, at: now, who: 'Система', what: 'Начальная версия сайта', content: clone(c) }]
  };
});

// Данные, сохранённые до появления управляемых специальностей, дополняем списком по умолчанию
// (в черновике, опубликованной версии и всех версиях истории). Возвращает true, если что-то изменено.
function migrateContent(d) {
  let changed = false;
  const add = (c) => { if (c && !c.specialties) { c.specialties = clone(DEFAULT_SPECIALTIES); changed = true; } };
  add(d.draft); add(d.published);
  (d.versions || []).forEach((v) => add(v.content));
  return changed;
}
if (migrateContent(contentFile.data)) contentFile.save();

const requestsFile = new JsonFile('requests.json', () => ({ items: [] }));
const adminFile = new JsonFile('admin.json', () => ({}));

// ---------- Контент ----------
const draft = () => contentFile.data.draft;
const published = () => contentFile.data.published;

function editDraft(fn) {
  return contentFile.mutate((d) => fn(d.draft));
}

function changes() {
  return diffContent(contentFile.data.draft, contentFile.data.published);
}

function licenseMissing() {
  return !String(contentFile.data.draft.contacts.license || '').trim();
}

function publish(who, exclude = []) {
  const d = contentFile.data;
  const next = applyExclusions(d.draft, d.published, exclude);
  if (!String(next.contacts.license || '').trim()) {
    return { error: 'license' };
  }
  const all = diffContent(d.draft, d.published);
  const included = all.filter((c) => !exclude.includes(c.key));
  if (!included.length) return { error: 'nothing' };
  const at = new Date().toISOString();
  const what = included.length + ' ' + plural(included.length) + ' на сайте';
  contentFile.mutate((s) => {
    s.published = clone(next);
    s.publishedAt = at;
    const id = s.nextVid++;
    s.currentVersionId = id;
    s.versions.unshift({ id, at, who, what, content: clone(next) });
    s.versions = s.versions.slice(0, MAX_VERSIONS);
  });
  return { ok: true, count: included.length };
}

function restore(versionId, who) {
  const d = contentFile.data;
  const v = d.versions.find((x) => x.id === versionId);
  if (!v) return { error: 'not_found' };
  const at = new Date().toISOString();
  contentFile.mutate((s) => {
    s.published = clone(v.content);
    s.draft = clone(v.content);
    s.publishedAt = at;
    s.currentVersionId = v.id;
    // отдельной записи не создаём: текущая версия — та, к которой вернулись; свежие правки остаются в истории
    s.restoredBy = who;
  });
  return { ok: true };
}

function listVersions() {
  return contentFile.data.versions.map(({ id, at, who, what }) => ({
    id, at, who, what, current: id === contentFile.data.currentVersionId
  }));
}

// Поля ссылок на медиа должны существовать в черновике
function mediaUsage(content, mediaId) {
  const used = [];
  for (const [slot, id] of Object.entries(content.slots)) if (id === mediaId) used.push(SLOTS[slot]);
  if (content.doctors.some((d) => d.photoId === mediaId)) used.push('Врачи');
  return used;
}

// ---------- Что осталось заполнить ----------
function completeness(c) {
  const docsTotal = c.doctors.filter((d) => d.visible).length;
  const docsWithPhoto = c.doctors.filter((d) => d.visible && d.photoId).length;
  const interior = ['interiorMain', 'interiorSign', 'interiorWait'];
  const realInterior = interior.filter((s) => {
    const m = c.media.find((x) => x.id === c.slots[s]);
    return m && !m.placeholder;
  }).length;
  const filled = (v) => !!String(v || '').trim() && !/\[|\]/.test(v);
  const items = [
    { id: 'license', label: 'Указать номер лицензии', done: filled(c.contacts.license), href: 'content?tab=contacts' },
    { id: 'phone', label: 'Указать телефон клиники', done: digits(c.contacts.phone).length >= 10 && filled(c.contacts.phone), href: 'content?tab=contacts' },
    { id: 'address', label: 'Указать адрес и режим работы', done: filled(c.contacts.address) && filled(c.contacts.hours), href: 'content?tab=contacts' },
    { id: 'requisites', label: 'Заполнить реквизиты (ИНН, ОГРН)', done: filled(c.contacts.org) && !!c.contacts.inn && !!c.contacts.ogrn, href: 'content?tab=contacts' },
    { id: 'prices', label: 'Проставить цены услуг', done: c.services.every((s) => !s.visible || !!s.price), href: 'services' },
    { id: 'doctors', label: 'Заполнить врачей', done: c.doctors.length > 0 && c.doctors.every((d) => !/\[|\]/.test(d.name)), href: 'doctors' },
    { id: 'doctorPhotos', label: 'Добавить фото врачей', note: docsTotal ? `(${docsWithPhoto} из ${docsTotal})` : '', done: docsTotal > 0 && docsWithPhoto === docsTotal, href: 'doctors' },
    { id: 'interior', label: 'Загрузить фото интерьера', note: `(${realInterior} из 3)`, done: realInterior === 3, href: 'media' }
  ];
  return { items, done: items.filter((i) => i.done).length, total: items.length };
}

// ---------- Заявки ----------
function addRequest({ name, phone, service }) {
  const item = {
    id: uid('r'),
    name, phone, service,
    status: 'new',
    note: '',
    createdAt: new Date().toISOString(),
    consentAt: new Date().toISOString()
  };
  requestsFile.mutate((d) => d.items.unshift(item));
  return item;
}

function activeRequests() {
  const limit = Date.now() - ARCHIVE_DAYS * 86400000;
  return requestsFile.data.items.filter((r) => new Date(r.createdAt).getTime() >= limit);
}

function updateRequest(id, patch) {
  return requestsFile.mutate((d) => {
    const r = d.items.find((x) => x.id === id);
    if (!r) return null;
    if (patch.status) r.status = patch.status;
    if (typeof patch.note === 'string') r.note = patch.note.slice(0, 500);
    return r;
  });
}

module.exports = {
  contentFile, requestsFile, adminFile,
  draft, published, editDraft, changes, licenseMissing, publish, restore, listVersions,
  mediaUsage, completeness, addRequest, activeRequests, updateRequest,
  getPublishedAt: () => contentFile.data.publishedAt
};
