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
  username: String (3-30 caracteres, único),
  email: String (único, validado),
  password: String (hasheado, min 8 caracteres),
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
  achievements: [ ... ],
  unlockedCovers: [ ... ],

  // Programas
  programs: {
    tia: { ... },
    tia_summer: { ... },
    tmd: { ... }
  },

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

  // OTP
  otp: {
    recoveryOtp: String (6 dígitos),
    otpExpiresAt: Date
  }
}
```

---

## 📸 2. FOTO DE PERFIL

### Subida de Foto

**Endpoint:** `POST /api/profile-photo/upload`

**Content-Type:** `multipart/form-data`

**Body:**
- `image`: Archivo (max 5MB, formatos: jpg, jpeg, png)

**Proceso:**
```
Usuario selecciona foto
  ↓
Frontend → multipart/form-data
  ↓
Multer middleware procesa el archivo
  ├─ Validar tamaño (max 5MB)
  ├─ Validar formato (jpg, jpeg, png)
  └─ Validar dimensiones mínimas
  ↓
Sharp procesa imagen
  ├─ Resize proporcional (max 800x800)
  ├─ Optimización de calidad
  └─ Convertir a buffer
  ↓
Subir a AWS S3
  ├─ Key: profile-photos/{userId}.jpg
  ├─ ContentType: image/jpeg
  └─ ACL: public-read
  ↓
Actualizar user
  ├─ preferences.hasProfilePhoto = true
  └─ Save
  ↓
Response: { photoUrl: "https://s3.../userId.jpg" }
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

### Eliminar Foto

**Endpoint:** `DELETE /api/profile-photo/delete`

**Proceso:**
```
Usuario elimina foto
  ↓
DELETE /api/profile-photo/delete
  ↓
Eliminar de S3
  ├─ S3 deleteObject
  └─ Key: profile-photos/{userId}.jpg
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

### Búsqueda Fuzzy con Fuse.js

**Configuración:**
```javascript
const fuseOptions = {
  keys: ['username', 'profile.name', 'enterprise.name', 'enterprise.jobPosition'],
  threshold: 0.4,          // Tolerancia a errores de tipeo
  includeScore: true,
  minMatchCharLength: 2
};

const fuse = new Fuse(users, fuseOptions);
const results = fuse.search(query);
```

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
userSchema.index({
  username: 'text',
  'profile.name': 'text',
  'enterprise.name': 'text',
  'enterprise.jobPosition': 'text'
});
```

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

**Uso:** Sidebar con datos mínimos

**Retorna:**
```javascript
{
  id: this._id,
  username: this.username,
  profilePhoto: this.profilePhotoUrl
}
```

---

### getFullUserDetails()

**Uso:** Datos completos del usuario autenticado

**Retorna:**
```javascript
{
  id: this._id,
  username: this.username,
  profilePhoto: this.profilePhotoUrl,
  profile: {
    name: censor(this.profile.name),
    country: this.profile.country,
    region: this.profile.region,
    birthdate: this.profile.birthdate,
    aboutMe: censor(this.profile.aboutMe),
    socialLinks: this.profile.socialLinks
  },
  enterprise: {
    name: censor(this.enterprise?.name),
    jobPosition: censor(this.enterprise?.jobPosition)
  },
  teams: this.teams,
  level: this.level,
  achievements: this.achievements,
  programs: this.programs,
  dailyStreak: {
    count: effectiveCount,
    lastActivityLocalDate: this.dailyStreak?.lastActivityLocalDate,
    timezone: tz
  },
  xpHistory: this.xpHistory,
  unlockedCovers: this.unlockedCovers,
  preferences: this.preferences,
  favorites: this.favorites
}
```

---

### getRankingUserDetails()

**Uso:** Datos para rankings (con censura)

**Retorna:**
```javascript
{
  id: this._id,
  name: censor(this.profile.name),
  username: this.username,
  photo: this.profilePhotoUrl,
  enterprise: censor(this.enterprise?.name) || "",
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
  enterprise: censor(this.enterprise?.name) || null,
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
  data: user.getFullUserDetails(),
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
Frontend: validación de tamaño (max 5MB)
  ↓
POST /api/profile-photo/upload (multipart/form-data)
  ↓
Multer procesa archivo
  ├─ Validar formato
  ├─ Validar tamaño
  └─ Leer buffer
  ↓
Sharp procesa imagen
  ├─ Resize a max 800x800 (proporcional)
  ├─ Optimizar calidad (80%)
  └─ Convertir a JPEG
  ↓
Subir a S3
  ├─ Key: profile-photos/{userId}.jpg
  ├─ ContentType: image/jpeg
  └─ ACL: public-read
  ↓
Actualizar user
  ├─ preferences.hasProfilePhoto = true
  └─ Save
  ↓
Response: { photoUrl: "https://s3..." }
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
user.getFullUserDetails()
  ├─ Aplicar censor() a datos personales
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
// Búsqueda de texto
userSchema.index({
  username: 'text',
  'profile.name': 'text',
  'enterprise.name': 'text',
  'enterprise.jobPosition': 'text'
});

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

**© STANNUM 2025**
