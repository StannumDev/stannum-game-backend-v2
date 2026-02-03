const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const User = require("../models/userModel");
const { getError } = require("../helpers/getError");
const { getInstructionConfig } = require("../helpers/getInstructionConfig");
const { addExperience } = require("../services/experienceService");
const { resolveInstructionInfo } = require("../helpers/resolveInstructionInfo");
const { programs } = require("../config/programs");

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const startInstruction = async (req, res) => {
  try {
    const { programName, instructionId } = req.params;
    const userId = req.userAuth.id;

    const config = getInstructionConfig(programName, instructionId);
    if (!config) return res.status(404).json(getError("INSTRUCTION_NOT_FOUND"));

    const user = await User.findById(userId);
    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

    const program = user.programs?.[programName];
    if (!program || !program.isPurchased) return res.status(403).json(getError("PROGRAM_NOT_PURCHASED"));

    if (config.afterLessonId) {
      const afterLessonCompleted = program.lessonsCompleted.some(l => l.lessonId === config.afterLessonId);
      if (!afterLessonCompleted) return res.status(403).json(getError("INSTRUCTION_NOT_AVAILABLE"));
    }

    const exists = program.instructions.find(i => i.instructionId === instructionId);
    if (exists) return res.status(400).json(getError("INSTRUCTION_ALREADY_STARTED"));

    program.instructions.push({
      instructionId,
      startDate: new Date(),
      status: "IN_PROCESS",
    });

    await user.save();

    return res.status(200).json({ success: true, message: "Instrucción iniciada correctamente." });
  } catch (error) {
    console.error("Error iniciando instrucción:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const submitInstruction = async (req, res) => {
  try {
    const { programName, instructionId } = req.params;
    const userId = req.userAuth.id;

    const config = getInstructionConfig(programName, instructionId);
    if (!config) return res.status(404).json(getError("INSTRUCTION_NOT_FOUND"));

    const user = await User.findById(userId);
    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

    const program = user.programs?.[programName];
    if (!program || !program.isPurchased) return res.status(403).json(getError("PROGRAM_NOT_PURCHASED"));

    const instructionIndex = program.instructions.findIndex(i => i.instructionId === instructionId);
    if (instructionIndex === -1) return res.status(404).json(getError("INSTRUCTION_NOT_FOUND"));

    const instruction = program.instructions[instructionIndex];
    if (["SUBMITTED", "GRADED"].includes(instruction.status)) return res.status(400).json(getError("INSTRUCTION_ALREADY_SUBMITTED"));

    if (config.deliverableType === "file") {
      if (!req.file) return res.status(400).json(getError("INSTRUCTION_FILE_REQUIRED"));
    } else if (config.deliverableType === "text") {
      if (!req.body.submittedText || !req.body.submittedText.trim()) return res.status(400).json(getError("INSTRUCTION_TEXT_REQUIRED"));
    }

    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();

      if (config.acceptedFormats && !config.acceptedFormats.includes(ext)) return res.status(400).json(getError("INSTRUCTION_INVALID_FORMAT"));

      const mimeToExt = { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "application/pdf": [".pdf"] };
      const expectedMimes = Object.entries(mimeToExt).filter(([, exts]) => config.acceptedFormats?.some(f => exts.includes(f))).map(([mime]) => mime);

      if (expectedMimes.length > 0 && !expectedMimes.includes(req.file.mimetype)) return res.status(400).json(getError("INSTRUCTION_INVALID_FORMAT"));

      const maxSize = (config.maxFileSizeMB || 15) * 1024 * 1024;
      if (req.file.size > maxSize) return res.status(400).json(getError("INSTRUCTION_FILE_TOO_LARGE"));

      const s3Key = `instructions/${userId}/${instructionId}/${Date.now()}${ext}`;
      try {
        const command = new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: s3Key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        });
        await s3Client.send(command);
      } catch (uploadError) {
        console.error("Error uploading instruction file to S3:", uploadError);
        return res.status(500).json(getError("INSTRUCTION_UPLOAD_FAILED"));
      }
      instruction.fileUrl = `${process.env.S3_BASE_URL}/${s3Key}`;
    }

    if (req.body.submittedText) {
      const text = req.body.submittedText;
      if (text.length > 5000) return res.status(400).json(getError("INSTRUCTION_TEXT_TOO_LONG"));
      instruction.submittedText = text;
    }

    instruction.submittedAt = new Date();
    instruction.status = "SUBMITTED";

    await user.save();
    return res.status(200).json({ success: true, message: "Instrucción entregada correctamente." });
  } catch (error) {
    console.error("Error al entregar la instrucción:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const gradeInstruction = async (req, res) => {
  try {
    const { userId, programName, instructionId } = req.params;
    const { score, observations } = req.body;

    if (score < 0 || score > 100) return res.status(400).json(getError("INSTRUCTION_INVALID_SCORE"));

    if (observations?.length > 500) return res.status(400).json(getError("VALIDATION_OBSERVATIONS_TOO_LONG"));

    const user = await User.findById(userId);
    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

    const program = user.programs?.[programName];
    if (!program || !program.isPurchased) return res.status(403).json(getError("PROGRAM_NOT_PURCHASED"));

    const instruction = program.instructions.find(i => i.instructionId === instructionId);
    if (!instruction) return res.status(404).json(getError("INSTRUCTION_NOT_FOUND"));

    if (instruction.status === "GRADED") return res.status(400).json(getError("INSTRUCTION_ALREADY_GRADED"));

    if (instruction.status !== "SUBMITTED") return res.status(400).json(getError("INSTRUCTION_NOT_IN_REVIEW"));

    instruction.score = Math.round(score);
    instruction.observations = observations || "";
    instruction.reviewedAt = new Date();
    instruction.status = "GRADED";

    const info = resolveInstructionInfo(programs, programName, instructionId);
    const timeTakenSec = instruction.submittedAt && instruction.startDate ? Math.round((new Date(instruction.submittedAt) - new Date(instruction.startDate)) / 1000) : 0;

    const xpResult = await addExperience(user, 'INSTRUCTION_GRADED', {
      programId: programName,
      instructionId,
      rewardXP: info.rewardXP,
      estimatedTimeSec: info.estimatedTimeSec,
      score: instruction.score,
      timeTakenSec,
    });

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Instrucción calificada correctamente.",
      result: {
        score: instruction.score,
        observations: instruction.observations,
      },
      ...xpResult,
    });
  } catch (error) {
    console.error("Error al calificar la instrucción:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

// TODO: BORRAR endpoint temporal para testear grading
const gradeTest = async (req, res) => {
  try {
    const username = "mateolohezic";
    const programName = "tia";
    const instructionId = "TIAM01I01";
    const score = 85;
    const observations = "Buen trabajo, la estructura de carpetas está bien organizada.";

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const program = user.programs?.[programName];
    if (!program) return res.status(404).json({ error: "Programa no encontrado" });

    const instruction = program.instructions.find(i => i.instructionId === instructionId);
    if (!instruction) return res.status(404).json({ error: "Instrucción no encontrada en el usuario" });

    if (instruction.status === "GRADED") return res.status(400).json({ error: "Ya fue calificada", instruction });

    if (instruction.status !== "SUBMITTED") return res.status(400).json({ error: `Estado actual: ${instruction.status}. Debe estar en SUBMITTED.` });

    instruction.score = score;
    instruction.observations = observations;
    instruction.reviewedAt = new Date();
    instruction.status = "GRADED";

    const info = resolveInstructionInfo(programs, programName, instructionId);
    const timeTakenSec = instruction.submittedAt && instruction.startDate
      ? Math.round((new Date(instruction.submittedAt) - new Date(instruction.startDate)) / 1000)
      : 0;

    const xpResult = await addExperience(user, 'INSTRUCTION_GRADED', {
      programId: programName,
      instructionId,
      rewardXP: info.rewardXP,
      estimatedTimeSec: info.estimatedTimeSec,
      score: instruction.score,
      timeTakenSec,
    });

    await user.save();

    return res.status(200).json({
      success: true,
      message: `Instrucción ${instructionId} calificada para ${username}`,
      score,
      observations,
      timeTakenSec,
      xpResult,
    });
  } catch (error) {
    console.error("Error en gradeTest:", error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports = { startInstruction, submitInstruction, gradeInstruction, gradeTest };