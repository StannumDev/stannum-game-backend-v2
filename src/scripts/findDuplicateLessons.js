const mongoose = require("mongoose");
const User = require("../models/userModel");

(async () => {
    const url = process.env.DB_URL;
    console.log(`>>> Connecting to DB: ${url.split("/").pop().split("?")[0]}`);
    await mongoose.connect(url);

    const allUsers = await User.find({}, { email: 1, username: 1, programs: 1, createdAt: 1 }).lean();
    console.log(`Total users: ${allUsers.length}`);

    const affected = [];
    let totalDupes = 0;

    for (const u of allUsers) {
        const programIds = Object.keys(u.programs || {});
        for (const pid of programIds) {
            const lc = u.programs[pid]?.lessonsCompleted || [];
            if (lc.length === 0) continue;
            const counts = {};
            for (const entry of lc) {
                counts[entry.lessonId] = (counts[entry.lessonId] || 0) + 1;
            }
            const dupes = Object.entries(counts).filter(([, n]) => n > 1);
            if (dupes.length > 0) {
                totalDupes += dupes.reduce((a, [, n]) => a + (n - 1), 0);
                affected.push({
                    email: u.email,
                    username: u.username,
                    createdAt: u.createdAt,
                    program: pid,
                    dupes: dupes.map(([lid, n]) => {
                        const entries = lc.filter(e => e.lessonId === lid);
                        return {
                            lessonId: lid,
                            count: n,
                            times: entries.map(e => e.viewedAt),
                        };
                    }),
                });
            }
        }
    }

    console.log(`\n=== Users with duplicate lessonsCompleted: ${affected.length} ===`);
    console.log(`=== Total extra (duplicate) entries: ${totalDupes} ===\n`);

    for (const a of affected) {
        console.log(`\n[${a.email}] username=${a.username} program=${a.program}`);
        for (const d of a.dupes) {
            console.log(`  ${d.lessonId} ×${d.count}`);
            for (const t of d.times) {
                console.log(`    - ${new Date(t).toISOString()}`);
            }
            const sameMs = d.times.every(t => new Date(t).getTime() === new Date(d.times[0]).getTime());
            const allWithinSec = d.times.every(t => Math.abs(new Date(t).getTime() - new Date(d.times[0]).getTime()) < 1000);
            console.log(`    → identical-ms: ${sameMs}, all-within-1s: ${allWithinSec}`);
        }
    }

    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
