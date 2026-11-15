import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent as RMouseEvent } from 'react';
import { api, apiUrl, upload } from '../api';
import { Editor } from '../components/Editor';
import { bytes, fmtFileDate } from '../format';
import { navigate, useLocation } from '../router';
import type { Meta, Server } from '../types';
import { Modal, useUI } from '../ui';

type Item = { name: string; dir: boolean; size: number; mtime: number; editable?: boolean; archive?: boolean };
type FileWithPath = File & { relPath?: string };

const join = (dir: string, name: string) => (dir ? dir + '/' : '') + name;
const baseName = (path: string) => path.split('/').pop()!;

function iconFor(it: Item): string {
    if (it.dir) return 'fa-solid fa-folder';
    if (it.archive) return 'fa-solid fa-file-zipper';
    if (/\.jar$/i.test(it.name)) return 'fa-brands fa-java';
    if (/\.(ya?ml|json|properties|toml|conf|cfg|txt|md|log|sh|ini)$/i.test(it.name)) return 'fa-solid fa-file-lines';
    if (/\.(png|jpe?g|gif|webp)$/i.test(it.name)) return 'fa-solid fa-file-image';
    return 'fa-solid fa-file';
}

function Crumbs({ path, go }: { path: string; go: (p: string) => void }) {
    let acc = '';
    return (
        <div className="crumbs">
            <a href="#" onClick={(e) => { e.preventDefault(); go(''); }} aria-label="Inicio"><i className="fa-solid fa-house" /></a>
            {(path ? path.split('/') : []).map((p) => {
                acc = join(acc, p);
                const to = acc;
                return <span key={to} style={{ display: 'contents' }}><span className="sep">/</span><a href="#" onClick={(e) => { e.preventDefault(); go(to); }}>{p}</a></span>;
            })}
        </div>
    );
}

