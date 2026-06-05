# Plan de Sistema: IA Entrenador / Consultor (Chatbot RAG) — STANNUM Game

> Repos: `stannum-game-backend-v2` (API) + `stannum-game-frontend-v2` (Next.js 16).
> Rama: `feat/ai-trainer-transcripts`. Última actualización: 2026-06-05.

---

## 0. Estado actual / Progreso (fuente de verdad — actualizar acá)

**Backend RAG completo, probado y auditado. Falta la UI (Fase 4) y métricas (Fase 5).**

### ✅ HECHO
- **Fase 1 — Extracción** ✅ `src/models/transcriptModel.js`, `src/scripts/extractTranscripts.js`.
  HLS público (sin creds) → 25 transcripts en colección `transcripts` (rawText + segments con
  timestamps). Idempotente con diff. Auditada + corregida (X-TIMESTAMP-MAP order-agnostic, retry).
- **Fase 1.5 — Limpieza** ✅ `src/config/transcriptGlossary.json` + `src/scripts/cleanTranscripts.js`.
  Glosario (STANNUM/Trenno/Merlini) + pasada LLM (gpt-4o-mini) → `fullText` limpio. 25/25.
- **Fase 2 — Indexado RAG** ✅ `src/scripts/indexTranscripts.js` + `src/helpers/retrieveChunks.js`.
  Chunking por oraciones sobre `fullText` + timestamps segment-anchored → **25/304 chunks** con
  embeddings (`text-embedding-3-small`). Retrieval coseno en memoria, gate por programa, boost
  lección/módulo, piso de score. `indexMeta` versionado. Auditada + corregida.
- **Fase 3 — Endpoint chatbot** ✅ `src/services/trainerService.js`, `src/controllers/trainerController.js`,
  `src/routes/trainerRoutes.js`, `trainerLimiter`, montado en `index.js` + warmup al boot.
  `POST /api/trainer/ask` (gating por acceso, RAG + gpt-4o, citas, guardarraíl anti-jailbreak) y
  `GET /api/trainer/health` (admin). Auditada + endurecida (history no-confiable, lessonId validado,
  fail-closed, timeout/429-503, kill-switch `TRAINER_ENABLED`). **Validado end-to-end** contra prod.

### ⬜ FALTA
- **Fase 4 — UI (frontend)** ⬜ panel de chat en la vista de lección (`LessonPageContent.tsx`):
  chat en columna derecha, miniaturas abajo, drawer en mobile. `trainerChatStore.ts` (zustand),
  `services/trainer.ts` (cliente), citas que saltan al minuto (reusar `?t=` del player).
- **Streaming SSE** ⬜ el endpoint hoy es no-streaming. Falta variante SSE (service generador +
  controller `text/event-stream` + cliente `fetch`/ReadableStream con su propio refresh-on-401).
- **Fase 5 — Pulido/métricas** ⬜ persistir conversaciones (`trainerConversations`), feedback 👍/👎,
  métricas de uso (qué lecciones generan más dudas), recarga de índice en caliente.
- **Pendientes menores** ⬜ M03 sin `topics` en `lessons_catalog.json` (se limpió sin contexto);
  endpoint para recargar el índice RAG sin reiniciar el server.

### Cómo re-correr el pipeline de ingesta (idempotente, dry-run por default)
```
node src/scripts/extractTranscripts.js --execute        # Fase 1
node src/scripts/cleanTranscripts.js   --execute        # Fase 1.5
node src/scripts/indexTranscripts.js   --execute        # Fase 2
node src/helpers/retrieveChunks.js "¿qué es un LLM?" --program=tia   # test retrieval
```

---

## 1. Objetivo

Sumar un **chatbot consultor con IA** dentro de la plataforma que responda las dudas del
alumno sobre el contenido de las videolecciones, mientras las está viendo. Es una IA
**distinta** del corrector de entregas (`aiGradingService`): esta **no evalúa, acompaña**.

