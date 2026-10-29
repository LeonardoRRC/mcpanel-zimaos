<?php /** @var string $mode @var ?string $error */ ?>
<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e(APP_NAME) ?> · <?= $mode === 'setup' ? 'Configuración' : 'Iniciar sesión' ?></title>
<?php require __DIR__ . '/icons.php'; ?>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= asset('css/app.css') ?>">
</head>
<body>
<div class="auth-page">
    <div class="auth-card">
        <?php require __DIR__ . '/logo-full.php'; ?>
        <h1><?= $mode === 'setup' ? 'Crear administrador' : e(APP_NAME) . ' Login' ?></h1>
        <?php if ($error): ?><div class="form-error"><?= e($error) ?></div><?php endif; ?>
        <form method="post" autocomplete="on">
            <input type="hidden" name="_csrf" value="<?= e(Auth::csrf()) ?>">
            <label class="field"><span>Usuario</span>
                <input class="input" name="username" required autofocus autocomplete="username" value="<?= e($_POST['username'] ?? '') ?>">
            </label>
            <label class="field"><span>Contraseña</span>
                <input class="input" type="password" name="password" required autocomplete="<?= $mode === 'setup' ? 'new-password' : 'current-password' ?>">
            </label>
            <?php if ($mode === 'setup'): ?>
                <label class="field"><span>Repetir contraseña</span>
                    <input class="input" type="password" name="password2" required autocomplete="new-password">
                </label>
                <p class="hint">Primera vez: crea la cuenta que administrará el panel (mínimo 8 caracteres).</p>
            <?php endif; ?>
            <button class="btn btn-primary" type="submit"><?= $mode === 'setup' ? 'Crear y entrar' : 'Login' ?></button>
        </form>
        <div class="foot">Panel de servidores Minecraft para ZimaOS</div>
    </div>
</div>
</body>
</html>
