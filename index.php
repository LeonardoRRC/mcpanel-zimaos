<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
Auth::start();

$error = null;

if (Auth::needsSetup()) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && Auth::checkCsrf($_POST['_csrf'] ?? null)) {
        try {
            if (($_POST['password'] ?? '') !== ($_POST['password2'] ?? '')) {
                throw new RuntimeException('Las contraseñas no coinciden.');
            }
            Auth::createAdmin(trim($_POST['username'] ?? ''), $_POST['password'] ?? '');
            Auth::login(trim($_POST['username']), $_POST['password']);
            header('Location: ./');
            exit;
        } catch (Throwable $e) {
            $error = $e->getMessage();
        }
    }
    $mode = 'setup';
    require __DIR__ . '/views/auth.php';
    exit;
}

if (isset($_GET['logout'])) {
    Auth::logout();
    header('Location: ./');
    exit;
}

if (!Auth::user()) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && Auth::checkCsrf($_POST['_csrf'] ?? null)) {
        if (Auth::login(trim($_POST['username'] ?? ''), $_POST['password'] ?? '')) {
            header('Location: ./');
            exit;
        }
        $error = 'Usuario o contraseña incorrectos.';
    }
    $mode = 'login';
    require __DIR__ . '/views/auth.php';
    exit;
}

$servers = Server::all();
$server = isset($_GET['s']) ? Server::find((string)$_GET['s']) : null;
$page = $server ? ($_GET['p'] ?? 'console') : ($_GET['p'] ?? 'servers');

$serverPages = [
    'console' => ['Consola', 'fa-terminal'],
    'files' => ['Archivos', 'fa-folder'],
    'startup' => ['Startup', 'fa-rocket'],
    'settings' => ['Ajustes', 'fa-gear'],
];
$accountPages = [
    'servers' => ['Mis servidores', 'fa-server'],
    'account' => ['Cuenta', 'fa-user'],
];

if ($server && !isset($serverPages[$page])) {
    $page = 'console';
}
if (!$server && !isset($accountPages[$page])) {
    $page = 'servers';
}

$title = $server ? $server->cfg['name'] . ' | ' . ($serverPages[$page][0]) : $accountPages[$page][0];
require __DIR__ . '/views/layout.php';
