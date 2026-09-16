const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const settings = getSettings();
    const caller = await requireAdmin(request, settings);

    if (request.method === 'GET') {
      const workers = await listWorkers(settings, caller.id);
      return response.status(200).json({ workers });
    }

    const input = normalizeWorker(request.body || {});
    const worker = await createWorker(settings, input, caller.id);
    return response.status(201).json({ worker });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    if (status >= 500) console.error('EventoSonic workers error', error);
    return response.status(status).json({
      error: status >= 500 ? 'No se pudo gestionar el equipo en este momento.' : error.message
    });
  }
}

function getSettings() {
  const supabaseUrl = requiredEnvironment('SUPABASE_URL').replace(/\/$/, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!publishableKey || !secretKey) serverError('Faltan las claves de Supabase.');
  return { supabaseUrl, publishableKey, secretKey };
}

async function requireAdmin(request, settings) {
  const authorization = String(request.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) unauthorized('Inicia sesión para gestionar trabajadores.');

  const userResponse = await fetch(`${settings.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: settings.publishableKey,
      Authorization: `Bearer ${match[1]}`
    }
  });
  const user = await userResponse.json().catch(() => null);
  if (!userResponse.ok || !user?.id) unauthorized('La sesión no es válida o ha caducado.');

  const adminResponse = await fetch(
    `${settings.supabaseUrl}/rest/v1/app_admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id&limit=1`,
    { headers: dataHeaders(settings.secretKey) }
  );
  const admins = await adminResponse.json().catch(() => []);
  if (!adminResponse.ok) serverError('No se pudo comprobar el acceso del administrador.');
  if (!Array.isArray(admins) || !admins.length) forbidden('No tienes permiso para gestionar trabajadores.');
  return user;
}

async function listWorkers(settings, currentUserId) {
  const [profilesResponse, usersResponse] = await Promise.all([
    fetch(
      `${settings.supabaseUrl}/rest/v1/app_admins?select=user_id,display_name,created_at&order=created_at.desc`,
      { headers: dataHeaders(settings.secretKey) }
    ),
    fetch(`${settings.supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
      headers: adminHeaders(settings.secretKey)
    })
  ]);

  const profiles = await profilesResponse.json().catch(() => []);
  const userPayload = await usersResponse.json().catch(() => ({}));
  if (!profilesResponse.ok || !Array.isArray(profiles)) serverError('No se pudo leer la lista de trabajadores.');
  if (!usersResponse.ok) serverError('No se pudieron consultar los usuarios de acceso.');

  const users = Array.isArray(userPayload.users)
    ? userPayload.users
    : Array.isArray(userPayload)
      ? userPayload
      : [];
  const usersById = new Map(users.map((user) => [user.id, user]));

  return profiles.map((profile) => {
    const user = usersById.get(profile.user_id);
    return mapWorker(profile, user, currentUserId);
  });
}

async function createWorker(settings, input, currentUserId) {
  const authResponse = await fetch(`${settings.supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      ...adminHeaders(settings.secretKey),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { display_name: input.displayName }
    })
  });
  const authPayload = await authResponse.json().catch(() => ({}));
  const user = authPayload.user || authPayload;
  if (!authResponse.ok || !user?.id) {
    const message = String(authPayload.msg || authPayload.message || '').toLowerCase();
    if (authResponse.status === 422 || message.includes('already') || message.includes('registered')) {
      conflict('Ya existe un usuario con ese email.');
    }
    serverError('Supabase no pudo crear el usuario.');
  }

  const profileResponse = await fetch(`${settings.supabaseUrl}/rest/v1/app_admins?select=user_id,display_name,created_at`, {
    method: 'POST',
    headers: {
      ...dataHeaders(settings.secretKey),
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ user_id: user.id, display_name: input.displayName })
  });
  const profiles = await profileResponse.json().catch(() => []);
  if (!profileResponse.ok || !Array.isArray(profiles) || !profiles[0]) {
    await fetch(`${settings.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'DELETE',
      headers: adminHeaders(settings.secretKey)
    }).catch(() => {});
    serverError('El usuario se creó, pero no se pudo autorizar para el panel.');
  }

  return mapWorker(profiles[0], user, currentUserId);
}

function mapWorker(profile, user, currentUserId) {
  return {
    id: profile.user_id,
    displayName: profile.display_name || user?.user_metadata?.display_name || 'Trabajador',
    email: user?.email || '',
    createdAt: profile.created_at || user?.created_at || null,
    isCurrent: profile.user_id === currentUserId
  };
}

function normalizeWorker(body) {
  const displayName = cleanText(body.displayName, 80);
  const email = cleanText(body.email, 180).toLowerCase();
  const password = String(body.password || '');
  if (!displayName) badRequest('Escribe el nombre del trabajador.');
  if (!EMAIL_PATTERN.test(email)) badRequest('Introduce un email válido.');
  if (password.length < 8) badRequest('La contraseña debe tener al menos 8 caracteres.');
  if (password.length > 72) badRequest('La contraseña no puede superar los 72 caracteres.');
  return { displayName, email, password };
}

function adminHeaders(secretKey) {
  const headers = { apikey: secretKey };
  if (!secretKey.startsWith('sb_')) headers.Authorization = `Bearer ${secretKey}`;
  return headers;
}

function dataHeaders(secretKey) {
  return adminHeaders(secretKey);
}

function cleanText(value, maxLength) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) serverError(`Falta la variable ${name}.`);
  return value;
}

function badRequest(message) {
  throw httpError(400, message);
}

function unauthorized(message) {
  throw httpError(401, message);
}

function forbidden(message) {
  throw httpError(403, message);
}

function conflict(message) {
  throw httpError(409, message);
}

function serverError(message) {
  throw httpError(500, message);
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
