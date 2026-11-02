# Diez Mail. Documento maestro del proyecto

CRM de coleccionistas y sistema de campañas de Diez Gallery. Sustituye a Arternal con un stack propio: Next.js 14 en Vercel, Airtable, Resend para enviar y Gmail (solo lectura) para la bandeja.

> Este documento sustituye a los antiguos `SETUP.md` y `AIRTABLE_SETUP.md`, que describían campos y flujos que ya no existen (Surname, Status, Tags, envío por Gmail API). Si algo aquí contradice al código, manda el código.

---

## 1. Versiones y cómo cambiar entre ellas

| Rama | Qué es | Dónde se ve |
|---|---|---|
| `main` | 1.x, la versión en producción | `https://diez-mail.vercel.app` |
| `v1.0` | Copia congelada de la 1.x (commit `71ec4c9`), red de seguridad | Solo en GitHub |
| `v2` | Diez Mail 2.0 | `https://diez-mail-git-v2-aweekendwithgod-9153s-projects.vercel.app` (preview, pide sesión de Vercel) |

Las dos versiones comparten la misma base de Airtable. Todo lo que añadió la 2.0 en Airtable es aditivo (tablas y campos nuevos), así que la 1.x sigue funcionando igual.

**Pasar la 2.0 a producción:** en GitHub, abrir un pull request de `v2` hacia `main` y hacer merge. Vercel despliega solo en 1-2 minutos.

**Volver a la 1.x si algo falla:** Vercel > diez-mail > Deployments > el último deployment de producción anterior al merge > menú "..." > Instant Rollback. Es inmediato. Para dejarlo también en el código: `git revert` del merge, o hacer `main` igual a `v1.0`.

Ojo: los crons solo corren en producción. Mientras la 2.0 sea preview, el scoring nocturno sigue siendo el de la 1.x.

---

## 2. Stack

| Capa | Tecnología | Función |
|---|---|---|
| App | Next.js 14 (App Router) | UI y API routes en un solo proyecto |
| Hosting | Vercel (plan Free) | Deploy automático desde GitHub |
| Datos | Airtable, base "diez mail" `appFkqvnXlu2Y1Fe4` | Fuente de verdad única |
| Envío | Resend | Envía como diego@diez.gallery |
| Bandeja | Gmail API, solo lectura | Página Mail y timeline de cada persona |
| Obras | Proxy público de `rooms.diez.gallery/api/airtable` y `/api/image` | Títulos, artista, estado, precio e imagen de las obras vistas, sin que el token de mail toque el inventario |
| Auth | Contraseña + cookie HMAC de 30 días (`middleware.js`) | Protege todo salvo las rutas públicas |
| Avisos | Web Push propio (RFC 8291/8292), sin dependencias | Notificaciones en el móvil |

El dominio diez.gallery vive en Mailcheap. SPF, DKIM y DMARC pasan.

---

## 3. Qué hace la 2.0

**Navegación:** cuatro secciones (Today, People, Campaigns, Mail), barra inferior en móvil y búsqueda global con ⌘K.

**Today (`/`).** Bandeja de señales.
- **Act now:** visitas a viewing rooms, obras vistas, PDF, inquiries y leads de feria, con miniaturas de las obras.
- **Warming up:** aperturas y clics, plegados por defecto.
- **Due:** próximas acciones vencidas o de la semana.
- **Activity:** actividad de los últimos 3 días.
- Cada tarjeta tiene Reply, Done y Later (2 días, 1 semana, 3 semanas). El contador del menú solo cuenta lo que exige acción.

**Fair mode (`/fair`).** Leads de Booth QR por día y qué hicieron en la room. Desde el móvil se puede tomar una nota y fijar la fase de cada lead, y después de la feria mandar un follow-up a los que elijas. Se refresca cada minuto.

**People (`/contacts`).** Pestañas:
- **List:** filtros por tipo, fase y próxima acción; orden por calidez, actividad o "menos contactados"; selección múltiple para lanzar campaña.
- **Pipeline:** kanban con arrastrar y soltar y movimientos sugeridos según el score.
- **Works:** cada obra con quién la miró y quién preguntó, y botón para escribirles.
- **Hygiene:** rebotados, duplicados, sin nombre y emails mal formados, con arreglo de un clic.
- **Tracked links:** enlaces individuales para WhatsApp.

**Ficha de persona.** Señales abiertas, pipeline, intereses, próxima acción, notas, visitas y tiempo en rooms, las obras que ha mirado con imagen y precio, campañas recibidas y timeline unificado con los hilos de Gmail.

