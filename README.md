# STANNUM Game - Backend API

API REST construida con Node.js, Express y MongoDB que maneja toda la logica de negocio, gamificacion, AI grading y persistencia de datos para la plataforma educativa STANNUM Game.

Este es un **repositorio privado**.

## Que es STANNUM Game?

STANNUM Game es una plataforma educativa gamificada que combina contenido educativo de alta calidad con mecanicas de juego para maximizar el engagement y la retencion del aprendizaje. Los estudiantes completan lecciones (videos), realizan instrucciones practicas calificadas por IA, ganan XP, suben de nivel, desbloquean logros y compiten en rankings.

## Quick Start

### Prerequisitos

- Node.js 18+
- MongoDB 6+
- Cuenta AWS S3 (para almacenamiento de archivos)
- API Key de OpenAI (para AI grading)
- Cuenta SMTP (para envio de emails)

### Instalacion

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Iniciar en desarrollo (usa nodemon con --env-file)
npm run dev

# Iniciar en produccion
npm start
```

El servidor estara disponible en `http://localhost:4000` (default si no se setea `PORT` en `.env`).

## Stack Tecnologico

- **Runtime:** Node.js 18+
- **Framework:** Express.js 4.21
- **Base de datos:** MongoDB + Mongoose 8.23
- **Autenticacion:** JWT (access + refresh tokens) + bcryptjs
- **AI:** OpenAI API (GPT-4o) via `openai` SDK 6.21
- **Storage:** AWS S3 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`)
- **Email:** Nodemailer 7
- **Validacion:** express-validator 7.3
- **Rate Limiting:** express-rate-limit 7.5
- **Seguridad:** helmet 8.1, cors 2.8, cookie-parser
- **Busqueda fuzzy:** Fuse.js 7.1
- **Imagenes:** sharp 0.34
- **Profanity:** @2toad/profanity 3.2

## Estructura del Proyecto

```
src/
├── index.js                 # Entry point (Express setup, CORS, MongoDB connect)
│
├── config/                  # Configuraciones estaticas
│   ├── achievementsConfig.js   # 22 achievements generales + 9 program-specific (ver gamification.md)
│   ├── coinsConfig.js          # Economia de Tins (moneda virtual)
│   ├── xpConfig.js             # Tabla de XP por nivel (30 niveles)
│   ├── chestsConfig.js         # Cofres por modulo (recompensas XP, Tins, portadas)
│   ├── coversConfig.js         # Portadas de perfil (nombre, precio, rareza, imageKey)
│   ├── errors.json             # Codigos de error estandarizados
│   ├── grading_examples.json   # Ejemplos para AI grading
│   ├── lessons_catalog.json    # Catalogo de lecciones
│   ├── programRegistry.js      # Registro de programas (valid, subscription, purchase, demo)
│   ├── programPricing.js       # Precios de compra y suscripcion
│   ├── muxPlaybackIds.js       # IDs de playback de Mux
│   ├── demoMapping.js          # Mapeo demo → programa completo
│   └── programs/               # Configuracion por programa (TIA, TMD, TIA_SUMMER, TIA_POOL, TRENNO_IA, DEMO_TRENNO)
│
├── models/                  # Schemas MongoDB (Mongoose)
│   ├── userModel.js            # User: perfil, nivel, XP, achievements, programas, streaks, magicLink, otp
│   ├── programModel.js         # Catalogo de programas (secciones, modulos, lecciones, instrucciones)
│   ├── productKeyModel.js      # Product keys para activar programas
│   ├── promptModel.js          # Prompts de comunidad
│   ├── assistantModel.js       # Assistants/GPTs de comunidad
│   ├── orderModel.js           # Ordenes de compra (Mercado Pago)
│   ├── couponModel.js          # Cupones de descuento
│   ├── subscriptionPaymentModel.js  # Pagos de suscripcion
│   ├── subscriptionAuditLogModel.js # Audit log de suscripciones
│   ├── cancelTokenModel.js     # Tokens de cancelacion (TTL)
│   ├── failedEmailModel.js     # Emails fallidos (retry)
│   └── feedbackModel.js        # Feedback de usuarios (NPS, lecciones, errores)
│
├── routes/                  # Definicion de endpoints (montados desde src/index.js)
│   ├── authRoutes.js           # /api/auth/*
│   ├── userRoutes.js           # /api/user/*
│   ├── lessonRoutes.js         # /api/lesson/*
│   ├── instructionRoutes.js    # /api/instruction/*
│   ├── productKeyRoutes.js     # /api/product-key/*  (incluye auto-enroll + check)
│   ├── rankingRoutes.js        # /api/ranking/*
│   ├── promptRoutes.js         # /api/prompt/*
│   ├── assistantRoutes.js      # /api/assistant/*
│   ├── profilePhotoRoutes.js   # /api/profile-photo/*
│   ├── chestRoutes.js          # /api/chest/*
│   ├── storeRoutes.js          # /api/store/*
│   ├── paymentRoutes.js        # /api/payment/*
│   ├── subscriptionRoutes.js   # /api/subscription/*
│   ├── webhookRoutes.js        # /api/webhooks/*
│   ├── programRoutes.js        # /api/programs/*  (publico JWT + admin x-api-key)
│   ├── adminRoutes.js          # /api/admin/*  (x-api-key, lookup users/enterprises/stats)
│   └── feedbackRoutes.js       # /api/feedback/*  (NPS, lessons, instructions, errors)
│
├── controllers/             # Request handlers (logica de cada endpoint)
│   ├── authController.js       # Login, register, Google, OTP, magic link, complete activation
│   ├── userController.js       # CRUD usuario, busqueda (Mongo text + Fuse), tutoriales
│   ├── lessonController.js     # Completar leccion, guardar progreso, playback Mux
│   ├── instructionController.js # Start, presign (multi-file), submit, retry grading
│   ├── productKeyController.js  # Activar, generar, auto-enroll (con magic link), check
│   ├── rankingController.js     # Rankings (cache in-memory con TTL)
│   ├── promptController.js      # CRUD prompts, likes, favorites, copy, stats, top
│   ├── assistantController.js   # CRUD assistants, likes, favorites, clicks, stats, top
│   ├── profilePhotoController.js # Upload/delete foto de perfil (S3)
│   ├── chestController.js       # Abrir cofres (validacion, recompensas)
│   ├── storeController.js       # Portadas, streak shield y recovery
│   ├── paymentController.js     # Mercado Pago: preferencias, verificacion, ordenes, cupones, recibos
│   ├── subscriptionController.js # Suscripciones: crear, cancelar, estado, historial, recibos
│   ├── webhookController.js     # Webhook handler de Mercado Pago
│   ├── programController.js     # CRUD programas (publico + admin)
│   ├── adminController.js       # Lookup users, enterprises, stats
│   └── feedbackController.js    # Crear feedback (rate limited por tipo), listar, resolver
│
├── services/                # Logica de negocio core
│   ├── experienceService.js    # Calculo y asignacion de XP + niveles
│   ├── coinsService.js         # Calculo y asignacion de Tins
│   ├── achievementsService.js  # Evaluacion y desbloqueo de logros
│   ├── aiGradingService.js     # Calificacion con OpenAI GPT-4o (responses.create + vision)
│   ├── paymentService.js       # Mercado Pago: pagos unicos, ordenes, cupones
│   ├── subscriptionService.js  # Suscripciones: creacion, cancelacion, state machine
│   ├── subscriptionEmailService.js      # Emails transaccionales de suscripcion + magic link
│   ├── subscriptionReconciliationService.js # Reconciliacion con Mercado Pago
│   ├── streakService.js        # Gestion de daily streaks (apply shield, recovery)
│   ├── programActivationService.js # Activacion de programas (product keys, compras)
│   ├── programCacheService.js  # Cache en memoria del catalogo de programas
│   ├── receiptService.js       # Generacion de recibos PDF (pdfkit)
│   ├── feedbackEmailService.js # Notificaciones de feedback (FEEDBACK_NOTIFICATION_EMAILS)
│   └── demoTransferService.js  # Transferencia de progreso demo → programa completo
│
├── middlewares/             # Middlewares Express
│   ├── validateJWT.js          # Verificacion de access token (cookie o Authorization header)
│   ├── validateActivationJWT.js # Verifica JWT con scope:"activation" (magic link onboarding)
│   ├── resolveUserByRefreshToken.js # Resolucion de usuario por refresh token (logout)
│   ├── fieldsValidate.js       # Validacion de campos (express-validator)
│   ├── rateLimiter.js          # ~15 rate limiters (auth, OTP, search, feedback, etc.)
│   ├── validateAPIKey.js       # Validacion de header x-api-key (admin/integraciones)
│   ├── isAdmin.js              # Verificacion de rol admin (USER/ADMIN)
│   └── webhookVerify.js        # Verificacion de firma de webhook Mercado Pago (HMAC)
│
├── cache/                   # Cache layer
│   └── cacheService.js         # node-cache wrapper con KEYS, TTL e invalidación por user
│
├── helpers/                 # Funciones utilitarias
│   ├── newJWT.js               # Generar access token JWT
│   ├── newRefreshToken.js      # Generar/verificar refresh token (HMAC-SHA256)
│   ├── authCookies.js          # Set/clear cookies de autenticacion
│   ├── getError.js             # Resolver codigos de error → mensajes
│   ├── getProfileStatus.js     # Determinar si perfil esta completo
│   ├── generateUsername.js     # Generar username unico (Google OAuth)
│   ├── googlePictureUrl.js     # Resolver URL de foto de Google
│   ├── profanityChecker.js     # Filtro de profanidad
│   ├── completionHelper.js     # Verificar si leccion ya fue completada
│   ├── experienceHelper.js     # Helpers de calculo de XP
│   ├── getLessonContent.js     # Obtener contenido de leccion por ID
│   ├── getPreviousLessons.js   # Obtener lecciones previas (para AI context)
│   ├── getInstructionConfig.js # Obtener config de instruccion
│   ├── resolveInstructionInfo.js # Resolver info de instruccion desde config
│   └── resolveLessonInfo.js    # Resolver info de leccion desde config
│
├── utils/                   # Utilidades
│   └── accessControl.js        # Control de acceso centralizado (hasAccess, buildAccessQuery)
│
├── migrations/              # Migraciones de datos
│   └── seedPrograms.js         # Seed del catalogo de programas en MongoDB
│
└── scripts/                 # Scripts de migracion y utilidades
    ├── migrateTotalXp.js       # Migracion de XP total por programa
    ├── migrateSubscriptionFields.js # Migrar hasAccessFlag y subscription subdoc
    └── createMpPlan.js         # Crear plan de suscripcion en Mercado Pago
