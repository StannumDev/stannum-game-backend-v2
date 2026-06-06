# Sistema de Teams & Product Keys - STANNUM Game

El sistema de Product Keys permite la activación de programas mediante códigos únicos, con soporte para asignación automática de equipos. Sistema completo para ventas B2B y B2C con generación, envío automático por email y tracking.

## 📊 Visión General

**Product Keys** son códigos alfanuméricos únicos (`XXXX-XXXX-XXXX-XXXX`) que permiten:

- ✅ Activar acceso a programas de compra única (TIA, TMD, TIA_SUMMER, TIA_POOL)
- ✅ Asignar usuarios a equipos automáticamente
- ✅ Tracking de uso (usado/no usado, quién activó, cuándo)
- ✅ Envío automático por email con templates HTML (individual y bulk)
- ✅ Prevención de uso duplicado (transacciones MongoDB con session)
- ✅ Integración con Make.com para automatización
- ✅ Auto-enroll con magic link para usuarios stub (lead → activación sin password), individual y bulk
- ✅ Endpoint admin para otorgar/revocar acceso a programas sin product key

> **Auto-enroll a programas de suscripción:** `auto-enroll` activa programas de **compra única** (los del enum del modelo). `trenno_ia` se gestiona por suscripción (Mercado Pago).

> **Importante:** `trenno_ia` se activa por suscripción (Mercado Pago), no por product key. El enum del modelo solo acepta `tmd | tia | tia_summer | tia_pool`.

---

## 🎟️ 1. PRODUCT KEYS

### Modelo de Datos

**Archivo:** `src/models/productKeyModel.js`

```javascript
{
  code: String,              // "ABCD-1234-EFGH-5678" (formato fijo, regex enforced)
  email: String,             // Email del comprador
  createdAt: Date,           // Fecha de generación (auto via timestamps)
  used: Boolean,             // ¿Fue activado?
  usedAt: Date,              // Cuándo se activó
  usedBy: ObjectId (User),   // Quién lo activó
  product: Enum ['tmd', 'tia', 'tia_summer', 'tia_pool'],  // required
  team: String               // required, trim, maxlength 50. "no_team" si no aplica
}
```

> `email`, `product` y `team` son **required**. `team` tiene `maxlength: 50` (ver gotcha en § 8). `code` lleva regex `^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$`. El schema declara `createdAt` explícito **y** `timestamps: true` (agrega también `updatedAt`).

**Índices:**
```javascript
productKeySchema.index({ product: 1, used: 1 });  // claves disponibles por producto
productKeySchema.index({ usedBy: 1 });             // claves usadas por user
// + index único auto en `code` por unique:true
```

### Formato de Código

```
XXXX-XXXX-XXXX-XXXX
```

- 4 segmentos de 4 caracteres
- Caracteres: `A-Z` y `0-9`
- Siempre uppercase
- Generación aleatoria con verificación de unicidad

### Generación de Código

**Función:** `generateProductCode()` (usa `crypto.randomInt` para entropía segura)

```javascript
const generateProductCode = () => {
  const segment = () =>
    Array.from({ length: 4 }, () =>
      crypto.randomInt(36).toString(36).toUpperCase()
    ).join("");
  return `${segment()}-${segment()}-${segment()}-${segment()}`;
};
```

**Ejemplo de códigos generados:**
- `K3L9-M2P4-Q7R8-S1T6`
- `A0B1-C2D3-E4F5-G6H7`
- `X9Y8-Z7A6-B5C4-D3E2`

### Validación de Unicidad

```javascript
const MAX_KEY_RETRIES = 5;

for (let attempt = 0; attempt < MAX_KEY_RETRIES; attempt++) {
  const code = generateProductCode();
  const existing = await ProductKey.findOne({ code });
  if (!existing) {
    // Código único encontrado
    await ProductKey.create({ code, ... });
    break;
  }
}
```

---

## 👥 2. SISTEMA DE TEAMS

### ¿Qué es un Team?

Un **team** (equipo) agrupa usuarios que compraron el mismo programa. Se usa para:

- Rankings por equipos
- Competencia entre equipos de una empresa
- Tracking de progreso grupal

### Asignación de Team

Los teams se asignan **automáticamente al activar una product key**:

```javascript
// En activateProductKey()
if (key.team && key.team !== 'no_team') {
  const alreadyInTeam = user.teams.some(
    t => t.programName === key.product
  );

  if (!alreadyInTeam) {
    user.teams.push({
      programName: key.product,
      teamName: key.team,
      role: 'member'
    });
  }
}
```

### Schema de Team en User

```javascript
const teamSchema = new Schema({
  // Los tres campos son required, trim, minlength 2, maxlength 50
  programName: String,  // "tia", "tia_summer", "tia_pool", "tmd"
  teamName: String,     // "equipo_alpha", "equipo_ventas", etc.
  role: String          // en la práctica siempre "member" (lo setea activateProgramForUser)
}, { _id: false });

// En userSchema:
teams: [teamSchema]
```

> El campo `role` está en el schema (required, 2..50 chars) pero el código solo escribe `"member"` al asignar team. No hay flujo que setee "leader".

### Ejemplo de Datos

**Product Key:**
```javascript
{
  code: "ABCD-1234-EFGH-5678",
  email: "comprador@empresa.com",
  product: "tia",
  team: "equipo_ventas"  // ← Team asignado
}
```

**Usuario después de activar:**
```javascript
{
  _id: "507f1f77bcf86cd799439011",
  username: "usuario123",
  programs: {
    tia: {
      isPurchased: true,
      acquiredAt: "2025-01-15T10:30:00.000Z"
    }
  },
  teams: [
    {
      programName: "tia",
      teamName: "equipo_ventas",  // ← Asignado automáticamente
      role: "member"
    }
  ]
}
```

---

## 🔄 3. FLUJO COMPLETO - ACTIVACIÓN

### Caso de Uso: Usuario Activa Código

```
Usuario ingresa código en frontend
  ↓
POST /api/product-key/activate
  Body: { code: "ABCD-1234-EFGH-5678" }
  ↓
validateJWT → extraer userId
  ↓
productKeyController.activateProductKey()
  ↓
session.withTransaction(async () => {
  1. Buscar y marcar key como usada (atómico, dentro de transacción)
     ProductKey.findOneAndUpdate(
       { code, used: false },
       { used: true, usedAt: now, usedBy: userId },
       { new: true, session }
     )
     ├─ Si null → throw VALIDATION_PRODUCT_KEY_NOT_FOUND / ALREADY_USED
     └─ Si OK → continuar

  2. Activar programa con activateProgramForUser(userId, product, team, session)
     ├─ Si user ya tiene acceso → throw VALIDATION_PRODUCT_ALREADY_OWNED
     ├─ Setea programs[product].isPurchased = true
     ├─ Setea programs[product].acquiredAt = now
     ├─ Actualiza programs[product].hasAccessFlag = true
     ├─ Asigna user.teams si team !== 'no_team'
     └─ Desbloquea achievements (newlyUnlocked)
})
  ↓
Si la transacción throwea → rollback automático (key vuelve a used: false)
  ↓
Response: {
  success: true,
  message: "Programa activado correctamente.",
  achievementsUnlocked: [...]
}
```

### Prevención de Race Conditions

**Solución:** transacción MongoDB con `session.withTransaction()`. Tanto el `findOneAndUpdate` de la key como la activación del programa corren en la misma sesión, así que cualquier error rollbackea ambos lados.

```javascript
const session = await mongoose.startSession();
await session.withTransaction(async () => {
  const key = await ProductKey.findOneAndUpdate(
    { code: code.toUpperCase(), used: false },
    { used: true, usedAt: new Date(), usedBy: userId },
    { new: true, session }
  );
  if (!key) throw { statusCode, errorKey };

  const { newlyUnlocked, alreadyOwned } = await activateProgramForUser(userId, key.product, key.team, session);
  if (alreadyOwned) throw { statusCode: 400, errorKey: "VALIDATION_PRODUCT_ALREADY_OWNED" };

  result = { newlyUnlocked };
});
```

