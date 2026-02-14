# API Reference - STANNUM Game

Documentación completa de todos los endpoints del backend de STANNUM Game.

**Base URL:** `http://localhost:8000/api` (desarrollo) | `https://api.stannumgame.com/api` (producción)

**Autenticación:** JWT token en header `Authorization: Bearer {token}`

---

## 📑 Índice

1. [Autenticación](#autenticación)
2. [Usuario](#usuario)
3. [Lecciones](#lecciones)
4. [Instrucciones](#instrucciones)
5. [Product Keys](#product-keys)
6. [Rankings](#rankings)
7. [Prompts](#prompts-comunidad)
8. [Assistants](#assistants-comunidad)
9. [Profile Photo](#profile-photo)

---

## 🔐 Autenticación

### POST `/auth`
**Login con email y contraseña**

**Body:**
```json
{
  "email": "usuario@example.com",
  "password": "contraseña123"
}
```

**Response 200:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "achievementsUnlocked": [],
  "profileStatus": "complete" | "incomplete"
}
```

---

### POST `/auth/register`
**Registro de cuenta nueva**

**Body:**
```json
{
  "username": "usuario123",
  "email": "usuario@example.com",
  "password": "contraseña123",
  "recaptchaToken": "token_de_recaptcha"
}
```

**Response 201:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "507f1f77bcf86cd799439011"
}
```

---

### POST `/auth/google`
**Login con Google OAuth**

**Body:**
```json
{
  "googleToken": "token_de_google_oauth"
}
```

**Response 200:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "achievementsUnlocked": [],
  "profileStatus": "complete" | "incomplete",
  "newUser": true | false
}
```

---

### GET `/auth/auth-user`
**Obtener usuario autenticado (verificar token)**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "achievementsUnlocked": [],
  "profileStatus": "complete" | "incomplete"
}
```

---

### POST `/auth/logout`
**Cerrar sesión**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Sesión cerrada exitosamente"
}
```

---

### POST `/auth/recovery-password`
**Solicitar OTP para recuperación de contraseña**

**Body:**
```json
{
  "email": "usuario@example.com"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "OTP enviado al correo"
}
```

---

### POST `/auth/verify-otp`
**Verificar OTP**

**Body:**
```json
{
  "email": "usuario@example.com",
  "otp": "123456"
}
```

**Response 200:**
```json
{
  "success": true,
  "token": "temporal_token_for_password_reset"
}
```

---

### POST `/auth/reset-password`
**Resetear contraseña con token temporal**

**Body:**
```json
{
  "token": "temporal_token",
  "newPassword": "nueva_contraseña"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Contraseña actualizada"
}
```

---

## 👤 Usuario

### GET `/user`
**Obtener datos completos del usuario autenticado**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "usuario123",
    "profilePhoto": "https://s3.../profile.jpg",
    "profile": {
      "name": "Juan Pérez",
      "country": "Argentina",
      "region": "Buenos Aires",
      "birthdate": "1990-01-01",
      "aboutMe": "...",
      "socialLinks": [...]
    },
    "enterprise": {
      "name": "Mi Empresa",
      "jobPosition": "Developer"
    },
    "teams": [...],
    "level": {
      "currentLevel": 5,
      "experienceTotal": 1500,
      "experienceCurrentLevel": 900,
      "experienceNextLevel": 1400,
      "progress": 75
    },
    "achievements": [...],
    "programs": {...},
    "dailyStreak": {
      "count": 7,
      "lastActivityLocalDate": "2025-01-15",
      "timezone": "America/Argentina/Buenos_Aires"
    },
    "xpHistory": [...],
    "unlockedCovers": [...],
    "preferences": {...},
    "favorites": {
      "prompts": [...],
      "assistants": [...]
    }
  }
}
```

---

### GET `/user/sidebar-details`
**Obtener detalles mínimos para sidebar**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "usuario123",
    "profilePhoto": "https://s3.../profile.jpg"
  }
}
```

---

### GET `/user/profile/:username`
**Obtener perfil público de usuario**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "usuario123",
    "profilePhoto": "https://s3.../profile.jpg",
    "profile": {...},
    "enterprise": {...},
    "level": {...},
    "achievements": [...],
    "dailyStreak": {...}
  }
}
```

---

### PUT `/user/edit`
**Actualizar perfil de usuario**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "name": "Juan Carlos Pérez",
  "birthdate": "1990-01-01",
  "country": "Argentina",
  "region": "Buenos Aires",
  "enterprise": "Mi Empresa S.A.",
  "enterpriseRole": "Senior Developer",
  "aboutme": "Desarrollador full stack...",
  "socialLinks": [
    {
      "platform": "LinkedIn",
      "url": "https://linkedin.com/in/usuario"
    }
  ]
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Perfil actualizado correctamente"
}
```

---

### GET `/user/search-users`
**Buscar usuarios**

**Headers:** `Authorization: Bearer {token}`

**Query params:**
- `query`: Término de búsqueda (min 2 caracteres)

**Response 200:**
```json
{
  "success": true,
  "users": [
    {
      "id": "507f1f77bcf86cd799439011",
      "username": "usuario123",
      "name": "Juan Pérez",
      "profilePhoto": "https://...",
      "enterprise": "Mi Empresa",
      "jobPosition": "Developer"
    }
  ]
}
```

---

### GET `/user/tutorial/:tutorialName`
**Obtener estado de tutorial**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "isCompleted": true,
  "completedAt": "2025-01-15T10:30:00.000Z"
}
```

---

### POST `/user/tutorial/:tutorialName/complete`
**Marcar tutorial como completado**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Tutorial marcado como completado"
}
```

---

## 🎬 Lecciones

### POST `/lesson/complete/:programName/:lessonId`
**Completar lección y ganar XP**

**Headers:** `Authorization: Bearer {token}`

**Params:**
- `programName`: `tia` | `tia_summer` | `tmd`
- `lessonId`: ID de la lección (ej: `TIAM01L01`)

**Response 200:**
```json
{
  "success": true,
  "message": "Lección marcada como completada",
  "gained": 158,
  "streakBonus": 25,
  "totalGain": 183,
  "newLevel": 5,
  "achievementsUnlocked": [
    {
      "achievementId": "first_lesson_completed",
      "unlockedAt": "2025-01-15T10:30:00.000Z",
      "xpReward": 50
    }
  ]
}
```

---

### PATCH `/lesson/lastwatched/:programName/:lessonId`
**Guardar progreso de video (último visto)**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "currentTime": 125.5
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Última lección vista actualizada"
}
```

---

## 📝 Instrucciones

### POST `/instruction/start/:programName/:instructionId`
**Iniciar instrucción**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Instrucción iniciada correctamente"
}
```

**Errors:**
- `403`: Instrucción bloqueada (lección previa no completada)
- `400`: Instrucción ya iniciada

---

### GET `/instruction/presigned-url/:programName/:instructionId`
**Obtener URL firmada para subir archivo a S3**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "fileName": "captura.png",
  "contentType": "image/png"
}
```

**Response 200:**
```json
{
  "success": true,
  "presignedUrl": "https://s3...presigned-url",
  "s3Key": "instructions/userId/instructionId/timestamp.png"
}
```

**Uso:**
```javascript
// Frontend: subir archivo directamente a S3
await axios.put(presignedUrl, file, {
  headers: { 'Content-Type': contentType }
});
```

---

### POST `/instruction/submit/:programName/:instructionId`
**Enviar instrucción completada**

**Headers:** `Authorization: Bearer {token}`

**Body (si deliverable = file):**
```json
{
  "s3Key": "instructions/userId/instructionId/timestamp.png"
}
```

**Body (si deliverable = text):**
```json
{
  "submittedText": "Mi respuesta detallada..."
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Instrucción entregada correctamente"
}
```

**Nota:** La calificación AI se ejecuta en background. El status cambiará a `GRADED` o `ERROR` automáticamente.

---

### POST `/instruction/retry/:programName/:instructionId`
**Reintentar calificación AI (si hubo error)**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Reintentando corrección automática"
}
```

---

### POST `/instruction/grade/:userId/:programName/:instructionId` (ADMIN)
**Calificar manualmente una instrucción**

**Headers:** `Authorization: Bearer {token}` (requiere rol ADMIN)

**Body:**
```json
{
  "score": 85,
  "observations": "Buen trabajo, pero faltó..."
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Instrucción calificada correctamente",
  "result": {
    "score": 85,
    "observations": "..."
  },
  "gained": 750,
  "streakBonus": 0,
  "totalGain": 750
}
```

---

## 🎟️ Product Keys

### POST `/product-key/activate`
**Activar código de producto**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "code": "ABCD-1234-EFGH-5678"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Producto activado exitosamente",
  "achievementsUnlocked": [
    {
      "achievementId": "first_program_acquired",
      "unlockedAt": "2025-01-15T10:30:00.000Z",
      "xpReward": 50
    }
  ],
  "product": {
    "code": "ABCD-1234-EFGH-5678",
    "product": "tia",
    "team": "equipo_alpha"
  }
}
```