**Campaigns.**
- **Composer:** filtros de destinatarios (tipo, fase, score, ciudad, artista visto, no contactado en N días, activo en N días) y segmentos guardados.
- **Preview:** escritorio y móvil, como cualquier destinatario.
- **Comprobaciones previas con arreglo:** nombres que faltan, PDF sin tag o tag sin PDF.
- **Envío:** texto configurable del enlace PDF y envío en lotes de 20 con progreso y reanudación.
- **Acciones sobre una campaña:** duplicar, follow-up a quienes se implicaron, reenviar a quienes no abrieron y añadir destinatarios.
- **Informe:** embudo en personas (entregado, abierto, clic, room, obras, inquiry) sin eventos de escáneres, más comparación entre campañas.

**Push.** Aviso en el móvil por inquiry o WhatsApp desde una room, por visita larga y por lead de feria. Se activa con "Enable alerts" en cada dispositivo. En iPhone solo funciona con la app instalada en la pantalla de inicio (iOS 16.4+).

**Eliminado respecto a la 1.x:** envíos programados (nunca se usaban) y la página Follow-ups (ahora vive en Today; `/followups` redirige).

---

## 4. Airtable "diez mail" (`appFkqvnXlu2Y1Fe4`)

Separada a propósito de la base de inventario (`appkTmFvjmDLOQS4p`), que esta app no lee nunca con su token.

- **People** (`tbl3NlUODD2Ztq3sl`)
  - Identidad: First Name, **Last Name**, Email, Phone, City, Company.
  - Clasificación: Type (multiselección: Collector, Advisor, Curator, Institution, Press, Gallery, Booth QR…), Pipeline (Prospect, Warm, Interested, Negotiating, Collector, Inactive), Interests.
  - Seguimiento: Notes, Do Not Email, Engagement Score, Score Updated, Next Action, Next Action Date.
  - Enlaces: Campaigns, Email Events, Short Links.
  - Rollups: Total Active Seconds, Max Session Seconds.
- **Campaigns** (`tblzn08PVCsp5yReC`)
  - Contenido: Name, Subject, Body Template, PDF Link, PDF Label (2.0).
  - Estado: Status, People, Created (2.0).
  - Métricas: Sent Count, Failed Count, Unique Opens, Total Opens, Unique Clicks, Open Rate, Click Rate.
  - Enlaces: Email Events, Short Links.
  - Scheduled For queda en la base pero la 2.0 no lo usa.
- **Email Events** (`tblmKb3ZntR5MNPo2`)
  - Identificación: Event ID, Event Type, Timestamp, Campaign, Campaign ID, Person, Recipient Email, Tracking ID.
  - Contexto técnico: Device, User Agent, IP Address, Gmail Message ID, Error Message.
  - Clics: Clicked URL, Link Type.
  - Obras: Artwork ID, Artwork Title.
  - Sesiones: Session ID, Active Seconds.
  - Tipos de evento:
    - Envío: Sent, Failed, Bounced, Complained.
    - Lectura: Open, Click.
    - Viewing room: Viewing Room Open, Artwork View, Lightbox Open, PDF Download, Related Room Click, Room Heartbeat.
    - Contacto: Inquire Click, WhatsApp Click.
    - Seguimiento: Followed Up.
  - Los leads de feria son eventos Sent cuyo Event ID empieza por `lead-`.
- **Templates:** Name, Subject, Body.
- **Short Links:** Code, Destination URL, Recipient Email, Person, Campaign, Tracking ID, Label, Created.
- **Segments** (2.0): Name, Filters (JSON).
- **Push Subscriptions** (2.0): Endpoint, Keys (JSON), Device.

Las consultas de eventos de la 2.0 (`lib/events.js`) van acotadas por tiempo y por campos, nunca por número de registros. La 1.x leía "los 5.000 más recientes", lo que hacía que el scoring perdiera historia en silencio al crecer la tabla.

---

## 5. Variables de entorno (Vercel)

