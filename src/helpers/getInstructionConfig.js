const { programs } = require('../config/programs');

const getInstructionConfig = (programName, instructionId) => {
  const program = programs.find(p => p.id === programName);
  if (!program) return null;

  for (const module of program.modules) {
    const instruction = module.instructions?.find(inst => inst.id === instructionId);
    if (instruction) return instruction;
  }

  return null;
};

module.exports = { getInstructionConfig };
