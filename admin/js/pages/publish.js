import { esc, api, toast, ICON, fmtDateTime, plural, ApiError } from '../core.js';

export const title = 'Публикация и история';

export function mount(root, ctx) {
  const st = { stage: 'review', progress: 0, skip: new Set(), ask: null, busy: false };
  let timer;
  const included = () => ctx.state.changes.filter((c) => !st.skip.has(c.key));

  function review() {
    const s = ctx.state;
    const all = s.changes;
    const inc = included();
    const n = inc.length;
    const canPublish = !s.licenseMissing && n > 0;
    const sub = all.length ? `Всего ${n} ${plural(n, 'изменение', 'изменения', 'изменений')}${st.skip.size ? ` из ${all.length}` : ''}. Пока вы их не опубликовали, посетители видят старую версию.` : 'Новых изменений нет.';
    const hint = s.licenseMissing ? 'Кнопка включится, когда будет заполнен номер лицензии. Публикация занимает около минуты. Если что-то пойдёт не так, сайт вернётся к прошлой версии сам.'
      : n === 0 ? 'Кнопка включится, когда появятся изменения.' : 'Публикация занимает около минуты. Если что-то пойдёт не так, сайт вернётся к прошлой версии сам.';
    return `<div><h2 style="font-size:26px;letter-spacing:-0.02em">${all.length ? 'Проверьте, что изменится на сайте' : 'Всё опубликовано'}</h2><p class="note" style="font-size:15px;margin-top:6px">${esc(sub)}</p></div>
${all.length ? `<div class="changes">${all.map((c) => `<div class="change ${st.skip.has(c.key) ? 'skip' : ''}"><span class="w">${esc(c.where)}</span>
<span class="what">${c.old ? `<span class="old">${esc(c.old)}</span> <span aria-hidden="true">→</span> ` : ''}<b style="font-weight:600">${esc(c.now)}</b></span>
<a data-link href="/admin/${c.page}">Открыть</a>
<button type="button" data-act="skip" data-k="${esc(c.key)}">${st.skip.has(c.key) ? 'Всё же публиковать' : 'Не публиковать'}</button></div>`).join('')}</div>`
    : '<div class="card--empty" style="padding:28px 20px;border-radius:16px;background:var(--bg);text-align:center;display:flex;flex-direction:column;gap:6px"><b style="font-size:18px">Нет изменений для публикации</b><span class="note" style="font-size:14px">Сайт показывает то же, что и в админке.</span></div>'}
${s.licenseMissing && all.length ? `<div class="alert alert--warn">${ICON.warn}<span><b>Не заполнен номер лицензии.</b> Публиковать сайт без него нельзя. <a data-link href="/admin/content?tab=contacts" style="border-bottom:1px solid #B8923F">Заполнить</a></span></div>` : ''}
<div class="foot-actions"><button type="button" class="btn btn--olive btn--lg" data-act="publish" aria-disabled="${!canPublish}" ${canPublish ? '' : 'style="background:#BDB9A5;cursor:not-allowed"'}>Опубликовать на сайте</button>
<a class="btn btn--line btn--lg" style="font-size:16px;font-weight:500" href="/preview" target="_blank" rel="noopener">Посмотреть до публикации</a></div>
<p class="note">${esc(hint)}</p>`;
  }

  const publishing = () => `<div style="display:flex;flex-direction:column;gap:16px;padding:20px 0"><h2 style="font-size:26px;letter-spacing:-0.02em">Публикуем…</h2>
<div class="progress-lg" role="progressbar" aria-valuenow="${st.progress}" aria-valuemin="0" aria-valuemax="100"><div style="width:${st.progress}%"></div></div>
<p class="note" style="font-size:15px">Это занимает около минуты. Окно можно не закрывать — сайт всё это время работает как обычно.</p></div>`;
  const done = () => `<div class="stack"><div class="alert alert--ok" style="align-items:center;padding:16px 18px;font-size:16px"><span style="width:26px;height:26px;border-radius:50%;background:var(--ok);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg></span>
<span>Готово. Изменения уже на сайте. <a href="/" target="_blank" rel="noopener" style="border-bottom:1px solid var(--ok)">Открыть сайт</a></span></div>
<p class="note" style="font-size:14px">Если что-то пошло не так, справа можно вернуть прошлую версию.</p>
<button type="button" class="btn btn--line" style="align-self:flex-start" data-act="ok">Хорошо</button></div>`;

  function versions() {
    return ctx.state.versions.map((v) => `<div class="ver"><div class="top"><b>${esc(fmtDateTime(v.at))}</b>${v.current ? '<span class="cur">Сейчас на сайте</span>' : ''}</div>
<span class="who">${esc(v.who)}</span><span style="font-size:14px">${esc(v.what)}</span>
${!v.current && st.ask !== v.id ? `<button type="button" class="btn btn--line btn--sm" style="align-self:flex-start;margin-top:4px" data-act="ask" data-id="${v.id}">Вернуть эту версию</button>` : ''}
${st.ask === v.id ? `<div class="confirm"><span>Сайт станет таким, каким был ${esc(fmtDateTime(v.at))}.${ctx.state.changes.length ? ` Неопубликованные правки в админке (${ctx.state.changes.length}) тоже будут сброшены.` : ''} Заявки не пропадут.</span>
<span style="display:flex;gap:8px"><button type="button" class="btn btn--olive btn--sm" data-act="restore" data-id="${v.id}">Да, вернуть</button><button type="button" class="btn btn--line btn--sm" data-act="noask">Отмена</button></span></div>` : ''}</div>`).join('');
  }

  function render() {
    root.innerHTML = `<header class="head"><div><h1>Публикация и история</h1><p>Сайт меняется только после кнопки «Опубликовать на сайте».</p></div></header>
<div class="cols"><section class="card" style="flex:1.3 1 520px;min-width:0;padding:32px;gap:24px">${st.stage === 'review' ? review() : st.stage === 'publishing' ? publishing() : done()}</section>
<aside class="card side-card" style="flex:1 1 360px;max-width:460px;gap:16px"><div><h2 style="font-size:22px;letter-spacing:-0.02em">Прошлые версии сайта</h2>
<p class="note" style="font-size:14px;margin-top:4px">Если что-то опубликовали по ошибке, верните прежнюю версию в один клик. Заявки при этом не пропадут.</p></div>
<div style="border-top:1px solid var(--line2)">${versions()}</div></aside></div>`;
  }

  async function publish() {
    const s = ctx.state;
    if (s.licenseMissing) { toast('Сначала заполните номер лицензии в разделе «Тексты и контакты»', { err: true }); return; }
    if (!included().length) { toast('Нет изменений для публикации', { err: true }); return; }
    if (st.busy) return;
    st.busy = true; st.stage = 'publishing'; st.progress = 10; render();
    timer = setInterval(() => { st.progress = Math.min(90, st.progress + 20); const el = root.querySelector('.progress-lg > div'); if (el) el.style.width = st.progress + '%'; }, 250);
    try {
      const [out] = await Promise.all([api('POST', '/publish', { exclude: [...st.skip] }), new Promise((r) => setTimeout(r, 900))]);
      ctx.setState(out.state); st.skip.clear(); st.stage = 'done'; st.progress = 100;
    } catch (err) {
      st.stage = 'review'; toast(err instanceof ApiError ? err.message : 'Не удалось опубликовать', { err: true });
    }
    clearInterval(timer); st.busy = false; render();
  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'skip') {
      const k = b.dataset.k;
      if (st.skip.has(k)) st.skip.delete(k); else { st.skip.add(k); toast('Изменение не попадёт на сайт. Оно останется в админке как черновик'); }
      render();
    }
    else if (a === 'publish') publish();
    else if (a === 'ok') { st.stage = 'review'; st.progress = 0; render(); }
    else if (a === 'ask') { st.ask = Number(b.dataset.id); render(); }
    else if (a === 'noask') { st.ask = null; render(); }
    else if (a === 'restore') {
      try {
        const out = await api('POST', `/versions/${b.dataset.id}/restore`);
        ctx.setState(out.state); st.ask = null; st.skip.clear();
        toast('Готово. Сайт вернулся к прошлой версии');
      } catch (err) { toast(err.message, { err: true }); }
      render();
    }
  });
  render();
  return { destroy() { clearInterval(timer); } };
}
