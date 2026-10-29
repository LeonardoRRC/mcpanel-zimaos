<?php /** @var Server[] $servers */ ?>
<div class="page-head">
    <h1>Mis servidores</h1>
    <div class="actions"><button class="btn btn-primary" id="new-server"><i class="fa-solid fa-plus"></i> Crear servidor</button></div>
</div>

<?php if (!$servers): ?>
    <div class="card"><div class="empty">
        <i class="fa-solid fa-cube"></i>
        <h2>Aún no tienes servidores</h2>
        <p>Crea tu primer servidor de Minecraft: elige el software y la versión, y el panel descarga todo por ti.</p>
        <button class="btn btn-primary" onclick="document.getElementById('new-server').click()"><i class="fa-solid fa-plus"></i> Crear servidor</button>
    </div></div>
<?php endif; ?>

<div id="server-list">
    <?php foreach ($servers as $s): $state = $s->state(); ?>
        <a class="server-row <?= $state ?>" href="?s=<?= e($s->id()) ?>" data-id="<?= e($s->id()) ?>">
            <span class="icon"><i class="fa-solid fa-cube"></i></span>
            <span>
                <span class="name"><?= e($s->cfg['name']) ?></span><br>
                <span class="muted"><?= e($s->cfg['description'] ?: (Software::TYPES[$s->cfg['software']['type']] ?? '') . ' ' . ($s->cfg['software']['version'] ?? '')) ?></span>
            </span>
            <span class="meta">
                <span><i class="fa-solid fa-network-wired"></i><?= e($s->address()) ?></span>
                <span><i class="fa-solid fa-memory"></i><?= round($s->cfg['ram_max'] / 1024, 1) ?> GB</span>
                <span class="state-label"><span class="dot <?= $state ?>"></span> <?= e(['running' => 'En línea', 'starting' => 'Iniciando', 'stopping' => 'Deteniendo', 'offline' => 'Apagado'][$state]) ?></span>
                <span class="mono"><?= e($s->id()) ?></span>
            </span>
        </a>
    <?php endforeach; ?>
</div>

<template id="tpl-new-server">
    <form>
        <label class="field"><span>Nombre</span><input class="input dark" name="name" value="Mi servidor" maxlength="40" required></label>
        <label class="field"><span>Descripción (opcional)</span><input class="input dark" name="description" maxlength="120"></label>
        <div class="row">
            <label class="field"><span>Software</span>
                <select class="input dark" name="type">
                    <?php foreach (Software::TYPES as $k => $label): ?><option value="<?= $k ?>"><?= $label ?></option><?php endforeach; ?>
                </select>
            </label>
            <label class="field"><span>Versión</span><select class="input dark" name="version"><option value="">Cargando...</option></select></label>
        </div>
        <div class="row">
            <label class="field"><span>Puerto</span><input class="input dark" type="number" name="port" min="1" max="65535" value="<?= 25565 + count($servers) ?>" required></label>
            <label class="field"><span>RAM máxima (MB)</span><input class="input dark" type="number" name="ram_max" min="512" step="256" value="4096" required></label>
        </div>
        <label class="switch"><input type="checkbox" name="eula" required><span class="track"></span>
            <span>Acepto el <a href="https://www.minecraft.net/eula" target="_blank" rel="noopener">EULA de Minecraft</a></span></label>
        <p class="hint">Se descargará el servidor y la versión de Java que necesite automáticamente.</p>
    </form>
</template>
