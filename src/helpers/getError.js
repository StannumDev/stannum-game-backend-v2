const errors = require('../config/errors.json');

const getError = (code, overrides = {}) => {
    const error = errors[code];

    if (!error) {
        console.error(`getError: unknown error code "${code}" — add it to src/config/errors.json`);
        return {
            success: false,
            code: "UNKNOWN_ERROR",
            type: "error",
            showAlert: true,
            title: "Error desconocido",
            techMessage: "An unknown error occurred.",
            friendlyMessage: "Ocurrió un error inesperado. Por favor, contacta al soporte técnico.",
            ...overrides
        };
    }
    return { ...error, ...overrides };
};

module.exports = { getError };