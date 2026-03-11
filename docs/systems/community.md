# Sistema de Comunidad - STANNUM Game

El sistema de comunidad permite a los usuarios compartir **Prompts** y **Assistants** (GPTs personalizados) con otros estudiantes de la plataforma. Sistema completo con métricas, likes, favoritos, verificación de STANNUM y categorización.

## 📊 Visión General

El sistema de comunidad tiene dos tipos de contenido:

1. **Prompts** - Prompts de texto para IA (ChatGPT, Claude, Gemini, etc.)
2. **Assistants** - GPTs personalizados o asistentes de IA con URLs

**Funcionalidades:**
- ✅ Crear, editar, eliminar contenido
- ✅ Búsqueda y filtrado avanzado
- ✅ Métricas de engagement (copias, likes, vistas, favoritos)
- ✅ Verificación oficial de STANNUM
- ✅ Sistema de favoritos personal
- ✅ Visibilidad (published, draft, hidden)
- ✅ Soft delete (status flag)

---

## 💬 1. PROMPTS

### ¿Qué es un Prompt?

Un prompt es una plantilla de texto que los usuarios pueden copiar y usar en herramientas de IA. Incluye:
- Título y descripción
- Contenido del prompt completo
- Categoría y dificultad
- Plataformas compatibles
- Tags para búsqueda
- Ejemplo de salida (opcional)
- Link a Custom GPT (opcional)

### Modelo de Datos

**Archivo:** `src/models/promptModel.js`

```javascript
{
  title: String (5-80 caracteres),
  description: String (10-500 caracteres),
  content: String (10-8000 caracteres),
  category: Enum [
    'sales', 'productivity', 'marketing',
    'innovation', 'leadership', 'strategy',
    'automation', 'content', 'analysis', 'growth'
  ],
  difficulty: Enum ['basic', 'intermediate', 'advanced'],
  platforms: Array [
    'chatgpt', 'claude', 'gemini',
    'poe', 'perplexity', 'other'
  ],
  customGptUrl: String (URL opcional),
  tags: Array<String> (max 10, 2-30 chars cada uno),
  exampleOutput: String (max 2000 caracteres),
  metrics: {
    copiesCount: Number,
    likesCount: Number,
    favoritesCount: Number,
    viewsCount: Number
  },
  author: ObjectId (ref: User),
  likedBy: Array<ObjectId>,
  favoritedBy: Array<ObjectId>,
  status: Boolean (true = activo, false = eliminado),
  visibility: Enum ['published', 'draft', 'hidden'],
  stannumVerified: {
    isVerified: Boolean,
    verifiedAt: Date
  },
  searchKeywords: Array<String>
}
```

### Métricas y Scores

**Popularity Score (Virtual):**
```javascript
popularityScore = (copiesCount × 3) +
                  (likesCount × 2) +
                  favoritesCount +
                  (viewsCount × 0.1) +
                  (verified ? 100 : 0)
```

**Engagement Rate (Virtual):**
```javascript
engagementRate = ((copiesCount + likesCount + favoritesCount) / viewsCount) × 100
```

### Índices MongoDB

```javascript
{ category: 1, difficulty: 1 }
{ tags: 1 }
{ author: 1, createdAt: -1 }
{ status: 1, visibility: 1 }
{ 'metrics.copiesCount': -1 }
{ 'metrics.likesCount': -1 }
{ 'metrics.viewsCount': -1 }
{ createdAt: -1 }
{ 'stannumVerified.isVerified': 1 }
```

### Métodos del Schema

**Incrementos atómicos:**
```javascript
incrementCopies()   // $inc copiesCount
incrementViews()    // $inc viewsCount
addLike(userId)     // $push likedBy + $inc likesCount
removeLike(userId)  // $pull likedBy + $inc likesCount -1
```

**Favoritos:**
```javascript
addFavorite(userId)
removeFavorite(userId)
hasUserFavorited(userId)
```

**Visibilidad:**
```javascript
softDelete()   // status = false
hide()         // visibility = 'hidden'
publish()      // visibility = 'published'
setDraft()     // visibility = 'draft'
```

**Verificación:**
```javascript
verifyByStannum()          // isVerified = true, verifiedAt = now
removeStannumVerification() // isVerified = false
```

**Búsqueda estática:**
```javascript
Prompt.search(query, filters)
Prompt.getByAuthor(authorId, includeHidden)
Prompt.getTopPrompts(limit)
```

---

## 🤖 2. ASSISTANTS

### ¿Qué es un Assistant?

