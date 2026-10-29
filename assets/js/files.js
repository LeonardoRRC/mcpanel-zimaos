'use strict';

const params = new URLSearchParams(location.search);
let cwd = params.get('path') || '';
let items = [];
const selected = new Set();

const join = (dir, name) => (dir ? dir + '/' : '') + name;

function iconFor(it) {
    if (it.dir) return 'fa-solid fa-folder';
    if (it.archive) return 'fa-solid fa-file-zipper';
    if (/\.jar$/i.test(it.name)) return 'fa-brands fa-java';
    if (/\.(ya?ml|json|properties|toml|conf|cfg|txt|md|log|sh|ini)$/i.test(it.name)) return 'fa-solid fa-file-lines';
    if (/\.(png|jpe?g|gif|webp)$/i.test(it.name)) return 'fa-solid fa-file-image';
    return 'fa-solid fa-file';
}

function fmtDate(ts) {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderCrumbs() {
    const parts = cwd ? cwd.split('/') : [];
    let acc = '';
    let html = `<a href="#" data-go=""><i class="fa-solid fa-house"></i></a>`;
    for (const p of parts) {
        acc = join(acc, p);
        html += `<span class="sep">/</span><a href="#" data-go="${esc(acc)}">${esc(p)}</a>`;
    }
    $('#crumbs').innerHTML = html;
}

function renderBulk() {
    $('#bulk').hidden = selected.size === 0;
    $('#bulk-count').textContent = selected.size + ' seleccionado(s)';
    $('#check-all').checked = items.length > 0 && selected.size === items.length;
}

function render() {
    renderCrumbs();
    const rows = [];
    if (cwd) rows.push(`<tr><td></td><td colspan="4"><span class="fname" data-go="${esc(cwd.split('/').slice(0, -1).join('/'))}"><i class="fa-solid fa-turn-up"></i> ..</span></td></tr>`);
    for (const it of items) {
        const path = join(cwd, it.name);
        rows.push(`<tr data-path="${esc(path)}" class="${selected.has(path) ? 'selected' : ''}">
            <td class="check"><input type="checkbox" ${selected.has(path) ? 'checked' : ''} aria-label="Seleccionar"></td>
            <td><span class="fname" data-open><i class="${iconFor(it)}"></i>${esc(it.name)}</span></td>
            <td class="num hide-sm">${it.dir ? '' : bytes(it.size)}</td>
            <td class="num hide-sm">${fmtDate(it.mtime)}</td>
            <td class="row-actions"><button class="btn btn-sm btn-ghost" data-row-menu aria-label="Acciones"><i class="fa-solid fa-ellipsis"></i></button></td>
        </tr>`);
    }
    if (!items.length) rows.push('<tr><td></td><td colspan="4" class="muted">Carpeta vacía</td></tr>');
    $('#file-rows').innerHTML = rows.join('');
    renderBulk();
}

async function load(path = cwd) {
    const r = await attempt(() => api('files.list', { id: sid(), path }));
    if (!r) return;
    cwd = r.path;
    items = r.items;
    selected.clear();
    const url = new URL(location);
    cwd ? url.searchParams.set('path', cwd) : url.searchParams.delete('path');
    history.replaceState(null, '', url);
    render();
}

const itemByPath = (path) => items.find((i) => join(cwd, i.name) === path);

// ------------------------------------------------------------ editor
const MODES = { yml: 'yaml', yaml: 'yaml', json: 'json', properties: 'properties', toml: 'toml', sh: 'sh', js: 'javascript', md: 'markdown', xml: 'xml', html: 'html', conf: 'ini', cfg: 'ini', ini: 'ini', txt: 'text', log: 'text' };

async function openEditor(path) {
    const r = await attempt(() => api('files.read', { id: sid(), path }));
    if (!r) return;
    const box = document.createElement('div');
    box.className = 'editor';
    const save = async () => {
        await attempt(() => api('files.write', { id: sid() }, { path, content: editor.getValue() }), 'Guardado ' + path.split('/').pop());
        load();
    };
    const m = modal({
        title: '/' + path, body: box, wide: true,
        foot: [button('Cerrar', '', () => m.close()), button('<i class="fa-solid fa-floppy-disk"></i> Guardar', 'btn-primary', save)],
    });
    let editor;
    if (window.ace) {
        ace.config.set('basePath', 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.44.0/');
        editor = ace.edit(box, {
            theme: 'ace/theme/tomorrow_night', fontSize: 13, showPrintMargin: false, useWorker: false,
            mode: 'ace/mode/' + (MODES[path.split('.').pop().toLowerCase()] || 'text'),
        });
        editor.setValue(r.content, -1);
        editor.commands.addCommand({ name: 'save', bindKey: { win: 'Ctrl-S', mac: 'Cmd-S' }, exec: save });
        editor.focus();
    } else {
        // Fallback when the CDN is unreachable.
        const ta = document.createElement('textarea');
        ta.className = 'input dark';
        ta.style.cssText = 'width:100%;height:100%;border:0;border-radius:0';
        ta.value = r.content;
        box.append(ta);
        editor = { getValue: () => ta.value };
    }
}

// ------------------------------------------------------------ actions
async function act(action, body, ok) {
    const r = await attempt(() => api(action, { id: sid() }, body), ok);
    if (r) load();
    return r;
}

const baseName = (path) => path.split('/').pop();

async function rowAction(action, path) {
    const it = itemByPath(path);
    const name = baseName(path);
    switch (action) {
        case 'open': return it.dir ? load(path) : it.editable ? openEditor(path) : download(path);
        case 'edit': return openEditor(path);
        case 'download': return download(path);
        case 'rename': {
            const n = await promptDialog('Renombrar', 'Nuevo nombre', name, 'Renombrar');
            if (n && n !== name) act('files.rename', { path, name: n }, 'Renombrado');
            return;
        }
        case 'extract': return extractArchive(path, false);
        case 'extract-folder': return extractArchive(path, true);
        case 'compress': return compressPaths([path]);
        case 'move': return transferPaths([path], 'move');
        case 'copy': return transferPaths([path], 'copy');
        case 'delete': return deletePaths([path]);
    }
}

function download(path) {
    location.href = 'api.php?' + new URLSearchParams({ a: 'files.download', id: sid(), path });
}

async function deletePaths(paths) {
    const what = paths.length === 1 ? `<b>${esc(baseName(paths[0]))}</b>` : `${paths.length} elementos`;
    if (await confirmDialog('Borrar', `¿Borrar ${what}? No se puede deshacer.`, 'Borrar')) {
        act('files.delete', { paths }, 'Borrado');
    }
}

async function extractArchive(path, folder) {
    const r = await act('files.extract', { path, folder }, null);
    if (r) toast(folder ? `Descomprimido en /${r.dest}` : 'Descomprimido');
}

/** Ask for archive name and format, then compress. */
function compressPaths(paths) {
    const form = document.createElement('form');
    const suggested = paths.length === 1 ? baseName(paths[0]).replace(/\.(zip|tar\.gz|tgz)$/i, '') : 'archivo';
    form.innerHTML = `
        <label class="field"><span>Nombre del archivo</span><input class="input dark" name="name" value="${esc(suggested)}" required></label>
        <label class="field" style="margin:0"><span>Formato</span>
            <select class="input dark" name="format">
                <option value="zip">.zip (compatible con Windows)</option>
                <option value="tar.gz">.tar.gz (más rápido, conserva permisos)</option>
            </select></label>
        <p class="hint">${paths.length} elemento(s) de /${esc(cwd)}</p>`;
    const run = async () => {
        if (!form.reportValidity()) return;
        const { name, format } = Object.fromEntries(new FormData(form));
        m.close();
        const r = await act('files.compress', { paths, path: cwd, name, format });
        if (r) toast('Creado ' + r.name);
    };
    form.onsubmit = (e) => { e.preventDefault(); run(); };
    const m = modal({ title: 'Comprimir', body: form, foot: [button('Cancelar', '', () => m.close()), button('<i class="fa-solid fa-file-zipper"></i> Comprimir', 'btn-primary', run)] });
}

/** Folder picker that browses the server's directories. Resolves to a relative path or null. */
function pickFolder(title, okLabel, start = cwd, exclude = []) {
    return new Promise((resolve) => {
        let current = start;
        let done = false;
        const body = document.createElement('div');
        body.innerHTML = `<div class="crumbs" data-crumbs style="margin-bottom:10px"></div><div class="folder-list" data-list></div>`;
        const ok = button(`<i class="fa-solid fa-check"></i> ${esc(okLabel)}`, 'btn-primary', () => { done = true; m.close(); resolve(current); });
        const m = modal({ title, body, foot: [button('Cancelar', '', () => m.close()), ok], onClose: () => { if (!done) resolve(null); } });
        const show = async (path) => {
            const r = await attempt(() => api('files.list', { id: sid(), path }));
            if (!r) return;
            current = r.path;
            let acc = '';
            $('[data-crumbs]', body).innerHTML = `<a href="#" data-to=""><i class="fa-solid fa-house"></i></a>` + (current ? current.split('/') : [])
                .map((p) => { acc = join(acc, p); return `<span class="sep">/</span><a href="#" data-to="${esc(acc)}">${esc(p)}</a>`; }).join('');
            const dirs = r.items.filter((i) => i.dir && !exclude.includes(join(current, i.name)));
            $('[data-list]', body).innerHTML = dirs.length
                ? dirs.map((d) => `<button type="button" class="folder-item" data-to="${esc(join(current, d.name))}"><i class="fa-solid fa-folder"></i>${esc(d.name)}</button>`).join('')
                : '<p class="muted" style="margin:6px 2px">Sin subcarpetas</p>';
            // Moving into the folder the items already live in does nothing.
            ok.disabled = exclude.includes(current);
        };
        body.addEventListener('click', (e) => {
            const to = e.target.closest('[data-to]');
            if (to) { e.preventDefault(); show(to.dataset.to); }
        });
        show(start);
    });
}

async function transferPaths(paths, mode) {
    const isMove = mode === 'move';
    const dest = await pickFolder(isMove ? 'Mover a...' : 'Copiar a...', isMove ? 'Mover aquí' : 'Copiar aquí', cwd, isMove ? paths : []);
    if (dest === null) return;
    if (isMove && dest === cwd) return toast('Ya está en esa carpeta', 'error');
    act(isMove ? 'files.move' : 'files.copy', { paths, dest }, isMove ? 'Movido a /' + dest : 'Copiado a /' + dest);
}

function menuEntries(path) {
    const it = itemByPath(path);
    return [
        ['open', it.dir ? 'fa-folder-open' : 'fa-arrow-up-right-from-square', it.dir ? 'Abrir' : it.editable ? 'Editar' : 'Descargar'],
        null,
        ['rename', 'fa-i-cursor', 'Renombrar'],
        ['move', 'fa-arrow-right-arrow-left', 'Mover...'],
        ['copy', 'fa-copy', 'Copiar...'],
        null,
        ['download', 'fa-download', it.dir ? 'Descargar (.tar.gz)' : 'Descargar'],
        ['compress', 'fa-file-zipper', 'Comprimir...'],
        it.archive && ['extract', 'fa-box-open', 'Descomprimir aquí'],
        it.archive && ['extract-folder', 'fa-folder-plus', 'Descomprimir en carpeta'],
        null,
        ['delete', 'fa-trash', 'Borrar', true],
    ].filter((e) => e !== false && e !== undefined);
}

/** Show the actions menu next to a button, or at the mouse position for right-clicks. */
function openRowMenu(path, anchor) {
    const menu = $('#row-menu');
    menu.innerHTML = menuEntries(path).map((e) => e === null
        ? '<div class="menu-sep"></div>'
        : `<button data-act="${e[0]}" class="${e[3] ? 'danger' : ''}"><i class="fa-solid ${e[1]}"></i>${e[2]}</button>`).join('');
    menu.dataset.path = path;
    menu.classList.add('open');
    const w = menu.offsetWidth, h = menu.offsetHeight;
    let x, y;
    if (anchor instanceof MouseEvent) {
        x = anchor.clientX; y = anchor.clientY;
    } else {
        const r = anchor.getBoundingClientRect();
        x = r.right - w; y = r.bottom + 4;
    }
    menu.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
    menu.style.top = Math.max(8, y + h > innerHeight - 8 ? y - h - (anchor instanceof MouseEvent ? 0 : 36) : y) + 'px';
}
const closeRowMenu = () => $('#row-menu').classList.remove('open');

$('#row-menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    closeRowMenu();
    rowAction(b.dataset.act, $('#row-menu').dataset.path);
});
document.addEventListener('click', (e) => { if (!e.target.closest('[data-row-menu], #row-menu')) closeRowMenu(); });
document.addEventListener('scroll', closeRowMenu, true);
window.addEventListener('resize', closeRowMenu);

$('#crumbs').addEventListener('click', (e) => {
    const a = e.target.closest('[data-go]');
    if (a) { e.preventDefault(); load(a.dataset.go); }
});

$('#file-rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    const go = e.target.closest('[data-go]');
    if (go) return load(go.dataset.go);
    if (!tr?.dataset.path) return;
    const path = tr.dataset.path;
    const menuBtn = e.target.closest('[data-row-menu]');
    if (menuBtn) {
        const open = $('#row-menu').classList.contains('open') && $('#row-menu').dataset.path === path;
        return open ? closeRowMenu() : openRowMenu(path, menuBtn);
    }
    if (e.target.type === 'checkbox') {
        e.target.checked ? selected.add(path) : selected.delete(path);
        tr.classList.toggle('selected', e.target.checked);
        return renderBulk();
    }
    if (e.target.closest('[data-open]')) rowAction('open', path);
});

