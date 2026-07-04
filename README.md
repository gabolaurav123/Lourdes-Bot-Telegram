# Telegram Consent CRM

CRM web para operar una cuenta personal de Telegram como inbox comercial con consentimiento, trazabilidad y controles de seguridad. Incluye React + Vite + TailwindCSS, API Node/Express, Prisma/PostgreSQL, BullMQ/Redis, worker, GramJS, OpenAI y almacenamiento local/S3-compatible para imagenes.

## Como se despliega

No necesitas tres repositorios. Usa **un solo repositorio de GitHub**:

```txt
gabolaurav123/Lourdes-Bot-Telegram
```

En Seenode creas **tres servicios desde ese mismo repo**:

```txt
1. Web       Panel del CRM que abre en el navegador
2. API       Backend, login, Telegram, IA, base de datos
3. Worker    Campanas, automatizaciones y colas
```

Tambien necesitas:

```txt
4. PostgreSQL  Base de datos
5. Redis       Cola de trabajos
```

PostgreSQL y Redis pueden estar en Seenode si te lo ofrece, o en servicios externos como Neon/Supabase para PostgreSQL y Upstash para Redis.

## Seenode paso a paso

En los tres servicios, deja `Root Directory` **vacio**. Aunque el proyecto es monorepo, los comandos con `-w` indican que parte ejecutar.

### 1. Crear el servicio API

Tipo:

```txt
Web Service
```

Config:

```txt
Repository: gabolaurav123/Lourdes-Bot-Telegram
Branch: main
Root Directory: vacio
Port: 4000
```

Build Command:

```bash
npm ci --include=dev && npm run db:generate && npm run build -w @crm/api
```

Start Command:

```bash
npm run db:deploy && npm run db:seed && npm run start -w @crm/api
```

### 2. Crear el servicio Web

Tipo:

```txt
Web Service
```

Config:

```txt
Repository: gabolaurav123/Lourdes-Bot-Telegram
Branch: main
Root Directory: vacio
Port: 5173
```

Build Command:

```bash
npm ci --include=dev && npm run build -w @crm/web
```

Start Command:

```bash
npm run preview -w @crm/web -- --host 0.0.0.0 --port 5173
```

Variable especial del Web:

```env
VITE_API_URL=https://TU-API.seenode.app
```

### 3. Crear el servicio Worker

Tipo:

```txt
Worker Service
```

Config:

```txt
Repository: gabolaurav123/Lourdes-Bot-Telegram
Branch: main
Root Directory: vacio
```

Build Command:

```bash
npm ci --include=dev && npm run db:generate && npm run build -w @crm/worker
```

Start Command:

```bash
npm run start -w @crm/worker
```

## Variables de entorno

### API

```env
NODE_ENV=production
API_PORT=4000
APP_URL=https://TU-WEB.seenode.app
API_URL=https://TU-API.seenode.app

DATABASE_URL=postgresql://USUARIO:PASSWORD@HOST:PUERTO/DB?schema=public
REDIS_URL=redis://default:PASSWORD@HOST:PUERTO

JWT_SECRET=clave-larga-random-de-minimo-32-caracteres
ENCRYPTION_KEY=clave-base64-de-32-bytes

ADMIN_BOOTSTRAP_EMAIL=tu-email
ADMIN_BOOTSTRAP_PASSWORD=tu-password-seguro

TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=tu_api_hash
TELEGRAM_SESSION_LABEL=primary

OPENAI_API_KEY=tu_openai_key
OPENAI_MODEL=gpt-4.1-mini

MEDIA_STORAGE=local
MEDIA_LOCAL_DIR=storage/media
MEDIA_MAX_MB=8

DEFAULT_TIMEZONE=America/La_Paz
GLOBAL_AI_ENABLED=false
GLOBAL_CAMPAIGNS_ENABLED=true
PAYMENT_LINK=https://tu-link-de-pago
```

### Web

```env
VITE_API_URL=https://TU-API.seenode.app
```

### Worker

```env
NODE_ENV=production
DATABASE_URL=postgresql://USUARIO:PASSWORD@HOST:PUERTO/DB?schema=public
REDIS_URL=redis://default:PASSWORD@HOST:PUERTO
ENCRYPTION_KEY=la-misma-del-api
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=tu_api_hash
TELEGRAM_SESSION_LABEL=primary
MEDIA_LOCAL_DIR=storage/media
```

## Donde conseguir Telegram API ID y API HASH

1. Entra a [https://my.telegram.org](https://my.telegram.org).
2. Inicia sesion con tu numero de Telegram.
3. Telegram te enviara un codigo a tu app de Telegram.
4. Entra a `API development tools`.
5. Crea una app.
6. Copia:

```txt
api_id      -> TELEGRAM_API_ID
api_hash    -> TELEGRAM_API_HASH
```

Eso no conecta tu cuenta todavia. Solo autoriza a tu sistema a usar MTProto. Despues, desde la web del CRM, vas a `Ajustes > Telegram > Generar QR` y escaneas el QR con Telegram movil.

## Como conectar Telegram

1. Abre la URL del servicio Web.
2. Inicia sesion con el admin seed.
3. Ve a `Ajustes`.
4. Pulsa `Generar QR`.
5. Escanea con Telegram movil.
6. La sesion queda guardada cifrada en backend.

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

URLs locales:

```txt
Web: http://localhost:5173
API: http://localhost:4000
```

## Seguridad comercial

La funcion compartida `canMessageLead` bloquea envios cuando:

- El estado es `NO_VOLVER_A_ESCRIBIR`, `NO_INTERESADO`, `BLOQUEADO` o `ERROR`.
- El usuario no inicio una conversacion valida.
- La campana no tiene `optInCommercial=true`.
- El seguimiento comercial no tiene `followUpAllowed=true`.
- El mensaje sensible no tiene `ageConfirmed=true`.

El worker vuelve a validar estas reglas al ejecutar jobs pendientes.

## Docker local

```bash
docker compose up --build
docker compose exec api npm run db:deploy
docker compose exec api npm run db:seed
```

## Referencias

- GramJS QR login usa el flujo `signInUserWithQrCode`/`auth.ExportLoginToken`.
- `auth.AcceptLoginToken` y el formato `tg://login?token=...` corresponden a la documentacion TL de GramJS.
