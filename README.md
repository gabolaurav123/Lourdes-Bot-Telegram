# Telegram Consent CRM

CRM web para operar una cuenta personal de Telegram como inbox comercial con consentimiento, trazabilidad y controles de seguridad. Incluye React + Vite + TailwindCSS, API Node/Express, Prisma/PostgreSQL, BullMQ/Redis, worker, GramJS, OpenAI y almacenamiento local/S3-compatible para imagenes.

## Alcance permitido

- Lee y organiza conversaciones entrantes.
- Responde manualmente o con IA solo cuando existe conversacion valida.
- Gestiona leads con opt-in comercial, mayoria de edad y permiso de seguimiento.
- Ejecuta automatizaciones y campanas solo sobre leads elegibles.
- Cancela IA y automatizaciones cuando el usuario pide stop.
- No incluye funciones para evadir antispam, ocultar automatizacion ni escribir a contactos antiguos sin consentimiento.

## Estructura

```txt
apps/web          Frontend React/Vite/Tailwind
apps/api          API Express, auth, CRM, Telegram, IA, media
packages/db       Prisma schema, migracion inicial y seed
packages/shared   Constantes, validadores y reglas de consentimiento
worker            BullMQ para campanas, automatizaciones y seguimientos
storage/media     Imagenes locales en desarrollo
```

## Requisitos

- Node.js 22+
- Docker y Docker Compose
- Cuenta de desarrollador Telegram en `my.telegram.org` para `TELEGRAM_API_ID` y `TELEGRAM_API_HASH`
- OpenAI API key si se activara IA

## Inicio local

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:4000`
- Prisma Studio: `npm run db:studio`

Credenciales seed:

- Email: valor de `ADMIN_BOOTSTRAP_EMAIL`
- Password: valor de `ADMIN_BOOTSTRAP_PASSWORD`

## Variables criticas

```env
DATABASE_URL=postgresql://crm:crm_password@localhost:5432/telegram_crm?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-at-least-32-random-characters
ENCRYPTION_KEY=replace-with-32-byte-base64-key
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=your_telegram_api_hash
OPENAI_API_KEY=
```

Genera una key de cifrado:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Conexion Telegram por QR

1. Completa `TELEGRAM_API_ID` y `TELEGRAM_API_HASH`.
2. Inicia API, worker y web.
3. Entra a `Ajustes > Telegram`.
4. Pulsa `Generar QR`.
5. Escanea el QR desde Telegram movil.

La sesion MTProto se guarda cifrada con AES-256-GCM. El frontend solo recibe estado y QR temporal, nunca la sesion ni claves. Si la cuenta tiene 2FA, define temporalmente `TELEGRAM_2FA_PASSWORD` para completar el flujo.

## Modulos API

- `POST /api/auth/login`
- `GET /api/dashboard`
- `GET/POST /api/telegram/status|qr/start|sync|logout`
- `GET/PATCH /api/leads`
- `GET/POST /api/conversations/:id/messages`
- `GET/POST /api/campaigns`, `POST /api/campaigns/:id/activate`
- `GET/POST/PATCH /api/automations`
- `GET/POST/PATCH /api/templates`
- `GET/POST/DELETE /api/media`
- `GET/POST /api/purchases`
- `GET/PUT /api/settings`
- `GET/PUT /api/ai/config`

## Reglas de seguridad comercial

La funcion compartida `canMessageLead` bloquea envios cuando:

- El estado es `NO_VOLVER_A_ESCRIBIR`, `NO_INTERESADO`, `BLOQUEADO` o `ERROR`.
- El usuario no inicio una conversacion valida.
- La campana no tiene `optInCommercial=true`.
- El seguimiento comercial no tiene `followUpAllowed=true`.
- El mensaje sensible no tiene `ageConfirmed=true`.

El worker vuelve a validar estas reglas al ejecutar jobs pendientes.

## Campanas

Las campanas:

- Preparan destinatarios elegibles antes de activar.
- Exigen opt-in.
- Aplican exclusiones obligatorias.
- Guardan progreso en `CampaignRecipient`.
- Respetan limite diario y pausa entre envios.
- Permiten pausar/reanudar desde estado.

## Automatizaciones

Triggers soportados por convencion:

- `NEW_MESSAGE_RECEIVED`
- `LEAD_CREATED`
- `LEAD_STATUS_CHANGED`
- `AGE_CONFIRMED`
- `PRICE_REQUESTED`
- `PRICE_SENT_NO_REPLY`
- `LEAD_IDLE_24H`
- `LEAD_IDLE_48H`
- `PURCHASE_REGISTERED`
- `TAG_ADDED`
- `CAMPAIGN_RECEIVED`
- `STOP_REQUESTED`

Acciones soportadas:

- `SEND_MESSAGE`
- `SEND_IMAGE`
- `SEND_MESSAGE_IMAGE`
- `CHANGE_STATUS`
- `ADD_TAG`
- `STOP_AI`
- `STOP_AUTOMATIONS`

## Deploy VPS / Railway / Render / Seenode

1. Configura PostgreSQL y Redis administrados o usa `docker-compose.yml`.
2. Define variables de entorno reales.
3. Ejecuta:

```bash
npm ci
npm run db:generate
npm run build
npm run db:deploy
npm run start -w @crm/api
npm run start -w @crm/worker
```

4. Sirve `apps/web/dist` con Nginx, Caddy o el servicio de frontend elegido.
5. Monta almacenamiento persistente para `storage/media` o configura S3-compatible.

## Docker

```bash
docker compose up --build
docker compose exec api npm run db:deploy
docker compose exec api npm run db:seed
```

## Backups

PostgreSQL:

```bash
pg_dump "$DATABASE_URL" > backup-telegram-crm.sql
```

Media local:

```bash
tar -czf media-backup.tgz storage/media
```

## Auditoria

Se registran logins, conexion/desconexion Telegram, envios, recepciones, IA, campanas, automatizaciones, errores, cambios de estado, etiquetas y compras en `AuditLog`.

## Referencias

- GramJS QR login usa el flujo `signInUserWithQrCode`/`auth.ExportLoginToken` documentado en el repositorio de GramJS.
- `auth.AcceptLoginToken` y el formato `tg://login?token=...` corresponden a la documentacion TL de GramJS.