| Variable | Uso |
|---|---|
| `AIRTABLE_PAT`, `AIRTABLE_BASE_ID` | Base diez mail |
| `RESEND_API_KEY`, `RESEND_SENDER_EMAIL`, `RESEND_SENDER_NAME` | Envío |
| `RESEND_WEBHOOK_SECRET` | Rebotes y quejas (firma Svix verificada a mano) |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER_EMAIL`, `GMAIL_SENDER_NAME` | Lectura de la bandeja |
| `NEXT_PUBLIC_APP_URL` | Base de píxel y redirecciones de clic |
| `TRACKING_SECRET` | HMAC de tracking, cookie de sesión y, en la 2.0, origen de las claves VAPID de push |
| `APP_PASSWORD` | Contraseña de entrada |
| `CRON_SECRET` | Protege el cron de scoring |
| `NEWSLETTER_AIRTABLE_PAT` (opcional, 2.0) | Token que solo puede crear registros en Contacts de la base de inventario. Sin él se usa `AIRTABLE_PAT`, que entonces necesita acceso a esa base. |
| `VAPID_PRIVATE_KEY` (opcional, 2.0) | Solo si se quiere separar push de `TRACKING_SECRET`. Cambiarla obliga a reactivar avisos en cada dispositivo. |

Para que la preview de `v2` funcione, las variables tienen que estar marcadas también para el entorno Preview (Settings > Environment Variables).

**Refresh token de Gmail:** la app de Google Cloud tiene que estar en modo Production o el token caduca a los 7 días. Para regenerarlo:
1. Ir a OAuth Playground y, en el engranaje, activar "Use your own OAuth credentials".
2. Pedir el scope de lectura de Gmail.
3. Iniciar sesión con diego@diez.gallery e intercambiar el código por tokens.
4. Pegar el refresh token en Vercel y hacer redeploy.

---

## 6. Tracking

- **Apertura:** píxel 1x1 firmado con HMAC (`/api/track/[data]`).
- **Clic:** redirección server-side (`/api/track/click/[data]`). Los enlaces a `rooms.diez.gallery` llegan con `?t=trackingId`.
- **Viewing rooms:** mandan eventos a `/api/ev` (sendBeacon, CORS solo para rooms.diez.gallery), heartbeats a `/api/ev/heartbeat` y leads del QR de feria a `/api/ev/lead`.
- **Solo se atribuye lo identificado.** Los visitantes anónimos no generan eventos, por diseño.
- **Ruido filtrado** (`lib/botDetection.js`): proxies de imágenes, escáneres corporativos que abren y pulsan todo en los primeros 60 segundos tras el envío, y eventos duplicados. Los informes y el scoring de la 2.0 lo descartan.
- **Las aperturas son aproximadas.** Apple Mail las precarga y algunos clientes bloquean imágenes. Clics, visitas a rooms e inquiries son fiables.

**Merge tags:** `{{first_name}}`, `{{surname}}`, `{{full_name}}`, `{{email}}`, `{{city}}`, `{{company}}`, `{{pdf_link}}`. Todos aceptan valor por defecto: `{{first_name|there}}`.

---

## 7. Estructura

```
app/
  page.js                 Today
  fair/                   Fair mode
  contacts/               People: list, [id], pipeline, hygiene
  works/                  Obras e interesados
  links/                  Tracked links
  campaigns/              list, [id] (informe), new (composer), templates
  mail/                   Bandeja Gmail
  login/
  api/                    today, fair, contacts, works, hygiene, segments, campaigns,
                          send, send-test, templates, links, mail, push, search-index,
                          activity, ev, track, s, newsletter, webhooks/resend,
                          cron/update-scores, scores/recalculate
components/               ui.js (sistema de componentes), NavBar, CommandPalette,
                          ActivityFeed, PushToggle, composer/RecipientPicker, charts
lib/
  airtable.js             Cliente y escrituras
  events.js               Consultas de eventos acotadas por tiempo, con caché
  model.js                People/Campaigns cacheados y motor de señales
  interest.js, artworks.js  Qué obras ha mirado cada persona y sus datos
  scoring.js, recompute-scores.js, botDetection.js
  merge.js, segments.js, signature.js, tracking.js, resend.js
  push.js, alerts.js      Web Push
  gmail-read.js           Bandeja
public/fonts/             Replica (misma tipografía que las viewing rooms)
```

---

## 8. Seguridad

- Credenciales solo en Vercel.
- Cookie httpOnly y secure, con un token HMAC derivado de la contraseña (nunca la contraseña en claro).
- Login limitado por IP, CORS restringido a rooms.diez.gallery y CSP estricta en `vercel.json`.
- Las previews de Vercel van protegidas por Vercel Authentication.
- **Pendiente: el repositorio `diegodiezp/diez-mail` se puede clonar sin credenciales, es decir, es público.** Contiene los teléfonos de la firma (`lib/signature.js`), IDs de bases y la lógica de tracking. Ponerlo en privado en GitHub > Settings > General > Danger Zone > Change visibility. Vercel sigue desplegando igual.

---

## 9. Lecciones aprendidas

1. Las rutas de tracking necesitan `export const dynamic = 'force-dynamic'`.
2. En `filterByFormula`, un linked record se resuelve al campo primario (el nombre), no al ID. Por eso existe el campo de texto `Campaign ID` en Email Events.
3. Al cambiar de paso en el composer, React desmonta el `contentEditable`. Hay que capturar el HTML en state antes de cambiar.
4. `useSearchParams()` necesita un límite de Suspense o el build se cuelga.
5. Los emails importados traen espacios y mayúsculas. Toda comparación pasa por `normEmail()`.
6. Nunca leer "los N eventos más recientes" para cálculos históricos: acotar por fecha.
7. El service worker no debe cachear HTML (servía pantallas viejas tras cada deploy en la PWA). La 2.0 solo cachea assets y una página offline.

---

## 10. Comandos

```bash
# Trabajar en la 2.0
git checkout v2
git add . && git commit -m "..." && git push        # Vercel crea una preview nueva

# Pasarla a producción (o con un pull request en GitHub)
git checkout main && git merge v2 && git push
```
