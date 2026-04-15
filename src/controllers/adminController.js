const User = require("../models/userModel");
const { getError } = require("../helpers/getError");
const { VALID_PROGRAMS, SUBSCRIPTION_PROGRAMS } = require("../config/programRegistry");
const { hasAccess } = require("../utils/accessControl");
const { getProgramById } = require("../services/programCacheService");

// ── Cache for stats (5 min TTL) ──
let statsCache = null;
let statsCacheTime = 0;
const STATS_TTL = 5 * 60 * 1000;

// ── Projection for single user ──
const ADMIN_USER_FIELDS = {
    username: 1, email: 1, status: 1, createdAt: 1,
    profile: { name: 1, country: 1, region: 1 },
    enterprise: 1,
    level: 1,
    dailyStreak: { count: 1, lastActivityLocalDate: 1, shields: 1 },
    coins: 1,
    achievements: 1,
    communityStats: 1,
    xpHistory: { $slice: -50 },
};

// Add program fields dynamically
for (const pid of VALID_PROGRAMS) {
    ADMIN_USER_FIELDS[`programs.${pid}`] = 1;
}

// ── Projection for user list ──
const ADMIN_USERS_LIST_FIELDS = {
    username: 1, email: 1, createdAt: 1,
    'profile.name': 1,
    enterprise: 1,
    level: { currentLevel: 1, experienceTotal: 1, progress: 1 },
    'dailyStreak.count': 1, 'dailyStreak.lastActivityLocalDate': 1,
    coins: 1,
    achievements: 1,
};

for (const pid of VALID_PROGRAMS) {
    ADMIN_USERS_LIST_FIELDS[`programs.${pid}.hasAccessFlag`] = 1;
}

// ── Helpers ──
const getProgramTotals = async (programId) => {
    const program = await getProgramById(programId);
    if (!program?.sections) return { totalLessons: 0, totalInstructions: 0 };
    const modules = program.sections.flatMap(s => s.modules || []);
    return {
        totalLessons: modules.flatMap(m => m.lessons || []).length,
        totalInstructions: modules.flatMap(m => m.instructions || []).length,
    };
};

const buildUserPrograms = async (userPrograms) => {
    const result = {};
    for (const pid of VALID_PROGRAMS) {
        const prog = userPrograms?.[pid];
        if (!prog || !hasAccess(prog)) continue;

        const totals = await getProgramTotals(pid);
        const gradedInstructions = (prog.instructions || []).filter(i => i.status === "GRADED");
        const submittedOrGraded = (prog.instructions || []).filter(i => ["SUBMITTED", "GRADED"].includes(i.status));
        const withScore = gradedInstructions.filter(i => i.score > 0);
        const avgScore = withScore.length > 0 ? Math.round(withScore.reduce((s, i) => s + i.score, 0) / withScore.length) : 0;

        const lessonDates = (prog.lessonsCompleted || []).map(l => new Date(l.viewedAt));
        const instrDates = (prog.instructions || []).filter(i => i.submittedAt).map(i => new Date(i.submittedAt));
        const allDates = [...lessonDates, ...instrDates];
        const lastActivity = allDates.length > 0 ? new Date(Math.max(...allDates)).toISOString() : null;

        const entry = {
            totalXp: prog.totalXp || 0,
            acquiredAt: prog.acquiredAt || null,
            lessonsCompleted: (prog.lessonsCompleted || []).length,
            totalLessons: totals.totalLessons,
            instructionsSubmitted: submittedOrGraded.length,
            instructionsGraded: gradedInstructions.length,
            totalInstructions: totals.totalInstructions,
            averageScore: avgScore,
            lastActivity,
        };

        if (SUBSCRIPTION_PROGRAMS.includes(pid) && prog.subscription) {
            entry.subscription = {
                status: prog.subscription.status || null,
                currentPeriodEnd: prog.subscription.currentPeriodEnd || null,
            };
        }

        result[pid] = entry;
    }
    return result;
};

