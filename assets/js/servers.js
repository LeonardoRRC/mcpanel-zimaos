'use strict';

$('#new-server').onclick = () => {
    const form = $('#tpl-new-server').content.firstElementChild.cloneNode(true);
    const type = $('[name=type]', form), version = $('[name=version]', form), snaps = $('[name=snapshots]', form);
    const refresh = () => loadVersions(version, type.value, { snapshots: snaps.checked });
    type.onchange = refresh;
    snaps.onchange = refresh;
    refresh();

    const submit = async () => {
        if (!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form));
        data.eula = !!data.eula;
        delete data.snapshots;
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