export function FilesPage({ server }: { server: Server; meta: Meta; reload: () => Promise<unknown> }) {
    const { attempt, confirm, open, prompt, toast } = useUI();
    const { query } = useLocation();
    const cwd = query.get('path') || '';
    const [items, setItems] = useState<Item[] | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [menu, setMenu] = useState<{ path: string; x: number; y: number; below: boolean } | null>(null);
    const [drag, setDrag] = useState(false);
    const id = server.id;

    const load = useCallback(async (path = cwd) => {
        const r = await attempt(() => api<{ path: string; items: Item[] }>('files.list', { id, path }));
        if (!r) return;
        setItems(r.items);
        setSelected(new Set());
        if (r.path !== cwd) navigate(`/s/${encodeURIComponent(id)}/files${r.path ? '?path=' + encodeURIComponent(r.path) : ''}`, true);
    }, [id, cwd, attempt]);
    useEffect(() => { void load(cwd); }, [cwd]); // eslint-disable-line react-hooks/exhaustive-deps
    const go = (path: string) => navigate(`/s/${encodeURIComponent(id)}/files${path ? '?path=' + encodeURIComponent(path) : ''}`);

    const itemByPath = (path: string) => items?.find((i) => join(cwd, i.name) === path);
    const act = async <T,>(action: string, body: object, ok?: string | null) => {
        const r = await attempt(() => api<T>(action, { id }, body), ok);
        if (r) void load();
        return r;
    };

    // ------------------------------------------------------------ actions
    const openEditor = async (path: string) => {
        const r = await attempt(() => api<{ content: string }>('files.read', { id, path }));
        if (!r) return;
        let get = () => r.content;
        open((close) => {
            const save = async () => { await attempt(() => api('files.write', { id }, { path, content: get() }), 'Guardado ' + baseName(path)); void load(); };
            return (
                <Modal wide title={'/' + path} onClose={close} footer={<>
                    <button className="btn" onClick={close}>Cerrar</button>
                    <button className="btn btn-primary" onClick={() => void save()}><i className="fa-solid fa-floppy-disk" /> Guardar</button>
                </>}>
                    <Editor path={path} initial={r.content} onReady={(g) => { get = g; }} onSave={() => void save()} />
                </Modal>
            );
        });
    };
    const download = (path: string) => { location.href = apiUrl('files.download', { id, path }); };
    const remove = async (paths: string[]) => {
        const what = paths.length === 1 ? <b>{baseName(paths[0])}</b> : `${paths.length} elementos`;
        if (await confirm('Borrar', <>¿Borrar {what}? No se puede deshacer.</>, 'Borrar')) void act('files.delete', { paths }, 'Borrado');
    };
    const extract = async (path: string, folder: boolean) => {
        const r = await act<{ dest: string }>('files.extract', { path, folder }, null);
        if (r) toast(folder ? `Descomprimido en /${r.dest}` : 'Descomprimido');
    };
    const compress = (paths: string[]) => open((close) => <CompressDialog paths={paths} cwd={cwd} close={close} go={async (name, format) => {
        const r = await act<{ name: string }>('files.compress', { paths, path: cwd, name, format });
        if (r) toast('Creado ' + r.name);
    }} />);
    const transfer = (paths: string[], mode: 'move' | 'copy') => open((close) => {
        const isMove = mode === 'move';
        return <FolderPicker server={server} start={cwd} exclude={isMove ? paths : []} title={isMove ? 'Mover a...' : 'Copiar a...'} ok={isMove ? 'Mover aquí' : 'Copiar aquí'}
            close={close} pick={(dest) => {
                if (isMove && dest === cwd) { toast('Ya está en esa carpeta', 'error'); return; }
                void act(isMove ? 'files.move' : 'files.copy', { paths, dest }, isMove ? 'Movido a /' + dest : 'Copiado a /' + dest);
            }} />;
    });
    const rowAction = async (action: string, path: string) => {
        const it = itemByPath(path);
        if (!it) return;
        switch (action) {
            case 'open': return it.dir ? go(path) : it.editable ? openEditor(path) : download(path);
            case 'download': return download(path);
            case 'rename': {
                const n = await prompt('Renombrar', 'Nuevo nombre', it.name, 'Renombrar');
                if (n && n !== it.name) void act('files.rename', { path, name: n }, 'Renombrado');
                return;
            }
            case 'extract': return extract(path, false);
            case 'extract-folder': return extract(path, true);
            case 'compress': return compress([path]);
            case 'move': return transfer([path], 'move');
            case 'copy': return transfer([path], 'copy');
            case 'delete': return remove([path]);
        }
    };

    const newFolder = async () => {
        const name = await prompt('Nueva carpeta', 'Nombre', '', 'Crear');
        if (name) void act('files.mkdir', { path: cwd, name }, 'Carpeta creada');
    };
    const newFile = async () => {
        const name = await prompt('Nuevo archivo', 'Nombre', '', 'Crear');
        if (!name) return;
        const r = await act<{ path: string }>('files.create', { path: cwd, name });
        if (r) void openEditor(r.path);
    };

    // ------------------------------------------------------------ upload
    const fileInput = useRef<HTMLInputElement>(null);
    const doUpload = (files: FileWithPath[]) => {
        if (!files.length) return;
        open((close) => <UploadDialog files={files} close={close} run={(progress) => {
            const fd = new FormData();
            fd.append('path', cwd);
            // relPath / webkitRelativePath keep the folder structure of dropped folders.
            files.forEach((f) => fd.append('files[]', f, f.relPath || f.webkitRelativePath || f.name));
            return upload('files.upload', { id }, fd, progress).then(
                (r) => { toast(`${r.count} archivo(s) subido(s)`); void load(); },
                (e: Error) => { toast(e.message, 'error'); void load(); },
            );
        }} />);
    };
    useEffect(() => {
        let depth = 0;
        const enter = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) { depth++; setDrag(true); } };
        const leave = () => { if (--depth <= 0) { depth = 0; setDrag(false); } };
        const over = (e: DragEvent) => e.preventDefault();
        const drop = async (e: DragEvent) => {
            e.preventDefault();
            depth = 0;
            setDrag(false);
            const dt = e.dataTransfer;
            if (!dt) return;
            const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
            const files = entries.length ? (await Promise.all(entries.map((en) => collect(en)))).flat() : [...dt.files];
            doUpload(files);
        };
        document.addEventListener('dragenter', enter);
        document.addEventListener('dragleave', leave);
        document.addEventListener('dragover', over);
        document.addEventListener('drop', drop);
        return () => {
            document.removeEventListener('dragenter', enter);
            document.removeEventListener('dragleave', leave);
            document.removeEventListener('dragover', over);
            document.removeEventListener('drop', drop);
        };
    }); // re-bound each render so drops go to the current folder

    // ------------------------------------------------------------ keyboard
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // The target can be the document itself (nothing focused), which has no closest().
            if ((e.target as HTMLElement).closest?.('input, textarea, select, .modal-back, .ace_editor')) return;
            if (e.key === 'Delete' && selected.size) { e.preventDefault(); void remove([...selected]); }
            if (e.key === 'Escape') { setMenu(null); if (selected.size) setSelected(new Set()); }
            if (e.key === 'F2' && selected.size === 1) { e.preventDefault(); void rowAction('rename', [...selected][0]); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    });

    // ------------------------------------------------------------ row menu
    const openMenu = (path: string, e: RMouseEvent, fromButton: boolean) => {
        if (fromButton && menu?.path === path) { setMenu(null); return; }
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setMenu(fromButton ? { path, x: r.right, y: r.bottom + 4, below: true } : { path, x: e.clientX, y: e.clientY, below: false });
    };
    useEffect(() => {
        if (!menu) return;
        const close = (e: Event) => { if (!(e.target as HTMLElement).closest?.('[data-row-menu], #row-menu')) setMenu(null); };
        const closeAll = () => setMenu(null);
        document.addEventListener('click', close);
        document.addEventListener('scroll', closeAll, true);
        window.addEventListener('resize', closeAll);
        return () => { document.removeEventListener('click', close); document.removeEventListener('scroll', closeAll, true); window.removeEventListener('resize', closeAll); };
    }, [menu]);

    const toggle = (path: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(path); else n.delete(path); return n; });
    const all = !!items?.length && selected.size === items.length;

    return <>
        <div className="page-head">
            <h1>Archivos</h1>
            <div className="actions">
                <button className="btn" onClick={() => void newFolder()}><i className="fa-solid fa-folder-plus" /> Carpeta</button>
                <button className="btn" onClick={() => void newFile()}><i className="fa-solid fa-file-circle-plus" /> Archivo</button>
                <button className="btn btn-primary" onClick={() => fileInput.current?.click()}><i className="fa-solid fa-upload" /> Subir</button>
                <input ref={fileInput} type="file" multiple hidden onChange={(e) => { doUpload([...(e.target.files ?? [])]); e.target.value = ''; }} />
            </div>
        </div>

        <div className="card">
            <div className="card-head dark">
                <Crumbs path={cwd} go={go} />
                {selected.size > 0 && (
                    <div className="right">
                        <span>{selected.size} seleccionado(s)</span>
                        <button className="btn btn-sm" onClick={() => transfer([...selected], 'move')}><i className="fa-solid fa-arrow-right-arrow-left" /> Mover</button>
                        <button className="btn btn-sm" onClick={() => transfer([...selected], 'copy')}><i className="fa-solid fa-copy" /> Copiar</button>
                        <button className="btn btn-sm" onClick={() => compress([...selected])}><i className="fa-solid fa-file-zipper" /> Comprimir</button>
                        <button className="btn btn-sm btn-red" onClick={() => void remove([...selected])}><i className="fa-solid fa-trash" /> Borrar</button>
                    </div>
                )}
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table className="file-table">
                    <thead><tr>
                        <th className="check"><input type="checkbox" checked={all} aria-label="Seleccionar todo"
                            onChange={(e) => setSelected(e.target.checked ? new Set((items ?? []).map((i) => join(cwd, i.name))) : new Set())} /></th>
                        <th>Nombre</th><th className="hide-sm">Tamaño</th><th className="hide-sm">Modificado</th><th />
                    </tr></thead>
                    <tbody>
                        {cwd && <tr><td /><td colSpan={4}><span className="fname" onClick={() => go(cwd.split('/').slice(0, -1).join('/'))}><i className="fa-solid fa-turn-up" /> ..</span></td></tr>}
                        {!items ? <tr><td colSpan={5} className="muted">Cargando...</td></tr>
                            : !items.length ? <tr><td /><td colSpan={4} className="muted">Carpeta vacía</td></tr>
                            : items.map((it) => {
                                const path = join(cwd, it.name);
                                const sel = selected.has(path);
                                return (
                                    <tr key={path} className={sel ? 'selected' : ''} onContextMenu={(e) => { e.preventDefault(); openMenu(path, e, false); }}>
                                        <td className="check"><input type="checkbox" checked={sel} aria-label="Seleccionar" onChange={(e) => toggle(path, e.target.checked)} /></td>
                                        <td><span className="fname" onClick={() => void rowAction('open', path)}><i className={iconFor(it)} />{it.name}</span></td>
                                        <td className="num hide-sm">{it.dir ? '' : bytes(it.size)}</td>
                                        <td className="num hide-sm">{fmtFileDate(it.mtime)}</td>
                                        <td className="row-actions"><button className="btn btn-sm btn-ghost" data-row-menu aria-label="Acciones" onClick={(e) => openMenu(path, e, true)}><i className="fa-solid fa-ellipsis" /></button></td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>
        </div>
        <p className="hint">Arrastra archivos o carpetas sobre la página para subirlos. Usa el botón <i className="fa-solid fa-ellipsis" /> o clic derecho sobre un elemento para renombrar, mover, copiar, comprimir, descomprimir o borrar. Atajos: <kbd>Supr</kbd> borra la selección, <kbd>F2</kbd> renombra, <kbd>Esc</kbd> limpia la selección.</p>
        <div className={`dropzone${drag ? ' show' : ''}`}><div><i className="fa-solid fa-cloud-arrow-up" /> Suelta para subir</div></div>
        {menu && itemByPath(menu.path) && <RowMenu at={menu} item={itemByPath(menu.path)!} run={(a) => { setMenu(null); void rowAction(a, menu.path); }} />}
    </>;
}

function RowMenu({ at, item, run }: { at: { x: number; y: number; below: boolean }; item: Item; run: (action: string) => void }) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ left: -9999, top: -9999 });
    useLayoutEffect(() => {
        const el = ref.current!;
        const w = el.offsetWidth, h = el.offsetHeight;
        const x = at.below ? at.x - w : at.x;
        const top = at.y + h > innerHeight - 8 ? at.y - h - (at.below ? 36 : 0) : at.y;
        setPos({ left: Math.max(8, Math.min(x, innerWidth - w - 8)), top: Math.max(8, top) });
    }, [at]);
    const entries: ([string, string, string, boolean?] | null)[] = [
        ['open', item.dir ? 'fa-folder-open' : 'fa-arrow-up-right-from-square', item.dir ? 'Abrir' : item.editable ? 'Editar' : 'Descargar'],
        null,
        ['rename', 'fa-i-cursor', 'Renombrar'],
        ['move', 'fa-arrow-right-arrow-left', 'Mover...'],
        ['copy', 'fa-copy', 'Copiar...'],
        null,
        ['download', 'fa-download', item.dir ? 'Descargar (.tar.gz)' : 'Descargar'],
        ['compress', 'fa-file-zipper', 'Comprimir...'],
        ...(item.archive ? [['extract', 'fa-box-open', 'Descomprimir aquí'], ['extract-folder', 'fa-folder-plus', 'Descomprimir en carpeta']] as [string, string, string][] : []),
        null,
        ['delete', 'fa-trash', 'Borrar', true],
    ];
    return (
        <div className="menu open" id="row-menu" ref={ref} style={{ position: 'fixed', ...pos }} role="menu">
            {entries.map((e, i) => e === null ? <div key={i} className="menu-sep" />
                : <button key={e[0]} role="menuitem" className={e[3] ? 'danger' : ''} onClick={() => run(e[0])}><i className={`fa-solid ${e[1]}`} />{e[2]}</button>)}
        </div>
    );
}

