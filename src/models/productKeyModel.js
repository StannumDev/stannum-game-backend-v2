const { Schema, model } = require("mongoose");

const productKeySchema = new Schema(
  {
    code: {
      type: String,
      required: [true, "El código del producto es obligatorio"],
      unique: true,
      match: [/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/, "Formato inválido (XXXX-XXXX-XXXX-XXXX)"],
    },
    email: {
      type: String,
      required: [true, "El correo electrónico del comprador es obligatorio"],
      match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, "Debe ser un correo válido"],
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      validate: {
        validator: function (value) {
          return value <= Date.now();
        },
        message: "La fecha no puede ser futura",
      },
    },
    used: {
      type: Boolean,
      default: false,
    },
    usedAt: {
      type: Date,
      default: null,
      validate: {
        validator: function (value) {
          return !value || value <= Date.now();
        },
        message: "La fecha de uso no puede ser futura",
      },
    },
    usedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    product: {
      type: String,
      enum: {
        values: ["tmd", "tia"],
        message: "Producto inválido",
      },
      required: [true, "Producto requerido"],
    },
    team: {
      type: String,
      required: [true, "El nombre del equipo es obligatorio"],
      trim: true,
      maxlength: [50, "El nombre del equipo no puede superar 50 caracteres"],
    },
  },
  {
    timestamps: true,
  }
);

productKeySchema.methods.getInfo = function () {
  return {
    code: this.code,
    product: this.product,
    team: this.team,
    used: this.used,
    usedAt: this.usedAt,
    email: this.email,
  };
};

module.exports = model("ProductKey", productKeySchema);