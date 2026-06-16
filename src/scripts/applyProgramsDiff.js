/**
 * Apply Programs Diff
 * --------------------------------------------------------------------------
 * Idempotent migration that aligns each program in MongoDB with the seed
 * source-of-truth (`src/migrations/seedPrograms.js`) using explicit bulkWrite
 * operations against the raw driver. Avoids Mongoose dirty-tracking pitfalls
 * that previously caused `updatedAt` regeneration of all lessons on each seed.
 *
 * Behavior per lesson/instruction:
 *  - exists in DB, all fields equal → no operation (preserves timestamps)
 *  - exists in DB, some field differs → $set changed fields + updatedAt = NOW
 *  - new in seed → $push with createdAt = updatedAt = NOW embedded
 *  - exists in DB but not in seed → kept (we do not auto-delete subdocs)
 *
 * Usage:
 *   node src/scripts/applyProgramsDiff.js              # dry-run (default)
 *   node src/scripts/applyProgramsDiff.js --execute    # writes to DB
 */

const mongoose = require('mongoose');
const { Program } = require('../models/programModel');

const PROGRAM_TOP_FIELDS = [
    'name', 'price', 'href', 'categories', 'description', 'type', 'trainingType',
    'priceARS', 'subscriptionPriceARS', 'purchasable', 'hidden',
    'longDescription', 'learningPoints', 'logoUrl', 'backgroundUrl',
];

const LESSON_FIELDS = [
    'title', 'longTitle', 'description', 'durationSec',
    'muxPlaybackId', 'blocked', 'order',
];

const INSTRUCTION_FIELDS = [
    'title', 'shortDescription', 'description', 'difficulty',
    'rewardXP', 'estimatedTimeSec', 'acceptedFormats', 'maxFileSizeMB',
    'deliverableHint', 'afterLessonId', 'deliverableType', 'maxFiles',
    'requiredActivityId', 'tools', 'steps', 'resources', 'order',
];

const isEqual = (a, b) => {
    if (a === b) return true;
    if (a == null || b == null) return a == b;
    if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
    if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return false;
};

const flattenResources = (resources) => {
    const flat = [];
    for (const res of resources) {
        const { children, ...rest } = res;
        flat.push({ ...rest, parentId: rest.parentId ?? null });
        if (children && children.length > 0) {
            for (const child of children) {
                const { children: _g, ...childRest } = child;
                flat.push({ ...childRest, parentId: rest.id });
            }
        }
    }
    return flat;
};

