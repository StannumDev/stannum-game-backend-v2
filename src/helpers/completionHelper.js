const { programs } = require('../config/programs');

const isModuleCompleted = (programId, moduleId, userProgram) => {
    const programCfg = programs.find(p => p.id === programId);
    if (!programCfg || !userProgram) return false;

    const moduleCfg = programCfg.modules.find(m => m.id === moduleId);
    if (!moduleCfg) return false;

    const allLessons = (moduleCfg.lessons || []).every(
        l => (userProgram.lessonsCompleted || []).some(lc => lc.lessonId === l.id)
    );
    const allInstructions = (moduleCfg.instructions || []).every(
        inst => (userProgram.instructions || []).some(i => i.instructionId === inst.id && i.status === 'GRADED')
    );
    return allLessons && allInstructions;
};

const isProgramCompleted = (programId, userProgram) => {
    const programCfg = programs.find(p => p.id === programId);
    if (!programCfg || !userProgram) return false;

    return programCfg.modules.every(mod => isModuleCompleted(programId, mod.id, userProgram));
};

const findModuleByLessonId = (programId, lessonId) => {
    const programCfg = programs.find(p => p.id === programId);
    if (!programCfg) return null;
    return programCfg.modules.find(m => m.lessons.some(l => l.id === lessonId)) || null;
};

const findModuleByInstructionId = (programId, instructionId) => {
    const programCfg = programs.find(p => p.id === programId);
    if (!programCfg) return null;
    return programCfg.modules.find(m => (m.instructions || []).some(i => i.id === instructionId)) || null;
};

module.exports = { isModuleCompleted, isProgramCompleted, findModuleByLessonId, findModuleByInstructionId };
