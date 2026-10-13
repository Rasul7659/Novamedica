'use strict';
// Данные, сохранённые до появления управляемых специальностей, должны подхватываться без потерь.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const run = (data, port) => spawn('node', ['server/index.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: String(port), DATA_DIR: data, ADMIN_EMAIL: 'admin@test.ru', ADMIN_PASSWORD: 'correct-horse-1' },
  stdio: 'ignore'
});
async function up(base) {
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/robots.txt'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('сервер не запустился');
}

test('старый content.json без specialties: сайт и админка работают, данные не теряются', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-mig-'));
  const port = 19600 + Math.floor(Math.random() * 300);
  const base = 'http://127.0.0.1:' + port;

  // 1) создаём свежие данные и «старим» файл: убираем specialties отовсюду
  let p = run(data, port);
  await up(base);
  await fetch(base + '/');
  p.kill();
  await new Promise((r) => setTimeout(r, 200));
  const f = path.join(data, 'content.json');
  const old = JSON.parse(fs.readFileSync(f, 'utf8'));
  old.draft.doctors[0].name = 'Старая запись врача';
  old.published.doctors[0].name = 'Старая запись врача';
  for (const c of [old.draft, old.published, ...old.versions.map((v) => v.content)]) delete c.specialties;
  fs.writeFileSync(f, JSON.stringify(old));
  assert.ok(!JSON.stringify(old).includes('specialties'));

  // 2) запускаем снова: данные должны подхватиться
  p = run(data, port + 1);
  const base2 = 'http://127.0.0.1:' + (port + 1);
  try {
    await up(base2);
    const landing = await (await fetch(base2 + '/')).text();
    assert.match(landing, /Старая запись врача/, 'данные врачей на месте');
    assert.match(landing, /<div class="doctor__role">Дерматолог<\/div>/);
    assert.match(landing, /data-filter="cosm">Косметолог<\/button>/, 'фильтр по специальностям работает');
    const login = await fetch(base2 + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' }, body: JSON.stringify({ email: 'admin@test.ru', password: 'correct-horse-1' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const st = await (await fetch(base2 + '/api/admin/bootstrap', { headers: { cookie } })).json();
    assert.deepEqual(st.draft.specialties.map((s) => s.id), ['derm', 'cosm']);
    assert.equal(st.changes.length, 0, 'миграция не создаёт «неопубликованных изменений»');
    const saved = JSON.parse(fs.readFileSync(f, 'utf8'));
    assert.ok(saved.versions.every((v) => Array.isArray(v.content.specialties)), 'история версий тоже дополнена');
    // откат к старой версии не ломает сайт
    const rb = await fetch(base2 + `/api/admin/versions/${st.versions[0].id}/restore`, { method: 'POST', headers: { cookie, 'x-requested-with': 'fetch' } });
    assert.equal(rb.status, 200);
  } finally { p.kill(); }
});
