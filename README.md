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

El servidor estara disponible en `http://localhost:8000`.

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
│   ├── achievementsConfig.js   # 28 achievements con condiciones
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
│   ├── userModel.js            # User: perfil, nivel, XP, achievements, programas, streaks
│   ├── programModel.js         # Catalogo de programas (secciones, modulos, lecciones, instrucciones)
│   ├── productKeyModel.js      # Product keys para activar programas
│   ├── promptModel.js          # Prompts de comunidad
│   ├── assistantModel.js       # Assistants/GPTs de comunidad
│   ├── orderModel.js           # Ordenes de compra (Mercado Pago)
│   ├── couponModel.js          # Cupones de descuento
│   ├── subscriptionPaymentModel.js  # Pagos de suscripcion
│   ├── subscriptionAuditLogModel.js # Audit log de suscripciones
│   ├── cancelTokenModel.js     # Tokens de cancelacion (TTL)
│   └── failedEmailModel.js     # Emails fallidos (retry)
│
├── routes/                  # Definicion de endpoints
│   ├── authRoutes.js           # /api/auth/*
│   ├── userRoutes.js           # /api/user/*
│   ├── lessonRoutes.js         # /api/lesson/*
│   ├── instructionRoutes.js    # /api/instruction/*
│   ├── productKeyRoutes.js     # /api/product-key/*
│   ├── rankingRoutes.js        # /api/ranking/*
│   ├── promptRoutes.js         # /api/prompt/*
│   ├── assistantRoutes.js      # /api/assistant/*
│   ├── profilePhotoRoutes.js   # /api/profile-photo/*
│   ├── chestRoutes.js          # /api/chest/*
│   ├── storeRoutes.js          # /api/store/*
│   ├── paymentRoutes.js        # /api/payment/*
│   ├── subscriptionRoutes.js   # /api/subscription/*
│   └── webhookRoutes.js        # /api/webhooks/*
│
├── controllers/             # Request handlers (logica de cada endpoint)
│   ├── authController.js       # Login, register, Google OAuth, OTP, password reset
│   ├── userController.js       # CRUD usuario, busqueda, tutoriales
│   ├── lessonController.js     # Completar leccion, guardar progreso
│   ├── instructionController.js # Start, submit (S3 presigned), retry grading
│   ├── productKeyController.js  # Activar/listar product keys, emails
│   ├── rankingController.js     # Rankings individuales y por equipo
│   ├── promptController.js      # CRUD prompts, likes, favorites, copy
│   ├── assistantController.js   # CRUD assistants, likes, favorites, clicks
│   ├── profilePhotoController.js # Upload/delete foto de perfil (S3)
│   ├── chestController.js       # Abrir cofres (validacion, recompensas)
│   ├── storeController.js       # Portadas: listar, comprar, equipar. Streak shield y recovery
│   ├── paymentController.js     # Mercado Pago: preferencias, verificacion, ordenes, cupones
│   ├── subscriptionController.js # Suscripciones: crear, cancelar, estado, historial
│   └── webhookController.js     # Webhook handler de Mercado Pago
│
├── services/                # Logica de negocio core
│   ├── experienceService.js    # Calculo y asignacion de XP + niveles
│   ├── coinsService.js         # Calculo y asignacion de Tins
│   ├── achievementsService.js  # Evaluacion y desbloqueo de logros
│   ├── aiGradingService.js     # Calificacion con OpenAI GPT-4o
│   ├── paymentService.js       # Mercado Pago: pagos unicos, ordenes, cupones
│   ├── subscriptionService.js  # Suscripciones: creacion, cancelacion, state machine
│   ├── subscriptionEmailService.js      # Emails de renovacion y notificaciones
│   ├── subscriptionReconciliationService.js # Reconciliacion con Mercado Pago
│   ├── streakService.js        # Gestion de daily streaks
│   ├── programActivationService.js # Activacion de programas (product keys, compras)
│   ├── programCacheService.js  # Cache en memoria del catalogo de programas
│   ├── receiptService.js       # Generacion de recibos de compra y suscripcion
│   └── demoTransferService.js  # Transferencia de progreso demo → programa completo
│
├── middlewares/             # Middlewares Express
│   ├── validateJWT.js          # Verificacion de access token
│   ├── resolveUserByRefreshToken.js # Resolucion de usuario por refresh token
│   ├── fieldsValidate.js       # Validacion de campos (express-validator)
│   ├── rateLimiter.js          # 10 rate limiters configurados
│   ├── validateAPIKey.js       # Validacion de API key (Make.com)
│   ├── isAdmin.js              # Verificacion de rol admin
│   └── webhookVerify.js        # Verificacion de firma de webhook Mercado Pago
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
# Base
NODE_ENV=production
PORT=8000

