<?php /** @var Server $server */ $c = $server->cfg; ?>
<div class="page-head"><h1>Ajustes</h1></div>

<div class="grid grid-2">
    <div class="card">
        <div class="card-head"><i class="fa-solid fa-pen"></i> Detalles del servidor</div>
        <form class="card-body" id="settings-form">
            <label class="field"><span>Nombre</span><input class="input dark" name="name" value="<?= e($c['name']) ?>" maxlength="40" required></label>
            <label class="field"><span>Descripción</span><input class="input dark" name="description" value="<?= e($c['description']) ?>" maxlength="120"></label>
            <label class="field"><span>Puerto</span><input class="input dark" type="number" name="port" min="1" max="65535" value="<?= (int)$c['port'] ?>" required></label>
            <p class="hint" style="margin-top:-6px">Se escribe en <code class="mono">server.properties</code> al iniciar. El contenedor usa red host, así que el puerto queda abierto en ZimaOS directamente.</p>
            <button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
        </form>
    </div>

    <div class="card">
        <div class="card-head"><i class="fa-solid fa-circle-info"></i> Información</div>
        <div class="card-body">
            <p><span class="muted">Carpeta en ZimaOS:</span><br><code class="mono"><?= e($server->dir()) ?></code></p>
            <p><span class="muted">Conexión en tu red local:</span><br><code class="mono"><?= e($server->address()) ?></code></p>
            <p><span class="muted">Creado:</span> <?= e(date('d/m/Y H:i', (int)($c['created'] ?? time()))) ?></p>
        </div>
        <div class="card-head" style="background:#b91c1c"><i class="fa-solid fa-triangle-exclamation"></i> Zona peligrosa</div>
        <div class="card-body">
            <p class="muted" style="margin-top:0">Borra el servidor, su mundo, plugins y la vinculación de playit.gg. No se puede deshacer.</p>
            <button class="btn btn-red" id="delete-server"><i class="fa-solid fa-trash"></i> Borrar servidor</button>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
    $('#settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        if (await attempt(() => api('server.update', { id: sid() }, { data }), 'Ajustes guardados')) setTimeout(() => location.reload(), 600);
    });
    $('#delete-server').onclick = async () => {
        const name = <?= json_encode($c['name'], JSON_HEX_TAG) ?>;
        const typed = await promptDialog('Borrar servidor', `Escribe "${name}" para confirmar`, '', 'Borrar definitivamente');
        if (typed === null) return;
        if (typed !== name) return toast('El nombre no coincide', 'error');
        if (await attempt(() => api('server.delete', { id: sid() }, {}))) location.href = './';
    };
});
</script>