```

## Variables de Entorno

```env
# ── Base ──
NODE_ENV=production
PORT=4000                       # Default si no se setea

# ── MongoDB ──
DB_URL=mongodb+srv://user:pass@cluster.mongodb.net/stannum-game

# ── JWT & Auth ──
SECRET=clave_secreta_jwt_y_otp
REFRESH_SECRET=clave_secreta_refresh_token
ACCESS_TOKEN_EXPIRY=15m         # Fallback: 20s si no se setea

# ── Magic Link / Auto-enroll (ver authentication.md) ──
MAGIC_LINK_TTL_DAYS=7           # Default: 7
ONBOARDING_JWT_TTL_MINUTES=30   # Default: 30
FRONTEND_URL=http://localhost:3000

# ── Cookies ──
FORCE_SECURE_COOKIES=false      # true para forzar Secure flag fuera de production
COOKIE_DOMAIN=.stannumgame.com  # Opcional

# ── AWS S3 ──
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_BUCKET_NAME=tu-bucket
AWS_S3_BASE_URL=https://tu-bucket.s3.us-east-1.amazonaws.com
AWS_S3_FOLDER_NAME=profile-photos

# ── OpenAI (AI Grading) ──
OPENAI_API_KEY=sk-...

# ── Email (SMTP) ──
SMTP_EMAIL=noreply@tudominio.com
SMTP_PASSWORD=app_password
FEEDBACK_NOTIFICATION_EMAILS=ops@stannum.com,product@stannum.com  # CSV opcional

