# Sistema de Gamificación - STANNUM Game

El sistema de gamificación de STANNUM Game está diseñado para maximizar el engagement y la retención del aprendizaje mediante mecánicas de juego probadas: experiencia (XP), niveles, logros y rachas diarias.

## 📊 Visión General

El sistema se compone de 4 pilares principales:

1. **XP (Experience Points)** - Puntos ganados al completar actividades
2. **Niveles** - Progresión del 1 al 30 con curva exponencial
3. **Achievements** - 19 logros desbloqueables automáticamente
4. **Daily Streaks** - Bonificación por días consecutivos de actividad

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

## 📈 2. SISTEMA DE NIVELES

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

## 🏆 3. SISTEMA DE ACHIEVEMENTS

**Archivo:** `src/config/achievementsConfig.js`

### Lista Completa de Logros

#### Logros Generales (13 logros)

1. **first_program_acquired** (50 XP) - Compra primer programa
2. **profile_completed** (50 XP) - Completa perfil
3. **first_lesson_completed** (50 XP) - Completa 1 lección
4. **first_instruction_completed** (50 XP) - 1 instrucción calificada
5. **first_module_completed** (100 XP) - Completa módulo entero
6. **module_instructions_completed** (100 XP) - Todas instrucciones de módulo
7. **first_program_completed** (200 XP) - Completa programa entero
8. **level_5** (50 XP) - Alcanza nivel 5
9. **level_10** (100 XP) - Alcanza nivel 10
10. **level_20** (200 XP) - Alcanza nivel 20
11. **streak_3_days** (50 XP) - 3 días consecutivos
12. **streak_7_days** (100 XP) - 7 días consecutivos
13. **streak_30_days** (200 XP) - 30 días consecutivos

#### Logros Específicos de Programas (6 logros)

**TIA:**
- **trenno_ia_joined** (100 XP) - Compra TIA
- **trenno_ia_first_module_completed** (150 XP) - Módulo 1 completo
- **trenno_ia_completed** (300 XP) - TODO TIA completo

**SUMMER:**
- **trenno_ia_summer_joined** (100 XP) - Participa en SUMMER
- **trenno_ia_summer_halfway** (150 XP) - 50% completado
- **trenno_ia_summer_graduate** (500 XP) - TODO SUMMER completo

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

## 📊 4. HISTORIAL DE XP

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

---

## 🎮 FLUJO COMPLETO: Completar Lección

```
Usuario completa lección
  ↓
POST /api/lesson/complete/:programId/:lessonId
  ↓
experienceService.addExperience()
  ├─ Calcular XP = base × (1 + factorDuración)
  ├─ Detectar daily streak → bonus XP
  ├─ Actualizar level (loop si sube niveles)
  └─ Push a xpHistory
  ↓
achievementsService.unlockAchievements()
  ├─ Verificar condiciones de achievements
  ├─ Desbloquear nuevos achievements
  ├─ Otorgar XP por achievements
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

**© STANNUM 2025**
