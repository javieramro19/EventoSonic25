<?php

declare(strict_types=1);

if (!function_exists('es_config')) {
    require dirname(__DIR__) . '/api/_bootstrap.php';
}

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function maintenance_h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function maintenance_admin_email(): string
{
    $c = es_config();
    $email = trim((string) ($c['installer_admin_email'] ?? $c['notification_email'] ?? ''));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('No hay email administrador valido en data/secrets.php.');
    }
    return $email;
}

function maintenance_from_email(): string
{
    $c = es_config();
    $email = trim((string) ($c['notification_from_email'] ?? ''));
    return filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : maintenance_admin_email();
}

function maintenance_is_authorized(): bool
{
    $key = maintenance_session_key('authorized_until');
    return !empty($_SESSION[$key]) && (int) $_SESSION[$key] > time();
}

function maintenance_send_code(string $target): bool
{
    $code = (string) random_int(100000, 999999);
    $_SESSION[maintenance_session_key('code_hash')] = hash('sha256', $code);
    $_SESSION[maintenance_session_key('code_expires')] = time() + 300;
    $_SESSION[maintenance_session_key('code_attempts')] = 0;

    $from = maintenance_from_email();
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'From: "EventoSonic" <' . $from . '>',
        'Reply-To: ' . $from,
        'X-Mailer: PHP/' . phpversion(),
    ];
    $body = implode("\r\n", [
        'Codigo de acceso a mantenimiento EventoSonic:',
        '',
        $code,
        '',
        'Caduca en 5 minutos.',
        'Si no has solicitado este codigo, ignora este correo.',
    ]);

    return es_send_email($target, 'Codigo de acceso EventoSonic', $body, $headers, $from);
}

function maintenance_render_gate(array $messages, array $errors): void
{
    $target = '';
    try {
        $target = maintenance_admin_email();
    } catch (Throwable $e) {
        $errors[] = $e->getMessage();
    }
    ?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Acceso mantenimiento EventoSonic</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f7f1ea; color: #2f2a27; }
    main { max-width: 560px; margin: 44px auto; padding: 24px; background: #fff; border: 1px solid #eadfd4; border-radius: 12px; }
    h1 { margin-top: 0; }
    form { display: grid; gap: 14px; margin-top: 18px; }
    input { border: 1px solid #ded4cb; border-radius: 10px; font: inherit; padding: 12px; }
    button { border: 0; border-radius: 999px; padding: 13px 20px; background: #c09256; color: #17120e; font: inherit; font-weight: 800; cursor: pointer; }
    .ok, .error { border-radius: 10px; margin: 14px 0; padding: 12px 14px; }
    .ok { background: #eef8ef; border: 1px solid #a8d7ae; color: #225b2c; }
    .error { background: #fff0f0; border: 1px solid #e8b2b2; color: #9b2424; }
    code { background: #f3ebe3; padding: 2px 6px; border-radius: 5px; }
  </style>
</head>
<body>
  <main>
    <h1>Acceso de mantenimiento</h1>
    <p>Para continuar, envia un codigo al correo administrador y escribelo aqui.</p>
    <?php if ($target): ?>
      <p>Correo administrador: <code><?php echo maintenance_h($target); ?></code></p>
    <?php endif; ?>

    <?php foreach ($messages as $message): ?>
      <div class="ok"><?php echo maintenance_h($message); ?></div>
    <?php endforeach; ?>
    <?php foreach ($errors as $error): ?>
      <div class="error"><?php echo maintenance_h($error); ?></div>
    <?php endforeach; ?>

    <form method="post">
      <input type="hidden" name="maintenance_action" value="send_code">
      <button type="submit">Enviar codigo</button>
    </form>

    <form method="post">
      <input type="hidden" name="maintenance_action" value="verify_code">
      <label>
        Codigo recibido
        <input name="maintenance_code" inputmode="numeric" autocomplete="one-time-code" required>
      </label>
      <button type="submit">Acceder</button>
    </form>
  </main>
</body>
</html>
    <?php
    exit;
}

function maintenance_session_key(string $name): string
{
    $script = basename((string) ($_SERVER['SCRIPT_NAME'] ?? 'maintenance'));
    return 'maintenance_' . $name . '_' . hash('sha256', $script);
}

function maintenance_require_email_code(): void
{
    if (maintenance_is_authorized()) {
        return;
    }

    $messages = [];
    $errors = [];

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['maintenance_action'])) {
        $action = (string) $_POST['maintenance_action'];

        if ($action === 'send_code') {
            try {
                $target = maintenance_admin_email();
                if (maintenance_send_code($target)) {
                    $messages[] = 'Codigo enviado. Revisa la bandeja de entrada y spam.';
                } else {
                    $detail = (string) ($GLOBALS['ES_LAST_MAIL_ERROR'] ?? '');
                    $errors[] = 'No se pudo enviar el codigo.' . ($detail !== '' ? ' Detalle: ' . $detail : '');
                }
            } catch (Throwable $e) {
                $errors[] = $e->getMessage();
            }
        }

        if ($action === 'verify_code') {
            $code = preg_replace('/\D+/', '', (string) ($_POST['maintenance_code'] ?? ''));
            $expiresKey = maintenance_session_key('code_expires');
            $hashKey = maintenance_session_key('code_hash');
            $attemptsKey = maintenance_session_key('code_attempts');
            $authorizedKey = maintenance_session_key('authorized_until');
            $expires = (int) ($_SESSION[$expiresKey] ?? 0);
            $hash = (string) ($_SESSION[$hashKey] ?? '');
            $_SESSION[$attemptsKey] = (int) ($_SESSION[$attemptsKey] ?? 0) + 1;

            if ($expires < time()) {
                $errors[] = 'El codigo ha caducado. Solicita uno nuevo.';
            } elseif ((int) $_SESSION[$attemptsKey] > 5) {
                unset($_SESSION[$hashKey], $_SESSION[$expiresKey], $_SESSION[$attemptsKey]);
                $errors[] = 'Demasiados intentos. Solicita un codigo nuevo.';
            } elseif ($code !== '' && hash_equals($hash, hash('sha256', $code))) {
                $_SESSION[$authorizedKey] = time() + 300;
                unset($_SESSION[$hashKey], $_SESSION[$expiresKey], $_SESSION[$attemptsKey]);
                header('Location: ' . strtok((string) ($_SERVER['REQUEST_URI'] ?? ''), '?'));
                exit;
            } else {
                $errors[] = 'Codigo incorrecto.';
            }
        }
    }

    maintenance_render_gate($messages, $errors);
}

maintenance_require_email_code();
