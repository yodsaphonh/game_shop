import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import userRoutes from "./src/routes/userRoutes.js";
import gameRoutes from "./src/routes/gameRoutes.js";
import walletRoutes from "./src/routes/walletRoutes.js";
import cartRoutes from "./src/routes/cartRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js"
import discountRoutes from "./src/routes/discountRoutes.js"
dotenv.config();

const app = express();

// 🔧 Middleware พื้นฐาน
app.use(cors());
app.use(express.json());

// 🧩 Routes หลัก
app.get("/", (_, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>🚀 API Online</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap');
        body {
          font-family: 'Poppins', sans-serif;
          background: radial-gradient(circle at top left, #111827, #000);
          color: #fff;
          height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          margin: 0;
        }
        h1 {
          font-size: 2.8rem;
          margin: 0;
          background: linear-gradient(90deg, #00ffff, #ff00ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: glow 2s ease-in-out infinite alternate;
        }
        @keyframes glow {
          from { text-shadow: 0 0 10px #00ffff; }
          to { text-shadow: 0 0 25px #ff00ff; }
        }
        p {
          font-size: 1.2rem;
          margin-top: 10px;
          opacity: 0.8;
        }
        .card {
          padding: 30px 50px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          box-shadow: 0 0 20px rgba(0,255,255,0.2);
          width: 400px;
          max-width: 90%;
        }
        .gif {
          width: 150px;
          height: 150px;
          border-radius: 50%;
          overflow: hidden;
          margin-bottom: 20px;
        }
        a {
          display: inline-block;
          margin-top: 20px;
          color: #00ffff;
          text-decoration: none;
          font-weight: 600;
          transition: 0.3s;
        }
        a:hover {
          transform: scale(1.05);
          color: #ff00ff;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <!-- ✅ GIF Section -->
        <div class="tenor-gif-embed" data-postid="8263460145719341834" 
        data-share-method="host" data-aspect-ratio="1" data-width="100%">
        <a href="https://tenor.com/view/kukuru-gif-8263460145719341834">Kukuru Sticker</a>from 
        <a href="https://tenor.com/search/kukuru-stickers">Kukuru Stickers</a></div> 
        <script type="text/javascript" async src="https://tenor.com/embed.js"></script>

        <!-- ✅ Text Section -->
        <h1>🚀 Game Store API Online</h1>
        <p>Server is running and ready to accept requests.</p>
      </div>
    </body>
    </html>
  `);
});

app.use("/users", userRoutes);  // 👤 User module
app.use("/games", gameRoutes);  // 🎮 Game module (admin only)
app.use("/wallet", walletRoutes);
app.use("/cart", cartRoutes);
app.use("/admin", adminRoutes);
app.use("/discounts", discountRoutes);

// 🚀 Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
