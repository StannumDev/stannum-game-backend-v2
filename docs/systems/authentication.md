# Sistema de Autenticación

Documentación del sistema de autenticación de STANNUM Game, basado en access tokens JWT de corta duración y refresh tokens opacos con rotación. Ambos tokens viajan en **cookies httpOnly** seteadas por el backend.

---

## Arquitectura

```
┌─────────────┐     login/register/google     ┌─────────────┐
│   Frontend   │ ──────────────────────────→  │   Backend    │
│   (Next.js)  │ ←──────────────────────────  │  (Express)   │
│              │   Set-Cookie: access_token    │              │
│              │   Set-Cookie: refresh_token   │              │
│  Cookies     │   Set-Cookie: logged_in       │  MongoDB:    │
│  (httpOnly): │                               │  - user.     │
│  - access_   │     API requests              │    refresh   │
│    token     │ ──────────────────────────→  │    Token     │
│  - refresh_  │   Cookie: access_token        │    .token    │
│    token     │                               │    (hashed)  │
│  + logged_in │     401 Unauthorized           │              │
│  (no httpOnly│ ←──────────────────────────   │              │
│   flag UI)   │                               │              │
│              │   POST /refresh-token          │              │
│  Interceptor │ ──────────────────────────→  │  Genera      │
│  (auto)      │ ←──────────────────────────  │  nuevo par   │
│              │   Set-Cookie (nuevo par)      │  (rotación)  │
└─────────────┘                               └─────────────┘
```

El backend nunca devuelve los tokens en el body: los setea como cookies vía `setAuthCookies`. El front lee solo la cookie no-httpOnly `logged_in` para saber si "parece" haber sesión; los tokens en sí son inaccesibles para JS.

## Tokens

### Access Token (JWT)
- **Tipo:** JSON Web Token firmado con HMAC-SHA256
- **Secret:** `SECRET` (variable de entorno; también usado para hashear el OTP de recuperación)
- **Expiración:** `ACCESS_TOKEN_EXPIRY` (fallback `15m`). En `newJWT` el fallback es `15m`.
- **Payload:** `{ id, role }` (más `scope` en el caso del activation token — ver más abajo)
- **Transporte:** Cookie httpOnly `access_token`. Como fallback, `validateJWT` también acepta header `Authorization: Bearer {token}` (la cookie tiene prioridad).
- **maxAge de la cookie:** alineado al TTL del JWT vía `ms(ACCESS_TOKEN_EXPIRY || "15m")` — única fuente de verdad para que cookie y JWT no se desincronicen (antes la cookie era de 5m vs JWT de 15m).

### Refresh Token
- **Tipo:** Token opaco (no JWT)
- **Generación:** `crypto.randomBytes(40).toString("hex")` → 80 caracteres hexadecimales (320 bits de entropía)
- **Almacenamiento en DB:** Hash HMAC-SHA256 del token usando `REFRESH_SECRET`
- **Expiración:** 7 días (`REFRESH_TOKEN_DAYS = 7`)
- **Transporte:** Cookie httpOnly `refresh_token`
- **maxAge de la cookie:** 7 días

### Cookie `logged_in`
- No httpOnly (legible por JS), valor `"1"`, maxAge 7 días. Es solo un *hint* de UI para que el front sepa que probablemente hay sesión. No tiene valor de seguridad: la autorización real la dan `access_token` / `refresh_token`.

### Flags de cookies (`src/helpers/authCookies.js`)
- `httpOnly: true` (salvo `logged_in`)
- `secure`: true si `NODE_ENV=production`, o `FORCE_SECURE_COOKIES === "true"`, o `COOKIE_SAMESITE === "none"` (SameSite=None exige Secure por spec)
- `sameSite`: `COOKIE_SAMESITE` (default `"lax"`)
- `path: "/"`, `domain: COOKIE_DOMAIN` si está seteado

## Flujos

