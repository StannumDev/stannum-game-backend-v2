const User = require("../models/userModel");
const { DEMO_LESSON_MAP, DEMO_INSTRUCTION_MAP, DEMO_TO_FULL_PROGRAM } = require("../config/demoMapping");

/**
 * Transfer progress from a demo program to the full program when user subscribes.
 * - Maps completed lessons by ID
 * - Transfers XP to the full program (does NOT re-add to global experienceTotal)
 * - Transfers submitted instructions (S3 URLs remain valid)
 * - Revokes demo access
 */
async function transferDemoProgress(userId, fullProgramId) {
  const demoProgramId = Object.entries(DEMO_TO_FULL_PROGRAM)
    .find(([, full]) => full === fullProgramId)?.[0];

  if (!demoProgramId) return { transferred: false, reason: "no_demo_mapping" };

  const user = await User.findById(userId);
  if (!user) return { transferred: false, reason: "user_not_found" };

  const demo = user.programs?.[demoProgramId];
  if (!demo) return { transferred: false, reason: "no_demo_program" };

  // Check if demo has any progress to transfer
  const hasLessons = demo.lessonsCompleted?.length > 0;
  const hasInstructions = demo.instructions?.length > 0;
  const hasXp = (demo.totalXp || 0) > 0;

  if (!hasLessons && !hasInstructions && !hasXp) {
    return { transferred: false, reason: "no_progress" };
  }

  const full = user.programs?.[fullProgramId];
  if (!full) return { transferred: false, reason: "full_program_not_found" };

  let lessonsTransferred = 0;
  let instructionsTransferred = 0;
  let xpTransferred = 0;

  // Transfer completed lessons
  if (demo.lessonsCompleted?.length > 0) {
    const existingLessonIds = new Set(
      (full.lessonsCompleted || []).map((l) => l.lessonId)
    );

    for (const lesson of demo.lessonsCompleted) {
      const mappedId = DEMO_LESSON_MAP[lesson.lessonId];
      if (mappedId && !existingLessonIds.has(mappedId)) {
        if (!full.lessonsCompleted) full.lessonsCompleted = [];
        full.lessonsCompleted.push({
          lessonId: mappedId,
          viewedAt: lesson.viewedAt,
        });
        lessonsTransferred++;
      }
    }
  }

  // Transfer submitted instructions (S3 URLs stay the same)
  if (demo.instructions?.length > 0) {
    const existingInstructionIds = new Set(
      (full.instructions || []).map((i) => i.instructionId)
    );

    for (const instruction of demo.instructions) {
      const mappedId = DEMO_INSTRUCTION_MAP[instruction.instructionId];
      if (mappedId && !existingInstructionIds.has(mappedId)) {
        if (!full.instructions) full.instructions = [];
        full.instructions.push({
          ...instruction.toJSON?.() || instruction,
          instructionId: mappedId,
        });
        instructionsTransferred++;
      }
    }
  }

  // Transfer XP to the program (NOT to global experienceTotal — it was already counted)
  if (demo.totalXp > 0) {
    xpTransferred = demo.totalXp;
    full.totalXp = (full.totalXp || 0) + demo.totalXp;
  }

  // Revoke demo access
  demo.isPurchased = false;
  demo.hasAccessFlag = false;

  await user.save();

  console.info(
    `[DemoTransfer] User ${userId}: ${lessonsTransferred} lessons, ${instructionsTransferred} instructions, ${xpTransferred} XP transferred from ${demoProgramId} → ${fullProgramId}`
  );

  return {
    transferred: true,
    lessonsTransferred,
    instructionsTransferred,
    xpTransferred,
  };
}

module.exports = { transferDemoProgress };
