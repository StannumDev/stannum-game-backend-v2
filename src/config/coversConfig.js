const covers = [
    {
        id: 'default',
        name: 'Clásica',
        description: 'La portada original de STANNUM Game.',
        price: 0,
        rarity: 'common',
        imageKey: 'cover_default',
    },
    {
        id: 'circuits',
        name: 'Circuitos',
        description: 'Un diseño inspirado en circuitos digitales.',
        price: 150,
        rarity: 'uncommon',
        imageKey: 'cover_circuits',
    },
    {
        id: 'horizon',
        name: 'Horizonte',
        description: 'Un atardecer que marca el comienzo de algo grande.',
        price: 200,
        rarity: 'uncommon',
        imageKey: 'cover_horizon',
    },
    {
        id: 'nebula',
        name: 'Nebulosa',
        description: 'Colores cósmicos que inspiran creatividad.',
        price: 400,
        rarity: 'rare',
        imageKey: 'cover_nebula',
    },
    {
        id: 'futuristic',
        name: 'Futurista',
        description: 'Visión de un futuro impulsado por la inteligencia artificial.',
        price: 700,
        rarity: 'epic',
        imageKey: 'cover_futuristic',
    },
    {
        id: 'elite',
        name: 'STANNUM Elite',
        description: 'Reservada para los líderes más comprometidos.',
        price: 1000,
        rarity: 'legendary',
        imageKey: 'cover_elite',
    },
];

const coversMap = Object.fromEntries(covers.map(c => [c.id, c]));

module.exports = { covers, coversMap };
