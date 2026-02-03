const { programs } = require('../config/programs');

const getInstructionConfig = (programName, instructionId) => {
  const program = programs.find(p => p.id === programName);
  if (!program) return null;

  for (const mod of (program.modules || [])) {
    const instruction = mod.instructions?.find(inst => inst.id === instructionId);
    if (instruction) return { ...instruction, moduleId: mod.id };
  }

  return null;
};

module.exports = { getInstructionConfig };