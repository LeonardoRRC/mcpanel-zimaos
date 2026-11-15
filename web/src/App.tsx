import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, setCsrf } from './api';
import { Logo } from './components/Logo';
import { linkProps, navigate, useLocation } from './router';
import type { Meta, Server, Session } from './types';
import { useUI } from './ui';
import { AuthPage } from './pages/Auth';
import { ServersPage } from './pages/Servers';
import { AccountPage } from './pages/Account';
import { ConsolePage } from './pages/Console';
import { FilesPage } from './pages/Files';
import { PluginsPage } from './pages/Plugins';
import { BackupsPage } from './pages/Backups';
import { StartupPage } from './pages/Startup';
import { SettingsPage } from './pages/Settings';

const SERVER_PAGES: [string, string, string][] = [
    ['console', 'Consola', 'fa-terminal'],
    ['files', 'Archivos', 'fa-folder'],
    ['plugins', 'Plugins', 'fa-plug'],
    ['mods', 'Mods', 'fa-cubes'],
    ['datapacks', 'Datapacks', 'fa-scroll'],
    ['backups', 'Backups', 'fa-box-archive'],
    ['startup', 'Startup', 'fa-rocket'],
    ['settings', 'Ajustes', 'fa-gear'],
];
/** Modrinth pages: shown only when the server can load that kind. */
const KIND_PAGES = ['plugins', 'mods', 'datapacks'];
const ACCOUNT_PAGES: [string, string, string][] = [
    ['servers', 'Mis servidores', 'fa-server'],
    ['account', 'Cuenta', 'fa-user'],
];

export function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const s = await api<Session>('session');
            setCsrf(s.csrf);
            setSession(s);
            document.title = s.name;
        } catch (e) {
            setError((e as Error).message);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        const onExpired = () => void load();
        window.addEventListener('mcpanel:expired', onExpired);
        return () => window.removeEventListener('mcpanel:expired', onExpired);
    }, [load]);

    if (!session) return <div className="auth-page"><div className="muted">{error || 'Cargando…'}</div></div>;
    if (session.setup || !session.user) return <AuthPage session={session} onDone={load} />;
    return <Shell session={session} onLogout={load} />;
}

