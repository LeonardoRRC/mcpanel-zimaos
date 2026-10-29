<?php
declare(strict_types=1);

// Long-running loop started by start.sh: queues automatic backups when they are due.
require dirname(__DIR__) . '/lib/bootstrap.php';
set_time_limit(0);

while (true) {
    foreach (Server::all() as $server) {
        try {
            $hours = (int)($server->cfg['backup']['interval'] ?? 0);
            if ($hours <= 0) {
                continue;
            }
            $sid = $server->id();
            if (Job::active('backup-create', $sid) || Job::active('backup-restore', $sid)) {
                continue;
            }
            $last = Backup::lastAuto($sid) ?? 0;
            if (time() - $last >= $hours * 3600) {
                Job::dispatch('backup-create', [$sid, '', true], 'Copia automática');
                echo date('c') . " [backup] copia automática de {$server->cfg['name']}\n";
            }
        } catch (Throwable $e) {
            echo date('c') . " [backup] {$server->cfg['name']}: {$e->getMessage()}\n";
        }
    }
    sleep(60);
}
