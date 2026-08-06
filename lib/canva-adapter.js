// Adaptador Canva — capa desacoplada de conexión con Canva Connect API.
//
// A diferencia de HubSpot (que usa un token fijo de "app privada" que vive para siempre
// en una variable de entorno), Canva solo permite OAuth 2.0 con Authorization Code + PKCE:
// no existe un modo de "API key" para actuar en nombre de un usuario. Eso significa que
// aquí no hay un token permanente guardado en Vercel — hay una conexión que Angela activa
// desde la app (botón "Conectar con Canva"), que dura el tiempo de la sesión del navegador
// (el access token vive 4 horas; cuando expira, vuelve a conectar con un clic).
//
// Fuente de todo esto: documentación oficial de Canva Connect API (canva.dev/docs/connect),
// leída y verificada el 2026-08-06 antes de escribir una sola línea de este archivo —
// nada aquí está inventado ni supuesto.

import crypto from "node:crypto";

const AUTHORIZE_URL = "https://www.canva.com/api/oauth/authorize";
const TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const DESIGNS_URL = "https://api.canva.com/rest/v1/designs";

// Scopes mínimos para lo que necesitamos: crear diseños (design:content:write para crear;
// meta:read para poder listarlos/verlos después) y leer el perfil (para confirmar la conexión).
export const CANVA_SCOPES = ["design:content:write", "design:meta:read", "profile:read"];

export class CanvaNotConfiguredError extends Error {
  constructor() {
    super("Canva no configurado: faltan CANVA_CLIENT_ID / CANVA_CLIENT_SECRET / CANVA_REDIRECT_URI.");
    this.code = "CANVA_NOT_CONFIGURED";
  }
}

export class CanvaError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function requireEnv() {
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  const redirectUri = process.env.CANVA_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new CanvaNotConfiguredError();
  return { clientId, clientSecret, redirectUri };
}

export function isCanvaConfigured() {
  return !!(process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET && process.env.CANVA_REDIRECT_URI);
}

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Genera el par PKCE (RFC 7636) que exige Canva: verifier de 43-128 chars + su challenge SHA-256. */
export function createPkce() {
  const verifier = base64url(crypto.randomBytes(64)); // ~86 chars, dentro del rango permitido
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function randomState() {
  return base64url(crypto.randomBytes(24));
}

/** Construye la URL de autorización a la que se redirige al usuario. */
export function buildAuthorizeUrl({ challenge, state }) {
  const { clientId, redirectUri } = requireEnv();
  const params = new URLSearchParams({
    code_challenge: challenge,
    code_challenge_method: "s256",
    scope: CANVA_SCOPES.join(" "),
    response_type: "code",
    client_id: clientId,
    state,
    redirect_uri: redirectUri,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Intercambia el código de autorización por el par access_token/refresh_token. */
export async function exchangeCodeForToken(code, verifier, fetcher = fetch) {
  const { clientId, clientSecret, redirectUri } = requireEnv();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code_verifier: verifier,
    code,
    redirect_uri: redirectUri,
  });
  const r = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new CanvaError(data.error_description || data.error || "No se pudo conectar con Canva.", r.status, data);
  return data; // { access_token, refresh_token, token_type, expires_in, scope }
}

/** Renueva el access token cuando expiró, usando el refresh token (de un solo uso: Canva regresa uno nuevo). */
export async function refreshAccessToken(refreshToken, fetcher = fetch) {
  const { clientId, clientSecret } = requireEnv();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  const r = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new CanvaError(data.error_description || data.error || "No se pudo renovar la conexión con Canva.", r.status, data);
  return data;
}

const PRESET_TYPES = new Set(["doc", "email", "presentation", "whiteboard"]);

/**
 * Crea un diseño nuevo en la cuenta de Canva del usuario conectado.
 * designType: uno de PRESET_TYPES (ej. "presentation") o "custom" con width/height.
 */
export async function createDesign({ accessToken, title, designType = "presentation", width, height, assetId }, fetcher = fetch) {
  if (!accessToken) throw new CanvaError("Falta el access token de Canva.", 401);

  const body = { type: "type_and_asset" };
  if (designType === "custom") {
    if (!width || !height) throw new CanvaError("Un diseño custom necesita width y height.", 400);
    body.design_type = { type: "custom", width, height };
  } else {
    const name = PRESET_TYPES.has(designType) ? designType : "presentation";
    body.design_type = { type: "preset", name };
  }
  if (assetId) body.asset_id = assetId;
  if (title) body.title = String(title).slice(0, 255);

  const r = await fetcher(DESIGNS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new CanvaError(data.message || "Canva rechazó la creación del diseño.", r.status, data);
  return data.design; // { id, urls: {edit_url, view_url}, title, thumbnail, ... }
}
