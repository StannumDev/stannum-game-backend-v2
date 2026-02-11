const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const User = require("../models/userModel");
const { getError } = require("../helpers/getError");
const { getInstructionConfig } = require("../helpers/getInstructionConfig");
const { addExperience } = require("../services/experienceService");
const { resolveInstructionInfo } = require("../helpers/resolveInstructionInfo");
const { programs } = require("../config/programs");
const { gradeWithAI } = require("../services/aiGradingService");

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

    if (config.requiredActivityId) {
      const requiredInstr = program.instructions.find(i => i.instructionId === config.requiredActivityId);
      const isCompleted = requiredInstr && ["SUBMITTED", "GRADED"].includes(requiredInstr.status);
      if (!isCompleted) return res.status(403).json(getError("INSTRUCTION_NOT_AVAILABLE"));
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

const getPresignedUrl = async (req, res) => {
  try {
    const { programName, instructionId } = req.params;
    const userId = req.userAuth.id;
    const { fileName, contentType } = req.body;

    if (!fileName || !contentType) return res.status(400).json(getError("VALIDATION_MISSING_FIELDS"));

    const config = getInstructionConfig(programName, instructionId);
    if (!config) return res.status(404).json(getError("INSTRUCTION_NOT_FOUND"));
    if (config.deliverableType !== "file") return res.status(400).json(getError("INSTRUCTION_TEXT_REQUIRED"));

    const user = await User.findById(userId);
    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

    const program = user.programs?.[programName];
    if (!program || !program.isPurchased) return res.status(403).json(getError("PROGRAM_NOT_PURCHASED"));

    const instruction = program.instructions.find(i => i.instructionId === instructionId);
    if (!instruction) return res.status(404).json(getError("INSTRUCTION_NOT_FOUND"));
    if (["SUBMITTED", "GRADED"].includes(instruction.status)) return res.status(400).json(getError("INSTRUCTION_ALREADY_SUBMITTED"));

    const ext = path.extname(fileName).toLowerCase();
    if (config.acceptedFormats && !config.acceptedFormats.includes(ext)) return res.status(400).json(getError("INSTRUCTION_INVALID_FORMAT"));

    const mimeToExt = { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "application/pdf": [".pdf"] };
    const expectedMimes = Object.entries(mimeToExt).filter(([, exts]) => config.acceptedFormats?.some(f => exts.includes(f))).map(([mime]) => mime);
    if (expectedMimes.length > 0 && !expectedMimes.includes(contentType)) return res.status(400).json(getError("INSTRUCTION_INVALID_FORMAT"));

    const s3Key = `instructions/${userId}/${instructionId}/${Date.now()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return res.status(200).json({ success: true, presignedUrl, s3Key });
  } catch (error) {
    console.error("Error generando presigned URL:", error);
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
    if (instruction.status !== "IN_PROCESS") return res.status(400).json(getError("INSTRUCTION_ALREADY_SUBMITTED"));

    if (config.deliverableType === "file") {
      if (!req.body.s3Key) return res.status(400).json(getError("INSTRUCTION_FILE_REQUIRED"));
    } else if (config.deliverableType === "text") {
      if (!req.body.submittedText || !req.body.submittedText.trim()) return res.status(400).json(getError("INSTRUCTION_TEXT_REQUIRED"));
    }

    if (req.body.s3Key) {
      instruction.fileUrl = `${process.env.AWS_S3_BASE_URL}/${req.body.s3Key}`;
    }

    if (req.body.submittedText) {
      const text = req.body.submittedText;
      if (text.length > 5000) return res.status(400).json(getError("INSTRUCTION_TEXT_TOO_LONG"));
      instruction.submittedText = text;
    }

    instruction.submittedAt = new Date();
    instruction.status = "SUBMITTED";

    await user.save();

    gradeWithAI(userId, programName, instructionId).catch(err => {
      console.error(`[AI Grading] Error en background para ${instructionId}:`, err.message);
    });

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

    if (!["SUBMITTED", "ERROR"].includes(instruction.status)) return res.status(400).json(getError("INSTRUCTION_NOT_IN_REVIEW"));

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

module.exports = { startInstruction, getPresignedUrl, submitInstruction, gradeInstruction };