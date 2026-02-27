const User = require("../models/userModel");
const { unlockAchievements } = require("./achievementsService");

const activateProgramForUser = async (userId, programId, teamName = "no_team", session = null) => {
  const findOpts = session ? { session } : {};
  const user = await User.findById(userId, null, findOpts);
  if (!user) throw { statusCode: 404, errorKey: "AUTH_USER_NOT_FOUND" };

  if (user.programs?.[programId]?.isPurchased) {
    return { user, newlyUnlocked: [], alreadyOwned: true };
  }

  user.programs[programId].isPurchased = true;
  user.programs[programId].acquiredAt = new Date();

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
