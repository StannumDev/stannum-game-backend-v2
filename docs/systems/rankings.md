# Sistema de Rankings - STANNUM Game

El sistema de rankings de STANNUM Game permite competencia sana entre estudiantes mediante **rankings individuales** globales y **rankings por equipos** de cada programa.

## 📊 Visión General

STANNUM Game tiene tres tipos de rankings:

1. **Ranking Individual (Global)** - Top usuarios por XP total
2. **Ranking Individual por Programa** - Top usuarios por XP de un programa específico
3. **Ranking por Equipos** - Equipos de un programa ordenados por XP acumulado

**Funcionalidades:**
- ✅ Ranking individual por experienceTotal
- ✅ Ranking por equipos con suma de puntos
- ✅ Privacidad de datos (profanity filter en nombres + uppercase en enterprise)
- ✅ Posiciones numeradas
- ✅ Cache in-memory con TTL (`node-cache`) para reducir carga MongoDB
- ✅ Paginación configurable
- ✅ Solo usuarios con acceso a programas (compra, product key o suscripción activa)

---

## 🏆 1. RANKING INDIVIDUAL

### Endpoint

**GET** `/api/ranking/individual`

**Query params:**
- `limit`: Cantidad de usuarios a retornar (default: 10, max efectivo: 100)

> El validator de la ruta acepta hasta `1000`, pero el controller hace `Math.min(limit, 100)`. El cap real para clientes es **100**.

### Criterios

**Usuarios incluidos:**
- Que tengan acceso a al menos 1 programa rankeable (`hasAccessFlag: true`)
- Que estén activos (`status: true`)

**Programas considerados (`RANKABLE_PROGRAMS`):**
- `tmd`
- `tia`
- `tia_summer`
- `tia_pool`
- `trenno_ia`

**Orden:**
- Por `level.experienceTotal` descendente (mayor a menor)

### Query MongoDB

```javascript
// Usa buildAccessQuery(RANKABLE_PROGRAMS) de src/utils/accessControl.js
// RANKABLE_PROGRAMS = ['tmd', 'tia', 'tia_summer', 'tia_pool', 'trenno_ia']
// Incluye usuarios con isPurchased: true O subscription activa
const users = await User.find({
  $or: buildAccessQuery(RANKABLE_PROGRAMS),  // hasAccessFlag por programa
  status: true
})
.sort({ 'level.experienceTotal': -1 })
.limit(limit)
.select('level profile username enterprise preferences.hasProfilePhoto');
// Nota: se selecciona preferences.hasProfilePhoto (no profilePhotoUrl), porque
// profilePhotoUrl es un virtual y getRankingUserDetails() lo deriva de ese flag.
```

**Nota:** `hasAccessFlag` es un campo denormalizado que es `true` cuando el usuario tiene acceso al programa (ya sea por compra con product key, compra con Mercado Pago, o suscripción activa).

### Formato de Respuesta

```json
{
  "success": true,
  "data": [
    {
      "position": 1,
      "id": "507f1f77bcf86cd799439011",
      "name": "Juan ****",
      "username": "usuario123",
      "photo": "https://s3.../profile.jpg",
      "enterprise": "Mi ******",
      "points": 5000,
      "level": 15
    },
    {
      "position": 2,
      "id": "...",
      "name": "María ****",
      "username": "maria456",
      "photo": "...",
      "enterprise": "Empresa ******",
      "points": 4500,
      "level": 14
    }
  ]
}
```

### Transformación de Datos

**Método:** `user.getRankingUserDetails()`

**Archivo:** `src/models/userModel.js`

```javascript
userSchema.methods.getRankingUserDetails = function () {
  return {
    id: this._id,
    name: censor(this.profile.name),                                  // Oculta parte del nombre
    username: this.username,
    photo: this.profilePhotoUrl,
    enterprise: (censor(this.enterprise?.name) || "").toUpperCase(),  // Censura + UPPERCASE
    points: this.level.experienceTotal,
    level: this.level.currentLevel
  };
};
```

**Nota:** el ranking por equipos arma la `photo` directamente en el aggregation (no usa `profilePhotoUrl` virtual). Construye la URL S3 condicionalmente según `preferences.hasProfilePhoto`:

```javascript
photo: {
  $cond: [
    { $eq: [{ $ifNull: ['$preferences.hasProfilePhoto', false] }, true] },
    { $concat: [process.env.AWS_S3_BASE_URL, '/', process.env.AWS_S3_FOLDER_NAME, '/', { $toString: '$_id' }] },
    null
  ]
}
```

### Privacidad - Profanity Filter

**Helper:** `src/helpers/profanityChecker.js`

