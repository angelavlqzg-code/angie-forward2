# Angie · Cómo ponerla en línea
### Guía para Angela. No necesitas saber programar. Sigue los pasos en orden.

Al terminar vas a tener **una liga propia** (algo como `angie-forward.vercel.app`) que puedes
abrir en tu celular, enseñarle a Isaí y mostrarle a un cliente.

**Tiempo:** entre 30 y 45 minutos la primera vez.
**Costo:** el hospedaje es gratis. Solo pagas lo que Angie consume de IA (centavos por uso).

---

## Antes de empezar: las 3 llaves

Yo escribí todo el código. Estas 3 cosas son lo único que solo tú puedes hacer,
porque son cuentas a tu nombre.

---

## PASO 1 · Saca la llave de Anthropic (el cerebro de Angie)

1. Entra a **console.anthropic.com** y crea tu cuenta.
2. En el menú busca **API Keys** → **Create Key**.
3. Ponle de nombre `angie`.
4. **Cópiala y guárdala en un bloc de notas.** Solo te la muestran una vez.
   Empieza con `sk-ant-...`
5. Ve a **Billing** y carga saldo (con 5 o 10 dólares te alcanza para muchísimas pruebas).

> ⚠️ Esa llave es como la contraseña de una tarjeta. **Nunca la pegues en un chat,
> ni en un correo, ni me la mandes a mí.** No la necesito.

---

## PASO 2 · Saca la llave de Google (las imágenes, Nano Banana)

1. Entra a **aistudio.google.com** con tu cuenta de Google.
2. Busca **Get API key** → **Create API key**.
3. Cópiala y guárdala junto a la otra.

> Este paso es **opcional**. Si lo saltas, Angie funciona igual: solo no podrá generar
> fotografías. Las piezas de diseño (posts, placas, one-pagers) siguen funcionando.

---

## PASO 3 · Sube el proyecto a GitHub

GitHub es donde vive el código. Es gratis.

1. Entra a **github.com** y crea tu cuenta.
2. Arriba a la derecha, el botón **+** → **New repository**.
3. Nombre: `angie-forward`. Márcalo como **Private**. Dale **Create repository**.
4. En la pantalla que sigue, da clic en **uploading an existing file**.
5. **Arrastra ahí la carpeta completa** que te di (descomprimida).
6. Abajo, dale **Commit changes**.

---

## PASO 4 · Publícala con Vercel

Vercel es quien pone tu app en internet. Gratis.

1. Entra a **vercel.com** → **Sign up** → elige **Continue with GitHub**.
2. Dale **Add New** → **Project**.
3. Te va a aparecer `angie-forward`. Dale **Import**.
4. **⚠️ ANTES de darle Deploy**, abre la sección **Environment Variables** y agrega:

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | tu llave del Paso 1 |
   | `GOOGLE_API_KEY` | tu llave del Paso 2 |

   (Escribe el nombre **exactamente así**, en mayúsculas y con guiones bajos.)

5. Ahora sí: **Deploy**.
6. Espera un minuto. Te va a dar tu liga. **Ábrela: ahí está Angie.**

---

## Listo. ¿Qué acabas de lograr?

- Angie vive en internet, con liga propia.
- **Las llaves están guardadas en el servidor**, no en la app. Nadie que abra la liga puede robarlas.
  (Por eso hicimos todo esto y no lo dejamos como estaba.)
- Las descargas de PNG **ya funcionan** — la limitación era de la ventana de prueba, no de tu app.
- Ya genera **imágenes reales** con Nano Banana, además de las piezas de diseño.

---

## Cómo cambiarle cosas después

Todo el "cerebro" de Angie es texto. Está en `public/index.html`, en la parte que empieza
con `const SYSTEM =`. Ahí están el ADN de marca, las reglas de tono y las de diseño.

Para editarlo: entra a tu repositorio en GitHub, abre el archivo, dale al **lápiz**,
cambia el texto y dale **Commit changes**. Vercel lo actualiza solo en un minuto.

Si algo se rompe, GitHub guarda todas las versiones anteriores. No puedes hacer un daño permanente.

---

## Si algo falla

| Lo que ves | Qué significa |
|---|---|
| "Falta la llave ANTHROPIC_API_KEY" | No la guardaste en Vercel, o el nombre está mal escrito. Revisa el Paso 4. |
| "credit balance is too low" | Se acabó el saldo en Anthropic. Recarga en Billing. |
| Las imágenes fallan pero el texto sí funciona | Falta la llave de Google (Paso 2). Todo lo demás sigue sirviendo. |
| Cualquier otra cosa | Mándame el mensaje de error tal cual y lo arreglo. |

---

## Lo que sigue (cuando lo quieras vender)

Esto ya es un producto real, pero para cobrarle a un cliente le falta:

- **Cuentas de usuario** (que cada cliente entre a lo suyo)
- **Memoria** (hoy olvida al recargar la página)
- **Conexión a sus sistemas** (su CRM, su correo)

Nada de eso tira lo que ya tienes: se construye encima. Cuando llegues ahí, me dices y lo hacemos.
