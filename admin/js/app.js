import { $, $$, esc, api, toast, refreshChrome, ICON } from './core.js';

const ROUTES = {
  '/admin': () => import('./pages/home.js'),
  '/admin/requests': () => import('./pages/requests.js'),
  '/admin/content': () => import('./pages/content.js'),
  '/admin/services': () => import('./pages/services.js'),
  '/admin/doctors': () => import('./pages/doctors.js'),
  '/admin/media': () => import('./pages/media.js'),
  '/admin/publish': () => import('./pages/publish.js'),
  '/admin/help': () => import('./pages/help.js')
};
const AUTH_ROUTES = ['/admin/login', '/admin/reset'];
const SITE_GROUP = ['/admin/services', '/admin/doctors', '/admin/content', '/admin/media'];

const app = $('#app');
let state = null;
let current = null;   // { path, instance }

const ctx = {
  get state() { return state; },
  setState(next) { state = next; refreshChrome(state); },
  query: () => new URLSearchParams(location.search),
  navigate: (href) => go(href),
  toast
};

const normalize = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

function shell(path) {
  const link = (href, label, extra = '') =>
    `<a class="nv${path === href ? ' on' : ''}" data-link href="${href}">${label}${extra}</a>`;
  const reqBadge = `<span class="badge" data-newreq data-zero="${!state.newRequests}">${state.newRequests}</span>`;
  const mTab = (href, label, icon, on, badge = '') =>
    `<a class="${on ? 'on' : ''}" data-link href="${href}">${icon}${label}${badge}</a>`;
  const ic = (d, w = 1.6) => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  return `<div class="shell">
<aside class="side">
<a class="brand" href="/" target="_blank" rel="noopener" aria-label="Открыть сайт"><img src="/assets/logo.svg" alt=""><span>NOVAMEDICA</span></a>
<nav class="nav" aria-label="Разделы админки">
<div class="nav__cap">Главное</div>
${link('/admin', 'Главная')}
${link('/admin/requests', 'Заявки', reqBadge)}
<div class="nav__cap">Содержимое сайта</div>
${link('/admin/content', 'Тексты и контакты')}
${link('/admin/services', 'Услуги и цены')}
${link('/admin/doctors', 'Врачи')}
${link('/admin/media', 'Фото и видео')}
<div class="nav__cap">Ещё</div>
${link('/admin/publish', 'Публикация и история')}
${link('/admin/help', 'Помощь')}
</nav>
<div class="me"><b>${esc(state.me.name)}</b><small>${esc(state.me.email)}</small><button class="linkbtn" type="button" data-logout>Выйти</button></div>
</aside>
<div class="main" id="page" tabindex="-1"></div>
</div>
<nav class="tabbar" aria-label="Разделы">
${mTab('/admin', 'Главная', ic('<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'), path === '/admin')}
${mTab('/admin/requests', 'Заявки', ic('<path d="M4 5h16v11H9l-5 4z"/>', path === '/admin/requests' ? 1.8 : 1.6), path === '/admin/requests', `<span class="badge" data-newreq data-zero="${!state.newRequests}">${state.newRequests}</span>`)}
${mTab('/admin/services', 'Сайт', ic('<path d="M4 6h16M4 12h16M4 18h10"/>'), SITE_GROUP.includes(path))}
<button type="button" data-more class="${path === '/admin/publish' || path === '/admin/help' ? 'on' : ''}">${ic('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', 1.8)}Ещё</button>
</nav>`;
}

function moreSheet() {
  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = `<div class="sheet__in" role="dialog" aria-label="Все разделы">
<a data-link href="/admin/content">Тексты и контакты</a><a data-link href="/admin/services">Услуги и цены</a>
<a data-link href="/admin/doctors">Врачи</a><a data-link href="/admin/media">Фото и видео</a>
<a data-link href="/admin/publish">Публикация и история</a><a data-link href="/admin/help">Помощь</a>
<a href="/" target="_blank" rel="noopener">Открыть сайт</a><button type="button" data-logout>Выйти</button></div>`;
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-link]') || e.target.closest('[data-logout]')) el.remove();
  });
  document.body.appendChild(el);
}

async function logout() {
  try { await api('POST', '/logout'); } catch { /* всё равно выходим */ }
  location.assign('/admin/login');
}

async function go(href, { replace = false } = {}) {
  const url = new URL(href, location.origin);
  if (current?.instance?.dirty?.() && !confirm('Есть несохранённые правки. Уйти без сохранения?')) return;
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  await render();
}

async function render() {
  const path = normalize(location.pathname);
  if (current?.instance?.destroy) current.instance.destroy();
  current = null;

  if (AUTH_ROUTES.includes(path)) {
    try { const me = await api('GET', '/me'); if (me && path === '/admin/login') return go('/admin', { replace: true }); } catch { /* не вошли — так и надо */ }
    const mod = await import('./pages/auth.js');
    app.innerHTML = '';
    current = { path, instance: mod.mount(app, { reset: path === '/admin/reset', query: ctx.query() }) };
    document.title = 'Вход — Novamedica';
    return;
  }

  if (!state) {
    try { state = await api('GET', '/bootstrap'); }
    catch (e) { if (e.status !== 401) app.innerHTML = `<p class="boot">${esc(e.message)}</p>`; return; }
  }
  const loader = ROUTES[path];
  if (!loader) {
    app.innerHTML = shell('') ;
    $('#page').innerHTML = '<div class="card card--empty"><b>Такой страницы нет</b><span>Вернитесь на <a data-link href="/admin"><u>главную</u></a>.</span></div>';
    return;
  }
  if (!$('.shell') || $('.shell').dataset.path !== path) app.innerHTML = shell(path);
  $('.shell').dataset.path = path;
  const mod = await loader();
  const page = $('#page');
  page.innerHTML = '';
  // Свежее состояние при каждом заходе: заявки могли прийти, пока страница была открыта
  try { state = await api('GET', '/bootstrap'); refreshChrome(state); } catch { /* используем прежнее */ }
  current = { path, instance: mod.mount(page, ctx) };
  document.title = (mod.title || 'Админка') + ' — Novamedica';
  window.scrollTo(0, 0);
  page.focus({ preventScroll: true });
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
    e.preventDefault();
    go(a.getAttribute('href'));
    return;
  }
  if (e.target.closest('[data-logout]')) logout();
  else if (e.target.closest('[data-more]')) moreSheet();
});
window.addEventListener('popstate', () => render());
window.addEventListener('beforeunload', (e) => { if (current?.instance?.dirty?.()) { e.preventDefault(); e.returnValue = ''; } });

render();