Un assistant es un GPT personalizado o asistente de IA compartible. Incluye:
- Título y descripción
- URL del assistant
- Categoría y dificultad
- Plataforma (chatgpt, claude, etc.)
- Tags para búsqueda
- Casos de uso

### Modelo de Datos

**Archivo:** `src/models/assistantModel.js`

```javascript
{
  title: String (1-80 caracteres),
  description: String (10-500 caracteres),
  assistantUrl: String (URL requerida),
  category: Enum [
    'sales', 'productivity', 'marketing',
    'innovation', 'leadership', 'strategy',
    'automation', 'content', 'analysis', 'growth'
  ],
  difficulty: Enum ['basic', 'intermediate', 'advanced'],
  platform: Enum [
    'chatgpt', 'claude', 'gemini',
    'poe', 'perplexity', 'other'
  ],
  tags: Array<String> (max 10),
  useCases: String (max 1000 caracteres),
  metrics: {
    clicksCount: Number,     // Diferente de prompts (clicks vs copies)
    likesCount: Number,
    favoritesCount: Number,
    viewsCount: Number
  },
  author: ObjectId (ref: User),
  likedBy: Array<ObjectId>,
  favoritedBy: Array<ObjectId>,
  status: Boolean,
  visibility: Enum ['published', 'draft', 'hidden'],
  stannumVerified: {
    isVerified: Boolean,
    verifiedAt: Date
  },
  searchKeywords: Array<String>
}
```

### Métricas

**Popularity Score:**
```javascript
popularityScore = (clicksCount × 3) +   // Clicks en vez de copias
                  (likesCount × 2) +
                  favoritesCount +
                  (viewsCount × 0.1) +
                  (verified ? 100 : 0)
```

**Métodos:** (similares a Prompt)
- `incrementClicks()` - en vez de incrementCopies()
- `incrementViews()`, `addLike()`, `removeLike()`
- `addFavorite()`, `removeFavorite()`
- `softDelete()`, `hide()`, `publish()`, `setDraft()`
- `verifyByStannum()`, `removeStannumVerification()`

---

## 🔍 3. BÚSQUEDA Y FILTROS

### Endpoint de Búsqueda

**Prompts:** `GET /api/prompt`
**Assistants:** `GET /api/assistant`

### Query Parameters

| Parámetro | Tipo | Valores | Descripción |
|-----------|------|---------|-------------|
| `page` | Number | 1+ | Número de página |
| `limit` | Number | 1-50 | Items por página |
| `category` | String | ver enum | Filtrar por categoría |
| `difficulty` | String | basic, intermediate, advanced | Filtrar por dificultad |
| `sortBy` | String | ver abajo | Orden de resultados |
| `search` | String | min 2 chars | Búsqueda por texto |
| `platforms` | String | chatgpt, claude, etc. | Solo prompts |
| `platform` | String | chatgpt, claude, etc. | Solo assistants |
| `favoritesOnly` | String | true, false | Solo favoritos del usuario |
| `stannumVerifiedOnly` | String | true, false | Solo verificados |

### Opciones de SortBy

| Valor | Orden |
|-------|-------|
| `popular` | Verified desc, copiesCount desc, likesCount desc |
| `newest` | createdAt desc |
| `mostCopied` | copiesCount desc (solo prompts) |
| `mostUsed` | clicksCount desc (solo assistants) |
| `mostLiked` | likesCount desc |
| `mostViewed` | viewsCount desc |
| `verified` | isVerified desc, copiesCount/clicks desc |

### Lógica de Búsqueda

**Archivo:** `src/controllers/promptController.js` / `assistantController.js`

```javascript
const criteria = {
  status: true,
  visibility: 'published'
};

// Texto de búsqueda
if (search) {
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'i');
  criteria.$or = [
    { title: regex },
    { description: regex },
    { tags: regex }
  ];
}

// Filtros
if (category) criteria.category = category;
if (difficulty) criteria.difficulty = difficulty;
if (stannumVerifiedOnly) criteria['stannumVerified.isVerified'] = true;

// Favoritos del usuario
if (favoritesOnly && userId) {
  criteria.favoritedBy = userId;
}

const prompts = await Prompt.find(criteria)
  .populate('author', 'username profile.name preferences.hasProfilePhoto')
  .sort(sortConfig)
  .skip((page - 1) * limit)
  .limit(limit);
```

---

## 📊 4. MÉTRICAS Y ENGAGEMENT

### Incremento de Métricas

**Views (incremento automático):**
```javascript
// Al obtener detalles de un prompt/assistant
prompt.incrementViews();
// Usa operación atómica: $inc: { 'metrics.viewsCount': 1 }
```

