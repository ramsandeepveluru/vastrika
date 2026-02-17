require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

/* ================== DATABASE ================== */

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect(err => {
  if (err) {
    console.log("❌ DB Connection Failed:", err);
  } else {
    console.log("✅ Connected to MySQL");
  }
});

/* ================== JWT AUTH ================== */

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Token required" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
}

/* ================== AUTH ================== */

app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  db.query(
    "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
    [name, email, hashed],
    err => {
      if (err) return res.status(500).json({ message: "User exists" });
      res.json({ message: "User registered successfully" });
    }
  );
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, results) => {
      if (results.length === 0)
        return res.status(400).json({ message: "User not found" });

      const user = results[0];
      const valid = await bcrypt.compare(password, user.password);

      if (!valid)
        return res.status(400).json({ message: "Wrong password" });

      const token = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      res.json({ token });
    }
  );
});

/* ================== PRODUCTS ================== */

app.get("/api/products", (req, res) => {
  db.query("SELECT * FROM products", (err, results) => {
    res.json(results);
  });
});

app.get("/api/products/:id", (req, res) => {
  db.query(
    "SELECT * FROM products WHERE id = ?",
    [req.params.id],
    (err, results) => {
      res.json(results[0]);
    }
  );
});

/* ================== CART ================== */

app.post("/api/cart", authenticateToken, (req, res) => {
  const { product_id, quantity } = req.body;

  db.query(
    "INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)",
    [req.user.id, product_id, quantity],
    err => {
      if (err) return res.status(500).json({ message: "Cart error" });
      res.json({ message: "Added to cart" });
    }
  );
});

app.get("/api/cart", authenticateToken, (req, res) => {
  db.query(
    `SELECT cart.id, products.name, products.price, cart.quantity
     FROM cart
     JOIN products ON cart.product_id = products.id
     WHERE cart.user_id = ?`,
    [req.user.id],
    (err, results) => {
      res.json(results);
    }
  );
});

/* ================== PLACE ORDER ================== */

app.post("/api/place-order", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [cartItems] = await db.promise().query(
      `SELECT cart.product_id, cart.quantity, products.price 
       FROM cart 
       JOIN products ON cart.product_id = products.id
       WHERE cart.user_id = ?`,
      [userId]
    );

    if (cartItems.length === 0)
      return res.status(400).json({ message: "Cart is empty" });

    let total = 0;
    cartItems.forEach(item => {
      total += item.price * item.quantity;
    });

    const [orderResult] = await db.promise().query(
      "INSERT INTO orders (user_id, total_amount) VALUES (?, ?)",
      [userId, total]
    );

    const orderId = orderResult.insertId;

    for (let item of cartItems) {
      await db.promise().query(
        "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
        [orderId, item.product_id, item.quantity, item.price]
      );

      await db.promise().query(
        "UPDATE products SET stock = stock - ? WHERE id = ?",
        [item.quantity, item.product_id]
      );
    }

    await db.promise().query(
      "DELETE FROM cart WHERE user_id = ?",
      [userId]
    );

    res.json({ message: "Order placed successfully 🎉" });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ================== MY ORDERS ================== */

app.get("/api/my-orders", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  const [orders] = await db.promise().query(
    "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
    [userId]
  );

  for (let order of orders) {
    const [items] = await db.promise().query(
      `SELECT products.name, order_items.quantity, order_items.price
       FROM order_items
       JOIN products ON order_items.product_id = products.id
       WHERE order_items.order_id = ?`,
      [order.id]
    );
    order.items = items;
  }

  res.json(orders);
});

/* ================== SERVER ================== */

app.listen(4000, () => {
  console.log("🚀 Server running on http://localhost:4000");
});
