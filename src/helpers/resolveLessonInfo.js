const { programs } = require('../config/programs');

const resolveLessonInfo = (programId, lessonId) => {
    const prog = programs.find(p => p.id === programId);
    if (!prog) return { moduleIndex: 0, durationSec: 0 };

    for (let m = 0; m < (prog.modules?.length || 0); m++) {
        const mod = prog.modules[m];
        const lesson = mod.lessons?.find(l => l.id === lessonId);
        if (lesson) {
            return {
                moduleIndex: m,
                durationSec: Number(lesson.durationSec) || 0
            };
        }
    }
    return { moduleIndex: 0, durationSec: 0 };
};


module.exports = { resolveLessonInfo };