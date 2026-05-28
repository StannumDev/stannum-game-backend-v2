const crypto = require("crypto");

const User = require("../models/userModel");
const { invalidateUser } = require("../cache/cacheService");
const { sendMagicLinkActivationEmail } = require("../services/subscriptionEmailService");
const { hasAccess } = require("../utils/accessControl");
const { VALID_PROGRAMS } = require("../config/programRegistry");

// Default 72h: el lote de onboarding presencial suele tardar más de 24h en activar.
// Override con la env var MAGIC_LINK_TTL_HOURS si se necesita más/menos margen.
const MAGIC_LINK_TTL_HOURS = parseInt(process.env.MAGIC_LINK_TTL_HOURS, 10) || 72;

const generateMagicLinkRawToken = () => crypto.randomBytes(32).toString("hex");
const hashMagicLinkToken = (rawToken) => crypto.createHash("sha256").update(rawToken).digest("hex");

/**
 * Regenera el magic link de activación de un usuario stub (needs_activation) y le
 * reenvía el mail de activación. Idempotente: pisa cualquier link previo (vencido o no).
 *
 * El caller es responsable de verificar que el usuario está en estado needs_activation.
 *
 * @param {Object} user - documento de usuario (debe tener _id, email, profile.name, programs)
 * @returns {Promise<boolean>} true si se envió el mail
 */
const regenerateAndSendActivation = async (user) => {
  const rawToken = generateMagicLinkRawToken();
  const hashedToken = hashMagicLinkToken(rawToken);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_HOURS * 60 * 60 * 1000);

  await User.updateOne(
    { _id: user._id },
    { $set: { "magicLink.token": hashedToken, "magicLink.expiresAt": expiresAt } }
  );
  invalidateUser(user._id);

  // Elegir el programa con acceso para el contenido del mail (fallback al primero válido).
  const programId =
    VALID_PROGRAMS.find((p) => user.programs?.[p] && hasAccess(user.programs[p])) ||
    VALID_PROGRAMS[0];

  sendMagicLinkActivationEmail({
    to: user.email,
    fullName: user.profile?.name || user.email.split("@")[0],
    activationUrl: `${process.env.FRONTEND_URL}/activate/${rawToken}`,
    programId,
    diagnosis: null,
    guideLink: null,
    whatsappLink: null,
  });

  return true;
};

module.exports = {
  MAGIC_LINK_TTL_HOURS,
  generateMagicLinkRawToken,
  hashMagicLinkToken,
  regenerateAndSendActivation,
};
