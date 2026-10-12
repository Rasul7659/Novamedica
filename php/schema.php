<?php
// Описание редактируемых блоков и проверка полей (порт server/schema.js).
declare(strict_types=1);

const LOCKED_NOTE = 'Имеются противопоказания. Необходима консультация специалиста.';
const SPECS = ['derm' => 'Дерматолог', 'cosm' => 'Косметолог'];
const SLOTS = [
    'hero' => 'Первый экран',
    'about' => 'О клинике',
    'interiorMain' => 'Интерьер: большое фото',
    'interiorSign' => 'Интерьер: малое фото 1',
    'interiorWait' => 'Интерьер: малое фото 2',
];
const LIMITS = ['serviceTitle' => 50, 'serviceDesc' => 60, 'mediaName' => 80, 'mediaAlt' => 200, 'doctorName' => 100, 'doctorBio' => 500, 'note' => 500];

function sections(): array
{
    static $s = null;
    if ($s !== null) return $s;
    $f = fn(string $k, string $label, string $hint, ?int $max, array $x = []) => array_merge(['k' => $k, 'label' => $label, 'hint' => $hint] + ($max ? ['max' => $max] : []), $x);
    return $s = [
        'hero' => ['title' => 'Первый экран', 'subtitle' => 'Это первое, что видит человек на сайте.', 'fields' => [
            $f('h1', 'Главный заголовок', 'Лучше короче: так заголовок целиком читается на телефоне', 80, ['area' => true, 'req' => true]),
            $f('btn', 'Надпись на кнопке', 'Одно-два слова', 24, ['req' => true]),
        ]],
        'about' => ['title' => 'О клинике', 'subtitle' => 'Короткий рассказ о подходе клиники.', 'fields' => [
            $f('heading', 'Заголовок', 'Одна мысль, без точки в конце', 70, ['req' => true]),
            $f('text', 'Текст', 'Два-три предложения', 300, ['area' => true, 'req' => true]),
        ]],
        'visit' => ['title' => 'Как проходит приём', 'subtitle' => 'Четыре шага первого визита.', 'fields' => [
            $f('heading', 'Заголовок', '', 60, ['req' => true]),
            $f('s1', 'Шаг 1', '', 40, ['req' => true]),
            $f('s2', 'Шаг 2', '', 40, ['req' => true]),
            $f('s3', 'Шаг 3', '', 40, ['req' => true]),
            $f('s4', 'Шаг 4', '', 40, ['req' => true]),
        ]],
        'form' => ['title' => 'Запись', 'subtitle' => 'Блок с формой заявки в конце страницы.', 'fields' => [
            $f('heading', 'Заголовок', '', 40, ['req' => true]),
            $f('text', 'Пояснение под заголовком', 'Скажите, что произойдёт после заявки', 160, ['area' => true, 'req' => true]),
        ]],
        'footer' => ['title' => 'Подвал сайта', 'subtitle' => 'Нижняя часть страницы. Реквизиты берутся из вкладки «Контакты и реквизиты».', 'fields' => [
            $f('org', 'Название в подвале', 'Как подписать сайт внизу', 60, ['req' => true]),
            $f('note', 'Предупреждение о противопоказаниях', 'Этот текст обязателен по закону, поэтому его нельзя изменить', 200, ['area' => true, 'locked' => true]),
        ]],
        'contacts' => ['title' => 'Контакты и реквизиты', 'subtitle' => 'Эти данные появятся в подвале, в блоке «Запись» и на первом экране.', 'fields' => [
            $f('address', 'Адрес', 'Город, улица, дом, этаж', 100, ['req' => true]),
            $f('hours', 'Режим работы', 'Например: ежедневно, 10:00–20:00', 60, ['req' => true]),
            $f('phone', 'Телефон', 'Начните с +7 или 8', 20, ['req' => true, 'ph' => '+7 000 000-00-00']),
            $f('whatsapp', 'Ссылка на WhatsApp', 'По желанию. Кнопка появится на сайте, если заполнено', 80, ['ph' => 'wa.me/7000...']),
            $f('telegram', 'Ссылка на Telegram', 'По желанию', 80, ['ph' => 't.me/...']),
            $f('org', 'Юридическое лицо', 'Полное название, как в документах', 100, ['req' => true, 'ph' => 'ООО «...»']),
            $f('inn', 'ИНН', '10 или 12 цифр', 12, ['req' => true, 'ph' => '0000000000']),
            $f('ogrn', 'ОГРН', '13 или 15 цифр', 15, ['req' => true, 'ph' => '0000000000000']),
            $f('license', 'Номер лицензии на медицинскую деятельность', 'Есть в вашей лицензии. Например: ЛО-77-01-000000 от 01.01.2026', 60, ['req' => true, 'ph' => 'ЛО-77-01-000000 от 01.01.2026']),
        ]],
    ];
}

