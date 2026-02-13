const User = require("../models/userModel");
const { getError } = require("../helpers/getError");

const getIndividualRanking = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    if (isNaN(limit) || limit <= 0 || limit > 1000) return res.status(400).json(getError("VALIDATION_LIMIT_INVALID"));

    const users = await User.find({
      $or: [
        { "programs.tmd.isPurchased": true },
        { "programs.tia.isPurchased": true },
        { "programs.tia_summer.isPurchased": true }
      ],
      status: true
    })
    .sort({ 'level.experienceTotal': -1 })
    .limit(limit)
    .select('level profile username enterprise profilePhotoUrl');

    if (!users || users.length === 0) return res.status(404).json(getError("RANKING_NO_USERS_FOUND"));

    const rankedUsers = users.map((user, index) => ({ ...user.getRankingUserDetails(), position: index + 1 }));
    return res.status(200).json({ success: true, data: rankedUsers });
  } catch (error) {
    console.error("Error fetching individual ranking:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const getTeamRanking = async (req, res) => {
  try {
    const { programName } = req.params;
    if (!programName) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_REQUIRED"));

    const validPrograms = ['tia', 'tia_summer', 'tmd'];
    if (!validPrograms.includes(programName)) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_INVALID"));

    const users = await User.find({ [`programs.${programName}.isPurchased`]: true });
    if (!users.length) return res.status(404).json(getError("RANKING_NO_USERS_FOUND"));

    const teams = {};

    users.forEach(user => {
      const teamInfo = user.teams.find(team => team.programName === programName);
      if (!teamInfo || !teamInfo.teamName) return;

      const teamName = teamInfo.teamName;
      if (!teams[teamName]) teams[teamName] = { team: teamName, members: [], totalPoints: 0 };

      const details = user.getRankingUserDetails();
      teams[teamName].members.push(details);
      teams[teamName].totalPoints += details.points;
    });

    const teamRanking = Object.values(teams).sort((a, b) => b.totalPoints - a.totalPoints).map((team, index) => ({
      position: index + 1,
      team: team.team,
      points: team.totalPoints,
      members: team.members,
    }));

    if (!teamRanking.length) return res.status(404).json(getError("RANKING_NO_TEAMS_FOUND"));
    return res.status(200).json({ success: true, data: teamRanking });
  } catch (error) {
    console.error("Error fetching team ranking:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { getIndividualRanking, getTeamRanking };