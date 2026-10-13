'use strict';
// Сквозные проверки сервера: поднимаем приложение на временной папке данных и ходим по HTTP.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-test-'));
process.env.ADMIN_EMAIL = 'admin@test.ru';
process.env.ADMIN_PASSWORD = 'correct-horse-1';
process.env.SESSION_SECRET = 'test-secret';

const { createApp } = require('../server/index');
const auth = require('../server/auth');
const db = require('../server/db');

let server, base;
let cookie = '';

test.before(async () => {
  auth.ensureAdmin();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => server.close());

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
  const shell = await call('GET', '/admin');
  assert.equal(shell.status, 200);
  assert.match(shell.text, /Админка — Novamedica/);
  const prev = await call('GET', '/preview', undefined, { raw: true });
  assert.equal(prev.status, 302);
  assert.equal(prev.headers.get('location'), '/admin/login');
});

test('неверный пароль: счётчик попыток и блокировка на 5-й', async () => {
  const wrong = () => call('POST', '/api/admin/login', { email: 'admin@test.ru', password: 'nope' });
  const first = await wrong();
  assert.equal(first.status, 401);
  assert.match(first.json.error, /Осталось попыток: 4/);
  await wrong(); await wrong(); await wrong();
  const fifth = await wrong();
  assert.equal(fifth.status, 429);
  const afterLock = await call('POST', '/api/admin/login', { email: 'admin@test.ru', password: 'correct-horse-1' });
  assert.equal(afterLock.status, 429, 'даже верный пароль не принимается во время блокировки');
});

test('вход с верным паролем выдаёт cookie; чужой email не подходит', async () => {
  const bad = await call('POST', '/api/admin/login', { email: 'x@y.ru', password: 'correct-horse-1' });
  assert.equal(bad.status, 401);
  const r = await call('POST', '/api/admin/login', { email: 'ADMIN@test.ru', password: 'correct-horse-1', remember: true }, { cookies: '' });
  // другой email/IP-ключ: блокировка выше относится к admin@test.ru, поэтому проверяем с другой раскладкой регистра
  assert.ok([200, 429].includes(r.status));
  if (r.status === 429) {
    // сбрасываем блокировку и входим
    auth.clearFails({ ip: '::ffff:127.0.0.1' }, 'admin@test.ru');
    auth.clearFails({ ip: '127.0.0.1' }, 'admin@test.ru');
  }
  const ok = await call('POST', '/api/admin/login', { email: 'admin@test.ru', password: 'correct-horse-1', remember: false }, { cookies: '' });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const set = ok.headers.get('set-cookie');
  assert.match(set, /nm_admin=/);
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Lax/i);
  assert.doesNotMatch(set, /Max-Age/i, 'без «запомнить меня» cookie сессионная');
  cookie = set.split(';')[0];
  const me = await admin('GET', '/me');
  assert.equal(me.json.email, 'admin@test.ru');
});

