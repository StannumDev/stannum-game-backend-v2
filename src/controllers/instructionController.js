const path = require("path");
const { S3Client, PutObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const User = require("../models/userModel");
const { getError } = require("../helpers/getError");
const { getInstructionConfig } = require("../helpers/getInstructionConfig");
const { programs } = require("../config/programs");
const { gradeWithAI } = require("../services/aiGradingService");
const { hasAccess } = require("../utils/accessControl");
const { invalidateUser } = require("../cache/cacheService");

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const VALID_PROGRAMS = ['tia', 'tia_summer', 'tia_pool', 'tmd'];

const MAX_GRADING_RETRIES = 3;
const gradeWithRetry = async (userId, programName, instructionId, attempt = 1) => {
    try {
        await gradeWithAI(userId, programName, instructionId);
    } catch (err) {
        console.error(`[AI Grading] Attempt ${attempt}/${MAX_GRADING_RETRIES} failed for ${instructionId}:`, err.message);
        if (attempt < MAX_GRADING_RETRIES) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
            await new Promise(r => setTimeout(r, delay));
            return gradeWithRetry(userId, programName, instructionId, attempt + 1);
        }
        console.error(`[AI Grading] All ${MAX_GRADING_RETRIES} retries exhausted for ${instructionId}.`);
    }
};

