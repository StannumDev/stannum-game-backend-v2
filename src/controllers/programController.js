const { Program } = require("../models/programModel");
const { getError } = require("../helpers/getError");
const { invalidateCache } = require("../services/programCacheService");

// ── GET / ── Lista de programas (summary para admin dashboard)
const getAllPrograms = async (req, res) => {
    try {
        const programs = await Program.find().lean();
        const summaries = programs.map((p) => ({
            id: p.id,
            name: p.name,
            categories: p.categories,
            sectionCount: p.sections?.length || 0,
            moduleCount: (p.sections || []).reduce((acc, s) => acc + (s.modules?.length || 0), 0),
            lessonCount: (p.sections || []).reduce((acc, s) => acc + (s.modules || []).reduce((a2, m) => a2 + (m.lessons?.length || 0), 0), 0),
        }));
        return res.status(200).json({ success: true, data: summaries });
    } catch (error) {
        console.error("Error obteniendo programas:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── GET /public ── Lista de programas completa (para game frontend)
const getAllProgramsPublic = async (req, res) => {
    try {
        const programs = await Program.find().lean();
        return res.status(200).json({ success: true, data: programs });
    } catch (error) {
        console.error("Error obteniendo programas públicos:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── GET /:programId ── Programa completo
const getProgramById = async (req, res) => {
    try {
        const program = await Program.findOne({ id: req.params.programId }).lean();
        if (!program) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));
        return res.status(200).json({ success: true, data: program });
    } catch (error) {
        console.error("Error obteniendo programa:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── PUT /:programId ── Editar metadata del programa
const updateProgram = async (req, res) => {
    try {
        const { programId } = req.params;
        const allowedFields = ["name", "price", "href", "categories", "description", "type", "priceARS", "subscriptionPriceARS", "purchasable", "hidden", "longDescription", "learningPoints", "logoUrl", "backgroundUrl"];
        const updates = {};
        for (const key of allowedFields) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }

        const result = await Program.findOneAndUpdate({ id: programId }, { $set: updates }, { new: true, runValidators: true });
        if (!result) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        invalidateCache();
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("Error actualizando programa:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── PUT /:programId/sections/:sectionId ── Editar seccion
const updateSection = async (req, res) => {
    try {
        const { programId, sectionId } = req.params;

        const exists = await Program.findOne({ id: programId, "sections.id": sectionId });
        if (!exists) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        const updates = {};
        if (req.body.name !== undefined) updates["sections.$[s].name"] = req.body.name;
        if (req.body.order !== undefined) updates["sections.$[s].order"] = req.body.order;

        const result = await Program.findOneAndUpdate(
            { id: programId },
            { $set: updates },
            { arrayFilters: [{ "s.id": sectionId }], new: true, runValidators: true }
        );
        if (!result) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        invalidateCache();
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("Error actualizando sección:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── PUT /:programId/sections/:sectionId/modules/:moduleId ── Editar modulo
const updateModule = async (req, res) => {
    try {
        const { programId, sectionId, moduleId } = req.params;

        const exists = await Program.findOne({ id: programId, sections: { $elemMatch: { id: sectionId, "modules.id": moduleId } } });
        if (!exists) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        const allowedFields = ["name", "description", "order"];
        const updates = {};
        for (const key of allowedFields) {
            if (req.body[key] !== undefined) updates[`sections.$[s].modules.$[m].${key}`] = req.body[key];
        }

        const result = await Program.findOneAndUpdate(
            { id: programId },
            { $set: updates },
            { arrayFilters: [{ "s.id": sectionId }, { "m.id": moduleId }], new: true, runValidators: true }
        );
        if (!result) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        invalidateCache();
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("Error actualizando módulo:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── PUT /.../lessons/:lessonId ── Editar leccion
const updateLesson = async (req, res) => {
    try {
        const { programId, sectionId, moduleId, lessonId } = req.params;

        const exists = await Program.findOne({ id: programId, sections: { $elemMatch: { id: sectionId, modules: { $elemMatch: { id: moduleId, "lessons.id": lessonId } } } } });
        if (!exists) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        const allowedFields = ["title", "longTitle", "description", "durationSec", "muxPlaybackId", "blocked", "order"];
        const updates = {};
        for (const key of allowedFields) {
            if (req.body[key] !== undefined) updates[`sections.$[s].modules.$[m].lessons.$[l].${key}`] = req.body[key];
        }

        const result = await Program.findOneAndUpdate(
            { id: programId },
            { $set: updates },
            { arrayFilters: [{ "s.id": sectionId }, { "m.id": moduleId }, { "l.id": lessonId }], new: true, runValidators: true }
        );
        if (!result) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        invalidateCache();
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("Error actualizando lección:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── PUT /.../instructions/:instructionId ── Editar instruccion
const updateInstruction = async (req, res) => {
    try {
        const { programId, sectionId, moduleId, instructionId } = req.params;

        const exists = await Program.findOne({ id: programId, sections: { $elemMatch: { id: sectionId, modules: { $elemMatch: { id: moduleId, "instructions.id": instructionId } } } } });
        if (!exists) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        const allowedFields = ["title", "shortDescription", "description", "difficulty", "rewardXP", "estimatedTimeSec", "acceptedFormats", "maxFileSizeMB", "deliverableHint", "order"];
        const updates = {};
        for (const key of allowedFields) {
            if (req.body[key] !== undefined) updates[`sections.$[s].modules.$[m].instructions.$[i].${key}`] = req.body[key];
        }

        const result = await Program.findOneAndUpdate(
            { id: programId },
            { $set: updates },
            { arrayFilters: [{ "s.id": sectionId }, { "m.id": moduleId }, { "i.id": instructionId }], new: true, runValidators: true }
        );
        if (!result) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        invalidateCache();
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("Error actualizando instrucción:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── POST /:programId/sections/:sectionId/resources ── Agregar recurso a seccion
const addSectionResource = async (req, res) => {
    try {
        const { programId, sectionId } = req.params;
        const { id, title, description, link, type, order, parentId } = req.body;

        if (!id || !title || !type) return res.status(400).json(getError("VALIDATION_MISSING_FIELDS"));

        const resource = { id, title, description: description || "", link: link || "", type, order: order || 0, parentId: parentId || null };

        const result = await Program.findOneAndUpdate(
            { id: programId, "sections.id": sectionId },
            { $push: { "sections.$.resources": resource } },
            { new: true, runValidators: true }
        );
        if (!result) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        invalidateCache();
        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        console.error("Error agregando recurso:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── PUT /:programId/sections/:sectionId/resources/:resourceId ── Editar recurso
const updateSectionResource = async (req, res) => {
    try {
        const { programId, sectionId, resourceId } = req.params;

        const exists = await Program.findOne({ id: programId, sections: { $elemMatch: { id: sectionId, "resources.id": resourceId } } });
        if (!exists) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        const allowedFields = ["title", "description", "link", "type", "order", "parentId"];
        const updates = {};
        for (const key of allowedFields) {
            if (req.body[key] !== undefined) updates[`sections.$[s].resources.$[r].${key}`] = req.body[key];
        }

        const result = await Program.findOneAndUpdate(
            { id: programId },
            { $set: updates },
            { arrayFilters: [{ "s.id": sectionId }, { "r.id": resourceId }], new: true, runValidators: true }
        );
        if (!result) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        invalidateCache();
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("Error actualizando recurso:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── DELETE /:programId/sections/:sectionId/resources/:resourceId ── Eliminar recurso
const deleteSectionResource = async (req, res) => {
    try {
        const { programId, sectionId, resourceId } = req.params;

        const exists = await Program.findOne({ id: programId, sections: { $elemMatch: { id: sectionId, "resources.id": resourceId } } });
        if (!exists) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        const result = await Program.findOneAndUpdate(
            { id: programId },
            { $pull: { "sections.$[s].resources": { id: resourceId } } },
            { arrayFilters: [{ "s.id": sectionId }], new: true }
        );
        if (!result) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        invalidateCache();
        return res.status(200).json({ success: true, message: "Recurso eliminado." });
    } catch (error) {
        console.error("Error eliminando recurso:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

// ── Recursos de instrucciones ──
const addInstructionResource = async (req, res) => {
    try {
        const { programId, sectionId, moduleId, instructionId } = req.params;
        const { id, title, description, link, type, order, parentId } = req.body;

        if (!id || !title || !type) return res.status(400).json(getError("VALIDATION_MISSING_FIELDS"));

        const resource = { id, title, description: description || "", link: link || "", type, order: order || 0, parentId: parentId || null };

        const result = await Program.findOneAndUpdate(
            { id: programId },
            { $push: { "sections.$[s].modules.$[m].instructions.$[i].resources": resource } },
            { arrayFilters: [{ "s.id": sectionId }, { "m.id": moduleId }, { "i.id": instructionId }], new: true, runValidators: true }
        );
        if (!result) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        invalidateCache();
        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        console.error("Error agregando recurso a instrucción:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const updateInstructionResource = async (req, res) => {
    try {
        const { programId, sectionId, moduleId, instructionId, resourceId } = req.params;

        const exists = await Program.findOne({ id: programId, sections: { $elemMatch: { id: sectionId, modules: { $elemMatch: { id: moduleId, instructions: { $elemMatch: { id: instructionId, "resources.id": resourceId } } } } } } });
        if (!exists) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        const allowedFields = ["title", "description", "link", "type", "order", "parentId"];
        const updates = {};
        for (const key of allowedFields) {
            if (req.body[key] !== undefined) updates[`sections.$[s].modules.$[m].instructions.$[i].resources.$[r].${key}`] = req.body[key];
        }

        const result = await Program.findOneAndUpdate(
            { id: programId },
            { $set: updates },
            { arrayFilters: [{ "s.id": sectionId }, { "m.id": moduleId }, { "i.id": instructionId }, { "r.id": resourceId }], new: true, runValidators: true }
        );
        if (!result) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        invalidateCache();
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("Error actualizando recurso de instrucción:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const deleteInstructionResource = async (req, res) => {
    try {
        const { programId, sectionId, moduleId, instructionId, resourceId } = req.params;

        const exists = await Program.findOne({ id: programId, sections: { $elemMatch: { id: sectionId, modules: { $elemMatch: { id: moduleId, instructions: { $elemMatch: { id: instructionId, "resources.id": resourceId } } } } } } });
        if (!exists) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        const result = await Program.findOneAndUpdate(
            { id: programId },
            { $pull: { "sections.$[s].modules.$[m].instructions.$[i].resources": { id: resourceId } } },
            { arrayFilters: [{ "s.id": sectionId }, { "m.id": moduleId }, { "i.id": instructionId }], new: true }
        );
        if (!result) return res.status(404).json(getError("PROGRAM_NOT_FOUND"));

        invalidateCache();
        return res.status(200).json({ success: true, message: "Recurso de instrucción eliminado." });
    } catch (error) {
        console.error("Error eliminando recurso de instrucción:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

module.exports = {
    getAllPrograms,
    getAllProgramsPublic,
    getProgramById,
    updateProgram,
    updateSection,
    updateModule,
    updateLesson,
    updateInstruction,
    addSectionResource,
    updateSectionResource,
    deleteSectionResource,
    addInstructionResource,
    updateInstructionResource,
    deleteInstructionResource,
};
