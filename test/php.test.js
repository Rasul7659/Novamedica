'use strict';
// Те же сквозные проверки, но против PHP-версии: поднимаем `php -S` на временных папках и ходим по HTTP.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-php-'));
const DATA = path.join(TMP, 'data');
const PORT = 18000 + Math.floor(Math.random() * 1500);
let proc, base, cookie = '';

test.before(async () => {
  proc = spawn('php', ['-S', '127.0.0.1:' + PORT, 'router-dev.php'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATA_DIR: DATA, UPLOADS_DIR: path.join(TMP, 'uploads'), ADMIN_EMAIL: 'admin@test.ru', ADMIN_PASSWORD: 'correct-horse-1', SESSION_SECRET: 'test-secret', DEV_MAIL_LOG: '1' },
    stdio: 'ignore'
  });
  base = 'http://127.0.0.1:' + PORT;
  for (let i = 0; i < 50; i++) {
    try { await fetch(base + '/robots.txt'); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('php -S не запустился');
});
test.after(() => { proc.kill(); });

async function call(method, url, body, { cookies = cookie, headers = {}, raw = false } = {}) {
  const h = { ...headers };
  if (cookies) h.cookie = cookies;
  if (url.startsWith('/api/admin') && method !== 'GET') h['x-requested-with'] = 'fetch';
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers: h, body: payload, redirect: 'manual' });
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text, headers: res.headers };
}
const admin = (m, u, b) => call(m, '/api/admin' + u, b);
const login = (pw = 'correct-horse-1', extra = {}) => call('POST', '/api/admin/login', { email: 'admin@test.ru', password: pw, ...extra }, { cookies: '' });

test('лендинг отдаётся и содержит контент из админки', async () => {
  const r = await call('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.text, /Клиника эстетической и превентивной медицины в Москве/);
  assert.match(r.text, /Консультация дерматолога/);
  assert.doesNotMatch(r.text, /Лицензия №/, 'без номера лицензии строка не показывается');
});

test('без входа админка закрыта, а /admin отдаёт страницу входа', async () => {
  assert.equal((await admin('GET', '/bootstrap')).status, 401);
  assert.equal((await admin('PUT', '/sections/hero', {})).status, 401);
  for (const p of ['/admin', '/admin/login', '/admin/services']) {
    const shell = await call('GET', p);
    assert.equal(shell.status, 200, p);
    assert.match(shell.text, /Админка — Novamedica/);
  }
  const prev = await call('GET', '/preview', undefined, { raw: true });
  assert.equal(prev.status, 302);
  assert.equal(prev.headers.get('location'), '/admin/login');
});

test('вход: неверные данные, верный пароль, cookie', async () => {
  const bad = await login('wrong');
  assert.equal(bad.status, 401);
  assert.match(bad.json.error, /Осталось попыток: 4/);
  assert.equal((await call('POST', '/api/admin/login', { email: 'x@y.ru', password: 'correct-horse-1' }, { cookies: '' })).status, 401);
  assert.equal((await call('POST', '/api/admin/login', {}, { cookies: '' })).status, 400);
  const ok = await login('correct-horse-1', { remember: false });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const set = ok.headers.get('set-cookie');
  assert.match(set, /nm_admin=/);
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Lax/i);
  assert.doesNotMatch(set, /expires=(?!Thu, 01 Jan 1970)/i, 'без «запомнить меня» cookie сессионная');
  cookie = set.split(';')[0];
  assert.equal((await admin('GET', '/me')).json.email, 'admin@test.ru');
  const rem = await login('correct-horse-1', { remember: true });
  assert.match(rem.headers.get('set-cookie'), /expires=|Max-Age/i, 'с «запомнить меня» cookie живёт 30 дней');
});