### Login (password)
`POST /api/auth/` (rate limit `authLimiter`)
1. Busca user por `username` o `email` (lowercase)
2. Valida password con `bcryptjs.compare`. Credenciales inválidas → 401 `AUTH_INVALID_CREDENTIALS`
3. `!user.status` → 401 `AUTH_INVALID_CREDENTIALS` (cuenta deshabilitada se trata como credencial inválida en este endpoint)
4. `!preferences.allowPasswordLogin` → 403 `AUTH_PASSWORD_LOGIN_DISABLED` (ej. cuentas Google)
5. **Bloqueo de cuentas no activadas:** si `getProfileStatus(user) === "needs_activation"` (cuenta stub creada por enrollment, username `pending_*`) → 403 `AUTH_ACCOUNT_NOT_ACTIVATED`, aunque tenga password seteada (p. ej. vía recuperación)
6. Genera access JWT + refresh token (rotación), guarda hash del refresh en `user.refreshToken`, setea `user.lastLogin = now`
7. Corre `unlockAchievements` (login streak, etc.); errores no abortan el login
8. `setAuthCookies` y responde `{ success, achievementsUnlocked }`

### Login (Google OAuth)
`POST /api/auth/google` (rate limit `googleAuthLimiter`)
1. Valida el access token de Google contra `GOOGLE_USERINFO_API` (timeout 5s)
2. Exige `verified_email === true`
3. **Usuario nuevo:** crea cuenta con username `google_*`, password random (no usable: `allowPasswordLogin: false`, `isGoogleAccount: true`), sube foto de Google si hay, setea `lastLogin`, emite tokens y responde `{ success, username }`
4. **Usuario existente:** `!status` → 403 `AUTH_ACCOUNT_DISABLED`; `needs_activation` → 403 `AUTH_ACCOUNT_NOT_ACTIVATED`; si todo OK rota tokens, setea `lastLogin`, corre achievements y responde `{ success, username, achievementsUnlocked }`

> El user creado por Google queda en estado `needs_username` (`getProfileStatus` por prefijo `google_`) hasta que elija username vía `PUT /api/auth/update-username`.

### Signup / Registro
`POST /api/auth/register` (rate limit `authLimiter`)
1. Valida email/username únicos, edad ≥ 18, password con regex `(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,50}`
2. Hashea password con bcrypt (cost 10), genera refresh token y setea `lastLogin = now` en la creación
3. Emite access JWT + cookies. Responde 201

### Recuperación de contraseña (OTP)
Tres pasos. El OTP es un código de 6 dígitos, **hasheado** en DB con HMAC-SHA256(`SECRET`), comparado timing-safe, con expiración de 30 min y máximo 5 intentos.

1. **`POST /api/auth/password-recovery`** (`otpLimiter` + `passwordLimiter`)
   - Respuesta **genérica** siempre (`"Si el usuario existe, recibirá un correo."`) para no filtrar existencia de cuentas
   - Si el user es `needs_activation` (stub): **no** manda OTP; en su lugar reenvía el mail de **activación** (magic link) vía `regenerateAndSendActivation`, porque la recuperación lo dejaría con password pero igual rebotaría en login. Respuesta genérica idéntica.
   - Si es cuenta normal: genera OTP (`crypto.randomInt(100000, 1000000)`), guarda `otp.recoveryOtp` (hash) + `otp.otpExpiresAt = now + 30min` y manda el mail con el código
2. **`POST /api/auth/verify-recovery-otp`** (`otpLimiter`)
   - `needs_activation` → 403 `AUTH_ACCOUNT_NOT_ACTIVATED`
   - Sin OTP en DB → 400 `AUTH_OTP_MISSING`; expirado → 400 `AUTH_OTP_EXPIRED`
   - Comparación con `crypto.timingSafeEqual` sobre buffers hex. Si falla: incrementa `otp.attempts`; al llegar a 5 borra todos los campos OTP y responde `AUTH_OTP_MAX_ATTEMPTS`, si no `AUTH_INVALID_OTP`
   - Si matchea: borra `recoveryOtp`, setea `recoveryVerified = true`, resetea `attempts`
