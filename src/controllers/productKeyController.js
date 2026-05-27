const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const User = require("../models/userModel");
const ProductKey = require("../models/productKeyModel");
const { activateProgramForUser } = require("../services/programActivationService");
const { sendMagicLinkActivationEmail, sendProductActivatedForExistingUserEmail } = require("../services/subscriptionEmailService");
const { getProfileStatus } = require("../helpers/getProfileStatus");
const { invalidateUser } = require("../cache/cacheService");
const { hasAccess } = require("../utils/accessControl");
const { getError } = require("../helpers/getError");

const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const generateProductCode = () => {
    const segment = () =>
    Array.from({ length: 4 }, () =>
        crypto.randomInt(36).toString(36).toUpperCase()
    ).join("");
    return `${segment()}-${segment()}-${segment()}-${segment()}`;
};

const MAX_KEY_RETRIES = 5;

const createProductKey = async () => {
    for (let attempt = 0; attempt < MAX_KEY_RETRIES; attempt++) {
        const code = generateProductCode();
        try {
            const existing = await ProductKey.findOne({ code });
            if (existing) continue;
            await ProductKey.create({ code, email: "stannum@stannum.com.ar", product: "tia_summer", team: "no_team" });
            return;
        } catch (err) {
            console.error("❌ Error creando clave:", err);
            continue;
        }
    }
    console.error("❌ No se pudo generar un código único después de", MAX_KEY_RETRIES, "intentos");
};

// Si Mongoose rechaza el documento (ej. team > 50 chars, email/product inválidos),
// devolver 400 con el detalle concreto en vez de un 500 opaco que el caller (ej. el
// dashboard de Trenno) no puede interpretar y termina mostrando "error interno".
const validationErrorResponse = (res, error) => {
    if (error?.name !== "ValidationError") return null;
    const detail = Object.values(error.errors || {}).map((e) => e.message).join(", ");
    return res.status(400).json(getError("VALIDATION_GENERIC_ERROR", {
        techMessage: detail || "Document validation failed.",
        friendlyMessage: detail || "Por favor, revisa los datos ingresados.",
    }));
};

