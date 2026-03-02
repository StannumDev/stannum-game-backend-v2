/**
 * Creates a Mercado Pago preapproval plan for a subscription program.
 *
 * Usage:
 *   node src/scripts/createMpPlan.js <programId> <priceARS>
 *
 * Example:
 *   node src/scripts/createMpPlan.js trenno_ia 30000
 *
 * Output: The plan ID to save in MP_TRENNO_IA_PLAN_ID env var
 */

require('dotenv').config();
const axios = require('axios');
const programPricing = require('../config/programPricing');

const MP_API = 'https://api.mercadopago.com';

async function main() {
  const [, , programId, priceStr] = process.argv;

  if (!programId || !priceStr) {
    console.error('Usage: node createMpPlan.js <programId> <priceARS>');
    process.exit(1);
  }

  const price = parseInt(priceStr, 10);
  if (isNaN(price) || price <= 0) {
    console.error('Price must be a positive integer');
    process.exit(1);
  }

  const pricing = programPricing[programId];
  if (!pricing) {
    console.error(`Unknown program: ${programId}`);
    process.exit(1);
  }

  if (pricing.type !== 'subscription') {
    console.error(`Program ${programId} is not a subscription program`);
    process.exit(1);
  }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.error('MP_ACCESS_TOKEN not set');
    process.exit(1);
  }

  const frontendUrl = process.env.FRONTEND_URL || 'https://stannumgame.com';

  const planBody = {
    reason: `${pricing.name} — Suscripción mensual`,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: price,
      currency_id: 'ARS',
    },
    back_url: `${frontendUrl}/dashboard/subscriptions`,
  };

  console.log('Creating MP plan with:', JSON.stringify(planBody, null, 2));

  try {
    const { data } = await axios.post(`${MP_API}/preapproval_plan`, planBody, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    console.log('\nPlan created successfully!');
    console.log('Plan ID:', data.id);
    console.log('Status:', data.status);
    console.log('\nAdd to your .env:');
    console.log(`MP_TRENNO_IA_PLAN_ID=${data.id}`);
    console.log('\nFull response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to create plan:', err.response?.data || err.message);
    process.exit(1);
  }
}

main();
