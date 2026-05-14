<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$pdo = es_pdo();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'POST') {
    es_require_json_content();
    $body = es_read_json_body();
    $r = es_normalize_booking($body);

    $sql = 'INSERT INTO requests (
        plan_name, client_name, client_email, client_phone, event_type, event_date, guests,
        extras_text, special_request, dietary_text, base_price, extras_price, total_price
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        $r['planName'],
        $r['clientName'],
        $r['clientEmail'],
        $r['clientPhone'],
        $r['eventType'],
        $r['eventDate'],
        $r['guests'],
        $r['extrasText'],
        $r['specialRequest'],
        $r['dietaryText'],
        $r['basePrice'],
        $r['extrasPrice'],
        $r['totalPrice'],
    ]);
    $id = (int) $pdo->lastInsertId();
    es_send_booking_email($r, $id);
    es_json_out(201, ['id' => $id, 'status' => 'pendiente']);
}

if ($method === 'GET') {
    es_require_auth($pdo);
    $status = isset($_GET['status']) ? (string) $_GET['status'] : '';
    if ($status !== '' && in_array($status, ES_STATUS_VALUES, true)) {
        $stmt = $pdo->prepare('SELECT * FROM requests WHERE status = ? ORDER BY created_at DESC');
        $stmt->execute([$status]);
    } else {
        $stmt = $pdo->query('SELECT * FROM requests ORDER BY created_at DESC');
    }
    $rows = $stmt->fetchAll();
    $out = array_map('es_public_request', $rows);
    es_json_out(200, ['requests' => $out]);
}

es_json_out(405, ['error' => 'Método no permitido']);
