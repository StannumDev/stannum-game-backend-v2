# API Reference - STANNUM Game

Documentación completa de todos los endpoints del backend de STANNUM Game.

**Base URL:** `http://localhost:4000/api` (desarrollo, default si no hay `PORT` en `.env`) | `https://api.stannumgame.com/api` (producción)

**Autenticación:**
- **JWT cookie-based**: el access token se setea como cookie `access_token` (httpOnly) y el refresh como `refresh_token`. El backend usa `cookie-parser` con `process.env.SECRET` y `setAuthCookies` para emitirlas. Algunos endpoints internos siguen aceptando `Authorization: Bearer` para compatibilidad.
- **Activation JWT**: cookie temporal con `scope: "activation"` para completar el onboarding del flujo magic link (ver [authentication.md](./systems/authentication.md#magic-link--auto-enroll)).
- **API Key**: header `x-api-key` para endpoints internos (admin, product-key/generate, programs, feedback/error). Definido en `validateAPIKey` middleware.

> Todas las requests no-GET con CORS deben venir desde un origin permitido en `ALLOWED_ORIGINS` o llevar `x-api-key`. Caso contrario el middleware CSRF las bloquea con `403 CSRF_ORIGIN_MISMATCH`.

---

## Indice

1. [Autenticación](#autenticacion)
2. [Usuario](#usuario)
3. [Lecciones](#lecciones)
4. [Instrucciones](#instrucciones)
5. [Product Keys](#product-keys)
6. [Rankings](#rankings)
7. [Prompts (Comunidad)](#prompts-comunidad)
8. [Assistants (Comunidad)](#assistants-comunidad)
9. [Profile Photo](#profile-photo)
10. [Cofres](#cofres)
11. [Tienda](#tienda)
12. [Pagos - Mercado Pago](#pagos---mercado-pago)
13. [Suscripciones - Mercado Pago](#suscripciones---mercado-pago)
14. [Webhooks](#webhooks)
15. [Programas (Admin/Trenno Dashboard)](#programas-admin--trenno-dashboard)
16. [Admin](#admin)
17. [Feedback](#feedback)

---

## Autenticacion

> Todos los endpoints de auth setean (o limpian) las cookies httpOnly `access_token` y `refresh_token` mediante `setAuthCookies` / `clearAuthCookies`. Los tokens **NO** vuelven en el body de la respuesta — el frontend solo recibe metadata (`success`, `achievementsUnlocked`, `profileStatus`). Ver [systems/authentication.md](./systems/authentication.md) para el detalle del flujo.

### POST `/auth`
**Login con username/email y contraseña** (rate limited: `authLimiter`)

**Body:**
```json
{
  "username": "usuario123_o_email@example.com",
  "password": "Contraseña123"
}
```

**Response 200:** (cookies seteadas)
```json
{
  "success": true,
  "achievementsUnlocked": []
}
```

**Errors:**
- `401 AUTH_INVALID_CREDENTIALS` — username/password inválidos o usuario inactivo
- `403 AUTH_PASSWORD_LOGIN_DISABLED` — el usuario solo puede entrar con Google

---

### POST `/auth/register`
**Registro de cuenta nueva** (rate limited: `authLimiter`)

**Body:**
```json
{
  "username": "usuario123",
  "email": "usuario@example.com",
  "password": "Contraseña123",
  "name": "Juan Pérez",
  "birthdate": "1990-01-15",
  "country": "Argentina",
  "region": "Buenos Aires",
  "enterprise": "Mi Empresa",
  "enterpriseRole": "Developer",
  "aboutme": "Descripción sobre mí..."
}
```

**Validaciones:** username 6-25 chars `[a-zA-Z0-9._]`, password 8-50 con mayúscula+minúscula+número, edad ≥ 18, name 2-50 chars solo letras+espacios, aboutme max 2600.

**Response 201:** (cookies seteadas)
```json
{
  "success": true,
  "message": "User created successfully"
}
```

**Errors:** `409 AUTH_EMAIL_ALREADY_EXISTS`, `409 AUTH_USERNAME_ALREADY_EXISTS`.

---

### POST `/auth/check-email`
**Validar disponibilidad de email** (rate limited: `validationLimiter`)

**Body:** `{ "email": "..." }`

**Response 200:** `{ "success": true, "message": "Email is available." }`

**Error 409 `AUTH_EMAIL_ALREADY_EXISTS`** si el email ya está registrado.

---

### POST `/auth/validate-username`
**Validar disponibilidad y formato de username** (rate limited: `validationLimiter`)

**Body:** `{ "username": "..." }` (6-25 chars, solo `[a-zA-Z0-9._]`)

**Response 200:** `{ "success": true, "message": "Username is available." }`

**Errors:** `400 VALIDATION_USERNAME_*`, `400 VALIDATION_USERNAME_OFFENSIVE`, `409 AUTH_USERNAME_ALREADY_EXISTS`.

---

### POST `/auth/validate-recaptcha`
**Verificar token de reCAPTCHA v3 contra Google**

**Body:** `{ "token": "<recaptcha_token>" }`

**Response 200:** `{ "success": true, "message": "ReCAPTCHA validated successfully." }`

---

### POST `/auth/google`
**Login con Google OAuth** (rate limited: `authLimiter`)

**Body:** `{ "token": "<google_access_token>" }`

**Response 200:** (cookies seteadas)
```json
{
  "success": true,
  "username": "usuario123",
  "achievementsUnlocked": []
}
```

> Si el user no existe, lo crea como Google account (`isGoogleAccount: true`, `allowPasswordLogin: false`) e intenta importar la foto de Google.

---

### GET `/auth/auth-user`
**Verificar token y obtener achievements/profile status**

**Auth:** cookie `access_token` (validateJWT)

**Response 200:**
```json
{
  "success": true,
  "achievementsUnlocked": [],
  "profileStatus": "complete" | "needs_activation"
}
```

---

### POST `/auth/refresh-token`
**Renovar access token usando el refresh token de la cookie** (rate limited: `refreshLimiter`)

No requiere `Authorization` ni body — el refresh token se lee de la cookie `refresh_token`.

**Validación interna:** `refresh_token` cookie debe existir, ser exactamente 80 chars y matchear `^[a-f0-9]+$`.

**Response 200:** (cookies rotadas)
```json
{ "success": true }
```

**Notas:**
- Implementa **rotación de tokens**: el refresh anterior se invalida y se genera uno nuevo en la misma operación atómica.
- Errors: `400 REFRESH_TOKEN_MISSING`, `400 REFRESH_TOKEN_INVALID`, `401 REFRESH_TOKEN_INVALID`, `401 REFRESH_TOKEN_EXPIRED`.

---

### POST `/auth/logout`
**Cerrar sesión** (limpia `refreshToken` en DB y cookies)

**Auth:** middleware `resolveUserByRefreshToken` (resuelve user por la cookie `refresh_token`).

**Response 200:**
```json
{ "success": true, "message": "Logged out successfully." }
```

---

### PUT `/auth/update-username`
**Cambiar el username del user logueado**

**Auth:** cookie `access_token` (validateJWT)

**Body:** `{ "username": "nuevo_username" }` (6-25 chars `[a-zA-Z0-9._]`)

**Response 200:**
```json
{
  "success": true,
  "message": "Username updated successfully",
  "profileStatus": "complete" | "needs_activation"
}
```

**Errors:** `409 AUTH_USERNAME_ALREADY_EXISTS`, `400 VALIDATION_USERNAME_*`.

---

### POST `/auth/password-recovery`
**Solicitar OTP para recuperación de contraseña** (rate limited: `otpLimiter` + `passwordLimiter`)

**Body:** `{ "username": "usuario_o_email" }`

**Response 200:** `{ "success": true, "message": "Si el usuario existe, recibirá un correo." }`

> Siempre devuelve 200 para no filtrar si el usuario existe. Envía un OTP de 6 dígitos al email asociado, válido por 30 minutos.

---

### POST `/auth/verify-recovery-otp`
**Verificar OTP de recuperación** (rate limited: `otpLimiter`)

**Body:** `{ "username": "usuario_o_email", "otp": "123456" }`

**Response 200:** `{ "success": true, "message": "OTP validado con éxito." }`

> Marca `otp.recoveryVerified = true` para habilitar el reset. Tras 5 intentos fallidos se borra el OTP completo.

---

### POST `/auth/password-reset`
**Resetear contraseña** (rate limited: `otpLimiter` + `passwordLimiter`)

**Body:**
```json
{
  "username": "usuario_o_email",
  "otp": "123456",
  "password": "NuevaPassword123"
}
```

**Response 200:** `{ "success": true, "message": "Contraseña actualizada exitosamente." }`

> Operación atómica vía `findOneAndUpdate` que requiere `recoveryVerified: true` y OTP no expirado. Tras el reset se invalida el `refreshToken` y se setean cookies vacías → el usuario debe volver a loguearse.

---

### GET `/auth/magic-link/:token`
**Consumir magic link (auto-enroll)** (rate limited: `authLimiter`)

**Params:** `token` — 64 hex chars (regex `^[a-f0-9]{64}$`)

**Response 200 — user completo (login automático):** (cookies de sesión seteadas)
```json
{ "success": true, "scope": "full", "profileStatus": "complete" }
```

**Response 200 — user stub (necesita completar perfil):** (cookie `access_token` con scope `activation` por `ONBOARDING_JWT_TTL_MINUTES`)
```json
{
  "success": true,
  "scope": "activation",
  "profileStatus": "needs_activation",
  "email": "lead@example.com"
}
```

**Errors:** `400 MAGIC_LINK_INVALID`, `404 MAGIC_LINK_INVALID`, `410 MAGIC_LINK_EXPIRED`, `403 AUTH_ACCOUNT_DISABLED`.

> Single-use: el magic link se invalida en DB inmediatamente al consumir. Ver [authentication.md § Magic Link](./systems/authentication.md#magic-link--auto-enroll).

---

### POST `/auth/complete-activation`
**Completar onboarding del stub user** (auth: `validateActivationJWT`)

**Body:** mismos campos que `/auth/register` (`username, password, name, birthdate, country, region, enterprise, enterpriseRole, aboutme`).

**Response 200:** (cookies de sesión real seteadas)
```json
{
  "success": true,
  "achievementsUnlocked": [],
  "profileStatus": "complete"
}
```

**Errors:** `409 USER_ALREADY_ACTIVATED`, `409 AUTH_USERNAME_ALREADY_EXISTS`, `400 VALIDATION_USERNAME_INVALID` (si arranca con `pending_` o `google_`), `400 VALIDATION_USERNAME_OFFENSIVE`.

---

## Usuario

> **Nota:** El transform `toJSON` del schema excluye automáticamente `password`, `otp`, `refreshToken` y `magicLink` de todas las respuestas. Los endpoints del game frontend usan `getGameUserDetails()` (sanitizado) en vez de devolver el documento crudo. Ver [user-profiles.md](./systems/user-profiles.md).

### GET `/user`
**Obtener datos completos del usuario autenticado** (sanitizado vía `getGameUserDetails`, cacheado por user)

**Auth:** cookie `access_token` (validateJWT)

**Response 200:**
```json
{
  "success": true,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "usuario123",
    "profilePhoto": "https://s3.../profile.jpg",
    "profile": {
      "name": "Juan Pérez",
      "country": "Argentina",
      "region": "Buenos Aires",
      "birthdate": "1990-01-01",
      "aboutMe": "...",
      "socialLinks": [...]
    },
    "enterprise": {
      "name": "Mi Empresa",
      "jobPosition": "Developer"
    },
    "teams": [...],
    "level": {
      "currentLevel": 5,
      "experienceTotal": 1500,
      "experienceCurrentLevel": 900,
      "experienceNextLevel": 1400,
      "progress": 75
    },
    "achievements": [...],
    "programs": {...},
    "dailyStreak": {
      "count": 7,
      "lastActivityLocalDate": "2025-01-15",
      "timezone": "America/Argentina/Buenos_Aires"
    },
    "xpHistory": [...],
    "unlockedCovers": [...],
    "preferences": {...},
    "favorites": {
      "prompts": [...],
      "assistants": [...]
    }
  }
}
```

---

### GET `/user/sidebar-details`
**Obtener detalles mínimos para sidebar**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "usuario123",
    "profilePhoto": "https://s3.../profile.jpg"
  }
}
```

---

### GET `/user/profile/:username`
**Obtener perfil público de usuario**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "usuario123",
    "profilePhoto": "https://s3.../profile.jpg",
    "profile": {...},
    "enterprise": {...},
    "level": {...},
    "achievements": [...],
    "dailyStreak": {...}
  }
}
```

---

### PUT `/user/edit`
**Actualizar perfil de usuario**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "name": "Juan Carlos Pérez",
  "birthdate": "1990-01-01",
  "country": "Argentina",
  "region": "Buenos Aires",
  "enterprise": "Mi Empresa S.A.",
  "enterpriseRole": "Senior Developer",
  "aboutme": "Desarrollador full stack...",
  "socialLinks": [
    {
      "platform": "LinkedIn",
      "url": "https://linkedin.com/in/usuario"
    }
  ]
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Perfil actualizado correctamente"
}
```

---

### GET `/user/search-users`
**Buscar usuarios**

**Headers:** `Authorization: Bearer {token}`

**Query params:**
- `query`: Término de búsqueda (min 2 caracteres)

**Response 200:**
```json
{
  "success": true,
  "users": [
    {
      "id": "507f1f77bcf86cd799439011",
      "username": "usuario123",
      "name": "Juan Pérez",
      "profilePhoto": "https://...",
      "enterprise": "Mi Empresa",
      "jobPosition": "Developer"
    }
  ]
}
```

---

### GET `/user/tutorial/:tutorialName`
**Obtener estado de tutorial**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "isCompleted": true,
  "completedAt": "2025-01-15T10:30:00.000Z"
}
```

---

### POST `/user/tutorial/:tutorialName/complete`
**Marcar tutorial como completado**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Tutorial marcado como completado"
}
```

---

## Lecciones

### POST `/lesson/complete/:programName/:lessonId`
**Completar lección y ganar XP**

**Auth:** cookie `access_token` (validateJWT)

**Params:**
- `programName`: `tia` | `tia_summer` | `tia_pool` | `tmd` | `trenno_ia` | `demo_trenno`
- `lessonId`: ID de la lección (ej: `TIAM01L01`)

**Response 200:**
```json
{
  "success": true,
  "message": "Lección marcada como completada",
  "gained": 158,
  "streakBonus": 25,
  "totalGain": 183,
  "newLevel": 5,
  "achievementsUnlocked": [
    {
      "achievementId": "first_lesson_completed",
      "unlockedAt": "2025-01-15T10:30:00.000Z",
      "xpReward": 50
    }
  ]
}
```

---

### GET `/lesson/playback/:programName/:lessonId`
**Obtener playback ID de Mux para reproducir video**

**Auth:** cookie `access_token` (validateJWT)

**Params:**
- `programName`: `tia` | `tia_summer` | `tia_pool` | `tmd` | `trenno_ia` | `demo_trenno`
- `lessonId`: ID de la lección

**Response 200:**
```json
{
  "success": true,
  "playbackId": "a1b2c3d4e5f6g7h8"
}
```

---

### PATCH `/lesson/lastwatched/:programName/:lessonId`
**Guardar progreso de video (último visto)**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "currentTime": 125.5
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Última lección vista actualizada"
}
```

---

## Instrucciones

### POST `/instruction/start/:programName/:instructionId`
**Iniciar instrucción**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Instrucción iniciada correctamente"
}
```

**Errors:**
- `403`: Instrucción bloqueada (lección previa no completada)
- `400`: Instrucción ya iniciada

---

### POST `/instruction/presign/:programName/:instructionId`
**Obtener URLs firmadas para subir 1-10 archivos a S3** (rate limited: `submissionLimiter`)

> **Importante:** método `POST`, path `/presign` (no `/presigned-url`).

**Body:**
```json
{
  "files": [
    { "fileName": "captura1.png", "contentType": "image/png" },
    { "fileName": "captura2.jpg", "contentType": "image/jpeg" }
  ]
}
```

**Validaciones:**
- `files`: array, mínimo 1, máximo 10 (cap del endpoint, además de `config.maxFiles` por instrucción)
- `programName`: `tia | tia_summer | tia_pool | tmd` (instrucciones solo para programas de compra única)
- `contentType` validado contra `acceptedFormats` de la config

**Response 200:**
```json
{
  "success": true,
  "presignedUrls": [
    { "presignedUrl": "https://s3...", "s3Key": "instructions/userId/instructionId/{ts}-0.png" },
    { "presignedUrl": "https://s3...", "s3Key": "instructions/userId/instructionId/{ts}-1.jpg" }
  ]
}
```

> Cada URL firmada expira en 300 segundos. El frontend debe hacer `PUT` directo a S3 con el `Content-Type` exacto y luego pasar los `s3Key` a `/submit`.

---

### POST `/instruction/submit/:programName/:instructionId`
**Enviar instrucción completada** (rate limited: `submissionLimiter`)

**Body (si deliverable = file, multi-file):**
```json
{
  "s3Keys": [
    "instructions/userId/instructionId/{ts}-0.png",
    "instructions/userId/instructionId/{ts}-1.jpg"
  ]
}
```

**Body (si deliverable = file, single legacy):**
```json
{
  "s3Key": "instructions/userId/instructionId/{ts}.png"
}
```

**Body (si deliverable = text):**
```json
{
  "submittedText": "Mi respuesta detallada..."
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Instrucción entregada correctamente."
}
```

**Notas:**
- El backend hace `HEAD` a S3 para validar tamaño (`maxFileSizeMB`) y existencia antes de aceptar.
- La calificación AI se dispara en background con retry exponencial x3. Status pasa a `GRADED` o `ERROR` automáticamente.

---

### POST `/instruction/retry/:programName/:instructionId`
**Reintentar calificación AI (si hubo error)**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Reintentando corrección automática"
}
```

---

## Product Keys

> Producto válido: `tia | tia_summer | tia_pool | tmd`. **No** se aceptan `trenno_ia` (suscripción) ni `demo_trenno`.

### GET `/product-key/:code`
**Pre-verificar código antes de activar (usuario logueado)**

**Auth:** cookie `access_token` (validateJWT)

**Params:** `code` formato `XXXX-XXXX-XXXX-XXXX` (validado por regex)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "code": "ABCD-1234-EFGH-5678",
    "product": "tia",
    "team": "equipo_alpha",
    "used": false,
    "usedAt": null,
    "email": "comprador@example.com"
  }
}
```

**Errors:** `404 VALIDATION_PRODUCT_KEY_NOT_FOUND`, `404 VALIDATION_PRODUCT_KEY_ALREADY_USED`.

---

### POST `/product-key/activate`
**Activar código de producto** (transacción MongoDB con rollback automático)

**Auth:** cookie `access_token` (validateJWT)

**Body:** `{ "code": "ABCD-1234-EFGH-5678" }`

**Response 200:**
```json
{
  "success": true,
  "message": "Programa activado correctamente.",
  "achievementsUnlocked": [
    {
      "achievementId": "first_program_acquired",
      "unlockedAt": "2026-05-05T10:30:00.000Z",
      "xpReward": 50
    }
  ]
}
```

**Errors:** `404 VALIDATION_PRODUCT_KEY_NOT_FOUND`, `400 VALIDATION_PRODUCT_KEY_ALREADY_USED`, `400 VALIDATION_PRODUCT_ALREADY_OWNED`.

---

### POST `/product-key/generate`
**Generar product key sin enviar (admin/integraciones)**

**Auth:** header `x-api-key`

**Body:**
```json
{
  "email": "comprador@example.com",
  "product": "tia",
  "team": "equipo_alpha"
}
```

**Response 201:**
```json
{
  "success": true,
  "code": "ABCD-1234-EFGH-5678",
  "email": "comprador@example.com"
}
```

---

### POST `/product-key/generate-and-send`
**Generar product key y enviar email simple**

**Auth:** header `x-api-key`

**Body:**
```json
{
  "email": "comprador@example.com",
  "product": "tia",
  "team": "equipo_alpha"
}
```

**Response 201:** `{ "code": "...", "email": "..." }` + envía email con template HTML.

---

### POST `/product-key/generate-and-send-make`
**Generar y enviar product key desde Make.com (con diagnóstico personalizado)**

**Auth:** header `x-api-key`

**Body:**
```json
{
  "email": "comprador@example.com",
  "fullName": "SnVhbiBQw6lyZXo=",
  "message": "VHUgZGlhZ27Ds3N0aWNvLi4u",
  "product": "tia",
  "team": "no_team",
  "guideLink": "https://...",
  "whatsappLink": "https://wa.me/..."
}
```

> `fullName` y `message` deben venir codificados en Base64. Producto restringido a `tia | tia_summer | tia_pool` en este endpoint específico (sin `tmd`). Ver [teams-productkeys.md § Método 3](./systems/teams-productkeys.md#método-3-generar-con-diagnóstico-makecom).

**Response 201:** `{ "code": "...", "email": "..." }` + envía email enriquecido (diagnóstico, pasos de activación, CTA opcionales).

---

### POST `/product-key/auto-enroll`
**Crear/reusar user stub + activar programa + magic link** (transaccional)

**Auth:** header `x-api-key`

**Body:** mismos campos que `generate-and-send-make`. Producto válido: `tia | tmd | tia_summer | tia_pool`.

**Response 201/200 según caso:**
```json
{
  "success": true,
  "status": "new_user" | "existing_stub_resent" | "activated_for_existing_user" | "already_owned",
  "email": "lead@example.com"
}
```

> Ver flujo completo en [teams-productkeys.md § Método 4](./systems/teams-productkeys.md#método-4-auto-enroll-magic-link-activation) y consumo del link en [authentication.md § Magic Link](./systems/authentication.md#magic-link--auto-enroll).

---

### GET `/product-key/check/:code`
**Verificar estado de product key (soporte / integración externa)**

**Auth:** header `x-api-key`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "code": "ABCD-1234-EFGH-5678",
    "email": "comprador@example.com",
    "product": "tia",
    "isActivated": true,
    "activatedAt": "2026-05-05T10:30:00.000Z",
    "user": {
      "name": "Juan Pérez",
      "email": "usuario@example.com"
    }
  }
}
```

**Error:** `404 VALIDATION_PRODUCT_KEY_NOT_FOUND`.

---

## Rankings

> Programas rankeables (`RANKABLE_PROGRAMS`): `tmd | tia | tia_summer | tia_pool | trenno_ia`. Resultados cacheados in-memory (`node-cache`) con TTL definido en `cacheService`.

### GET `/ranking/individual`
**Ranking individual (global)**

**Auth:** cookie `access_token` (validateJWT)

**Query params:**
- `limit`: cantidad de usuarios (default: 10, **max efectivo: 100** — el validator acepta hasta 1000 pero el controller hace `Math.min(limit, 100)`)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "position": 1,
      "id": "507f1f77bcf86cd799439011",
      "name": "Juan ****",
      "username": "usuario123",
      "photo": "https://...",
      "enterprise": "Mi ******",
      "points": 5000,
      "level": 15
    }
  ]
}
```

---

### GET `/ranking/individual/:programName`
**Ranking individual por programa específico**

**Auth:** cookie `access_token` (validateJWT)

**Params:** `programName` ∈ `RANKABLE_PROGRAMS`

**Query params:** `limit` (default 10, max efectivo 100)

**Response:** misma forma que `/individual` pero ordenado por `programs[programName].totalXp`. Solo incluye usuarios con acceso a ese programa específico.

---

### GET `/ranking/team/:programName`
**Ranking por equipos de un programa**

**Auth:** cookie `access_token` (validateJWT)

**Params:**
- `programName`: `tmd` | `tia` | `tia_summer` | `tia_pool` | `trenno_ia`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "position": 1,
      "team": "equipo_alpha",
      "points": 15000,
      "members": [
        {
          "id": "...",
          "name": "Juan ****",
          "username": "usuario123",
          "photo": "...",
          "enterprise": "...",
          "points": 5000,
          "level": 15
        }
      ]
    }
  ]
}
```

---

## Prompts (Comunidad)

### GET `/prompt`
**Listar prompts con filtros**

**Headers:** `Authorization: Bearer {token}`

**Query params:**
- `page`: Número de página (default: 1)
- `limit`: Límite por página (default: 20, max: 50)
- `category`: `sales` | `productivity` | `marketing` | `innovation` | `leadership` | `strategy` | `automation` | `content` | `analysis` | `growth`
- `difficulty`: `basic` | `intermediate` | `advanced`
- `sortBy`: `popular` | `newest` | `mostCopied` | `mostLiked` | `mostViewed` | `verified`
- `search`: Término de búsqueda (min 2 caracteres)
- `platforms`: Filtro de plataformas
- `favoritesOnly`: `true` | `false`
- `stannumVerifiedOnly`: `true` | `false`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "title": "Prompt para análisis SWOT",
      "description": "...",
      "contentPreview": "Actúa como consultor...",
      "category": "strategy",
      "difficulty": "intermediate",
      "platforms": ["chatgpt", "claude"],
      "tags": ["swot", "estrategia", "negocios"],
      "metrics": {
        "copiesCount": 50,
        "likesCount": 25,
        "favoritesCount": 10,
        "viewsCount": 200
      },
      "author": {
        "username": "usuario123",
        "profilePhotoUrl": "..."
      },
      "stannumVerified": {
        "isVerified": true,
        "verifiedAt": "..."
      },
      "createdAt": "...",
      "hasCustomGpt": false,
      "userActions": {
        "hasLiked": false,
        "hasFavorited": true
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalItems": 200
  }
}
```

---

### GET `/prompt/:id`
**Obtener prompt completo por ID**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "prompt": {
    "id": "...",
    "title": "...",
    "description": "...",
    "content": "Prompt completo...",
    "category": "...",
    "difficulty": "...",
    "platforms": [...],
    "customGptUrl": "...",
    "tags": [...],
    "exampleOutput": "...",
    "metrics": {...},
    "author": {...},
    "visibility": "published",
    "stannumVerified": {...},
    "createdAt": "...",
    "updatedAt": "...",
    "popularityScore": 250,
    "engagementRate": "15.50",
    "userActions": {...}
  }
}
```

---

### POST `/prompt`
**Crear nuevo prompt**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "title": "Mi nuevo prompt",
  "description": "Descripción corta del prompt",
  "content": "Contenido completo del prompt...",
  "category": "productivity",
  "difficulty": "basic",
  "platforms": ["chatgpt", "claude"],
  "tags": ["productividad", "gestión"],
  "customGptUrl": "https://chat.openai.com/g/...",
  "exampleOutput": "Ejemplo de salida...",
  "visibility": "published"
}
```

**Response 201:**
```json
{
  "success": true,
  "message": "Prompt creado exitosamente",
  "promptId": "507f1f77bcf86cd799439011"
}
```

---

### PUT `/prompt/:id`
**Actualizar prompt**

**Headers:** `Authorization: Bearer {token}`

**Body:** (mismos campos que POST)

**Response 200:**
```json
{
  "success": true,
  "message": "Prompt actualizado exitosamente"
}
```

---

### DELETE `/prompt/:id`
**Eliminar prompt (soft delete)**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Prompt eliminado exitosamente"
}
```

---

### POST `/prompt/:id/copy`
**Copiar prompt (incrementa contador)**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Prompt copiado"
}
```

---

### POST `/prompt/:id/like`
**Dar like a prompt**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Like agregado"
}
```

---

### DELETE `/prompt/:id/like`
**Quitar like de prompt**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Like removido"
}
```

---

### POST `/prompt/:id/favorite`
**Toggle favorito**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "isFavorited": true,
  "message": "Prompt agregado a favoritos"
}
```

---

### GET `/prompt/me/prompts`
**Mis prompts creados**

**Headers:** `Authorization: Bearer {token}`

**Query params:**
- `page`: Número de página
- `limit`: Límite por página

**Response 200:**
```json
{
  "success": true,
  "data": [...]
}
```

---

### GET `/prompt/me/favorites`
**Mis prompts favoritos**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "data": [...]
}
```

---

## Assistants (Comunidad)

### GET `/assistant`
**Listar assistants con filtros**

**Headers:** `Authorization: Bearer {token}`

**Query params:** (similares a `/prompt`)
- `page`, `limit`, `category`, `difficulty`, `sortBy`, `search`
- `platform`: `chatgpt` | `claude` | `gemini` | `poe` | `perplexity` | `other`
- `favoritesOnly`, `stannumVerifiedOnly`

**Response 200:** (estructura similar a prompts)

---

### POST `/assistant`
**Crear nuevo assistant**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "title": "Mi GPT personalizado",
  "description": "Descripción del assistant",
  "assistantUrl": "https://chat.openai.com/g/...",
  "category": "productivity",
  "difficulty": "basic",
  "platform": "chatgpt",
  "tags": ["productividad"],
  "useCases": "Casos de uso del assistant..."
}
```

**Response 201:**
```json
{
  "success": true,
  "message": "Assistant creado exitosamente",
  "assistantId": "..."
}
```

---

### POST `/assistant/:id/click`
**Registrar click en assistant (incrementa contador)**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Click registrado"
}
```

---

### POST `/assistant/:id/like`
**Dar like a assistant**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Like agregado"
}
```

---

## Profile Photo

### POST `/profile-photo/presign-photo`
**Obtener URL presignada para subir foto a S3**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "contentType": "image/png"
}
```

**Response 200:**
```json
{
  "success": true,
  "presignedUrl": "https://s3...presigned-url",
  "s3Key": "profile_photos/userId/timestamp.png"
}
```

---

### POST `/profile-photo/confirm-photo`
**Confirmar subida de foto y procesar**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "s3Key": "profile_photos/userId/timestamp.png"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Foto de perfil actualizada",
  "photoUrl": "https://s3.../profile_photos/userId/timestamp.png"
}
```

---

### GET `/profile-photo/get-photo`
**Obtener foto de perfil propia**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "photoUrl": "https://s3.../profile_photos/userId/timestamp.png"
}
```

---

### GET `/profile-photo/get-photo/:username`
**Obtener foto de perfil por username**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "photoUrl": "https://s3.../profile_photos/userId/timestamp.png"
}
```

---

### DELETE `/profile-photo/delete-photo`
**Eliminar foto de perfil**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Foto de perfil eliminada"
}
```

---

## Cofres

### POST `/chest/:programId/:chestId/open`
**Abrir cofre y recibir recompensas**

**Headers:** `Authorization: Bearer {token}`

**Params:**
- `programId`: `tia` | `tia_summer` | `tia_pool` | `tmd`
- `chestId`: ID del cofre (ej: `TIAM01C01`)

**Response 200:**
```json
{
  "success": true,
  "rewards": {
    "xp": 50,
    "coins": 15,
    "cover": {
      "coverId": "cover_neon",
      "name": "Neon",
      "rarity": "rare"
    }
  },
  "achievementsUnlocked": []
}
```

**Errors:**
- `400`: Cofre ya abierto
- `403`: Cofre bloqueado (actividad previa no completada)

---

## Tienda

### GET `/store/covers`
**Listar portadas disponibles con estado de propiedad**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "covers": [
    {
      "coverId": "cover_neon",
      "name": "Neon",
      "price": 200,
      "rarity": "rare",
      "imageKey": "covers/neon.png",
      "owned": false,
      "equipped": false
    }
  ],
  "userCoins": 500
}
```

---

### POST `/store/covers/purchase`
**Comprar portada con Tins**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "coverId": "cover_neon"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Portada comprada exitosamente",
  "coinsRemaining": 300
}
```

**Errors:**
- `400`: Tins insuficientes
- `400`: Portada ya comprada

---

### PUT `/store/covers/equip`
**Equipar portada en perfil**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "coverId": "cover_neon"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Portada equipada"
}
```

