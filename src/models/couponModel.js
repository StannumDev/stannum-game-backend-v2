const { Schema, model } = require("mongoose");

const couponSchema = new Schema(
  {
    code: {
      type: String,
      required: [true, "El código del cupón es obligatorio"],
      unique: true,
      uppercase: true,
      trim: true,
      minlength: [3, "El código debe tener al menos 3 caracteres"],
      maxlength: [30, "El código no puede superar 30 caracteres"],
    },
    discountType: {
      type: String,
      enum: {
        values: ["percentage", "fixed"],
        message: "Tipo de descuento inválido",
      },
      required: [true, "El tipo de descuento es obligatorio"],
    },
    discountValue: {
      type: Number,
      required: [true, "El valor del descuento es obligatorio"],
      min: [0, "El valor del descuento no puede ser negativo"],
      validate: {
        validator: function (value) {
          return !(this.discountType === "percentage" && value > 100);
        },
        message: "El porcentaje de descuento no puede superar 100",
      },
    },

    applicablePrograms: {
      type: [String],
      default: [],
      validate: {
        validator: function (arr) {
          const valid = ["tmd", "tia", "tia_summer"];
          return arr.every(p => valid.includes(p));
        },
        message: "Programa inválido en applicablePrograms",
      },
    },
    minAmount: {
      type: Number,
      default: 0,
      min: [0, "El monto mínimo no puede ser negativo"],
    },
    maxUses: {
      type: Number,
      default: null,
      min: [1, "El máximo de usos debe ser al menos 1"],
    },
    maxUsesPerUser: {
      type: Number,
      default: 1,
      min: [1, "El máximo de usos por usuario debe ser al menos 1"],
    },
    currentUses: {
      type: Number,
      default: 0,
      min: [0, "Los usos actuales no pueden ser negativos"],
    },

    validFrom: {
      type: Date,
      required: [true, "La fecha de inicio es obligatoria"],
    },
    validUntil: {
      type: Date,
      required: [true, "La fecha de vencimiento es obligatoria"],
      validate: {
        validator: function (value) {
          return value > this.validFrom;
        },
        message: "La fecha de vencimiento debe ser posterior a la de inicio",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

couponSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });

module.exports = model("Coupon", couponSchema);
