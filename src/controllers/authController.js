const { request, response } = require("express");
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

const login = async (req = request, res = response) => {
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

    if (!user || !user.status || !(await bcryptjs.compare(password, user.password))) return res.status(401).json(getError("AUTH_INVALID_CREDENTIALS"));
    if (!user.preferences?.allowPasswordLogin) return res.status(403).json(getError("AUTH_PASSWORD_LOGIN_DISABLED"));
    
    const token = await newJWT(user.id, user.role);
    if (!token) return res.status(500).json(getError("JWT_GENERATION_FAILED"));

    const { newlyUnlocked } = await unlockAchievements(user);

    return res.status(200).json({ success: true, token, achievementsUnlocked: newlyUnlocked });
  } catch (error) {
    // console.error(error);
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

  const usernameRegex = /^[a-z0-9._]+$/;
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

const createUser = async (req = request, res = response) => {
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
    const age = new Date().getFullYear() - birthDateObject.getFullYear();
    if (isNaN(birthDateObject.getTime()) || age < 18) return res.status(400).json(getError("VALIDATION_BIRTHDATE_INVALID"));

    const hashedPassword = await bcryptjs.hash(password, 10);

    const newUser = new User({
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      password: hashedPassword,
      profile: {
        name: name.trim(),
        country: country.trim(),
        region: region.trim(),
        birthdate: birthDateObject,
        aboutMe: aboutme.trim(),
      },
      enterprise: {
        name: enterprise.trim(),
        jobPosition: enterpriseRole.trim(),
      }
    });

    await newUser.save();

    const token = await newJWT(newUser.id, newUser.role);
    if (!token) return res.status(500).json(getError("JWT_GENERATION_FAILED"));

    return res.status(201).json({ success: true, token, message: "User created successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

const sendPasswordRecoveryEmail = async (req = request, res = response) => {
  const { username } = req.body;
  try {
    if (!username) return res.status(400).json(getError("VALIDATION_USERNAME_REQUIRED"));

    const user = await User.findOne({
      $or: [
        { username: username.toLowerCase().trim() },
        { email: username.toLowerCase().trim() },
      ],
    });

    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = {
      recoveryOtp: otp,
      otpExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
    await user.save();

    let transporter;
    try {
      transporter = nodemailer.createTransport({
        service: "gmail",
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
      from: `"STANNUM Game Soporte" <${process.env.SMTP_EMAIL}>`,
      to: user.email,
      subject: "Restablecer contraseña - STANNUM Game",
      html: `
        <div style="background-color: #1f1f1f; color: #fff; font-family: Arial, sans-serif; padding: 20px; border-radius: 10px; max-width: 600px; margin: auto; text-align: center;">
          <img src="https://drive.google.com/uc?export=view&id=1UWz8LoVr9RsLskEKXAx-KaB9xZgAK-PN" alt="STANNUM Logo" style="max-width: 150px; margin-top: 20px;" />
          <h1 style="color: #41cfc9; font-size: 28px;">Recupera tu contraseña en <b style="color:#ffffff; font-weight: 600; display: block;">STANNUM Game</b></h1>
          <p style="font-size: 16px; color: #ccc; line-height: 1.6;">
            Hola <span style="color: #41cfc9;">${user.username}</span>, hemos recibido una solicitud para recuperar tu contraseña.
          </p>
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
    if (!user.otp || user.otp.recoveryOtp !== otp) return res.status(400).json(getError("AUTH_INVALID_OTP"));
    if (user.otp.otpExpiresAt < new Date()) return res.status(400).json(getError("AUTH_OTP_EXPIRED"));

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

    const user = await User.findOne({
      $or: [
        { username: username.toLowerCase().trim() },
        { email: username.toLowerCase().trim() },
      ],
    });

    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));
    if (!user.otp) return res.status(400).json(getError("AUTH_OTP_MISSING"));
    if (user.otp.recoveryOtp !== otp) return res.status(400).json(getError("AUTH_INVALID_OTP"));
    if (user.otp.otpExpiresAt < new Date()) return res.status(400).json(getError("AUTH_OTP_EXPIRED"));

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,50}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json(getError("VALIDATION_PASSWORD_INVALID"));
    }

    const hashedPassword = await bcryptjs.hash(password, 10);
    user.password = hashedPassword;
    user.otp = {
      recoveryOtp: null,
      otpExpiresAt: null,
    };
    user.preferences.allowPasswordLogin = true;
    await user.save();

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
    });

    const { email, name, picture } = response.data;

    if (!email) return res.status(400).json(getError("AUTH_EMAIL_REQUIRED"));

    let user = await User.findOne({ email });

    if (!user) {
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
          hasProfilePhoto: !!picture,
          isGoogleAccount: true,
          allowPasswordLogin: false
        }
      });

      await user.save();

      try {
        if(picture) await uploadGoogleProfilePhoto(picture, user._id);
      } catch (error) {
        return res.status(500).json(getError("PHOTO_UPLOAD_FAILED"));
      }
    }

    const jwt = await newJWT(user.id);
    if (!jwt) return res.status(500).json(getError('JWT_GENERATION_FAILED'));

    return res.status(200).json({ success: true, token: jwt, username: user.username });
  } catch (error) {
    console.error('Google Auth Error:', error);
    if (error.response?.status === 401) return res.status(401).json(getError("AUTH_INVALID_GOOGLE_TOKEN"));
    return res.status(500).json(getError('SERVER_INTERNAL_ERROR'));
  }
};

const updateUsername = async (req = request, res = response) => {
  const { username } = req.body;
  try {
    if (!username) return res.status(400).json(getError("VALIDATION_USERNAME_REQUIRED"));

    const normalizedUsername = username.trim().toLowerCase();
    if (normalizedUsername.length < 6 || normalizedUsername.length > 25) return res.status(400).json(getError("VALIDATION_USERNAME_LENGTH"));
    if (!/^[a-z0-9._]+$/.test(normalizedUsername)) return res.status(400).json(getError("VALIDATION_USERNAME_FORMAT"));

    const existingUsername = await User.findOne({ username: normalizedUsername });
    if (existingUsername) return res.status(409).json(getError("AUTH_USERNAME_ALREADY_EXISTS"));

    const user = await User.findById(req.userAuth.id);
    if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

    user.username = normalizedUsername;
    await user.save();

    return res.status(200).json({ success: true, message: "Username updated successfully" });
  } catch (error) {
    console.error("Error updating username:", error);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { login, checkEmailExists, validateUsername, verifyReCAPTCHA, createUser, sendPasswordRecoveryEmail, verifyRecoveryOtp, resetPassword, googleAuth, updateUsername };