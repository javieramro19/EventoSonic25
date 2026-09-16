<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$pdo = es_pdo();
es_require_auth($pdo);
es_ensure_event_tables($pdo);

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
if ($id < 1) {
    es_json_out(400, ['error' => 'Id no válido']);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'DELETE') {
    es_json_out(405, ['error' => 'Método no permitido']);
}

$stmt = $pdo->prepare('SELECT id FROM events WHERE id = ?');
$stmt->execute([$id]);
if (!$stmt->fetch()) {
    es_json_out(404, ['error' => 'Evento no encontrado']);
}

$pdo->prepare('DELETE FROM events WHERE id = ?')->execute([$id]);
es_remove_event_directory($id);
es_json_out(200, ['ok' => true, 'id' => $id]);

