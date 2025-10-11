// src/controllers/rankingController.js
import pool from "../config/db.js";

/**
 * POST /ranking/rebuild
 * คำนวณ Top-N จาก GamePurchase แล้ว INSERT ลง GameRanking ของ "วันนี้" (CURDATE).
 * Query/Body:
 *  - limit (number)  จำนวนอันดับที่ต้องการบันทึก (default 10)
 *  - days  (number)  ยอดขายย้อนหลัง n วัน (ถ้าไม่ส่ง = รวมทั้งหมด)
 *
 * หมายเหตุ:
 *  - JOIN Game เพื่อกัน game_id ที่ไม่มีอยู่จริง (ป้องกันชน FK)
 *  - ลบของวันนี้ทิ้งก่อน แล้วค่อยใส่ใหม่ทุกครั้ง (snapshot รายวัน)
 */
export async function rebuildTodayRanking(req, res) {
  const limit = Number(req.body.limit ?? req.query.limit ?? 10);
  const days = req.body.days ?? req.query.days; // เช่น 30

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // ลบ snapshot เดิมของ "วันนี้"
    await connection.query(`DELETE FROM GameRanking WHERE rank_date = CURDATE()`);

    // where สำหรับย้อนหลัง n วัน (วางไว้ใน WHERE ของ JOIN block)
    const whereDays = (days && Number(days) > 0)
      ? `AND gp.purchase_date >= DATE_SUB(NOW(), INTERVAL ? DAY)`
      : ``;

    const params = [];
    if (days && Number(days) > 0) params.push(Number(days));
    params.push(limit);

    // ใช้ derived table + ROW_NUMBER() (MySQL 8+)
    const sql = `
      INSERT INTO GameRanking (game_id, rank_position, rank_date)
      SELECT game_id, rn AS rank_position, CURDATE() AS rank_date
      FROM (
        SELECT 
          gp.game_id,
          ROW_NUMBER() OVER (
            ORDER BY COUNT(*) DESC, MIN(gp.game_id) ASC
          ) AS rn
        FROM GamePurchase gp
        JOIN Game g ON g.game_id = gp.game_id   -- ✅ กัน FK ชน
        WHERE 1=1
        ${whereDays}
        GROUP BY gp.game_id
      ) ranked
      ORDER BY rn
      LIMIT ?;
    `;

    const [result] = await connection.query(sql, params);

    await connection.commit();
    res.json({
      message: "อัปเดตอันดับเกมขายดีประจำวันสำเร็จ 🏆",
      rank_date: new Date().toISOString().slice(0, 10),
      inserted_rows: result.affectedRows ?? 0,
      limit,
      days: days ? Number(days) : null,
    });
  } catch (err) {
    await connection.rollback();
    console.error("❌ rebuildTodayRanking error:", err);
    res.status(500).json({ error: err.message || "Database error" });
  } finally {
    connection.release();
  }
}

/**
 * GET /ranking/today
 * ดึงอันดับ (ที่ถูกบันทึกไว้แล้ว) ของวันนี้
 */
export async function getTodayRanking(_req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        gr.ranking_id,
        gr.game_id,
        gr.rank_position,
        gr.rank_date,
        g.name  AS game_name,
        g.cover_url,
        g.price
      FROM GameRanking gr
      JOIN Game g ON g.game_id = gr.game_id
      WHERE gr.rank_date = CURDATE()
      ORDER BY gr.rank_position ASC;
      `
    );

    res.json({
      message: "ดึงอันดับเกมขายดีของวันนี้สำเร็จ ✅",
      rank_date: new Date().toISOString().slice(0, 10),
      ranking: rows,
    });
  } catch (err) {
    console.error("❌ getTodayRanking error:", err);
    res.status(500).json({ error: "Database error" });
  }
}

/**
 * GET /ranking/by-date?date=YYYY-MM-DD
 * ดึงอันดับที่ snapshot ไว้ตามวันที่กำหนด (ถ้าไม่ส่ง date = วันนี้)
 */
export async function getRankingByDate(req, res) {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        gr.ranking_id,
        gr.game_id,
        gr.rank_position,
        gr.rank_date,
        g.name  AS game_name,
        g.cover_url,
        g.price
      FROM GameRanking gr
      JOIN Game g ON g.game_id = gr.game_id
      WHERE gr.rank_date = ?
      ORDER BY gr.rank_position ASC;
      `,
      [date]
    );

    res.json({
      message: `ดึงอันดับเกมขายดีของวันที่ ${date} สำเร็จ ✅`,
      rank_date: date,
      ranking: rows,
    });
  } catch (err) {
    console.error("❌ getRankingByDate error:", err);
    res.status(500).json({ error: "Database error" });
  }
}

/**
 * GET /ranking/preview?days=30&limit=5
 * คำนวณอันดับแบบ on-the-fly (ไม่ INSERT) เพื่อพรีวิวก่อน rebuild
 */
export async function previewRanking(req, res) {
  const limit = Number(req.query.limit ?? 10);
  const days = req.query.days;

  try {
    const whereDays = (days && Number(days) > 0)
      ? `AND gp.purchase_date >= DATE_SUB(NOW(), INTERVAL ? DAY)`
      : ``;

    const params = [];
    if (days && Number(days) > 0) params.push(Number(days));
    params.push(limit);

    const [rows] = await pool.query(
      `
      SELECT 
        t.game_id,
        g.name AS game_name,
        t.total_sales,
        t.rank_position
      FROM (
        SELECT
          gp.game_id,
          COUNT(*) AS total_sales,
          ROW_NUMBER() OVER (
            ORDER BY COUNT(*) DESC, MIN(gp.game_id) ASC
          ) AS rank_position
        FROM GamePurchase gp
        JOIN Game g2 ON g2.game_id = gp.game_id  -- กัน FK ชน
        WHERE 1=1
        ${whereDays}
        GROUP BY gp.game_id
        ORDER BY total_sales DESC
        LIMIT ?
      ) AS t
      JOIN Game g ON g.game_id = t.game_id
      ORDER BY t.rank_position ASC;
      `,
      params
    );

    res.json({
      message: "พรีวิวอันดับเกมขายดีสำเร็จ (ไม่บันทึก) 👀",
      days: days ? Number(days) : null,
      limit,
      ranking: rows,
    });
  } catch (err) {
    console.error("❌ previewRanking error:", err);
    res.status(500).json({ error: "Database error" });
  }
}
