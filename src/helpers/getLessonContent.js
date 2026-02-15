const lessonsCatalog = require("../config/lessons_catalog.json");

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

const getMultipleLessonsContent = (programId, lessonIds) => {
  return lessonIds
    .map(lessonId => getLessonContent(programId, lessonId))
    .filter(lesson => lesson !== null);
};

module.exports = {
  getLessonContent,
  getMultipleLessonsContent,
};
