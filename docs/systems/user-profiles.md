# Sistema de User Profiles - STANNUM Game

El sistema de perfiles de usuario permite a los estudiantes personalizar su presencia en la plataforma con información personal, profesional, social y foto de perfil. Sistema completo con privacidad, búsqueda y tutorials.

## 📊 Visión General

Cada usuario tiene un perfil completo que incluye:

- ✅ Información personal (nombre, país, región, fecha de nacimiento)
- ✅ Información profesional (empresa, puesto)
- ✅ Biografía ("About Me")
- ✅ Links a redes sociales (max 5)
- ✅ Foto de perfil (subida a S3)
- ✅ Username único
- ✅ Estado de tutorials completados
- ✅ Preferencias de notificaciones

---

## 👤 1. MODELO DE DATOS - USER

### Schema Completo

**Archivo:** `src/models/userModel.js`

```javascript
{
  // Autenticación
  username: String (6-25 caracteres, único),
  email: String (único, validado),
  password: String (hasheado, min 8 caracteres),
  passwordChangedAt: Date (default null),
  lastLogin: Date (default null),   // Última autenticación exitosa (ver más abajo)
  role: Enum ['USER', 'ADMIN'],
  status: Boolean (true = activo),

  // Perfil Personal
  profile: {
    name: String (2-50 caracteres),
    country: String (max 50),
    region: String (max 50),
    birthdate: Date (debe ser mayor de 18),
    aboutMe: String (max 2600 caracteres),
    socialLinks: [
      {
        platform: Enum [
          'LinkedIn', 'Instagram', 'Twitter', 'TikTok',
          'Facebook', 'YouTube', 'GitHub', 'Website', 'Otra'
        ],
        url: String (URL válida)
      }
    ] (max 5)
  },

  // Empresa
  enterprise: {
    name: String (max 100),
    jobPosition: String (max 50)
  },
  // Nota: enterprise.name siempre se retorna en UPPERCASE desde el backend.
  // Los métodos getRankingUserDetails(), getFullUserDetails(),
  // getPublicUserDetails() y getSearchUserDetails() aplican
  // .toUpperCase() a enterprise.name antes de retornarlo.

  // Teams
  teams: [
    {
      programName: String,
      teamName: String,
      role: String
    }
  ],

  // Gamificación
  level: { ... },
  dailyStreak: { ... },
  xpHistory: [ ... ],
  achievements: [
    {
      achievementId: String (required: [true, "Achievement ID is required"]),
      ...
    }
  ],
  // Moneda virtual
  coins: Number (default: 0),
  coinsHistory: [coinsEventSchema],

  // Covers
  equippedCoverId: String (default: 'default'),
  unlockedCovers: [{ coverId, unlockedDate }],

  // Programas (sub-documentos definidos en programSchema)
  programs: {
    tia: { ... },
    tia_summer: { ... },
    tia_pool: { ... },
    tmd: { ... },
    trenno_ia: { ... }   // Programa por suscripción
  },
  // Nota: demo_trenno está en DEMO_PROGRAMS (programRegistry) pero no tiene
  // sub-documento dedicado en el userSchema. Su acceso se gestiona externamente.

  // Nota: Cada programa incluye campos de suscripción (para trenno_ia):
  // programs.trenno_ia.subscription: {
  //   status: 'pending' | 'active' | 'paused' | 'cancelled' | 'expired' | null,
  //   mpSubscriptionId: String,
  //   priceARS: Number,
  //   currentPeriodEnd: Date,
  //   subscribedAt: Date,
  //   cancelledAt: Date,
  //   lastPaymentAt: Date,
  //   lastWebhookAt: Date,
  //   pendingExpiresAt: Date,
  //   previousSubscriptionIds: [String]
  // }
  // Cada programa también tiene hasAccessFlag (Boolean denormalizado)
  // que es true cuando el usuario tiene acceso (compra o suscripción activa)

  // Preferencias
  preferences: {
    tutorials: [
      {
        name: String,
        isCompleted: Boolean,
        completedAt: Date
      }
    ],
    notificationsEnabled: Boolean,
    hasProfilePhoto: Boolean,
    isGoogleAccount: Boolean,
    allowPasswordLogin: Boolean
  },

  // Favoritos
  favorites: {
    prompts: [ObjectId],
    assistants: [ObjectId]
  },

  // OTP (recuperación de contraseña, ver authentication.md)
  otp: {
    recoveryOtp: String,           // 6 dígitos hasheados (HMAC-SHA256)
    otpExpiresAt: Date,             // 30 min desde creación
    recoveryVerified: Boolean       // true después de verify-recovery-otp
  },

  // Magic Link (auto-enroll, ver authentication.md)
  magicLink: {
    token: String,        // SHA-256 hash del raw token
    expiresAt: Date       // TTL: MAGIC_LINK_TTL_HOURS (default 72)
  },

  // Estado de feedback (NPS / onboarding)
  feedbackState: {
    lastNpsAt: Date,
    lastOnboardingFeedbackAt: Date
  },

  // Stats de comunidad
  communityStats: {
    promptsCount: Number,
    assistantsCount: Number,
    totalFavoritesReceived: Number
  }
}
```