Casos de uso:
- "No entendí qué es un LLM, explicámelo más simple."
- "¿En qué lección estaba la estructura de 6 pasos para prompts?"
- "Dame un ejemplo de prompt con asignación de roles."

**No-objetivos (v1):** no resuelve las instrucciones evaluables; no reemplaza al grader; no
genera contenido nuevo fuera de lo que enseñan las lecciones.

---

## 2. TL;DR / Resumen ejecutivo

- Dos subsistemas: **(A) pipeline de ingesta offline** (transcripts → limpieza → embeddings)
  y **(B) runtime de consulta online** (`/api/trainer/ask` con RAG).
- **RAG, no fine-tuning.** Corpus chico (**25 videos únicos**) → recuperación por **coseno en
  memoria**, sin Atlas Vector Search en v1.
- **Sin credenciales de Mux**: los transcripts se bajan del HLS público.
- Reusa el `rateLimiter`, el `cacheService`, el control de acceso `hasAccess` y el cliente
  OpenAI; pero el **chat con streaming es código nuevo** (el grader usa `responses.create` sin
  stream y el cliente del front es axios, que no streamea).
- Frontend: el chat ocupa la **columna derecha** del grid de la lección (decisión del dueño) y
  las **miniaturas de lecciones pasan abajo**; en mobile el chat es un drawer. Streaming SSE.
- **Modelo: `gpt-4o`** (alineado al grader, que ya usa 4o para tareas pedagógicas en español);
  `gpt-4o-mini` queda como optimización de costo a validar con A/B, no como default.

---

## 3. Hallazgos verificados (viabilidad)

| Hallazgo | Implicancia |
|---|---|
| **25 videos únicos** (tia/tia_summer/tia_pool comparten los 25 `muxPlaybackId`; tmd cae dentro) | Corpus chico → RAG en memoria, sin índice vectorial |
| Playback IDs **públicos** (`master.m3u8` → 200) | **Sin credenciales de API de Mux** |
| Mux ya tiene **subtítulos en español** (`transcribes-spoken-dialog`) | El transcript existe; se baja del HLS |
| El `.vtt` viene **segmentado** (`0.vtt`, `1.vtt`, …) | El extractor une segmentos en orden |
| Transcripción con **errores de ASR** ("Están un game"→Stannum Game) | Requiere **limpieza** (glosario + LLM) antes de indexar |
| Lecciones gateadas por `hasAccess(user.programs[programName])` (`src/utils/accessControl.js`) | El trainer debe aplicar **el mismo gating** |
| Stack: `openai@6`, `mongoose@8`, Atlas, `express-rate-limit@7` | Cliente OpenAI reusable; **el chat con streaming es código nuevo** (el grader usa `responses.create` **sin** stream, `aiGradingService.js`) |
| Frontend: vista de lección es grid `lg:grid-cols-4` **lleno** (video col-3 + miniaturas col-1); no hay infra de chat/streaming | El chat reemplaza las miniaturas en la col derecha; las miniaturas se mueven abajo. Chat desde cero |
| Playback IDs viven en la colección **`programs`** (embebidos en lesson, seedeados de `NEXT_PUBLIC_MUX_IDS`). `src/config/muxPlaybackIds.js` es **código muerto** (lee `MUX_PLAYBACK_IDS`, var inexistente; no se importa en ningún lado) | El extractor lee de `programs`, NO de ese config |
| `lessons_catalog.json` está **incompleto**: solo `tia`, `tia_summer`, `tmd` (falta `tia_pool`) y **no tiene `muxPlaybackId`** | El contexto de topics puede ser `null` (ej. tia_pool) → el código debe tolerarlo |

