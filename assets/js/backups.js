'use strict';

let state = { backups: [], orphans: [], running: false };
const fmtDate = (t) => new Date(t * 1000).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });

async function load() {
    const r = await attempt(() => api('backups.list', { id: sid() }));
    if (!r) return;
    state = r;
    $('#backup-count').textContent = r.backups.length;
    $('#backup-list').innerHTML = r.backups.length ? r.backups.map((b) => row(b, sid())).join('')
        : '<tr><td colspan="4"><div class="empty"><i class="fa-solid fa-box-archive"></i>Todavía no hay copias. Crea la primera con «Crear copia».</div></td></tr>';

    const orphanRows = r.orphans.flatMap((o) => o.backups.map((b) => row(b, o.server, o.name)));
    $('#orphans-card').hidden = !orphanRows.length;
    $('#orphan-list').innerHTML = orphanRows.join('');

    const u = r.usage;
    const pct = u.total ? Math.round((1 - u.free / u.total) * 100) : null;
    $('#backup-usage').innerHTML = `
        <p style="margin-top:0"><span class="muted">Carpeta de copias:</span><br><code class="mono">${esc(u.dir)}</code></p>
        <p><span class="muted">Ocupado por copias:</span> <b style="color:var(--white)">${bytes(u.used)}</b></p>
        ${pct !== null ? `<p style="margin-bottom:6px"><span class="muted">Disco:</span> ${bytes(u.free)} libres de ${bytes(u.total)}</p>
            <div class="progress"><div style="width:${pct}%;${pct > 90 ? 'background:var(--red)' : ''}"></div></div>` : ''}
        <p class="hint">Las copias se guardan fuera de la carpeta del servidor: siguen aquí aunque borres sus archivos o el servidor entero. Para protegerte también de un fallo del disco, apunta <code class="mono">BACKUP_DIR</code> a otro disco o descarga las copias importantes.</p>`;

    if (r.job) watchJob(r.job.id, r.job.title).then(load);
}

function row(b, from, serverName) {
    const tags = [
        b.auto ? '<span class="badge">automática</span>' : '',
        b.locked ? '<span class="badge orange"><i class="fa-solid fa-lock"></i> bloqueada</span>' : '',
        serverName ? `<span class="badge">${esc(serverName)}</span>` : '',
    ].join(' ');
    return `<tr data-id="${esc(b.id)}" data-from="${esc(from)}">
        <td><div class="backup-name"><i class="fa-solid fa-file-zipper"></i><div><b>${esc(b.name)}</b> ${tags}
            <small class="show-sm">${fmtDate(b.created)} · ${bytes(b.size)}</small></div></div></td>
        <td class="num hide-sm">${fmtDate(b.created)}</td>
        <td class="num hide-sm">${bytes(b.size)}</td>
        <td class="mr-row-actions">
            <button type="button" class="btn btn-sm btn-green" data-act="restore" title="Restaurar"><i class="fa-solid fa-clock-rotate-left"></i><span class="hide-sm"> Restaurar</span></button>
            <a class="btn btn-sm btn-ghost btn-icon" title="Descargar" href="api.php?${new URLSearchParams({ a: 'backups.download', id: sid(), from, backup: b.id })}"><i class="fa-solid fa-download"></i></a>
            <button type="button" class="btn btn-sm btn-ghost btn-icon" data-act="lock" title="${b.locked ? 'Desbloquear' : 'Bloquear (no se borra sola ni por error)'}"><i class="fa-solid ${b.locked ? 'fa-lock' : 'fa-lock-open'}"></i></button>
            <button type="button" class="btn btn-sm btn-ghost btn-icon" data-act="delete" title="Eliminar" ${b.locked ? 'disabled' : ''}><i class="fa-solid fa-trash"></i></button>
        </td>
    </tr>`;
}

function findBackup(tr) {
    const list = tr.dataset.from === sid() ? state.backups : (state.orphans.find((o) => o.server === tr.dataset.from)?.backups || []);
    return list.find((b) => b.id === tr.dataset.id);
}