# ── Google OAuth ──
GOOGLE_USERINFO_API=https://www.googleapis.com/oauth2/v3/userinfo

# ── reCAPTCHA ──
RECAPTCHA_SECRET_KEY=tu_secret_key

# ── CORS / CSRF ──
ALLOWED_ORIGINS=["http://localhost:3000","https://stannumgame.com"]

# ── Make.com / API Key (admin endpoints + product-key generate + feedback/error + programs admin) ──
MAKE_API_KEY=tu_api_key

# ── Mercado Pago (pagos y suscripciones) ──
MP_ACCESS_TOKEN=APP_USR-...
MP_NOTIFICATION_URL=https://api.tudominio.com/api/webhooks/mercadopago
MP_WEBHOOK_SECRET=tu_webhook_secret  # HMAC-SHA256 para verificar webhooks de MP

# ── Debug / utilidades (opcionales) ──
CACHE_DEBUG=false
CONFIRM_CLEAN=false
```

## Endpoints

### Autenticacion (`/api/auth`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/auth` | Login con username/email + password | No |
| POST | `/auth/register` | Registro de cuenta nueva | No |
| POST | `/auth/check-email` | Validar disponibilidad de email | No |
| POST | `/auth/validate-username` | Validar username (formato, ofensivo, único) | No |
| POST | `/auth/validate-recaptcha` | Verificar token reCAPTCHA v3 | No |
| POST | `/auth/google` | Login/registro con Google OAuth | No |
| GET | `/auth/auth-user` | Verificar token y obtener status | Si |
| POST | `/auth/refresh-token` | Renovar access token (lee cookie `refresh_token`) | No (usa cookie) |
| POST | `/auth/logout` | Cerrar sesion (invalida refresh token) | Cookie refresh |
| POST | `/auth/password-recovery` | Solicitar OTP por email | No |
| POST | `/auth/verify-recovery-otp` | Verificar OTP | No |
| POST | `/auth/password-reset` | Resetear contraseña | No |
| PUT | `/auth/update-username` | Actualizar username | Si |
| GET | `/auth/magic-link/:token` | Consumir magic link de auto-enroll | No |
| POST | `/auth/complete-activation` | Completar onboarding del stub user | Activation JWT |