---

### POST `/store/items/streak-shield/purchase`
**Comprar escudo de racha con Tins**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "shields": 1,
  "coinsSpent": 50,
  "coinsRemaining": 450
}
```

---

### POST `/store/streak/recover`
**Recuperar racha perdida con Tins**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "restoredCount": 5,
  "coinsSpent": 100,
  "coinsRemaining": 400
}
```

---

## Pagos - Mercado Pago

### POST `/payment/create-preference`
**Crear preferencia de pago (compra unica)**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "programId": "tia",
  "isGift": false,
  "giftEmail": null,
  "giftName": null,
  "giftMessage": null,
  "couponCode": "DESCUENTO20"
}
```

**Response 200:**
```json
{
  "success": true,
  "preferenceId": "123456789-abc",
  "initPoint": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=...",
  "orderId": "507f1f77bcf86cd799439011"
}
```

---

### POST `/payment/verify`
**Verificar pago completado**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "paymentId": "12345678",
  "orderId": "507f1f77bcf86cd799439011"
}
```

**Response 200:**
```json
{
  "success": true,
  "status": "approved",
  "order": {
    "orderId": "...",
    "programId": "tia",
    "amount": 50000,
    "status": "completed"
  }
}
```

---

### GET `/payment/my-orders`
**Historial de ordenes del usuario**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "orders": [
    {
      "orderId": "...",
      "programId": "tia",
      "amount": 50000,
      "status": "completed",
      "isGift": false,
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### GET `/payment/order/:orderId`
**Detalle de una orden**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "order": {
    "orderId": "...",
    "programId": "tia",
    "amount": 50000,
    "status": "completed",
    "isGift": false,
    "giftEmail": null,
    "couponCode": null,
    "discount": 0,
    "createdAt": "...",
    "completedAt": "..."
  }
}
```

---

### POST `/payment/order/:orderId/cancel`
**Cancelar orden**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Orden cancelada"
}
```

---

### POST `/payment/order/:orderId/resend-email`
**Reenviar email de regalo** (rate limited: `sensitiveOperationLimiter`)

**Auth:** cookie `access_token` (validateJWT)

**Response 200:**
```json
{
  "success": true,
  "message": "Email reenviado"
}
```

---

### GET `/payment/order/:orderId/receipt`
**Descargar comprobante PDF de la orden** (rate limited: `sensitiveOperationLimiter`)

**Auth:** cookie `access_token` (validateJWT)

**Params:** `orderId` validado con `isMongoId()`.

**Response 200:** stream PDF (header `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="..."`).

> El frontend debe leer `Content-Disposition` para extraer el filename. CORS lo expone via `exposedHeaders: ['Content-Disposition']` en `src/index.js`.

---

### POST `/payment/apply-coupon`
**Aplicar cupon de descuento**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "programId": "tia",
  "couponCode": "DESCUENTO20"
}
```

**Response 200:**
```json
{
  "success": true,
  "discount": 10000,
  "finalPrice": 40000,
  "coupon": {
    "code": "DESCUENTO20",
    "type": "percentage",
    "value": 20
  }
}
```

---

### POST `/payment/coupon` (ADMIN)
**Crear cupon de descuento**

**Headers:** `Authorization: Bearer {token}` (requiere rol ADMIN)

**Body:**
```json
{
  "code": "DESCUENTO20",
  "type": "percentage",
  "value": 20,
  "maxUses": 100,
  "expiresAt": "2025-12-31T23:59:59.000Z",
  "applicablePrograms": ["tia", "tia_summer"]
}
```

---

### GET `/payment/coupons` (ADMIN)
**Listar todos los cupones**

**Headers:** `Authorization: Bearer {token}` (requiere rol ADMIN)

---

### PUT `/payment/coupon/:id` (ADMIN)
**Actualizar cupon**

**Headers:** `Authorization: Bearer {token}` (requiere rol ADMIN)

---

## Suscripciones - Mercado Pago

### POST `/subscription/create`
**Crear suscripcion mensual**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "programId": "trenno_ia"
}
```

