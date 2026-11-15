import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api } from '../api';
import { AnsiRenderer, colorizeLevels } from '../components/ansi';
import { Chart } from '../components/Chart';
import { bytes, duration } from '../format';
import type { Meta, Server } from '../types';
import { Switch, useUI } from '../ui';

const STATE_LABEL: Record<string, string> = { running: 'En línea', starting: 'Iniciando...', stopping: 'Deteniendo...', offline: 'Apagado' };
type Stats = { state: Server['state']; uptime: number; cpu: number; cpu_max: number; memory: number; memory_max: number; disk: number | null };
type Tunnel = { address: string; destination: string; disabled?: boolean; reason?: string };
type Playit = {
    enabled: boolean; phase: string; claimed: boolean; claim_url?: string; tunnels?: Tunnel[];
    pending?: boolean; local: string; message?: string; log?: string;
};
type Poll = { stats: Stats; console: { data: string; offset: number; id: number; reset?: boolean }; playit: Playit | null };

const fmtMem = (v: number) => bytes(v, 0);
const fmtPct = (v: number) => Math.round(v) + '%';

export function ConsolePage({ server }: { server: Server; meta: Meta; reload: () => Promise<unknown> }) {
    const { attempt, confirm, toast } = useUI();
    const consoleRef = useRef<HTMLPreElement>(null);
    const cursor = useRef({ offset: -1, log: 0, pending: '', tick: 0, busy: false });
    const ansi = useRef(new AnsiRenderer());
    const [stats, setStats] = useState<Stats | null>(null);
    const [mem, setMem] = useState<number[]>(() => new Array(60).fill(0));
    const [cpu, setCpu] = useState<number[]>(() => new Array(60).fill(0));
    const [playit, setPlayit] = useState<Playit | null>(null);
    const [command, setCommand] = useState('');
    const [busyPower, setBusyPower] = useState<string | null>(null);
    const [busyPlayit, setBusyPlayit] = useState(false);
    const histKey = 'hist-' + server.id;
    const history = useRef<string[]>((() => { try { return JSON.parse(sessionStorage.getItem(histKey) || '[]'); } catch { return []; } })());
    const histPos = useRef(history.current.length);

    const append = useCallback((text: string) => {
        const el = consoleRef.current;
        if (!el || !text) return;
        const c = cursor.current;
        const stick = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        c.pending += text;
        const lastNl = c.pending.lastIndexOf('\n');
        if (lastNl === -1) return;
        const complete = c.pending.slice(0, lastNl + 1);
        c.pending = c.pending.slice(lastNl + 1);
        el.insertAdjacentHTML('beforeend', ansi.current.toHtml(colorizeLevels(complete)));
        while (el.childNodes.length > 4000) el.firstChild!.remove(); // long sessions stay fast
        if (stick) el.scrollTop = el.scrollHeight;
    }, []);

    const poll = useCallback(async () => {
        const c = cursor.current;
        if (c.busy) return;
        c.busy = true;
        try {
            const r = await api<Poll>('poll', { id: server.id, offset: c.offset, log: c.log, playit: c.tick++ % 3 === 0 ? 1 : 0 });
            if (r.console.reset && consoleRef.current) { consoleRef.current.innerHTML = ''; c.pending = ''; ansi.current.reset(); }
            append(r.console.data);
            c.offset = r.console.offset;
            c.log = r.console.id;
            setStats(r.stats);
            setMem((d) => [...d.slice(1), r.stats.memory]);
            setCpu((d) => [...d.slice(1), r.stats.cpu]);
            if (r.playit) setPlayit(r.playit);
        } catch (e) {
            console.warn(e);
        } finally {
            c.busy = false;
        }
    }, [server.id, append]);

    useEffect(() => {
        void poll();
        const t = setInterval(() => { if (!document.hidden) void poll(); }, 1000);
        return () => clearInterval(t);
    }, [poll]);

    const power = async (signal: string) => {
        if (signal === 'kill' && !await confirm('Forzar cierre', 'El proceso se terminará sin guardar el mundo. ¿Continuar?', 'Kill')) return;
        setBusyPower(signal);
        await attempt(() => api('power', { id: server.id }, { signal }));
        setBusyPower(null);
        void poll();
    };

    const send = async (e: FormEvent) => {
        e.preventDefault();
        const cmd = command.trim();
        if (!cmd) return;
        history.current.push(cmd);
        if (history.current.length > 50) history.current.shift();
        try { sessionStorage.setItem(histKey, JSON.stringify(history.current)); } catch { /* private mode */ }
        histPos.current = history.current.length;
        setCommand('');
        append(`\x1b[90m> ${cmd}\x1b[0m\n`);
        await attempt(() => api('command', { id: server.id }, { command: cmd }));
    };
    const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
        const h = history.current;
        if (e.key === 'ArrowUp' && histPos.current > 0) { setCommand(h[--histPos.current]); e.preventDefault(); }
        if (e.key === 'ArrowDown') { histPos.current = Math.min(h.length, histPos.current + 1); setCommand(h[histPos.current] || ''); e.preventDefault(); }
    };

    const togglePlayit = async (enabled: boolean) => {
        setBusyPlayit(true);
        await attempt(() => api('playit.toggle', { id: server.id }, { enabled }), enabled ? 'playit.gg activado' : 'playit.gg desactivado');
        setBusyPlayit(false);
        cursor.current.tick = 0; // fetch playit status on the next poll
        void poll();
    };
    const resetPlayit = async () => {
        if (!await confirm('Desvincular playit.gg', 'Se borrará la clave del agente y tendrás que vincularlo de nuevo. ¿Continuar?', 'Desvincular')) return;
        await attempt(() => api('playit.reset', { id: server.id }, {}), 'Agente desvinculado');
        cursor.current.tick = 0;
        void poll();
    };
    const copy = async (text: string) => {
        await navigator.clipboard?.writeText(text).catch(() => undefined);
        toast('Copiado al portapapeles');
    };

    const state = stats?.state ?? server.state;
    const on = state !== 'offline';
    const playitOn = playit?.enabled ?? server.playit;

    return <>
        <div className="page-head">
            <h1>{server.name}</h1>
            <span className="badge orange">{server.label}</span>
            <div className="actions power">
                <button className="btn btn-green" disabled={on || !!busyPower} onClick={() => void power('start')}><i className="fa-solid fa-play" /> Iniciar</button>
                <button className="btn btn-primary" disabled={!!busyPower} onClick={() => void power('restart')}><i className="fa-solid fa-rotate-right" /> Reiniciar</button>
                <button className="btn btn-red" disabled={!on || state === 'stopping' || !!busyPower} onClick={() => void power('stop')}><i className="fa-solid fa-stop" /> Detener</button>
                <button className="btn" disabled={!on || !!busyPower} onClick={() => void power('kill')} title="Forzar cierre"><i className="fa-solid fa-skull" /> Kill</button>
            </div>
        </div>

        <div className="grid grid-3" style={{ marginBottom: 18 }}>
            <div className="card"><div className="card-head"><i className="fa-solid fa-signal" /> Estado</div>
                <div className="card-body stat-value"><span className={`dot ${state}`} /><span>{stats ? STATE_LABEL[state] : 'Cargando...'}</span> <small>{stats && on ? '· ' + duration(stats.uptime) : ''}</small></div></div>
            <div className="card"><div className="card-head"><i className="fa-solid fa-network-wired" /> Dirección IP</div>
                <div className="card-body stat-value"><span className="mono">{server.address}</span></div></div>
            <div className="card"><div className="card-head"><i className="fa-solid fa-fingerprint" /> ID del servidor</div>
                <div className="card-body stat-value"><span className="mono">{server.id.toUpperCase()}</span></div></div>
            <div className="card"><div className="card-head"><i className="fa-solid fa-microchip" /> CPU</div>
                <div className="card-body stat-value"><span>{(stats?.cpu ?? 0).toFixed(1)}%</span><small>{stats ? `/ ${stats.cpu_max}%` : ''}</small></div></div>
            <div className="card"><div className="card-head"><i className="fa-solid fa-memory" /> RAM</div>
                <div className="card-body stat-value"><span>{bytes(stats?.memory ?? 0)}</span><small>{stats ? '/ ' + bytes(stats.memory_max, 0) : ''}</small></div></div>
            <div className="card"><div className="card-head"><i className="fa-solid fa-hard-drive" /> Almacenamiento</div>
                <div className="card-body stat-value"><span>{stats ? bytes(stats.disk) : '—'}</span></div></div>
        </div>

        <div className="console-wrap" style={{ marginBottom: 18 }}>
            <pre className="console" ref={consoleRef} aria-live="polite" />
            <form className="console-input" onSubmit={send} autoComplete="off">
                <span className="prompt">$</span>
                <input value={command} onChange={(e) => setCommand(e.target.value)} onKeyDown={onKey} disabled={!on}
                    placeholder="Escribe un comando... (↑/↓ historial)" spellCheck={false} aria-label="Comando" />
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { if (consoleRef.current) consoleRef.current.innerHTML = ''; }}>Limpiar</button>
                <button type="submit" className="btn btn-sm btn-primary" aria-label="Enviar"><i className="fa-solid fa-paper-plane" /></button>
            </form>
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head">
                <i className="fa-solid fa-globe" /> playit.gg · Acceso desde internet
                <div className="right">
                    <Switch checked={playitOn} disabled={busyPlayit} onChange={(v) => void togglePlayit(v)}>{playitOn ? 'Activado' : 'Desactivado'}</Switch>
                </div>
            </div>
            <div className="card-body playit-body">
                <div className="playit-status">
                    {playit ? <PlayitStatus p={playit} copy={copy} reset={resetPlayit} /> : (
                        <p className="muted">Expone tu servidor a internet sin abrir puertos del router. Al activarlo por primera vez te daremos un enlace para vincularlo con tu cuenta gratuita de playit.gg.</p>
                    )}
                </div>
                <div>
                    <div className="hint" style={{ margin: '0 0 6px' }}>Registro del agente</div>
                    <PlayitLog text={playit?.log || '—'} />
                </div>
            </div>
        </div>

        <div className="grid grid-2">
            <div className="card"><div className="card-head"><i className="fa-solid fa-memory" /> Uso de memoria</div>
                <div className="card-body chart"><Chart data={mem} max={stats?.memory_max ?? 0} fmt={fmtMem} /></div></div>
            <div className="card"><div className="card-head"><i className="fa-solid fa-microchip" /> Uso de CPU</div>
                <div className="card-body chart"><Chart data={cpu} max={Math.min(stats?.cpu_max ?? 100, 100)} fmt={fmtPct} /></div></div>
        </div>
    </>;
}

