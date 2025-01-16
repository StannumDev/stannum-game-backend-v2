const User = require("../models/userModel");
const { getError } = require("../helpers/getError");

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
  
      user.profile.name = name || user.profile.name;
      user.profile.birthdate = birthdate || user.profile.birthdate;
      user.profile.country = country || user.profile.country;
      user.profile.region = region || user.profile.region;
      user.profile.aboutMe = aboutme || user.profile.aboutMe;
  
      user.enterprise.name = enterprise || user.enterprise.name;
      user.enterprise.jobPosition = enterpriseRole || user.enterprise.jobPosition;
  
      await user.save();
      return res.status(200).json({ success: true, message: "User updated successfully.", data: user.getFullUserDetails() });
    } catch (error) {
      console.error("Error updating user:", error);
      return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
  };
  

module.exports = { getUserSidebarDetails, getUserDetailsByUsername, getTutorialStatus, markTutorialAsCompleted, editUser };