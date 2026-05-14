<?php

declare(strict_types=1);

const ES_SESSION_COOKIE = 'eventosonic_session';
const ES_SESSION_TTL_SEC = 8 * 3600;
const ES_STATUS_VALUES = ['pendiente', 'aceptada', 'rechazada', 'contactada'];

function es_config(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $path = dirname(__DIR__) . '/data/secrets.php';
    if (!is_readable($path)) {
        es_json_out(500, ['error' => 'Falta data/secrets.php. Copia data/secrets.sample.php a data/secrets.php y configura MariaDB.']);
    }
    $loaded = require $path;
    if (!is_array($loaded)) {
        es_json_out(500, ['error' => 'secrets.php debe devolver un array de configuración.']);
    }
    $cfg = array_merge([
        'db_host' => 'localhost',
        'db_port' => 3306,
        'db_name' => '',
        'db_user' => '',
        'db_pass' => '',
        'session_secret' => '',
        'worker_user' => 'admin',
        'worker_password' => '',
        'notification_email' => 'eventosonic25@gmail.com',
        'notification_from_email' => 'no-reply@javier.teconecto.es',
        'notification_from_name' => 'EventoSonic',
        'smtp_host' => '',
        'smtp_port' => 587,
        'smtp_user' => '',
        'smtp_pass' => '',
        'smtp_secure' => '',
        'cookie_secure' => true,
        'db_ssl' => false,
    ], $loaded);
    if ($cfg['session_secret'] === '' || strlen($cfg['session_secret']) < 16) {
        es_json_out(500, ['error' => 'session_secret demasiado corto o vacío en secrets.php']);
    }
    if ($cfg['db_name'] === '' || $cfg['db_user'] === '') {
        es_json_out(500, ['error' => 'db_name y db_user son obligatorios en secrets.php']);
    }
    return $cfg;
}

function es_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $c = es_config();
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $c['db_host'],
        (int) $c['db_port'],
        $c['db_name']
    );
    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
    ];
    if (!empty($c['db_ssl'])) {
        $opts[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = false;
    }
    $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], $opts);
    es_purge_sessions($pdo);
    es_seed_worker($pdo, $c);
    return $pdo;
}

function es_json_out(int $code, array $data): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function es_require_json_content(): void
{
    $ct = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
    if (stripos($ct, 'application/json') === false) {
        es_json_out(415, ['error' => 'Content-Type no válido']);
    }
}

function es_read_json_body(int $maxBytes = 65536): array
{
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || strlen($raw) > $maxBytes) {
        es_json_out(413, ['error' => 'La petición es demasiado grande']);
    }
    try {
        $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        es_json_out(400, ['error' => 'JSON no válido']);
    }
    return is_array($data) ? $data : [];
}

function es_clean_text(mixed $value, int $max): string
{
    $s = preg_replace("/[\x00-\x1f\x7f]/u", ' ', (string) ($value ?? ''));
    $s = preg_replace('/\s+/u', ' ', trim($s));
    return mb_substr($s, 0, $max, 'UTF-8');
}

function es_hash_password(string $password, string $salt): string
{
    $bin = hash_pbkdf2('sha256', $password, $salt, 210000, 32, true);
    return bin2hex($bin);
}

function es_verify_password(string $password, string $salt, string $expectedHex): bool
{
    $actual = es_hash_password($password, $salt);
    return strlen($actual) === strlen($expectedHex) && hash_equals(strtolower($actual), strtolower($expectedHex));
}

function es_hash_token(string $value): string
{
    return hash('sha256', $value, false);
}

function es_random_token_b64url(): string
{
    $b64 = base64_encode(random_bytes(32));
    return rtrim(strtr($b64, '+/', '-_'), '=');
}

function es_parse_cookies(): array
{
    $out = [];
    $header = $_SERVER['HTTP_COOKIE'] ?? '';
    foreach (explode(';', $header) as $part) {
        $part = trim($part);
        if ($part === '') {
            continue;
        }
        $eq = strpos($part, '=');
        if ($eq === false) {
            $out[$part] = '';
            continue;
        }
        $name = trim(substr($part, 0, $eq));
        $out[$name] = urldecode(trim(substr($part, $eq + 1)));
    }
    return $out;
}

