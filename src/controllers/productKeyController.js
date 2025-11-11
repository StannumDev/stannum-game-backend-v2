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
  const { email, fullName, product = "tia", team = "no_team" } = req.body;
  try {
    if (!email) return res.status(400).json(getError("VALIDATION_EMAIL_REQUIRED"));
    if (!fullName) return res.status(400).json(getError("VALIDATION_FULLNAME_REQUIRED"));

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json(getError("VALIDATION_EMAIL_INVALID"));

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
        });
    } catch (error) {
        return res.status(500).json(getError("NETWORK_CONNECTION_ERROR"));
    }

    const mailOptions = {
        from: `"STANNUM Game" <${process.env.SMTP_EMAIL}>`,
        to: email,
        subject: "🎮 Tu clave de acceso a STANNUM Game",
        html: `
            <div style="background-color: #1f1f1f; color: #fff; font-family: Arial, sans-serif; padding: 30px; border-radius: 12px; max-width: 650px; margin: auto; text-align: center;">
                <img src="https://drive.google.com/uc?export=view&id=1nAyByJSrn774hiOe5s594il7mUwMYgWy" alt="STANNUM Logo" style="max-width: 180px; margin-bottom: 20px;" />
                <h1 style="color: #00FFCC; font-size: 32px; font-weight: 700; margin-bottom: 10px;">¡Bienvenido al juego, <span style="color: #ffffff;">${fullName}</span>!</h1>
                <p style="font-size: 18px; color: #ccc; line-height: 1.8; margin-bottom: 20px;">Tu acceso a <b style="color: #00FFCC;">STANNUM Game</b> está listo. <br /> Esta es tu clave de producto:</p>
                <div style="background: linear-gradient(135deg, #00FFCC 0%, #00A896 100%); padding: 20px; border-radius: 10px; display: inline-block; margin: 20px 0; box-shadow: 0 4px 15px rgba(0, 255, 204, 0.3);">
                    <h2 style="color: #1f1f1f; font-size: 36px; letter-spacing: 4px; font-weight: 900; margin: 0; text-shadow: 1px 1px 3px rgba(0,0,0,0.2);">${code}</h2>
                </div>
                <p style="font-size: 16px; color: #aaa; line-height: 1.8; margin-bottom: 30px;">Ingresá a tu cuenta en <a href="https://stannumgame.com" style="color: #00FFCC; text-decoration: none; font-weight: 600;">STANNUM Game</a>, <br />activá tu clave y comenzá tu entrenamiento de alto rendimiento.</p>
                <hr style="border: none; border-top: 1px solid #515151; margin: 30px 0;" />
                <p style="font-size: 14px; color: #888; line-height: 1.6; margin-bottom: 10px;">¿No solicitaste esta clave? Ignorá este correo.</p>
                <p style="font-size: 14px; color: #aaa; margin-top: 20px;">Nos vemos en el campo de juego,<br /> <span style="color: #00FFCC; font-weight: 600;">Equipo STANNUM</span></p>
                <footer style="margin-top: 40px; font-size: 12px; color: #515151;">&copy; ${new Date().getFullYear()} STANNUM Game. Todos los derechos reservados.</footer>
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