### Cadena de extracción (sin credenciales) — verificada en vivo (1 video: HTTP 200 + track `es`)
```
playbackIds ← colección `programs` (lesson.muxPlaybackId), dedup por id único
GET https://stream.mux.com/{playbackId}.m3u8        (público)
  → URI del grupo SUBTITLES (subtitles.m3u8, firmado al vuelo)
GET {subtitles.m3u8}                                 (lista de segmentos .vtt)
GET cada {n}.vtt, aplicar X-TIMESTAMP-MAP y unir     → fullText + segments[] (timestamps absolutos)
```
> ⚠️ **`X-TIMESTAMP-MAP`**: los cues de cada segmento `.vtt` HLS son relativos al segmento; hay
> que aplicar `LOCAL/MPEGTS` para obtener segundos absolutos, o las citas "saltar al minuto"
> quedan desfasadas. Esto sube la Fase 1 de "chica" a "mediana".
> ⚠️ **Fallback**: una lección sin `muxPlaybackId` o sin track de subtítulos → sin transcript;
> el runtime degrada a "este contenido no está disponible para el entrenador".

---

## 4. Arquitectura del sistema

### (A) Pipeline de ingesta — offline, corre por script, idempotente
```
programs (Mongo)──┐
                  ▼
        [extractTranscripts.js]  ── HLS público ──►  transcripts.rawText + segments
                  ▼
        [cleanTranscripts.js]    ── glosario + LLM ─►  transcripts.fullText (limpio)
                  ▼
        [indexTranscripts.js]    ── OpenAI embeddings ─►  transcripts.chunks[].embedding
```

### (B) Runtime de consulta — online, por request del alumno
```
Frontend (panel chat)
   │  POST /api/trainer/ask { question, lessonId, programId, history }
   ▼
[validateJWT] → [trainerLimiter] → [hasAccess gate]
   ▼
trainerController → trainerService:
   1. embed(question)                          (OpenAI)
   2. retrieveChunks(qVec, lessonId, scope)     (coseno en memoria, cache al boot)
   3. buildPrompt(system + chunks + history + question)
   4. OpenAI chat (stream)                       → answer + citations[]
   ▼
Frontend renderiza streaming + links de cita que saltan al minuto del video
```

---

## 5. Decisiones de arquitectura

1. **RAG, no fine-tuning.** Actualizable por lección, cita fuente (lección+minuto), menos
   alucinación, más barato.
2. **Colección `transcripts` keyed por `muxPlaybackId`** (no `lessonId`): dedupe de cohortes,
   no toca el schema embebido de `programs` (que se cachea y se sirve al frontend).
3. **Recuperación por coseno en memoria** (v1): con ~25 videos los chunks totales son cientos;
   cargar embeddings a un cache al boot y rankear en JS es instantáneo. *Atlas Vector Search
   queda como upgrade* si el corpus crece (10x+).
4. **Mismo control de acceso que las lecciones** (`hasAccess`): no exponer contenido a quien no
   tiene el programa.
5. **Reuso, no infra nueva**: patrón OpenAI de `aiGradingService`, `rateLimiter`, `cacheService`,
   estructura routes/controllers/services/helpers.
6. **Guardarraíl pedagógico**: socrático, no resuelve instrucciones evaluables.

---

## 6. Integración con sistemas existentes

| Sistema existente | Punto de integración |
|---|---|
| **Auth** (`validateJWT`) | Toda ruta `/api/trainer/*` requiere JWT |
| **Access control** (`utils/accessControl.hasAccess`, `programRegistry.isValidProgram`) | Gate por programa antes de responder |
| **Programs** (`programCacheService`, `lessons_catalog.json`) | Resolver lección→video, título y `topics` (contexto de limpieza y de respuesta) |
| **Rate limiting** (`middlewares/rateLimiter`) | Nuevo `trainerLimiter` |
| **Cache** (`cache/cacheService`) | Cachear embeddings en memoria + (opcional) respuestas frecuentes |
| **AI grading** (`services/aiGradingService`) | Cliente OpenAI reusable, pero usa `responses.create` **sin stream**; el chat SSE es código nuevo. El trainer NO pisa el grader |
| **Frontend lesson view** (`LessonPageContent.tsx:148-168`, `LessonVideoPlayer.tsx`) | Chat en la **col derecha** (reemplaza `renderMiniatureList`); miniaturas pasan al bloque de abajo (quitar `lg:hidden` de `:184`). Mobile: drawer |
| **API client** (`lib/api.ts`) | Llamadas no-stream pueden usar axios; **el stream NO** (axios no streamea en browser) → cliente `fetch`+`ReadableStream` propio con su **propio** refresh-on-401 contra `/auth/refresh-token` |
| **Saltar al minuto** (`LessonVideoPlayer.tsx:207-224`) | Reusar el mecanismo `?t=` ya existente del player, no manipular `videoRef` desde el panel |