Esto garantiza que **solo un usuario puede activar el código**, y que si la activación falla la key se libera automáticamente.

---

## 📧 4. GENERACIÓN Y ENVÍO DE CÓDIGOS

### Endpoints de Generación

Todos usan `validateAPIKey` (header `x-api-key` o `Authorization: Bearer`, comparado timing-safe contra `MAKE_API_KEY`). **No tienen rate limiting** (ver § 8). Las rutas se montan en `/api/product-key`.

| Endpoint | Auth | Uso | Email |
|----------|------|-----|-------|
| `POST /api/product-key/generate` | API Key | Crear sin enviar | ❌ |
| `POST /api/product-key/generate-and-send` | API Key | Crear y enviar email simple | ✅ |
| `POST /api/product-key/generate-and-send-make` | API Key | Crear y enviar con diagnóstico (Make) | ✅ |
| `POST /api/product-key/generate-and-send-bulk` | API Key | Crear y enviar a un array de emails (batch) | ✅ |
| `POST /api/product-key/auto-enroll` | API Key | Crear key + activar programa + magic link / login | ✅ |
| `POST /api/product-key/auto-enroll-bulk` | API Key | Auto-enroll a un array de emails (batch) | ✅ |

> **Manejo de `ValidationError`:** si Mongoose rechaza el documento al crear la key (ej. `team` > 50 chars, email o product inválidos), los endpoints devuelven **400** con el detalle concreto de los campos inválidos (`getError("VALIDATION_GENERIC_ERROR", ...)` con `techMessage`/`friendlyMessage` armados desde `error.errors`), en lugar del antiguo **500 opaco** que el caller (ej. el dashboard de Trenno) no podía interpretar. Ver helper `validationErrorResponse`.

### Método 1: Generar Sin Enviar

**POST** `/api/product-key/generate` (auth: `validateAPIKey`)

**Body:**
```json
{
  "email": "comprador@example.com",
  "product": "tia",
  "team": "equipo_alpha"
}
```

**Response:**
```json
{
  "success": true,
  "code": "ABCD-1234-EFGH-5678",
  "email": "comprador@example.com"
}
```

**Uso:** Para generar códigos manualmente y enviarlos por otro medio.

---

### Método 2: Generar y Enviar Email Simple

**POST** `/api/product-key/generate-and-send` (auth: `validateAPIKey`)

**Body:**
```json
{
  "email": "comprador@example.com",
  "product": "tia",
  "team": "no_team"
}
```

**Proceso:**
1. Generar código único
2. Guardar en DB
3. Enviar email con template HTML
4. Retornar código

**Template de Email:**
- Asunto: "¡Bienvenido a STANNUM Game! - Tu Clave de Acceso"
- HTML con diseño oscuro y branding STANNUM
- Código destacado con gradiente
- Botón CTA: "Activar Clave Ahora"

---

### Método 3: Generar con Diagnóstico (Make.com)

**POST** `/api/product-key/generate-and-send-make` (auth: `validateAPIKey`)

**Uso:** Integración con Make.com para automatización post-lead capture.

**Body:**
```json
{
  "email": "comprador@example.com",
  "fullName": "SnVhbiBQw6lyZXo=",         // Base64 encoded
  "message": "VHUgZGlhZ27Ds3N0aWNvLi4u",  // Base64 encoded (diagnóstico IA, opcional)
  "product": "tia",                        // tia | tia_summer | tia_pool (sin tmd en este endpoint)
  "team": "no_team",
  "guideLink": "https://...",              // Opcional, URL validada
  "whatsappLink": "https://wa.me/..."      // Opcional, URL validada
}
```

**Características:**
- ✅ Decodifica nombre y mensaje de Base64
- ✅ Escapa HTML para prevenir XSS
- ✅ Incluye diagnóstico personalizado en email
- ✅ Secciones opcionales (guía, WhatsApp)
- ✅ Template más completo (incluye instrucciones paso a paso de activación)

