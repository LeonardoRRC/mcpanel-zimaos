import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { SoftwareOptions, VersionSelect } from '../components/Software';
import type { Meta, Server } from '../types';
import { Switch, useUI } from '../ui';

type JavaVersion = { major: number; installed: boolean; version?: string };
type Build = { id: number; name: string; experimental?: boolean };
const VARS: [string, string][] = [['{{JAVA}}', 'Ruta de Java'], ['{{RAM_MIN}}', 'RAM mínima (MB)'], ['{{RAM_MAX}}', 'RAM máxima (MB)'], ['{{FLAGS}}', 'Flags JVM'], ['{{JAR}}', 'Archivo jar'], ['{{PORT}}', 'Puerto']];

export function StartupPage({ server, meta, reload }: { server: Server; meta: Meta; reload: () => Promise<unknown> }) {
    const { attempt, confirm, watchJob } = useUI();
    const pick = (s: Server) => ({
        startup: s.startup, java: s.java, ram_min: s.ram_min, ram_max: s.ram_max, flags_preset: s.flags_preset,
        jar: s.jar, custom_flags: s.custom_flags, eula: s.eula, auto_restart: s.auto_restart, autostart: s.autostart,
    });
    const [f, setF] = useState(() => pick(server));
    const [dirty, setDirty] = useState(false);
    const [preview, setPreview] = useState(server.preview);
    const set = (patch: Partial<typeof f>) => { setF((x) => ({ ...x, ...patch })); setDirty(true); };
    const startupRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!dirty) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const save = async (quiet = false) => {
        const r = await attempt(() => api<{ preview: string }>('server.update', { id: server.id }, { data: f }), quiet ? null : 'Startup guardado');
        if (r) { setPreview(r.preview); setDirty(false); void reload(); }
        return r;
    };

    const insertVar = (v: string) => {
        const ta = startupRef.current;
        const pos = ta?.selectionStart ?? f.startup.length;
        const end = ta?.selectionEnd ?? pos;
        set({ startup: f.startup.slice(0, pos) + v + f.startup.slice(end) });
        setTimeout(() => { ta?.focus(); ta?.setSelectionRange(pos + v.length, pos + v.length); });
    };

    // ------------------------------------------------------------ java
    const [javas, setJavas] = useState<JavaVersion[] | null>(null);
    const loadJava = useCallback(async () => {
        const r = await attempt(() => api<{ versions: JavaVersion[]; job: { id: string; title: string } | null }>('java.list'));
        if (!r) return;
        setJavas(r.versions);
        if (r.job) { await watchJob(r.job.id, r.job.title); void loadJava(); }
    }, [attempt, watchJob]);
    useEffect(() => { void loadJava(); }, [loadJava]);
    const installJava = async (major: number) => {
        const r = await attempt(() => api<{ job: string }>('java.install', {}, { major }));
        if (r) { await watchJob(r.job, 'Instalando Java ' + major); void loadJava(); }
    };

    // ------------------------------------------------------------ software
    const installed = server.software || { type: '', version: '' };
    const [swType, setSwType] = useState(String(installed.type || 'PAPER').toUpperCase());
    const [swVersion, setSwVersion] = useState('');
    const [snapshots, setSnapshots] = useState(false);
    const [builds, setBuilds] = useState<Build[] | null>(null);
    const [build, setBuild] = useState('');
    const sameType = swType === String(installed.type || '').toUpperCase();
    useEffect(() => {
        if (!swVersion) { setBuilds([]); setBuild(''); return; }
        let live = true;
        setBuilds(null);
        api<{ builds: Build[] }>('software.builds', { type: swType, version: swVersion }).then((r) => {
            if (!live) return;
            setBuilds(r.builds);
            const cur = sameType && swVersion === installed.version ? installed.build_id : null;
            setBuild(String(r.builds.find((b) => b.id === cur)?.id ?? r.builds[0]?.id ?? ''));
        }, () => { if (live) { setBuilds([]); setBuild(''); } });
        return () => { live = false; };
    }, [swType, swVersion]); // eslint-disable-line react-hooks/exhaustive-deps

    const typeInfo = meta.types.find((t) => t.id === swType);
    const install = async () => {
        if (!swVersion) return;
        const b = builds?.find((x) => String(x.id) === build);
        const ok = await confirm('Instalar versión',
            <>Se descargará <b>{typeInfo?.name ?? swType} {swVersion} {b?.name ?? ''}</b> y reemplazará <code>{f.jar}</code>. ¿Continuar?</>, 'Instalar', false);
        if (!ok) return;
        if (dirty && !await save(true)) return;
        const r = await attempt(() => api<{ job: string }>('software.install', { id: server.id }, { type: swType, version: swVersion, build: Number(build) || null }));
        if (r && await watchJob(r.job, 'Instalando servidor')) {
            setDirty(false);
            const list = await reload() as Server[] | null;
            const fresh = list?.find((s) => s.id === server.id);
            if (fresh) { setF(pick(fresh)); setPreview(fresh.preview); }
            void loadJava();
        }
    };

    return <>
        <div className="page-head">
            <h1>Startup</h1>
            <div className="actions"><button className="btn btn-primary" onClick={() => void save()} disabled={!dirty}><i className="fa-solid fa-floppy-disk" /> Guardar cambios</button></div>
        </div>

        <div className="grid" style={{ gap: 18 }}>
            <div className="card">
                <div className="card-head"><i className="fa-solid fa-terminal" /> Comando de inicio
                    <div className="right"><button type="button" className="btn btn-sm" style={{ background: 'rgba(0,0,0,.2)', borderColor: 'transparent' }} onClick={() => set({ startup: meta.default_startup })}>Restablecer</button></div>
                </div>
                <div className="card-body">
                    <textarea ref={startupRef} className="input dark" rows={2} spellCheck={false} value={f.startup} onChange={(e) => set({ startup: e.target.value })} aria-label="Comando de inicio" />
                    <div className="var-list" title="Clic para insertar">
                        {VARS.map(([v, desc]) => <code key={v} title={desc} onClick={() => insertVar(v)}>{v}</code>)}
                    </div>
                    <div className="hint" style={{ marginTop: 14 }}>Vista previa del comando final{dirty ? ' (se actualiza al guardar)' : ''}:</div>
                    <div className="preview">{preview}</div>
                </div>
            </div>

            <div className="grid grid-2">
                <div className="card">
                    <div className="card-head"><i className="fa-brands fa-java" /> Versión de Java</div>
                    <div className="card-body">
                        <div className="java-list">
                            {!javas ? <span className="muted">Cargando...</span> : javas.map((v) => (
                                <div key={v.major} className={`java-item${v.major === f.java ? ' selected' : ''}`} tabIndex={0} role="button"
                                    onClick={() => set({ java: v.major })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set({ java: v.major }); } }}>
                                    <b>Java {v.major}</b>
                                    <div className="small">{v.installed ? <><span className="badge green">Instalado</span> {v.version || ''}</> : <span className="badge">No instalado</span>}</div>
                                    {!v.installed && (
                                        <button type="button" className="btn btn-sm" style={{ marginTop: 8, width: '100%' }} onClick={(e) => { e.stopPropagation(); void installJava(v.major); }}>
                                            <i className="fa-solid fa-download" /> Instalar</button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <p className="hint">Eclipse Temurin JRE. Minecraft 1.17–1.20.4 usa Java 17, 1.20.5–1.21 usa Java 21 y 26.x usa Java 25. Las versiones antiguas (≤1.16) usan Java 8 u 11.</p>
                    </div>
                </div>

                <div className="card">
                    <div className="card-head"><i className="fa-solid fa-memory" /> Memoria y JVM</div>
                    <div className="card-body">
                        <div className="row">
                            <label className="field"><span>RAM mínima (MB)</span><input className="input dark" type="number" min={128} step={128} value={f.ram_min} onChange={(e) => set({ ram_min: Number(e.target.value) })} /></label>
                            <label className="field"><span>RAM máxima (MB)</span><input className="input dark" type="number" min={256} step={256} value={f.ram_max} onChange={(e) => set({ ram_max: Number(e.target.value) })} /></label>
                        </div>
                        <div className="row">
                            <label className="field"><span>Flags</span>
                                <select className="input dark" value={f.flags_preset} onChange={(e) => set({ flags_preset: e.target.value })}>
                                    <option value="aikar">Aikar's flags (recomendado)</option>
                                    <option value="none">Ninguno</option>
                                </select>
                            </label>
                            <label className="field"><span>Archivo jar</span><input className="input dark" value={f.jar} onChange={(e) => set({ jar: e.target.value })} /></label>
                        </div>
                        <label className="field" style={{ margin: 0 }}><span>Flags adicionales</span>
                            <input className="input dark mono" value={f.custom_flags} placeholder="-Dfile.encoding=UTF-8" onChange={(e) => set({ custom_flags: e.target.value })} /></label>
                    </div>
                </div>
            </div>

            <div className="grid grid-2">
                <div className="card">
                    <div className="card-head"><i className="fa-solid fa-cube" /> Software del servidor</div>
                    <div className="card-body">
                        <p className="muted" style={{ marginTop: 0 }}>Instalado: <b style={{ color: 'var(--white)' }}>{installed.build ?? server.label ?? '—'}</b></p>
                        <div className="row">
                            <label className="field"><span>Tipo</span>
                                <select className="input dark" value={swType} onChange={(e) => setSwType(e.target.value)}><SoftwareOptions meta={meta} /></select>
                            </label>
                            <label className="field"><span>Versión</span>
                                <VersionSelect type={swType} value={swVersion} snapshots={snapshots} current={sameType ? installed.version : null} onChange={setSwVersion} />
                            </label>
                        </div>
                        <div className="row">
                            <label className="field"><span>Build</span>
                                <select className="input dark" value={build} disabled={!builds} onChange={(e) => setBuild(e.target.value)}>
                                    {!builds ? <option value="">Cargando...</option> : !builds.length ? <option value="">{swVersion ? 'Última' : '—'}</option>
                                        : builds.map((b, i) => <option key={b.id} value={b.id}>{b.name}{i === 0 ? ' (última)' : ''}{b.experimental ? ' · experimental' : ''}</option>)}
                                </select>
                            </label>
                            <Switch checked={snapshots} onChange={setSnapshots} style={{ alignSelf: 'end', marginBottom: 22 }}>Snapshots</Switch>
                        </div>
                        <p className="hint" style={{ marginTop: -6 }}>{typeInfo?.description}</p>
                        <button type="button" className="btn btn-primary" disabled={!swVersion} onClick={() => void install()}><i className="fa-solid fa-download" /> Instalar / cambiar versión</button>
                        <p className="hint">Versiones de <a href="https://mcjars.app" target="_blank" rel="noopener">MCJars</a>. Reemplaza <code className="mono">{f.jar}</code> y selecciona la versión de Java adecuada. Tus mundos y plugins no se tocan; haz una copia antes de bajar de versión.</p>
                    </div>
                </div>

                <div className="card">
                    <div className="card-head"><i className="fa-solid fa-sliders" /> Opciones</div>
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <label className="switch"><input type="checkbox" checked={f.eula} onChange={(e) => set({ eula: e.target.checked })} /><span className="track" />
                            <span>Acepto el <a href="https://www.minecraft.net/eula" target="_blank" rel="noopener">EULA de Minecraft</a></span></label>
                        <Switch checked={f.auto_restart} onChange={(v) => set({ auto_restart: v })}>Reiniciar automáticamente si el servidor se cae</Switch>
                        <Switch checked={f.autostart} onChange={(v) => set({ autostart: v })}>Iniciar al encender ZimaOS / reiniciar el contenedor</Switch>
                    </div>
                </div>
            </div>
        </div>
    </>;
}