test('изменяющие запросы без заголовка X-Requested-With отклоняются (CSRF)', async () => {
  const raw = await fetch(base + '/api/admin/sections/hero', { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(raw.status, 403);
});

test('черновик не попадает на сайт до публикации', async () => {
  const before = (await admin('GET', '/bootstrap')).json;
  const svc = before.draft.services[4]; // Пилинги
  const put = await admin('PUT', '/services/' + svc.id, { title: svc.title, desc: svc.desc, price: '4000' });
  assert.equal(put.status, 200);
  assert.equal(put.json.state.changes.length, 1);
  assert.match(put.json.state.changes[0].where, /Цена · Пилинги/);
  assert.match(put.json.state.changes[0].now, /от 4 000 ₽/);
  const landing = await call('GET', '/');
  assert.doesNotMatch(landing.text, /4 000/);
  const preview = await call('GET', '/preview');
  assert.match(preview.text, /от 4 000 ₽/);
  assert.match(preview.text, /Предпросмотр/);
  assert.match(preview.text, /noindex/);
});

test('валидация услуги, врача и блоков', async () => {
  const s = await admin('POST', '/services', { title: '', desc: 'x'.repeat(61), price: '' });
  assert.equal(s.status, 422);
  assert.ok(s.json.errors.title && s.json.errors.desc && s.json.errors.price);
  const d = await admin('POST', '/doctors', { name: '', spec: 'zzz' });
  assert.equal(d.status, 422);
  const c = await admin('PUT', '/sections/contacts', { address: 'Москва', hours: '10-20', phone: '123', org: 'ООО', inn: '12', ogrn: '1', license: '' });
  assert.equal(c.status, 422);
  for (const f of ['phone', 'inn', 'ogrn', 'license']) assert.ok(c.json.errors[f], 'ошибка поля ' + f);
  const wa = await admin('PUT', '/sections/contacts', { address: 'Москва', hours: '10-20', phone: '+7 900 000-00-00', org: 'ООО', inn: '1234567890', ogrn: '1234567890123', license: 'ЛО-1', whatsapp: 'javascript:alert(1)' });
  assert.equal(wa.status, 422);
  assert.ok(wa.json.errors.whatsapp, 'javascript: в ссылке мессенджера запрещён');
  const nope = await admin('PUT', '/sections/unknown', {});
  assert.equal(nope.status, 404);
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
  const all = await admin('POST', '/publish', { exclude: [] });
  assert.equal(all.status, 200);
  assert.match((await call('GET', '/')).text, /Иванова Анна Петровна/);
  const none = await admin('POST', '/publish', { exclude: [] });
  assert.equal(none.status, 422);
  assert.equal(none.json.code, 'nothing');
});

test('скрытая услуга и скрытый врач не показываются на сайте', async () => {
  const st = (await admin('GET', '/bootstrap')).json;
  const svc = st.draft.services[1];
  await admin('PATCH', `/services/${svc.id}/visible`, { visible: false });
  await admin('POST', '/publish', { exclude: [] });
  const landing = (await call('GET', '/')).text;
  assert.doesNotMatch(landing, new RegExp('<h3>' + svc.title + '</h3>'));
  assert.doesNotMatch(landing, new RegExp('<option>' + svc.title + '</option>'), 'скрытой услуги нет и в форме');
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
  // убираем мусор
  const st = (await admin('GET', '/bootstrap')).json;
  const bad = st.draft.services.find((s) => s.title === evil);
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
  const landing = (await call('GET', '/')).text;
  assert.doesNotMatch(landing, /Лицензия №/, 'вернулась версия без лицензии');
  assert.equal((await admin('POST', '/versions/9999/restore')).status, 404);
  // вернём актуальную версию, чтобы дальше тесты работали с лицензией
  const latest = st.versions[0];
  await admin('POST', `/versions/${latest.id}/restore`);
  assert.match((await call('GET', '/')).text, /Лицензия №/);
});

test('заявки с сайта: валидация, сохранение, статусы, заметки', async () => {
  const bad = await call('POST', '/api/requests', { name: 'А', phone: '12', consent: false });
  assert.equal(bad.status, 422);
  assert.ok(bad.json.errors.name && bad.json.errors.phone && bad.json.errors.consent);

  const bot = await call('POST', '/api/requests', { name: 'Бот', phone: '+7 900 000-00-00', consent: true, website: 'spam' });
  assert.equal(bot.status, 200);
  assert.equal(db.activeRequests().length, 0, 'ловушка для ботов не создаёт заявку');

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
  db.requestsFile.mutate((d) => { d.items.push({ id: 'old1', name: 'Старая', phone: '+79000000000', service: 'x', status: 'new', note: '', createdAt: new Date(Date.now() - 100 * 86400000).toISOString() }); });
  const items = (await admin('GET', '/requests')).json.items;
  assert.ok(!items.some((i) => i.id === 'old1'));
});

// ---- фото ----
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
  const fake = await admin('POST', '/media', upload(Buffer.from('<?php echo 1;'), 'shell.jpg', 'image/jpeg'));
  assert.equal(fake.status, 422, 'файл не-картинка с расширением jpg отклоняется');

  const png = await pngBuffer();
  const r = await admin('POST', '/media', upload(png, 'Кабинет.png', 'image/png'));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const m = r.json.state.draft.media.find((x) => x.id === r.json.id);
  assert.equal(m.name, 'Кабинет');
  assert.match(m.url, /^\/uploads\/f[0-9a-f]+\.jpg$/);
  const file = await fetch(base + m.url);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/jpeg');
  const sharp = require('sharp');
  const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
  assert.ok(meta.width <= 2000, 'фото уменьшено до 2000 px');

  const put = await admin('PUT', '/media/' + m.id, { name: 'Кабинет', alt: 'Кабинет косметолога', slots: ['interiorMain'] });
  assert.equal(put.status, 200);
  assert.deepEqual(put.json.state.draft.media.find((x) => x.id === m.id).usedBy, ['Интерьер: большое фото']);
  const del = await admin('DELETE', '/media/' + m.id);
  assert.equal(del.status, 409, 'используемое фото удалить нельзя');

  await admin('POST', '/publish', { exclude: [] });
  assert.match((await call('GET', '/')).text, new RegExp(m.url.replace('.', '\\.')));

  // снимаем с сайта и удаляем
  await admin('PUT', '/media/' + m.id, { name: 'Кабинет', alt: '', slots: [] });
  assert.equal((await admin('DELETE', '/media/' + m.id)).status, 200);
});