El helper usa la librería `@2toad/profanity` para censurar lenguaje ofensivo en campos de texto visibles en el ranking. Se configura con `wholeWord: true` para evitar falsos positivos (por ejemplo, sin esta opción "obstáculo" se censuraba porque "culo" coincidía como substring; con `wholeWord: true` solo se censuran coincidencias de palabras completas).

```javascript
const { Profanity, CensorType } = require('@2toad/profanity');

const profanity = new Profanity({
    languages: ['en'],
    wholeWord: true,   // Evita falsos positivos con substrings
    grawlix: '****',
    grawlixChar: '*',
});

// Se agregan palabras ofensivas en español (blackList) y excepciones (whiteList)
profanity.addWords(blackList);
profanity.removeWords(whiteList);

const censor = (text) => {
    if (!text || typeof text !== 'string') return text;
    return profanity.censor(text, CensorType.Word);
};
```

---

## 🏅 2. RANKING INDIVIDUAL POR PROGRAMA

### Endpoint

**GET** `/api/ranking/individual/:programName`

**Params:**
- `programName`: `tia` | `tia_summer` | `tia_pool` | `tmd` | `trenno_ia` (validado contra `RANKABLE_PROGRAMS`)

**Query params:**
- `limit`: Cantidad de usuarios a retornar (default: 10, max efectivo: 100)

> Mismo cap real que `/individual`: validator hasta 1000, controller hace `Math.min(limit, 100)`.

### Criterios

**Usuarios incluidos:**
- Que tengan acceso al programa específico (`hasAccessFlag: true`)
- Que estén activos (`status: true`)

**Orden:**
- Por `programs.[programName].totalXp` descendente (XP específico del programa)

### Diferencia con Ranking Global

| | Ranking Global | Ranking por Programa |
|---|---|---|
| **Endpoint** | `/ranking/individual` | `/ranking/individual/:programName` |
| **Ordena por** | `level.experienceTotal` (XP total) | `programs.[prog].totalXp` (XP del programa) |
| **Usuarios** | Todos con al menos 1 programa | Solo con el programa específico |

### Formato de Respuesta

Mismo formato que el ranking individual global, pero los `points` reflejan el XP del programa específico.

---

## 👥 3. RANKING POR EQUIPOS

### Endpoint

**GET** `/api/ranking/team/:programName`

**Params:**
- `programName`: `tia` | `tia_summer` | `tia_pool` | `tmd` | `trenno_ia`

### Criterios

**Usuarios incluidos:**
- Que tengan acceso al programa específico (`buildProgramAccessQuery` → `hasAccessFlag` o suscripción activa)
- Que estén activos (`status: true`)
- Que tengan un equipo asignado en ese programa (`teams` con `teamName` no vacío)

**Agrupación:**
- Por `teamName` del programa

**Orden:**
- Por `totalPoints` descendente (suma de `level.experienceTotal` de todos los miembros)

### Lógica de Agregación

A diferencia del ranking individual, el de equipos se resuelve con un **aggregation pipeline de MongoDB** (no con un loop en memoria). Suma `level.experienceTotal` (XP global, no el `totalXp` del programa) de cada miembro:

```javascript
const teamRanking = await User.aggregate([
  { $match: {
      ...buildProgramAccessQuery(programName),
      status: true,
      teams: { $elemMatch: { programName, teamName: { $exists: true, $ne: null, $ne: '' } } }
  }},
  { $unwind: '$teams' },
  { $match: { 'teams.programName': programName } },
  { $project: {
      teamName: '$teams.teamName',
      points: { $ifNull: ['$level.experienceTotal', 0] },
      username: 1, name: '$profile.name',
      photo: { $cond: [ /* URL S3 si hasProfilePhoto, si no null */ ] },
      level: '$level.currentLevel', enterprise: '$enterprise.name',
  }},
  { $group: {
      _id: '$teamName',
      members: { $push: { id: '$_id', name: '$name', username: '$username', photo: '$photo', points: '$points', level: '$level', enterprise: '$enterprise' } },
      totalPoints: { $sum: '$points' }
  }},
  { $sort: { totalPoints: -1 } },
  { $project: { _id: 0, team: '$_id', points: '$totalPoints', members: 1 } }
]);

// Post-proceso: position 1-based + censor() de name/enterprise por miembro.
// Si no hay equipos → 404 RANKING_NO_TEAMS_FOUND.
```

> La censura (`censor()` en `name` y `enterprise`) se aplica **después** del aggregation, recorriendo los miembros de cada equipo. El `enterprise` además se pasa a UPPERCASE.

### Formato de Respuesta

