const { programs } = require("../config/programs");

/**
 * Obtiene TODOS los IDs de lecciones anteriores a una instrucción dada.
 * Incluye todas las lecciones de módulos anteriores + lecciones del módulo actual hasta afterLessonId.
 *
 * @param {string} programId - ID del programa (ej: "tia", "tia_summer", "tmd")
 * @param {string} instructionId - ID de la instrucción (ej: "TIAM01I01")
 * @returns {string[]} Array de IDs de lecciones anteriores
 */
const getPreviousLessons = (programId, instructionId) => {
  const program = programs.find(p => p.id === programId);
  if (!program) return [];

  const allPreviousLessons = [];
  let foundInstruction = false;
  let instructionModuleIndex = -1;
  let afterLessonId = null;

  // 1. Encontrar la instrucción y su módulo
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

  // 2. Agregar TODAS las lecciones de módulos anteriores
  for (let i = 0; i < instructionModuleIndex; i++) {
    const module = program.modules[i];
    if (module.lessons) {
      allPreviousLessons.push(...module.lessons.map(l => l.id));
    }
  }

  // 3. Agregar lecciones del módulo actual hasta afterLessonId
  const currentModule = program.modules[instructionModuleIndex];
  if (currentModule.lessons && afterLessonId) {
    for (const lesson of currentModule.lessons) {
      allPreviousLessons.push(lesson.id);

      // Detenerse después de incluir la lección afterLessonId
      if (lesson.id === afterLessonId) {
        break;
      }
    }
  }

  return allPreviousLessons;
};

module.exports = { getPreviousLessons };
