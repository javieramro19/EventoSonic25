<?php

declare(strict_types=1);

require dirname(__DIR__) . '/api/_bootstrap.php';
require __DIR__ . '/maintenance-guard.php';

$sent = false;
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $c = es_config();
        $to = trim((string) ($c['notification_email'] ?? ''));
        $from = trim((string) ($c['notification_from_email'] ?? ''));
        $name = es_clean_text($c['notification_from_name'] ?? 'EventoSonic', 80);

        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('notification_email no es valido en data/secrets.php');
        }
        if ($from === '' || !filter_var($from, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('notification_from_email no es valido en data/secrets.php');
        }

        $headers = [
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            'From: "' . str_replace('"', '', $name) . '" <' . $from . '>',
            'Reply-To: ' . $from,
            'X-Mailer: PHP/' . phpversion(),
        ];

        $body = implode("\r\n", [
            'Prueba de correo EventoSonic.',
            '',
            'Si recibes este mensaje, el envio de avisos esta funcionando.',
            'Fecha: ' . date('Y-m-d H:i:s'),
        ]);

        $sent = es_send_email($to, 'Prueba de correo EventoSonic', $body, $headers, $from);
        if (!$sent) {
            $detail = (string) ($GLOBALS['ES_LAST_MAIL_ERROR'] ?? '');
            $error = 'PHP no ha podido confirmar el envio.';
            if ($detail !== '') {
                $error .= ' Detalle: ' . $detail;
            }
        }
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}

function pc_h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

$cfg = [];
try {
    $cfg = es_config();
} catch (Throwable $e) {
    $error = $error ?: $e->getMessage();
}

?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Probar correo EventoSonic</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f7f1ea; color: #2f2a27; }
    main { max-width: 720px; margin: 40px auto; padding: 24px; background: #fff; border: 1px solid #eadfd4; border-radius: 12px; }
    h1 { margin-top: 0; }
    code { background: #f3ebe3; padding: 2px 6px; border-radius: 5px; }
    button { border: 0; border-radius: 999px; padding: 14px 22px; background: #c09256; color: #17120e; font: inherit; font-weight: 800; cursor: pointer; }
    .ok, .error { border-radius: 10px; margin: 16px 0; padding: 12px 14px; }
    .ok { background: #eef8ef; border: 1px solid #a8d7ae; color: #225b2c; }
    .error { background: #fff0f0; border: 1px solid #e8b2b2; color: #9b2424; }
    li { margin: 8px 0; }
  </style>
</head>
<body>
  <main>
    <h1>Probar correo EventoSonic</h1>
    <p>Este archivo envia un correo de prueba usando la configuracion de <code>data/secrets.php</code>.</p>

    <?php if ($sent): ?>
      <div class="ok">Correo enviado. Revisa la bandeja de entrada y spam.</div>
    <?php endif; ?>

    <?php if ($error): ?>
      <div class="error"><?php echo pc_h($error); ?></div>
    <?php endif; ?>

    <ul>
      <li>Destino: <code><?php echo pc_h((string) ($cfg['notification_email'] ?? '')); ?></code></li>
      <li>Remitente: <code><?php echo pc_h((string) ($cfg['notification_from_email'] ?? '')); ?></code></li>
      <li>SMTP host: <code><?php echo pc_h((string) ($cfg['smtp_host'] ?? '')); ?></code></li>
      <li>SMTP usuario: <code><?php echo pc_h((string) ($cfg['smtp_user'] ?? '')); ?></code></li>
    </ul>

    <form method="post">
      <button type="submit">Enviar prueba</button>
    </form>

    <p><strong>Borra este archivo cuando termines la prueba.</strong></p>
  </main>
</body>
</html>
