import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { Logo } from '../components/Logo';
import type { Session } from '../types';

/** First run creates the admin; afterwards it is the login form. */
export function AuthPage({ session, onDone }: { session: Session; onDone: () => void }) {
    const setup = session.setup;
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [password2, setPassword2] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await api(setup ? 'auth.setup' : 'auth.login', {}, setup ? { username, password, password2 } : { username, password });
            onDone();
        } catch (err) {
            setError(err instanceof ApiError && err.status === 403 ? 'La sesión caducó: vuelve a intentarlo.' : (err as Error).message);
            if (err instanceof ApiError && err.status === 403) onDone();
            setBusy(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <Logo full />
                <h1>{setup ? 'Crear administrador' : `${session.name} Login`}</h1>
                {error && <div className="form-error">{error}</div>}
                <form onSubmit={submit} autoComplete="on">
                    <label className="field"><span>Usuario</span>
                        <input className="input" name="username" required autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
                    </label>
                    <label className="field"><span>Contraseña</span>
                        <input className="input" type="password" name="password" required autoComplete={setup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
                    </label>
                    {setup && <>
                        <label className="field"><span>Repetir contraseña</span>
                            <input className="input" type="password" name="password2" required autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
                        </label>
                        <p className="hint">Primera vez: crea la cuenta que administrará el panel (mínimo 8 caracteres).</p>
                    </>}
                    <button className="btn btn-primary" type="submit" disabled={busy}>{setup ? 'Crear y entrar' : 'Login'}</button>
                </form>
                <div className="foot">Panel de servidores Minecraft para ZimaOS</div>
            </div>
        </div>
    );
}
