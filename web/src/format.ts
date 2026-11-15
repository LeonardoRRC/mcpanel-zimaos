export function bytes(n: number | null | undefined, dec = 1): string {
    if (n == null) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i ? n.toFixed(dec) : n) + ' ' + u[i];
}

export function duration(sec: number): string {
    if (!sec) return '—';
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    return (d ? d + 'd ' : '') + (d || h ? h + 'h ' : '') + m + 'm';
}

export const fmtDate = (t: number) => new Date(t * 1000).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
export const fmtFileDate = (t: number) => (t ? new Date(t * 1000).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export function ago(iso: string): string {
    const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
    const months = Math.round(days / 30), years = Math.round(days / 365);
    return days < 1 ? 'hoy' : days < 31 ? `hace ${days} d` : days < 365 ? `hace ${months} ${months === 1 ? 'mes' : 'meses'}` : `hace ${years} ${years === 1 ? 'año' : 'años'}`;
}

export const STATE_LABEL: Record<string, string> = { running: 'En línea', starting: 'Iniciando', stopping: 'Deteniendo', offline: 'Apagado' };
