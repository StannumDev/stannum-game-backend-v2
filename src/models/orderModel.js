const { Schema, model } = require("mongoose");

const orderSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "El usuario es obligatorio"],
    },
    programId: {
      type: String,
      enum: {
        values: ["tmd", "tia", "tia_summer"],
        message: "Programa inválido",
      },
      required: [true, "El programa es obligatorio"],
    },

    type: {
      type: String,
      enum: {
        values: ["self", "gift"],
        message: "Tipo de compra inválido",
      },
      required: [true, "El tipo de compra es obligatorio"],
    },
    giftDelivery: {
      type: String,
      enum: {
        values: ["email", "manual"],
        message: "Método de entrega inválido",
      },
      default: null,
    },
    giftEmail: {
      type: String,
      trim: true,
      match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, "Debe ser un correo válido"],
      default: null,
    },
    keysQuantity: {
      type: Number,
      default: 1,
      min: [1, "La cantidad mínima es 1"],
      max: [10, "La cantidad máxima es 10"],
      validate: {
        validator: Number.isInteger,
        message: "La cantidad debe ser un número entero",
      },
    },

    couponId: {
      type: Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
    discountApplied: {
      type: Number,
      default: 0,
      min: [0, "El descuento no puede ser negativo"],
    },
    originalAmount: {
      type: Number,
      required: [true, "El monto original es obligatorio"],
      min: [0, "El monto no puede ser negativo"],
    },
    finalAmount: {
      type: Number,
      required: [true, "El monto final es obligatorio"],
      min: [0, "El monto no puede ser negativo"],
    },
    currency: {
      type: String,
      default: "ARS",
    },

    mpPreferenceId: {
      type: String,
      default: null,
    },
    mpInitPoint: {
      type: String,
      default: null,
    },
    mpPaymentId: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: {
        values: ["pending", "approved", "rejected", "refunded", "chargedback", "cancelled", "expired"],
        message: "Estado inválido",
      },
      default: "pending",
    },

    productKeys: [{
      type: Schema.Types.ObjectId,
      ref: "ProductKey",
    }],
    fulfilledAt: {
      type: Date,
      default: null,
    },
    giftEmailSent: {
      type: Boolean,
      default: false,
    },

    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.index({ userId: 1, programId: 1 }, {
  unique: true,
  partialFilterExpression: { status: "pending" },
});

orderSchema.index({ mpPaymentId: 1 }, { sparse: true });
orderSchema.index({ status: 1, expiresAt: 1 });
orderSchema.index({ userId: 1, createdAt: -1 });

orderSchema.methods.getOrderDetails = function () {
  return {
    id: this._id,
    programId: this.programId,
    type: this.type,
    giftDelivery: this.giftDelivery,
    giftEmail: this.giftEmail,
    keysQuantity: this.keysQuantity,
    discountApplied: this.discountApplied,
    originalAmount: this.originalAmount,
    finalAmount: this.finalAmount,
    currency: this.currency,
    status: this.status,
    productKeys: (this.productKeys || []).map((pk) =>
      pk && pk.code ? { code: pk.code, used: pk.used } : pk
    ),
    fulfilledAt: this.fulfilledAt,
    giftEmailSent: this.giftEmailSent,
    createdAt: this.createdAt,
  };
};

module.exports = model("Order", orderSchema);
