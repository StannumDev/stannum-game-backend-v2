const Fuse = require("fuse.js");
const User = require("../models/userModel");

const { unlockAchievements } = require("../services/achievementsService");
const { applyShieldIfNeeded } = require("../services/streakService");
const { getError } = require("../helpers/getError");
const { hasAnyAccess, buildAccessQuery } = require("../utils/accessControl");
const { RANKABLE_PROGRAMS } = require("../config/programRegistry");
const { cache, KEYS, TTL, invalidateUser } = require("../cache/cacheService");

const getUserByToken = async (req, res) => {
    try {
        const userId = req.userAuth.id;

        const shieldResult = await applyShieldIfNeeded(userId);

        // Only cache when no shield was consumed (shield consumption mutates DB state)
        if (!shieldResult.shieldConsumed) {
            const cached = cache.get(KEYS.USER(userId.toString()));
            if (cached) return res.status(200).json(cached);
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const userDetails = user.getGameUserDetails();
        const response = {
            success: true,
            data: userDetails,
            ...(shieldResult.shieldConsumed && {
                shieldConsumed: true,
                streakSaved: shieldResult.streakSaved,
            }),
        };

        if (!shieldResult.shieldConsumed) {
            cache.set(KEYS.USER(userId.toString()), response, TTL.USER);
        }

        return res.status(200).json(response);
    } catch (error) {
        console.error("Error fetching user details by token:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getUserSidebarDetails = async (req, res) => {
    try {
        const userId = req.userAuth.id;

        const cacheKey = KEYS.USER_SIDEBAR(userId.toString());
        const cached = cache.get(cacheKey);
        if (cached) return res.status(200).json(cached);

        const user = await User.findById(userId);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const sidebarDetails = user.getUserSidebarDetails();
        const response = { success: true, data: sidebarDetails };
        cache.set(cacheKey, response, TTL.USER);
        return res.status(200).json(response);
    } catch (error) {
        console.error("Error fetching user sidebar details:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getUserDetailsByUsername = async (req, res) => {
    try {
        const { username } = req.params;
        let user = await User.findOne({ username: username.toLowerCase().trim() });
        if (!user) return res.status(404).json(getError("USER_PROFILE_NOT_FOUND"));

        const isOwner = req.userAuth.id.toString() === user._id.toString();

        if (isOwner) {
            await applyShieldIfNeeded(user._id);
            user = await User.findById(user._id);
        }

        const userDetails = isOwner ? user.getGameUserDetails() : user.getPublicUserDetails();

        if (hasAnyAccess(user.programs)) {
            const usersAbove = await User.countDocuments({
                'level.experienceTotal': { $gt: user.level?.experienceTotal ?? 0 },
                status: true,
                $or: buildAccessQuery(RANKABLE_PROGRAMS),
            });
            userDetails.rankingPosition = usersAbove + 1;
        }

        return res.status(200).json({ success: true, data: userDetails });
    } catch (error) {
        console.error("Error fetching user details by username:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getTutorialStatus = async (req, res) => {
    const { tutorialName } = req.params;
  
    if (!tutorialName) return res.status(400).json(getError("VALIDATION_TUTORIAL_NAME_REQUIRED"));
  
    try {
        const user = await User.findById(req.userAuth.id);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));
    
        const tutorial = user.preferences?.tutorials?.find((t) => t.name === tutorialName);

        return res.status(200).json({ success: true, tutorial: tutorial || { name: tutorialName, isCompleted: false, completedAt: null } });
      
    } catch (error) {
        console.error(error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const markTutorialAsCompleted = async (req, res) => {
    const { tutorialName } = req.params;
    const userId = req.userAuth.id;
 
    if (!tutorialName) return res.status(400).json(getError("VALIDATION_TUTORIAL_NAME_REQUIRED"));

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const tutorial = user.preferences?.tutorials?.find(t => t.name === tutorialName);
        if (tutorial?.isCompleted) {
            return res.status(200).json({ success: true, message: "Tutorial already completed." });
        }

        await user.markTutorialAsCompleted(tutorialName);
        invalidateUser(userId);
        return res.status(200).json({ success: true, message: "Tutorial marked as completed." });
    } catch (error) {
        console.error("Error marking tutorial as completed:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const editUser = async (req, res) => {
    const userId = req.userAuth.id;
    const { name, birthdate, country, region, enterprise, enterpriseRole, aboutme, socialLinks } = req.body;
    
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));
        if (name) user.profile.name = name;
        if (birthdate) {
            const birthDateObject = new Date(birthdate);
            if (isNaN(birthDateObject.getTime())) return res.status(400).json(getError("VALIDATION_BIRTHDATE_INVALID"));
            const now = new Date();
            let age = now.getFullYear() - birthDateObject.getFullYear();
            if (now.getMonth() < birthDateObject.getMonth() || (now.getMonth() === birthDateObject.getMonth() && now.getDate() < birthDateObject.getDate())) age--;
            if (age < 18) return res.status(400).json(getError("VALIDATION_BIRTHDATE_INVALID"));
            user.profile.birthdate = birthDateObject;
        }
        if (country) user.profile.country = country;
        if (region) user.profile.region = region;
        if (aboutme) user.profile.aboutMe = aboutme;
        if (enterprise) user.enterprise.name = enterprise;
        if (enterpriseRole) user.enterprise.jobPosition = enterpriseRole;
        if (socialLinks !== undefined) {
            if (!Array.isArray(socialLinks)) return res.status(400).json(getError("VALIDATION_SOCIAL_LINKS_MUST_BE_ARRAY"));
            if (socialLinks.length > 5) return res.status(400).json(getError("VALIDATION_SOCIAL_LINKS_MAX_EXCEEDED"));
            user.profile.socialLinks = socialLinks;
        }

        let achievementsResult = { newlyUnlocked: [] };
        const isProfileComplete = !!name && !!birthdate && !!country && !!region && !!aboutme && !!enterprise && !!enterpriseRole;
        if (isProfileComplete) achievementsResult = await unlockAchievements(user);
        await user.save();
        invalidateUser(userId);

        return res.status(200).json({
            success: true,
            message: "User updated successfully.",
            data: user.getGameUserDetails(),
            achievementsUnlocked: achievementsResult.newlyUnlocked
        });
    } catch (error) {
        console.error("Error updating user:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const searchUsers = async (req, res) => {
    const userId = req.userAuth.id;
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const { query } = req.query;
        if (!query || query.trim().length < 2) return res.status(400).json(getError("VALIDATION_SEARCH_QUERY_TOO_SHORT"));

        const users = await User.find({
            $text: { $search: query },
            _id: { $ne: userId }
        }).select('username profilePhoto profile.name enterprise.name enterprise.jobPosition').limit(50);

        if (!users.length) return res.status(200).json({ success: true, data: [] });

        const fuse = new Fuse(users.map(u => u.getSearchUserDetails()), {
            keys: ["username", "name", "enterprise", "jobPosition"],
            threshold: 0.3,
            findAllMatches: true,
            includeScore: true,
            ignoreLocation: true,
            ignoreDiacritics: true,
        });

        const results = fuse.search(query).map(result => result.item);
        return res.status(200).json({ success: true, data: results });
    } catch (error) {
        console.error("Error searching users:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

module.exports = { getUserSidebarDetails, getUserDetailsByUsername, getTutorialStatus, markTutorialAsCompleted, editUser, searchUsers, getUserByToken };