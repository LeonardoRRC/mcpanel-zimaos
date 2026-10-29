<?php
declare(strict_types=1);

/**
 * A Minecraft server: its config (panel/servers/<id>.json), its files (servers/<id>/)
 * and its runtime state (run/<id>/: pid, stdin FIFO, console log).
 */
final class Server
{
    public const DEFAULT_STARTUP = '{{JAVA}} -Xms{{RAM_MIN}}M -Xmx{{RAM_MAX}}M {{FLAGS}} -jar {{JAR}} nogui';

    public const FLAG_PRESETS = [
        'none' => '',
        'aikar' => '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions '
            . '-XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 '
            . '-XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 '
            . '-XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 '
            . '-XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem '
            . '-XX:MaxTenuringThreshold=1 -Dusing.aikars.flags=https://mcflags.emc.gs -Daikars.new.flags=true',
    ];

    public array $cfg;

    private function __construct(array $cfg)
    {
        $this->cfg = $cfg + self::defaults();
    }

    private static function defaults(): array
    {
        return [
            'name' => 'Servidor',
            'description' => '',
            'port' => 25565,
            'ram_min' => 1024,
            'ram_max' => 4096,
            'java' => 21,
            'jar' => 'server.jar',
            'startup' => self::DEFAULT_STARTUP,
            'flags_preset' => 'aikar',
            'custom_flags' => '',
            'software' => ['type' => 'paper', 'version' => ''],
            'auto_restart' => false,
            'autostart' => false,
            'eula' => false,
            'playit' => false,
        ];
    }

    /** @return Server[] */
    public static function all(): array
    {
        $list = [];
        foreach (glob(PANEL_DIR . '/servers/*.json') ?: [] as $file) {
            $cfg = read_json($file);
            if ($cfg) {
                $list[] = new self($cfg);
            }
        }
        usort($list, fn($a, $b) => ($a->cfg['created'] ?? 0) <=> ($b->cfg['created'] ?? 0));
        return $list;
    }

    public static function find(string $id): ?self
    {
        if (!preg_match('/^[a-f0-9]{8}$/', $id)) {
            return null;
        }
        $cfg = read_json(PANEL_DIR . "/servers/$id.json");
        return $cfg ? new self($cfg) : null;
    }

    public static function create(array $data): self
    {
        $id = bin2hex(random_bytes(4));
        $server = new self(['id' => $id, 'created' => time()]);
        $server->update($data);
        @mkdir($server->dir(), 0775, true);
        @mkdir($server->runDir(), 0775, true);
        return $server;
    }

    public function update(array $data): void
    {
        $allowed = array_keys(self::defaults());
        foreach ($data as $k => $v) {
            if (in_array($k, $allowed, true)) {
                $this->cfg[$k] = $v;
            }
        }
        $c = &$this->cfg;
        $c['name'] = trim(mb_substr((string)$c['name'], 0, 40)) ?: 'Servidor';
        $c['description'] = trim(mb_substr((string)$c['description'], 0, 120));
        $c['port'] = max(1, min(65535, (int)$c['port']));
        $c['ram_max'] = max(256, (int)$c['ram_max']);
        $c['ram_min'] = max(128, min((int)$c['ram_min'], $c['ram_max']));
        $c['java'] = (int)$c['java'];
        $c['jar'] = ltrim(str_replace(['..', '\\'], '', (string)$c['jar']), '/') ?: 'server.jar';
        $c['startup'] = trim(str_replace(["\r", "\n"], ' ', (string)$c['startup'])) ?: self::DEFAULT_STARTUP;
        $c['flags_preset'] = array_key_exists($c['flags_preset'], self::FLAG_PRESETS) ? $c['flags_preset'] : 'none';
        $c['custom_flags'] = trim(str_replace(["\r", "\n"], ' ', (string)$c['custom_flags']));
        $c['auto_restart'] = (bool)$c['auto_restart'];
        $c['autostart'] = (bool)$c['autostart'];
        $c['eula'] = (bool)$c['eula'];
        $c['playit'] = (bool)$c['playit'];
        $this->save();
    }

    public function save(): void
    {
        write_json(PANEL_DIR . '/servers/' . $this->id() . '.json', $this->cfg);
    }

    public function delete(): void
    {
        $this->kill();
        Playit::for($this)->stop();
        self::rrmdir($this->dir());
        self::rrmdir($this->runDir());
        @unlink(PANEL_DIR . '/servers/' . $this->id() . '.json');
        @unlink(Playit::for($this)->secretFile());
    }

