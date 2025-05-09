const { TMD_PROGRAM } = require('../config/programs/tmdProgram');

const getInstructionConfig = (programName, instructionId) => {
  let program;
  switch (programName) {
    case "TMD":
      program = TMD_PROGRAM;
      break;
    default:
      return null;
  }

  for (const module of program.modules) {
    const instruction = module.instructions?.find(inst => inst.id === instructionId);
    if (instruction) return instruction;
  }

  return null;
};

module.exports = { getInstructionConfig };