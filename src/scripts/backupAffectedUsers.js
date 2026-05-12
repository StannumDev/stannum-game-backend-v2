// Backup the 24 users with duplicate lessonsCompleted (full doc snapshot).
// Output: src/scripts/backups/users-{timestamp}.json
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const User = require("../models/userModel");

(async () => {
    const url = process.env.DB_URL;
    console.log(`>>> DB: ${url.split("/").pop().split("?")[0]}`);
    await mongoose.connect(url);

    const users = await User.find({}, {}).lean();
    const affected = [];

    for (const u of users) {
        const programIds = Object.keys(u.programs || {});
        let hasDupes = false;
        for (const pid of programIds) {
            const lc = u.programs[pid]?.lessonsCompleted || [];
            const ids = lc.map(e => e.lessonId);
            if (new Set(ids).size !== ids.length) { hasDupes = true; break; }
        }
        if (hasDupes) affected.push(u);
    }

    const dir = path.join(__dirname, "backups");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const outPath = path.join(dir, `users-affected-${ts}.json`);
    fs.writeFileSync(outPath, JSON.stringify(affected, null, 2));
    console.log(`Wrote ${affected.length} users to ${outPath}`);
    console.log(`File size: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);

    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
