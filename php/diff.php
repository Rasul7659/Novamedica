<?php
// Сравнение черновика с опубликованным и применение «Не публиковать» (порт server/diff.js).
declare(strict_types=1);

function money_txt($p): string
{
    return $p ? 'от ' . preg_replace('/\B(?=(\d{3})+(?!\d))/', "\u{00A0}", (string) $p) . ' ₽' : 'не указана';
}

function by_id(array $list): array
{
    $m = [];
    foreach ($list as $x) $m[$x['id']] = $x;
    return $m;
}

function diff_content(array $draft, array $pub): array
{
    $out = [];
    $secs = sections();

    foreach ($secs as $key => $def) {
        if (same($draft[$key], $pub[$key])) continue;
        $changed = array_values(array_filter($def['fields'], fn($f) => ($draft[$key][$f['k']] ?? '') !== ($pub[$key][$f['k']] ?? '')));
        $page = $key === 'contacts' ? 'content?tab=contacts' : 'content?block=' . $key;
        if (count($changed) === 1) {
            $f = $changed[0];
            $out[] = [
                'key' => 'text:' . $key,
                'where' => ($key === 'contacts' ? 'Контакты · ' : $def['title'] . ' · ') . $f['label'],
                'old' => $pub[$key][$f['k']] ?? '',
                'now' => ($draft[$key][$f['k']] ?? '') !== '' ? $draft[$key][$f['k']] : '(пусто)',
                'page' => $page,
            ];
        } else {
            $out[] = [
                'key' => 'text:' . $key, 'where' => 'Тексты · ' . $def['title'], 'old' => '',
                'now' => 'Изменено: ' . implode(', ', array_map(fn($f) => $f['label'], $changed)), 'page' => $page,
            ];
        }
    }

    $pubS = by_id($pub['services']);
    $drS = by_id($draft['services']);
    foreach ($draft['services'] as $s) {
        $p = $pubS[$s['id']] ?? null;
        if (!$p) {
            $out[] = ['key' => 'svc:' . $s['id'], 'where' => 'Услуги', 'old' => '', 'now' => 'Добавлена: ' . $s['title'] . ($s['visible'] ? '' : ' (скрыта)'), 'page' => 'services'];
        } elseif (!same($s, $p)) {
            if ($s['price'] !== $p['price'] && $s['title'] === $p['title'] && $s['desc'] === $p['desc'] && $s['visible'] === $p['visible']) {
                $out[] = ['key' => 'svc:' . $s['id'], 'where' => 'Цена · ' . $s['title'], 'old' => money_txt($p['price']), 'now' => money_txt($s['price']), 'page' => 'services'];
            } elseif ($s['visible'] !== $p['visible'] && $s['title'] === $p['title'] && $s['desc'] === $p['desc'] && $s['price'] === $p['price']) {
                $out[] = ['key' => 'svc:' . $s['id'], 'where' => 'Услуги', 'old' => '', 'now' => ($s['visible'] ? 'Снова на сайте: ' : 'Скрыта: ') . $s['title'], 'page' => 'services'];
            } else {
                $out[] = ['key' => 'svc:' . $s['id'], 'where' => 'Услуга · ' . $p['title'], 'old' => '', 'now' => 'Изменены данные услуги', 'page' => 'services'];
            }
        }
    }
    foreach ($pub['services'] as $p) {
        if (!isset($drS[$p['id']])) $out[] = ['key' => 'svc:' . $p['id'], 'where' => 'Услуги', 'old' => '', 'now' => 'Убрана: ' . $p['title'], 'page' => 'services'];
    }

    $pubD = by_id($pub['doctors']);
    $drD = by_id($draft['doctors']);
    foreach ($draft['doctors'] as $d) {
        $p = $pubD[$d['id']] ?? null;
        if (!$p) {
            $out[] = ['key' => 'doc:' . $d['id'], 'where' => 'Врачи', 'old' => '', 'now' => 'Добавлен врач: ' . $d['name'] . ($d['visible'] ? '' : ' (скрыт)'), 'page' => 'doctors'];
        } elseif (!same($d, $p)) {
            $parts = [];
            if ($d['name'] !== $p['name']) $parts[] = 'ФИО';
            if ($d['spec'] !== $p['spec']) $parts[] = 'специальность';
            if ($d['exp'] !== $p['exp'] || $d['bio'] !== $p['bio']) $parts[] = 'стаж и образование';
            if ($d['photoId'] !== $p['photoId']) $parts[] = 'фото';
            if ($d['visible'] !== $p['visible']) $parts[] = $d['visible'] ? 'показан на сайте' : 'скрыт';
            $out[] = ['key' => 'doc:' . $d['id'], 'where' => 'Врач · ' . $p['name'], 'old' => '', 'now' => 'Изменено: ' . implode(', ', $parts), 'page' => 'doctors'];
        }
    }
    foreach ($pub['doctors'] as $p) {
        if (!isset($drD[$p['id']])) $out[] = ['key' => 'doc:' . $p['id'], 'where' => 'Врачи', 'old' => '', 'now' => 'Убран: ' . $p['name'], 'page' => 'doctors'];
    }

    $pubM = by_id($pub['media']);
    $drM = by_id($draft['media']);
    foreach ($draft['media'] as $m) {
        $p = $pubM[$m['id']] ?? null;
        if (!$p) $out[] = ['key' => 'media:' . $m['id'], 'where' => 'Фото и видео', 'old' => '', 'now' => 'Загружено: ' . $m['name'], 'page' => 'media'];
        elseif (!same($m, $p)) $out[] = ['key' => 'media:' . $m['id'], 'where' => 'Фото · ' . $p['name'], 'old' => '', 'now' => 'Изменены название, описание или файл', 'page' => 'media'];
    }
    foreach ($pub['media'] as $p) {
        if (!isset($drM[$p['id']])) $out[] = ['key' => 'media:' . $p['id'], 'where' => 'Фото и видео', 'old' => '', 'now' => 'Удалено: ' . $p['name'], 'page' => 'media'];
    }
    foreach (SLOTS as $slot => $label) {
        if (($draft['slots'][$slot] ?? null) !== ($pub['slots'][$slot] ?? null)) {
            $m = $drM[$draft['slots'][$slot] ?? ''] ?? null;
            $out[] = ['key' => 'slot:' . $slot, 'where' => 'Фото на сайте', 'old' => '', 'now' => $label . ': ' . ($m ? $m['name'] : 'не выбрано'), 'page' => 'media'];
        }
    }
    return $out;
}

