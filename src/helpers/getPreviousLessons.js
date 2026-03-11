const { programs } = require("../config/programs");

const getPreviousLessons = (programId, instructionId) => {
  const program = programs.find(p => p.id === programId);
  if (!program) return [];

  const allPreviousLessons = [];
  let foundInstruction = false;
  let instructionModuleIndex = -1;
  let afterLessonId = null;

  for (let i = 0; i < program.modules.length; i++) {
    const module = program.modules[i];
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
    const module = program.modules[i];
    if (module.lessons) {
      allPreviousLessons.push(...module.lessons.map(l => l.id));
    }
  }

  const currentModule = program.modules[instructionModuleIndex];
  if (currentModule.lessons && afterLessonId) {
    for (const lesson of currentModule.lessons) {
      allPreviousLessons.push(lesson.id);
      if (lesson.id === afterLessonId) break;
    }
  }

  return allPreviousLessons;
};

const getModuleLessons = (programId, instructionId) => {
  const program = programs.find(p => p.id === programId);
  if (!program) return [];

  for (const module of program.modules) {
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
