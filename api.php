<?php
declare(strict_types=1);

require __DIR__ . '/lib/bootstrap.php';
Auth::start();

function respond($data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function input(string $key, $default = null)
{
    static $json = null;
    $json ??= json_decode((string)file_get_contents('php://input'), true) ?: [];
    return $_POST[$key] ?? $json[$key] ?? $_GET[$key] ?? $default;
}

function server_or_404(): Server
{
    return Server::find((string)input('id', '')) ?? respond(['error' => 'Servidor no encontrado.'], 404);
}

if (!Auth::user()) {
    respond(['error' => 'Sesión expirada.'], 401);
}
$action = (string)($_GET['a'] ?? '');
$isPost = $_SERVER['REQUEST_METHOD'] === 'POST';
if ($isPost && !Auth::checkCsrf($_SERVER['HTTP_X_CSRF'] ?? input('_csrf'))) {
    respond(['error' => 'Token CSRF inválido, recarga la página.'], 403);
}
// The session file is only needed for auth; release it so polling doesn't serialize requests.
session_write_close();

try {
    switch ($action) {
        // ---------------------------------------------------------- servers
        case 'servers':
            respond(array_map(fn(Server $s) => $s->cfg + ['state' => $s->state(), 'address' => $s->address()], Server::all()));

        case 'server.create':
            $isPost || respond(['error' => 'POST requerido'], 405);
            $server = Server::create([
                'name' => input('name', 'Servidor'),
                'description' => input('description', ''),
                'port' => (int)input('port', 25565),
                'ram_max' => (int)input('ram_max', 4096),
                'ram_min' => min(1024, (int)input('ram_max', 4096)),
                'software' => ['type' => input('type', 'paper'), 'version' => input('version', '')],
                'eula' => (bool)input('eula', false),
            ]);
            $job = null;
            if (input('version')) {
                $job = Job::dispatch('software-install', [$server->id(), (string)input('type'), (string)input('version')], 'Instalar servidor');
            }
            respond(['id' => $server->id(), 'job' => $job]);

        case 'server.update':
            $isPost || respond(['error' => 'POST requerido'], 405);
            $server = server_or_404();
            $data = (array)input('data', []);
            unset($data['id'], $data['created'], $data['playit'], $data['software']);
            $server->update($data);
            respond(['ok' => true, 'server' => $server->cfg, 'preview' => $server->startupPreview()]);

        case 'server.delete':
            $isPost || respond(['error' => 'POST requerido'], 405);
            server_or_404()->delete();
            respond(['ok' => true]);

        case 'poll':
            $server = server_or_404();
            $console = $server->consoleSince((int)input('offset', -1), (int)input('log', 0));
            respond([
                'stats' => $server->stats(),
                'console' => $console,
                'playit' => input('playit') ? Playit::for($server)->status() : null,
            ]);

        case 'power':
            $isPost || respond(['error' => 'POST requerido'], 405);
            $server = server_or_404();
            match ((string)input('signal')) {
                'start' => $server->start(),
                'stop' => $server->stop(),
                'restart' => $server->restart(),
                'kill' => $server->kill(),
                default => throw new RuntimeException('Acción desconocida.'),
            };
            respond(['ok' => true, 'state' => $server->state()]);

        case 'command':
            $isPost || respond(['error' => 'POST requerido'], 405);
            server_or_404()->sendCommand((string)input('command', ''));
            respond(['ok' => true]);

        // ---------------------------------------------------------- files
        case 'files.list':
            respond((new Files(server_or_404()))->list((string)input('path', '')));

        case 'files.read':
            respond(['content' => (new Files(server_or_404()))->read((string)input('path'))]);

        case 'files.download':
            (new Files(server_or_404()))->download((string)input('path'));
            exit;

        case 'files.write':
            $isPost || respond(['error' => 'POST requerido'], 405);
            (new Files(server_or_404()))->write((string)input('path'), (string)input('content', ''));
            respond(['ok' => true]);

        case 'files.mkdir':
            $isPost || respond(['error' => 'POST requerido'], 405);
            (new Files(server_or_404()))->mkdir((string)input('path', ''), (string)input('name'));
            respond(['ok' => true]);

        case 'files.create':
            $isPost || respond(['error' => 'POST requerido'], 405);
            respond(['path' => (new Files(server_or_404()))->create((string)input('path', ''), (string)input('name'))]);

        case 'files.rename':
            $isPost || respond(['error' => 'POST requerido'], 405);
            (new Files(server_or_404()))->rename((string)input('path'), (string)input('name'));
            respond(['ok' => true]);

        case 'files.move':
            $isPost || respond(['error' => 'POST requerido'], 405);
            (new Files(server_or_404()))->move((array)input('paths', []), (string)input('dest', ''));
            respond(['ok' => true]);

        case 'files.delete':
            $isPost || respond(['error' => 'POST requerido'], 405);
            (new Files(server_or_404()))->delete((array)input('paths', []));
            respond(['ok' => true]);

        case 'files.upload':
            $isPost || respond(['error' => 'POST requerido'], 405);
            if (empty($_FILES['files'])) {
                throw new RuntimeException('No se recibió ningún archivo (¿supera el límite de subida?).');
            }
            respond(['count' => (new Files(server_or_404()))->upload((string)input('path', ''), $_FILES['files'])]);

        case 'files.extract':
            $isPost || respond(['error' => 'POST requerido'], 405);
            (new Files(server_or_404()))->extract((string)input('path'));
            respond(['ok' => true]);

        case 'files.compress':
            $isPost || respond(['error' => 'POST requerido'], 405);
            respond(['name' => (new Files(server_or_404()))->compress((array)input('paths', []), (string)input('path', ''))]);

        // ---------------------------------------------------------- java / software
        case 'java.list':
            respond(['versions' => Java::list(), 'job' => Job::active('java-install')]);

        case 'java.install':
            $isPost || respond(['error' => 'POST requerido'], 405);
            $major = (int)input('major');
            $existing = Job::active('java-install', (string)$major);
            respond(['job' => $existing['id'] ?? Job::dispatch('java-install', [(string)$major], "Instalar Java $major")]);

        case 'software.versions':
            respond(['versions' => Software::versions((string)input('type', 'paper'))]);

        case 'software.install':
            $isPost || respond(['error' => 'POST requerido'], 405);
            $server = server_or_404();
            if ($server->isRunning()) {
                throw new RuntimeException('Detén el servidor antes de cambiar la versión.');
            }
            $type = (string)input('type');
            if (!isset(Software::TYPES[$type])) {
                throw new RuntimeException('Tipo no válido.');
            }
            respond(['job' => Job::dispatch('software-install', [$server->id(), $type, (string)input('version')], 'Instalar servidor')]);

        case 'job':
            respond(Job::status((string)input('job')) ?? ['status' => 'missing']);

        // ---------------------------------------------------------- playit
        case 'playit.status':
            respond(Playit::for(server_or_404())->status());

        case 'playit.toggle':
            $isPost || respond(['error' => 'POST requerido'], 405);
            $p = Playit::for(server_or_404());
            if (input('enabled')) {
                $job = $p->enable();
                respond(['ok' => true, 'job' => $job]);
            }
            $p->disable();
            respond(['ok' => true]);

        case 'playit.reset':
            $isPost || respond(['error' => 'POST requerido'], 405);
            Playit::for(server_or_404())->reset();
            respond(['ok' => true]);

        // ---------------------------------------------------------- account
        case 'account.password':
            $isPost || respond(['error' => 'POST requerido'], 405);
            Auth::changePassword(Auth::user(), (string)input('current'), (string)input('new'));
            respond(['ok' => true]);
    }
    respond(['error' => 'Acción desconocida.'], 404);
} catch (Throwable $e) {
    respond(['error' => $e->getMessage()], 400);
}
