# Sistema de Gamificación - STANNUM Game

El sistema de gamificación de STANNUM Game está diseñado para maximizar el engagement y la retención del aprendizaje mediante mecánicas de juego probadas: experiencia (XP), niveles, logros y rachas diarias.

## 📊 Visión General

El sistema se compone de 5 pilares principales:

1. **XP (Experience Points)** - Puntos ganados al completar actividades
2. **Tins (Moneda Virtual)** - Moneda interna ganada con actividades
3. **Niveles** - Progresion del 1 al 30 con curva exponencial
4. **Achievements** - 31 logros desbloqueables automaticamente
5. **Daily Streaks** - Bonificacion por dias consecutivos de actividad

---

## 🎯 1. SISTEMA DE EXPERIENCIA (XP)

### Fuentes de XP

Los usuarios ganan XP de 4 maneras:

| Acción | XP Base | Bonificaciones | Rango Total |
|--------|---------|----------------|-------------|
| **Completar Lección** | 100-280 | +Duración, +Módulo | 50-1500 XP |
| **Instrucción Calificada** | Base config | +Score%, +Velocidad | 50-3000 XP |
| **Desbloquear Achievement** | Variable | - | 50-500 XP |
| **Daily Streak Bonus** | 25-291/día | Acumulativo | 25-291 XP |

### 1.1 XP por Lección Completada

**Archivo:** `src/services/experienceService.js` + `src/helpers/experienceHelper.js`

**Fórmula:**
```javascript
XP_LECCIÓN = XP_BASE_MÓDULO × (1 + FACTOR_DURACIÓN)
```

**XP Base por Módulo:**
- Módulo 1: 100 XP
- Módulo 2: 140 XP (+40%)
- Módulo 3: 180 XP (+29%)
- Módulo 4: 230 XP (+28%)
- Módulo 5+: 280 XP (+22%)

**Factor Duración:**
```javascript
FACTOR_DURACIÓN = (durationSec / 600) × 1.0
// Por cada 10 minutos de video, +100% del base
```

**Ejemplo real:**
```
Lección TIAM01L01 (Módulo 1, 347 segundos ≈ 5.78 minutos)
XP_BASE = 100
FACTOR_DURACIÓN = (347 / 600) × 1.0 = 0.578
XP_TOTAL = 100 × (1 + 0.578) = 157.8 ≈ 158 XP
```

**Límites:**
- Mínimo: 50 XP
- Máximo: 1500 XP

**Protecciones:**
- ✅ Verifica que no se haya otorgado XP previamente
- ✅ Comprueba `lessonsCompleted` Y `xpHistory`
- ✅ Previene duplicados en caso de doble-click

---

### 1.2 XP por Instrucción Calificada

**Archivo:** `src/helpers/experienceHelper.js` → `computeInstructionXP()`

**Fórmula:**
```javascript
XP_BASE = rewardXP (configurado en programs/index.js)
BONIFICACIÓN_SCORE = XP_BASE × 0.5 × (score / 100)
BONIFICACIÓN_VELOCIDAD = aplicada si tiempo < 70% del estimado
XP_TOTAL = XP_BASE + BONIFICACIÓN_SCORE + BONIFICACIÓN_VELOCIDAD
```

**Bonificación por Score:**
- Score 0-49: 0% bonus
- Score 50-79: 25-39.5% bonus
- Score 80-89: 40-44.5% bonus
- Score 90-100: 45-50% bonus

**Bonificación por Velocidad:**
```javascript
tiempoUsado = submittedAt - startDate (en segundos)
tiempoEstimado = estimatedTimeSec

if (tiempoUsado < tiempoEstimado × 0.7) {
  BONIFICACIÓN = -30% (penaliza velocidad excesiva)
}
```
*Nota: La penalización previene que usuarios envíen sin hacer el trabajo real.*

---

### 1.3 Daily Streak Bonus

**Archivo:** `src/services/experienceService.js`

El sistema detecta automáticamente actividad diaria y otorga bonos XP por días consecutivos.

**Bonos por Día:**
| Día | Bonus XP |
|-----|----------|
| 1   | 25       |
| 2   | 38       |
| 3   | 57       |
| 4   | 86       |
| 5   | 129      |
| 6   | 194      |
| 7+  | 291 (cap)|

**Timezone:**
- Cada usuario tiene su timezone configurado
- Default: `America/Argentina/Buenos_Aires`
- Permite que usuarios globales tengan streak justo según su zona horaria

