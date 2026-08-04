# Conectar HubSpot de verdad

## 1. Crea el token
HubSpot → ⚙️ Configuración → Integraciones → Apps privadas → **Crear una app privada**.
Nómbrala `Angie`. En **Scopes**, activa lectura y escritura de:
- `crm.objects.contacts.read` / `.write`
- `crm.objects.companies.read` / `.write`
- `crm.objects.deals.read` / `.write`
- `crm.objects.notes.write` (o el scope de "engagements" según tu versión de HubSpot)

Crea la app, copia el token (empieza con `pat-...`). Agrégalo en Vercel → tu proyecto →
Settings → Environment Variables → `HUBSPOT_ACCESS_TOKEN`. **No lo pegues en el chat con Angie.**

## 2. Propiedades personalizadas recomendadas (opcional, pero mejora el registro)
El adaptador manda estos campos si existen; si no existen todavía, los quita
automáticamente y sigue registrando el contacto/empresa/deal sin ellos (ver
`lib/hubspot-adapter.js`, manejo del error "Property ... does not exist"). Para
que sí se guarden, créalos en HubSpot → Configuración → Propiedades:

| Objeto | Nombre interno | Tipo | Para qué |
|---|---|---|---|
| Contacto | `forward_vertical` | Selección única | Gobierno / RH / Ventas / Fiscal / Retail |
| Contacto | `forward_campaign` | Texto | Qué campaña generó el lead |
| Contacto | `forward_buyer_interest` | Texto | Interés detectado por los agentes |
| Empresa | `forward_vertical` | Selección única | Igual que en contacto |
| Deal | `forward_campaign` | Texto | Campaña de origen |
| Deal | `forward_next_action` | Texto | Siguiente acción recomendada |
| Deal | `forward_agent_recommendation` | Texto largo | Recomendación del agente |
| Deal | `forward_owning_agent` | Texto | Qué agente (código) atiende la oportunidad |

## 3. Pipeline de deals
Hoy el portal conectado (verificado el 2026-08-04 vía HubSpot) solo tiene el pipeline
**Sales Pipeline** default de HubSpot, con 7 etapas estándar. El documento de estrategia
pide 11 etapas conceptuales del journey Forward. Mientras no exista un pipeline
`Forward AI` a la medida, `lib/hubspot-adapter.js` (`PIPELINE_STAGE_MAP`) las mapea así:

| Etapa Forward | Etapa real en HubSpot hoy |
|---|---|
| Nuevo lead / Lead por calificar / Contacto iniciado | *(no crea deal todavía — se maneja como `lifecyclestage` del contacto)* |
| Reunión programada | `appointmentscheduled` |
| Oportunidad identificada | `qualifiedtobuy` |
| Prueba de valor | `presentationscheduled` |
| Propuesta | `decisionmakerboughtin` |
| Negociación | `contractsent` |
| Ganado | `closedwon` |
| Perdido | `closedlost` |
| Expansión | *(se maneja como deal nuevo, no como etapa)* |

Si más adelante creas un pipeline `Forward AI` con las 11 etapas reales, solo hay que
actualizar `PIPELINE_STAGE_MAP` con los internal names nuevos — el resto del código no cambia.

## 4. Probar que funciona (prueba real, tú la corres — no yo)
Por qué la corres tú: el conector de HubSpot que tienes conectado en este chat solo puede
crear/editar **campañas de marketing y landing pages** (lo verifiqué directo en sus
herramientas: `manage_campaign_objects`, `manage_landing_page`) — no tiene ninguna
herramienta para crear o editar contactos, empresas o deals. La escritura de esos objetos
solo la puede hacer la app, con su propio `HUBSPOT_ACCESS_TOKEN` en Vercel, que
correctamente nunca me pasas por chat. Por eso el único cierre honesto al 100% de esta
pieza es que tú (o quien tenga el token) corra esta prueba una vez:

1. Confirma que la variable llegó a Vercel:
   ```
   curl -s https://TU-DOMINIO.vercel.app/api/hubspot
   ```
   Debe responder `{"configured":true}`. Si dice `false`, la variable no se guardó o falta redeploy.

2. Registra un contacto de prueba real:
   ```
   curl -s -X POST https://TU-DOMINIO.vercel.app/api/hubspot \
     -H "Content-Type: application/json" \
     -d '{"action":"upsertContact","payload":{"email":"prueba-angie@tu-dominio.com","firstName":"Prueba"}}'
   ```
   Si responde con un `id` de HubSpot, la escritura real quedó probada de punta a punta
   (Vercel → tu adaptador → API real de HubSpot). Búscalo en tu portal para confirmarlo
   a simple vista, y bórralo cuando termines de probar.

Ninguno de estos dos comandos expone tu token — va guardado del lado del servidor en
Vercel, no en la URL ni en el body.
