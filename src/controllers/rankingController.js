const User = require("../models/userModel");
const { getError } = require("../helpers/getError");
const { censor } = require("../helpers/profanityChecker");

const getIndividualRanking = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;

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
    .select('level profile username enterprise preferences.hasProfilePhoto');

    if (!users || users.length === 0) return res.status(200).json({ success: true, data: [] });

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

    const users = await User.find({ [`programs.${programName}.isPurchased`]: true, status: true })
      .select('level profile username enterprise preferences.hasProfilePhoto teams');
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

const getProgramIndividualRanking = async (req, res) => {
  try {
    const programName = req.params.programName?.toLowerCase();
    if (!programName) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_REQUIRED"));

    const validPrograms = ['tia', 'tia_summer', 'tmd'];
    if (!validPrograms.includes(programName)) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_INVALID"));

    const limit = parseInt(req.query.limit, 10) || 10;

    const results = await User.aggregate([
      { $match: { [`programs.${programName}.isPurchased`]: true, status: true } },
      { $unwind: "$xpHistory" },
      { $match: {
          "xpHistory.type": { $in: ["LESSON_COMPLETED", "INSTRUCTION_GRADED"] },
          "xpHistory.meta.programId": programName
        }
      },
      { $group: {
          _id: "$_id",
          totalProgramXP: { $sum: "$xpHistory.xp" },
          name: { $first: "$profile.name" },
          username: { $first: "$username" },
          hasProfilePhoto: { $first: "$preferences.hasProfilePhoto" },
          enterpriseName: { $first: "$enterprise.name" },
          level: { $first: "$level.currentLevel" }
        }
      },
      { $sort: { totalProgramXP: -1 } },
      { $limit: limit }
    ]);

    if (!results || results.length === 0) return res.status(200).json({ success: true, data: [] });

    const s3Base = `${process.env.AWS_S3_BASE_URL}/${process.env.AWS_S3_FOLDER_NAME}`;
    const rankedUsers = results.map((user, index) => ({
      position: index + 1,
      id: user._id,
      name: censor(user.name || "") || "",
      username: user.username,
      photo: user.hasProfilePhoto ? `${s3Base}/${user._id}` : null,
      enterprise: censor(user.enterpriseName || "") || "",
      points: user.totalProgramXP,
      level: user.level
    }));

    return res.status(200).json({ success: true, data: rankedUsers });
  } catch (error) {
    console.error("Error fetching program individual ranking:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { getIndividualRanking, getTeamRanking, getProgramIndividualRanking };