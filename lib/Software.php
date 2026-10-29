<?php
declare(strict_types=1);

/** Server software catalog and installs, backed by the MCJars API (mcjars.app). */
final class Software
{
    private const API = 'https://mcjars.app/api/v2';

    public const GROUPS = [
        'recommended' => 'Recomendados',
        'established' => 'Consolidados',
        'experimental' => 'Experimentales',
        'miscellaneous' => 'Otros forks',
        'limbos' => 'Limbo',
    ];

    /** Used when mcjars is unreachable and nothing is cached, so pages still render. */
    private const FALLBACK = ['PAPER' => 'Paper', 'PURPUR' => 'Purpur', 'VANILLA' => 'Vanilla', 'FABRIC' => 'Fabric'];

    /** All server types keyed by mcjars id (PAPER, FABRIC, ...). */
    public static function types(): array
    {
        static $types = null;
        if ($types !== null) {
            return $types;
        }
        try {
            $groups = http_json(self::API . '/types', 86400)['types'] ?? [];
        } catch (Throwable) {
            $groups = ['recommended' => array_map(fn($name) => ['name' => $name], self::FALLBACK)];
        }
        $types = [];
        foreach ($groups as $group => $list) {
            foreach ($list as $id => $t) {
                $types[$id] = [
                    'id' => $id,
                    'name' => $t['name'],
                    'group' => $group,
                    'icon' => $t['icon'] ?? null,
                    'description' => $t['description'] ?? '',
                    'categories' => $t['categories'] ?? [],
                    'compatibility' => $t['compatibility'] ?? [],
                    'deprecated' => (bool)($t['deprecated'] ?? false),
                    'experimental' => (bool)($t['experimental'] ?? false),
                ];
            }
        }
        return $types;
    }

    /** Older configs stored lowercase ids ("paper"). */
    public static function type(?string $id): ?array
    {
        return self::types()[strtoupper((string)$id)] ?? null;
    }

    public static function label(?string $id): string
    {
        return self::type($id)['name'] ?? ucfirst((string)$id);
    }

    /** Proxies (Velocity, BungeeCord) are versioned on their own, not by Minecraft version. */
    public static function isProxy(?string $id): bool
    {
        return in_array('proxy', self::type($id)['categories'] ?? [], true);
    }

    /** @return array<array{id:string, type:string, java:?int, supported:bool}> newest first */
    public static function versions(string $type): array
    {
        $type = self::checkType($type);
        $builds = http_json(self::API . "/builds/$type", 3600)['builds'] ?? [];
        $out = [];
        foreach ($builds as $id => $v) {
            $out[] = ['id' => (string)$id, 'type' => $v['type'] ?? 'RELEASE', 'java' => $v['java'] ?? null, 'supported' => (bool)($v['supported'] ?? true)];
        }
        return array_reverse($out);
    }

    /** Builds of one version, newest first. */
    public static function builds(string $type, string $version): array
    {
        $type = self::checkType($type);
        $builds = http_json(self::API . "/builds/$type/" . rawurlencode($version), 600)['builds'] ?? [];
        return array_map(fn($b) => [
            'id' => (int)$b['id'],
            'name' => $b['name'],
            'experimental' => (bool)$b['experimental'],
            'created' => $b['created'] ?? null,
            'installation' => $b['installation'] ?? [],
        ], $builds);
    }

    /** Java we should run a version with: the closest LTS we offer at or above what mcjars says it needs. */
    public static function requiredJava(string $type, string $version): ?int
    {
        try {
            foreach (self::versions($type) as $v) {
                if ($v['id'] === $version && $v['java']) {
                    foreach (Java::VERSIONS as $lts) {
                        if ($lts >= $v['java']) {
                            return $lts;
                        }
                    }
                    return end(Java::VERSIONS);
                }
            }
        } catch (Throwable) {
        }
        return null;
    }

