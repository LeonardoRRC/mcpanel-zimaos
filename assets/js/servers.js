'use strict';

/** Fill a <select> with the versions of a server software type. */
async function loadVersions(select, type, current) {
    select.innerHTML = '<option value="">Cargando...</option>';
    select.disabled = true;
    try {
        const { versions } = await api('software.versions', { type });
        select.innerHTML = versions.map((v) => `<option ${v === current ? 'selected' : ''}>${esc(v)}</option>`).join('');
    } catch (e) {
        select.innerHTML = '<option value="">Sin conexión</option>';
        toast(e.message, 'error');
    }
    select.disabled = false;
}

$('#new-server').onclick = () => {
    const form = $('#tpl-new-server').content.firstElementChild.cloneNode(true);
    const type = $('[name=type]', form), version = $('[name=version]', form);
    type.onchange = () => loadVersions(version, type.value);
    loadVersions(version, type.value);

    const submit = async () => {
        if (!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form));
        data.eula = !!data.eula;
        const res = await attempt(() => api('server.create', {}, data));
        if (!res) return;
        m.close();
        if (res.job) await watchJob(res.job, 'Instalando servidor');
        location.href = '?s=' + res.id;
    };
    form.onsubmit = (e) => { e.preventDefault(); submit(); };
    const m = modal({
        title: 'Crear servidor', body: form,
        foot: [button('Cancelar', '', () => m.close()), button('<i class="fa-solid fa-plus"></i> Crear', 'btn-primary', submit)],
    });
};

// Keep status dots fresh.
setInterval(async () => {
    const list = await api('servers').catch(() => null);
    if (!list) return;
    const labels = { running: 'En línea', starting: 'Iniciando', stopping: 'Deteniendo', offline: 'Apagado' };
    for (const s of list) {
        const row = $(`.server-row[data-id="${s.id}"]`);
        if (!row) continue;
        row.className = 'server-row ' + s.state;
        $('.state-label', row).innerHTML = `<span class="dot ${s.state}"></span> ${labels[s.state]}`;
    }
}, 5000);
