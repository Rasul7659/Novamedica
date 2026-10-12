import { esc, api, ICON } from '../core.js';

export const title = 'Вход';

export function mount(root, { reset, query }) {
  const st = { view: reset ? 'reset' : 'login', email: '', pass: '', pass2: '', show: false, remember: true, tried: false, loading: false, error: '', sent: false, done: false };

  const emailErr = () => {
    if (!st.tried) return '';
    if (!st.email.trim()) return 'Введите почту, на которую заведена админка';
    if (!/^\S+@\S+\.\S+$/.test(st.email.trim())) return 'Похоже, в почте ошибка. Пример: name@клиника.рф';
    return '';
  };

  function body() {
    if (st.view === 'login') {
      const ee = emailErr();
      const pe = st.tried && !st.pass ? 'Введите пароль' : '';
      return `<div class="stack">
<div><h1>Вход в админку</h1><p class="sub">Здесь вы меняете тексты, цены и смотрите заявки.</p></div>
${st.error ? `<div class="alert alert--err" role="alert">${ICON.warn}<span>${esc(st.error)}</span></div>` : ''}
<form class="stack" id="login-form" novalidate>
<div class="field"><label for="a-email">Почта</label>
<input class="inp" id="a-email" type="email" autocomplete="username" placeholder="name@клиника.рф" value="${esc(st.email)}" ${ee ? 'aria-invalid="true"' : ''}>
<div class="hint"><span class="err">${esc(ee)}</span></div></div>
<div class="field"><div style="display:flex;justify-content:space-between;align-items:baseline"><label for="a-pass">Пароль</label>
<button type="button" class="linkbtn" style="margin:0;font-size:14px" data-act="forgot">Забыли пароль?</button></div>
<div class="passwrap"><input class="inp" id="a-pass" type="${st.show ? 'text' : 'password'}" autocomplete="current-password" value="${esc(st.pass)}" ${pe ? 'aria-invalid="true"' : ''}>
<button type="button" data-act="show" aria-pressed="${st.show}">${st.show ? 'Скрыть' : 'Показать'}</button></div>
<div class="hint"><span class="err">${esc(pe)}</span></div></div>
<label class="chk"><input type="checkbox" id="a-remember" ${st.remember ? 'checked' : ''}> Запомнить меня на этом компьютере</label>
<button class="btn btn--dark btn-block" type="submit" ${st.loading ? 'disabled' : ''}>${st.loading ? 'Входим…' : 'Войти'}</button>
</form>
<p class="note">Чужой компьютер? Снимите галочку: мы сами закроем вход через 12 часов.</p></div>`;
    }
    if (st.view === 'forgot') {
      const ee = emailErr();
      return `<div class="stack"><div><h1>Восстановить пароль</h1><p class="sub">Пришлём на почту ссылку, по ней можно задать новый пароль.</p></div>
${st.sent
    ? '<div class="alert alert--ok" role="status">Если такая почта есть в админке, мы отправили на неё письмо. Оно придёт в течение пары минут. Проверьте также «Спам».</div>'
    : `${st.error ? `<div class="alert alert--err" role="alert">${ICON.warn}<span>${esc(st.error)}</span></div>` : ''}
<form class="stack" id="forgot-form" novalidate><div class="field"><label for="a-femail">Почта, на которую заведена админка</label>
<input class="inp" id="a-femail" type="email" placeholder="name@клиника.рф" value="${esc(st.email)}" ${ee ? 'aria-invalid="true"' : ''}>
<div class="hint"><span class="err">${esc(ee)}</span></div></div>
<button class="btn btn--dark btn-block" type="submit" ${st.loading ? 'disabled' : ''}>Прислать ссылку</button></form>`}
<button type="button" class="linkbtn" style="font-size:15px;min-height:44px" data-act="login">← Вернуться ко входу</button></div>`;
    }
    // reset
    if (st.done) {
      return `<div class="stack"><span class="okmark">${ICON.check}</span><div><h1>Пароль изменён</h1><p class="sub">Теперь можно войти с новым паролем.</p></div>
<a class="btn btn--olive btn-block" href="/admin/login">Перейти ко входу</a></div>`;
    }
    const pe = st.tried && st.pass.length < 8 ? 'Пароль слишком короткий: не меньше 8 символов' : st.tried && st.pass !== st.pass2 ? 'Пароли не совпадают' : '';
    return `<div class="stack"><div><h1>Новый пароль</h1><p class="sub">Придумайте пароль не короче 8 символов.</p></div>
${st.error ? `<div class="alert alert--err" role="alert">${ICON.warn}<span>${esc(st.error)}</span></div>` : ''}
<form class="stack" id="reset-form" novalidate>
<div class="field"><label for="a-np">Новый пароль</label><input class="inp" id="a-np" type="password" autocomplete="new-password" value="${esc(st.pass)}" ${pe ? 'aria-invalid="true"' : ''}></div>
<div class="field"><label for="a-np2">Повторите пароль</label><input class="inp" id="a-np2" type="password" autocomplete="new-password" value="${esc(st.pass2)}" ${pe ? 'aria-invalid="true"' : ''}>
<div class="hint"><span class="err">${esc(pe)}</span></div></div>
<button class="btn btn--dark btn-block" type="submit" ${st.loading ? 'disabled' : ''}>Сохранить пароль</button></form></div>`;
  }

  function render(focusId) {
    root.innerHTML = `<div class="auth">
<div><a class="back" href="/"><span aria-hidden="true">←</span>На сайт клиники</a></div>
<main><div class="box-in">
<div class="brand-row"><div class="brand" style="padding:0"><img src="/assets/logo.svg" alt="" style="height:44px"><span style="font-size:16px">NOVAMEDICA</span></div>
<span class="tag">${esc(location.host)}/admin</span></div>
${body()}</div></main>
<div class="foot">Нужна помощь со входом? Позвоните администратору сайта.</div></div>`;
    if (focusId) document.getElementById(focusId)?.focus();
  }

  root.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'a-email' || id === 'a-femail') st.email = e.target.value;
    else if (id === 'a-pass' || id === 'a-np') st.pass = e.target.value;
    else if (id === 'a-np2') st.pass2 = e.target.value;
    else if (id === 'a-remember') st.remember = e.target.checked;
    if (id === 'a-pass') st.error = st.error && !/попыток/.test(st.error) ? '' : st.error;
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'show') { st.show = !st.show; render('a-pass'); }
    if (b.dataset.act === 'forgot') { st.view = 'forgot'; st.tried = false; st.sent = false; st.error = ''; render('a-femail'); }
    if (b.dataset.act === 'login') { st.view = 'login'; st.tried = false; st.error = ''; render('a-email'); }
  });
  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (st.loading) return;
    st.tried = true; st.error = '';
    try {
      if (e.target.id === 'login-form') {
        if (emailErr() || !st.pass) return render(emailErr() ? 'a-email' : 'a-pass');
        st.loading = true; render();
        await api('POST', '/login', { email: st.email, password: st.pass, remember: st.remember });
        location.assign('/admin');
        return;
      }
      if (e.target.id === 'forgot-form') {
        if (emailErr()) return render('a-femail');
        st.loading = true; render();
        await api('POST', '/forgot', { email: st.email });
        st.sent = true;
      }
      if (e.target.id === 'reset-form') {
        if (st.pass.length < 8 || st.pass !== st.pass2) return render('a-np');
        st.loading = true; render();
        await api('POST', '/reset', { token: query.get('token') || '', password: st.pass });
        st.done = true;
      }
    } catch (err) {
      st.error = err.message;
      st.tried = false;
      if (err.status === 401) st.pass = '';
    }
    st.loading = false;
    render(st.error && st.view === 'login' ? 'a-pass' : undefined);
  });

  render('a-email');
  return {};
}
