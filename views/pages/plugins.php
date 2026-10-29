<?php
/** @var Server $server */
$kinds = Modrinth::kinds($server);
$sw = $server->cfg['software'];
$swLabel = trim(Software::label($sw['type'] ?? '') . ' ' . ($sw['version'] ?? ''));
?>
<div class="page-head">
    <h1><?= e(Modrinth::navLabel($server) ?? 'Plugins y mods') ?></h1>
    <?php if (count($kinds) > 1): ?>
        <div class="actions seg" id="kind-switch">
            <?php foreach ($kinds as $key => $k): ?>
                <button type="button" class="btn" data-kind="<?= e($key) ?>"><i class="fa-solid <?= $key === 'mods' ? 'fa-cubes' : 'fa-plug' ?>"></i> <?= e($k['label']) ?></button>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>

<?php if (!$kinds): ?>
    <div class="card"><div class="empty">
        <i class="fa-solid fa-puzzle-piece"></i>
        <b style="color:var(--white)"><?= e($swLabel ?: 'Este servidor') ?></b> no carga plugins ni mods.<br>
        Cambia a Paper o Purpur (plugins) o a Fabric, Forge o NeoForge (mods) en <a href="?s=<?= e($server->id()) ?>&p=startup">Startup</a>.
    </div></div>
<?php else: ?>
    <div id="mods" data-kinds="<?= e(json_encode($kinds, JSON_UNESCAPED_SLASHES)) ?>" data-sorts="<?= e(json_encode(Modrinth::SORTS, JSON_UNESCAPED_UNICODE)) ?>">
        <div class="tabs" role="tablist">
            <button type="button" class="tab active" data-tab="browse" role="tab"><i class="fa-solid fa-compass"></i> Explorar</button>
            <button type="button" class="tab" data-tab="installed" role="tab"><i class="fa-solid fa-box-open"></i> Instalados <span class="badge" id="installed-count">…</span></button>
            <div class="spacer"></div>
            <span class="muted small-note">Compatibles con <b><?= e($swLabel) ?></b> · vía <a href="https://modrinth.com" target="_blank" rel="noopener">Modrinth</a></span>
        </div>

        <section id="tab-browse">
            <form class="mr-toolbar" id="search-form" role="search">
                <div class="search-box">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input class="input dark" type="search" id="mr-query" placeholder="Buscar…" autocomplete="off" aria-label="Buscar">
                </div>
                <select class="input dark" id="mr-sort" aria-label="Ordenar por"></select>
            </form>
            <div class="mr-grid" id="mr-results"></div>
            <div class="mr-more"><button type="button" class="btn" id="mr-more" hidden>Cargar más</button></div>
        </section>

        <section id="tab-installed" hidden>
            <div class="card">
                <div class="card-head"><i class="fa-solid fa-folder"></i> <span id="installed-dir"></span>
                    <div class="right"><button type="button" class="btn btn-sm btn-green" id="update-all" hidden><i class="fa-solid fa-arrows-rotate"></i> Actualizar todo</button></div>
                </div>
                <table class="file-table">
                    <thead><tr><th>Nombre</th><th class="hide-sm">Versión</th><th class="hide-sm">Tamaño</th><th>Activo</th><th></th></tr></thead>
                    <tbody id="installed-list"><tr><td colspan="5" class="muted">Cargando…</td></tr></tbody>
                </table>
            </div>
            <p class="hint">Los cambios se aplican al reiniciar el servidor. Los archivos que no están en Modrinth aparecen con su nombre de archivo.</p>
        </section>
    </div>
<?php endif; ?>
