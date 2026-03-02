const User = require("../models/userModel");
const { getError } = require("../helpers/getError");
const { censor } = require("../helpers/profanityChecker");
const { RANKABLE_PROGRAMS, isRankableProgram } = require("../config/programRegistry");
const { buildAccessQuery, buildProgramAccessQuery } = require("../utils/accessControl");

const getIndividualRanking = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const users = await User.find({
      $or: buildAccessQuery(RANKABLE_PROGRAMS),
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

    if (!isRankableProgram(programName)) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_INVALID"));

    const teamRanking = await User.aggregate([
      {
        $match: {
          ...buildProgramAccessQuery(programName),
          status: true,
          'teams': { $elemMatch: { programName, teamName: { $exists: true, $ne: null, $ne: '' } } }
        }
      },
      { $unwind: '$teams' },
      { $match: { 'teams.programName': programName } },
      {
        $project: {
          teamName: '$teams.teamName',
          points: { $ifNull: ['$level.experienceTotal', 0] },
          username: 1,
          name: '$profile.name',
          photo: {
            $cond: [
              { $eq: [{ $ifNull: ['$preferences.hasProfilePhoto', false] }, true] },
              { $concat: [process.env.AWS_S3_BASE_URL || '', '/', process.env.AWS_S3_FOLDER_NAME || 'profile-photos', '/', { $toString: '$_id' }] },
              null
            ]
          },
          level: '$level.currentLevel',
          enterprise: '$enterprise.name',
        }
      },
      {
        $group: {
          _id: '$teamName',
          members: {
            $push: {
              id: '$_id',
              name: '$name',
              username: '$username',
              photo: '$photo',
              points: '$points',
              level: '$level',
              enterprise: '$enterprise',
            }
          },
          totalPoints: { $sum: '$points' }
        }
      },
      { $sort: { totalPoints: -1 } },
      {
        $project: {
          _id: 0,
          team: '$_id',
          points: '$totalPoints',
          members: 1,
        }
      }
    ]);

    if (!teamRanking.length) return res.status(404).json(getError("RANKING_NO_TEAMS_FOUND"));

    const result = teamRanking.map((team, index) => ({
      position: index + 1,
      ...team,
      members: team.members.map(member => ({
        ...member,
        name: censor(member.name),
        enterprise: (censor(member.enterprise) || "").toUpperCase(),
      })),
    }));

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("Error fetching team ranking:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const getProgramIndividualRanking = async (req, res) => {
  try {
    const programName = req.params.programName?.toLowerCase();
    if (!programName) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_REQUIRED"));

    if (!isRankableProgram(programName)) return res.status(400).json(getError("VALIDATION_PROGRAM_NAME_INVALID"));

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const users = await User.find({
      ...buildProgramAccessQuery(programName),
      status: true
    })
    .sort({ [`programs.${programName}.totalXp`]: -1 })
    .limit(limit)
    .select('level profile username enterprise preferences.hasProfilePhoto programs.' + programName + '.totalXp');

    if (!users || users.length === 0) return res.status(200).json({ success: true, data: [] });

    const rankedUsers = users.map((user, index) => ({
      position: index + 1,
      ...user.getRankingUserDetails(),
      points: user.programs?.[programName]?.totalXp || 0,
    }));

    return res.status(200).json({ success: true, data: rankedUsers });
  } catch (error) {
    console.error("Error fetching program individual ranking:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { getIndividualRanking, getTeamRanking, getProgramIndividualRanking };
