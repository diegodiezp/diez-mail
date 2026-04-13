# Diez Mail — Base de Airtable

Crea una base nueva en Airtable llamada **"Diez Mail"**.
Necesitas 4 tablas. Sigue este orden porque hay dependencias entre ellas.

---

## Tabla 1: "People"

Esta tabla reemplaza la consulta a Contacts + Clients de la base principal.
Importarás tus contactos aquí. Es tu lista maestra de mailing.

| Campo              | Tipo               | Notas                                    |
|--------------------|--------------------|------------------------------------------|
| Full Name          | Formula            | `{First Name} & " " & {Surname}`        |
| First Name         | Single line text   |                                          |
| Surname            | Single line text   |                                          |
| Email              | Email              |                                          |
| Phone              | Phone number       |                                          |
| City               | Single line text   |                                          |
| Country            | Single line text   |                                          |
| Type               | Single select      | Opciones: Collector, Advisor, Curator, Institution, Press, Gallery, Artist, Other |
| Status             | Single select      | Opciones: Cold, Warm, Hot                |
| Tags               | Multiple select    | Libre: crea las que necesites (Dutch, International, Top 200, etc.) |
| Notes              | Long text          |                                          |
| Source             | Single select      | Opciones: Arternal Import, Manual, Fair, Website, Referral |
| Campaigns Received | Link to Campaigns  | Se crea después de crear la tabla Campaigns (ver paso abajo) |
| Created            | Created time       | Automático                               |

**Full Name debe ser el campo primario** (renombra el campo primario por defecto).

Nota: configura Full Name como Formula con `{First Name} & " " & {Surname}`.

---

## Tabla 2: "Campaigns"

| Campo              | Tipo               | Notas                                    |
|--------------------|--------------------|------------------------------------------|
| Name               | Single line text   | Campo primario. Ej: "True as Good — Opening week" |
| Subject            | Single line text   | La línea de asunto del email             |
| Body Template      | Long text          | El cuerpo del email con merge tags       |
| Status             | Single select      | Opciones: Draft, Sending, Sent, Partial, Failed |
| People             | Link to People     | Relación many-to-many con People         |
| Sent Count         | Number (integer)   |                                          |
| Failed Count       | Number (integer)   |                                          |
| Unique Opens       | Number (integer)   | Se actualiza via tracking                |
| Total Opens        | Number (integer)   | Se actualiza via tracking                |
| Unique Clicks      | Number (integer)   | Se actualiza via tracking                |
| Open Rate          | Formula            | `IF({Sent Count}>0, ROUND({Unique Opens}/{Sent Count}*100,1), 0)` |
| Click Rate         | Formula            | `IF({Sent Count}>0, ROUND({Unique Clicks}/{Sent Count}*100,1), 0)` |
| PDF Link           | URL                | Link de Google Drive al PDF de la campaña |
| Created            | Created time       | Automático                               |

Ahora vuelve a la tabla People y crea el campo "Campaigns Received" como Link to Campaigns.

---

## Tabla 3: "Email Events"

| Campo              | Tipo               | Notas                                    |
|--------------------|--------------------|------------------------------------------|
| Event ID           | Single line text   | Campo primario. Se genera automáticamente |
| Campaign           | Link to Campaigns  |                                          |
| Person             | Link to People     |                                          |
| Recipient Email    | Email              | Redundante pero útil para queries rápidas |
| Event Type         | Single select      | Opciones: Sent, Open, Click, Failed      |
| Timestamp          | Date (ISO)         | Incluir hora. Formato: ISO               |
| Device             | Single select      | Opciones: Computer, Mobile, Tablet, Unknown |
| User Agent         | Long text          |                                          |
| IP Address         | Single line text   |                                          |
| Clicked URL        | URL                | Solo para eventos de tipo Click          |
| Gmail Message ID   | Single line text   |                                          |
| Tracking ID        | Single line text   |                                          |
| Error Message      | Single line text   | Solo para eventos de tipo Failed         |

---

## Tabla 4: "Templates" (opcional pero útil)

| Campo              | Tipo               | Notas                                    |
|--------------------|--------------------|------------------------------------------|
| Name               | Single line text   | Campo primario. Ej: "Exhibition opening" |
| Subject Template   | Single line text   |                                          |
| Body Template      | Long text          |                                          |
| Category           | Single select      | Opciones: Exhibition, Fair, Follow-up, General |
| Last Used          | Date               |                                          |

---

## Importar contactos

Una vez creada la base, exporta tus contactos actuales:

1. Ve a tu base principal (appkTmFvjmDLOQS4p)
2. Tabla "Contacts" → descarga como CSV
3. Tabla "Clients" → descarga como CSV
4. Importa ambos CSVs en la tabla "People" de la nueva base
5. Elimina duplicados (mismo email)
6. Asigna Type y Tags según corresponda

---

## Configurar en la app

Una vez creada la base, necesitas:

1. Ir a la URL de la base en el navegador: será algo como `https://airtable.com/appXXXXXXXXXXXXX`
2. El ID de la base es el `appXXXXXXXXXXXXX` de la URL
3. Anotar también los IDs de las tablas People, Campaigns y Email Events
   (los puedes ver en la URL cuando estás dentro de cada tabla: `tblXXXXXXXXXXXXX`)
4. Actualizar las variables de entorno en Vercel:
   - `AIRTABLE_BASE_ID` → el nuevo ID de base
   - Las tablas se referencian por nombre en el código, así que si usas exactamente
     los nombres de arriba, no necesitas cambiar nada más
