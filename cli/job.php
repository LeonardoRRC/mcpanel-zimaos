<?php
declare(strict_types=1);

// Background worker: php cli/job.php <job-id>
require dirname(__DIR__) . '/lib/bootstrap.php';
set_time_limit(0);

$job = Job::load($argv[1] ?? '');
$job->set(['status' => 'running', 'started' => time(), 'pid' => getmypid()]);

try {
    $args = $job->data['args'];
    switch ($job->data['type']) {
        case 'java-install':
            Java::install((int)$args[0], $job);
            break;
        case 'software-install':
            $server = Server::find($args[0]) ?? throw new RuntimeException('Servidor no encontrado.');
            Software::install($server, $args[1], $args[2], $job);
            break;
        case 'playit-claim':
            $server = Server::find($args[0]) ?? throw new RuntimeException('Servidor no encontrado.');
            Playit::for($server)->claim($job);
            break;
        default:
            throw new RuntimeException('Tipo de tarea desconocido.');
    }
    $job->set(['status' => 'done', 'progress' => 100, 'finished' => time()]);
} catch (Throwable $e) {
    $job->log('Error: ' . $e->getMessage());
    $job->set(['status' => 'error', 'error' => $e->getMessage(), 'finished' => time()]);
    exit(1);
}
