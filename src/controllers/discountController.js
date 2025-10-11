import pool from "../config/db.js";

/* ---------------------------- ดึงโค้ดส่วนลดที่ยังใช้ได้ ---------------------------- */
export async function getAllDiscounts(req, res) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `
      SELECT 
        dc.code_id,
        dc.code_name,
        dc.discount_value,
        dc.max_usage,
        COUNT(du.usage_id) AS used_count,
        (dc.max_usage - COUNT(du.usage_id)) AS remaining_uses
      FROM DiscountCode dc
      LEFT JOIN DiscountUsage du ON dc.code_id = du.code_id
      GROUP BY dc.code_id
      HAVING remaining_uses > 0 AND dc.max_usage > 0
      ORDER BY dc.code_id DESC;
      `
    );

    res.json({
      message: "📋 ดึงรายการโค้ดส่วนลดที่ยังใช้ได้สำเร็จ",
      total: rows.length,
      discounts: rows
    });
  } catch (error) {
    console.error("❌ getAllDiscounts error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    connection.release();
  }
}