### Usuario (`/api/user`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| GET | `/user` | Datos completos del usuario | Si |
| GET | `/user/sidebar-details` | Datos minimos para sidebar | Si |
| GET | `/user/profile/:username` | Perfil publico de usuario | Si |
| PUT | `/user/edit` | Actualizar perfil | Si |
| GET | `/user/search-users?query=` | Buscar usuarios (min 2 chars) | Si |
| GET | `/user/tutorial/:tutorialName` | Estado de tutorial | Si |
| POST | `/user/tutorial/:tutorialName/complete` | Completar tutorial | Si |

### Lecciones (`/api/lesson`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/lesson/complete/:programName/:lessonId` | Completar leccion (XP + Tins + achievements) | Si |
| PATCH | `/lesson/lastwatched/:programName/:lessonId` | Guardar progreso de video | Si |
| GET | `/lesson/playback/:programName/:lessonId` | Obtener playback ID de Mux | Si |

### Instrucciones (`/api/instruction`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/instruction/start/:programName/:instructionId` | Iniciar instruccion | Si |
| POST | `/instruction/presign/:programName/:instructionId` | URLs firmadas para upload S3 (1-10 archivos) | Si |
| POST | `/instruction/submit/:programName/:instructionId` | Enviar instruccion (s3Keys[] o submittedText) | Si |
| POST | `/instruction/retry/:programName/:instructionId` | Reintentar calificacion AI (max 3 retries) | Si |

> Programas válidos para instrucciones: `tia | tia_summer | tia_pool | tmd` (no `trenno_ia` ni `demo_trenno`).

### Product Keys (`/api/product-key`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| GET | `/product-key/:code` | Pre-verificar product key (antes de activar) | JWT |
| POST | `/product-key/activate` | Activar product key (transacción Mongo) | JWT |
| POST | `/product-key/generate` | Generar key sin enviar | API Key |
| POST | `/product-key/generate-and-send` | Generar y enviar key por email | API Key |
| POST | `/product-key/generate-and-send-make` | Generar y enviar desde Make.com (con diagnóstico) | API Key |
| POST | `/product-key/auto-enroll` | Crear stub user + activar + magic link | API Key |
| GET | `/product-key/check/:code` | Verificar estado de key (soporte) | API Key |

> Producto válido en el modelo: `tmd | tia | tia_summer | tia_pool` (no `trenno_ia`).

### Rankings (`/api/ranking`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| GET | `/ranking/individual?limit=` | Ranking individual global | Si |
| GET | `/ranking/individual/:programName?limit=` | Ranking individual por programa | Si |
| GET | `/ranking/team/:programName` | Ranking por equipos | Si |

