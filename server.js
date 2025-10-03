import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

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
  queueLimit: 0
});

// ---------- Test API ----------
app.get("/", (_, res) => res.send("API on Render 🚀"));

// ---------- Get all users ----------
app.get("/users", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT user_id, username, email, profile_image, wallet_balance, role FROM User"
    );

    const users = rows.map(user => ({
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      wallet_balance: user.wallet_balance,
      role: user.role,
      profile_image: user.profile_image ? true : false
    }));

    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ---------- Get user by id ----------
app.get("/users/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM User WHERE user_id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });

    const user = rows[0];
    res.json({
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      wallet_balance: user.wallet_balance,
      role: user.role,
      profile_image: user.profile_image ? true : false
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});