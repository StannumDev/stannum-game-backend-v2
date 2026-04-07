const { getPrograms, getFlatModules } = require('../services/programCacheService');

const getInstructionConfig = async (programName, instructionId) => {
    const programs = await getPrograms();
    const program = programs.find(p => p.id === programName);
    if (!program) return null;

    const flatModules = getFlatModules(program);
    for (const module of flatModules) {
        const instruction = module.instructions?.find(inst => inst.id === instructionId);
        if (instruction) return instruction;
    }

    return null;
};

module.exports = { getInstructionConfig };
