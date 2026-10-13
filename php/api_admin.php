<?php
// API админки (порт server/api-admin.js). Адреса и ответы те же, поэтому интерфейс админки работает без изменений.
declare(strict_types=1);

const STATUSES = ['new', 'wait', 'booked', 'refused'];

function media_view(array $c): array
{
    return array_map(fn($m) => $m + ['usedBy' => media_usage($c, $m['id'])], $c['media']);
}

function admin_state(): array
{
    $c = draft();
    $reqs = active_requests();
    $new = array_values(array_filter($reqs, fn($r) => $r['status'] === 'new'));
    return [
        'me' => current_admin(),
        'schema' => ['sections' => sections(), 'slots' => SLOTS],
        'draft' => ['media' => media_view($c)] + $c,
        'changes' => changes(),
        'publishedAt' => content_file()->data['publishedAt'],
        'versions' => list_versions(),
        'licenseMissing' => license_missing(),
        'completeness' => completeness($c),
        'newRequests' => count($new),
        'freshRequests' => array_slice($new, 0, 3),
        'telegram' => tg_configured(),
    ];
}

function reply(array $extra = []): void { json_out($extra + ['state' => admin_state()]); }
function fail_fields(array $errors, string $msg = 'Проверьте поля, отмеченные красным'): void { json_out(['error' => $msg, 'errors' => $errors], 422); }
function not_found(string $msg): void { json_out(['error' => $msg], 404); }

