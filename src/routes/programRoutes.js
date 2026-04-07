const { Router } = require("express");
const { check, param } = require("express-validator");

const { validateJWT } = require("../middlewares/validateJWT");
const { validateAPIKey } = require("../middlewares/validateAPIKey");
const { fieldsValidate } = require("../middlewares/fieldsValidate");
const programController = require("../controllers/programController");

const router = Router();

// ── Validadores reutilizables ──
const programIdParam = param("programId").trim().notEmpty().withMessage("programId es requerido");
const sectionIdParam = param("sectionId").trim().notEmpty().withMessage("sectionId es requerido");
const moduleIdParam = param("moduleId").trim().notEmpty().withMessage("moduleId es requerido");
const lessonIdParam = param("lessonId").trim().notEmpty().withMessage("lessonId es requerido");
const instructionIdParam = param("instructionId").trim().notEmpty().withMessage("instructionId es requerido");
const resourceIdParam = param("resourceId").trim().notEmpty().withMessage("resourceId es requerido");

// ═══════════════════════════════════════════════
// Endpoints publicos para game frontend (JWT)
// ═══════════════════════════════════════════════
router.get("/public", validateJWT, programController.getAllPrograms);
router.get("/public/:programId", [validateJWT, programIdParam, fieldsValidate], programController.getProgramById);

// ═══════════════════════════════════════════════
// Endpoints admin para Trenno Dashboard (API Key)
// ═══════════════════════════════════════════════

// Programas
router.get("/", validateAPIKey, programController.getAllPrograms);
router.get("/:programId", [validateAPIKey, programIdParam, fieldsValidate], programController.getProgramById);
router.put("/:programId", [validateAPIKey, programIdParam, fieldsValidate], programController.updateProgram);

// Secciones
router.put("/:programId/sections/:sectionId",
    [validateAPIKey, programIdParam, sectionIdParam, fieldsValidate],
    programController.updateSection
);

// Modulos
router.put("/:programId/sections/:sectionId/modules/:moduleId",
    [validateAPIKey, programIdParam, sectionIdParam, moduleIdParam, fieldsValidate],
    programController.updateModule
);

// Lecciones
router.put("/:programId/sections/:sectionId/modules/:moduleId/lessons/:lessonId",
    [validateAPIKey, programIdParam, sectionIdParam, moduleIdParam, lessonIdParam, fieldsValidate],
    programController.updateLesson
);

// Instrucciones
router.put("/:programId/sections/:sectionId/modules/:moduleId/instructions/:instructionId",
    [validateAPIKey, programIdParam, sectionIdParam, moduleIdParam, instructionIdParam, fieldsValidate],
    programController.updateInstruction
);

// Recursos de secciones
router.post("/:programId/sections/:sectionId/resources",
    [validateAPIKey, programIdParam, sectionIdParam, check("title").trim().notEmpty(), check("type").trim().notEmpty(), fieldsValidate],
    programController.addSectionResource
);

router.put("/:programId/sections/:sectionId/resources/:resourceId",
    [validateAPIKey, programIdParam, sectionIdParam, resourceIdParam, fieldsValidate],
    programController.updateSectionResource
);

router.delete("/:programId/sections/:sectionId/resources/:resourceId",
    [validateAPIKey, programIdParam, sectionIdParam, resourceIdParam, fieldsValidate],
    programController.deleteSectionResource
);

// Recursos de instrucciones
router.post("/:programId/sections/:sectionId/modules/:moduleId/instructions/:instructionId/resources",
    [validateAPIKey, programIdParam, sectionIdParam, moduleIdParam, instructionIdParam, check("title").trim().notEmpty(), check("type").trim().notEmpty(), fieldsValidate],
    programController.addInstructionResource
);

router.put("/:programId/sections/:sectionId/modules/:moduleId/instructions/:instructionId/resources/:resourceId",
    [validateAPIKey, programIdParam, sectionIdParam, moduleIdParam, instructionIdParam, resourceIdParam, fieldsValidate],
    programController.updateInstructionResource
);

router.delete("/:programId/sections/:sectionId/modules/:moduleId/instructions/:instructionId/resources/:resourceId",
    [validateAPIKey, programIdParam, sectionIdParam, moduleIdParam, instructionIdParam, resourceIdParam, fieldsValidate],
    programController.deleteInstructionResource
);

module.exports = router;
