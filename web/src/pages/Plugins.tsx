import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { ago, bytes } from '../format';
import { linkProps } from '../router';
import type { Kind, Meta, Server } from '../types';
import { Modal, Switch, useUI } from '../ui';

type Hit = { id: string; slug: string; title: string; author: string; description: string; icon?: string; downloads: number; follows: number; updated?: string; categories: string[]; installed?: boolean };
type Installed = { file: string; enabled: boolean; size: number; title?: string; slug?: string; icon?: string; version?: string; update?: { version: string; version_id: string } };
type Version = { id: string; number: string; name: string; type: string; date: string; file?: { size: number }; deps?: number };

const compact = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 });
/** Icon (card placeholder / switch button) and noun for each kind. */
const KIND_ICON: Record<string, [string, string]> = { plugins: ['fa-plug', 'fa-plug'], mods: ['fa-cube', 'fa-cubes'], datapacks: ['fa-scroll', 'fa-scroll'] };
const KIND_NOUN: Record<string, string> = { plugins: 'plugin', mods: 'mod', datapacks: 'datapack' };

function Icon({ url, kind, sm }: { url?: string; kind: string; sm?: boolean }) {
    const cls = `mr-icon${sm ? ' sm' : ''}`;
    return url ? <img className={cls} src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />
        : <span className={`${cls} placeholder`}><i className={`fa-solid ${(KIND_ICON[kind] ?? KIND_ICON.plugins)[0]}`} /></span>;
}

const WHO_TAKES: Record<string, string> = {
    plugins: 'Cambia a Paper, Purpur, Spigot o Folia en',
    mods: 'Cambia a Fabric, Quilt, Forge o NeoForge en',
    datapacks: 'Los datapacks funcionan en cualquier servidor desde Minecraft 1.13 (no en proxies como Velocity). Cambia la versión en',
};
const KIND_TITLE: Record<string, string> = { plugins: 'Plugins', mods: 'Mods', datapacks: 'Datapacks' };

/** Plugins, mods or datapacks of a server: each kind is its own page. */
export function PluginsPage({ server, meta, kind }: { server: Server; meta: Meta; kind: string; reload: () => Promise<unknown> }) {
    if (!server.kinds[kind]) {
        return <>
            <div className="page-head"><h1>{KIND_TITLE[kind] ?? kind}</h1></div>
            <div className="card"><div className="empty">
                <i className={`fa-solid ${(KIND_ICON[kind] ?? KIND_ICON.plugins)[1]}`} />
                <b style={{ color: 'var(--white)' }}>{server.label || 'Este servidor'}</b> no carga {(KIND_TITLE[kind] ?? kind).toLowerCase()}.<br />
                {WHO_TAKES[kind]} <a {...linkProps(`/s/${encodeURIComponent(server.id)}/startup`)}>Startup</a>.
            </div></div>
        </>;
    }
    return <Mods key={kind} server={server} meta={meta} kind={kind} info={server.kinds[kind]} />;
}

