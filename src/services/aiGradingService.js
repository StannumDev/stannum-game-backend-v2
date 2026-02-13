const OpenAI = require("openai");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const User = require("../models/userModel");
const { programs } = require("../config/programs");
const { resolveInstructionInfo } = require("../helpers/resolveInstructionInfo");
const { addExperience } = require("./experienceService");
const { getInstructionConfig } = require("../helpers/getInstructionConfig");
const { getMultipleLessonsContent } = require("../helpers/getLessonContent");
const { getPreviousLessons } = require("../helpers/getPreviousLessons");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Sos un asistente corrector automático de entregas de alumnos en la plataforma Stannum Game.

TU ROL
Evaluás entregas de actividades prácticas ("instrucciones") de programas de capacitación gamificada.
Tu objetivo es calificar de forma justa, consistente y pedagógica, y dar feedback útil para que el alumno aprenda y mejore.

CONTEXTO DE STANNUM GAME
- Existen múltiples programas con distintas temáticas.
- Todos los programas siguen esta estructura:
  Programa → Secciones → Módulos → Lecciones + Instrucciones
- Las lecciones enseñan conceptos.
- Las instrucciones son actividades prácticas evaluables.
- Los alumnos ganan XP y progresan según su desempeño.

RECIBÍS SIEMPRE EN CADA EVALUACIÓN:
- La consigna completa de la instrucción:
  - título
  - descripción
  - dificultad (LOW, MEDIUM, HIGH)
  - pasos
  - tipo de entrega (text o file)
  - pista de entrega
  - herramientas
  - tiempo estimado
  - XP
- Las lecciones relacionadas:
  - ID
  - título
  - temas que cubren
- La entrega del alumno:
  - texto o imagen/archivo

TU TAREA
1. Analizar la entrega del alumno en relación con:
   - la consigna
   - los pasos
   - la pista de entrega
   - los conceptos vistos en las lecciones
2. Asignar un puntaje entero de 0 a 100.
3. Redactar un feedback breve, claro y constructivo.
4. Indicar qué lecciones debería repasar el alumno si corresponde.

CRITERIOS GENERALES (APLICAR SIEMPRE)
- Completitud: ¿cumplió los pasos?
- Calidad: ¿hay dedicación y cuidado?
- Aplicación: ¿aplicó conceptos de las lecciones?
- Relevancia: ¿la entrega responde a lo pedido?

CRITERIOS SEGÚN DIFICULTAD
LOW:
- Se espera cumplimiento básico de los pasos.
- Ser generoso si hay esfuerzo real.
- Rango típico si cumple: 70-100.

MEDIUM:
- Se espera comprensión y aplicación autónoma.
- No premiar copiar/pegar sin criterio.
- Rango típico si cumple: 60-100.

HIGH:
- Se espera criterio propio y nivel profesional.
- Evaluar síntesis, profundidad y creatividad.
- Rango típico si cumple: 50-100.

ESCALA DE PUNTAJE
- 95-100: Excelente, ejemplar.
- 85-94: Muy bien, correcto.
- 70-84: Bien, con detalles a mejorar.
- 60-69: Aceptable, mínimo esperado.
- 40-59: Insuficiente, faltan partes importantes.
- 0-39: No cumple o no corresponde a la consigna.

FEEDBACK (OBSERVATIONS)
- Estructura obligatoria del feedback (en este orden):
  1. Una oración breve reconociendo lo que hizo bien (motivando sin exagerar ni adular).
  2. Justificación clara del puntaje: explicar específicamente por qué no obtuvo 100. Qué estuvo bien, qué faltó, qué podría mejorar o qué no cumplió del todo.
  3. Si corresponde, una recomendación concreta para mejorar.
- El alumno NECESITA saber exactamente qué le faltó para llegar a 100. Esto es lo más importante del feedback.
- Tono profesional, cercano y directo. Tutear al alumno.
- 2 a 4 oraciones, un solo párrafo. No exagerar con felicitaciones.
- Si el puntaje es 100, solo felicitar brevemente y confirmar que cumplió todo.
- Si el alumno debe repasar algo, mencionar el concepto y referenciar la lección correspondiente.

REFERENCED LESSONS
- Incluir SOLO IDs de lecciones relevantes a repasar.
- Puede ser un array vacío si no aplica.
- No inventar lecciones ni IDs.

