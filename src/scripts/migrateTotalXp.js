/**
 * Migration: Compute totalXp per program from xpHistory for all existing users.
 *
 * Run with: node --env-file=.env src/scripts/migrateTotalXp.js
 */
const mongoose = require("mongoose");
const User = require("../models/userModel");

const PROGRAM_XP_TYPES = ["LESSON_COMPLETED", "INSTRUCTION_GRADED"];

async function migrate() {
  await mongoose.connect(process.env.DB_URL);
  console.log("Connected to DB");

  const users = await User.find({}).select("xpHistory programs");
  console.log(`Found ${users.length} users to process`);

  let updated = 0;

  for (const user of users) {
    const xpByProgram = {};

    for (const entry of user.xpHistory || []) {
      if (!PROGRAM_XP_TYPES.includes(entry.type)) continue;
      const progId = entry.meta?.programId;
      if (!progId) continue;
      xpByProgram[progId] = (xpByProgram[progId] || 0) + (entry.xp || 0);
    }

    let changed = false;
    for (const [progId, totalXp] of Object.entries(xpByProgram)) {
      if (user.programs?.[progId]) {
        const current = user.programs[progId].totalXp || 0;
        if (current !== totalXp) {
          user.programs[progId].totalXp = totalXp;
          changed = true;
        }
      }
    }

    if (changed) {
      await user.save();
      updated++;
    }
  }

  console.log(`Migration complete. Updated ${updated} of ${users.length} users.`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
