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
  console.log("🎯 [INICIO] Generación de clave de producto iniciada");
  console.log("📥 [REQUEST] Body recibido:", JSON.stringify(req.body, null, 2));
  console.log("🌐 [REQUEST] IP del cliente:", req.ip || req.connection.remoteAddress);
  console.log("🔑 [REQUEST] API Key recibida:", req.headers["x-api-key"] ? "✅ Presente" : "❌ Ausente");

  const { email, fullName, product = "tia", team = "no_team" } = req.body;

  try {
    // ✅ Validación de email
    console.log("🔍 [VALIDACIÓN] Validando email...");
    if (!email) {
      console.error("❌ [ERROR] Email no proporcionado");
      return res.status(400).json(getError("VALIDATION_EMAIL_REQUIRED"));
    }
    console.log("✅ [VALIDACIÓN] Email presente:", email);

    // ✅ Validación de fullName
    console.log("🔍 [VALIDACIÓN] Validando nombre completo...");
    if (!fullName) {
      console.error("❌ [ERROR] Nombre completo no proporcionado");
      return res.status(400).json(getError("VALIDATION_FULLNAME_REQUIRED"));
    }
    console.log("✅ [VALIDACIÓN] Nombre completo presente:", fullName);

    // ✅ Validación de formato de email
    console.log("🔍 [VALIDACIÓN] Validando formato de email...");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error("❌ [ERROR] Formato de email inválido:", email);
      return res.status(400).json(getError("VALIDATION_EMAIL_INVALID"));
    }
    console.log("✅ [VALIDACIÓN] Formato de email válido");

    // ✅ Generar código único
    console.log("🎲 [GENERACIÓN] Generando código de producto...");
    const code = generateProductCode();
    console.log("✅ [GENERACIÓN] Código generado:", code);

    // ✅ Verificar duplicados
    console.log("🔍 [DATABASE] Verificando si el código ya existe...");
    const existingKey = await ProductKey.findOne({ code });
    if (existingKey) {
      console.warn("⚠️ [DATABASE] Código duplicado detectado, reintentando...");
      return generateAndSendProductKey(req, res);
    }
    console.log("✅ [DATABASE] Código único confirmado");

    // ✅ Crear clave en DB
    console.log("💾 [DATABASE] Guardando clave en base de datos...");
    const newKey = await ProductKey.create({
      code,
      email: email.toLowerCase().trim(),
      product,
      team,
    });
    console.log("✅ [DATABASE] Clave guardada exitosamente:", {
      id: newKey._id,
      code: newKey.code,
      email: newKey.email,
      product: newKey.product,
    });

    // ✅ Configurar transporte de correo
    console.log("📧 [EMAIL] Configurando transporte de nodemailer...");
    let transporter;
    try {
      transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.SMTP_EMAIL,
          pass: process.env.SMTP_PASSWORD ? "✅ Configurada" : "❌ No configurada",
        },
      });
      console.log("✅ [EMAIL] Transporte configurado correctamente");
      console.log("📤 [EMAIL] Email de envío:", process.env.SMTP_EMAIL);
    } catch (error) {
      console.error("❌ [EMAIL] Error configurando transporte:", error.message);
      return res.status(500).json(getError("NETWORK_CONNECTION_ERROR"));
    }

    // ✅ Configurar opciones del correo
    console.log("📝 [EMAIL] Preparando contenido del correo...");
    const mailOptions = {
      from: `"STANNUM Game" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: "🎮 Tu clave de acceso a STANNUM Game",
      html: `
        <div style="background-color: #1f1f1f; color: #fff; font-family: Arial, sans-serif; padding: 30px; border-radius: 12px; max-width: 650px; margin: auto; text-align: center;">
          <img src="https://drive.google.com/uc?export=view&id=1nAyByJSrn774hiOe5s594il7mUwMYgWy" alt="STANNUM Logo" style="max-width: 180px; margin-bottom: 20px;" />
          <h1 style="color: #00FFCC; font-size: 32px; font-weight: 700; margin-bottom: 10px;">
            ¡Bienvenido al juego, <span style="color: #ffffff;">${fullName}</span>!
          </h1>
          <p style="font-size: 18px; color: #ccc; line-height: 1.8; margin-bottom: 20px;">
            Tu acceso a <b style="color: #00FFCC;">STANNUM Game</b> está listo. <br />
            Esta es tu clave de producto:
          </p>
          <div style="background: linear-gradient(135deg, #00FFCC 0%, #00A896 100%); padding: 20px; border-radius: 10px; display: inline-block; margin: 20px 0; box-shadow: 0 4px 15px rgba(0, 255, 204, 0.3);">
            <h2 style="color: #1f1f1f; font-size: 36px; letter-spacing: 4px; font-weight: 900; margin: 0; text-shadow: 1px 1px 3px rgba(0,0,0,0.2);">
              ${code}
            </h2>
          </div>
          <p style="font-size: 16px; color: #aaa; line-height: 1.8; margin-bottom: 30px;">
            Ingresá a tu cuenta en <a href="https://stannumgame.com" style="color: #00FFCC; text-decoration: none; font-weight: 600;">STANNUM Game</a>, <br />
            activá tu clave y comenzá tu entrenamiento de alto rendimiento.
          </p>
          <hr style="border: none; border-top: 1px solid #515151; margin: 30px 0;" />
          <p style="font-size: 14px; color: #888; line-height: 1.6; margin-bottom: 10px;">
            ¿No solicitaste esta clave? Ignorá este correo.
          </p>
          <p style="font-size: 14px; color: #aaa; margin-top: 20px;">
            Nos vemos en el campo de juego,<br />
            <span style="color: #00FFCC; font-weight: 600;">Equipo STANNUM</span>
          </p>
          <footer style="margin-top: 40px; font-size: 12px; color: #515151;">
            &copy; ${new Date().getFullYear()} STANNUM Game. Todos los derechos reservados.
          </footer>
        </div>
      `,
    };
    console.log("✅ [EMAIL] Contenido preparado");
    console.log("📬 [EMAIL] Destinatario:", email);

    // ✅ Enviar correo
    console.log("🚀 [EMAIL] Enviando correo...");
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("✅ [EMAIL] Correo enviado exitosamente");
      console.log("📧 [EMAIL] Message ID:", info.messageId);
      console.log("📧 [EMAIL] Response:", info.response);
    } catch (error) {
      console.error("❌ [EMAIL] Error enviando correo:", error.message);
      console.error("❌ [EMAIL] Stack trace:", error.stack);
      console.error("❌ [EMAIL] Código de error:", error.code);
      return res.status(500).json(getError("NETWORK_CONNECTION_ERROR"));
    }

    // ✅ Respuesta exitosa
    console.log("🎉 [SUCCESS] Proceso completado exitosamente");
    console.log("📤 [RESPONSE] Enviando respuesta al cliente");
    return res.status(201).json({
      code,
      email,
    });

  } catch (error) {
    console.error("❌ [ERROR CRÍTICO] Error inesperado en el proceso:");
    console.error("❌ [ERROR] Mensaje:", error.message);
    console.error("❌ [ERROR] Stack trace:", error.stack);
    console.error("❌ [ERROR] Nombre:", error.name);
    return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
  }
};

module.exports = { verifyProductKey, activateProductKey, generateAndSendProductKey };