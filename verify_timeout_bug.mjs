// Reproduce el problema real que vivió Angela: le pidió algo a Angie y la petición a
// /api/chat se quedó colgada (nunca contesta, ni éxito ni error) — antes de este arreglo,
// eso dejaba el mensaje "Angie está leyendo y orquestando al equipo…" fijo PARA SIEMPRE,
// sin ningún aviso, indistinguible de que la app estuviera rota. Usamos el reloj falso de
// Playwright para adelantar el tiempo sin esperar 100 segundos reales.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
let failures = 0;
function ok(cond, msg) { if (cond) console.log("  ✓", msg); else { console.log("  ✗", msg); failures++; } }

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await page.route("**/api/hubspot", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configured: false }) }));

  // /api/chat nunca responde — simula exactamente lo que Angela vivió (o un servidor colgado).
  await page.route("**/api/chat", async () => { await new Promise(() => {}); });

  await page.goto(BASE);
  await page.waitForSelector("#authPw", { timeout: 3000 }).catch(() => {});
  await page.evaluate(() => localStorage.setItem("forwardai_wizard_v1", JSON.stringify({ companyName: "Boxer TTL" })));
  await page.reload();
  await page.waitForSelector("#q", { timeout: 4000 });

  await page.clock.install();

  await page.fill("#q", "Encargo de prueba de timeout");
  await page.click("#go");
  await page.waitForTimeout(200);

  const disabledWhileBusy = await page.locator("#newProj").isDisabled();
  ok(disabledWhileBusy, "mientras espera respuesta, 'Nuevo proyecto' se ve deshabilitado (como antes)");

  // Adelantamos 21s: el mensaje debe cambiar para avisar que puede tardar.
  await page.clock.fastForward(21000);
  await page.waitForTimeout(150);
  const midMsg = await page.locator("#thinkMsg").textContent().catch(() => null);
  ok(midMsg && /tardar hasta un par de minutos/i.test(midMsg), `a los 20s el mensaje avisa que puede tardar (obtuve: "${midMsg}")`);

  // Adelantamos hasta pasar los 100s totales: debe cancelarse sola con explicación.
  await page.clock.fastForward(85000); // ~106s en total
  await page.waitForTimeout(300);

  const errBox = await page.locator(".turn .err").last().textContent().catch(() => null);
  ok(errBox && /tardó más de lo normal/i.test(errBox), `pasados ~100s se cancela sola y explica por qué (obtuve: "${errBox}")`);

  const newProjEnabled = !(await page.locator("#newProj").isDisabled());
  ok(newProjEnabled, "y 'Nuevo proyecto' se vuelve a habilitar solo — ya no se queda pegada para siempre");

  await browser.close();
  console.log(failures ? `\n${failures} FALLA(S)` : "\nTODO OK — ya no se queda pegada en silencio: avisa a los 20s y se cancela con explicación a los 100s.");
  process.exit(failures ? 1 : 0);
})();
