'use strict';
// Точка входа для хостингов с Node.js через Phusion Passenger (в т.ч. виртуальный хостинг Timeweb):
// в панели в качестве файла запуска указывается app.js. Локально используйте `npm start`.
require('./server/index').start();