function CompressDialog({ paths, cwd, close, go }: { paths: string[]; cwd: string; close: () => void; go: (name: string, format: string) => void }) {
    const [name, setName] = useState(paths.length === 1 ? baseName(paths[0]).replace(/\.(zip|tar\.gz|tgz)$/i, '') : 'archivo');
    const [format, setFormat] = useState('zip');
    const submit = (e?: FormEvent) => { e?.preventDefault(); if (!name.trim()) return; close(); go(name.trim(), format); };
    return (
        <Modal title="Comprimir" onClose={close} footer={<>
            <button className="btn" onClick={close}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => submit()}><i className="fa-solid fa-file-zipper" /> Comprimir</button>
        </>}>
            <form onSubmit={submit}>
                <label className="field"><span>Nombre del archivo</span><input className="input dark" value={name} required onChange={(e) => setName(e.target.value)} /></label>
                <label className="field" style={{ margin: 0 }}><span>Formato</span>
                    <select className="input dark" value={format} onChange={(e) => setFormat(e.target.value)}>
                        <option value="zip">.zip (compatible con Windows)</option>
                        <option value="tar.gz">.tar.gz (más rápido, conserva permisos)</option>
                    </select></label>
                <p className="hint">{paths.length} elemento(s) de /{cwd}</p>
            </form>
        </Modal>
    );
}

