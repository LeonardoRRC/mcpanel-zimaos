import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, apiUrl } from '../api';
import { bytes, fmtDate } from '../format';
import type { Meta, Server } from '../types';
import { Modal, useUI } from '../ui';

type Backup = { id: string; name: string; created: number; size: number; auto?: boolean; locked?: boolean; server_name?: string };
type List = {
    backups: Backup[]; orphans: { server: string; name: string; backups: Backup[] }[];
    settings: Server['backup']; usage: { dir: string; used: number; free: number; total: number };
    running: boolean; job: { id: string; title: string } | null;
};

export function BackupsPage({ server, meta }: { server: Server; meta: Meta; reload: () => Promise<unknown> }) {
    const { attempt, confirm, open, toast, watchJob } = useUI();
    const [data, setData] = useState<List | null>(null);
    const [settings, setSettings] = useState({ interval: server.backup.interval, keep: server.backup.keep, ignore: server.backup.ignore });

    const load = useCallback(async (): Promise<void> => {
        const r = await attempt(() => api<List>('backups.list', { id: server.id }));
        if (!r) return;
        setData(r);
        if (r.job) { await watchJob(r.job.id, r.job.title); return load(); }
    }, [server.id, attempt, watchJob]);
    useEffect(() => { void load(); }, [load]);

    const create = () => open((close) => <CreateBackup running={!!data?.running} close={close} go={async (name) => {
        const r = await attempt(() => api<{ job: string }>('backups.create', { id: server.id }, { name }));
        if (r) { await watchJob(r.job, 'Creando copia de seguridad'); void load(); }
    }} />);

    const restore = (b: Backup, from: string) => open((close) => <RestoreBackup b={b} other={from !== server.id} running={!!data?.running} close={close} go={async (wipe, safety) => {
        if (data?.running) {
            if (!await attempt(() => api('power', { id: server.id }, { signal: 'stop' }))) return;
            toast('Deteniendo el servidor…');
            for (let i = 0; i < 60; i++) {
                await new Promise((r) => setTimeout(r, 1000));
                const list = await api<Server[]>('servers').catch(() => []);
                if (list.find((s) => s.id === server.id)?.state === 'offline') break;
            }
        }
        const r = await attempt(() => api<{ job: string }>('backups.restore', { id: server.id }, { from, backup: b.id, wipe, safety }));
        if (r) { await watchJob(r.job, 'Restaurando copia de seguridad'); void load(); }
    }} />);

    const lock = async (b: Backup, from: string) => {
        if (await attempt(() => api('backups.lock', { id: server.id }, { from, backup: b.id, locked: !b.locked }), b.locked ? 'Copia desbloqueada' : 'Copia bloqueada')) void load();
    };
    const remove = async (b: Backup, from: string) => {
        if (!await confirm('Eliminar copia', <>Se borrará <b>{b.name}</b> ({bytes(b.size)}) del {fmtDate(b.created)}. No se puede deshacer.</>, 'Eliminar')) return;
        if (await attempt(() => api('backups.delete', { id: server.id }, { from, backup: b.id }), 'Copia eliminada')) void load();
    };

    const saveSettings = async (e: FormEvent) => {
        e.preventDefault();
        const r = await attempt(() => api<{ settings: Server['backup'] }>('backups.settings', { id: server.id }, settings), 'Ajustes de copias guardados');
        if (r) setSettings({ ...settings, keep: r.settings.keep });
    };

    const row = (b: Backup, from: string, serverName?: string) => (
        <tr key={from + b.id}>
            <td><div className="backup-name"><i className="fa-solid fa-file-zipper" /><div><b>{b.name}</b>{' '}
                {b.auto && <span className="badge">automática</span>}{' '}
                {b.locked && <span className="badge orange"><i className="fa-solid fa-lock" /> bloqueada</span>}{' '}
                {serverName && <span className="badge">{serverName}</span>}
                <small className="show-sm">{fmtDate(b.created)} · {bytes(b.size)}</small></div></div></td>
            <td className="num hide-sm">{fmtDate(b.created)}</td>
            <td className="num hide-sm">{bytes(b.size)}</td>
            <td className="mr-row-actions">
                <button type="button" className="btn btn-sm btn-green" title="Restaurar" onClick={() => restore(b, from)}><i className="fa-solid fa-clock-rotate-left" /><span className="hide-sm"> Restaurar</span></button>{' '}
                <a className="btn btn-sm btn-ghost btn-icon" title="Descargar" href={apiUrl('backups.download', { id: server.id, from, backup: b.id })}><i className="fa-solid fa-download" /></a>{' '}
                <button type="button" className="btn btn-sm btn-ghost btn-icon" title={b.locked ? 'Desbloquear' : 'Bloquear (no se borra sola ni por error)'} onClick={() => void lock(b, from)}><i className={`fa-solid ${b.locked ? 'fa-lock' : 'fa-lock-open'}`} /></button>{' '}
                <button type="button" className="btn btn-sm btn-ghost btn-icon" title="Eliminar" disabled={b.locked} onClick={() => void remove(b, from)}><i className="fa-solid fa-trash" /></button>
            </td>
        </tr>
    );

    const u = data?.usage;
    const pct = u?.total ? Math.round((1 - u.free / u.total) * 100) : null;
    const orphanRows = data ? data.orphans.flatMap((o) => o.backups.map((b) => row(b, o.server, o.name))) : [];

    return <>
        <div className="page-head">
            <h1>Backups</h1>
            <div className="actions"><button className="btn btn-primary" onClick={create}><i className="fa-solid fa-plus" /> Crear copia</button></div>
        </div>

        <div className="card">
            <div className="card-head"><i className="fa-solid fa-box-archive" /> Copias de seguridad
                <div className="right"><span className="badge">{data ? data.backups.length : '…'}</span></div>
            </div>
            <table className="file-table">
                <thead><tr><th>Nombre</th><th className="hide-sm">Fecha</th><th className="hide-sm">Tamaño</th><th /></tr></thead>
                <tbody>
                    {!data ? <tr><td colSpan={4} className="muted">Cargando…</td></tr>
                        : data.backups.length ? data.backups.map((b) => row(b, server.id))
                        : <tr><td colSpan={4}><div className="empty"><i className="fa-solid fa-box-archive" />Todavía no hay copias. Crea la primera con «Crear copia».</div></td></tr>}
                </tbody>
            </table>
        </div>

        <div className="grid grid-2" style={{ marginTop: 18 }}>
            <div className="card">
                <div className="card-head"><i className="fa-solid fa-clock-rotate-left" /> Copias automáticas</div>
                <form className="card-body" onSubmit={saveSettings}>
                    <div className="row">
                        <label className="field"><span>Frecuencia</span>
                            <select className="input dark" value={settings.interval} onChange={(e) => setSettings({ ...settings, interval: Number(e.target.value) })}>
                                {Object.entries(meta.intervals).map(([h, label]) => <option key={h} value={h}>{label}</option>)}
                            </select>
                        </label>
                        <label className="field"><span>Conservar las últimas</span><input className="input dark" type="number" min={1} max={100} value={settings.keep} onChange={(e) => setSettings({ ...settings, keep: Number(e.target.value) })} /></label>
                    </div>
                    <label className="field"><span>Excluir (una ruta o patrón por línea)</span>
                        <textarea className="input dark mono" rows={4} spellCheck={false} placeholder={'logs\ncache\n*.log\nplugins/dynmap/web'} value={settings.ignore} onChange={(e) => setSettings({ ...settings, ignore: e.target.value })} />
                    </label>
                    <p className="hint" style={{ marginTop: -6 }}>Las copias automáticas más antiguas se borran al superar el límite. Las manuales y las bloqueadas (<i className="fa-solid fa-lock" />) nunca se borran solas. Las exclusiones aplican a todas las copias.</p>
                    <button className="btn btn-primary" type="submit"><i className="fa-solid fa-floppy-disk" /> Guardar</button>
                </form>
            </div>

            <div className="card">
                <div className="card-head"><i className="fa-solid fa-hard-drive" /> Almacenamiento</div>
                <div className="card-body">
                    {!u ? <span className="muted">Cargando…</span> : <>
                        <p style={{ marginTop: 0 }}><span className="muted">Carpeta de copias:</span><br /><code className="mono">{u.dir}</code></p>
                        <p><span className="muted">Ocupado por copias:</span> <b style={{ color: 'var(--white)' }}>{bytes(u.used)}</b></p>
                        {pct !== null && <>
                            <p style={{ marginBottom: 6 }}><span className="muted">Disco:</span> {bytes(u.free)} libres de {bytes(u.total)}</p>
                            <div className="progress"><div style={{ width: pct + '%', background: pct > 90 ? 'var(--red)' : undefined }} /></div>
                        </>}
                        <p className="hint">Las copias se guardan fuera de la carpeta del servidor: siguen aquí aunque borres sus archivos o el servidor entero. Para protegerte también de un fallo del disco, apunta <code className="mono">BACKUP_DIR</code> a otro disco o descarga las copias importantes.</p>
                    </>}
                </div>
            </div>
        </div>

        {orphanRows.length > 0 && (
            <div className="card" style={{ marginTop: 18 }}>
                <div className="card-head"><i className="fa-solid fa-life-ring" /> Copias de servidores eliminados</div>
                <div className="card-body" style={{ paddingBottom: 4 }}><p className="hint" style={{ margin: 0 }}>Estas copias pertenecen a servidores que ya no existen. Puedes restaurarlas en este servidor.</p></div>
                <table className="file-table">
                    <thead><tr><th>Nombre</th><th className="hide-sm">Fecha</th><th className="hide-sm">Tamaño</th><th /></tr></thead>
                    <tbody>{orphanRows}</tbody>
                </table>
            </div>
        )}
    </>;
}

