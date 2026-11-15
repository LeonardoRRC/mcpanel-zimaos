import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { navigate } from '../router';
import type { Meta, Server } from '../types';
import { useUI } from '../ui';

export function SettingsPage({ server, reload }: { server: Server; meta: Meta; reload: () => Promise<unknown> }) {
    const { attempt, prompt, toast } = useUI();
    const [f, setF] = useState({ name: server.name, description: server.description, port: server.port });
    const save = async (e: FormEvent) => {
        e.preventDefault();
        if (await attempt(() => api('server.update', { id: server.id }, { data: f }), 'Ajustes guardados')) void reload();
    };
    const remove = async () => {
        const typed = await prompt('Borrar servidor', `Escribe "${server.name}" para confirmar`, '', 'Borrar definitivamente');
        if (typed === null) return;
        if (typed !== server.name) return toast('El nombre no coincide', 'error');
        if (await attempt(() => api('server.delete', { id: server.id }, {}))) { await reload(); navigate('/'); }
    };
    const created = new Date((server.created ?? Date.now() / 1000) * 1000)
        .toLocaleString('es', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return <>
        <div className="page-head"><h1>Ajustes</h1></div>
        <div className="grid grid-2">
            <div className="card">
                <div className="card-head"><i className="fa-solid fa-pen" /> Detalles del servidor</div>
                <form className="card-body" onSubmit={save}>
                    <label className="field"><span>Nombre</span><input className="input dark" value={f.name} maxLength={40} required onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
                    <label className="field"><span>Descripción</span><input className="input dark" value={f.description} maxLength={120} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
                    <label className="field"><span>Puerto</span><input className="input dark" type="number" min={1} max={65535} required value={f.port} onChange={(e) => setF({ ...f, port: Number(e.target.value) })} /></label>
                    <p className="hint" style={{ marginTop: -6 }}>Se escribe en <code className="mono">server.properties</code> al iniciar. El contenedor usa red host, así que el puerto queda abierto en ZimaOS directamente.</p>
                    <button className="btn btn-primary" type="submit"><i className="fa-solid fa-floppy-disk" /> Guardar</button>
                </form>
            </div>
            <div className="card">
                <div className="card-head"><i className="fa-solid fa-circle-info" /> Información</div>
                <div className="card-body">
                    <p><span className="muted">Carpeta en ZimaOS:</span><br /><code className="mono">{server.dir}</code></p>
                    <p><span className="muted">Conexión en tu red local:</span><br /><code className="mono">{server.address}</code></p>
                    <p><span className="muted">Creado:</span> {created}</p>
                </div>
                <div className="card-head" style={{ background: '#b91c1c' }}><i className="fa-solid fa-triangle-exclamation" /> Zona peligrosa</div>
                <div className="card-body">
                    <p className="muted" style={{ marginTop: 0 }}>Borra el servidor, su mundo, plugins y la vinculación de playit.gg. No se puede deshacer. Las copias de seguridad se conservan y puedes restaurarlas en otro servidor desde Backups.</p>
                    <button className="btn btn-red" onClick={() => void remove()}><i className="fa-solid fa-trash" /> Borrar servidor</button>
                </div>
            </div>
        </div>
    </>;
}
