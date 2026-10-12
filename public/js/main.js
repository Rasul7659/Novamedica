(function () {
  'use strict';

  // ---- Мобильное меню ----
  var burger = document.querySelector('.burger');
  var menu = document.getElementById('mobile-menu');

  function setMenu(open) {
    burger.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
  }
  burger.addEventListener('click', function () {
    setMenu(burger.getAttribute('aria-expanded') !== 'true');
  });
  menu.addEventListener('click', function (e) {
    if (e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setMenu(false);
  });
  window.matchMedia('(min-width:1001px)').addEventListener('change', function (m) {
    if (m.matches) setMenu(false);
  });

  // ---- Фильтр врачей ----
  var chips = document.querySelectorAll('.chip');
  var doctors = document.querySelectorAll('.doctor');
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var f = chip.dataset.filter;
      chips.forEach(function (c) {
        c.classList.toggle('is-active', c === chip);
        c.setAttribute('aria-pressed', String(c === chip));
      });
      doctors.forEach(function (d) { d.hidden = f !== 'all' && d.dataset.role !== f; });
    });
  });

  // ---- Выбор направления по клику на услугу ----
  var topic = document.getElementById('f-topic');
  document.querySelectorAll('.service').forEach(function (s) {
    s.addEventListener('click', function () {
      var t = s.dataset.topic;
      Array.prototype.forEach.call(topic.options, function (o) {
        if (o.text === t) topic.value = o.value;
      });
    });
  });

  // ---- Форма записи ----
  var form = document.getElementById('lead-form');
  var done = document.getElementById('form-done');
  var statusEl = document.getElementById('form-error');
  var nameI = form.elements.name;
  var phoneI = form.elements.phone;
  var consent = form.elements.consent;
  var submitBtn = form.querySelector('button[type="submit"]');

  function setError(input, msg) {
    var box = input.closest('.field') || input.closest('.consent-wrap');
    var err = box.querySelector('.field__error');
    box.classList.toggle('is-invalid', !!msg);
    err.textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !msg;
  }
  function phoneOk(v) {
    var d = v.replace(/\D/g, '');
    return d.length >= 10 && d.length <= 15;
  }
  function validate() {
    return [
      setError(nameI, nameI.value.trim().length > 1 ? '' : 'Подскажите, как к вам обращаться'),
      setError(phoneI, phoneOk(phoneI.value) ? '' : 'Похоже, не хватает цифр. Пример: +7 900 000-00-00'),
      setError(consent, consent.checked ? '' : 'Без согласия мы не можем принять заявку')
    ].every(Boolean);
  }

  phoneI.addEventListener('input', function () {
    phoneI.value = phoneI.value.replace(/[^\d+\-()\s]/g, '');
    if (phoneI.closest('.is-invalid')) setError(phoneI, '');
  });
  nameI.addEventListener('input', function () { if (nameI.closest('.is-invalid')) setError(nameI, ''); });
  consent.addEventListener('change', function () { setError(consent, ''); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    statusEl.classList.remove('is-visible');
    if (!validate()) { form.querySelector('.is-invalid input').focus(); return; }
    submitBtn.disabled = true;
    var payload = {
      name: nameI.value.trim(),
      phone: phoneI.value.trim(),
      topic: form.elements.topic.value,
      consent: true,
      website: form.elements.website.value
    };
    fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; });
    }).then(function (r) {
      if (r.res.ok) {
        document.getElementById('done-name').textContent = payload.name;
        document.getElementById('done-phone').textContent = payload.phone;
        form.hidden = true;
        done.hidden = false;
        done.focus && done.setAttribute('tabindex', '-1');
        return;
      }
      if (r.data.errors) {
        if (r.data.errors.name) setError(nameI, r.data.errors.name);
        if (r.data.errors.phone) setError(phoneI, r.data.errors.phone);
        if (r.data.errors.consent) setError(consent, r.data.errors.consent);
      }
      statusEl.textContent = r.data.error || 'Не удалось отправить заявку. Позвоните нам, пожалуйста.';
      statusEl.classList.add('is-visible');
    }).catch(function () {
      statusEl.textContent = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
      statusEl.classList.add('is-visible');
    }).then(function () { submitBtn.disabled = false; });
  });

  document.getElementById('form-again').addEventListener('click', function () {
    form.reset();
    form.hidden = false;
    done.hidden = true;
    nameI.focus();
  });
})();
