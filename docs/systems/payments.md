# Sistema de Pagos y Suscripciones - STANNUM Game

El sistema de pagos de STANNUM Game integra Mercado Pago para ofrecer **compras únicas** de programas y **suscripciones mensuales**, con soporte para cupones de descuento, regalos y reconciliación automática.

## Visión General

**Métodos de pago:**

1. **Compra Única** - Pago one-time para acceso permanente a un programa
2. **Suscripción Mensual** - Pago recurrente con acceso mientras esté activa
3. **Product Keys** - Códigos de activación (ver [teams-productkeys.md](./teams-productkeys.md))

**Funcionalidades:**
- Checkout via Mercado Pago (redirect)
- Cupones de descuento (porcentaje o monto fijo)
- Compras para regalo (genera product keys)
- Webhooks con verificación HMAC
- Reconciliación automática de pagos
- Transferencia de progreso demo → programa completo
- Emails transaccionales en cada evento clave

---

## 1. CONFIGURACIÓN DE PRECIOS

**Archivo:** `src/config/programPricing.js`

| Programa | Tipo | Precio (ARS) | Comprable |
|----------|------|-------------|-----------|
| tia | purchase | 50,000 | No |
| tmd | purchase | 0 | No |
| tia_summer | purchase | 250,000 | Sí |
| tia_pool | purchase | 250,000 | No |
| trenno_ia | subscription | 30,000/mes | Sí |
| demo_trenno | demo | Gratis | - |

**Archivo:** `src/config/programRegistry.js`

```javascript
SUBSCRIPTION_PROGRAMS: ['trenno_ia']
PURCHASE_PROGRAMS: ['tmd', 'tia', 'tia_summer', 'tia_pool']
DEMO_PROGRAMS: ['demo_trenno']
VALID_PROGRAMS: ['tmd', 'tia', 'tia_summer', 'tia_pool', 'trenno_ia']
```

---

## 2. COMPRA ÚNICA (ONE-TIME PURCHASE)

### Flujo Completo

```
Usuario selecciona programa
  ↓
POST /api/payment/create-preference
  ├─ Validar programa es comprable
  ├─ Verificar usuario no tiene el programa (tipo "self")
  ├─ Aplicar cupón (si existe, incremento atómico de uso)
  ├─ Crear Order en DB (status: pending, expiresAt: +30min)
  └─ Crear preferencia en Mercado Pago API
  ↓
Response: { orderId, preferenceId, initPoint }
  ↓
Frontend redirige a initPoint (checkout MP)
  ↓
Usuario paga en Mercado Pago
  ↓
Webhook MP → POST /api/webhooks/mercadopago
  ├─ Verificar HMAC signature
  ├─ processPaymentNotification(paymentId)
  ├─ Actualizar Order status
  └─ fulfillOrder() si aprobado
  ↓
fulfillOrder()
  ├─ Tipo "self": activateProgramForUser()
  │   ├─ isPurchased = true, hasAccessFlag = true
  │   └─ Desbloquear achievements
  └─ Tipo "gift":
      ├─ Generar product keys (XXXX-XXXX-XXXX-XXXX)
      └─ Enviar email con códigos de activación
  ↓
Frontend verifica: POST /api/payment/verify
  └─ Response: Order con status actualizado
```

### Tipos de Compra

| Tipo | Descripción |
|------|-------------|
| **self** | Para el usuario autenticado, activa programa inmediatamente |
| **gift** | Para regalar, genera product keys y las envía por email |

### Opciones de Regalo

| Campo | Descripción |
|-------|-------------|
| `giftDelivery` | `"email"` (enviar códigos por email) o `"manual"` (mostrar códigos al comprador) |
| `giftEmail` | Email del destinatario (requerido si delivery es email) |
| `keysQuantity` | Cantidad de códigos a generar (1-10) |

---

## 3. ENDPOINTS DE PAGOS

