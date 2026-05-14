<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    es_json_out(405, ['error' => 'Método no permitido']);
}

$pdo = es_pdo();
$session = es_require_auth($pdo);
es_json_out(200, ['worker' => [
    'id' => (int) $session['worker']['id'],
    'username' => $session['worker']['username'],
]]);
