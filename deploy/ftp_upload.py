#!/usr/bin/env python3
"""Загрузка проекта на хостинг по FTP/FTPS.

Пароль в файлы не записывается: берётся из переменной FTP_PASSWORD.

  FTP_PASSWORD='...' python3 deploy/ftp_upload.py --host vh414.timeweb.ru --user cj80590 --remote /путь/к/сайту

Если хостинг поддерживает FTPS (шифрование), скрипт использует его автоматически.
Не загружаются: node_modules, data, .git, test, .env (зависимости ставятся на сервере).
"""
import argparse, ftplib, getpass, os, ssl, sys

SKIP_DIRS = {'node_modules', 'data', '.git', 'test', 'deploy', '.tmp-data'}
SKIP_FILES = {'.env', '.DS_Store', 'Dockerfile'}

def connect(host, user, password, plain):
    if not plain:
        try:
            ftp = ftplib.FTP_TLS(host, timeout=30, context=ssl.create_default_context())
            ftp.login(user, password)
            ftp.prot_p()
            print('Соединение защищено (FTPS)')
            return ftp
        except Exception as e:
            print(f'FTPS недоступен ({e.__class__.__name__}).')
            if input('Продолжить по обычному FTP, пароль пойдёт открытым текстом? [y/N] ').lower() != 'y':
                sys.exit(1)
    ftp = ftplib.FTP(host, timeout=30)
    ftp.login(user, password)
    return ftp

def ensure_dir(ftp, path):
    for part in [p for p in path.split('/') if p]:
        try:
            ftp.cwd(part)
        except ftplib.error_perm:
            ftp.mkd(part)
            ftp.cwd(part)

def find_site_dir(ftp):
    """Ищет единственную папку вида <домен>/public_html в корне FTP."""
    found = []
    for name in ftp.nlst():
        if name in ('.', '..'):
            continue
        try:
            ftp.cwd('/' + name)
            if 'public_html' in ftp.nlst():
                found.append(f'/{name}/public_html')
        except ftplib.all_errors:
            pass
    ftp.cwd('/')
    if len(found) == 1:
        return found[0]
    print('Не удалось выбрать папку автоматически. Найдено:', found or 'ничего')
    print('Запустите снова с параметром --remote /путь/к/сайту')
    sys.exit(1)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', required=True)
    ap.add_argument('--user', required=True)
    ap.add_argument('--remote', help='папка на сервере, например /novamedica.ru/public_html (по умолчанию ищется автоматически)')
    ap.add_argument('--plain', action='store_true', help='сразу использовать обычный FTP')
    args = ap.parse_args()
    password = os.environ.get('FTP_PASSWORD') or getpass.getpass(f'Пароль FTP для {args.user} (ввод скрыт): ')
    if not password:
        sys.exit('Пароль не введён')

    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    ftp = connect(args.host, args.user, password, args.plain)
    ftp.cwd('/')
    remote = args.remote or find_site_dir(ftp)
    print('Папка на сервере:', remote)
    ensure_dir(ftp, remote)
    base = ftp.pwd()
    sent = 0
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        rel = os.path.relpath(dirpath, root)
        ftp.cwd(base)
        if rel != '.':
            ensure_dir(ftp, rel.replace(os.sep, '/'))
        for f in sorted(files):
            if f in SKIP_FILES or f.endswith('.log'):
                continue
            with open(os.path.join(dirpath, f), 'rb') as fh:
                ftp.storbinary('STOR ' + f, fh)
            sent += 1
            print('  ↑', os.path.join(rel, f) if rel != '.' else f)
    ftp.quit()
    print(f'Готово: загружено файлов — {sent}.')

if __name__ == '__main__':
    main()