```json
{
  "success": true,
  "data": [
    {
      "position": 1,
      "team": "equipo_alpha",
      "points": 15000,
      "members": [
        {
          "id": "...",
          "name": "Juan ****",
          "username": "usuario123",
          "photo": "...",
          "enterprise": "...",
          "points": 5000,
          "level": 15
        },
        {
          "id": "...",
          "name": "María ****",
          "username": "maria456",
          "photo": "...",
          "enterprise": "...",
          "points": 4500,
          "level": 14
        },
        {
          "id": "...",
          "name": "Carlos ****",
          "username": "carlos789",
          "photo": "...",
          "enterprise": "...",
          "points": 5500,
          "level": 16
        }
      ]
    },
    {
      "position": 2,
      "team": "equipo_beta",
      "points": 12000,
      "members": [...]
    }
  ]
}
```

---

## 📐 4. MODELO DE DATOS - TEAMS

### Schema en User Model

**Archivo:** `src/models/userModel.js`

```javascript
const teamSchema = new Schema({
  programName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  teamName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  role: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  }
}, { _id: false });

// En userSchema:
teams: [teamSchema]
```

### Ejemplo de Datos

```javascript
{
  "_id": "507f1f77bcf86cd799439011",
  "username": "usuario123",
  "teams": [
    {
      "programName": "tia",
      "teamName": "equipo_alpha",
      "role": "member"
    },
    {
      "programName": "tia_summer",
      "teamName": "equipo_verano",
      "role": "member"
    }
  ]
}
```

### Asignación de Equipo

Los equipos se asignan automáticamente al activar una product key:

**Archivo:** `src/controllers/productKeyController.js`

```javascript
// Al activar product key
if (key.team && key.team !== 'no_team') {
  const alreadyInTeam = user.teams.some(
    t => t.programName === key.product && t.teamName === key.team
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

---

## 🎯 5. CASOS DE USO

### Caso 1: Ranking Individual Global

**Escenario:** Mostrar top 10 estudiantes de toda la plataforma

**Request:**
```bash
GET /api/ranking/individual?limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    // Top 10 usuarios ordenados por XP total
  ]
}
```

**Frontend:** Mostrar en página de "Ranking" o sidebar de dashboard

---

### Caso 2: Ranking de Equipo TIA

**Escenario:** Empresa compró TIA para 30 empleados divididos en 3 equipos

**Setup:**
- Product keys creadas con `team: "equipo_ventas"`, `team: "equipo_marketing"`, `team: "equipo_producto"`
- Usuarios activan keys y se asignan automáticamente

**Request:**
```bash
GET /api/ranking/team/tia
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "position": 1,
      "team": "equipo_ventas",
      "points": 25000,
      "members": [10 miembros con sus puntos]
    },
    {
      "position": 2,
      "team": "equipo_marketing",
      "points": 22000,
      "members": [10 miembros]
    },
    {
      "position": 3,
      "team": "equipo_producto",
      "points": 20000,
      "members": [10 miembros]
    }
  ]
}
```

**Frontend:** Mostrar en página dedicada de "Ranking de Equipos"

---

### Caso 3: Tracking Personal en Ranking

**Escenario:** Usuario quiere saber su posición en el ranking

**Lógica:**
```javascript
// Frontend calcula posición después de obtener ranking
const myPosition = rankingData.findIndex(
  user => user.id === currentUserId
) + 1;

if (myPosition === 0) {
  // Usuario no está en el top mostrado
  displayMessage("Tu posición: fuera del top 10");
} else {
  displayMessage(`Tu posición: #${myPosition}`);
}
```

---

## 📊 6. FLUJOS COMPLETOS

### Flujo: Obtener Ranking Individual

```
Frontend solicita ranking
  ↓
GET /api/ranking/individual?limit=10
  ↓
validateJWT middleware
  ├─ Verificar token válido
  └─ Extraer userId (no usado en query pero requerido para auth)
  ↓
rankingController.getIndividualRanking()
  ├─ Normalizar limit: Math.min(Math.max(limit, 1), 100)
  ├─ Cache hit? → devolver
  ├─ Query usuarios con acceso (buildAccessQuery) + status:true
  ├─ Sort por level.experienceTotal desc
  └─ Limit a cantidad solicitada
  ↓
Transformar cada usuario
  ├─ user.getRankingUserDetails()
  ├─ censor() en name y enterprise
  └─ Agregar position (1-based index)
  ↓
Response: { success: true, data: [...] }
  ↓
Frontend renderiza ranking
```

### Flujo: Obtener Ranking por Equipo

```
Frontend solicita ranking de TIA
  ↓
GET /api/ranking/team/tia
  ↓
validateJWT middleware
  ↓
rankingController.getTeamRanking()
  ├─ Validar programName (isRankableProgram)
  ├─ Cache hit? → devolver
  └─ User.aggregate([...]) (pipeline de MongoDB)
  ↓
