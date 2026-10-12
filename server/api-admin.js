'use strict';
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const notify = require('./notify');
const { uid } = require('./store');
const { upload, saveUpload } = require('./media');
const { rateLimit } = require('./ratelimit');
const S = require('./schema');

const router = express.Router();
router.use(auth.requireFetchHeader);
const STATUSES = ['new', 'wait', 'booked', 'refused'];

const str = (v, max = 1000) => (typeof v === 'string' ? v.slice(0, max) : '');
const mediaView = (c) => c.media.map((m) => ({ ...m, usedBy: db.mediaUsage(c, m.id) }));

function state(req) {
  const c = db.draft();
  const reqs = db.activeRequests();
  return {
    me: auth.currentAdmin(req),
    schema: { sections: S.SECTIONS, specs: S.SPECS, slots: S.SLOTS },
    draft: { ...c, media: mediaView(c) },
    changes: db.changes(),
    publishedAt: db.getPublishedAt(),
    versions: db.listVersions(),
    licenseMissing: db.licenseMissing(),
    completeness: db.completeness(c),
    newRequests: reqs.filter((r) => r.status === 'new').length,
    freshRequests: reqs.filter((r) => r.status === 'new').slice(0, 3),
    telegram: notify.tgConfigured()
  };
}
const reply = (req, res, extra = {}) => res.json({ ...extra, state: state(req) });
const fail = (res, errors, message = 'Проверьте поля, отмеченные красным') => res.status(422).json({ error: message, errors });

// ---------- Вход и выход (без requireAdmin) ----------
const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: 'Слишком много попыток входа. Подождите минуту.' });

router.post('/login', loginLimiter, (req, res) => {
  const email = str(req.body.email, 200).trim().toLowerCase();
  const password = str(req.body.password, 200);
  if (!email || !password) return res.status(400).json({ error: 'Введите почту и пароль' });
  const lock = auth.lockState(req, email);
  if (lock.locked) {
    return res.status(429).json({ error: `Слишком много попыток. Подождите ${lock.minutes} мин. или восстановите пароль по ссылке «Забыли пароль?».`, locked: true });
  }
  const a = db.adminFile.data;
  if (email !== a.email || !auth.verifyPassword(password, a.hash)) {
    const left = auth.registerFail(req, email);
    if (left === 0) return res.status(429).json({ error: 'Слишком много попыток. Подождите 15 минут или восстановите пароль по ссылке «Забыли пароль?».', locked: true });
    return res.status(401).json({ error: `Почта или пароль не подошли. Проверьте раскладку и Caps Lock. Осталось попыток: ${left}.`, left });
  }
  auth.clearFails(req, email);
  auth.startSession(req, res, !!req.body.remember);
  res.json({ ok: true, email: a.email });
});

router.post('/logout', (req, res) => {
  auth.endSession(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const me = auth.currentAdmin(req);
  if (!me) return res.status(401).json({ error: 'Нужно войти в админку' });
  res.json(me);
});

const forgotLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: 'Слишком много запросов. Попробуйте через 15 минут.' });
router.post('/forgot', forgotLimiter, async (req, res) => {
  const email = str(req.body.email, 200).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(422).json({ error: 'Похоже, в почте ошибка. Пример: name@клиника.рф' });
  // Ответ всегда одинаковый, чтобы нельзя было выяснить, какая почта заведена.
  if (email === db.adminFile.data.email) {
    const token = auth.createResetToken();
    const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    await notify.sendResetMail(email, `${base.replace(/\/$/, '')}/admin/reset?token=${token}`);
  }
  res.json({ ok: true });
});

const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Слишком много попыток. Попробуйте через 15 минут.' });
router.post('/reset', resetLimiter, (req, res) => {
  const password = str(req.body.password, 200);
  if (password.length < 8) return res.status(422).json({ error: 'Пароль слишком короткий: не меньше 8 символов' });
  if (!auth.consumeResetToken(str(req.body.token, 200), password)) {
    return res.status(400).json({ error: 'Ссылка устарела или уже использована. Запросите новую на странице входа.' });
  }
  res.json({ ok: true });
});

// ---------- Дальше только для вошедшего администратора ----------
router.use(auth.requireAdmin);