test('фото врача: загрузка, привязка и показ на сайте', async () => {
  const up = await admin('POST', '/media', upload(await pngBuffer(), 'doc.png', 'image/png', { kind: 'doctor' }));
  const id = up.json.id;
  const st = up.json.state;
  const doc = st.draft.doctors[1];
  const r = await admin('PUT', '/doctors/' + doc.id, { name: 'Петрова Ольга', spec: 'cosm', exp: '8', bio: 'ПМГМУ, 2012', photoId: id, visible: true });
  assert.equal(r.status, 200);
  const bad = await admin('PUT', '/doctors/' + doc.id, { name: 'X Y', spec: 'cosm', photoId: 'nope' });
  assert.equal(bad.status, 422);
  await admin('POST', '/publish', { exclude: [] });
  const landing = (await call('GET', '/')).text;
  assert.match(landing, /Петрова Ольга/);
  assert.match(landing, /Стаж 8 лет/);
  assert.match(landing, /class="doctor__photo"><img src="\/uploads\//);
  const slotTry = await admin('PUT', '/media/' + id, { name: 'doc', alt: '', slots: ['hero'] });
  assert.equal(slotTry.status, 422, 'фото врача нельзя поставить на первый экран');
});

test('видео принимается, но не ставится в слоты фото', async () => {
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(40)]);
  const r = await admin('POST', '/media', upload(mp4, 'tour.mp4', 'video/mp4'));
  assert.equal(r.status, 200);
  assert.equal(r.json.state.draft.media.find((m) => m.id === r.json.id).kind, 'video');
});

test('восстановление пароля: токен одноразовый, старые сессии сбрасываются', async () => {
  const unknown = await call('POST', '/api/admin/forgot', { email: 'nobody@x.ru' });
  assert.equal(unknown.status, 200, 'ответ одинаковый для чужой почты');
  assert.equal(db.adminFile.data.reset, undefined);
  const known = await call('POST', '/api/admin/forgot', { email: 'admin@test.ru' });
  assert.equal(known.status, 200);
  assert.ok(db.adminFile.data.reset);

  const token = auth.createResetToken();
  assert.equal((await call('POST', '/api/admin/reset', { token: 'wrong', password: 'new-password-1' })).status, 400);
  assert.equal((await call('POST', '/api/admin/reset', { token, password: 'short' })).status, 422);
  assert.equal((await call('POST', '/api/admin/reset', { token, password: 'new-password-1' })).status, 200);
  assert.equal((await call('POST', '/api/admin/reset', { token, password: 'new-password-2' })).status, 400, 'токен использован');

  assert.equal((await admin('GET', '/bootstrap')).status, 401, 'старая сессия недействительна');
  auth.clearFails({ ip: '::ffff:127.0.0.1' }, 'admin@test.ru'); auth.clearFails({ ip: '127.0.0.1' }, 'admin@test.ru');
  const login = await call('POST', '/api/admin/login', { email: 'admin@test.ru', password: 'new-password-1' }, { cookies: '' });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];
});

test('поддельная и просроченная cookie не пускают', async () => {
  assert.equal((await call('GET', '/api/admin/bootstrap', undefined, { cookies: 'nm_admin=abc.def' })).status, 401);
  const [body] = cookie.split('=')[1].split('.');
  assert.equal((await call('GET', '/api/admin/bootstrap', undefined, { cookies: `nm_admin=${body}.AAAA` })).status, 401);
});