function PlayitLog({ text }: { text: string }) {
    const ref = useRef<HTMLPreElement>(null);
    useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [text]);
    return <pre className="mini-log" ref={ref}>{text}</pre>;
}

const PHASE: Record<string, [string, string]> = {
    off: ['Desactivado', ''],
    claiming: ['Esperando vinculación', 'orange'],
    starting: ['Conectando...', 'orange'],
    online: ['Agente en línea', 'green'],
    error: ['Error', 'red'],
};

function PlayitStatus({ p, copy, reset }: { p: Playit; copy: (t: string) => void; reset: () => void }) {
    const [label, color] = PHASE[p.phase] || PHASE.off;
    const tunnels = p.tunnels || [];
    return <>
        <div><span className={`badge ${color}`}>{label}</span> {p.claimed && <span className="badge">Vinculado</span>}</div>
        {p.phase === 'claiming' && p.claim_url && (
            <div className="claim-box">
                <b style={{ color: 'var(--white)' }}>Paso 1:</b> abre este enlace e inicia sesión en playit.gg (o crea una cuenta gratis) para aprobar el agente:
                <div className="addr-box" style={{ marginTop: 8 }}>
                    <a href={p.claim_url} target="_blank" rel="noopener">{p.claim_url}</a>
                    <button className="btn btn-sm" onClick={() => copy(p.claim_url!)} aria-label="Copiar"><i className="fa-regular fa-copy" /></button>
                </div>
                <div className="hint">El panel detecta la aprobación automáticamente (tienes 15 minutos).</div>
            </div>
        )}
        {p.phase === 'claiming' && !p.claim_url && <p className="muted"><i className="fa-solid fa-spinner fa-spin" /> Descargando el agente y generando el enlace...</p>}
        {tunnels.length > 0 && <>
            <div className="hint" style={{ margin: 0 }}>Dirección pública para tus amigos:</div>
            {tunnels.map((t, i) => (
                <div className="tunnel" key={i}>
                    <div className="addr-box"><i className="fa-solid fa-earth-americas" style={{ color: 'var(--accent)' }} /><span>{t.address}</span>
                        <button className="btn btn-sm" onClick={() => copy(t.address)}><i className="fa-regular fa-copy" /> Copiar</button></div>
                    <div className="tunnel-meta"><i className="fa-solid fa-arrow-right-long" /> {t.destination}
                        {t.disabled ? <span className="badge red">Desactivado{t.reason ? ': ' + t.reason : ''}</span> : <span className="badge green">Activo</span>}</div>
                    {t.destination && t.destination !== p.local && (
                        <div className="hint" style={{ color: '#fde047', margin: 0 }}><i className="fa-solid fa-triangle-exclamation" /> Este túnel apunta a {t.destination}, pero el servidor usa {p.local}. Cámbialo en playit.gg.</div>
                    )}
                </div>
            ))}
        </>}
        {!tunnels.length && p.phase === 'online' && p.pending && <p className="muted" style={{ margin: 0 }}><i className="fa-solid fa-spinner fa-spin" /> El túnel se está creando en playit.gg...</p>}
        {!tunnels.length && p.phase === 'online' && !p.pending && (
            <div className="claim-box"><b style={{ color: 'var(--white)' }}>Paso 2:</b> crea el túnel en{' '}
                <a href="https://playit.gg/account/tunnels" target="_blank" rel="noopener">playit.gg/account/tunnels</a>:
                tipo <b>Minecraft Java</b>, dirección local <code className="mono">{p.local}</code>.
                La dirección pública aparecerá aquí en unos segundos.</div>
        )}
        {p.phase === 'error' && p.message && <div className="form-error" style={{ margin: 0 }}>{p.message}</div>}
        {p.claimed && <div><button className="btn btn-sm btn-ghost" onClick={reset}><i className="fa-solid fa-link-slash" /> Desvincular agente</button></div>}
    </>;
}
