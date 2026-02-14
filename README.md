# STANNUM Game - Backend API

API REST construida con Node.js, Express y MongoDB que maneja toda la lógica de negocio, gamificación, AI grading y persistencia de datos para la plataforma educativa STANNUM Game.

## 🎮 ¿Qué es STANNUM Game?

STANNUM Game es una plataforma educativa gamificada que combina contenido educativo de alta calidad con mecánicas de juego para maximizar el engagement y la retención del aprendizaje. Los estudiantes completan lecciones (videos), realizan instrucciones prácticas, ganan XP, suben de nivel, desbloquean logros y compiten en rankings.

## 🚀 Quick Start

### Prerequisitos
- Node.js 18+
- MongoDB 6+
- Cuenta AWS S3 (para almacenamiento de archivos)
- API Key de OpenAI (para AI grading)

### Instalación

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Iniciar en desarrollo
npm run dev

# Iniciar en producción
npm start
```

El servidor estará disponible en `http://localhost:8000`.

## 🏗️ Stack Tecnológico

- **Runtime:** Node.js 18+
- **Framework:** Express.js 4.21
- **Base de datos:** MongoDB + Mongoose 8.23
- **Autenticación:** JWT + bcrypt
- **AI:** OpenAI API (GPT-4o)
- **Storage:** AWS S3
- **Email:** Nodemailer (SMTP)
- **Validación:** express-validator
- **Rate Limiting:** express-rate-limit

## 📂 Estructura del Proyecto

```
src/
├── config/           # Configuraciones (programs, achievements, XP)
├── controllers/      # Lógica de request handlers
├── models/           # Schemas MongoDB
├── routes/           # Definición de endpoints
├── services/         # Lógica de negocio (XP, achievements, AI grading)
├── middlewares/      # Auth, validators, rate limiters
├── helpers/          # Funciones utilitarias
└── index.js         # Entry point
```

## 🌍 Variables de Entorno

```env
# Base
PORT=8000

# MongoDB
DB_URL=mongodb+srv://user:pass@cluster.mongodb.net/stannum-game

# JWT
SECRET=tu_clave_secreta_jwt
SECRET_PASSWORD_RECOVERY=tu_clave_secreta_otp

# AWS S3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=...
AWS_BUCKET_NAME=...

# OpenAI
OPENAI_API_KEY=...

# Email
SMTP_EMAIL=example@example.com
SMTP_PASSWORD=tu_contraseña_app

# Google OAuth
GOOGLE_CLIENT_ID=...

# reCAPTCHA
RECAPTCHA_SECRET_KEY=...

# CORS
ALLOWED_ORIGINS=["http://localhost:3000","https://stannumgame.com"]

# Make.com API
MAKE_API_KEY=...
```

## 🚦 Endpoints Principales

### Autenticación
- `POST /api/auth` - Login
- `POST /api/auth/register` - Registro
- `POST /api/auth/google` - Google OAuth
- `GET /api/auth/auth-user` - Obtener usuario autenticado

### Lecciones
- `POST /api/lesson/complete/:programName/:lessonId` - Marcar lección completada
- `PATCH /api/lesson/lastwatched/:programName/:lessonId` - Guardar progreso video

### Instrucciones
- `POST /api/instruction/start/:programName/:instructionId` - Iniciar instrucción
- `POST /api/instruction/submit/:programName/:instructionId` - Enviar instrucción
- `POST /api/instruction/retry/:programName/:instructionId` - Reintentar calificación AI

### Usuario
- `GET /api/user` - Datos completos del usuario
- `PUT /api/user/edit` - Actualizar perfil

Ver [API Reference completa](./docs/api-reference.md) para lista exhaustiva.

## 🎮 Sistemas Principales

### 1. Sistema de Gamificación
- **XP:** Ganado al completar lecciones e instrucciones
- **Niveles:** Del 1 al 30 con curva exponencial
- **Achievements:** 19 logros desbloqueables
- **Daily Streaks:** Bonus por días consecutivos

[Documentación completa →](./docs/systems/gamification.md)

### 2. Sistema Educativo
- **Programas:** TIA, TMD, TIA_SUMMER
- **Estructura:** Program → Section → Module → Lesson/Instruction
- **Progreso:** Tracking completo de avance

[Documentación completa →](./docs/systems/education.md)

### 3. AI Grading
- Evaluación automática con OpenAI GPT-4o
- Context injection: lecciones previas + consigna
- Feedback constructivo en español
- Escala 0-100

[Documentación completa →](./docs/systems/ai-grading.md)

## 🔒 Seguridad

- ✅ Contraseñas hasheadas con bcrypt
- ✅ JWT tokens (expiración 1 año)
- ✅ Rate limiting (1000 req/hora, 5 OTP/15min)
- ✅ CORS por whitelist
- ✅ express-validator en todas las rutas
- ✅ Google reCAPTCHA v3
- ✅ Detección de profanidad
- ✅ AWS S3 URLs presignadas

## 📖 Documentación Completa

- [Sistema de Gamificación](./docs/systems/gamification.md)
- [Sistema Educativo](./docs/systems/education.md)
- [AI Grading](./docs/systems/ai-grading.md)
- [API Reference](./docs/api-reference.md)

## 🔗 Frontend

- **Repo:** `stannum-game-frontend-v2`
- **Stack:** Next.js 16 + React 19 + TypeScript
- **Comunicación:** REST API con JWT

---

**© STANNUM 2025 - Todos los derechos reservados**
