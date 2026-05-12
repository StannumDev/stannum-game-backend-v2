// Full cleanup of race-condition duplicates:
//   1) Dedupe user.programs.{pid}.lessonsCompleted by lessonId (keep oldest).
//   2) Dedupe user.xpHistory LESSON_COMPLETED entries by meta.lessonId (keep oldest).
//   3) Recalculate level.experienceTotal/currentLevel/experienceCurrentLevel/experienceNextLevel/progress
//      from the deduped xpHistory.
//   4) Also recompute programs.{pid}.totalXp (subtract the duplicated lesson XP).
//
// Default = dry-run. Run with APPLY=true to write.

const mongoose = require("mongoose");
const User = require("../models/userModel");
const xpCfg = require("../config/xpConfig");
const { nextLevelTarget, computeLevelProgress } = require("../helpers/experienceHelper");

const APPLY = process.env.APPLY === "true";

// Recompute level from a given experienceTotal, walking up from L1.
function recalcLevelFromTotal(totalXp) {
    let level = {
        currentLevel: 1,
        experienceTotal: totalXp,
        experienceCurrentLevel: 0,
        experienceNextLevel: nextLevelTarget(1, 0, xpCfg),
    };
    while (level.experienceTotal >= level.experienceNextLevel && level.currentLevel < xpCfg.LEVELS.MAX_LEVEL) {
        level.currentLevel += 1;
        level.experienceCurrentLevel = level.experienceNextLevel;
        level.experienceNextLevel = nextLevelTarget(level.currentLevel, level.experienceCurrentLevel, xpCfg);
    }
    level.progress = computeLevelProgress(level);
    return level;
}

