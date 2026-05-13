/**
 * Restore Lesson Timestamps
 * --------------------------------------------------------------------------
 * Cleans up "Actualizado" badge noise caused by prior buggy seeds that
 * regenerated `updatedAt` of all lessons. For every lesson/instruction where
 * `updatedAt > createdAt`, sets `updatedAt = createdAt`.
 *
 * Lessons where `updatedAt === createdAt` are skipped — including freshly
 * created lessons (M03) whose timestamps were both set to NOW. This is safe
 * because in this codebase nobody edits lessons via the admin panel, so any
 * `updatedAt > createdAt` is seed/script noise, not a legit content change.
 *
 * Usage:
 *   node src/scripts/restoreLessonTimestamps.js              # dry-run (default)
 *   node src/scripts/restoreLessonTimestamps.js --execute    # writes to DB
 */

const mongoose = require('mongoose');
const { Program } = require('../models/programModel');

const EXECUTE = process.argv.includes('--execute');

(async () => {
    const dbUrl = process.env.DB_URL;
    if (!dbUrl) throw new Error('DB_URL not set');
    const dbName = dbUrl.split('/').pop().split('?')[0];

    console.log('============================================================');
    console.log(`Mode: ${EXECUTE ? 'EXECUTE (writes to DB)' : 'DRY-RUN (no writes)'}`);
    console.log(`Target DB: ${dbName}`);
    console.log('============================================================\n');

    await mongoose.connect(dbUrl);

    const programs = await Program.find({}).lean();
    let totalOps = 0;

    for (const prog of programs) {
        console.log(`--- Program: ${prog.id} ---`);
        const ops = [];

        for (const section of prog.sections || []) {
            for (const mod of section.modules || []) {
                for (const lesson of mod.lessons || []) {
                    if (!lesson.createdAt || !lesson.updatedAt) continue;
                    if (lesson.updatedAt.getTime() <= lesson.createdAt.getTime()) continue;

                    ops.push({
                        updateOne: {
                            filter: { id: prog.id },
                            update: {
                                $set: {
                                    'sections.$[s].modules.$[m].lessons.$[l].updatedAt': lesson.createdAt,
                                },
                            },
                            arrayFilters: [
                                { 's.id': section.id },
                                { 'm.id': mod.id },
                                { 'l.id': lesson.id },
                            ],
                        },
                    });
                    console.log(`  lesson ${lesson.id}: ${lesson.updatedAt.toISOString()} → ${lesson.createdAt.toISOString()}`);
                }

                for (const instr of mod.instructions || []) {
                    if (!instr.createdAt || !instr.updatedAt) continue;
                    if (instr.updatedAt.getTime() <= instr.createdAt.getTime()) continue;

                    ops.push({
                        updateOne: {
                            filter: { id: prog.id },
                            update: {
                                $set: {
                                    'sections.$[s].modules.$[m].instructions.$[i].updatedAt': instr.createdAt,
                                },
                            },
                            arrayFilters: [
                                { 's.id': section.id },
                                { 'm.id': mod.id },
                                { 'i.id': instr.id },
                            ],
                        },
                    });
                    console.log(`  instruction ${instr.id}: ${instr.updatedAt.toISOString()} → ${instr.createdAt.toISOString()}`);
                }
            }
        }

        console.log(`  Total ops for ${prog.id}: ${ops.length}`);
        totalOps += ops.length;

        if (EXECUTE && ops.length > 0) {
            const result = await Program.collection.bulkWrite(ops, { ordered: true });
            console.log(`  ✓ matched=${result.matchedCount}, modified=${result.modifiedCount}`);
        }
        console.log('');
    }

    console.log('============================================================');
    console.log(`Total ops across all programs: ${totalOps}`);
    if (!EXECUTE) console.log('\n(dry-run, no changes written. Re-run with --execute to apply.)');
    console.log('============================================================');

    await mongoose.disconnect();
})().catch(err => {
    console.error('FAILED:', err);
    process.exit(1);
});