    /** Runs inside a background job. $buildId null = latest build. */
    public static function install(Server $server, string $type, string $version, ?int $buildId, Job $job): void
    {
        $type = self::checkType($type);
        $job->log('Buscando ' . self::label($type) . " $version...");
        $builds = self::builds($type, $version);
        $build = $buildId ? current(array_filter($builds, fn($b) => $b['id'] === $buildId)) : ($builds[0] ?? null);
        if (!$build || !$build['installation']) {
            throw new RuntimeException('No se encontró ' . self::label($type) . " $version en MCJars.");
        }
        $label = self::label($type) . " $version " . (str_starts_with($build['name'], '#') ? $build['name'] : "({$build['name']})");

        // mcjars describes installs as ordered stages of download / unzip / remove steps.
        foreach ($build['installation'] as $stage) {
            foreach ($stage as $step) {
                self::runStep($server, $step, $job);
            }
        }

        $java = self::requiredJava($type, $version);
        $update = ['software' => ['type' => $type, 'version' => $version, 'build' => $label, 'build_id' => $build['id']]];
        if ($java) {
            $update['java'] = $java;
            $job->log("Minecraft $version requiere Java $java; se seleccionó automáticamente.");
        }
        // Re-read config: the user may have changed settings while downloading.
        $fresh = Server::find($server->id());
        $fresh?->update($update);
        $job->log("Instalado $label como " . $server->cfg['jar'] . '.');
        if ($java && !Java::installed($java)) {
            $job->log("Instalando Java $java...");
            Java::install($java, $job);
        }
    }

    private static function runStep(Server $server, array $step, Job $job): void
    {
        $dir = $server->dir();
        @mkdir($dir, 0775, true);
        $jar = $server->cfg['jar'];
        switch ($step['type']) {
            case 'download':
                // The runnable jar is always called server.jar by mcjars; we honour the configured name.
                $file = $step['file'] === 'server.jar' ? $jar : $step['file'];
                $job->log('Descargando ' . basename($file) . (isset($step['size']) ? ' (' . human_bytes((float)$step['size']) . ')' : '') . '...');
                $dest = self::path($dir, $file);
                @mkdir(dirname($dest), 0775, true);
                http_download($step['url'], $dest, $job->progressCallback());
                break;
            case 'unzip':
                $job->log('Descomprimiendo ' . basename($step['file']) . '...');
                $dest = self::path($dir, $step['location'] ?? '.');
                self::unzip(self::path($dir, $step['file']), $dest);
                if ($jar !== 'server.jar' && is_file("$dest/server.jar") && realpath($dest) === realpath($dir)) {
                    rename("$dest/server.jar", self::path($dir, $jar));
                }
                break;
            case 'remove':
                $p = self::path($dir, $step['location']);
                if ($p === rtrim($dir, '/')) {
                    break;
                }
                if (is_dir($p) && !is_link($p)) {
                    Server::rrmdir($p);
                } elseif (file_exists($p) || is_link($p)) {
                    unlink($p);
                }
                break;
            default:
                $job->log("Paso de instalación desconocido: {$step['type']} (omitido)");
        }
    }

    private static function unzip(string $zipFile, string $dest): void
    {
        @mkdir($dest, 0775, true);
        if (class_exists(ZipArchive::class)) {
            $zip = new ZipArchive();
            if ($zip->open($zipFile) !== true) {
                throw new RuntimeException('Archivo zip dañado.');
            }
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $name = (string)$zip->getNameIndex($i);
                if (str_starts_with($name, '/') || preg_match('#(^|/)\.\.(/|$)#', $name)) {
                    throw new RuntimeException('El zip contiene rutas no seguras.');
                }
            }
            $zip->extractTo($dest);
            $zip->close();
            return;
        }
        (new PharData($zipFile))->extractTo($dest, null, true);
    }

    /** Resolve a path relative to the server folder, refusing anything that escapes it. */
    private static function path(string $dir, string $rel): string
    {
        $rel = trim(str_replace('\\', '/', $rel), '/');
        if ($rel === '' || $rel === '.') {
            return rtrim($dir, '/');
        }
        if (preg_match('#(^|/)\.\.(/|$)#', $rel)) {
            throw new RuntimeException("Ruta no válida en la instalación: $rel");
        }
        return rtrim($dir, '/') . '/' . preg_replace('#^\./#', '', $rel);
    }

    private static function checkType(string $type): string
    {
        $type = strtoupper($type);
        if (!preg_match('/^[A-Z0-9_]+$/', $type) || !self::type($type)) {
            throw new RuntimeException('Tipo de servidor desconocido.');
        }
        return $type;
    }
}
