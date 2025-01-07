const { Schema, model } = require("mongoose");

const levelSchema = new Schema({
  currentLevel: {
    type: Number,
    required: [true, "Current level is required"],
    default: 1,
    min: [1, "Level cannot be less than 1"],
    max: [30, "Level cannot be greater than 30"],
    validate: {
      validator: Number.isInteger,
      message: "Level must be an integer",
    },
  },
  experienceTotal: {
    type: Number,
    required: [true, "Total experience is required"],
    default: 0,
    min: [0, "Total experience cannot be negative"],
    validate: {
      validator: Number.isInteger,
      message: "Total experience must be an integer",
    },
  },
  experienceCurrentLevel: {
    type: Number,
    required: [true, "Current level experience is required"],
    default: 0,
    min: [0, "Current level experience cannot be negative"],
    validate: {
      validator: Number.isInteger,
      message: "Current level experience must be an integer",
    },
  },
  experienceNextLevel: {
    type: Number,
    required: [true, "Next level experience is required"],
    default: 1000,
    min: [1, "Next level experience must be at least 1"],
    validate: {
      validator: function (value) {
        return value > this.experienceCurrentLevel;
      },
      message: "Next level experience must be greater than current level experience",
    },
  },
  progress: {
    type: Number,
    default: function () {
      if (
        this.experienceTotal < this.experienceCurrentLevel ||
        this.experienceTotal > this.experienceNextLevel
      ) {
        return 0;
      }
      return (
        ((this.experienceTotal - this.experienceCurrentLevel) /
          (this.experienceNextLevel - this.experienceCurrentLevel)) *
        100
      );
    },
    validate: {
      validator: function (value) {
        return value >= 0 && value <= 100;
      },
      message: "Progress must be between 0 and 100",
    },
  },
});

const achievementSchema = new Schema({
  achievementId: {
    type: String,
    required: [true, "Achievement ID is required"],
    validate: {
      validator: function (value) {
        return typeof value === "string" && value.trim().length > 0;
      },
      message: "Achievement ID must be a non-empty string",
    },
  },
  progress: {
    type: Number,
    default: 0,
    min: [0, "Progress cannot be less than 0"],
    max: [100, "Progress cannot exceed 100"],
    validate: {
      validator: Number.isInteger,
      message: "Progress must be an integer",
    },
  },
  isCompleted: {
    type: Boolean,
    default: false,
  },
});