const buildOpsForProgram = (seedProg, dbProg, now) => {
    const ops = [];
    const summary = {
        lessonsCreated: 0, lessonsUpdated: 0, lessonsUnchanged: 0,
        instructionsCreated: 0, instructionsUpdated: 0, instructionsUnchanged: 0,
        modulesCreated: 0, sectionsCreated: 0, topLevelChanged: false,
        details: [],
    };

    const topSet = {};
    for (const f of PROGRAM_TOP_FIELDS) {
        if (seedProg[f] !== undefined && !isEqual(dbProg[f], seedProg[f])) {
            topSet[f] = seedProg[f];
        }
    }
    if (Object.keys(topSet).length > 0) {
        ops.push({ updateOne: { filter: { id: seedProg.id }, update: { $set: topSet } } });
        summary.topLevelChanged = true;
        summary.details.push(`top-level: ${Object.keys(topSet).join(', ')}`);
    }

    const dbSectionsById = new Map((dbProg.sections || []).map(s => [s.id, s]));

    for (const seedSec of seedProg.sections) {
        const dbSec = dbSectionsById.get(seedSec.id);

        if (!dbSec) {
            const sectionDoc = JSON.parse(JSON.stringify(seedSec));
            if (sectionDoc.resources && sectionDoc.resources.length > 0) {
                sectionDoc.resources = flattenResources(sectionDoc.resources);
            }
            for (const mod of sectionDoc.modules || []) {
                for (const l of mod.lessons || []) { l.createdAt = now; l.updatedAt = now; }
                for (const i of mod.instructions || []) { i.createdAt = now; i.updatedAt = now; }
            }
            ops.push({ updateOne: { filter: { id: seedProg.id }, update: { $push: { sections: sectionDoc } } } });
            summary.sectionsCreated++;
            summary.details.push(`section new: ${seedSec.id}`);
            for (const mod of sectionDoc.modules || []) {
                summary.modulesCreated++;
                summary.lessonsCreated += (mod.lessons || []).length;
                summary.instructionsCreated += (mod.instructions || []).length;
            }
            continue;
        }

        const secSet = {};
        if (dbSec.name !== seedSec.name) secSet[`sections.$[s].name`] = seedSec.name;
        if (dbSec.order !== seedSec.order) secSet[`sections.$[s].order`] = seedSec.order;
        if (Object.keys(secSet).length > 0) {
            ops.push({
                updateOne: {
                    filter: { id: seedProg.id },
                    update: { $set: secSet },
                    arrayFilters: [{ 's.id': seedSec.id }],
                },
            });
            summary.details.push(`section ${seedSec.id} fields: ${Object.keys(secSet).join(', ')}`);
        }

        // Resources: merge by id, never delete. Resources may be created from
        // the admin panel (random ids like res_<rand>_<rand>) outside the seed —
        // wiping the array would destroy that content. Strategy:
        //  - push seed resources whose id is missing in DB
        //  - $set per-field on existing resources from seed when content differs
        //  - leave DB-only resources untouched
        const flattenedNewResources = seedSec.resources && seedSec.resources.length > 0
            ? flattenResources(seedSec.resources)
            : [];
        const dbResById = new Map((dbSec.resources || []).map(r => {
            const { _id, ...rest } = r;
            return [rest.id, rest];
        }));
        const RES_FIELDS = ['parentId', 'title', 'description', 'link', 'type', 'order'];
        for (const seedR of flattenedNewResources) {
            const dbR = dbResById.get(seedR.id);
            if (!dbR) {
                ops.push({
                    updateOne: {
                        filter: { id: seedProg.id },
                        update: { $push: { 'sections.$[s].resources': seedR } },
                        arrayFilters: [{ 's.id': seedSec.id }],
                    },
                });
                summary.details.push(`resource new: ${seedR.id} in section ${seedSec.id}`);
                continue;
            }
            const resSet = {};
            for (const f of RES_FIELDS) {
                if (seedR[f] !== undefined && !isEqual(dbR[f], seedR[f])) {
                    resSet[`sections.$[s].resources.$[r].${f}`] = seedR[f];
                }
            }
            if (Object.keys(resSet).length > 0) {
                ops.push({
                    updateOne: {
                        filter: { id: seedProg.id },
                        update: { $set: resSet },
                        arrayFilters: [{ 's.id': seedSec.id }, { 'r.id': seedR.id }],
                    },
                });
                const fields = Object.keys(resSet).map(k => k.split('.').pop());
                summary.details.push(`resource ${seedR.id} fields: ${fields.join(', ')}`);
            }
        }

        const dbModulesById = new Map((dbSec.modules || []).map(m => [m.id, m]));
        for (const seedMod of seedSec.modules || []) {
            const dbMod = dbModulesById.get(seedMod.id);
            if (!dbMod) {
                const modDoc = JSON.parse(JSON.stringify(seedMod));
                for (const l of modDoc.lessons || []) { l.createdAt = now; l.updatedAt = now; }
                for (const i of modDoc.instructions || []) { i.createdAt = now; i.updatedAt = now; }
                ops.push({
                    updateOne: {
                        filter: { id: seedProg.id },
                        update: { $push: { 'sections.$[s].modules': modDoc } },
                        arrayFilters: [{ 's.id': seedSec.id }],
                    },
                });
                summary.modulesCreated++;
                summary.lessonsCreated += (modDoc.lessons || []).length;
                summary.instructionsCreated += (modDoc.instructions || []).length;
                summary.details.push(`module new: ${seedMod.id} (lessons: ${(modDoc.lessons||[]).length})`);
                continue;
            }

            const modSet = {};
            if (dbMod.name !== seedMod.name) modSet[`sections.$[s].modules.$[m].name`] = seedMod.name;
            if (dbMod.description !== seedMod.description) modSet[`sections.$[s].modules.$[m].description`] = seedMod.description;
            if (dbMod.order !== seedMod.order) modSet[`sections.$[s].modules.$[m].order`] = seedMod.order;
            if (Object.keys(modSet).length > 0) {
                ops.push({
                    updateOne: {
                        filter: { id: seedProg.id },
                        update: { $set: modSet },
                        arrayFilters: [{ 's.id': seedSec.id }, { 'm.id': seedMod.id }],
                    },
                });
                summary.details.push(`module ${seedMod.id} fields: ${Object.keys(modSet).join(', ')}`);
            }

            const dbLessonsById = new Map((dbMod.lessons || []).map(l => [l.id, l]));
            for (const seedL of seedMod.lessons || []) {
                const dbL = dbLessonsById.get(seedL.id);
                if (!dbL) {
                    const lessonDoc = { ...seedL, createdAt: now, updatedAt: now };
                    ops.push({
                        updateOne: {
                            filter: { id: seedProg.id },
                            update: { $push: { 'sections.$[s].modules.$[m].lessons': lessonDoc } },
                            arrayFilters: [{ 's.id': seedSec.id }, { 'm.id': seedMod.id }],
                        },
                    });
                    summary.lessonsCreated++;
                    summary.details.push(`lesson new: ${seedL.id}`);
                    continue;
                }

                const lessonSet = {};
                for (const f of LESSON_FIELDS) {
                    if (seedL[f] !== undefined && !isEqual(dbL[f], seedL[f])) {
                        lessonSet[`sections.$[s].modules.$[m].lessons.$[l].${f}`] = seedL[f];
                    }
                }
                if (Object.keys(lessonSet).length > 0) {
                    lessonSet[`sections.$[s].modules.$[m].lessons.$[l].updatedAt`] = now;
                    ops.push({
                        updateOne: {
                            filter: { id: seedProg.id },
                            update: { $set: lessonSet },
                            arrayFilters: [
                                { 's.id': seedSec.id },
                                { 'm.id': seedMod.id },
                                { 'l.id': seedL.id },
                            ],
                        },
                    });
                    summary.lessonsUpdated++;
                    const fields = Object.keys(lessonSet).filter(k => !k.endsWith('updatedAt')).map(k => k.split('.').pop());
                    summary.details.push(`lesson ${seedL.id} fields: ${fields.join(', ')}`);
                } else {
                    summary.lessonsUnchanged++;
                }
            }

            const dbInstrsById = new Map((dbMod.instructions || []).map(i => [i.id, i]));
            for (const seedI of seedMod.instructions || []) {
                const dbI = dbInstrsById.get(seedI.id);
                if (!dbI) {
                    const instrDoc = { ...seedI, createdAt: now, updatedAt: now };
                    ops.push({
                        updateOne: {
                            filter: { id: seedProg.id },
                            update: { $push: { 'sections.$[s].modules.$[m].instructions': instrDoc } },
                            arrayFilters: [{ 's.id': seedSec.id }, { 'm.id': seedMod.id }],
                        },
                    });
                    summary.instructionsCreated++;
                    summary.details.push(`instruction new: ${seedI.id}`);
                    continue;
                }

                const instrSet = {};
                for (const f of INSTRUCTION_FIELDS) {
                    if (seedI[f] !== undefined && !isEqual(dbI[f], seedI[f])) {
                        instrSet[`sections.$[s].modules.$[m].instructions.$[i].${f}`] = seedI[f];
                    }
                }
                if (Object.keys(instrSet).length > 0) {
                    instrSet[`sections.$[s].modules.$[m].instructions.$[i].updatedAt`] = now;
                    ops.push({
                        updateOne: {
                            filter: { id: seedProg.id },
                            update: { $set: instrSet },
                            arrayFilters: [
                                { 's.id': seedSec.id },
                                { 'm.id': seedMod.id },
                                { 'i.id': seedI.id },
                            ],
                        },
                    });
                    summary.instructionsUpdated++;
                    const fields = Object.keys(instrSet).filter(k => !k.endsWith('updatedAt')).map(k => k.split('.').pop());
                    summary.details.push(`instruction ${seedI.id} fields: ${fields.join(', ')}`);
                } else {
                    summary.instructionsUnchanged++;
                }
            }
        }
    }

    return { ops, summary };
};

