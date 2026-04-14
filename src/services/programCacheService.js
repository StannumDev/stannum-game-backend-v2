const { Program } = require("../models/programModel");

let cache = null;
let cacheTime = 0;
const TTL = 5 * 60 * 1000; // 5 minutos

const getPrograms = async () => {
    const now = Date.now();
    if (cache && now - cacheTime < TTL) return cache;

    cache = await Program.find().lean();
    cacheTime = now;
    return cache;
};

const getProgramById = async (programId) => {
    const programs = await getPrograms();
    return programs.find((p) => p.id === programId) || null;
};

const getFlatModules = (program) => {
    if (!program?.sections) return [];
    return program.sections.flatMap((s) => s.modules || []);
};

const invalidateCache = () => {
    cache = null;
    cacheTime = 0;
};

module.exports = { getPrograms, getProgramById, getFlatModules, invalidateCache };