router.get('/bootstrap', (req, res) => res.json(state(req)));

router.put('/sections/:key', (req, res) => {
  const key = req.params.key;
  if (!S.SECTIONS[key]) return res.status(404).json({ error: 'Такого блока нет' });
  const values = {};
  for (const f of S.SECTIONS[key].fields) if (!f.locked) values[f.k] = str(req.body[f.k], 500).trim();
  const errors = S.validateSection(key, values);
  if (Object.keys(errors).length) return fail(res, errors);
  db.editDraft((c) => { c[key] = { ...c[key], ...values }; });
  reply(req, res);
});

// Услуги
router.post('/services', (req, res) => {
  const d = { title: str(req.body.title, 100), desc: str(req.body.desc, 200), price: S.digits(req.body.price) };
  const errors = S.validateService(d);
  if (Object.keys(errors).length) return fail(res, errors);
  const item = { id: uid('s'), title: d.title.trim(), desc: d.desc.trim(), price: String(Number(d.price)), visible: true };
  db.editDraft((c) => c.services.push(item));
  reply(req, res, { id: item.id });
});
router.put('/services/:id', (req, res) => {
  const d = { title: str(req.body.title, 100), desc: str(req.body.desc, 200), price: S.digits(req.body.price) };
  const errors = S.validateService(d);
  if (Object.keys(errors).length) return fail(res, errors);
  const found = db.editDraft((c) => {
    const s = c.services.find((x) => x.id === req.params.id);
    if (!s) return false;
    Object.assign(s, { title: d.title.trim(), desc: d.desc.trim(), price: String(Number(d.price)) });
    return true;
  });
  if (!found) return res.status(404).json({ error: 'Услуга не найдена' });
  reply(req, res);
});
router.patch('/services/:id/visible', (req, res) => {
  const found = db.editDraft((c) => {
    const s = c.services.find((x) => x.id === req.params.id);
    if (!s) return false;
    s.visible = !!req.body.visible;
    return true;
  });
  if (!found) return res.status(404).json({ error: 'Услуга не найдена' });
  reply(req, res);
});

// Врачи
const doctorFields = (b) => ({
  name: str(b.name, 200).trim(), spec: str(b.spec, 10), exp: S.digits(b.exp).slice(0, 2),
  bio: str(b.bio, 1000).trim(), photoId: b.photoId ? str(b.photoId, 40) : null, visible: b.visible !== false
});
function checkPhoto(c, photoId) {
  return !photoId || c.media.some((m) => m.id === photoId && m.kind !== 'video');
}
router.post('/doctors', (req, res) => {
  const d = doctorFields(req.body);
  const errors = S.validateDoctor(d);
  if (Object.keys(errors).length) return fail(res, errors);
  if (!checkPhoto(db.draft(), d.photoId)) return fail(res, { photo: 'Фото не найдено. Загрузите его заново' });
  const item = { id: uid('d'), ...d };
  db.editDraft((c) => c.doctors.push(item));
  reply(req, res, { id: item.id });
});
router.put('/doctors/:id', (req, res) => {
  const d = doctorFields(req.body);
  const errors = S.validateDoctor(d);
  if (Object.keys(errors).length) return fail(res, errors);
  if (!checkPhoto(db.draft(), d.photoId)) return fail(res, { photo: 'Фото не найдено. Загрузите его заново' });
  const found = db.editDraft((c) => {
    const x = c.doctors.find((y) => y.id === req.params.id);
    if (!x) return false;
    Object.assign(x, d);
    return true;
  });
  if (!found) return res.status(404).json({ error: 'Врач не найден' });
  reply(req, res);
});