/**
 * Run the diff against the DB for each program in `programsData`.
 * If `execute` is false, ops are computed and logged but not applied.
 * If `verbose` is true, prints details. Defaults to true when run as CLI.
 */
const runDiff = async ({ programsData, execute = false, verbose = true } = {}) => {
    const aggregate = { totalOps: 0, totalLessonsTouched: 0, perProgram: [] };

    for (const seedProg of programsData) {
        const dbProg = await Program.findOne({ id: seedProg.id }).lean();
        if (verbose) console.log(`--- Program: ${seedProg.id} ${dbProg ? '(exists)' : '(NEW)'} ---`);

        if (!dbProg) {
            const now = new Date();
            const doc = JSON.parse(JSON.stringify(seedProg));
            for (const sec of doc.sections) {
                if (sec.resources && sec.resources.length > 0) sec.resources = flattenResources(sec.resources);
                for (const mod of sec.modules || []) {
                    for (const l of mod.lessons || []) { l.createdAt = now; l.updatedAt = now; }
                    for (const i of mod.instructions || []) { i.createdAt = now; i.updatedAt = now; }
                }
            }
            doc.createdAt = now;
            doc.updatedAt = now;
            const lessonCount = doc.sections.reduce((acc, s) => acc + (s.modules || []).reduce((a, m) => a + (m.lessons || []).length, 0), 0);
            if (verbose) console.log(`  [INSERT NEW] lessons to create: ${lessonCount}\n`);
            aggregate.totalLessonsTouched += lessonCount;
            aggregate.perProgram.push({ id: seedProg.id, action: 'insert', lessonsCreated: lessonCount });
            if (execute) await Program.collection.insertOne(doc);
            continue;
        }

        const now = new Date();
        const { ops, summary } = buildOpsForProgram(seedProg, dbProg, now);

        if (verbose) {
            console.log(`  lessons: ${summary.lessonsCreated} created, ${summary.lessonsUpdated} updated, ${summary.lessonsUnchanged} unchanged`);
            console.log(`  instructions: ${summary.instructionsCreated} created, ${summary.instructionsUpdated} updated, ${summary.instructionsUnchanged} unchanged`);
            if (summary.sectionsCreated || summary.modulesCreated) {
                console.log(`  sections created: ${summary.sectionsCreated}, modules created: ${summary.modulesCreated}`);
            }
            if (summary.topLevelChanged) console.log(`  top-level: changed`);
            if (summary.details.length > 0) {
                console.log('  Details:');
                for (const d of summary.details) console.log(`    - ${d}`);
            }
            console.log(`  Total bulk ops: ${ops.length}\n`);
        }

        aggregate.totalOps += ops.length;
        aggregate.totalLessonsTouched += summary.lessonsCreated + summary.lessonsUpdated;
        aggregate.perProgram.push({ id: seedProg.id, action: 'diff', ops: ops.length, summary });

        if (execute && ops.length > 0) {
            const result = await Program.collection.bulkWrite(ops, { ordered: true });
            if (verbose) console.log(`  ✓ bulkWrite executed: matched=${result.matchedCount}, modified=${result.modifiedCount}\n`);
        }
    }

    return aggregate;
};

module.exports = { runDiff, buildOpsForProgram, flattenResources };

if (require.main === module) {
    const EXECUTE = process.argv.includes('--execute');
    (async () => {
        const { programsData } = require('../migrations/seedPrograms');
        const dbUrl = process.env.DB_URL;
        if (!dbUrl) throw new Error('DB_URL not set');
        const dbName = dbUrl.split('/').pop().split('?')[0];

        console.log('============================================================');
        console.log(`Mode: ${EXECUTE ? 'EXECUTE (writes to DB)' : 'DRY-RUN (no writes)'}`);
        console.log(`Target DB: ${dbName}`);
        console.log('============================================================\n');

        await mongoose.connect(dbUrl);
        const agg = await runDiff({ programsData, execute: EXECUTE, verbose: true });

        console.log('============================================================');
        console.log(`Total bulk ops: ${agg.totalOps}`);
        console.log(`Lessons touched (created + updated): ${agg.totalLessonsTouched}`);
        if (!EXECUTE) console.log('\n(dry-run, no changes written. Re-run with --execute to apply.)');
        console.log('============================================================');

        await mongoose.disconnect();
    })().catch(err => {
        console.error('FAILED:', err);
        process.exit(1);
    });
}
