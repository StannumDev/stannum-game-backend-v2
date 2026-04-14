const User = require("../models/userModel");
const { addExperience } = require("../services/experienceService");
const { getError } = require("../helpers/getError");
const { getPrograms, getFlatModules } = require("../services/programCacheService");
const { isValidProgram } = require("../config/programRegistry");
const { hasAccess } = require("../utils/accessControl");
const { getPlaybackId: getMuxPlaybackId } = require("../config/muxPlaybackIds");
const { invalidateUser, invalidateRankingsForProgram } = require("../cache/cacheService");

const markLessonAsCompleted = async (req, res) => {
    try {
        const { programName, lessonId } = req.params;
        const userId = req.userAuth.id;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        if (!programName) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_REQUIRED"));
        if (!lessonId) return res.status(400).json(getError("VALIDATION_LESSON_ID_REQUIRED"));

        if (!isValidProgram(programName)) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_INVALID"));

        const userProgram = user.programs[programName];
        if (!userProgram) return res.status(404).json(getError("VALIDATION_PROGRAM_NOT_FOUND"));
        if (!hasAccess(userProgram)) return res.status(403).json(getError("VALIDATION_LESSON_NOT_PURCHASED"));

        const isAlreadyCompleted = userProgram.lessonsCompleted?.some(l => l.lessonId === lessonId);
        if (isAlreadyCompleted) return res.status(400).json(getError("VALIDATION_LESSON_ALREADY_COMPLETED"));

        const alreadyGivenXP = user.xpHistory.some(entry => entry.type === 'LESSON_COMPLETED' && entry.meta?.lessonId === lessonId);
        if (alreadyGivenXP) return res.status(400).json(getError("VALIDATION_LESSON_ALREADY_COMPLETED"));

        const allPrograms = await getPrograms();
        const programConfig = allPrograms.find(p => p.id === programName);
        if (!programConfig) return res.status(404).json(getError("VALIDATION_PROGRAM_NOT_FOUND"));

        const flatMods = getFlatModules(programConfig);
        let lessonFound = false;
        for (const mod of flatMods) {
            const lessonIndex = mod.lessons.findIndex(l => l.id === lessonId);
            if (lessonIndex === -1) continue;

            lessonFound = true;
            for (const instr of (mod.instructions || [])) {
                const afterIndex = mod.lessons.findIndex(l => l.id === instr.afterLessonId);
                if (afterIndex === -1) continue;

                if (lessonIndex > afterIndex) {
                    const userInstr = userProgram.instructions.find(i => i.instructionId === instr.id);
                    const isSubmitted = userInstr && ["SUBMITTED", "GRADED"].includes(userInstr.status);
                    if (!isSubmitted) {
                        return res.status(403).json(getError("LESSON_BLOCKED_BY_INSTRUCTION"));
                    }
                }
            }
            break;
        }
        if (!lessonFound) return res.status(404).json(getError("VALIDATION_LESSON_NOT_FOUND"));

        const atomicPush = await User.findOneAndUpdate(
            {
                _id: userId,
                [`programs.${programName}.lessonsCompleted.lessonId`]: { $ne: lessonId },
            },
            {
                $push: { [`programs.${programName}.lessonsCompleted`]: { lessonId, viewedAt: new Date() } },
            },
            { new: true }
        );
        if (!atomicPush) return res.status(400).json(getError("VALIDATION_LESSON_ALREADY_COMPLETED"));

        const xpResult = await addExperience(atomicPush, 'LESSON_COMPLETED', { programId: programName, lessonId });

        await atomicPush.save();
        invalidateUser(userId);
        invalidateRankingsForProgram(programName);

        return res.status(200).json({
            success: true,
            message: "Lección marcada como completada.",
            ...xpResult,
        });

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
        if (typeof currentTime !== 'number' || currentTime < 0) return res.status(400).json(getError("VALIDATION_MISSING_FIELDS"));

        const user = await User.findById(userId);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const userProgram = user.programs[programName];
        if (!userProgram) return res.status(404).json(getError("VALIDATION_PROGRAM_NOT_FOUND"));
        if (!hasAccess(userProgram)) return res.status(403).json(getError("VALIDATION_LESSON_NOT_PURCHASED"));

        userProgram.lastWatchedLesson = {
            lessonId,
            viewedAt: new Date(),
            currentTime
        };

        await user.save();
        invalidateUser(userId);
        return res.status(200).json({ success: true, message: "Última lección vista actualizada" });
    } catch (error) {
        console.error("Error actualizando última lección:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};


const getPlaybackId = async (req, res) => {
    try {
        const { programName, lessonId } = req.params;
        const userId = req.userAuth.id;

        if (!isValidProgram(programName)) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_INVALID"));

        const user = await User.findById(userId).select(`programs.${programName}`).lean();
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const userProgram = user.programs?.[programName];
        if (!hasAccess(userProgram)) return res.status(403).json(getError("VALIDATION_LESSON_NOT_PURCHASED"));

        // Verify lesson belongs to the requested program before returning playback ID
        const allPrograms = await getPrograms();
        const programConfig = allPrograms.find(p => p.id === programName);
        if (!programConfig) return res.status(404).json(getError("VALIDATION_PROGRAM_NOT_FOUND"));

        const flatMods = getFlatModules(programConfig);
        const lessonBelongsToProgram = flatMods.some(mod => mod.lessons.some(l => l.id === lessonId));
        if (!lessonBelongsToProgram) return res.status(404).json(getError("VALIDATION_LESSON_NOT_FOUND"));

        const playbackId = getMuxPlaybackId(lessonId);
        if (!playbackId) return res.status(404).json(getError("VALIDATION_LESSON_NOT_FOUND"));

        return res.status(200).json({ success: true, playbackId });
    } catch (error) {
        console.error("Error getting playback ID:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

module.exports = { markLessonAsCompleted, updateLastWatched, getPlaybackId };