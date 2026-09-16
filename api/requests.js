import nodemailer from "nodemailer";

const STATUS_PENDING = "pendiente";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Método no permitido" });
  }

  try {
    const booking = normalizeBooking(request.body || {});
    const created = await saveBooking(booking);
    const notificationSent = await sendBookingEmail(booking, created.id).catch((error) => {
      console.error("EventoSonic SMTP error", error);
      return false;
    });

    return response.status(201).json({
      id: created.id,
      status: created.status || STATUS_PENDING,
      notificationSent
    });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error("EventoSonic booking error", error);
    return response.status(status).json({
      error: status >= 500 ? "No se pudo guardar la solicitud en este momento." : error.message
    });
  }
}

async function saveBooking(booking) {
  const supabaseUrl = requiredEnvironment("SUPABASE_URL");
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    const error = new Error("Falta la clave privada de Supabase.");
    error.statusCode = 500;
    throw error;
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/requests?select=id,status`, {
    method: "POST",
    headers: {
      apikey: secretKey,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(booking)
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(rows) || !rows[0]) {
    const error = new Error("Supabase rechazó la nueva solicitud.");
    error.statusCode = 502;
    throw error;
  }
  return rows[0];
}

async function sendBookingEmail(booking, id) {
  const host = process.env.SMTP_HOST;
  const recipient = process.env.NOTIFICATION_EMAIL;
  if (!host || !recipient) return false;

  const port = Number(process.env.SMTP_PORT || 587);
  const secureSetting = String(process.env.SMTP_SECURE || "").toLowerCase();
  const secure = secureSetting === "ssl" || secureSetting === "true" || port === 465;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
      : undefined,
    requireTLS: secureSetting === "tls"
  });

  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || "no-reply@eventosonic.es";
  const fromName = process.env.NOTIFICATION_FROM_NAME || "EventoSonic";
  const text = [
    "Has recibido una nueva solicitud de reserva.",
    "",
    `Solicitud: #${id}`,
    `Plan: ${booking.plan_name}`,
    `Nombre: ${booking.client_name}`,
    `Email: ${booking.client_email}`,
    `Teléfono / WhatsApp: ${booking.client_phone}`,
    `Tipo de evento: ${booking.event_type}`,
    `Fecha: ${booking.event_date}`,
    `Invitados: ${booking.guests}`,
    `Extras: ${booking.extras_text}`,
    `Preferencias dietéticas: ${booking.dietary_text}`,
    `Petición especial: ${booking.special_request}`,
    "",
    `Precio base: ${booking.base_price} EUR`,
    `Extras: ${booking.extras_price} EUR`,
    `Total estimado: ${booking.total_price} EUR`
  ].join("\n");

  await transporter.sendMail({
    from: `"${fromName.replaceAll('"', "")}" <${fromEmail}>`,
    to: recipient,
    replyTo: booking.client_email,
    subject: `Nueva solicitud EventoSonic #${id} - ${booking.plan_name}`,
    text
  });
  return true;
}

function normalizeBooking(body) {
  const guests = Number.parseInt(body.invitados ?? body.guests, 10);
  const booking = {
    plan_name: cleanText(body.plan_nombre ?? body.planName, 80),
    client_name: cleanText(body.cliente_nombre ?? body.clientName, 120),
    client_email: cleanText(body.cliente_email ?? body.clientEmail, 180).toLowerCase(),
    client_phone: cleanText(body.cliente_telefono ?? body.clientPhone, 40),
    event_type: cleanText(body.evento_tipo ?? body.eventType, 80),
    event_date: cleanText(body.evento_fecha ?? body.eventDate, 20),
    guests,
    extras_text: cleanText(body.extras_lista ?? body.extrasText ?? "Sin extras añadidos", 800),
    special_request: cleanText(body.peticion_especial ?? body.specialRequest ?? "Sin petición especial", 1200),
    dietary_text: cleanText(body.dieteticas ?? body.dietaryText ?? "Sin preferencias dietéticas", 400),
    base_price: nonNegativeInteger(body.precio_base ?? body.basePrice),
    extras_price: nonNegativeInteger(body.precio_extras ?? body.extrasPrice),
    total_price: nonNegativeInteger(body.precio_total ?? body.totalPrice)
  };

  if (!booking.plan_name || !booking.client_name || !booking.event_type) badRequest("Faltan datos obligatorios.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.client_email)) badRequest("Email no válido.");
  if (!/^[+\d\s().-]{9,}$/.test(booking.client_phone)) badRequest("Teléfono no válido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.event_date)) badRequest("Fecha no válida.");
  if (!Number.isInteger(guests) || guests < 1 || guests > 10000) badRequest("Número de invitados no válido.");
  if (booking.total_price !== booking.base_price + booking.extras_price) badRequest("El importe de la solicitud no es válido.");

  return booking;
}

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function nonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) badRequest("Importe no válido.");
  return Math.max(0, Math.round(number));
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`Falta la variable ${name}.`);
    error.statusCode = 500;
    throw error;
  }
  return value;
}