**Copies/Clicks (acción manual del usuario):**
```javascript
// POST /api/prompt/:id/copy
prompt.incrementCopies();

// POST /api/assistant/:id/click
assistant.incrementClicks();
```

**Likes (toggle):**
```javascript
// POST /api/prompt/:id/like
if (prompt.hasUserLiked(userId)) {
  await prompt.removeLike(userId);
} else {
  await prompt.addLike(userId);
}
```

**Favoritos (toggle):**
```javascript
// POST /api/prompt/:id/favorite
if (user.hasPromptInFavorites(promptId)) {
  await user.removePromptFromFavorites(promptId);
  await prompt.removeFavorite(userId);
  return { isFavorited: false };
} else {
  await user.addPromptToFavorites(promptId);
  await prompt.addFavorite(userId);
  return { isFavorited: true };
}
```

### Prevención de Race Conditions

Las operaciones de like/favorite usan operadores atómicos de MongoDB:

```javascript
// addLike - solo agrega si no existe
Prompt.updateOne(
  { _id: promptId, likedBy: { $ne: userId } },
  { $push: { likedBy: userId }, $inc: { 'metrics.likesCount': 1 } }
);

// removeLike - solo remueve si existe
Prompt.updateOne(
  { _id: promptId, likedBy: userId },
  { $pull: { likedBy: userId }, $inc: { 'metrics.likesCount': -1 } }
);
```

---

## 👤 5. SISTEMA DE FAVORITOS

### Modelo en User

**Archivo:** `src/models/userModel.js`

```javascript
favorites: {
  prompts: [{ type: ObjectId, ref: 'Prompt' }],
  assistants: [{ type: ObjectId, ref: 'Assistant' }]
}
```

### Métodos del User

```javascript
// Prompts
user.addPromptToFavorites(promptId)
user.removePromptFromFavorites(promptId)
user.hasPromptInFavorites(promptId)
user.getFavoritePrompts()  // Retorna prompts poblados

// Assistants
user.addAssistantToFavorites(assistantId)
user.removeAssistantFromFavorites(assistantId)
user.hasAssistantInFavorites(assistantId)
user.getFavoriteAssistants()  // Retorna assistants poblados
```

### Flujo Completo - Toggle Favorite

```
Usuario hace click en favorito
  ↓
POST /api/prompt/:id/favorite
  ↓
Verificar si ya está en favoritos
  ├─ SÍ → Remover de user.favorites.prompts
  │        Remover de prompt.favoritedBy
  │        Decrementar prompt.metrics.favoritesCount
  └─ NO → Agregar a user.favorites.prompts
           Agregar a prompt.favoritedBy
           Incrementar prompt.metrics.favoritesCount
  ↓
user.save() + prompt.save()
  ↓
Response: { isFavorited: true/false }
```

---

## ✅ 6. VERIFICACIÓN DE STANNUM

### ¿Qué es la Verificación?

Un prompt o assistant verificado por STANNUM tiene un badge oficial que indica calidad y autenticidad. Otorga +100 puntos de popularidad.

### Schema

```javascript
stannumVerified: {
  isVerified: Boolean,
  verifiedAt: Date
}
```

### Verificar Contenido (ADMIN)

```javascript
// Backend manual (no hay endpoint público)
prompt.verifyByStannum();
// Setea isVerified = true, verifiedAt = now
```

### Filtro de Verificados

**Query param:** `stannumVerifiedOnly=true`

```javascript
if (stannumVerifiedOnly) {
  criteria['stannumVerified.isVerified'] = true;
}
```

### Orden Prioritario

Contenido verificado aparece primero en sorts:

```javascript
sort: {
  'stannumVerified.isVerified': -1,  // Primero verificados
  'metrics.copiesCount': -1          // Luego por popularidad
}
```

---

## 🎨 7. VISIBILIDAD Y ESTADOS

### Estados de Visibilidad

| Estado | Descripción |
|--------|-------------|
| **published** | Visible públicamente en listados |
| **draft** | Solo visible para el autor |
| **hidden** | Oculto (removido de publicado) |

### Status Flag

- `status: true` - Activo
- `status: false` - Soft deleted (no aparece en queries)

### Queries de Visibilidad

**Listado público:**
```javascript
const criteria = {
  status: true,
  visibility: 'published'
};
```

**Mis prompts (incluye drafts):**
```javascript
const criteria = {
  author: userId,
  status: true,
  visibility: { $in: ['published', 'draft'] }
};
```

### Cambiar Visibilidad