    public static function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        exec('rm -rf ' . escapeshellarg($dir));
    }

    public function id(): string
    {
        return $this->cfg['id'];
    }

    public function dir(): string
    {
        return SERVERS_DIR . '/' . $this->id();
    }

    public function runDir(): string
    {
        $d = RUN_DIR . '/' . $this->id();
        if (!is_dir($d)) {
            @mkdir($d, 0775, true);
        }
        return $d;
    }

    public function consoleFile(): string
    {
        return $this->runDir() . '/console.log';
    }

    // ---------------------------------------------------------------- startup

    public function flags(): string
    {
        return trim(self::FLAG_PRESETS[$this->cfg['flags_preset']] . ' ' . $this->cfg['custom_flags']);
    }

    public function startupCommand(): string
    {
        $vars = [
            '{{JAVA}}' => escapeshellarg(Java::binary($this->cfg['java'])),
            '{{RAM_MIN}}' => (string)$this->cfg['ram_min'],
            '{{RAM_MAX}}' => (string)$this->cfg['ram_max'],
            '{{JAR}}' => escapeshellarg($this->cfg['jar']),
            '{{FLAGS}}' => $this->flags(),
            '{{PORT}}' => (string)$this->cfg['port'],
        ];
        return preg_replace('/\s+/', ' ', strtr($this->cfg['startup'], $vars));
    }

    /** Human-readable preview, with the Java path shortened. */
    public function startupPreview(): string
    {
        return str_replace(escapeshellarg(Java::binary($this->cfg['java'])), 'java' . $this->cfg['java'], $this->startupCommand());
    }

    // ---------------------------------------------------------------- process

    public function pid(): ?int
    {
        return read_pid($this->runDir() . '/server.pid');
    }

    public function wrapperPid(): ?int
    {
        return read_pid($this->runDir() . '/wrapper.pid');
    }

    public function isRunning(): bool
    {
        return pid_alive($this->wrapperPid()) || pid_alive($this->pid());
    }

    /** offline | starting | running | stopping */
    public function state(): string
    {
        if (!$this->isRunning()) {
            return 'offline';
        }
        $state = trim((string)@file_get_contents($this->runDir() . '/state')) ?: 'starting';
        if ($state === 'starting' && $this->consoleHas('/\bDone \(\d/')) {
            $state = 'running';
            file_put_contents($this->runDir() . '/state', $state);
        }
        return $state;
    }

    private function consoleHas(string $regex): bool
    {
        $file = $this->consoleFile();
        $size = @filesize($file) ?: 0;
        $fp = @fopen($file, 'rb');
        if (!$fp) {
            return false;
        }
        fseek($fp, max(0, $size - 65536));
        $tail = (string)stream_get_contents($fp);
        fclose($fp);
        return (bool)preg_match($regex, $tail);
    }

    public function start(): void
    {
        if ($this->isRunning()) {
            throw new RuntimeException('El servidor ya está en ejecución.');
        }
        if (!Java::installed($this->cfg['java'])) {
            throw new RuntimeException('Java ' . $this->cfg['java'] . ' no está instalado. Instálalo desde Startup.');
        }
        if (!is_file($this->dir() . '/' . $this->cfg['jar']) && str_contains($this->cfg['startup'], '{{JAR}}')) {
            throw new RuntimeException('No se encontró ' . $this->cfg['jar'] . '. Instala una versión desde Startup o súbelo en Archivos.');
        }
        if (!$this->cfg['eula']) {
            throw new RuntimeException('Debes aceptar el EULA de Minecraft en Startup antes de iniciar.');
        }
        @mkdir($this->dir(), 0775, true);
        file_put_contents($this->dir() . '/eula.txt', "eula=true\n");
        $this->syncServerPort();

        $run = $this->runDir();
        $log = $this->consoleFile();
        if (is_file($log)) {
            @rename($log, $run . '/console.prev.log');
        }
        @unlink($run . '/stopping');
        file_put_contents($run . '/state', 'starting');
        file_put_contents($run . '/autorestart', $this->cfg['auto_restart'] ? '1' : '0');
        file_put_contents($log, "\e[33m[Panel]\e[0m Iniciando servidor: " . $this->startupPreview() . "\n");

        spawn_detached([
            'bash', APP_ROOT . '/scripts/run-server.sh',
            $run, $this->dir(), $this->startupCommand(),
        ]);
        // Wait briefly so the next status poll already sees the process.
        for ($i = 0; $i < 20 && !$this->wrapperPid(); $i++) {
            usleep(100000);
        }
    }

    public function sendCommand(string $command): void
    {
        if (!$this->isRunning()) {
            throw new RuntimeException('El servidor está apagado.');
        }
        $fifo = $this->runDir() . '/stdin';
        // Opening read+write never blocks, even if the reader is gone.
        $fp = @fopen($fifo, 'r+');
        if (!$fp) {
            throw new RuntimeException('No se pudo enviar el comando.');
        }
        fwrite($fp, rtrim($command, "\r\n") . "\n");
        fclose($fp);
    }

    public function stop(): void
    {
        if (!$this->isRunning()) {
            return;
        }
        touch($this->runDir() . '/stopping');
        file_put_contents($this->runDir() . '/state', 'stopping');
        $this->sendCommand('stop');
    }

    public function kill(): void
    {
        touch($this->runDir() . '/stopping');
        foreach ([$this->pid(), $this->wrapperPid()] as $pid) {
            if (pid_alive($pid)) {
                posix_kill($pid, 9);
            }
        }
        $this->appendConsole("\e[31m[Panel]\e[0m Proceso terminado a la fuerza (kill).");
    }

    public function restart(): void
    {
        if ($this->isRunning()) {
            $this->stop();
            for ($i = 0; $i < 300 && $this->isRunning(); $i++) {
                usleep(100000);
            }
            if ($this->isRunning()) {
                $this->kill();
                usleep(500000);
            }
        }
        $this->start();
    }

    public function appendConsole(string $line): void
    {
        file_put_contents($this->consoleFile(), $line . "\n", FILE_APPEND);
    }

    /** Ensure server.properties uses the panel's port. */
    private function syncServerPort(): void
    {
        $file = $this->dir() . '/server.properties';
        $port = (int)$this->cfg['port'];
        $text = is_file($file) ? (string)file_get_contents($file) : '';
        if (preg_match('/^server-port=.*$/m', $text)) {
            $text = preg_replace('/^server-port=.*$/m', "server-port=$port", $text);
        } else {
            $text .= ($text !== '' && !str_ends_with($text, "\n") ? "\n" : '') . "server-port=$port\n";
        }
        file_put_contents($file, $text);
    }

    /** Return console output after byte $offset (or the recent tail when $offset < 0). */
    public function consoleSince(int $offset, int $logId = 0): array
    {
        $file = $this->consoleFile();
        clearstatcache(true, $file);
        $size = is_file($file) ? filesize($file) : 0;
        $id = is_file($file) ? (int)fileinode($file) : 0;
        // A different inode means the log was rotated by a (re)start: resend from the tail.
        $reset = $offset < 0 || $offset > $size || ($logId && $logId !== $id);
        if ($reset) {
            $offset = max(0, $size - 100000);
        }
        $data = '';
        if ($size > $offset) {
            $fp = fopen($file, 'rb');
            fseek($fp, $offset);
            $data = (string)fread($fp, min(512000, $size - $offset));
            fclose($fp);
        }
        return ['offset' => $offset + strlen($data), 'data' => $data, 'id' => $id, 'reset' => $reset];
    }

    // ---------------------------------------------------------------- stats

    public function stats(): array
    {
        $pid = $this->pid();
        $cpu = 0.0;
        $mem = 0;
        $uptime = 0;
        if (pid_alive($pid)) {
            $stat = (string)@file_get_contents("/proc/$pid/stat");
            $fields = explode(' ', substr($stat, strrpos($stat, ')') + 2));
            $ticks = (int)$fields[11] + (int)$fields[12]; // utime + stime
            $now = microtime(true);
            $prevFile = $this->runDir() . '/cpu.json';
            $prev = read_json($prevFile);
            if ($prev && ($prev['pid'] ?? 0) === $pid && $now > $prev['t']) {
                $cpu = max(0, ($ticks - $prev['ticks']) / 100 / ($now - $prev['t']) * 100);
            }
            write_json($prevFile, ['pid' => $pid, 'ticks' => $ticks, 't' => $now]);
            if (preg_match('/VmRSS:\s+(\d+)/', (string)@file_get_contents("/proc/$pid/status"), $m)) {
                $mem = (int)$m[1] * 1024;
            }
            $uptime = time() - (int)@filemtime($this->runDir() . '/server.pid');
        }
        return [
            'state' => $this->state(),
            'cpu' => round($cpu, 1),
            'cpu_max' => self::cpuCount() * 100,
            'memory' => $mem,
            'memory_max' => (int)$this->cfg['ram_max'] * 1024 * 1024,
            'disk' => $this->diskUsage(),
            'uptime' => $uptime,
        ];
    }

    public static function cpuCount(): int
    {
        static $n = null;
        return $n ??= max(1, (int)shell_exec('nproc 2>/dev/null') ?: 1);
    }

    private function diskUsage(): int
    {
        $cache = $this->runDir() . '/du.json';
        $c = read_json($cache);
        if ($c && time() - $c['t'] < 60) {
            return $c['bytes'];
        }
        $out = shell_exec('du -sb ' . escapeshellarg($this->dir()) . ' 2>/dev/null');
        $bytes = (int)$out;
        write_json($cache, ['t' => time(), 'bytes' => $bytes]);
        return $bytes;
    }

    public function address(): string
    {
        // Default to the host the panel was opened with (php -S reports 0.0.0.0 as SERVER_NAME).
        $host = getenv('PUBLIC_HOST') ?: (parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost'), PHP_URL_HOST) ?: 'localhost');
        return $host . ':' . $this->cfg['port'];
    }
}
