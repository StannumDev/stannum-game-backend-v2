'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');

const BACKUPS = [
  { file: 'production.users.json', collection: 'users' },
  { file: 'production.productkeys.json', collection: 'productkeys' },
  { file: 'production.assistants.json', collection: 'assistants' },
  { file: 'production.prompts.json', collection: 'prompts' },
];

async function run() {
  const uri = process.env.DB_URL || process.env.MONGODB_URI;
  if (!uri) { console.error('DB_URL not set'); process.exit(1); }

  const confirmed = process.env.CONFIRM_IMPORT === 'yes' || process.argv.includes('--yes');
  if (!confirmed) {
    console.error('Re-run with --yes to confirm dropping & re-importing collections');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const dbName = db.databaseName;
  console.log(`Connected to db: ${dbName}\n`);

  if (!/test|dev/i.test(dbName)) {
    console.error(`REFUSING: db name "${dbName}" looks like production. Expected test/dev.`);
    process.exit(1);
  }

  const root = path.resolve(__dirname, '..', '..');

  for (const { file, collection } of BACKUPS) {
    const full = path.join(root, file);
    const raw = fs.readFileSync(full, 'utf8');
    const docs = EJSON.parse(raw, { relaxed: false });
    console.log(`[${collection}] parsed ${docs.length} docs from ${file}`);

    await db.collection(collection).drop().catch((err) => {
      if (err.codeName === 'NamespaceNotFound') return;
      throw err;
    });
    console.log(`[${collection}] dropped`);

    if (docs.length > 0) {
      const result = await db.collection(collection).insertMany(docs, { ordered: false });
      console.log(`[${collection}] inserted ${result.insertedCount}`);
    }
    console.log();
  }

  await mongoose.disconnect();
  console.log('Disconnected. Import complete.');
}

run().catch((err) => { console.error('IMPORT FAILED:', err); process.exit(1); });