**Errors:**
- `404`: Código no encontrado
- `400`: Código ya usado
- `400`: Usuario ya tiene el programa

---

### GET `/product-key/keys` (ADMIN)
**Listar todas las product keys**

**Headers:** `Authorization: Bearer {token}` (requiere rol ADMIN)

**Query params:**
- `used`: `true` | `false` (opcional)
- `product`: `tia` | `tia_summer` | `tmd` (opcional)
- `page`: número de página (default: 1)
- `limit`: límite por página (default: 50, max: 100)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "code": "ABCD-1234-EFGH-5678",
      "product": "tia",
      "team": "equipo_alpha",
      "used": true,
      "usedAt": "2025-01-15T10:30:00.000Z",
      "email": "comprador@example.com"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalKeys": 250
  }
}
```

---

## 🏆 Rankings

### GET `/ranking/individual`
**Ranking individual (global)**

**Headers:** `Authorization: Bearer {token}`

**Query params:**
- `limit`: Cantidad de usuarios (default: 10, max: 1000)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "position": 1,
      "id": "507f1f77bcf86cd799439011",
      "name": "Juan ****",
      "username": "usuario123",
      "photo": "https://...",
      "enterprise": "Mi ******",
      "points": 5000,
      "level": 15
    }
  ]
}
```

