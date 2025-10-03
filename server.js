// server.js
import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

import multer from "multer";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ---------- MySQL Connection Pool ----------
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ---------- Cloudinary Config ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ---------- Multer (in-memory, 10MB) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // <= 10MB
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    if (!ok) return cb(new Error("Only JPEG/PNG/WEBP allowed"));
    cb(null, true);
  },
});

// ---------- Helpers ----------
async function uploadBufferToCloudinary(buffer, folder = "avatars") {
  return await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image", format: "webp" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

async function processImageToWebpSquare(inputBuffer) {
  return await sharp(inputBuffer)
    .resize(512, 512, { fit: "cover" })
    .toFormat("webp", { quality: 90 })
    .toBuffer();
}

// ---------- Test API ----------
app.get("/", (_, res) => res.send("API on Render 🚀"));

// ---------- Get all users ----------
app.get("/users", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT user_id, username, email, avatar_url, wallet_balance, role FROM `User`"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ---------- Get user by id ----------
app.get("/users/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT user_id, username, email, avatar_url, wallet_balance, role FROM `User` WHERE user_id = ?",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ---------- Register User ----------
app.post("/register/user", upload.single("avatar"), async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ error: "email, username, and password are required" });
    }

    if (req.file && req.file.size > 10 * 1024 * 1024) {
      return res.status(413).json({ error: "ไฟล์รูปใหญ่เกิน 10MB" });
    }

    let avatarUrl = null;
    if (req.file?.buffer) {
      const processed = await processImageToWebpSquare(req.file.buffer);
      const uploaded = await uploadBufferToCloudinary(processed, "avatars");
      avatarUrl = uploaded.secure_url;
    }

    const [result] = await pool.query(
      "INSERT INTO `User` (username, email, password, avatar_url, role) VALUES (?, ?, ?, ?, ?)",
      [username, email, password, avatarUrl, "user"]
    );

    res.status(201).json({
      message: "User registered successfully",
      user_id: result.insertId,
      avatar_url: avatarUrl,
    });
  } catch (err) {
    if (err && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "ไฟล์รูปใหญ่เกิน 10MB" });
    }
    console.error("Register error:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: err.message || "Database error" });
  }
});

// ---------- Update avatar only ----------
app.put("/users/:id/avatar", upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "avatar file is required" });
    }

    if (req.file && req.file.size > 10 * 1024 * 1024) {
      return res.status(413).json({ error: "ไฟล์รูปใหญ่เกิน 10MB" });
    }

    const processed = await processImageToWebpSquare(req.file.buffer);
    const uploaded = await uploadBufferToCloudinary(processed, "avatars");

    const [rs] = await pool.query(
      "UPDATE `User` SET avatar_url = ? WHERE user_id = ?",
      [uploaded.secure_url, req.params.id]
    );
    if (rs.affectedRows === 0) return res.status(404).json({ error: "User not found" });

    res.json({ ok: true, avatar_url: uploaded.secure_url });
  } catch (e) {
    if (e && e.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "ไฟล์รูปใหญ่เกิน 10MB" });
    }
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