---

## 💰 2. SISTEMA DE TINS (MONEDA VIRTUAL)

**Archivo:** `src/services/coinsService.js` + `src/config/coinsConfig.js`

Tins es la moneda virtual de la plataforma. Se ganan al completar actividades y desbloquear logros.

### Fuentes de Tins

| Accion | Tins |
|--------|------|
| Completar leccion | 5 |
| Instruccion calificada (score < 70) | 10 |
| Instruccion calificada (score 70-89) | 15 |
| Instruccion calificada (score 90-99) | 20 |
| Instruccion calificada (score 100) | 25 |
| Daily streak (por dia) | 3 |
| Streak bonus (7 dias) | 10 |
| Streak bonus (30 dias) | 50 |
| Modulo completado | 30 |
| Programa completado | 100 |
| Favorito recibido en publicacion | 2 |
| Desbloquear achievement | Variable (5-60) |

### Historial

Cada transaccion de Tins se registra en `user.coinsHistory`:

```javascript
{
  type: "LESSON_COMPLETED" | "INSTRUCTION_GRADED" | "DAILY_STREAK" | "ACHIEVEMENT_UNLOCKED" | ...,
  coins: Number,
  date: Date,
  meta: { ... }
}
```

---

## 📈 3. SISTEMA DE NIVELES

### Configuración

**Archivo:** `src/config/xpConfig.js`

```javascript
{
  LEVELS: {
    MAX_LEVEL: 30,
    base: 150,  // XP para subir a nivel 2
    tiers: [
      { start: 1, end: 10, increment: 50 },   // +50 XP por nivel
      { start: 11, end: 20, increment: 100 }, // +100 XP por nivel
      { start: 21, end: 30, increment: 200 }  // +200 XP por nivel
    ]
  }
}
```

### Tabla de Niveles

| Nivel | XP Requerido | XP Total Acumulado |
|-------|--------------|-------------------|
| 1     | 0            | 0                 |
| 2     | 150          | 150               |
| 5     | 300          | 900               |
| 10    | 600          | 3900              |
| 15    | 1100         | 9400              |
| 20    | 1500         | 16000             |
| 25    | 2300         | 29000             |
| 30    | 3500         | 52500             |

---

## 🏆 4. SISTEMA DE ACHIEVEMENTS

**Archivo:** `src/config/achievementsConfig.js`

### Lista Completa de Logros (31 total)

#### Logros Generales (22 logros)

| ID | Descripcion | XP | Tins |
|----|-------------|-----|------|
| `first_program_acquired` | Compra primer programa | 50 | 10 |
| `profile_completed` | Completa todos los campos del perfil | 50 | 10 |
| `first_lesson_completed` | Completa 1 leccion | 50 | 5 |
| `first_instruction_completed` | 1 instruccion calificada | 50 | 5 |
| `first_module_completed` | Completa modulo entero (lecciones + instrucciones) | 100 | 15 |
| `module_instructions_completed` | Todas las instrucciones de un modulo calificadas | 100 | 15 |
| `first_program_completed` | Completa programa entero | 200 | 25 |
| `level_5` | Alcanza nivel 5 | 50 | 10 |
| `level_10` | Alcanza nivel 10 | 100 | 15 |
| `level_20` | Alcanza nivel 20 | 200 | 25 |
| `level_25` | Alcanza nivel 25 | 250 | 30 |
| `streak_3_days` | 3 dias consecutivos | 50 | 5 |
| `streak_7_days` | 7 dias consecutivos | 100 | 10 |
| `streak_15_days` | 15 dias consecutivos | 200 | 20 |
| `streak_30_days` | 30 dias consecutivos | 300 | 30 |
| `perfect_score` | 100% en una instruccion | 100 | 15 |
| `triple_perfect` | 100% en 3 instrucciones distintas | 200 | 25 |
| `marathon_day` | 5 lecciones completadas en un mismo dia | 100 | 15 |
| `prompt_creator` | Publica primer prompt en comunidad | 50 | 10 |
| `assistant_creator` | Publica primer asistente en comunidad | 50 | 10 |
| `community_favorite` | Recibe 5 favoritos en publicaciones | 150 | 20 |
| `collector` | Guarda 10 prompts o asistentes en favoritos | 50 | 10 |

#### Logros Especificos de Programas (9 logros)

