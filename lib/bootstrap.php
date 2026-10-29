<?php
declare(strict_types=1);

// PHP < 8.3 is out of active support; older branches also miss the php2shell fixes (CVE-2026-109618/109619).
const MIN_PHP_VERSION = '8.3.0';
if (version_compare(PHP_VERSION, MIN_PHP_VERSION, '<')) {
    http_response_code(500);
    exit('MC Panel requiere PHP ' . MIN_PHP_VERSION . ' o superior (versión actual: ' . PHP_VERSION . ").\n");
}

/** First release of each branch with the fixes for CVE-2026-109618 / CVE-2026-109619 (21 Oct 2026). */
const PHP_PATCHED_RELEASES = ['8.3' => '8.3.36', '8.4' => '8.4.27', '8.5' => '8.5.12'];

/** Warning text when the running PHP is older than the patched release of its branch, null if up to date. */
function php_security_warning(): ?string
{
    $branch = PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION;
    $patched = PHP_PATCHED_RELEASES[$branch] ?? null;
    if ($patched && version_compare(PHP_VERSION, $patched, '<')) {
        return 'PHP ' . PHP_VERSION . " es vulnerable (CVE-2026-109618 / CVE-2026-109619). Actualiza la imagen a PHP $patched o superior.";
    }
    return null;
}

define('APP_ROOT', dirname(__DIR__));
define('APP_NAME', getenv('PANEL_NAME') ?: 'MC Panel');
define('DATA_DIR', rtrim(getenv('DATA_DIR') ?: '/data', '/'));
define('PANEL_DIR', DATA_DIR . '/panel');
define('SERVERS_DIR', DATA_DIR . '/servers');
define('RUN_DIR', DATA_DIR . '/run');
define('JAVA_DIR', DATA_DIR . '/java');
define('BIN_DIR', DATA_DIR . '/bin');
define('JOBS_DIR', DATA_DIR . '/jobs');
define('CACHE_DIR', DATA_DIR . '/cache');
// Point BACKUP_DIR at another disk to keep backups even if the data disk fails.
define('BACKUP_DIR', rtrim(getenv('BACKUP_DIR') ?: DATA_DIR . '/backups', '/'));

foreach ([PANEL_DIR, PANEL_DIR . '/sessions', PANEL_DIR . '/servers', SERVERS_DIR, RUN_DIR, JAVA_DIR, BIN_DIR, JOBS_DIR, CACHE_DIR] as $d) {
    if (!is_dir($d)) {
        @mkdir($d, 0775, true);
    }
}

spl_autoload_register(function (string $class): void {
    $file = __DIR__ . '/' . $class . '.php';
    if (is_file($file)) {
        require $file;
    }
});

function read_json(string $path, $default = null)
{
    if (!is_file($path)) {
        return $default;
    }
    $data = json_decode((string)file_get_contents($path), true);
    return $data ?? $default;
}

function write_json(string $path, $data): void
{
    $tmp = $path . '.tmp' . getmypid();
    file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    rename($tmp, $path);
}

function e(?string $s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

function human_bytes(float $bytes, int $dec = 1): string
{
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $i = 0;
    while ($bytes >= 1024 && $i < count($units) - 1) {
        $bytes /= 1024;
        $i++;
    }
    return round($bytes, $i === 0 ? 0 : $dec) . ' ' . $units[$i];
}

// Modrinth asks API clients to identify themselves with a contact.
const HTTP_USER_AGENT = 'LeonardoRRC/mcpanel-zimaos/1.1 (github.com/LeonardoRRC/mcpanel-zimaos)';

/** HTTP GET (or POST with a JSON body) returning the body, used for small JSON API calls. */
function http_get(string $url, int $timeout = 20, ?array $postJson = null): string
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_USERAGENT => HTTP_USER_AGENT,
    ]);
    if ($postJson !== null) {
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($postJson, JSON_UNESCAPED_SLASHES),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        ]);
    }
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    if ($body === false || $code >= 400) {
        throw new RuntimeException("Error al consultar $url (" . ($err ?: "HTTP $code") . ')');
    }
    return (string)$body;
}

function http_post_json(string $url, array $data)
{
    $decoded = json_decode(http_get($url, 30, $data), true);
    if ($decoded === null) {
        throw new RuntimeException("Respuesta inválida de $url");
    }
    return $decoded;
}

function http_json(string $url, int $cacheSeconds = 0)
{
    if ($cacheSeconds > 0) {
        $cache = CACHE_DIR . '/' . sha1($url) . '.json';
        if (is_file($cache) && time() - filemtime($cache) < $cacheSeconds) {
            return json_decode((string)file_get_contents($cache), true);
        }
    }
    try {
        $body = http_get($url);
    } catch (RuntimeException $e) {
        // Offline or API down: an expired copy is better than an empty version list.
        if ($cacheSeconds > 0 && is_file($cache)) {
            return json_decode((string)file_get_contents($cache), true);
        }
        throw $e;
    }
    $data = json_decode($body, true);
    if ($data === null) {
        throw new RuntimeException("Respuesta inválida de $url");
    }
    if ($cacheSeconds > 0) {
        file_put_contents($cache, $body);
    }
    return $data;
}

/**
 * Download a file to disk. $progress receives (downloaded, total) and is throttled by the caller.
 */
function http_download(string $url, string $dest, ?callable $progress = null): void
{
    $tmp = $dest . '.part';
    $fp = fopen($tmp, 'wb');
    if (!$fp) {
        throw new RuntimeException("No se puede escribir $tmp");
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_USERAGENT => HTTP_USER_AGENT,
        CURLOPT_FAILONERROR => true,
        CURLOPT_NOPROGRESS => $progress === null,
    ]);
    if ($progress) {
        curl_setopt($ch, CURLOPT_PROGRESSFUNCTION, function ($ch, $dlTotal, $dlNow) use ($progress) {
            $progress((int)$dlNow, (int)$dlTotal);
            return 0;
        });
    }
    $ok = curl_exec($ch);
    $err = curl_error($ch);
    fclose($fp);
    if (!$ok) {
        @unlink($tmp);
        throw new RuntimeException("Descarga fallida: $err");
    }
    rename($tmp, $dest);
}

/** Launch a command fully detached from the web request. */
function spawn_detached(array $argv, string $log = '/dev/null'): void
{
    $cmd = 'setsid ' . implode(' ', array_map('escapeshellarg', $argv))
        . ' >>' . escapeshellarg($log) . ' 2>&1 </dev/null &';
    exec($cmd);
}

function pid_alive(?int $pid): bool
{
    if (!$pid || $pid < 2) {
        return false;
    }
    $stat = @file_get_contents("/proc/$pid/stat");
    if ($stat === false) {
        return false;
    }
    // Field 3 is the state; a zombie (Z) or dead (X) process is not running.
    $state = substr($stat, strrpos($stat, ')') + 2, 1);
    return $state !== 'Z' && $state !== 'X';
}

function read_pid(string $file): ?int
{
    $pid = (int)trim((string)@file_get_contents($file));
    return $pid > 0 ? $pid : null;
}

function system_arch(): string
{
    $m = php_uname('m');
    return match (true) {
        in_array($m, ['aarch64', 'arm64'], true) => 'aarch64',
        str_starts_with($m, 'arm') => 'arm',
        default => 'x64',
    };
}

/** Asset URL with a version so browsers fetch the new file after an update. */
function asset(string $path): string
{
    return 'assets/' . $path . '?v=' . (@filemtime(APP_ROOT . '/assets/' . $path) ?: 0);
}