### Prompts (`/api/prompt`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| GET | `/prompt` | Listar prompts (filtros, paginacion) | Si |
| GET | `/prompt/me/prompts` | Mis prompts | Si |
| GET | `/prompt/me/favorites` | Mis favoritos | Si |
| GET | `/prompt/user/:userId` | Prompts de un usuario | Si |
| GET | `/prompt/stats` | Estadisticas de prompts | Si |
| GET | `/prompt/top?limit=` | Top prompts | Si |
| GET | `/prompt/:id` | Detalle de prompt | Si |
| POST | `/prompt` | Crear prompt | Si |
| PUT | `/prompt/:id` | Actualizar prompt | Si |
| DELETE | `/prompt/:id` | Eliminar prompt (soft delete) | Si |
| PUT | `/prompt/:id/visibility` | Toggle visibilidad | Si |
| POST | `/prompt/:id/copy` | Copiar prompt | Si |
| POST | `/prompt/:id/like` | Dar like | Si |
| DELETE | `/prompt/:id/like` | Quitar like | Si |
| POST | `/prompt/:id/favorite` | Toggle favorito | Si |

### Assistants (`/api/assistant`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| GET | `/assistant` | Listar assistants (filtros, paginacion) | Si |
| GET | `/assistant/me/assistants` | Mis assistants | Si |
| GET | `/assistant/me/favorites` | Mis favoritos | Si |
| GET | `/assistant/user/:userId` | Assistants de un usuario | Si |
| GET | `/assistant/stats` | Estadisticas | Si |
| GET | `/assistant/top?limit=` | Top assistants | Si |
| GET | `/assistant/:id` | Detalle de assistant | Si |
| POST | `/assistant` | Crear assistant | Si |
| PUT | `/assistant/:id` | Actualizar assistant | Si |
| DELETE | `/assistant/:id` | Eliminar assistant | Si |
| PUT | `/assistant/:id/visibility` | Toggle visibilidad | Si |
| POST | `/assistant/:id/click` | Registrar click | Si |
| POST | `/assistant/:id/like` | Dar like | Si |
| DELETE | `/assistant/:id/like` | Quitar like | Si |
| POST | `/assistant/:id/favorite` | Toggle favorito | Si |

### Profile Photo (`/api/profile-photo`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/profile-photo/presign-photo` | Obtener URL presignada para subir foto | Si |
| POST | `/profile-photo/confirm-photo` | Confirmar subida y procesar foto | Si |
| GET | `/profile-photo/get-photo` | Obtener foto propia | Si |
| GET | `/profile-photo/get-photo/:username` | Obtener foto por username | Si |
| DELETE | `/profile-photo/delete-photo` | Eliminar foto de perfil | Si |

### Cofres (`/api/chest`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/chest/:programId/:chestId/open` | Abrir cofre (otorga XP, Tins, portada opcional) | Si |

### Tienda (`/api/store`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| GET | `/store/covers` | Listar portadas con estado de propiedad | Si |
| POST | `/store/covers/purchase` | Comprar portada con Tins | Si |
| PUT | `/store/covers/equip` | Equipar portada en perfil | Si |
| POST | `/store/items/streak-shield/purchase` | Comprar escudo de racha con Tins | Si |
| POST | `/store/streak/recover` | Recuperar racha perdida con Tins | Si |

### Pagos (`/api/payment`) - Mercado Pago

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/payment/create-preference` | Crear preferencia de pago (compra unica) | Si |
| POST | `/payment/verify` | Verificar pago completado | Si |
| GET | `/payment/order/:orderId` | Obtener detalle de orden | Si |
| GET | `/payment/my-orders` | Historial de ordenes del usuario | Si |
| POST | `/payment/order/:orderId/cancel` | Cancelar orden | Si |
| POST | `/payment/order/:orderId/resend-email` | Reenviar email de regalo | Si |
| GET | `/payment/order/:orderId/receipt` | Descargar comprobante PDF | Si |
| POST | `/payment/apply-coupon` | Aplicar cupon de descuento | Si |
| POST | `/payment/coupon` | Crear cupon (ADMIN) | Si (Admin) |
| GET | `/payment/coupons` | Listar cupones (ADMIN) | Si (Admin) |
| PUT | `/payment/coupon/:id` | Actualizar cupon (ADMIN) | Si (Admin) |

### Suscripciones (`/api/subscription`) - Mercado Pago

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/subscription/create` | Crear suscripcion (retorna init_point de MP) | Si |
| POST | `/subscription/cancel` | Cancelar suscripcion | Si |
| GET | `/subscription/status/:programId` | Estado de suscripcion | Si |
| GET | `/subscription/payments/:programId` | Historial de pagos de suscripcion | Si |
| GET | `/subscription/payment/:paymentId/receipt` | Descargar comprobante PDF de un pago | Si |
| GET | `/subscription/health` | Health stats de suscripciones (ADMIN) | Si (Admin) |
| POST | `/subscription/admin/:userId/:programId/cancel` | Cancelar suscripcion de usuario (ADMIN) | Si (Admin) |
| GET | `/subscription/admin/:userId/:programId/history` | Historial de pagos de usuario (ADMIN) | Si (Admin) |

