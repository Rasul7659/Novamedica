<?php
// Уведомления: Telegram о новых заявках и письмо со ссылкой для сброса пароля.
declare(strict_types=1);

function tg_configured(): bool { return (bool) (cfg('TELEGRAM_BOT_TOKEN') && cfg('TELEGRAM_CHAT_ID')); }

function http_post_json(string $url, array $payload): bool
{
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_HTTPHEADER => ['Content-Type: application/json']]);
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return $code === 200;
    }
    $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: application/json\r\n", 'content' => $body, 'timeout' => 8]]);
    return @file_get_contents($url, false, $ctx) !== false;
}

function notify_new_request(array $r): bool
{
    if (!tg_configured()) return false;
    $text = "Новая заявка с сайта\n{$r['name']}\n{$r['phone']}\n{$r['service']}";
    return http_post_json('https://api.telegram.org/bot' . cfg('TELEGRAM_BOT_TOKEN') . '/sendMessage', ['chat_id' => cfg('TELEGRAM_CHAT_ID'), 'text' => $text]);
}

function send_reset_mail(string $to, string $link): bool
{
    $text = "Чтобы задать новый пароль, откройте ссылку (действует 1 час):\n$link\n\nЕсли вы ничего не запрашивали, просто проигнорируйте письмо.";
    if (cfg('DEV_MAIL_LOG')) @file_put_contents(data_dir() . '/mail.log', "[" . now_iso() . "] $to\n$link\n", FILE_APPEND);
    $from = (string) cfg('MAIL_FROM', 'noreply@' . preg_replace('/^www\./', '', $_SERVER['HTTP_HOST'] ?? 'localhost'));
    $headers = "From: $from\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    $subject = '=?UTF-8?B?' . base64_encode('Novamedica: восстановление пароля') . '?=';
    return @mail($to, $subject, $text, $headers);
}