### Checkout

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/api/payment/create-preference` | POST | JWT | Crear preferencia de pago MP |
| `/api/payment/verify` | POST | JWT | Verificar estado de pago |
| `/api/payment/apply-coupon` | POST | JWT | Validar cupón antes del checkout |

### Órdenes

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/api/payment/my-orders` | GET | JWT | Historial de compras (paginado) |
| `/api/payment/order/:orderId` | GET | JWT | Detalle de una orden |
| `/api/payment/order/:orderId/cancel` | POST | JWT | Cancelar orden pendiente |
| `/api/payment/order/:orderId/resend-email` | POST | JWT | Reenviar códigos de regalo |

### Cupones (Admin)

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/api/payment/coupon` | POST | Admin | Crear cupón |
| `/api/payment/coupons` | GET | Admin | Listar cupones |
| `/api/payment/coupon/:id` | PUT | Admin | Actualizar cupón |

---

## 4. SISTEMA DE CUPONES

**Modelo:** `src/models/couponModel.js`

```javascript
{
  code: String,            // Uppercase, único, 3-30 chars
  discountType: "percentage" | "fixed",
  discountValue: Number,
  applicablePrograms: [String],  // Whitelist (vacío = todos)
  minAmount: Number,       // Monto mínimo para aplicar
  maxUses: Number,         // Límite global de usos
  maxUsesPerUser: Number,  // Límite por usuario (default: 1)
  currentUses: Number,     // Contador atómico
  validFrom: Date,
  validUntil: Date,
  isActive: Boolean
}
```

### Validaciones

- Cupón activo y dentro de rango de fechas
- Programa en whitelist (si `applicablePrograms` tiene valores)
- Monto mínimo cumplido
- No excede `maxUses` global
- No excede `maxUsesPerUser` por usuario
- Incremento atómico de `currentUses` (previene race conditions)

### Descuento

Si el cupón cubre el 100% del monto, la orden se cumple directamente sin pasar por MP (orden con `finalAmount: 0`).

---

## 5. SUSCRIPCIONES (MERCADO PAGO)

### Flujo Completo

```
Usuario inicia suscripción
  ↓
POST /api/subscription/create
  ├─ Validar programa es de tipo suscripción
  ├─ Lock atómico: status='pending', pendingExpiresAt=+30min
  ├─ Cancelar preapproval anterior en MP (si existe)
  ├─ Crear preapproval en MP API (standalone recurring)
  └─ Guardar mpSubscriptionId
  ↓
Response: { initPoint, status: 'pending' }
  ↓
Frontend redirige a initPoint (MP preapproval)
  ↓
Usuario autoriza suscripción en MP
  ↓
Webhook: subscription_preapproval
  ├─ processPreapprovalWebhook()
  ├─ Validar transición de estado
  ├─ pending → active:
  │   ├─ subscribedAt = now
  │   ├─ currentPeriodEnd = now + 1 mes
  │   ├─ hasAccessFlag = true
  │   ├─ Transferir progreso demo (si aplica)
  │   └─ Enviar email de activación
  └─ Guardar audit log
  ↓
Cobros mensuales automáticos por MP
  ↓
Webhook: subscription_authorized_payment
  ├─ processAuthorizedPaymentWebhook()
  ├─ Crear SubscriptionPayment record
  ├─ Si approved:
  │   ├─ Extender currentPeriodEnd + 1 mes
  │   └─ Enviar email de pago exitoso
  ├─ Si recycling (reintento):
  │   └─ Enviar email de reintento
  └─ Si rejected (final):
      ├─ Pausar suscripción
      └─ Enviar email de rechazo
```

### Máquina de Estados

```
null ──→ pending ──→ active ──→ paused ──→ cancelled ──→ expired
  │         │           │                      ↑
  │         │           └──────────────────────┘
  └─────────┴──→ active (reactivación)
                    ↑
