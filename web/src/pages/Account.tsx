import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Meta } from '../types';
import { useUI } from '../ui';

export function AccountPage({ user, meta }: { user: string; meta: Meta }) {
    const { attempt, toast } = useUI();
    const [f, setF] = useState({ current: '', new: '', new2: '' });
    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (f.new !== f.new2) return toast('Las contraseñas nuevas no coinciden', 'error');
        if (await attempt(() => api('account.password', {}, { current: f.current, new: f.new }), 'Contraseña actualizada')) setF({ current: '', new: '', new2: '' });
    };
    const field = (k: keyof typeof f, label: string, auto: string) => (
        <label className="field"><span>{label}</span>
            <input className="input dark" type="password" required minLength={k === 'current' ? undefined : 8} autoComplete={auto} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        </label>
    );
    return <>
        <div className="page-head"><h1>Cuenta</h1></div>
        <div className="grid grid-2">
            <div className="card">
                <div className="card-head"><i className="fa-solid fa-key" /> Cambiar contraseña</div>
                <form className="card-body" onSubmit={submit}>
                    {field('current', 'Contraseña actual', 'current-password')}
                    {field('new', 'Nueva contraseña', 'new-password')}
                    {field('new2', 'Repetir nueva contraseña', 'new-password')}
                    <button className="btn btn-primary" type="submit">Actualizar</button>
                </form>
            </div>
            <div className="card">
                <div className="card-head"><i className="fa-solid fa-circle-info" /> Sistema</div>
                <div className="card-body">
                    <p><span className="muted">Usuario:</span> {user}</p>
                    <p><span className="muted">Datos del panel:</span> <code className="mono">{meta.system.data_dir}</code></p>
                    <p><span className="muted">PHP:</span> {meta.system.php} · <span className="muted">CPU:</span> {meta.system.cpus} núcleos</p>
                </div>
            </div>
        </div>
    </>;
}
