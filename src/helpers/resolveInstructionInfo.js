const resolveInstructionInfo = (catalog, programId, instructionId) => {
    const prog = catalog.find(p => p.id === programId);
    if (!prog) return { rewardXP: 0, estimatedTimeSec: 0 };
    for (const mod of (prog.modules || [])) {
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