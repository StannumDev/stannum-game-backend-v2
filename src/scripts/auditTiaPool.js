const mongoose = require("mongoose");
const { Program } = require("../models/programModel");
const User = require("../models/userModel");

const PROGRAM_ID = "tia_pool";

function isLessonAvailable(user, programId, module, lessonId, extraCompletedLessons = []) {
    const lesson = module.lessons.find(l => l.id === lessonId);
    if (!lesson) return false;
    if (lesson.blocked) return false;
    const lessonIndex = module.lessons.findIndex(l => l.id === lessonId);
    if (lessonIndex === 0) return true;
    const userLessons = [
        ...(user.programs?.[programId]?.lessonsCompleted || []).map(l => l.lessonId),
        ...extraCompletedLessons,
    ];
    if (userLessons.includes(lessonId)) return true;
    const hasLaterCompleted = module.lessons.slice(lessonIndex + 1).some(l => userLessons.includes(l.id));
    if (hasLaterCompleted) return true;
    const previousLessons = module.lessons.slice(0, lessonIndex);
    const allPreviousCompleted = previousLessons.filter(l => !l.blocked).every(l => userLessons.includes(l.id));
    if (!allPreviousCompleted) return false;
    const userInstructions = user.programs?.[programId]?.instructions || [];
    for (const instr of module.instructions) {
        const afterIndex = module.lessons.findIndex(l => l.id === instr.afterLessonId);
        if (afterIndex === -1) continue;
        if (lessonIndex > afterIndex) {
            const userInstr = userInstructions.find(ui => ui.instructionId === instr.id);
            const isSubmitted = userInstr && ["SUBMITTED", "GRADED"].includes(userInstr.status);
            if (!isSubmitted) return false;
        }
    }
    return true;
}

(async () => {
    const url = process.env.DB_URL;
    console.log(`>>> DB: ${url.split("/").pop().split("?")[0]}`);
    await mongoose.connect(url);

    const program = await Program.findOne({ id: PROGRAM_ID }).lean();
    const flatModules = [];
    for (const section of program.sections || []) {
        for (const mod of section.modules || []) flatModules.push(mod);
    }

    const users = await User.find({ [`programs.${PROGRAM_ID}.hasAccessFlag`]: true }, { email: 1, username: 1, programs: 1 }).lean();
    console.log(`Total tia_pool users with access: ${users.length}\n`);

    for (const u of users) {
        const lc = u.programs?.[PROGRAM_ID]?.lessonsCompleted || [];
        const completedIds = lc.map(l => l.lessonId);
        const uniqueCompleted = [...new Set(completedIds)];
        const dupes = completedIds.length - uniqueCompleted.length;

        let availableCount = 0;
        let blockedCount = 0;
        const firstBlocked = [];
        for (const mod of flatModules) {
            for (const lesson of mod.lessons) {
                if (isLessonAvailable(u, PROGRAM_ID, mod, lesson.id)) availableCount++;
                else {
                    blockedCount++;
                    if (firstBlocked.length < 1) firstBlocked.push(`${mod.id}/${lesson.id}`);
                }
            }
        }

        console.log(`[${u.email}] ${u.username}`);
        console.log(`  completed=${completedIds.length} (unique=${uniqueCompleted.length}, dupes=${dupes}) | available=${availableCount}/${availableCount + blockedCount} | firstBlocked=${firstBlocked[0] || "(none)"}`);
    }

    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