**TIA:**

| ID | Descripcion | XP | Tins |
|----|-------------|-----|------|
| `trenno_ia_joined` | Compra TIA | 100 | 15 |
| `trenno_ia_first_module_completed` | Modulo 1 completo | 150 | 20 |
| `trenno_ia_completed` | Todo TIA completo | 300 | 40 |

**SUMMER:**

| ID | Descripcion | XP | Tins |
|----|-------------|-----|------|
| `trenno_ia_summer_joined` | Participa en SUMMER | 100 | 15 |
| `trenno_ia_summer_halfway` | 50% completado | 150 | 20 |
| `trenno_ia_summer_graduate` | Todo SUMMER completo | 500 | 60 |

**TIA POOL:**

| ID | Descripcion | XP | Tins |
|----|-------------|-----|------|
| `trenno_ia_pool_joined` | Participa en POOL | 100 | 15 |
| `trenno_ia_pool_halfway` | 50% completado | 150 | 20 |
| `trenno_ia_pool_graduate` | Todo POOL completo | 500 | 60 |

### Sistema de Desbloqueo

**Archivo:** `src/services/achievementsService.js`

```javascript
// Desbloqueo automático después de completar actividad
const { newlyUnlocked } = await unlockAchievements(user)

// Loop de hasta 10 iteraciones para desbloqueos en cadena
// (un achievement puede dar XP que sube nivel y desbloquea otro achievement)
```

**Llamado automático:**
- ✅ Después de completar lección
- ✅ Después de calificar instrucción
- ✅ En cadena con límite de 10 iteraciones

---

## 🎁 5. SISTEMA DE COFRES (CHESTS)

**Archivos:** `src/config/chestsConfig.js` + `src/controllers/chestController.js`

Los cofres son nodos de recompensa en el PathMap de cada programa. Se desbloquean al completar ciertas lecciones o instrucciones.

### Cofres Disponibles

| Chest ID | Programa | Modulo | Despues de | XP | Tins | Cover |
|----------|----------|--------|------------|-----|------|-------|
| TIAM01C01 | tia | TIAM01 | TIAM01L03 | 200 | 10 | - |
| TIAM01C02 | tia | TIAM01 | TIAM01I01 | 300 | 15 | horizon |
| TIAM02C01 | tia | TIAM02 | TIAM02L10 | 200 | 10 | - |
| TIAM02C02 | tia | TIAM02 | TIAM02L11 | 200 | 10 | - |
| TIASM02C01 | tia_summer | TIASM02 | TIASM02L01 | 200 | 10 | - |
| TIASM02C02 | tia_summer | TIASM02 | TIASM02L14 | 500 | 25 | summer_2026 |
| TIAPM02C01 | tia_pool | TIAPM02 | (ver config) | 200 | 10 | - |
| TIAPM02C02 | tia_pool | TIAPM02 | (ver config) | 500 | 25 | (ver config) |

### Endpoint

**POST** `/api/chest/:programId/:chestId/open`

### Recompensas

Al abrir un cofre se otorga:
- XP (via experienceService)
- Tins (via coinsService)
- Cover (si el cofre incluye una, se agrega a `user.unlockedCovers`)

---

## 🎨 6. SISTEMA DE COVERS (PORTADAS)

**Archivo:** `src/config/coversConfig.js`

Las covers son items cosmeticos que los usuarios pueden comprar con Tins y equipar en su perfil.

### Covers Disponibles

| ID | Nombre | Precio (Tins) | Rareza |
|-------|----------|-------------|----------|
| default | Clasica | 0 | common |
| horizon | Horizonte | 200 | uncommon |
| synthwave | Synthwave | 200 | uncommon |
| arena | Escenario | 250 | uncommon |
| rugby | Trinchera | 400 | rare |
| pit_lane | Pit Lane | 450 | rare |
| golden_boot | Botin Dorado | 700 | epic |
| velocity | Velocidad | 750 | epic |
| void_throne | Trono | 800 | epic |
| summer_2026 | Summer 2026 | 1000 | legendary |
| podium | Podio | 1200 | legendary |
| victory | Victoria | 1500 | legendary |

**Total:** 12 covers disponibles.