// ------------------------------------------------------------ create
$('#create-backup').onclick = () => {
    const form = document.createElement('form');
    form.innerHTML = `<label class="field"><span>Nombre (opcional)</span><input class="input dark" name="name" maxlength="60" placeholder="Copia ${new Date().toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}"></label>
        <p class="hint">${state.running
            ? '<i class="fa-solid fa-circle-info"></i> El servidor está encendido: se guardará el mundo y se pausará el autoguardado mientras se copia. Los jugadores pueden seguir conectados.'
            : 'Se comprimirá toda la carpeta del servidor (menos las exclusiones).'}</p>`;
    const go = async () => {
        const name = form.elements.name.value.trim();
        m.close();
        const r = await attempt(() => api('backups.create', { id: sid() }, { name }));
        if (r) { await watchJob(r.job, 'Creando copia de seguridad'); load(); }
    };
    form.onsubmit = (e) => { e.preventDefault(); go(); };
    const m = modal({ title: 'Crear copia de seguridad', body: form, foot: [button('Cancelar', '', () => m.close()), button('<i class="fa-solid fa-box-archive"></i> Crear', 'btn-primary', go)] });
    form.elements.name.focus();
};

// ------------------------------------------------------------ row actions
async function onRowClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const b = findBackup(tr);
    const from = tr.dataset.from;
    if (!b) return;
    if (btn.dataset.act === 'lock') {
        if (await attempt(() => api('backups.lock', { id: sid() }, { from, backup: b.id, locked: !b.locked }), b.locked ? 'Copia desbloqueada' : 'Copia bloqueada')) load();
    } else if (btn.dataset.act === 'delete') {
        if (!await confirmDialog('Eliminar copia', `Se borrará <b>${esc(b.name)}</b> (${bytes(b.size)}) del ${fmtDate(b.created)}. No se puede deshacer.`, 'Eliminar')) return;
        if (await attempt(() => api('backups.delete', { id: sid() }, { from, backup: b.id }), 'Copia eliminada')) load();
    } else if (btn.dataset.act === 'restore') {
        restore(b, from);
    }
}
$('#backup-list').addEventListener('click', onRowClick);
$('#orphan-list').addEventListener('click', onRowClick);

function restore(b, from) {
    const body = document.createElement('div');
    body.innerHTML = `<p style="margin-top:0">Restaurar <b>${esc(b.name)}</b> del ${fmtDate(b.created)}${from !== sid() ? ` (de <b>${esc(b.server_name)}</b>)` : ''}.</p>
        ${state.running ? '<div class="form-error" style="margin-bottom:14px"><i class="fa-solid fa-triangle-exclamation"></i> El servidor está encendido. Se detendrá antes de restaurar.</div>' : ''}
        <label class="switch" style="margin-bottom:12px"><input type="checkbox" id="r-wipe" checked><span class="track"></span><span>Borrar los archivos actuales antes de restaurar</span></label>
        <label class="switch"><input type="checkbox" id="r-safety" checked><span class="track"></span><span>Crear antes una copia del estado actual</span></label>
        <p class="hint">Si desactivas el borrado, los archivos de la copia se escriben encima de los actuales y los archivos nuevos se conservan.</p>`;
    const go = async () => {
        const wipe = $('#r-wipe', body).checked, safety = $('#r-safety', body).checked;
        m.close();
        if (state.running) {
            if (!await attempt(() => api('power', { id: sid() }, { signal: 'stop' }))) return;
            toast('Deteniendo el servidor…');
            for (let i = 0; i < 60; i++) {
                await new Promise((r) => setTimeout(r, 1000));
                const list = await api('servers').catch(() => []);
                if (list.find((s) => s.id === sid())?.state === 'offline') break;
            }
        }
        const r = await attempt(() => api('backups.restore', { id: sid() }, { from, backup: b.id, wipe, safety }));
        if (r) { await watchJob(r.job, 'Restaurando copia de seguridad'); load(); }
    };
    const m = modal({ title: 'Restaurar copia', body, foot: [button('Cancelar', '', () => m.close()), button('<i class="fa-solid fa-clock-rotate-left"></i> Restaurar', 'btn-green', go)] });
}

// ------------------------------------------------------------ settings
$('#backup-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const r = await attempt(() => api('backups.settings', { id: sid() }, { interval: Number(d.interval), keep: Number(d.keep), ignore: d.ignore }), 'Ajustes de copias guardados');
    if (r) e.target.elements.keep.value = r.settings.keep;
});

load();
