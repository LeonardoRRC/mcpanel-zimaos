<?php /** @var Server $server */ ?>
<div class="page-head">
    <h1><?= e($server->cfg['name']) ?></h1>
    <span class="badge orange"><?= e((Software::TYPES[$server->cfg['software']['type']] ?? 'Custom') . ' ' . ($server->cfg['software']['version'] ?? '')) ?></span>
    <div class="actions power">
        <button class="btn btn-green" data-power="start"><i class="fa-solid fa-play"></i> Iniciar</button>
        <button class="btn btn-primary" data-power="restart"><i class="fa-solid fa-rotate-right"></i> Reiniciar</button>
        <button class="btn btn-red" data-power="stop"><i class="fa-solid fa-stop"></i> Detener</button>
        <button class="btn" data-power="kill" title="Forzar cierre"><i class="fa-solid fa-skull"></i> Kill</button>
    </div>
</div>

<div class="grid grid-3" style="margin-bottom:18px">
    <div class="card"><div class="card-head"><i class="fa-solid fa-signal"></i> Estado</div>
        <div class="card-body stat-value"><span class="dot offline" id="st-dot"></span><span id="st-state">Cargando...</span> <small id="st-uptime"></small></div></div>
    <div class="card"><div class="card-head"><i class="fa-solid fa-network-wired"></i> Dirección IP</div>
        <div class="card-body stat-value"><span class="mono"><?= e($server->address()) ?></span></div></div>
    <div class="card"><div class="card-head"><i class="fa-solid fa-fingerprint"></i> ID del servidor</div>
        <div class="card-body stat-value"><span class="mono"><?= e(strtoupper($server->id())) ?></span></div></div>
    <div class="card"><div class="card-head"><i class="fa-solid fa-microchip"></i> CPU</div>
        <div class="card-body stat-value"><span id="st-cpu">0%</span><small id="st-cpu-max"></small></div></div>
    <div class="card"><div class="card-head"><i class="fa-solid fa-memory"></i> RAM</div>
        <div class="card-body stat-value"><span id="st-mem">0 B</span><small id="st-mem-max"></small></div></div>
    <div class="card"><div class="card-head"><i class="fa-solid fa-hard-drive"></i> Almacenamiento</div>
        <div class="card-body stat-value"><span id="st-disk">—</span></div></div>
</div>

<div class="console-wrap" style="margin-bottom:18px">
    <pre class="console" id="console" aria-live="polite"></pre>
    <form class="console-input" id="cmd-form" autocomplete="off">
        <span class="prompt">$</span>
        <input id="cmd" placeholder="Escribe un comando... (↑/↓ historial)" spellcheck="false">
        <button type="button" class="btn btn-sm btn-ghost" id="clear-console">Limpiar</button>
        <button type="submit" class="btn btn-sm btn-primary"><i class="fa-solid fa-paper-plane"></i></button>
    </form>
</div>

<div class="card" style="margin-bottom:18px" id="playit-card">
    <div class="card-head">
        <i class="fa-solid fa-globe"></i> playit.gg · Acceso desde internet
        <div class="right">
            <label class="switch"><input type="checkbox" id="playit-toggle" <?= $server->cfg['playit'] ? 'checked' : '' ?>><span class="track"></span><span id="playit-toggle-label"><?= $server->cfg['playit'] ? 'Activado' : 'Desactivado' ?></span></label>
        </div>
    </div>
    <div class="card-body playit-body">
        <div class="playit-status" id="playit-status">
            <p class="muted">Expone tu servidor a internet sin abrir puertos del router. Al activarlo por primera vez te daremos un enlace para vincularlo con tu cuenta gratuita de playit.gg.</p>
        </div>
        <div>
            <div class="hint" style="margin:0 0 6px">Registro del agente</div>
            <pre class="mini-log" id="playit-log">—</pre>
        </div>
    </div>
</div>

<div class="grid grid-2">
    <div class="card"><div class="card-head"><i class="fa-solid fa-memory"></i> Uso de memoria</div><div class="card-body chart"><canvas id="chart-mem"></canvas></div></div>
    <div class="card"><div class="card-head"><i class="fa-solid fa-microchip"></i> Uso de CPU</div><div class="card-body chart"><canvas id="chart-cpu"></canvas></div></div>
</div>
