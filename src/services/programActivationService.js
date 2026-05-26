const User = require("../models/userModel");
const { unlockAchievements } = require("./achievementsService");

const activateProgramForUser = async (userId, programId, teamName = "no_team", session = null) => {
  const findOpts = session ? { session } : {};
  const user = await User.findById(userId, null, findOpts);
  if (!user) throw { statusCode: 404, errorKey: "AUTH_USER_NOT_FOUND" };

  const program = user.programs?.[programId];
  if (program?.isPurchased) {
    return { user, newlyUnlocked: [], alreadyOwned: true };
  }

  user.programs[programId].isPurchased = true;
  if (!user.programs[programId].acquiredAt) {
    user.programs[programId].acquiredAt = new Date();
  }
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

const deactivateProgramForUser = async (userId, programId, session = null) => {
  const findOpts = session ? { session } : {};
  const user = await User.findById(userId, null, findOpts);
  if (!user) throw { statusCode: 404, errorKey: "AUTH_USER_NOT_FOUND" };

  const program = user.programs?.[programId];
  if (!program) throw { statusCode: 400, errorKey: "PROGRAM_NOT_FOUND" };

  if (program.subscription?.status === "active") {
    throw { statusCode: 409, errorKey: "PROGRAM_HAS_ACTIVE_SUBSCRIPTION" };
  }

  const wasActive = program.isPurchased || program.hasAccessFlag;

  user.programs[programId].isPurchased = false;
  user.programs[programId].hasAccessFlag = false;

  const saveOpts = session ? { session } : {};
  await user.save(saveOpts);

  return { user, wasActive };
};

module.exports = { activateProgramForUser, deactivateProgramForUser };