test('изменяющие запросы без заголовка X-Requested-With отклоняются (CSRF)', async () => {
  const raw = await fetch(base + '/api/admin/sections/hero', { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(raw.status, 403);
});

test('черновик не попадает на сайт до публикации', async () => {
  const before = (await admin('GET', '/bootstrap')).json;
  const svc = before.draft.services[4];
  const put = await admin('PUT', '/services/' + svc.id, { title: svc.title, desc: svc.desc, price: '4000' });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  assert.equal(put.json.state.changes.length, 1);
  assert.match(put.json.state.changes[0].where, /Цена · Пилинги/);
  assert.match(put.json.state.changes[0].now, /от 4 000 ₽/);
  assert.doesNotMatch((await call('GET', '/')).text, /4 000/);
  const preview = await call('GET', '/preview');
  assert.match(preview.text, /от 4 000 ₽/);
  assert.match(preview.text, /Предпросмотр/);
  assert.match(preview.text, /noindex/);
});

test('валидация услуги, врача и блоков', async () => {
  const s = await admin('POST', '/services', { title: '', desc: 'x'.repeat(61), price: '' });
  assert.equal(s.status, 422);
  assert.ok(s.json.errors.title && s.json.errors.desc && s.json.errors.price);
  assert.equal((await admin('POST', '/doctors', { name: '', spec: 'zzz' })).status, 422);
  const c = await admin('PUT', '/sections/contacts', { address: 'Москва', hours: '10-20', phone: '123', org: 'ООО', inn: '12', ogrn: '1', license: '' });
  assert.equal(c.status, 422);
  for (const f of ['phone', 'inn', 'ogrn', 'license']) assert.ok(c.json.errors[f], 'ошибка поля ' + f);
  const wa = await admin('PUT', '/sections/contacts', { address: 'Москва', hours: '10-20', phone: '+7 900 000-00-00', org: 'ООО', inn: '1234567890', ogrn: '1234567890123', license: 'ЛО-1', whatsapp: 'javascript:alert(1)' });
  assert.equal(wa.status, 422);
  assert.ok(wa.json.errors.whatsapp, 'javascript: в ссылке мессенджера запрещён');
  assert.equal((await admin('PUT', '/sections/unknown', {})).status, 404);
});

test('публикация заблокирована без лицензии', async () => {
  const r = await admin('POST', '/publish', { exclude: [] });
  assert.equal(r.status, 422);
  assert.equal(r.json.code, 'license');
});

test('сохранение контактов, публикация и обновление лендинга', async () => {
  const save = await admin('PUT', '/sections/contacts', {
    address: 'Москва, Тверская, 1', hours: 'Ежедневно, 10:00–20:00', phone: '8 (900) 123-45-67',
    whatsapp: 'wa.me/79001234567', telegram: '@novamedica', org: 'ООО «Новамедика»', inn: '7701234567', ogrn: '1157746000000',
    license: 'ЛО-77-01-000001 от 01.01.2026'
  });
  assert.equal(save.status, 200, JSON.stringify(save.json));
  const pub = await admin('POST', '/publish', { exclude: [] });
  assert.equal(pub.status, 200, JSON.stringify(pub.json));
  assert.equal(pub.json.state.changes.length, 0);
  const landing = (await call('GET', '/')).text;
  assert.match(landing, /Лицензия № ЛО-77-01-000001 от 01\.01\.2026/);
  assert.match(landing, /от 4 000 ₽/);
  assert.match(landing, /href="tel:\+79001234567"/);
  assert.match(landing, /https:\/\/wa\.me\/79001234567/);
  assert.match(landing, /https:\/\/t\.me\/novamedica/);
  assert.match(landing, /ИНН 7701234567 · ОГРН 1157746000000/);
  assert.equal(pub.json.state.versions.length, 2);
  assert.equal(pub.json.state.versions[0].current, true);
});

test('«Не публиковать» оставляет изменение в черновике', async () => {
  const st = (await admin('GET', '/bootstrap')).json;
  const doc = st.draft.doctors[0];
  const s1 = st.draft.services[0];
  await admin('PUT', '/doctors/' + doc.id, { name: 'Иванова Анна Петровна', spec: 'derm', exp: '10', bio: '', photoId: null, visible: true });
  await admin('PUT', '/services/' + s1.id, { title: s1.title, desc: s1.desc, price: '3000' });
  const ch = (await admin('GET', '/bootstrap')).json.changes;
  assert.equal(ch.length, 2);
  const docKey = ch.find((c) => c.key.startsWith('doc:')).key;
  const r = await admin('POST', '/publish', { exclude: [docKey] });
  assert.equal(r.status, 200);
  const landing = (await call('GET', '/')).text;
  assert.match(landing, /от 3 000 ₽/);
  assert.doesNotMatch(landing, /Иванова Анна/);
  assert.equal(r.json.state.changes.length, 1, 'изменение врача осталось неопубликованным');
  assert.equal(r.json.state.draft.doctors[0].name, 'Иванова Анна Петровна');
  assert.equal((await admin('POST', '/publish', { exclude: [] })).status, 200);
  assert.match((await call('GET', '/')).text, /Иванова Анна Петровна/);
  const none = await admin('POST', '/publish', { exclude: [] });
  assert.equal(none.status, 422);
  assert.equal(none.json.code, 'nothing');
});

test('скрытая услуга не показывается на сайте и в форме', async () => {
  const st = (await admin('GET', '/bootstrap')).json;
  const svc = st.draft.services[1];
  await admin('PATCH', `/services/${svc.id}/visible`, { visible: false });
  await admin('POST', '/publish', { exclude: [] });
  const landing = (await call('GET', '/')).text;
  assert.doesNotMatch(landing, new RegExp('<h3>' + svc.title + '</h3>'));
  assert.doesNotMatch(landing, new RegExp('<option>' + svc.title + '</option>'));
  await admin('PATCH', `/services/${svc.id}/visible`, { visible: true });
  await admin('POST', '/publish', { exclude: [] });
});

test('XSS: HTML в названиях экранируется на сайте', async () => {
  const evil = '<script>alert(1)</script><img src=x onerror=1>';
  await admin('POST', '/services', { title: evil, desc: '"><b>', price: '100' });
  await admin('POST', '/publish', { exclude: [] });
  const landing = (await call('GET', '/')).text;
  assert.doesNotMatch(landing, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(landing, /<img src=x onerror=1>/);
  assert.match(landing, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  const bad = (await admin('GET', '/bootstrap')).json.draft.services.find((s) => s.title === evil);
  await admin('PATCH', `/services/${bad.id}/visible`, { visible: false });
  await admin('POST', '/publish', { exclude: [] });
});

test('история версий и возврат к прошлой', async () => {
  const st = (await admin('GET', '/bootstrap')).json;
  assert.ok(st.versions.length >= 4);
  const first = st.versions[st.versions.length - 1];
  const r = await admin('POST', `/versions/${first.id}/restore`);
  assert.equal(r.status, 200);
  assert.equal(r.json.state.versions.find((v) => v.current).id, first.id);
  assert.doesNotMatch((await call('GET', '/')).text, /Лицензия №/, 'вернулась версия без лицензии');
  assert.equal((await admin('POST', '/versions/9999/restore')).status, 404);
  await admin('POST', `/versions/${st.versions[0].id}/restore`);
  assert.match((await call('GET', '/')).text, /Лицензия №/);
});

test('заявки с сайта: валидация, сохранение, статусы, заметки', async () => {
  const bad = await call('POST', '/api/requests', { name: 'А', phone: '12', consent: false });
  assert.equal(bad.status, 422);
  assert.ok(bad.json.errors.name && bad.json.errors.phone && bad.json.errors.consent);
  const bot = await call('POST', '/api/requests', { name: 'Бот', phone: '+7 900 000-00-00', consent: true, website: 'spam' });
  assert.equal(bot.status, 200);
  assert.equal((await admin('GET', '/requests')).json.items.length, 0, 'ловушка для ботов не создаёт заявку');
  const ok = await call('POST', '/api/requests', { name: 'Мария', phone: '+7 900 111-22-33', topic: 'Чистки лица', consent: true });
  assert.equal(ok.status, 200);
  const list = (await admin('GET', '/requests')).json.items;
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'new');
  assert.equal(list[0].service, 'Чистки лица');
  assert.equal((await admin('GET', '/bootstrap')).json.newRequests, 1);
  const id = list[0].id;
  const up = await admin('PUT', '/requests/' + id, { status: 'wait', note: 'Перезвонить после 18:00' });
  assert.equal(up.json.item.status, 'wait');
  assert.equal(up.json.item.note, 'Перезвонить после 18:00');
  assert.equal(up.json.newRequests, 0);
  assert.equal((await admin('PUT', '/requests/' + id, { status: 'bogus' })).status, 422);
  assert.equal((await admin('PUT', '/requests/nope', { status: 'new' })).status, 404);
});

test('ограничение частоты заявок с одного адреса', async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await call('POST', '/api/requests', { name: 'Тест', phone: '+7 900 000-00-0' + i, consent: true });
  assert.equal(last.status, 429);
});

test('заявки старше 90 дней уходят из списка', async () => {
  const f = path.join(DATA, 'requests.json');
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  d.items.push({ id: 'old1', name: 'Старая', phone: '+79000000000', service: 'x', status: 'new', note: '', createdAt: new Date(Date.now() - 100 * 86400000).toISOString() });
  fs.writeFileSync(f, JSON.stringify(d));
  assert.ok(!(await admin('GET', '/requests')).json.items.some((i) => i.id === 'old1'));
});

async function pngBuffer() {
  const sharp = require('sharp');
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#88aa66' } }).png().toBuffer();
}
const upload = (buf, name, type, extra = {}) => {
  const f = new FormData();
  f.append('file', new Blob([buf], { type }), name);
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  return f;
};

test('загрузка фото: проверка содержимого, сжатие, привязка к месту на сайте', async () => {
  const fake = await admin('POST', '/media', upload(Buffer.from('<?php echo 1; ?> some padding text'), 'shell.jpg', 'image/jpeg'));
  assert.equal(fake.status, 422, 'файл не-картинка с расширением jpg отклоняется');
  const r = await admin('POST', '/media', upload(await pngBuffer(), 'Кабинет.png', 'image/png'));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const m = r.json.state.draft.media.find((x) => x.id === r.json.id);
  assert.equal(m.name, 'Кабинет');
  assert.match(m.url, /^\/uploads\/f[0-9a-f]+\.jpg$/);
  const file = await fetch(base + m.url);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/jpeg');
  const meta = await require('sharp')(Buffer.from(await file.arrayBuffer())).metadata();
  assert.ok(meta.width <= 2000, 'фото уменьшено до 2000 px');
  const put = await admin('PUT', '/media/' + m.id, { name: 'Кабинет', alt: 'Кабинет косметолога', slots: ['interiorMain'] });
  assert.equal(put.status, 200);
  assert.deepEqual(put.json.state.draft.media.find((x) => x.id === m.id).usedBy, ['Интерьер: большое фото']);
  assert.equal((await admin('DELETE', '/media/' + m.id)).status, 409, 'используемое фото удалить нельзя');
  await admin('POST', '/publish', { exclude: [] });
  assert.match((await call('GET', '/')).text, new RegExp(m.url.replace('.', '\\.')));
  await admin('PUT', '/media/' + m.id, { name: 'Кабинет', alt: '', slots: [] });
  assert.equal((await admin('DELETE', '/media/' + m.id)).status, 200);
});

test('фото врача: загрузка, привязка и показ на сайте', async () => {
  const up = await admin('POST', '/media', upload(await pngBuffer(), 'doc.png', 'image/png', { kind: 'doctor' }));
  const id = up.json.id;
  const doc = up.json.state.draft.doctors[1];
  const r = await admin('PUT', '/doctors/' + doc.id, { name: 'Петрова Ольга', spec: 'cosm', exp: '8', bio: 'ПМГМУ, 2012', photoId: id, visible: true });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal((await admin('PUT', '/doctors/' + doc.id, { name: 'X Y', spec: 'cosm', photoId: 'nope' })).status, 422);
  await admin('POST', '/publish', { exclude: [] });
  const landing = (await call('GET', '/')).text;
  assert.match(landing, /Петрова Ольга/);
  assert.match(landing, /Стаж 8 лет/);
  assert.match(landing, /class="doctor__photo"><img src="\/uploads\//);
  assert.equal((await admin('PUT', '/media/' + id, { name: 'doc', alt: '', slots: ['hero'] })).status, 422, 'фото врача нельзя поставить на первый экран');
});

test('видео принимается, но не ставится в слоты фото', async () => {
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(40)]);
  const r = await admin('POST', '/media', upload(mp4, 'tour.mp4', 'video/mp4'));
  assert.equal(r.status, 200);
  assert.equal(r.json.state.draft.media.find((m) => m.id === r.json.id).kind, 'video');
});

test('закрытые пути и заголовки безопасности', async () => {
  const r = await call('GET', '/');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await call('GET', '/admin', undefined, { raw: true })).headers.get('x-frame-options'), 'DENY');
  for (const p of ['/data/content.json', '/server/index.js', '/php/auth.php', '/package.json', '/config.php', '/uploads/../index.php']) {
    const s = (await call('GET', p, undefined, { raw: true })).status;
    assert.ok([403, 404].includes(s), p + ' → ' + s);
  }
  assert.match((await call('GET', '/robots.txt')).text, /Disallow: \/admin/);
  assert.equal((await call('POST', '/api/nothing', {}, { raw: true })).status, 404);
});

