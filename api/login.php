<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    es_json_out(405, ['error' => 'Método no permitido']);
}

es_require_json_content();
$body = es_read_json_body();
$pdo = es_pdo();

$username = es_clean_text($body['username'] ?? '', 80);
$password = (string) ($body['password'] ?? '');

if ($username === '') {
    es_json_out(400, ['error' => 'Introduce el usuario.']);
}

if ($password === '') {
    es_json_out(400, ['error' => 'Introduce la contraseña.']);
}

$stmt = $pdo->prepare('SELECT * FROM workers WHERE username = ?');
$stmt->execute([$username]);
$worker = $stmt->fetch();

if (!$worker) {
    es_json_out(401, ['error' => 'El usuario no existe. Revisa mayúsculas y minúsculas.']);
}

if (!es_verify_password($password, $worker['password_salt'], $worker['password_hash'])) {
    es_json_out(401, ['error' => 'La contraseña no es correcta.']);
}

$token = es_random_token_b64url();
$c = es_config();
$sessionId = es_hash_token($c['session_secret'] . ':' . $token);
$expiresAt = (int) floor(microtime(true) * 1000) + (ES_SESSION_TTL_SEC * 1000);

$ins = $pdo->prepare('INSERT INTO sessions (id, worker_id, expires_at) VALUES (?,?,?)');
$ins->execute([$sessionId, $worker['id'], $expiresAt]);

es_set_session_cookie($token, (int) ($expiresAt / 1000));
es_json_out(200, ['worker' => es_public_worker($worker)]);
