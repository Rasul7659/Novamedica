<?php
// Единая точка входа PHP-версии: лендинг, предпросмотр, заявки, оболочка админки и API.
declare(strict_types=1);

// Предупреждения PHP не должны попадать в ответы (иначе ломается JSON): пишем их в лог сервера.
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

foreach (['bootstrap', 'schema', 'seed', 'diff', 'db', 'ratelimit', 'auth', 'notify', 'media', 'render', 'api_admin'] as $f) {
    require __DIR__ . '/php/' . $f . '.php';
}

header_remove('X-Powered-By');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");

ensure_admin();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
if ($path !== '/') $path = rtrim($path, '/');

if ($path === '/' && in_array($method, ['GET', 'HEAD'], true)) {
    header('Cache-Control: no-cache');
    header('Content-Type: text/html; charset=utf-8');
    echo render_landing(published());
    exit;
}

if ($path === '/robots.txt') {
    header('Content-Type: text/plain; charset=utf-8');
    echo "User-agent: *\nDisallow: /admin\nDisallow: /preview\nDisallow: /api/\n";
    exit;
}

if ($path === '/preview') {
    if (!current_admin()) { header('Location: /admin/login', true, 302); exit; }
    header('Cache-Control: no-store');
    header('Content-Type: text/html; charset=utf-8');
    echo render_landing(draft(), true);
    exit;
}

// Заявки с лендинга
if ($path === '/api/requests' && $method === 'POST') {
    rate_limit('lead', 5, 600, 'Вы уже отправили несколько заявок. Подождите немного или позвоните нам.');
    $b = body_json();
    if (!empty($b['website'])) json_out(['ok' => true]); // ловушка для ботов: делаем вид, что приняли
    $name = trim(str($b['name'] ?? '', 80));
    $phone = trim(str($b['phone'] ?? '', 30));
    $topic = trim(str($b['topic'] ?? 'Нужна помощь с выбором', 100)) ?: 'Нужна помощь с выбором';
    $errors = [];
    if (ulen($name) < 2) $errors['name'] = 'Подскажите, как к вам обращаться';
    if (!valid_phone($phone)) $errors['phone'] = 'Похоже, не хватает цифр. Пример: +7 900 000-00-00';
    if (($b['consent'] ?? null) !== true) $errors['consent'] = 'Без согласия мы не можем принять заявку';
    if ($errors) json_out(['error' => 'Проверьте поля формы', 'errors' => $errors], 422);
    $item = add_request($name, $phone, $topic);
    notify_new_request($item);
    json_out(['ok' => true]);
}

if (str_starts_with($path, '/api/admin')) {
    handle_admin_api($method, substr($path, strlen('/api/admin')) ?: '/');
}
if (str_starts_with($path, '/api/')) json_out(['error' => 'Не найдено'], 404);

// Оболочка админки: /admin, /admin/login, /admin/reset, /admin/services ...
if ($path === '/admin' || str_starts_with($path, '/admin/')) {
    header('Cache-Control: no-store');
    header('X-Frame-Options: DENY');
    header('Content-Type: text/html; charset=utf-8');
    readfile(__DIR__ . '/admin/index.html');
    exit;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo 'Страница не найдена';
