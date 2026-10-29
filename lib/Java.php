<?php
declare(strict_types=1);

/** Eclipse Temurin JREs downloaded on demand into DATA_DIR/java/<major>. */
final class Java
{
    public const VERSIONS = [8, 11, 17, 21, 25];

    public static function binary(int $major): string
    {
        return JAVA_DIR . "/$major/bin/java";
    }

    public static function installed(int $major): bool
    {
        return is_file(self::binary($major));
    }

    public static function list(): array
    {
        $out = [];
        foreach (self::VERSIONS as $v) {
            $release = @file_get_contents(JAVA_DIR . "/$v/release");
            $full = preg_match('/JAVA_VERSION="([^"]+)"/', (string)$release, $m) ? $m[1] : null;
            $out[] = ['major' => $v, 'installed' => self::installed($v), 'version' => $full];
        }
        return $out;
    }

    /** Runs inside a background job. */
    public static function install(int $major, Job $job): void
    {
        if (!in_array($major, self::VERSIONS, true)) {
            throw new RuntimeException("Versión de Java no soportada: $major");
        }
        $arch = system_arch();
        $url = "https://api.adoptium.net/v3/binary/latest/$major/ga/linux/$arch/jre/hotspot/normal/eclipse";
        $job->log("Descargando Temurin JRE $major ($arch)...");
        $tar = CACHE_DIR . "/jre-$major.tar.gz";
        http_download($url, $tar, $job->progressCallback());

        $job->log('Descomprimiendo...');
        $tmp = JAVA_DIR . "/.tmp-$major";
        Server::rrmdir($tmp);
        mkdir($tmp, 0775, true);
        exec('tar -xzf ' . escapeshellarg($tar) . ' -C ' . escapeshellarg($tmp) . ' 2>&1', $out, $code);
        @unlink($tar);
        if ($code !== 0) {
            throw new RuntimeException('Error al descomprimir: ' . implode("\n", $out));
        }
        $inner = glob("$tmp/*", GLOB_ONLYDIR)[0] ?? null;
        if (!$inner || !is_file("$inner/bin/java")) {
            throw new RuntimeException('El paquete descargado no contiene bin/java.');
        }
        Server::rrmdir(JAVA_DIR . "/$major");
        rename($inner, JAVA_DIR . "/$major");
        Server::rrmdir($tmp);
        exec(escapeshellarg(self::binary($major)) . ' -version 2>&1', $ver);
        $job->log(implode("\n", $ver));
        $job->log("Java $major instalado correctamente.");
    }
}