function Mods({ server, meta, kind, info }: { server: Server; meta: Meta; kind: string; info: Kind }) {
    const { attempt, confirm, open, watchJob } = useUI();
    const noun = KIND_NOUN[kind] ?? 'plugin';
    const projectUrl = (slug: string) => `https://modrinth.com/${info.project_type}/${encodeURIComponent(slug)}`;
    const [tab, setTab] = useState<'browse' | 'installed'>('browse');

    // ------------------------------------------------------------ browse
    const [query, setQuery] = useState('');
    const [input, setInput] = useState('');
    const [sort, setSort] = useState('relevance');
    const [hits, setHits] = useState<Hit[] | null>(null);
    const [total, setTotal] = useState(0);
    const [gameVersion, setGameVersion] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const token = useRef(0);

    const search = useCallback(async (offset: number) => {
        const t = ++token.current;
        if (!offset) { setHits(null); setFailed(false); } else setLoadingMore(true);
        const r = await attempt(() => api<{ hits: Hit[]; total: number; game_version?: string }>('mods.search', { id: server.id, kind, q: query, sort, offset }));
        if (t !== token.current) return;
        setLoadingMore(false);
        if (!r) { if (!offset) { setFailed(true); setHits([]); } return; }
        setTotal(r.total);
        setGameVersion(r.game_version ?? null);
        setHits((h) => (offset ? [...(h ?? []), ...r.hits] : r.hits));
    }, [server.id, kind, query, sort, attempt]);
    useEffect(() => { void search(0); }, [search]);
    useEffect(() => {
        const t = setTimeout(() => setQuery(input.trim()), 350);
        return () => clearTimeout(t);
    }, [input]);

    // ------------------------------------------------------------ installed
    const [installed, setInstalled] = useState<Installed[] | null>(null);
    const loadInstalled = useCallback(async () => {
        const r = await attempt(() => api<{ files: Installed[] }>('mods.installed', { id: server.id, kind }));
        if (r) setInstalled(r.files);
    }, [server.id, kind, attempt]);
    useEffect(() => { setInstalled(null); void loadInstalled(); }, [loadInstalled]);
    const refreshAll = () => { void loadInstalled(); void search(0); };

    const update = async (f: Installed) => {
        const res = await attempt(() => api<{ job: string }>('mods.install', { id: server.id }, { kind, version: f.update!.version_id, deps: true, title: 'Actualizar ' + (f.title || f.file) }));
        return res ? watchJob(res.job, 'Actualizando ' + (f.title || f.file)) : false;
    };
    const updateAll = async () => {
        for (const f of (installed ?? []).filter((x) => x.update)) if (!await update(f)) break;
        refreshAll();
    };
    const toggle = async (f: Installed, on: boolean) => {
        await attempt(() => api('mods.toggle', { id: server.id }, { kind, file: f.file }), on ? 'Activado (reinicia el servidor)' : 'Desactivado (reinicia el servidor)');
        void loadInstalled();
    };
    const remove = async (f: Installed) => {
        if (!await confirm('Eliminar ' + noun, <>Se borrará <code>{f.file}</code> de la carpeta {info.dir}/. Sus archivos de configuración se conservan.</>, 'Eliminar')) return;
        if (await attempt(() => api('mods.delete', { id: server.id }, { kind, file: f.file }), 'Eliminado')) refreshAll();
    };

    const choose = (h: Hit) => open((close) => <InstallDialog server={server} kind={kind} info={info} noun={noun} hit={h} close={close} done={async (version, deps) => {
        const res = await attempt(() => api<{ job: string }>('mods.install', { id: server.id }, { kind, version, deps, title: 'Instalando ' + h.title }));
        if (res && await watchJob(res.job, 'Instalando ' + h.title)) refreshAll();
    }} />);

    const updates = (installed ?? []).filter((f) => f.update);
    const swLabel = server.label;

    return <>
        <div className="page-head"><h1>{info.label}</h1></div>

        <div className="tabs" role="tablist">
            <button type="button" className={`tab${tab === 'browse' ? ' active' : ''}`} role="tab" aria-selected={tab === 'browse'} onClick={() => setTab('browse')}><i className="fa-solid fa-compass" /> Explorar</button>
            <button type="button" className={`tab${tab === 'installed' ? ' active' : ''}`} role="tab" aria-selected={tab === 'installed'} onClick={() => setTab('installed')}>
                <i className="fa-solid fa-box-open" /> Instalados <span className={`badge${updates.length ? ' orange' : ''}`} title={updates.length ? `${updates.length} con actualización` : ''}>{installed ? installed.length : '…'}</span>
            </button>
            <div className="spacer" />
            <span className="muted small-note">Compatibles con <b>{swLabel}</b> · vía <a href="https://modrinth.com" target="_blank" rel="noopener">Modrinth</a></span>
        </div>

        {tab === 'browse' && <section>
            <form className="mr-toolbar" role="search" onSubmit={(e) => { e.preventDefault(); setQuery(input.trim()); }}>
                <div className="search-box">
                    <i className="fa-solid fa-magnifying-glass" />
                    <input className="input dark" type="search" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Buscar ${info.label.toLowerCase()} en Modrinth…`} autoComplete="off" aria-label="Buscar" />
                </div>
                <select className="input dark" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar por">
                    {Object.entries(meta.sorts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
            </form>
            <div className="mr-grid">
                {!hits ? <div className="muted mr-loading"><i className="fa-solid fa-spinner fa-spin" /> Buscando…</div>
                    : failed ? <div className="empty">No se pudo conectar con Modrinth.</div>
                    : !hits.length ? <div className="empty"><i className="fa-solid fa-magnifying-glass" />Sin resultados{gameVersion ? ' para ' + gameVersion : ''}.</div>
                    : hits.map((h) => (
                        <article className="mr-card" key={h.id}>
                            <Icon url={h.icon} kind={kind} />
                            <div className="mr-info">
                                <div className="mr-title"><a href={projectUrl(h.slug)} target="_blank" rel="noopener">{h.title}</a> <span className="muted">por {h.author}</span></div>
                                <p className="mr-desc">{h.description}</p>
                                <div className="mr-meta">
                                    <span title="Descargas"><i className="fa-solid fa-download" /> {compact.format(h.downloads)}</span>
                                    <span title="Seguidores"><i className="fa-solid fa-heart" /> {compact.format(h.follows)}</span>
                                    {h.updated && <span title="Última actualización"><i className="fa-solid fa-clock-rotate-left" /> {ago(h.updated)}</span>}
                                    {h.categories.slice(0, 3).map((c) => <span key={c} className="badge">{c}</span>)}
                                </div>
                            </div>
                            <div className="mr-action">
                                {h.installed
                                    ? <button type="button" className="btn btn-sm" onClick={() => choose(h)}><i className="fa-solid fa-check" /> Instalado</button>
                                    : <button type="button" className="btn btn-sm btn-primary" onClick={() => choose(h)}><i className="fa-solid fa-download" /> Instalar</button>}
                            </div>
                        </article>
                    ))}
            </div>
            {hits && hits.length < total && (
                <div className="mr-more"><button type="button" className="btn" disabled={loadingMore} onClick={() => void search(hits.length)}>Cargar más</button></div>
            )}
        </section>}

        {tab === 'installed' && <section>
            <div className="card">
                <div className="card-head"><i className="fa-solid fa-folder" /> Carpeta {info.dir}/
                    <div className="right">{updates.length > 1 && <button type="button" className="btn btn-sm btn-green" onClick={() => void updateAll()}><i className="fa-solid fa-arrows-rotate" /> Actualizar todo</button>}</div>
                </div>
                <table className="file-table">
                    <thead><tr><th>Nombre</th><th className="hide-sm">Versión</th><th className="hide-sm">Tamaño</th><th>Activo</th><th /></tr></thead>
                    <tbody>
                        {!installed ? <tr><td colSpan={5} className="muted">Cargando…</td></tr>
                            : !installed.length ? <tr><td colSpan={5}><div className="empty"><i className="fa-solid fa-box-open" />No hay {info.label.toLowerCase()} instalados.</div></td></tr>
                            : installed.map((f) => (
                                <tr key={f.file} className={f.enabled ? '' : 'disabled-row'}>
                                    <td><div className="mr-row-name"><Icon url={f.icon} kind={kind} sm /><div>
                                        {f.title ? <><a href={projectUrl(f.slug!)} target="_blank" rel="noopener">{f.title}</a><small>{f.file}</small></>
                                            : <><span>{f.file.replace(/\.disabled$/, '')}</span><small>No está en Modrinth</small></>}
                                    </div></div></td>
                                    <td className="num hide-sm">{f.version || '—'}{f.update && <><br /><span className="badge orange" title="Nueva versión">→ {f.update.version}</span></>}</td>
                                    <td className="num hide-sm">{bytes(f.size)}</td>
                                    <td><Switch checked={f.enabled} onChange={(v) => void toggle(f, v)} /></td>
                                    <td className="mr-row-actions">
                                        {f.update && <button type="button" className="btn btn-sm btn-green" title={`Actualizar a ${f.update.version}`} onClick={async () => { if (await update(f)) refreshAll(); }}>
                                            <i className="fa-solid fa-arrows-rotate" /><span className="hide-sm"> Actualizar</span></button>}{' '}
                                        <button type="button" className="btn btn-sm btn-ghost btn-icon" title="Eliminar" onClick={() => void remove(f)}><i className="fa-solid fa-trash" /></button>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
            <p className="hint">{kind === 'datapacks'
                ? <>Los datapacks se cargan al reiniciar el servidor o con <code className="mono">/reload</code>. Los que cambian la generación del mundo (como Terralith) solo afectan a zonas que aún no se han explorado.</>
                : 'Los cambios se aplican al reiniciar el servidor.'} Los archivos que no están en Modrinth aparecen con su nombre de archivo.</p>
        </section>}
    </>;
}

function InstallDialog({ server, kind, info, noun, hit, close, done }: {
    server: Server; kind: string; info: Kind; noun: string; hit: Hit; close: () => void; done: (version: string, deps: boolean) => void;
}) {
    const { attempt } = useUI();
    const [versions, setVersions] = useState<Version[] | null>(null);
    const [picked, setPicked] = useState('');
    const [deps, setDeps] = useState(true);
    useEffect(() => {
        void (async () => {
            const r = await attempt(() => api<{ versions: Version[] }>('mods.versions', { id: server.id, kind, project: hit.id }));
            if (!r) { close(); return; }
            setVersions(r.versions);
            const firstRelease = Math.max(0, r.versions.findIndex((v) => v.type === 'release'));
            setPicked(r.versions[firstRelease]?.id ?? '');
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const types: Record<string, string> = { release: 'green', beta: 'orange', alpha: 'red' };
    return (
        <Modal title={'Instalar ' + hit.title} onClose={close} footer={<>
            <button className="btn" onClick={close}>Cancelar</button>
            <button className="btn btn-primary" disabled={!picked} onClick={() => { close(); done(picked, deps); }}><i className="fa-solid fa-download" /> Instalar</button>
        </>}>
            {!versions ? <div className="muted"><i className="fa-solid fa-spinner fa-spin" /> Buscando versiones compatibles…</div>
                : !versions.length ? <div className="empty"><i className="fa-solid fa-ban" />Este {noun} no tiene versiones para tu servidor ({info.loaders.join(', ')}).</div>
                : <>
                    <div className="mr-versions">
                        {versions.slice(0, 40).map((v) => (
                            <label className="mr-version" key={v.id}>
                                <input type="radio" name="mr-version" checked={picked === v.id} onChange={() => setPicked(v.id)} />
                                <span className="mr-vname"><b>{v.number}</b><small>{v.name !== v.number ? v.name : ''}</small></span>
                                <span className={`badge ${types[v.type] || ''}`}>{v.type}</span>
                                <span className="muted hide-sm">{new Date(v.date).toLocaleDateString('es')}</span>
                                <span className="muted hide-sm">{v.file ? bytes(v.file.size) : ''}</span>
                                {v.deps ? <span className="muted" title="Dependencias requeridas"><i className="fa-solid fa-link" /> {v.deps}</span> : <span />}
                            </label>
                        ))}
                    </div>
                    <Switch checked={deps} onChange={setDeps} style={{ marginTop: 14 }}>Instalar también las dependencias requeridas</Switch>
                </>}
        </Modal>
    );
}
