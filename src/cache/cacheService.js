const NodeCache = require('node-cache');

// stdTTL: segundos de vida por defecto (se puede sobreescribir por set)
// checkperiod: cada cuántos segundos limpia entradas expiradas
const cache = new NodeCache({ stdTTL: 60, checkperiod: 30 });

// ---------------------------------------------------------------------------
// Keys estandarizadas — evita magic strings dispersos en los controllers
// ---------------------------------------------------------------------------
const KEYS = {
  RANKING_GLOBAL:  (limit)           => `ranking:global:${limit}`,
  RANKING_PROGRAM: (program, limit)  => `ranking:program:${program}:${limit}`,
  RANKING_TEAM:    (program)         => `ranking:team:${program}`,
  USER:            (userId)          => `user:${userId}`,
  USER_SIDEBAR:    (userId)          => `user:sidebar:${userId}`,
  PROMPT_STATS:                         'stats:prompts',
  ASSISTANT_STATS:                      'stats:assistants',
};

// ---------------------------------------------------------------------------
// TTLs (segundos)
// ---------------------------------------------------------------------------
const TTL = {
  RANKING: 60,
  USER:    30,
  STATS:   300, // 5 minutos
};

// ---------------------------------------------------------------------------
// Helpers de invalidación
// ---------------------------------------------------------------------------

/** Invalida el perfil completo y sidebar de un usuario */
const invalidateUser = (userId) => {
  if (!userId) return;
  const id = userId.toString();
  cache.del(KEYS.USER(id));
  cache.del(KEYS.USER_SIDEBAR(id));
  if (process.env.CACHE_DEBUG === 'true') {
    console.log(`[CACHE DEL] user:${id} + user:sidebar:${id}`);
  }
};

/** Invalida todos los rankings de un programa específico */
const invalidateProgramRankings = (programName) => {
  if (!programName) return;
  const allKeys = cache.keys();
  const toDelete = allKeys.filter(
    k => k.startsWith(`ranking:program:${programName}:`) || k.startsWith(`ranking:team:${programName}`)
  );
  if (toDelete.length) {
    cache.del(toDelete);
    if (process.env.CACHE_DEBUG === 'true') {
      console.log(`[CACHE DEL] rankings del programa "${programName}": ${toDelete.join(', ')}`);
    }
  }
};

/** Invalida el ranking global */
const invalidateGlobalRanking = () => {
  const allKeys = cache.keys();
  const toDelete = allKeys.filter(k => k.startsWith('ranking:global:'));
  if (toDelete.length) {
    cache.del(toDelete);
    if (process.env.CACHE_DEBUG === 'true') {
      console.log(`[CACHE DEL] rankings globales: ${toDelete.join(', ')}`);
    }
  }
};

/** Invalida rankings globales + del programa afectado (llamar cuando cambia XP) */
const invalidateRankingsForProgram = (programName) => {
  invalidateGlobalRanking();
  if (programName) invalidateProgramRankings(programName);
};

// ---------------------------------------------------------------------------
// Log de SETs (solo si CACHE_DEBUG=true)
// ---------------------------------------------------------------------------
cache.on('set', (key) => {
  if (process.env.CACHE_DEBUG === 'true') {
    console.log(`[CACHE SET] ${key}`);
  }
});

module.exports = { cache, KEYS, TTL, invalidateUser, invalidateProgramRankings, invalidateGlobalRanking, invalidateRankingsForProgram };
