const lessonsCatalog = require("../config/lessons_catalog.json");

/**
 * Obtiene el contenido completo de una lección (título y topics) dado su ID.
 * @param {string} programId - ID del programa (ej: "tia", "tia_summer", "tmd")
 * @param {string} lessonId - ID de la lección (ej: "TIAM01L01")
 * @returns {{ id: string, title: string, topics: string[] } | null}
 */
const getLessonContent = (programId, lessonId) => {
  const program = lessonsCatalog.programs.find(p => p.programId === programId);
  if (!program) return null;

  for (const module of program.modules) {
    const lesson = module.lessons.find(l => l.id === lessonId);
    if (lesson) {
      return {
        id: lesson.id,
        title: lesson.title,
        topics: lesson.topics,
      };
    }
  }

  return null;
};

/**
 * Obtiene el contenido completo de múltiples lecciones.
 * @param {string} programId - ID del programa
 * @param {string[]} lessonIds - Array de IDs de lecciones
 * @returns {Array<{ id: string, title: string, topics: string[] }>}
 */
const getMultipleLessonsContent = (programId, lessonIds) => {
  return lessonIds
    .map(lessonId => getLessonContent(programId, lessonId))
    .filter(lesson => lesson !== null);
};

module.exports = {
  getLessonContent,
  getMultipleLessonsContent,
};
