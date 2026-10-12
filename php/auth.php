<?php
// Вход в админку (порт server/auth.js): пароль в хеше, сессия — подписанный cookie.
declare(strict_types=1);

const COOKIE_NAME = 'nm_admin';
const SHORT_TTL = 12 * 3600;
const LONG_TTL = 30 * 24 * 3600;

function session_secret(): string
{
    static $s = null;
    if ($s !== null) return $s;
    $env = cfg('SESSION_SECRET');
    if ($env) return $s = (string) $env;
    $f = data_dir() . '/secret.key';
    if (!is_file($f)) { file_put_contents($f, bin2hex(random_bytes(32))); @chmod($f, 0600); }
    return $s = trim((string) file_get_contents($f));
}

function b64u(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64u_dec(string $s): string { return (string) base64_decode(strtr($s, '-_', '+/')); }

function sign_token(array $payload): string
{
    $body = b64u(json_encode($payload));
    return $body . '.' . b64u(hash_hmac('sha256', $body, session_secret(), true));
}

function unsign_token(?string $token): ?array
{
    if (!$token || substr_count($token, '.') !== 1) return null;
    [$body, $sig] = explode('.', $token);
    if (!hash_equals(b64u(hash_hmac('sha256', $body, session_secret(), true)), $sig)) return null;
    $p = json_decode(b64u_dec($body), true);
    return is_array($p) ? $p : null;
}

// Первый запуск: создаём администратора из ADMIN_EMAIL / ADMIN_PASSWORD.
function ensure_admin(): void
{
    $a = admin_file()->data;
    if (!empty($a['email']) && !empty($a['hash'])) return;
    $email = strtolower(trim((string) cfg('ADMIN_EMAIL', 'admin@novamedica.ru')));
    $password = (string) cfg('ADMIN_PASSWORD', '');
    if ($password === '') return; // пароль не задан: вход невозможен, пока его не укажут в config.php
    admin_file()->mutate(function (array &$d) use ($email, $password) {
        $d['email'] = $email;
        $d['hash'] = password_hash($password, PASSWORD_DEFAULT);
        $d['pwdVersion'] = 1;
        $d['name'] = 'Администратор клиники';
    });
}

function start_session(bool $remember): void
{
    $a = admin_file()->data;
    $ttl = $remember ? LONG_TTL : SHORT_TTL;
    $token = sign_token(['e' => $a['email'], 'v' => $a['pwdVersion'], 'x' => time() + $ttl]);
    setcookie(COOKIE_NAME, $token, [
        'expires' => $remember ? time() + $ttl : 0,
        'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax',
    ]);
}

function end_session(): void
{
    setcookie(COOKIE_NAME, '', ['expires' => 1, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
}

function current_admin(): ?array
{
    $p = unsign_token($_COOKIE[COOKIE_NAME] ?? null);
    $a = admin_file()->data;
    if (!$p || ($p['x'] ?? 0) < time() || ($p['e'] ?? '') !== ($a['email'] ?? null) || ($p['v'] ?? 0) !== ($a['pwdVersion'] ?? -1)) return null;
    return ['email' => $a['email'], 'name' => $a['name'] ?? 'Администратор клиники'];
}

function require_fetch_header(): void
{
    if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD', 'OPTIONS'], true) && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'fetch') {
        json_out(['error' => 'Запрос отклонён'], 403);
    }
}

function require_admin(): array
{
    $me = current_admin();
    if (!$me) json_out(['error' => 'Нужно войти в админку'], 401);
    return $me;
}

function create_reset_token(): string
{
    $token = b64u(random_bytes(32));
    admin_file()->mutate(function (array &$d) use ($token) { $d['reset'] = ['hash' => hash('sha256', $token), 'exp' => time() + 3600]; });
    return $token;
}

function consume_reset_token(string $token, string $password): bool
{
    $r = admin_file()->data['reset'] ?? null;
    if (!$r || $r['exp'] < time() || $token === '' || !hash_equals($r['hash'], hash('sha256', $token))) return false;
    admin_file()->mutate(function (array &$d) use ($password) {
        $d['hash'] = password_hash($password, PASSWORD_DEFAULT);
        $d['pwdVersion'] = ($d['pwdVersion'] ?? 1) + 1; // все старые сессии перестают работать
        unset($d['reset']);
    });
    return true;
}
