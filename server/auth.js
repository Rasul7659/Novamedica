'use strict';
// Вход в админку: пароль хранится как scrypt-хеш, сессия — подписанный cookie без хранения на сервере.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./store');
const { adminFile } = require('./db');

const COOKIE = 'nm_admin';
const SHORT_TTL = 12 * 3600 * 1000;       // «чужой компьютер»: сессия на 12 часов
const LONG_TTL = 30 * 24 * 3600 * 1000;   // «запомнить меня»: 30 дней
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

// Секрет подписи: из окружения, иначе генерируется один раз и хранится в data/.
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(DATA_DIR, 'secret.key');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) =>
  salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return test.length === expected.length && crypto.timingSafeEqual(test, expected);
}

// Первый запуск: создаём администратора из ADMIN_EMAIL / ADMIN_PASSWORD (или с случайным паролем).
function ensureAdmin() {
  const a = adminFile.data;
  if (a.email && a.hash) return null;
  const email = (process.env.ADMIN_EMAIL || 'admin@novamedica.ru').trim().toLowerCase();
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  adminFile.mutate((d) => {
    d.email = email;
    d.hash = hashPassword(password);
    d.pwdVersion = 1;
    d.name = 'Администратор клиники';
  });
  return generated ? { email, password } : { email, password: null };
}

const sign = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
};
function unsign(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function startSession(req, res, remember) {
  const ttl = remember ? LONG_TTL : SHORT_TTL;
  const token = sign({ e: adminFile.data.email, v: adminFile.data.pwdVersion, x: Date.now() + ttl });
  const secure = req.secure || process.env.NODE_ENV === 'production';
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure, path: '/',
    ...(remember ? { maxAge: ttl } : {})
  });
}
const endSession = (res) => res.clearCookie(COOKIE, { path: '/' });

function currentAdmin(req) {
  const p = unsign(parseCookies(req)[COOKIE]);
  const a = adminFile.data;
  if (!p || p.x < Date.now() || p.e !== a.email || p.v !== a.pwdVersion) return null;
  return { email: a.email, name: a.name || 'Администратор клиники' };
}

// Изменяющие запросы принимаем только с заголовком, который чужая страница отправить не может (CSRF).
function requireFetchHeader(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-requested-with') !== 'fetch') {
    return res.status(403).json({ error: 'Запрос отклонён' });
  }
  next();
}

// Для API: без входа — 401. Для изменяющих запросов нужен заголовок, который чужой сайт отправить не может.
function requireAdmin(req, res, next) {
  const me = currentAdmin(req);
  if (!me) return res.status(401).json({ error: 'Нужно войти в админку' });
  req.admin = me;
  next();
}

// ----- Защита от подбора пароля -----
const fails = new Map(); // ключ: ip|email -> {n, until}
const failKey = (req, email) => req.ip + '|' + String(email || '').toLowerCase();

function lockState(req, email) {
  const f = fails.get(failKey(req, email));
  if (f && f.until && f.until > Date.now()) return { locked: true, minutes: Math.ceil((f.until - Date.now()) / 60000) };
  if (f && f.until && f.until <= Date.now()) fails.delete(failKey(req, email));
  return { locked: false };
}
function registerFail(req, email) {
  const k = failKey(req, email);
  const f = fails.get(k) || { n: 0 };
  f.n += 1;
  if (f.n >= MAX_FAILS) f.until = Date.now() + LOCK_MS;
  fails.set(k, f);
  return Math.max(0, MAX_FAILS - f.n);
}
const clearFails = (req, email) => fails.delete(failKey(req, email));

// ----- Восстановление пароля -----
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
function createResetToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  adminFile.mutate((d) => { d.reset = { hash: hashToken(token), exp: Date.now() + 3600 * 1000 }; });
  return token;
}
function consumeResetToken(token, password) {
  const r = adminFile.data.reset;
  if (!r || r.exp < Date.now() || !token || hashToken(String(token)) !== r.hash) return false;
  adminFile.mutate((d) => {
    d.hash = hashPassword(password);
    d.pwdVersion = (d.pwdVersion || 1) + 1; // все старые сессии перестают работать
    delete d.reset;
  });
  return true;
}

module.exports = {
  ensureAdmin, requireFetchHeader, verifyPassword, currentAdmin, requireAdmin, startSession, endSession,
  lockState, registerFail, clearFails, createResetToken, consumeResetToken, MAX_FAILS
};
