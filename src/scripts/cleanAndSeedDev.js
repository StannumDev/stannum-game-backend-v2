/**
 * ============================================================================
 * CLEAN & SEED — DEVELOPMENT DB
 * ============================================================================
 *
 * Drops all data from the development database, re-seeds the Program
 * collection, and creates one product key per purchasable program for testing.
 *
 * Usage:
 *   node --env-file=.env src/scripts/cleanAndSeedDev.js
 *
 * Safety:
 *   - Refuses to run unless DB_URL points to a database named "test".
 *   - Requires CONFIRM_CLEAN=yes in the env or as a CLI flag (--yes).
 */

const mongoose = require('mongoose');
const { seed: seedPrograms } = require('../migrations/seedPrograms');
const ProductKey = require('../models/productKeyModel');

const COLLECTIONS_TO_DROP = [
    'users',
    'programs',
    'productkeys',
    'orders',
    'subscriptionpayments',
    'subscriptionauditlogs',
    'coupons',
    'canceltokens',
    'failedemails',
    'assistants',
    'prompts',
];

const PRODUCT_KEYS = [
    { product: 'tia', code: 'TEST-TIAA-0000-0001', team: 'Dev Test TIA' },
    { product: 'tia_summer', code: 'TEST-TIAS-0000-0001', team: 'Dev Test TIA Summer' },
    { product: 'tia_pool', code: 'TEST-TIAP-0000-0001', team: 'Dev Test TIA Pool' },
    { product: 'tmd', code: 'TEST-TMDD-0000-0001', team: 'Dev Test TMD' },
];

const TEST_EMAIL = 'stannumgame@stannum.com.ar';

async function run() {
    const uri = process.env.DB_URL;
    if (!uri) {
        console.error('ERROR: DB_URL not set');
        process.exit(1);
    }

    const dbNameMatch = uri.match(/\/([^/?]+)(\?|$)/);
    const dbName = dbNameMatch ? dbNameMatch[1] : null;
    if (dbName !== 'test') {
        console.error(`ERROR: This script is only allowed against the "test" database. Current: "${dbName}"`);
        process.exit(1);
    }

    const confirmed = process.env.CONFIRM_CLEAN === 'yes' || process.argv.includes('--yes');
    if (!confirmed) {
        console.error('ERROR: Destructive script. Re-run with --yes or CONFIRM_CLEAN=yes.');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log(`Connected to MongoDB (db: ${dbName})\n`);
    const db = mongoose.connection.db;

    // ========================================================================
    // STEP 1: Drop collections
    // ========================================================================
    console.log('=== STEP 1: Drop collections ===');

    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    for (const name of COLLECTIONS_TO_DROP) {
        if (existing.includes(name)) {
            await db.collection(name).drop();
            console.log(`  dropped: ${name}`);
        } else {
            console.log(`  skipped (not found): ${name}`);
        }
    }

    // ========================================================================
    // STEP 2: Seed programs (reuses the existing seedPrograms.js logic)
    // ========================================================================
    console.log('\n=== STEP 2: Seed programs ===');
    await seedPrograms({ reuseConnection: true });

    // ========================================================================
    // STEP 3: Create one product key per purchasable program
    // ========================================================================
    console.log('\n=== STEP 3: Create product keys ===');
    for (const key of PRODUCT_KEYS) {
        await ProductKey.create({
            code: key.code,
            email: TEST_EMAIL,
            product: key.product,
            team: key.team,
        });
        console.log(`  created: [${key.product}] ${key.code}`);
    }

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('\n============================================');
    console.log('CLEAN & SEED COMPLETE');
    console.log('============================================');
    console.log('\nProduct keys ready to use:');
    for (const key of PRODUCT_KEYS) {
        console.log(`  [${key.product.padEnd(10)}] ${key.code}  (email: ${TEST_EMAIL})`);
    }
    console.log('\nNext: register a fresh user from the frontend and redeem a key.');
    console.log('============================================\n');

    await mongoose.disconnect();
}

run().catch((err) => {
    console.error('\nCLEAN & SEED FAILED:', err);
    process.exit(1);
});