---

## 7. Modelo de datos

### `transcripts` (`src/models/transcriptModel.js`)
```js
{
  muxPlaybackId: String,    // unique index
  programIds: [String], lessonIds: [String],
  language: "es", source: "mux-hls", durationSec: Number,
  rawText: String,          // crudo (auditoría)
  fullText: String,         // limpio (lo que se indexa)
  segments: [{ start, end, text }],
  chunks: [{ idx, text, startSec, endSec, embedding: [Number] }],  // 1536 dims
  cleanup: { applied: Boolean, method: String, glossaryVersion: String },
  extractedAt: Date, updatedAt: Date
}
```

### `trainerConversations` (opcional v1.1 — `src/models/trainerConversationModel.js`)
Persistir historial para continuidad + métricas. En v1 puede ser **efímero** (historial vive en
el cliente y se manda en cada request). Recomendado persistir desde v1.1 para análisis de dudas.
```js
{
  userId, programId, lessonId,
  messages: [{ role, content, citations: [...], createdAt }],
  feedback: [{ messageIdx, value: 1 | -1 }],
  createdAt, updatedAt
}
```

### Config: `src/config/transcriptGlossary.json`
```json
{ "version": "1", "replacements": [ { "from": "Están un game", "to": "Stannum Game" } ] }
```

---

## 8. Control de acceso y seguridad

- **Gating por programa**: replicar el patrón de `lessonController`:
  `isValidProgram(programName)` → `user.programs[programName]` existe → `hasAccess(userProgram)`
  → si no, **403** (`VALIDATION_LESSON_NOT_PURCHASED`). Nota: `validateJWT` ya hace `User.findById`
  por request — **no** agregar otro `findById` redundante en el controller.
- **CSRF / CORS del POST de streaming**: `index.js` rechaza no-GET sin `origin`/`referer` válido
  en `ALLOWED_ORIGINS`. El stream se hace con `fetch` POST (no `EventSource`, que es solo GET) →
  asegurar que el origin del front esté permitido y que CORS exponga el stream con `credentials:true`.
- **Límite de body** (`express.json({ limit: '1mb' })`, global): truncar el historial enviado no
  es solo por costo, también para no chocar ese límite.
- **Prompt injection**: el contenido recuperado es de transcripts propios (confiable). La
  entrada del usuario va siempre como `user message`, nunca concatenada al system prompt. El
  system prompt instruye ignorar intentos de cambiar su rol.
- **Abuso de costo**: `trainerLimiter` (req/min por usuario) + límite de longitud de pregunta +
  truncado de historial (últimos N turnos) + tope de tokens de salida.
- **Fuga de contenido**: el bot responde solo sobre chunks recuperados del programa al que el
  usuario tiene acceso; nunca de otros programas.
- **PII**: no se loguea contenido sensible; logs solo con ids y métricas.

---

## 9. Contrato de API