expired ────────────┘ (re-suscripción)
```

**Transiciones válidas:**
| Desde | Hacia |
|-------|-------|
| null | pending, active |
| pending | active, cancelled |
| active | paused, cancelled |
| paused | active, cancelled |
| cancelled | expired |
| expired | pending, active |

### Acceso durante cancelación

Cuando se cancela una suscripción, el usuario mantiene acceso hasta `currentPeriodEnd` (fin del período ya pagado). Después de esa fecha, un cron job marca la suscripción como `expired` y revoca `hasAccessFlag`.

---

## 6. ENDPOINTS DE SUSCRIPCIONES

### Usuario

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/api/subscription/create` | POST | JWT | Iniciar suscripción (redirige a MP) |
| `/api/subscription/cancel` | POST | JWT | Cancelar suscripción activa |
| `/api/subscription/status/:programId` | GET | JWT | Estado de suscripción |
| `/api/subscription/payments/:programId` | GET | JWT | Historial de pagos (paginado) |

### Admin

| Endpoint | Método | Auth | Descripción |
|----------|--------|------|-------------|
| `/api/subscription/health` | GET | Admin | Estadísticas de salud |
| `/api/subscription/admin/:userId/:programId/cancel` | POST | Admin | Cancelar suscripción de usuario |
| `/api/subscription/admin/:userId/:programId/history` | GET | Admin | Historial de pagos de usuario |

---

## 7. WEBHOOKS

### Endpoint

**POST** `/api/webhooks/mercadopago`

### Verificación HMAC

**Archivo:** `src/middlewares/webhookVerify.js`

```javascript
// Headers requeridos: x-signature, x-request-id
// Query param requerido: data.id
// Template: "id:{dataId};request-id:{xRequestId};ts:{ts};"
// Algoritmo: HMAC-SHA256
// Ventana de tiempo: ±5 minutos
// Comparación: timing-safe (previene timing attacks)
```

### Tipos de Notificación

| Tipo MP | Handler | Descripción |
|---------|---------|-------------|
| `payment` | `processPaymentNotification()` | Pago de compra única |
| `subscription_preapproval` | `processPreapprovalWebhook()` | Cambio de estado de suscripción |
| `subscription_authorized_payment` | `processAuthorizedPaymentWebhook()` | Pago recurrente de suscripción |

### Manejo de Errores

- **200 OK** para errores no reintentables (pago ya procesado, orden no encontrada)
- **500** para errores reintentables (fallo transitorio → MP reintenta automáticamente)

---

## 8. MODELOS DE DATOS

### Order

**Archivo:** `src/models/orderModel.js`

```javascript
{
  userId: ObjectId,
  programId: String,
  type: "self" | "gift",
  giftDelivery: "email" | "manual",
  giftEmail: String,
  keysQuantity: Number (1-10),
  couponId: ObjectId,
  discountApplied: Number,
  originalAmount: Number,
  finalAmount: Number,
  currency: "ARS",
  mpPreferenceId: String,
  mpInitPoint: String,
  mpPaymentId: String,
  status: "pending" | "approved" | "rejected" | "refunded" | "chargedback" | "cancelled" | "expired",
  productKeys: [ObjectId],
  fulfilledAt: Date,
  giftEmailSent: Boolean,
  giftEmailRetries: Number,
  couponCounted: Boolean,
  expiresAt: Date
}
```

### SubscriptionPayment

**Archivo:** `src/models/subscriptionPaymentModel.js`

```javascript
{
  userId: ObjectId,
  programId: String,
  mpPaymentId: String,        // Único
  mpSubscriptionId: String,
  amount: Number,
  currency: "ARS",
  status: "approved" | "rejected" | "pending" | "refunded",
  retryAttempt: Number
}
```

### SubscriptionAuditLog

**Archivo:** `src/models/subscriptionAuditLogModel.js`

```javascript
{
  userId: ObjectId,
  programId: String,
  mpSubscriptionId: String,
  previousStatus: String,
  newStatus: String,
  priceARS: Number,
  trigger: "user" | "webhook" | "reconciliation" | "system" | "public_cancel",
  metadata: Object
}
```

### Coupon

**Archivo:** `src/models/couponModel.js`

(Ver sección 4 para detalle del schema)

---

## 9. RECONCILIACIÓN AUTOMÁTICA

**Archivo:** `src/services/subscriptionReconciliationService.js`

