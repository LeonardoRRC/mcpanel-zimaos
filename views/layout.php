<?php
/** @var ?Server $server @var Server[] $servers @var string $page @var string $title @var array $serverPages @var array $accountPages */
$link = fn(string $p) => $server ? '?s=' . $server->id() . '&p=' . $p : '?p=' . $p;
?>
<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e($title) ?> · <?= e(APP_NAME) ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
    <link rel="stylesheet" href="<?= asset('css/app.css') ?>">
</head>
<body>
<div class="app">
    <aside class="sidebar" id="sidebar">
        <a class="brand" href="./">
            <?php require __DIR__ . '/logo.php'; ?>
            <span><b><?= e(APP_NAME) ?></b><small>ZimaOS</small></span>
        </a>
        <?php if ($server): ?>
            <div class="nav-section">Gestión del servidor</div>
            <nav class="nav">
                <?php foreach ($serverPages as $key => [$label, $icon]): ?>
                    <a href="<?= e($link($key)) ?>" class="<?= $page === $key ? 'active' : '' ?>"><i class="fa-solid <?= $icon ?>"></i><?= e($label) ?></a>
                <?php endforeach; ?>
            </nav>
        <?php endif; ?>
        <div class="nav-section">Cuenta</div>
        <nav class="nav">
            <?php foreach ($accountPages as $key => [$label, $icon]): ?>
                <a href="?p=<?= $key ?>" class="<?= !$server && $page === $key ? 'active' : '' ?>"><i class="fa-solid <?= $icon ?>"></i><?= e($label) ?></a>
            <?php endforeach; ?>
            <a href="?logout=1"><i class="fa-solid fa-right-from-bracket"></i>Cerrar sesión</a>
        </nav>
        <div class="sidebar-foot">Conectado como <b><?= e(Auth::user()) ?></b></div>
    </aside>

    <div class="main">
        <header class="topbar">
            <button class="menu-btn" onclick="document.getElementById('sidebar').classList.toggle('open')" aria-label="Menú"><i class="fa-solid fa-bars"></i></button>
            <?php if ($servers): ?>
                <div class="server-switch">
                    <button type="button" data-menu="server-menu">
                        <i class="fa-solid fa-server"></i>
                        <span><?= e($server ? $server->cfg['name'] : 'Elegir servidor') ?></span>
                        <?php if ($server): ?><span class="sid"><?= e($server->id()) ?></span><?php endif; ?>
                        <i class="fa-solid fa-chevron-down" style="font-size:11px"></i>
                    </button>
                    <div class="menu" id="server-menu">
                        <?php foreach ($servers as $s): ?>
                            <a href="?s=<?= e($s->id()) ?>&p=<?= e($server ? $page : 'console') ?>"><?= e($s->cfg['name']) ?><span class="sid"><?= e($s->id()) ?></span></a>
                        <?php endforeach; ?>
                    </div>
                </div>
            <?php endif; ?>
            <div class="spacer"></div>
            <span class="clock" id="clock"></span>
            <a class="logout" href="?logout=1"><i class="fa-solid fa-right-from-bracket"></i> Salir</a>
        </header>
        <main class="content">
            <?php require __DIR__ . "/pages/$page.php"; ?>
        </main>
    </div>
</div>
<div class="toasts" id="toasts"></div>
<script>
    window.PANEL = <?= json_encode([
        'csrf' => Auth::csrf(),
        'server' => $server?->id(),
        'cfg' => $server?->cfg,
    ], JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) ?>;
</script>
<script src="<?= asset('js/app.js') ?>"></script>
<?php if (is_file(APP_ROOT . "/assets/js/$page.js")): ?>
    <script src="<?= asset("js/$page.js") ?>"></script>
<?php endif; ?>
</body>
</html>
