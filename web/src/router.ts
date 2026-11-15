// A tiny History-API router: /, /account, /s/<id>/<page>. The PHP router serves index.html for them.
import { useEffect, useState, type MouseEvent } from 'react';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
window.addEventListener('popstate', notify);

export function navigate(to: string, replace = false): void {
    if (to === location.pathname + location.search) return;
    history[replace ? 'replaceState' : 'pushState'](null, '', to);
    notify();
    if (!replace) window.scrollTo(0, 0);
}

export function useLocation(): { path: string; query: URLSearchParams } {
    const [, force] = useState(0);
    useEffect(() => {
        const l = () => force((n) => n + 1);
        listeners.add(l);
        return () => { listeners.delete(l); };
    }, []);
    return { path: location.pathname, query: new URLSearchParams(location.search) };
}

/** <a> that navigates without reloading (still opens in a new tab with Ctrl/middle click). */
export function linkProps(to: string) {
    return {
        href: to,
        onClick: (e: MouseEvent) => {
            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            navigate(to);
        },
    };
}
