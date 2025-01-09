const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const sharp = require("sharp");
const { getError } = require("../helpers/getError");
const User = require("../models/userModel");

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const uploadProfilePicture = async (req, res) => {
    const userId = req.userAuth.id;
    const file = req.file;
    try {
        if (!file) return res.status(400).json(getError("PHOTO_REQUIRED"));

        const fileSizeInMB = file.size / (1024 * 1024);
        if (fileSizeInMB > 20) return res.status(400).json(getError("PHOTO_FILE_TOO_LARGE"));

        let optimizedImage;
        try {
            optimizedImage = await sharp(file.buffer).resize(1000, 1000, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
        } catch (error) {
            console.error("Error processing photo:", error);
            return res.status(500).json(getError("PHOTO_PROCESSING_FAILED"));
        }

        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `profile_pictures/${userId}`,
            Body: optimizedImage,
            ContentType: file.mimetype,
            Metadata: {
                userId: userId.toString(),
                username: req.userAuth.username,
            },
        };

        try {
            const command = new PutObjectCommand(params);
            await s3Client.send(command);
        } catch (error) {
            console.error("Error uploading photo:", error);
            return res.status(500).json(getError("PHOTO_UPLOAD_FAILED"));
        }

        return res.status(200).json({ success: true, message: "Profile picture uploaded successfully." });
    } catch (error) {
        console.error("Error uploading profile picture:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getPhoto = async (req, res) => {
    const userId = req.userAuth.id;

    try {
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `profile_pictures/${userId}`,
        };

        const command = new GetObjectCommand(params);
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 604800 });

        return res.status(200).json({ success: true, url: signedUrl });
    } catch (error) {
        console.error("Error fetching photo:", error);
        if (error.name === "NotFound") return res.status(404).json(getError("PHOTO_NOT_FOUND"));
        return res.status(500).json(getError("PHOTO_URL_GENERATION_FAILED"));
    }
};

const getPhotoByUsername = async (req, res) => {
    const { username } = req.params;
    try {
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `profile_pictures/${user.id}`,
        };

        const command = new GetObjectCommand(params);
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 604800 });

        return res.status(200).json({ success: true, url: signedUrl });
    } catch (error) {
        console.error("Error fetching photo by username:", error);
        if (error.name === "NotFound") return res.status(404).json(getError("PHOTO_NOT_FOUND"));
        return res.status(500).json(getError("PHOTO_URL_GENERATION_FAILED"));
    }
};

const deletePhoto = async (req, res) => {
    const userId = req.userAuth.id;
    try {
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `profile_pictures/${userId}`,
        };

        const command = new DeleteObjectCommand(params);
        await s3Client.send(command);

        return res.status(200).json({ success: true, message: "Profile picture deleted successfully." });
    } catch (error) {
        console.error("Error deleting photo:", error);
        return res.status(500).json(getError("PHOTO_DELETION_FAILED"));
    }
};

module.exports = { uploadProfilePicture, getPhoto, getPhotoByUsername, deletePhoto };