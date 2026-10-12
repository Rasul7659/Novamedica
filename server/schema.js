'use strict';
// Описание редактируемых текстовых блоков: используется и для проверки на сервере,
// и для построения форм в админке (отдаётся через /api/admin/bootstrap).

const SECTIONS = {
  hero: {
    title: 'Первый экран',
    subtitle: 'Это первое, что видит человек на сайте.',
    fields: [
      { k: 'h1', label: 'Главный заголовок', hint: 'Лучше короче: так заголовок целиком читается на телефоне', area: true, max: 80, req: true },
      { k: 'btn', label: 'Надпись на кнопке', hint: 'Одно-два слова', max: 24, req: true }
    ]
  },
  about: {
    title: 'О клинике',
    subtitle: 'Короткий рассказ о подходе клиники.',
    fields: [
      { k: 'heading', label: 'Заголовок', hint: 'Одна мысль, без точки в конце', max: 70, req: true },
      { k: 'text', label: 'Текст', hint: 'Два-три предложения', area: true, max: 300, req: true }
    ]
  },
  visit: {
    title: 'Как проходит приём',
    subtitle: 'Четыре шага первого визита.',
    fields: [
      { k: 'heading', label: 'Заголовок', hint: '', max: 60, req: true },
      { k: 's1', label: 'Шаг 1', hint: '', max: 40, req: true },
      { k: 's2', label: 'Шаг 2', hint: '', max: 40, req: true },
      { k: 's3', label: 'Шаг 3', hint: '', max: 40, req: true },
      { k: 's4', label: 'Шаг 4', hint: '', max: 40, req: true }
    ]
  },
  form: {
    title: 'Запись',
    subtitle: 'Блок с формой заявки в конце страницы.',
    fields: [
      { k: 'heading', label: 'Заголовок', hint: '', max: 40, req: true },
      { k: 'text', label: 'Пояснение под заголовком', hint: 'Скажите, что произойдёт после заявки', area: true, max: 160, req: true }
    ]
  },
  footer: {
    title: 'Подвал сайта',
    subtitle: 'Нижняя часть страницы. Реквизиты берутся из вкладки «Контакты и реквизиты».',
    fields: [
      { k: 'org', label: 'Название в подвале', hint: 'Как подписать сайт внизу', max: 60, req: true },
      { k: 'note', label: 'Предупреждение о противопоказаниях', hint: 'Этот текст обязателен по закону, поэтому его нельзя изменить', area: true, max: 200, locked: true }
    ]
  },
  contacts: {
    title: 'Контакты и реквизиты',
    subtitle: 'Эти данные появятся в подвале, в блоке «Запись» и на первом экране.',
    fields: [
      { k: 'address', label: 'Адрес', hint: 'Город, улица, дом, этаж', max: 100, req: true },
      { k: 'hours', label: 'Режим работы', hint: 'Например: ежедневно, 10:00–20:00', max: 60, req: true },
      { k: 'phone', label: 'Телефон', hint: 'Начните с +7 или 8', max: 20, req: true, ph: '+7 000 000-00-00' },
      { k: 'whatsapp', label: 'Ссылка на WhatsApp', hint: 'По желанию. Кнопка появится на сайте, если заполнено', max: 80, ph: 'wa.me/7000...' },
      { k: 'telegram', label: 'Ссылка на Telegram', hint: 'По желанию', max: 80, ph: 't.me/...' },
      { k: 'org', label: 'Юридическое лицо', hint: 'Полное название, как в документах', max: 100, req: true, ph: 'ООО «...»' },
      { k: 'inn', label: 'ИНН', hint: '10 или 12 цифр', max: 12, req: true, ph: '0000000000' },
      { k: 'ogrn', label: 'ОГРН', hint: '13 или 15 цифр', max: 15, req: true, ph: '0000000000000' },
      { k: 'license', label: 'Номер лицензии на медицинскую деятельность', hint: 'Есть в вашей лицензии. Например: ЛО-77-01-000000 от 01.01.2026', max: 60, req: true, ph: 'ЛО-77-01-000000 от 01.01.2026' }
    ]
  }
};

const LOCKED_NOTE = 'Имеются противопоказания. Необходима консультация специалиста.';

const SPECS = { derm: 'Дерматолог', cosm: 'Косметолог' };

