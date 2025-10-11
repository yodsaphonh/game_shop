import pool from "../config/db.js";
import { uploadBufferToCloudinary, processImageToWebpSquare } from "../utils/cloudinary.js";

export async function getAllUsers(req, res) {
  try {
    const [rows] = await pool.query("SELECT * FROM `User`");
    res.json(rows);
  } catch (err) {
    res.status(500).json("Database error");
  }
}

/* ---------------------------- GET ALL ADMINS ---------------------------- */
export async function getAllAdmins(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT user_id, username, email, role, wallet_balance FROM User WHERE role = 'admin'"
    );

    if (rows.length === 0) {
      return res.status(404).json("No admin users found");
    }

    res.json({
      message: "Admin users fetched successfully",
      admins: rows
    });
  } catch (err) {
    console.error("Get admins error:", err);
    res.status(500).json("Database error");
  }
}

export async function getUserById(req, res) {
  try {
    const [rows] = await pool.query("SELECT * FROM `User` WHERE user_id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json("User not found");
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json("Database error");
  }
}

export async function registerUser(req, res) {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password)
      return res.status(400).json("email, username, and password required");

    let avatarUrl = null;
    if (req.file?.buffer) {
      const processed = await processImageToWebpSquare(req.file.buffer);
      const uploaded = await uploadBufferToCloudinary(processed);
      avatarUrl = uploaded.secure_url;
    }

    const [result] = await pool.query(
      "INSERT INTO `User` (username, email, password, avatar_url, role) VALUES (?, ?, ?, ?, ?)",
      [username, email, password, avatarUrl, "user"]
    );

    res.status(201).json({ message: "Registered", user_id: result.insertId, avatar_url: avatarUrl });
  } catch (err) {
    res.status(500).json(err.message);
  }
}

export async function loginUser(req, res) {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query("SELECT * FROM `User` WHERE email = ?", [email]);
    if (rows.length === 0 || rows[0].password !== password)
      return res.status(401).json("Invalid email or password");

    res.json({ message: "Login successful", user: rows[0] });
  } catch (err) {
    res.status(500).json("Database error");
  }
}

export async function updateUser(req, res) {
  try {
    const { user_id, username } = req.body;
    if (!user_id) return res.status(400).json("user_id required");

    const [rows] = await pool.query("SELECT * FROM `User` WHERE user_id = ?", [user_id]);
    if (rows.length === 0) return res.status(404).json("User not found");

    const oldUser = rows[0];
    let avatarUrl = oldUser.avatar_url;

    if (req.file?.buffer) {
      const processed = await processImageToWebpSquare(req.file.buffer);
      const uploaded = await uploadBufferToCloudinary(processed);
      avatarUrl = uploaded.secure_url;
    }

    const [rs] = await pool.query(
      "UPDATE `User` SET username = ?, avatar_url = ? WHERE user_id = ?",
      [username || oldUser.username, avatarUrl, user_id]
    );

    res.json({ message: "Updated", user: { user_id, username, avatarUrl } });
  } catch (err) {
    res.status(500).json(err.message);
  }
}

