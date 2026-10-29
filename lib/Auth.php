<?php
declare(strict_types=1);

final class Auth
{
    private const USERS_FILE = PANEL_DIR . '/users.json';

    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        session_save_path(PANEL_DIR . '/sessions');
        session_name('mcpanel');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.gc_maxlifetime', '604800');
        session_start();
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(16));
        }
    }

    public static function needsSetup(): bool
    {
        return !is_file(self::USERS_FILE);
    }

    public static function createAdmin(string $username, string $password): void
    {
        if (!self::needsSetup()) {
            throw new RuntimeException('El administrador ya existe.');
        }
        self::validate($username, $password);
        write_json(self::USERS_FILE, [
            $username => ['hash' => password_hash($password, PASSWORD_DEFAULT), 'created' => time()],
        ]);
        @chmod(self::USERS_FILE, 0600);
    }

    public static function changePassword(string $username, string $current, string $new): void
    {
        $users = read_json(self::USERS_FILE, []);
        if (!isset($users[$username]) || !password_verify($current, $users[$username]['hash'])) {
            throw new RuntimeException('La contraseña actual no es correcta.');
        }
        self::validate($username, $new);
        $users[$username]['hash'] = password_hash($new, PASSWORD_DEFAULT);
        write_json(self::USERS_FILE, $users);
    }

    private static function validate(string $username, string $password): void
    {
        if (!preg_match('/^[a-zA-Z0-9_.-]{3,32}$/', $username)) {
            throw new RuntimeException('El usuario debe tener 3-32 caracteres (letras, números, _ . -).');
        }
        if (strlen($password) < 8) {
            throw new RuntimeException('La contraseña debe tener al menos 8 caracteres.');
        }
    }

    public static function login(string $username, string $password): bool
    {
        $users = read_json(self::USERS_FILE, []);
        $ok = isset($users[$username]) && password_verify($password, $users[$username]['hash']);
        if (!$ok) {
            usleep(800000); // slow down brute force attempts
            return false;
        }
        session_regenerate_id(true);
        $_SESSION['user'] = $username;
        return true;
    }

    public static function logout(): void
    {
        $_SESSION = [];
        session_destroy();
    }

    public static function user(): ?string
    {
        return $_SESSION['user'] ?? null;
    }

    public static function csrf(): string
    {
        return $_SESSION['csrf'];
    }

    public static function checkCsrf(?string $token): bool
    {
        return is_string($token) && hash_equals($_SESSION['csrf'] ?? '', $token);
    }
}