**Endpoint:** `PUT /api/prompt/:id/visibility`

**Body:**
```json
{
  "visibility": "published" | "draft" | "hidden"
}
```

---

## 📋 8. FLUJOS COMPLETOS

### Crear Prompt

```
Usuario completa formulario
  ↓
POST /api/prompt
  ├─ Validar campos (express-validator)
  ├─ title: 5-80 chars
  ├─ description: 10-500 chars
  ├─ content: 10-8000 chars
  ├─ category: enum válido
  ├─ platforms: array min 1
  └─ tags: max 10, 2-30 chars cada uno
  ↓
Crear nuevo Prompt
  ├─ author = userId
  ├─ metrics = { copiesCount: 0, ... }
  ├─ visibility = 'published' (default)
  └─ status = true
  ↓
prompt.save() → MongoDB
  ↓
Response: { promptId }
  ↓
Frontend redirect a /community/prompts
```

### Copiar Prompt

```
Usuario hace click en "Copiar"
  ↓
Frontend copia contenido al clipboard
  ↓
POST /api/prompt/:id/copy
  ↓
prompt.incrementCopies()
  └─ $inc: { 'metrics.copiesCount': 1 }
  ↓
Response: { success: true }
  ↓
Frontend muestra toast "Copiado al portapapeles"
```

### Buscar Prompts

```
Usuario ingresa filtros
  ↓
GET /api/prompt?category=productivity&sortBy=popular&page=1
  ↓
Construir criteria de búsqueda
  ├─ status: true
  ├─ visibility: 'published'
  ├─ category: 'productivity'
  └─ Aplicar regex si hay search
  ↓
Query MongoDB con populate de author
  ↓
Sort por popularityScore
  ↓
Paginación (skip + limit)
  ↓
Transformar a getPreview(userId)
  ├─ Incluir userActions (hasLiked, hasFavorited)
  └─ Limitar content a preview (150 chars)
  ↓
Response: { data: [...], pagination: {...} }
```

---

## 📊 9. ENDPOINTS DE STATS

### GET `/prompt/stats`
**Estadísticas globales de prompts**

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalPrompts": 500,
    "totalPublished": 450,
    "totalDrafts": 30,
    "totalHidden": 20,
    "totalVerified": 50,
    "mostPopularCategory": "productivity",
    "totalCopies": 5000,
    "totalLikes": 2500
  }
}
```

### GET `/prompt/top`
**Top prompts (max 50)**

**Query params:**
- `limit`: 1-50 (default: 10)

**Response:**
```json
{
  "success": true,
  "data": [
    // Prompts ordenados por verified + copiesCount + likesCount
  ]
}
```

---

## 🔒 10. SEGURIDAD Y VALIDACIÓN

### Validaciones de Input

**express-validator** en todos los endpoints:

```javascript
check("title")
  .trim()
  .not().isEmpty()
  .isLength({ min: 5, max: 80 })

check("tags")
  .isArray({ max: 10 })

check("tags.*")
  .trim()
  .isLength({ min: 2, max: 30 })
```

### Sanitización

- HTML stripping en descripción/content
- Regex escape en búsquedas
- Lowercase en tags
- Trim en todos los strings

### Control de Acceso

**Crear/Editar/Eliminar:**
```javascript
// Solo el autor puede modificar
if (prompt.author.toString() !== userId) {
  return res.status(403).json(getError("PROMPT_NOT_OWNER"));
}
```

**Verificación STANNUM:**
```javascript
// Solo admins (no expuesto en API pública)
if (user.role !== 'ADMIN') {
  return res.status(403).json(getError("ADMIN_REQUIRED"));
}
```

---

## 📌 NOTAS TÉCNICAS

### Soft Delete vs Hard Delete

Se usa **soft delete** (status = false) para:
- Mantener integridad referencial
- Preservar métricas históricas
- Permitir restauración si es necesario

### Índices de Performance

Índices compuestos para queries comunes:
- `{ category: 1, difficulty: 1 }` - Filtros combinados
- `{ author: 1, createdAt: -1 }` - Mis prompts ordenados
- `{ 'metrics.copiesCount': -1 }` - Sort por popularidad

### Populate Selectivo

Solo se populan campos necesarios del autor:

```javascript
.populate('author', 'username profile.name preferences.hasProfilePhoto')
```

Esto reduce payload y mejora performance.

### Rate Limiting

Búsquedas usan `searchRateLimiter` para prevenir abuso:

```javascript
router.get("/", searchRateLimiter, promptController.getAllPrompts);
```

---

**© STANNUM 2026**