const SLOTS = {
  hero: 'Первый экран',
  about: 'О клинике',
  interiorMain: 'Интерьер: большое фото',
  interiorSign: 'Интерьер: малое фото 1',
  interiorWait: 'Интерьер: малое фото 2'
};

const LIMITS = { serviceTitle: 50, serviceDesc: 60, mediaName: 80, mediaAlt: 200, doctorName: 100, doctorBio: 500, note: 500 };

// Значения для проверки полей. Возвращает { поле: сообщение } — пустой объект, если всё хорошо.
function validateSection(key, values) {
  const def = SECTIONS[key];
  const errs = {};
  for (const f of def.fields) {
    if (f.locked) continue;
    const raw = values[f.k];
    const v = (typeof raw === 'string' ? raw : '').trim();
    if (f.req && !v) {
      errs[f.k] = f.k === 'license'
        ? 'Без номера лицензии сайт публиковать нельзя: это требование закона. Номер есть в вашей лицензии.'
        : 'Заполните это поле';
    } else if (f.max && v.length > f.max) {
      errs[f.k] = 'Слишком длинно: сократите до ' + f.max + ' знаков';
    } else if (f.k === 'phone' && v && !validPhone(v)) {
      errs[f.k] = 'Похоже, в номере не хватает цифр. Пример: +7 900 000-00-00';
    } else if (f.k === 'inn' && v && !/^(\d{10}|\d{12})$/.test(v)) {
      errs[f.k] = 'ИНН состоит из 10 или 12 цифр';
    } else if (f.k === 'ogrn' && v && !/^(\d{13}|\d{15})$/.test(v)) {
      errs[f.k] = 'ОГРН состоит из 13 или 15 цифр';
    } else if ((f.k === 'whatsapp' || f.k === 'telegram') && v && !safeLink(v)) {
      errs[f.k] = 'Не похоже на ссылку. Пример: ' + (f.k === 'whatsapp' ? 'wa.me/79000000000' : 't.me/novamedica');
    }
  }
  return errs;
}

const digits = (s) => String(s || '').replace(/\D/g, '');
function validPhone(v) {
  const d = digits(v);
  return d.length >= 10 && d.length <= 15 && /^[+\d\s()\-]+$/.test(v);
}

// Приводит ссылку мессенджера к безопасному https-виду. null — если ссылка недопустима.
function safeLink(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : /^[a-z][a-z0-9+.-]*:/i.test(s) ? '' : 'https://' + s.replace(/^@/, 't.me/');
  if (!withProto) return null;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.href;
  } catch {
    return null;
  }
}

function validateService(d) {
  const errs = {};
  const title = String(d.title || '').trim();
  const desc = String(d.desc || '').trim();
  const price = digits(d.price);
  if (!title) errs.title = 'Напишите название — оно покажется на карточке';
  else if (title.length > LIMITS.serviceTitle) errs.title = 'Слишком длинно: не больше ' + LIMITS.serviceTitle + ' знаков';
  if (desc.length > LIMITS.serviceDesc) errs.desc = 'Слишком длинно: не больше ' + LIMITS.serviceDesc + ' знаков';
  if (!price || /^0+$/.test(price) || price.length > 7) errs.price = 'Укажите цену цифрами. Например: 3500';
  return errs;
}

function validateDoctor(d) {
  const errs = {};
  const name = String(d.name || '').trim();
  if (!name) errs.name = 'Напишите ФИО — оно подписывает карточку';
  else if (name.length > LIMITS.doctorName) errs.name = 'Слишком длинно';
  if (!SPECS[d.spec]) errs.spec = 'Выберите специальность';
  if (d.exp && (!/^\d{1,2}$/.test(String(d.exp)))) errs.exp = 'Стаж — число лет, например: 8';
  if (String(d.bio || '').length > LIMITS.doctorBio) errs.bio = 'Слишком длинно: не больше ' + LIMITS.doctorBio + ' знаков';
  return errs;
}

// Ссылка tel: из человеческой записи телефона. '' — если цифр не хватает.
function telHref(v) {
  const d = digits(v);
  if (d.length === 11 && (d[0] === '8' || d[0] === '7')) return '+7' + d.slice(1);
  if (d.length === 10) return '+7' + d;
  if (d.length >= 11 && d.length <= 15) return '+' + d;
  return '';
}

module.exports = {
  telHref, SECTIONS, SPECS, SLOTS, LIMITS, LOCKED_NOTE,
  validateSection, validateService, validateDoctor, validPhone, safeLink, digits
};
