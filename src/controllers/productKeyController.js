const nodemailer = require("nodemailer");

const ProductKey = require("../models/productKeyModel");
const User = require("../models/userModel");
const { unlockAchievements } = require("../services/achievementsService");
const { getError } = require("../helpers/getError");

const generateProductCode = () => {
    const segment = () =>
    Array.from({ length: 4 }, () =>
        Math.floor(Math.random() * 36).toString(36).toUpperCase()
    ).join("");
    return `${segment()}-${segment()}-${segment()}-${segment()}`;
};

const createProductKey = async () => {
    const newKeyData = {
        code: generateProductCode(),
        email: "stannum@stannum.com.ar",
        product: "tia",
        team: "no_team",
    };
  
    try {
        const existing = await ProductKey.findOne({ code: newKeyData.code });
        if (existing) {
            console.log("⚠️ Código duplicado generado. Intentando de nuevo...");
            return await createProductKey();
        }
    
        const key = await ProductKey.create(newKeyData);
        console.log("✅ Clave de producto creada:", key);
    } catch (err) {
        console.error("❌ Error creando clave:", err);
    }
};

const verifyProductKey = async (req, res) => {
    try {
        const { code } = req.params;
        if (!code) return res.status(400).json(getError("VALIDATION_PRODUCT_KEY_REQUIRED"));
        
        const key = await ProductKey.findOne({ code: code.toUpperCase() });
        if (!key) return res.status(404).json(getError("VALIDATION_PRODUCT_KEY_NOT_FOUND"));
        
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
        
        const key = await ProductKey.findOne({ code: code.toUpperCase() });
        if (!key) return res.status(404).json(getError("VALIDATION_PRODUCT_KEY_NOT_FOUND"));
        if (key.used) return res.status(400).json(getError("VALIDATION_PRODUCT_KEY_ALREADY_USED"));
    
        const user = await User.findById(userId);
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));
        
        const alreadyHasProduct = user.programs?.[key.product]?.isPurchased;
        if (alreadyHasProduct) return res.status(400).json(getError("VALIDATION_PRODUCT_ALREADY_OWNED"));
        
        user.programs[key.product].isPurchased = true;
        user.programs[key.product].acquiredAt = new Date();
        
        const alreadyInTeam = user.teams.some(t => t.programName === key.product);
        if (!alreadyInTeam && key.team?.teamName && key.team?.role) {
            user.teams.push({
                programName: key.product,
                teamName: key.team.teamName,
                role: key.team.role,
            });
        }
    
        const { newlyUnlocked } = await unlockAchievements(user);
        await user.save();
        await ProductKey.findByIdAndUpdate(key._id, {
            used: true,
            usedAt: new Date(),
            usedBy: userId,
        });

        return res.status(200).json({ success: true, message: "Programa activado correctamente.", achievementsUnlocked: newlyUnlocked });
    } catch (error) {
        console.error("Error al activar la clave de producto:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const generateAndSendProductKey = async (req, res) => {
    const { email, fullName, message, product = "tia", team = "no_team" } = req.body;
    try {
        if (!email) return res.status(400).json(getError("VALIDATION_EMAIL_REQUIRED"));
        if (!fullName) return res.status(400).json(getError("VALIDATION_FULLNAME_REQUIRED"));
        if (!message) return res.status(400).json(getError("VALIDATION_DIAGNOSIS_REQUIRED"));

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return res.status(400).json(getError("VALIDATION_EMAIL_INVALID"));

        let decodedMessage;
        try {
            decodedMessage = Buffer.from(message, 'base64').toString('utf-8');
            console.log("✅ Mensaje decodificado correctamente");
        } catch (error) {
            console.error("❌ Error decodificando Base64:", error.message);
            return res.status(400).json(getError("VALIDATION_MESSAGE_INVALID_ENCODING"));
        }

        const code = generateProductCode();
        const existingKey = await ProductKey.findOne({ code });
        if (existingKey) return generateAndSendProductKey(req, res);

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

        const mailOptions = {
            from: `"STANNUM Game" <${process.env.SMTP_EMAIL}>`,
            to: email,
            subject: "🎯 Tu Diagnóstico IA + Acceso a STANNUM Game",
            html: `
                <div style="background-color: #1f1f1f; color: #fff; font-family: Arial, sans-serif; padding: 30px; border-radius: 12px; max-width: 700px; margin: auto;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <img src="data:image/png;base64,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" alt="STANNUM Logo" style="max-width: 180px; margin-bottom: 20px;" />
                        <h1 style="color: #00FFCC; font-size: 32px; font-weight: 700; margin: 0;">¡Bienvenido al juego, <span style="color: #ffffff;">${fullName}</span>!</h1>
                    </div>
                    <div style="background-color: #2a2a2a; padding: 25px; border-radius: 10px; margin-bottom: 30px; border-left: 4px solid #00FFCC;">
                        <h2 style="color: #00FFCC; font-size: 24px; margin: 0 0 8px 0; font-weight: 600;">Tu Diagnóstico de Dominio en IA</h2>
                        <p style="font-size: 16px; color: #e0e0e0; line-height: 1.8; margin: 0; white-space: pre-line;">${decodedMessage}</p>
                    </div>
                    <div style="text-align: center; margin: 40px 0;">
                        <h2 style="color: #ffffff; font-size: 24px; margin-bottom: 15px; font-weight: 600;">Tu Clave de Acceso</h2>
                        <p style="font-size: 16px; color: #ccc; margin-bottom: 20px;">Activá esta clave en <b style="color: #00FFCC;">STANNUM Game</b> para comenzar tu entrenamiento:</p>
                        <div style="background: linear-gradient(135deg, #00FFCC 0%, #00A896 100%); padding: 20px; border-radius: 10px; display: inline-block; margin: 20px 0; box-shadow: 0 4px 15px rgba(0, 255, 204, 0.3);">
                            <h3 style="color: #1f1f1f; font-size: 36px; letter-spacing: 4px; font-weight: 900; margin: 0; text-shadow: 1px 1px 3px rgba(0,0,0,0.2);">${code}</h3>
                        </div>
                        <a href="https://stannumgame.com" style="display: inline-block; background-color: #00FFCC; color: #1f1f1f; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; margin-top: 10px; transition: transform 0.2s;">Activar Clave Ahora</a>
                    </div>
                    <hr style="border: none; border-top: 1px solid #515151; margin: 40px 0;" />
                    <div style="margin: 30px 0;">
                        <h2 style="color: #00FFCC; font-size: 24px; margin-bottom: 20px; font-weight: 600; text-align: center;">Preparate para el Entrenamiento</h2>
                        <div style="background-color: #2a2a2a; padding: 20px; border-radius: 8px; margin-bottom: 15px;">
                            <h3 style="color: #ffffff; font-size: 18px; margin: 0 0 10px 0; font-weight: 600;">Guía del Participante</h3>
                            <p style="font-size: 15px; color: #ccc; line-height: 1.6; margin: 0 0 15px 0;">Descargá tu guía completa para prepararte antes del entrenamiento. Incluye todo lo que necesitás saber para aprovechar al máximo la experiencia.</p>
                            <a href="https://claude.ai/public/artifacts/aa1f03fa-47c5-4262-b922-dc155e0e9f86" target="_blank" style="display: inline-block; background-color: #00A896; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Ver Guía ahora</a>
                        </div>
                        <div style="background-color: #2a2a2a; padding: 20px; border-radius: 8px;">
                            <h3 style="color: #ffffff; font-size: 18px; margin: 0 0 10px 0; font-weight: 600;">Comunidad TRENNO IA XTREME</h3>
                            <p style="font-size: 15px; color: #ccc; line-height: 1.6; margin: 0 0 15px 0;">Unite a la comunidad de líderes que están viviendo la experiencia TRENNO IA XTREME Buenos Aires. Conectá, compartí y entrená con otros emprendedores de alto rendimiento.</p>
                            <a href="https://chat.whatsapp.com/K6IAVIxEG4aI9Fl7wuteDn" target="_blank" style="display: inline-block; background-color: #25D366; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Unirme al Grupo</a>
                        </div>
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
        
        return res.status(201).json({ code, email });
    } catch (error) {
        console.error("❌ Error generando clave de producto con Make:", error.message);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

module.exports = { verifyProductKey, activateProductKey, generateAndSendProductKey };