// ── GET /api/admin/user?email=X&username=Y ──
const getUser = async (req, res) => {
    try {
        const { email, username } = req.query;
        if (!email && !username) return res.status(400).json(getError("ADMIN_INVALID_PARAMS"));

        const filter = email
            ? { email: email.toLowerCase().trim() }
            : { username: username.toLowerCase().trim() };

        const user = await User.findOne(filter, ADMIN_USER_FIELDS).lean();
        if (!user) return res.status(404).json(getError("ADMIN_USER_NOT_FOUND"));

        const programs = await buildUserPrograms(user.programs);

        return res.status(200).json({
            success: true,
            user: {
                username: user.username,
                email: user.email,
                status: user.status,
                createdAt: user.createdAt,
                profile: user.profile || {},
                enterprise: user.enterprise || {},
                level: user.level || {},
                dailyStreak: {
                    count: user.dailyStreak?.count || 0,
                    lastActivityLocalDate: user.dailyStreak?.lastActivityLocalDate || null,
                    shields: user.dailyStreak?.shields || 0,
                },
                coins: user.coins || 0,
                achievementsCount: (user.achievements || []).length,
                communityStats: user.communityStats || {},
                programs,
                xpHistory: user.xpHistory || [],
            },
        });
    } catch (error) {
        console.error("Error in admin getUser:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── GET /api/admin/users?enterprise=X&search=Y&page=1&limit=20 ──
const getUsers = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const { enterprise, search } = req.query;

        const filter = { status: true };
        if (enterprise) filter['enterprise.name'] = { $regex: enterprise, $options: 'i' };
        if (search) {
            filter.$or = [
                { email: { $regex: search, $options: 'i' } },
                { 'profile.name': { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } },
            ];
        }

        const [users, total] = await Promise.all([
            User.find(filter, ADMIN_USERS_LIST_FIELDS)
                .sort({ 'level.experienceTotal': -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            User.countDocuments(filter),
        ]);

        const mapped = users.map(u => ({
            username: u.username,
            email: u.email,
            profile: { name: u.profile?.name || "" },
            enterprise: u.enterprise || {},
            level: {
                currentLevel: u.level?.currentLevel || 1,
                experienceTotal: u.level?.experienceTotal || 0,
                progress: u.level?.progress || 0,
            },
            dailyStreak: {
                count: u.dailyStreak?.count || 0,
                lastActivityLocalDate: u.dailyStreak?.lastActivityLocalDate || null,
            },
            coins: u.coins || 0,
            achievementsCount: (u.achievements || []).length,
            programsActive: VALID_PROGRAMS.filter(pid => u.programs?.[pid]?.hasAccessFlag),
            createdAt: u.createdAt,
        }));

        return res.status(200).json({
            success: true,
            users: mapped,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error("Error in admin getUsers:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── GET /api/admin/stats ──
const getStats = async (req, res) => {
    try {
        if (statsCache && Date.now() - statsCacheTime < STATS_TTL) {
            return res.status(200).json(statsCache);
        }

        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const d7 = sevenDaysAgo.toISOString().slice(0, 10);
        const d30 = thirtyDaysAgo.toISOString().slice(0, 10);

        // Main aggregation
        const [mainStats] = await User.aggregate([
            { $match: { status: true } },
            { $group: {
                _id: null,
                totalUsers: { $sum: 1 },
                activeUsers7d: { $sum: { $cond: [{ $gte: ['$dailyStreak.lastActivityLocalDate', d7] }, 1, 0] } },
                activeUsers30d: { $sum: { $cond: [{ $gte: ['$dailyStreak.lastActivityLocalDate', d30] }, 1, 0] } },
                avgLevel: { $avg: '$level.currentLevel' },
                avgStreak: { $avg: '$dailyStreak.count' },
                withActiveStreak: { $sum: { $cond: [{ $gt: ['$dailyStreak.count', 0] }, 1, 0] } },
                totalAchievements: { $sum: { $size: { $ifNull: ['$achievements', []] } } },
                avgAchievements: { $avg: { $size: { $ifNull: ['$achievements', []] } } },
            }},
        ]);

        // Level distribution
        const levelDist = await User.aggregate([
            { $match: { status: true, 'level.experienceTotal': { $gt: 0 } } },
            { $group: { _id: '$level.currentLevel', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]);

        // Program stats
        const programStats = {};
        for (const pid of VALID_PROGRAMS) {
            const totals = await getProgramTotals(pid);

            const [progAgg] = await User.aggregate([
                { $match: { [`programs.${pid}.hasAccessFlag`]: true } },
                { $project: {
                    lessonsCount: { $size: { $ifNull: [`$programs.${pid}.lessonsCompleted`, []] } },
                    gradedCount: { $size: { $filter: {
                        input: { $ifNull: [`$programs.${pid}.instructions`, []] },
                        cond: { $eq: ['$$this.status', 'GRADED'] },
                    }}},
                }},
                { $group: {
                    _id: null,
                    totalUsers: { $sum: 1 },
                    avgLessons: { $avg: '$lessonsCount' },
                    avgGraded: { $avg: '$gradedCount' },
                    completedAll: { $sum: { $cond: [
                        { $gte: ['$lessonsCount', totals.totalLessons > 0 ? totals.totalLessons : 999999] },
                        1, 0,
                    ]}},
                }},
            ]);

            if (progAgg && progAgg.totalUsers > 0) {
                programStats[pid] = {
                    totalUsers: progAgg.totalUsers,
                    avgLessonsCompleted: Math.round((progAgg.avgLessons || 0) * 10) / 10,
                    avgInstructionsGraded: Math.round((progAgg.avgGraded || 0) * 10) / 10,
                    completionRate: Math.round((progAgg.completedAll / progAgg.totalUsers) * 100),
                    totalLessons: totals.totalLessons,
                    totalInstructions: totals.totalInstructions,
                };
            }
        }

        const stats = mainStats || {};
        const streakRetention = stats.activeUsers30d > 0
            ? Math.round((stats.withActiveStreak / stats.activeUsers30d) * 100)
            : 0;

        const response = {
            success: true,
            stats: {
                totalUsers: stats.totalUsers || 0,
                activeUsers7d: stats.activeUsers7d || 0,
                activeUsers30d: stats.activeUsers30d || 0,
                levelDistribution: levelDist.map(l => ({ level: l._id, count: l.count })),
                averageLevel: Math.round((stats.avgLevel || 0) * 10) / 10,
                averageStreak: Math.round((stats.avgStreak || 0) * 10) / 10,
                usersWithActiveStreak: stats.withActiveStreak || 0,
                streakRetentionRate: streakRetention,
                totalAchievementsUnlocked: stats.totalAchievements || 0,
                averageAchievements: Math.round((stats.avgAchievements || 0) * 10) / 10,
                programStats,
            },
        };

        statsCache = response;
        statsCacheTime = Date.now();

        return res.status(200).json(response);
    } catch (error) {
        console.error("Error in admin getStats:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── GET /api/admin/enterprises ──
const getEnterprises = async (req, res) => {
    try {
        const enterprises = await User.distinct('enterprise.name', {
            status: true,
            'enterprise.name': { $exists: true, $ne: '' },
        });

        return res.status(200).json({
            success: true,
            enterprises: enterprises.sort(),
        });
    } catch (error) {
        console.error("Error in admin getEnterprises:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

module.exports = { getUser, getUsers, getStats, getEnterprises };
