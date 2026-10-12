'use strict';
// Уведомления: Telegram о новых заявках и письмо со ссылкой для сброса пароля.
// Если переменные окружения не заданы, сервис молча пропускает отправку (в консоль пишется подсказка).

const tgConfigured = () => !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
const mailConfigured = () => !!process.env.SMTP_HOST;

async function notifyNewRequest(r) {
  if (!tgConfigured()) return false;
  const text = `Новая заявка с сайта\n${r.name}\n${r.phone}\n${r.service}`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) console.error('[telegram] ответ', res.status);
    return res.ok;
  } catch (err) {
    console.error('[telegram] не удалось отправить:', err.message);
    return false;
  }
}

async function sendResetMail(to, link) {
  if (!mailConfigured()) {
    console.log(`[reset] SMTP не настроен. Ссылка для сброса пароля (действует 1 час): ${link}`);
    return false;
  }
  try {
    const nodemailer = require('nodemailer');
    const tr = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    await tr.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: 'Novamedica: восстановление пароля',
      text: `Чтобы задать новый пароль, откройте ссылку (действует 1 час):\n${link}\n\nЕсли вы ничего не запрашивали, просто проигнорируйте письмо.`
    });
    return true;
  } catch (err) {
    console.error('[mail] не удалось отправить:', err.message);
    return false;
  }
}

module.exports = { notifyNewRequest, sendResetMail, tgConfigured };
