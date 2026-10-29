<?php
declare(strict_types=1);

/** Server software catalogs and jar downloads. */
final class Software
{
    public const TYPES = [
        'paper' => 'Paper',
        'purpur' => 'Purpur',
        'vanilla' => 'Vanilla',
        'fabric' => 'Fabric',
    ];

    private const MOJANG_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

    /** @return string[] newest first */
    public static function versions(string $type): array
    {
        switch ($type) {
            case 'vanilla':
                $m = http_json(self::MOJANG_MANIFEST, 3600);
                return array_values(array_map(
                    fn($v) => $v['id'],
                    array_filter($m['versions'], fn($v) => $v['type'] === 'release')
                ));
            case 'paper':
                $p = http_json('https://fill.papermc.io/v3/projects/paper', 3600);
                $all = array_merge(...array_values($p['versions']));
                return array_values(array_filter($all, fn($v) => preg_match('/^[\d.]+$/', $v)));
            case 'purpur':
                $p = http_json('https://api.purpurmc.org/v2/purpur', 3600);
                return array_reverse($p['versions']);
            case 'fabric':
                $g = http_json('https://meta.fabricmc.net/v2/versions/game', 3600);
                return array_values(array_map(fn($v) => $v['version'], array_filter($g, fn($v) => $v['stable'])));
        }
        throw new RuntimeException('Tipo de servidor desconocido.');
    }

    /** Java major version Mojang requires for a Minecraft version. */
    public static function requiredJava(string $mcVersion): ?int
    {
        try {
            $m = http_json(self::MOJANG_MANIFEST, 3600);
            foreach ($m['versions'] as $v) {
                if ($v['id'] === $mcVersion) {
                    $meta = http_json($v['url'], 86400);
                    $req = (int)($meta['javaVersion']['majorVersion'] ?? 8);
                    // Use the closest LTS we offer that is >= the requirement.
                    foreach (Java::VERSIONS as $lts) {
                        if ($lts >= $req) {
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

    /** Runs inside a background job. */
    public static function install(Server $server, string $type, string $version, Job $job): void
    {
        $job->log('Buscando ' . (self::TYPES[$type] ?? $type) . " $version...");
        [$url, $label] = self::resolve($type, $version);
        $dest = $server->dir() . '/' . $server->cfg['jar'];
        @mkdir(dirname($dest), 0775, true);
        $job->log("Descargando $label...");
        http_download($url, $dest, $job->progressCallback());

        $java = self::requiredJava($version);
        $update = ['software' => ['type' => $type, 'version' => $version, 'build' => $label]];
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

    private static function resolve(string $type, string $version): array
    {
        switch ($type) {
            case 'vanilla':
                $m = http_json(self::MOJANG_MANIFEST, 3600);
                foreach ($m['versions'] as $v) {
                    if ($v['id'] === $version) {
                        $meta = http_json($v['url'], 86400);
                        $url = $meta['downloads']['server']['url'] ?? null;
                        if (!$url) {
                            throw new RuntimeException("La versión $version no tiene servidor oficial.");
                        }
                        return [$url, "Vanilla $version"];
                    }
                }
                break;
            case 'paper':
                $b = http_json("https://fill.papermc.io/v3/projects/paper/versions/$version/builds/latest");
                $dl = $b['downloads']['server:default'] ?? null;
                if ($dl) {
                    return [$dl['url'], "Paper $version #{$b['id']}"];
                }
                break;
            case 'purpur':
                $info = http_json("https://api.purpurmc.org/v2/purpur/$version");
                $build = $info['builds']['latest'] ?? 'latest';
                return ["https://api.purpurmc.org/v2/purpur/$version/$build/download", "Purpur $version #$build"];
            case 'fabric':
                $loaders = http_json('https://meta.fabricmc.net/v2/versions/loader', 3600);
                $installers = http_json('https://meta.fabricmc.net/v2/versions/installer', 3600);
                $loader = current(array_filter($loaders, fn($l) => $l['stable']))['version'] ?? $loaders[0]['version'];
                $installer = current(array_filter($installers, fn($i) => $i['stable']))['version'] ?? $installers[0]['version'];
                return [
                    "https://meta.fabricmc.net/v2/versions/loader/$version/$loader/$installer/server/jar",
                    "Fabric $version (loader $loader)",
                ];
        }
        throw new RuntimeException("No se encontró $type $version.");
    }
}
