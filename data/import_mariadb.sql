-- EventoSonic — esquema para MariaDB / MySQL
-- Importa desde phpMyAdmin o: mysql -u USUARIO -p NOMBRE_BD < data/import_mariadb.sql
--
-- Muchos hostings ya te asignan la base de datos: en ese caso NO uses CREATE DATABASE
-- y selecciona tu base en phpMyAdmin antes de ejecutar este script (o comenta USE).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Opcional: solo si tienes permisos y quieres una base nueva con este nombre
-- CREATE DATABASE IF NOT EXISTS eventosonic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE eventosonic;

CREATE TABLE IF NOT EXISTS workers (
  id INT NOT NULL AUTO_INCREMENT,
  username VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY workers_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(255) NOT NULL,
  worker_id INT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT sessions_worker_fk FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS requests (
  id INT NOT NULL AUTO_INCREMENT,
  plan_name VARCHAR(120) NOT NULL,
  client_name VARCHAR(160) NOT NULL,
  client_email VARCHAR(220) NOT NULL,
  client_phone VARCHAR(60) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  event_date DATE NOT NULL,
  guests INT NOT NULL,
  extras_text TEXT NOT NULL,
  special_request TEXT NOT NULL,
  dietary_text TEXT NOT NULL,
  base_price INT NOT NULL,
  extras_price INT NOT NULL,
  total_price INT NOT NULL,
  status ENUM('pendiente', 'aceptada', 'rechazada', 'contactada') NOT NULL DEFAULT 'pendiente',
  worker_notes TEXT NOT NULL DEFAULT '',
  accepted_by INT NULL,
  accepted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT requests_accepted_by_fk FOREIGN KEY (accepted_by) REFERENCES workers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
