import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadBufferToCloudinary(buffer, folder = "avatars") {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image", format: "webp" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

export async function processImageToWebpSquare(inputBuffer) {
  return await sharp(inputBuffer)
    .resize(512, 512, { fit: "cover" }) // อัตราส่วน 1:1
    .toFormat("webp", { quality: 90 })
    .toBuffer();
}

/* ------------------ Resize Rectangle (Game Cover) ------------------ */
export async function processImageToWebpRectangle(inputBuffer) {
  return await sharp(inputBuffer)
    .resize(1280, 720, { fit: "cover" })  // อัตราส่วน 16:9
    .toFormat("webp", { quality: 90 })
    .toBuffer();
}