$('#file-rows').addEventListener('contextmenu', (e) => {
    const tr = e.target.closest('tr[data-path]');
    if (!tr) return;
    e.preventDefault();
    openRowMenu(tr.dataset.path, e);
});

document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, .modal-back, .ace_editor')) return;
    if (e.key === 'Delete' && selected.size) { e.preventDefault(); deletePaths([...selected]); }
    if (e.key === 'Escape') { closeRowMenu(); if (selected.size) { selected.clear(); render(); } }
    if (e.key === 'F2' && selected.size === 1) { e.preventDefault(); rowAction('rename', [...selected][0]); }
});

$('#check-all').addEventListener('change', (e) => {
    selected.clear();
    if (e.target.checked) items.forEach((i) => selected.add(join(cwd, i.name)));
    render();
});

$('#bulk-delete').onclick = () => deletePaths([...selected]);
$('#bulk-compress').onclick = () => compressPaths([...selected]);
$('#bulk-move').onclick = () => transferPaths([...selected], 'move');
$('#bulk-copy').onclick = () => transferPaths([...selected], 'copy');

$('#btn-newfolder').onclick = async () => {
    const name = await promptDialog('Nueva carpeta', 'Nombre', '', 'Crear');
    if (name) act('files.mkdir', { path: cwd, name }, 'Carpeta creada');
};
$('#btn-newfile').onclick = async () => {
    const name = await promptDialog('Nuevo archivo', 'Nombre', '', 'Crear');
    if (!name) return;
    const r = await act('files.create', { path: cwd, name });
    if (r) openEditor(r.path);
};