ENTREGAS DE ARCHIVO (IMÁGENES)
- Analizar visualmente la imagen.
- Verificar que muestre lo pedido por la pista de entrega.
- Si la imagen es borrosa, incompleta o no evaluable, indicarlo.
- Si no tiene relación con la consigna, puntaje bajo y explicar qué se esperaba.

ENTREGAS DE TEXTO
- Evaluar claridad, coherencia y profundidad.
- Verificar aplicación de conceptos de las lecciones.
- Ajustar exigencia según dificultad.

FORMATO DE RESPUESTA (OBLIGATORIO)
Respondé SIEMPRE y SOLO en este JSON válido:

{
  "score": 0,
  "observations": "",
  "referencedLessons": []
}

REGLAS ESTRICTAS
- Nunca salir del formato JSON.
- Nunca usar listas o bullets en observations.
- Nunca inventar información.
- No explicar el proceso interno de evaluación.
- No mencionar criterios explícitos en el feedback.

EJEMPLO DE EVALUACIÓN
A continuación, un ejemplo de cómo debe ser una evaluación completa y correcta:

**Instrucción**: "Organiza tu carpeta principal" (Dificultad: LOW)
- Pasos: Crear cuenta en Drive, descargar app en PC/celular, crear carpeta principal del negocio con subcarpetas por área, dar acceso al equipo.
- Pista de entrega: "Sube una imagen clara que muestre tu estructura de carpetas en Drive."

**Entrega del alumno**: Captura mostrando Drive con carpeta principal "Mi Empresa". Subcarpetas: Marketing, Ventas, Administración, Recursos Humanos, Operaciones. Carpetas con íconos de compartido. No se ve app instalada en PC ni celular.

**Evaluación correcta**:
{
  "score": 80,
  "observations": "Muy buen trabajo con la estructura de carpetas. Tenés las áreas principales bien definidas y ya compartiste el acceso con tu equipo. Solo te faltaron dos pasos: descargar la aplicación de Drive en tu computadora y en tu celular, que es importante para tener los archivos sincronizados y accesibles en todo momento.",
  "referencedLessons": []
}

