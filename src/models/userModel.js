const { censor } = require('../helpers/profanityChecker');
const { Schema, model } = require("mongoose");

const tutorialSchema = new Schema({
  name: {
    type: String,
    required: [true, "Tutorial name is required"],
    trim: true,
    maxlength: [50, "Tutorial name cannot exceed 50 characters"],
  },
  isCompleted: {
    type: Boolean,
    default: false,
  },
  completedAt: {
    type: Date,
    validate: {
      validator: function (value) {
        return !value || value <= Date.now();
      },
      message: "Completed date cannot be in the future",
    },
  },
});

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

const xpEventSchema = new Schema({
  type: {
    type: String,
    enum: [
      'LESSON_COMPLETED',
      'INSTRUCTION_GRADED',
      'DAILY_STREAK_BONUS'
    ],
    required: true
  },
  xp: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    default: Date.now
  },
  meta: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, { _id: false });

const dailyStreakSchema = new Schema({
  count: {
    type: Number,
    default: 0,
    min: 0
  },
  lastActivityLocalDate: {
    type: String,
    default: null
  },
  timezone: {
    type: String,
    default: 'America/Argentina/Buenos_Aires'
  }
}, { _id: false });

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
    required: true
  },
  startDate: {
    type: Date,
    default: Date.now,
    validate: {
      validator: (value) => value <= Date.now(),
      message: "Start date cannot be in the future",
    },
  },
  submittedAt: {
    type: Date,
    validate: {
      validator: function (value) { return !value || value >= this.startDate },
      message: "Submitted date must be after start date",
    },
  },
  reviewedAt: {
    type: Date,
    validate: {
      validator: (value) => !value || value <= Date.now(),
      message: "Reviewed date cannot be in the future",
    },
  },
  score: {
    type: Number,
    min: [0],
    max: [100],
    validate: {
      validator: function (value) { return value === null || Number.isInteger(value) },
      message: "Score must be an integer or null",
    },
  },
  estimatedTimeSec: {
    type: Number,
    min: 0,
    default: 0
  },
  xpGrantedAt: {
    type: Date,
    default: null,
  },
  observations: {
    type: String,
    maxlength: 500,
  },
  status: {
    type: String,
    enum: ["PENDING", "IN_PROCESS", "SUBMITTED", "GRADED"],
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
        type: String,
        required: true
      },
      viewedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  lastWatchedLesson: {
    lessonId: {
      type: String,
      ref: "Lesson",
      default: null,
    },
    viewedAt: {
      type: Date,
      default: null,
    },
    currentTime: {
      type: Number,
      min: [0, "Current time cannot be negative"],
      default: 0
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
    trim: true,
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
        trim: true,
        maxlength: [50, "Country name cannot exceed 50 characters"],
      },
      region: {
        type: String,
        trim: true,
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
        maxlength: [2600, "About me section cannot exceed 2600 characters"],
      },
    },
    enterprise: enterpriseSchema,
    teams: [teamSchema],
    level: { type: levelSchema, default: () => ({}) },
    dailyStreak: { type: dailyStreakSchema, default: () => ({}) },
    xpHistory: { type: [xpEventSchema], default: [] },
    achievements: [achievementSchema],
    unlockedCovers: [unlockedCoverSchema],
    programs: {
      tia: {
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
      tmd: {
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
      }
    },
    preferences: {
      tutorials: {
        type: [tutorialSchema],
        default: [
          { name: "initial_tutorial",
            isCompleted: false,
            completedAt: null
          }],
      },
      notificationsEnabled: {
        type: Boolean,
        default: true,
      },
      hasProfilePhoto: {
        type: Boolean,
        default: false,
      },
      isGoogleAccount: {
        type: Boolean,
        default: false,
      },
      allowPasswordLogin: {
        type: Boolean,
        default: true
      }
    },
    otp: {
      recoveryOtp: {
        type: String,
        default: null,
        minlength: [6, "El OTP debe tener exactamente 6 dígitos."],
        maxlength: [6, "El OTP debe tener exactamente 6 dígitos."],
        validate: {
          validator: function (value) {
            return !value || /^\d{6}$/.test(value);
          },
          message: "El OTP debe ser un número de 6 dígitos.",
        },
      },
      otpExpiresAt: {
        type: Date,
        default: null,
        // validate: {
        //   validator: function (value) {
        //     return !value || value > Date.now();
        //   },
        //   message: "La fecha de expiración debe ser en el futuro.",
        // },
      },
    },
  },
  {
    timestamps: true,
  }
);

userSchema.virtual("profilePhotoUrl").get(function () {
  if (this.preferences.hasProfilePhoto) {
    return `${process.env.AWS_S3_BASE_URL}/${process.env.AWS_S3_FOLDER_NAME}/${this._id}`;
  }
  return null;
});

userSchema.methods.getUserSidebarDetails = function () {
  return {
    id: this._id,
    username: this.username,
    profilePhoto: this.profilePhotoUrl,
  };
};

userSchema.methods.getRankingUserDetails = function () {
  return {
    id: this._id,
    name: censor(this.profile.name),
    username: this.username,
    photo: this.profilePhotoUrl,
    enterprise: censor(this.enterprise.name) || "",
    points: this.level.experienceTotal,
    level: this.level.currentLevel
  };
};

userSchema.methods.getFullUserDetails = function () {
  return {
    id: this._id,
    username: this.username,
    profilePhoto: this.profilePhotoUrl,
    profile: {
      ...this.profile,
      name: censor(this.profile.name),
      aboutMe: censor(this.profile.aboutMe),
    },
    enterprise: {
      ...this.enterprise,
      name: censor(this.enterprise?.name),
      jobPosition: censor(this.enterprise?.jobPosition),
    },
    teams: this.teams,
    level: this.level,
    achievements: this.achievements,
    programs: this.programs,
    dailyStreak: this.dailyStreak,
    xpHistory: this.xpHistory,
    unlockedCovers: this.unlockedCovers,
    preferences: this.preferences,
  };
};

userSchema.methods.getSearchUserDetails = function () {
  return {
    id: this._id,
    username: this.username,
    name: censor(this.profile.name),
    profilePhoto: this.profilePhotoUrl,
    enterprise: censor(this.enterprise?.name) || null,
    jobPosition: censor(this.enterprise?.jobPosition) || null,
  };
};

userSchema.methods.markTutorialAsCompleted = function (tutorialName) {
  const tutorial = this.preferences.tutorials.find((t) => t.name === tutorialName);
  if (tutorial) {
    tutorial.isCompleted = true;
    tutorial.completedAt = new Date();
  } else {
    this.preferences.tutorials.push({
      name: tutorialName,
      isCompleted: true,
      completedAt: new Date(),
    });
  }

  return this.save();
};

userSchema.methods.getInstructionStatus = function (programId, instructionId) {
  const instruction = this.programs?.[programId]?.instructions?.find(i => i.instructionId === instructionId);
  return instruction?.status || 'PENDING';
};

module.exports = model("User", userSchema);