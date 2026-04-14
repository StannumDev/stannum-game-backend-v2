const { getPrograms, getFlatModules } = require('../services/programCacheService');

const isModuleCompleted = async (programId, moduleId, userProgram) => {
    const programs = await getPrograms();
    const programCfg = programs.find(p => p.id === programId);
    if (!programCfg || !userProgram) return false;

    const flatModules = getFlatModules(programCfg);
    const moduleCfg = flatModules.find(m => m.id === moduleId);
    if (!moduleCfg) return false;

    const allLessons = (moduleCfg.lessons || []).every(
        l => (userProgram.lessonsCompleted || []).some(lc => lc.lessonId === l.id)
    );
    const allInstructions = (moduleCfg.instructions || []).every(
        inst => (userProgram.instructions || []).some(i => i.instructionId === inst.id && i.status === 'GRADED')
    );
    return allLessons && allInstructions;
};

const isProgramCompleted = async (programId, userProgram) => {
    const programs = await getPrograms();
    const programCfg = programs.find(p => p.id === programId);
    if (!programCfg || !userProgram) return false;

    const flatModules = getFlatModules(programCfg);
    for (const mod of flatModules) {
        const allLessons = (mod.lessons || []).every(
            l => (userProgram.lessonsCompleted || []).some(lc => lc.lessonId === l.id)
        );
        const allInstructions = (mod.instructions || []).every(
            inst => (userProgram.instructions || []).some(i => i.instructionId === inst.id && i.status === 'GRADED')
        );
        if (!allLessons || !allInstructions) return false;
    }
    return true;
};

const findModuleByLessonId = async (programId, lessonId) => {
    const programs = await getPrograms();
    const programCfg = programs.find(p => p.id === programId);
    if (!programCfg) return null;

    const flatModules = getFlatModules(programCfg);
    return flatModules.find(m => m.lessons.some(l => l.id === lessonId)) || null;
};

const findModuleByInstructionId = async (programId, instructionId) => {
    const programs = await getPrograms();
    const programCfg = programs.find(p => p.id === programId);
    if (!programCfg) return null;

    const flatModules = getFlatModules(programCfg);
    return flatModules.find(m => (m.instructions || []).some(i => i.id === instructionId)) || null;
};

module.exports = { isModuleCompleted, isProgramCompleted, findModuleByLessonId, findModuleByInstructionId };
