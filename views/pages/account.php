<div class="page-head"><h1>Cuenta</h1></div>
<div class="grid grid-2">
    <div class="card">
        <div class="card-head"><i class="fa-solid fa-key"></i> Cambiar contraseña</div>
        <form class="card-body" id="pw-form">
            <label class="field"><span>Contraseña actual</span><input class="input dark" type="password" name="current" required autocomplete="current-password"></label>
            <label class="field"><span>Nueva contraseña</span><input class="input dark" type="password" name="new" required minlength="8" autocomplete="new-password"></label>
            <label class="field"><span>Repetir nueva contraseña</span><input class="input dark" type="password" name="new2" required minlength="8" autocomplete="new-password"></label>
            <button class="btn btn-primary" type="submit">Actualizar</button>
        </form>
    </div>
    <div class="card">
        <div class="card-head"><i class="fa-solid fa-circle-info"></i> Sistema</div>
        <div class="card-body">
            <p><span class="muted">Usuario:</span> <?= e(Auth::user()) ?></p>
            <p><span class="muted">Datos del panel:</span> <code class="mono"><?= e(DATA_DIR) ?></code></p>
            <p><span class="muted">PHP:</span> <?= e(PHP_VERSION) ?> · <span class="muted">CPU:</span> <?= Server::cpuCount() ?> núcleos</p>
        </div>
    </div>
</div>
<script>
document.addEventListener('DOMContentLoaded', () => {
    $('#pw-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        if (d.new !== d.new2) return toast('Las contraseñas nuevas no coinciden', 'error');
        if (await attempt(() => api('account.password', {}, { current: d.current, new: d.new }), 'Contraseña actualizada')) e.target.reset();
    });
});
</script>