(async () => {
    const url = process.env.DB_URL;
    console.log(`>>> DB: ${url.split("/").pop().split("?")[0]}`);
    console.log(`>>> Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}\n`);
    await mongoose.connect(url);

    const users = await User.find({}, { email: 1, username: 1, programs: 1, xpHistory: 1, level: 1 }).lean();
    const changes = [];

    for (const u of users) {
        const programIds = Object.keys(u.programs || {});
        let touched = false;

        const updates = {};
        const dupeLessonByProgram = {};

        // 1) Dedupe lessonsCompleted per program
        for (const pid of programIds) {
            const lc = u.programs[pid]?.lessonsCompleted || [];
            if (lc.length === 0) continue;
            const seen = new Map();
            for (const e of lc) {
                const prev = seen.get(e.lessonId);
                if (!prev || new Date(e.viewedAt) < new Date(prev.viewedAt)) seen.set(e.lessonId, e);
            }
            const deduped = Array.from(seen.values()).sort((a, b) => new Date(a.viewedAt) - new Date(b.viewedAt));
            if (deduped.length !== lc.length) {
                touched = true;
                updates[`programs.${pid}.lessonsCompleted`] = deduped;
                const removedIds = [];
                const counts = {};
                for (const e of lc) counts[e.lessonId] = (counts[e.lessonId] || 0) + 1;
                for (const [lid, n] of Object.entries(counts)) {
                    if (n > 1) removedIds.push({ lessonId: lid, removed: n - 1 });
                }
                dupeLessonByProgram[pid] = { before: lc.length, after: deduped.length, removedIds };
            }
        }

        // 2) Dedupe xpHistory LESSON_COMPLETED entries (and INSTRUCTION_GRADED for safety)
        const xpHistory = u.xpHistory || [];
        const dedupedHistory = [];
        const seenLessons = new Set();
        const seenInstructions = new Set();
        const seenChests = new Set();
        let xpRemovedCount = 0;
        let xpRemovedTotal = 0;
        const removedXpDetail = [];

        for (const entry of xpHistory) {
            if (entry.type === "LESSON_COMPLETED" && entry.meta?.lessonId) {
                if (seenLessons.has(entry.meta.lessonId)) {
                    xpRemovedCount++;
                    xpRemovedTotal += entry.xp || 0;
                    removedXpDetail.push({ type: entry.type, lessonId: entry.meta.lessonId, xp: entry.xp });
                    continue;
                }
                seenLessons.add(entry.meta.lessonId);
            } else if (entry.type === "INSTRUCTION_GRADED" && entry.meta?.instructionId) {
                if (seenInstructions.has(entry.meta.instructionId)) {
                    xpRemovedCount++;
                    xpRemovedTotal += entry.xp || 0;
                    removedXpDetail.push({ type: entry.type, instructionId: entry.meta.instructionId, xp: entry.xp });
                    continue;
                }
                seenInstructions.add(entry.meta.instructionId);
            } else if (entry.type === "CHEST_OPENED" && entry.meta?.chestId) {
                if (seenChests.has(entry.meta.chestId)) {
                    xpRemovedCount++;
                    xpRemovedTotal += entry.xp || 0;
                    removedXpDetail.push({ type: entry.type, chestId: entry.meta.chestId, xp: entry.xp });
                    continue;
                }
                seenChests.add(entry.meta.chestId);
            }
            dedupedHistory.push(entry);
        }

        if (xpRemovedCount > 0) {
            touched = true;
            updates.xpHistory = dedupedHistory;
        }

        // 3) Recalc level: subtract removed XP from current experienceTotal, then re-derive level
        let oldLevel = u.level || {};
        let newLevel = null;
        if (touched) {
            const newTotalXp = Math.max(0, (oldLevel.experienceTotal || 0) - xpRemovedTotal);
            newLevel = recalcLevelFromTotal(newTotalXp);
            const levelChanged = (
                newLevel.experienceTotal !== oldLevel.experienceTotal ||
                newLevel.currentLevel !== oldLevel.currentLevel ||
                newLevel.experienceCurrentLevel !== oldLevel.experienceCurrentLevel ||
                newLevel.experienceNextLevel !== oldLevel.experienceNextLevel ||
                newLevel.progress !== oldLevel.progress
            );
            if (levelChanged) updates.level = newLevel;
        }

        // 4) Recalc programs.{pid}.totalXp (subtract removed lesson XP per program)
        if (xpRemovedCount > 0) {
            const removedXpByLesson = {};
            for (const r of removedXpDetail) {
                if (r.type === "LESSON_COMPLETED") removedXpByLesson[r.lessonId] = (removedXpByLesson[r.lessonId] || 0) + r.xp;
            }
            // Map removed lessonIds back to their program by checking original lessonsCompleted
            for (const pid of programIds) {
                const lc = u.programs[pid]?.lessonsCompleted || [];
                let removedForProgram = 0;
                for (const lid of Object.keys(removedXpByLesson)) {
                    if (lc.some(e => e.lessonId === lid)) removedForProgram += removedXpByLesson[lid];
                }
                if (removedForProgram > 0) {
                    const currentTotal = u.programs[pid]?.totalXp || 0;
                    const newTotal = Math.max(0, currentTotal - removedForProgram);
                    updates[`programs.${pid}.totalXp`] = newTotal;
                }
            }
        }

        if (touched) {
            changes.push({
                email: u.email,
                username: u.username,
                lessonDedup: dupeLessonByProgram,
                xpRemoved: xpRemovedCount,
                xpRemovedTotal,
                removedXpDetail,
                oldLevel: { currentLevel: oldLevel.currentLevel, experienceTotal: oldLevel.experienceTotal },
                newLevel: newLevel && { currentLevel: newLevel.currentLevel, experienceTotal: newLevel.experienceTotal },
                programTotalXpUpdates: Object.entries(updates).filter(([k]) => k.endsWith(".totalXp")),
            });

            if (APPLY) {
                await User.updateOne({ _id: u._id }, { $set: updates });
            }
        }
    }

    let totalLessonDupes = 0, totalXpDupes = 0, totalXpRemoved = 0, levelDowngrades = 0;
    for (const c of changes) {
        for (const p of Object.values(c.lessonDedup)) totalLessonDupes += p.before - p.after;
        totalXpDupes += c.xpRemoved;
        totalXpRemoved += c.xpRemovedTotal;
        if (c.newLevel && c.newLevel.currentLevel < c.oldLevel.currentLevel) levelDowngrades++;
    }

    console.log(`=== Summary ===`);
    console.log(`Users to update: ${changes.length}`);
    console.log(`Lesson dup entries removed: ${totalLessonDupes}`);
    console.log(`xpHistory dup entries removed: ${totalXpDupes}`);
    console.log(`Total XP rolled back: ${totalXpRemoved}`);
    console.log(`Users who would drop a level: ${levelDowngrades}`);

    console.log(`\n=== Per-user detail ===`);
    for (const c of changes) {
        console.log(`\n[${c.email}] ${c.username}`);
        for (const [pid, info] of Object.entries(c.lessonDedup)) {
            console.log(`  lessonsCompleted.${pid}: ${info.before} → ${info.after}  removed: ${info.removedIds.map(r => `${r.lessonId}(×${r.removed})`).join(", ")}`);
        }
        console.log(`  xpHistory: removed ${c.xpRemoved} entries (${c.xpRemovedTotal} XP rolled back)`);
        const levelDelta = c.newLevel.currentLevel - c.oldLevel.currentLevel;
        console.log(`  level: L${c.oldLevel.currentLevel} (${c.oldLevel.experienceTotal} XP) → L${c.newLevel.currentLevel} (${c.newLevel.experienceTotal} XP) ${levelDelta < 0 ? "  ⚠ DROPS " + Math.abs(levelDelta) + " LEVEL(S)" : ""}`);
        for (const [k, v] of c.programTotalXpUpdates) console.log(`  ${k}: ${v}`);
    }

    if (!APPLY) console.log(`\n(dry-run; nothing was written)`);
    else console.log(`\n>>> WRITES COMPLETED.`);

    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