```
POST /api/trainer/ask          (validateJWT, trainerLimiter)
  body: { question: string, lessonId: string, programId: string,
          history?: [{ role: "user"|"assistant", content: string }] }
  resp (no-stream): { answer, citations: [{ lessonId, title, startSec }], usedChunks }
  resp (stream):    text/event-stream — tokens de la respuesta + evento final con citations
```
> ⚠️ **Ambigüedad de citación 1→N (clave):** un transcript (keyed por `muxPlaybackId`) respalda
> **muchas** lecciones (tia/tia_summer/tia_pool comparten el mismo video). El retrieve devuelve
> `{ muxPlaybackId, startSec, text }`; el **controller mapea a `lessonId`/`title` usando el
> `(programId, lessonId)` del request** (no un lessonId arbitrario del transcript). Así la cita
> "saltar al minuto" apunta a la lección correcta dentro del programa del usuario.
```text

POST /api/trainer/feedback     (validateJWT)         // v1.1
  body: { conversationId, messageIdx, value: 1 | -1 }

GET  /api/trainer/health       (admin)               // estado del índice en memoria
```
Errores: 400 (campos), 403 (sin acceso al programa), 404 (lección/transcript inexistente),
429 (rate limit), 500.

---

## 10. Diseño del prompt y guardarraíles

**System prompt (entrenador):**
- Rol: tutor socrático de STANNUM Game; tono alineado al del grader.
- Responde **solo** con base en los chunks recuperados; si algo no está cubierto, lo dice
  ("eso no se cubre en esta lección") en vez de inventar.
- **No resuelve instrucciones evaluables**: guía y explica, no entrega la tarea hecha.
- Respuestas breves, claras, en español; cita lección + minuto cuando corresponde.

**Contexto inyectado por request:** título + `topics` de la lección actual (de
`lessons_catalog.json`) + top-k chunks recuperados + historial truncado.

**Scope de recuperación:** lección actual + su módulo, con opción de ampliar al programa.

---

## 11. Backend — componentes y archivos

**Nuevos:**
- `src/models/transcriptModel.js` — colección `transcripts`.
- `src/scripts/extractTranscripts.js` — Fase 1: lee `muxPlaybackId` de la colección `programs`
  (dedup), baja HLS → rawText/segments aplicando `X-TIMESTAMP-MAP`, upsert idempotente.
- `src/config/transcriptGlossary.json` — Fase 1.5 (reemplazos).
- `src/scripts/cleanTranscripts.js` — Fase 1.5 (glosario + LLM → fullText).
- `src/scripts/indexTranscripts.js` — Fase 2 (chunking + embeddings).
- `src/helpers/retrieveChunks.js` — recuperación por coseno (carga cache al boot).
- `src/services/trainerService.js` — orquesta embed→retrieve→prompt→OpenAI (espejo de `aiGradingService`).
- `src/controllers/trainerController.js` — handlers `ask`/`feedback`/`health`.
- `src/routes/trainerRoutes.js` — rutas + validaciones (express-validator).
- (v1.1) `src/models/trainerConversationModel.js`.
- `docs/systems/ai-trainer.md` — doc del sistema una vez construido.

**Modificados:**
- `src/index.js` — `app.use("/api/trainer", trainerRouter)`.
- `src/middlewares/rateLimiter.js` — `trainerLimiter` (+ export).

---

## 12. Frontend — componentes y archivos

**Nuevos:**
- `src/components/dashboard/program/lessons/TrainerChatPanel.tsx` — panel de chat (mensajes,
  input, streaming, estados loading/sin-cobertura/rate-limit).
- `src/stores/trainerChatStore.ts` — zustand: `messages`, `isStreaming`, `sendMessage()`,
  scope por `lessonId`.
- `src/services/trainer.ts` — llamada a `/api/trainer/ask` con `fetch` + `ReadableStream`
  (streaming; `withCredentials`), reusando el manejo de errores de `lib/api.ts`.

**Modificados:**
- `src/components/dashboard/program/lessons/LessonPageContent.tsx` — montar el panel en la
  columna libre del grid (desktop) y como drawer/tab (mobile).
- Cita clickeable → `videoRef.currentTime = startSec` en `LessonVideoPlayer.tsx` (saltar al minuto).

**UI:** desktop = aside en la 4ta columna o drawer lateral; mobile = botón flotante + drawer.
Streaming token-a-token (estilo ChatGPT). Historial por lección.

