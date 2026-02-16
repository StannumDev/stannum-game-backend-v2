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
- **Expiración:** 15 minutos (configurable via `ACCESS_TOKEN_EXPIRY`)
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
4. Si no hay refresh token o el refresh falla → `forceLogout()` (limpia cookies, redirect a `/`)

### Logout
1. Frontend llama `POST /auth/logout` con access token
2. Backend limpia `user.refreshToken` (token = null, expiresAt = null)
3. Frontend limpia cookies y redirige a `/`

## Rotación de Tokens

Cada vez que se usa un refresh token para obtener nuevos tokens, el anterior se invalida y se genera uno nuevo. Esto minimiza la ventana de vulnerabilidad si un refresh token se compromete.

```
Refresh #1 → usado → genera Access #2 + Refresh #2 → Refresh #1 ya no es válido
Refresh #2 → usado → genera Access #3 + Refresh #3 → Refresh #2 ya no es válido
```

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
| `SECRET` | Secret para firmar access tokens JWT | `MiSecretJWT_2025` |
| `REFRESH_SECRET` | Secret para hashear refresh tokens (HMAC-SHA256) | `MiRefreshSecret_2025` |
| `ACCESS_TOKEN_EXPIRY` | Duración del access token | `15m` (default) |

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

Índice sparse para búsqueda eficiente:
```javascript
userSchema.index({ 'refreshToken.token': 1 }, { sparse: true });
```

## Invalidación de Sesiones

Para invalidar todas las sesiones activas (ej: deploy con cambio de seguridad):

1. **Cambiar `SECRET`** en `.env` → Todos los access tokens existentes fallan en `jwt.verify()`
2. Los interceptores del frontend intentan renovar → no hay refresh token válido (o el refresh también falla si se cambia `REFRESH_SECRET`)
3. Se ejecuta `forceLogout()` → usuarios deben re-loguearse

## Archivos Relevantes

### Backend
- `src/helpers/newJWT.js` — Generación de access tokens
- `src/helpers/newRefreshToken.js` — Generación y hash de refresh tokens
- `src/controllers/authController.js` — Login, register, Google, refreshTokenHandler, logoutHandler
- `src/routes/authRoutes.js` — Rutas de autenticación
- `src/middlewares/validateJWT.js` — Middleware de validación de access token
- `src/models/userModel.js` — Schema con campo refreshToken

### Frontend
- `src/lib/api.ts` — Cliente Axios centralizado con interceptores
- `src/lib/tokenStorage.ts` — Gestión de cookies (setTokens, getAccessToken, getRefreshToken, clearTokens)
- `src/services/auth.ts` — Funciones de login, registro, logout
- `src/stores/userStore.ts` — Estado global del usuario
- `src/proxy.ts` — Middleware de Next.js para routing basado en estado de sesión
