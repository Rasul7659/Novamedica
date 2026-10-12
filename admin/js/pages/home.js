import { esc, head, fmtAgo, fmtPublished, plural } from '../core.js';

export const title = 'Главная';

export function mount(root, ctx) {
  const s = ctx.state;
  const n = s.newRequests;
  const pend = s.changes.length;
  const c = s.completeness;
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'Доброй ночи!' : hour < 12 ? 'Доброе утро!' : hour < 18 ? 'Добрый день!' : 'Добрый вечер!';
  const quick = [
    ['Изменить цену услуги', '/admin/services'], ['Добавить новую услугу', '/admin/services?new=1'],
    ['Добавить врача', '/admin/doctors?new=1'], ['Поменять телефон или адрес', '/admin/content?tab=contacts'],
    ['Загрузить фото или видео', '/admin/media'], ['Временно скрыть услугу', '/admin/services']
  ];
  root.innerHTML = `${head(hello, 'Здесь всё, что нужно для сайта клиники.', s, { publish: false, extra: `<a class="btn btn--line" href="/" target="_blank" rel="noopener">Открыть сайт</a>
<a class="btn btn--olive" data-link href="/admin/publish">Опубликовать<span data-pending-wrap${pend ? '' : ' hidden'}> · <span data-pending>${pend}</span></span></a>` })}
<section class="stat-row">
<a class="stat stat--dark" data-link href="/admin/requests"><small>Новые заявки</small><span class="num">${n}</span><span class="go">${n ? 'Посмотреть и позвонить →' : 'Новых заявок пока нет'}</span></a>
<a class="stat" data-link href="/admin/publish"><small>${pend ? 'Изменения ещё не на сайте' : 'Все изменения на сайте'}</small><span class="num">${pend}</span><span class="go" style="color:#3E4526">${pend ? 'Проверить и опубликовать →' : 'Открыть историю →'}</span></a>
<div class="stat"><small>Сайт</small><span class="big">Опубликован ${esc(fmtPublished(s.publishedAt))}</span><span class="live"><i></i>Работает, заявки приходят</span></div>
</section>
<section style="display:flex;flex-direction:column;gap:16px"><h2 class="section-title">Что хотите сделать?</h2>
<div class="todo-grid">${quick.map(([t, h]) => `<a data-link href="${h}">${t}<span>→</span></a>`).join('')}</div></section>
<div class="cols">
<section class="box grow" style="flex:1.4 1 460px;gap:8px">
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><h2>Свежие заявки</h2><a class="linkbtn" style="margin:0" data-link href="/admin/requests">Все заявки</a></div>
${s.freshRequests.length ? s.freshRequests.map((r) => `<div class="row-line"><div class="grow"><b>${esc(r.name)}</b><small>${esc(r.service)} · ${esc(fmtAgo(r.createdAt))}</small></div>
<a class="btn btn--olive btn--sm" href="tel:${esc(r.phone.replace(/[^+\d]/g, ''))}">Позвонить</a></div>`).join('')
    : '<div class="row-line"><span class="note">Новых заявок нет. Когда кто-то оставит телефон на сайте, заявка появится здесь.</span></div>'}
</section>
<section class="box" style="flex:1 1 320px;gap:16px">
<div><h2>Что осталось заполнить</h2><p class="note" style="font-size:14px;margin-top:4px">Заполнено ${c.done} из ${c.total} ${plural(c.total, 'пункта', 'пунктов', 'пунктов')}</p></div>
<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${c.total}" aria-valuenow="${c.done}"><div style="width:${Math.round(c.done / c.total * 100)}%"></div></div>
<div>${c.items.map((i) => `<a class="check ${i.done ? 'check--done' : ''}" data-link href="/admin/${i.href}"><span>${i.done ? '<span class="ok">✓</span> ' : ''}${esc(i.label)}${i.note ? ` <span class="note">${esc(i.note)}</span>` : ''}</span><span>→</span></a>`).join('')}</div>
</section></div>`;
  return {};
}