function Shell({ session, onLogout }: { session: Session; onLogout: () => void }) {
    const { attempt } = useUI();
    const { path } = useLocation();
    const [servers, setServers] = useState<Server[] | null>(null);
    const [meta, setMeta] = useState<Meta | null>(null);
    const [sidebar, setSidebar] = useState(false);
    const [switcher, setSwitcher] = useState(false);
    const [clock, setClock] = useState('');

    const reload = useCallback(async () => {
        const list = await api<Server[]>('servers').catch(() => null);
        if (list) setServers(list);
        return list;
    }, []);
    useEffect(() => {
        void reload();
        api<Meta>('meta').then(setMeta, () => undefined);
        const t = setInterval(() => { if (!document.hidden) void reload(); }, 5000);
        return () => clearInterval(t);
    }, [reload]);
    useEffect(() => {
        const tick = () => setClock(new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }));
        tick();
        const t = setInterval(tick, 10000);
        return () => clearInterval(t);
    }, []);
    useEffect(() => { setSidebar(false); setSwitcher(false); }, [path]);
    const switchRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!switcher) return;
        const off = (e: MouseEvent) => { if (!switchRef.current?.contains(e.target as Node)) setSwitcher(false); };
        document.addEventListener('click', off);
        return () => document.removeEventListener('click', off);
    }, [switcher]);

    // /s/<id>/<page>, /account, /
    const m = /^\/s\/([^/]+)(?:\/([a-z]+))?\/?$/.exec(path);
    const server = m && servers ? servers.find((s) => s.id === m[1]) ?? null : null;
    let page = m ? m[2] || 'console' : path.replace(/^\/|\/$/g, '') || 'servers';
    if (m && !SERVER_PAGES.some(([k]) => k === page)) page = 'console';
    if (!m && !ACCOUNT_PAGES.some(([k]) => k === page)) page = 'servers';

    useEffect(() => {
        if (m && servers && !server) navigate('/', true); // deleted or unknown server
        const label = server ? `${server.name} | ${SERVER_PAGES.find(([k]) => k === page)?.[1]}` : ACCOUNT_PAGES.find(([k]) => k === page)?.[1];
        document.title = `${label} · ${session.name}`;
    }); // eslint-disable-line react-hooks/exhaustive-deps

    const logout = async () => {
        await attempt(() => api('auth.logout', {}, {}));
        navigate('/', true);
        onLogout();
    };

    const serverLink = (s: Server, p = page) => `/s/${encodeURIComponent(s.id)}${p === 'console' ? '' : '/' + p}`;

    let content: ReactNode = <div className="muted">Cargando…</div>;
    if (servers && meta) {
        if (server) {
            const props = { server, meta, reload };
            content = page === 'files' ? <FilesPage key={server.id} {...props} />
                : KIND_PAGES.includes(page) ? <PluginsPage key={server.id + page} kind={page} {...props} />
                : page === 'backups' ? <BackupsPage key={server.id} {...props} />
                : page === 'startup' ? <StartupPage key={server.id} {...props} />
                : page === 'settings' ? <SettingsPage key={server.id} {...props} />
                : <ConsolePage key={server.id} {...props} />;
        } else if (!m) {
            content = page === 'account' ? <AccountPage user={session.user!} meta={meta} />
                : <ServersPage servers={servers} meta={meta} reload={reload} />;
        }
    }

    return (
        <div className="app">
            <aside className={`sidebar${sidebar ? ' open' : ''}`}>
                <a className="brand" {...linkProps('/')}>
                    <Logo />
                    <span><b>{session.name}</b><small>ZimaOS</small></span>
                </a>
                {server && <>
                    <div className="nav-section">Gestión del servidor</div>
                    <nav className="nav">
                        {SERVER_PAGES.filter(([k]) => !KIND_PAGES.includes(k) || server.kinds[k]).map(([k, label, icon]) => (
                            <a key={k} {...linkProps(serverLink(server, k))} className={page === k ? 'active' : ''}>
                                <i className={`fa-solid ${icon}`} />{label}
                            </a>
                        ))}
                    </nav>
                </>}
                <div className="nav-section">Cuenta</div>
                <nav className="nav">
                    {ACCOUNT_PAGES.map(([k, label, icon]) => (
                        <a key={k} {...linkProps(k === 'servers' ? '/' : '/' + k)} className={!server && page === k ? 'active' : ''}><i className={`fa-solid ${icon}`} />{label}</a>
                    ))}
                    <a href="#" onClick={(e) => { e.preventDefault(); void logout(); }}><i className="fa-solid fa-right-from-bracket" />Cerrar sesión</a>
                </nav>
                <div className="sidebar-foot">Conectado como <b>{session.user}</b></div>
            </aside>

            <div className="main">
                <header className="topbar">
                    <button className="menu-btn" onClick={() => setSidebar(!sidebar)} aria-label="Menú"><i className="fa-solid fa-bars" /></button>
                    {!!servers?.length && (
                        <div className="server-switch" ref={switchRef}>
                            <button type="button" onClick={() => setSwitcher(!switcher)} aria-expanded={switcher}>
                                <i className="fa-solid fa-server" />
                                <span>{server ? server.name : 'Elegir servidor'}</span>
                                {server && <span className="sid">{server.id}</span>}
                                <i className="fa-solid fa-chevron-down" style={{ fontSize: 11 }} />
                            </button>
                            <div className={`menu${switcher ? ' open' : ''}`}>
                                {servers.map((s) => (
                                    <a key={s.id} {...linkProps(serverLink(s, server ? page : 'console'))}>{s.name}<span className="sid">{s.id}</span></a>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="spacer" />
                    <span className="clock">{clock}</span>
                    <a className="logout" href="#" onClick={(e) => { e.preventDefault(); void logout(); }}><i className="fa-solid fa-right-from-bracket" /> Salir</a>
                </header>
                {session.warning && <div className="alert-bar"><i className="fa-solid fa-triangle-exclamation" /> {session.warning}</div>}
                <main className="content">{content}</main>
            </div>
        </div>
    );
}
