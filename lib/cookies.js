// Ayudantes mínimos de cookies (leer/escribir) sin dependencias externas.
// Se usan solo para la conexión con Canva: guardan el code_verifier/state de PKCE
// mientras dura el redireccionamiento, y después el access/refresh token de la sesión.
// httpOnly siempre — el navegador nunca lee estos valores con JS, solo los reenvía.

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

/** Arma el valor de un header Set-Cookie. maxAge en segundos; omítelo para cookie de sesión. */
export function serializeCookie(name, value, { maxAge, path = "/", httpOnly = true, sameSite = "Lax", secure = true } = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=${path}`;
  if (maxAge !== undefined) s += `; Max-Age=${maxAge}`;
  if (httpOnly) s += "; HttpOnly";
  if (sameSite) s += `; SameSite=${sameSite}`;
  if (secure) s += "; Secure";
  return s;
}

/** Cookie de borrado inmediato (Max-Age=0). */
export function clearCookie(name, opts = {}) {
  return serializeCookie(name, "", { ...opts, maxAge: 0 });
}

/** Agrega uno o más Set-Cookie a la respuesta sin pisar los que ya se hayan puesto. */
export function appendSetCookie(res, cookieStr) {
  const prev = res.getHeader ? res.getHeader("Set-Cookie") : undefined;
  let next;
  if (!prev) next = cookieStr;
  else if (Array.isArray(prev)) next = [...prev, cookieStr];
  else next = [prev, cookieStr];
  res.setHeader("Set-Cookie", next);
}
