<?php
declare(strict_types=1);

/**
 * Join-form endpoint.
 *
 * Captures a lead durably (append to a CSV outside the web root — this is what
 * decides "success" for the browser), then best-effort notifies the Telegram
 * recipients. The bot token + chat ids live outside the web root in
 * ../config/telegram.php; failures to notify are logged, never surfaced as an
 * error to the visitor once the lead is stored.
 */

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method']);
    exit;
}

/** Trimmed, control-char-stripped, length-capped field. */
function field(string $key, int $max): string
{
    $value = isset($_POST[$key]) ? trim((string) $_POST[$key]) : '';
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
    if (mb_strlen($value) > $max) {
        $value = mb_substr($value, 0, $max);
    }
    return $value;
}

$name    = field('name', 200);
$contact = field('phone', 200); // form field is "phone", shown as "Контакт"
$about   = field('about', 4000);

// Name + contact are required; "about" is optional.
if ($name === '' || $contact === '') {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'validation']);
    exit;
}

$dataDir = __DIR__ . '/../submissions';
$csvPath = $dataDir . '/leads.csv';
$errPath = $dataDir . '/errors.log';
$now     = new DateTimeImmutable('now', new DateTimeZone('Europe/Moscow'));

// --- 1) Durable capture: append to the CSV (decides success) ---------------
$stored = false;
$handle = @fopen($csvPath, 'a');
if ($handle !== false) {
    if (flock($handle, LOCK_EX)) {
        if (ftell($handle) === 0) {
            fwrite($handle, "\xEF\xBB\xBF"); // UTF-8 BOM so Excel reads Cyrillic
            fputcsv($handle, ['дата', 'имя', 'контакт', 'о себе'], ';');
        }
        fputcsv($handle, [$now->format('Y-m-d H:i:s'), $name, $contact, $about], ';');
        fflush($handle);
        flock($handle, LOCK_UN);
        $stored = true;
    }
    fclose($handle);
}

if (!$stored) {
    @error_log($now->format('c') . " CSV write failed\n", 3, $errPath);
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'store']);
    exit;
}

// Lead is safe — tell the browser now and close the connection so it isn't
// held open while we talk to Telegram.
echo json_encode(['ok' => true]);
if (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
}

// --- 2) Best-effort: notify Telegram recipients ----------------------------
$configFile = __DIR__ . '/../config/telegram.php';
if (!is_file($configFile)) {
    @error_log($now->format('c') . " telegram config missing\n", 3, $errPath);
    exit;
}
$config = require $configFile;
$text   = "Имя: {$name}\nКонтакт: {$contact}\nО себе: {$about}";

foreach ($config['chats'] as $chatId) {
    $ch = curl_init("https://api.telegram.org/bot{$config['token']}/sendMessage");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'chat_id'                  => $chatId,
            'text'                     => $text,
            'disable_web_page_preview' => true,
        ]),
    ]);
    $response = curl_exec($ch);
    $status   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($response === false || $status !== 200) {
        $reason = $response === false ? curl_error($ch) : "HTTP {$status}: {$response}";
        @error_log($now->format('c') . " TG chat {$chatId}: {$reason}\n", 3, $errPath);
    }
    curl_close($ch);
}