# MongoDB
DB_URL=mongodb+srv://user:pass@cluster.mongodb.net/stannum-game

# JWT & Auth
SECRET=clave_secreta_jwt_y_otp
REFRESH_SECRET=clave_secreta_refresh_token
ACCESS_TOKEN_EXPIRY=15m

# AWS S3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_BUCKET_NAME=tu-bucket
AWS_S3_BASE_URL=https://tu-bucket.s3.us-east-1.amazonaws.com
AWS_S3_FOLDER_NAME=profile-photos

# OpenAI (AI Grading)
OPENAI_API_KEY=sk-...

# Email (SMTP)
SMTP_EMAIL=noreply@tudominio.com
SMTP_PASSWORD=app_password

# Google OAuth
GOOGLE_USERINFO_API=https://www.googleapis.com/oauth2/v3/userinfo

# reCAPTCHA
RECAPTCHA_SECRET_KEY=tu_secret_key

# CORS
ALLOWED_ORIGINS=["http://localhost:3000","https://stannumgame.com"]

# Cookies (opcional)
COOKIE_DOMAIN=.stannumgame.com

# Make.com (integracion externa)
MAKE_API_KEY=tu_api_key

# Mercado Pago (pagos y suscripciones)
MP_ACCESS_TOKEN=APP_USR-...
MP_NOTIFICATION_URL=https://api.tudominio.com/api/webhooks/mercadopago
FRONTEND_URL=http://localhost:3000
```

## Endpoints

### Autenticacion (`/api/auth`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/auth` | Login con username/email + password | No |
| POST | `/auth/register` | Registro de cuenta nueva | No |
| POST | `/auth/google` | Login/registro con Google OAuth | No |
| GET | `/auth/auth-user` | Verificar token y obtener status | Si |
| POST | `/auth/refresh-token` | Renovar access token | No (usa refresh) |
| POST | `/auth/logout` | Cerrar sesion (invalida refresh token) | Si |
| POST | `/auth/recovery-password` | Solicitar OTP por email | No |
| POST | `/auth/verify-otp` | Verificar OTP | No |
| POST | `/auth/reset-password` | Resetear contrasena | No (usa token temporal) |
| PUT | `/auth/username` | Actualizar username | Si |

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
| GET | `/instruction/presigned-url/:programName/:instructionId` | URL firmada para upload S3 | Si |
| POST | `/instruction/submit/:programName/:instructionId` | Enviar instruccion | Si |
| POST | `/instruction/retry/:programName/:instructionId` | Reintentar calificacion AI | Si |

### Product Keys (`/api/product-key`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| GET | `/product-key/:code` | Verificar product key | Si |
| POST | `/product-key/activate` | Activar product key | Si |
| POST | `/product-key/generate-and-send` | Generar y enviar key por email | API Key |
| POST | `/product-key/generate-and-send-make` | Generar y enviar desde Make.com | API Key |
| POST | `/product-key/generate` | Generar key sin enviar | API Key |
| GET | `/product-key/check/:code` | Verificar estado de key | API Key |

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
| GET | `/subscription/health` | Health stats de suscripciones (ADMIN) | Si (Admin) |
| POST | `/subscription/admin/:userId/:programId/cancel` | Cancelar suscripcion de usuario (ADMIN) | Si (Admin) |
| GET | `/subscription/admin/:userId/:programId/history` | Historial de pagos de usuario (ADMIN) | Si (Admin) |

