const { programs } = require('../config/programs');

module.exports = [
    {
        id: "first_program_acquired",
        description: "Compra tu primer programa en la plataforma",
        xpReward: 50,
        condition: (user) => {
            return Object.values(user.programs).some(p => p.isPurchased);
        }
    },
    {
        id: "profile_completed",
        description: "Completa todos los campos esenciales de tu perfil",
        xpReward: 50,
        condition: (user) => {
            const { name, birthdate, country, region, aboutMe } = user.profile;
            const { name: enterpriseName, jobPosition } = user.enterprise;
            return !!name && !!birthdate && !!country && !!region && !!aboutMe && !!enterpriseName && !!jobPosition;
        }
    },
    {
        id: "first_module_completed",
        description: "Completa todas las lecciones de un módulo",
        xpReward: 100,
        condition: (user) => {
            return programs.some(programCfg => {
                const userProgram = user.programs?.[programCfg.id];
                if (!userProgram) return false;
                return programCfg.modules.some(module => {
                    return module.lessons.every(lesson =>
                        userProgram.lessonsCompleted.some(l => l.lessonId === lesson.id)
                    );
                });
            });
        }
    },
    {
        id: "first_lesson_completed",
        description: "Ve y marca como completada tu primera lección",
        xpReward: 50,
        condition: (user) => {
            return Object.values(user.programs).some(p => (p.lessonsCompleted || []).length >= 1);
        }
    },
    {
        id: "first_instruction_completed",
        description: "Envía tu primera instrucción calificada",
        xpReward: 50,
        condition: (user) => {
            return Object.values(user.programs).some(p =>
                (p.instructions || []).some(i => i.status === "GRADED")
            );
        }
    },
    {
        id: "module_instructions_completed",
        description: "Completa todas las instrucciones de un módulo",
        xpReward: 100,
        condition: (user) => {
            return programs.some(programCfg => {
                const userProgram = user.programs?.[programCfg.id];
                if (!userProgram) return false;

                return programCfg.modules.some(module => {
                    return module.instructions.every(inst =>
                        (userProgram.instructions || []).some(i => i.instructionId === inst.id && i.status === "GRADED")
                    );
                });
            });
        }
    },
    {
        id: "first_program_completed",
        description: "Completa todos los módulos de un programa",
        xpReward: 200,
        condition: (user) => {
            return programs.some(programCfg => {
                const userProgram = user.programs?.[programCfg.id];
                if (!userProgram) return false;

                return programCfg.modules.every(module => {
                    const allLessonsDone = module.lessons.every(lesson =>
                        (userProgram.lessonsCompleted || []).some(l => l.lessonId === lesson.id)
                    );
                    const allInstructionsDone = module.instructions.every(inst =>
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
        condition: (user) => user.level.currentLevel >= 5
    },
    {
        id: "level_10",
        description: "Alcanza el nivel 10 acumulando XP",
        xpReward: 100,
        condition: (user) => user.level.currentLevel >= 10
    },
    {
        id: "level_20",
        description: "Alcanza el nivel 20 acumulando XP",
        xpReward: 200,
        condition: (user) => user.level.currentLevel >= 20
    },
    {
        id: "streak_3_days",
        description: "Mantén tu streak 3 días consecutivos",
        xpReward: 50,
        condition: (user) => user.dailyStreak.count >= 3
    },
    {
        id: "streak_7_days",
        description: "Mantén tu streak 7 días consecutivos",
        xpReward: 100,
        condition: (user) => user.dailyStreak.count >= 7
    },
    {
        id: "streak_15_days",
        description: "Mantén tu streak 15 días consecutivos",
        xpReward: 200,
        condition: (user) => user.dailyStreak.count >= 15
    },
    {
        id: "trenno_ia_joined",
        description: "Únete a Trenno IA comprando el programa",
        xpReward: 100,
        condition: (user) => !!user.programs?.tia?.isPurchased
    },
    {
        id: "trenno_ia_first_module_completed",
        description: "Completa el primer módulo de Trenno IA",
        xpReward: 150,
        condition: (user) => {
            const tiaProgramCfg = programs.find(p => p.id === "tia");
            if (!tiaProgramCfg) return false;

            const firstModule = tiaProgramCfg.modules?.[0];
            if (!firstModule) return false;

            const userTia = user.programs?.tia;
            if (!userTia) return false;

            return firstModule.lessons.every(lesson => (userTia.lessonsCompleted || []).some(lc => lc.lessonId === lesson.id));
        }
    },
    {
        id: "trenno_ia_completed",
        description: "Completa todos los módulos de Trenno IA",
        xpReward: 300,
        condition: (user) => {
            const tiaProgramCfg = programs.find(p => p.id === "tia");
            if (!tiaProgramCfg) return false;

            const userTia = user.programs?.tia;
            if (!userTia) return false;

            return tiaProgramCfg.modules.every(module => 
                module.lessons.every(lesson =>
                    (userTia.lessonsCompleted || []).some(lc => lc.lessonId === lesson.id)
                ) &&
                module.instructions.every(inst =>
                    (userTia.instructions || []).some(i => i.instructionId === inst.id && i.status === "GRADED")
                )
            )
        }
    }
];