3. **`POST /api/auth/password-reset`** (`otpLimiter` + `passwordLimiter`)
   - Valida formato de password
   - **Pre-check** (no consume el OTP): exige `recoveryVerified === true` y OTP no expirado; si es stub aborta con 403 `AUTH_ACCOUNT_NOT_ACTIVATED` **antes** de tocar el claim
   - **Claim atómico** (`findOneAndUpdate` con guard `recoveryVerified: true` + `otpExpiresAt > now`) que limpia los campos OTP en el mismo update; si no matchea → 400 `AUTH_OTP_MISSING`
   - Setea nueva password (bcrypt), `passwordChangedAt = now`, **invalida el refresh token** (`{ token: null }`), fuerza `allowPasswordLogin = true`, limpia cookies con `clearAuthCookies`

> `passwordChangedAt` invalida los access JWTs viejos: `validateJWT` rechaza cualquier token cuyo `iat` sea anterior a `passwordChangedAt`.

### Requests Autenticados (`validateJWT`)
1. Lee el token de `req.cookies.access_token` (fallback: `Authorization: Bearer`)
2. `jwt.verify` con `SECRET`; mapea errores: `TokenExpiredError` → `JWT_EXPIRED_TOKEN`, `JsonWebTokenError` → `JWT_INVALID_TOKEN`, otro → `JWT_CORRUPTED_TOKEN` (todos 401)
3. **Rechaza tokens con `scope`** (los activation tokens no sirven para endpoints normales) → 401 `JWT_INVALID_TOKEN`
4. Carga el user por `id`. `!user` → 401; `!user.status` → 401 `AUTH_ACCOUNT_DISABLED`
5. Si hay `passwordChangedAt` y el JWT se emitió antes → 401 `JWT_EXPIRED_TOKEN`
6. Setea `req.userAuth = user` y continúa

### Renovación (refresh)
`POST /api/auth/refresh-token` (rate limit `refreshLimiter`)
1. Lee `req.cookies.refresh_token`. Ausente → 400 `REFRESH_TOKEN_MISSING`
2. **Valida formato**: string de exactamente 80 chars hex (`/^[a-f0-9]+$/`). Si no → 400 `REFRESH_TOKEN_INVALID`
3. Hashea el token recibido (HMAC `REFRESH_SECRET`) y busca user con ese hash y `status: true`. No existe → 401 `REFRESH_TOKEN_INVALID`; expirado → 401 `REFRESH_TOKEN_EXPIRED`
4. **Rotación atómica:** `findOneAndUpdate` con guard `expiresAt > now` que escribe el nuevo hash + expiración. Si no matchea (race) → 401 `REFRESH_TOKEN_INVALID`
5. Emite nuevo access JWT y setea el par de cookies. Responde `{ success: true }`

### Logout
`POST /api/auth/logout` (middleware `resolveUserByRefreshToken`)
1. `resolveUserByRefreshToken` resuelve el user a partir de la cookie `refresh_token` (sin fallar si no hay)
2. Si hay user: limpia `user.refreshToken` (`{ token: null, expiresAt: null }`), invalida cache
3. Limpia las cookies con `clearAuthCookies` (access_token, refresh_token, logged_in) y responde 200

## Magic Link & Auto-Enroll