### Webhooks (`/api/webhooks`)

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/webhooks/mercadopago` | Webhook de notificaciones de Mercado Pago | Firma MP |

Ver [API Reference completa](./docs/api-reference.md) para detalles de request/response bodies.

## Sistemas Principales

### 1. Sistema de Gamificacion

- **XP:** 30 niveles con curva exponencial. Se gana al completar lecciones, instrucciones y abrir cofres.
- **Tins:** Moneda virtual. Se gana con lecciones (5), instrucciones (10-25 segun score), modulos (30), programas (100), cofres (10-15). Se gastan en la Tienda de portadas.
- **Cofres:** Nodos de recompensa en el PathMap. Se desbloquean al completar la actividad previa (`afterItemId`). Otorgan XP, Tins y opcionalmente una portada. Operacion atomica anti double-open.
- **Tienda de Portadas:** 12 portadas cosmeticas (common a legendary, 0-1500 Tins). Compra atomica anti-overspend. Equip/unequip de portada activa.
- **Achievements:** 28 logros verificados en backend. Se evaluan en cada accion relevante.
- **Daily Streaks:** Dias consecutivos con actividad. Bonus de XP creciente (cap 7 dias).
- **Rankings:** Individual global, individual por programa, por equipos.

[Documentacion completa](./docs/systems/gamification.md)

### 2. Sistema Educativo

- **Programas:** TIA, TMD, TIA_SUMMER, TIA_POOL, TRENNO_IA (suscripcion), DEMO_TRENNO (demo)
- **Estructura:** Program → Section → Module → Lesson/Instruction
- **Progreso:** Tracking completo por leccion e instruccion
- **Modulos bloqueados:** Se desbloquean al completar el modulo anterior

[Documentacion completa](./docs/systems/education.md)

### 3. AI Grading

- **Motor:** OpenAI GPT-4o
- **Context injection:** Lecciones previas del modulo + consigna de la instruccion
- **Soporta:** Texto y archivos (imagenes via S3)
- **Output:** Score 0-100 + observaciones constructivas en espanol
- **Retry:** En caso de error, el usuario puede reintentar

[Documentacion completa](./docs/systems/ai-grading.md)

### 4. Autenticacion

- **Access token:** JWT firmado, 15 min de expiracion
- **Refresh token:** 80 chars hex, hasheado con HMAC-SHA256, 7 dias de expiracion
- **Rotacion:** Cada refresh genera un nuevo par de tokens
- **Google OAuth:** Login/registro automatico con datos de Google
- **Password recovery:** OTP por email (6 digitos, 10 min de expiracion)

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

- Contrasenas hasheadas con bcryptjs
- Access tokens JWT de corta duracion (15 min)
- Refresh tokens opacos con rotacion y hash HMAC-SHA256
- Logout server-side (invalidacion de refresh token)
- 10 rate limiters configurados (general, auth, OTP, busqueda, creacion de contenido, etc.)
- CORS por whitelist (`ALLOWED_ORIGINS`)
- Helmet para headers de seguridad
- express-validator en todas las rutas
- Google reCAPTCHA v3 en registro
- Deteccion de profanidad (@2toad/profanity)
- AWS S3 URLs presignadas (no se exponen credenciales)
- Cookie httpOnly + secure + sameSite para tokens

## Modelos MongoDB

### User (`userModel.js`)
Modelo principal (~860 lineas). Incluye:
- Perfil (nombre, pais, empresa, aboutMe, socialLinks)
- Nivel y XP (currentLevel, experienceTotal, xpHistory)
- Achievements desbloqueados
- Programas inscritos con progreso (lecciones, instrucciones, modulos, chestsOpened)
- Daily streaks
- Preferencias y tutorials completados
- Favoritos (prompts, assistants)
- Equipo(s) por programa
- Portadas (unlockedCovers, equippedCoverId)
- Transform `toJSON` que excluye password, otp y refreshToken

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
