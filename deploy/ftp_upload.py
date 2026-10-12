#!/usr/bin/env python3
"""Загрузка проекта на хостинг по FTP/FTPS.

Пароль в файлы не записывается: берётся из переменной FTP_PASSWORD.

  FTP_PASSWORD='...' python3 deploy/ftp_upload.py --host vh414.timeweb.ru --user cj80590 --remote /путь/к/сайту

Если хостинг поддерживает FTPS (шифрование), скрипт использует его автоматически.
Загружается PHP-версия сайта: index.php, .htaccess, php/, public/, admin/, uploads/.htaccess, config.example.php.
Не загружаются: Node-версия (server/, package*.json), тесты, data, config.php, .env.
Остатки прошлой (Node) загрузки на сервере удаляются.
"""
import argparse, ftplib, getpass, os, ssl, sys

SKIP_DIRS = {'node_modules', 'data', '.git', 'test', 'deploy', '.tmp-data', 'server'}
SKIP_FILES = {'.env', '.DS_Store', 'Dockerfile', '.gitignore', 'router-dev.php', 'config.php'}
# Эти файлы пропускаются только в корне проекта (admin/js/app.js, например, нужен)
SKIP_ROOT_FILES = {'app.js', 'package.json', 'package-lock.json', 'README.md', '.env.example'}
# Что осталось на сервере от загрузки Node-версии
LEGACY_FILES = ['app.js', 'package.json', 'package-lock.json', 'README.md', '.env.example', '.gitignore', 'index.htm']  # index.htm — заглушка хостинга
LEGACY_DIRS = ['server']

def connect(host, user, password, plain):
    if not plain:
        try:
            ftp = ftplib.FTP_TLS(host, timeout=30, context=ssl.create_default_context())
            ftp.login(user, password)
            ftp.prot_p()
            print('Соединение защищено (FTPS)')
            return ftp
        except Exception as e:
            print(f'FTPS не удался: {e}')
            if str(e).startswith('530'):
                print('Это не обязательно неверный пароль: сервер мог не принять защищённое соединение.')
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

def show_tree(ftp, path='/', depth=0, max_depth=3):
    """Печатает папки и файлы на сервере (без содержимого), чтобы найти корень сайта."""
    try:
        entries = []
        ftp.retrlines('LIST ' + path, entries.append)
    except ftplib.all_errors as e:
        print('  ' * depth + f'(нет доступа: {e})')
        return
    for line in entries:
        name = line.split(None, 8)[-1]
        if name in ('.', '..'):
            continue
        is_dir = line.startswith('d')
        print('  ' * depth + ('📁 ' if is_dir else '   ') + name)
        if is_dir and depth + 1 < max_depth and name not in ('uploads', 'node_modules'):
            show_tree(ftp, path.rstrip('/') + '/' + name, depth + 1, max_depth)

OURS_FILES = ['.htaccess', 'index.php', 'config.example.php']
OURS_DIRS = ['admin', 'php', 'public', 'uploads', 'server']

def remove_ours(ftp, folder):
    """Удаляет из папки только то, что создаёт этот скрипт. Остальное не трогает."""
    print('Чистка ошибочной загрузки в', folder)
    for f in OURS_FILES + LEGACY_FILES:
        if f == 'index.htm':
            continue
        try:
            ftp.cwd('/'); ftp.cwd(folder); ftp.delete(f); print('  ✕', f)
        except ftplib.all_errors:
            pass
    for d in OURS_DIRS:
        ftp.cwd('/'); ftp.cwd(folder)
        rm_tree(ftp, d)
        print('  ✕', d + '/') if d not in ftp.nlst() else None

def rm_tree(ftp, name):
    try:
        ftp.cwd(name)
    except ftplib.all_errors:
        return
    for item in ftp.nlst():
        if item in ('.', '..'):
            continue
        try:
            ftp.delete(item)
        except ftplib.all_errors:
            rm_tree(ftp, item)
    ftp.cwd('..')
    ftp.rmd(name)

def cleanup_legacy(ftp):
    for f in LEGACY_FILES:
        try:
            ftp.delete(f)
            print('  ✕ удалён старый файл', f)
        except ftplib.all_errors:
            pass
    for d in LEGACY_DIRS:
        rm_tree(ftp, d)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', required=True)
    ap.add_argument('--user', required=True)
    ap.add_argument('--remote', help='папка на сервере, например /novamedica.ru/public_html (по умолчанию ищется автоматически)')
    ap.add_argument('--list', action='store_true', help='только показать структуру папок на сервере')
    ap.add_argument('--remove-ours', metavar='ПАПКА', help='удалить из этой папки файлы, загруженные этим скриптом по ошибке (только известные имена)')
    ap.add_argument('--config', metavar='ФАЙЛ', help='загрузить этот локальный файл на сервер как config.php (после загрузки сайта)')
    ap.add_argument('--plain', action='store_true', help='сразу использовать обычный FTP')
    args = ap.parse_args()
    password = os.environ.get('FTP_PASSWORD') or getpass.getpass(f'Пароль FTP для {args.user} (ввод скрыт): ')
    if not password:
        sys.exit('Пароль не введён')

    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    ftp = connect(args.host, args.user, password, args.plain)
    ftp.cwd('/')
    if args.list:
        show_tree(ftp)
        ftp.quit()
        return
    if args.config and args.remote:
        # Только настройки: загружаем один файл и выходим
        ensure_dir(ftp, args.remote)
        with open(args.config, 'rb') as fh:
            ftp.storbinary('STOR config.php', fh)
        try:
            ftp.sendcmd('SITE CHMOD 640 config.php')
        except ftplib.all_errors:
            pass
        print('config.php загружен в', args.remote)
        ftp.quit()
        return
    remote = args.remote or find_site_dir(ftp)
    print('Папка на сервере:', remote)
    ensure_dir(ftp, remote)
    base = ftp.pwd()
    sent = 0
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        rel = os.path.relpath(dirpath, root)
        if rel == 'uploads':
            files = [f for f in files if f == '.htaccess']
        ftp.cwd(base)
        if rel != '.':
            ensure_dir(ftp, rel.replace(os.sep, '/'))
        for f in sorted(files):
            if f in SKIP_FILES or f.endswith('.log') or (rel == '.' and f in SKIP_ROOT_FILES):
                continue
            with open(os.path.join(dirpath, f), 'rb') as fh:
                ftp.storbinary('STOR ' + f, fh)
            sent += 1
            print('  ↑', os.path.join(rel, f) if rel != '.' else f)
    ftp.cwd(base)
    cleanup_legacy(ftp)
    if args.remove_ours:
        remove_ours(ftp, args.remove_ours)
    ftp.quit()
    print(f'Готово: загружено файлов — {sent}.')

if __name__ == '__main__':
    main()