**Response 200:**
```json
{
  "success": true,
  "initPoint": "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=...",
  "subscriptionId": "mp_subscription_id"
}
```

**Nota:** El frontend redirige al usuario a `initPoint`. MP notifica via webhook cuando se confirma.

---

### POST `/subscription/cancel`
**Cancelar suscripcion**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "programId": "trenno_ia"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Suscripcion cancelada",
  "accessUntil": "2025-02-15T00:00:00.000Z"
}
```

---

### GET `/subscription/status/:programId`
**Estado de suscripcion para un programa**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "subscription": {
    "status": "active",
    "programId": "trenno_ia",
    "startDate": "2025-01-15T00:00:00.000Z",
    "nextPaymentDate": "2025-02-15T00:00:00.000Z",
    "amount": 30000
  }
}
```

---

### GET `/subscription/payments/:programId`
**Historial de pagos de suscripcion**

**Auth:** cookie `access_token` (validateJWT)

**Query params:**
- `page`: número de página (default: 1)

**Response 200:**
```json
{
  "success": true,
  "payments": [
    {
      "amount": 30000,
      "status": "approved",
      "date": "2026-05-05T10:30:00.000Z",
      "mpPaymentId": "12345678"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalItems": 12
  }
}
```

---

### GET `/subscription/payment/:paymentId/receipt`
**Descargar comprobante PDF de un pago de suscripción** (rate limited: `sensitiveOperationLimiter`)