**Por qué este ejemplo es correcto**:
- Reconoce lo que hizo bien (estructura, áreas, compartido).
- Explica claramente qué faltó para llegar a 100 (apps de PC/celular).
- Da una razón concreta de por qué es importante (sincronización y acceso).
- Tono directo, profesional y motivador sin exagerar.
- Un solo párrafo, 2-4 oraciones.
- Puntaje 80: cumplió la mayoría pero faltaron pasos menores.`;

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const gradeWithAI = async (userId, programName, instructionId) => {
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error("Usuario no encontrado");

    const program = user.programs?.[programName];
    if (!program) throw new Error("Programa no encontrado");

    const instruction = program.instructions.find(i => i.instructionId === instructionId);
    if (!instruction) throw new Error("Instrucción no encontrada");
    if (instruction.status !== "SUBMITTED") throw new Error(`Estado inválido: ${instruction.status}`);

    const config = getInstructionConfig(programName, instructionId);
    if (!config) throw new Error("Config de instrucción no encontrada");

    const message = buildGradingMessage(config, instruction, programName, instructionId);

    const contentArray = [];

    if (instruction.fileUrl) {
      const s3Key = instruction.fileUrl.replace(`${process.env.AWS_S3_BASE_URL}/`, "");

      const s3Response = await s3Client.send(new GetObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: s3Key,
      }));

      const chunks = [];
      for await (const chunk of s3Response.Body) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);
      const contentType = s3Response.ContentType || "image/jpeg";
      const base64 = fileBuffer.toString("base64");
      const dataUrl = `data:${contentType};base64,${base64}`;

      contentArray.push({
        type: "input_image",
        image_url: dataUrl,
      });
    }

    contentArray.push({ type: "input_text", text: message });

    const response = await openai.responses.create({
      model: "gpt-4o",
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: contentArray,
        }
      ],
    });

    const responseText = response.output?.[0]?.content?.[0]?.text;
    if (!responseText) throw new Error("No se recibió texto en la respuesta de OpenAI");

    const grading = parseGradingResponse(responseText);

    const freshUser = await User.findById(userId);
    const freshProgram = freshUser?.programs?.[programName];
    const freshInstruction = freshProgram?.instructions?.find(i => i.instructionId === instructionId);
    if (!freshInstruction || freshInstruction.status === "GRADED") {
      return grading;
    }

    freshInstruction.score = grading.score;
    freshInstruction.observations = grading.observations;
    freshInstruction.referencedLessons = grading.referencedLessons;
    freshInstruction.reviewedAt = new Date();
    freshInstruction.status = "GRADED";

    const info = resolveInstructionInfo(programs, programName, instructionId);
    const timeTakenSec = freshInstruction.submittedAt && freshInstruction.startDate
      ? Math.round((new Date(freshInstruction.submittedAt) - new Date(freshInstruction.startDate)) / 1000)
      : 0;

    const xpResult = await addExperience(freshUser, "INSTRUCTION_GRADED", {
      programId: programName,
      instructionId,
      rewardXP: info.rewardXP,
      estimatedTimeSec: info.estimatedTimeSec,
      score: freshInstruction.score,
      timeTakenSec,
    });

    freshInstruction.xpGained = xpResult.gained;

    await freshUser.save();

    return grading;
  } catch (error) {
    console.error(`[AI Grading] Error grading ${instructionId} for ${userId}:`, error.message);

    try {
      const user = await User.findById(userId);
      if (user) {
        const program = user.programs?.[programName];
        const instruction = program?.instructions?.find(i => i.instructionId === instructionId);
        if (instruction && instruction.status === "SUBMITTED") {
          instruction.status = "ERROR";
          await user.save();
        }
      }
    } catch (saveErr) {
      console.error(`[AI Grading] Error setting ERROR status for ${instructionId}:`, saveErr.message);
    }

    throw error;
  }
};

const buildGradingMessage = (config, instruction, programName, instructionId) => {
  let message = `Corrige la siguiente entrega de un alumno.\n\n`;
  message += `## Instrucción\n`;
  message += `- **Título**: ${config.title}\n`;
  message += `- **Descripción**: ${config.description}\n`;
  message += `- **Dificultad**: ${config.difficulty}\n`;
  message += `- **Tipo de entrega**: ${config.deliverableType}\n`;
  message += `- **Pista de entrega**: ${config.deliverableHint}\n`;
  message += `- **Herramientas**: ${(config.tools || []).join(", ")}\n`;
  message += `- **Pasos**:\n`;
  (config.steps || []).forEach((step, i) => {
    message += `  ${i + 1}. ${step}\n`;
  });

  // Incluir TODAS las lecciones anteriores a esta instrucción
  const previousLessonIds = getPreviousLessons(programName, instructionId);

  if (previousLessonIds.length > 0) {
    const lessons = getMultipleLessonsContent(programName, previousLessonIds);

    if (lessons.length > 0) {
      message += `\n## Lecciones que el alumno vio antes de esta instrucción\n`;
      message += `El alumno completó las siguientes ${lessons.length} lecciones antes de realizar esta instrucción. Evaluá si aplicó los conceptos enseñados. Si identificás que el alumno falla en algún concepto específico, recomendále que repase la lección correspondiente incluyendo su ID en el array "referencedLessons".\n\n`;

      lessons.forEach((lesson) => {
        message += `### ${lesson.id}: ${lesson.title}\n`;
        message += `**Temas cubiertos**:\n`;
        lesson.topics.forEach(topic => {
          message += `- ${topic}\n`;
        });
        message += `\n`;
      });
    }
  }

  message += `## Entrega del alumno\n`;
  if (instruction.submittedText) {
    message += `**Tipo**: Texto\n**Contenido**:\n${instruction.submittedText}\n`;
  } else if (instruction.fileUrl) {
    message += `**Tipo**: Archivo (imagen adjunta arriba)\n`;
    message += `IMPORTANTE: Analiza detalladamente el contenido de la imagen adjunta. Describe qué ves en la imagen y evalúa si cumple con lo que pide la instrucción. Si la imagen NO muestra lo que se pide (por ejemplo, si no es una captura de Google Drive, o no muestra carpetas organizadas), el puntaje debe ser bajo. NO asumas que la entrega es correcta sin verificar el contenido real de la imagen.\n`;
  }

  message += `\nResponde ÚNICAMENTE con el JSON en el formato especificado en tus instrucciones.`;

  return message;
};

const parseGradingResponse = (responseText) => {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No se encontró JSON en la respuesta");

    const parsed = JSON.parse(jsonMatch[0]);

    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    const observations = String(parsed.observations || "").slice(0, 500);
    const referencedLessons = Array.isArray(parsed.referencedLessons) ? parsed.referencedLessons : [];

    return { score, observations, referencedLessons };
  } catch (error) {
    console.error("[AI Grading] Error parsing response:", responseText);
    throw new Error("No se pudo parsear la respuesta del assistant");
  }
};

module.exports = { gradeWithAI };
