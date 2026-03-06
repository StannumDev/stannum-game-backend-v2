# API Reference - STANNUM Game

Documentación completa de todos los endpoints del backend de STANNUM Game.

**Base URL:** `http://localhost:8000/api` (desarrollo) | `https://api.stannumgame.com/api` (producción)

**Autenticación:** JWT access token en header `Authorization: Bearer {token}` (15 min de expiración, renovable con refresh token)

---

## Indice

1. [Autenticacion](#autenticacion)
2. [Usuario](#usuario)
3. [Lecciones](#lecciones)
4. [Instrucciones](#instrucciones)
5. [Product Keys](#product-keys)
6. [Rankings](#rankings)
7. [Prompts](#prompts-comunidad)
8. [Assistants](#assistants-comunidad)
9. [Profile Photo](#profile-photo)
10. [Cofres](#cofres)
11. [Tienda](#tienda)
12. [Pagos](#pagos---mercado-pago)
13. [Suscripciones](#suscripciones---mercado-pago)
14. [Webhooks](#webhooks)

---

## Autenticacion

### POST `/auth`
**Login con username/email y contraseña**

**Body:**
```json
{
  "username": "usuario123",
  "password": "contraseña123"
}
```

**Response 200:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6...80_hex_chars",
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
  "password": "Contraseña123",
  "name": "Juan Pérez",
  "birthdate": "1990-01-15",
  "country": "Argentina",
  "region": "Buenos Aires",
  "enterprise": "Mi Empresa",
  "enterpriseRole": "Developer",
  "aboutme": "Descripción sobre mí..."
}
```

**Response 201:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6...80_hex_chars",
  "userId": "507f1f77bcf86cd799439011"
}
```

---

### POST `/auth/google`
**Login con Google OAuth**

**Body:**
```json
{
  "token": "google_oauth_credential_token"
}
```

**Response 200:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6...80_hex_chars",
  "username": "usuario123",
  "achievementsUnlocked": [],
  "profileStatus": "complete" | "incomplete"
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

### POST `/auth/refresh-token`
**Renovar access token usando refresh token**

No requiere `Authorization` header (el access token está expirado).

**Body:**
```json
{
  "refreshToken": "a1b2c3d4e5f6...80_hex_chars"
}
```

**Validación:**
- `refreshToken` requerido, exactamente 80 caracteres, solo hex (`[a-f0-9]`)

**Response 200:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "nuevo_refresh_token_80_hex_chars"
}
```

**Notas:**
- Implementa **rotación de tokens**: el refresh token anterior se invalida y se genera uno nuevo
- Si el refresh token expiró (>7 días) retorna error `JWT_009`
- Si el refresh token no existe/es inválido retorna error `JWT_008`
- Rate limited

---

### POST `/auth/logout`
**Cerrar sesión (invalida refresh token en servidor)**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Sesión cerrada exitosamente"
}
```

**Notas:**
- Elimina el refresh token del usuario en la base de datos
- El access token sigue vigente hasta su expiración (15 min) pero el refresh token ya no podrá renovarlo

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

## Usuario

> **Nota:** El modelo User utiliza un transform `toJSON` que excluye automáticamente los campos `password`, `otp` y `refreshToken` de todas las respuestas JSON.

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

## Lecciones

### POST `/lesson/complete/:programName/:lessonId`
**Completar lección y ganar XP**

**Headers:** `Authorization: Bearer {token}`

**Params:**
- `programName`: `tia` | `tia_summer` | `tmd` | `trenno_ia`
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

### GET `/lesson/playback/:programName/:lessonId`
**Obtener playback ID de Mux para reproducir video**

**Headers:** `Authorization: Bearer {token}`

**Params:**
- `programName`: `tia` | `tia_summer` | `tmd` | `trenno_ia` | `trenno_ia`
- `lessonId`: ID de la leccion

**Response 200:**
```json
{
  "success": true,
  "playbackId": "a1b2c3d4e5f6g7h8"
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

## Instrucciones

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

## Product Keys

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

### POST `/product-key/generate-and-send`
**Generar product key y enviar por email**

**Headers:** `X-API-Key: {api_key}`

**Body:**
```json
{
  "product": "tia",
  "team": "equipo_alpha",
  "email": "comprador@example.com",
  "name": "Juan Perez",
  "message": "Bienvenido al programa"
}
```

**Response 201:**
```json
{
  "success": true,
  "code": "ABCD-1234-EFGH-5678"
}
```

---

### POST `/product-key/generate-and-send-make`
**Generar y enviar product key desde Make.com**

**Headers:** `X-API-Key: {api_key}`

**Body:** Datos en Base64 (nombre, mensaje)

---

### POST `/product-key/generate`
**Generar product key sin enviar**

**Headers:** `X-API-Key: {api_key}`

**Body:**
```json
{
  "product": "tia",
  "team": "equipo_alpha"
}
```

**Response 201:**
```json
{
  "success": true,
  "code": "ABCD-1234-EFGH-5678"
}
```

---

### GET `/product-key/check/:code`
**Verificar estado de product key**

**Headers:** `X-API-Key: {api_key}`

**Response 200:**
```json
{
  "success": true,
  "key": {
    "code": "ABCD-1234-EFGH-5678",
    "product": "tia",
    "team": "equipo_alpha",
    "used": false
  }
}
```

---

## Rankings

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
- `programName`: `tia` | `tia_summer` | `tmd` | `trenno_ia`

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

## Prompts (Comunidad)

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

## Assistants (Comunidad)

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

## Profile Photo

### POST `/profile-photo/presign-photo`
**Obtener URL presignada para subir foto a S3**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "contentType": "image/png"
}
```

**Response 200:**
```json
{
  "success": true,
  "presignedUrl": "https://s3...presigned-url",
  "s3Key": "profile_photos/userId/timestamp.png"
}
```

---

### POST `/profile-photo/confirm-photo`
**Confirmar subida de foto y procesar**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "s3Key": "profile_photos/userId/timestamp.png"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Foto de perfil actualizada",
  "photoUrl": "https://s3.../profile_photos/userId/timestamp.png"
}
```

---

### GET `/profile-photo/get-photo`
**Obtener foto de perfil propia**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "photoUrl": "https://s3.../profile_photos/userId/timestamp.png"
}
```

---

### GET `/profile-photo/get-photo/:username`
**Obtener foto de perfil por username**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "photoUrl": "https://s3.../profile_photos/userId/timestamp.png"
}
```

---

### DELETE `/profile-photo/delete-photo`
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

## Cofres

### POST `/chest/:programId/:chestId/open`
**Abrir cofre y recibir recompensas**

**Headers:** `Authorization: Bearer {token}`

**Params:**
- `programId`: `tia` | `tia_summer` | `tmd` | `trenno_ia` | `trenno_ia`
- `chestId`: ID del cofre (ej: `M01C01`)

**Response 200:**
```json
{
  "success": true,
  "rewards": {
    "xp": 50,
    "coins": 15,
    "cover": {
      "coverId": "cover_neon",
      "name": "Neon",
      "rarity": "rare"
    }
  },
  "achievementsUnlocked": []
}
```

**Errors:**
- `400`: Cofre ya abierto
- `403`: Cofre bloqueado (actividad previa no completada)

---

## Tienda

### GET `/store/covers`
**Listar portadas disponibles con estado de propiedad**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "covers": [
    {
      "coverId": "cover_neon",
      "name": "Neon",
      "price": 200,
      "rarity": "rare",
      "imageKey": "covers/neon.png",
      "owned": false,
      "equipped": false
    }
  ],
  "userCoins": 500
}
```

---

### POST `/store/covers/purchase`
**Comprar portada con Tins**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "coverId": "cover_neon"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Portada comprada exitosamente",
  "coinsRemaining": 300
}
```

**Errors:**
- `400`: Tins insuficientes
- `400`: Portada ya comprada

---

### PUT `/store/covers/equip`
**Equipar portada en perfil**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "coverId": "cover_neon"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Portada equipada"
}
```

---

### POST `/store/items/streak-shield/purchase`
**Comprar escudo de racha con Tins**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "shields": 1,
  "coinsSpent": 50,
  "coinsRemaining": 450
}
```

---

### POST `/store/streak/recover`
**Recuperar racha perdida con Tins**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "restoredCount": 5,
  "coinsSpent": 100,
  "coinsRemaining": 400
}
```

---

## Pagos - Mercado Pago

### POST `/payment/create-preference`
**Crear preferencia de pago (compra unica)**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "programId": "tia",
  "isGift": false,
  "giftEmail": null,
  "giftName": null,
  "giftMessage": null,
  "couponCode": "DESCUENTO20"
}
```

**Response 200:**
```json
{
  "success": true,
  "preferenceId": "123456789-abc",
  "initPoint": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=...",
  "orderId": "507f1f77bcf86cd799439011"
}
```

---

### POST `/payment/verify`
**Verificar pago completado**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "paymentId": "12345678",
  "orderId": "507f1f77bcf86cd799439011"
}
```

**Response 200:**
```json
{
  "success": true,
  "status": "approved",
  "order": {
    "orderId": "...",
    "programId": "tia",
    "amount": 50000,
    "status": "completed"
  }
}
```

---

### GET `/payment/my-orders`
**Historial de ordenes del usuario**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "orders": [
    {
      "orderId": "...",
      "programId": "tia",
      "amount": 50000,
      "status": "completed",
      "isGift": false,
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### GET `/payment/order/:orderId`
**Detalle de una orden**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "order": {
    "orderId": "...",
    "programId": "tia",
    "amount": 50000,
    "status": "completed",
    "isGift": false,
    "giftEmail": null,
    "couponCode": null,
    "discount": 0,
    "createdAt": "...",
    "completedAt": "..."
  }
}
```

---

### POST `/payment/order/:orderId/cancel`
**Cancelar orden**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Orden cancelada"
}
```

---

### POST `/payment/order/:orderId/resend-email`
**Reenviar email de regalo**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "message": "Email reenviado"
}
```

---

### POST `/payment/apply-coupon`
**Aplicar cupon de descuento**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "programId": "tia",
  "couponCode": "DESCUENTO20"
}
```

**Response 200:**
```json
{
  "success": true,
  "discount": 10000,
  "finalPrice": 40000,
  "coupon": {
    "code": "DESCUENTO20",
    "type": "percentage",
    "value": 20
  }
}
```

---

### POST `/payment/coupon` (ADMIN)
**Crear cupon de descuento**

**Headers:** `Authorization: Bearer {token}` (requiere rol ADMIN)

**Body:**
```json
{
  "code": "DESCUENTO20",
  "type": "percentage",
  "value": 20,
  "maxUses": 100,
  "expiresAt": "2025-12-31T23:59:59.000Z",
  "applicablePrograms": ["tia", "tia_summer"]
}
```

---

### GET `/payment/coupons` (ADMIN)
**Listar todos los cupones**

**Headers:** `Authorization: Bearer {token}` (requiere rol ADMIN)

---

### PUT `/payment/coupon/:id` (ADMIN)
**Actualizar cupon**

**Headers:** `Authorization: Bearer {token}` (requiere rol ADMIN)

---

## Suscripciones - Mercado Pago

### POST `/subscription/create`
**Crear suscripcion mensual**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "programId": "trenno_ia"
}
```

**Response 200:**
```json
{
  "success": true,
  "initPoint": "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=...",
  "subscriptionId": "mp_subscription_id"
}
```

**Nota:** El frontend redirige al usuario a `initPoint`. MP notifica via webhook cuando se confirma.

---

### POST `/subscription/cancel`
**Cancelar suscripcion**

**Headers:** `Authorization: Bearer {token}`

**Body:**
```json
{
  "programId": "trenno_ia"
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Suscripcion cancelada",
  "accessUntil": "2025-02-15T00:00:00.000Z"
}
```

---

### GET `/subscription/status/:programId`
**Estado de suscripcion para un programa**

**Headers:** `Authorization: Bearer {token}`

**Response 200:**
```json
{
  "success": true,
  "subscription": {
    "status": "active",
    "programId": "trenno_ia",
    "startDate": "2025-01-15T00:00:00.000Z",
    "nextPaymentDate": "2025-02-15T00:00:00.000Z",
    "amount": 30000
  }
}
```

---

### GET `/subscription/payments/:programId`
**Historial de pagos de suscripcion**

**Headers:** `Authorization: Bearer {token}`

**Query params:**
- `page`: Numero de pagina (default: 1)

**Response 200:**
```json
{
  "success": true,
  "payments": [
    {
      "amount": 30000,
      "status": "approved",
      "date": "2025-01-15T10:30:00.000Z",
      "mpPaymentId": "12345678"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalItems": 12
  }
}
```

---

### GET `/subscription/health` (ADMIN)
**Health stats de suscripciones**

**Headers:** `Authorization: Bearer {token}` (requiere rol ADMIN)

---

### POST `/subscription/admin/:userId/:programId/cancel` (ADMIN)
**Cancelar suscripcion de un usuario**

**Headers:** `Authorization: Bearer {token}` (requiere rol ADMIN)

---

### GET `/subscription/admin/:userId/:programId/history` (ADMIN)
**Ver historial de pagos de un usuario**

**Headers:** `Authorization: Bearer {token}` (requiere rol ADMIN)

---

## Webhooks

### POST `/webhooks/mercadopago`
**Webhook de notificaciones de Mercado Pago**

**Auth:** Verificacion de firma de Mercado Pago (header `x-signature`)

**Body:** Enviado automaticamente por Mercado Pago

Maneja notificaciones de:
- **payment**: Pago aprobado/rechazado → actualiza orden, activa programa
- **subscription_preapproval**: Cambio de estado de suscripcion → actualiza acceso

---

## Notas Generales

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
