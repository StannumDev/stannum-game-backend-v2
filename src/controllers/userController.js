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

module.exports = { getUserSidebarDetails, getUserDetailsByUsername };