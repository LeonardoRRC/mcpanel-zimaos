<?php /** @var Server $server */ $b = $server->cfg['backup']; ?>
<div class="page-head">
    <h1>Backups</h1>
    <div class="actions"><button class="btn btn-primary" id="create-backup"><i class="fa-solid fa-plus"></i> Crear copia</button></div>
</div>

<div class="card">
    <div class="card-head"><i class="fa-solid fa-box-archive"></i> Copias de seguridad
        <div class="right"><span class="badge" id="backup-count">…</span></div>
    </div>
    <table class="file-table">
        <thead><tr><th>Nombre</th><th class="hide-sm">Fecha</th><th class="hide-sm">Tamaño</th><th></th></tr></thead>
        <tbody id="backup-list"><tr><td colspan="4" class="muted">Cargando…</td></tr></tbody>
    </table>
</div>

<div class="grid grid-2" style="margin-top:18px">
    <div class="card">
        <div class="card-head"><i class="fa-solid fa-clock-rotate-left"></i> Copias automáticas</div>
        <form class="card-body" id="backup-settings">
            <div class="row">
                <label class="field"><span>Frecuencia</span>
                    <select class="input dark" name="interval">
                        <?php foreach (Backup::INTERVALS as $h => $label): ?>
                            <option value="<?= $h ?>" <?= (int)$b['interval'] === $h ? 'selected' : '' ?>><?= e($label) ?></option>
                        <?php endforeach; ?>
                    </select>
                </label>
                <label class="field"><span>Conservar las últimas</span><input class="input dark" type="number" name="keep" min="1" max="100" value="<?= (int)$b['keep'] ?>"></label>
            </div>
            <label class="field"><span>Excluir (una ruta o patrón por línea)</span>
                <textarea class="input dark mono" name="ignore" rows="4" spellcheck="false" placeholder="logs&#10;cache&#10;*.log&#10;plugins/dynmap/web"><?= e($b['ignore']) ?></textarea>
            </label>
            <p class="hint" style="margin-top:-6px">Las copias automáticas más antiguas se borran al superar el límite. Las manuales y las bloqueadas (<i class="fa-solid fa-lock"></i>) nunca se borran solas. Las exclusiones aplican a todas las copias.</p>
            <button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
        </form>
    </div>

    <div class="card">
        <div class="card-head"><i class="fa-solid fa-hard-drive"></i> Almacenamiento</div>
        <div class="card-body" id="backup-usage"><span class="muted">Cargando…</span></div>
    </div>
</div>

<div class="card" id="orphans-card" style="margin-top:18px" hidden>
    <div class="card-head"><i class="fa-solid fa-life-ring"></i> Copias de servidores eliminados</div>
    <div class="card-body" style="padding-bottom:4px"><p class="hint" style="margin:0">Estas copias pertenecen a servidores que ya no existen. Puedes restaurarlas en este servidor.</p></div>
    <table class="file-table">
        <thead><tr><th>Nombre</th><th class="hide-sm">Fecha</th><th class="hide-sm">Tamaño</th><th></th></tr></thead>
        <tbody id="orphan-list"></tbody>
    </table>
</div>