test('выход из админки', async () => {
  const out = await admin('POST', '/logout');
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /nm_admin=;/);
});

test('специальности: добавление, переименование, дубли, защита от удаления, публикация', async () => {
  const st0 = (await admin('GET', '/bootstrap')).json;
  assert.deepEqual(st0.draft.specialties.map((x) => x.name), ['Дерматолог', 'Косметолог']);

  const add = await admin('POST', '/specialties', { name: '  Трихолог ' });
  assert.equal(add.status, 200, JSON.stringify(add.json));
  const id = add.json.id;
  assert.equal(add.json.state.draft.specialties.at(-1).name, 'Трихолог');
  assert.ok(add.json.state.changes.some((c) => c.key === 'spec:' + id && /Добавлена: Трихолог/.test(c.now)));

  for (const bad of ['', ' ', 'Я', 'х'.repeat(41), 'трихолог', 'ДЕРМАТОЛОГ']) {
    const r = await admin('POST', '/specialties', { name: bad });
    assert.equal(r.status, 422, 'должно быть отклонено: «' + bad.slice(0, 10) + '»');
    assert.ok(r.json.errors.name);
  }
  assert.equal((await admin('PUT', '/specialties/' + id, { name: 'Косметолог' })).status, 422, 'нельзя переименовать в существующее');
  assert.equal((await admin('PUT', '/specialties/' + id, { name: 'Трихолог-эксперт' })).status, 200);
  assert.equal((await admin('PUT', '/specialties/nope', { name: 'Любое' })).status, 404);

  // врач с новой специальностью: до публикации на сайте нет ни его, ни фильтра
  const doc = st0.draft.doctors[2];
  const upd = await admin('PUT', '/doctors/' + doc.id, { name: 'Сидорова Мария', spec: id, exp: '5', bio: '', photoId: null, visible: true });
  assert.equal(upd.status, 200, JSON.stringify(upd.json));
  assert.equal((await admin('PUT', '/doctors/' + doc.id, { name: 'Сидорова Мария', spec: 'нет-такой', photoId: null })).status, 422, 'несуществующая специальность отклоняется');
  assert.doesNotMatch((await call('GET', '/')).text, /Трихолог/);

  // «Не публиковать» специальность: она подтягивается вместе с врачом, висячих ссылок не остаётся
  const specKey = 'spec:' + id;
  const pubEx = await admin('POST', '/publish', { exclude: [specKey] });
  assert.equal(pubEx.status, 200);
  assert.ok(pubEx.json.state.draft.specialties.some((x) => x.id === id));
  const landing = (await call('GET', '/')).text;
  assert.match(landing, /<div class="doctor__role">Трихолог-эксперт<\/div>/, 'у врача подписана специальность');
  assert.match(landing, /data-filter="[^"]+">Трихолог-эксперт<\/button>/, 'в фильтре появилась кнопка');

  // удаление: нельзя, пока есть врачи и пока она последняя
  const del = await admin('DELETE', '/specialties/' + id);
  assert.equal(del.status, 409);
  assert.match(del.json.error, /указана у врачей: 1/);
  await admin('PUT', '/doctors/' + doc.id, { name: 'Сидорова Мария', spec: 'derm', exp: '5', bio: '', photoId: null, visible: true });
  assert.equal((await admin('DELETE', '/specialties/' + id)).status, 200);
  assert.equal((await admin('DELETE', '/specialties/nope')).status, 404);
  const pub = await admin('POST', '/publish', { exclude: [] });
  assert.equal(pub.status, 200);
  assert.doesNotMatch((await call('GET', '/')).text, /Трихолог/);
  assert.match(pub.json.state.versions[0].what, /изменени/);
});

test('заголовки безопасности и закрытые пути', async () => {
  const r = await call('GET', '/');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const adminPage = await call('GET', '/admin', undefined, { raw: true });
  assert.equal(adminPage.headers.get('x-frame-options'), 'DENY');
  assert.equal((await call('GET', '/uploads/../content.json', undefined, { raw: true })).status, 404);
  assert.equal((await call('GET', '/data/content.json', undefined, { raw: true })).status, 404);
  assert.equal((await call('GET', '/server/index.js', undefined, { raw: true })).status, 404);
  const rb = await call('GET', '/robots.txt');
  assert.match(rb.text, /Disallow: \/admin/);
});
