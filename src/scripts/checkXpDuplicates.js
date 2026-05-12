// Check if the 24 users with duplicate lessonsCompleted ALSO got double XP.
const mongoose = require("mongoose");
const User = require("../models/userModel");

(async () => {
    const url = process.env.DB_URL;
    console.log(`>>> DB: ${url.split("/").pop().split("?")[0]}\n`);
    await mongoose.connect(url);

    const users = await User.find({}, { email: 1, programs: 1, xpHistory: 1, level: 1 }).lean();

    for (const u of users) {
        const programIds = Object.keys(u.programs || {});
        const dupeLessonIds = new Set();
        for (const pid of programIds) {
            const lc = u.programs[pid]?.lessonsCompleted || [];
            const counts = {};
            for (const e of lc) counts[e.lessonId] = (counts[e.lessonId] || 0) + 1;
            for (const [lid, n] of Object.entries(counts)) {
                if (n > 1) dupeLessonIds.add(lid);
            }
        }
        if (dupeLessonIds.size === 0) continue;

        const xp = u.xpHistory || [];
        const lessonXpEntries = xp.filter(e => e.type === "LESSON_COMPLETED");
        const xpByLessonId = {};
        for (const e of lessonXpEntries) {
            const lid = e.meta?.lessonId;
            if (!lid) continue;
            xpByLessonId[lid] = (xpByLessonId[lid] || 0) + 1;
        }

        const dupedXp = [...dupeLessonIds].filter(lid => xpByLessonId[lid] > 1);
        if (dupedXp.length > 0) {
            console.log(`[${u.email}] ⚠ DOUBLE XP for: ${dupedXp.join(", ")}`);
            for (const lid of dupedXp) {
                const entries = lessonXpEntries.filter(e => e.meta?.lessonId === lid);
                for (const e of entries) console.log(`    ${lid} +${e.xp}xp @ ${e.createdAt || e.date || "?"}`);
            }
        } else {
            console.log(`[${u.email}] dup-lessons=${dupeLessonIds.size}, XP entries OK (no double XP)`);
        }
    }

    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