**Nota sobre `toJSON`:** el transform del schema borra `password`, `otp`, `refreshToken` y `magicLink` antes de serializar, así que ninguno de estos campos sale en responses de la API.

### Tracking de último acceso (`lastLogin`)

`lastLogin: Date` (default `null`) registra la fecha/hora de la última autenticación exitosa. Se actualiza en **todos** los puntos de entrada de sesión (`src/controllers/authController.js`):

- `login` (password)
- `createUser` (registro — sesión inicial)
- `googleAuth` (login/registro con Google, usuario nuevo y existente)
- `completeActivation` (onboarding desde magic link)
- `refreshTokenHandler` (renovación de access token — se setea en el mismo `$set` atómico que rota el refresh token)

Se expone en los endpoints de admin (`/api/admin/user` y `/api/admin/users`, ver `adminController.js`) para diagnóstico de actividad de cuentas; no se censura porque solo lo consume el panel admin vía API key.

---

## 📸 2. FOTO DE PERFIL

### Subida de Foto (Presigned URL)

El sistema usa **URLs prefirmadas de S3** para la subida de fotos. El flujo es:

1. El cliente solicita una URL prefirmada al backend
2. El cliente sube la imagen directamente a S3 usando esa URL
3. El cliente confirma la subida al backend

**Proceso:**
```
Usuario selecciona foto
  ↓
POST /api/profile-photo/presign-photo
  ├─ Genera presigned URL con PutObjectCommand
  ├─ Key: {AWS_S3_FOLDER_NAME}/{userId}
  ├─ ContentType: image/jpeg
  └─ Expira en 300 segundos (5 minutos)
  ↓
Response: { presignedUrl: "https://s3.../..." }
  ↓
Frontend sube imagen directamente a S3 (PUT request a presignedUrl)
  ↓
POST /api/profile-photo/confirm-photo
  ├─ preferences.hasProfilePhoto = true
  └─ Save
  ↓
Response: { success: true }
```

### Virtual Property: profilePhotoUrl

```javascript
userSchema.virtual("profilePhotoUrl").get(function () {
  if (this.preferences.hasProfilePhoto) {
    return `${process.env.AWS_S3_BASE_URL}/${process.env.AWS_S3_FOLDER_NAME}/${this._id}`;
  }
  return null;
});
```

**Ejemplo:**
```
userId = "507f1f77bcf86cd799439011"
hasProfilePhoto = true

→ profilePhotoUrl = "https://stannumgame2025.s3.sa-east-1.amazonaws.com/profile-photos/507f1f77bcf86cd799439011"
```

