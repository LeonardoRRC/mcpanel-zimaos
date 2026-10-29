'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function bytes(n, dec = 1) {
    if (n == null) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i ? n.toFixed(dec) : n) + ' ' + u[i];
}

function duration(sec) {
    if (!sec) return '—';
    const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    return (d ? d + 'd ' : '') + (d || h ? h + 'h ' : '') + m + 'm';
}

/** Call the JSON API. GET when body is undefined, POST otherwise. */
async function api(action, params = {}, body) {
    const qs = new URLSearchParams({ a: action, ...params });
    const opts = { headers: { 'X-CSRF': PANEL.csrf }, credentials: 'same-origin' };
    if (body !== undefined) {
        opts.method = 'POST';
        if (body instanceof FormData) {
            opts.body = body;
        } else {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
    }
    const res = await fetch('api.php?' + qs, opts);
    if (res.status === 401) { location.reload(); throw new Error('Sesión expirada'); }
    const data = await res.json().catch(() => ({ error: 'Respuesta inválida del servidor (HTTP ' + res.status + ')' }));
    if (!res.ok || data.error) throw new Error(data.error || 'Error ' + res.status);
    return data;
}

const sid = () => PANEL.server;

function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.textContent = msg;
    $('#toasts').append(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3800);
    setTimeout(() => el.remove(), 4200);
}

/** Run an async action, showing errors as toasts. */
async function attempt(fn, okMsg) {
    try {
        const r = await fn();
        if (okMsg) toast(okMsg);
        return r;
    } catch (e) {
        toast(e.message, 'error');
        return null;
    }
}

function modal({ title, body, foot, wide = false, onClose }) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${esc(title)}</h3><button class="btn btn-ghost btn-icon" data-close aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"></div>
        ${foot !== false ? '<div class="modal-foot"></div>' : ''}
    </div>`;
    const m = $('.modal', back);
    const bodyEl = $('.modal-body', m);
    typeof body === 'string' ? (bodyEl.innerHTML = body) : bodyEl.append(body);
    if (foot) $('.modal-foot', m).append(...foot);
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    $('[data-close]', m).onclick = close;
    document.body.append(back);
    setTimeout(() => $('input, select, textarea', bodyEl)?.focus(), 30);
    return { el: m, body: bodyEl, close };
}

function button(label, cls = '', onClick) {
    const b = document.createElement('button');
    b.className = 'btn ' + cls;
    b.innerHTML = label;
    if (onClick) b.onclick = onClick;
    return b;
}

function confirmDialog(title, text, okLabel = 'Confirmar', danger = true) {
    return new Promise((resolve) => {
        let done = false;
        const m = modal({
            title, body: `<p>${text}</p>`,
            foot: [
                button('Cancelar', '', () => m.close()),
                button(okLabel, danger ? 'btn-red' : 'btn-primary', () => { done = true; m.close(); resolve(true); }),
            ],
            onClose: () => { if (!done) resolve(false); },
        });
    });
}

function promptDialog(title, label, value = '', okLabel = 'Guardar') {
    return new Promise((resolve) => {
        let done = false;
        const body = document.createElement('form');
        body.innerHTML = `<label class="field"><span>${esc(label)}</span><input class="input dark" value="${esc(value)}" required></label>`;
        const input = $('input', body);
        const ok = () => { if (!input.value.trim()) return; done = true; m.close(); resolve(input.value.trim()); };
        body.onsubmit = (e) => { e.preventDefault(); ok(); };
        const m = modal({ title, body, foot: [button('Cancelar', '', () => m.close()), button(okLabel, 'btn-primary', ok)], onClose: () => { if (!done) resolve(null); } });
        setTimeout(() => { input.focus(); const dot = value.lastIndexOf('.'); input.setSelectionRange(0, dot > 0 ? dot : value.length); }, 40);
    });
}

/**
 * Fill a <select> with the Minecraft versions of a server type (from MCJars).
 * Snapshots and pre-releases only show when asked for, or when one is the current version.
 */
async function loadVersions(select, type, { current, snapshots = false } = {}) {
    select.innerHTML = '<option value="">Cargando...</option>';
    select.disabled = true;
    try {
        const { versions } = await api('software.versions', { type });
        const shown = versions.filter((v) => snapshots || v.type === 'RELEASE' || v.id === current);
        select.innerHTML = shown.length
            ? shown.map((v) => `<option value="${esc(v.id)}" ${v.id === current ? 'selected' : ''}>${esc(v.id)}${v.type === 'RELEASE' ? '' : ' · ' + esc(v.type.toLowerCase())}${v.java ? ' — Java ' + v.java : ''}</option>`).join('')
            : '<option value="">Sin versiones estables (activa snapshots)</option>';
    } catch (e) {
        select.innerHTML = '<option value="">Sin conexión</option>';
        toast(e.message, 'error');
    }
    select.disabled = false;
}

/** Show a background job's progress in a modal until it finishes. Resolves true on success. */
function watchJob(jobId, title) {
    return new Promise((resolve) => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="progress indeterminate"><div></div></div>
            <div class="hint" data-pct>Iniciando...</div><pre class="job-log"></pre>`;
        const m = modal({ title, body, foot: false, onClose: () => clearInterval(timer) });
        const bar = $('.progress', body), pct = $('[data-pct]', body), log = $('.job-log', body);
        const timer = setInterval(async () => {
            let j;
            try { j = await api('job', { job: jobId }); } catch { return; }
            if (j.progress != null && j.status === 'running') {
                bar.classList.remove('indeterminate');
                bar.firstElementChild.style.width = j.progress + '%';
                pct.textContent = `${j.progress}%` + (j.total ? ` · ${bytes(j.bytes)} / ${bytes(j.total)}` : '');
            } else if (j.status === 'running') {
                pct.textContent = 'Trabajando...';
            }
            log.innerHTML = (j.log || []).map((l) => esc(l).replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')).join('\n');
            log.scrollTop = log.scrollHeight;
            if (j.status === 'done' || j.status === 'error' || j.status === 'missing') {
                clearInterval(timer);
                const ok = j.status === 'done';
                bar.classList.remove('indeterminate');
                bar.firstElementChild.style.width = '100%';
                bar.firstElementChild.style.background = ok ? 'var(--green)' : 'var(--red)';
                pct.textContent = ok ? 'Completado' : 'Error: ' + (j.error || 'desconocido');
                toast(ok ? title + ': completado' : title + ': ' + (j.error || 'error'), ok ? 'ok' : 'error');
                setTimeout(() => { if (ok) m.close(); resolve(ok); }, ok ? 900 : 0);
            }
        }, 900);
    });
}

// ------------------------------------------------------------ shell behaviour
// Dropdowns opened through [data-menu] triggers; other menus (file actions) manage themselves.
document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-menu]');
    const managed = new Set($$('[data-menu]').map((t) => t.dataset.menu));
    $$('.menu.open').forEach((m) => {
        if (managed.has(m.id) && (!trigger || m.id !== trigger.dataset.menu)) m.classList.remove('open');
    });
    if (trigger) $('#' + trigger.dataset.menu)?.classList.toggle('open');
});

(function clock() {
    const el = $('#clock');
    if (!el) return;
    const tick = () => { el.textContent = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); };
    tick();
    setInterval(tick, 10000);
})();
