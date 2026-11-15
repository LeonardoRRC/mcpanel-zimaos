<?php
// Router for PHP's built-in server: php -S 0.0.0.0:8090 router.php
// The web UI is a React app built into dist/ (web/ is its source); api.php is its JSON API.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
if ($path === '/favicon.ico') {
    $path = '/assets/brand/favicon.ico';
}

$types = [
    'css' => 'text/css', 'js' => 'application/javascript', 'svg' => 'image/svg+xml', 'png' => 'image/png',
    'ico' => 'image/x-icon', 'woff2' => 'font/woff2', 'webmanifest' => 'application/manifest+json',
];
$serve = function (string $file, string $cache) use ($types): bool {
    if (!is_file($file)) {
        return false;
    }
    header('Content-Type: ' . ($types[pathinfo($file, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
    header('Cache-Control: ' . $cache);
    header('X-Content-Type-Options: nosniff');
    readfile($file);
    return true;
};

// Brand icons.
if (preg_match('#^/assets/brand/[\w.-]+$#', $path) && $serve(__DIR__ . $path, 'public, max-age=86400')) {
    return true;
}
// Built app files have a content hash in their name: cache them for good.
if (preg_match('#^/app/[\w.-]+$#', $path) && $serve(__DIR__ . '/dist' . $path, 'public, max-age=31536000, immutable')) {
    return true;
}

if ($path === '/api.php' || $path === '/api') {
    require __DIR__ . '/api.php';
    return true;
}

// lib/, cli/, scripts/, web/ and data are never served. Any other path is a page of the app.
if (preg_match('#^/(lib|cli|scripts|web|dist|views|docs|\.)#', $path) || str_contains($path, '..')) {
    http_response_code(404);
    echo 'Not found';
    return true;
}
$index = __DIR__ . '/dist/index.html';
if (!is_file($index)) {
    http_response_code(500);
    echo 'Falta la interfaz compilada (dist/). Usa una versión publicada o ejecuta: cd web && npm ci && npm run build';
    return true;
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
readfile($index);
return true;
