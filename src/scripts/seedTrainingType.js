/**
 * Seed quirúrgico de `trainingType` en los programas.
 * Solo setea el campo trainingType — NO toca lecciones, instrucciones ni nada
 * más (a diferencia de applyProgramsDiff, que sincroniza todo el contenido).
 *
 * Uso:
 *   node --env-file=.env src/scripts/seedTrainingType.js            # dry-run
 *   node --env-file=.env src/scripts/seedTrainingType.js --execute  # aplica
 */
const mongoose = require("mongoose");
const { Program } = require("../models/programModel");

// Clasificación operativa del cockpit ECLI (acordado con Mateo 2026-06).
// tmd queda sin tipo (no se lanzó); trenno_ia/demo no se tocan.
const TRAINING_TYPES = {
    tia: "starter",
    tia_summer: "pool",
    tia_pool: "pool",
};

(async () => {
    const EXECUTE = process.argv.includes("--execute");
    const dbUrl = process.env.DB_URL;
    if (!dbUrl) throw new Error("DB_URL not set");
    const dbName = dbUrl.split("/").pop().split("?")[0];

    console.log("============================================================");
    console.log(`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY-RUN (no writes)"}`);
    console.log(`Target DB: ${dbName}`);
    console.log("============================================================\n");

    await mongoose.connect(dbUrl);

    for (const [id, trainingType] of Object.entries(TRAINING_TYPES)) {
        const current = await Program.findOne({ id }, "id trainingType").lean();
        if (!current) {
            console.log(`  [SKIP] ${id} no existe en la DB`);
            continue;
        }
        if (current.trainingType === trainingType) {
            console.log(`  [OK]   ${id} ya es "${trainingType}" (sin cambio)`);
            continue;
        }
        console.log(`  [SET]  ${id}: ${current.trainingType ?? "(sin tipo)"} -> "${trainingType}"`);
        if (EXECUTE) {
            await Program.updateOne({ id }, { $set: { trainingType } });
        }
    }

    console.log(`\n${EXECUTE ? "Aplicado." : "(dry-run, sin cambios. Re-correr con --execute para aplicar.)"}`);
    await mongoose.disconnect();
})().catch((err) => {
    console.error("FAILED:", err);
    process.exit(1);
});
