<?php

declare(strict_types=1);

require __DIR__ . '/_bootstrap.php';

$pdo = es_pdo();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    try {
        es_json_out(200, ['events' => es_list_events($pdo)]);
    } catch (Throwable $error) {
        error_log('EventoSonic events GET error: ' . $error->getMessage());
        es_json_out(503, ['error' => 'La galería de eventos no está disponible temporalmente.']);
    }
}

if ($method === 'POST') {
    $session = es_require_auth($pdo);

    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > 0 && empty($_POST) && empty($_FILES)) {
        es_json_out(413, ['error' => 'La subida completa supera el límite configurado en PHP. Reduce el tamaño o el número de fotos.']);
    }

    $title = es_clean_text($_POST['title'] ?? '', 160);
    if ($title === '') {
        es_json_out(400, ['error' => 'Escribe un título para la temática del evento.']);
    }

    $cover = isset($_FILES['cover']) && is_array($_FILES['cover']) ? $_FILES['cover'] : [];
    if (!$cover || (int) ($cover['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        es_json_out(400, ['error' => 'Selecciona una foto principal.']);
    }

    $gallery = isset($_FILES['gallery']) && is_array($_FILES['gallery'])
        ? es_normalize_uploads($_FILES['gallery'])
        : [];
    $gallery = array_values(array_filter($gallery, static function (array $file): bool {
        return (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
    }));
    if (count($gallery) > ES_EVENT_MAX_IMAGES) {
        es_json_out(400, ['error' => 'Puedes añadir hasta 15 fotos de galería por evento.']);
    }

    $eventId = 0;
    try {
        es_ensure_event_tables($pdo);
        $pdo->beginTransaction();
        $insert = $pdo->prepare('INSERT INTO events (title, cover_image, created_by) VALUES (?, ?, ?)');
        $insert->execute([$title, '', $session['worker']['id']]);
        $eventId = (int) $pdo->lastInsertId();

        $directory = dirname(__DIR__) . '/uploads/events/' . $eventId;
        $coverPath = es_store_event_upload($cover, $directory, 'principal');
        $pdo->prepare('UPDATE events SET cover_image = ? WHERE id = ?')->execute([$coverPath, $eventId]);

        if ($gallery) {
            $imageInsert = $pdo->prepare(
                'INSERT INTO event_images (event_id, image_path, sort_order) VALUES (?, ?, ?)'
            );
            foreach ($gallery as $index => $file) {
                $imagePath = es_store_event_upload($file, $directory, 'foto-' . ($index + 1));
                $imageInsert->execute([$eventId, $imagePath, $index]);
            }
        }

        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ($eventId > 0) {
            es_remove_event_directory($eventId);
        }
        if ($error instanceof PDOException) {
            error_log('EventoSonic event POST database error: ' . $error->getMessage());
            es_json_out(503, ['error' => 'No se pudo guardar el evento en este momento.']);
        }
        es_json_out(400, ['error' => $error->getMessage()]);
    }

    $events = es_list_events($pdo);
    $created = null;
    foreach ($events as $event) {
        if ($event['id'] === $eventId) {
            $created = $event;
            break;
        }
    }

    es_json_out(201, ['event' => $created]);
}

es_json_out(405, ['error' => 'Método no permitido']);
