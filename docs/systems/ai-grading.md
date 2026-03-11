# Sistema de AI Grading - STANNUM Game

El sistema de AI Grading de STANNUM Game utiliza **OpenAI GPT-4o** para evaluar automáticamente las entregas de los estudiantes en las instrucciones prácticas. El sistema inyecta contexto educativo completo, califica con criterios pedagógicos consistentes y otorga feedback constructivo en español.

## 📊 Visión General

El sistema AI Grading:

1. **Recibe entregas** de estudiantes (texto o archivos)
2. **Inyecta contexto** de lecciones previas y consigna
3. **Evalúa automáticamente** usando GPT-4o con prompt pedagógico
4. **Asigna score** 0-100 según dificultad y criterios
5. **Genera feedback** constructivo en español
6. **Recomienda lecciones** para repasar si es necesario
7. **Otorga XP** con bonificaciones por score y velocidad

---

## 🤖 1. ARQUITECTURA DEL SISTEMA

### Archivo Principal

**`src/services/aiGradingService.js`**

### Dependencias

- **OpenAI SDK** - Comunicación con GPT-4o
- **AWS S3 SDK** - Descarga de archivos adjuntos (imágenes)
- **User Model** - Actualización de instrucción y XP
- **Helpers** - Context injection de lecciones

### Función Principal

```javascript
gradeWithAI(userId, programName, instructionId)
```

**Llamada desde:**
- `POST /api/instruction/submit` - En background después de enviar
- `POST /api/instruction/retry` - Reintentar calificación manual

---

## 🔄 2. FLUJO COMPLETO DE CALIFICACIÓN

```
Usuario envía instrucción
  ↓
POST /api/instruction/submit
  ├─ status = "SUBMITTED"
  ├─ Guardar fileUrl o submittedText
  └─ Disparar gradeWithAI() en background (no bloquea respuesta)
  ↓
gradeWithAI() (background)
  ↓
1. Cargar usuario e instrucción desde MongoDB
  ↓
2. Verificar que status = "SUBMITTED"
  ↓
3. Obtener config de instrucción (getInstructionConfig)
  ↓
4. Construir mensaje de evaluación (buildGradingMessage)
   ├─ Consigna completa
   ├─ Pasos, herramientas, dificultad
   ├─ Lecciones previas completas (getPreviousLessons + getLessonContent)
   └─ Entrega del alumno
  ↓
5. Descargar imagen desde S3 (si fileUrl)
   └─ Convertir a base64 para vision
  ↓
6. Llamar OpenAI API
   ├─ Model: gpt-4o
   ├─ SYSTEM_PROMPT (criterios pedagógicos)
   ├─ Content: [imagen (opcional), mensaje]
   └─ Esperar respuesta JSON
  ↓
7. Parsear respuesta JSON
   ├─ score: 0-100
   ├─ observations: string
   └─ referencedLessons: [lessonId]
  ↓
8. Actualizar instrucción en MongoDB
   ├─ status = "GRADED"
   ├─ score, observations, referencedLessons
   └─ reviewedAt = Date.now()
  ↓
9. Calcular y otorgar XP
   ├─ addExperience("INSTRUCTION_GRADED")
   ├─ Bonus por score
   └─ Bonus/penalización por velocidad
  ↓
10. Guardar xpGained en instrucción
  ↓
user.save() → MongoDB
  ↓
Frontend detecta cambio (polling/refresh)
  └─ Mostrar score, feedback, XP ganado
```

### Manejo de Errores

Si ocurre un error en cualquier paso:

```javascript
catch (error) {
  // 1. Log del error
  console.error(`[AI Grading] Error grading ${instructionId}:`, error.message);

  // 2. Marcar instrucción como ERROR
  instruction.status = "ERROR";
  await user.save();

  // 3. Usuario puede reintentar con /retry
}
```

---

## 📋 3. SYSTEM PROMPT (CRITERIOS PEDAGÓGICOS)

**Archivo:** `src/services/aiGradingService.js` → `SYSTEM_PROMPT`

### Rol del Asistente

```
"Sos un asistente corrector automático de entregas de alumnos en la plataforma Stannum Game."
```

### Contexto que Recibe SIEMPRE

1. **Consigna completa:**
   - Título, descripción
   - Dificultad (LOW, MEDIUM, HIGH)
   - Pasos a seguir
   - Tipo de entrega (text o file)
   - Pista de entrega
   - Herramientas
   - Tiempo estimado
   - XP a otorgar

2. **Lecciones relacionadas:**
   - ID de cada lección
   - Título de la lección
   - Temas cubiertos (topics)