**Template de Email:**
- Asunto: `"Tu Diagnóstico IA + Acceso a STANNUM Game"` (con diagnóstico) o `"Tu Acceso a STANNUM Game"` (sin diagnóstico)
- Saludo personalizado con nombre
- Sección de diagnóstico (si `message` presente)
- Código de activación destacado
- Sección "Antes que nada..." explicando que la plataforma es gratuita
- Pasos numerados para activar el código
- Sección de guía (si `guideLink` presente)
- Sección de comunidad WhatsApp (si `whatsappLink` presente)

---

### Método 4: Auto-Enroll (Magic Link Activation)

**POST** `/api/product-key/auto-enroll` (auth: `validateAPIKey`)

Crea (o reutiliza) un usuario stub, genera un product key, lo consume internamente activando el programa, y manda un email con magic link para que el usuario complete el onboarding sin código manual. Ideal para flujos lead → onboarding-friction-zero.

**Body:**
```json
{
  "email": "lead@example.com",
  "fullName": "SnVhbiBQw6lyZXo=",         // Base64 encoded (requerido)
  "message": "VHUgZGlhZ27Ds3N0aWNvLi4u",  // Base64 encoded (opcional)
  "product": "tia",                        // tia | tmd | tia_summer | tia_pool
  "team": "no_team",
  "guideLink": "https://...",              // Opcional
  "whatsappLink": "https://wa.me/..."      // Opcional
}
```

**Flujo (transaccional con `session.withTransaction`):**

1. **Find-or-create stub user** por email (`User.findOneAndUpdate` con upsert):
   - Si crea: username `pending_<8hex>`, sin password, `allowPasswordLogin: false`
   - Si existe: reutiliza el usuario existente
2. **Detectar caso:**
   - User completo + ya tiene producto → `status: "already_owned"` (no-op idempotente)
   - User completo + sin producto → activar programa + email simple "producto activado" (sin magic link)
   - User stub → continuar al paso 3
3. **Generar y consumir product key** dentro de la transacción (key se crea con `used: true` directo)
4. **Activar programa** vía `activateProgramForUser(userId, product, team, session)`
5. **Generar magic link** (`crypto.randomBytes(32).hex` → 64 hex chars) con TTL `MAGIC_LINK_TTL_HOURS` (default 72), guarda hash SHA-256 en `user.magicLink.token`
6. **Enviar email** con `${FRONTEND_URL}/activate/<rawToken>`

> **Detección de race:** la transacción re-chequea `hasAccess(programs[product])` dentro de la sesión antes de crear la ProductKey, para no dejar keys huérfanas si otro request activó el producto en paralelo.
> **Caso stub que ya tenía el producto** (Make hizo enroll antes y el user nunca activó): no se crea una nueva ProductKey, solo se regenera el magic link y se reenvía el mail (`status: "existing_stub_resent"`).
> **Validación de producto:** `auto-enroll` solo acepta `tia | tmd | tia_summer | tia_pool` (`ACTIVATION_PRODUCTS`); otro valor → 400 `VALIDATION_GENERIC_ERROR`.

**Response (stub user, magic link enviado):**
```json
{
  "success": true,
  "status": "new_user" | "existing_stub_resent",
  "email": "lead@example.com"
}
```

**Response (user completo):**
```json
{
  "success": true,
  "status": "activated_for_existing_user" | "already_owned",
  "email": "lead@example.com"
}
```

**Variables de entorno relacionadas:** `MAGIC_LINK_TTL_HOURS` (default 72), `FRONTEND_URL`.

