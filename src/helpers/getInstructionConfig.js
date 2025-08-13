const { TMD_PROGRAM, TIA_PROGRAM } = require('../config/programs');

const getInstructionConfig = (programName, instructionId) => {
  let program;
  switch (programName) {
    case "tmd":
      program = TMD_PROGRAM;
      break;
    case "tia":
      program = TIA_PROGRAM;
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