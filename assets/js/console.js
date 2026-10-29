'use strict';

const STATE_LABEL = { running: 'En línea', starting: 'Iniciando...', stopping: 'Deteniendo...', offline: 'Apagado' };
const consoleEl = $('#console');
let offset = -1;
let logId = 0;
let state = 'offline';
let pending = '';

// ------------------------------------------------------------ ANSI → HTML
const ANSI_COLORS = ['#3b3f51', '#ef4444', '#22c55e', '#f5b70b', '#3b82f6', '#c084fc', '#22d3ee', '#d7dae3'];
const ANSI_BRIGHT = ['#6b7088', '#f87171', '#4ade80', '#fde047', '#60a5fa', '#e879f9', '#67e8f9', '#ffffff'];
let ansi = { fg: null, bold: false };

function ansiToHtml(text) {
    let out = '';
    const parts = text.split(/\x1b\[([0-9;]*)m/);
    for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 1) {
            const codes = parts[i] === '' ? [0] : parts[i].split(';').map(Number);
            for (let j = 0; j < codes.length; j++) {
                const c = codes[j];
                if (c === 0) ansi = { fg: null, bold: false };
                else if (c === 1) ansi.bold = true;
                else if (c === 22) ansi.bold = false;
                else if (c >= 30 && c <= 37) ansi.fg = ANSI_COLORS[c - 30];
                else if (c >= 90 && c <= 97) ansi.fg = ANSI_BRIGHT[c - 90];
                else if (c === 39) ansi.fg = null;
                else if (c === 38 && codes[j + 1] === 2) { ansi.fg = `rgb(${codes[j + 2]},${codes[j + 3]},${codes[j + 4]})`; j += 4; }
                else if (c === 38 && codes[j + 1] === 5) { j += 2; }
            }
            continue;
        }
        // Strip other escape sequences (cursor movement etc.).
        const chunk = esc(parts[i].replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b[()][A-Z0-9]|\r/g, ''));
        if (!chunk) continue;
        const style = (ansi.fg ? `color:${ansi.fg};` : '') + (ansi.bold ? 'font-weight:600;' : '');
        out += style ? `<span style="${style}">${chunk}</span>` : chunk;
    }
    return out;
}

/** Color plain WARN/ERROR lines ("[12:00:00 WARN]:" Paper, "[Server thread/WARN]:" Vanilla) and stack traces. */
function colorizeLevels(text) {
    let inError = false;
    return text.split('\n').map((line) => {
        if (line.includes('\x1b[')) return line;
        if (/^\[[^\]]*[ /](ERROR|FATAL)\]/.test(line)) { inError = true; return `\x1b[91m${line}\x1b[0m`; }
        if (/^\[[^\]]*[ /]WARN\]/.test(line)) { inError = false; return `\x1b[93m${line}\x1b[0m`; }
        if (inError && /^(\s+at |Caused by|[\w.]+(Exception|Error)\b)/.test(line)) return `\x1b[91m${line}\x1b[0m`;
        if (/^\[/.test(line)) inError = false;
        return line;
    }).join('\n');
}

function appendConsole(text) {
    if (!text) return;
    const stick = consoleEl.scrollHeight - consoleEl.scrollTop - consoleEl.clientHeight < 40;
    pending += text;
    const lastNl = pending.lastIndexOf('\n');
    if (lastNl === -1) return;
    const complete = pending.slice(0, lastNl + 1);
    pending = pending.slice(lastNl + 1);
    consoleEl.insertAdjacentHTML('beforeend', ansiToHtml(colorizeLevels(complete)));
    // Cap the DOM size so long sessions stay fast.
    while (consoleEl.childNodes.length > 4000) consoleEl.firstChild.remove();
    if (stick) consoleEl.scrollTop = consoleEl.scrollHeight;
}

// ------------------------------------------------------------ charts
function makeChart(canvas, max, fmt) {
    const data = new Array(60).fill(0);
    const draw = () => {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth, h = canvas.clientHeight;
        canvas.width = w * dpr; canvas.height = h * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);
        const top = Math.max(max(), ...data) || 1;
        ctx.strokeStyle = '#34374f'; ctx.fillStyle = '#8a90a6'; ctx.font = '10px Rubik, sans-serif'; ctx.lineWidth = 1;
        for (let i = 0; i <= 2; i++) {
            const y = Math.round(8 + (h - 16) * i / 2) + .5;
            ctx.beginPath(); ctx.moveTo(48, y); ctx.lineTo(w, y); ctx.stroke();
            ctx.fillText(fmt(top * (1 - i / 2)), 0, y + 3);
        }
        const step = (w - 48) / (data.length - 1);
        const pts = data.map((v, i) => [48 + i * step, 8 + (h - 16) * (1 - v / top)]);
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(248,81,2,.35)'); grad.addColorStop(1, 'rgba(248,81,2,0)');
        ctx.beginPath(); ctx.moveTo(pts[0][0], h - 8);
        pts.forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.lineTo(pts[pts.length - 1][0], h - 8); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.strokeStyle = '#f85102'; ctx.lineWidth = 2; ctx.stroke();
    };
    window.addEventListener('resize', draw);
    return { push(v) { data.push(v); data.shift(); draw(); }, draw };
}

