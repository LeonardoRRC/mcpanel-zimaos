<?php
declare(strict_types=1);

// Runs when the container starts: bring back servers and tunnels marked to start automatically.
require dirname(__DIR__) . '/lib/bootstrap.php';

foreach (glob(RUN_DIR . '/*/{state,*.pid}', GLOB_BRACE) ?: [] as $stale) {
    @unlink($stale); // processes from a previous container no longer exist
}
foreach (glob(RUN_DIR . '/*/playit/*.pid') ?: [] as $stale) {
    @unlink($stale);
}

foreach (Server::all() as $server) {
    try {
        if ($server->cfg['playit'] && Playit::for($server)->hasSecret()) {
            Playit::for($server)->startAgent();
            echo "[boot] playit.gg iniciado para {$server->cfg['name']}\n";
        }
        if ($server->cfg['autostart']) {
            $server->start();
            echo "[boot] Servidor {$server->cfg['name']} iniciado\n";
        }
    } catch (Throwable $e) {
        echo "[boot] {$server->cfg['name']}: {$e->getMessage()}\n";
    }
}