### Webhooks (`/api/webhooks`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/webhooks/mercadopago` | Webhook de notificaciones de Mercado Pago | HMAC firma MP (`MP_WEBHOOK_SECRET`) |

### Programas (`/api/programs`) - Trenno Dashboard / Game

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| GET | `/programs/public` | Listar programas (game frontend) | JWT |
| GET | `/programs/public/:programId` | Detalle público de un programa | JWT |
| GET | `/programs` | Listar todos los programas (admin) | API Key |
| GET | `/programs/full` | Listar con todo el contenido (admin) | API Key |
| GET | `/programs/:programId` | Detalle completo (admin) | API Key |
| PUT | `/programs/:programId` | Actualizar programa | API Key |
| PUT | `/programs/:programId/sections/:sectionId` | Actualizar sección | API Key |
| PUT | `…/modules/:moduleId` | Actualizar módulo | API Key |
| PUT | `…/lessons/:lessonId` | Actualizar lección | API Key |
| PUT | `…/instructions/:instructionId` | Actualizar instrucción | API Key |
| POST/PUT/DELETE | `…/resources/:resourceId?` | CRUD recursos (sección o instrucción) | API Key |

### Admin (`/api/admin`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| GET | `/admin/user?email=&username=` | Buscar user puntual | API Key |
| GET | `/admin/users?enterprise=&search=&page=&limit=` | Listar users con filtros | API Key |
| GET | `/admin/stats` | Stats agregadas | API Key |
| GET | `/admin/enterprises` | Listar enterprises distintas | API Key |

### Feedback (`/api/feedback`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/feedback/error` | Ingestar errores client-side | API Key |
| POST | `/feedback` | Crear feedback (NPS, lesson, instruction, onboarding) | JWT |
| GET | `/feedback` | Listar feedback | JWT + Admin |
| PATCH | `/feedback/:id/resolve` | Marcar resuelto | JWT + Admin |

Ver [API Reference completa](./docs/api-reference.md) para detalles de request/response bodies.

## Sistemas Principales

### 1. Sistema de Gamificacion

- **XP:** 30 niveles con curva exponencial. Se gana al completar lecciones, instrucciones y abrir cofres.
- **Tins:** Moneda virtual. Se gana con lecciones (5), instrucciones (10-25 segun score), modulos (30), programas (100), cofres (10-15). Se gastan en la Tienda de portadas.
- **Cofres:** Nodos de recompensa en el PathMap. Se desbloquean al completar la actividad previa (`afterItemId`). Otorgan XP, Tins y opcionalmente una portada. Operacion atomica anti double-open.
- **Tienda de Portadas:** 12 portadas cosmeticas (common a legendary, 0-1500 Tins). Compra atomica anti-overspend. Equip/unequip de portada activa.
- **Achievements:** 31 logros (22 generales + 9 program-specific) verificados en backend. Loop hasta 10 iteraciones para desbloqueos en cadena.
- **Daily Streaks:** Dias consecutivos con actividad. Bonus de XP creciente (cap 7 dias).
- **Rankings:** Individual global, individual por programa, por equipos.

[Documentacion completa](./docs/systems/gamification.md)

### 2. Sistema Educativo

- **Programas:** TIA, TMD, TIA_SUMMER, TIA_POOL (compra única), TRENNO_IA (suscripción), DEMO_TRENNO (demo)
- **Estructura:** Program → Section → Module → Lesson/Instruction
- **Progreso:** Tracking completo por lección e instrucción
- **Módulos bloqueados:** Se desbloquean al completar el módulo anterior

