<?php /** @var Server $server */ ?>
<div class="page-head">
    <h1>Archivos</h1>
    <div class="actions">
        <button class="btn" id="btn-newfolder"><i class="fa-solid fa-folder-plus"></i> Carpeta</button>
        <button class="btn" id="btn-newfile"><i class="fa-solid fa-file-circle-plus"></i> Archivo</button>
        <button class="btn btn-primary" id="btn-upload"><i class="fa-solid fa-upload"></i> Subir</button>
        <input type="file" id="upload-input" multiple hidden>
    </div>
</div>

<div class="card">
    <div class="card-head dark">
        <div class="crumbs" id="crumbs"></div>
        <div class="right" id="bulk" hidden>
            <span id="bulk-count"></span>
            <button class="btn btn-sm" id="bulk-move"><i class="fa-solid fa-arrow-right-arrow-left"></i> Mover</button>
            <button class="btn btn-sm" id="bulk-copy"><i class="fa-solid fa-copy"></i> Copiar</button>
            <button class="btn btn-sm" id="bulk-compress"><i class="fa-solid fa-file-zipper"></i> Comprimir</button>
            <button class="btn btn-sm btn-red" id="bulk-delete"><i class="fa-solid fa-trash"></i> Borrar</button>
        </div>
    </div>
    <div style="overflow-x:auto">
        <table class="file-table">
            <thead><tr>
                <th class="check"><input type="checkbox" id="check-all" aria-label="Seleccionar todo"></th>
                <th>Nombre</th><th class="hide-sm">Tamaño</th><th class="hide-sm">Modificado</th><th></th>
            </tr></thead>
            <tbody id="file-rows"><tr><td colspan="5" class="muted">Cargando...</td></tr></tbody>
        </table>
    </div>
</div>
<p class="hint">Arrastra archivos o carpetas sobre la página para subirlos. Usa el botón <i class="fa-solid fa-ellipsis"></i> o clic derecho sobre un elemento para renombrar, mover, copiar, comprimir, descomprimir o borrar. Atajos: <kbd>Supr</kbd> borra la selección, <kbd>F2</kbd> renombra, <kbd>Esc</kbd> limpia la selección.</p>
<div class="dropzone" id="dropzone"><div><i class="fa-solid fa-cloud-arrow-up"></i> Suelta para subir</div></div>
<div class="menu" id="row-menu" style="position:fixed"></div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.44.0/ace.min.js" defer></script>
