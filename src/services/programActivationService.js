const User = require("../models/userModel");
const { unlockAchievements } = require("./achievementsService");
const { hasAccess } = require("../utils/accessControl");

const activateProgramForUser = async (userId, programId, teamName = "no_team", session = null) => {
  const findOpts = session ? { session } : {};
  const user = await User.findById(userId, null, findOpts);
  if (!user) throw { statusCode: 404, errorKey: "AUTH_USER_NOT_FOUND" };

  if (hasAccess(user.programs?.[programId])) {
    return { user, newlyUnlocked: [], alreadyOwned: true };
  }

  user.programs[programId].isPurchased = true;
  user.programs[programId].acquiredAt = new Date();
  user.programs[programId].hasAccessFlag = true;

  const alreadyInTeam = user.teams.some(t => t.programName === programId);
  if (!alreadyInTeam && teamName && teamName !== "no_team") {
    user.teams.push({
      programName: programId,
      teamName: teamName,
      role: "member",
    });
  }

  const { newlyUnlocked } = await unlockAchievements(user);

  const saveOpts = session ? { session } : {};
  await user.save(saveOpts);

  return { user, newlyUnlocked, alreadyOwned: false };
};

module.exports = { activateProgramForUser };