3. **Entrega del alumno:**
   - Texto o imagen/archivo

### Criterios Generales

| Criterio | Descripción |
|----------|-------------|
| **Completitud** | ¿Cumplió todos los pasos solicitados? |
| **Calidad** | ¿Hay dedicación y cuidado en el trabajo? |
| **Aplicación** | ¿Aplicó conceptos vistos en las lecciones? |
| **Relevancia** | ¿La entrega responde a lo pedido? |

### Criterios por Dificultad

**LOW:**
- Se espera cumplimiento básico de pasos
- Ser generoso si hay esfuerzo real
- Rango típico: **70-100**

**MEDIUM:**
- Se espera comprensión y aplicación autónoma
- No premiar copiar/pegar sin criterio
- Rango típico: **60-100**

**HIGH:**
- Se espera criterio propio y nivel profesional
- Evaluar síntesis, profundidad, creatividad
- Rango típico: **50-100**

### Escala de Puntaje

| Rango | Interpretación |
|-------|----------------|
| **95-100** | Excelente, ejemplar |
| **85-94** | Muy bien, correcto |
| **70-84** | Bien, con detalles a mejorar |
| **60-69** | Aceptable, mínimo esperado |
| **40-59** | Insuficiente, faltan partes importantes |
| **0-39** | No cumple o no corresponde a la consigna |

### Estructura del Feedback (Observations)

**Obligatorio en este orden:**

1. **Reconocimiento** (1 oración)
   - Mencionar qué hizo bien
   - Motivar sin exagerar

2. **Justificación del puntaje** (1-2 oraciones)
   - **CRÍTICO:** Explicar específicamente por qué NO obtuvo 100
   - Qué faltó, qué podría mejorar, qué no cumplió del todo
   - El alumno NECESITA saber exactamente qué le faltó

3. **Recomendación** (1 oración, si corresponde)
   - Acción concreta para mejorar
   - Referenciar lección si debe repasar

**Reglas:**
- Tono profesional, cercano, directo (tutear)
- 2-4 oraciones, un solo párrafo
- No usar listas ni bullets
- Si score = 100, solo felicitar brevemente

### Ejemplo de Evaluación (del SYSTEM_PROMPT)

**Instrucción:** "Organiza tu carpeta principal" (Dificultad: LOW)

**Entrega:** Captura mostrando Drive con carpeta "Mi Empresa". Subcarpetas: Marketing, Ventas, Administración, RRHH, Operaciones. Carpetas compartidas. No se ve app instalada en PC/celular.

**Evaluación:**
```json
{
  "score": 80,
  "observations": "Muy buen trabajo con la estructura de carpetas. Tenés las áreas principales bien definidas y ya compartiste el acceso con tu equipo. Solo te faltaron dos pasos: descargar la aplicación de Drive en tu computadora y en tu celular, que es importante para tener los archivos sincronizados y accesibles en todo momento.",
  "referencedLessons": []
}
```

**Por qué es correcto:**
- ✅ Reconoce lo bien hecho
- ✅ Explica QUÉ faltó para 100 (apps de PC/celular)
- ✅ Da razón concreta (sincronización)
- ✅ Tono directo, profesional, motivador
- ✅ Score 80: cumplió mayoría pero faltaron pasos menores

---

## 🧩 4. CONSTRUCCIÓN DEL MENSAJE DE EVALUACIÓN

**Función:** `buildGradingMessage(config, instruction, programName, instructionId)`

### Estructura del Mensaje

```markdown
Corrige la siguiente entrega de un alumno.

## Instrucción
- **Título**: Organiza tu carpeta principal
- **Descripción**: En esta instrucción vas a organizar...
- **Dificultad**: LOW
- **Tipo de entrega**: file
- **Pista de entrega**: Sube una imagen clara...
- **Herramientas**: Google Drive, ChatGPT
- **Pasos**:
  1. Crear una cuenta en Google Drive...
  2. Descargar Google Drive en su computadora...
  3. ...

## Lecciones que el alumno vio antes de esta instrucción
El alumno completó las siguientes 5 lecciones antes de realizar esta instrucción...

### TIAM01L01: El Mapa Definitivo para Dominar la IA
**Temas cubiertos**:
- Cómo pasar de usuario casual a 'piloto de Fórmula 1' de la IA
- Los 5 Dominios de la IA
- ...

### TIAM01L02: El 'Motor' de la IA al Descubierto
**Temas cubiertos**:
- Deep Learning
- GPT
- ...

## Entrega del alumno
**Tipo**: Archivo (imagen adjunta arriba)
IMPORTANTE: Analiza detalladamente el contenido de la imagen adjunta...

Responde ÚNICAMENTE con el JSON en el formato especificado.
```