[Documentacion completa](./docs/systems/education.md)

### 3. AI Grading

- **Motor:** OpenAI GPT-4o (`responses.create()` con vision multi-imagen)
- **Context injection:** Lecciones previas del módulo + consigna de la instrucción + criterios pedagógicos en SYSTEM_PROMPT
- **Soporta:** Texto y archivos (1-10 imágenes via S3 → base64 data URLs)
- **Output:** Score 0-100 + observaciones constructivas en español + lecciones recomendadas
- **Retry:** automático x3 con backoff exponencial; manual del usuario hasta 3 veces más

[Documentacion completa](./docs/systems/ai-grading.md)

### 4. Autenticacion

- **Access token:** JWT firmado, 15 min de expiración (cookie httpOnly `access_token`)
- **Refresh token:** 80 chars hex, hash HMAC-SHA256 en DB, 7 días de expiración (cookie httpOnly `refresh_token`)
- **Rotacion:** Cada refresh genera un nuevo par de tokens en operación atómica
- **Google OAuth:** Login/registro automático con datos de Google + import de foto
- **Password recovery:** OTP de 6 dígitos por email (HMAC-SHA256, 30 min de expiración, cap 5 intentos)
- **Magic link / Auto-enroll:** Lead capture externo crea stub user, recibe link `/activate/<token>` (TTL `MAGIC_LINK_TTL_DAYS`), y completa onboarding con activation JWT (TTL `ONBOARDING_JWT_TTL_MINUTES`)

[Documentacion completa](./docs/systems/authentication.md)

### 5. Pagos y Suscripciones (Mercado Pago)

- **Compra unica:** Crear preferencia de pago → redirect a MP → webhook confirma → activar programa
- **Suscripciones:** Crear suscripcion mensual → redirect a MP → webhook confirma → acceso activo
- **Cupones:** Descuentos porcentuales o fijos, con limite de usos y fecha de expiracion
- **Ordenes:** Tracking completo de compras, regalos, cancelaciones
- **Reconciliacion:** Sincronizacion periodica con MP para detectar pagos/cancelaciones perdidas
- **Transferencia demo:** Al adquirir programa completo, se transfiere progreso del demo

### 6. Tareas Programadas (node-cron)

Todas las tareas corren en timezone `America/Argentina/Buenos_Aires`:

| Frecuencia | Tarea | Descripcion |
|------------|-------|-------------|
| Cada 15 min | reconcilePayments | Reconciliar pagos con Mercado Pago |
| Cada 30 min | expireCancelledSubscriptions | Expirar suscripciones canceladas |
| Diario 10:00 AM | sendPreRenewalNotifications | Emails de pre-renovacion |
| Cada 6 horas (:05) | reconcileHot | Reconciliacion hot de suscripciones |
| Diario 4:00 AM | reconcileCold | Reconciliacion cold de suscripciones |
| Cada 12 horas (:10) | checkWebhookHealth | Health check de webhooks |
| Cada 1 hora (:30) | retryFailedDemoTransfers | Reintentar transferencias de demo fallidas |
| Cada 2 horas (:45) | retryFailedEmails | Reintentar emails fallidos |

## Seguridad

- Contraseñas hasheadas con bcryptjs (10 rounds)
- Access tokens JWT de corta duración (15 min)
- Refresh tokens opacos con rotación y hash HMAC-SHA256
- Magic link tokens single-use con SHA-256 hash, TTL configurable
- Logout server-side (invalidación de refresh token)
- ~15 rate limiters configurados (auth, OTP, búsqueda, feedback por tipo, creación de contenido, etc.)
- CORS por whitelist (`ALLOWED_ORIGINS`) + middleware CSRF custom (origin/referer check) en mutaciones sin `x-api-key`
- Helmet para headers de seguridad (Permissions-Policy: camera/mic/geolocation deshabilitados)
- express-validator en todas las rutas
- Google reCAPTCHA v3 en registro
- Detección de profanidad (@2toad/profanity, configurable wholeWord)
- AWS S3 URLs presignadas (no se exponen credenciales, TTL 300s)
- Cookies httpOnly + Secure (en prod o `FORCE_SECURE_COOKIES=true`) + sameSite para tokens
- Webhooks MP verificados con HMAC-SHA256 (`MP_WEBHOOK_SECRET`) + ventana temporal ±5 min + comparación timing-safe
- transform `toJSON` en User schema borra `password`, `otp`, `refreshToken`, `magicLink` antes de serializar

