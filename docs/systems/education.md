# Sistema Educativo - STANNUM Game

El sistema educativo de STANNUM Game está diseñado para ofrecer una experiencia de aprendizaje estructurada y progresiva mediante **programas educativos**, **lecciones en video** e **instrucciones prácticas** que permiten a los estudiantes aplicar lo aprendido.

## 📊 Visión General

El sistema se estructura en 4 niveles jerárquicos:

1. **Programs** - Cursos completos (TIA, TMD, TIA_SUMMER)
2. **Sections** - Agrupaciones temáticas de módulos (actualmente no implementadas en código, solo conceptuales)
3. **Modules** - Unidades de aprendizaje con lecciones e instrucciones
4. **Activities** - Lecciones (videos) e Instrucciones (tareas prácticas)

---

## 🎓 1. PROGRAMAS DISPONIBLES

### Configuración

**Archivo:** `src/config/programs/index.js`

### Lista de Programas

| ID | Nombre | Descripción |
|-----|---------|-------------|
| **tia** | TRENNO IA | Programa principal sobre inteligencia artificial |
| **tia_summer** | TRENNO IA SUMMER | Versión especial del programa TIA |
| **tmd** | TRENNO MARKETING DIGITAL | Programa de marketing digital |

### Estructura de un Programa

```javascript
{
  id: "tia",
  modules: [
    {
      id: "TIAM01",
      lessons: [...],
      instructions: [...]
    }
  ]
}
```

---

## 📚 2. MÓDULOS

Cada programa está dividido en módulos temáticos.

### Ejemplo: TIA (TRENNO IA)

| Módulo | ID | Tema |
|--------|-----|------|
| Módulo 1 | TIAM01 | Dominio de PROMPTS |
| Módulo 2 | TIAM02 | [Contenido adicional] |

### Ejemplo: TIA_SUMMER

| Módulo | ID | Tema |
|--------|-----|------|
| Módulo 1 | TIASM01 | Dominio de PROMPTS |
| Módulo 2 | TIASM02 | [Contenido adicional] |

### Ejemplo: TMD

| Módulo | ID | Tema |
|--------|-----|------|
| Módulo 1 | TMDM01 | [Contenido de marketing digital] |

---

## 🎬 3. LECCIONES (VIDEOS)

### ¿Qué es una Lección?

Las lecciones son **videos educativos** que enseñan conceptos específicos. Cada lección tiene:

- **ID único** (ej: `TIAM01L01`)
- **Título** descriptivo
- **Duración** en segundos
- **Topics** (temas cubiertos)

### Catálogo de Lecciones

**Archivo:** `src/config/lessons_catalog.json`

Contiene el catálogo completo de todas las lecciones con sus temas detallados.

#### Estructura:

```json
{
  "programs": [
    {
      "programId": "tia",
      "programName": "TRENNO IA",
      "modules": [
        {
          "moduleId": "TIAM01",
          "moduleName": "Dominio de PROMPTS",
          "moduleDescription": "Aprende a dominar y redactar PROMPTs como un profesional.",
          "lessons": [
            {
              "id": "TIAM01L01",
              "title": "El Mapa Definitivo para Dominar la IA",
              "durationSeconds": 347,
              "topics": [
                "Cómo pasar de usuario casual a 'piloto de Fórmula 1' de la IA",
                "Los 5 Dominios de la IA",
                "Objetivos prácticos"
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Ejemplo: Módulo 1 de TIA

**TIAM01 - Dominio de PROMPTS**

1. **TIAM01L01** (347s) - El Mapa Definitivo para Dominar la IA
2. **TIAM01L02** (347s) - El 'Motor' de la IA al Descubierto
3. **TIAM01L03** (555s) - El Volante de la IA: Diseño de Prompts
4. **TIAM01L04** (497s) - Ingeniería de Instrucciones
5. **TIAM01L05** (585s) - La Fórmula Maestra: Estructura A-F
6. **TIAM01L06** (434s) - Dominio de la Cabina: Tour por ChatGPT
7. **TIAM01L07** (582s) - Ejercicio: 'UN LIBRO'

### Tracking de Progreso

**Modelo:** `userModel.js` → `programs.[programId].lessonsCompleted`

```javascript
lessonsCompleted: [
  {
    lessonId: "TIAM01L01",
    viewedAt: Date
  }
]
```

### Last Watched Lesson

Sistema de "Continuar viendo" que guarda la última lección vista:

```javascript
lastWatchedLesson: {
  lessonId: "TIAM01L03",
  viewedAt: Date,
  currentTime: 245  // segundos
}
```

**Endpoint:**
- `PATCH /api/lesson/lastwatched/:programName/:lessonId`

---

## 📝 4. INSTRUCCIONES (TAREAS PRÁCTICAS)

### ¿Qué es una Instrucción?

Las instrucciones son **actividades prácticas** que permiten al estudiante aplicar lo aprendido en las lecciones. Requieren la entrega de un trabajo (archivo o texto) que será evaluado automáticamente por IA.

### Configuración de una Instrucción

**Archivo:** `src/config/programs/index.js`

```javascript
{
  id: "TIAM01I01",
  title: "Organiza tu carpeta principal",
  description: "En esta instrucción vas a organizar...",
  deliverableHint: "Sube una imagen clara...",
  tools: ["Google Drive", "ChatGPT"],
  steps: [
    "Crear una cuenta en Google Drive...",
    "Descargar Google Drive en tu computadora...",
  ],
  rewardXP: 600,                    // XP base al completar
  estimatedTimeSec: 900,            // Tiempo estimado
  difficulty: "LOW",                // LOW, MEDIUM, HIGH
  afterLessonId: "TIAM01L05",       // Lección que desbloquea
  requiredActivityId: null,         // Instrucción previa requerida
  deliverableType: "file",          // "file" o "text"
  acceptedFormats: [".jpg", ".jpeg", ".png"],
  maxFileSizeMB: 15
}
```

### Parámetros Clave

| Campo | Descripción |
|-------|-------------|
| **afterLessonId** | ID de la lección que desbloquea esta instrucción |
| **requiredActivityId** | ID de instrucción previa que debe estar completada |
| **deliverableType** | Tipo de entrega: `"file"` o `"text"` |
| **acceptedFormats** | Formatos de archivo permitidos |
| **rewardXP** | XP base que se otorga (bonificado por score y velocidad) |
| **estimatedTimeSec** | Tiempo estimado de completado (usado para bonos) |

### Estados de una Instrucción

| Estado | Descripción |
|--------|-------------|
| **PENDING** | No ha sido iniciada (solo frontend, no existe en backend) |
| **IN_PROCESS** | Iniciada pero no entregada |
| **SUBMITTED** | Entregada, esperando calificación AI |
| **GRADED** | Calificada con score y feedback |
| **ERROR** | Error en calificación automática |

### Ciclo de Vida de una Instrucción

```
PENDING (frontend only)
  ↓ POST /api/instruction/start
IN_PROCESS
  ↓ POST /api/instruction/submit
SUBMITTED
  ↓ AI Grading (background)
GRADED ✅ / ERROR ❌
  ↓ (si ERROR)
  POST /api/instruction/retry
SUBMITTED (reintento)
```

---

## 🔓 5. SISTEMA DE DESBLOQUEO

### Desbloqueo de Lecciones

**Regla:** Una lección está bloqueada si existe una instrucción con `afterLessonId` anterior a ella y esa instrucción NO ha sido enviada.

**Lógica en:** `src/controllers/lessonController.js` → `markLessonAsCompleted()`

```javascript
// Ejemplo: TIAM01I01 tiene afterLessonId = "TIAM01L05"
// Por lo tanto, TIAM01L06 y TIAM01L07 están bloqueadas hasta enviar TIAM01I01
```

**Verificación:**
```javascript
for (const instr of (mod.instructions || [])) {
  const afterIndex = mod.lessons.findIndex(l => l.id === instr.afterLessonId);
  if (lessonIndex > afterIndex) {
    const userInstr = userProgram.instructions.find(i => i.instructionId === instr.id);
    const isSubmitted = userInstr && ["SUBMITTED", "GRADED"].includes(userInstr.status);
    if (!isSubmitted) {
      return res.status(403).json(getError("LESSON_BLOCKED_BY_INSTRUCTION"));
    }
  }
}
```

### Desbloqueo de Instrucciones

**Condiciones:**

1. **Lección previa completada** (`afterLessonId`)
2. **Instrucción previa completada** (`requiredActivityId`) (opcional)

**Lógica en:** `src/controllers/instructionController.js` → `startInstruction()`

```javascript
// 1. Verificar lección previa
if (config.afterLessonId) {
  const afterLessonCompleted = program.lessonsCompleted.some(
    l => l.lessonId === config.afterLessonId
  );
  if (!afterLessonCompleted) {
    return res.status(403).json(getError("INSTRUCTION_NOT_AVAILABLE"));
  }
}