### Inyección de Contexto de Lecciones

**Helpers utilizados:**

1. **`getPreviousLessons(programName, instructionId)`**
   - Calcula automáticamente TODAS las lecciones que el estudiante vio antes de la instrucción
   - Incluye módulos anteriores completos + módulo actual hasta `afterLessonId`

2. **`getMultipleLessonsContent(programName, lessonIds)`**
   - Obtiene título y topics de cada lección desde `lessons_catalog.json`
   - Retorna array de objetos `{ id, title, topics: [...] }`

**Lógica:**

```javascript
const previousLessonIds = getPreviousLessons(programName, instructionId);
// Ej: ["TIAM01L01", "TIAM01L02", ..., "TIAM01L05"]

const lessons = getMultipleLessonsContent(programName, previousLessonIds);
// Ej: [{ id: "TIAM01L01", title: "...", topics: [...] }, ...]

if (lessons.length > 0) {
  message += `\n## Lecciones que el alumno vio antes de esta instrucción\n`;
  message += `El alumno completó las siguientes ${lessons.length} lecciones...`;

  lessons.forEach((lesson) => {
    message += `### ${lesson.id}: ${lesson.title}\n`;
    message += `**Temas cubiertos**:\n`;
    lesson.topics.forEach(topic => {
      message += `- ${topic}\n`;
    });
  });
}
```

**Beneficio:** El AI tiene contexto completo de lo que el estudiante aprendió, permitiendo:
- Evaluar si aplicó los conceptos enseñados
- Recomendar lecciones específicas si falla en algún tema
- Ajustar criterios según conocimiento previo

---

## 🖼️ 5. MANEJO DE ARCHIVOS (IMÁGENES)

### Descarga desde S3

```javascript
if (instruction.fileUrl) {
  // 1. Extraer S3 key de la URL
  const s3Key = instruction.fileUrl.replace(`${process.env.AWS_S3_BASE_URL}/`, "");

  // 2. Descargar archivo desde S3
  const s3Response = await s3Client.send(new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: s3Key,
  }));

  // 3. Leer stream a Buffer
  const chunks = [];
  for await (const chunk of s3Response.Body) {
    chunks.push(chunk);
  }
  const fileBuffer = Buffer.concat(chunks);

  // 4. Convertir a base64 data URL
  const contentType = s3Response.ContentType || "image/jpeg";
  const base64 = fileBuffer.toString("base64");
  const dataUrl = `data:${contentType};base64,${base64}`;

  // 5. Agregar a content array para vision
  contentArray.push({
    type: "input_image",
    image_url: dataUrl,
  });
}
```

### Vision con GPT-4o

GPT-4o puede analizar imágenes directamente. El mensaje incluye:

```
IMPORTANTE: Analiza detalladamente el contenido de la imagen adjunta.
Describe qué ves en la imagen y evalúa si cumple con lo que pide la instrucción.
Si la imagen NO muestra lo que se pide, el puntaje debe ser bajo.
NO asumas que la entrega es correcta sin verificar el contenido real de la imagen.
```

**Esto previene que el AI asuma que la imagen es correcta sin analizarla realmente.**

---

## 📞 6. LLAMADA A OPENAI API

**Modelo:** `gpt-4o`

**Método:** `responses.create()` (Batch API para estructurar mejor)

### Request

```javascript
const response = await openai.responses.create({
  model: "gpt-4o",
  instructions: SYSTEM_PROMPT,  // Criterios pedagógicos
  input: [
    {
      role: "user",
      content: [
        {
          type: "input_image",
          image_url: "data:image/jpeg;base64,..."  // Solo si hay archivo
        },
        {
          type: "input_text",
          text: "Corrige la siguiente entrega..."  // Mensaje construido
        }
      ]
    }
  ],
});
```

### Response

```javascript
{
  output: [
    {
      content: [
        {
          text: '{"score": 85, "observations": "...", "referencedLessons": []}'
        }
      ]
    }
  ]
}
```

### Parsing de Respuesta

**Función:** `parseGradingResponse(responseText)`

```javascript
const parseGradingResponse = (responseText) => {
  // 1. Extraer JSON (por si hay texto adicional)
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No se encontró JSON");

  // 2. Parsear
  const parsed = JSON.parse(jsonMatch[0]);

  // 3. Validar y sanitizar
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  const observations = String(parsed.observations || "").slice(0, 500);
  const referencedLessons = Array.isArray(parsed.referencedLessons)
    ? parsed.referencedLessons
    : [];

  return { score, observations, referencedLessons };
};
```

**Validaciones:**
- Score: 0-100, redondeado
- Observations: máximo 500 caracteres
- ReferencedLessons: array o vacío

---

## 💎 7. CÁLCULO DE XP POR INSTRUCCIÓN

**Archivo:** `src/helpers/experienceHelper.js` → `computeInstructionXP()`

### Fórmula

```javascript
XP_TOTAL = XP_BASE + BONUS_VELOCIDAD + BONUS_SCORE
```

### Parámetros

| Parámetro | Fuente |
|-----------|--------|
| `rewardXP` | Configuración de instrucción |
| `score` | Resultado de AI grading (0-100) |
| `timeTakenSec` | `submittedAt - startDate` |
| `estimatedTimeSec` | Configuración de instrucción |

### 1. XP Base

Configurado en `programs/index.js`:

```javascript
{
  id: "TIAM01I01",
  rewardXP: 600,  // XP base
  estimatedTimeSec: 900  // 15 minutos
}
```

### 2. Bonificación por Velocidad

**Archivo:** `src/config/xpConfig.js`

```javascript
INSTRUCTION: {
  SPEED_BONUS: {
    THRESHOLD_FAST: 0.7,   // <= 70% del tiempo estimado
    BONUS_FAST: 0.30,      // +30% del base
    THRESHOLD_OK: 1.0,     // <= 100% del tiempo estimado
    BONUS_OK: 0.10,        // +10% del base
  }
}
```

**Lógica:**

```javascript
const ratio = timeTakenSec / estimatedTimeSec;