test('восстановление пароля: токен одноразовый, старые сессии сбрасываются', async () => {
  const unknown = await call('POST', '/api/admin/forgot', { email: 'nobody@x.ru' });
  assert.equal(unknown.status, 200, 'ответ одинаковый для чужой почты');
  assert.ok(!fs.existsSync(path.join(DATA, 'mail.log')), 'письмо чужой почте не отправляется');
  assert.equal((await call('POST', '/api/admin/forgot', { email: 'admin@test.ru' })).status, 200);
  const log = fs.readFileSync(path.join(DATA, 'mail.log'), 'utf8');
  const token = log.match(/reset\?token=([\w-]+)/)[1];
  assert.equal((await call('POST', '/api/admin/reset', { token: 'wrong', password: 'new-password-1' })).status, 400);
  assert.equal((await call('POST', '/api/admin/reset', { token, password: 'short' })).status, 422);
  assert.equal((await call('POST', '/api/admin/reset', { token, password: 'new-password-1' })).status, 200);
  assert.equal((await call('POST', '/api/admin/reset', { token, password: 'new-password-2' })).status, 400, 'токен использован');
  assert.equal((await admin('GET', '/bootstrap')).status, 401, 'старая сессия недействительна');
  const l = await login('new-password-1');
  assert.equal(l.status, 200);
  cookie = l.headers.get('set-cookie').split(';')[0];
});

test('поддельная cookie не пускает; выход из админки', async () => {
  assert.equal((await call('GET', '/api/admin/bootstrap', undefined, { cookies: 'nm_admin=abc.def' })).status, 401);
  const [body] = cookie.split('=')[1].split('.');
  assert.equal((await call('GET', '/api/admin/bootstrap', undefined, { cookies: `nm_admin=${body}.AAAA` })).status, 401);
  const out = await admin('POST', '/logout');
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /nm_admin=deleted|nm_admin=;/);
});

// Блокировка — последним: после неё вход с этого адреса на 15 минут закрыт.
test('5 неверных паролей подряд блокируют вход, даже верный пароль не принимается', async () => {
  const wrong = () => login('nope-nope-nope');
  for (let i = 0; i < 4; i++) assert.equal((await wrong()).status, 401);
  assert.equal((await wrong()).status, 429);
  const after = await login('new-password-1');
  assert.equal(after.status, 429);
  assert.match(after.json.error, /Слишком много попыток/);
});
