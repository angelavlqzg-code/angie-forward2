// Paso 1 del OAuth de Canva: genera el par PKCE, lo guarda en cookies httpOnly de corta
// vida (10 min — solo dura lo que tarda el usuario en autorizar en Canva) y redirige al
// navegador a la pantalla de autorización de Canva. No hay nada que llamar por fetch aquí:
// el botón "Conectar con Canva" del front navega directo a esta URL (window.location).

import { isCanvaConfigured, createPkce, randomState, buildAuthorizeUrl } from "../lib/canva-adapter.js";
import { serializeCookie, appendSetCookie } from "../lib/cookies.js";

function errorPage(message) {
  return `<!doctype html><html lang="es"><meta charset="utf-8">
  <body style="font-family:system-ui;max-width:560px;margin:80px auto;color:#0C1024">
    <h2>No se pudo conectar con Canva</h2>
    <p>${message}</p>
    <p><a href="/">Volver a Angie</a></p>
  </body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405); return res.end("Método no permitido."); }

  if (!isCanvaConfigured()) {
    res.status(200);
    if (res.setHeader) res.setHeader("content-type", "text/html; charset=utf-8");
    return res.end(errorPage(
      "Todavía falta configurar CANVA_CLIENT_ID, CANVA_CLIENT_SECRET y CANVA_REDIRECT_URI " +
      "en las variables de entorno de Vercel. Ve a canva.com/developers/integrations, crea una " +
      "integración pública, copia esos tres datos y pégalos en Vercel → tu proyecto → Settings → " +
      "Environment Variables."
    ));
  }

  const { verifier, challenge } = createPkce();
  const state = randomState();

  const isLocal = (req.headers.host || "").startsWith("localhost") || (req.headers.host || "").startsWith("127.0.0.1");
  const cookieOpts = { maxAge: 600, secure: !isLocal };
  appendSetCookie(res, serializeCookie("canva_verifier", verifier, cookieOpts));
  appendSetCookie(res, serializeCookie("canva_state", state, cookieOpts));

  const authorizeUrl = buildAuthorizeUrl({ challenge, state });
  res.status(302);
  if (res.setHeader) res.setHeader("Location", authorizeUrl);
  return res.end();
}