let memMax = 0, cpuMax = 100;
const memChart = makeChart($('#chart-mem'), () => memMax, (v) => bytes(v, 0));
const cpuChart = makeChart($('#chart-cpu'), () => Math.min(cpuMax, 100), (v) => Math.round(v) + '%');
memChart.draw(); cpuChart.draw();

// ------------------------------------------------------------ stats & power
function renderStats(s) {
    state = s.state;
    $('#st-dot').className = 'dot ' + s.state;
    $('#st-state').textContent = STATE_LABEL[s.state];
    $('#st-uptime').textContent = s.state === 'offline' ? '' : '· ' + duration(s.uptime);
    $('#st-cpu').textContent = s.cpu.toFixed(1) + '%';
    $('#st-cpu-max').textContent = '/ ' + s.cpu_max + '%';
    $('#st-mem').textContent = bytes(s.memory);
    $('#st-mem-max').textContent = '/ ' + bytes(s.memory_max, 0);
    $('#st-disk').textContent = bytes(s.disk);
    memMax = s.memory_max; cpuMax = s.cpu_max;
    memChart.push(s.memory); cpuChart.push(s.cpu);

    const on = s.state !== 'offline';
    $('[data-power=start]').disabled = on;
    $('[data-power=stop]').disabled = !on || s.state === 'stopping';
    $('[data-power=kill]').disabled = !on;
    $('#cmd').disabled = !on;
}

$$('[data-power]').forEach((b) => b.addEventListener('click', async () => {
    const signal = b.dataset.power;
    if (signal === 'kill' && !await confirmDialog('Forzar cierre', 'El proceso se terminará sin guardar el mundo. ¿Continuar?', 'Kill')) return;
    b.disabled = true;
    await attempt(() => api('power', { id: sid() }, { signal }));
    poll();
}));

// ------------------------------------------------------------ commands
const cmdHistory = JSON.parse(sessionStorage.getItem('hist-' + sid()) || '[]');
let histPos = cmdHistory.length;
$('#cmd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#cmd');
    const command = input.value.trim();
    if (!command) return;
    cmdHistory.push(command);
    if (cmdHistory.length > 50) cmdHistory.shift();
    try { sessionStorage.setItem('hist-' + sid(), JSON.stringify(cmdHistory)); } catch { /* private mode */ }
    histPos = cmdHistory.length;
    input.value = '';
    appendConsole(`\x1b[90m> ${command}\x1b[0m\n`);
    await attempt(() => api('command', { id: sid() }, { command }));
});
$('#cmd').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && histPos > 0) { e.target.value = cmdHistory[--histPos]; e.preventDefault(); }
    if (e.key === 'ArrowDown') { histPos = Math.min(cmdHistory.length, histPos + 1); e.target.value = cmdHistory[histPos] || ''; e.preventDefault(); }
});
$('#clear-console').onclick = () => { consoleEl.innerHTML = ''; };

// ------------------------------------------------------------ playit.gg
const PLAYIT_PHASE = {
    off: ['Desactivado', ''],
    claiming: ['Esperando vinculación', 'orange'],
    starting: ['Conectando...', 'orange'],
    online: ['Agente en línea', 'green'],
    error: ['Error', 'red'],
};
let lastPlayit = '';

