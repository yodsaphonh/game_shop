import pool from "../config/db.js";

/* ---------------------------- เพิ่มเกมลงรถเข็น ---------------------------- */
export async function addToCart(req, res) {
  const { user_id, game_id, quantity = 1 } = req.body;
  if (!user_id || !game_id) {
    return res.status(400).json({ error: "ต้องระบุ user_id และ game_id" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1️⃣ ตรวจว่ามี cart ของ user อยู่ไหม
    const [cartRows] = await connection.query(
      "SELECT cart_id FROM Cart WHERE user_id = ? AND status = 'active'",
      [user_id]
    );

    let cart_id;
    if (cartRows.length === 0) {
      // ไม่มี ให้สร้างใหม่
      const [newCart] = await connection.query(
        "INSERT INTO Cart (user_id, status, created_at) VALUES (?, 'active', NOW())",
        [user_id]
      );
      cart_id = newCart.insertId;
    } else {
      cart_id = cartRows[0].cart_id;
    }

    // 2️⃣ ตรวจว่าเกมนี้อยู่ในตะกร้าแล้วไหม
    const [itemRows] = await connection.query(
      "SELECT * FROM CartItem WHERE cart_id = ? AND game_id = ?",
      [cart_id, game_id]
    );

    if (itemRows.length > 0) {
      // ถ้ามีแล้ว ➜ เพิ่มจำนวน
      await connection.query(
        "UPDATE CartItem SET quantity = quantity + ? WHERE cart_id = ? AND game_id = ?",
        [quantity, cart_id, game_id]
      );
    } else {
      // ถ้ายังไม่มี ➜ เพิ่มใหม่
      await connection.query(
        "INSERT INTO CartItem (cart_id, game_id, quantity) VALUES (?, ?, ?)",
        [cart_id, game_id, quantity]
      );
    }

    await connection.commit();
    res.json({ message: "เพิ่มเกมลงรถเข็นสำเร็จ 🛒", cart_id });
  } catch (err) {
    await connection.rollback();
    console.error("❌ addToCart error:", err);
    res.status(500).json({ error: "Database error" });
  } finally {
    connection.release();
  }
}

/* ---------------------------- ดูรายการเกมในรถเข็น ---------------------------- */
export async function getCartByUser(req, res) {
  const { user_id } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT ci.cart_item_id, g.game_id, g.name AS game_name, g.price, ci.quantity,
             (g.price * ci.quantity) AS total_price
      FROM Cart c
      JOIN CartItem ci ON c.cart_id = ci.cart_id
      JOIN Game g ON ci.game_id = g.game_id
      WHERE c.user_id = ? AND c.status = 'active'
    `,
      [user_id]
    );

    if (rows.length === 0)
      return res.json({ message: "ไม่มีเกมในรถเข็น", total_price: 0, items: [] });

    // รวมราคาทั้งหมด
    const total = rows.reduce((sum, item) => sum + parseFloat(item.total_price), 0);

    res.json({
      message: "ดึงรายการรถเข็นสำเร็จ",
      total_price: total.toFixed(2),
      items: rows,
    });
  } catch (err) {
    console.error("❌ getCartByUser error:", err);
    res.status(500).json({ error: "Database error" });
  }
}

/* ---------------------------- ลบเกมออกจากรถเข็น ---------------------------- */
export async function removeFromCart(req, res) {
  const { user_id, game_id } = req.body;
  if (!user_id || !game_id)
    return res.status(400).json({ error: "ต้องระบุ user_id และ game_id" });

  try {
    await pool.query(
      `DELETE ci FROM CartItem ci
       JOIN Cart c ON ci.cart_id = c.cart_id
       WHERE c.user_id = ? AND ci.game_id = ? AND c.status = 'active'`,
      [user_id, game_id]
    );

    res.json({ message: "ลบเกมออกจากรถเข็นเรียบร้อย 🗑️" });
  } catch (err) {
    console.error("❌ removeFromCart error:", err);
    res.status(500).json({ error: "Database error" });
  }
}

/* ---------------------------- ล้างรถเข็นทั้งหมด ---------------------------- */
export async function clearCart(req, res) {
  const { user_id } = req.params;
  try {
    await pool.query(
      `DELETE ci FROM CartItem ci
       JOIN Cart c ON ci.cart_id = c.cart_id
       WHERE c.user_id = ? AND c.status = 'active'`,
      [user_id]
    );

    res.json({ message: "ล้างรถเข็นสำเร็จ 🧹" });
  } catch (err) {
    console.error("❌ clearCart error:", err);
    res.status(500).json({ error: "Database error" });
  }
}
