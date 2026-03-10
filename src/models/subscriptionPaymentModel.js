const mongoose = require('mongoose');

const subscriptionPaymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  programId: { type: String, required: true },
  mpPaymentId: { type: String, required: true, unique: true },
  mpSubscriptionId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'ARS' },
  status: { type: String, enum: ['approved', 'rejected', 'pending', 'refunded'], required: true },
  retryAttempt: { type: Number, default: 0 },
  receiptNumber: { type: String, default: null },
}, { timestamps: true });

subscriptionPaymentSchema.index({ receiptNumber: 1 }, { unique: true, sparse: true });
subscriptionPaymentSchema.index({ userId: 1, programId: 1, createdAt: -1 });

module.exports = mongoose.model('SubscriptionPayment', subscriptionPaymentSchema);
