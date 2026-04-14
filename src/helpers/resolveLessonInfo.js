const { getPrograms, getFlatModules } = require('../services/programCacheService');

const resolveLessonInfo = async (programId, lessonId) => {
    const programs = await getPrograms();
    const prog = programs.find(p => p.id === programId);
    if (!prog) return { moduleIndex: 0, durationSec: 0 };

    const flatModules = getFlatModules(prog);
    for (let m = 0; m < flatModules.length; m++) {
        const lesson = flatModules[m].lessons?.find(l => l.id === lessonId);
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
