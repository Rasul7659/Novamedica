// Общие помощники админки: запросы к API, форматирование, уведомления, шапка страницы.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data || {}; }
}

export async function api(method, url, body, form) {
  const opts = { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api/admin' + url, opts); }
  catch { throw new ApiError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.', 0); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !/^\/(login|forgot|reset|me)/.test(url)) {
    location.assign('/admin/login');
    throw new ApiError('Нужно войти заново', 401);
  }
  if (!res.ok) throw new ApiError(data.error || 'Что-то пошло не так. Попробуйте ещё раз.', res.status, data);
  return data;
}

// ---------- Уведомление ----------
let toastTimer, toastEl;
export function toast(msg, { err = false, ms = 2800 } = {}) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);
  }
  toastEl.className = 'toast' + (err ? ' toast--err' : '');
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

// ---------- Форматирование ----------
export const money = (p) => (p ? 'от ' + String(p).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽' : 'Цена не указана');
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const pad = (n) => String(n).padStart(2, '0');
export const fmtDateTime = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fmtPublished = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} в ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export function fmtAgo(iso) {
  const d = new Date(iso), now = new Date();
  const min = Math.floor((now - d) / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} ${plural(min, 'минуту', 'минуты', 'минут')} назад`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay && min < 180) return `${Math.floor(min / 60)} ${plural(Math.floor(min / 60), 'час', 'часа', 'часов')} назад`;
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay) return 'сегодня, ' + hm;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'вчера, ' + hm;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many;
}
export const digits = (s) => String(s || '').replace(/\D/g, '');
export const telHref = (v) => {
  const d = digits(v);
  if (d.length === 11 && (d[0] === '8' || d[0] === '7')) return '+7' + d.slice(1);
  if (d.length === 10) return '+7' + d;
  return d.length >= 11 ? '+' + d : '';
};

export const ICON = {
  arrowRight: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E3323" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  phone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  warn: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>',
  upload: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4E5530" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V5M7 9l5-5 5 5M5 19h14"/></svg>',
  check: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>'
};

// ---------- Шапка страницы ----------
export function head(title, sub, state, { publish = true, extra = '' } = {}) {
  const n = state.changes.length;
  return `<header class="head"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>
<div class="head__actions">${extra}${publish ? `<span class="pill" data-pill${n ? '' : ' hidden'}><i></i>Есть неопубликованные изменения</span>
<a class="btn btn--olive" data-link href="/admin/publish" data-publish-btn>Опубликовать<span data-pending-wrap${n ? '' : ' hidden'}> · <span data-pending>${n}</span></span></a>` : ''}</div></header>`;
}

// Обновляет счётчики вне основного содержимого страницы (боковое меню, кнопка «Опубликовать»).
export function refreshChrome(state) {
  const n = state.changes.length;
  $$('[data-pending]').forEach((el) => { el.textContent = n; });
  $$('[data-pending-wrap]').forEach((el) => { el.hidden = !n; });
  $$('[data-pill]').forEach((el) => { el.hidden = !n; });
  $$('[data-newreq]').forEach((el) => { el.textContent = state.newRequests; el.dataset.zero = String(!state.newRequests); });
}

export const fieldHint = (hint, err, count, max) =>
  `<div class="hint"><span class="${err ? 'err' : ''}">${esc(err || hint || '')}</span>${max ? `<span data-count${count > max ? ' class="over"' : ''}>${count} из ${max}</span>` : ''}</div>`;

export const isMobile = () => window.matchMedia('(max-width:900px)').matches;