if (ratio <= 0.7) {
  xp += rewardXP * 0.30;  // Rápido: +30%
} else if (ratio <= 1.0) {
  xp += rewardXP * 0.10;  // Normal: +10%
}
// Si ratio > 1.0: sin bonus
```

**Ejemplo:**
```
rewardXP = 600
estimatedTimeSec = 900 (15 min)
timeTakenSec = 600 (10 min)

ratio = 600 / 900 = 0.67 <= 0.7 ✅
BONUS_VELOCIDAD = 600 × 0.30 = 180 XP
```

### 3. Bonificación por Score

**Fórmula:**

```javascript
SCORE_BONUS_FACTOR = 0.5  // 50% del base como máximo

BONUS_SCORE = rewardXP × 0.5 × (score / 100)
```

**Ejemplos:**

| Score | Bonus (base 600) |
|-------|------------------|
| 100 | 600 × 0.5 × 1.0 = **300 XP** |
| 90 | 600 × 0.5 × 0.9 = **270 XP** |
| 80 | 600 × 0.5 × 0.8 = **240 XP** |
| 50 | 600 × 0.5 × 0.5 = **150 XP** |
| 0 | 0 XP |

### Ejemplo Completo

```
Instrucción: TIAM01I01
  rewardXP = 600
  estimatedTimeSec = 900 (15 min)

Estudiante:
  timeTakenSec = 600 (10 min)
  score = 90 (AI grading)

Cálculo:
  XP_BASE = 600

  ratio = 600 / 900 = 0.67
  BONUS_VELOCIDAD = 600 × 0.30 = 180 XP

  BONUS_SCORE = 600 × 0.5 × 0.9 = 270 XP

  XP_TOTAL = 600 + 180 + 270 = 1050 XP

Límites:
  MIN_XP = 50
  MAX_XP = 3000

  XP_FINAL = clamp(1050, 50, 3000) = 1050 XP ✅
```

### Otorgamiento de XP

Después de calificar:

```javascript
const xpResult = await addExperience(user, "INSTRUCTION_GRADED", {
  programId: programName,
  instructionId,
  rewardXP: info.rewardXP,
  estimatedTimeSec: info.estimatedTimeSec,
  score: instruction.score,
  timeTakenSec,
});

