'use strict';
const path = require('path');
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const notify = require('./notify');
const S = require('./schema');
const { UPLOADS_DIR, DATA_DIR } = require('./store');
const { renderLanding } = require('./render');
const { rateLimit } = require('./ratelimit');
const adminApi = require('./api-admin');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ADMIN_DIR = path.join(__dirname, '..', 'admin');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data:",
        "media-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ')
    });
    next();
  });

  app.use(express.json({ limit: '100kb' }));

  // Статика
  const revalidate = { setHeaders: (res) => res.set('Cache-Control', 'no-cache') };
  app.use('/css', express.static(path.join(PUBLIC_DIR, 'css'), revalidate));
  app.use('/js', express.static(path.join(PUBLIC_DIR, 'js'), revalidate));
  app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { maxAge: '1d' }));
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny' }));
  app.use('/admin/static', express.static(ADMIN_DIR, revalidate));

  // Лендинг
  app.get('/', (req, res) => {
    res.set('Cache-Control', 'no-cache').type('html').send(renderLanding(db.published()));
  });
  app.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nDisallow: /admin\nDisallow: /preview\nDisallow: /api/\n'));

  // Предпросмотр черновика — только для вошедшего администратора
  app.get('/preview', (req, res) => {
    if (!auth.currentAdmin(req)) return res.redirect('/admin/login');
    res.set('Cache-Control', 'no-store').type('html').send(renderLanding(db.draft(), { preview: true }));
  });

  // Заявки с лендинга
  const leadLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: 'Вы уже отправили несколько заявок. Подождите немного или позвоните нам.' });
  app.post('/api/requests', leadLimiter, (req, res) => {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true }); // ловушка для ботов: делаем вид, что приняли
    const name = String(b.name || '').trim().slice(0, 80);
    const phone = String(b.phone || '').trim().slice(0, 30);
    const topic = String(b.topic || 'Нужна помощь с выбором').trim().slice(0, 100);
    const errors = {};
    if (name.length < 2) errors.name = 'Подскажите, как к вам обращаться';
    if (!S.validPhone(phone)) errors.phone = 'Похоже, не хватает цифр. Пример: +7 900 000-00-00';
    if (b.consent !== true) errors.consent = 'Без согласия мы не можем принять заявку';
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Проверьте поля формы', errors });
    const item = db.addRequest({ name, phone, service: topic });
    notify.notifyNewRequest(item); // не ждём: заявка уже сохранена
    res.json({ ok: true });
  });

  // Админка
  app.use('/api/admin', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, adminApi);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Не найдено' }));
  const adminShell = (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' }).sendFile(path.join(ADMIN_DIR, 'index.html'));
  };
  app.get(['/admin', '/admin/*'], adminShell);

  app.use((req, res) => res.status(404).type('text').send('Страница не найдена'));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный запрос' });
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Файл слишком большой. Фото — до 10 МБ, видео — до 30 МБ' });
    console.error('[error]', err);
    res.status(500).json({ error: 'Что-то пошло не так. Попробуйте ещё раз' });
  });
  return app;
}

function start(port = Number(process.env.PORT || 3000)) {
  const created = auth.ensureAdmin();
  if (created) {
    console.log('\n──────────────── Админка Novamedica ────────────────');
    console.log(`  Вход: /admin    Почта: ${created.email}`);
    console.log(created.password ? `  Пароль (показан один раз): ${created.password}` : '  Пароль задан из ADMIN_PASSWORD');
    console.log('────────────────────────────────────────────────────\n');
  }
  return createApp().listen(port, () => console.log(`Novamedica: http://localhost:${port}  (данные: ${DATA_DIR})`));
}

if (require.main === module) start();

module.exports = { createApp, start };
