const User = require("../models/userModel");
const { getError } = require("../helpers/getError");
const { getInstructionConfig } = require("../helpers/getInstructionConfig");

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

    const user = await User.findById(userId);
    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

    const program = user.programs?.[programName];
    if (!program || !program.isPurchased) return res.status(403).json(getError("PROGRAM_NOT_PURCHASED"));

    const instructionIndex = program.instructions.findIndex(i => i.instructionId === instructionId);
    if (instructionIndex === -1) return res.status(404).json(getError("INSTRUCTION_NOT_FOUND"));

    const instruction = program.instructions[instructionIndex];
    if (["SUBMITTED", "GRADED"].includes(instruction.status)) return res.status(400).json(getError("INSTRUCTION_ALREADY_SUBMITTED"));

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

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Instrucción calificada correctamente.",
      result: {
        score: instruction.score,
        observations: instruction.observations,
      },
    });
  } catch (error) {
    console.error("Error al calificar la instrucción:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { startInstruction, submitInstruction, gradeInstruction };