function valid_phone(string $v): bool
{
    $d = strlen(digits($v));
    return $d >= 10 && $d <= 15 && preg_match('/^[+\d\s()\-]+$/', $v) === 1;
}

// Телефон для ссылки tel:. '' — если цифр не хватает.
function tel_href(string $v): string
{
    $d = digits($v);
    $n = strlen($d);
    if ($n === 11 && ($d[0] === '8' || $d[0] === '7')) return '+7' . substr($d, 1);
    if ($n === 10) return '+7' . $d;
    if ($n >= 11 && $n <= 15) return '+' . $d;
    return '';
}

// Безопасная https-ссылка мессенджера или null.
function safe_link($v): ?string
{
    $s = trim((string) $v);
    if ($s === '') return null;
    if (preg_match('#^https?://#i', $s)) $url = $s;
    elseif (preg_match('/^[a-z][a-z0-9+.\-]*:/i', $s)) return null;
    else $url = 'https://' . preg_replace('/^@/', 't.me/', $s);
    if (!filter_var($url, FILTER_VALIDATE_URL)) return null;
    $p = parse_url($url);
    if (!$p || !in_array($p['scheme'] ?? '', ['http', 'https'], true)) return null;
    $host = $p['host'] ?? '';
    if (!str_contains($host, '.') || !preg_match('/^[a-z0-9.\-]+$/i', $host)) return null;
    return $url;
}

function validate_section(string $key, array $values): array
{
    $errs = [];
    foreach (sections()[$key]['fields'] as $f) {
        if (!empty($f['locked'])) continue;
        $v = trim(is_string($values[$f['k']] ?? null) ? $values[$f['k']] : '');
        $k = $f['k'];
        if (!empty($f['req']) && $v === '') {
            $errs[$k] = $k === 'license'
                ? 'Без номера лицензии сайт публиковать нельзя: это требование закона. Номер есть в вашей лицензии.'
                : 'Заполните это поле';
        } elseif (!empty($f['max']) && ulen($v) > $f['max']) {
            $errs[$k] = 'Слишком длинно: сократите до ' . $f['max'] . ' знаков';
        } elseif ($k === 'phone' && $v !== '' && !valid_phone($v)) {
            $errs[$k] = 'Похоже, в номере не хватает цифр. Пример: +7 900 000-00-00';
        } elseif ($k === 'inn' && $v !== '' && !preg_match('/^(\d{10}|\d{12})$/', $v)) {
            $errs[$k] = 'ИНН состоит из 10 или 12 цифр';
        } elseif ($k === 'ogrn' && $v !== '' && !preg_match('/^(\d{13}|\d{15})$/', $v)) {
            $errs[$k] = 'ОГРН состоит из 13 или 15 цифр';
        } elseif (($k === 'whatsapp' || $k === 'telegram') && $v !== '' && safe_link($v) === null) {
            $errs[$k] = 'Не похоже на ссылку. Пример: ' . ($k === 'whatsapp' ? 'wa.me/79000000000' : 't.me/novamedica');
        }
    }
    return $errs;
}

function validate_service(array $d): array
{
    $errs = [];
    $title = trim((string) ($d['title'] ?? ''));
    $desc = trim((string) ($d['desc'] ?? ''));
    $price = digits($d['price'] ?? '');
    if ($title === '') $errs['title'] = 'Напишите название — оно покажется на карточке';
    elseif (ulen($title) > LIMITS['serviceTitle']) $errs['title'] = 'Слишком длинно: не больше ' . LIMITS['serviceTitle'] . ' знаков';
    if (ulen($desc) > LIMITS['serviceDesc']) $errs['desc'] = 'Слишком длинно: не больше ' . LIMITS['serviceDesc'] . ' знаков';
    if ($price === '' || preg_match('/^0+$/', $price) || strlen($price) > 7) $errs['price'] = 'Укажите цену цифрами. Например: 3500';
    return $errs;
}

function validate_doctor(array $d): array
{
    $errs = [];
    $name = trim((string) ($d['name'] ?? ''));
    if ($name === '') $errs['name'] = 'Напишите ФИО — оно подписывает карточку';
    elseif (ulen($name) > LIMITS['doctorName']) $errs['name'] = 'Слишком длинно';
    if (!isset(SPECS[$d['spec'] ?? ''])) $errs['spec'] = 'Выберите специальность';
    if (($d['exp'] ?? '') !== '' && !preg_match('/^\d{1,2}$/', (string) $d['exp'])) $errs['exp'] = 'Стаж — число лет, например: 8';
    if (ulen((string) ($d['bio'] ?? '')) > LIMITS['doctorBio']) $errs['bio'] = 'Слишком длинно: не больше ' . LIMITS['doctorBio'] . ' знаков';
    return $errs;
}
