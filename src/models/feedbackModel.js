const { Schema, model } = require("mongoose");

const FEEDBACK_TYPES = ["lesson", "instruction", "nps", "onboarding", "error"];
const REACTIONS = ["up", "down"];

const contextSchema = new Schema(
  {
    lessonId: { type: String, default: null },
    instructionId: { type: String, default: null },
    programId: { type: String, default: null },
    route: { type: String, default: null },
    appVersion: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { _id: false }
);

const errorPayloadSchema = new Schema(
  {
    stack: { type: String, default: null, maxlength: 4000 },
    stackHash: { type: String, default: null, index: true },
    message: { type: String, default: null, maxlength: 500 },
    route: { type: String, default: null, maxlength: 200 },
    statusCode: { type: Number, default: null },
  },
  { _id: false }
);

const feedbackSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    type: { type: String, enum: FEEDBACK_TYPES, required: true, index: true },
    rating: { type: Number, min: 0, max: 10, default: null },
    reaction: { type: String, enum: REACTIONS, default: null },
    secondaryReactions: {
      evaluationFair: { type: String, enum: REACTIONS, default: null },
      instructionsClear: { type: String, enum: REACTIONS, default: null },
    },
    message: { type: String, default: null, maxlength: 2000 },
    requestId: { type: String, default: null },
    context: { type: contextSchema, default: () => ({}) },
    errorPayload: { type: errorPayloadSchema, default: null },
    resolved: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

feedbackSchema.index({ userId: 1, type: 1, createdAt: -1 });
feedbackSchema.index({ resolved: 1, createdAt: -1 });

feedbackSchema.index(
  { userId: 1, requestId: 1 },
  {
    unique: true,
    partialFilterExpression: { requestId: { $exists: true, $type: "string" } },
  }
);

feedbackSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: { type: "error" },
  }
);

module.exports = model("Feedback", feedbackSchema);
module.exports.FEEDBACK_TYPES = FEEDBACK_TYPES;
module.exports.REACTIONS = REACTIONS;
