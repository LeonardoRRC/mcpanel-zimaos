<?php
declare(strict_types=1);

/** File manager confined to a server's directory. */
final class Files
{
    private const MAX_EDIT = 5 * 1024 * 1024;

    private string $root;

    public function __construct(Server $server)
    {
        @mkdir($server->dir(), 0775, true);
        $this->root = realpath($server->dir());
    }

    /** Normalize a user path ("/plugins/../x") to a safe relative path ("x"). */
    public static function clean(string $path): string
    {
        $parts = [];
        foreach (explode('/', str_replace('\\', '/', $path)) as $p) {
            if ($p === '' || $p === '.') {
                continue;
            }
            if ($p === '..') {
                array_pop($parts);
                continue;
            }
            $parts[] = $p;
        }
        return implode('/', $parts);
    }

    /** Absolute path inside the root; symlinks may not escape it. */
    public function abs(string $rel, bool $mustExist = true): string
    {
        $rel = self::clean($rel);
        $abs = $rel === '' ? $this->root : $this->root . '/' . $rel;
        $check = $mustExist ? $abs : dirname($abs);
        $real = realpath($check);
        if ($real === false) {
            throw new RuntimeException('La ruta no existe: /' . $rel);
        }
        if ($real !== $this->root && !str_starts_with($real, $this->root . '/')) {
            throw new RuntimeException('Ruta fuera del servidor.');
        }
        return $abs;
    }

    private function assertName(string $name): string
    {
        $name = trim($name);
        if ($name === '' || str_contains($name, '/') || $name === '.' || $name === '..') {
            throw new RuntimeException('Nombre no válido.');
        }
        return $name;
    }

    public function list(string $rel): array
    {
        $dir = $this->abs($rel);
        if (!is_dir($dir)) {
            throw new RuntimeException('No es una carpeta.');
        }
        $items = [];
        foreach (scandir($dir) ?: [] as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            $p = "$dir/$name";
            $isDir = is_dir($p);
            $items[] = [
                'name' => $name,
                'dir' => $isDir,
                'size' => $isDir ? null : @filesize($p),
                'mtime' => @filemtime($p),
                'editable' => !$isDir && self::isEditable($name, (int)@filesize($p)),
                'archive' => !$isDir && (bool)preg_match('/\.(zip|tar\.gz|tgz|tar)$/i', $name),
            ];
        }
        usort($items, fn($a, $b) => [$b['dir'], strtolower($a['name'])] <=> [$a['dir'], strtolower($b['name'])]);
        return ['path' => self::clean($rel), 'items' => $items];
    }

    private static function isEditable(string $name, int $size): bool
    {
        if ($size > self::MAX_EDIT) {
            return false;
        }
        return !preg_match('/\.(jar|zip|gz|tgz|tar|png|jpe?g|gif|webp|ico|dat|dat_old|mca|mcr|nbt|db|sqlite|class|so|exe|bin)$/i', $name);
    }

    public function read(string $rel): string
    {
        $f = $this->abs($rel);
        if (!is_file($f) || filesize($f) > self::MAX_EDIT) {
            throw new RuntimeException('El archivo no se puede editar.');
        }
        return (string)file_get_contents($f);
    }

    public function write(string $rel, string $content): void
    {
        $f = $this->abs($rel, false);
        if (is_dir($f)) {
            throw new RuntimeException('Es una carpeta.');
        }
        file_put_contents($f, $content);
    }

    public function mkdir(string $relDir, string $name): void
    {
        $path = $this->abs($relDir) . '/' . $this->assertName($name);
        if (file_exists($path)) {
            throw new RuntimeException('Ya existe.');
        }
        mkdir($path, 0775, true);
    }

    public function create(string $relDir, string $name): string
    {
        $rel = self::clean($relDir . '/' . $this->assertName($name));
        $path = $this->abs($rel, false);
        if (file_exists($path)) {
            throw new RuntimeException('Ya existe.');
        }
        touch($path);
        return $rel;
    }

    public function rename(string $rel, string $newName): void
    {
        $from = $this->abs($rel);
        $to = dirname($from) . '/' . $this->assertName($newName);
        if (file_exists($to)) {
            throw new RuntimeException('Ya existe un elemento con ese nombre.');
        }
        rename($from, $to);
    }

