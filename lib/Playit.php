<?php
declare(strict_types=1);

/**
 * playit.gg tunnel agent, one per Minecraft server.
 *
 * playit >= 1.1 ships a daemon (playitd) and a client (playit-cli). Setup flow:
 *   playit-cli claim generate        -> claim code
 *   playit-cli claim url <code>      -> URL the user opens to approve the agent
 *   playit-cli claim exchange <code> -> blocks until approved, prints the secret
 *   playitd --secret <secret>        -> runs the tunnel
 */
final class Playit
{
    private const RELEASE = 'https://github.com/playit-cloud/playit-agent/releases/latest/download/';

    private function __construct(private Server $server)
    {
    }

    public static function for(Server $server): self
    {
        return new self($server);
    }

    public static function daemonBin(): string
    {
        return BIN_DIR . '/playitd';
    }

    public static function cliBin(): string
    {
        return BIN_DIR . '/playit-cli';
    }

    public function secretFile(): string
    {
        @mkdir(PANEL_DIR . '/playit', 0700, true);
        return PANEL_DIR . '/playit/' . $this->server->id() . '.secret';
    }

    public function dir(): string
    {
        $d = $this->server->runDir() . '/playit';
        if (!is_dir($d)) {
            @mkdir($d, 0775, true);
        }
        return $d;
    }

    public function hasSecret(): bool
    {
        return is_file($this->secretFile()) && trim((string)file_get_contents($this->secretFile())) !== '';
    }

    private function state(): array
    {
        return read_json($this->dir() . '/state.json', []);
    }

    private function setState(array $s): void
    {
        write_json($this->dir() . '/state.json', $s + ['t' => time()]);
    }

    public function agentRunning(): bool
    {
        return pid_alive(read_pid($this->dir() . '/playitd.pid'));
    }

    private function claimRunning(): bool
    {
        return pid_alive(read_pid($this->dir() . '/claim.pid'));
    }

    public function status(): array
    {
        $state = $this->state();
        $phase = 'off';
        if ($this->agentRunning()) {
            $phase = 'online';
        } elseif ($this->claimRunning() || Job::active('playit-claim', $this->server->id())) {
            $phase = 'claiming';
        } elseif ($this->server->cfg['playit']) {
            $phase = ($state['phase'] ?? '') === 'error' ? 'error' : 'starting';
        }
        $agent = $phase === 'online' ? $this->agentState() : null;
        return [
            'enabled' => (bool)$this->server->cfg['playit'],
            'phase' => $phase,
            'claimed' => $this->hasSecret(),
            'claim_url' => $phase === 'claiming' ? ($state['claim_url'] ?? null) : null,
            'message' => $state['message'] ?? null,
            'tunnels' => $agent['tunnels'] ?? [],
            'pending' => $agent['pending'] ?? 0,
            'account' => $agent['account'] ?? null,
            'log' => $this->logTail(),
            'local' => '127.0.0.1:' . $this->server->cfg['port'],
        ];
    }

    /** One request/response over playitd's IPC socket (newline-delimited JSON, protocol v2). */
    private function ipc(string $type): ?array
    {
        $sock = $this->dir() . '/playit.sock';
        if (!file_exists($sock)) {
            return null;
        }
        $s = @stream_socket_client('unix://' . $sock, $errno, $err, 2);
        if (!$s) {
            return null;
        }
        stream_set_timeout($s, 2);
        fgets($s, 65536); // hello
        fwrite($s, json_encode(['ipc_version' => 2, 'request_id' => 1, 'request' => ['type' => $type]]) . "\n");
        $line = fgets($s, 1048576);
        fclose($s);
        $msg = json_decode((string)$line, true);
        return $msg['data']['response']['data'] ?? null;
    }

    /** Tunnels as reported by the running agent. */
    private function agentState(): ?array
    {
        $state = $this->ipc('get_state');
        $data = $state['data'] ?? null;
        if (!is_array($data)) {
            return null;
        }
        $tunnels = [];
        foreach ($data['tunnels'] ?? [] as $t) {
            $tunnels[] = [
                'address' => (string)($t['display_address'] ?? ''),
                'destination' => (string)($t['destination'] ?? ''),
                'disabled' => (bool)($t['is_disabled'] ?? false),
                'reason' => (string)($t['disabled_reason'] ?? ''),
            ];
        }
        return [
            'tunnels' => $tunnels,
            'pending' => count($data['pending_tunnels'] ?? []),
            'account' => $data['account_status'] ?? null,
        ];
    }

    public function enable(): ?string
    {
        $this->server->update(['playit' => true]);
        if ($this->hasSecret()) {
            $this->startAgent();
            return null;
        }
        if ($job = Job::active('playit-claim', $this->server->id())) {
            return $job['id'];
        }
        $this->setState(['phase' => 'claiming', 'message' => 'Preparando playit.gg...']);
        return Job::dispatch('playit-claim', [$this->server->id()], 'Configurar playit.gg');
    }

    public function disable(): void
    {
        $this->server->update(['playit' => false]);
        $this->stop();
        $this->setState(['phase' => 'off']);
    }

    public function reset(): void
    {
        $this->disable();
        @unlink($this->secretFile());
        foreach (glob($this->dir() . '/*.log') ?: [] as $f) {
            @unlink($f);
        }
    }

