import pool from "../config/db.js";

/* ---------------------------- GET BALANCE ---------------------------- */
export async function getWalletBalance(req, res) {
  try {
    const { user_id } = req.params;
    const [rows] = await pool.query(
      "SELECT user_id, username, wallet_balance FROM User WHERE user_id = ?",
      [user_id]
    );

    if (rows.length === 0) return res.status(404).json("User not found");
    res.json(rows[0]);
  } catch (err) {
    console.error("Get wallet error:", err);
    res.status(500).json("Database error");
  }
}

/* ---------------------------- ADMIN VIEW USER HISTORY (POST) ---------------------------- */
export async function adminViewUserHistory(req, res) {
  try {
    const { admin_id, user_id } = req.body;

    if (!admin_id || !user_id) {
      return res.status(400).json("admin_id and user_id are required");
    }

    // ✅ ตรวจสอบสิทธิ์ว่าเป็นแอดมินจริงไหม
    const [adminCheck] = await pool.query(
      "SELECT role FROM User WHERE user_id = ?",
      [admin_id]
    );

    if (adminCheck.length === 0) return res.status(404).json("Admin not found");
    if (adminCheck[0].role !== "admin") {
      return res.status(403).json("Only admin can view user transaction history");
    }

    // ✅ ดึงประวัติธุรกรรมของ user
    const [rows] = await pool.query(
      `SELECT w.transaction_id, w.user_id, u.username, w.type, w.amount, w.date
       FROM WalletTransaction w
       JOIN User u ON w.user_id = u.user_id
       WHERE w.user_id = ?
       ORDER BY w.date DESC`,
      [user_id]
    );

    if (rows.length === 0)
      return res.status(404).json("No transactions found for this user");

    res.json({
      message: "Fetched user transaction history successfully",
      transactions: rows
    });
  } catch (err) {
    console.error("Admin view user history error:", err);
    res.status(500).json("Database error");
  }
}


/* ---------------------------- DEPOSIT ---------------------------- */
export async function depositToWallet(req, res) {
  try {
    const { user_id, amount } = req.body;
    if (!user_id || !amount) return res.status(400).json("user_id and amount required");

    await pool.query(
      "UPDATE User SET wallet_balance = wallet_balance + ? WHERE user_id = ?",
      [amount, user_id]
    );

    await pool.query(
      "INSERT INTO WalletTransaction (user_id, type, amount, date) VALUES (?, 'deposit', ?, NOW())",
      [user_id, amount]
    );

    res.json({ message: "Deposit successful", amount });
  } catch (err) {
    console.error("Deposit error:", err);
    res.status(500).json("Database error");
  }
}

/* ---------------------------- WITHDRAW ---------------------------- */
export async function withdrawFromWallet(req, res) {
  try {
    const { user_id, amount } = req.body;
    if (!user_id || !amount) return res.status(400).json("user_id and amount required");

    const [user] = await pool.query("SELECT wallet_balance FROM User WHERE user_id = ?", [user_id]);
    if (user.length === 0) return res.status(404).json("User not found");
    if (user[0].wallet_balance < amount) return res.status(400).json("Insufficient balance");

    await pool.query(
      "UPDATE User SET wallet_balance = wallet_balance - ? WHERE user_id = ?",
      [amount, user_id]
    );

    await pool.query(
      "INSERT INTO WalletTransaction (user_id, type, amount, date) VALUES (?, 'withdraw', ?, NOW())",
      [user_id, amount]
    );

    res.json({ message: "Withdraw successful", amount });
  } catch (err) {
    console.error("Withdraw error:", err);
    res.status(500).json("Database error");
  }
}

/* ---------------------------- TRANSACTION HISTORY ---------------------------- */
export async function getWalletHistory(req, res) {
  try {
    const { user_id } = req.params;
    const [rows] = await pool.query(
      "SELECT * FROM WalletTransaction WHERE user_id = ? ORDER BY date DESC",
      [user_id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Get history error:", err);
    res.status(500).json("Database error");
  }
}

/* ---------------------------- PURCHASE GAME ---------------------------- */
export async function purchaseGame(req, res) {
  const { user_id, game_id } = req.body;

  if (!user_id || !game_id) {
    return res.status(400).json({ error: "user_id และ game_id จำเป็นต้องระบุ" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [ownedRows] = await connection.query(
      "SELECT 1 FROM GamePurchase WHERE user_id = ? AND game_id = ?",
      [user_id, game_id]
    );
    if (ownedRows.length > 0) {
      throw new Error("คุณมีเกมนี้อยู่แล้ว ไม่สามารถซื้อซ้ำได้");
    }

    const [gameRows] = await connection.query(
      "SELECT name, price FROM Game WHERE game_id = ?",
      [game_id]
    );
    if (gameRows.length === 0) throw new Error("ไม่พบเกมในระบบ");

    const gameName = gameRows[0].name;
    const gamePriceStr = gameRows[0].price; 
    const gamePrice = parseFloat(gamePriceStr);

    const [userRows] = await connection.query(
      "SELECT wallet_balance FROM User WHERE user_id = ? FOR UPDATE",
      [user_id]
    );
    if (userRows.length === 0) throw new Error("ไม่พบผู้ใช้งานในระบบ");

    const walletBalanceStr = userRows[0].wallet_balance;
    const currentBalance = parseFloat(walletBalanceStr);

    if (currentBalance < gamePrice) {
      throw new Error("ยอดเงินไม่เพียงพอสำหรับการซื้อเกมนี้");
    }

    const newBalanceNum = currentBalance - gamePrice;
    const newBalanceStr = newBalanceNum.toFixed(2);

    await connection.query(
      "UPDATE User SET wallet_balance = ? WHERE user_id = ?",
      [newBalanceStr, user_id]
    );

    await connection.query(
      `INSERT INTO WalletTransaction (user_id, type, amount, date)
       VALUES (?, 'debit', ?, NOW())`,
      [user_id, gamePriceStr]
    );

    await connection.query(
      `INSERT INTO GamePurchase (user_id, game_id, purchase_date)
       VALUES (?, ?, NOW())`,
      [user_id, game_id]
    );

    await connection.commit();

    res.json({
      message: "ซื้อเกมสำเร็จ 🎮",
      game_name: gameName,
      price: gamePriceStr,
      balance_before: walletBalanceStr,
      balance_after: newBalanceStr
    });

  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "คุณมีเกมนี้อยู่แล้ว ไม่สามารถซื้อซ้ำได้" });
    }

    console.error("❌ purchaseGame error:", error);
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
}

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
