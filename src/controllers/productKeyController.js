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
        } catch (error) {
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
            subject: "Tu Diagnóstico IA + Acceso a STANNUM Game",
            html: `
                <div style="background-color: #1f1f1f; color: #fff; font-family: Arial, sans-serif; padding: 30px; border-radius: 12px; max-width: 700px; margin: auto;">
                    <div style="text-align: center; margin-bottom: 30px;">
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