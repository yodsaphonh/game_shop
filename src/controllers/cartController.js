import pool from "../config/db.js";

/* ---------------------------- เพิ่มเกมลงรถเข็น ---------------------------- */
export async function addToCart(req, res) {
  const { user_id, game_id } = req.body;

  if (!user_id || !game_id) {
    return res.status(400).json({ error: "user_id และ game_id จำเป็นต้องระบุ" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [owned] = await connection.query(
      "SELECT * FROM GamePurchase WHERE user_id = ? AND game_id = ?",
      [user_id, game_id]
    );
    if (owned.length > 0) {
      throw new Error("คุณได้เป็นเจ้าของเกมนี้แล้ว ไม่สามารถเพิ่มเข้ารถเข็นได้อีก ❌");
    }

    const [cartRows] = await connection.query(
      "SELECT cart_id FROM Cart WHERE user_id = ? AND status = 'active'",
      [user_id]
    );

    let cart_id;
    if (cartRows.length === 0) {
      const [newCart] = await connection.query(
        "INSERT INTO Cart (user_id, status, created_at) VALUES (?, 'active', NOW())",
        [user_id]
      );
      cart_id = newCart.insertId;
    } else {
      cart_id = cartRows[0].cart_id;
    }

    const [existingItem] = await connection.query(
      "SELECT * FROM CartItem WHERE cart_id = ? AND game_id = ?",
      [cart_id, game_id]
    );

    if (existingItem.length > 0) {
      throw new Error("เกมนี้มีอยู่ในรถเข็นแล้ว 🎮");
    }

    const [gameRows] = await connection.query(
      "SELECT name, price FROM Game WHERE game_id = ?",
      [game_id]
    );

    if (gameRows.length === 0) {
      throw new Error("ไม่พบเกมในระบบ");
    }

    const { name, price } = gameRows[0];

    await connection.query(
      "INSERT INTO CartItem (cart_id, game_id, quantity) VALUES (?, ?, 1)",
      [cart_id, game_id]
    );

    await connection.commit();

    res.json({
      message: "เพิ่มเกมลงในรถเข็นเรียบร้อย 🎮",
      cart_id,
      game_name: name,
      price,
      quantity: 1,
    });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ error: error.message });
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

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1️⃣ ดึง cart_id ของผู้ใช้ที่ยัง active
    const [cartRows] = await connection.query(
      "SELECT cart_id FROM Cart WHERE user_id = ? AND status = 'active'",
      [user_id]
    );

    if (cartRows.length === 0) {
      throw new Error("ไม่พบรถเข็นของผู้ใช้งานนี้");
    }

    const cart_id = cartRows[0].cart_id;

    // 2️⃣ บันทึกเกมทั้งหมดในรถเข็นเข้า GamePurchase
    await connection.query(
      `INSERT INTO GamePurchase (user_id, game_id, purchase_date)
       SELECT c.user_id, ci.game_id, NOW()
       FROM CartItem ci
       JOIN Cart c ON ci.cart_id = c.cart_id
       WHERE c.user_id = ? AND c.status = 'active'`,
      [user_id]
    );

    // 3️⃣ ลบรายการเกมทั้งหมดออกจาก CartItem
    await connection.query(
      `DELETE ci FROM CartItem ci
       JOIN Cart c ON ci.cart_id = c.cart_id
       WHERE c.user_id = ? AND c.status = 'active'`,
      [user_id]
    );

    // 4️⃣ อัปเดตสถานะรถเข็นเป็น 'paid'
    await connection.query(
      "UPDATE Cart SET status = 'paid' WHERE cart_id = ?",
      [cart_id]
    );

    await connection.commit();

    res.json({
      message: "ล้างรถเข็นและบันทึกเกมเข้า GamePurchase สำเร็จ 🧹🎮",
    });
  } catch (err) {
    await connection.rollback();
    console.error("❌ clearCart error:", err);
    res.status(500).json({ error: err.message || "Database error" });
  } finally {
    connection.release();
  }
}



