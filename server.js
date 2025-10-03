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
    res.status(500).json("Database error");
  }
});

// ---------- Get user by id ----------
app.get("/users/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT user_id, username, email, avatar_url, wallet_balance, role FROM `User` WHERE user_id = ?",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json("User not found");
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json("Database error");
  }
});

// ---------- Register User ----------
app.post("/register/user", upload.single("avatar"), async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json("email, username, and password are required");
    }

    if (req.file && req.file.size > 10 * 1024 * 1024) {
      return res.status(413).json("ไฟล์รูปใหญ่เกิน 10MB");
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
      return res.status(413).json("ไฟล์รูปใหญ่เกิน 10MB");
    }
    console.error("Register error:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json("Email already exists");
    }
    res.status(500).json(err.message || "Database error");
  }
});

// ---------- Update avatar only ----------
app.put("/users/:id/avatar", upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json("avatar file is required");
    }

    if (req.file && req.file.size > 10 * 1024 * 1024) {
      return res.status(413).json("ไฟล์รูปใหญ่เกิน 10MB");
    }

    const processed = await processImageToWebpSquare(req.file.buffer);
    const uploaded = await uploadBufferToCloudinary(processed, "avatars");

    const [rs] = await pool.query(
      "UPDATE `User` SET avatar_url = ? WHERE user_id = ?",
      [uploaded.secure_url, req.params.id]
    );
    if (rs.affectedRows === 0) return res.status(404).json("User not found");

    res.json({ ok: true, avatar_url: uploaded.secure_url });
  } catch (e) {
    if (e && e.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json("ไฟล์รูปใหญ่เกิน 10MB");
    }
    console.error(e);
    res.status(500).json(e.message);
  }
});

// ---------- Login ----------
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json("email and password are required");
    }

    // หา user ใน DB
    const [rows] = await pool.query(
      "SELECT user_id, username, email, password, avatar_url, wallet_balance, role FROM `User` WHERE email = ?",
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = rows[0];

    if (user.password !== password) {
      return res.status(401).json("Invalid email or password");
    }

    // Login สำเร็จ
    res.json({
      message: "Login successful",
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        wallet_balance: user.wallet_balance,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json("Database error");
  }
});

// ---------- Update user (merge data) ----------
app.post("/users/update", upload.single("avatar"), async (req, res) => {
  try {
    const { user_id, username, email, password, wallet_balance, role } = req.body;

    if (!user_id) {
      return res.status(400).json("user_id is required");
    }

    // 1. ดึงข้อมูลเก่ามาก่อน
    const [rows] = await pool.query("SELECT * FROM `User` WHERE user_id = ?", [user_id]);
    if (rows.length === 0) return res.status(404).json("User not found");

    const oldUser = rows[0];

    // 2. Process avatar ถ้ามีไฟล์
    let avatarUrl = oldUser.avatar_url;
    if (req.file?.buffer) {
      if (req.file.size > 10 * 1024 * 1024) {
        return res.status(413).json("ไฟล์รูปใหญ่เกิน 10MB");
      }
      const processed = await processImageToWebpSquare(req.file.buffer);
      const uploaded = await uploadBufferToCloudinary(processed, "avatars");
      avatarUrl = uploaded.secure_url;
    }

    // 3. Merge data (ถ้า field ไม่ส่งมา → ใช้ของเก่า)
    const newUser = {
      username: username || oldUser.username,
      email: email || oldUser.email,
      password: password || oldUser.password,
      wallet_balance: wallet_balance ?? oldUser.wallet_balance,
      role: role || oldUser.role,
      avatar_url: avatarUrl,
    };

    // 4. UPDATE DB
    const [rs] = await pool.query(
      `UPDATE \`User\`
       SET username = ?, email = ?, password = ?, wallet_balance = ?, role = ?, avatar_url = ?
       WHERE user_id = ?`,
      [
        newUser.username,
        newUser.email,
        newUser.password,
        newUser.wallet_balance,
        newUser.role,
        newUser.avatar_url,
        user_id,
      ]
    );

    if (rs.affectedRows === 0) return res.status(404).json("User not found");

    res.json({
      message: "User updated successfully",
      user: { user_id, ...newUser },
    });
  } catch (e) {
    console.error("Update error:", e);
    res.status(500).json(e.message || "Database error");
  }
});


// ---------- Start Server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
