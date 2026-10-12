'use strict';
// Приём файлов: проверка по содержимому (не по расширению), уменьшение фото и удаление EXIF.
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { UPLOADS_DIR, uid } = require('./store');

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 30 * 1024 * 1024;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_VIDEO, files: 1 } });

function sniff(buf) {
  if (buf.length > 12) {
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', ext: 'jpg' };
    if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'image', ext: 'png' };
    if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return { kind: 'image', ext: 'webp' };
    if (buf.slice(4, 8).toString() === 'ftyp') return { kind: 'video', ext: 'mp4' };
  }
  return null;
}

// Возвращает { url, kind } или бросает Error с понятным текстом.
async function saveUpload(file) {
  if (!file) throw new Error('Выберите файл на компьютере');
  const t = sniff(file.buffer);
  if (!t) throw new Error('Этот тип файла не подходит. Загрузите фото JPG или PNG либо видео MP4');
  if (t.kind === 'image' && file.size > MAX_IMAGE) throw new Error('Фото больше 10 МБ. Уменьшите его и попробуйте ещё раз');
  let buf = file.buffer, ext = t.ext;
  if (t.kind === 'image') {
    try {
      const sharp = require('sharp');
      buf = await sharp(file.buffer).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 84, mozjpeg: true }).toBuffer(); // rotate() применяет ориентацию, метаданные (GPS) не копируются
      ext = 'jpg';
    } catch (err) {
      throw new Error('Не удалось прочитать фото. Возможно, файл повреждён');
    }
  }
  const name = uid('f') + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buf);
  return { url: '/uploads/' + name, kind: t.kind };
}

module.exports = { upload, saveUpload };
