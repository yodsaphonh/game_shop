import pool from "../config/db.js";

/* ---------------------------- ดูประวัติของผู้ใช้ (เฉพาะแอดมิน) ---------------------------- */
export async function getUserActivityByAdmin(req, res) {
  const { admin_id, user_id } = req.body;

  if (!admin_id || !user_id) {
    return res.status(400).json({ error: "admin_id และ user_id จำเป็นต้องระบุ" });
  }

  const connection = await pool.getConnection();
  try {
    const [adminRows] = await connection.query(
      "SELECT role FROM User WHERE user_id = ?",
      [admin_id]
    );
    if (adminRows.length === 0) throw new Error("ไม่พบผู้ดูแลระบบ");
    if (adminRows[0].role !== "admin") throw new Error("ไม่มีสิทธิ์เข้าถึงข้อมูลนี้");

    const [walletHistory] = await connection.query(
      `
      SELECT 
        wt.transaction_id,
        wt.type,
        wt.amount,
        wt.date
      FROM WalletTransaction wt
      WHERE wt.user_id = ?
      ORDER BY wt.date DESC
      `,
      [user_id]
    );

    const [purchaseHistory] = await connection.query(
      `
      SELECT 
        gp.purchase_id,
        gp.purchase_date,
        g.game_id,
        g.name AS game_name,
        g.price,
        gc.category_name
      FROM GamePurchase gp
      JOIN Game g ON gp.game_id = g.game_id
      LEFT JOIN GameCategory gc ON g.category_id = gc.category_id
      WHERE gp.user_id = ?
      ORDER BY gp.purchase_date DESC
      `,
      [user_id]
    );

    res.json({
      message: "แอดมินดึงประวัติของผู้ใช้สำเร็จ",
      user_id,
      wallet_transaction_count: walletHistory.length,
      game_purchase_count: purchaseHistory.length,
      wallet_history: walletHistory,
      purchase_history: purchaseHistory,
    });
  } catch (error) {
    console.error("getUserActivityByAdmin error:", error);
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
}

/* ---------------------------- จัดการโค้ดส่วนลด (เฉพาะแอดมิน) ---------------------------- */

// ✅ เพิ่มโค้ดส่วนลดใหม่
export async function createDiscountByAdmin(req, res) {
  const { admin_id, code_name, discount_value, max_usage } = req.body;

  if (!admin_id || !code_name || !discount_value || !max_usage) {
    return res.status(400).json({ error: "admin_id, code_name, discount_value, max_usage จำเป็นต้องระบุ" });
  }

  const connection = await pool.getConnection();
  try {
    // ตรวจสอบสิทธิ์แอดมิน
    const [adminRows] = await connection.query("SELECT role FROM User WHERE user_id = ?", [admin_id]);
    if (adminRows.length === 0) throw new Error("ไม่พบผู้ดูแลระบบ");
    if (adminRows[0].role !== "admin") throw new Error("ไม่มีสิทธิ์เพิ่มโค้ดส่วนลด");

    // ตรวจชื่อโค้ดซ้ำ
    const [exists] = await connection.query("SELECT * FROM DiscountCode WHERE code_name = ?", [code_name]);
    if (exists.length > 0) throw new Error("ชื่อโค้ดนี้ถูกใช้ไปแล้ว");

    await connection.query(
      "INSERT INTO DiscountCode (code_name, discount_value, max_usage) VALUES (?, ?, ?)",
      [code_name, discount_value, max_usage]
    );

    res.json({ message: "เพิ่มโค้ดส่วนลดสำเร็จ" });
  } catch (error) {
    console.error("createDiscountByAdmin error:", error);
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
}

export async function getAllDiscountsByAdmin(req, res) {
  const { admin_id } = req.body;
  const connection = await pool.getConnection();

  try {
    const [adminRows] = await connection.query("SELECT role FROM User WHERE user_id = ?", [admin_id]);
    if (adminRows.length === 0) throw new Error("ไม่พบผู้ดูแลระบบ");
    if (adminRows[0].role !== "admin") throw new Error("ไม่มีสิทธิ์เข้าถึงข้อมูลนี้");

    const [rows] = await connection.query("SELECT * FROM DiscountCode ORDER BY code_id DESC");
    res.json(rows);
  } catch (error) {
    console.error("getAllDiscountsByAdmin error:", error);
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
}

export async function updateDiscountByAdmin(req, res) {
  const { admin_id, code_id, code_name, discount_value, max_usage } = req.body;
  const connection = await pool.getConnection();

  try {
    const [adminRows] = await connection.query("SELECT role FROM User WHERE user_id = ?", [admin_id]);
    if (adminRows.length === 0) throw new Error("ไม่พบผู้ดูแลระบบ");
    if (adminRows[0].role !== "admin") throw new Error("ไม่มีสิทธิ์แก้ไขโค้ดส่วนลด");

    const [exists] = await connection.query("SELECT * FROM DiscountCode WHERE code_id = ?", [code_id]);
    if (exists.length === 0) throw new Error("ไม่พบโค้ดส่วนลดนี้");

    await connection.query(
      `
      UPDATE DiscountCode 
      SET code_name = COALESCE(?, code_name),
          discount_value = COALESCE(?, discount_value),
          max_usage = COALESCE(?, max_usage)
      WHERE code_id = ?
      `,
      [code_name, discount_value, max_usage, code_id]
    );

    res.json({ message: "อัปเดตโค้ดส่วนลดสำเร็จ"});
  } catch (error) {
    console.error("updateDiscountByAdmin error:", error);
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
}

export async function deleteDiscountByAdmin(req, res) {
  const { admin_id, code_id } = req.body;
  const connection = await pool.getConnection();

  try {
    const [adminRows] = await connection.query("SELECT role FROM User WHERE user_id = ?", [admin_id]);
    if (adminRows.length === 0) throw new Error("ไม่พบผู้ดูแลระบบ");
    if (adminRows[0].role !== "admin") throw new Error("ไม่มีสิทธิ์ลบโค้ดส่วนลด");

    const [exists] = await connection.query("SELECT * FROM DiscountCode WHERE code_id = ?", [code_id]);
    if (exists.length === 0) throw new Error("ไม่พบโค้ดส่วนลดนี้");

    await connection.query("DELETE FROM DiscountCode WHERE code_id = ?", [code_id]);
    res.json({ message: "ลบโค้ดส่วนลดสำเร็จ" });
  } catch (error) {
    console.error("deleteDiscountByAdmin error:", error);
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
}
