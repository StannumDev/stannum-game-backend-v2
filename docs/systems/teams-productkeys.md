# Sistema de Teams & Product Keys - STANNUM Game

El sistema de Product Keys permite la activación de programas mediante códigos únicos, con soporte para asignación automática de equipos. Sistema completo para ventas B2B y B2C con generación, envío automático por email y tracking.

## 📊 Visión General

**Product Keys** son códigos alfanuméricos únicos (`XXXX-XXXX-XXXX-XXXX`) que permiten:

- ✅ Activar acceso a programas (TIA, TMD, TIA_SUMMER, TIA_POOL, TRENNO_IA)
- ✅ Asignar usuarios a equipos automáticamente
- ✅ Tracking de uso (usado/no usado, quién activó, cuándo)
- ✅ Envío automático por email con templates HTML
- ✅ Prevención de uso duplicado (race conditions)
- ✅ Integración con Make.com para automatización

---

## 🎟️ 1. PRODUCT KEYS

### Modelo de Datos

**Archivo:** `src/models/productKeyModel.js`

```javascript
{
  code: String,              // "ABCD-1234-EFGH-5678" (formato fijo)
  email: String,             // Email del comprador
  createdAt: Date,           // Fecha de generación
  used: Boolean,             // ¿Fue activado?
  usedAt: Date,              // Cuándo se activó
  usedBy: ObjectId (User),   // Quién lo activó
  product: Enum ['tmd', 'tia', 'tia_summer', 'tia_pool', 'trenno_ia'],
  team: String               // Nombre del equipo o "no_team"
}
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

**Función:** `generateProductCode()`

```javascript
const generateProductCode = () => {
  const segment = () =>
    Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 36).toString(36).toUpperCase()
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
  programName: String,  // "tia", "tia_summer", "tia_pool", "tmd", "trenno_ia"
  teamName: String,     // "equipo_alpha", "equipo_ventas", etc.
  role: String          // "member", "leader" (actualmente solo member)
}, { _id: false });

// En userSchema:
teams: [teamSchema]
```

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
1. Buscar y marcar key como usada (operación atómica)
   ProductKey.findOneAndUpdate(
     { code: code.toUpperCase(), used: false },
     { used: true, usedAt: now, usedBy: userId },
     { new: true }
   )
  ↓
2. Verificar resultado
   ├─ Si null → código no existe o ya usado
   └─ Si existe → continuar
  ↓
3. Cargar usuario
   User.findById(userId)
  ↓
4. Verificar que no tenga el programa
   if (user.programs[key.product].isPurchased) {
     // Revertir key (rollback)
     ProductKey.findOneAndUpdate(
       { code },
       { used: false, usedAt: null, usedBy: null }
     )
     return ERROR
   }
  ↓
5. Activar programa
   user.programs[key.product].isPurchased = true
   user.programs[key.product].acquiredAt = now
  ↓
6. Asignar a team (si corresponde)
   if (key.team !== 'no_team') {
     user.teams.push({
       programName: key.product,
       teamName: key.team,
       role: 'member'
     })
   }
  ↓
7. Desbloquear achievements
   unlockAchievements(user)
   → Puede desbloquear "first_program_acquired"
  ↓
8. Guardar usuario
   user.save()
  ↓
Response: {
  success: true,
  message: "Programa activado correctamente",
  achievementsUnlocked: [...]
}
```

### Prevención de Race Conditions

**Problema:** Dos usuarios intentan activar el mismo código simultáneamente.

**Solución:** Operación atómica de MongoDB

```javascript
// Solo marca como usado SI used = false
const key = await ProductKey.findOneAndUpdate(
  { code: code.toUpperCase(), used: false },  // Condición
  { used: true, usedAt: new Date(), usedBy: userId },
  { new: true }
);

// Si key = null → ya estaba usado
if (!key) {
  // Verificar si existe
  const exists = await ProductKey.findOne({ code: code.toUpperCase() });
  if (!exists) return "código no encontrado";
  return "código ya usado";
}
```

Esto garantiza que **solo un usuario puede activar el código**, incluso con requests concurrentes.

---

## 📧 4. GENERACIÓN Y ENVÍO DE CÓDIGOS

### Endpoints de Generación