    public function move(array $rels, string $destDir): void
    {
        $dest = $this->abs($destDir);
        foreach ($rels as $rel) {
            $from = $this->abs($rel);
            $to = $dest . '/' . basename($from);
            if ($from === $this->root || str_starts_with($dest . '/', $from . '/')) {
                throw new RuntimeException('No se puede mover una carpeta dentro de sí misma.');
            }
            if (file_exists($to)) {
                throw new RuntimeException(basename($from) . ' ya existe en el destino.');
            }
            rename($from, $to);
        }
    }

    public function delete(array $rels): void
    {
        foreach ($rels as $rel) {
            $p = $this->abs($rel);
            if ($p === $this->root) {
                throw new RuntimeException('No se puede borrar la raíz.');
            }
            is_dir($p) && !is_link($p) ? Server::rrmdir($p) : unlink($p);
        }
    }

    public function upload(string $relDir, array $files): int
    {
        $dir = $this->abs($relDir);
        $count = 0;
        // PHP >= 8.1 keeps the browser's relative path (folder uploads) in full_path.
        $names = (array)($files['full_path'] ?? $files['name']);
        foreach ($names as $i => $name) {
            $err = ((array)$files['error'])[$i];
            if ($err !== UPLOAD_ERR_OK) {
                throw new RuntimeException("Error al subir $name (código $err).");
            }
            // Browsers send folder uploads as relative paths ("world/region/r.0.0.mca").
            $rel = self::clean((string)$name);
            if ($rel === '') {
                continue;
            }
            $target = "$dir/$rel";
            @mkdir(dirname($target), 0775, true);
            $this->abs(self::clean($relDir . '/' . dirname($rel)));
            move_uploaded_file(((array)$files['tmp_name'])[$i], $target);
            $count++;
        }
        return $count;
    }