Permite que un lead capturado externamente (Make/CRM) reciba un link mágico que le activa un programa y le abre el flujo de onboarding sin necesidad de password ni código manual. La generación del link se hace desde [`POST /api/product-key/auto-enroll`](./teams-productkeys.md#método-4-auto-enroll-magic-link-activation); esta sección documenta el lado de auth (consumo del link y completar la activación).

### Flujo

```
Lead recibe email con link: ${FRONTEND_URL}/activate/<rawToken>
  ↓ usuario hace click
Frontend → GET /api/auth/magic-link/:token   (rate limit authLimiter)
  ↓
Backend valida token (regex /^[a-f0-9]{64}$/), busca user por hash SHA-256
  ├─ token no matchea → 404 MAGIC_LINK_INVALID
  ├─ user.status === false → 403 AUTH_ACCOUNT_DISABLED
  └─ magicLink.expiresAt ausente o < now → 410 MAGIC_LINK_EXPIRED (limpia el link en DB)
  ↓
profileStatus = getProfileStatus(user)
  ├─ "needs_activation" (stub user) → emitir activation JWT + cookie access_token
  │     scope: "activation", TTL: ONBOARDING_JWT_TTL_MINUTES (default 30 min)
  │     cookie: httpOnly, sameSite "lax", maxAge = TTL del JWT
  │     Response: { success: true, scope: "activation", profileStatus, email }
  │
  └─ user completo → login normal
        Genera access + refresh tokens, los setea en cookies httpOnly, setea lastLogin
        Response: { success: true, scope: "full", profileStatus }
  ↓
Frontend (stub) → muestra formulario de onboarding
  └─ POST /api/auth/complete-activation con activation JWT (cookie) + datos del perfil
       │
       Backend valida con validateActivationJWT (scope === "activation")
       ├─ Verifica profileStatus sigue siendo "needs_activation" (si no → 409 USER_ALREADY_ACTIVATED)
       ├─ Username no puede empezar con "pending_" ni "google_"; chequeo de ofensividad
       ├─ Edad ≥ 18; password con regex de complejidad
       ├─ Update atómico con guard username: /^pending_/ (anti doble-submit → 409 USER_ALREADY_ACTIVATED)
       │     setea username, password, profile, enterprise, allowPasswordLogin: true,
       │     refreshToken nuevo, limpia magicLink (token/expiresAt = null), lastLogin
       │     (NO setea passwordChangedAt: es el primer set de password, no un cambio)
       ├─ Setea cookies de sesión normal (access + refresh)
       └─ Corre unlockAchievements
       │
       Response: { success: true, achievementsUnlocked, profileStatus: "complete" }
```

> **El magic link es time-based, NO single-use.** `consumeMagicLink` no borra el token al consumirlo: el link queda válido hasta que expire (TTL) o hasta que el user complete la activación (`completeActivation` setea `magicLink: { token: null, expiresAt: null }`). Solo se borra en DB cuando se detecta expirado.

### Reenvío self-service de activación
`POST /api/auth/resend-activation` (`otpLimiter` + `passwordLimiter`)
- Respuesta **genérica** siempre (no filtra existencia/estado). Solo si la cuenta existe, está activa (`status`) y es `needs_activation`, regenera y reenvía el magic link vía `regenerateAndSendActivation`.

### Endpoints

| Endpoint | Método | Auth | Body | Descripción |
|----------|--------|------|------|-------------|
| `/api/auth/magic-link/:token` | GET | Pública (`authLimiter`) | — | Consume magic link. Devuelve scope `activation` o `full` según el estado del user. |
| `/api/auth/complete-activation` | POST | `validateActivationJWT` | `username, password, name, birthdate, country, region, enterprise, enterpriseRole, aboutme` | Completa el onboarding del stub user creado vía auto-enroll. |
| `/api/auth/resend-activation` | POST | Pública (`otpLimiter`+`passwordLimiter`) | `email` | Reenvía el mail de activación a una cuenta stub. Respuesta genérica. |

### Diferencias con el flujo de registro normal

- **No requiere** `POST /auth/check-email` ni `POST /auth/validate-recaptcha`: el email ya fue validado en el lead capture y el usuario stub ya existe en DB.
- **El programa ya está activado** antes de que el usuario complete su perfil (lo activa `auto-enroll` con product key auto-consumida).
- **Username temporal** (`pending_<8hex>`) hasta que el usuario elija el suyo en `complete-activation`.
- El JWT con `scope: "activation"` es **strictly limited**: solo sirve para `complete-activation`. `validateActivationJWT` lo exige (`scope === "activation"`) y `validateJWT` lo rechaza explícitamente.

### Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `MAGIC_LINK_TTL_HOURS` | TTL del magic link (horas) | 72 |
| `ONBOARDING_JWT_TTL_MINUTES` | TTL del activation JWT (minutos) | 30 |
| `FRONTEND_URL` | Base URL del frontend para construir el link | — |
| `FORCE_SECURE_COOKIES` | Si `"true"`, fuerza cookies seguras incluso fuera de production | — |
| `COOKIE_DOMAIN` | Domain de la cookie (opcional, ej. `.stannumgame.com`) | — |
| `COOKIE_SAMESITE` | SameSite de las cookies de auth | `lax` |

## Rate Limiters de Autenticación

Definidos en `src/middlewares/rateLimiter.js` (todos con `windowMs` y `max`, respondiendo 429 `AUTH_TOO_MANY_ATTEMPTS`). Los relevantes para auth:

| Limiter | Ventana | Max | Key | Aplicado en |
|---------|---------|-----|-----|-------------|
| `authLimiter` | 15 min | 15 | `username`/`email` del body, fallback IP | login (`/`), register, magic-link |
| `googleAuthLimiter` | 15 min | 60 | IP | `/google` (el email va dentro del token opaco de Google; solo se puede keyear por IP, y un límite alto evita que cohortes presenciales detrás de un mismo NAT se autobloqueen) |
| `otpLimiter` | 15 min | 5 | IP | password-recovery, verify-recovery-otp, password-reset, resend-activation |
| `passwordLimiter` | 60 min | 5 | `username`/`email`, fallback IP | password-recovery, password-reset, resend-activation |
| `validationLimiter` | 15 min | 30 | `email`/`username`, fallback IP | check-email, validate-recaptcha, validate-username |
| `refreshLimiter` | 15 min | 300 | IP | refresh-token |
| `globalLimiter` | 15 min | 3000 | IP | global (toda la app) |

> `password-recovery`, `password-reset` y `resend-activation` aplican **ambos** `otpLimiter` y `passwordLimiter`.

## Rotación de Tokens

Cada vez que se usa un refresh token para obtener nuevos tokens, el anterior se invalida y se genera uno nuevo. Esto minimiza la ventana de vulnerabilidad si un refresh token se compromete.

```
Refresh #1 → usado → genera Access #2 + Refresh #2 → Refresh #1 ya no es válido
Refresh #2 → usado → genera Access #3 + Refresh #3 → Refresh #2 ya no es válido
```

## Sanitización de Datos (toJSON)

El schema de usuario tiene un transform `toJSON` que automáticamente elimina los campos `password`, `otp`, `refreshToken` y `magicLink` de cualquier serialización a JSON. Esto previene la filtración accidental de campos sensibles en las respuestas de la API, incluso si se devuelve el documento completo del usuario sin selección explícita de campos.

## Almacenamiento Seguro

Los refresh tokens nunca se almacenan en texto plano en la base de datos:

```javascript
// Generación (src/helpers/newRefreshToken.js)
const token = crypto.randomBytes(40).toString("hex");
const hashedToken = crypto.createHmac("sha256", REFRESH_SECRET).update(token).digest("hex");

// Almacenamiento: solo el hash va a MongoDB
user.refreshToken = { token: hashedToken, expiresAt: ... };

// Verificación: se hashea el token recibido y se compara
const hashedInput = crypto.createHmac("sha256", REFRESH_SECRET).update(receivedToken).digest("hex");
const user = await User.findOne({ "refreshToken.token": hashedInput });
```

El OTP de recuperación se hashea igual (HMAC con `SECRET`) y el magic link con `SHA-256` (sin secret) del token raw.

## Variables de Entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `SECRET` | Secret para firmar access tokens JWT (también para hashear OTP) | `MiSecretJWT_2025` |
| `REFRESH_SECRET` | Secret para hashear refresh tokens (HMAC-SHA256) | `MiRefreshSecret_2025` |
| `ACCESS_TOKEN_EXPIRY` | Duración del access token (TTL del JWT y maxAge de la cookie) | `15m` (fallback: `15m`) |
| `MAGIC_LINK_TTL_HOURS` | TTL del magic link de auto-enroll | `72` |
| `ONBOARDING_JWT_TTL_MINUTES` | TTL del activation JWT | `30` |
| `GOOGLE_USERINFO_API` | Endpoint de Google para validar el token OAuth | — |
| `RECAPTCHA_SECRET_KEY` | Secret de reCAPTCHA (verifyReCAPTCHA) | — |
| `FRONTEND_URL` | Base URL del frontend (usado para construir el link de activación) | `https://stannumgame.com` |
| `FORCE_SECURE_COOKIES` | Forzar `Secure` flag en cookies aún sin `NODE_ENV=production` | `true` |
| `COOKIE_DOMAIN` | Domain explícito para cookies | `.stannumgame.com` |
| `COOKIE_SAMESITE` | SameSite de las cookies de auth | `lax` |

## Códigos de Error

IDs reales del catálogo (`src/config/errors.json`); la columna "Código" es el `code` interno que devuelve `getError`.

| Constante | Código | Descripción |
|-----------|--------|-------------|
| `JWT_MISSING_TOKEN` | `JWT_003` | Token no proporcionado |
| `JWT_INVALID_TOKEN` | `JWT_004` | Token inválido, malformado o con `scope` no permitido |
| `JWT_EXPIRED_TOKEN` | `JWT_005` | Token expirado (o invalidado por `passwordChangedAt`) |
| `JWT_CORRUPTED_TOKEN` | `JWT_006` | Token corrupto |
| `REFRESH_TOKEN_MISSING` | `JWT_007` | Refresh token no proporcionado |
| `REFRESH_TOKEN_INVALID` | `JWT_008` | Refresh token inválido o de formato incorrecto |
| `REFRESH_TOKEN_EXPIRED` | `JWT_009` | Refresh token expirado |
| `AUTH_INVALID_CREDENTIALS` | `AUTH_001` | Usuario/password inválidos (o cuenta deshabilitada en login password) |
| `AUTH_ACCOUNT_DISABLED` | `AUTH_003` | Cuenta deshabilitada (`status: false`) |
| `AUTH_INVALID_OTP` | `AUTH_009` | OTP de recuperación incorrecto |
| `AUTH_OTP_EXPIRED` | `AUTH_010` | OTP expirado |
| `AUTH_OTP_MISSING` / `AUTH_OTP_MAX_ATTEMPTS` | `AUTH_011` | OTP ausente / máximo de intentos alcanzado |
| `AUTH_PASSWORD_LOGIN_DISABLED` | `AUTH_015` | Login con password deshabilitado (ej. cuentas Google) |
| `AUTH_ACCOUNT_NOT_ACTIVATED` | `AUTH_022` | Cuenta stub sin activar (`needs_activation`) |
| `MAGIC_LINK_INVALID` | `MAGIC_LINK_001` | Token de magic link inválido o inexistente |
| `MAGIC_LINK_EXPIRED` | `MAGIC_LINK_002` | Magic link expirado |
| `ACTIVATION_TOKEN_REQUIRED` | `MAGIC_LINK_003` | Falta el activation JWT (scope `activation`) |
| `USER_ALREADY_ACTIVATED` | `MAGIC_LINK_004` | La cuenta ya fue activada |

## Modelo de Datos

Campos de auth en el schema de usuario (`src/models/userModel.js`):

```javascript
passwordChangedAt: { type: Date, default: null },  // invalida JWTs emitidos antes
lastLogin:         { type: Date, default: null },  // actualizado en cada login exitoso y en signup

refreshToken: {
  token:     { type: String, default: null },  // HMAC-SHA256 hash
  expiresAt: { type: Date,   default: null },  // 7 días
}

otp: {
  recoveryOtp:      { type: String,  default: null },   // OTP hasheado (HMAC-SHA256 con SECRET)
  otpExpiresAt:     { type: Date,    default: null },   // expiración (30 min)
  recoveryVerified: { type: Boolean, default: false },  // OTP verificado, listo para reset
  // NOTA: `attempts` NO está declarado en el schema. Se setea dinámicamente en el
  //       controller (user.otp.attempts) como contador de intentos fallidos (max 5).
}

magicLink: {
  token:     { type: String, default: null },  // SHA-256 hash del token raw
  expiresAt: { type: Date,   default: null },  // TTL: MAGIC_LINK_TTL_HOURS (default 72)
}

status: { type: Boolean, default: true },  // cuenta habilitada/deshabilitada
```

### Tracking de `lastLogin`
Se setea `lastLogin = new Date()` en: login con password, login con Google (cuenta nueva y existente), signup con password (`createUser`), `completeActivation`, y login automático vía magic link de un user ya completo.

### Flujo de `recoveryVerified`
- `verify-recovery-otp` con OTP correcto → `recoveryVerified: true`, borra `recoveryOtp`, resetea `attempts`.
- `password-reset` hace un `findOneAndUpdate` atómico que exige `recoveryVerified === true` y `otpExpiresAt > now`, y limpia todos los campos OTP en el mismo update.
- Tras resetear: nueva password, `passwordChangedAt = now`, `refreshToken` invalidado, `allowPasswordLogin = true`, cookies limpiadas.
- 5 fallos en `verify-recovery-otp` → se borran los campos OTP (el user debe pedir un OTP nuevo).

### Índices
```javascript
userSchema.index({ 'refreshToken.token': 1 }, { sparse: true });
userSchema.index(
  { 'magicLink.token': 1 },
  { partialFilterExpression: { 'magicLink.token': { $type: 'string' } } }
);
```

El `toJSON` transform borra `password`, `otp`, `refreshToken` y `magicLink` para que nunca se serialicen en responses de la API.

## Invalidación de Sesiones

Para invalidar todas las sesiones activas (ej: deploy con cambio de seguridad):

1. **Cambiar `SECRET`** en `.env` → Todos los access tokens existentes fallan en `jwt.verify()`
2. Los interceptores del frontend intentan renovar → si también se cambia `REFRESH_SECRET`, el refresh falla y se fuerza logout
3. Alternativa por usuario: setear `passwordChangedAt` (o cambiar password) invalida los JWTs viejos de ese user vía `validateJWT`

## Archivos Relevantes

### Backend
- `src/helpers/newJWT.js` — Generación de access tokens (payload `{ id, role }`; acepta `extraPayload` y `expiresIn` para activation tokens)
- `src/helpers/newRefreshToken.js` — Generación y hash (HMAC) de refresh tokens; `hashRefreshToken` para verificación
- `src/helpers/authCookies.js` — `setAuthCookies` / `clearAuthCookies` (cookies httpOnly + `logged_in`)
- `src/helpers/magicLink.js` — `generateMagicLinkRawToken`, `hashMagicLinkToken`, `regenerateAndSendActivation`, `MAGIC_LINK_TTL_HOURS`
- `src/helpers/getProfileStatus.js` — Calcula `needs_activation` / `needs_username` / `needs_profile` / `complete`
- `src/controllers/authController.js` — login, register, Google, recovery/reset, refresh, logout, consumeMagicLink, completeActivation, resendActivation
- `src/controllers/productKeyController.js` — `autoEnroll` (genera magic link)
- `src/routes/authRoutes.js` — Rutas de autenticación (montadas en `/api/auth`)
- `src/middlewares/validateJWT.js` — Validación de access token normal (cookie o Bearer; rechaza tokens con scope)
- `src/middlewares/validateActivationJWT.js` — Validación de activation tokens (`scope === "activation"`)
- `src/middlewares/resolveUserByRefreshToken.js` — Resuelve user a partir del refresh token (para logout)
- `src/middlewares/rateLimiter.js` — Definición de todos los rate limiters
- `src/models/userModel.js` — Schema con campos refreshToken, otp, magicLink, passwordChangedAt, lastLogin, status

### Frontend
- `src/lib/api.ts` — Cliente Axios centralizado con interceptores
- `src/services/auth.ts` — Funciones de login, registro, logout
- `src/stores/userStore.ts` — Estado global del usuario
- `src/proxy.ts` — Middleware de Next.js para routing basado en estado de sesión
