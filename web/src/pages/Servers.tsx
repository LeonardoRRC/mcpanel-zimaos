import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { SoftwareOptions, VersionSelect } from '../components/Software';
import { STATE_LABEL } from '../format';
import { linkProps, navigate } from '../router';
import type { Meta, Server } from '../types';
import { Modal, Switch, useUI } from '../ui';

export function ServersPage({ servers, meta, reload }: { servers: Server[]; meta: Meta; reload: () => Promise<Server[] | null> }) {
    const { open } = useUI();
    const create = () => open((close) => <CreateServer meta={meta} port={25565 + servers.length} close={close} reload={reload} />);
    return <>
        <div className="page-head">
            <h1>Mis servidores</h1>
            <div className="actions"><button className="btn btn-primary" onClick={create}><i className="fa-solid fa-plus" /> Crear servidor</button></div>
        </div>
        {!servers.length && (
            <div className="card"><div className="empty">
                <i className="fa-solid fa-cube" />
                <h2>Aún no tienes servidores</h2>
                <p>Crea tu primer servidor de Minecraft: elige el software y la versión, y el panel descarga todo por ti.</p>
                <button className="btn btn-primary" onClick={create}><i className="fa-solid fa-plus" /> Crear servidor</button>
            </div></div>
        )}
        <div>
            {servers.map((s) => (
                <a key={s.id} className={`server-row ${s.state}`} {...linkProps(`/s/${encodeURIComponent(s.id)}`)}>
                    <span className="icon"><i className="fa-solid fa-cube" /></span>
                    <span>
                        <span className="name">{s.name}</span><br />
                        <span className="muted">{s.description || s.label}</span>
                    </span>
                    <span className="meta">
                        <span><i className="fa-solid fa-network-wired" />{s.address}</span>
                        <span><i className="fa-solid fa-memory" />{Math.round((s.ram_max / 1024) * 10) / 10} GB</span>
                        <span className="state-label"><span className={`dot ${s.state}`} /> {STATE_LABEL[s.state]}</span>
                        <span className="mono">{s.id}</span>
                    </span>
                </a>
            ))}
        </div>
    </>;
}

function CreateServer({ meta, port, close, reload }: { meta: Meta; port: number; close: () => void; reload: () => Promise<unknown> }) {
    const { attempt, watchJob } = useUI();
    const [f, setF] = useState({ name: 'Mi servidor', description: '', type: 'PAPER', version: '', port, ram_max: 4096, eula: false });
    const [snapshots, setSnapshots] = useState(false);
    const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
    const submit = async (e?: FormEvent) => {
        e?.preventDefault();
        const form = document.getElementById('new-server') as HTMLFormElement;
        if (!form.reportValidity()) return;
        const r = await attempt(() => api<{ id: string; job: string | null }>('server.create', {}, f));
        if (!r) return;
        close();
        if (r.job) await watchJob(r.job, 'Instalando servidor');
        await reload();
        navigate(`/s/${encodeURIComponent(r.id)}`);
    };
    return (
        <Modal title="Crear servidor" onClose={close} footer={<>
            <button className="btn" onClick={close}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => void submit()}><i className="fa-solid fa-plus" /> Crear</button>
        </>}>
            <form id="new-server" onSubmit={submit}>
                <label className="field"><span>Nombre</span><input className="input dark" value={f.name} maxLength={40} required onChange={(e) => set({ name: e.target.value })} /></label>
                <label className="field"><span>Descripción (opcional)</span><input className="input dark" value={f.description} maxLength={120} onChange={(e) => set({ description: e.target.value })} /></label>
                <div className="row">
                    <label className="field"><span>Software</span>
                        <select className="input dark" value={f.type} onChange={(e) => set({ type: e.target.value })}><SoftwareOptions meta={meta} /></select>
                    </label>
                    <label className="field"><span>Versión</span>
                        <VersionSelect type={f.type} value={f.version} snapshots={snapshots} onChange={(version) => set({ version })} />
                    </label>
                </div>
                <Switch checked={snapshots} onChange={setSnapshots} style={{ marginBottom: 14 }}>Mostrar snapshots y versiones de prueba</Switch>
                <div className="row">
                    <label className="field"><span>Puerto</span><input className="input dark" type="number" min={1} max={65535} required value={f.port} onChange={(e) => set({ port: Number(e.target.value) })} /></label>
                    <label className="field"><span>RAM máxima (MB)</span><input className="input dark" type="number" min={512} step={256} required value={f.ram_max} onChange={(e) => set({ ram_max: Number(e.target.value) })} /></label>
                </div>
                <label className="switch">
                    <input type="checkbox" required checked={f.eula} onChange={(e) => set({ eula: e.target.checked })} /><span className="track" />
                    <span>Acepto el <a href="https://www.minecraft.net/eula" target="_blank" rel="noopener">EULA de Minecraft</a></span>
                </label>
                <p className="hint">Se descargará el servidor y la versión de Java que necesite automáticamente.</p>
            </form>
        </Modal>
    );
}
