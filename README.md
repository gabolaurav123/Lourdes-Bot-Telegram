# Telegram Consent CRM

CRM web para operar una cuenta personal de Telegram como inbox comercial con consentimiento, trazabilidad y controles de seguridad. Incluye React + Vite + TailwindCSS, API Node/Express, Prisma/PostgreSQL, worker con polling en base de datos, GramJS, OpenAI e imagenes comprimidas almacenadas en PostgreSQL por defecto.

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
```

Usa tu base de datos de Neon como PostgreSQL. **No necesitas Redis**: el Worker revisa PostgreSQL cada pocos segundos y ejecuta automatizaciones/campanas pendientes desde ahi.

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

JWT_SECRET=clave-larga-random-de-minimo-32-caracteres
ENCRYPTION_KEY=clave-base64-de-32-bytes

ADMIN_BOOTSTRAP_EMAIL=tu-email
ADMIN_BOOTSTRAP_PASSWORD=tu-password-seguro

TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=tu_api_hash
TELEGRAM_SESSION_LABEL=primary

OPENAI_API_KEY=tu_openai_key
OPENAI_MODEL=gpt-4.1-mini

MEDIA_STORAGE=database
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
ENCRYPTION_KEY=la-misma-del-api
API_URL=https://TU-API.seenode.app
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=tu_api_hash
TELEGRAM_SESSION_LABEL=primary
MEDIA_LOCAL_DIR=storage/media
WORKER_POLL_INTERVAL_MS=10000
WORKER_MAX_SEND_ATTEMPTS=3
WORKER_PROCESSING_LOCK_MS=300000
DEFAULT_TIMEZONE=America/La_Paz
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

## Comprobar que el Worker funciona

En `Campanas` y `Ajustes` aparece el estado del Worker. Debe indicar `Activo`. Si aparece `Apagado`, comprueba en Seenode que el servicio Worker tenga la misma `DATABASE_URL`, `ENCRYPTION_KEY`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` y `TELEGRAM_SESSION_LABEL` que la API.

Las campanas muestran enviados, pendientes, fallidos y omitidos. Un envio fallido se reintenta hasta tres veces y el error exacto queda visible dentro de la campana.

## Configurar OpenAI

Puedes configurar `OPENAI_API_KEY` y `OPENAI_MODEL` en el servicio API, o guardar la API key cifrada desde `Ajustes`. Usa `Probar conexion IA` antes de activar la IA global. La clave nunca se devuelve al navegador.

La integracion usa la Responses API de OpenAI. Las respuestas automaticas solo se generan para conversaciones entrantes validas y respetan stop, horario, palabras prohibidas y confirmacion de edad.

## Imagenes sin servicio adicional

Con `MEDIA_STORAGE=database`, las imagenes se comprimen a WebP y se guardan en Neon PostgreSQL. API y Worker acceden al mismo archivo aunque sean servicios separados. Los archivos entrantes temporales se eliminan de la base de datos despues de 24 horas.

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
worker            Procesador de campanas, automatizaciones y seguimientos usando PostgreSQL
storage/media     Imagenes locales en desarrollo
```

## Inicio local

```bash
cp .env.example .env
npm install
docker compose up -d postgres
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