    /** Stream a file, or a folder as .tar.gz. */
    public function download(string $rel): void
    {
        $f = $this->abs($rel);
        $name = $f === $this->root ? 'servidor' : basename($f);
        if (is_dir($f)) {
            header('Content-Type: application/gzip');
            header('Content-Disposition: attachment; filename="' . rawurlencode($name) . '.tar.gz"; filename*=UTF-8\'\'' . rawurlencode($name) . '.tar.gz');
            passthru('tar -czf - -C ' . escapeshellarg(dirname($f)) . ' ' . escapeshellarg(basename($f)) . ' 2>/dev/null');
            return;
        }
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . filesize($f));
        header('Content-Disposition: attachment; filename="' . rawurlencode($name) . '"; filename*=UTF-8\'\'' . rawurlencode($name));
        readfile($f);
    }

    /** "world" -> "world (copia)", "a.tar.gz" -> "a (copia).tar.gz", skipping names that exist. */
    private function uniquePath(string $dir, string $name, string $suffix = 'copia'): string
    {
        if (!file_exists("$dir/$name")) {
            return "$dir/$name";
        }
        preg_match('/^(.+?)((?:\.tar)?\.[A-Za-z0-9]{1,10})?$/', $name, $m);
        $base = $m[1] ?? $name;
        $ext = $m[2] ?? '';
        for ($i = 1; ; $i++) {
            $candidate = "$dir/$base ($suffix" . ($i > 1 ? " $i" : '') . ")$ext";
            if (!file_exists($candidate)) {
                return $candidate;
            }
        }
    }

    public function copy(array $rels, string $destDir): int
    {
        $dest = $this->abs($destDir);
        if (!is_dir($dest)) {
            throw new RuntimeException('El destino no es una carpeta.');
        }
        foreach ($rels as $rel) {
            $from = $this->abs($rel);
            if ($from === $this->root || str_starts_with($dest . '/', $from . '/')) {
                throw new RuntimeException('No se puede copiar una carpeta dentro de sí misma.');
            }
            $to = $this->uniquePath($dest, basename($from));
            exec('cp -a ' . escapeshellarg($from) . ' ' . escapeshellarg($to) . ' 2>&1', $out, $code);
            if ($code !== 0) {
                throw new RuntimeException('Error al copiar: ' . implode(' ', $out));
            }
        }
        return count($rels);
    }

    /** Extract next to the archive, or into a new folder named after it. Returns the destination folder. */
    public function extract(string $rel, bool $intoFolder = false): string
    {
        $f = $this->abs($rel);
        $dest = dirname($f);
        if ($intoFolder) {
            $base = preg_replace('/(\.tar\.gz|\.tgz|\.tar|\.zip)$/i', '', basename($f)) ?: 'extraido';
            $dest = $this->uniquePath($dest, $base, 'extraído');
            mkdir($dest, 0775, true);
        }
        if (preg_match('/\.zip$/i', $f)) {
            if (class_exists(ZipArchive::class)) {
                $zip = new ZipArchive();
                if ($zip->open($f) !== true) {
                    throw new RuntimeException('Zip dañado.');
                }
                for ($i = 0; $i < $zip->numFiles; $i++) {
                    if (self::clean($zip->getNameIndex($i)) !== rtrim($zip->getNameIndex($i), '/')) {
                        throw new RuntimeException('El zip contiene rutas no seguras.');
                    }
                }
                $zip->extractTo($dest);
                $zip->close();
            } else {
                $phar = new PharData($f);
                $prefix = 'phar://' . $phar->getPath() . '/';
                foreach (new RecursiveIteratorIterator($phar) as $entry) {
                    $inner = substr($entry->getPathname(), strlen($prefix));
                    if (self::clean($inner) !== $inner) {
                        throw new RuntimeException('El zip contiene rutas no seguras.');
                    }
                }
                $phar->extractTo($dest, null, true);
            }
        } else {
            exec('tar -xf ' . escapeshellarg($f) . ' -C ' . escapeshellarg($dest) . ' --no-same-owner 2>&1', $out, $code);
            if ($code !== 0) {
                throw new RuntimeException('Error al descomprimir: ' . implode(' ', $out));
            }
        }
        return ltrim(substr($dest, strlen($this->root)), '/');
    }

    /** Create a .zip or .tar.gz from items of one folder. Returns the archive name. */
    public function compress(array $rels, string $relDir, string $name = '', string $format = 'zip'): string
    {
        $dir = $this->abs($relDir);
        $format = $format === 'tar.gz' ? 'tar.gz' : 'zip';
        $items = [];
        foreach ($rels as $rel) {
            $p = $this->abs($rel);
            if ($p === $this->root || dirname($p) !== $dir) {
                throw new RuntimeException('Selecciona elementos de la misma carpeta.');
            }
            $items[] = basename($p);
        }
        if (!$items) {
            throw new RuntimeException('No hay nada que comprimir.');
        }
        $name = preg_replace('/(\.tar\.gz|\.tgz|\.zip)$/i', '', trim(str_replace(['/', '\\'], '', $name)));
        if ($name === '' || $name === '.' || $name === '..') {
            $name = count($items) === 1 ? $items[0] : 'archivo-' . date('Ymd-His');
        }
        $target = $this->uniquePath($dir, "$name.$format", '2');

        if ($format === 'tar.gz') {
            $args = implode(' ', array_map('escapeshellarg', $items));
            exec('tar -czf ' . escapeshellarg($target) . ' -C ' . escapeshellarg($dir) . " $args 2>&1", $out, $code);
            if ($code !== 0) {
                @unlink($target);
                throw new RuntimeException('Error al comprimir: ' . implode(' ', $out));
            }
            return basename($target);
        }

        // Map of path inside the zip => source file (null for directories).
        $entries = [];
        foreach ($items as $item) {
            $path = "$dir/$item";
            if (!is_dir($path) || is_link($path)) {
                $entries[$item] = $path;
                continue;
            }
            $entries[$item . '/'] = null;
            $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
            foreach ($it as $file) {
                $local = $item . '/' . substr($file->getPathname(), strlen($path) + 1);
                $entries[$file->isDir() ? $local . '/' : $local] = $file->isDir() ? null : $file->getPathname();
            }
        }
        $zip = class_exists(ZipArchive::class) ? new ZipArchive() : new PharData($target, 0, null, Phar::ZIP);
        if ($zip instanceof ZipArchive) {
            $zip->open($target, ZipArchive::CREATE | ZipArchive::EXCL);
        }
        foreach ($entries as $local => $src) {
            $src === null ? $zip->addEmptyDir(rtrim($local, '/')) : $zip->addFile($src, $local);
        }
        if ($zip instanceof ZipArchive) {
            $zip->close();
        }
        unset($zip);
        return basename($target);
    }
}
