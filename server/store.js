'use strict';
// Простое файловое хранилище: JSON-файлы в DATA_DIR, запись атомарная (tmp + rename).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

class JsonFile {
  constructor(name, fallback) {
    this.file = path.join(DATA_DIR, name);
    this.data = fallback();
    if (fs.existsSync(this.file)) {
      try {
        this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      } catch (err) {
        // Битый файл не затираем молча: сохраняем копию и стартуем с чистого листа.
        fs.copyFileSync(this.file, this.file + '.broken-' + Date.now());
        console.error(`[store] ${name} повреждён, копия сохранена`, err.message);
      }
    } else {
      this.save();
    }
  }
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
  mutate(fn) {
    const result = fn(this.data);
    this.save();
    return result;
  }
}

const uid = (prefix = '') => prefix + crypto.randomBytes(6).toString('hex');
const clone = (v) => JSON.parse(JSON.stringify(v));

module.exports = { DATA_DIR, UPLOADS_DIR, JsonFile, uid, clone };
