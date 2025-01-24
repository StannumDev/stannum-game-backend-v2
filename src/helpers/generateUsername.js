const User = require("../models/userModel");

const generateUsername = async (prefix) => {
  try {
    let username;
    let isUnique = false;

    while (!isUnique) {
      username = `${prefix}_${Math.random().toString(36).substr(2, 8)}`;
      const existingUser = await User.findOne({ username });
      if (!existingUser) isUnique = true;
    }

    return username;
  } catch (error) {
    console.error("Error generating username:", error);
    throw new Error(getError("USERNAME_GENERATION_FAILED").techMessage);
  }
};


module.exports = { generateUsername };