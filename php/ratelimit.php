<?php
// Ограничение частоты запросов и блокировка входа. Состояние хранится в файле: PHP не держит память между запросами.
declare(strict_types=1);

// Возвращает true, если лимит превышен.
function rate_exceeded(string $bucket, int $max, int $windowSec): bool
{
    $key = $bucket . '|' . client_ip();
    $now = time();
    return limits_file()->mutate(function (array &$d) use ($key, $max, $windowSec, $now) {
        foreach ($d['hits'] as $k => $r) if ($r['reset'] <= $now) unset($d['hits'][$k]);
        $r = $d['hits'][$key] ?? null;
        if (!$r || $r['reset'] <= $now) { $d['hits'][$key] = ['n' => 1, 'reset' => $now + $windowSec]; return false; }
        $d['hits'][$key]['n']++;
        return $d['hits'][$key]['n'] > $max;
    });
}

function rate_limit(string $bucket, int $max, int $windowSec, string $message = 'Слишком много запросов. Попробуйте чуть позже.'): void
{
    if (rate_exceeded($bucket, $max, $windowSec)) {
        header('Retry-After: ' . $windowSec);
        json_out(['error' => $message], 429);
    }
}

const MAX_FAILS = 5;
const LOCK_SEC = 900;

function fail_key(string $email): string { return hash('sha256', client_ip() . '|' . strtolower($email)); }

function lock_state(string $email): array
{
    $f = limits_file()->data['fails'][fail_key($email)] ?? null;
    if ($f && !empty($f['until']) && $f['until'] > time()) return ['locked' => true, 'minutes' => (int) ceil(($f['until'] - time()) / 60)];
    return ['locked' => false];
}

function register_fail(string $email): int
{
    $k = fail_key($email);
    return limits_file()->mutate(function (array &$d) use ($k) {
        foreach ($d['fails'] as $key => $f) if (!empty($f['until']) && $f['until'] <= time()) unset($d['fails'][$key]);
        $f = $d['fails'][$k] ?? ['n' => 0];
        $f['n']++;
        if ($f['n'] >= MAX_FAILS) $f['until'] = time() + LOCK_SEC;
        $d['fails'][$k] = $f;
        return max(0, MAX_FAILS - $f['n']);
    });
}

function clear_fails(string $email): void
{
    $k = fail_key($email);
    limits_file()->mutate(function (array &$d) use ($k) { unset($d['fails'][$k]); });
}