// Фото и видео
// Разные версии multer отдают имя файла то в utf-8, то как latin1-байты: чиним только второй случай.
const fixName = (n) => {
  if (/[^\u0000-\u00ff]/.test(n)) return n;
  const fixed = Buffer.from(n, 'latin1').toString('utf8');
  return fixed.includes('\ufffd') ? n : fixed;
};
router.post('/media', upload.single('file'), async (req, res) => {
  try {
    const saved = await saveUpload(req.file);
    const base = fixName(req.file.originalname || '').replace(/\.[^.]+$/, '').slice(0, S.LIMITS.mediaName) || 'Новый файл';
    const kind = saved.kind === 'video' ? 'video' : req.body.kind === 'doctor' ? 'doctor' : 'interior';
    const item = { id: uid('m'), name: base, alt: '', kind, url: saved.url, crop: null, placeholder: false };
    db.editDraft((c) => c.media.unshift(item));
    reply(req, res, { id: item.id });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});
router.put('/media/:id', (req, res) => {
  const name = str(req.body.name, 200).trim();
  const alt = str(req.body.alt, 400).trim();
  if (!name) return fail(res, { name: 'Дайте файлу название, чтобы его легко найти' });
  if (name.length > S.LIMITS.mediaName) return fail(res, { name: 'Слишком длинно' });
  if (alt.length > S.LIMITS.mediaAlt) return fail(res, { alt: 'Слишком длинно' });
  const slotsWanted = Array.isArray(req.body.slots) ? req.body.slots.filter((s) => S.SLOTS[s]) : null;
  const m = db.draft().media.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Файл не найден' });
  if (slotsWanted && slotsWanted.length && m.kind !== 'interior') {
    return fail(res, { slots: 'На сайт в эти места можно поставить только фото интерьера' });
  }
  db.editDraft((c) => {
    const x = c.media.find((y) => y.id === m.id);
    x.name = name; x.alt = alt;
    if (slotsWanted) {
      for (const slot of Object.keys(S.SLOTS)) {
        if (slotsWanted.includes(slot)) c.slots[slot] = x.id;
        else if (c.slots[slot] === x.id) c.slots[slot] = null;
      }
    }
  });
  reply(req, res);
});
router.post('/media/:id/replace', upload.single('file'), async (req, res) => {
  const m = db.draft().media.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Файл не найден' });
  try {
    const saved = await saveUpload(req.file);
    if ((saved.kind === 'video') !== (m.kind === 'video')) throw new Error('Заменить можно только файлом того же типа: фото на фото, видео на видео');
    db.editDraft((c) => {
      const x = c.media.find((y) => y.id === m.id);
      x.url = saved.url; x.crop = null; x.placeholder = false;
    });
    reply(req, res);
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});
router.delete('/media/:id', (req, res) => {
  const c = db.draft();
  const m = c.media.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Файл не найден' });
  if (db.mediaUsage(c, m.id).length) return res.status(409).json({ error: 'Этот снимок сейчас стоит на сайте, поэтому удалить его нельзя. Сначала замените его на другой.' });
  db.editDraft((d) => { d.media = d.media.filter((x) => x.id !== m.id); });
  reply(req, res);
});

// Заявки
router.get('/requests', (req, res) => res.json({ items: db.activeRequests(), telegram: notify.tgConfigured() }));
router.put('/requests/:id', (req, res) => {
  const patch = {};
  if (req.body.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) return res.status(422).json({ error: 'Неизвестный статус' });
    patch.status = req.body.status;
  }
  if (req.body.note !== undefined) patch.note = str(req.body.note, 500);
  const r = db.updateRequest(req.params.id, patch);
  if (!r) return res.status(404).json({ error: 'Заявка не найдена' });
  res.json({ item: r, newRequests: db.activeRequests().filter((x) => x.status === 'new').length });
});

// Публикация
router.post('/publish', (req, res) => {
  const exclude = Array.isArray(req.body.exclude) ? req.body.exclude.map((k) => str(k, 80)) : [];
  const out = db.publish(req.admin.name, exclude);
  if (out.error === 'license') return res.status(422).json({ error: 'Не заполнен номер лицензии. Публиковать сайт без него нельзя.', code: 'license' });
  if (out.error === 'nothing') return res.status(422).json({ error: 'Нет изменений для публикации', code: 'nothing' });
  reply(req, res, { count: out.count });
});
router.post('/versions/:id/restore', (req, res) => {
  const out = db.restore(Number(req.params.id), req.admin.name);
  if (out.error) return res.status(404).json({ error: 'Такой версии нет' });
  reply(req, res);
});

router.use((req, res) => res.status(404).json({ error: 'Не найдено' }));

module.exports = router;
