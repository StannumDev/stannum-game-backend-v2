const nodemailer = require("nodemailer");

const ProductKey = require("../models/productKeyModel");
const User = require("../models/userModel");
const { unlockAchievements } = require("../services/achievementsService");
const { getError } = require("../helpers/getError");

const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const generateProductCode = () => {
    const segment = () =>
    Array.from({ length: 4 }, () =>
        Math.floor(Math.random() * 36).toString(36).toUpperCase()
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
            return;
        }
    }
    console.error("❌ No se pudo generar un código único después de", MAX_KEY_RETRIES, "intentos");
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
    try {
        const userId = req.userAuth.id;
        const { code } = req.body;

        if (!code) return res.status(400).json(getError("VALIDATION_PRODUCT_KEY_REQUIRED"));

        const key = await ProductKey.findOneAndUpdate(
            { code: code.toUpperCase(), used: false },
            { used: true, usedAt: new Date(), usedBy: userId },
            { new: true }
        );

        if (!key) {
            const exists = await ProductKey.findOne({ code: code.toUpperCase() });
            if (!exists) return res.status(404).json(getError("VALIDATION_PRODUCT_KEY_NOT_FOUND"));
            return res.status(400).json(getError("VALIDATION_PRODUCT_KEY_ALREADY_USED"));
        }

        const user = await User.findById(userId);
        if (!user) {
            await ProductKey.findOneAndUpdate(
                { code: code.toUpperCase() },
                { used: false, usedAt: null, usedBy: null }
            );
            return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));
        }

        const alreadyHasProduct = user.programs?.[key.product]?.isPurchased;
        if (alreadyHasProduct) {
            await ProductKey.findOneAndUpdate(
                { code: code.toUpperCase() },
                { used: false, usedAt: null, usedBy: null }
            );
            return res.status(400).json(getError("VALIDATION_PRODUCT_ALREADY_OWNED"));
        }

        user.programs[key.product].isPurchased = true;
        user.programs[key.product].acquiredAt = new Date();

        const alreadyInTeam = user.teams.some(t => t.programName === key.product);
        if (!alreadyInTeam && key.team && key.team !== 'no_team') {
            user.teams.push({
                programName: key.product,
                teamName: key.team,
                role: 'member',
            });
        }

        const { newlyUnlocked } = await unlockAchievements(user);
        await user.save();

        return res.status(200).json({ success: true, message: "Programa activado correctamente.", achievementsUnlocked: newlyUnlocked });
    } catch (error) {
        console.error("Error al activar la clave de producto:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const generateAndSendProductKeyMake = async (req, res) => {
    const { email, fullName, message, product = "tia", team = "no_team", guideLink, whatsappLink } = req.body;
    try {
        if (!email) return res.status(400).json(getError("VALIDATION_EMAIL_REQUIRED"));
        if (!fullName) return res.status(400).json(getError("VALIDATION_FULLNAME_REQUIRED"));
        if (!message) return res.status(400).json(getError("VALIDATION_DIAGNOSIS_REQUIRED"));

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return res.status(400).json(getError("VALIDATION_EMAIL_INVALID"));

        let decodedFullName;
        try {
            decodedFullName = escapeHtml(Buffer.from(fullName, 'base64').toString('utf-8'));
        } catch (error) {
            return res.status(400).json(getError("VALIDATION_FULLNAME_INVALID_ENCODING"));
        }

        let decodedMessage;
        try {
            decodedMessage = escapeHtml(Buffer.from(message, 'base64').toString('utf-8'));
        } catch (error) {
            return res.status(400).json(getError("VALIDATION_MESSAGE_INVALID_ENCODING"));
        }

        let code;
        for (let attempt = 0; attempt < MAX_KEY_RETRIES; attempt++) {
            const candidate = generateProductCode();
            const existingKey = await ProductKey.findOne({ code: candidate });
            if (!existingKey) { code = candidate; break; }
        }
        if (!code) return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));

        await ProductKey.create({
            code,
            email: email.toLowerCase().trim(),
            product,
            team,
        });

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

        const guideSection = guideLink ? `
                        <div style="background-color: #2a2a2a; padding: 20px; border-radius: 8px; margin-bottom: 15px;">
                            <h3 style="color: #ffffff; font-size: 18px; margin: 0 0 10px 0; font-weight: 600;">Guía del Participante</h3>
                            <p style="font-size: 15px; color: #ccc; line-height: 1.6; margin: 0 0 15px 0;">Descargá tu guía completa para prepararte antes del entrenamiento. Incluye todo lo que necesitás saber para aprovechar al máximo la experiencia.</p>
                            <a href="${guideLink}" target="_blank" style="display: inline-block; background-color: #00A896; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Ver Guía ahora</a>
                        </div>` : '';

        const whatsappSection = whatsappLink ? `
                        <div style="background-color: #2a2a2a; padding: 20px; border-radius: 8px;">
                            <h3 style="color: #ffffff; font-size: 18px; margin: 0 0 10px 0; font-weight: 600;">Comunidad del Entrenamiento</h3>
                            <p style="font-size: 15px; color: #ccc; line-height: 1.6; margin: 0 0 15px 0;">Unite a la comunidad de líderes que están viviendo la experiencia. Conectá, compartí y entrená con otros líderes y emprendedores de alto rendimiento.</p>
                            <a href="${whatsappLink}" target="_blank" style="display: inline-block; background-color: #25D366; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Unirme al Grupo</a>
                        </div>` : '';

        const preparationSection = (guideLink || whatsappLink) ? `
                    <hr style="border: none; border-top: 1px solid #515151; margin: 40px 0;" />
                    <div style="margin: 30px 0;">
                        <h2 style="color: #00FFCC; font-size: 24px; margin-bottom: 20px; font-weight: 600; text-align: center;">Preparate para el Entrenamiento</h2>
                        ${guideSection}
                        ${whatsappSection}
                    </div>` : '';

        const mailOptions = {
            from: `"STANNUM Game" <${process.env.SMTP_EMAIL}>`,
            to: email,
            subject: "Tu Diagnóstico IA + Acceso a STANNUM Game",
            html: `
                <div style="background-color: #1f1f1f; color: #fff; font-family: Arial, sans-serif; padding: 30px; border-radius: 12px; max-width: 700px; margin: auto;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #00FFCC; font-size: 32px; font-weight: 700; margin: 0;">¡BIENVENIDO AL ENTRENAMIENTO, <span style="color: #ffffff;">${decodedFullName}</span>!</h1>
                    </div>
                    <div style="background-color: #2a2a2a; padding: 25px; border-radius: 10px; margin-bottom: 30px; border-left: 4px solid #00FFCC;">
                        <h2 style="color: #00FFCC; font-size: 24px; margin: 0 0 8px 0; font-weight: 600;">Tu Diagnóstico de Dominio en IA</h2>
                        <p style="font-size: 16px; color: #e0e0e0; line-height: 1.8; margin: 0; white-space: pre-line;">${decodedMessage}</p>
                    </div>
                    <div style="text-align: center; margin: 40px 0;">
                        <h2 style="color: #ffffff; font-size: 24px; margin-bottom: 15px; font-weight: 600;">Tu Clave de Acceso</h2>
                        <p style="font-size: 16px; color: #ccc; margin-bottom: 20px;">Activá esta clave en <b style="color: #00FFCC;">STANNUM Game</b> para comenzar tu entrenamiento:</p>
                        <div style="background-color: #00FFCC; padding: 20px; border-radius: 10px; display: inline-block; margin: 20px 0; box-shadow: 0 4px 15px rgba(0, 255, 204, 0.3);">
                            <h3 style="color: #000000; font-size: 36px; letter-spacing: 4px; font-weight: 900; margin: 0;">${code}</h3>
                        </div>
                        <a href="https://stannumgame.com" style="display: inline-block; background-color: #00FFCC; color: #1f1f1f; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; margin-top: 10px; transition: transform 0.2s;">Activar Clave Ahora</a>
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
        try {
            await transporter.sendMail(mailOptions);
        } catch (error) {
            return res.status(500).json(getError("NETWORK_CONNECTION_ERROR"));
        }

        return res.status(201).json({ code, email });
    } catch (error) {
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
            const existingKey = await ProductKey.findOne({ code: candidate });
            if (!existingKey) { code = candidate; break; }
        }
        if (!code) return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));

        await ProductKey.create({
            code,
            email: email.toLowerCase().trim(),
            product,
            team,
        });

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
        } catch (error) {
            return res.status(500).json(getError("NETWORK_CONNECTION_ERROR"));
        }
        
        return res.status(201).json({ code, email: email.toLowerCase().trim() });
    } catch (error) {
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
            const existingKey = await ProductKey.findOne({ code: candidate });
            if (!existingKey) { code = candidate; break; }
        }
        if (!code) return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));

        await ProductKey.create({
            code,
            email: email.toLowerCase().trim(),
            product,
            team,
        });

        return res.status(201).json({
            success: true,
            code,
            email: email.toLowerCase().trim()
        });
    } catch (error) {
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
            return res.status(404).json({
                success: false,
                code: "PRODUCT_KEY_NOT_FOUND",
                message: "Código no encontrado"
            });
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

module.exports = {
    verifyProductKey,
    activateProductKey,
    generateAndSendProductKeyMake,
    generateAndSendProductKey,
    generateProductKey,
    checkProductKeyStatus
};