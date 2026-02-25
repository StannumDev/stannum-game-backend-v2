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
│   ├── achievementsConfig.js   # 19 achievements con condiciones
│   ├── coinsConfig.js          # Economia de Tins (moneda virtual)
│   ├── xpConfig.js             # Tabla de XP por nivel (30 niveles)
│   ├── chestsConfig.js         # Cofres por modulo (recompensas XP, Tins, portadas)
│   ├── coversConfig.js         # Portadas de perfil (nombre, precio, rareza, imageKey)
│   ├── errors.json             # Codigos de error estandarizados
│   ├── grading_examples.json   # Ejemplos para AI grading
│   ├── lessons_catalog.json    # Catalogo de lecciones
│   └── programs/               # Configuracion por programa (TIA, TMD, TIA_SUMMER)
│
├── models/                  # Schemas MongoDB (Mongoose)
│   ├── userModel.js            # User: perfil, nivel, XP, achievements, programas, streaks
│   ├── productKeyModel.js      # Product keys para activar programas
│   ├── promptModel.js          # Prompts de comunidad
│   └── assistantModel.js       # Assistants/GPTs de comunidad
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
│   └── storeRoutes.js          # /api/store/*
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
│   └── storeController.js       # Portadas: listar, comprar, equipar
│
├── services/                # Logica de negocio core
│   ├── experienceService.js    # Calculo y asignacion de XP + niveles
│   ├── coinsService.js         # Calculo y asignacion de Tins
│   ├── achievementsService.js  # Evaluacion y desbloqueo de logros
│   └── aiGradingService.js     # Calificacion con OpenAI GPT-4o
│
├── middlewares/             # Middlewares Express
│   ├── validateJWT.js          # Verificacion de access token
│   ├── resolveUserByRefreshToken.js # Resolucion de usuario por refresh token
│   ├── fieldsValidate.js       # Validacion de campos (express-validator)
│   ├── rateLimiter.js          # 10 rate limiters configurados
│   ├── validateAPIKey.js       # Validacion de API key (Make.com)
│   └── isAdmin.js              # Verificacion de rol admin
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
│   └── resolveLessonInfo.js    # Resolver info de leccion desde config
│
└── scripts/                 # Scripts de migracion
    └── migrateTotalXp.js       # Migracion de XP total
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
| GET | `/product-key/keys` | Listar todas las keys (ADMIN) | Si (Admin) |
| POST | `/product-key/create` | Crear product keys (ADMIN) | Si (Admin) |

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
| POST | `/profile-photo/upload` | Subir foto de perfil (S3 presigned) | Si |
| DELETE | `/profile-photo/delete` | Eliminar foto de perfil | Si |

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

Ver [API Reference completa](./docs/api-reference.md) para detalles de request/response bodies.

## Sistemas Principales

### 1. Sistema de Gamificacion

- **XP:** 30 niveles con curva exponencial. Se gana al completar lecciones, instrucciones y abrir cofres.
- **Tins:** Moneda virtual. Se gana con lecciones (5), instrucciones (10-25 segun score), modulos (30), programas (100), cofres (10-15). Se gastan en la Tienda de portadas.
- **Cofres:** Nodos de recompensa en el PathMap. Se desbloquean al completar la actividad previa (`afterItemId`). Otorgan XP, Tins y opcionalmente una portada. Operacion atomica anti double-open.
- **Tienda de Portadas:** 6 portadas cosmeticas (common a legendary, 0-1000 Tins). Compra atomica anti-overspend. Equip/unequip de portada activa.
- **Achievements:** 19 logros verificados en backend. Se evaluan en cada accion relevante.
- **Daily Streaks:** Dias consecutivos con actividad. Bonus de XP creciente (cap 7 dias).
- **Rankings:** Individual global, individual por programa, por equipos.

[Documentacion completa](./docs/systems/gamification.md)

### 2. Sistema Educativo

- **Programas:** TIA, TMD, TIA_SUMMER
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

## Frontend

- **Repo:** `stannum-game-frontend-v2`
- **Stack:** Next.js 16 + React 19 + TypeScript
- **Comunicacion:** REST API con JWT (access + refresh tokens en cookies)

---

**STANNUM 2025 - Repositorio Privado**