---

## 13. Configuración / variables de entorno

- **No** se necesitan creds de Mux (HLS público).
- Reusa `OPENAI_API_KEY` (ya presente para el grader).
- Nuevas (opcionales): `TRAINER_MODEL` (default `gpt-4o-mini`), `TRAINER_EMBED_MODEL`
  (`text-embedding-3-small`), `TRAINER_ENABLED` (feature flag), `TRAINER_RATE_PER_MIN`.

---

## 14. Observabilidad y logging

- Log por request: `userId`, `lessonId`, `programId`, #chunks, tokens in/out, latencia, costo
  estimado. (Patrón de logs del backend ya existente; sin contenido sensible.)
- Métricas agregadas (v1.1): preguntas por lección, % "sin cobertura", 👍/👎 → **qué lecciones
  generan más dudas** (insumo para mejorar contenido).
- `GET /api/trainer/health`: tamaño del índice en memoria, última recarga.

---

## 15. Deployment / performance / cold-start

- **⚠️ Invariante single-instance**: el backend ya asume 1 instancia (mutex en proceso de
  `lessonController`, cache de programas a nivel módulo, `node-cache` local). El índice coseno en
  memoria hereda ese supuesto. Si alguna vez **autoescalan**, se rompen el mutex existente Y el
  índice del trainer (cada instancia con su copia desincronizada). Dejarlo documentado.
- **Índice en memoria**: cargar embeddings de `transcripts.chunks` al boot (un find + cache).
  ~375 chunks / ~4-5MB → trivial. Carga **lazy/tolerante**: si el cache está vacío en la primera
  request, cargarlo on-demand sin romper.
- **Cold-start** (relevante por los fixes recientes de auth/gateway en Railway): la **primera**
  pregunta tras un cold-start paga carga del índice + `User.findById` (de `validateJWT`) + embed +
  chat → latencia alta justo al despertar. Mitigar con carga lazy y, si hace falta, warmup.
- **Streaming — el buffering está en el proxy del BACKEND (Railway), no en Netlify.** El stream
  va browser→Express directo (cross-origin a `NEXT_PUBLIC_API_URL`); Netlify no interviene.
  Setear `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`,
  y **deshabilitar compresión** en esa ruta. Validar contra el proxy real del host del backend.
- **Runtime OpenAI**: definir **timeout** del request a OpenAI; si el stream se corta a mitad,
  cerrar el SSE con un evento de error (no reintentar tokens ya enviados); abortar limpio si el
  cliente cierra la conexión.
- Scripts de ingesta: correr **unsandboxed** (Atlas remoto + red); idempotentes y re-corribles.

---

## 16. Costos (OpenAI)

| Ítem | Frecuencia | Costo aprox |
|---|---|---|
| Embeddings de 25 videos | una vez (re-index si cambia contenido) | < $0.01 |
| Limpieza LLM de 25 videos | una vez | centavos (gpt-4o-mini) |
| Embed de la pregunta | por request | ~$0.000002 |
| Respuesta del chat (1–3k tokens ctx) | por request | **~$0.01–0.03 con `gpt-4o`** (default); ~10x menos con 4o-mini |

Escala sin problema. Control de costo vía rate limit + truncado de contexto + tope de tokens de
salida. La limpieza (una vez) puede usar 4o-mini; el **chat usa 4o** por calidad de tutoría.

---

## 17. Testing

> **Realidad:** el repo no tiene infra de tests automatizados (`npm test` está vacío). La
> validación es **manual y versionada**, no suites automáticas. En particular, el guardarraíl
> pedagógico ("no resolver instrucciones") solo con system prompt es **frágil** (el propio grader
> tuvo que poner reglas anti-jailbreak explícitas) → se valida con una **batería versionada de
> prompts de jailbreak** (`docs/trainer-jailbreak-suite.md`) + revisión humana, corrida a mano.

