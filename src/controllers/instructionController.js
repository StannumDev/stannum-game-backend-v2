const User = require("../models/userModel");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { s3Client } = require("../helpers/s3Client");
const { getError } = require("../helpers/getError");
const { getInstructionConfig } = require("../helpers/getInstructionConfig");

const uploadInstructionFile = async (req, res) => {
  try {
    const { programName, instructionId } = req.params;
    const userId = req.userAuth.id;
    const file = req.file;

    if (!file) return res.status(400).json(getError("INSTRUCTION_FILE_REQUIRED"));

    const fileExtension = file.originalname.split('.').pop().toLowerCase();
    const fileSizeInMB = file.size / (1024 * 1024);

    const config = getInstructionConfig(programName, instructionId);
    if (!config) return res.status(404).json(getError("INSTRUCTION_NOT_FOUND"));

    if (!config.allowedFormats.includes(fileExtension)) {
      return res.status(400).json(getError("INSTRUCTION_INVALID_FORMAT"));
    }

    if (fileSizeInMB > config.maxSizeMB) {
      return res.status(400).json(getError("INSTRUCTION_FILE_TOO_LARGE"));
    }

    const s3Key = `${process.env.AWS_S3_INSTRUCTIONS_FOLDER}/${userId}/${programName}/${instructionId}.${fileExtension}`;

    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        userId: userId.toString(),
        instructionId,
      },
    };

    await s3Client.send(new PutObjectCommand(params));

    const user = await User.findById(userId);
    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

    const program = user.programs[programName];
    if (!program || !program.isPurchased) return res.status(403).json(getError("PROGRAM_NOT_PURCHASED"));

    const instructionIndex = program.instructions.findIndex(i => i.instructionId === instructionId);

    const instructionData = {
      instructionId,
      fileUrl: `${process.env.S3_BASE_URL}/${s3Key}`,
      submittedAt: new Date(),
      status: "SUBMITTED"
    };

    if (instructionIndex >= 0) {
      program.instructions[instructionIndex] = { ...program.instructions[instructionIndex], ...instructionData };
    } else {
      program.instructions.push(instructionData);
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Archivo subido correctamente.",
      fileUrl: instructionData.fileUrl
    });

  } catch (error) {
    console.error("Error subiendo archivo de instrucción:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { uploadInstructionFile };