<?php
declare(strict_types=1);

/**
 * Server backups as .tar.gz files in BACKUP_DIR/<server-id>/, outside the server folder,
 * so they survive the server's files (or the whole server) being deleted.
 */
final class Backup
{
    public const INTERVALS = [0 => 'Desactivadas', 6 => 'Cada 6 horas', 12 => 'Cada 12 horas', 24 => 'Cada día', 48 => 'Cada 2 días', 168 => 'Cada semana'];

    /** tar --checkpoint unit: one record = 20 blocks of 512 bytes of the (uncompressed) archive. */
    private const RECORD = 10240;
    private const CHECKPOINT = 200;

    public static function root(): string
    {
        $dir = BACKUP_DIR;
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        return $dir;
    }

    private static function dirFor(string $serverId): string
    {
        if (!preg_match('/^[a-f0-9]{8}$/', $serverId)) {
            throw new RuntimeException('Servidor no válido.');
        }
        return self::root() . "/$serverId";
    }

    private static function metaFile(string $serverId, string $id): string
    {
        if (!preg_match('/^\d{8}-\d{6}-[a-f0-9]{4}$/', $id)) {
            throw new RuntimeException('Copia no válida.');
        }
        return self::dirFor($serverId) . "/$id.json";
    }

    public static function archive(string $serverId, string $id): string
    {
        return substr(self::metaFile($serverId, $id), 0, -5) . '.tar.gz';
    }

    /** Finished backups of a server, newest first. */
    public static function list(string $serverId): array
    {
        $out = [];
        foreach (glob(self::dirFor($serverId) . '/*.json') ?: [] as $f) {
            $m = read_json($f);
            if ($m && ($m['status'] ?? '') === 'ready' && is_file(self::archive($serverId, $m['id']))) {
                $out[] = $m;
            }
        }
        usort($out, fn($a, $b) => $b['created'] <=> $a['created']);
        return $out;
    }

    public static function find(string $serverId, string $id): array
    {
        $m = read_json(self::metaFile($serverId, $id));
        if (!$m || ($m['status'] ?? '') !== 'ready' || !is_file(self::archive($serverId, $id))) {
            throw new RuntimeException('La copia no existe.');
        }
        return $m;
    }

    /** Backups whose server was deleted: [{server, name, backups[]}]. */
    public static function orphans(): array
    {
        $out = [];
        foreach (glob(self::root() . '/*', GLOB_ONLYDIR) ?: [] as $dir) {
            $sid = basename($dir);
            if (!preg_match('/^[a-f0-9]{8}$/', $sid) || Server::find($sid)) {
                continue;
            }
            $list = self::list($sid);
            if ($list) {
                $out[] = ['server' => $sid, 'name' => $list[0]['server_name'] ?? $sid, 'backups' => $list];
            }
        }
        return $out;
    }

    public static function usage(): array
    {
        $root = self::root();
        $used = 0;
        foreach (glob("$root/*/*.tar.gz") ?: [] as $f) {
            $used += filesize($f);
        }
        return ['dir' => $root, 'used' => $used, 'free' => @disk_free_space($root) ?: null, 'total' => @disk_total_space($root) ?: null];
    }

    // ------------------------------------------------------------ create

    /** Runs inside a background job. */
    public static function create(Server $server, string $name, bool $auto, Job $job): array
    {
        $sid = $server->id();
        @mkdir(self::dirFor($sid), 0775, true);
        $id = date('Ymd-His') . '-' . bin2hex(random_bytes(2));
        $name = trim(mb_substr($name, 0, 60)) ?: ($auto ? 'Copia automática' : 'Copia ' . date('d/m/Y H:i'));
        $meta = [
            'id' => $id, 'name' => $name, 'created' => time(), 'auto' => $auto, 'locked' => false,
            'server_name' => $server->cfg['name'], 'software' => $server->cfg['software'] ?? null,
            'status' => 'creating', 'size' => 0, 'bytes' => 0,
        ];
        write_json(self::metaFile($sid, $id), $meta);
        $archive = self::archive($sid, $id);

        // A running server keeps writing region files: flush the world and pause saving while we read it.
        $paused = false;
        if ($server->isRunning()) {
            $job->log('El servidor está encendido: guardando el mundo y pausando el autoguardado...');
            try {
                $server->sendCommand('save-off');
                $server->sendCommand('save-all flush');
                $paused = true;
                sleep(5);
            } catch (Throwable $e) {
                $job->log('No se pudo pausar el guardado (' . $e->getMessage() . '); se copia igualmente.');
            }
        }

        try {
            $total = self::dirSize($server->dir());
            $job->log('Comprimiendo ' . human_bytes((float)$total) . ' de archivos...');
            $excludes = [];
            foreach (preg_split('/\R/', (string)($server->cfg['backup']['ignore'] ?? '')) as $pattern) {
                $pattern = trim($pattern, " \t/");
                if ($pattern !== '' && !str_contains($pattern, '..')) {
                    $excludes[] = '--exclude=' . $pattern;
                }
            }
            self::tar(array_merge(['-czf', "$archive.part", '-C', $server->dir()], $excludes, ['.']), $total, $job);
            rename("$archive.part", $archive);
        } catch (Throwable $e) {
            @unlink("$archive.part");
            @unlink(self::metaFile($sid, $id));
            throw $e;
        } finally {
            if ($paused && $server->isRunning()) {
                $server->sendCommand('save-on');
            }
        }

        $meta = array_merge($meta, ['status' => 'ready', 'size' => filesize($archive), 'bytes' => $total, 'finished' => time()]);
        write_json(self::metaFile($sid, $id), $meta);
        $job->log('Copia guardada: ' . human_bytes((float)$meta['size']) . ' en ' . self::dirFor($sid));
        if ($auto) {
            self::prune($server, $job);
        }
        return $meta;
    }