| Endpoint | Uso | Email |
|----------|-----|-------|
| `generateProductKey` | Crear sin enviar | No |
| `generateAndSendProductKey` | Crear y enviar email simple | Sí |
| `generateAndSendProductKeyMake` | Crear y enviar con diagnóstico | Sí |

### Método 1: Generar Sin Enviar (ADMIN)

**POST** `/api/product-key/generate` (endpoint ADMIN, no público)

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

**POST** `/api/product-key/generate-and-send`

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

**POST** `/api/product-key/generate-make`

**Uso:** Integración con Make.com para automatización post-lead capture.

**Body:**
```json
{
  "email": "comprador@example.com",
  "fullName": "SnVhbiBQw6lyZXo=",      // Base64 encoded
  "message": "VHUgZGlhZ27Ds3N0aWNvLi4u",  // Base64 encoded (diagnóstico IA)
  "product": "tia",
  "team": "no_team",
  "guideLink": "https://...",           // Opcional
  "whatsappLink": "https://wa.me/..."   // Opcional
}
```

**Características:**
- ✅ Decodifica nombre y mensaje de Base64
- ✅ Escapa HTML para prevenir XSS
- ✅ Incluye diagnóstico personalizado en email
- ✅ Secciones opcionales (guía, WhatsApp)
- ✅ Template más completo

**Template de Email:**
- Asunto: "Tu Diagnóstico IA + Acceso a STANNUM Game"
- Saludo personalizado con nombre
- Sección de diagnóstico
- Código de activación destacado
- Sección de guía (si guideLink presente)
- Sección de comunidad WhatsApp (si whatsappLink presente)

---

## 📊 5. TRACKING Y VERIFICACIÓN

### Verificar Código (Antes de Activar)

**GET** `/api/product-key/verify/:code`

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

**Response si usado:**
```json
{
  "success": false,
  "code": "VALIDATION_PRODUCT_KEY_ALREADY_USED",
  "msg": "Este código ya fue activado"
}
```

---

### Checar Estado (ADMIN)

**GET** `/api/product-key/status/:code`

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

**Uso:** Para soporte al cliente, verificar si un código fue activado y por quién.

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

### Errores de Activación

| Error Code | Causa |
|------------|-------|
| `VALIDATION_PRODUCT_KEY_REQUIRED` | No se envió código |
| `VALIDATION_PRODUCT_KEY_NOT_FOUND` | Código no existe |
| `VALIDATION_PRODUCT_KEY_ALREADY_USED` | Código ya activado |
| `VALIDATION_PRODUCT_ALREADY_OWNED` | Usuario ya tiene el programa |
| `AUTH_USER_NOT_FOUND` | Usuario no existe (rollback automático) |

### Rollback Automático

Si la activación falla después de marcar la key como usada, se revierte:

```javascript
// Si el usuario no existe o ya tiene el programa
await ProductKey.findOneAndUpdate(
  { code: code.toUpperCase() },
  { used: false, usedAt: null, usedBy: null }
);
```

Esto permite que otro usuario pueda activar el código.

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

Generación de códigos debería tener rate limiting (no implementado actualmente):

```javascript
// Recomendación:
const generateRateLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minuto
  max: 10,                 // 10 generaciones
  message: "Demasiadas generaciones, intenta más tarde"
});
```

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

---

## 📌 NOTAS TÉCNICAS

### Formato del Código

**Por qué XXXX-XXXX-XXXX-XXXX:**
- Fácil de leer y escribir
- Evita confusión (sin O/0, I/1)
- Base36 (0-9, A-Z) = 36^16 combinaciones posibles
- Probabilidad de colisión extremadamente baja

### Unicidad

Con 4 segmentos de 4 caracteres base36:
- **Combinaciones totales:** 36^16 ≈ 7.9 × 10^24
- **Colisión:** Negligible hasta millones de códigos

### Performance

**Índices recomendados:**
```javascript
productKeySchema.index({ code: 1 }, { unique: true });
productKeySchema.index({ email: 1 });
productKeySchema.index({ used: 1 });
productKeySchema.index({ product: 1, team: 1 });
productKeySchema.index({ product: 1, used: 1 });  // Consultas de claves disponibles por producto
productKeySchema.index({ usedBy: 1 });              // Buscar claves usadas por un usuario específico
```

---

**© STANNUM 2026**