- **Ingesta**: validar 1 video (texto a ojo) antes de los 25; diff `rawText` vs `fullText`.
- **Retrieval**: batería de 5–10 preguntas reales → ¿trae los chunks correctos? (antes del chat).
- **Endpoint**: preguntas cubiertas / no cubiertas / intento de "resolveme la instrucción" /
  sin acceso al programa (403) / rate limit (429).
- **Frontend**: streaming, citas que saltan al minuto, estados de error, mobile drawer.
- **No-regресión**: confirmar que el grader y el flujo de lecciones siguen intactos.

---

## 18. Rollout / feature flag

1. `TRAINER_ENABLED` (env) + (opcional) habilitar por programa o por cohorte para piloto.
2. Piloto con **tia** (contenido más maduro, 25 videos ya transcribibles).
3. Medir uso/feedback → ajustar prompt y scope.
4. Extender a tmd y resto.

---

## 19. Fases, dependencias y estimación

| Fase | Qué | Estado |
|---|---|---|
| **1. Extractor** | lee playback de `programs` → HLS → rawText+segments con `X-TIMESTAMP-MAP` (idempotente) | ✅ hecho + auditado |
| **1.5. Limpieza** | glosario + LLM → `fullText` | ✅ hecho |
| **2. Indexado RAG** | chunking sobre `fullText` + embeddings + `retrieveChunks` | ✅ hecho + auditado |
| **3. Endpoint** | `/api/trainer/ask` + service + gating + rate limit | ✅ hecho + auditado |
| **4. Frontend** | panel chat + store + streaming + citas | ⬜ pendiente |
| **5. Pulido** | métricas, feedback 👍/👎, conversations, recarga de índice | ⬜ pendiente |

Se construye y valida **un eslabón a la vez**; el usuario verifica cada fase antes de seguir.
(S = chico, M = mediano.)

---

## 20. Decisiones

**Tomadas:**
- ✅ **Layout:** chat en la **columna derecha** del grid de la lección; las **miniaturas pasan
  abajo** (para todos los breakpoints). Mobile: chat como drawer con botón.
- ✅ **Modelo del chat:** `gpt-4o` (alineado al grader). 4o-mini = optimización futura con A/B.
- ✅ **Streaming:** SSE token-a-token.

**Abiertas (para el usuario):**
1. **Limpieza:** glosario + LLM (recomendado) vs solo glosario.
2. **Scope del bot:** lección actual + módulo (recomendado) vs todo el programa.
3. **Persistir conversaciones:** desde v1 (mejores métricas) vs efímero al inicio.
4. **Gamificación:** XP por usar el entrenador — recomiendo **después** de medir uso.

---

## 21. Riesgos

| Riesgo | Mitigación |
|---|---|
| Transcripción con errores degrada respuestas | Fase 1.5 (glosario + LLM); guardar `rawText` para re-limpiar |
| El bot resuelve instrucciones evaluables | Guardarraíl en system prompt + scope acotado + **batería manual de jailbreaks** (no hay tests automáticos) |
| Costo no controlado | Rate limit + truncado de contexto + tope de tokens de salida |
| **Citas saltan al minuto equivocado** | Aplicar `X-TIMESTAMP-MAP` en el extractor; validar timestamps con varios videos, no solo 1 |
| Cita apunta a lección equivocada (1 video → N lecciones) | Resolver `lessonId/title` contra el `(programId, lessonId)` del request |
| Lección sin transcript (sin video o sin subtítulos) | Fallback "contenido no disponible para el entrenador" |
| URL de subtítulos firmada expira | Siempre arrancar desde `master.m3u8` (se re-firma) |
| **Autoescalado del backend** | Rompe el mutex existente Y el índice en memoria → mantener single-instance, o externalizar estado antes de escalar |
| Cold-start (Railway): 1ª pregunta lenta | Carga lazy/tolerante; warmup opcional |
| Crecimiento del corpus (futuro) | Migrar de coseno-en-memoria a Atlas Vector Search |
