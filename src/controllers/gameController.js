import pool from "../config/db.js";
import { uploadBufferToCloudinary, processImageToWebpRectangle } from "../utils/cloudinary.js";

/* ---------------------------- Helper: ตรวจสอบสิทธิ์ ---------------------------- */
async function checkAdmin(user_id) {
  const [rows] = await pool.query("SELECT role FROM User WHERE user_id = ?", [user_id]);
  if (rows.length === 0) throw new Error("User not found");
  return rows[0].role === "admin";
}

/* ---------------------------- CREATE GAME ---------------------------- */
export async function createGame(req, res) {
  try {
    const { game_name, description, price, category_id, created_by } = req.body;
    const name = game_name;

    if (!name || !description || !price || !category_id || !created_by) {
      return res.status(400).json("game_name, description, price, category_id, created_by are required");
    }

    // ✅ ตรวจสอบว่าเป็น admin ก่อน
    const isAdmin = await checkAdmin(created_by);
    if (!isAdmin) return res.status(403).json("Only admin can create games");

    if (!req.file?.buffer) {
      return res.status(400).json("game cover image is required");
    }

    // Upload image
    const processed = await processImageToWebpRectangle(req.file.buffer);
    const uploaded = await uploadBufferToCloudinary(processed, "games");
    const cover_url = uploaded.secure_url;

    const [result] = await pool.query(
      `INSERT INTO Game (name, description, price, cover_url, category_id, created_by, release_date)
       VALUES (?, ?, ?, ?, ?, ?, CURDATE())`,
      [name, description, price, cover_url, category_id, created_by]
    );

    res.status(201).json({
      message: "Game created successfully",
      game_id: result.insertId,
      cover_url
    });
  } catch (err) {
    console.error("Create game error:", err);
    if (err.message === "User not found") return res.status(404).json(err.message);
    res.status(500).json("Database error");
  }
}

/* ---------------------------- READ ALL ---------------------------- */
export async function getAllGames(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT g.*, c.category_name
      FROM Game g
      LEFT JOIN GameCategory c ON g.category_id = c.category_id
      ORDER BY g.game_id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("Get all games error:", err);
    res.status(500).json("Database error");
  }
}

/* ---------------------------- READ ONE ---------------------------- */
export async function getGameById(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT g.*, c.category_name 
       FROM Game g 
       LEFT JOIN GameCategory c ON g.category_id = c.category_id
       WHERE g.game_id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json("Game not found");
    res.json(rows[0]);
  } catch (err) {
    console.error("Get game by ID error:", err);
    res.status(500).json("Database error");
  }
}

/* ---------------------------- UPDATE GAME ---------------------------- */
export async function updateGame(req, res) {
  try {
    const { game_id, game_name, description, price, category_id, updated_by } = req.body;
    const name = game_name;

    if (!game_id || !updated_by) {
      return res.status(400).json("game_id and updated_by are required");
    }

    // ✅ ตรวจสอบสิทธิ์
    const isAdmin = await checkAdmin(updated_by);
    if (!isAdmin) return res.status(403).json("Only admin can update games");

    const [rows] = await pool.query("SELECT * FROM Game WHERE game_id = ?", [game_id]);
    if (rows.length === 0) return res.status(404).json("Game not found");

    const oldGame = rows[0];
    let cover_url = oldGame.cover_url;

    // อัปโหลดภาพใหม่ (ถ้ามี)
    if (req.file?.buffer) {
      try {
        console.log("🟡 Uploading new game cover...");
        const processed = await processImageToWebpRectangle(req.file.buffer); 
        const uploaded = await uploadBufferToCloudinary(processed, "games");
        cover_url = uploaded.secure_url;
        console.log("✅ Upload success:", cover_url);
      } catch (err) {
        console.error("❌ Upload error:", err);
        return res.status(500).json("Image upload failed");
      }
    }


    await pool.query(
      `UPDATE Game
       SET name = ?, description = ?, price = ?, category_id = ?, cover_url = ?
       WHERE game_id = ?`,
      [
        name || oldGame.name,
        description || oldGame.description,
        price || oldGame.price,
        category_id || oldGame.category_id,
        cover_url,
        game_id
      ]
    );

    res.json({ message: "Game updated successfully", cover_url });
  } catch (err) {
    console.error("Update game error:", err);
    if (err.message === "User not found") return res.status(404).json(err.message);
    res.status(500).json("Database error");
  }
}

/* ---------------------------- DELETE GAME ---------------------------- */
export async function deleteGame(req, res) {
  try {
    const { id } = req.params;
    const { deleted_by } = req.body;

    if (!deleted_by) return res.status(400).json("deleted_by is required");

    // ✅ ตรวจสอบสิทธิ์
    const isAdmin = await checkAdmin(deleted_by);
    if (!isAdmin) return res.status(403).json("Only admin can delete games");

    const [rows] = await pool.query("SELECT * FROM Game WHERE game_id = ?", [id]);
    if (rows.length === 0) return res.status(404).json("Game not found");

    await pool.query("DELETE FROM Game WHERE game_id = ?", [id]);
    res.json({ message: "Game deleted successfully" });
  } catch (err) {
    console.error("Delete game error:", err);
    if (err.message === "User not found") return res.status(404).json(err.message);
    res.status(500).json("Database error");
  }
}

/* ---------------------------- SEARCH GAME ---------------------------- */
export async function searchGames(req, res) {
  try {
    const { name, category } = req.query;

    // ถ้าไม่ใส่อะไรเลย -> return ทุกเกม
    if (!name && !category) {
      const [rows] = await pool.query(`
        SELECT g.*, c.category_name
        FROM Game g
        LEFT JOIN GameCategory c ON g.category_id = c.category_id
        ORDER BY g.game_id DESC
      `);
      return res.json(rows);
    }

    // สร้างเงื่อนไขการค้นหาแบบ flexible
    let sql = `
      SELECT g.*, c.category_name
      FROM Game g
      LEFT JOIN GameCategory c ON g.category_id = c.category_id
      WHERE 1=1
    `;
    const params = [];

    if (name) {
      sql += " AND g.name LIKE ?";
      params.push(`%${name}%`);
    }

    if (category) {
      sql += " AND c.category_name LIKE ?";
      params.push(`%${category}%`);
    }

    sql += " ORDER BY g.game_id DESC";

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Search games error:", err);
    res.status(500).json("Database error");
  }
}

// ---------------------------- All Category Names ----------------------------
export async function getAllGameCategories(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT category_name FROM GameCategory ORDER BY category_id ASC"
    );
    res.json(rows);
  } catch (error) {
    console.error("❌ Get GameCategory error:", error);
    res.status(500).json({ error: "Database error" });
  }
}