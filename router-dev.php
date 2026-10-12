<?php
// Роутер для локального сервера: php -S 127.0.0.1:8080 router-dev.php
// Повторяет правила из .htaccess, чтобы проверять сайт без Apache.
$path = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
$map = null;
if (preg_match('#^/(css|js|assets)/(.*)$#', $path, $m)) $map = __DIR__ . "/public/{$m[1]}/{$m[2]}";
elseif (preg_match('#^/admin/static/(.*)$#', $path, $m)) $map = __DIR__ . '/admin/' . $m[1];
elseif (preg_match('#^/uploads/(.*)$#', $path, $m)) $map = (getenv('UPLOADS_DIR') ?: __DIR__ . '/uploads') . '/' . $m[1];
if ($map !== null && strpos($map, '..') === false && is_file($map)) {
    $types = ['css' => 'text/css', 'js' => 'text/javascript', 'svg' => 'image/svg+xml', 'jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'mp4' => 'video/mp4'];
    header('Content-Type: ' . ($types[strtolower(pathinfo($map, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
    readfile($map);
    return true;
}
if ($map !== null) { http_response_code(404); echo 'Not found'; return true; }
if (preg_match('#^/(php|server|test|deploy|data|node_modules)(/|$)#', $path) || preg_match('#^/(package.*\.json|README\.md|config.*\.php)$#', $path)) { http_response_code(404); echo 'Not found'; return true; }
require __DIR__ . '/index.php';
