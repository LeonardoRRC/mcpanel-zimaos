<?php
declare(strict_types=1);

/** Plugin and mod browser/installer backed by the Modrinth API (api.modrinth.com). */
final class Modrinth
{
    private const API = 'https://api.modrinth.com/v2';

    /** mcjars "compatibility" tags -> Modrinth loaders whose files run on that server. */
    private const COMPAT_LOADERS = [
        'paper' => ['paper', 'spigot', 'bukkit'],
        'purpur' => ['purpur'],
        'spigot' => ['spigot', 'bukkit'],
        'folia' => ['folia'],
        'velocity' => ['velocity'],
        'bungeecord' => ['bungeecord', 'waterfall'],
        'sponge' => ['sponge'],
        'fabric' => ['fabric'],
        'quilt' => ['quilt'],
        'forge' => ['forge'],
        'neoforge' => ['neoforge'],
    ];
    private const PLUGIN_LOADERS = ['paper', 'purpur', 'spigot', 'bukkit', 'folia', 'velocity', 'bungeecord', 'waterfall', 'sponge'];
    private const MOD_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];

    public const SORTS = ['relevance' => 'Relevancia', 'downloads' => 'Descargas', 'follows' => 'Seguidores', 'newest' => 'Más nuevos', 'updated' => 'Actualizados'];

    private function __construct(private Server $server, private string $kind, private array $info)
    {
    }

    /**
     * What this server can load: ['plugins' => [...], 'mods' => [...]] (hybrids like Mohist get both).
     * Each entry: label, dir (folder inside the server), loaders, project_type.
     */
    public static function kinds(Server $server): array
    {
        $type = Software::type($server->cfg['software']['type'] ?? '');
        $loaders = [];
        foreach ($type['compatibility'] ?? [] as $c) {
            array_push($loaders, ...(self::COMPAT_LOADERS[$c] ?? []));
        }
        $loaders = array_values(array_unique($loaders));
        $kinds = [];
        if ($l = array_values(array_intersect($loaders, self::PLUGIN_LOADERS))) {
            $kinds['plugins'] = ['label' => 'Plugins', 'dir' => 'plugins', 'loaders' => $l, 'project_type' => 'plugin'];
        }
        if ($l = array_values(array_intersect($loaders, self::MOD_LOADERS))) {
            $kinds['mods'] = ['label' => 'Mods', 'dir' => 'mods', 'loaders' => $l, 'project_type' => 'mod'];
        }
        return $kinds;
    }

    /** Sidebar label for the page, null when the server type takes neither. */
    public static function navLabel(Server $server): ?string
    {
        $labels = array_column(self::kinds($server), 'label');
        return $labels ? implode(' y ', $labels) : null;
    }

    public static function for(Server $server, string $kind): self
    {
        $kinds = self::kinds($server);
        if (!isset($kinds[$kind])) {
            throw new RuntimeException('Este tipo de servidor no admite ' . ($kind === 'mods' ? 'mods.' : 'plugins.'));
        }
        return new self($server, $kind, $kinds[$kind]);
    }

    /** Minecraft version to filter by; proxies run any plugin version, so no filter for them. */
    private function gameVersion(): ?string
    {
        $sw = $this->server->cfg['software'];
        return Software::isProxy($sw['type'] ?? '') ? null : (($sw['version'] ?? '') ?: null);
    }

    public function dir(): string
    {
        return $this->server->dir() . '/' . $this->info['dir'];
    }

    // ------------------------------------------------------------ browse

    public function search(string $query, int $offset = 0, string $sort = 'relevance'): array
    {
        $facets = [array_map(fn($l) => "categories:$l", $this->info['loaders']), ['project_type:' . $this->info['project_type']]];
        if ($mc = $this->gameVersion()) {
            $facets[] = ["versions:$mc"];
        }
        if ($this->kind === 'mods') {
            $facets[] = ['server_side:required', 'server_side:optional'];
        }
        $res = http_json(self::API . '/search?' . http_build_query([
            'query' => $query,
            'facets' => json_encode($facets),
            'index' => isset(self::SORTS[$sort]) ? $sort : 'relevance',
            'offset' => max(0, $offset),
            'limit' => 20,
        ]), 120);
        $installed = array_flip(array_filter(array_column($this->scan(), 'project_id')));
        $tags = array_merge(self::PLUGIN_LOADERS, self::MOD_LOADERS, ['datapack', 'minecraft']);
        return [
            'total' => $res['total_hits'] ?? 0,
            'game_version' => $this->gameVersion(),
            'hits' => array_map(fn($h) => [
                'id' => $h['project_id'],
                'slug' => $h['slug'],
                'title' => $h['title'],
                'description' => $h['description'],
                'author' => $h['author'],
                'icon' => $h['icon_url'] ?: null,
                'downloads' => $h['downloads'],
                'follows' => $h['follows'] ?? 0,
                'updated' => $h['date_modified'] ?? null,
                'categories' => array_values(array_diff($h['display_categories'] ?? $h['categories'] ?? [], $tags)),
                'installed' => isset($installed[$h['project_id']]),
            ], $res['hits'] ?? []),
        ];
    }

    /** Versions of a project that run on this server, newest first. */
    public function versions(string $project): array
    {
        $this->checkId($project);
        $params = ['loaders' => json_encode($this->info['loaders'])];
        if ($mc = $this->gameVersion()) {
            $params['game_versions'] = json_encode([$mc]);
        }
        $list = http_json(self::API . "/project/$project/version?" . http_build_query($params), 120);
        return array_map(function ($v) {
            $file = self::primaryFile($v);
            return [
                'id' => $v['id'],
                'name' => $v['name'],
                'number' => $v['version_number'],
                'type' => $v['version_type'],
                'date' => $v['date_published'],
                'downloads' => $v['downloads'],
                'loaders' => $v['loaders'],
                'file' => $file ? ['name' => $file['filename'], 'size' => $file['size']] : null,
                'deps' => count(array_filter($v['dependencies'], fn($d) => $d['dependency_type'] === 'required')),
            ];
        }, $list);
    }

    // ------------------------------------------------------------ install

    /** Runs inside a background job: the version, then (optionally) its required dependencies. */
    public function install(string $versionId, bool $withDeps, Job $job): void
    {
        $dir = $this->dir();
        @mkdir($dir, 0775, true);
        $installedProjects = [];
        foreach ($this->scan() as $f) {
            if ($f['project_id']) {
                $installedProjects[$f['project_id']][] = $f['file'];
            }
        }

        $queue = [['version' => $versionId, 'root' => true]];
        $seen = [];
        while ($item = array_shift($queue)) {
            if (isset($item['version'])) {
                $this->checkId($item['version']);
                $v = http_json(self::API . "/version/{$item['version']}");
            } else {
                // Dependency given only as a project: take its newest compatible version.
                $candidates = $this->versions($item['project']);
                if (!$candidates) {
                    $job->log("⚠ La dependencia {$item['project']} no tiene versión para este servidor; instálala a mano.");
                    continue;
                }
                $stable = array_values(array_filter($candidates, fn($c) => $c['type'] === 'release'));
                $v = http_json(self::API . '/version/' . ($stable[0] ?? $candidates[0])['id']);
            }
            if (isset($seen[$v['project_id']])) {
                continue;
            }
            $seen[$v['project_id']] = true;
            if (!$item['root'] && isset($installedProjects[$v['project_id']])) {
                $job->log('Dependencia ya instalada: ' . $installedProjects[$v['project_id']][0]);
                continue;
            }

            $file = self::primaryFile($v) ?? throw new RuntimeException("La versión {$v['version_number']} no tiene archivos.");
            $name = self::safeFileName($file['filename']);
            $job->log(($item['root'] ? 'Descargando ' : 'Dependencia: ') . "$name (" . human_bytes((float)$file['size']) . ')...');
            http_download($file['url'], "$dir/$name.part-mr", $job->progressCallback());
            if (sha1_file("$dir/$name.part-mr") !== ($file['hashes']['sha1'] ?? '')) {
                @unlink("$dir/$name.part-mr");
                throw new RuntimeException("El archivo $name llegó dañado (hash distinto). Intenta de nuevo.");
            }
            // Replace older files of the same project (an update or a version change).
            foreach ($installedProjects[$v['project_id']] ?? [] as $old) {
                if ($old !== $name) {
                    @unlink("$dir/$old");
                    $job->log("Reemplazado $old");
                }
            }
            rename("$dir/$name.part-mr", "$dir/$name");
            $job->log("Instalado $name");

            if ($withDeps) {
                foreach ($v['dependencies'] as $d) {
                    if ($d['dependency_type'] !== 'required') {
                        continue;
                    }
                    if ($d['version_id']) {
                        $queue[] = ['version' => $d['version_id'], 'root' => false];
                    } elseif ($d['project_id']) {
                        $queue[] = ['project' => $d['project_id'], 'root' => false];
                    } elseif ($d['file_name'] ?? null) {
                        $job->log("⚠ Requiere {$d['file_name']}, que no está en Modrinth.");
                    }
                }
            }
        }
        $job->log('Listo. Reinicia el servidor para cargar los cambios.');
    }

    // ------------------------------------------------------------ installed

    /**
     * Jars in the folder (enabled and .disabled), identified on Modrinth by SHA-1.
     * Hashes and lookups are cached per server so listing stays fast.
     */
    public function scan(): array
    {
        $dir = $this->dir();
        $cacheFile = CACHE_DIR . '/modrinth-' . $this->server->id() . "-{$this->kind}.json";
        $cache = read_json($cacheFile, []);
        $files = [];
        foreach (glob("$dir/*.{jar,jar.disabled}", GLOB_BRACE) ?: [] as $path) {
            $name = basename($path);
            $key = $name . '|' . filesize($path) . '|' . filemtime($path);
            $files[$name] = $cache[$key] ?? ['key' => $key, 'sha1' => sha1_file($path), 'checked' => 0];
        }

        // Look up files never checked, and retry unknown ones once a day.
        $pending = array_filter($files, fn($f) => !$f['checked'] || (empty($f['project_id']) && $f['checked'] < time() - 86400));
        if ($pending) {
            try {
                $found = http_post_json(self::API . '/version_files', ['hashes' => array_values(array_column($pending, 'sha1')), 'algorithm' => 'sha1']);
                $projectIds = array_values(array_unique(array_column($found, 'project_id')));
                $projects = $projectIds ? http_json(self::API . '/projects?' . http_build_query(['ids' => json_encode($projectIds)])) : [];
                $byId = array_column($projects, null, 'id');
                foreach ($pending as $name => $f) {
                    $v = $found[$f['sha1']] ?? null;
                    $p = $v ? ($byId[$v['project_id']] ?? null) : null;
                    $files[$name] = array_merge($f, [
                        'checked' => time(),
                        'project_id' => $v['project_id'] ?? null,
                        'version_id' => $v['id'] ?? null,
                        'version' => $v['version_number'] ?? null,
                        'title' => $p['title'] ?? null,
                        'slug' => $p['slug'] ?? null,
                        'icon' => ($p['icon_url'] ?? null) ?: null,
                    ]);
                }
            } catch (Throwable) {
                // Offline: list the files anyway, identify them next time.
            }
        }

        $newCache = [];
        $out = [];
        foreach ($files as $name => $f) {
            $newCache[$f['key']] = $f;
            $out[] = [
                'file' => $name,
                'enabled' => !str_ends_with($name, '.disabled'),
                'size' => filesize("$dir/$name"),
                'sha1' => $f['sha1'],
                'project_id' => $f['project_id'] ?? null,
                'version_id' => $f['version_id'] ?? null,
                'version' => $f['version'] ?? null,
                'title' => $f['title'] ?? null,
                'slug' => $f['slug'] ?? null,
                'icon' => $f['icon'] ?? null,
            ];
        }
        if ($newCache !== $cache) {
            write_json($cacheFile, $newCache);
        }
        usort($out, fn($a, $b) => strcasecmp($a['title'] ?? $a['file'], $b['title'] ?? $b['file']));
        return $out;
    }

    /** Installed files plus the newest compatible version for each one Modrinth knows. */
    public function installed(): array
    {
        $list = $this->scan();
        $known = array_filter($list, fn($f) => $f['project_id']);
        $updates = [];
        if ($known) {
            $body = ['hashes' => array_values(array_column($known, 'sha1')), 'algorithm' => 'sha1', 'loaders' => $this->info['loaders']];
            if ($mc = $this->gameVersion()) {
                $body['game_versions'] = [$mc];
            }
            try {
                $updates = http_post_json(self::API . '/version_files/update', $body);
            } catch (Throwable) {
            }
        }
        foreach ($list as &$f) {
            $latest = $updates[$f['sha1']] ?? null;
            // Some projects publish the same file under several versions; same hash = nothing new.
            $latestSha = $latest ? (self::primaryFile($latest)['hashes']['sha1'] ?? null) : null;
            $f['update'] = $latest && $latest['id'] !== $f['version_id'] && $latestSha !== $f['sha1']
                ? ['version_id' => $latest['id'], 'version' => $latest['version_number']]
                : null;
            unset($f['sha1']);
        }
        return ['files' => $list, 'dir' => $this->info['dir'], 'game_version' => $this->gameVersion()];
    }

    public function toggle(string $file): string
    {
        $path = $this->file($file);
        $target = str_ends_with($path, '.disabled') ? substr($path, 0, -9) : "$path.disabled";
        if (file_exists($target)) {
            throw new RuntimeException(basename($target) . ' ya existe.');
        }
        rename($path, $target);
        return basename($target);
    }

    public function remove(string $file): void
    {
        unlink($this->file($file));
    }

    // ------------------------------------------------------------ helpers

    private function file(string $name): string
    {
        $name = self::safeFileName($name);
        $path = $this->dir() . '/' . $name;
        if (!preg_match('/\.jar(\.disabled)?$/', $name) || !is_file($path)) {
            throw new RuntimeException('Archivo no encontrado.');
        }
        return $path;
    }

    private static function primaryFile(array $version): ?array
    {
        $files = $version['files'] ?? [];
        foreach ($files as $f) {
            if ($f['primary']) {
                return $f;
            }
        }
        return $files[0] ?? null;
    }

    private static function safeFileName(string $name): string
    {
        $name = basename(str_replace('\\', '/', $name));
        if ($name === '' || $name[0] === '.' || preg_match('/[\x00-\x1f\/]/', $name)) {
            throw new RuntimeException('Nombre de archivo no válido.');
        }
        return $name;
    }

    private function checkId(string $id): void
    {
        if (!preg_match('/^[A-Za-z0-9_-]{2,64}$/', $id)) {
            throw new RuntimeException('Identificador de Modrinth no válido.');
        }
    }
}
