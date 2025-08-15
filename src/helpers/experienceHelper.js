const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const nextLevelTarget = (prevNext, cfg) => {
    const { base, growth } = cfg.LEVELS;
    return prevNext ? Math.ceil(prevNext * growth) : base;
};

const localTodayString = (tz = 'UTC', d = new Date()) => {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(d);
};

const isSameLocalDay = (a, b) => a === b;

const isConsecutiveLocalDay = (a, b) => {
    if (!a || !b) return false;
    const nextA = new Date(a + 'T00:00:00Z');
    nextA.setUTCDate(nextA.getUTCDate() + 1);
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year:'numeric', month:'2-digit', day:'2-digit' });
    return fmt.format(nextA) === b;
};

module.exports = {
    clamp,
    nextLevelTarget,
    localTodayString,
    isSameLocalDay,
    isConsecutiveLocalDay
};