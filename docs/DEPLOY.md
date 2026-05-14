# EventoSonic — despliegue Apache + MariaDB (sin Node ni npm)

Esta carpeta está pensada para un hosting con **PHP** (7.4+ o 8.x) y **MariaDB/MySQL**. No hace falta `npm`, ni `node server.js`.

## 1. Extensiones PHP

Debe estar activo **pdo_mysql** (PDO para MySQL/MariaDB). En cPanel suele venir activado.

## 2. Base de datos

1. Crea la base y el usuario en el panel del hosting.
2. Importa **`data/import_mariadb.sql`** en esa base (phpMyAdmin → Importar).

## 3. Configuración secreta

1. Copia **`data/secrets.sample.php`** a **`data/secrets.php`** (mismo directorio `data/`).
2. Edita `secrets.php` con `db_*`, `session_secret`, `worker_user` y `worker_password`.
3. Si la tabla `workers` está **vacía**, al **primer** acceso a cualquier script de `api/` se creará el usuario del panel con esa contraseña (mismo algoritmo que la versión Node: PBKDF2-SHA256, 210000 iteraciones).

Si ya importaste trabajadores desde otro sitio, las contraseñas deben ser las mismas que allí (o cámbialas en base de datos).

## 4. Subir archivos

Sube **toda** la carpeta del proyecto al directorio público del dominio (por FTP o gestor de archivos), de modo que existan por ejemplo:

- `https://tudominio.es/index.html`
- `https://tudominio.es/api/login.php`

La carpeta **`data/`** debe ser **ilegible desde el navegador**: el `.htaccess` incluido en `data/` lo bloquea. No quites ese archivo.

## 5. Rutas de la API

El front llama a:

- `/api/login.php`, `/api/logout.php`, `/api/me.php`
- `/api/requests.php` (GET listado autenticado, POST nueva reserva pública)
- `/api/request.php?id=N` (GET detalle, PATCH, DELETE con sesión)

No necesitas reglas especiales en Apache si los PHP están en `/api/`.

## 6. Herramientas de mantenimiento

Las utilidades manuales están agrupadas en `tools/`:

- `/tools/instalador.php`
- `/tools/probar-correo.php`

Cuando termines de usarlas en producción, elimina esos archivos del servidor o restringe su acceso.

## 7. HTTPS y cookies

Con **HTTPS** deja `cookie_secure` en `true` en `secrets.php`.  
Si pruebas en **HTTP** sin certificado, pon `cookie_secure` en `false` o el navegador no guardará la cookie de sesión.

## 8. Cambiar contraseña del panel

Desde phpMyAdmin no es trivial (hash PBKDF2). Lo más simple: vacía la tabla `workers`, borra sesiones en `sessions`, deja `worker_password` en `secrets.php` y recarga el sitio para que se vuelva a crear el usuario inicial.

---

**No compartas** `secrets.php` ni credenciales por chat; configúralas solo en el servidor.
