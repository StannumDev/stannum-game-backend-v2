const { coversMap } = require('./coversConfig');

const chests = [
    // TIA - Módulo 1: Dominio de PROMPTS
    {
        id: 'TIAM01C01',
        programId: 'tia',
        moduleId: 'TIAM01',
        afterItemId: 'TIAM01L03',
        rewards: { xp: 200, coins: 10, coverId: null },
    },
    {
        id: 'TIAM01C02',
        programId: 'tia',
        moduleId: 'TIAM01',
        afterItemId: 'TIAM01I01',
        rewards: { xp: 300, coins: 15, coverId: 'horizon' },
    },
    // TIA - Módulo 2: IA en la Vida Cotidiana
    {
        id: 'TIAM02C01',
        programId: 'tia',
        moduleId: 'TIAM02',
        afterItemId: 'TIAM02L10',
        rewards: { xp: 200, coins: 10, coverId: null },
    },
    {
        id: 'TIAM02C02',
        programId: 'tia',
        moduleId: 'TIAM02',
        afterItemId: 'TIAM02L11',
        rewards: { xp: 200, coins: 10, coverId: null },
    },
    // TIA SUMMER - Módulo 2: Personalización de ChatGPT
    {
        id: 'TIASM02C01',
        programId: 'tia_summer',
        moduleId: 'TIASM02',
        afterItemId: 'TIASM02L01',
        rewards: { xp: 200, coins: 10, coverId: null },
    },
    {
        id: 'TIASM02C02',
        programId: 'tia_summer',
        moduleId: 'TIASM02',
        afterItemId: 'TIASM02L14',
        rewards: { xp: 500, coins: 25, coverId: 'summer_2026' },
    },
    // TIA POOL - Módulo 2: Personalización de ChatGPT
    {
        id: 'TIAPM02C01',
        programId: 'tia_pool',
        moduleId: 'TIAPM02',
        afterItemId: 'TIAPM02L01',
        rewards: { xp: 200, coins: 10, coverId: null },
    },
    {
        id: 'TIAPM02C02',
        programId: 'tia_pool',
        moduleId: 'TIAPM02',
        afterItemId: 'TIAPM02L14',
        rewards: { xp: 500, coins: 25, coverId: null },
    },
];

const chestsMap = Object.fromEntries(chests.map(c => [c.id, c]));

const getModuleChests = (programId, moduleId) =>
    chests.filter(c => c.programId === programId && c.moduleId === moduleId);

// Validate all coverId references exist
for (const chest of chests) {
    if (chest.rewards.coverId && !coversMap[chest.rewards.coverId]) {
        throw new Error(`Chest ${chest.id} references unknown cover: ${chest.rewards.coverId}`);
    }
}

module.exports = { chests, chestsMap, getModuleChests };