function es_set_session_cookie(string $token, int $expiresAtUnix): void
{
    $c = es_config();
    setcookie(ES_SESSION_COOKIE, $token, [
        'expires' => $expiresAtUnix,
        'path' => '/',
        'secure' => (bool) $c['cookie_secure'],
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function es_clear_session_cookie(): void
{
    $c = es_config();
    setcookie(ES_SESSION_COOKIE, '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => (bool) $c['cookie_secure'],
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function es_get_session(PDO $pdo): ?array
{
    $cookies = es_parse_cookies();
    $token = $cookies[ES_SESSION_COOKIE] ?? '';
    if ($token === '') {
        return null;
    }
    $c = es_config();
    $id = es_hash_token($c['session_secret'] . ':' . $token);
    $stmt = $pdo->prepare(
        'SELECT sessions.id, sessions.expires_at, workers.id AS worker_id, workers.username
         FROM sessions
         JOIN workers ON workers.id = sessions.worker_id
         WHERE sessions.id = ?'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    if ((int) $row['expires_at'] < (int) (microtime(true) * 1000)) {
        $del = $pdo->prepare('DELETE FROM sessions WHERE id = ?');
        $del->execute([$row['id']]);
        return null;
    }
    return [
        'id' => $row['id'],
        'worker' => [
            'id' => (int) $row['worker_id'],
            'username' => $row['username'],
        ],
    ];
}

function es_require_auth(PDO $pdo): array
{
    $s = es_get_session($pdo);
    if (!$s) {
        es_json_out(401, ['error' => 'No autorizado']);
    }
    return $s;
}

function es_public_worker(array $worker): array
{
    return [
        'id' => (int) $worker['id'],
        'username' => $worker['username'],
    ];
}

function es_public_request(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'planName' => $row['plan_name'],
        'clientName' => $row['client_name'],
        'clientEmail' => $row['client_email'],
        'clientPhone' => $row['client_phone'],
        'eventType' => $row['event_type'],
        'eventDate' => $row['event_date'],
        'guests' => (int) $row['guests'],
        'extrasText' => $row['extras_text'],
        'specialRequest' => $row['special_request'],
        'dietaryText' => $row['dietary_text'],
        'basePrice' => (int) $row['base_price'],
        'extrasPrice' => (int) $row['extras_price'],
        'totalPrice' => (int) $row['total_price'],
        'status' => $row['status'],
        'workerNotes' => $row['worker_notes'],
        'acceptedBy' => $row['accepted_by'] !== null ? (int) $row['accepted_by'] : null,
        'acceptedAt' => $row['accepted_at'],
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
    ];
}

function es_send_booking_email(array $request, int $id): bool
{
    $c = es_config();
    $to = trim((string) ($c['notification_email'] ?? ''));
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return false;
    }

    $fromEmail = trim((string) ($c['notification_from_email'] ?? ''));
    if ($fromEmail === '' || !filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
        $fromEmail = 'no-reply@javier.teconecto.es';
    }

    $fromName = es_clean_text($c['notification_from_name'] ?? 'EventoSonic', 80);
    $subject = 'Nueva solicitud EventoSonic #' . $id . ' - ' . $request['planName'];
    $replyTo = filter_var($request['clientEmail'], FILTER_VALIDATE_EMAIL) ? $request['clientEmail'] : $fromEmail;

    $lines = [
        'Has recibido una nueva solicitud de reserva.',
        '',
        'Solicitud: #' . $id,
        'Plan: ' . $request['planName'],
        'Nombre: ' . $request['clientName'],
        'Email: ' . $request['clientEmail'],
        'Telefono / WhatsApp: ' . $request['clientPhone'],
        'Tipo de evento: ' . $request['eventType'],
        'Fecha: ' . $request['eventDate'],
        'Invitados: ' . $request['guests'],
        'Extras: ' . $request['extrasText'],
        'Preferencias dieteticas: ' . $request['dietaryText'],
        'Peticion especial: ' . $request['specialRequest'],
        '',
        'Precio base: ' . $request['basePrice'] . ' EUR',
        'Extras: ' . $request['extrasPrice'] . ' EUR',
        'Total estimado: ' . $request['totalPrice'] . ' EUR',
        '',
        'Panel:',
        'https://javier.teconecto.es/panel.html',
    ];

    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'From: "' . str_replace('"', '', $fromName) . '" <' . $fromEmail . '>',
        'Reply-To: ' . $replyTo,
        'X-Mailer: PHP/' . phpversion(),
    ];

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    return es_send_email($to, $encodedSubject, implode("\r\n", $lines), $headers, $fromEmail);
}

function es_send_email(string $to, string $subject, string $body, array $headers, string $fromEmail): bool
{
    $c = es_config();
    if (!empty($c['smtp_host'])) {
        try {
            return es_smtp_send($to, $subject, $body, $headers, $fromEmail, $c);
        } catch (Throwable $e) {
            $GLOBALS['ES_LAST_MAIL_ERROR'] = $e->getMessage();
            error_log('EventoSonic SMTP error: ' . $e->getMessage());
            return false;
        }
    }

    $sent = @mail($to, $subject, $body, implode("\r\n", $headers));
    if (!$sent) {
        $GLOBALS['ES_LAST_MAIL_ERROR'] = 'La funcion mail() de PHP devolvio false.';
    }
    return $sent;
}

function es_smtp_send(string $to, string $subject, string $body, array $headers, string $fromEmail, array $c): bool
{
    $host = (string) $c['smtp_host'];
    $port = (int) ($c['smtp_port'] ?? 587);
    $secure = strtolower((string) ($c['smtp_secure'] ?? ''));
    $user = (string) ($c['smtp_user'] ?? '');
    $pass = (string) ($c['smtp_pass'] ?? '');
    $remote = ($secure === 'ssl' ? 'ssl://' : '') . $host . ':' . $port;
    $context = stream_context_create([
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
            'allow_self_signed' => true,
            'SNI_enabled' => true,
            'peer_name' => $host,
        ],
    ]);

    $socket = @stream_socket_client($remote, $errno, $errstr, 20, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) {
        throw new RuntimeException('No se pudo conectar con SMTP: ' . $errstr);
    }

    stream_set_timeout($socket, 20);

    $read = static function () use ($socket): string {
        $response = '';
        while (($line = fgets($socket, 515)) !== false) {
            $response .= $line;
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }
        return $response;
    };

    $expect = static function (array $codes) use ($read): string {
        $response = $read();
        $code = (int) substr($response, 0, 3);
        if (!in_array($code, $codes, true)) {
            throw new RuntimeException('Respuesta SMTP inesperada: ' . trim($response));
        }
        return $response;
    };

    $send = static function (string $command, array $codes) use ($socket, $expect): string {
        fwrite($socket, $command . "\r\n");
        return $expect($codes);
    };

    $expect([220]);
    $helloHost = $_SERVER['HTTP_HOST'] ?? 'javier.teconecto.es';
    $send('EHLO ' . $helloHost, [250]);

    if ($secure === 'tls') {
        $send('STARTTLS', [220]);
        if (!es_enable_smtp_tls($socket)) {
            throw new RuntimeException('No se pudo activar TLS en SMTP.');
        }
        $send('EHLO ' . $helloHost, [250]);
    }

    if ($user !== '' || $pass !== '') {
        $send('AUTH LOGIN', [334]);
        $send(base64_encode($user), [334]);
        $send(base64_encode($pass), [235]);
    }

    $send('MAIL FROM:<' . $fromEmail . '>', [250]);
    $send('RCPT TO:<' . $to . '>', [250, 251]);
    $send('DATA', [354]);

    $messageHeaders = $headers;
    $messageHeaders[] = 'To: <' . $to . '>';
    $messageHeaders[] = 'Subject: ' . $subject;
    $messageHeaders[] = 'Date: ' . date(DATE_RFC2822);
    $messageHeaders[] = 'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $helloHost . '>';

    $message = implode("\r\n", $messageHeaders) . "\r\n\r\n" . $body;
    $message = preg_replace('/^\./m', '..', $message);
    fwrite($socket, $message . "\r\n.\r\n");
    $expect([250]);
    $send('QUIT', [221]);
    fclose($socket);

    return true;
}

function es_enable_smtp_tls(mixed $socket): bool
{
    $methods = [];
    if (defined('STREAM_CRYPTO_METHOD_TLS_CLIENT')) {
        $methods[] = STREAM_CRYPTO_METHOD_TLS_CLIENT;
    }
    if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
        $methods[] = STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
    }
    if (defined('STREAM_CRYPTO_METHOD_TLSv1_1_CLIENT')) {
        $methods[] = STREAM_CRYPTO_METHOD_TLSv1_1_CLIENT;
    }
    if (defined('STREAM_CRYPTO_METHOD_TLSv1_0_CLIENT')) {
        $methods[] = STREAM_CRYPTO_METHOD_TLSv1_0_CLIENT;
    }

    foreach (array_unique($methods) as $method) {
        if (@stream_socket_enable_crypto($socket, true, $method)) {
            return true;
        }
    }

    return false;
}