    /** Keep the newest N automatic backups; locked and manual ones are never removed. */
    public static function prune(Server $server, ?Job $job = null): void
    {
        $keep = max(1, (int)($server->cfg['backup']['keep'] ?? 7));
        $autos = array_values(array_filter(self::list($server->id()), fn($b) => $b['auto'] && !$b['locked']));
        foreach (array_slice($autos, $keep) as $old) {
            self::delete($server->id(), $old['id'], true);
            $job?->log("Eliminada copia automática antigua: {$old['name']} (" . date('d/m/Y H:i', $old['created']) . ')');
        }
    }

    // ------------------------------------------------------------ restore

    /** Runs inside a background job. $fromServer may be another (or a deleted) server's backup folder. */
    public static function restore(Server $target, string $fromServer, string $id, bool $wipe, bool $safety, Job $job): void
    {
        $meta = self::find($fromServer, $id);
        if ($target->isRunning()) {
            throw new RuntimeException('Detén el servidor antes de restaurar.');
        }
        if ($safety) {
            $job->log('Creando una copia del estado actual antes de restaurar...');
            self::create($target, 'Antes de restaurar «' . $meta['name'] . '»', false, $job);
        }

        $dir = rtrim($target->dir(), '/');
        $staging = "$dir.restoring";
        Server::rrmdir($staging);
        mkdir($staging, 0775, true);
        $job->log("Extrayendo «{$meta['name']}»...");
        try {
            self::tar(['-xzf', self::archive($fromServer, $id), '-C', $staging, '--no-same-owner'], (int)($meta['bytes'] ?? 0), $job);
        } catch (Throwable $e) {
            Server::rrmdir($staging);
            throw $e;
        }

        if ($wipe) {
            // Swap folders so a failure never leaves a half-deleted server.
            $old = "$dir.old-" . time();
            if (is_dir($dir)) {
                rename($dir, $old);
            }
            rename($staging, $dir);
            Server::rrmdir($old);
            $job->log('Archivos anteriores reemplazados.');
        } else {
            exec('cp -a ' . escapeshellarg("$staging/.") . ' ' . escapeshellarg("$dir/") . ' 2>&1', $out, $code);
            Server::rrmdir($staging);
            if ($code !== 0) {
                throw new RuntimeException('Error al copiar los archivos: ' . implode(' ', $out));
            }
            $job->log('Archivos de la copia escritos sobre los actuales.');
        }
        $job->log('Restauración completa. Ya puedes iniciar el servidor.');
    }

    // ------------------------------------------------------------ manage

    public static function delete(string $serverId, string $id, bool $force = false): void
    {
        $meta = self::find($serverId, $id);
        if ($meta['locked'] && !$force) {
            throw new RuntimeException('La copia está bloqueada. Desbloquéala para borrarla.');
        }
        @unlink(self::archive($serverId, $id));
        @unlink(self::metaFile($serverId, $id));
        @rmdir(self::dirFor($serverId)); // only succeeds once the folder is empty
    }

    public static function setLocked(string $serverId, string $id, bool $locked): void
    {
        $meta = self::find($serverId, $id);
        $meta['locked'] = $locked;
        write_json(self::metaFile($serverId, $id), $meta);
    }

    public static function download(string $serverId, string $id): void
    {
        $meta = self::find($serverId, $id);
        $file = self::archive($serverId, $id);
        $slug = trim(preg_replace('/[^A-Za-z0-9._-]+/', '-', $meta['server_name'] . '-' . $meta['id']), '-');
        header('Content-Type: application/gzip');
        header('Content-Length: ' . filesize($file));
        header('Content-Disposition: attachment; filename="' . $slug . '.tar.gz"');
        readfile($file);
    }

    /** Newest automatic backup time, for the scheduler. */
    public static function lastAuto(string $serverId): ?int
    {
        foreach (self::list($serverId) as $b) {
            if ($b['auto']) {
                return (int)$b['created'];
            }
        }
        return null;
    }

    // ------------------------------------------------------------ helpers

    private static function dirSize(string $dir): int
    {
        exec('du -sb ' . escapeshellarg($dir) . ' 2>/dev/null', $out);
        return (int)($out[0] ?? 0);
    }

    /** Run tar, turning its checkpoint messages into job progress. Exit code 1 (files changed while reading) is only a warning. */
    private static function tar(array $args, int $totalBytes, Job $job): void
    {
        // "echo" checkpoints go to stderr as "tar: @<records>"; one record = 10 KiB of uncompressed archive.
        $cmd = array_merge(['tar', '--warning=no-file-changed', '--checkpoint=' . self::CHECKPOINT, '--checkpoint-action=echo=@%u'], $args);
        $proc = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($proc)) {
            throw new RuntimeException('No se pudo ejecutar tar.');
        }
        $errors = [];
        while (($line = fgets($pipes[2])) !== false) {
            if (preg_match('/@(\d+)\s*$/', $line, $m)) {
                if ($totalBytes > 0) {
                    $done = min($totalBytes, (int)$m[1] * self::RECORD);
                    $job->set(['progress' => round($done / $totalBytes * 100, 1), 'bytes' => $done, 'total' => $totalBytes], false);
                }
            } elseif (trim($line) !== '') {
                $errors[] = trim($line);
            }
        }
        fclose($pipes[2]);
        $code = proc_close($proc);
        if ($code > 1) {
            $msg = implode(' ', array_slice($errors, -3));
            throw new RuntimeException('tar falló' . ($msg !== '' ? ": $msg" : " (código $code)") . (str_contains($msg, 'No space') ? ' — no queda espacio en disco.' : ''));
        }
    }
}
