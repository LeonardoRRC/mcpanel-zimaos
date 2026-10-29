'use strict';

const form = $('#startup-form');
const DEFAULT_STARTUP = '{{JAVA}} -Xms{{RAM_MIN}}M -Xmx{{RAM_MAX}}M {{FLAGS}} -jar {{JAR}} nogui';
let dirty = false;

function formData() {
    const d = Object.fromEntries(new FormData(form));
    for (const k of ['eula', 'auto_restart', 'autostart']) d[k] = form.elements[k].checked;
    d.java = Number(d.java);
    return d;
}

async function save(quiet = false) {
    const r = await attempt(() => api('server.update', { id: sid() }, { data: formData() }), quiet ? null : 'Startup guardado');
    if (r) {
        $('#preview').textContent = r.preview;
        dirty = false;
    }
    return r;
}

$('#save-startup').onclick = () => save();
form.addEventListener('input', () => { dirty = true; });
form.addEventListener('change', () => { dirty = true; });
window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

$('#reset-startup').onclick = () => { form.elements.startup.value = DEFAULT_STARTUP; dirty = true; };
$$('[data-var]').forEach((c) => c.addEventListener('click', () => {
    const ta = form.elements.startup;
    const pos = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, pos) + c.dataset.var + ta.value.slice(ta.selectionEnd ?? pos);
    ta.focus();
    dirty = true;
}));

// ------------------------------------------------------------ java
async function loadJava() {
    const r = await attempt(() => api('java.list'));
    if (!r) return;
    const current = Number(form.elements.java.value);
    $('#java-list').innerHTML = r.versions.map((v) => `
        <div class="java-item ${v.major === current ? 'selected' : ''}" data-major="${v.major}" tabindex="0" role="button">
            <b>Java ${v.major}</b>
            <div class="small">${v.installed ? '<span class="badge green">Instalado</span> ' + esc(v.version || '') : '<span class="badge">No instalado</span>'}</div>
            ${v.installed ? '' : `<button type="button" class="btn btn-sm" style="margin-top:8px;width:100%" data-install="${v.major}"><i class="fa-solid fa-download"></i> Instalar</button>`}
        </div>`).join('');
    if (r.job) watchJob(r.job.id, r.job.title).then(loadJava);
}

$('#java-list').addEventListener('click', async (e) => {
    const inst = e.target.closest('[data-install]');
    if (inst) {
        inst.disabled = true;
        const r = await attempt(() => api('java.install', {}, { major: Number(inst.dataset.install) }));
        if (r) { await watchJob(r.job, 'Instalando Java ' + inst.dataset.install); loadJava(); }
        return;
    }
    const item = e.target.closest('[data-major]');
    if (!item) return;
    form.elements.java.value = item.dataset.major;
    $$('.java-item').forEach((i) => i.classList.toggle('selected', i === item));
    dirty = true;
});

// ------------------------------------------------------------ software
const swType = $('#sw-type'), swVersion = $('#sw-version');
async function loadVersions() {
    swVersion.innerHTML = '<option>Cargando...</option>';
    swVersion.disabled = true;
    const r = await attempt(() => api('software.versions', { type: swType.value }));
    swVersion.disabled = false;
    if (!r) { swVersion.innerHTML = '<option value="">Sin conexión</option>'; return; }
    const cur = PANEL.cfg.software?.version;
    swVersion.innerHTML = r.versions.map((v) => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
}
swType.onchange = loadVersions;

$('#sw-install').onclick = async () => {
    const type = swType.value, version = swVersion.value;
    if (!version) return;
    const ok = await confirmDialog('Instalar versión',
        `Se descargará <b>${esc(swType.selectedOptions[0].text)} ${esc(version)}</b> y reemplazará <code>${esc(form.elements.jar.value)}</code>. ¿Continuar?`,
        'Instalar', false);
    if (!ok) return;
    if (dirty && !await save(true)) return;
    const r = await attempt(() => api('software.install', { id: sid() }, { type, version }));
    if (r && await watchJob(r.job, 'Instalando servidor')) {
        dirty = false;
        location.reload();
    }
};

loadJava();
loadVersions();