    public function stop(): void
    {
        foreach (['playitd.pid', 'attach.pid', 'claim.pid', 'wrapper.pid'] as $f) {
            $pid = read_pid($this->dir() . "/$f");
            if (pid_alive($pid)) {
                posix_kill($pid, 15);
            }
            @unlink($this->dir() . "/$f");
        }
    }

    public function startAgent(): void
    {
        if ($this->agentRunning()) {
            return;
        }
        if (!is_file(self::daemonBin()) || !is_file(self::cliBin())) {
            self::installBinaries(null);
        }
        $this->setState(['phase' => 'starting', 'message' => 'Iniciando agente...']);
        spawn_detached([
            'bash', APP_ROOT . '/scripts/run-playit.sh',
            $this->dir(), self::daemonBin(), self::cliBin(), $this->secretFile(),
        ]);
    }

    public static function installBinaries(?Job $job): void
    {
        $arch = match (system_arch()) {
            'aarch64' => 'aarch64',
            'arm' => 'armv7',
            default => 'amd64',
        };
        foreach (['playitd' => "playit-linux-$arch", 'playit-cli' => "playit-cli-linux-$arch"] as $name => $asset) {
            $job?->log("Descargando $asset...");
            $dest = BIN_DIR . "/$name";
            http_download(self::RELEASE . $asset, $dest, $job?->progressCallback());
            chmod($dest, 0755);
        }
    }

    /** Runs inside a background job: claim the agent, save the secret and start the tunnel. */
    public function claim(Job $job): void
    {
        if (!is_file(self::daemonBin()) || !is_file(self::cliBin())) {
            self::installBinaries($job);
        }
        $cli = escapeshellarg(self::cliBin());
        $code = trim((string)shell_exec("$cli claim generate 2>/dev/null"));
        if (!preg_match('/^[a-zA-Z0-9]+$/', $code)) {
            throw new RuntimeException('playit-cli no generó un código de vinculación.');
        }
        $name = 'mcpanel-' . preg_replace('/[^a-z0-9-]/', '-', strtolower($this->server->cfg['name']));
        $out = (string)shell_exec("$cli claim url " . escapeshellarg($code) . ' --name ' . escapeshellarg($name) . ' 2>&1');
        $url = preg_match('#https://playit\.gg/claim/\S+#', $out, $m) ? $m[0] : "https://playit.gg/claim/$code";

        $this->setState(['phase' => 'claiming', 'claim_url' => $url, 'message' => 'Abre el enlace para vincular el agente a tu cuenta de playit.gg.']);
        $job->log("Abre este enlace para vincular el agente: $url");
        $job->set(['claim_url' => $url]);

        // Exchange blocks until the user approves the claim (15 min max).
        $proc = proc_open([self::cliBin(), 'claim', 'exchange', $code, '--wait', '900'], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        file_put_contents($this->dir() . '/claim.pid', (string)proc_get_status($proc)['pid']);
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        $exit = proc_close($proc);
        @unlink($this->dir() . '/claim.pid');

        $secret = '';
        foreach (array_reverse(preg_split('/\R/', trim((string)$stdout))) as $line) {
            if (preg_match('/^[A-Za-z0-9_\-]{16,}$/', trim($line))) {
                $secret = trim($line);
                break;
            }
        }
        if ($exit !== 0 || $secret === '') {
            $fresh = Server::find($this->server->id());
            if ($fresh && !$fresh->cfg['playit']) {
                $job->log('Vinculación cancelada.');
                return;
            }
            $this->setState(['phase' => 'error', 'message' => 'No se completó la vinculación. Vuelve a activar playit.gg para intentarlo de nuevo.']);
            throw new RuntimeException('La vinculación no se completó: ' . trim($stderr ?: $stdout));
        }
        file_put_contents($this->secretFile(), $secret);
        chmod($this->secretFile(), 0600);
        $job->log('Agente vinculado. Iniciando túnel...');

        $fresh = Server::find($this->server->id());
        if ($fresh && $fresh->cfg['playit']) {
            self::for($fresh)->startAgent();
        }
    }

    /** Readable tail of the daemon log: one short line per event, without connection tokens. */
    private function logTail(): string
    {
        $file = $this->dir() . '/playitd.log';
        if (!is_file($file)) {
            $file = $this->dir() . '/agent.log';
        }
        if (!is_file($file)) {
            return '';
        }
        $size = filesize($file);
        $fp = fopen($file, 'rb');
        fseek($fp, max(0, $size - 40000));
        $text = preg_replace('/\e\[[0-9;?]*[A-Za-z]/', '', (string)stream_get_contents($fp));
        fclose($fp);

        $out = [];
        foreach (preg_split('/\R/', $text) as $line) {
            // Only lines that start an event; continuation lines carry raw tokens.
            if (!preg_match('/^(\d{4}-\d\d-\d\dT(\d\d:\d\d:\d\d))\S*\s+(\w+)\s+\S+:\s+(.*)$/', $line, $m)) {
                continue;
            }
            $msg = $m[4];
            if (str_contains($msg, 'New TCP Client')) {
                $msg = 'Conexión entrante (jugador o ping)';
            }
            $msg = preg_replace('/\b(token|secret)[=:]\s*\S+/i', '$1=…', $msg);
            $out[] = $m[2] . ' ' . $m[3] . '  ' . mb_strimwidth($msg, 0, 160, '…');
        }
        return implode("\n", array_slice($out, -30));
    }
}