---

### GET `/ranking/team/:programName`
**Ranking por equipos de un programa**

**Headers:** `Authorization: Bearer {token}`

**Params:**
- `programName`: `tia` | `tia_summer` | `tmd`

**Response 200:**
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
        }
      ]
    }
  ]
}
```

---

## 💬 Prompts (Comunidad)

### GET `/prompt`
**Listar prompts con filtros**

**Headers:** `Authorization: Bearer {token}`

**Query params:**
- `page`: Número de página (default: 1)
- `limit`: Límite por página (default: 20, max: 50)
- `category`: `sales` | `productivity` | `marketing` | `innovation` | `leadership` | `strategy` | `automation` | `content` | `analysis` | `growth`
- `difficulty`: `basic` | `intermediate` | `advanced`
- `sortBy`: `popular` | `newest` | `mostCopied` | `mostLiked` | `mostViewed` | `verified`
- `search`: Término de búsqueda (min 2 caracteres)
- `platforms`: Filtro de plataformas
- `favoritesOnly`: `true` | `false`
- `stannumVerifiedOnly`: `true` | `false`

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "title": "Prompt para análisis SWOT",
      "description": "...",
      "contentPreview": "Actúa como consultor...",
      "category": "strategy",
      "difficulty": "intermediate",
      "platforms": ["chatgpt", "claude"],
      "tags": ["swot", "estrategia", "negocios"],
      "metrics": {
        "copiesCount": 50,
        "likesCount": 25,
        "favoritesCount": 10,
        "viewsCount": 200
      },
      "author": {
        "username": "usuario123",
        "profilePhotoUrl": "..."
      },
      "stannumVerified": {
        "isVerified": true,
        "verifiedAt": "..."
      },
      "createdAt": "...",
      "hasCustomGpt": false,
      "userActions": {
        "hasLiked": false,
        "hasFavorited": true
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalItems": 200
  }
}
```

---

### GET `/prompt/:id`
**Obtener prompt completo por ID**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "prompt": {
    "id": "...",
    "title": "...",
    "description": "...",
    "content": "Prompt completo...",
    "category": "...",
    "difficulty": "...",
    "platforms": [...],
    "customGptUrl": "...",
    "tags": [...],
    "exampleOutput": "...",
    "metrics": {...},
    "author": {...},
    "visibility": "published",
    "stannumVerified": {...},
    "createdAt": "...",
    "updatedAt": "...",
    "popularityScore": 250,
    "engagementRate": "15.50",
    "userActions": {...}
  }
}
```

---

### POST `/prompt`
**Crear nuevo prompt**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "title": "Mi nuevo prompt",
  "description": "Descripción corta del prompt",
  "content": "Contenido completo del prompt...",
  "category": "productivity",
  "difficulty": "basic",
  "platforms": ["chatgpt", "claude"],
  "tags": ["productividad", "gestión"],
  "customGptUrl": "https://chat.openai.com/g/...",
  "exampleOutput": "Ejemplo de salida...",
  "visibility": "published"
}
```