/** Browses the server's folders; picks a relative path. */
function FolderPicker({ server, start, exclude, title, ok, close, pick }: {
    server: Server; start: string; exclude: string[]; title: string; ok: string; close: () => void; pick: (dest: string) => void;
}) {
    const { attempt } = useUI();
    const [current, setCurrent] = useState(start);
    const [dirs, setDirs] = useState<string[] | null>(null);
    const show = useCallback(async (path: string) => {
        const r = await attempt(() => api<{ path: string; items: Item[] }>('files.list', { id: server.id, path }));
        if (!r) return;
        setCurrent(r.path);
        setDirs(r.items.filter((i) => i.dir && !exclude.includes(join(r.path, i.name))).map((i) => i.name));
    }, [server.id, attempt, exclude]);
    useEffect(() => { void show(start); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <Modal title={title} onClose={close} footer={<>
            <button className="btn" onClick={close}>Cancelar</button>
            {/* Moving into the folder the items already live in does nothing. */}
            <button className="btn btn-primary" disabled={exclude.includes(current)} onClick={() => { close(); pick(current); }}><i className="fa-solid fa-check" /> {ok}</button>
        </>}>
            <div style={{ marginBottom: 10 }}><Crumbs path={current} go={(p) => void show(p)} /></div>
            <div className="folder-list">
                {!dirs ? <p className="muted" style={{ margin: '6px 2px' }}>Cargando…</p>
                    : dirs.length ? dirs.map((d) => <button key={d} type="button" className="folder-item" onClick={() => void show(join(current, d))}><i className="fa-solid fa-folder" />{d}</button>)
                    : <p className="muted" style={{ margin: '6px 2px' }}>Sin subcarpetas</p>}
            </div>
        </Modal>
    );
}

function UploadDialog({ files, close, run }: { files: File[]; close: () => void; run: (progress: (loaded: number, total: number) => void) => Promise<void> }) {
    const [p, setP] = useState({ loaded: 0, total: files.reduce((s, f) => s + f.size, 0) });
    useEffect(() => {
        void run((loaded, total) => setP({ loaded, total: total || p.total })).finally(close);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const pct = p.total ? Math.round((p.loaded / p.total) * 100) : 0;
    return (
        <Modal title={`Subiendo ${files.length} archivo(s)`} onClose={() => undefined}>
            <div className="progress"><div style={{ width: pct + '%' }} /></div>
            <div className="hint">{pct}% · {bytes(p.loaded)} / {bytes(p.total)}</div>
        </Modal>
    );
}

/** Read dropped folders recursively, keeping relative paths. */
async function collect(entry: FileSystemEntry, prefix = ''): Promise<FileWithPath[]> {
    if (entry.isFile) {
        return new Promise((res) => (entry as FileSystemFileEntry).file((f) => { (f as FileWithPath).relPath = prefix + f.name; res([f]); }, () => res([])));
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const all: FileSystemEntry[] = [];
    for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res) => reader.readEntries(res, () => res([])));
        if (!batch.length) break;
        all.push(...batch);
    }
    const nested = await Promise.all(all.map((e) => collect(e, prefix + entry.name + '/')));
    return nested.flat();
}
