// Sesión de acceso — firma y verifica la cookie de login, sin base de datos.
//
// Dos contraseñas compartidas (ANGIE_ADMIN_PASSWORD / ANGIE_GUEST_PASSWORD), NO cuentas
// individuales: quien entra con la de admin es "admin", quien entra con la de invitada es
// "invitada". La cookie guarda {role, iat} y va firmada con HMAC-SHA256 usando
// ANGIE_SESSION_SECRET, para que nadie pueda escribir "role":"admin" a mano en su navegador
// y colarse — sin esa firma, el servidor rechaza la sesión.
//
// Esto NO es un sistema de autenticación robusto de nivel empresa (sin rotación de
// contraseñas, sin recuperación, sin 2FA) — es lo mínimo honesto para separar "dirección"
// de "quien solo está probando la app", documentado así a propósito.

import crypto from "node:crypto";

export const SESSION_COOKIE = "angie_session";
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hmac(data, secret) {
  return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

export function isSessionConfigured() {
  return !!(process.env.ANGIE_SESSION_SECRET && (process.env.ANGIE_ADMIN_PASSWORD || process.env.ANGIE_GUEST_PASSWORD));
}

/** Revisa la contraseña recibida contra las dos configuradas. Regresa el rol o null. */
export function roleForPassword(password) {
  if (!password) return null;
  if (process.env.ANGIE_ADMIN_PASSWORD && password === process.env.ANGIE_ADMIN_PASSWORD) return "admin";
  if (process.env.ANGIE_GUEST_PASSWORD && password === process.env.ANGIE_GUEST_PASSWORD) return "invitada";
  return null;
}

/** Firma {role, iat} en un string cookie-safe: base64url(json).firma */
export function signSession(role, secret = process.env.ANGIE_SESSION_SECRET) {
  if (!secret) throw new Error("Falta ANGIE_SESSION_SECRET.");
  const payload = base64url(Buffer.from(JSON.stringify({ role, iat: Date.now() })));
  return `${payload}.${hmac(payload, secret)}`;
}

/** Verifica la firma y la expiración. Regresa {role} o null si es inválida/vencida/manipulada. */
export function verifySession(cookieValue, secret = process.env.ANGIE_SESSION_SECRET, maxAgeSec = DEFAULT_MAX_AGE) {
  if (!cookieValue || !secret) return null;
  const dot = cookieValue.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = hmac(payload, secret);
  // Comparación en tiempo constante — evita filtrar por timing si alguien intenta adivinar la firma.
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, "base64").toString("utf8")); } catch { return null; }
  if (!data || (data.role !== "admin" && data.role !== "invitada")) return null;
  if (typeof data.iat !== "number" || Date.now() - data.iat > maxAgeSec * 1000) return null;
  return { role: data.role };
}
