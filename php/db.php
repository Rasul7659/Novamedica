<?php
// Содержимое сайта, версии и заявки (порт server/db.js).
declare(strict_types=1);

const MAX_VERSIONS = 30;
const ARCHIVE_DAYS = 90;

function content_file(): JsonFile
{
    static $f = null;
    return $f ??= new JsonFile('content.json', function () {
        $c = seed_content();
        $now = now_iso();
        return [
            'draft' => $c, 'published' => $c, 'publishedAt' => $now, 'currentVersionId' => 1, 'nextVid' => 2,
            'versions' => [['id' => 1, 'at' => $now, 'who' => 'Система', 'what' => 'Начальная версия сайта', 'content' => $c]],
        ];
    });
}
function requests_file(): JsonFile { static $f = null; return $f ??= new JsonFile('requests.json', fn() => ['items' => []]); }
function admin_file(): JsonFile { static $f = null; return $f ??= new JsonFile('admin.json', fn() => []); }
function limits_file(): JsonFile { static $f = null; return $f ??= new JsonFile('limits.json', fn() => ['hits' => [], 'fails' => []]); }

function draft(): array { return content_file()->data['draft']; }
function published(): array { return content_file()->data['published']; }

function edit_draft(callable $fn)
{
    return content_file()->mutate(function (array &$d) use ($fn) { return $fn($d['draft']); });
}

function changes(): array { $d = content_file()->data; return diff_content($d['draft'], $d['published']); }
function license_missing(): bool { return trim((string) (draft()['contacts']['license'] ?? '')) === ''; }

function publish_changes(string $who, array $exclude = []): array
{
    $d = content_file()->data;
    $next = apply_exclusions($d['draft'], $d['published'], $exclude);
    if (trim((string) $next['contacts']['license']) === '') return ['error' => 'license'];
    $included = array_values(array_filter(diff_content($d['draft'], $d['published']), fn($c) => !in_array($c['key'], $exclude, true)));
    if (!$included) return ['error' => 'nothing'];
    $at = now_iso();
    $what = count($included) . ' ' . plural_changes(count($included)) . ' на сайте';
    content_file()->mutate(function (array &$s) use ($next, $at, $who, $what) {
        $s['published'] = $next;
        $s['publishedAt'] = $at;
        $id = $s['nextVid']++;
        $s['currentVersionId'] = $id;
        array_unshift($s['versions'], ['id' => $id, 'at' => $at, 'who' => $who, 'what' => $what, 'content' => $next]);
        $s['versions'] = array_slice($s['versions'], 0, MAX_VERSIONS);
    });
    return ['ok' => true, 'count' => count($included)];
}

function restore_version(int $id): array
{
    $v = null;
    foreach (content_file()->data['versions'] as $x) if ($x['id'] === $id) $v = $x;
    if (!$v) return ['error' => 'not_found'];
    content_file()->mutate(function (array &$s) use ($v) {
        $s['published'] = $v['content'];
        $s['draft'] = $v['content'];
        $s['publishedAt'] = now_iso();
        $s['currentVersionId'] = $v['id'];
    });
    return ['ok' => true];
}

function list_versions(): array
{
    $d = content_file()->data;
    return array_map(fn($v) => ['id' => $v['id'], 'at' => $v['at'], 'who' => $v['who'], 'what' => $v['what'], 'current' => $v['id'] === $d['currentVersionId']], $d['versions']);
}

function media_usage(array $c, string $mediaId): array
{
    $used = [];
    foreach ($c['slots'] as $slot => $id) if ($id === $mediaId) $used[] = SLOTS[$slot];
    foreach ($c['doctors'] as $d) if ($d['photoId'] === $mediaId) { $used[] = 'Врачи'; break; }
    return $used;
}

function completeness(array $c): array
{
    $visibleDocs = array_filter($c['doctors'], fn($d) => $d['visible']);
    $docsTotal = count($visibleDocs);
    $docsWithPhoto = count(array_filter($visibleDocs, fn($d) => $d['photoId']));
    $realInterior = 0;
    foreach (['interiorMain', 'interiorSign', 'interiorWait'] as $s) {
        foreach ($c['media'] as $m) if ($m['id'] === ($c['slots'][$s] ?? null) && empty($m['placeholder'])) $realInterior++;
    }
    $filled = fn($v) => trim((string) $v) !== '' && !preg_match('/[\[\]]/', (string) $v);
    $k = $c['contacts'];
    $items = [
        ['id' => 'license', 'label' => 'Указать номер лицензии', 'done' => $filled($k['license']), 'href' => 'content?tab=contacts'],
        ['id' => 'phone', 'label' => 'Указать телефон клиники', 'done' => strlen(digits($k['phone'])) >= 10 && $filled($k['phone']), 'href' => 'content?tab=contacts'],
        ['id' => 'address', 'label' => 'Указать адрес и режим работы', 'done' => $filled($k['address']) && $filled($k['hours']), 'href' => 'content?tab=contacts'],
        ['id' => 'requisites', 'label' => 'Заполнить реквизиты (ИНН, ОГРН)', 'done' => $filled($k['org']) && $k['inn'] !== '' && $k['ogrn'] !== '', 'href' => 'content?tab=contacts'],
        ['id' => 'prices', 'label' => 'Проставить цены услуг', 'done' => !array_filter($c['services'], fn($s) => $s['visible'] && !$s['price']), 'href' => 'services'],
        ['id' => 'doctors', 'label' => 'Заполнить врачей', 'done' => count($c['doctors']) > 0 && !array_filter($c['doctors'], fn($d) => preg_match('/[\[\]]/', $d['name'])), 'href' => 'doctors'],
        ['id' => 'doctorPhotos', 'label' => 'Добавить фото врачей', 'note' => $docsTotal ? "($docsWithPhoto из $docsTotal)" : '', 'done' => $docsTotal > 0 && $docsWithPhoto === $docsTotal, 'href' => 'doctors'],
        ['id' => 'interior', 'label' => 'Загрузить фото интерьера', 'note' => "($realInterior из 3)", 'done' => $realInterior === 3, 'href' => 'media'],
    ];
    return ['items' => $items, 'done' => count(array_filter($items, fn($i) => $i['done'])), 'total' => count($items)];
}

// ---------- Заявки ----------
function add_request(string $name, string $phone, string $service): array
{
    $item = ['id' => uid('r'), 'name' => $name, 'phone' => $phone, 'service' => $service, 'status' => 'new', 'note' => '', 'createdAt' => now_iso(), 'consentAt' => now_iso()];
    requests_file()->mutate(function (array &$d) use ($item) { array_unshift($d['items'], $item); });
    return $item;
}

function active_requests(): array
{
    $limit = time() - ARCHIVE_DAYS * 86400;
    return array_values(array_filter(requests_file()->data['items'], fn($r) => strtotime($r['createdAt']) >= $limit));
}

function update_request(string $id, array $patch): ?array
{
    return requests_file()->mutate(function (array &$d) use ($id, $patch) {
        foreach ($d['items'] as &$r) {
            if ($r['id'] !== $id) continue;
            if (isset($patch['status'])) $r['status'] = $patch['status'];
            if (isset($patch['note'])) $r['note'] = mb_substr($patch['note'], 0, 500, 'UTF-8');
            return $r;
        }
        return null;
    });
}