function es_purge_sessions(PDO $pdo): void
{
    $now = (int) floor(microtime(true) * 1000);
    $pdo->prepare('DELETE FROM sessions WHERE expires_at < ?')->execute([$now]);
}

function es_seed_worker(PDO $pdo, array $c): void
{
    $n = (int) $pdo->query('SELECT COUNT(*) AS n FROM workers')->fetch()['n'];
    if ($n > 0) {
        return;
    }
    $user = es_clean_text($c['worker_user'] ?? 'admin', 80);
    $pass = (string) ($c['worker_password'] ?? '');
    if ($pass === '') {
        return;
    }
    $salt = bin2hex(random_bytes(16));
    $hash = es_hash_password($pass, $salt);
    $ins = $pdo->prepare('INSERT INTO workers (username, password_hash, password_salt) VALUES (?,?,?)');
    $ins->execute([$user, $hash, $salt]);
}

function es_normalize_booking(array $body): array
{
    $rawGuests = $body['invitados'] ?? $body['guests'] ?? null;
    if (!filter_var($rawGuests, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 10000]])) {
        es_json_out(400, ['error' => 'Número de invitados no válido']);
    }
    $request = [
        'planName' => es_clean_text($body['plan_nombre'] ?? $body['planName'] ?? '', 80),
        'clientName' => es_clean_text($body['cliente_nombre'] ?? $body['clientName'] ?? '', 120),
        'clientEmail' => mb_strtolower(es_clean_text($body['cliente_email'] ?? $body['clientEmail'] ?? '', 180), 'UTF-8'),
        'clientPhone' => es_clean_text($body['cliente_telefono'] ?? $body['clientPhone'] ?? '', 40),
        'eventType' => es_clean_text($body['evento_tipo'] ?? $body['eventType'] ?? '', 80),
        'eventDate' => es_clean_text($body['evento_fecha'] ?? $body['eventDate'] ?? '', 20),
        'guests' => (int) $rawGuests,
        'extrasText' => es_clean_text($body['extras_lista'] ?? $body['extrasText'] ?? 'Sin extras añadidos', 800),
        'specialRequest' => es_clean_text($body['peticion_especial'] ?? $body['specialRequest'] ?? 'Sin petición especial', 1200),
        'dietaryText' => es_clean_text($body['dieteticas'] ?? $body['dietaryText'] ?? 'Sin preferencias dietéticas', 400),
        'basePrice' => (float) ($body['precio_base'] ?? $body['basePrice'] ?? 0),
        'extrasPrice' => (float) ($body['precio_extras'] ?? $body['extrasPrice'] ?? 0),
        'totalPrice' => (float) ($body['precio_total'] ?? $body['totalPrice'] ?? 0),
    ];

    if ($request['planName'] === '' || $request['clientName'] === '' || $request['eventType'] === '' || $request['eventDate'] === '') {
        es_json_out(400, ['error' => 'Faltan datos obligatorios']);
    }
    if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/u', $request['clientEmail'])) {
        es_json_out(400, ['error' => 'Email no válido']);
    }
    if (!preg_match('/^[+\d\s().-]{9,}$/u', $request['clientPhone'])) {
        es_json_out(400, ['error' => 'Teléfono no válido']);
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $request['eventDate'])) {
        es_json_out(400, ['error' => 'Fecha no válida']);
    }
    if (!is_finite($request['basePrice']) || !is_finite($request['extrasPrice']) || !is_finite($request['totalPrice'])) {
        es_json_out(400, ['error' => 'Importe no válido']);
    }
    $request['basePrice'] = max(0, (int) round($request['basePrice']));
    $request['extrasPrice'] = max(0, (int) round($request['extrasPrice']));
    $request['totalPrice'] = max(0, (int) round($request['totalPrice']));

    return $request;
}