**Auth:** cookie `access_token` (validateJWT)

**Params:** `paymentId` validado con `isMongoId()`.

**Response 200:** stream PDF (mismas headers que receipt de orden).

---

### GET `/subscription/health` (ADMIN)
**Health stats de suscripciones**

**Headers:** `Authorization: Bearer {token}` (requiere rol ADMIN)

---

### POST `/subscription/admin/:userId/:programId/cancel` (ADMIN)
**Cancelar suscripcion de un usuario**

**Headers:** `Authorization: Bearer {token}` (requiere rol ADMIN)

---

### GET `/subscription/admin/:userId/:programId/history` (ADMIN)
**Ver historial de pagos de un usuario**

**Headers:** `Authorization: Bearer {token}` (requiere rol ADMIN)

---

## Webhooks

### POST `/webhooks/mercadopago`
**Webhook de notificaciones de Mercado Pago**

**Auth:** Verificacion de firma de Mercado Pago (header `x-signature`)

**Body:** Enviado automaticamente por Mercado Pago

Maneja notificaciones de:
- **payment**: Pago aprobado/rechazado → actualiza orden, activa programa
- **subscription_preapproval**: Cambio de estado de suscripcion → actualiza acceso

---

## Programas (Admin / Trenno Dashboard)

> Todos los endpoints admin de `/api/programs` requieren `x-api-key`. Las dos rutas públicas (`/public` y `/public/:programId`) son JWT-only y las consume el game frontend.