instruction.xpGained = xpResult.gained;
```

---

## 🔁 8. REINTENTO DE CALIFICACIÓN

Si la calificación falla (`status = "ERROR"`), el usuario puede reintentar.

**Endpoint:** `POST /api/instruction/retry/:programName/:instructionId`

**Lógica:**

```javascript
const retryGrading = async (req, res) => {
  // 1. Verificar que status = "ERROR"
  if (instruction.status !== "ERROR") {
    return res.status(400).json(getError("INSTRUCTION_NOT_IN_ERROR"));
  }

  // 2. Cambiar status de vuelta a SUBMITTED
  instruction.status = "SUBMITTED";
  await user.save();

  // 3. Reintentar AI grading en background
  gradeWithAI(userId, programName, instructionId).catch(...);

  return res.status(200).json({
    success: true,
    message: "Reintentando corrección automática."
  });
};
```

---

## 📊 9. MODELO DE DATOS - INSTRUCCIÓN

**Archivo:** `src/models/userModel.js` → `instructionSchema`

```javascript
{
  instructionId: String,           // "TIAM01I01"
  startDate: Date,                 // Cuando se inició
  submittedAt: Date,               // Cuando se envió
  reviewedAt: Date,                // Cuando AI terminó de calificar
  score: Number (0-100),           // Score de AI
  xpGrantedAt: Date,               // Cuando se otorgó XP
  xpGained: Number,                // XP total ganado
  observations: String (max 500),  // Feedback de AI
  referencedLessons: [String],     // IDs de lecciones a repasar
  fileUrl: String,                 // S3 URL si deliverable = file
  submittedText: String (max 5000), // Texto si deliverable = text
  status: "IN_PROCESS" | "SUBMITTED" | "GRADED" | "ERROR"
}
```

### Estados

| Estado | Descripción |
|--------|-------------|
| **IN_PROCESS** | Instrucción iniciada pero no enviada |
| **SUBMITTED** | Enviada, esperando calificación AI |
| **GRADED** | Calificada exitosamente por AI |
| **ERROR** | Error en calificación, puede reintentar |

---

## 🎯 10. CASOS ESPECIALES

### Instrucción de Texto

Si `deliverableType = "text"`:

```javascript
// En buildGradingMessage:
message += `## Entrega del alumno\n`;
message += `**Tipo**: Texto\n**Contenido**:\n${instruction.submittedText}\n`;
```

No se adjunta imagen. GPT-4o evalúa solo el texto.

### Instrucción sin Lecciones Previas

Si la instrucción está al inicio del programa:

```javascript
const previousLessonIds = getPreviousLessons(programName, instructionId);
// Retorna: []

if (previousLessonIds.length > 0) {
  // ... inyectar lecciones
}
// Si length = 0, no se inyecta sección de lecciones
```

### Race Conditions

El sistema previene doble calificación:

```javascript
// Antes de actualizar:
const freshUser = await User.findById(userId);
const freshInstruction = freshProgram?.instructions?.find(...);

// Si ya fue calificada mientras procesábamos, NO actualizar
if (!freshInstruction || freshInstruction.status === "GRADED") {
  return grading;  // Retornar sin guardar
}
```

---

## 📈 11. MÉTRICAS Y MONITOREO

### Logs

Todos los errores se logean con contexto:

```javascript
console.error(`[AI Grading] Error grading ${instructionId} for ${userId}:`, error.message);
```

### Validaciones de Seguridad

1. **Tamaño de archivo:** Verificado antes de permitir submit
2. **Formato de archivo:** Validado contra `acceptedFormats`
3. **Longitud de texto:** Máximo 5000 caracteres
4. **Observations:** Truncadas a 500 caracteres
5. **Score:** Clamped a 0-100

---

## 🔐 12. SEGURIDAD

### Validación de Estado

```javascript
// Solo se puede calificar si está SUBMITTED
if (instruction.status !== "SUBMITTED") {
  throw new Error(`Estado inválido: ${instruction.status}`);
}
```

### S3 Security

- Archivos subidos con presigned URLs (300s expiration)
- Keys únicas: `instructions/{userId}/{instructionId}/{timestamp}{ext}`
- Bucket privado, solo accesible por backend

### Prompt Injection Prevention

El SYSTEM_PROMPT incluye:

```
REGLAS ESTRICTAS
- Nunca salir del formato JSON.
- Nunca inventar información.
- No explicar el proceso interno de evaluación.
```

El parsing extrae solo el JSON, ignorando cualquier texto adicional.

---

## 📌 NOTAS TÉCNICAS

### Background Processing

AI Grading NO bloquea la respuesta del endpoint submit:

```javascript
gradeWithAI(userId, programName, instructionId).catch(err => {
  console.error(`[AI Grading] Error en background:`, err.message);
});

// Respuesta inmediata al usuario
return res.status(200).json({
  success: true,
  message: "Instrucción entregada correctamente."
});
```

El frontend debe hacer polling o refresh para detectar cuando termine.

### Idempotencia

Si se llama `gradeWithAI()` múltiples veces para la misma instrucción:
- Solo se procesa si `status = "SUBMITTED"`
- Si ya está `GRADED`, retorna sin hacer nada
- Previene doble XP o sobrescritura de resultados

### Timeouts

No hay timeout explícito en la llamada a OpenAI. El SDK maneja timeouts internamente.

Si la llamada tarda mucho o falla:
- Status = "ERROR"
- Usuario puede reintentar manualmente

---

**© STANNUM 2026**