const startInstruction = async (req, res) => {
  try {
    const { programName, instructionId } = req.params;
    const userId = req.userAuth.id;

    if (!VALID_PROGRAMS.includes(programName)) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_INVALID"));

    const config = getInstructionConfig(programName, instructionId);
    if (!config) return res.status(404).json(getError("INSTRUCTION_NOT_FOUND"));

    const user = await User.findById(userId);
    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

    const program = user.programs?.[programName];
    if (!program || !hasAccess(program)) return res.status(403).json(getError("PROGRAM_NOT_PURCHASED"));

    if (config.afterLessonId) {
      const afterLessonCompleted = (program.lessonsCompleted || []).some(l => l.lessonId === config.afterLessonId);
      if (!afterLessonCompleted) return res.status(403).json(getError("INSTRUCTION_NOT_AVAILABLE"));
    }

    if (config.requiredActivityId) {
      const requiredInstr = (program.instructions || []).find(i => i.instructionId === config.requiredActivityId);
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
    invalidateUser(userId);

    return res.status(200).json({ success: true, message: "Instrucción iniciada correctamente." });
  } catch (error) {
    console.error("Error iniciando instrucción:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const MIME_TO_EXT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "application/pdf": [".pdf"],
};

const DEFAULT_MAX_FILES = 1;

const getPresignedUrls = async (req, res) => {
  try {
    const { programName, instructionId } = req.params;
    const userId = req.userAuth.id;
    const { files } = req.body;

    if (!VALID_PROGRAMS.includes(programName)) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_INVALID"));
    if (!Array.isArray(files) || files.length === 0) return res.status(400).json(getError("VALIDATION_MISSING_FIELDS"));

    const config = getInstructionConfig(programName, instructionId);
    if (!config) return res.status(404).json(getError("INSTRUCTION_NOT_FOUND"));
    if (config.deliverableType !== "file") return res.status(400).json(getError("INSTRUCTION_TEXT_REQUIRED"));

    const maxFiles = config.maxFiles || DEFAULT_MAX_FILES;
    if (files.length > maxFiles) return res.status(400).json(getError("INSTRUCTION_TOO_MANY_FILES"));

    const user = await User.findById(userId);
    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

    const program = user.programs?.[programName];
    if (!program || !hasAccess(program)) return res.status(403).json(getError("PROGRAM_NOT_PURCHASED"));

    const instruction = program.instructions.find(i => i.instructionId === instructionId);
    if (!instruction) return res.status(404).json(getError("INSTRUCTION_NOT_FOUND"));
    if (["SUBMITTED", "GRADED"].includes(instruction.status)) return res.status(400).json(getError("INSTRUCTION_ALREADY_SUBMITTED"));

    const expectedMimes = Object.entries(MIME_TO_EXT)
      .filter(([, exts]) => config.acceptedFormats?.some(f => exts.includes(f)))
      .map(([mime]) => mime);

    const timestamp = Date.now();
    const presignedUrls = [];

    for (let i = 0; i < files.length; i++) {
      const { fileName, contentType } = files[i];
      if (!fileName || !contentType) return res.status(400).json(getError("VALIDATION_MISSING_FIELDS"));

      const ext = path.extname(fileName).toLowerCase();
      if (config.acceptedFormats && !config.acceptedFormats.includes(ext)) return res.status(400).json(getError("INSTRUCTION_INVALID_FORMAT"));
      if (!/^[\w\-. ]+$/.test(path.basename(fileName))) return res.status(400).json(getError("INSTRUCTION_INVALID_FORMAT"));
      const mimePassesDirectly = expectedMimes.length === 0 || expectedMimes.includes(contentType);
      const mimeIsGeneric = contentType === "application/octet-stream" || contentType === "";
      if (!mimePassesDirectly && !mimeIsGeneric) return res.status(400).json(getError("INSTRUCTION_INVALID_FORMAT"));

      const s3Key = `instructions/${userId}/${instructionId}/${timestamp}-${i}${ext}`;

      const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: s3Key,
        ContentType: contentType,
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
      presignedUrls.push({ presignedUrl, s3Key });
    }

    return res.status(200).json({ success: true, presignedUrls });
  } catch (error) {
    console.error("Error generando presigned URLs:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const submitInstruction = async (req, res) => {
  try {
    const { programName, instructionId } = req.params;
    const userId = req.userAuth.id;

    if (!VALID_PROGRAMS.includes(programName)) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_INVALID"));

    const config = getInstructionConfig(programName, instructionId);
    if (!config) return res.status(404).json(getError("INSTRUCTION_NOT_FOUND"));

    const user = await User.findById(userId);
    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

    const program = user.programs?.[programName];
    if (!program || !hasAccess(program)) return res.status(403).json(getError("PROGRAM_NOT_PURCHASED"));

    const instructionIndex = program.instructions.findIndex(i => i.instructionId === instructionId);
    if (instructionIndex === -1) return res.status(404).json(getError("INSTRUCTION_NOT_FOUND"));

    const instruction = program.instructions[instructionIndex];
    if (instruction.status !== "IN_PROCESS") return res.status(400).json(getError("INSTRUCTION_ALREADY_SUBMITTED"));

    if (config.deliverableType === "file") {
      const s3Keys = req.body.s3Keys || (req.body.s3Key ? [req.body.s3Key] : []);
      if (s3Keys.length === 0) return res.status(400).json(getError("INSTRUCTION_FILE_REQUIRED"));

      const maxFiles = config.maxFiles || DEFAULT_MAX_FILES;
      if (s3Keys.length > maxFiles) return res.status(400).json(getError("INSTRUCTION_TOO_MANY_FILES"));

      const uniqueKeys = new Set(s3Keys);
      if (uniqueKeys.size !== s3Keys.length) return res.status(400).json(getError("INSTRUCTION_DUPLICATE_KEYS"));

      const expectedPrefix = `instructions/${userId}/${instructionId}/`;
      const s3KeyRegex = /^instructions\/[a-f0-9]+\/[a-zA-Z0-9]+\/\d+(-\d+)?\.\w+$/;
      const maxBytes = (config.maxFileSizeMB || 10) * 1024 * 1024;
      const fileUrls = [];

      for (const key of s3Keys) {
        if (!key.startsWith(expectedPrefix)) return res.status(400).json(getError("INSTRUCTION_FILE_REQUIRED"));
        if (key.includes('..') || !s3KeyRegex.test(key)) return res.status(400).json(getError("INSTRUCTION_FILE_REQUIRED"));

        try {
          const head = await s3Client.send(new HeadObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: key }));
          if (head.ContentLength > maxBytes) return res.status(400).json(getError("INSTRUCTION_FILE_TOO_LARGE"));
        } catch (s3Err) {
          return res.status(400).json(getError("INSTRUCTION_FILE_REQUIRED"));
        }

        fileUrls.push(`${process.env.AWS_S3_BASE_URL}/${key}`);
      }

      instruction.fileUrls = fileUrls;
    } else if (config.deliverableType === "text") {
      if (!req.body.submittedText || !req.body.submittedText.trim()) return res.status(400).json(getError("INSTRUCTION_TEXT_REQUIRED"));
    }

    if (req.body.submittedText) {
      const text = req.body.submittedText;
      if (text.length > 5000) return res.status(400).json(getError("INSTRUCTION_TEXT_TOO_LONG"));
      instruction.submittedText = text;
    }

    instruction.submittedAt = new Date();
    instruction.status = "SUBMITTED";

    await user.save();
    invalidateUser(userId);

    gradeWithRetry(userId, programName, instructionId).catch(err => {
      console.error(`[AI Grading] Error en background para ${instructionId}:`, err.message);
    });

    return res.status(200).json({ success: true, message: "Instrucción entregada correctamente." });
  } catch (error) {
    console.error("Error al entregar la instrucción:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const MAX_USER_RETRIES = 3;

const retryGrading = async (req, res) => {
  try {
    const { programName, instructionId } = req.params;
    const userId = req.userAuth.id;

    if (!VALID_PROGRAMS.includes(programName)) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_INVALID"));

    const user = await User.findById(userId);
    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

    const program = user.programs?.[programName];
    if (!program || !hasAccess(program)) return res.status(403).json(getError("PROGRAM_NOT_PURCHASED"));

    const instruction = program.instructions.find(i => i.instructionId === instructionId);
    if (!instruction) return res.status(404).json(getError("INSTRUCTION_NOT_FOUND"));

    if (instruction.status !== "ERROR") return res.status(400).json(getError("INSTRUCTION_NOT_IN_ERROR"));

    const retryCount = instruction.retryCount || 0;
    if (retryCount >= MAX_USER_RETRIES) return res.status(429).json(getError("INSTRUCTION_MAX_RETRIES"));

    instruction.status = "SUBMITTED";
    instruction.retryCount = retryCount + 1;
    await user.save();
    invalidateUser(userId);

    gradeWithRetry(userId, programName, instructionId).catch(err => {
      console.error(`[AI Grading] Error en retry para ${instructionId}:`, err.message);
    });

    return res.status(200).json({ success: true, message: "Reintentando corrección automática." });
  } catch (error) {
    console.error("Error al reintentar calificación:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { startInstruction, getPresignedUrls, submitInstruction, retryGrading };