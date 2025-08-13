const Fuse = require("fuse.js");

const User = require("../models/userModel");
const { getError } = require("../helpers/getError");


const getUserByToken = async (req, res) => {
    try {
        const userId = req.userAuth.id;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const userDetails = user.getFullUserDetails();
        return res.status(200).json({ success: true, data: userDetails });
    } catch (error) {
        console.error("Error fetching user details by token:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getUserSidebarDetails = async (req, res) => {
    try {
        const userId = req.userAuth.id;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const sidebarDetails = user.getUserSidebarDetails();
        return res.status(200).json({ success: true, data: sidebarDetails });
    } catch (error) {
        console.error("Error fetching user sidebar details:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getUserDetailsByUsername = async (req, res) => {
    try {
        const { username } = req.params;
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const userDetails = user.getFullUserDetails();
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
    
        const tutorial = user.preferences.tutorials.find((t) => t.name === tutorialName);
        if (!tutorial) return res.status(404).json(getError("VALIDATION_TUTORIAL_NOT_FOUND"));
    
        return res.status(200).json({ success: true, tutorial });
      
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

        const tutorial = user.preferences.tutorials.find(t => t.name === tutorialName);
        if (!tutorial) return res.status(404).json(getError("TUTORIAL_NOT_FOUND"));

        if (tutorial.isCompleted) {
            return res.status(400).json(getError("TUTORIAL_ALREADY_COMPLETED"));
        }

        tutorial.isCompleted = true;
        tutorial.completedAt = new Date();

        await user.save();
        return res.status(200).json({ success: true, message: "Tutorial marked as completed." });
    } catch (error) {
        console.error("Error marking tutorial as completed:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const editUser = async (req, res) => {
    const userId = req.userAuth.id;
    const { name, birthdate, country, region, enterprise, enterpriseRole, aboutme } = req.body;
  
    try {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));
  
      if(name) user.profile.name = name;
      if(birthdate) user.profile.birthdate = birthdate;
      if(country) user.profile.country = country;
      if(region) user.profile.region = region;
      if(aboutme) user.profile.aboutMe = aboutme;
      if(enterprise) user.enterprise.name = enterprise;
      if(enterpriseRole) user.enterprise.jobPosition = enterpriseRole;
  
      await user.save();
      return res.status(200).json({ success: true, message: "User updated successfully.", data: user.getFullUserDetails() });
    } catch (error) {
      console.error("Error updating user:", error);
      return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const searchUsers = async (req, res) => {
    try {
        const { query } = req.query;

        if (!query || query.trim().length < 2) return res.status(400).json(getError("VALIDATION_SEARCH_QUERY_TOO_SHORT"));

        const users = await User.find();
        if (!users.length) return res.status(404).json(getError("AUTH_NO_USERS_FOUND"));

        const fuse = new Fuse(users.map(user => user.getSearchUserDetails()), {
            keys: ["username", "name", "enterprise", "jobPosition"],
            threshold: 0.3,
            findAllMatches: true,
            includeScore: true,
            ignoreLocation: true,
            ignoreDiacritics: true,
        });

        const results = fuse.search(query).map(result => result.item);

        if (!results.length) return res.status(404).json(getError("AUTH_NO_USERS_FOUND"));
        
        return res.status(200).json({ success: true, data: results });
    } catch (error) {
        console.error("Error searching users:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

module.exports = { getUserSidebarDetails, getUserDetailsByUsername, getTutorialStatus, markTutorialAsCompleted, editUser, searchUsers, getUserByToken };