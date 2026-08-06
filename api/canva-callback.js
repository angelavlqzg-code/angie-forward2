// Paso 2 del OAuth de Canva: Canva regresa aquí con ?code=...&state=... después de que
// Angela autoriza. Verificamos el state (protección CSRF), intercambiamos el code por un
// access_token (usando el code_verifier que guardamos en el paso 1) y lo dejamos en una
// cookie httpOnly que dura lo mismo que el token (4 horas). No hay base de datos: cuando
// el token expira, Angela solo vuelve a darle clic a "Conectar con Canva".

import { exchangeCodeForToken, CanvaError, CanvaNotConfiguredError } from "../lib/canva-adapter.js";
import { parseCookies, serializeCookie, clearCookie, appendSetCookie } from "../lib/cookies.js";

function redirect(res, location) {
  res.status(302);
  if (res.setHeader) res.setHeader("Location", location);
  return res.end();
}

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405); return res.end("Método no permitido."); }

  const cookies = parseCookies(req.headers.cookie);
  const { code, state, error, error_description } = req.query || {};

  const isLocal = (req.headers.host || "").startsWith("localhost") || (req.headers.host || "").startsWith("127.0.0.1");

  // Limpia siempre las cookies de PKCE de un solo uso, pase lo que pase.
  appendSetCookie(res, clearCookie("canva_verifier", { secure: !isLocal }));
  appendSetCookie(res, clearCookie("canva_state", { secure: !isLocal }));

  if (error) {
    return redirect(res, `/?canva=error&msg=${encodeURIComponent(error_description || error)}`);
  }
  if (!code || !state || state !== cookies.canva_state) {
    return redirect(res, `/?canva=error&msg=${encodeURIComponent("La conexión con Canva no se pudo verificar (state inválido o expirado). Intenta de nuevo.")}`);
  }
  if (!cookies.canva_verifier) {
    return redirect(res, `/?canva=error&msg=${encodeURIComponent("La sesión de conexión con Canva expiró. Intenta de nuevo.")}`);
  }

  try {
    const tokenData = await exchangeCodeForToken(code, cookies.canva_verifier);
    const expiresIn = Number(tokenData.expires_in) || 14400;
    appendSetCookie(res, serializeCookie("canva_access_token", tokenData.access_token, {
      maxAge: Math.max(60, expiresIn - 30),
      secure: !isLocal,
    }));
    return redirect(res, "/?canva=ok");
  } catch (err) {
    if (err instanceof CanvaNotConfiguredError) {
      return redirect(res, `/?canva=error&msg=${encodeURIComponent(err.message)}`);
    }
    if (err instanceof CanvaError) {
      return redirect(res, `/?canva=error&msg=${encodeURIComponent(err.message)}`);
    }
    return redirect(res, `/?canva=error&msg=${encodeURIComponent("Error inesperado conectando con Canva: " + err.message)}`);
  }
}
