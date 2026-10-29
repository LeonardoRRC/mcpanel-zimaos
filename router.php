<?php
// Router for PHP's built-in server: php -S 0.0.0.0:8090 router.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
if ($path === '/favicon.ico') {
    $path = '/assets/brand/favicon.ico';
}

if (preg_match('#^/assets/[\w./-]+$#', $path) && !str_contains($path, '..')) {
    $file = __DIR__ . $path;
    if (is_file($file)) {
        $types = ['css' => 'text/css', 'js' => 'application/javascript', 'svg' => 'image/svg+xml', 'png' => 'image/png', 'ico' => 'image/x-icon', 'woff2' => 'font/woff2'];
        header('Content-Type: ' . ($types[pathinfo($file, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
        header('Cache-Control: public, max-age=3600');
        readfile($file);
        return true;
    }
}

if ($path === '/api.php' || $path === '/api') {
    require __DIR__ . '/api.php';
    return true;
}

// Everything else (lib/, views/, cli/, scripts/) is never served directly.
if ($path !== '/' && $path !== '/index.php') {
    http_response_code(404);
    echo 'Not found';
    return true;
}
require __DIR__ . '/index.php';
return true;