### Fallback (InitialsAvatar)

Cuando `preferences.hasProfilePhoto` es `false`, el backend **no genera ninguna imagen**: `profilePhotoUrl` devuelve `null` y los endpoints `get-photo` / `get-photo/:username` responden `{ success: true, url: null }`. El frontend interpreta ese `null` y renderiza el componente **InitialsAvatar** (iniciales del nombre/username sobre fondo de color). No hay imagen placeholder en S3.

### Procesamiento con sharp

La subida del propio usuario (presign + PUT directo a S3) **no** pasa por sharp; el cliente sube el JPEG tal cual. El único caso donde el backend optimiza con `sharp` es al importar la foto de **Google** durante el login (`uploadGoogleProfilePhoto`): descarga la imagen, la redimensiona a máx. 1000x1000 (`fit: "inside"`, sin agrandar) y la convierte a JPEG calidad 80 antes de subirla a S3.

### Endpoints de Foto

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/profile-photo/presign-photo` | POST | Genera URL prefirmada para subir foto a S3 |
| `/api/profile-photo/confirm-photo` | POST | Confirma que la foto fue subida exitosamente |
| `/api/profile-photo/get-photo` | GET | Obtiene URL de foto del usuario autenticado |
| `/api/profile-photo/get-photo/:username` | GET | Obtiene URL de foto de un usuario por username |
| `/api/profile-photo/delete-photo` | DELETE | Elimina foto de perfil de S3 |

### Eliminar Foto

**Endpoint:** `DELETE /api/profile-photo/delete-photo`

**Proceso:**
```
Usuario elimina foto
  ↓
DELETE /api/profile-photo/delete-photo
  ↓
Eliminar de S3
  ├─ S3 deleteObject
  └─ Key: {AWS_S3_FOLDER_NAME}/{userId}
  ↓
Actualizar user
  ├─ preferences.hasProfilePhoto = false
  └─ Save
  ↓
Response: { success: true }
```

---

## ✏️ 3. EDICIÓN DE PERFIL

### Endpoint

**PUT** `/api/user/edit`

### Campos Editables

```json
{
  "name": "Juan Carlos Pérez",
  "birthdate": "1990-01-15",
  "country": "Argentina",
  "region": "Buenos Aires",
  "enterprise": "Mi Empresa S.A.",
  "enterpriseRole": "Senior Developer",
  "aboutme": "Desarrollador full stack con 10 años de experiencia...",
  "socialLinks": [
    {
      "platform": "LinkedIn",
      "url": "https://linkedin.com/in/usuario"
    },
    {
      "platform": "GitHub",
      "url": "https://github.com/usuario"
    }
  ]
}
```

### Validaciones

| Campo | Validación |
|-------|------------|
| `name` | 2-50 caracteres, solo letras y espacios |
| `birthdate` | Mayor de 18 años, no futuro |
| `country` | Max 50 caracteres |
| `region` | Max 50 caracteres |
| `enterprise` | Max 100 caracteres |
| `enterpriseRole` | Max 50 caracteres |
| `aboutme` | Max 2600 caracteres |
| `socialLinks` | Array, max 5 items |
| `socialLinks[].platform` | Enum válido |
| `socialLinks[].url` | URL válida (http/https) |

### Achievement: profile_completed

Al completar el perfil por primera vez se desbloquea el achievement `profile_completed` (50 XP):

```javascript
const isProfileComplete = !!name && !!birthdate && !!country &&
                          !!region && !!aboutme &&
                          !!enterprise && !!enterpriseRole;