**Response 201:**
```json
{
  "success": true,
  "message": "Prompt creado exitosamente",
  "promptId": "507f1f77bcf86cd799439011"
}
```

---

### PUT `/prompt/:id`
**Actualizar prompt**

**Headers:** `Authorization: Bearer {token}`

**Body:** (mismos campos que POST)

**Response 200:**
```json
{
  "success": true,
  "message": "Prompt actualizado exitosamente"
}
```

---

### DELETE `/prompt/:id`
**Eliminar prompt (soft delete)**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Prompt eliminado exitosamente"
}
```

---

### POST `/prompt/:id/copy`
**Copiar prompt (incrementa contador)**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Prompt copiado"
}
```

---

### POST `/prompt/:id/like`
**Dar like a prompt**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Like agregado"
}
```

---

### DELETE `/prompt/:id/like`
**Quitar like de prompt**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Like removido"
}
```

---

### POST `/prompt/:id/favorite`
**Toggle favorito**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "isFavorited": true,
  "message": "Prompt agregado a favoritos"
}
```

---

### GET `/prompt/me/prompts`
**Mis prompts creados**

**Headers:** `Authorization: Bearer {token}`

**Query params:**
- `page`: Número de página
- `limit`: Límite por página

**Response 200:**
```json
{
  "success": true,
  "data": [...]
}
```

---

### GET `/prompt/me/favorites`
**Mis prompts favoritos**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "data": [...]
}
```

---

## 🤖 Assistants (Comunidad)

### GET `/assistant`
**Listar assistants con filtros**

**Headers:** `Authorization: Bearer {token}`

**Query params:** (similares a `/prompt`)
- `page`, `limit`, `category`, `difficulty`, `sortBy`, `search`
- `platform`: `chatgpt` | `claude` | `gemini` | `poe` | `perplexity` | `other`
- `favoritesOnly`, `stannumVerifiedOnly`

**Response 200:** (estructura similar a prompts)

---

### POST `/assistant`
**Crear nuevo assistant**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "title": "Mi GPT personalizado",
  "description": "Descripción del assistant",
  "assistantUrl": "https://chat.openai.com/g/...",
  "category": "productivity",
  "difficulty": "basic",
  "platform": "chatgpt",
  "tags": ["productividad"],
  "useCases": "Casos de uso del assistant..."
}
```

**Response 201:**
```json
{
  "success": true,
  "message": "Assistant creado exitosamente",
  "assistantId": "..."
}
```

---

### POST `/assistant/:id/click`
**Registrar click en assistant (incrementa contador)**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Click registrado"
}
```

---

### POST `/assistant/:id/like`
**Dar like a assistant**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Like agregado"
}
```

---

## 📸 Profile Photo

### POST `/profile-photo/upload`
**Subir foto de perfil**

**Headers:**
- `Authorization: Bearer {token}`
- `Content-Type: multipart/form-data`

**Body (form-data):**
- `image`: Archivo de imagen (max 5MB, formatos: jpg, jpeg, png)

**Response 200:**
```json
{
  "success": true,
  "message": "Foto de perfil actualizada",
  "photoUrl": "https://s3.../userId.jpg"
}
```

---

### DELETE `/profile-photo/delete`
**Eliminar foto de perfil**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Foto de perfil eliminada"
}
```

---

## 📌 Notas Generales

### Rate Limiting
- General: 1000 requests/hora por IP
- OTP verification: 5 intentos/15 minutos
- Búsquedas: límite especial con `searchRateLimiter`

### Paginación
Todos los endpoints paginados retornan:
```json
{
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalItems": 200,
    "limit": 20
  }
}
```

### Códigos de Error Comunes
- `400` - Bad Request (validación fallida)
- `401` - Unauthorized (token inválido o faltante)
- `403` - Forbidden (sin permisos)
- `404` - Not Found (recurso no encontrado)
- `409` - Conflict (conflicto de estado, ej: recurso duplicado)
- `429` - Too Many Requests (rate limit excedido)
- `500` - Internal Server Error

### Estructura de Error
```json
{
  "success": false,
  "msg": "Mensaje de error descriptivo",
  "code": "ERROR_CODE"
}
```

---

**© STANNUM 2025**
