<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    es_json_out(405, ['error' => 'Método no permitido']);
}

$pdo = es_pdo();
$session = es_get_session($pdo);
if ($session) {
    $pdo->prepare('DELETE FROM sessions WHERE id = ?')->execute([$session['id']]);
}
es_clear_session_cookie();
es_json_out(200, ['ok' => true]);
