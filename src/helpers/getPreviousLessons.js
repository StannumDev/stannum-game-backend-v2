const { getPrograms, getFlatModules } = require("../services/programCacheService");

const getPreviousLessons = async (programId, instructionId) => {
  const programs = await getPrograms();
  const program = programs.find(p => p.id === programId);
  if (!program) return [];

  const flatModules = getFlatModules(program);
  const allPreviousLessons = [];
  let foundInstruction = false;
  let instructionModuleIndex = -1;
  let afterLessonId = null;

  for (let i = 0; i < flatModules.length; i++) {
    const module = flatModules[i];
    const instruction = module.instructions?.find(inst => inst.id === instructionId);

    if (instruction) {
      foundInstruction = true;
      instructionModuleIndex = i;
      afterLessonId = instruction.afterLessonId;
      break;
    }
  }

  if (!foundInstruction) return [];

  for (let i = 0; i < instructionModuleIndex; i++) {
    const module = flatModules[i];
    if (module.lessons) {
      allPreviousLessons.push(...module.lessons.map(l => l.id));
    }
  }

  const currentModule = flatModules[instructionModuleIndex];
  if (currentModule.lessons && afterLessonId) {
    for (const lesson of currentModule.lessons) {
      allPreviousLessons.push(lesson.id);
      if (lesson.id === afterLessonId) break;
    }
  }

  return allPreviousLessons;
};

const getModuleLessons = async (programId, instructionId) => {
  const programs = await getPrograms();
  const program = programs.find(p => p.id === programId);
  if (!program) return [];

  const flatModules = getFlatModules(program);
  for (const module of flatModules) {
    const instruction = module.instructions?.find(inst => inst.id === instructionId);
    if (instruction) {
      if (!module.lessons || !instruction.afterLessonId) return [];
      const moduleLessons = [];
      for (const lesson of module.lessons) {
        moduleLessons.push(lesson.id);
        if (lesson.id === instruction.afterLessonId) break;
      }
      return moduleLessons;
    }
  }

  return [];
};

module.exports = { getPreviousLessons, getModuleLessons };
