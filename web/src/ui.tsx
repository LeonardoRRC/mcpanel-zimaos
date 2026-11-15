// Shared UI: toasts, modals, confirm/prompt dialogs and background-job progress.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { bytes } from './format';

// ------------------------------------------------------------ modal

export function Modal({ title, onClose, children, footer, wide }: {
    title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
    const box = useRef<HTMLDivElement>(null);
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close.current(); } };
        document.addEventListener('keydown', onKey);
        const t = setTimeout(() => box.current?.querySelector<HTMLElement>('[autofocus], input:not([type=radio]):not([type=checkbox]), select, textarea')?.focus(), 30);
        return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); };
    }, []);
    return createPortal(
        <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" ref={box}>
                <div className="modal-head">
                    <h3>{title}</h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar"><i className="fa-solid fa-xmark" /></button>
                </div>
                <div className="modal-body">{children}</div>
                {footer && <div className="modal-foot">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
}

// ------------------------------------------------------------ context

type ToastType = 'ok' | 'error';
type UI = {
    toast: (msg: string, type?: ToastType) => void;
    /** Run an async action, showing errors (and an optional success message) as toasts. */
    attempt: <T>(fn: () => Promise<T>, okMsg?: string | null) => Promise<T | null>;
    confirm: (title: string, text: ReactNode, ok?: string, danger?: boolean) => Promise<boolean>;
    prompt: (title: string, label: string, value?: string, ok?: string) => Promise<string | null>;
    /** Show a background job's progress until it ends. Resolves true when it succeeded. */
    watchJob: (job: string, title: string) => Promise<boolean>;
    /** Mount any dialog; it gets a close function. */
    open: (render: (close: () => void) => ReactNode) => () => void;
};
const Ctx = createContext<UI | null>(null);
export const useUI = () => useContext(Ctx)!;

let seq = 0;

export function UIProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<{ id: number; msg: string; type: ToastType; out?: boolean }[]>([]);
    const [dialogs, setDialogs] = useState<{ id: number; node: ReactNode }[]>([]);

    const toast = useCallback((msg: string, type: ToastType = 'ok') => {
        const id = ++seq;
        setToasts((t) => [...t, { id, msg, type }]);
        setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, out: true } : x))), 3800);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
    }, []);

    const attempt = useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string | null) => {
        try {
            const r = await fn();
            if (okMsg) toast(okMsg);
            return r;
        } catch (e) {
            toast((e as Error).message, 'error');
            return null;
        }
    }, [toast]);

    const open = useCallback((render: (close: () => void) => ReactNode) => {
        const id = ++seq;
        const close = () => setDialogs((d) => d.filter((x) => x.id !== id));
        setDialogs((d) => [...d, { id, node: render(close) }]);
        return close;
    }, []);

    const confirm = useCallback((title: string, text: ReactNode, ok = 'Confirmar', danger = true) => new Promise<boolean>((resolve) => {
        open((close) => {
            const done = (v: boolean) => { close(); resolve(v); };
            return <Modal title={title} onClose={() => done(false)} footer={<>
                <button className="btn" onClick={() => done(false)}>Cancelar</button>
                <button className={`btn ${danger ? 'btn-red' : 'btn-primary'}`} onClick={() => done(true)}>{ok}</button>
            </>}><p style={{ marginTop: 0 }}>{text}</p></Modal>;
        });
    }), [open]);

    const prompt = useCallback((title: string, label: string, value = '', ok = 'Guardar') => new Promise<string | null>((resolve) => {
        open((close) => <PromptDialog title={title} label={label} value={value} ok={ok} done={(v) => { close(); resolve(v); }} />);
    }), [open]);

    const watchJob = useCallback((job: string, title: string) => new Promise<boolean>((resolve) => {
        open((close) => <JobDialog job={job} title={title} close={close} done={(ok) => { if (!ok) toast(`${title}: error`, 'error'); else toast(`${title}: completado`); resolve(ok); }} />);
    }), [open, toast]);

    return (
        <Ctx.Provider value={{ toast, attempt, confirm, prompt, watchJob, open }}>
            {children}
            {dialogs.map((d) => <div key={d.id}>{d.node}</div>)}
            <div className="toasts">
                {toasts.map((t) => (
                    <div key={t.id} className={`toast${t.type === 'error' ? ' error' : ''}`} style={t.out ? { opacity: 0, transition: 'opacity .3s' } : undefined}>{t.msg}</div>
                ))}
            </div>
        </Ctx.Provider>
    );
}

