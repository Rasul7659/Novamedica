<?php
// Приём файлов: проверка по содержимому, сжатие фото и удаление метаданных (порт server/media.js).
declare(strict_types=1);

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 30 * 1024 * 1024;
const MAX_PIXELS = 40000000;

function sniff_file(string $buf): ?array
{
    if (strlen($buf) <= 12) return null;
    if (substr($buf, 0, 3) === "\xFF\xD8\xFF") return ['kind' => 'image', 'ext' => 'jpg'];
    if (substr($buf, 0, 8) === "\x89PNG\r\n\x1A\n") return ['kind' => 'image', 'ext' => 'png'];
    if (substr($buf, 0, 4) === 'RIFF' && substr($buf, 8, 4) === 'WEBP') return ['kind' => 'image', 'ext' => 'webp'];
    if (substr($buf, 4, 4) === 'ftyp') return ['kind' => 'video', 'ext' => 'mp4'];
    return null;
}

// Возвращает ['url' => ..., 'kind' => ...] или бросает RuntimeException с понятным текстом.
function save_upload(?array $file): array
{
    if (!$file) throw new RuntimeException('Выберите файл на компьютере');
    $err = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($err === UPLOAD_ERR_NO_FILE) throw new RuntimeException('Выберите файл на компьютере');
    if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) throw new RuntimeException('Файл слишком большой. Фото — до 10 МБ, видео — до 30 МБ');
    if ($err !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) throw new RuntimeException('Не удалось загрузить файл. Попробуйте ещё раз');

    $size = (int) $file['size'];
    $buf = (string) file_get_contents($file['tmp_name']);
    $t = sniff_file($buf);
    if (!$t) throw new RuntimeException('Этот тип файла не подходит. Загрузите фото JPG или PNG либо видео MP4');
    if ($t['kind'] === 'image' && $size > MAX_IMAGE) throw new RuntimeException('Фото больше 10 МБ. Уменьшите его и попробуйте ещё раз');
    if ($t['kind'] === 'video' && $size > MAX_VIDEO) throw new RuntimeException('Видео больше 30 МБ. Сожмите его и попробуйте ещё раз');

    $ext = $t['ext'];
    if ($t['kind'] === 'image' && function_exists('imagecreatefromstring')) {
        $info = @getimagesizefromstring($buf);
        if (!$info) throw new RuntimeException('Не удалось прочитать фото. Возможно, файл повреждён');
        if ($info[0] * $info[1] > MAX_PIXELS) throw new RuntimeException('У фото слишком большое разрешение. Уменьшите его и попробуйте ещё раз');
        $buf = reencode_image($buf, $t['ext']);
        $ext = 'jpg';
    }
    $name = uid('f') . '.' . $ext;
    if (file_put_contents(uploads_dir() . '/' . $name, $buf) === false) throw new RuntimeException('Не удалось сохранить файл на сервере');
    return ['url' => '/uploads/' . $name, 'kind' => $t['kind']];
}

// Перекодирование в JPEG до 2000 px: применяем поворот из EXIF, сами метаданные (в т.ч. GPS) не сохраняются.
function reencode_image(string $buf, string $ext): string
{
    $img = @imagecreatefromstring($buf);
    if (!$img) throw new RuntimeException('Не удалось прочитать фото. Возможно, файл повреждён');
    if ($ext === 'jpg' && function_exists('exif_read_data')) {
        $exif = @exif_read_data('data://image/jpeg;base64,' . base64_encode($buf));
        $angle = [3 => 180, 6 => -90, 8 => 90][$exif['Orientation'] ?? 1] ?? 0;
        if ($angle) { $rot = imagerotate($img, $angle, 0); if ($rot) { $img = $rot; } }
    }
    $w = imagesx($img); $h = imagesy($img);
    $scale = min(1, 2000 / max($w, $h));
    $nw = max(1, (int) round($w * $scale)); $nh = max(1, (int) round($h * $scale));
    $out = imagecreatetruecolor($nw, $nh);
    imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255)); // прозрачность PNG → белый фон
    imagecopyresampled($out, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
    ob_start();
    imagejpeg($out, null, 84);
    $res = (string) ob_get_clean();
    return $res;
}
