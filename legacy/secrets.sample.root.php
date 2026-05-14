<?php

/**
 * Copia este archivo a secrets.php (mismo directorio) y rellena los valores.
 * NO subas secrets.php a repositorios públicos.
 */
return [
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'nombre_de_tu_base',
    'db_user' => 'usuario_mariadb',
    'db_pass' => 'contraseña_mariadb',

    // Cadena larga y aleatoria (mínimo 16 caracteres)
    'session_secret' => 'CAMBIA_esto_por_un_texto_largo_aleatorio_minimo_48_caracteres',

    // Si la tabla workers está vacía, se creará este usuario al primer acceso a la API
    'worker_user' => 'admin',
    'worker_password' => 'Pon_aqui_clave_segura_minimo_10_caracteres',

    // Avisos cuando entra una nueva solicitud de reserva
    'notification_email' => 'eventosonic25@gmail.com',
    'notification_from_email' => 'eventosonic25@javier.teconecto.es',
    'notification_from_name' => 'EventoSonic',

    // SMTP autenticado. Rellena estos datos si mail() de PHP no entrega correos.
    'smtp_host' => 'mail.javier.teconecto.es',
    'smtp_port' => 587,
    'smtp_user' => 'eventosonic25@javier.teconecto.es',
    'smtp_pass' => 'CONTRASENA_DEL_BUZON',
    'smtp_secure' => 'tls',

    // true si el sitio va por HTTPS; false solo para pruebas en http
    'cookie_secure' => true,

    // true si MariaDB exige SSL (p.ej. algunos hostings en la nube)
    'db_ssl' => false,
];