// 2. Verificar instrucción previa (si existe)
if (config.requiredActivityId) {
  const requiredInstr = program.instructions.find(
    i => i.instructionId === config.requiredActivityId
  );
  const isCompleted = requiredInstr && ["SUBMITTED", "GRADED"].includes(requiredInstr.status);
  if (!isCompleted) {
    return res.status(403).json(getError("INSTRUCTION_NOT_AVAILABLE"));
  }
}
```

---

## 📋 6. MODELO DE DATOS - USUARIO

**Archivo:** `src/models/userModel.js`

### Schema de Programa

```javascript
programs: {
  tia: {
    isPurchased: Boolean,
    acquiredAt: Date,
    instructions: [
      {
        instructionId: String,
        startDate: Date,
        submittedAt: Date,
        reviewedAt: Date,
        score: Number (0-100),
        xpGrantedAt: Date,
        xpGained: Number,
        observations: String,
        referencedLessons: [String],
        fileUrl: String,
        submittedText: String,
        status: "IN_PROCESS" | "SUBMITTED" | "GRADED" | "ERROR"
      }
    ],
    lessonsCompleted: [
      {
        lessonId: String,
        viewedAt: Date
      }
    ],
    lastWatchedLesson: {
      lessonId: String,
      viewedAt: Date,
      currentTime: Number
    },
    tests: [...],
    productKey: ObjectId
  },
  tia_summer: {...},
  tmd: {...}
}
```

---

## 🚀 7. FLUJO COMPLETO: Completar Lección

```
Usuario completa video
  ↓
POST /api/lesson/complete/:programName/:lessonId
  ↓
Validaciones:
  ├─ ¿Usuario autenticado?
  ├─ ¿Programa existe y está comprado?
  ├─ ¿Lección no completada previamente?
  ├─ ¿Lección no bloqueada por instrucción?
  └─ ¿Lección existe en config?
  ↓
✅ Agregar a lessonsCompleted
  ↓
experienceService.addExperience()
  ├─ Calcular XP por lección
  ├─ Detectar daily streak
  └─ Actualizar nivel
  ↓
achievementsService.unlockAchievements()
  ├─ Verificar logros desbloqueables
  └─ Otorgar XP por achievements
  ↓
user.save() → MongoDB
  ↓
Response:
{
  success: true,
  gained: XP,
  streakBonus: XP,
  totalGain: XP,
  achievementsUnlocked: [...]
}
```

---

## 📤 8. FLUJO COMPLETO: Enviar Instrucción

```
Usuario completa instrucción práctica
  ↓
POST /api/instruction/start/:programName/:instructionId
  ├─ Verificar desbloqueo (afterLessonId, requiredActivityId)
  ├─ Agregar a user.programs[programName].instructions[]
  └─ status = "IN_PROCESS"
  ↓
Usuario trabaja en la tarea
  ↓
(Opcional) GET /api/instruction/presigned-url
  ├─ Generar URL firmada S3
  └─ Subir archivo directamente a S3
  ↓
POST /api/instruction/submit/:programName/:instructionId
  ├─ Validar entregable (file o text)
  ├─ Verificar tamaño (maxFileSizeMB)
  ├─ Guardar fileUrl o submittedText
  ├─ status = "SUBMITTED"
  └─ Disparar gradeWithAI() en background
  ↓
AI Grading Service (background)
  ├─ Construir prompt con contexto de lecciones previas
  ├─ Llamar OpenAI GPT-4o
  ├─ Recibir score (0-100) y feedback
  ├─ status = "GRADED" / "ERROR"
  └─ Calcular y otorgar XP (si GRADED)
  ↓
Frontend polling / notificación
  ├─ Mostrar score + feedback
  └─ Mostrar XP ganado
```

### Endpoints de Instrucciones

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/instruction/start/:programName/:instructionId` | POST | Inicia una instrucción |
| `/api/instruction/presigned-url/:programName/:instructionId` | GET | Genera URL firmada S3 para subir archivo |
| `/api/instruction/submit/:programName/:instructionId` | POST | Envía la instrucción completada |
| `/api/instruction/retry/:programName/:instructionId` | POST | Reintenta calificación AI en caso de ERROR |

---

## 🔍 9. HELPERS EDUCATIVOS