function PromptDialog({ title, label, value, ok, done }: { title: string; label: string; value: string; ok: string; done: (v: string | null) => void }) {
    const [v, setV] = useState(value);
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const t = setTimeout(() => { const dot = value.lastIndexOf('.'); input.current?.focus(); input.current?.setSelectionRange(0, dot > 0 ? dot : value.length); }, 40);
        return () => clearTimeout(t);
    }, [value]);
    const submit = () => { if (v.trim()) done(v.trim()); };
    return (
        <Modal title={title} onClose={() => done(null)} footer={<>
            <button className="btn" onClick={() => done(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={submit}>{ok}</button>
        </>}>
            <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <label className="field"><span>{label}</span><input ref={input} className="input dark" value={v} onChange={(e) => setV(e.target.value)} required /></label>
            </form>
        </Modal>
    );
}

type JobState = { status: string; progress?: number | null; bytes?: number; total?: number; log?: string[]; error?: string };

function JobDialog({ job, title, close, done }: { job: string; title: string; close: () => void; done: (ok: boolean) => void }) {
    const [j, setJ] = useState<JobState>({ status: 'running' });
    const logRef = useRef<HTMLPreElement>(null);
    const finished = useRef(false);
    useEffect(() => {
        const timer = setInterval(async () => {
            let r: JobState;
            try { r = await api<JobState>('job', { job }); } catch { return; }
            setJ(r);
            if (['done', 'error', 'missing'].includes(r.status) && !finished.current) {
                finished.current = true;
                clearInterval(timer);
                const ok = r.status === 'done';
                done(ok);
                if (ok) setTimeout(close, 900);
            }
        }, 900);
        return () => clearInterval(timer);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [j.log]);

    const ended = ['done', 'error', 'missing'].includes(j.status);
    const ok = j.status === 'done';
    const known = j.progress != null && j.status === 'running';
    const width = ended ? 100 : known ? j.progress! : undefined;
    const label = ended ? (ok ? 'Completado' : 'Error: ' + (j.error || 'desconocido'))
        : known ? `${j.progress}%` + (j.total ? ` · ${bytes(j.bytes)} / ${bytes(j.total)}` : '')
        : 'Trabajando...';
    return (
        <Modal title={title} onClose={() => { finished.current = true; close(); }}>
            <div className={`progress${!ended && !known ? ' indeterminate' : ''}`}>
                <div style={{ width: width !== undefined ? width + '%' : undefined, background: ended ? (ok ? 'var(--green)' : 'var(--red)') : undefined }} />
            </div>
            <div className="hint">{label}</div>
            <pre className="job-log" ref={logRef}>{(j.log || []).map((l, i) => <span key={i}>{linkify(l)}{'\n'}</span>)}</pre>
        </Modal>
    );
}

function linkify(text: string): ReactNode[] {
    return text.split(/(https?:\/\/\S+)/g).map((p, i) => (i % 2 ? <a key={i} href={p} target="_blank" rel="noopener">{p}</a> : p));
}

export function Switch({ checked, onChange, children, disabled, style }: { checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; disabled?: boolean; style?: CSSProperties }) {
    return (
        <label className="switch" style={style}>
            <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
            <span className="track" />
            {children !== undefined && <span>{children}</span>}
        </label>
    );
}
