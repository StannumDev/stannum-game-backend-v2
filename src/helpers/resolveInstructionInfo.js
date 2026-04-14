const resolveInstructionInfo = (catalog, programId, instructionId) => {
    const prog = catalog.find(p => p.id === programId);
    if (!prog) return { rewardXP: 0, estimatedTimeSec: 0 };

    const flatModules = (prog.sections || []).flatMap(s => s.modules || []);
    for (const mod of flatModules) {
        const i = (mod.instructions || []).find(x => x.id === instructionId);
        if (i) {
            return {
                rewardXP: Number(i.rewardXP) || 0,
                estimatedTimeSec: Number(i.estimatedTimeSec) || 0
            };
        }
    }
    return { rewardXP: 0, estimatedTimeSec: 0 };
};

module.exports = { resolveInstructionInfo };
