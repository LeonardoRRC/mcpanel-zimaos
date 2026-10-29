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

async function rowAction(action, path) {
    const it = itemByPath(path);
    const name = path.split('/').pop();
    switch (action) {
        case 'open': return it.dir ? load(path) : it.editable ? openEditor(path) : download(path);
        case 'edit': return openEditor(path);
        case 'download': return download(path);
        case 'rename': {
            const n = await promptDialog('Renombrar', 'Nuevo nombre', name, 'Renombrar');
            if (n && n !== name) act('files.rename', { path, name: n }, 'Renombrado');
            return;
        }
        case 'extract': return act('files.extract', { path }, 'Descomprimido');
        case 'compress': return act('files.compress', { paths: [path], path: cwd }, 'Comprimido');
        case 'move': return movePaths([path]);
        case 'delete':
            if (await confirmDialog('Borrar', `¿Borrar <b>${esc(name)}</b>? No se puede deshacer.`, 'Borrar')) act('files.delete', { paths: [path] }, 'Borrado');
    }
}

function download(path) {
    location.href = 'api.php?' + new URLSearchParams({ a: 'files.download', id: sid(), path });
}

async function movePaths(paths) {
    const dest = await promptDialog('Mover a', 'Carpeta de destino (relativa a la raíz del servidor)', '/' + cwd, 'Mover');
    if (dest !== null) act('files.move', { paths, dest }, 'Movido');
}

function openRowMenu(btn, path) {
    const it = itemByPath(path);
    const menu = $('#row-menu');
    const entries = [
        it.editable && ['edit', 'fa-pen', 'Editar'],
        ['rename', 'fa-i-cursor', 'Renombrar'],
        ['move', 'fa-arrow-right-arrow-left', 'Mover'],
        !it.dir && ['download', 'fa-download', 'Descargar'],
        it.archive && ['extract', 'fa-box-open', 'Descomprimir'],
        ['compress', 'fa-file-zipper', 'Comprimir'],
        ['delete', 'fa-trash', 'Borrar'],
    ].filter(Boolean);
    menu.innerHTML = entries.map(([a, i, l]) => `<button data-act="${a}" ${a === 'delete' ? 'style="color:#f87171"' : ''}><i class="fa-solid ${i}"></i>${l}</button>`).join('');
    menu.dataset.path = path;
    const r = btn.getBoundingClientRect();
    menu.classList.add('open');
    menu.style.left = Math.min(r.right - 170, innerWidth - 190) + 'px';
    menu.style.top = Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 10) + 'px';
    menu.style.minWidth = '170px';
}

$('#row-menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    $('#row-menu').classList.remove('open');
    rowAction(b.dataset.act, $('#row-menu').dataset.path);
});
document.addEventListener('click', (e) => { if (!e.target.closest('[data-row-menu], #row-menu')) $('#row-menu').classList.remove('open'); });
document.addEventListener('scroll', () => $('#row-menu').classList.remove('open'), true);

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
    if (e.target.closest('[data-row-menu]')) return openRowMenu(e.target.closest('[data-row-menu]'), path);
    if (e.target.type === 'checkbox') {
        e.target.checked ? selected.add(path) : selected.delete(path);
        tr.classList.toggle('selected', e.target.checked);
        return renderBulk();
    }
    if (e.target.closest('[data-open]')) rowAction('open', path);
});

$('#check-all').addEventListener('change', (e) => {
    selected.clear();
    if (e.target.checked) items.forEach((i) => selected.add(join(cwd, i.name)));
    render();
});

$('#bulk-delete').onclick = async () => {
    if (await confirmDialog('Borrar', `¿Borrar ${selected.size} elemento(s)? No se puede deshacer.`, 'Borrar')) act('files.delete', { paths: [...selected] }, 'Borrado');
};
$('#bulk-compress').onclick = () => act('files.compress', { paths: [...selected], path: cwd }, 'Comprimido');
$('#bulk-move').onclick = () => movePaths([...selected]);

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