### reconcileHot() - Cada 6 horas

- Objetivo: Suscripciones que expiran en 48h + pausadas
- Rate limit: 10 req/seg a MP API
- Sincroniza estado desde MP, corrige divergencias
- Alerta si corrige > 5 (posible fallo de webhooks)

### reconcileCold() - Diario a las 4:00 AM

- Objetivo: TODAS las suscripciones no expiradas
- Rate limit: 5 req/seg a MP API
- Sincronización completa de estados
- Alerta si corrige > 5

### checkWebhookHealth() - Cada 12 horas

- Verifica recepción de webhooks en últimas 24h
- Alerta si hay suscripciones activas sin webhooks recientes

### reconcilePayments() - Cada 15 minutos

- Expira órdenes pendientes (> 30 min)
- Verifica órdenes pendientes viejas (> 5 min) contra MP API
- Reintenta órdenes aprobadas sin cumplir (fulfillment fallido)
- Reintenta emails de regalo fallidos (hasta 5 intentos)

---

## 10. TAREAS PROGRAMADAS (CRON)

Todas usan timezone `America/Argentina/Buenos_Aires`.

| Tarea | Frecuencia | Servicio | Función |
|-------|-----------|----------|---------|
| reconcilePayments | Cada 15 min | paymentService | Expirar órdenes, reintentar pagos y emails |
| expireCancelledSubscriptions | Cada 30 min | subscriptionService | Marcar suscripciones canceladas como expiradas |
| sendPreRenewalNotifications | Diario 10:00 | subscriptionEmailService | Notificar renovación 24h antes |
| reconcileHot | Cada 6h (:05) | reconciliationService | Sync rápido de suscripciones próximas a expirar |
| reconcileCold | Diario 4:00 | reconciliationService | Sync completo de todas las suscripciones |
| checkWebhookHealth | Cada 12h (:10) | reconciliationService | Verificar salud de webhooks |
| retryFailedDemoTransfers | Cada hora (:30) | demoTransferService | Reintentar transferencias de demo fallidas |
| retryFailedEmails | Cada 2h (:45) | subscriptionEmailService | Reintentar emails fallidos desde cola |

---

## 11. EMAILS TRANSACCIONALES

| Evento | Asunto | Contenido |
|--------|--------|-----------|
| Suscripción activada | Bienvenido a [programa] | Confirmación, precio |
| Pago exitoso | Pago procesado | Monto, próxima renovación |
| Pago rechazado (reintento) | Problema con tu pago | Intento N, actualizar método |
| Pago rechazado (final) | Suscripción pausada | Acción requerida |
| Cancelación | Suscripción cancelada | Acceso hasta fecha |
| Pre-renovación | Recordatorio de renovación | 24h antes del cobro |
| Expiración | Acceso finalizado | Invitación a re-suscribirse |
| Códigos de regalo | Te regalaron [programa] | Códigos de activación |

---

## 12. SEGURIDAD

### Atomicidad

- **Cupones:** Incremento atómico de `currentUses` (previene sobre-uso)
- **Fulfillment:** Claim atómico de `fulfilledAt` (previene doble-cumplimiento)
- **Suscripciones:** Lock con `pendingExpiresAt` (previene creación concurrente)
- **Product Keys:** Índice único en `code` + reintentos en colisión

### Webhooks

- Verificación HMAC-SHA256 con timing-safe comparison
- Validación de ventana temporal (±5 min)
- Verificación de `data.id` entre query param y body

### Prevención de Fraude

- Verificación de ownership en órdenes (userId match)
- Mapeo de estados MP → estados internos (no confiar en status del frontend)
- Rollback de cupones si el pago no se completa

---

## Variables de Entorno

```env
MP_ACCESS_TOKEN=...          # Token de acceso Mercado Pago
MP_NOTIFICATION_URL=...      # URL base para webhooks
MP_WEBHOOK_SECRET=...        # Secret para verificación HMAC
FRONTEND_URL=...             # URL del frontend (para redirects post-pago)
```

---

**© STANNUM 2026**
