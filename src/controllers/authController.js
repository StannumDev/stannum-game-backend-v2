const bcryptjs = require("bcryptjs");
const axios = require("axios");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const User = require("../models/userModel");
const { newJWT } = require("../helpers/newJWT");
const { getError } = require("../helpers/getError");
const { generateUsername } = require("../helpers/generateUsername");
const { isOffensive } = require('../helpers/profanityChecker');
const { uploadGoogleProfilePhoto } = require("./profilePhotoController");
const { unlockAchievements } = require("../services/achievementsService");
const { getProfileStatus } = require("../helpers/getProfileStatus");
const { newRefreshToken, hashRefreshToken } = require("../helpers/newRefreshToken");
const { setAuthCookies, clearAuthCookies } = require("../helpers/authCookies");
const { invalidateUser } = require("../cache/cacheService");
const { regenerateAndSendActivation, hashMagicLinkToken } = require("../helpers/magicLink");

const login = async (req , res) => {
  const { username, password } = req.body;
  try {
    if (!username) return res.status(400).json(getError("VALIDATION_USERNAME_REQUIRED"));

    if (!password) return res.status(400).json(getError("VALIDATION_PASSWORD_REQUIRED"));

    const user = await User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: username.toLowerCase() },
      ],
    });

    if (!user) return res.status(401).json(getError("AUTH_INVALID_CREDENTIALS"));
    if (!user.password || !(await bcryptjs.compare(password, user.password))) return res.status(401).json(getError("AUTH_INVALID_CREDENTIALS"));
    if (!user.status) return res.status(401).json(getError("AUTH_INVALID_CREDENTIALS"));
    if (!user.preferences?.allowPasswordLogin) return res.status(403).json(getError("AUTH_PASSWORD_LOGIN_DISABLED"));

    // Cuenta stub (creada por enrollment, nunca activada): aunque tenga password —p.ej. seteada
    // vía recuperación de contraseña— no debe poder entrar y rebotar en el front. Avisamos claro.
    if (getProfileStatus(user) === "needs_activation") return res.status(403).json(getError("AUTH_ACCOUNT_NOT_ACTIVATED"));

    const accessToken = await newJWT(user.id, user.role);
    if (!accessToken) return res.status(500).json(getError("JWT_GENERATION_FAILED"));

    const { token: refreshTokenRaw, hashedToken, expiresAt } = newRefreshToken();
    user.refreshToken = { token: hashedToken, expiresAt };
    user.lastLogin = new Date();
    await user.save();
    invalidateUser(user.id);

    let newlyUnlocked = [];
    try {
      ({ newlyUnlocked } = await unlockAchievements(user, true));
    } catch (err) {
      console.error("Achievement unlock failed during login:", err);
    }

    setAuthCookies(res, accessToken, refreshTokenRaw);
    return res.status(200).json({ success: true, achievementsUnlocked: newlyUnlocked });
  } catch (error) {
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const checkEmailExists = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json(getError("VALIDATION_EMAIL_REQUIRED"));

  if (email.length > 254) return res.status(400).json(getError("VALIDATION_EMAIL_TOO_LONG"));

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.status(400).json(getError("VALIDATION_EMAIL_INVALID"));

  try {
    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) return res.status(409).json(getError("AUTH_EMAIL_ALREADY_EXISTS"));

    return res.status(200).json({ success: true, message: "Email is available." });
  } catch (error) {
    console.error(error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const validateUsername = async (req, res) => {
  const { username } = req.body;

  if (!username) return res.status(400).json(getError("VALIDATION_USERNAME_REQUIRED"));

  const usernameRegex = /^[a-zA-Z0-9._]+$/;
  if (!usernameRegex.test(username)) return res.status(400).json(getError("VALIDATION_USERNAME_INVALID"));
  if (username.length < 6 || username.length > 25) return res.status(400).json(getError("VALIDATION_USERNAME_LENGTH"));

  if (isOffensive(username)) return res.status(400).json(getError("VALIDATION_USERNAME_OFFENSIVE"));

  try {
    const userExists = await User.findOne({ username: username.toLowerCase().trim() });
    if (userExists) return res.status(409).json(getError("AUTH_USERNAME_ALREADY_EXISTS"));
    return res.status(200).json({ success: true, message: "Username is available." });
  } catch (error) {
    console.error(error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const verifyReCAPTCHA = async (req, res) => {
  const { token } = req.body;

  if (!token) return res.status(400).json(getError("VALIDATION_RECAPTCHA_REQUIRED"));
  try {
    const googleVerifyUrl = "https://www.google.com/recaptcha/api/siteverify";
    const response = await axios.post(googleVerifyUrl, null, {
      params: {
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: token,
      },
    });

    if (!response.data.success) {
      const recaptchaErrorCode = response.data["error-codes"]?.[0] || "unknown-error";
      const errorCodesMapping = {
        "invalid-input-response": "VALIDATION_RECAPTCHA_INVALID",
        "missing-input-response": "VALIDATION_RECAPTCHA_REQUIRED",
        "timeout-or-duplicate": "VALIDATION_RECAPTCHA_TIMEOUT",
      };
      const customErrorCode = errorCodesMapping[recaptchaErrorCode] || "VALIDATION_RECAPTCHA_UNKNOWN";
      return res.status(400).json(getError(customErrorCode));
    }

    return res.status(200).json({ success: true, message: "ReCAPTCHA validated successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const createUser = async (req , res) => {
  const { email, username, password, name, birthdate, country, region, enterprise, enterpriseRole, aboutme } = req.body;

  try {
    if (!email) return res.status(400).json(getError("VALIDATION_EMAIL_REQUIRED"));
    if (!username) return res.status(400).json(getError("VALIDATION_USERNAME_REQUIRED"));
    if (!password) return res.status(400).json(getError("VALIDATION_PASSWORD_REQUIRED"));

    const [existingEmail, existingUsername] = await Promise.all([
      User.findOne({ email: email.toLowerCase().trim() }),
      User.findOne({ username: username.toLowerCase().trim() }),
    ]);

    if (existingEmail) return res.status(409).json(getError("AUTH_EMAIL_ALREADY_EXISTS"));
    if (existingUsername) return res.status(409).json(getError("AUTH_USERNAME_ALREADY_EXISTS"));

    const birthDateObject = new Date(birthdate);
    if (isNaN(birthDateObject.getTime())) return res.status(400).json(getError("VALIDATION_BIRTHDATE_INVALID"));
    const now = new Date();
    let age = now.getFullYear() - birthDateObject.getFullYear();
    if (now.getMonth() < birthDateObject.getMonth() || (now.getMonth() === birthDateObject.getMonth() && now.getDate() < birthDateObject.getDate())) age--;
    if (age < 18) return res.status(400).json(getError("VALIDATION_BIRTHDATE_INVALID"));

    const hashedPassword = await bcryptjs.hash(password, 10);

    const { token: refreshTokenRaw, hashedToken, expiresAt } = newRefreshToken();

    const newUser = new User({
      email: email.toLowerCase().trim(),
      username: username.toLowerCase().trim(),
      password: hashedPassword,
      profile: {
        name: name?.trim() || '',
        country: country.trim(),
        region: region.trim(),
        birthdate: birthDateObject,
        aboutMe: aboutme.trim(),
      },
      enterprise: {
        name: enterprise.trim(),
        jobPosition: enterpriseRole.trim(),
      },
      refreshToken: { token: hashedToken, expiresAt },
    });

    await newUser.save();

    const accessToken = await newJWT(newUser.id, newUser.role);
    if (!accessToken) return res.status(500).json(getError("JWT_GENERATION_FAILED"));

    setAuthCookies(res, accessToken, refreshTokenRaw);
    return res.status(201).json({ success: true, message: "User created successfully" });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      if (field === 'email') return res.status(409).json(getError("AUTH_EMAIL_ALREADY_EXISTS"));
      if (field === 'username') return res.status(409).json(getError("AUTH_USERNAME_ALREADY_EXISTS"));
      return res.status(409).json(getError("AUTH_EMAIL_ALREADY_EXISTS"));
    }
    console.error(error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const sendPasswordRecoveryEmail = async (req , res) => {
  const { username } = req.body;
  try {
    if (!username) return res.status(400).json(getError("VALIDATION_USERNAME_REQUIRED"));

    const user = await User.findOne({
      $or: [
        { username: username.toLowerCase().trim() },
        { email: username.toLowerCase().trim() },
      ],
    });

    if (!user) return res.status(200).json({ success: true, message: "Si el usuario existe, recibirá un correo." });

    // Cuenta stub (nunca activada): la recuperación de contraseña la dejaría con password +
    // allowPasswordLogin pero seguiría sin activar (rebote en login). En vez de eso, le
    // reenviamos el mail de activación, que es lo que realmente necesita. Respuesta genérica
    // idéntica para no filtrar el estado de la cuenta.
    if (getProfileStatus(user) === "needs_activation") {
      try {
        await regenerateAndSendActivation(user);
      } catch (err) {
        console.error("Error reenviando activación desde recuperación de contraseña:", err);
      }
      return res.status(200).json({ success: true, message: "Si el usuario existe, recibirá un correo." });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = crypto.createHmac("sha256", process.env.SECRET).update(otp).digest("hex");
    user.otp = {
      recoveryOtp: hashedOtp,
      otpExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
    await user.save();

    let transporter;
    try {
      transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.SMTP_EMAIL,
          pass: process.env.SMTP_PASSWORD,
        },
      });
    } catch (error) {
      console.error("Error configurando el transporte de nodemailer:", error);
      return res.status(500).json(getError("NETWORK_CONNECTION_ERROR"));
    }

    const mailOptions = {
      from: `"STANNUM Game" <${process.env.SMTP_EMAIL}>`,
      to: user.email,
      subject: "Restablecer contraseña - STANNUM Game",
      html: `
        <div style="background-color: #1f1f1f; color: #fff; font-family: Arial, sans-serif; padding: 20px; border-radius: 10px; max-width: 600px; margin: auto; text-align: center;">
          <img src="https://drive.google.com/uc?export=view&id=1nAyByJSrn774hiOe5s594il7mUwMYgWy" alt="STANNUM Logo" style="max-width: 150px; margin-top: 20px;" />
          <h1 style="color: #00FFCC; font-size: 28px;">Recupera tu contraseña en <b style="color:#ffffff; font-weight: 600; display: block;">STANNUM Game</b></h1>
          <p style="font-size: 16px; color: #ccc; line-height: 1.6;">
          </p>
          Hola <span style="color: #00FFCC;">${user.username}</span>, hemos recibido una solicitud para recuperar tu contraseña.
          <p style="font-size: 16px; color: #fff; line-height: 1.6; margin: 20px 0;">
            Aquí tienes tu código de verificación:
          </p>
          <div style="background-color: #333333; padding: 15px; border-radius: 8px; display: inline-block; margin: 8px 0;">
            <h2 style="color: #ffffff; font-size: 32px; letter-spacing: 2px; margin: 0;">${otp}</h2>
          </div>
          <p style="font-size: 16px; color: #ccc; line-height: 1.6;">
            Este código es válido solo por 30 minutos</b>.
          </p>
          <hr style="border: none; border-top: 1px solid #515151; margin: 20px 0;" />
          <p style="font-size: 14px; color: #aaa; line-height: 1.6;">
            Si no solicitaste este cambio, puedes ignorar este correo. Tu cuenta permanecerá segura.
          </p>
          <p style="font-size: 14px; color: #aaa; line-height: 1.6; margin-top: 20px;">
            Saludos,<br />
            <span style="color: #66eae5;">Equipo STANNUM</span>
          </p>
          <footer style="margin-top: 30px; font-size: 12px; color: #515151;">
            &copy; ${new Date().getFullYear()} STANNUM Game. Todos los derechos reservados.
          </footer>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error("Error enviando el correo:", error);
      return res.status(500).json(getError("NETWORK_CONNECTION_ERROR"));
    }

    return res.status(200).json({ success: true, message: "OTP enviado al correo." });
  } catch (error) {
    console.error("Error en el proceso de recuperación de contraseña:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const verifyRecoveryOtp = async (req, res) => {
  const { username, otp } = req.body;
  try {
    if (!username) return res.status(400).json(getError("VALIDATION_USERNAME_REQUIRED"));
    if (!otp) return res.status(400).json(getError("VALIDATION_OTP_REQUIRED"));

    const user = await User.findOne({
      $or: [
        { username: username.toLowerCase().trim() },
        { email: username.toLowerCase().trim() },
      ],
    });

    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));
    if (getProfileStatus(user) === "needs_activation") return res.status(403).json(getError("AUTH_ACCOUNT_NOT_ACTIVATED"));
    if (!user.otp || !user.otp.recoveryOtp) return res.status(400).json(getError("AUTH_OTP_MISSING"));
    if (user.otp.otpExpiresAt < new Date()) return res.status(400).json(getError("AUTH_OTP_EXPIRED"));
    const hashedOtp = crypto.createHmac("sha256", process.env.SECRET).update(otp).digest("hex");
    const otpBuffer = Buffer.from(user.otp.recoveryOtp, 'hex');
    const hashedBuffer = Buffer.from(hashedOtp, 'hex');
    if (otpBuffer.length !== hashedBuffer.length || !crypto.timingSafeEqual(otpBuffer, hashedBuffer)) {
      user.otp.attempts = (user.otp.attempts || 0) + 1;
      if (user.otp.attempts >= 5) {
        user.otp = { recoveryOtp: null, otpExpiresAt: null, recoveryVerified: false, attempts: 0 };
      }
      await user.save();
      return res.status(400).json(getError(user.otp.attempts >= 5 ? "AUTH_OTP_MAX_ATTEMPTS" : "AUTH_INVALID_OTP"));
    }

    user.otp.recoveryOtp = null;
    user.otp.recoveryVerified = true;
    user.otp.attempts = 0;
    await user.save();

    return res.status(200).json({ success: true, message: "OTP validado con éxito." });
  } catch (error) {
    console.error("Error al verificar el OTP:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const resetPassword = async (req, res) => {
  const { username, otp, password } = req.body;
  try {
    if (!username) return res.status(400).json(getError("VALIDATION_USERNAME_REQUIRED"));
    if (!otp) return res.status(400).json(getError("VALIDATION_OTP_REQUIRED"));
    if (!password) return res.status(400).json(getError("VALIDATION_PASSWORD_REQUIRED"));

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,50}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json(getError("VALIDATION_PASSWORD_INVALID"));
    }

    // Pre-check: si es stub, abortar ANTES de consumir el OTP (para que no lo pierda).
    const preCheck = await User.findOne(
      {
        $or: [
          { username: username.toLowerCase().trim() },
          { email: username.toLowerCase().trim() },
        ],
        'otp.recoveryVerified': true,
        'otp.otpExpiresAt': { $gt: new Date() },
      },
      'username'
    );
    if (!preCheck) return res.status(400).json(getError("AUTH_OTP_MISSING"));
    if (getProfileStatus(preCheck) === "needs_activation") {
      return res.status(403).json(getError("AUTH_ACCOUNT_NOT_ACTIVATED"));
    }

    // Atomic claim: only proceed if recoveryVerified is true and OTP hasn't expired
    const user = await User.findOneAndUpdate(
      {
        $or: [
          { username: username.toLowerCase().trim() },
          { email: username.toLowerCase().trim() },
        ],
        'otp.recoveryVerified': true,
        'otp.otpExpiresAt': { $gt: new Date() },
      },
      {
        $set: {
          'otp.recoveryOtp': null,
          'otp.otpExpiresAt': null,
          'otp.recoveryVerified': false,
          'otp.attempts': 0,
        },
      },
      { new: false }
    );

    if (!user) return res.status(400).json(getError("AUTH_OTP_MISSING"));

    const hashedPassword = await bcryptjs.hash(password, 10);
    user.password = hashedPassword;
    user.passwordChangedAt = new Date();
    user.refreshToken = { token: null, expiresAt: null };
    if (!user.preferences) user.preferences = {};
    user.preferences.allowPasswordLogin = true;
    await user.save();
    invalidateUser(user._id);

    clearAuthCookies(res);
    return res.status(200).json({ success: true, message: "Contraseña actualizada exitosamente." });
  } catch (error) {
    console.error("Error al restablecer contraseña:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const googleAuth = async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json(getError("AUTH_GOOGLE_TOKEN_REQUIRED"));

  try {
    const response = await axios.get(process.env.GOOGLE_USERINFO_API, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 5000,
    });

    const { email, name, picture, verified_email } = response.data;

    if (!email) return res.status(400).json(getError("AUTH_EMAIL_REQUIRED"));
    if (verified_email !== true) return res.status(400).json(getError("AUTH_GOOGLE_EMAIL_NOT_VERIFIED"));

    let user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      const { token: newRefreshRaw, hashedToken: newHashedRefresh, expiresAt: newRefreshExpiry } = newRefreshToken();

      user = new User({
        email,
        username: await generateUsername("google"),
        password: crypto.randomBytes(64).toString("hex"),
        profile: {
          name,
          country: '',
          region: '',
          birthdate: null,
          aboutMe: '',
        },
        enterprise: {
          name: '',
          jobPosition: '',
        },
        preferences: {
          hasProfilePhoto: false,
          isGoogleAccount: true,
          allowPasswordLogin: false
        },
        refreshToken: { token: newHashedRefresh, expiresAt: newRefreshExpiry },
        lastLogin: new Date(),
      });

      await user.save();

      if (picture) {
        try {
          await uploadGoogleProfilePhoto(picture, user._id);
          user.preferences.hasProfilePhoto = true;
          await user.save();
          invalidateUser(user._id);
        } catch (error) {
          console.error("Google profile photo upload failed:", error);
        }
      }

      const accessToken = await newJWT(user.id, user.role);
      if (!accessToken) return res.status(500).json(getError('JWT_GENERATION_FAILED'));

      setAuthCookies(res, accessToken, newRefreshRaw);
      return res.status(200).json({ success: true, username: user.username });
    }

    if (!user.status) return res.status(403).json(getError("AUTH_ACCOUNT_DISABLED"));
    if (getProfileStatus(user) === "needs_activation") return res.status(403).json(getError("AUTH_ACCOUNT_NOT_ACTIVATED"));

    const accessToken = await newJWT(user.id, user.role);
    if (!accessToken) return res.status(500).json(getError('JWT_GENERATION_FAILED'));

    const { token: refreshTokenRaw, hashedToken, expiresAt } = newRefreshToken();
    user.refreshToken = { token: hashedToken, expiresAt };
    user.lastLogin = new Date();
    await user.save();
    invalidateUser(user._id);

    let newlyUnlocked = [];
    try {
      ({ newlyUnlocked } = await unlockAchievements(user, true));
    } catch (err) {
      console.error("Achievement unlock failed during Google login:", err);
    }

    setAuthCookies(res, accessToken, refreshTokenRaw);
    return res.status(200).json({ success: true, username: user.username, achievementsUnlocked: newlyUnlocked });
  } catch (error) {
    console.error('Google Auth Error:', error);
    if (error.response?.status === 401) return res.status(401).json(getError("AUTH_INVALID_GOOGLE_TOKEN"));
    return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
  }
};

const updateUsername = async (req , res) => {
  const { username } = req.body;
  try {
    if (!username) return res.status(400).json(getError("VALIDATION_USERNAME_REQUIRED"));

    const normalizedUsername = username.trim().toLowerCase();
    if (normalizedUsername.length < 6 || normalizedUsername.length > 25) return res.status(400).json(getError("VALIDATION_USERNAME_LENGTH"));
    if (!/^[a-zA-Z0-9._]+$/.test(normalizedUsername)) return res.status(400).json(getError("VALIDATION_USERNAME_FORMAT"));

    const existingUsername = await User.findOne({ username: normalizedUsername, _id: { $ne: req.userAuth.id } });
    if (existingUsername) return res.status(409).json(getError("AUTH_USERNAME_ALREADY_EXISTS"));

    const user = await User.findOneAndUpdate(
      { _id: req.userAuth.id, username: { $ne: normalizedUsername } },
      { username: normalizedUsername },
      { new: true, runValidators: true }
    );
    if (!user) {
      const stillExists = await User.findById(req.userAuth.id);
      if (!stillExists) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));
      return res.status(409).json(getError("AUTH_USERNAME_ALREADY_EXISTS"));
    }
    const profileStatus = getProfileStatus(user);
    invalidateUser(req.userAuth.id);
    return res.status(200).json({ success: true, message: "Username updated successfully", profileStatus });
  } catch (error) {
    console.error("Error updating username:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const authUser = async (req , res) => {
  try {
    const userId = req.userAuth.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));
    const { newlyUnlocked } = await unlockAchievements(user, true);
    const profileStatus = getProfileStatus(user);
    return res.status(200).json({ success: true, achievementsUnlocked: newlyUnlocked, profileStatus });
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const refreshTokenHandler = async (req , res) => {
  const refreshTokenValue = req.cookies?.refresh_token;
  try {
    if (!refreshTokenValue) return res.status(400).json(getError("REFRESH_TOKEN_MISSING"));
    if (typeof refreshTokenValue !== "string" || refreshTokenValue.length !== 80 || !/^[a-f0-9]+$/.test(refreshTokenValue)) {
      return res.status(400).json(getError("REFRESH_TOKEN_INVALID"));
    }

    const hashedToken = hashRefreshToken(refreshTokenValue);

    const tokenExists = await User.findOne({
      "refreshToken.token": hashedToken,
      status: true,
    });

    if (!tokenExists) return res.status(401).json(getError("REFRESH_TOKEN_INVALID"));
    if (tokenExists.refreshToken.expiresAt < new Date()) return res.status(401).json(getError("REFRESH_TOKEN_EXPIRED"));

    const { token: newRefreshTokenRaw, hashedToken: newHashedToken, expiresAt } = newRefreshToken();

    const user = await User.findOneAndUpdate(
      { "refreshToken.token": hashedToken, "refreshToken.expiresAt": { $gt: new Date() }, status: true },
      { "refreshToken.token": newHashedToken, "refreshToken.expiresAt": expiresAt },
      { new: true }
    );

    if (!user) return res.status(401).json(getError("REFRESH_TOKEN_INVALID"));

    const newAccessToken = await newJWT(user.id, user.role);
    if (!newAccessToken) return res.status(500).json(getError("JWT_GENERATION_FAILED"));

    setAuthCookies(res, newAccessToken, newRefreshTokenRaw);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error refreshing token:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const logoutHandler = async (req , res) => {
  try {
    const user = req.userAuth;
    if (!user) {
      clearAuthCookies(res);
      return res.status(200).json({ success: true, message: "Logged out successfully." });
    }
    user.refreshToken = { token: null, expiresAt: null };
    await user.save();
    invalidateUser(user.id);
    clearAuthCookies(res);
    return res.status(200).json({ success: true, message: "Logged out successfully." });
  } catch (error) {
    console.error("Error during logout:", error);
    clearAuthCookies(res);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const ONBOARDING_JWT_TTL_MINUTES = parseInt(process.env.ONBOARDING_JWT_TTL_MINUTES, 10) || 30;

const consumeMagicLink = async (req, res) => {
  try {
    const { token: rawToken } = req.params;
    if (!rawToken || typeof rawToken !== "string" || !/^[a-f0-9]{64}$/.test(rawToken)) {
      return res.status(400).json(getError("MAGIC_LINK_INVALID"));
    }

    const hashedToken = hashMagicLinkToken(rawToken);
    const user = await User.findOne({ "magicLink.token": hashedToken });
    if (!user) return res.status(404).json(getError("MAGIC_LINK_INVALID"));
    if (!user.status) return res.status(403).json(getError("AUTH_ACCOUNT_DISABLED"));
    if (!user.magicLink?.expiresAt || user.magicLink.expiresAt < new Date()) {
      await User.updateOne({ _id: user._id }, { $set: { "magicLink.token": null, "magicLink.expiresAt": null } });
      return res.status(410).json(getError("MAGIC_LINK_EXPIRED"));
    }

    // El link es time-based, no single-use: queda vigente hasta que expire o hasta que
    // el user complete la activación (completeActivation borra magicLink.token).
    const profileStatus = getProfileStatus(user);

    // User ya completo → login automático con JWT normal
    if (profileStatus !== "needs_activation") {
      const accessToken = await newJWT(user.id, user.role);
      if (!accessToken) return res.status(500).json(getError("JWT_GENERATION_FAILED"));

      const { token: refreshTokenRaw, hashedToken: hashedRefresh, expiresAt } = newRefreshToken();
      await User.updateOne({ _id: user._id }, { $set: { refreshToken: { token: hashedRefresh, expiresAt }, lastLogin: new Date() } });
      invalidateUser(user._id);

      setAuthCookies(res, accessToken, refreshTokenRaw);
      return res.status(200).json({ success: true, scope: "full", profileStatus });
    }

    // Stub user → JWT con scope:"activation" para completar perfil
    const activationToken = await newJWT(user.id, user.role, {
      extraPayload: { scope: "activation" },
      expiresIn: `${ONBOARDING_JWT_TTL_MINUTES}m`,
    });
    if (!activationToken) return res.status(500).json(getError("JWT_GENERATION_FAILED"));

    res.cookie("access_token", activationToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || process.env.FORCE_SECURE_COOKIES === "true",
      sameSite: "lax",
      path: "/",
      maxAge: ONBOARDING_JWT_TTL_MINUTES * 60 * 1000,
      ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
    });

    return res.status(200).json({
      success: true,
      scope: "activation",
      profileStatus,
      email: user.email,
    });
  } catch (error) {
    console.error("Error consuming magic link:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const completeActivation = async (req, res) => {
  const { username, password, name, birthdate, country, region, enterprise, enterpriseRole, aboutme } = req.body;
  try {
    const user = req.userAuth;
    const profileStatus = getProfileStatus(user);
    if (profileStatus !== "needs_activation") {
      return res.status(409).json(getError("USER_ALREADY_ACTIVATED"));
    }

    const normalizedUsername = username.trim().toLowerCase();
    if (normalizedUsername.startsWith("pending_") || normalizedUsername.startsWith("google_")) {
      return res.status(400).json(getError("VALIDATION_USERNAME_INVALID"));
    }
    if (isOffensive(normalizedUsername)) return res.status(400).json(getError("VALIDATION_USERNAME_OFFENSIVE"));

    const existingUsername = await User.findOne({ username: normalizedUsername, _id: { $ne: user._id } });
    if (existingUsername) return res.status(409).json(getError("AUTH_USERNAME_ALREADY_EXISTS"));

    const birthDateObject = new Date(birthdate);
    if (isNaN(birthDateObject.getTime())) return res.status(400).json(getError("VALIDATION_BIRTHDATE_INVALID"));
    const now = new Date();
    let age = now.getFullYear() - birthDateObject.getFullYear();
    if (now.getMonth() < birthDateObject.getMonth() || (now.getMonth() === birthDateObject.getMonth() && now.getDate() < birthDateObject.getDate())) age--;
    if (age < 18) return res.status(400).json(getError("VALIDATION_BIRTHDATE_INVALID"));

    const hashedPassword = await bcryptjs.hash(password, 10);
    const { token: refreshTokenRaw, hashedToken, expiresAt } = newRefreshToken();

    // Atomic update con guard `username: /^pending_/` — protege contra dobles submits concurrentes:
    // si otro request ya completó la activación, este updatedUser será null y respondemos 409.
    // NOTA: no se setea passwordChangedAt — es la primera vez que se setea password (no un cambio).
    let updatedUser;
    try {
      updatedUser = await User.findOneAndUpdate(
        { _id: user._id, username: { $regex: /^pending_/ } },
        {
          $set: {
            username: normalizedUsername,
            password: hashedPassword,
            ...(name?.trim() ? { "profile.name": name.trim() } : {}),
            "profile.birthdate": birthDateObject,
            "profile.country": country.trim(),
            "profile.region": region.trim(),
            "profile.aboutMe": aboutme.trim(),
            "enterprise.name": enterprise.trim(),
            "enterprise.jobPosition": enterpriseRole.trim(),
            "preferences.allowPasswordLogin": true,
            refreshToken: { token: hashedToken, expiresAt },
            magicLink: { token: null, expiresAt: null },
            lastLogin: new Date(),
          },
        },
        { new: true }
      );
    } catch (err) {
      if (err.code === 11000) {
        const field = Object.keys(err.keyPattern || {})[0];
        if (field === "username") return res.status(409).json(getError("AUTH_USERNAME_ALREADY_EXISTS"));
      }
      throw err;
    }
    if (!updatedUser) {
      return res.status(409).json(getError("USER_ALREADY_ACTIVATED"));
    }

    invalidateUser(user._id);

    const accessToken = await newJWT(updatedUser.id, updatedUser.role);
    if (!accessToken) return res.status(500).json(getError("JWT_GENERATION_FAILED"));

    setAuthCookies(res, accessToken, refreshTokenRaw);

    let newlyUnlocked = [];
    try {
      ({ newlyUnlocked } = await unlockAchievements(updatedUser, true));
    } catch (err) {
      console.error("Achievement unlock failed during activation:", err);
    }

    return res.status(200).json({ success: true, achievementsUnlocked: newlyUnlocked, profileStatus: "complete" });
  } catch (error) {
    console.error("Error completing activation:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

// Reenvío self-service del mail de activación para cuentas stub (needs_activation).
// Público: respuesta genérica idéntica exista o no la cuenta, para no filtrar su estado.
const resendActivation = async (req, res) => {
  const { email } = req.body;
  const generic = { success: true, message: "Si la cuenta existe y está pendiente de activación, te reenviamos el correo." };
  try {
    if (!email) return res.status(400).json(getError("VALIDATION_EMAIL_REQUIRED"));

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.status) return res.status(200).json(generic);
    if (getProfileStatus(user) !== "needs_activation") return res.status(200).json(generic);

    try {
      await regenerateAndSendActivation(user);
    } catch (err) {
      console.error("Error reenviando mail de activación:", err);
    }
    return res.status(200).json(generic);
  } catch (error) {
    console.error("Error en resendActivation:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { login, checkEmailExists, validateUsername, verifyReCAPTCHA, createUser, sendPasswordRecoveryEmail, verifyRecoveryOtp, resetPassword, googleAuth, updateUsername, authUser, refreshTokenHandler, logoutHandler, consumeMagicLink, completeActivation, resendActivation };