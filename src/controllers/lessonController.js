const User = require("../models/userModel");
const { addExperience } = require("../services/experienceService");
const { getError } = require("../helpers/getError");
const { resolveLessonInfo } = require("../helpers/resolveLessonInfo");

const markLessonAsCompleted = async (req, res) => {
    try {
        const { programName, lessonId } = req.params;
        const userId = req.userAuth.id;

        if (!programName) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_REQUIRED"));
        if (!lessonId) return res.status(400).json(getError("VALIDATION_LESSON_ID_REQUIRED"));

        const lessonInfo = resolveLessonInfo(programName, lessonId);
        if (!lessonInfo || lessonInfo.durationSec <= 0) return res.status(404).json(getError("VALIDATION_LESSON_NOT_FOUND"));

        const user = await User.findById(userId);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const userProgram = user.programs[programName];
        if (!userProgram) return res.status(404).json(getError("VALIDATION_PROGRAM_NOT_FOUND"));
        if (!userProgram.isPurchased) return res.status(403).json(getError("VALIDATION_LESSON_NOT_PURCHASED"));

        const isAlreadyCompleted = userProgram.lessonsCompleted.some(lesson => lesson.lessonId === lessonId);
        if (isAlreadyCompleted) return res.status(400).json(getError("VALIDATION_LESSON_ALREADY_COMPLETED"));
        
        const { moduleIndex, durationSec } = lessonInfo;
        await addExperience(userId, 'LESSON_COMPLETED', { programId: programName, lessonId, moduleIndex, durationSec });

        userProgram.lessonsCompleted.push({ lessonId, viewedAt: new Date() });
        const updateResult = await user.save();
        if (!updateResult) return res.status(500).json(getError("VALIDATION_LESSON_UPDATE_FAILED"));
       
        return res.status(200).json({ success: true, message: "Lección marcada como completada." });
    } catch (error) {
        console.error("Error marcando lección como completada:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const updateLastWatched = async (req, res) => {
    try {
        const { programName, lessonId } = req.params;
        const { currentTime } = req.body;
        const userId = req.userAuth.id;

        if (!programName) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_REQUIRED"));
        if (!lessonId) return res.status(400).json(getError("VALIDATION_LESSON_ID_REQUIRED"));

        const user = await User.findById(userId);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const userProgram = user.programs[programName];
        if (!userProgram) return res.status(404).json(getError("VALIDATION_PROGRAM_NOT_FOUND"));
        if (!userProgram.isPurchased) return res.status(403).json(getError("VALIDATION_LESSON_NOT_PURCHASED"));

        userProgram.lastWatchedLesson = {
            lessonId,
            viewedAt: new Date(),
            currentTime
        };

        await user.save();
        return res.status(200).json({ success: true, message: "Última lección vista actualizada" });
    } catch (error) {
        console.error("Error actualizando última lección:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};


module.exports = { markLessonAsCompleted, updateLastWatched };