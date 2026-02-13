const User = require("../models/userModel");
const { getError } = require("./getError");

const MAX_USERNAME_RETRIES = 10;

const generateUsername = async (prefix) => {
  try {
    for (let i = 0; i < MAX_USERNAME_RETRIES; i++) {
      const username = `${prefix}_${Math.random().toString(36).substr(2, 8)}`;
      const existingUser = await User.findOne({ username });
      if (!existingUser) return username;
    }
    throw new Error("Could not generate a unique username");
  } catch (error) {
    console.error("Error generating username:", error);
    throw new Error(getError("USERNAME_GENERATION_FAILED").techMessage);
  }
};

module.exports = { generateUsername };
