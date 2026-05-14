<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$pdo = es_pdo();
$session = es_require_auth($pdo);

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
if ($id < 1) {
    es_json_out(400, ['error' => 'Id no válido']);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT * FROM requests WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        es_json_out(404, ['error' => 'Solicitud no encontrada']);
    }
    es_json_out(200, ['request' => es_public_request($row)]);
}

if ($method === 'PATCH') {
    es_require_json_content();
    $body = es_read_json_body();
    $status = es_clean_text($body['status'] ?? '', 30);
    $notes = es_clean_text($body['notes'] ?? '', 1200);

    if (!in_array($status, ES_STATUS_VALUES, true)) {
        es_json_out(400, ['error' => 'Estado no válido']);
    }

    $stmt = $pdo->prepare('SELECT * FROM requests WHERE id = ?');
    $stmt->execute([$id]);
    $existing = $stmt->fetch();
    if (!$existing) {
        es_json_out(404, ['error' => 'Solicitud no encontrada']);
    }

    $acceptedBy = $status === 'aceptada' ? $session['worker']['id'] : $existing['accepted_by'];
    $acceptedAt = $existing['accepted_at'];
    if ($status === 'aceptada' && ($acceptedAt === null || $acceptedAt === '')) {
        $acceptedAt = gmdate('Y-m-d H:i:s');
    }

    $upd = $pdo->prepare(
        'UPDATE requests SET status = ?, worker_notes = ?, accepted_by = ?, accepted_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    );
    $upd->execute([$status, $notes, $acceptedBy, $acceptedAt, $id]);

    $stmt = $pdo->prepare('SELECT * FROM requests WHERE id = ?');
    $stmt->execute([$id]);
    $updated = $stmt->fetch();
    es_json_out(200, ['request' => es_public_request($updated)]);
}

if ($method === 'DELETE') {
    $stmt = $pdo->prepare('SELECT id FROM requests WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) {
        es_json_out(404, ['error' => 'Solicitud no encontrada']);
    }
    $pdo->prepare('DELETE FROM requests WHERE id = ?')->execute([$id]);
    es_json_out(200, ['ok' => true, 'id' => $id]);
}

es_json_out(405, ['error' => 'Método no permitido']);
