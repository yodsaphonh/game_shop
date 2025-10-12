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
    const { game_id, deleted_by } = req.body;

    if (!game_id || !deleted_by) {
      return res.status(400).json("game_id และ deleted_by จำเป็นต้องระบุ");
    }

    const isAdmin = await checkAdmin(deleted_by);
    if (!isAdmin) {
      return res.status(403).json("Only admin can delete games");
    }

    const [rows] = await pool.query("SELECT * FROM Game WHERE game_id = ?", [game_id]);
    if (rows.length === 0) {
      return res.status(404).json("Game not found");
    }

    await pool.query("DELETE FROM Game WHERE game_id = ?", [game_id]);

    res.json({ message: "Game deleted successfully" });
  } catch (err) {
    console.error("❌ Delete game error:", err);
    if (err.message === "User not found") return res.status(404).json(err.message);
    res.status(500).json("Database error");
  }
}


/* ---------------------------- SEARCH GAME ---------------------------- */
export async function searchGames(req, res) {
  try {
    const { name, category_id } = req.query;

    // ถ้าไม่ใส่อะไรเลย -> คืนทุกเกม
    if (!name && !category_id) {
      const [rows] = await pool.query(`
        SELECT g.*, c.category_name
        FROM Game g
        LEFT JOIN GameCategory c ON g.category_id = c.category_id
        ORDER BY g.game_id DESC
      `);
      return res.json(rows);
    }

    // สร้าง query แบบ flexible
    let sql = `
      SELECT g.*, c.category_name
      FROM Game g
      LEFT JOIN GameCategory c ON g.category_id = c.category_id
      WHERE 1=1
    `;
    const params = [];

    // ค้นตามชื่อเกม (ถ้ามี)
    if (name) {
      sql += " AND g.name LIKE ?";
      params.push(`%${name}%`);
    }

    // ค้นตาม category_id เดี่ยว (ถ้ามี)
    if (category_id !== undefined) {
      const id = Number(category_id);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "category_id ต้องเป็นเลขจำนวนเต็ม" });
      }
      sql += " AND g.category_id = ?";
      params.push(id);
    }

    sql += " ORDER BY g.game_id DESC";

    const [rows] = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error("Search games error:", err);
    return res.status(500).json("Database error");
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

export async function getPurchasedGames(req, res) {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        gp.purchase_id,
        gp.purchase_date,
        g.game_id,
        g.name AS game_name,
        g.price,
        g.description,
        g.cover_url,
        gc.category_name
      FROM GamePurchase gp
      JOIN Game g ON gp.game_id = g.game_id
      LEFT JOIN GameCategory gc ON g.category_id = gc.category_id
      WHERE gp.user_id = ?
      ORDER BY gp.purchase_date DESC
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.json({
        message: "ยังไม่มีเกมที่ซื้อในระบบ",
        total: 0,
        games: [],
      });
    }

    res.json({
      message: "ดึงรายการเกมที่ซื้อสำเร็จ 🎮",
      total: rows.length,
      games: rows.map((g) => ({
        purchase_id: g.purchase_id,
        game_id: g.game_id,
        game_name: g.game_name,
        price: g.price,
        category: g.category_name,
        description: g.description,
        cover_url: g.cover_url,
        purchase_date: g.purchase_date,
      })),
    });
  } catch (error) {
    console.error("❌ getPurchasedGames error:", error);
    res.status(500).json({ error: "Database error" });
  }
}


/* ---------------------------- จัดอันดับเกมขายดี TOP 5 ---------------------------- */
export async function getTopSellingGames(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        g.game_id,
        g.name AS game_name,
        g.price,
        g.cover_url,
        gc.category_name,
        COUNT(gp.game_id) AS total_sales
      FROM GamePurchase gp
      JOIN Game g ON gp.game_id = g.game_id
      LEFT JOIN GameCategory gc ON g.category_id = gc.category_id
      GROUP BY g.game_id, g.name, g.price, g.cover_url, gc.category_name
      ORDER BY total_sales DESC
      LIMIT 5
      `
    );

    if (rows.length === 0) {
      return res.json({
        message: "ยังไม่มีข้อมูลการขายเกม",
        ranking: [],
      });
    }

    res.json({
      message: "จัดอันดับเกมขายดีสำเร็จ 🏆",
      ranking: rows.map((g, index) => ({
        rank: index + 1,
        game_id: g.game_id,
        game_name: g.game_name,
        category: g.category_name,
        price: g.price,
        total_sales: g.total_sales,
        cover_url: g.cover_url,
      })),
    });
  } catch (err) {
    console.error("❌ getTopSellingGames error:", err);
    res.status(500).json({ error: "Database error" });
  }
}