function CreateBackup({ running, close, go }: { running: boolean; close: () => void; go: (name: string) => void }) {
    const [name, setName] = useState('');
    const submit = (e?: FormEvent) => { e?.preventDefault(); close(); go(name.trim()); };
    return (
        <Modal title="Crear copia de seguridad" onClose={close} footer={<>
            <button className="btn" onClick={close}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => submit()}><i className="fa-solid fa-box-archive" /> Crear</button>
        </>}>
            <form onSubmit={submit}>
                <label className="field"><span>Nombre (opcional)</span>
                    <input className="input dark" maxLength={60} value={name} onChange={(e) => setName(e.target.value)}
                        placeholder={'Copia ' + new Date().toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })} /></label>
                <p className="hint">{running
                    ? <><i className="fa-solid fa-circle-info" /> El servidor está encendido: se guardará el mundo y se pausará el autoguardado mientras se copia. Los jugadores pueden seguir conectados.</>
                    : 'Se comprimirá toda la carpeta del servidor (menos las exclusiones).'}</p>
            </form>
        </Modal>
    );
}

function RestoreBackup({ b, other, running, close, go }: { b: Backup; other: boolean; running: boolean; close: () => void; go: (wipe: boolean, safety: boolean) => void }) {
    const [wipe, setWipe] = useState(true);
    const [safety, setSafety] = useState(true);
    return (
        <Modal title="Restaurar copia" onClose={close} footer={<>
            <button className="btn" onClick={close}>Cancelar</button>
            <button className="btn btn-green" onClick={() => { close(); go(wipe, safety); }}><i className="fa-solid fa-clock-rotate-left" /> Restaurar</button>
        </>}>
            <p style={{ marginTop: 0 }}>Restaurar <b>{b.name}</b> del {fmtDate(b.created)}{other && <> (de <b>{b.server_name}</b>)</>}.</p>
            {running && <div className="form-error" style={{ marginBottom: 14 }}><i className="fa-solid fa-triangle-exclamation" /> El servidor está encendido. Se detendrá antes de restaurar.</div>}
            <label className="switch" style={{ marginBottom: 12 }}><input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} /><span className="track" /><span>Borrar los archivos actuales antes de restaurar</span></label>
            <label className="switch"><input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} /><span className="track" /><span>Crear antes una copia del estado actual</span></label>
            <p className="hint">Si desactivas el borrado, los archivos de la copia se escriben encima de los actuales y los archivos nuevos se conservan.</p>
        </Modal>
    );
}
