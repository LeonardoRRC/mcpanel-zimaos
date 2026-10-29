<?php
declare(strict_types=1);

/** Long-running tasks (downloads, installs) executed by cli/job.php outside the web request. */
final class Job
{
    private float $lastWrite = 0;

    private function __construct(public array $data)
    {
    }

    public static function dispatch(string $type, array $args, string $title): string
    {
        $id = bin2hex(random_bytes(6));
        write_json(self::file($id), [
            'id' => $id, 'type' => $type, 'args' => $args, 'title' => $title,
            'status' => 'queued', 'progress' => null, 'log' => [], 'created' => time(),
        ]);
        spawn_detached([PHP_BINARY, APP_ROOT . '/cli/job.php', $id], JOBS_DIR . "/$id.out");
        self::cleanup();
        return $id;
    }

    public static function file(string $id): string
    {
        return JOBS_DIR . '/' . preg_replace('/[^a-f0-9]/', '', $id) . '.json';
    }

    public static function status(string $id): ?array
    {
        return read_json(self::file($id));
    }

    /** The newest unfinished job matching type/arg, so the UI can resume showing progress. */
    public static function active(string $type, ?string $key = null): ?array
    {
        $found = null;
        foreach (glob(JOBS_DIR . '/*.json') ?: [] as $f) {
            $j = read_json($f);
            if (!$j || $j['type'] !== $type || !in_array($j['status'], ['queued', 'running'], true)) {
                continue;
            }
            if ($key !== null && ($j['args'][0] ?? null) !== $key) {
                continue;
            }
            if (!$found || $j['created'] > $found['created']) {
                $found = $j;
            }
        }
        return $found;
    }

    public static function load(string $id): self
    {
        $data = self::status($id);
        if (!$data) {
            throw new RuntimeException("Job $id no existe");
        }
        return new self($data);
    }

    public function set(array $fields, bool $force = true): void
    {
        $this->data = array_merge($this->data, $fields);
        $now = microtime(true);
        if ($force || $now - $this->lastWrite > 0.5) {
            write_json(self::file($this->data['id']), $this->data);
            $this->lastWrite = $now;
        }
    }

    public function log(string $line): void
    {
        $this->data['log'][] = $line;
        $this->set([]);
    }

    public function progressCallback(): callable
    {
        return function (int $done, int $total): void {
            $pct = $total > 0 ? round($done / $total * 100, 1) : null;
            $this->set(['progress' => $pct, 'bytes' => $done, 'total' => $total], false);
        };
    }

    private static function cleanup(): void
    {
        foreach (glob(JOBS_DIR . '/*') ?: [] as $f) {
            if (filemtime($f) < time() - 86400) {
                @unlink($f);
            }
        }
    }
}