> El consumo del magic link y la activación de la cuenta del lado del usuario se documentan en [authentication.md § Magic Link](./authentication.md#magic-link--auto-enroll).

---

### Método 5: Generar y Enviar en Bulk

**POST** `/api/product-key/generate-and-send-bulk` (auth: `validateAPIKey`)

Genera y envía por email una product key (template simple, sin diagnóstico) a una **lista de emails**.

**Body:**
```json
{
  "emails": ["a@example.com", "b@example.com"],  // array 1..100, validado y deduplicado (lowercase+trim)
  "product": "tia",                               // tia | tmd | tia_summer | tia_pool
  "team": "no_team"
}
```

**Procesamiento:**
- Corre en lotes de `BULK_BATCH_SIZE = 10` con `Promise.allSettled` (un email que falla no aborta el resto).
- Si falla el envío del mail, hace **rollback** de la key creada (`deleteOne`) para no dejar huérfanas.

**Response (siempre 200):**
```json
{
  "success": true,
  "results": [
    { "email": "a@example.com", "status": "sent", "code": "ABCD-1234-EFGH-5678" },
    { "email": "b@example.com", "status": "error", "message": "..." }
  ],
  "summary": { "succeeded": 1, "failed": 1 }
}
```

---

### Método 6: Auto-Enroll en Bulk

**POST** `/api/product-key/auto-enroll-bulk` (auth: `validateAPIKey`)

Versión batch de `auto-enroll`: por cada email aplica la misma lógica find-or-create stub + activación + magic link / login. El `fullName` se deriva del local-part del email (no se pasa Base64 por item).

**Body:**
```json
{
  "emails": ["a@example.com", "b@example.com"],  // array 1..100, deduplicado
  "product": "tia",                               // tia | tmd | tia_summer | tia_pool (ACTIVATION_PRODUCTS)
  "team": "no_team"
}
```

**Procesamiento:**
- Lotes de 10 con `Promise.allSettled`. Cada item corre en su propia sesión/transacción.
- Mismos `status` por item que `auto-enroll`: `new_user`, `existing_stub_resent`, `activated_for_existing_user`, `already_owned`, o `error`.

**Response (siempre 200):**
```json
{
  "success": true,
  "results": [
    { "email": "a@example.com", "status": "new_user" },
    { "email": "b@example.com", "status": "already_owned" }
  ],
  "summary": { "succeeded": 2, "failed": 0 }
}
```

---

## 🛠️ ADMIN: REVOCAR / RESTAURAR ACCESO A PROGRAMAS

**PATCH** `/api/admin/user/:username/programs/:programId/access` (auth: `validateAPIKey` + `adminLimiter`)

Permite a un operador externo (dashboard de Trenno) **otorgar o revocar** acceso a un programa de un usuario, sin product key. Implementado en `adminController.setProgramAccess` sobre `programActivationService`.

**Body:**
```json
{ "grant": true }   // true = activar, false = desactivar (boolean estricto)
```

**Comportamiento:**
- `grant: true` → `activateProgramForUser(userId, programId)` (sin team → no asigna equipo). Idempotente: si ya estaba comprado, no re-otorga.
- `grant: false` → `deactivateProgramForUser(userId, programId)`: setea `isPurchased = false` y `hasAccessFlag = false`.
  - **Guard:** si el programa tiene `subscription.status === "active"` → 409 `PROGRAM_HAS_ACTIVE_SUBSCRIPTION` (no se puede revocar un programa con suscripción activa).
- `programId` debe estar en `VALID_PROGRAMS` (`tmd, tia, tia_summer, tia_pool, trenno_ia`), si no → 400 `ADMIN_INVALID_PARAMS`.

**Response:**
```json
{
  "success": true,
  "program": {
    "programId": "tia",
    "isPurchased": true,
    "hasAccessFlag": true,
    "hasAccess": true,
    "acquiredAt": "2026-05-26T10:00:00.000Z"
  }
}
```

**Errores:** 404 `ADMIN_USER_NOT_FOUND`, 400 `ADMIN_INVALID_PARAMS`, 409 `PROGRAM_HAS_ACTIVE_SUBSCRIPTION`.

> La desactivación **no** borra progreso (lecciones, instrucciones, XP): solo apaga los flags de acceso. Si se vuelve a otorgar, `acquiredAt` se conserva (solo se setea si estaba vacío).

---

## 📊 5. TRACKING Y VERIFICACIÓN

### Verificar Código (Antes de Activar — usuario logeado)

**GET** `/api/product-key/:code` (auth: `validateJWT`)

> El path es directamente `/:code` (no `/verify/:code`). Sirve para que el frontend muestre info del código antes de pedir confirmación de activación.

**Response si disponible:**
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

**Errors:**
- 404 `VALIDATION_PRODUCT_KEY_NOT_FOUND` — código no existe
- 404 `VALIDATION_PRODUCT_KEY_ALREADY_USED` — código ya activado

---

### Checar Estado (Soporte / Admin externo)

**GET** `/api/product-key/check/:code` (auth: `validateAPIKey`)

**Response:**
```json
{
  "success": true,
  "data": {
    "code": "ABCD-1234-EFGH-5678",
    "email": "comprador@example.com",
    "product": "tia",
    "isActivated": true,
    "activatedAt": "2025-01-15T10:30:00.000Z",
    "user": {
      "name": "Juan Pérez",
      "email": "usuario@example.com"
    }
  }
}
```

**Uso:** Para soporte al cliente o integración externa (Make/CRM), verificar si un código fue activado y por quién. No requiere JWT, solo API key.

---

## 🏢 6. CASOS DE USO B2B

### Caso 1: Empresa Compra para 50 Empleados

**Setup:**
```javascript
// Generar 50 códigos divididos en 5 equipos (10 por equipo)

// Equipo Ventas (10 códigos)
for (let i = 0; i < 10; i++) {
  await generateProductKey({
    email: `comprador_${i}@empresa.com`,
    product: "tia",
    team: "equipo_ventas"
  });
}

// Equipo Marketing (10 códigos)
for (let i = 0; i < 10; i++) {
  await generateProductKey({
    email: `comprador_${i}@empresa.com`,
    product: "tia",
    team: "equipo_marketing"
  });
}

// ... etc para 5 equipos
```

**Resultado:**
- 50 códigos únicos generados
- Cada código asigna automáticamente al equipo correspondiente
- Los usuarios pueden ver su ranking de equipo
- La empresa puede trackear progreso por equipo

---

### Caso 2: Ventas Individuales (B2C)

**Setup:**
```javascript
// Generar 1 código sin equipo
await generateAndSendProductKey({
  email: "comprador@example.com",
  product: "tia",
  team: "no_team"  // Sin equipo
});
```

**Resultado:**
- Código enviado por email
- Usuario activa y obtiene acceso
- NO se asigna a ningún equipo
- Participa solo en ranking individual

---

## ⚠️ 7. ERRORES Y VALIDACIONES

### Errores de Activación y Generación

Columna "Código" = `code` interno del catálogo (`src/config/errors.json`).

| Constante | Código | Status | Causa |
|-----------|--------|--------|-------|
| `VALIDATION_PRODUCT_KEY_REQUIRED` | — | 400 | No se envió código |
| `VALIDATION_PRODUCT_KEY_NOT_FOUND` | `PRODUCT_001` | 404 | Código no existe |
| `VALIDATION_PRODUCT_KEY_ALREADY_USED` | `PRODUCT_002` | 404 (verify) / 400 (activate) | Código ya activado |
| `VALIDATION_PRODUCT_ALREADY_OWNED` | `PRODUCT_003` | 400 | Usuario ya tiene el programa (rollback de la transacción) |
| `AUTH_USER_NOT_FOUND` | `AUTH_002` | 404 | Usuario no existe (rollback de la transacción) |
| `VALIDATION_GENERIC_ERROR` | `VALIDATION_001` | 400 | `ValidationError` de Mongoose (ej. `team` > 50, product/email inválido) o body bulk inválido |
| `AUTH_API_KEY_MISSING` / `AUTH_API_KEY_INVALID` | — | 401 / 403 | Falta o no coincide el API key (`validateAPIKey`) |
| `PROGRAM_HAS_ACTIVE_SUBSCRIPTION` | `PROGRAM_002` | 409 | Intento de revocar acceso con suscripción activa (admin) |
| `ADMIN_USER_NOT_FOUND` / `ADMIN_INVALID_PARAMS` | `ADMIN_001` / `ADMIN_002` | 404 / 400 | Endpoint admin de acceso |

### Rollback Automático (vía transacción)

`activateProductKey` corre dentro de `session.withTransaction()`. El `findOneAndUpdate` que marca la key como usada y la activación del programa comparten la misma sesión. Si la activación throwea (user inexistente → `AUTH_USER_NOT_FOUND`, o `alreadyOwned` → `VALIDATION_PRODUCT_ALREADY_OWNED`), **la transacción hace rollback automático** y la key vuelve a `used: false`. No hay un `findOneAndUpdate` manual de reversión: lo maneja MongoDB.

```javascript
await session.withTransaction(async () => {
  const key = await ProductKey.findOneAndUpdate(
    { code: code.toUpperCase(), used: false },
    { used: true, usedAt: new Date(), usedBy: userId },
    { new: true, session }
  );
  if (!key) { /* 404 NOT_FOUND o 400 ALREADY_USED según exista o no */ }

  const { newlyUnlocked, alreadyOwned } = await activateProgramForUser(userId, key.product, key.team, session);
  if (alreadyOwned) throw { statusCode: 400, errorKey: "VALIDATION_PRODUCT_ALREADY_OWNED" };
  // un throw aquí rollbackea también el used:true de la key
});
```

Esto permite que otro usuario pueda activar el código si la activación de este falló.

---

## 🔒 8. SEGURIDAD

### Validaciones de Email

```javascript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
  return res.status(400).json(getError("VALIDATION_EMAIL_INVALID"));
}
```

### Escape de HTML

En emails con contenido user-generated (diagnóstico):

```javascript
const escapeHtml = (str) =>
  str.replace(/&/g, '&amp;')
     .replace(/</g, '&lt;')
     .replace(/>/g, '&gt;')
     .replace(/"/g, '&quot;')
     .replace(/'/g, '&#39;');

const decodedMessage = escapeHtml(Buffer.from(message, 'base64').toString('utf-8'));
```

Previene XSS si el diagnóstico contiene HTML malicioso.

### Rate Limiting

Los endpoints de **generación** de product keys (`/generate`, `/generate-and-send`, `/generate-and-send-make`, `/auto-enroll`, `/generate-and-send-bulk`, `/auto-enroll-bulk`) **no tienen un rate limiter dedicado**; solo están protegidos por `validateAPIKey`. La única contención de volumen es el límite de 1..100 emails por request en los endpoints bulk. El `globalLimiter` (15 min / 3000 req por IP) aplica a toda la app.

El endpoint admin de acceso (`PATCH /api/admin/user/.../access`) sí usa `adminLimiter` (15 min / 60 req por IP).

### Límite de `team` (gotcha cross-repo)

`team` es un `String` con `maxlength: 50` en el modelo. Si el caller (ej. el dashboard de Trenno generando keys con el **nombre de la empresa** como team) envía un valor > 50 caracteres, Mongoose lanza un `ValidationError`. Hoy eso se traduce en un **400 con detalle** (gracias a `validationErrorResponse`); antes cascadeaba a un 500 opaco difícil de diagnosticar. **El integrador debe truncar el `team` a ≤ 50 chars** antes de llamar.

---

## 📧 9. CONFIGURACIÓN DE EMAIL

### SMTP Setup

**Variables de entorno:**
```env
SMTP_EMAIL=noreply@stannumgame.com
SMTP_PASSWORD=app_password_here
```

**Configuración Nodemailer:**
```javascript
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD
  }
});
```

### Templates de Email

**Características:**
- HTML responsive
- Dark theme con branding STANNUM
- Gradientes y sombras
- Código destacado con font grande
- CTAs claros
- Footer con copyright

---

## 📊 10. ANALYTICS Y REPORTING

### Queries Útiles (No Implementadas)

**Keys por producto:**
```javascript
const countByProduct = await ProductKey.aggregate([
  { $group: { _id: "$product", count: { $sum: 1 } } }
]);
// Resultado: [{ _id: "tia", count: 150 }, ...]
```

**Tasa de activación:**
```javascript
const total = await ProductKey.countDocuments();
const used = await ProductKey.countDocuments({ used: true });
const activationRate = (used / total) * 100;
```

**Keys por equipo:**
```javascript
const keysByTeam = await ProductKey.aggregate([
  { $match: { product: "tia" } },
  { $group: { _id: "$team", count: { $sum: 1 }, used: { $sum: { $cond: ["$used", 1, 0] } } } }
]);
```

---

## 🎯 11. INTEGRACIÓN CON ACHIEVEMENTS

Al activar un product key, se desbloquean achievements automáticamente:

**Achievement:** `first_program_acquired` (50 XP)

```javascript
const { newlyUnlocked } = await unlockAchievements(user);

// newlyUnlocked puede contener:
[
  {
    achievementId: "first_program_acquired",
    unlockedAt: "2025-01-15T10:30:00.000Z",
    xpReward: 50
  }
]
```

El frontend muestra confetti + toast cuando se activa un código.

---

## 🔄 12. MÉTODOS ALTERNATIVOS DE ACTIVACIÓN

Además de Product Keys, los programas pueden activarse mediante:

### Compra con Mercado Pago (Pago Único)

**Servicio:** `src/services/programActivationService.js`

Cuando un usuario completa una compra por Mercado Pago, el sistema activa el programa automáticamente usando `programActivationService`. Este servicio:

1. Marca `isPurchased = true` y `hasAccessFlag = true` en el programa
2. Registra `acquiredAt` con la fecha de compra
3. Desbloquea achievements correspondientes

**Nota:** Las compras por Mercado Pago NO asignan equipos (a diferencia de Product Keys).

### Suscripción con Mercado Pago (Mensual)

Para programas basados en suscripción (como `trenno_ia`), el acceso se gestiona mediante:

- `subscription.status = 'active'` → acceso habilitado
- `hasAccessFlag = true` → campo denormalizado para queries eficientes

Ver [payments.md](./payments.md) para documentación completa del sistema de pagos.

### Transferencia de Demo

**Servicio:** `src/services/demoTransferService.js`

Cuando un usuario con `demo_trenno` compra `trenno_ia`, su progreso del demo se transfiere al programa completo (lecciones completadas, instrucciones, etc.).

### Otorgamiento manual (Admin)

`PATCH /api/admin/user/:username/programs/:programId/access` con `{ grant: true }` activa el programa sin product key (ver [§ Admin: Revocar / Restaurar](#-admin-revocar--restaurar-acceso-a-programas)). Tampoco asigna equipo. `grant: false` revoca (apaga `isPurchased`/`hasAccessFlag`).

### Auto-Enroll (Magic Link)

`auto-enroll` / `auto-enroll-bulk` crean el stub user, generan una ProductKey con `used: true` y activan el programa en una transacción, todo en el mismo paso (ver § 4 Método 4/6).

---

## 📌 NOTAS TÉCNICAS

### Formato del Código

**Por qué XXXX-XXXX-XXXX-XXXX:**
- Fácil de leer y escribir
- Base36 (0-9, A-Z) = 36^16 combinaciones posibles
- Probabilidad de colisión extremadamente baja

> El alfabeto base36 **incluye** caracteres ambiguos (0/O, 1/I): no hay exclusión de caracteres confusos en `generateProductCode`.

### Unicidad

Con 4 segmentos de 4 caracteres base36:
- **Combinaciones totales:** 36^16 ≈ 7.9 × 10^24
- **Colisión:** Negligible hasta millones de códigos

### Performance

**Índices reales del modelo** (`src/models/productKeyModel.js`):
```javascript
// unique en `code` (creado automáticamente por unique: true en el campo)
productKeySchema.index({ product: 1, used: 1 });  // claves disponibles por producto
productKeySchema.index({ usedBy: 1 });            // claves usadas por un usuario específico
```

No existen índices dedicados sobre `email`, `team`, ni `used` por sí solo.

---

**© STANNUM 2026**