function apply_exclusions(array $draft, array $pub, array $excluded): array
{
    $next = $draft;
    $secs = sections();
    foreach ($excluded as $key) {
        $pos = strpos($key, ':');
        if ($pos === false) continue;
        $type = substr($key, 0, $pos);
        $id = substr($key, $pos + 1);
        if ($type === 'text' && isset($secs[$id])) {
            $next[$id] = $pub[$id];
        } elseif (in_array($type, ['svc', 'doc', 'media'], true)) {
            $field = ['svc' => 'services', 'doc' => 'doctors', 'media' => 'media'][$type];
            $pubItem = null;
            foreach ($pub[$field] as $x) if ($x['id'] === $id) $pubItem = $x;
            $idx = null;
            foreach ($next[$field] as $i => $x) if ($x['id'] === $id) $idx = $i;
            if ($pubItem !== null && $idx !== null) $next[$field][$idx] = $pubItem;
            elseif ($pubItem !== null) $next[$field][] = $pubItem;
            elseif ($idx !== null) array_splice($next[$field], $idx, 1);
        } elseif ($type === 'slot' && isset(SLOTS[$id])) {
            $next['slots'][$id] = $pub['slots'][$id] ?? null;
        }
    }
    $ids = array_column($next['media'], 'id');
    foreach ($next['doctors'] as &$d) if ($d['photoId'] && !in_array($d['photoId'], $ids, true)) $d['photoId'] = null;
    unset($d);
    foreach ($next['slots'] as $s => $mid) if ($mid && !in_array($mid, $ids, true)) $next['slots'][$s] = null;
    return $next;
}

function plural_changes(int $n): string
{
    $a = $n % 10; $b = $n % 100;
    return $a === 1 && $b !== 11 ? 'изменение' : ($a >= 2 && $a <= 4 && ($b < 10 || $b >= 20) ? 'изменения' : 'изменений');
}
