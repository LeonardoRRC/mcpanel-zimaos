// The panel's JSON API (api.php). GET when there is no body, POST (with the CSRF token) otherwise.
let csrf = '';
export const setCsrf = (token: string) => { csrf = token; };

export class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

type Params = Record<string, string | number | boolean | null | undefined>;

export function apiUrl(action: string, params: Params = {}): string {
    const qs = new URLSearchParams({ a: action });
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) qs.set(k, String(v));
    return '/api.php?' + qs;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function api<T = any>(action: string, params: Params = {}, body?: object | FormData): Promise<T> {
    const opts: RequestInit = { headers: { 'X-CSRF': csrf }, credentials: 'same-origin' };
    if (body !== undefined) {
        opts.method = 'POST';
        if (body instanceof FormData) opts.body = body;
        else {
            (opts.headers as Record<string, string>)['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
    }
    const res = await fetch(apiUrl(action, params), opts);
    const data = await res.json().catch(() => ({ error: `Respuesta inválida del servidor (HTTP ${res.status})` }));
    if (res.status === 401 && !action.startsWith('auth.')) window.dispatchEvent(new Event('mcpanel:expired'));
    if (!res.ok || data.error) throw new ApiError(res.status, data.error || `Error ${res.status}`);
    return data as T;
}

/** Upload with progress (fetch can't report upload progress). */
export function upload(action: string, params: Params, form: FormData, onProgress: (loaded: number, total: number) => void): Promise<{ count: number }> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', apiUrl(action, params));
        xhr.setRequestHeader('X-CSRF', csrf);
        xhr.upload.onprogress = (e) => onProgress(e.loaded, e.total);
        xhr.onload = () => {
            let r: { count?: number; error?: string } = {};
            try { r = JSON.parse(xhr.responseText); } catch { r.error = 'HTTP ' + xhr.status; }
            if (r.error) reject(new Error(r.error)); else resolve({ count: r.count ?? 0 });
        };
        xhr.onerror = () => reject(new Error('Error de red al subir'));
        xhr.send(form);
    });
}