// ------------------------------------------------------------ upload
async function upload(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    const total = files.reduce((s, f) => s + f.size, 0);
    const body = document.createElement('div');
    body.innerHTML = `<div class="progress"><div></div></div><div class="hint" data-pct>0%</div>`;
    const m = modal({ title: `Subiendo ${files.length} archivo(s)`, body, foot: false });
    const fd = new FormData();
    fd.append('path', cwd);
    // webkitRelativePath / fullPath keep the folder structure on drag & drop.
    files.forEach((f) => fd.append('files[]', f, f.relPath || f.webkitRelativePath || f.name));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'api.php?a=files.upload&id=' + sid());
    xhr.setRequestHeader('X-CSRF', PANEL.csrf);
    xhr.upload.onprogress = (e) => {
        const p = Math.round(e.loaded / e.total * 100);
        $('.progress > div', body).style.width = p + '%';
        $('[data-pct]', body).textContent = `${p}% · ${bytes(e.loaded)} / ${bytes(total)}`;
    };
    xhr.onload = () => {
        m.close();
        let r = {};
        try { r = JSON.parse(xhr.responseText); } catch { r.error = 'HTTP ' + xhr.status; }
        r.error ? toast(r.error, 'error') : toast(`${r.count} archivo(s) subido(s)`);
        load();
    };
    xhr.onerror = () => { m.close(); toast('Error de red al subir', 'error'); };
    xhr.send(fd);
}

$('#btn-upload').onclick = () => $('#upload-input').click();
$('#upload-input').onchange = (e) => { upload(e.target.files); e.target.value = ''; };

/** Read dropped folders recursively. */
async function collectEntries(entry, prefix = '') {
    if (entry.isFile) {
        return new Promise((res) => entry.file((f) => { f.relPath = prefix + f.name; res([f]); }, () => res([])));
    }
    const reader = entry.createReader();
    const all = [];
    for (;;) {
        const batch = await new Promise((res) => reader.readEntries(res, () => res([])));
        if (!batch.length) break;
        all.push(...batch);
    }
    const nested = await Promise.all(all.map((e) => collectEntries(e, prefix + entry.name + '/')));
    return nested.flat();
}

let dragDepth = 0;
document.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { dragDepth++; $('#dropzone').classList.add('show'); } });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropzone').classList.remove('show'); } });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    $('#dropzone').classList.remove('show');
    const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    const files = entries.length ? (await Promise.all(entries.map((en) => collectEntries(en)))).flat() : [...e.dataTransfer.files];
    upload(files);
});

load(cwd);
