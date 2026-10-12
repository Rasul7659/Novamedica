<?php
// Основа PHP-версии: настройки, хранилище JSON-файлов, общие помощники.
declare(strict_types=1);

define('ROOT', dirname(__DIR__));
if (!function_exists('mb_strlen')) {
    // Запасной вариант, если на хостинге нет расширения mbstring
    function mb_strlen(string $s, ?string $enc = null): int { return (int) preg_match_all('/./su', $s); }
    function mb_substr(string $s, int $start, ?int $len = null, ?string $enc = null): string
    {
        preg_match_all('/./su', $s, $m);
        return implode('', array_slice($m[0], $start, $len));
    }
    function mb_internal_encoding(?string $enc = null): bool { return true; }
}
mb_internal_encoding('UTF-8');

// ---------- Настройки ----------
// Порядок: переменная окружения → config.php рядом с сайтом → config.php уровнем выше (вне веб-папки).
function cfg(string $key, $default = null)
{
    static $file = null;
    if ($file === null) {
        $file = [];
        foreach ([dirname(ROOT) . '/novamedica-config.php', ROOT . '/config.php'] as $path) {
            if (is_file($path)) {
                $loaded = require $path;
                if (is_array($loaded)) { $file = $loaded; break; }
            }
        }
    }
    $env = getenv($key);
    if ($env !== false && $env !== '') return $env;
    return $file[$key] ?? $default;
}

function data_dir(): string
{
    static $dir = null;
    if ($dir !== null) return $dir;
    $want = cfg('DATA_DIR');
    $candidates = $want ? [$want] : [dirname(ROOT) . '/novamedica-data', ROOT . '/data'];
    foreach ($candidates as $c) {
        if (!is_dir($c)) @mkdir($c, 0775, true);
        if (is_dir($c) && is_writable($c)) {
            // На случай, если папка оказалась внутри сайта: закрываем её от веб-доступа.
            if (!is_file($c . '/.htaccess')) @file_put_contents($c . '/.htaccess', "Require all denied\n");
            return $dir = rtrim($c, '/');
        }
    }
    http_response_code(500);
    exit('Нет доступа на запись в папку данных. Укажите DATA_DIR в config.php.');
}

function uploads_dir(): string
{
    $d = cfg('UPLOADS_DIR', ROOT . '/uploads');
    if (!is_dir($d)) @mkdir($d, 0775, true);
    return rtrim($d, '/');
}

// ---------- Хранилище ----------
final class JsonFile
{
    public array $data;
    private string $file;

    public function __construct(string $name, callable $fallback)
    {
        $this->file = data_dir() . '/' . $name;
        $this->data = $fallback();
        if (is_file($this->file)) {
            $decoded = json_decode((string) file_get_contents($this->file), true);
            if (is_array($decoded)) {
                $this->data = $decoded;
            } else {
                @copy($this->file, $this->file . '.broken-' . time());
            }
        } else {
            $this->save();
        }
    }

    public function save(): void
    {
        $tmp = $this->file . '.tmp' . getmypid();
        file_put_contents($tmp, json_encode($this->data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX);
        rename($tmp, $this->file);
    }

    // Чтение-изменение-запись под блокировкой: параллельные запросы не затирают друг друга.
    public function mutate(callable $fn)
    {
        $lock = fopen($this->file . '.lock', 'c');
        flock($lock, LOCK_EX);
        try {
            if (is_file($this->file)) {
                $fresh = json_decode((string) file_get_contents($this->file), true);
                if (is_array($fresh)) $this->data = $fresh;
            }
            $result = $fn($this->data);
            $this->save();
            return $result;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}

// ---------- Помощники ----------
function e($v): string { return htmlspecialchars((string) ($v ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function uid(string $prefix = ''): string { return $prefix . bin2hex(random_bytes(6)); }
function ulen(string $s): int { return mb_strlen($s, 'UTF-8'); }
function digits($s): string { return (string) preg_replace('/\D/', '', (string) $s); }
function same($a, $b): bool { return json_encode($a) === json_encode($b); }
function now_iso(): string { return gmdate('Y-m-d\TH:i:s') . '.000Z'; }

function json_out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function body_json(): array
{
    $raw = file_get_contents('php://input', false, null, 0, 200001);
    if ($raw === '' || $raw === false) return [];
    if (strlen($raw) > 200000) json_out(['error' => 'Слишком большой запрос'], 413);
    $d = json_decode($raw, true);
    if (!is_array($d)) json_out(['error' => 'Некорректный запрос'], 400);
    return $d;
}

function str($v, int $max = 1000): string { return is_string($v) ? mb_substr($v, 0, $max, 'UTF-8') : ''; }

function trust_proxy(): bool { return in_array(strtolower((string) cfg('TRUST_PROXY', '')), ['1', 'true', 'yes'], true); }

function client_ip(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    if (trust_proxy()) {
        $fwd = $_SERVER['HTTP_X_REAL_IP'] ?? ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
        if ($fwd !== '') {
            $first = trim(explode(',', $fwd)[0]);
            if (filter_var($first, FILTER_VALIDATE_IP)) $ip = $first;
        }
    }
    return $ip;
}

function is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
    return trust_proxy() && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

function public_base(): string
{
    $u = cfg('PUBLIC_URL');
    if ($u) return rtrim((string) $u, '/');
    return (is_https() ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
}