if (isProfileComplete) {
  const { newlyUnlocked } = await unlockAchievements(user);
  // Puede desbloquear "profile_completed"
}
```

---

## 🔍 4. BÚSQUEDA DE USUARIOS

### Endpoint

**GET** `/api/user/search-users`

**Query params:**
- `query`: Término de búsqueda (min 2 caracteres)

### Estrategia: MongoDB text search + Fuse.js fuzzy

La búsqueda corre en dos pasos para combinar performance (MongoDB) con tolerancia a typos (Fuse.js):

**Paso 1 — pre-filtro con MongoDB text index** (cap 50 resultados, excluyendo al usuario actual):

```javascript
const users = await User.find({
  $text: { $search: query },
  _id: { $ne: userId }
})
  .select('username profilePhoto profile.name enterprise.name enterprise.jobPosition')
  .limit(50);
```

**Paso 2 — re-ranking fuzzy con Fuse.js** sobre los resultados del paso 1, mapeados via `getSearchUserDetails()`:

```javascript
const fuse = new Fuse(users.map(u => u.getSearchUserDetails()), {
  keys: ["username", "name", "enterprise", "jobPosition"],
  threshold: 0.3,           // Tolerancia a errores de tipeo
  findAllMatches: true,
  includeScore: true,
  ignoreLocation: true,
  ignoreDiacritics: true,
});

