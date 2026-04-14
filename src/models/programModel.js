const { Schema, model } = require("mongoose");

const resourceSchema = new Schema(
    {
        id: { type: String, required: true },
        parentId: { type: String, default: null },
        title: { type: String, required: true, trim: true },
        description: { type: String, default: "", trim: true },
        link: { type: String, default: "" },
        type: {
            type: String,
            required: true,
            enum: ["document", "video", "presentation", "folder", "activity", "submission"],
        },
        order: { type: Number, default: 0 },
    },
    { _id: false }
);

const lessonSchema = new Schema(
    {
        id: { type: String, required: true },
        title: { type: String, required: true, trim: true },
        longTitle: { type: String, default: "", trim: true },
        description: { type: String, default: "" },
        durationSec: { type: Number, default: 0 },
        muxPlaybackId: { type: String, default: "" },
        blocked: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
    },
    { _id: false }
);

const instructionSchema = new Schema(
    {
        id: { type: String, required: true },
        title: { type: String, required: true, trim: true },
        shortDescription: { type: String, default: "", trim: true },
        description: { type: String, default: "" },
        difficulty: {
            type: String,
            required: true,
            enum: ["LOW", "MEDIUM", "HIGH"],
            default: "LOW",
        },
        rewardXP: { type: Number, default: 0 },
        estimatedTimeSec: { type: Number, default: 0 },
        acceptedFormats: { type: [String], default: [] },
        maxFileSizeMB: { type: Number, default: 15 },
        deliverableHint: { type: String, default: "", trim: true },
        afterLessonId: { type: String, default: null },
        deliverableType: { type: String, enum: ["file", "text"], default: "file" },
        maxFiles: { type: Number, default: 1 },
        requiredActivityId: { type: String, default: null },
        tools: { type: [String], default: [] },
        steps: { type: [String], default: [] },
        resources: { type: [resourceSchema], default: [] },
        order: { type: Number, default: 0 },
    },
    { _id: false }
);

const moduleSchema = new Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, default: "", trim: true },
        lessons: { type: [lessonSchema], default: [] },
        instructions: { type: [instructionSchema], default: [] },
        order: { type: Number, default: 0 },
    },
    { _id: false }
);

const sectionSchema = new Schema(
    {
        id: { type: String, required: true },
        name: { type: String, required: true, trim: true },
        modules: { type: [moduleSchema], default: [] },
        resources: { type: [resourceSchema], default: [] },
        order: { type: Number, default: 0 },
    },
    { _id: false }
);

const programSchema = new Schema(
    {
        id: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        name: { type: String, required: true, trim: true },
        price: { type: Number, default: 0 },
        href: { type: String, default: "" },
        categories: { type: [String], default: [] },
        description: { type: String, default: "", trim: true },
        type: { type: String, enum: ["purchase", "subscription", "demo"], default: "purchase" },
        priceARS: { type: Number, default: null },
        subscriptionPriceARS: { type: Number, default: null },
        purchasable: { type: Boolean, default: false },
        hidden: { type: Boolean, default: false },
        longDescription: { type: String, default: "", trim: true },
        learningPoints: { type: [String], default: [] },
        logoUrl: { type: String, default: "" },
        backgroundUrl: { type: String, default: "" },
        sections: { type: [sectionSchema], default: [] },
    },
    { timestamps: true }
);

const Program = model("Program", programSchema);

module.exports = { Program };