### getPreviousLessons

**Archivo:** `src/helpers/getPreviousLessons.js`

Calcula automáticamente TODAS las lecciones que el estudiante debió haber visto antes de una instrucción:

```javascript
const previousLessons = getPreviousLessons("tia", "TIAM01I01");
// Retorna: ["TIAM01L01", "TIAM01L02", "TIAM01L03", "TIAM01L04", "TIAM01L05"]
```

**Lógica:**
1. Encuentra el módulo de la instrucción
2. Agrega TODAS las lecciones de módulos anteriores
3. Agrega lecciones del módulo actual hasta `afterLessonId`

### getLessonContent

**Archivo:** `src/helpers/getLessonContent.js`

Obtiene el contenido completo de una lección (título + topics) desde `lessons_catalog.json`:

```javascript
const lesson = getLessonContent("tia", "TIAM01L01");
// Retorna:
{
  id: "TIAM01L01",
  title: "El Mapa Definitivo para Dominar la IA",
  topics: [
    "Cómo pasar de usuario casual a 'piloto de Fórmula 1' de la IA",
    "Los 5 Dominios de la IA",
    ...
  ]
}
```

**Uso:** Inyectar contexto educativo al AI Grading Service.

### getInstructionConfig

**Archivo:** `src/helpers/getInstructionConfig.js`

Obtiene la configuración completa de una instrucción desde `programs/index.js`:

```javascript
const config = getInstructionConfig("tia", "TIAM01I01");
// Retorna: { id, title, description, rewardXP, ... }
```

---

## 📊 10. MÉTRICAS DE PROGRESO

### Progreso de Módulo

Calculado en frontend basado en:

```typescript
const totalLessons = module.lessons.length;
const completedLessons = user.programs[programId].lessonsCompleted.filter(
  l => module.lessons.some(ml => ml.id === l.lessonId)
).length;

const progress = (completedLessons / totalLessons) * 100;
```

### Progreso de Programa

```typescript
const allLessons = program.modules.flatMap(m => m.lessons);
const completedLessons = user.programs[programId].lessonsCompleted.length;

const progress = (completedLessons / allLessons.length) * 100;
```

---

## 🔐 11. CONTROL DE ACCESO

### Verificación de Compra

Todos los endpoints verifican:

```javascript
const program = user.programs?.[programName];
if (!program || !program.isPurchased) {
  return res.status(403).json(getError("PROGRAM_NOT_PURCHASED"));
}
```

### Product Keys

**Modelo:** `ProductKey`

Permite comprar programas mediante códigos:

```javascript
{
  code: "STANNUM-2025-TIA-001",
  product: "tia",
  team: "equipo_alpha" || "no_team",
  used: false,
  usedBy: null,
  usedAt: null
}
```

**Endpoint:** `POST /api/product-key/activate`

Al activar:
1. Marca `isPurchased = true` en `user.programs[product]`
2. Asigna `acquiredAt = Date.now()`
3. Marca la key como `used = true`
4. Agrega usuario al equipo (si corresponde)

---

## 📌 NOTAS TÉCNICAS

### Prevención de Duplicados - Lecciones

```javascript
// Doble verificación para evitar doble XP
const isAlreadyCompleted = userProgram.lessonsCompleted.some(
  l => l.lessonId === lessonId
);

const alreadyGivenXP = user.xpHistory.some(
  entry => entry.type === 'LESSON_COMPLETED' &&
           entry.meta?.lessonId === lessonId
);

if (isAlreadyCompleted || alreadyGivenXP) {
  return res.status(400).json(getError("VALIDATION_LESSON_ALREADY_COMPLETED"));
}
```

### Prevención de Duplicados - Instrucciones

```javascript
// Solo se puede iniciar una vez
const exists = program.instructions.find(i => i.instructionId === instructionId);
if (exists) {
  return res.status(400).json(getError("INSTRUCTION_ALREADY_STARTED"));
}
```

### Instrucciones Secuenciales

Ejemplo de módulo con 2 instrucciones que deben hacerse en orden:

```javascript
{
  id: "TIAM02I01",
  afterLessonId: "TIAM02L05",
  requiredActivityId: null  // Primera instrucción
},
{
  id: "TIAM02I02",
  afterLessonId: "TIAM02L05",
  requiredActivityId: "TIAM02I01"  // Requiere completar TIAM02I01 primero
}
```

---

**© STANNUM 2025**
