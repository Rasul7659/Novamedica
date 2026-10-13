'use strict';
const { LOCKED_NOTE, DEFAULT_SPECIALTIES } = require('./schema');

// Начальное содержимое сайта: повторяет макет лендинга. Всё, что клиника должна
// заполнить сама, оставлено в квадратных скобках — как в макете.
function seedContent() {
  const contacts = {
    address: 'Москва, [улица, дом, этаж]',
    hours: '[Ежедневно, 10:00–20:00]',
    phone: '[+7 000 000-00-00]',
    whatsapp: '',
    telegram: '',
    org: '[Полное наименование юрлица]',
    inn: '',
    ogrn: '',
    license: ''
  };
  const svc = (id, title, desc) => ({ id, title, desc, price: '', visible: true });
  const doc = (id, spec) => ({ id, name: '[ФИО врача]', spec, exp: '', bio: '', photoId: null, visible: true });
  const media = (id, name, alt, crop, extra = {}) => ({
    id, name, alt, kind: 'interior', url: '/assets/reception.jpg', crop: crop || null, placeholder: true, ...extra
  });
  return {
    hero: { h1: 'Клиника эстетической и превентивной медицины в Москве', btn: 'Узнать больше' },
    about: {
      heading: 'Дерматология и косметология работают вместе',
      text: 'Врач оценивает состояние кожи, назначает диагностику и предлагает план на несколько месяцев. Этапы, сроки и стоимость вы знаете до начала лечения.'
    },
    visit: { heading: 'Как проходит первый визит', s1: 'Запись', s2: 'Осмотр и диагностика', s3: 'План и стоимость', s4: 'Процедуры и контроль' },
    form: { heading: 'Записаться на приём', text: 'Оставьте телефон — администратор позвонит и подберёт время. Или напишите в мессенджер.' },
    footer: { org: 'Novamedica', note: LOCKED_NOTE },
    contacts,
    services: [
      svc('s1', 'Консультация дерматолога', 'Осмотр, диагноз, назначения'),
      svc('s2', 'Консультация косметолога', 'Оценка кожи, подбор ухода'),
      svc('s3', 'Лечение акне и постакне', 'Курс под наблюдением врача'),
      svc('s4', 'Чистки лица', '[Виды чисток]'),
      svc('s5', 'Пилинги', '[Виды пилингов]'),
      svc('s6', 'Инъекционная косметология', '[Биоревитализация, мезотерапия]'),
      svc('s7', 'Аппаратная косметология', '[Аппараты клиники]')
    ],
    specialties: DEFAULT_SPECIALTIES.map((x) => ({ ...x })),
    doctors: [doc('d1', 'derm'), doc('d2', 'cosm'), doc('d3', 'derm'), doc('d4', 'cosm')],
    media: [
      media('m1', 'Ресепшен', 'Ресепшен центра Novamedica с логотипом на стене', null),
      media('m2', 'Вывеска с логотипом', 'Вывеска Novamedica в холле', { scale: 1.6, origin: '52% 32%' }),
      media('m3', 'Зона ожидания', 'Зона ожидания клиники', { scale: 1.6, origin: '8% 85%' }),
      media('m4', 'Стойка ресепшена (раздел «О клинике»)', 'Стойка ресепшена и вывеска', { scale: 1.35, origin: '52% 45%', pos: '52% 55%' })
    ],
    slots: { hero: 'm1', about: 'm4', interiorMain: 'm1', interiorSign: 'm2', interiorWait: 'm3' }
  };
}

module.exports = { seedContent };
