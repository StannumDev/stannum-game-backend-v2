const { validationResult } = require("express-validator");
const { getError } = require("../helpers/getError");

const fieldsValidate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.path,
      message: err.msg,
    }));

    const baseError = getError("VALIDATION_GENERIC_ERROR");
    console.log(formattedErrors)
    return res.status(400).json({ ...baseError, errors: formattedErrors });
  }

  next();
};

module.exports = { fieldsValidate };