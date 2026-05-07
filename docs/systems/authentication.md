# Sistema de Autenticación

Documentación del sistema de autenticación de STANNUM Game, basado en access tokens JWT de corta duración y refresh tokens opacos con rotación.

---

## Arquitectura

```
┌─────────────┐     login/register/google     ┌─────────────┐
│   Frontend   │ ──────────────────────────→  │   Backend    │
│   (Next.js)  │ ←──────────────────────────  │  (Express)   │
│              │   { token, refreshToken }     │              │
│              │                               │              │
│  Cookies:    │     API requests              │  MongoDB:    │
│  - token     │ ──────────────────────────→  │  - user.     │
│  - refresh   │   Authorization: Bearer       │    refresh   │
│    Token     │                               │    Token     │
│              │     401 Unauthorized           │    .token    │
│              │ ←──────────────────────────   │    (hashed)  │
│              │                               │              │
│  Interceptor │   POST /refresh-token          │              │
│  (auto)      │ ──────────────────────────→  │  Genera      │
│              │ ←──────────────────────────  │  nuevo par   │
│              │   { token, refreshToken }     │  (rotación)  │
└─────────────┘                               └─────────────┘
```

## Tokens

### Access Token (JWT)
- **Tipo:** JSON Web Token firmado con HMAC-SHA256
- **Secret:** `SECRET` (variable de entorno)
- **Expiración:** Configurable via `ACCESS_TOKEN_EXPIRY` (fallback: `20s`). En produccion se configura a `15m`.
- **Payload:** `{ id: userId }`
- **Transporte:** Header `Authorization: Bearer {token}`
- **Almacenamiento (frontend):** Cookie `token` (expires: 1 día, secure en prod, sameSite: Strict)

### Refresh Token
- **Tipo:** Token opaco (no JWT)
- **Generación:** `crypto.randomBytes(40).toString("hex")` → 80 caracteres hexadecimales (320 bits de entropía)
- **Almacenamiento en DB:** Hash HMAC-SHA256 del token usando `REFRESH_SECRET`
- **Expiración:** 7 días
- **Transporte:** Body de request POST
- **Almacenamiento (frontend):** Cookie `refreshToken` (expires: 7 días, secure en prod, sameSite: Strict)

## Flujos

### Login / Registro / Google OAuth
1. Usuario envía credenciales
2. Backend valida credenciales
3. Backend genera access token (JWT 15 min) y refresh token (opaco 7 días)
4. Backend guarda el hash HMAC-SHA256 del refresh token en `user.refreshToken.token` + fecha de expiración
5. Backend retorna ambos tokens al frontend
6. Frontend guarda ambos en cookies via `setTokens()`

### Requests Autenticados
1. El interceptor de Axios lee la cookie `token` y lo inyecta como `Authorization: Bearer`
2. Backend middleware `validateJWT` decodifica y valida el access token
3. Si el token es válido → procesa el request normalmente

### Renovación Automática (401)
1. Access token expira → backend retorna 401
2. El interceptor de Axios detecta el 401
3. Si hay refresh token en cookie:
   - Pausa requests concurrentes en una cola (`failedQueue`)
   - Envía `POST /auth/refresh-token` con el refresh token (usa axios raw, no el cliente `api`, para evitar loop)
   - Backend busca usuario por hash del refresh token, valida expiración
   - Backend genera NUEVO par de tokens (rotación) y retorna ambos
   - Frontend actualiza cookies y reintenta todos los requests encolados
4. Si no hay refresh token o el refresh falla → `forceLogout()` (limpia cookies, muestra toast "Sesión expirada - Tu sesión expiró. Volvé a iniciar sesión.", espera 1.5 segundos y redirige a `/`)

### Logout
1. Frontend llama `POST /auth/logout` con access token
2. Backend limpia `user.refreshToken` (token = null, expiresAt = null)
3. Frontend limpia cookies y redirige a `/`

## Magic Link & Auto-Enroll