### Endpoints

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/store/covers` | GET | Lista todas las covers con estado (comprada/equipada) |
| `/api/store/covers/purchase` | POST | Comprar cover con Tins |
| `/api/store/covers/equip` | POST | Equipar cover comprada |

### Modelo de Datos

```javascript
// En userSchema
equippedCoverId: { type: String, default: 'default' },
unlockedCovers: [
  {
    coverId: String,
    unlockedAt: Date,
    source: String  // "purchase", "chest", etc.
  }
]
```

---

## 🛡️ 7. STREAK SHIELD Y RECUPERACION

**Archivo:** `src/services/streakService.js`

### Streak Shield (25 Tins)

Protege la racha diaria si el usuario pierde un dia de actividad.

- Maximo 1 shield activo a la vez
- Si el usuario tiene shield y pierde un dia, el shield se consume y la racha se mantiene
- Se registra `shieldCoveredDate` en el dailyStreak

**Endpoint:** `POST /api/store/items/streak-shield/purchase`

### Streak Recovery (30 Tins)

Permite recuperar una racha perdida dentro de las 24 horas.

- Solo disponible si la racha fue perdida hace menos de 24 horas
- Recupera el conteo de racha previo (`lostCount`)
- Resetea `lostAt` y `lostCount` despues de la recuperacion

**Endpoint:** `POST /api/store/streak/recover`

---

## 💸 8. GASTO DE TINS

### Mecanismos de Gasto Implementados

| Item | Costo (Tins) | Descripcion |
|------|-------------|-------------|
| Covers | 200-1500 | Portadas cosmeticas (variable por rareza) |
| Streak Shield | 25 | Proteccion de racha (max 1) |
| Streak Recovery | 30 | Recuperar racha perdida (ventana 24h) |

### Mecanismos Definidos (No Implementados)

| Item | Costo (Tins) | Descripcion |
|------|-------------|-------------|
| Mystery Box | 400 | Caja misteriosa |
| Retry Instruction | 200 | Reintentar instruccion |

---

## 📊 9. HISTORIAL DE XP

Cada entrada en `user.xpHistory` registra:

```javascript
{
  type: "LESSON_COMPLETED" | "INSTRUCTION_GRADED" | "DAILY_STREAK_BONUS" | "ACHIEVEMENT_UNLOCKED",
  xp: Number,
  date: Date,
  meta: {
    // Información específica del tipo
    lessonId?, programId?, score?, achievementId?, day?
  }
}
```

**Límite:** 1000 entradas (se eliminan las más antiguas)

### totalXp por programa

Cada programa en `user.programs[programId]` ahora incluye un campo `totalXp` que se incrementa atómicamente al ganar XP:

```javascript
user.programs[progId].totalXp += totalGain;
```

Esto evita recalcular el XP total a partir de `xpHistory` en cada consulta (ej: rankings). El campo `xpHistory` sigue registrando cada transacción individual para auditoría.

---

## 🎮 10. FLUJO COMPLETO: Completar Lección

```
Usuario completa lección
  ↓
POST /api/lesson/complete/:programId/:lessonId
  ↓
experienceService.addExperience()
  ├─ Calcular XP = base x (1 + factorDuracion)
  ├─ Detectar daily streak → bonus XP
  ├─ Actualizar level (loop si sube niveles)
  └─ Push a xpHistory
  ↓
coinsService.addCoins()
  ├─ Calcular Tins segun accion
  ├─ Detectar daily streak → bonus Tins
  └─ Push a coinsHistory
  ↓
achievementsService.unlockAchievements()
  ├─ Verificar condiciones de achievements
  ├─ Desbloquear nuevos achievements
  ├─ Otorgar XP + Tins por achievements
  └─ Posible nueva subida de nivel
  ↓
user.save() → MongoDB
  ↓
Response → Frontend
  ↓
Mostrar confetti + toast con achievements
```

---

## 📌 NOTAS TÉCNICAS

### Prevención de Duplicados

```javascript
// Verificación doble en lecciones
const alreadyInCompleted = user.programs[programId].lessonsCompleted
  .some(l => l.lessonId === lessonId)

const alreadyInHistory = user.xpHistory.some(
  entry => entry.type === 'LESSON_COMPLETED' &&
           entry.meta?.lessonId === lessonId
)

if (alreadyInCompleted || alreadyInHistory) {
  return { gained: 0, streakBonus: 0, totalGain: 0 }
}
```

### División por Cero

```javascript
const denominator = experienceNextLevel - experienceCurrentLevel
if (denominator === 0) return 100  // Progreso completo
```

---

**© STANNUM 2026**
