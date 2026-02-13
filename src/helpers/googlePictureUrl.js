const axios = require("axios");
const { getError } = require("./getError");

const adjustGooglePictureUrl = (originalUrl, size = 1000) => {
    try {
        return originalUrl.replace(/=s\d+-c$/, `=s${size}-c`);
    } catch (error) {
        console.error("Error adjusting Google picture URL:", error);
        throw new Error(getError("PHOTO_URL_GENERATION_FAILED").techMessage);
    }
};

const downloadImage = async (url) => {
    try {
        const response = await axios.get(url, { responseType: "arraybuffer" });
        return Buffer.from(response.data, "binary");
    } catch (error) {
        console.error("Error downloading image from Google:", error);
        throw new Error(getError("PHOTO_DOWNLOAD_FAILED").techMessage);
    }
  };

module.exports = { adjustGooglePictureUrl, downloadImage };