## Modelos MongoDB

### User (`userModel.js`)
Modelo principal (~1130 líneas con métodos). Incluye:
- Perfil (nombre, país, empresa, aboutMe, socialLinks max 5)
- Nivel y XP (currentLevel, experienceTotal, xpHistory)
- Achievements desbloqueados
- Programas inscritos con progreso (lecciones, instrucciones con `fileUrls[]`, módulos, chestsOpened)
- Daily streaks (count, shields, recovery window, lostCount/lostAt)
- Preferencias y tutorials completados
- Favoritos (prompts, assistants)
- Equipo(s) por programa
- Portadas (`unlockedCovers` con `unlockedDate`, `equippedCoverId`)
- `magicLink: { token, expiresAt }` para auto-enroll
- `otp: { recoveryOtp, otpExpiresAt, recoveryVerified }` para password recovery
- `feedbackState: { lastNpsAt, lastOnboardingFeedbackAt }` para evitar prompts repetidos
- `communityStats: { promptsCount, assistantsCount, totalFavoritesReceived }`
- Transform `toJSON` que excluye `password`, `otp`, `refreshToken`, `magicLink`
- Métodos: `getGameUserDetails()` (game frontend), `getFullUserDetails()` (interno), `getPublicUserDetails()`, `getRankingUserDetails()`, `getSearchUserDetails()`, `getUserSidebarDetails()`

### ProductKey (`productKeyModel.js`)
Codigos de activacion de programas con estado (usado/disponible).

### Prompt (`promptModel.js`)
Prompts de comunidad con metricas (likes, copies, views, favorites), visibilidad, verificacion STANNUM.

### Assistant (`assistantModel.js`)
Assistants/GPTs de comunidad con metricas y plataforma.

### Order (`orderModel.js`)
Ordenes de compra via Mercado Pago. Incluye comprador, producto, monto, estado, datos de regalo.

### Coupon (`couponModel.js`)
Cupones de descuento con tipo (porcentaje/fijo), limite de usos, fecha de expiracion, programas aplicables.

### SubscriptionPayment (`subscriptionPaymentModel.js`)
Registro de cada pago de suscripcion recibido via webhook de Mercado Pago.

### SubscriptionAuditLog (`subscriptionAuditLogModel.js`)
Audit trail de cambios de estado en suscripciones (creacion, cancelacion, expiracion, etc).

### Program (`programModel.js`)
Catalogo de programas educativos. Almacena la estructura completa: secciones, modulos, lecciones e instrucciones. Cada programa tiene tipo (purchase/subscription/demo), precios, y metadata descriptiva.

### CancelToken (`cancelTokenModel.js`)
Tokens de un solo uso para cancelacion de suscripciones via link en email. Incluyen TTL con expiracion automatica.

### FailedEmail (`failedEmailModel.js`)
Emails que fallaron al enviarse, con datos para retry automatico.

### Feedback (`feedbackModel.js`)
Feedback de usuarios capturado desde el game frontend: NPS, reacciones de lección/instrucción, onboarding, y errores client-side. Incluye `type`, `rating`, `reaction`, `message`, `requestId`, `context` y estado `resolved` para gestión.

## Documentacion Adicional

- [API Reference](./docs/api-reference.md) - Request/response completos de cada endpoint
- [Autenticacion](./docs/systems/authentication.md)
- [Gamificacion](./docs/systems/gamification.md)
- [Sistema Educativo](./docs/systems/education.md)
- [AI Grading](./docs/systems/ai-grading.md)
- [Comunidad](./docs/systems/community.md)
- [Rankings](./docs/systems/rankings.md)
- [Equipos y Product Keys](./docs/systems/teams-productkeys.md)
- [Perfiles de Usuario](./docs/systems/user-profiles.md)
- [Pagos y Suscripciones](./docs/systems/payments.md)

## Frontend

- **Repo:** `stannum-game-frontend-v2`
- **Stack:** Next.js 16 + React 19 + TypeScript
- **Comunicacion:** REST API con JWT (access + refresh tokens en cookies)

---

**STANNUM 2026 - Repositorio Privado**