Permite que un lead capturado externamente (Make/CRM) reciba un link mágico que le activa un programa y le abre el flujo de onboarding sin necesidad de password ni código manual. La generación del link se hace desde [`POST /api/product-key/auto-enroll`](./teams-productkeys.md#método-4-auto-enroll-magic-link-activation); esta sección documenta el lado de auth (consumo del link y completar la activación).

### Flujo

```
Lead recibe email con link: ${FRONTEND_URL}/activate/<rawToken>
  ↓ usuario hace click
Frontend → GET /api/auth/magic-link/:token
  ↓
Backend valida token (regex 64 hex), busca user por hash SHA-256
  ├─ user.status === false → 403 AUTH_ACCOUNT_DISABLED
  ├─ magicLink.expiresAt < now → 410 MAGIC_LINK_EXPIRED (limpia link)
  └─ token no matchea → 404 MAGIC_LINK_INVALID
  ↓
Single-use: invalida magicLink en DB (set null)
  ↓
profileStatus = getProfileStatus(user)
  ├─ "needs_activation" (stub user) → emitir activation JWT + cookie
  │     scope: "activation", TTL: ONBOARDING_JWT_TTL_MINUTES (default 30 min)
  │     Response: { success: true, scope: "activation", profileStatus, email }
  │
  └─ user completo → login normal
        Genera access + refresh tokens, los setea en cookies httpOnly
        Response: { success: true, scope: "full", profileStatus }
  ↓
Frontend (stub) → muestra formulario de onboarding
  └─ POST /api/auth/complete-activation con activation JWT + datos del perfil
       │
       Backend valida con validateActivationJWT middleware (scope === "activation")
       ├─ Verifica profileStatus sigue siendo "needs_activation"
       ├─ Username no puede empezar con "pending_" ni "google_"
       ├─ Setea username, password, profile, enterprise, allowPasswordLogin: true
       ├─ Limpia magicLink residual
       ├─ Genera refresh token + nuevo access token (login real)
       └─ Setea cookies de sesión normal
       │
       Response: { success: true, achievementsUnlocked, profileStatus: "complete" }
```

### Endpoints

| Endpoint | Método | Auth | Body | Descripción |
|----------|--------|------|------|-------------|
| `/api/auth/magic-link/:token` | GET | Pública (`authLimiter`) | — | Consume magic link. Devuelve scope `activation` o `full` según el estado del user. |
| `/api/auth/complete-activation` | POST | `validateActivationJWT` | `username, password, name, birthdate, country, region, enterprise, enterpriseRole, aboutme` | Completa el onboarding del stub user creado vía auto-enroll. |

### Diferencias con el flujo de registro normal

- **No requiere** `POST /auth/check-email` ni `POST /auth/validate-recaptcha`: el email ya fue validado en el lead capture y el usuario stub ya existe en DB.
- **El programa ya está activado** antes de que el usuario complete su perfil (lo activa `auto-enroll` con product key auto-consumida).
- **Username temporal** (`pending_<8hex>`) hasta que el usuario elija el suyo en `complete-activation`.
- El JWT con `scope: "activation"` es **strictly limited**: solo sirve para `complete-activation`. `validateActivationJWT` rechaza cualquier otro endpoint.

### Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `MAGIC_LINK_TTL_DAYS` | TTL del magic link (días) | 7 |
| `ONBOARDING_JWT_TTL_MINUTES` | TTL del activation JWT (minutos) | 30 |
| `FRONTEND_URL` | Base URL del frontend para construir el link | — |
| `FORCE_SECURE_COOKIES` | Si `"true"`, fuerza cookies seguras incluso fuera de production | — |
| `COOKIE_DOMAIN` | Domain de la cookie (opcional, ej. `.stannumgame.com`) | — |

## Rotación de Tokens

Cada vez que se usa un refresh token para obtener nuevos tokens, el anterior se invalida y se genera uno nuevo. Esto minimiza la ventana de vulnerabilidad si un refresh token se compromete.

```
Refresh #1 → usado → genera Access #2 + Refresh #2 → Refresh #1 ya no es válido
Refresh #2 → usado → genera Access #3 + Refresh #3 → Refresh #2 ya no es válido
```

## Sanitización de Datos (toJSON)

El schema de usuario tiene un transform `toJSON` que automáticamente elimina los campos `password`, `otp` y `refreshToken` de cualquier serialización a JSON. Esto previene la filtración accidental de campos sensibles en las respuestas de la API, incluso si se devuelve el documento completo del usuario sin selección explícita de campos.

## Almacenamiento Seguro

Los refresh tokens nunca se almacenan en texto plano en la base de datos:

```javascript
// Generación
const token = crypto.randomBytes(40).toString("hex");
const hashedToken = crypto.createHmac("sha256", REFRESH_SECRET).update(token).digest("hex");

// Almacenamiento: solo el hash va a MongoDB
user.refreshToken = { token: hashedToken, expiresAt: ... };

// Verificación: se hashea el token recibido y se compara
const hashedInput = crypto.createHmac("sha256", REFRESH_SECRET).update(receivedToken).digest("hex");
const user = await User.findOne({ "refreshToken.token": hashedInput });
```

## Interceptor del Frontend

El archivo `src/lib/api.ts` implementa un cliente Axios centralizado con:

- **Request interceptor:** Inyecta `Authorization: Bearer` automáticamente
- **Response interceptor:** Maneja 401 con renovación automática
- **Cola de requests:** Múltiples requests concurrentes esperan al refresh sin duplicarlo
- **Flag `_retry`:** Previene loops infinitos de renovación
- **`forceLogout()`:** Limpia estado y redirige si la renovación falla

## Variables de Entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `SECRET` | Secret para firmar access tokens JWT (también usado para hashear OTP) | `MiSecretJWT_2025` |
| `REFRESH_SECRET` | Secret para hashear refresh tokens (HMAC-SHA256) | `MiRefreshSecret_2025` |
| `ACCESS_TOKEN_EXPIRY` | Duración del access token | `15m` (fallback: `20s`) |
| `MAGIC_LINK_TTL_DAYS` | TTL del magic link de auto-enroll | `7` |
| `ONBOARDING_JWT_TTL_MINUTES` | TTL del activation JWT | `30` |
| `FRONTEND_URL` | Base URL del frontend (usado para construir el link de activación) | `https://stannumgame.com` |
| `FORCE_SECURE_COOKIES` | Forzar `Secure` flag en cookies aún sin `NODE_ENV=production` | `true` |
| `COOKIE_DOMAIN` | Domain explícito para cookies | `.stannumgame.com` |

## Códigos de Error

| Código | ID | Descripción |
|--------|----|-------------|
| `JWT_001` | `JWT_MISSING` | Token no proporcionado |
| `JWT_002` | `JWT_INVALID` | Token inválido o malformado |
| `JWT_003` | `JWT_EXPIRED` | Token expirado |
| `JWT_007` | `REFRESH_TOKEN_MISSING` | Refresh token no proporcionado |
| `JWT_008` | `REFRESH_TOKEN_INVALID` | Refresh token inválido |
| `JWT_009` | `REFRESH_TOKEN_EXPIRED` | Refresh token expirado |

## Modelo de Datos

Campo `refreshToken` en el schema de usuario:

```javascript
refreshToken: {
  token: { type: String, default: null },    // HMAC-SHA256 hash
  expiresAt: { type: Date, default: null },  // Fecha de expiración (7 días)
}
```

Campo `otp` en el schema de usuario:

```javascript
otp: {
  recoveryOtp: { type: String, default: null },        // Código OTP hasheado (HMAC-SHA256)
  otpExpiresAt: { type: Date, default: null },         // Fecha de expiración del OTP (30 min)
  recoveryVerified: { type: Boolean, default: false }, // Verificación de recuperación completada
  // attempts es virtual / setteado dinámicamente: contador de intentos fallidos (max 5)
}
```

`recoveryVerified` se usa en el flujo de recuperación de contraseña:
- Cuando el usuario verifica su OTP via `POST /auth/verify-recovery-otp`, `recoveryVerified` se setea a `true` y `recoveryOtp` se borra.
- El endpoint `POST /auth/password-reset` hace un `findOneAndUpdate` atómico que requiere `recoveryVerified === true` antes de permitir el cambio de contraseña.
- Después de resetear la contraseña exitosamente, `recoveryVerified` se vuelve a setear a `false`, `attempts: 0` y se invalida el `refreshToken` actual.
- Si el OTP falla 5 veces se borran todos los campos y el usuario debe pedir un nuevo OTP.

Campo `magicLink` en el schema de usuario (para flujo de auto-enroll):

```javascript
magicLink: {
  token: { type: String, default: null },     // SHA-256 hash del token raw
  expiresAt: { type: Date, default: null },   // TTL: MAGIC_LINK_TTL_DAYS (default 7)
}
```

Índices:
```javascript
userSchema.index({ 'refreshToken.token': 1 }, { sparse: true });
userSchema.index(
  { 'magicLink.token': 1 },
  { partialFilterExpression: { 'magicLink.token': { $type: 'string' } } }
);
```

El `toJSON` transform también borra `magicLink` además de `password`, `otp` y `refreshToken`, para que nunca se serialice en responses de la API.

## Invalidación de Sesiones

Para invalidar todas las sesiones activas (ej: deploy con cambio de seguridad):

1. **Cambiar `SECRET`** en `.env` → Todos los access tokens existentes fallan en `jwt.verify()`
2. Los interceptores del frontend intentan renovar → no hay refresh token válido (o el refresh también falla si se cambia `REFRESH_SECRET`)
3. Se ejecuta `forceLogout()` → usuarios deben re-loguearse

## Archivos Relevantes

### Backend
- `src/helpers/newJWT.js` — Generación de access tokens (acepta `extraPayload` y `expiresIn` para activation tokens)
- `src/helpers/newRefreshToken.js` — Generación y hash de refresh tokens
- `src/helpers/authCookies.js` — `setAuthCookies` / `clearAuthCookies` para manejar cookies httpOnly
- `src/helpers/getProfileStatus.js` — Calcula si el user es `needs_activation` o `complete`
- `src/controllers/authController.js` — login, register, Google, refresh, logout, consumeMagicLink, completeActivation
- `src/controllers/productKeyController.js` — `autoEnroll` (genera magic link)
- `src/routes/authRoutes.js` — Rutas de autenticación
- `src/middlewares/validateJWT.js` — Middleware de validación de access token (scope normal)
- `src/middlewares/validateActivationJWT.js` — Middleware específico para activation tokens (scope === "activation")
- `src/middlewares/resolveUserByRefreshToken.js` — Resuelve user a partir del refresh token (para logout)
- `src/models/userModel.js` — Schema con campos refreshToken, otp, magicLink

### Frontend
- `src/lib/api.ts` — Cliente Axios centralizado con interceptores
- `src/lib/tokenStorage.ts` — Gestión de cookies (setTokens, getAccessToken, getRefreshToken, clearTokens)
- `src/services/auth.ts` — Funciones de login, registro, logout
- `src/stores/userStore.ts` — Estado global del usuario
- `src/proxy.ts` — Middleware de Next.js para routing basado en estado de sesión
