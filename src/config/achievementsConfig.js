const { programs } = require('../config/programs');
const { hasAccess } = require('../utils/accessControl');

module.exports = [
    {
        id: "first_program_acquired",
        description: "Compra tu primer programa en la plataforma",
        xpReward: 50,
        coinsReward: 10,
        condition: (user) => {
            return Object.values(user.programs || {}).some(p => hasAccess(p));
        }
    },
    {
        id: "profile_completed",
        description: "Completa todos los campos esenciales de tu perfil",
        xpReward: 50,
        coinsReward: 10,
        condition: (user) => {
            const { name, birthdate, country, region, aboutMe } = user.profile || {};
            const { name: enterpriseName, jobPosition } = user.enterprise || {};
            return !!name && !!birthdate && !!country && !!region && !!aboutMe && !!enterpriseName && !!jobPosition;
        }
    },
    {
        id: "first_module_completed",
        description: "Completa todas las lecciones e instrucciones de un módulo",
        xpReward: 100,
        coinsReward: 15,
        condition: (user) => {
            return programs.some(programCfg => {
                const userProgram = user.programs?.[programCfg.id];
                if (!userProgram) return false;
                return programCfg.modules.some(module => {
                    const allLessonsDone = (module.lessons || []).every(lesson =>
                        (userProgram.lessonsCompleted || []).some(l => l.lessonId === lesson.id)
                    );
                    const allInstructionsDone = (module.instructions || []).every(inst =>
                        (userProgram.instructions || []).some(i => i.instructionId === inst.id && i.status === "GRADED")
                    );
                    return allLessonsDone && allInstructionsDone;
                });
            });
        }
    },
    {
        id: "first_lesson_completed",
        description: "Ve y marca como completada tu primera lección",
        xpReward: 50,
        coinsReward: 5,
        condition: (user) => {
            return Object.values(user.programs || {}).some(p => (p.lessonsCompleted || []).length >= 1);
        }
    },
    {
        id: "first_instruction_completed",
        description: "Envía tu primera instrucción calificada",
        xpReward: 50,
        coinsReward: 5,
        condition: (user) => {
            return Object.values(user.programs || {}).some(p =>
                (p.instructions || []).some(i => i.status === "GRADED")
            );
        }
    },
    {
        id: "module_instructions_completed",
        description: "Completa todas las instrucciones de un módulo",
        xpReward: 100,
        coinsReward: 15,
        condition: (user) => {
            return programs.some(programCfg => {
                const userProgram = user.programs?.[programCfg.id];
                if (!userProgram) return false;

                return programCfg.modules.some(module => {
                    const moduleInstructions = module.instructions || [];
                    return (moduleInstructions.length > 0 && moduleInstructions.every(inst => (userProgram.instructions || []).some(i => i.instructionId === inst.id && i.status === "GRADED")));
                });
            });
        }
    },
    {
        id: "first_program_completed",
        description: "Completa todos los módulos de un programa",
        xpReward: 200,
        coinsReward: 25,
        condition: (user) => {
            return programs.some(programCfg => {
                const userProgram = user.programs?.[programCfg.id];
                if (!userProgram) return false;

                return programCfg.modules.every(module => {
                    const allLessonsDone = (module.lessons || []).every(lesson =>
                        (userProgram.lessonsCompleted || []).some(l => l.lessonId === lesson.id)
                    );
                    const allInstructionsDone = (module.instructions || []).every(inst =>
                        (userProgram.instructions || []).some(i => i.instructionId === inst.id && i.status === "GRADED")
                    );
                    return allLessonsDone && allInstructionsDone;
                });
            });
        }
    },
    {
        id: "level_5",
        description: "Alcanza el nivel 5 acumulando XP",
        xpReward: 50,
        coinsReward: 10,
        condition: (user) => (user.level?.currentLevel || 0) >= 5
    },
    {
        id: "level_10",
        description: "Alcanza el nivel 10 acumulando XP",
        xpReward: 100,
        coinsReward: 15,
        condition: (user) => (user.level?.currentLevel || 0) >= 10
    },
    {
        id: "level_20",
        description: "Alcanza el nivel 20 acumulando XP",
        xpReward: 200,
        coinsReward: 25,
        condition: (user) => (user.level?.currentLevel || 0) >= 20
    },
    {
        id: "level_25",
        description: "Alcanza el nivel 25 acumulando XP",
        xpReward: 250,
        coinsReward: 30,
        condition: (user) => (user.level?.currentLevel || 0) >= 25
    },
    {
        id: "streak_3_days",
        description: "Mantén tu streak 3 días consecutivos",
        xpReward: 50,
        coinsReward: 5,
        condition: (user) => (user.dailyStreak?.count || 0) >= 3
    },
    {
        id: "streak_7_days",
        description: "Mantén tu streak 7 días consecutivos",
        xpReward: 100,
        coinsReward: 10,
        condition: (user) => (user.dailyStreak?.count || 0) >= 7
    },
    {
        id: "streak_15_days",
        description: "Mantén tu streak 15 días consecutivos",
        xpReward: 200,
        coinsReward: 20,
        condition: (user) => (user.dailyStreak?.count || 0) >= 15
    },
    {
        id: "streak_30_days",
        description: "Mantén tu streak un mes entero",
        xpReward: 300,
        coinsReward: 30,
        condition: (user) => (user.dailyStreak?.count || 0) >= 30
    },
    {
        id: "perfect_score",
        description: "Obtén 100% en una instrucción",
        xpReward: 100,
        coinsReward: 15,
        condition: (user) => {
            return Object.values(user.programs || {}).some(p =>
                (p.instructions || []).some(i => i.status === "GRADED" && i.score === 100)
            );
        }
    },
    {
        id: "triple_perfect",
        description: "Obtén 100% en 3 instrucciones distintas",
        xpReward: 200,
        coinsReward: 25,
        condition: (user) => {
            const count = Object.values(user.programs || {}).reduce((sum, p) =>
                sum + (p.instructions || []).filter(i => i.status === "GRADED" && i.score === 100).length, 0
            );
            return count >= 3;
        }
    },
    {
        id: "marathon_day",
        description: "Completa 5 lecciones en un mismo día",
        xpReward: 100,
        coinsReward: 15,
        condition: (user) => {
            const tz = user.dailyStreak?.timezone || "America/Argentina/Buenos_Aires";
            const dates = {};
            for (const p of Object.values(user.programs || {})) {
                for (const lc of (p.lessonsCompleted || [])) {
                    if (!lc.viewedAt) continue;
                    const day = new Date(lc.viewedAt).toLocaleDateString("en-CA", { timeZone: tz });
                    dates[day] = (dates[day] || 0) + 1;
                    if (dates[day] >= 5) return true;
                }
            }
            return false;
        }
    },
    {
        id: "prompt_creator",
        description: "Publica tu primer prompt en la comunidad",
        xpReward: 50,
        coinsReward: 10,
        condition: (user) => (user._communityStats?.promptsCount || 0) >= 1
    },
    {
        id: "assistant_creator",
        description: "Publica tu primer asistente en la comunidad",
        xpReward: 50,
        coinsReward: 10,
        condition: (user) => (user._communityStats?.assistantsCount || 0) >= 1
    },
    {
        id: "community_favorite",
        description: "Recibí 5 favoritos en tus publicaciones",
        xpReward: 150,
        coinsReward: 20,
        condition: (user) => (user._communityStats?.totalFavoritesReceived || 0) >= 5
    },
    {
        id: "collector",
        description: "Guarda 10 prompts o asistentes en favoritos",
        xpReward: 50,
        coinsReward: 10,
        condition: (user) => {
            const prompts = (user.favorites?.prompts || []).length;
            const assistants = (user.favorites?.assistants || []).length;
            return (prompts + assistants) >= 10;
        }
    },
    {
        id: "trenno_ia_joined",
        description: "Únete a Trenno IA comprando el programa",
        xpReward: 100,
        coinsReward: 15,
        condition: (user) => hasAccess(user.programs?.tia)
    },
    {
        id: "trenno_ia_first_module_completed",
        description: "Completa el primer módulo de Trenno IA",
        xpReward: 150,
        coinsReward: 20,
        condition: (user) => {
            const tiaProgramCfg = programs.find(p => p.id === "tia");
            if (!tiaProgramCfg) return false;

            const firstModule = tiaProgramCfg.modules?.[0];
            if (!firstModule) return false;

            const userTia = user.programs?.tia;
            if (!userTia) return false;

            const allLessonsDone = (firstModule.lessons || []).every(lesson => (userTia.lessonsCompleted || []).some(lc => lc.lessonId === lesson.id));
            const allInstructionsDone = (firstModule.instructions || []).every(inst => (userTia.instructions || []).some(i => i.instructionId === inst.id && i.status === "GRADED"));
            return allLessonsDone && allInstructionsDone;
        }
    },
    {
        id: "trenno_ia_completed",
        description: "Completa todos los módulos de Trenno IA",
        xpReward: 300,
        coinsReward: 40,
        condition: (user) => {
            const tiaProgramCfg = programs.find(p => p.id === "tia");
            if (!tiaProgramCfg) return false;

            const userTia = user.programs?.tia;
            if (!userTia) return false;

            return tiaProgramCfg.modules.every(module =>
                (module.lessons || []).every(lesson =>
                    (userTia.lessonsCompleted || []).some(lc => lc.lessonId === lesson.id)
                ) && (
                    (module.instructions || []).length === 0 ||
                    module.instructions.every(inst =>
                        (userTia.instructions || []).some(i => i.instructionId === inst.id && i.status === "GRADED")
                    )
                )
            )
        }
    },
    {
        id: "trenno_ia_summer_joined",
        description: "Participaste del programa exclusivo TRENNO IA SUMMER 2026",
        xpReward: 100,
        coinsReward: 15,
        condition: (user) => hasAccess(user.programs?.tia_summer)
    },
    {
        id: "trenno_ia_summer_halfway",
        description: "Llegá a la mitad del programa SUMMER",
        xpReward: 150,
        coinsReward: 20,
        condition: (user) => {
            const tiaSummer = user.programs?.tia_summer;
            if (!tiaSummer) return false;
            return (tiaSummer.lessonsCompleted || []).length >= 10;
        }
    },
    {
        id: "trenno_ia_summer_graduate",
        description: "Completá el 100% del programa TRENNO IA SUMMER 2026",
        xpReward: 500,
        coinsReward: 60,
        condition: (user) => {
            const tiaSummerCfg = programs.find(p => p.id === "tia_summer");
            if (!tiaSummerCfg) return false;
            const tiaSummer = user.programs?.tia_summer;
            if (!tiaSummer) return false;
            return tiaSummerCfg.modules.every(module => (module.lessons || []).every(lesson => (tiaSummer.lessonsCompleted || []).some(lc => lc.lessonId === lesson.id) ) && ( (module.instructions || []).length === 0 || module.instructions.every(inst => (tiaSummer.instructions || []).some(i => i.instructionId === inst.id && i.status === "GRADED"))));
        }
    },
];
