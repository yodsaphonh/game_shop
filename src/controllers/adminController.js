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

    // ✅ 4. รวมข้อมูลและส่งออก
    res.json({
      message: "แอดมินดึงประวัติของผู้ใช้สำเร็จ ✅",
      user_id,
      wallet_transaction_count: walletHistory.length,
      game_purchase_count: purchaseHistory.length,
      wallet_history: walletHistory,
      purchase_history: purchaseHistory,
    });
  } catch (error) {
    console.error("❌ getUserActivityByAdmin error:", error);
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
}
