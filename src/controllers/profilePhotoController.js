const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const sharp = require("sharp");
const { getError } = require("../helpers/getError");
const { adjustGooglePictureUrl, downloadImage } = require("../helpers/googlePictureUrl");
const User = require("../models/userModel");

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const getPresignedPhotoUrl = async (req, res) => {
    const userId = req.userAuth.id;

    try {
        const s3Key = `${process.env.AWS_S3_FOLDER_NAME}/${userId}`;

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
            ContentType: "image/jpeg",
        });

        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

        return res.status(200).json({ success: true, presignedUrl, s3Key });
    } catch (error) {
        console.error("Error generating presigned URL for photo:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const confirmPhotoUpload = async (req, res) => {
    const userId = req.userAuth.id;

    try {
        await User.findByIdAndUpdate(userId, { "preferences.hasProfilePhoto": true });
        return res.status(200).json({ success: true, message: "Profile photo uploaded successfully." });
    } catch (error) {
        console.error("Error confirming photo upload:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getPhoto = async (req, res) => {
    const userId = req.userAuth.id;

    try {
        const profilePhotoUrl = `${process.env.AWS_S3_BASE_URL}/${process.env.AWS_S3_FOLDER_NAME}/${userId}`;
        return res.status(200).json({ success: true, url: profilePhotoUrl });
    } catch (error) {
        console.error("Error fetching photo:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const getPhotoByUsername = async (req, res) => {
    const { username } = req.params;

    try {
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) return res.status(404).json(getError("AUTH_USER_NOT_FOUND"));

        const profilePhotoUrl = `${process.env.AWS_S3_BASE_URL}/${process.env.AWS_S3_FOLDER_NAME}/${user.id}`;
        return res.status(200).json({ success: true, url: profilePhotoUrl });
    } catch (error) {
        console.error("Error fetching photo by username:", error);
        return res.status(500).json(getError("SERVER_INTERNAL_ERROR"));
    }
};

const deletePhoto = async (req, res) => {
    const userId = req.userAuth.id;

    try {
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `${process.env.AWS_S3_FOLDER_NAME}/${userId}`,
        };

        const command = new DeleteObjectCommand(params);
        await s3Client.send(command);
        await User.findByIdAndUpdate(userId, { "preferences.hasProfilePhoto": false });
        return res.status(200).json({ success: true, message: "Profile photo deleted successfully." });
    } catch (error) {
        console.error("Error deleting photo:", error);
        return res.status(500).json(getError("PHOTO_DELETION_FAILED"));
    }
};

const uploadGoogleProfilePhoto = async (googlePictureUrl, userId) => {
    try {
        const adjustedUrl = adjustGooglePictureUrl(googlePictureUrl, 1000);
        const imageBuffer = await downloadImage(adjustedUrl);

        const optimizedImage = await sharp(imageBuffer)
            .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();

        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `${process.env.AWS_S3_FOLDER_NAME}/${userId}`,
            Body: optimizedImage,
            ContentType: "image/jpeg",
            Metadata: {
                userId: userId.toString(),
            },
        };

        const command = new PutObjectCommand(params);
        await s3Client.send(command);
    } catch (error) {
        console.error("Error uploading Google profile photo to S3:", error);
        throw new Error(getError("GOOGLE_PHOTO_UPLOAD_FAILED").techMessage);
    }
};

module.exports = { getPresignedPhotoUrl, confirmPhotoUpload, getPhoto, getPhotoByUsername, deletePhoto, uploadGoogleProfilePhoto };