const instructionSchema = new Schema({
  instructionId: {
    type: String,
    required: [true, "Instruction ID is required"],
    validate: {
      validator: function (value) {
        return typeof value === "string" && value.trim().length > 0;
      },
      message: "Instruction ID must be a non-empty string",
    },
  },
  fileUrl: {
    type: String,
    validate: {
      validator: function (value) {
        return !value || /^https?:\/\/[\w\-]+(\.[\w\-]+)+[/#?]?.*$/.test(value);
      },
      message: "File URL must be a valid URL",
    },
  },
  submittedAt: {
    type: Date,
    validate: {
      validator: function (value) {
        return !value || value > this.startDate;
      },
      message: "Submitted date must be later than the start date",
    },
  },
  startDate: {
    type: Date,
    default: Date.now,
    validate: {
      validator: function (value) {
        return value <= Date.now();
      },
      message: "Start date cannot be in the future",
    },
  },
  timeToComplete: {
    type: Number,
    min: [0, "Time to complete cannot be negative"],
    validate: {
      validator: Number.isInteger,
      message: "Time to complete must be an integer",
    },
  },
  score: {
    type: Number,
    min: [0, "Score cannot be less than 0"],
    max: [100, "Score cannot exceed 100"],
    validate: {
      validator: function (value) {
        return value === null || Number.isInteger(value);
      },
      message: "Score must be an integer or null",
    },
  },
  observations: {
    type: String,
    maxlength: [500, "Observations cannot exceed 500 characters"],
  },
  status: {
    type: String,
    enum: {
      values: ["PENDING", "IN_PROCESS", "SUBMITTED", "GRADED"],
      message: "Status must be one of: PENDING, IN_PROCESS, SUBMITTED, GRADED",
    },
    default: "PENDING",
  },
});

const unlockedCoverSchema = new Schema({
  coverId: {
    type: String,
    required: [true, "Cover ID is required"],
    validate: {
      validator: function (value) {
        return typeof value === "string" && value.trim().length > 0;
      },
      message: "Cover ID must be a non-empty string",
    },
  },
  unlockedDate: {
    type: Date,
    default: Date.now,
    validate: {
      validator: function (value) {
        return value <= Date.now();
      },
      message: "Unlocked date cannot be in the future",
    },
  },
});

const programSchema = new Schema({
  isPurchased: {
    type: Boolean,
    default: false,
  },
  acquiredAt: {
    type: Date,
    validate: {
      validator: function (value) {
        return !value || value <= Date.now();
      },
      message: "Acquired date cannot be in the future",
    },
  },
  instructions: [instructionSchema],
  lessonsCompleted: [
    {
      lessonId: {
        type: Schema.Types.ObjectId,
        ref: "Lesson",
      },
      viewedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  lastWatchedLesson: {
    lessonId: {
      type: Schema.Types.ObjectId,
      ref: "Lesson",
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
    currentTime: {
      type: Number,
      min: [0, "Current time cannot be negative"],
    },
  },
  tests: [
    {
      date: {
        type: Date,
        required: [true, "Test date is required"],
        validate: {
          validator: function (value) {
            return value <= Date.now();
          },
          message: "Test date cannot be in the future",
        },
      },
      sections: {
        type: [Schema.Types.Mixed],
        default: [],
      },
      totalScore: {
        type: Number,
        default: 0,
        min: [0, "Total score cannot be negative"],
      },
    },
  ],
  productKey: {
    type: Schema.Types.ObjectId,
    ref: "ProductKey",
  },
});

const enterpriseSchema = new Schema({
  name: {
    type: String,
    required: [true, "Enterprise name is required"],
    trim: true,
    minlength: [2, "Enterprise name must be at least 2 characters long"],
    maxlength: [100, "Enterprise name cannot exceed 100 characters"],
  },
  jobPosition: {
    type: String,
    trim: true,
    maxlength: [50, "Job position cannot exceed 50 characters"],
  },
});

const teamSchema = new Schema({
  programName: {
    type: String,
    required: [true, "Program name is required"],
    trim: true,
    minlength: [2, "Program name must be at least 2 characters long"],
    maxlength: [50, "Program name cannot exceed 50 characters"],
  },
  teamName: {
    type: String,
    required: [true, "Team name is required"],
    trim: true,
    minlength: [2, "Team name must be at least 2 characters long"],
    maxlength: [50, "Team name cannot exceed 50 characters"],
  },
  role: {
    type: String,
    required: [true, "Program name is required"],
    trim: true,
    minlength: [2, "Program name must be at least 2 characters long"],
    maxlength: [50, "Program name cannot exceed 50 characters"],
  },
});

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters long"],
      maxlength: [30, "Username cannot exceed 30 characters"],
      match: [/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, "Email must be a valid email address"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters long"],
    },
    role: {
      type: String,
      enum: {
        values: ["USER", "ADMIN"],
        message: "Role must be either USER or ADMIN",
      },
      default: "USER",
    },
    status: {
      type: Boolean,
      default: true,
    },
    profile: {
      name: {
        type: String,
        required: [true, "Name is required"],
        trim: true,
        minlength: [2, "Name must be at least 2 characters long"],
        maxlength: [50, "Name cannot exceed 50 characters"],
      },
      country: {
        type: String,
        required: [true, "Country is required"],
        trim: true,
        minlength: [2, "Country name must be at least 2 characters long"],
        maxlength: [50, "Country name cannot exceed 50 characters"],
      },
      region: {
        type: String,
        required: [true, "Region is required"],
        trim: true,
        minlength: [2, "Region name must be at least 2 characters long"],
        maxlength: [50, "Region name cannot exceed 50 characters"],
      },
      birthdate: {
        type: Date,
        validate: {
          validator: function (value) {
            return value <= Date.now();
          },
          message: "Birthdate cannot be in the future",
        },
      },
      aboutMe: {
        type: String,
        maxlength: [300, "About me section cannot exceed 300 characters"],
      },
    },
    enterprise: enterpriseSchema,
    teams: [teamSchema],
    level: levelSchema,
    achievements: [achievementSchema],
    unlockedCovers: [unlockedCoverSchema],
    programs: {
      TMD: {
        type: programSchema,
        default: () => ({
          isPurchased: false,
          acquiredAt: null,
          instructions: [],
          lessonsCompleted: [],
          lastWatchedLesson: null,
          tests: [],
          productKey: null,
        }),
      },
      PROEM: {
        type: programSchema,
        default: () => ({
          isPurchased: false,
          acquiredAt: null,
          instructions: [],
          lessonsCompleted: [],
          lastWatchedLesson: null,
          tests: [],
          productKey: null,
        }),
      },
    },
    preferences: {
      welcomeMessage: {
        type: Boolean,
        default: true,
      },
      notificationsEnabled: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

userSchema.methods.toJSON = function () {
    const { __v, _id, password, ...user } = this.toObject();
    return {
        id: _id,
        ...user,
    };
};

userSchema.methods.getRankingData = function () {
  return {
    username: this.username,
    name: this.profile.name,
    currentLevel: this.level.currentLevel,
    team: this.teams.length > 0 ? this.teams[0].teamName : null
  };
};

userSchema.methods.getSearchData = function () {
  return {
    username: this.username,
    name: this.profile.name,
    team: this.teams.length > 0 ? this.teams[0].teamName : null,
  };
};

module.exports = model("User", userSchema);