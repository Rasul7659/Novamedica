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
      chips.forEach(function (c) { c.classList.toggle('is-active', c === chip); });
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
  var status = form.querySelector('.form__status');
  var nameI = form.elements.name;
  var phoneI = form.elements.phone;
  var consent = form.elements.consent;

  function mark(input, ok) {
    var box = input.closest('.field') || input.closest('.consent');
    box.classList.toggle('is-invalid', !ok);
    return ok;
  }
  function phoneOk(v) {
    var d = v.replace(/\D/g, '');
    return d.length >= 10 && d.length <= 12;
  }

  phoneI.addEventListener('input', function () {
    phoneI.value = phoneI.value.replace(/[^\d+\-()\s]/g, '');
  });
  [nameI, phoneI].forEach(function (i) {
    i.addEventListener('input', function () { i.closest('.field').classList.remove('is-invalid'); });
  });
  consent.addEventListener('change', function () { mark(consent, true); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.classList.remove('is-visible');
    var ok = [
      mark(nameI, nameI.value.trim().length > 1),
      mark(phoneI, phoneOk(phoneI.value)),
      mark(consent, consent.checked)
    ].every(Boolean);
    if (!ok) { form.querySelector('.is-invalid input').focus(); return; }
    if (form.elements.website.value) return; // антиспам-ловушка

    // TODO: подключить отправку заявки (CRM / почта / Telegram-бот).
    var data = {
      name: nameI.value.trim(),
      phone: phoneI.value.trim(),
      topic: form.elements.topic.value
    };
    console.info('Заявка (заглушка, никуда не отправлена):', data);

    status.textContent = 'Спасибо! Администратор свяжется с вами в ближайшее время.';
    status.classList.add('is-visible');
    form.reset();
  });
})();