### GET `/programs/public`
**Listar programas visibles para el game frontend**

**Auth:** cookie `access_token` (validateJWT)

### GET `/programs/public/:programId`
**Detalle público de un programa**

**Auth:** cookie `access_token` (validateJWT)

---

### Endpoints administrados (todos `x-api-key`)

| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/programs` | Listar todos los programas |
| GET | `/programs/full` | Listar programas con todo el contenido |
| GET | `/programs/:programId` | Detalle completo de un programa |
| PUT | `/programs/:programId` | Actualizar programa |
| PUT | `/programs/:programId/sections/:sectionId` | Actualizar sección |
| PUT | `/programs/:programId/sections/:sectionId/modules/:moduleId` | Actualizar módulo |
| PUT | `/programs/:programId/sections/:sectionId/modules/:moduleId/lessons/:lessonId` | Actualizar lección |
| PUT | `/programs/:programId/sections/:sectionId/modules/:moduleId/instructions/:instructionId` | Actualizar instrucción |
| POST | `/programs/:programId/sections/:sectionId/resources` | Crear recurso de sección |
| PUT | `/programs/:programId/sections/:sectionId/resources/:resourceId` | Actualizar recurso |
| DELETE | `/programs/:programId/sections/:sectionId/resources/:resourceId` | Eliminar recurso |
| POST | `/programs/:programId/sections/:sectionId/modules/:moduleId/instructions/:instructionId/resources` | Crear recurso de instrucción |
| PUT | `…/instructions/:instructionId/resources/:resourceId` | Actualizar recurso de instrucción |
| DELETE | `…/instructions/:instructionId/resources/:resourceId` | Eliminar recurso de instrucción |

> Tipos de recurso válidos: `document | video | presentation | folder | activity | submission`.

---

## Admin

> Todos los endpoints requieren `x-api-key` + rate limit propio (`adminLimiter`: 60 req / 15 min).

### GET `/admin/user`
**Buscar un user puntual**

**Query:** `email` (opcional, validado isEmail) o `username` (opcional, 1-50 chars).

### GET `/admin/users`
**Listar users con filtros y paginación**

**Query:** `enterprise` (max 100), `search` (max 100), `page` (≥1), `limit` (1-100).

### GET `/admin/stats`
**Stats agregadas de la plataforma**

### GET `/admin/enterprises`
**Listar enterprises distintas presentes en la base**

---

## Feedback

> Endpoints para captar feedback del game frontend (NPS, lecciones, instrucciones, onboarding) y errores client-side.

### POST `/feedback/error`
**Ingestar errores client-side** (auth: `x-api-key`, rate limit: `errorIngestLimiter`)

Recibe payload arbitrario para reportar errores capturados en el frontend (ej. `ErrorFeedbackReporter`). No requiere JWT — sirve para errores que ocurren antes/después de la sesión válida.

### POST `/feedback`
**Crear feedback del usuario** (auth: cookie `access_token` + rate limit dinámico según tipo)

**Body:**
```json
{
  "type": "lesson" | "instruction" | "nps" | "onboarding",
  "rating": 8.5,            // opcional, 0-10 (NPS)
  "reaction": "up" | "down", // opcional (lesson/instruction)
  "message": "...",          // opcional, max 2000
  "requestId": "uuid",       // opcional, max 80
  "context": { ... }         // opcional, objeto libre
}
```

> Rate limiter aplicado según `type`: `feedbackNpsLimiter`, `feedbackOnboardingLimiter`, `feedbackInteractionLimiter`. El usuario actualiza `feedbackState.lastNpsAt` / `lastOnboardingFeedbackAt` para evitar prompts repetidos.

### GET `/feedback`
**Listar feedback (admin)** — auth: cookie `access_token` + `isAdmin`.

### PATCH `/feedback/:id/resolve`
**Marcar feedback como resuelto (admin)** — auth: cookie `access_token` + `isAdmin`.

---

## Notas Generales

### Rate Limiting

Configurado en `src/middlewares/rateLimiter.js`. Limiters principales:

| Limiter | Aplica a |
|---------|----------|
| `globalLimiter` | Todos los requests (montado en `app.use`) |
| `authLimiter` | Login, register, Google, magic link |
| `validationLimiter` | check-email, validate-username, validate-recaptcha |
| `otpLimiter` | password-recovery, verify-recovery-otp, password-reset |
| `passwordLimiter` | password-recovery + password-reset |
| `refreshLimiter` | refresh-token |
| `searchLimiter` | búsquedas (users, prompts, assistants) |
| `submissionLimiter` | presign + submit de instrucciones |
| `gradingRetryLimiter` | retry de instrucción |
| `paymentLimiter` | create-preference, verify, subscription/create |
| `sensitiveOperationLimiter` | edit user, store purchases, receipts, resend-email, cancel suscripción |
| `contentCreationLimiter` | crear prompts/assistants |
| `feedbackNpsLimiter` / `feedbackOnboardingLimiter` / `feedbackInteractionLimiter` | feedback según tipo |
| `errorIngestLimiter` | feedback/error |
| `adminLimiter` | endpoints `/admin/*` (60 req / 15 min) |
| `webhookLimiter` | webhooks MP (60 req / min) |

### Paginación
Todos los endpoints paginados retornan:
```json
{
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalItems": 200,
    "limit": 20
  }
}
```

### Códigos de Error Comunes
- `400` - Bad Request (validación fallida)
- `401` - Unauthorized (token inválido o faltante)
- `403` - Forbidden (sin permisos)
- `404` - Not Found (recurso no encontrado)
- `409` - Conflict (conflicto de estado, ej: recurso duplicado)
- `429` - Too Many Requests (rate limit excedido)
- `500` - Internal Server Error

### Estructura de Error
```json
{
  "success": false,
  "msg": "Mensaje de error descriptivo",
  "code": "ERROR_CODE"
}
```

---

**© STANNUM 2026**