const results = fuse.search(query).map(r => r.item);
```

> **Importante:** las `keys` de Fuse.js usan los nombres mapeados (`name`, `enterprise`, `jobPosition`) tras `getSearchUserDetails()`, no los paths originales del schema (`profile.name`, `enterprise.name`, `enterprise.jobPosition`).

**Ejemplo:**
```bash
GET /api/user/search-users?query=juan
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "username": "juanperez",
      "name": "Juan Pérez",
      "profilePhoto": "https://...",
      "enterprise": "Microsoft",
      "jobPosition": "Developer"
    }
  ]
}
```

### Campos Buscables

- `username`
- `profile.name`
- `enterprise.name`
- `enterprise.jobPosition`

### Índice de Búsqueda

```javascript
userSchema.index(
  { username: 'text', 'profile.name': 'text', 'enterprise.name': 'text', 'enterprise.jobPosition': 'text' },
  { weights: { username: 10, 'profile.name': 5, 'enterprise.name': 2, 'enterprise.jobPosition': 1 } }
);
```

Los resultados de búsqueda de texto se ponderan por relevancia: las coincidencias con `username` pesan 10x más que las de `enterprise.jobPosition`, haciendo que las búsquedas por username sean las más relevantes. `profile.name` tiene peso 5, y `enterprise.name` peso 2.

---

## 👁️ 5. PERFILES PÚBLICOS

### Endpoint

**GET** `/api/user/profile/:username`

**Ejemplo:**
```bash
GET /api/user/profile/usuario123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "username": "usuario123",
    "profilePhoto": "https://...",
    "profile": {
      "name": "Juan ****",        // Censurado
      "country": "Argentina",
      "region": "Buenos Aires",
      "aboutMe": "Desarrollador...",
      "socialLinks": [...]
    },
    "enterprise": {
      "name": "Micr****",         // Censurado
      "jobPosition": "Developer"
    },
    "level": {
      "currentLevel": 10,
      "experienceTotal": 5000
    },
    "achievements": [...],
    "dailyStreak": {
      "count": 7
    }
  }
}
```

**Nota:** Los datos personales se censuran con `censor()` para privacidad.

---

## 🎓 6. SISTEMA DE TUTORIALS

### ¿Qué son los Tutorials?

Guías interactivas (onboarding) que se muestran al usuario la primera vez que accede a una funcionalidad.

### Modelo de Datos

```javascript
preferences: {
  tutorials: [
    {
      name: String (2-50 caracteres),
      isCompleted: Boolean,
      completedAt: Date
    }
  ]
}
```

### Tutorial por Defecto

```javascript
// Al crear usuario
preferences: {
  tutorials: [
    {
      name: "initial_tutorial",
      isCompleted: false,
      completedAt: null
    }
  ]
}
```

### Obtener Estado de Tutorial

**GET** `/api/user/tutorial/:tutorialName`

**Response:**
```json
{
  "success": true,
  "tutorial": {
    "name": "initial_tutorial",
    "isCompleted": true,
    "completedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

### Marcar Tutorial Como Completado

**POST** `/api/user/tutorial/:tutorialName/complete`

**Lógica:**
```javascript
const tutorial = user.preferences.tutorials.find(t => t.name === tutorialName);

if (!tutorial) {
  return res.status(404).json(getError("VALIDATION_TUTORIAL_NOT_FOUND"));
}

if (tutorial.isCompleted) {
  return res.status(400).json(getError("TUTORIAL_ALREADY_COMPLETED"));
}

tutorial.isCompleted = true;
tutorial.completedAt = new Date();
await user.save();
```

### Uso en Frontend

```typescript
// Al entrar a una sección
const { isCompleted } = await getTutorialStatus("initial_tutorial");

if (!isCompleted) {
  // Mostrar tutorial con driver.js
  showTutorial();

  // Al finalizar
  await markTutorialAsCompleted("initial_tutorial");
}
```

---

## 📊 7. MÉTODOS DEL USER SCHEMA

### getUserSidebarDetails()

**Uso:** Sidebar (request frecuente, payload mínimo)

**Endpoint:** `GET /api/user/sidebar-details`

**Retorna:**
```javascript
{
  id: this._id,
  username: this.username,
  profilePhoto: this.profilePhotoUrl,
  coins: this.coins || 0,
  hasActiveSubscription: Boolean   // true si trenno_ia tiene status active|paused|cancelled
}
```

---

### getGameUserDetails()

**Uso:** Datos completos del usuario autenticado, optimizado para el game frontend (filtra campos internos).

**Endpoints que lo usan:** `GET /api/user/`, `GET /api/user/profile/:username` (cuando es el propio usuario), `PUT /api/user/edit` (en la response).

**Retorna:**
```javascript
{
  id, username, profilePhoto,
  profile: {
    ...this.profile,
    name: censor(...),
    aboutMe: censor(...),
  },
  enterprise: {
    name: (censor(name) || "").toUpperCase(),
    jobPosition: censor(jobPosition),
  },
  level, achievements,
  dailyStreak: {
    count: effectiveCount,         // 0 si la racha está rota
    lastActivityLocalDate, timezone,
    shields, lostCount,
    recoveryAvailable: Boolean,    // true si lostCount && lostAt && dentro de STREAK_RECOVERY_WINDOW_MS
    recoveryExpiresAt: ISO string,
  },
  coins,
  equippedCoverId, unlockedCovers,
  favorites: { prompts: <count>, assistants: <count> },  // counts, no IDs
  communityStats: { promptsCount, assistantsCount, totalFavoritesReceived },
  feedbackState: { lastNpsAt, lastOnboardingFeedbackAt },
  programs: {                    // sanitizados (sin observations completas, sin payload privado)
    [progId]: {
      isPurchased, hasAccessFlag, acquiredAt,
      instructions: [{ instructionId, status, score, observations, xpGained, startDate, submittedAt, estimatedTimeSec, referencedLessons }],
      lessonsCompleted, lastWatchedLesson, chestsOpened,
      subscription: { status }    // solo si hay suscripción activa, NO expone mpSubscriptionId
    }
  }
}
```

---

### getFullUserDetails()

**Uso:** Datos internos del schema (admin / debugging). No se expone directamente en endpoints públicos del game frontend.

**Diferencia con getGameUserDetails():** incluye `xpHistory` completo, `coinsHistory`, `preferences` completas, `teams`, y los `programs` sin sanitizar (con `subscription.mpSubscriptionId`, `previousSubscriptionIds`, etc).

---

### getPublicUserDetails()

**Uso:** Perfil público de otro usuario.

**Endpoint:** `GET /api/user/profile/:username` (cuando NO es el propio usuario).

**Retorna campos públicos** (con censura aplicada): `id, username, profilePhoto, profile, enterprise, teams, level, achievements, programs (sanitizados), dailyStreak.count, coins, equippedCoverId, unlockedCovers`.

`programs[*].subscription` se sanea: solo expone `status, priceARS, currentPeriodEnd, subscribedAt, cancelledAt` (NO `mpSubscriptionId`).

Si el usuario tiene acceso a algún `RANKABLE_PROGRAMS`, se agrega `rankingPosition` (calculado vía `User.countDocuments` con `level.experienceTotal > X`).

---

### getRankingUserDetails()

**Uso:** Datos para rankings (con censura + UPPERCASE en enterprise)

**Retorna:**
```javascript
{
  id: this._id,
  name: censor(this.profile.name),
  username: this.username,
  photo: this.profilePhotoUrl,
  enterprise: (censor(this.enterprise?.name) || "").toUpperCase(),
  points: this.level.experienceTotal,
  level: this.level.currentLevel
}
```

---

### getSearchUserDetails()

**Uso:** Resultados de búsqueda

**Retorna:**
```javascript
{
  id: this._id,
  username: this.username,
  name: censor(this.profile.name),
  profilePhoto: this.profilePhotoUrl,
  enterprise: (censor(this.enterprise?.name) || "").toUpperCase() || null,
  jobPosition: censor(this.enterprise?.jobPosition) || null
}
```

---

## 🔐 8. PRIVACIDAD Y CENSURA

### Función censor()

**Archivo:** `src/helpers/profanityChecker.js`

**Propósito:** Ocultar parcialmente datos personales en perfiles públicos y rankings.

**Lógica:**
```javascript
const censor = (text) => {
  if (!text) return "";

  // Para nombres con múltiples palabras: mostrar solo primera
  const words = text.split(" ");
  if (words.length > 1) {
    return words[0] + " " + "*".repeat(words.slice(1).join(" ").length);
  }

  // Para palabras simples: mostrar primeros 4 caracteres
  if (text.length > 4) {
    return text.slice(0, 4) + "*".repeat(text.length - 4);
  }

  return text;
};
```

**Ejemplos:**
```javascript
censor("Juan Pérez González")  // → "Juan ****"
censor("Microsoft Corporation") // → "Micr****"
censor("Ana")                   // → "Ana"
```

### Datos Censurados

| Campo | Público | Censurado |
|-------|---------|-----------|
| Username | ✅ Siempre visible | ❌ |
| Name | ❌ | ✅ Parcial |
| Enterprise.name | ❌ | ✅ Parcial |
| Enterprise.jobPosition | ✅ Completo | ❌ |
| About Me | ❌ | ✅ Parcial |
| Level/XP | ✅ Completo | ❌ |
| ProfilePhoto | ✅ Completo | ❌ |

---

## 🔗 9. SOCIAL LINKS

### Plataformas Soportadas

```javascript
enum Platform {
  'LinkedIn',
  'Instagram',
  'Twitter',
  'TikTok',
  'Facebook',
  'YouTube',
  'GitHub',
  'Website',
  'Otra'
}
```

### Schema

```javascript
socialLinks: [
  {
    platform: String (enum),
    url: String (URL válida con http/https)
  }
] (max 5)
```

### Validación de URLs

```javascript
check("socialLinks.*.url")
  .trim()
  .isURL({ protocols: ['http', 'https'], require_protocol: true })
  .withMessage("URL must start with http:// or https://")
  .isLength({ max: 500 });
```

### Ejemplo de Uso

```json
{
  "socialLinks": [
    {
      "platform": "LinkedIn",
      "url": "https://linkedin.com/in/juanperez"
    },
    {
      "platform": "GitHub",
      "url": "https://github.com/juanperez"
    },
    {
      "platform": "Website",
      "url": "https://juanperez.com"
    }
  ]
}
```

---

## 📋 10. FLUJOS COMPLETOS

### Flujo: Completar Perfil

```
Usuario registrado sin perfil completo
  ↓
Frontend: redirect a /register/complete-profile
  ↓
Usuario llena formulario
  ├─ Name
  ├─ Birthdate (validar +18 años)
  ├─ Country & Region
  ├─ Enterprise & Role
  ├─ About Me
  └─ Social Links (opcional)
  ↓
PUT /api/user/edit
  ↓
Validaciones backend
  ├─ express-validator
  ├─ Age >= 18
  └─ Social links max 5
  ↓
Actualizar user
  ↓
Verificar completitud
  if (isProfileComplete) {
    unlockAchievements(user)
    → Desbloquea "profile_completed" (50 XP)
  }
  ↓
Response: {
  success: true,
  data: user.getGameUserDetails(),
  achievementsUnlocked: [...]
}
  ↓
Frontend:
  ├─ Mostrar confetti (achievement)
  └─ Redirect a /dashboard
```

---

### Flujo: Subir Foto de Perfil

```
Usuario hace click en "Subir foto"
  ↓
Selector de archivo (jpg, jpeg, png)
  ↓
POST /api/profile-photo/presign-photo
  ↓
Backend genera presigned URL
  ├─ PutObjectCommand con key: {folder}/{userId}
  ├─ ContentType: image/jpeg
  └─ Expiración: 300 segundos
  ↓
Response: { presignedUrl: "https://s3..." }
  ↓
Frontend sube imagen a S3
  ├─ PUT request directo a presignedUrl
  └─ Headers: Content-Type: image/jpeg
  ↓
POST /api/profile-photo/confirm-photo
  ↓
Actualizar user
  ├─ preferences.hasProfilePhoto = true
  └─ Save
  ↓
Response: { success: true }
  ↓
Frontend: mostrar foto inmediatamente
```

---

### Flujo: Ver Perfil Público

```
Usuario hace click en otro usuario
  ↓
GET /api/user/profile/:username
  ↓
Buscar usuario por username
  ↓
isOwner ? user.getGameUserDetails() : user.getPublicUserDetails()
  ├─ Aplicar censor() a datos personales (perfil ajeno)
  └─ Retornar datos públicos
  ↓
Response: {
  success: true,
  data: { ... }
}
  ↓
Frontend: renderizar perfil
  ├─ Foto, username, level
  ├─ Enterprise (censurado)
  ├─ About Me (censurado)
  ├─ Social Links
  └─ Achievements visibles
```

---

## 📌 NOTAS TÉCNICAS

### Índices de Performance

```javascript
// Búsqueda de texto (con pesos de relevancia)
userSchema.index(
  { username: 'text', 'profile.name': 'text', 'enterprise.name': 'text', 'enterprise.jobPosition': 'text' },
  { weights: { username: 10, 'profile.name': 5, 'enterprise.name': 2, 'enterprise.jobPosition': 1 } }
);

// Favoritos
userSchema.index({ 'favorites.assistants': 1 });
userSchema.index({ 'favorites.prompts': 1 });

// Username único
userSchema.index({ username: 1 }, { unique: true });
```

### Virtual Fields

**profilePhotoUrl** es un virtual field (no se guarda en DB):

```javascript
userSchema.virtual("profilePhotoUrl").get(function () {
  if (this.preferences.hasProfilePhoto) {
    return `${process.env.AWS_S3_BASE_URL}/${process.env.AWS_S3_FOLDER_NAME}/${this._id}`;
  }
  return null;
});
```

Configurar para incluir en JSON:

```javascript
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });
```

### AWS S3 Configuration

**Variables de entorno:**
```env
AWS_S3_BASE_URL=https://stannumgame2025.s3.sa-east-1.amazonaws.com
AWS_S3_FOLDER_NAME=profile-photos
AWS_BUCKET_NAME=stannumgame2025
AWS_REGION=sa-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

---

**© STANNUM 2026**