const verifyProductKey = async (req, res) => {
    try {
        const { code } = req.params;
        if (!code) return res.status(400).json(getError("VALIDATION_PRODUCT_KEY_REQUIRED"));
        
        const key = await ProductKey.findOne({ code: code.toUpperCase() });
        if (!key) return res.status(404).json(getError("VALIDATION_PRODUCT_KEY_NOT_FOUND"));
        if (key.used) return res.status(404).json(getError("VALIDATION_PRODUCT_KEY_ALREADY_USED"));
        
        return res.status(200).json({ success: true, data: key.getInfo() });
    } catch (error) {
        console.error("Error al verificar la clave de producto:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const activateProductKey = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const userId = req.userAuth.id;
        const { code } = req.body;

        if (!code) return res.status(400).json(getError("VALIDATION_PRODUCT_KEY_REQUIRED"));

        let result;
        await session.withTransaction(async () => {
            const key = await ProductKey.findOneAndUpdate(
                { code: code.toUpperCase(), used: false },
                { used: true, usedAt: new Date(), usedBy: userId },
                { new: true, session }
            );

            if (!key) {
                const exists = await ProductKey.findOne({ code: code.toUpperCase() }).session(session);
                if (!exists) throw { statusCode: 404, errorKey: "VALIDATION_PRODUCT_KEY_NOT_FOUND" };
                throw { statusCode: 400, errorKey: "VALIDATION_PRODUCT_KEY_ALREADY_USED" };
            }

            const { newlyUnlocked, alreadyOwned } = await activateProgramForUser(userId, key.product, key.team, session);
            if (alreadyOwned) throw { statusCode: 400, errorKey: "VALIDATION_PRODUCT_ALREADY_OWNED" };

            result = { newlyUnlocked };
        });

        return res.status(200).json({ success: true, message: "Programa activado correctamente.", achievementsUnlocked: result.newlyUnlocked });
    } catch (error) {
        if (error.statusCode && error.errorKey) {
            return res.status(error.statusCode).json(getError(error.errorKey));
        }
        console.error("Error al activar la clave de producto:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    } finally {
        session.endSession();
    }
};

const generateAndSendProductKeyMake = async (req, res) => {
    const { email, fullName, message, product = "tia", team = "no_team", guideLink, whatsappLink } = req.body;
    try {
        if (!email) return res.status(400).json(getError("VALIDATION_EMAIL_REQUIRED"));
        if (!fullName) return res.status(400).json(getError("VALIDATION_FULLNAME_REQUIRED"));

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return res.status(400).json(getError("VALIDATION_EMAIL_INVALID"));

        let decodedFullName;
        try {
            decodedFullName = escapeHtml(Buffer.from(fullName, 'base64').toString('utf-8'));
        } catch (error) {
            return res.status(400).json(getError("VALIDATION_FULLNAME_INVALID_ENCODING"));
        }

        let decodedMessage;
        if (message) {
            try {
                decodedMessage = escapeHtml(Buffer.from(message, 'base64').toString('utf-8'));
            } catch (error) {
                return res.status(400).json(getError("VALIDATION_MESSAGE_INVALID_ENCODING"));
            }
        }

        let code;
        for (let attempt = 0; attempt < MAX_KEY_RETRIES; attempt++) {
            const candidate = generateProductCode();
            try {
                await ProductKey.create({
                    code: candidate,
                    email: email.toLowerCase().trim(),
                    product,
                    team,
                });
                code = candidate;
                break;
            } catch (err) {
                if (err.code === 11000) continue;
                throw err;
            }
        }
        if (!code) return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));

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
            }
        );
        } catch (error) {
            return res.status(500).json(getError("NETWORK_CONNECTION_ERROR"));
        }

        const safeGuideLink = guideLink ? escapeHtml(guideLink) : '';
        const safeWhatsappLink = whatsappLink ? escapeHtml(whatsappLink) : '';

        const guideSection = guideLink ? `
                        <div style="background-color: #2a2a2a; padding: 20px; border-radius: 8px; margin-bottom: 15px;">
                            <h3 style="color: #ffffff; font-size: 18px; margin: 0 0 10px 0; font-weight: 600;">Guía del Participante</h3>
                            <p style="font-size: 15px; color: #ccc; line-height: 1.6; margin: 0 0 15px 0;">Descargá tu guía completa para prepararte antes del entrenamiento. Incluye todo lo que necesitás saber para aprovechar al máximo la experiencia.</p>
                            <a href="${safeGuideLink}" target="_blank" style="display: inline-block; background-color: #00A896; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Ver Guía ahora</a>
                        </div>` : '';

        const whatsappSection = whatsappLink ? `
                        <div style="background-color: #2a2a2a; padding: 20px; border-radius: 8px;">
                            <h3 style="color: #ffffff; font-size: 18px; margin: 0 0 10px 0; font-weight: 600;">Comunidad del Entrenamiento</h3>
                            <p style="font-size: 15px; color: #ccc; line-height: 1.6; margin: 0 0 15px 0;">Unite a la comunidad de líderes que están viviendo la experiencia. Conectá, compartí y entrená con otros líderes y emprendedores de alto rendimiento.</p>
                            <a href="${safeWhatsappLink}" target="_blank" style="display: inline-block; background-color: #25D366; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Unirme al Grupo</a>
                        </div>` : '';

        const preparationSection = (guideLink || whatsappLink) ? `
                    <hr style="border: none; border-top: 1px solid #515151; margin: 40px 0;" />
                    <div style="margin: 30px 0;">
                        <h2 style="color: #00FFCC; font-size: 24px; margin-bottom: 20px; font-weight: 600; text-align: center;">Preparate para el Entrenamiento</h2>
                        ${guideSection}
                        ${whatsappSection}
                    </div>` : '';

        const diagnosisSection = decodedMessage ? `
                    <div style="background-color: #2a2a2a; padding: 25px; border-radius: 10px; margin-bottom: 30px; border-left: 4px solid #00FFCC;">
                        <h2 style="color: #00FFCC; font-size: 24px; margin: 0 0 8px 0; font-weight: 600;">Tu Diagnóstico de Dominio en IA</h2>
                        <p style="font-size: 16px; color: #e0e0e0; line-height: 1.8; margin: 0; white-space: pre-line;">${decodedMessage}</p>
                    </div>` : '';

        const mailOptions = {
            from: `"STANNUM Game" <${process.env.SMTP_EMAIL}>`,
            to: email,
            subject: decodedMessage ? "Tu Diagnóstico IA + Acceso a STANNUM Game" : "Tu Acceso a STANNUM Game",
            html: `
                <div style="background-color: #1f1f1f; color: #fff; font-family: Arial, sans-serif; padding: 30px; border-radius: 12px; max-width: 700px; margin: auto;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #00FFCC; font-size: 32px; font-weight: 700; margin: 0;">¡Bienvenido al entrenamiento,<br /><span style="color: #ffffff;">${decodedFullName}</span>!</h1>
                    </div>
                    ${diagnosisSection}
                    <div style="text-align: center; margin: 40px 0;">
                        <p style="font-size: 16px; color: #ccc; margin: 0 0 8px 0;">Te damos acceso a</p>
                        <h2 style="color: #00FFCC; font-size: 28px; margin: 0 0 25px 0; font-weight: 700;">STANNUM Game</h2>
                        <h3 style="color: #ffffff; font-size: 18px; margin: 0 0 10px 0; font-weight: 600;">Tu Clave de Activación</h3>
                        <div style="background-color: #00FFCC; padding: 20px; border-radius: 10px; display: inline-block; margin: 20px 0; box-shadow: 0 4px 15px rgba(0, 255, 204, 0.3);">
                            <h3 style="color: #000000; font-size: 36px; letter-spacing: 4px; font-weight: 900; margin: 0;">${code}</h3>
                        </div>
                    </div>
                    <hr style="border: none; border-top: 1px solid #515151; margin: 40px 0;" />
                    <div style="margin: 30px 0;">
                        <h2 style="color: #00FFCC; font-size: 22px; margin-bottom: 10px; font-weight: 600; text-align: center;">Antes que nada...</h2>
                        <h3 style="color: #ffffff; font-size: 18px; margin-bottom: 8px; font-weight: 600;">¿Qué es STANNUM Game?</h3>
                        <p style="font-size: 15px; color: #ccc; line-height: 1.7; margin: 0 0 10px 0;"><b style="color: #ffffff;">STANNUM Game</b> es nuestra plataforma de entrenamiento gamificada. Es <b style="color: #00FFCC;">gratuita y abierta para todos</b>. Cualquier persona puede crearse una cuenta y explorarla.</p>
                        <p style="font-size: 15px; color: #ccc; line-height: 1.7; margin: 0 0 0 0;">Dentro de STANNUM Game viven los programas de entrenamiento como <b style="color: #ffffff;">TRENNO IA</b>. El código que recibís en este email <b style="color: #ccc;">NO es para ingresar a la plataforma</b>, sino para <b style="color: #00FFCC;">activar tu programa TRENNO IA</b> dentro de ella.</p>
                    </div>
                    <hr style="border: none; border-top: 1px solid #515151; margin: 40px 0;" />
                    <div style="margin: 30px 0;">
                        <h2 style="color: #00FFCC; font-size: 22px; margin-bottom: 25px; font-weight: 600; text-align: center;">¿Cómo activo mi programa?</h2>
                        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                            <tr>
                                <td style="vertical-align: top; padding: 0 15px 25px 0; width: 50px;">
                                    <div style="background-color: #00FFCC; color: #000; width: 36px; height: 36px; border-radius: 50%; text-align: center; line-height: 36px; font-weight: 900; font-size: 18px;">1</div>
                                </td>
                                <td style="vertical-align: top; padding-bottom: 25px;">
                                    <h4 style="color: #ffffff; font-size: 16px; margin: 0 0 6px 0; font-weight: 600;">Ingresá a STANNUM Game</h4>
                                    <p style="font-size: 14px; color: #aaa; line-height: 1.6; margin: 0;">Entrá a <a href="https://stannumgame.com" style="color: #00FFCC; text-decoration: none; font-weight: 600;">stannumgame.com</a> y creá tu cuenta gratuita (podés usar tu email o iniciar con Google). Si ya tenés cuenta, simplemente iniciá sesión.</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="vertical-align: top; padding: 0 15px 25px 0; width: 50px;">
                                    <div style="background-color: #00FFCC; color: #000; width: 36px; height: 36px; border-radius: 50%; text-align: center; line-height: 36px; font-weight: 900; font-size: 18px;">2</div>
                                </td>
                                <td style="vertical-align: top; padding-bottom: 25px;">
                                    <h4 style="color: #ffffff; font-size: 16px; margin: 0 0 6px 0; font-weight: 600;">Buscá el botón "Activar Producto"</h4>
                                    <p style="font-size: 14px; color: #aaa; line-height: 1.6; margin: 0;">Una vez adentro de la plataforma, vas a encontrar un botón que dice <b style="color: #ffffff;">"Activar Producto"</b>. Hacé clic ahí.</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="vertical-align: top; padding: 0 15px 0 0; width: 50px;">
                                    <div style="background-color: #00FFCC; color: #000; width: 36px; height: 36px; border-radius: 50%; text-align: center; line-height: 36px; font-weight: 900; font-size: 18px;">3</div>
                                </td>
                                <td style="vertical-align: top;">
                                    <h4 style="color: #ffffff; font-size: 16px; margin: 0 0 6px 0; font-weight: 600;">Ingresá tu código</h4>
                                    <p style="font-size: 14px; color: #aaa; line-height: 1.6; margin: 0;">Pegá el código de este email y listo. Se va a desbloquear tu programa <b style="color: #ffffff;">TRENNO IA</b> y podés arrancar tu entrenamiento.</p>
                                </td>
                            </tr>
                        </table>
                    </div>
                    <div style="background-color: #2a2a2a; border-left: 4px solid #f5a623; padding: 18px 20px; border-radius: 8px; margin: 30px 0;">
                        <p style="font-size: 14px; color: #f5a623; font-weight: 700; margin: 0 0 6px 0;">IMPORTANTE</p>
                        <p style="font-size: 14px; color: #ccc; line-height: 1.6; margin: 0;">El código <b style="color: #ffffff;">NO es una contraseña</b>. La plataforma STANNUM Game es gratuita y se accede creando una cuenta. El código solo sirve para <b style="color: #00FFCC;">activar el programa TRENNO IA</b> una vez que ya estés dentro.</p>
                    </div>
                    ${preparationSection}
                    <hr style="border: none; border-top: 1px solid #515151; margin: 40px 0;" />
                    <div style="text-align: center;">
                        <p style="font-size: 14px; color: #888; line-height: 1.6; margin-bottom: 10px;">¿No solicitaste esta clave? Ignorá este correo.</p>
                        <p style="font-size: 14px; color: #aaa; margin-top: 20px;">Nos vemos en el campo de juego,<br /> <span style="color: #00FFCC; font-weight: 600;">Equipo STANNUM</span></p>
                        <footer style="margin-top: 40px; font-size: 12px; color: #515151;">&copy; 2026 STANNUM Game. Todos los derechos reservados.</footer>
                    </div>
                </div>
            `,
        };
        mailOptions.html = mailOptions.html.replace(/\n\s+/g, '').replace(/>\s+</g, '><');

        try {
            await transporter.sendMail(mailOptions);
            console.log(`✅ Clave de producto enviada con éxito a ${email} (code: ${code})`);
        } catch (error) {
            return res.status(500).json(getError("NETWORK_CONNECTION_ERROR"));
        }

        return res.status(201).json({ code, email });
    } catch (error) {
        const handled = validationErrorResponse(res, error);
        if (handled) return handled;
        console.error("❌ Error generando clave de producto con Make:", error.message);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const generateAndSendProductKey = async (req, res) => {
    const { email, product = "tia", team = "no_team" } = req.body;
    try {
        if (!email) return res.status(400).json(getError("VALIDATION_EMAIL_REQUIRED"));
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return res.status(400).json(getError("VALIDATION_EMAIL_INVALID"));

        let code;
        for (let attempt = 0; attempt < MAX_KEY_RETRIES; attempt++) {
            const candidate = generateProductCode();
            try {
                await ProductKey.create({
                    code: candidate,
                    email: email.toLowerCase().trim(),
                    product,
                    team,
                });
                code = candidate;
                break;
            } catch (err) {
                if (err.code === 11000) continue;
                throw err;
            }
        }
        if (!code) return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));

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
            return res.status(500).json(getError("NETWORK_CONNECTION_ERROR"));
        }

        const mailOptions = {
            from: `"STANNUM Game" <${process.env.SMTP_EMAIL}>`,
            to: email,
            subject: "¡Bienvenido a STANNUM Game! - Tu Clave de Acceso",
            html: `
                <div style="background-color: #1f1f1f; color: #fff; font-family: Arial, sans-serif; padding: 30px; border-radius: 12px; max-width: 700px; margin: auto;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #00FFCC; font-size: 32px; font-weight: 700; margin: 0;">¡Bienvenido a STANNUM Game!</h1>
                    </div>
                    
                    <div style="background-color: #2a2a2a; padding: 25px; border-radius: 10px; margin-bottom: 30px; border-left: 4px solid #00FFCC;">
                        <h2 style="color: #00FFCC; font-size: 20px; margin: 0 0 15px 0; font-weight: 600;">Tu acceso está listo</h2>
                        <p style="font-size: 16px; color: #e0e0e0; line-height: 1.8; margin: 0;">
                            Estamos felices de tenerte en STANNUM Game. Tu plataforma de entrenamiento digital de alto rendimiento ya está disponible.
                        </p>
                    </div>

                    <div style="text-align: center; margin: 40px 0;">
                        <h2 style="color: #ffffff; font-size: 24px; margin-bottom: 15px; font-weight: 600;">Tu Clave de Acceso</h2>
                        <p style="font-size: 16px; color: #ccc; margin-bottom: 20px;">Activá esta clave para acceder a todo el contenido:</p>
                        <div style="background: linear-gradient(135deg, #00FFCC 0%, #00A896 100%); padding: 20px; border-radius: 10px; display: inline-block; margin: 20px 0; box-shadow: 0 4px 15px rgba(0, 255, 204, 0.3);">
                            <h3 style="color: #1f1f1f; font-size: 36px; letter-spacing: 4px; font-weight: 900; margin: 0; text-shadow: 1px 1px 3px rgba(0,0,0,0.2);">${code}</h3>
                        </div>
                        <a href="https://stannumgame.com" style="display: inline-block; background-color: #00FFCC; color: #1f1f1f; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; margin-top: 10px; transition: transform 0.2s;">Activar Clave Ahora</a>
                    </div>

                    <hr style="border: none; border-top: 1px solid #515151; margin: 40px 0;" />

                    <div style="text-align: center;">
                        <p style="font-size: 14px; color: #888; line-height: 1.6; margin-bottom: 10px;">¿No solicitaste esta clave? Ignorá este correo.</p>
                        <p style="font-size: 14px; color: #aaa; margin-top: 20px;">Nos vemos en el campo de juego,<br /> <span style="color: #00FFCC; font-weight: 600;">Equipo STANNUM</span></p>
                        <footer style="margin-top: 40px; font-size: 12px; color: #515151;">&copy; 2025 STANNUM Game. Todos los derechos reservados.</footer>
                    </div>
                </div>
            `,
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`✅ Clave de producto enviada con éxito a ${email} (code: ${code})`);
        } catch (error) {
            return res.status(500).json(getError("NETWORK_CONNECTION_ERROR"));
        }

        return res.status(201).json({ code, email: email.toLowerCase().trim() });
    } catch (error) {
        const handled = validationErrorResponse(res, error);
        if (handled) return handled;
        console.error("❌ Error en generateAndSendProductKey:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const generateProductKey = async (req, res) => {
    const { email, product = "tia", team = "no_team" } = req.body;
    try {
        if (!email) return res.status(400).json(getError("VALIDATION_EMAIL_REQUIRED"));
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return res.status(400).json(getError("VALIDATION_EMAIL_INVALID"));

        let code;
        for (let attempt = 0; attempt < MAX_KEY_RETRIES; attempt++) {
            const candidate = generateProductCode();
            try {
                await ProductKey.create({
                    code: candidate,
                    email: email.toLowerCase().trim(),
                    product,
                    team,
                });
                code = candidate;
                break;
            } catch (err) {
                if (err.code === 11000) continue;
                throw err;
            }
        }
        if (!code) return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));

        return res.status(201).json({
            success: true,
            code,
            email: email.toLowerCase().trim()
        });
    } catch (error) {
        const handled = validationErrorResponse(res, error);
        if (handled) return handled;
        console.error("❌ Error en generateProductKey:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const checkProductKeyStatus = async (req, res) => {
    const { code } = req.params;
    try {
        const productKey = await ProductKey.findOne({ code: code.toUpperCase() })
            .populate("usedBy", "profile.name email");

        if (!productKey) {
            return res.status(404).json(getError("VALIDATION_PRODUCT_KEY_NOT_FOUND"));
        }

        return res.status(200).json({
            success: true,
            data: {
                code: productKey.code,
                email: productKey.email,
                product: productKey.product,
                isActivated: !!productKey.usedBy,
                activatedAt: productKey.usedBy ? productKey.usedAt : null,
                user: productKey.usedBy ? {
                    name: productKey.usedBy.profile?.name,
                    email: productKey.usedBy.email
                } : null
            }
        });
    } catch (error) {
        console.error("❌ Error en checkProductKeyStatus:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const MAGIC_LINK_TTL_HOURS = parseInt(process.env.MAGIC_LINK_TTL_HOURS, 10) || 24;
const ACTIVATION_PRODUCTS = ["tia", "tmd", "tia_summer", "tia_pool"];

const generateMagicLinkRawToken = () => crypto.randomBytes(32).toString("hex");
const hashMagicLinkToken = (rawToken) => crypto.createHash("sha256").update(rawToken).digest("hex");

const autoEnroll = async (req, res) => {
    const { email, fullName, message, product = "tia", team = "no_team", guideLink, whatsappLink } = req.body;
    const session = await mongoose.startSession();

    try {
        if (!email) return res.status(400).json(getError("VALIDATION_EMAIL_REQUIRED"));
        if (!fullName) return res.status(400).json(getError("VALIDATION_FULLNAME_REQUIRED"));
        if (!ACTIVATION_PRODUCTS.includes(product)) return res.status(400).json(getError("VALIDATION_GENERIC_ERROR"));

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return res.status(400).json(getError("VALIDATION_EMAIL_INVALID"));

        let decodedFullName;
        try {
            decodedFullName = Buffer.from(fullName, "base64").toString("utf-8").trim();
        } catch (err) {
            return res.status(400).json(getError("VALIDATION_FULLNAME_INVALID_ENCODING"));
        }
        if (!decodedFullName || decodedFullName.length < 2) {
            decodedFullName = email.split("@")[0].slice(0, 50);
        }
        if (decodedFullName.length > 50) decodedFullName = decodedFullName.slice(0, 50);

        let decodedDiagnosis = null;
        if (message) {
            try {
                decodedDiagnosis = Buffer.from(message, "base64").toString("utf-8").trim();
            } catch (err) {
                return res.status(400).json(getError("VALIDATION_MESSAGE_INVALID_ENCODING"));
            }
        }

        const normalizedEmail = email.toLowerCase().trim();
        const safeGuideLink = guideLink && /^https?:\/\//i.test(guideLink) ? guideLink : null;
        const safeWhatsappLink = whatsappLink && /^https?:\/\//i.test(whatsappLink) ? whatsappLink : null;
        const safeDiagnosis = decodedDiagnosis ? escapeHtml(decodedDiagnosis) : null;
        const safeFullName = escapeHtml(decodedFullName);

        // Atomic find-or-create stub user (idempotente por email).
        // includeResultMetadata permite distinguir insert vs find sin heurísticas frágiles.
        const pendingUsername = `pending_${crypto.randomBytes(4).toString("hex")}`;
        const upsertResult = await User.findOneAndUpdate(
            { email: normalizedEmail },
            {
                $setOnInsert: {
                    email: normalizedEmail,
                    username: pendingUsername,
                    profile: { name: decodedFullName },
                    preferences: { allowPasswordLogin: false },
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true, includeResultMetadata: true }
        );
        const user = upsertResult.value;
        const wasNewUser = !!upsertResult.lastErrorObject?.upserted;

        // Cuenta deshabilitada: abortar antes de tocar nada (evita gastar ProductKey)
        if (user.status === false) {
            return res.status(403).json(getError("AUTH_ACCOUNT_DISABLED"));
        }

        const profileStatus = getProfileStatus(user);
        const isStub = profileStatus === "needs_activation";
        const alreadyHasProduct = hasAccess(user.programs?.[product]);

        // Caso: user completo + ya tiene este producto → no-op idempotente
        if (!isStub && alreadyHasProduct) {
            return res.status(200).json({ success: true, status: "already_owned", email: normalizedEmail });
        }

        // Si es stub y el admin pasa un nombre completo distinto, actualizarlo (last-write-wins en stubs)
        if (isStub && !wasNewUser && decodedFullName && decodedFullName !== user.profile?.name) {
            await User.updateOne({ _id: user._id }, { $set: { "profile.name": decodedFullName } });
            invalidateUser(user._id);
        }

        // Caso: stub que ya tiene el producto (Make ya hizo enroll antes y user nunca activó)
        // → no crear nueva ProductKey, solo regenerar magic link
        if (isStub && alreadyHasProduct) {
            const rawToken = generateMagicLinkRawToken();
            const hashedToken = hashMagicLinkToken(rawToken);
            const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_HOURS * 60 * 60 * 1000);

            await User.updateOne(
                { _id: user._id },
                { $set: { "magicLink.token": hashedToken, "magicLink.expiresAt": expiresAt } }
            );
            invalidateUser(user._id);

            sendMagicLinkActivationEmail({
                to: normalizedEmail,
                fullName: safeFullName,
                activationUrl: `${process.env.FRONTEND_URL}/activate/${rawToken}`,
                programId: product,
                diagnosis: safeDiagnosis,
                guideLink: safeGuideLink,
                whatsappLink: safeWhatsappLink,
            });

            return res.status(201).json({
                success: true,
                status: "existing_stub_resent",
                email: normalizedEmail,
            });
        }

        // Generar y consumir ProductKey + activar producto en una transacción.
        // El re-check dentro de la sesión protege contra races concurrentes: si otro request
        // activó el producto entre nuestro chequeo inicial y la transacción, evitamos crear
        // una ProductKey huérfana.
        let productCode;
        let raceSkipped = false;

        await session.withTransaction(async () => {
            const fresh = await User.findById(user._id, "programs", { session });
            if (hasAccess(fresh.programs?.[product])) {
                raceSkipped = true;
                return;
            }

            for (let attempt = 0; attempt < MAX_KEY_RETRIES; attempt++) {
                const candidate = generateProductCode();
                try {
                    const [created] = await ProductKey.create([{
                        code: candidate,
                        email: normalizedEmail,
                        product,
                        team,
                        used: true,
                        usedAt: new Date(),
                        usedBy: user._id,
                    }], { session });
                    productCode = created.code;
                    break;
                } catch (err) {
                    if (err.code === 11000) continue;
                    throw err;
                }
            }
            if (!productCode) throw { statusCode: 500, errorKey: "SERVER_INTERNAL_ERROR" };

            await activateProgramForUser(user._id, product, team, session);
        });

        invalidateUser(user._id);

        // Race detectada post-transacción: el producto ya estaba activado por otro request.
        // Para !stub esto equivale a "already_owned". Para stub, seguimos al envío del magic link
        // (el user sigue necesitando completar la activación).
        if (raceSkipped && !isStub) {
            return res.status(200).json({ success: true, status: "already_owned", email: normalizedEmail });
        }

        // Caso: user completo SIN este producto → activar y mandar mail simple (sin magic link)
        if (!isStub) {
            sendProductActivatedForExistingUserEmail({
                to: normalizedEmail,
                fullName: safeFullName,
                programId: product,
                guideLink: safeGuideLink,
                whatsappLink: safeWhatsappLink,
            });
            return res.status(200).json({
                success: true,
                status: "activated_for_existing_user",
                email: normalizedEmail,
            });
        }

        // Caso stub: regenerar magic link (incluso si había uno previo) y enviar mail
        const rawToken = generateMagicLinkRawToken();
        const hashedToken = hashMagicLinkToken(rawToken);
        const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_HOURS * 60 * 60 * 1000);

        await User.updateOne(
            { _id: user._id },
            { $set: { "magicLink.token": hashedToken, "magicLink.expiresAt": expiresAt } }
        );
        invalidateUser(user._id);

        const activationUrl = `${process.env.FRONTEND_URL}/activate/${rawToken}`;

        sendMagicLinkActivationEmail({
            to: normalizedEmail,
            fullName: safeFullName,
            activationUrl,
            programId: product,
            diagnosis: safeDiagnosis,
            guideLink: safeGuideLink,
            whatsappLink: safeWhatsappLink,
        });

        return res.status(201).json({
            success: true,
            status: wasNewUser ? "new_user" : "existing_stub_resent",
            email: normalizedEmail,
        });
    } catch (error) {
        if (error.statusCode && error.errorKey) {
            return res.status(error.statusCode).json(getError(error.errorKey));
        }
        const handled = validationErrorResponse(res, error);
        if (handled) return handled;
        console.error("❌ Error en autoEnroll:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    } finally {
        session.endSession();
    }
};

module.exports = {
    verifyProductKey,
    activateProductKey,
    generateAndSendProductKeyMake,
    generateAndSendProductKey,
    generateProductKey,
    checkProductKeyStatus,
    autoEnroll,
};