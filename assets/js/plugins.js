'use strict';

const root = $('#mods');
if (root) {
    const KINDS = JSON.parse(root.dataset.kinds);
    const SORTS = JSON.parse(root.dataset.sorts);
    const compact = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 });
    const storeKey = 'mcpanel.kind.' + sid();
    const state = { kind: null, tab: 'browse', query: '', sort: 'relevance', offset: 0, total: 0, token: 0 };
    try { state.kind = localStorage.getItem(storeKey); } catch { }
    if (!KINDS[state.kind]) state.kind = Object.keys(KINDS)[0];

    const kind = () => KINDS[state.kind];
    const noun = () => (state.kind === 'mods' ? 'mod' : 'plugin');
    const projectUrl = (slug) => `https://modrinth.com/${kind().project_type}/${encodeURIComponent(slug)}`;
    const icon = (url, cls = 'mr-icon') => url
        ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : `<span class="${cls} placeholder"><i class="fa-solid ${state.kind === 'mods' ? 'fa-cube' : 'fa-plug'}"></i></span>`;
    const ago = (iso) => {
        const days = Math.round((Date.now() - new Date(iso)) / 86400000);
        const months = Math.round(days / 30), years = Math.round(days / 365);
        return days < 1 ? 'hoy' : days < 31 ? `hace ${days} d` : days < 365 ? `hace ${months} ${months === 1 ? 'mes' : 'meses'}` : `hace ${years} ${years === 1 ? 'año' : 'años'}`;
    };

    $('#mr-sort').innerHTML = Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');

    // ------------------------------------------------------------ kind & tabs
    function setKind(k) {
        state.kind = k;
        try { localStorage.setItem(storeKey, k); } catch { }
        $$('#kind-switch [data-kind]').forEach((b) => b.classList.toggle('btn-primary', b.dataset.kind === k));
        $('#mr-query').placeholder = `Buscar ${kind().label.toLowerCase()} en Modrinth…`;
        $('#installed-dir').textContent = `Carpeta ${kind().dir}/`;
        search(true);
        loadInstalled();
    }
    $$('#kind-switch [data-kind]').forEach((b) => { b.onclick = () => setKind(b.dataset.kind); });

    function setTab(t) {
        state.tab = t;
        $$('.tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
        $('#tab-browse').hidden = t !== 'browse';
        $('#tab-installed').hidden = t !== 'installed';
    }
    $$('.tabs [data-tab]').forEach((b) => { b.onclick = () => setTab(b.dataset.tab); });

    // ------------------------------------------------------------ browse
    async function search(reset) {
        const token = ++state.token;
        if (reset) {
            state.offset = 0;
            $('#mr-results').innerHTML = '<div class="muted mr-loading"><i class="fa-solid fa-spinner fa-spin"></i> Buscando…</div>';
        }
        $('#mr-more').disabled = true;
        const r = await attempt(() => api('mods.search', { id: sid(), kind: state.kind, q: state.query, sort: state.sort, offset: state.offset }));
        if (token !== state.token) return;
        $('#mr-more').disabled = false;
        if (!r) { if (reset) $('#mr-results').innerHTML = '<div class="empty">No se pudo conectar con Modrinth.</div>'; return; }
        state.total = r.total;
        const html = r.hits.map(card).join('');
        if (reset) $('#mr-results').innerHTML = html || `<div class="empty"><i class="fa-solid fa-magnifying-glass"></i>Sin resultados${r.game_version ? ' para ' + esc(r.game_version) : ''}.</div>`;
        else $('#mr-results').insertAdjacentHTML('beforeend', html);
        state.offset += r.hits.length;
        $('#mr-more').hidden = state.offset >= state.total;
    }

    function card(h) {
        return `<article class="mr-card" data-id="${esc(h.id)}" data-title="${esc(h.title)}">
            ${icon(h.icon)}
            <div class="mr-info">
                <div class="mr-title"><a href="${projectUrl(h.slug)}" target="_blank" rel="noopener">${esc(h.title)}</a> <span class="muted">por ${esc(h.author)}</span></div>
                <p class="mr-desc">${esc(h.description)}</p>
                <div class="mr-meta">
                    <span title="Descargas"><i class="fa-solid fa-download"></i> ${compact.format(h.downloads)}</span>
                    <span title="Seguidores"><i class="fa-solid fa-heart"></i> ${compact.format(h.follows)}</span>
                    ${h.updated ? `<span title="Última actualización"><i class="fa-solid fa-clock-rotate-left"></i> ${ago(h.updated)}</span>` : ''}
                    ${h.categories.slice(0, 3).map((c) => `<span class="badge">${esc(c)}</span>`).join('')}
                </div>
            </div>
            <div class="mr-action">
                ${h.installed
                    ? `<button type="button" class="btn btn-sm" data-install><i class="fa-solid fa-check"></i> Instalado</button>`
                    : `<button type="button" class="btn btn-sm btn-primary" data-install><i class="fa-solid fa-download"></i> Instalar</button>`}
            </div>
        </article>`;
    }

    let debounce;
    $('#mr-query').addEventListener('input', (e) => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { state.query = e.target.value.trim(); search(true); }, 350);
    });
    $('#search-form').onsubmit = (e) => { e.preventDefault(); clearTimeout(debounce); state.query = $('#mr-query').value.trim(); search(true); };
    $('#mr-sort').onchange = (e) => { state.sort = e.target.value; search(true); };
    $('#mr-more').onclick = () => search(false);
    $('#mr-results').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-install]');
        if (!btn) return;
        const c = btn.closest('.mr-card');
        chooseVersion(c.dataset.id, c.dataset.title);
    });

    // ------------------------------------------------------------ install
    async function chooseVersion(project, title) {
        const body = document.createElement('div');
        body.innerHTML = '<div class="muted"><i class="fa-solid fa-spinner fa-spin"></i> Buscando versiones compatibles…</div>';
        let install;
        const m = modal({
            title: 'Instalar ' + title, body,
            foot: [button('Cancelar', '', () => m.close()), install = button('<i class="fa-solid fa-download"></i> Instalar', 'btn-primary', () => go())],
        });
        install.disabled = true;
        const r = await attempt(() => api('mods.versions', { id: sid(), kind: state.kind, project }));
        if (!r) { m.close(); return; }
        if (!r.versions.length) {
            body.innerHTML = `<div class="empty"><i class="fa-solid fa-ban"></i>Este ${noun()} no tiene versiones para tu servidor (${esc(kind().loaders.join(', '))}).</div>`;
            return;
        }
        const types = { release: 'green', beta: 'orange', alpha: 'red' };
        const firstRelease = Math.max(0, r.versions.findIndex((v) => v.type === 'release'));
        body.innerHTML = `<div class="mr-versions">${r.versions.slice(0, 40).map((v, i) => `
            <label class="mr-version">
                <input type="radio" name="mr-version" value="${esc(v.id)}" ${i === firstRelease ? 'checked' : ''}>
                <span class="mr-vname"><b>${esc(v.number)}</b><small>${esc(v.name !== v.number ? v.name : '')}</small></span>
                <span class="badge ${types[v.type] || ''}">${esc(v.type)}</span>
                <span class="muted hide-sm">${new Date(v.date).toLocaleDateString('es')}</span>
                <span class="muted hide-sm">${v.file ? bytes(v.file.size) : ''}</span>
                ${v.deps ? `<span class="muted" title="Dependencias requeridas"><i class="fa-solid fa-link"></i> ${v.deps}</span>` : '<span></span>'}
            </label>`).join('')}</div>
            <label class="switch" style="margin-top:14px"><input type="checkbox" id="mr-deps" checked><span class="track"></span><span>Instalar también las dependencias requeridas</span></label>`;
        install.disabled = false;

        async function go() {
            const version = $('input[name=mr-version]:checked', body)?.value;
            if (!version) return;
            const deps = $('#mr-deps', body).checked;
            m.close();
            const res = await attempt(() => api('mods.install', { id: sid() }, { kind: state.kind, version, deps, title: 'Instalando ' + title }));
            if (res && await watchJob(res.job, 'Instalando ' + title)) refreshAll();
        }
    }

    // ------------------------------------------------------------ installed
    let installed = [];
    async function loadInstalled() {
        const r = await attempt(() => api('mods.installed', { id: sid(), kind: state.kind }));
        if (!r) return;
        installed = r.files;
        const updates = installed.filter((f) => f.update);
        $('#installed-count').textContent = installed.length;
        $('#installed-count').className = 'badge' + (updates.length ? ' orange' : '');
        $('#installed-count').title = updates.length ? `${updates.length} con actualización` : '';
        $('#update-all').hidden = updates.length < 2;
        $('#installed-list').innerHTML = installed.length ? installed.map(row).join('')
            : `<tr><td colspan="5"><div class="empty"><i class="fa-solid fa-box-open"></i>No hay ${kind().label.toLowerCase()} instalados.</div></td></tr>`;
    }

    function row(f) {
        const name = f.title
            ? `<a href="${projectUrl(f.slug)}" target="_blank" rel="noopener">${esc(f.title)}</a><small>${esc(f.file)}</small>`
            : `<span>${esc(f.file.replace(/\.disabled$/, ''))}</span><small>No está en Modrinth</small>`;
        return `<tr data-file="${esc(f.file)}" class="${f.enabled ? '' : 'disabled-row'}">
            <td><div class="mr-row-name">${icon(f.icon, 'mr-icon sm')}<div>${name}</div></div></td>
            <td class="num hide-sm">${esc(f.version || '—')}${f.update ? `<br><span class="badge orange" title="Nueva versión">→ ${esc(f.update.version)}</span>` : ''}</td>
            <td class="num hide-sm">${bytes(f.size)}</td>
            <td><label class="switch" title="${f.enabled ? 'Desactivar' : 'Activar'}"><input type="checkbox" data-toggle ${f.enabled ? 'checked' : ''}><span class="track"></span></label></td>
            <td class="mr-row-actions">
                ${f.update ? `<button type="button" class="btn btn-sm btn-green" data-update title="Actualizar a ${esc(f.update.version)}"><i class="fa-solid fa-arrows-rotate"></i><span class="hide-sm"> Actualizar</span></button>` : ''}
                <button type="button" class="btn btn-sm btn-ghost btn-icon" data-delete title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }

    async function update(f) {
        const res = await attempt(() => api('mods.install', { id: sid() }, { kind: state.kind, version: f.update.version_id, deps: true, title: 'Actualizar ' + (f.title || f.file) }));
        return res ? watchJob(res.job, 'Actualizando ' + (f.title || f.file)) : false;
    }

    $('#installed-list').addEventListener('click', async (e) => {
        const tr = e.target.closest('tr[data-file]');
        if (!tr) return;
        const f = installed.find((x) => x.file === tr.dataset.file);
        if (e.target.closest('[data-update]')) {
            if (await update(f)) refreshAll();
        } else if (e.target.closest('[data-delete]')) {
            if (!await confirmDialog('Eliminar ' + noun(), `Se borrará <code>${esc(f.file)}</code> de la carpeta ${esc(kind().dir)}/. Sus archivos de configuración se conservan.`, 'Eliminar')) return;
            if (await attempt(() => api('mods.delete', { id: sid() }, { kind: state.kind, file: f.file }), 'Eliminado')) refreshAll();
        }
    });
    $('#installed-list').addEventListener('change', async (e) => {
        if (!e.target.matches('[data-toggle]')) return;
        const tr = e.target.closest('tr[data-file]');
        const ok = await attempt(() => api('mods.toggle', { id: sid() }, { kind: state.kind, file: tr.dataset.file }),
            e.target.checked ? 'Activado (reinicia el servidor)' : 'Desactivado (reinicia el servidor)');
        if (!ok) e.target.checked = !e.target.checked;
        loadInstalled();
    });
    $('#update-all').onclick = async () => {
        for (const f of installed.filter((x) => x.update)) {
            if (!await update(f)) break;
        }
        refreshAll();
    };

    function refreshAll() {
        loadInstalled();
        search(true);
    }

    setKind(state.kind);
}
