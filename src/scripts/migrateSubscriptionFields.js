/**
 * Migration script: Add hasAccessFlag + trenno_ia program fields for subscription support.
 *
 * What it does:
 *  1. Sets `hasAccessFlag = true` on every program subdoc where `isPurchased === true`
 *  2. Initialises empty `subscription` subdoc on all program subdocs that lack one
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   node src/scripts/migrateSubscriptionFields.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const PROGRAMS = ['tmd', 'tia', 'tia_summer', 'trenno_ia'];

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const users = db.collection('users');

  // Step 1: Set hasAccessFlag = true where isPurchased = true
  for (const pid of PROGRAMS) {
    const result = await users.updateMany(
      { [`programs.${pid}.isPurchased`]: true },
      { $set: { [`programs.${pid}.hasAccessFlag`]: true } }
    );
    console.log(`[${pid}] hasAccessFlag set for ${result.modifiedCount} users`);
  }

  // Step 2: Set hasAccessFlag = false where isPurchased is not true and hasAccessFlag doesn't exist
  for (const pid of PROGRAMS) {
    const result = await users.updateMany(
      {
        [`programs.${pid}`]: { $exists: true },
        [`programs.${pid}.hasAccessFlag`]: { $exists: false },
      },
      { $set: { [`programs.${pid}.hasAccessFlag`]: false } }
    );
    console.log(`[${pid}] hasAccessFlag=false set for ${result.modifiedCount} users`);
  }

  // Step 3: Initialise empty subscription subdoc where it doesn't exist
  for (const pid of PROGRAMS) {
    const result = await users.updateMany(
      {
        [`programs.${pid}`]: { $exists: true },
        [`programs.${pid}.subscription`]: { $exists: false },
      },
      {
        $set: {
          [`programs.${pid}.subscription`]: {
            status: null,
            mpSubscriptionId: null,
            priceARS: null,
            currentPeriodEnd: null,
            subscribedAt: null,
            cancelledAt: null,
            lastPaymentAt: null,
            lastWebhookAt: null,
            pendingExpiresAt: null,
            previousSubscriptionIds: [],
          },
        },
      }
    );
    console.log(`[${pid}] subscription subdoc initialised for ${result.modifiedCount} users`);
  }

  const totalUsers = await users.countDocuments();
  console.log(`\nDone. Total users in collection: ${totalUsers}`);

  await mongoose.disconnect();
  console.log('Disconnected.');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