function renderPlayit(p) {
    const sig = JSON.stringify(p);
    if (sig === lastPlayit) return;
    lastPlayit = sig;
    $('#playit-toggle').checked = p.enabled;
    $('#playit-toggle-label').textContent = p.enabled ? 'Activado' : 'Desactivado';
    const [label, color] = PLAYIT_PHASE[p.phase] || PLAYIT_PHASE.off;
    let html = `<div><span class="badge ${color}">${label}</span> ${p.claimed ? '<span class="badge">Vinculado</span>' : ''}</div>`;

    if (p.phase === 'claiming' && p.claim_url) {
        html += `<div class="claim-box">
            <b style="color:var(--white)">Paso 1:</b> abre este enlace e inicia sesión en playit.gg (o crea una cuenta gratis) para aprobar el agente:
            <div class="addr-box" style="margin-top:8px"><a href="${esc(p.claim_url)}" target="_blank" rel="noopener">${esc(p.claim_url)}</a>
            <button class="btn btn-sm" data-copy="${esc(p.claim_url)}"><i class="fa-regular fa-copy"></i></button></div>
            <div class="hint">El panel detecta la aprobación automáticamente (tienes 15 minutos).</div></div>`;
    } else if (p.phase === 'claiming') {
        html += '<p class="muted"><i class="fa-solid fa-spinner fa-spin"></i> Descargando el agente y generando el enlace...</p>';
    }

    const tunnels = p.tunnels || [];
    if (tunnels.length) {
        html += '<div class="hint" style="margin:0">Dirección pública para tus amigos:</div>';
        for (const t of tunnels) {
            html += `<div class="tunnel">
                <div class="addr-box"><i class="fa-solid fa-earth-americas" style="color:var(--accent)"></i><span>${esc(t.address)}</span>
                <button class="btn btn-sm" data-copy="${esc(t.address)}"><i class="fa-regular fa-copy"></i> Copiar</button></div>
                <div class="tunnel-meta"><i class="fa-solid fa-arrow-right-long"></i> ${esc(t.destination)}
                ${t.disabled ? `<span class="badge red">Desactivado${t.reason ? ': ' + esc(t.reason) : ''}</span>` : '<span class="badge green">Activo</span>'}</div>
                ${t.destination && t.destination !== p.local ? `<div class="hint" style="color:#fde047;margin:0"><i class="fa-solid fa-triangle-exclamation"></i> Este túnel apunta a ${esc(t.destination)}, pero el servidor usa ${esc(p.local)}. Cámbialo en playit.gg.</div>` : ''}
            </div>`;
        }
    } else if (p.phase === 'online' && p.pending) {
        html += '<p class="muted" style="margin:0"><i class="fa-solid fa-spinner fa-spin"></i> El túnel se está creando en playit.gg...</p>';
    } else if (p.phase === 'online') {
        html += `<div class="claim-box"><b style="color:var(--white)">Paso 2:</b> crea el túnel en
            <a href="https://playit.gg/account/tunnels" target="_blank" rel="noopener">playit.gg/account/tunnels</a>:
            tipo <b>Minecraft Java</b>, dirección local <code class="mono">${esc(p.local)}</code>.
            La dirección pública aparecerá aquí en unos segundos.</div>`;
    }
    if (p.phase === 'error' && p.message) html += `<div class="form-error" style="margin:0">${esc(p.message)}</div>`;
    if (p.claimed) html += '<div><button class="btn btn-sm btn-ghost" id="playit-reset"><i class="fa-solid fa-link-slash"></i> Desvincular agente</button></div>';

    $('#playit-status').innerHTML = html;
    const log = $('#playit-log');
    log.textContent = p.log || '—';
    log.scrollTop = log.scrollHeight;
}

$('#playit-status').addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copy]');
    if (copy) {
        await navigator.clipboard?.writeText(copy.dataset.copy).catch(() => {});
        toast('Copiado al portapapeles');
    }
    if (e.target.closest('#playit-reset')) {
        if (!await confirmDialog('Desvincular playit.gg', 'Se borrará la clave del agente y tendrás que vincularlo de nuevo. ¿Continuar?', 'Desvincular')) return;
        await attempt(() => api('playit.reset', { id: sid() }, {}), 'Agente desvinculado');
        lastPlayit = '';
        poll();
    }
});

$('#playit-toggle').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    e.target.disabled = true;
    const r = await attempt(() => api('playit.toggle', { id: sid() }, { enabled }), enabled ? 'playit.gg activado' : 'playit.gg desactivado');
    if (!r) e.target.checked = !enabled;
    e.target.disabled = false;
    lastPlayit = '';
    poll();
});

// ------------------------------------------------------------ polling
let polling = false, tick = 0;
async function poll() {
    if (polling) return;
    polling = true;
    try {
        const withPlayit = tick++ % 3 === 0 ? 1 : 0;
        const r = await api('poll', { id: sid(), offset, log: logId, playit: withPlayit });
        if (r.console.reset) { consoleEl.innerHTML = ''; pending = ''; } // first load or log rotated by a restart
        appendConsole(r.console.data);
        offset = r.console.offset;
        logId = r.console.id;
        renderStats(r.stats);
        if (r.playit) renderPlayit(r.playit);
    } catch (e) {
        console.warn(e);
    } finally {
        polling = false;
    }
}

poll();
setInterval(() => { if (!document.hidden) poll(); }, 1000);