Pipeline
  ├─ $match: acceso al programa + status:true + tiene team
  ├─ $unwind teams + $match teams.programName
  ├─ $project (points = level.experienceTotal, photo condicional)
  ├─ $group por teamName (members[], totalPoints = $sum)
  └─ $sort totalPoints desc
  ↓
Post-proceso (en app)
  ├─ position 1-based
  └─ censor() name/enterprise por miembro (+ UPPERCASE enterprise)
  ↓
Sin equipos → 404 RANKING_NO_TEAMS_FOUND
  ↓
Response: { success: true, data: [...] }
  ↓
Frontend renderiza ranking de equipos
  └─ Mostrar total de equipo + lista de miembros
```

---

## 🔒 7. SEGURIDAD Y PRIVACIDAD

### Censura de Datos Personales

**Protección de PII (Personally Identifiable Information):**

- ✅ Nombres parcialmente ocultos
- ✅ Empresas parcialmente ocultas
- ✅ Usernames completos visibles (público por diseño)
- ✅ Photos públicas (S3 URLs)

**Función censor():**
```javascript
"Juan Pérez González" → "Juan ****"
"Microsoft Corporation" → "Micr****"
```

### Control de Acceso

**Autenticación requerida:**
- Ambos endpoints requieren JWT válido
- No se puede ver ranking sin estar autenticado

**Sin restricción de rol:**
- Cualquier usuario autenticado puede ver rankings
- No se requiere rol ADMIN

### Limitaciones

**Individual:**
- Validator de la ruta acepta `limit` hasta 1000, pero el controller hace `Math.min(limit, 100)` → cap real **100 usuarios** por request
- Aplica al ranking global (`/individual`) y al de programa (`/individual/:programName`)

**Equipos:**
- Sin parámetro `limit`. La aggregation devuelve todos los equipos del programa
- Típicamente: 2-10 equipos por programa

---

## 📌 NOTAS TÉCNICAS

### Performance

**Índices MongoDB:**
```javascript
// En userSchema
user.index({ 'level.experienceTotal': -1 });
user.index({ 'programs.tia.hasAccessFlag': 1 });
user.index({ 'programs.tia_summer.hasAccessFlag': 1 });
user.index({ 'programs.tia_pool.hasAccessFlag': 1 });
user.index({ 'programs.tmd.hasAccessFlag': 1 });
user.index({ 'programs.trenno_ia.hasAccessFlag': 1 });
```

**Optimización de Query:**
- `.select()` para limitar campos retornados
- Sin populate (no es necesario)
- Sort en base de datos (no en aplicación)

### Caching

Implementado con `node-cache` (in-memory) en `src/cache/cacheService.js`. Cada endpoint cachea su respuesta antes de retornar y la sirve directo si hay hit:

```javascript
const cacheKey = KEYS.RANKING_GLOBAL(limit);
const cached = cache.get(cacheKey);
if (cached) return res.status(200).json(cached);

// ... query MongoDB + map ...

const response = { success: true, data: rankedUsers };
cache.set(cacheKey, response, TTL.RANKING);
return res.status(200).json(response);
```

**Keys usadas:**
- `KEYS.RANKING_GLOBAL(limit)` — ranking individual global
- `KEYS.RANKING_PROGRAM(programName, limit)` — ranking individual por programa
- `KEYS.RANKING_TEAM(programName)` — ranking de equipos

**TTL:** definido en `TTL.RANKING` del cacheService.

**Invalidación:** el cache es time-based, no event-based. Cambios en XP de usuarios se reflejan al expirar el TTL (no inmediato).

### Escalabilidad

**Para plataformas grandes (10k+ usuarios):**

1. **Materializar rankings:**
   - Calcular y guardar rankings cada X minutos
   - Servir desde tabla pre-computada

2. **Pagination en Individual:**
   - Agregar `page` param además de `limit`
   - Permitir navegación de top 100, 200, etc.

3. **Sharding por programa:**
   - Rankings separados por programa
   - Reduce cantidad de usuarios en cada query

---

## 📊 8. MÉTRICAS Y ANALYTICS

### Estadísticas Útiles (No Implementadas)

Posibles endpoints futuros:

**GET `/ranking/stats`**
```json
{
  "totalActiveUsers": 5000,
  "averageLevel": 8.5,
  "averageXP": 2500,
  "topUserXP": 15000,
  "medianXP": 1800
}
```

**GET `/ranking/position/:userId`**
```json
{
  "userId": "...",
  "position": 125,
  "percentile": 75,
  "pointsToNextPosition": 150,
  "pointsToTopTen": 2500
}
```

---

**© STANNUM 2026**