export async function checkoutCart(req, res) {
  const { user_id, discount_code } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1) หา cart
    const [cartRows] = await connection.query(
      "SELECT cart_id FROM Cart WHERE user_id = ? AND status = 'active'",
      [user_id]
    );
    if (cartRows.length === 0) throw new Error("ไม่พบรถเข็นของผู้ใช้");
    const cart_id = cartRows[0].cart_id;

    // 2) รายการในรถเข็น
    const [items] = await connection.query(
      `SELECT g.game_id, g.name, g.price, ci.quantity
       FROM CartItem ci
       JOIN Game g ON ci.game_id = g.game_id
       WHERE ci.cart_id = ?`,
      [cart_id]
    );
    if (items.length === 0) throw new Error("ไม่มีสินค้าในรถเข็น");

    // รวมราคา
    let total = items.reduce((sum, it) => sum + parseFloat(it.price) * it.quantity, 0);
    let discountValue = 0;
    let discountName = null;

    // 3) ส่วนลด (ครั้งเดียว/ผู้ใช้/โค้ด)
    if (discount_code && discount_code.trim() !== "") {
      // ดึงโค้ด
      const [codeRows] = await connection.query(
        "SELECT code_id, code_name, discount_value, max_usage FROM DiscountCode WHERE code_name = ?",
        [discount_code]
      );
      if (codeRows.length === 0) throw new Error("โค้ดส่วนลดไม่ถูกต้อง");

      const { code_id, discount_value, max_usage } = codeRows[0];

      // (A) ผู้ใช้คนนี้เคยใช้โค้ดนี้แล้วหรือยัง? -> ถ้าเคย ห้ามใช้ซ้ำ
      const [myUse] = await connection.query(
        "SELECT usage_id FROM DiscountUsage WHERE user_id = ? AND code_id = ? LIMIT 1",
        [user_id, code_id]
      );
      if (myUse.length > 0) {
        throw new Error("คุณใช้โค้ดนี้ไปแล้ว (ใช้ได้ 1 ครั้งต่อคน)");
      }

      // (B) ตรวจยอดใช้รวมของโค้ด เทียบกับ max_usage (เงื่อนไขรวมของระบบ)
      const [[{ used_total }]] = await connection.query(
        "SELECT COUNT(*) AS used_total FROM DiscountUsage WHERE code_id = ?",
        [code_id]
      );
      if (max_usage <= 0 || used_total >= max_usage) {
        throw new Error("โค้ดนี้ถูกใช้ครบตามเงื่อนไขแล้ว");
      }

      // ผ่านเงื่อนไข -> ใช้ส่วนลด
      discountValue = parseFloat(discount_value);
      discountName = discount_code;

      // (C) บันทึกการใช้โค้ด (ครั้งเดียว/คน) — ใส่ 1 ไว้เฉย ๆ
      await connection.query(
        `INSERT INTO DiscountUsage (user_id, code_id, usage_count, used_at)
         VALUES (?, ?, 1, NOW())`,
        [user_id, code_id]
      );
      // หมายเหตุ: ไม่มี ON DUPLICATE UPDATE เพื่อกันใช้ซ้ำ
    }

    const totalAfterDiscount = Math.max(0, total - discountValue);

    // 4) ตรวจ wallet
    const [userRows] = await connection.query(
      "SELECT wallet_balance FROM User WHERE user_id = ?",
      [user_id]
    );
    if (userRows.length === 0) throw new Error("ไม่พบผู้ใช้");

    const walletBalance = parseFloat(userRows[0].wallet_balance);
    if (walletBalance < totalAfterDiscount) throw new Error("ยอดเงินในกระเป๋าไม่เพียงพอ");

    // 5) หักเงิน + log
    const newBalance = walletBalance - totalAfterDiscount;
    await connection.query(
      "UPDATE User SET wallet_balance = ? WHERE user_id = ?",
      [newBalance.toFixed(2), user_id]
    );
    await connection.query(
      `INSERT INTO WalletTransaction (user_id, type, amount, date)
       VALUES (?, 'debit', ?, NOW())`,
      [user_id, totalAfterDiscount]
    );

    // 6) บันทึกการซื้อ
    for (const item of items) {
      await connection.query(
        `INSERT INTO GamePurchase (user_id, game_id, purchase_date)
         VALUES (?, ?, NOW())`,
        [user_id, item.game_id]
      );
    }

    // 7) ปิด cart
    await connection.query("DELETE FROM CartItem WHERE cart_id = ?", [cart_id]);
    await connection.query("UPDATE Cart SET status = 'paid' WHERE cart_id = ?", [cart_id]);

    await connection.commit();

    res.json({
      message: "ชำระเงินสำเร็จ ✅",
      discount_applied: discountName,
      discount_value: discountValue,
      total_before: total,
      total_after: totalAfterDiscount,
      balance_after: newBalance,
      games_purchased: items.map(i => i.name),
    });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
}