function handle_admin_api(string $method, string $path): void
{
    header('Cache-Control: no-store');
    require_fetch_header();
    $m = [];

    // ----- Без входа -----
    if ($method === 'POST' && $path === '/login') {
        rate_limit('login', 20, 60, 'Слишком много попыток входа. Подождите минуту.');
        $b = body_json();
        $email = strtolower(trim(str($b['email'] ?? '', 200)));
        $password = str($b['password'] ?? '', 200);
        if ($email === '' || $password === '') json_out(['error' => 'Введите почту и пароль'], 400);
        $lock = lock_state($email);
        if ($lock['locked']) json_out(['error' => "Слишком много попыток. Подождите {$lock['minutes']} мин. или восстановите пароль по ссылке «Забыли пароль?».", 'locked' => true], 429);
        $a = admin_file()->data;
        if (empty($a['email']) || $email !== $a['email'] || !password_verify($password, (string) $a['hash'])) {
            $left = register_fail($email);
            if ($left === 0) json_out(['error' => 'Слишком много попыток. Подождите 15 минут или восстановите пароль по ссылке «Забыли пароль?».', 'locked' => true], 429);
            json_out(['error' => "Почта или пароль не подошли. Проверьте раскладку и Caps Lock. Осталось попыток: $left.", 'left' => $left], 401);
        }
        clear_fails($email);
        start_session(!empty($b['remember']));
        json_out(['ok' => true, 'email' => $a['email']]);
    }
    if ($method === 'POST' && $path === '/logout') { end_session(); json_out(['ok' => true]); }
    if ($method === 'GET' && $path === '/me') {
        $me = current_admin();
        if (!$me) json_out(['error' => 'Нужно войти в админку'], 401);
        json_out($me);
    }
    if ($method === 'POST' && $path === '/forgot') {
        rate_limit('forgot', 5, 900, 'Слишком много запросов. Попробуйте через 15 минут.');
        $email = strtolower(trim(str(body_json()['email'] ?? '', 200)));
        if (!preg_match('/^\S+@\S+\.\S+$/u', $email)) json_out(['error' => 'Похоже, в почте ошибка. Пример: name@клиника.рф'], 422);
        // Ответ всегда одинаковый, чтобы нельзя было выяснить, какая почта заведена.
        if ($email === (admin_file()->data['email'] ?? null)) {
            send_reset_mail($email, public_base() . '/admin/reset?token=' . create_reset_token());
        }
        json_out(['ok' => true]);
    }
    if ($method === 'POST' && $path === '/reset') {
        rate_limit('reset', 10, 900, 'Слишком много попыток. Попробуйте через 15 минут.');
        $b = body_json();
        $password = str($b['password'] ?? '', 200);
        if (ulen($password) < 8) json_out(['error' => 'Пароль слишком короткий: не меньше 8 символов'], 422);
        if (!consume_reset_token(str($b['token'] ?? '', 200), $password)) json_out(['error' => 'Ссылка устарела или уже использована. Запросите новую на странице входа.'], 400);
        json_out(['ok' => true]);
    }

    // ----- Только для администратора -----
    $me = require_admin();

    if ($method === 'GET' && $path === '/bootstrap') json_out(admin_state());

    if ($method === 'PUT' && preg_match('#^/sections/([a-z]+)$#', $path, $m)) {
        $key = $m[1];
        $secs = sections();
        if (!isset($secs[$key])) not_found('Такого блока нет');
        $b = body_json();
        $values = [];
        foreach ($secs[$key]['fields'] as $f) if (empty($f['locked'])) $values[$f['k']] = trim(str($b[$f['k']] ?? '', 500));
        $errors = validate_section($key, $values);
        if ($errors) fail_fields($errors);
        edit_draft(function (array &$c) use ($key, $values) { $c[$key] = $values + $c[$key]; });
        reply();
    }

    // Услуги
    if ($method === 'POST' && $path === '/services') {
        $b = body_json();
        $d = ['title' => str($b['title'] ?? '', 100), 'desc' => str($b['desc'] ?? '', 200), 'price' => digits($b['price'] ?? '')];
        $errors = validate_service($d);
        if ($errors) fail_fields($errors);
        $item = ['id' => uid('s'), 'title' => trim($d['title']), 'desc' => trim($d['desc']), 'price' => (string) (int) $d['price'], 'visible' => true];
        edit_draft(function (array &$c) use ($item) { $c['services'][] = $item; });
        reply(['id' => $item['id']]);
    }
    if ($method === 'PUT' && preg_match('#^/services/([\w-]+)$#', $path, $m)) {
        $b = body_json();
        $d = ['title' => str($b['title'] ?? '', 100), 'desc' => str($b['desc'] ?? '', 200), 'price' => digits($b['price'] ?? '')];
        $errors = validate_service($d);
        if ($errors) fail_fields($errors);
        $found = edit_draft(function (array &$c) use ($m, $d) {
            foreach ($c['services'] as &$s) if ($s['id'] === $m[1]) {
                $s['title'] = trim($d['title']); $s['desc'] = trim($d['desc']); $s['price'] = (string) (int) $d['price'];
                return true;
            }
            return false;
        });
        if (!$found) not_found('Услуга не найдена');
        reply();
    }
    if ($method === 'PATCH' && preg_match('#^/services/([\w-]+)/visible$#', $path, $m)) {
        $b = body_json();
        $found = edit_draft(function (array &$c) use ($m, $b) {
            foreach ($c['services'] as &$s) if ($s['id'] === $m[1]) { $s['visible'] = !empty($b['visible']); return true; }
            return false;
        });
        if (!$found) not_found('Услуга не найдена');
        reply();
    }

    // Врачи
    $doctorFields = function (array $b): array {
        return [
            'name' => trim(str($b['name'] ?? '', 200)), 'spec' => str($b['spec'] ?? '', 40),
            'exp' => substr(digits($b['exp'] ?? ''), 0, 2), 'bio' => trim(str($b['bio'] ?? '', 1000)),
            'photoId' => !empty($b['photoId']) ? str($b['photoId'], 40) : null, 'visible' => ($b['visible'] ?? true) !== false,
        ];
    };
    $photoOk = function (?string $id): bool {
        if (!$id) return true;
        foreach (draft()['media'] as $x) if ($x['id'] === $id && $x['kind'] !== 'video') return true;
        return false;
    };
    if ($method === 'POST' && $path === '/doctors') {
        $d = $doctorFields(body_json());
        $errors = validate_doctor($d, draft()['specialties']);
        if ($errors) fail_fields($errors);
        if (!$photoOk($d['photoId'])) fail_fields(['photo' => 'Фото не найдено. Загрузите его заново']);
        $item = ['id' => uid('d')] + $d;
        edit_draft(function (array &$c) use ($item) { $c['doctors'][] = $item; });
        reply(['id' => $item['id']]);
    }
    if ($method === 'PUT' && preg_match('#^/doctors/([\w-]+)$#', $path, $m)) {
        $d = $doctorFields(body_json());
        $errors = validate_doctor($d, draft()['specialties']);
        if ($errors) fail_fields($errors);
        if (!$photoOk($d['photoId'])) fail_fields(['photo' => 'Фото не найдено. Загрузите его заново']);
        $found = edit_draft(function (array &$c) use ($m, $d) {
            foreach ($c['doctors'] as &$x) if ($x['id'] === $m[1]) { $x = ['id' => $x['id']] + $d; return true; }
            return false;
        });
        if (!$found) not_found('Врач не найден');
        reply();
    }

    // Специальности врачей
    if ($method === 'POST' && $path === '/specialties') {
        $name = trim(str(body_json()['name'] ?? '', 200));
        $err = validate_specialty_name($name, draft()['specialties']);
        if ($err) fail_fields(['name' => $err]);
        $item = ['id' => uid('sp'), 'name' => $name];
        edit_draft(function (array &$c) use ($item) { $c['specialties'][] = $item; });
        reply(['id' => $item['id']]);
    }
    if ($method === 'PUT' && preg_match('#^/specialties/([\w-]+)$#', $path, $m)) {
        $name = trim(str(body_json()['name'] ?? '', 200));
        $found = array_filter(draft()['specialties'], fn($s) => $s['id'] === $m[1]);
        if (!$found) not_found('Специальность не найдена');
        $err = validate_specialty_name($name, draft()['specialties'], $m[1]);
        if ($err) fail_fields(['name' => $err]);
        edit_draft(function (array &$c) use ($m, $name) { foreach ($c['specialties'] as &$s) if ($s['id'] === $m[1]) $s['name'] = $name; });
        reply();
    }
    if ($method === 'DELETE' && preg_match('#^/specialties/([\w-]+)$#', $path, $m)) {
        $c = draft();
        if (!array_filter($c['specialties'], fn($s) => $s['id'] === $m[1])) not_found('Специальность не найдена');
        $used = count(array_filter($c['doctors'], fn($d) => $d['spec'] === $m[1]));
        if ($used) json_out(['error' => "Эта специальность указана у врачей: $used. Сначала переведите их на другую специальность."], 409);
        if (count($c['specialties']) <= 1) json_out(['error' => 'Должна остаться хотя бы одна специальность.'], 409);
        edit_draft(function (array &$d) use ($m) { $d['specialties'] = array_values(array_filter($d['specialties'], fn($s) => $s['id'] !== $m[1])); });
        reply();
    }

    // Фото и видео
    if ($method === 'POST' && $path === '/media') {
        try {
            $saved = save_upload($_FILES['file'] ?? null);
        } catch (RuntimeException $ex) { json_out(['error' => $ex->getMessage()], 422); }
        $orig = (string) preg_replace('/\.[^.]+$/u', '', (string) ($_FILES['file']['name'] ?? ''));
        $name = mb_substr(trim($orig), 0, LIMITS['mediaName'], 'UTF-8') ?: 'Новый файл';
        $kind = $saved['kind'] === 'video' ? 'video' : (($_POST['kind'] ?? '') === 'doctor' ? 'doctor' : 'interior');
        $item = ['id' => uid('m'), 'name' => $name, 'alt' => '', 'kind' => $kind, 'url' => $saved['url'], 'crop' => null, 'placeholder' => false];
        edit_draft(function (array &$c) use ($item) { array_unshift($c['media'], $item); });
        reply(['id' => $item['id']]);
    }
    if ($method === 'PUT' && preg_match('#^/media/([\w-]+)$#', $path, $m)) {
        $b = body_json();
        $name = trim(str($b['name'] ?? '', 200));
        $alt = trim(str($b['alt'] ?? '', 400));
        if ($name === '') fail_fields(['name' => 'Дайте файлу название, чтобы его легко найти']);
        if (ulen($name) > LIMITS['mediaName']) fail_fields(['name' => 'Слишком длинно']);
        if (ulen($alt) > LIMITS['mediaAlt']) fail_fields(['alt' => 'Слишком длинно']);
        $slotsWanted = is_array($b['slots'] ?? null) ? array_values(array_filter($b['slots'], fn($s) => is_string($s) && isset(SLOTS[$s]))) : null;
        $media = null;
        foreach (draft()['media'] as $x) if ($x['id'] === $m[1]) $media = $x;
        if (!$media) not_found('Файл не найден');
        if ($slotsWanted && $media['kind'] !== 'interior') fail_fields(['slots' => 'На сайт в эти места можно поставить только фото интерьера']);
        edit_draft(function (array &$c) use ($media, $name, $alt, $slotsWanted) {
            foreach ($c['media'] as &$x) if ($x['id'] === $media['id']) { $x['name'] = $name; $x['alt'] = $alt; }
            unset($x);
            if ($slotsWanted !== null) {
                foreach (array_keys(SLOTS) as $slot) {
                    if (in_array($slot, $slotsWanted, true)) $c['slots'][$slot] = $media['id'];
                    elseif (($c['slots'][$slot] ?? null) === $media['id']) $c['slots'][$slot] = null;
                }
            }
        });
        reply();
    }
    if ($method === 'POST' && preg_match('#^/media/([\w-]+)/replace$#', $path, $m)) {
        $media = null;
        foreach (draft()['media'] as $x) if ($x['id'] === $m[1]) $media = $x;
        if (!$media) not_found('Файл не найден');
        try {
            $saved = save_upload($_FILES['file'] ?? null);
            if (($saved['kind'] === 'video') !== ($media['kind'] === 'video')) throw new RuntimeException('Заменить можно только файлом того же типа: фото на фото, видео на видео');
        } catch (RuntimeException $ex) { json_out(['error' => $ex->getMessage()], 422); }
        edit_draft(function (array &$c) use ($media, $saved) {
            foreach ($c['media'] as &$x) if ($x['id'] === $media['id']) { $x['url'] = $saved['url']; $x['crop'] = null; $x['placeholder'] = false; }
        });
        reply();
    }
    if ($method === 'DELETE' && preg_match('#^/media/([\w-]+)$#', $path, $m)) {
        $c = draft();
        $found = false;
        foreach ($c['media'] as $x) if ($x['id'] === $m[1]) $found = true;
        if (!$found) not_found('Файл не найден');
        if (media_usage($c, $m[1])) json_out(['error' => 'Этот снимок сейчас стоит на сайте, поэтому удалить его нельзя. Сначала замените его на другой.'], 409);
        edit_draft(function (array &$d) use ($m) { $d['media'] = array_values(array_filter($d['media'], fn($x) => $x['id'] !== $m[1])); });
        reply();
    }

    // Заявки
    if ($method === 'GET' && $path === '/requests') json_out(['items' => active_requests(), 'telegram' => tg_configured()]);
    if ($method === 'PUT' && preg_match('#^/requests/([\w-]+)$#', $path, $m)) {
        $b = body_json();
        $patch = [];
        if (array_key_exists('status', $b)) {
            if (!in_array($b['status'], STATUSES, true)) json_out(['error' => 'Неизвестный статус'], 422);
            $patch['status'] = $b['status'];
        }
        if (array_key_exists('note', $b)) $patch['note'] = str($b['note'], 500);
        $r = update_request($m[1], $patch);
        if (!$r) not_found('Заявка не найдена');
        json_out(['item' => $r, 'newRequests' => count(array_filter(active_requests(), fn($x) => $x['status'] === 'new'))]);
    }

    // Публикация
    if ($method === 'POST' && $path === '/publish') {
        $b = body_json();
        $exclude = is_array($b['exclude'] ?? null) ? array_map(fn($k) => str($k, 80), $b['exclude']) : [];
        $out = publish_changes($me['name'], $exclude);
        if (($out['error'] ?? '') === 'license') json_out(['error' => 'Не заполнен номер лицензии. Публиковать сайт без него нельзя.', 'code' => 'license'], 422);
        if (($out['error'] ?? '') === 'nothing') json_out(['error' => 'Нет изменений для публикации', 'code' => 'nothing'], 422);
        reply(['count' => $out['count']]);
    }
    if ($method === 'POST' && preg_match('#^/versions/(\d+)/restore$#', $path, $m)) {
        $out = restore_version((int) $m[1]);
        if (isset($out['error'])) not_found('Такой версии нет');
        reply();
    }

    json_out(['error' => 'Не найдено'], 404);
}
