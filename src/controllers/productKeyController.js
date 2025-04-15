const ProductKey = require("../models/productKeyModel");
const User = require("../models/userModel");
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
        email: "comprador@example.com",
        product: "TMD",
        team: "STANNUM",
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
        
        await User.findByIdAndUpdate( userId,
            {
                $set: {
                    [`programs.${key.product}`]: {
                        isPurchased: true,
                        activatedAt: new Date(),
                        team: key.team,
                        activatedByKey: true,
                    },
                },
            }, { new: true }
        );

        await ProductKey.findByIdAndUpdate(key._id, {
            used: true,
            usedAt: new Date(),
            usedBy: userId,
        });
        
        return res.status(200).json({ success: true, message: "Programa activado correctamente." });
    } catch (error) {
        console.error("Error al activar la clave de producto:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

module.exports = { verifyProductKey, activateProductKey };