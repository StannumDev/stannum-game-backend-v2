# Sistema de Rankings - STANNUM Game

El sistema de rankings de STANNUM Game permite competencia sana entre estudiantes mediante **rankings individuales** globales y **rankings por equipos** de cada programa.

## 📊 Visión General

STANNUM Game tiene dos tipos de rankings:

1. **Ranking Individual (Global)** - Top usuarios por XP total
2. **Ranking por Equipos** - Equipos de un programa ordenados por XP acumulado

**Funcionalidades:**
- ✅ Ranking individual por experienceTotal
- ✅ Ranking por equipos con suma de puntos
- ✅ Privacidad de datos (profanity filter en nombres)
- ✅ Posiciones numeradas
- ✅ Paginación configurable
- ✅ Solo usuarios con programas comprados

---

## 🏆 1. RANKING INDIVIDUAL

### Endpoint

**GET** `/api/ranking/individual`

**Query params:**
- `limit`: Cantidad de usuarios a retornar (default: 10, max: 1000)

### Criterios

**Usuarios incluidos:**
- Que tengan al menos 1 programa comprado (`isPurchased: true`)
- Que estén activos (`status: true`)

**Programas considerados:**
- `tia`
- `tia_summer`
- `tmd`

**Orden:**
- Por `level.experienceTotal` descendente (mayor a menor)

### Query MongoDB

```javascript
const users = await User.find({
  $or: [
    { "programs.tmd.isPurchased": true },
    { "programs.tia.isPurchased": true },
    { "programs.tia_summer.isPurchased": true }
  ],
  status: true
})
.sort({ 'level.experienceTotal': -1 })
.limit(limit)
.select('level profile username enterprise profilePhotoUrl');
```

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
    name: censor(this.profile.name),        // Oculta parte del nombre
    username: this.username,
    photo: this.profilePhotoUrl,
    enterprise: censor(this.enterprise?.name) || "",  // Oculta parte de empresa
    points: this.level.experienceTotal,
    level: this.level.currentLevel
  };
};
```

### Privacidad - Profanity Filter

**Helper:** `src/helpers/profanityChecker.js`

El helper `censor()` oculta parcialmente información personal:

```javascript
const censor = (text) => {
  if (!text) return "";

  // Ejemplo: "Juan Pérez" → "Juan ****"
  const words = text.split(" ");
  if (words.length > 1) {
    return words[0] + " " + "*".repeat(words.slice(1).join(" ").length);
  }

  // "Microsoft" → "Micr****"
  if (text.length > 4) {
    return text.slice(0, 4) + "*".repeat(text.length - 4);
  }

  return text;
};
```

---

## 👥 2. RANKING POR EQUIPOS

### Endpoint

**GET** `/api/ranking/team/:programName`

**Params:**
- `programName`: `tia` | `tia_summer` | `tmd`

### Criterios

**Usuarios incluidos:**
- Que tengan el programa específico comprado
- Que estén asignados a un equipo en ese programa

**Agrupación:**
- Por `teamName` del programa

**Orden:**
- Por `totalPoints` descendente (suma de XP de todos los miembros)

### Lógica de Agregación

```javascript
const users = await User.find({
  [`programs.${programName}.isPurchased`]: true
});

const teams = {};

users.forEach(user => {
  const teamInfo = user.teams.find(team => team.programName === programName);
  if (!teamInfo || !teamInfo.teamName) return;

  const teamName = teamInfo.teamName;
  if (!teams[teamName]) {
    teams[teamName] = {
      team: teamName,
      members: [],
      totalPoints: 0
    };
  }

  const details = user.getRankingUserDetails();
  teams[teamName].members.push(details);
  teams[teamName].totalPoints += details.points;
});

const teamRanking = Object.values(teams)
  .sort((a, b) => b.totalPoints - a.totalPoints)
  .map((team, index) => ({
    position: index + 1,
    team: team.team,
    points: team.totalPoints,
    members: team.members
  }));
```

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

## 📐 3. MODELO DE DATOS - TEAMS

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

## 🎯 4. CASOS DE USO

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

## 📊 5. FLUJOS COMPLETOS

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
  ├─ Validar limit (1-1000)
  ├─ Query usuarios con programas comprados
  ├─ Sort por experienceTotal desc
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
  ├─ Validar programName (tia, tia_summer, tmd)
  ├─ Query usuarios con programa comprado
  └─ Filtrar por teams
  ↓
Agrupar por teamName
  ├─ Crear objeto teams {}
  ├─ Para cada usuario:
  │   ├─ Buscar teamInfo del programa
  │   ├─ Agregar a teams[teamName].members
  │   └─ Sumar a teams[teamName].totalPoints
  └─ Convertir a array y ordenar por totalPoints
  ↓
Response: { success: true, data: [...] }
  ↓
Frontend renderiza ranking de equipos
  └─ Mostrar total de equipo + lista de miembros
```

---

## 🔒 6. SEGURIDAD Y PRIVACIDAD

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
- Max 1000 usuarios por request (previene carga excesiva)
- Validación de limit en controller

**Equipos:**
- Sin límite artificial (depende de cantidad de equipos)
- Típicamente: 2-10 equipos por programa

---

## 📌 NOTAS TÉCNICAS

### Performance

**Índices MongoDB:**
```javascript
// En userSchema
user.index({ 'level.experienceTotal': -1 });
user.index({ 'programs.tia.isPurchased': 1 });
user.index({ 'programs.tia_summer.isPurchased': 1 });
user.index({ 'programs.tmd.isPurchased': 1 });
```

**Optimización de Query:**
- `.select()` para limitar campos retornados
- Sin populate (no es necesario)
- Sort en base de datos (no en aplicación)

### Caching

**No implementado actualmente**, pero podría agregarse:

```javascript
// Pseudo-código
const cacheKey = `ranking:individual:${limit}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const ranking = await calculateRanking();
await redis.set(cacheKey, JSON.stringify(ranking), 'EX', 300); // 5 min
```

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

## 📊 7. MÉTRICAS Y ANALYTICS

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

**© STANNUM 2025**
