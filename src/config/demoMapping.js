/**
 * Mapping between demo program lesson/instruction IDs and full program IDs.
 * When a user upgrades from demo to subscription, progress is transferred using these mappings.
 */

const DEMO_LESSON_MAP = {
  // Demo Lesson ID → Full Program Lesson ID
  DEMO_TRENNOIAM01L01: "TRENNOIAM01L01",
  DEMO_TRENNOIAM01L02: "TRENNOIAM01L02",
};

const DEMO_INSTRUCTION_MAP = {
  // Demo Instruction ID → Full Program Instruction ID
  DEMO_TRENNOIAI01: "TRENNOIAI01",
};

const DEMO_TO_FULL_PROGRAM = {
  demo_trenno: "trenno_ia",
};

module.exports = {
  DEMO_LESSON_MAP,
  DEMO_INSTRUCTION_MAP,
  DEMO_TO_FULL_PROGRAM,
};
