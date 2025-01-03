const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, "username is required."],
    unique: true,
  },
  password: {
    type: String,
    required: [true, "password is required."],
  },
  role: {
    type: String,
    required: [true, "role is required."],
    enum: ["ADMIN", "USER"],
  },
  status: {
    type: Boolean,
    default: true,
  },
});

userSchema.methods.toJSON = function () {
  const { __v, _id, password, ...user } = this.toObject();
  const parseUser = {
    id: _id,
    ...user,
  };
  return parseUser;
};

const User = mongoose.model("User", userSchema);

module.exports = User;
