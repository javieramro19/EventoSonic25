<?php

declare(strict_types=1);

require __DIR__ . '/maintenance-guard.php';

$errors = [];
$messages = [];

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function clean_text(string $value, int $max): string
{
    $value = preg_replace("/[\x00-\x1f\x7f]/u", ' ', trim($value)) ?? '';
    $value = preg_replace('/\s+/u', ' ', $value) ?? '';
    return mb_substr($value, 0, $max, 'UTF-8');
}

function hash_worker_password(string $password, string $salt): string
{
    return bin2hex(hash_pbkdf2('sha256', $password, $salt, 210000, 32, true));
}

function random_secret(): string
{
    return rtrim(strtr(base64_encode(random_bytes(48)), '+/', '-_'), '=');
}

function create_tables(PDO $pdo): void
{
    $pdo->exec('SET NAMES utf8mb4');
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS workers (
          id INT NOT NULL AUTO_INCREMENT,
          username VARCHAR(120) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          password_salt VARCHAR(255) NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY workers_username (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS sessions (
          id VARCHAR(255) NOT NULL,
          worker_id INT NOT NULL,
          expires_at BIGINT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          CONSTRAINT sessions_worker_fk FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS requests (
          id INT NOT NULL AUTO_INCREMENT,
          plan_name VARCHAR(120) NOT NULL,
          client_name VARCHAR(160) NOT NULL,
          client_email VARCHAR(220) NOT NULL,
          client_phone VARCHAR(60) NOT NULL,
          event_type VARCHAR(100) NOT NULL,
          event_date DATE NOT NULL,
          guests INT NOT NULL,
          extras_text TEXT NOT NULL,
          special_request TEXT NOT NULL,
          dietary_text TEXT NOT NULL,
          base_price INT NOT NULL,
          extras_price INT NOT NULL,
          total_price INT NOT NULL,
          status ENUM('pendiente', 'aceptada', 'rechazada', 'contactada') NOT NULL DEFAULT 'pendiente',
          worker_notes TEXT NOT NULL DEFAULT '',
          accepted_by INT NULL,
          accepted_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          CONSTRAINT requests_accepted_by_fk FOREIGN KEY (accepted_by) REFERENCES workers(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
}

function save_secrets(array $cfg): void
{
    $dataDir = dirname(__DIR__) . '/data';
    if (!is_dir($dataDir) && !mkdir($dataDir, 0755, true)) {
        throw new RuntimeException('No se pudo crear la carpeta data.');
    }

    $contents = "<?php\n\n";
    $contents .= "return [\n";
    $contents .= "    'db_host' => " . var_export($cfg['db_host'], true) . ",\n";
    $contents .= "    'db_port' => " . (int) $cfg['db_port'] . ",\n";
    $contents .= "    'db_name' => " . var_export($cfg['db_name'], true) . ",\n";
    $contents .= "    'db_user' => " . var_export($cfg['db_user'], true) . ",\n";
    $contents .= "    'db_pass' => " . var_export($cfg['db_pass'], true) . ",\n";
    $contents .= "    'session_secret' => " . var_export($cfg['session_secret'], true) . ",\n";
    $contents .= "    'worker_user' => " . var_export($cfg['worker_user'], true) . ",\n";
    $contents .= "    'worker_password' => " . var_export($cfg['worker_password'], true) . ",\n";
    $contents .= "    'notification_email' => " . var_export($cfg['notification_email'], true) . ",\n";
    $contents .= "    'notification_from_email' => " . var_export($cfg['notification_from_email'], true) . ",\n";
    $contents .= "    'notification_from_name' => " . var_export($cfg['notification_from_name'], true) . ",\n";
    $contents .= "    'smtp_host' => " . var_export($cfg['smtp_host'], true) . ",\n";
    $contents .= "    'smtp_port' => " . (int) $cfg['smtp_port'] . ",\n";
    $contents .= "    'smtp_user' => " . var_export($cfg['smtp_user'], true) . ",\n";
    $contents .= "    'smtp_pass' => " . var_export($cfg['smtp_pass'], true) . ",\n";
    $contents .= "    'smtp_secure' => " . var_export($cfg['smtp_secure'], true) . ",\n";
    $contents .= "    'cookie_secure' => " . ($cfg['cookie_secure'] ? 'true' : 'false') . ",\n";
    $contents .= "    'db_ssl' => " . ($cfg['db_ssl'] ? 'true' : 'false') . ",\n";
    $contents .= "];\n";

    if (file_put_contents($dataDir . '/secrets.php', $contents, LOCK_EX) === false) {
        throw new RuntimeException('No se pudo escribir data/secrets.php.');
    }
}

function upsert_worker(PDO $pdo, string $username, string $password): void
{
    $salt = bin2hex(random_bytes(16));
    $hash = hash_worker_password($password, $salt);

    $stmt = $pdo->prepare('SELECT id FROM workers WHERE username = ?');
    $stmt->execute([$username]);
    $worker = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($worker) {
        $update = $pdo->prepare('UPDATE workers SET password_hash = ?, password_salt = ? WHERE id = ?');
        $update->execute([$hash, $salt, $worker['id']]);
        return;
    }

    $insert = $pdo->prepare('INSERT INTO workers (username, password_hash, password_salt) VALUES (?, ?, ?)');
    $insert->execute([$username, $hash, $salt]);
}

$defaults = [
    'db_host' => 'localhost',
    'db_port' => '3306',
    'db_name' => '',
    'db_user' => '',
    'db_pass' => '',
    'worker_user' => 'admin',
    'worker_password' => '',
    'notification_email' => 'eventosonic25@gmail.com',
    'notification_from_email' => 'eventosonic25@javier.teconecto.es',
    'notification_from_name' => 'EventoSonic',
    'smtp_host' => 'smtp.javier.teconecto.es',
    'smtp_port' => '587',
    'smtp_user' => 'eventosonic25@javier.teconecto.es',
    'smtp_pass' => '',
    'smtp_secure' => 'tls',
    'cookie_secure' => '1',
    'db_ssl' => '',
];

$values = $defaults;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    foreach ($values as $key => $default) {
        $values[$key] = (string) ($_POST[$key] ?? $default);
    }

    $cfg = [
        'db_host' => clean_text($values['db_host'], 180),
        'db_port' => (int) $values['db_port'],
        'db_name' => clean_text($values['db_name'], 120),
        'db_user' => clean_text($values['db_user'], 120),
        'db_pass' => (string) $values['db_pass'],
        'worker_user' => clean_text($values['worker_user'], 80),
        'worker_password' => (string) $values['worker_password'],
        'notification_email' => clean_text($values['notification_email'], 180),
        'notification_from_email' => clean_text($values['notification_from_email'], 180),
        'notification_from_name' => clean_text($values['notification_from_name'], 80),
        'smtp_host' => clean_text($values['smtp_host'], 180),
        'smtp_port' => (int) $values['smtp_port'],
        'smtp_user' => clean_text($values['smtp_user'], 180),
        'smtp_pass' => (string) $values['smtp_pass'],
        'smtp_secure' => clean_text($values['smtp_secure'], 10),
        'session_secret' => random_secret(),
        'cookie_secure' => !empty($values['cookie_secure']),
        'db_ssl' => !empty($values['db_ssl']),
    ];

    if ($cfg['db_host'] === '') {
        $errors[] = 'Indica el servidor de la base de datos.';
    }
    if ($cfg['db_port'] < 1 || $cfg['db_port'] > 65535) {
        $errors[] = 'El puerto de la base de datos no es valido.';
    }
    if ($cfg['db_name'] === '') {
        $errors[] = 'Indica el nombre de la base de datos.';
    }
    if ($cfg['db_user'] === '') {
        $errors[] = 'Indica el usuario de la base de datos.';
    }
    if ($cfg['worker_user'] === '') {
        $errors[] = 'Indica el usuario del panel.';
    }
    if (strlen($cfg['worker_password']) < 8) {
        $errors[] = 'La contrasena del panel debe tener al menos 8 caracteres.';
    }
    if ($cfg['notification_email'] === '' || !filter_var($cfg['notification_email'], FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Indica un email valido para recibir avisos.';
    }
    if ($cfg['notification_from_email'] === '' || !filter_var($cfg['notification_from_email'], FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Indica un email remitente valido.';
    }
    if ($cfg['smtp_host'] !== '' && ($cfg['smtp_port'] < 1 || $cfg['smtp_port'] > 65535)) {
        $errors[] = 'El puerto SMTP no es valido.';
    }

    if (!$errors) {
        try {
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                $cfg['db_host'],
                $cfg['db_port'],
                $cfg['db_name']
            );
            $opts = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
            ];
            if ($cfg['db_ssl']) {
                $opts[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = false;
            }

            $pdo = new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], $opts);
            create_tables($pdo);
            upsert_worker($pdo, $cfg['worker_user'], $cfg['worker_password']);
            $pdo->exec('DELETE FROM sessions');
            save_secrets($cfg);

            $messages[] = 'Instalacion completada. Ya puedes entrar en panel.html con el usuario del panel.';
            $messages[] = 'Borra tools/instalador.php del servidor ahora. Es importante por seguridad.';
            $values['worker_password'] = '';
        } catch (Throwable $e) {
            $errors[] = 'No se pudo completar la instalacion: ' . $e->getMessage();
        }
    }
}

?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Instalador EventoSonic</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f7f1ea; color: #2f2a27; }
    main { max-width: 760px; margin: 40px auto; padding: 24px; }
    section { background: #fff; border: 1px solid #eadfd4; border-radius: 12px; padding: 24px; box-shadow: 0 12px 30px rgba(67, 45, 29, .08); }
    h1 { margin: 0 0 8px; font-size: 30px; }
    p { line-height: 1.5; }
    form { display: grid; gap: 16px; margin-top: 22px; }
    label { display: grid; gap: 7px; font-weight: 700; }
    input { border: 1px solid #ded4cb; border-radius: 10px; font: inherit; padding: 12px; }
    button { border: 0; border-radius: 999px; padding: 14px 22px; background: #c09256; color: #17120e; font: inherit; font-weight: 800; cursor: pointer; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .check { display: flex; gap: 10px; align-items: center; font-weight: 400; }
    .check input { width: auto; }
    .alert { border-radius: 10px; padding: 12px 14px; margin-top: 14px; }
    .error { background: #fff0f0; border: 1px solid #e8b2b2; color: #9b2424; }
    .ok { background: #eef8ef; border: 1px solid #a8d7ae; color: #225b2c; }
    small { color: #74675c; font-weight: 400; }
    @media (max-width: 640px) { main { margin: 0; padding: 16px; } .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>Instalador EventoSonic</h1>
      <p>Rellena los datos de MariaDB y del usuario del panel. El instalador creara <strong>data/secrets.php</strong>, las tablas necesarias y el usuario administrador.</p>

      <?php foreach ($errors as $error): ?>
        <div class="alert error"><?php echo h($error); ?></div>
      <?php endforeach; ?>

      <?php foreach ($messages as $message): ?>
        <div class="alert ok"><?php echo h($message); ?></div>
      <?php endforeach; ?>

      <form method="post" autocomplete="off">
        <div class="grid">
          <label>
            Servidor base de datos
            <input name="db_host" required value="<?php echo h($values['db_host']); ?>">
          </label>
          <label>
            Puerto
            <input name="db_port" type="number" required value="<?php echo h($values['db_port']); ?>">
          </label>
        </div>

        <div class="grid">
          <label>
            Nombre base de datos
            <input name="db_name" required value="<?php echo h($values['db_name']); ?>">
          </label>
          <label>
            Usuario base de datos
            <input name="db_user" required value="<?php echo h($values['db_user']); ?>">
          </label>
        </div>

        <label>
          Contrasena base de datos
          <input name="db_pass" type="password" value="<?php echo h($values['db_pass']); ?>">
        </label>

        <div class="grid">
          <label>
            Usuario del panel
            <input name="worker_user" required value="<?php echo h($values['worker_user']); ?>">
            <small>Por ejemplo: admin</small>
          </label>
          <label>
            Contrasena del panel
            <input name="worker_password" type="password" required minlength="8" value="<?php echo h($values['worker_password']); ?>">
          </label>
        </div>

        <div class="grid">
          <label>
            Email para avisos
            <input name="notification_email" type="email" required value="<?php echo h($values['notification_email']); ?>">
          </label>
          <label>
            Email remitente
            <input name="notification_from_email" type="email" required value="<?php echo h($values['notification_from_email']); ?>">
          </label>
        </div>

        <label>
          Nombre remitente
          <input name="notification_from_name" required value="<?php echo h($values['notification_from_name']); ?>">
        </label>

        <div class="grid">
          <label>
            Servidor SMTP
            <input name="smtp_host" value="<?php echo h($values['smtp_host']); ?>">
          </label>
          <label>
            Puerto SMTP
            <input name="smtp_port" type="number" value="<?php echo h($values['smtp_port']); ?>">
          </label>
        </div>

        <div class="grid">
          <label>
            Usuario SMTP
            <input name="smtp_user" value="<?php echo h($values['smtp_user']); ?>">
          </label>
          <label>
            Contrasena SMTP
            <input name="smtp_pass" type="password" value="<?php echo h($values['smtp_pass']); ?>">
          </label>
        </div>

        <label>
          Seguridad SMTP
          <input name="smtp_secure" value="<?php echo h($values['smtp_secure']); ?>">
          <small>Usa tls para STARTTLS con puerto 587, ssl para 465 o dejalo vacio solo si el servidor no exige cifrado.</small>
        </label>

        <label class="check">
          <input name="cookie_secure" type="checkbox" value="1" <?php echo $values['cookie_secure'] ? 'checked' : ''; ?>>
          Usar cookies seguras HTTPS
        </label>

        <label class="check">
          <input name="db_ssl" type="checkbox" value="1" <?php echo $values['db_ssl'] ? 'checked' : ''; ?>>
          MariaDB exige SSL
        </label>

        <button type="submit">Crear configuracion y usuario</button>
      </form>
    </section>
  </main>
</body>
</html>
