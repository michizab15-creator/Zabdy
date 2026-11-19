// Sapti — servidor web sin dependencias externas (Node >= 18)
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_HOURS = 12;

const STATUSES = ['nuevo', 'contactado', 'reunion', 'propuesta', 'ganado', 'perdido'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

// ---------- almacenamiento ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
let leads = [];
try {
  leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  if (!Array.isArray(leads)) leads = [];
} catch { leads = []; }

let writeQueued = false;
function persist() {
  if (writeQueued) return;
  writeQueued = true;
  setImmediate(() => {
    writeQueued = false;
    const tmp = LEADS_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(leads, null, 2), (err) => {
      if (err) return console.error('Error guardando leads', err);
      fs.rename(tmp, LEADS_FILE, (e) => e && console.error('Error renombrando', e));
    });
  });
}

// ---------- utilidades ----------
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; " +
    "base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  const payload = isObj ? JSON.stringify(body) : body;
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...(isObj ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    ...headers,
  });
  res.end(payload);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

const clean = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0] : req.socket.remoteAddress || '').trim();
}

// límite simple de peticiones por IP
const hits = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => hits.clear(), 60 * 60 * 1000).unref();

// ---------- sesiones (token firmado HMAC en cookie HttpOnly) ----------
function sign(data) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
}
function makeToken() {
  const exp = String(Date.now() + SESSION_HOURS * 3600 * 1000);
  return exp + '.' + sign(exp);
}
function validToken(token) {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  const expected = sign(exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) && Number(exp) > Date.now();
}
function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}
function isAuthed(req) { return validToken(getCookie(req, 'sapti_session')); }
function cookieFlags(req) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `; Path=/; HttpOnly; SameSite=Strict${secure}`;
}
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---------- CSV ----------
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // evita inyección de fórmulas
  return '"' + s.replace(/"/g, '""') + '"';
}
function leadsToCsv(list) {
  const cols = ['id', 'createdAt', 'status', 'name', 'email', 'phone', 'company', 'service', 'message', 'diagnosticScore', 'notes'];
  const rows = list.map((l) => cols.map((c) => csvCell(c === 'diagnosticScore' ? (l.diagnostic ? l.diagnostic.overall : '') : l[c])).join(','));
  return '﻿' + cols.join(',') + '\n' + rows.join('\n');
}

// ---------- API ----------
async function handleApi(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/health') return send(res, 200, { ok: true });

  if (p === '/api/leads' && m === 'POST') {
    if (rateLimited('lead:' + clientIp(req), 8, 15 * 60 * 1000)) {
      return send(res, 429, { error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.' });
    }
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: 'Solicitud inválida.' }); }
    if (clean(body.website)) return send(res, 200, { ok: true }); // honeypot anti-spam
    const lead = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'nuevo',
      name: clean(body.name, 120),
      email: clean(body.email, 160),
      phone: clean(body.phone, 40),
      company: clean(body.company, 160),
      service: clean(body.service, 80),
      message: clean(body.message, 3000),
      notes: '',
      diagnostic: null,
    };
    const errors = {};
    if (lead.name.length < 2) errors.name = 'Escribe tu nombre.';
    if (!isEmail(lead.email)) errors.email = 'Escribe un correo válido.';
    if (lead.message.length < 5) errors.message = 'Cuéntanos un poco más (mínimo 5 caracteres).';
    if (body.consent !== true) errors.consent = 'Necesitamos tu autorización para contactarte.';
    if (Object.keys(errors).length) return send(res, 422, { error: 'Revisa los campos marcados.', errors });
    if (body.diagnostic && typeof body.diagnostic === 'object') {
      const d = body.diagnostic;
      const num = (x) => Math.max(0, Math.min(100, Math.round(Number(x) || 0)));
      lead.diagnostic = {
        overall: num(d.overall),
        areas: Array.isArray(d.areas)
          ? d.areas.slice(0, 6).map((a) => ({ name: clean(a.name, 60), score: num(a.score) }))
          : [],
      };
    }
    leads.unshift(lead);
    persist();
    return send(res, 201, { ok: true });
  }

  if (p === '/api/login' && m === 'POST') {
    if (rateLimited('login:' + clientIp(req), 10, 15 * 60 * 1000)) {
      return send(res, 429, { error: 'Demasiados intentos. Espera 15 minutos.' });
    }
    if (!ADMIN_PASSWORD) return send(res, 503, { error: 'El panel no está configurado (falta ADMIN_PASSWORD).' });
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { error: 'Solicitud inválida.' }); }
    if (!safeEqual(clean(body.password, 200), ADMIN_PASSWORD)) {
      return send(res, 401, { error: 'Contraseña incorrecta.' });
    }
    return send(res, 200, { ok: true }, {
      'Set-Cookie': `sapti_session=${makeToken()}${cookieFlags(req)}; Max-Age=${SESSION_HOURS * 3600}`,
    });
  }

  if (p === '/api/logout' && m === 'POST') {
    return send(res, 200, { ok: true }, { 'Set-Cookie': `sapti_session=${cookieFlags(req)}; Max-Age=0` });
  }

  if (p === '/api/session' && m === 'GET') return send(res, 200, { authed: isAuthed(req) });

  // ---- rutas protegidas ----
  if (!isAuthed(req)) return send(res, 401, { error: 'Inicia sesión.' });

  if (p === '/api/leads' && m === 'GET') return send(res, 200, { leads, statuses: STATUSES });

  if (p === '/api/leads.csv' && m === 'GET') {
    return send(res, 200, leadsToCsv(leads), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sapti-prospectos-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
  }

  const match = p.match(/^\/api\/leads\/([0-9a-f-]{36})$/);
  if (match) {
    const idx = leads.findIndex((l) => l.id === match[1]);
    if (idx === -1) return send(res, 404, { error: 'No encontrado.' });
    if (m === 'PATCH') {
      let body;
      try { body = await readBody(req); } catch { return send(res, 400, { error: 'Solicitud inválida.' }); }
      if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) return send(res, 422, { error: 'Estado inválido.' });
        leads[idx].status = body.status;
      }
      if (body.notes !== undefined) leads[idx].notes = clean(body.notes, 5000);
      leads[idx].updatedAt = new Date().toISOString();
      persist();
      return send(res, 200, { lead: leads[idx] });
    }
    if (m === 'DELETE') {
      leads.splice(idx, 1);
      persist();
      return send(res, 200, { ok: true });
    }
  }

  return send(res, 404, { error: 'Ruta no encontrada.' });
}

// ---------- archivos estáticos ----------
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Prohibido', { 'Content-Type': 'text/plain' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      return fs.readFile(path.join(PUBLIC_DIR, '404.html'), (e, buf) =>
        send(res, 404, e ? 'No encontrado' : buf, { 'Content-Type': MIME['.html'] }));
    }
    const ext = path.extname(file).toLowerCase();
    const cache = ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600';
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cache,
      'Content-Length': st.size,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método no permitido', { 'Content-Type': 'text/plain' });
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Error interno.' });
  }
});

server.listen(PORT, () => console.log(`Sapti escuchando en http://localhost:${PORT}`));
