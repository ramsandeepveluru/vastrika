require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static("public"));

/* ==============================
   DATABASE CONNECTION
============================== */

const mysql = require("mysql2");

const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
});

db.connect((err) => {
  if (err) {
    console.error("❌ MySQL Connection Failed:", err);
  } else {
    console.log("✅ Connected to Railway MySQL");
  }
});



/* ==============================
   JWT MIDDLEWARE
============================== */

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token" });

  jwt.verify(token, process.env.JWT_SECRET || "secret123", (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
}

/* ==============================
   AUTH ROUTES
============================== */

// REGISTER
app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  const sql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";

  db.query(sql, [name, email, hashedPassword], (err, result) => {
    if (err) return res.status(400).json({ message: "Email already exists" });

    res.json({ message: "User registered successfully" });
  });
});

// LOGIN
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
    if (err || result.length === 0)
      return res.status(400).json({ message: "User not found" });

    const user = result[0];

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || "secret123",
      { expiresIn: "1d" }
    );

    res.json({ token });
  });
});

/* ==============================
   PRODUCTS
============================== */

app.get("/api/products", (req, res) => {
  db.query("SELECT * FROM products", (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});

app.get("/api/products/:id", (req, res) => {
  db.query(
    "SELECT * FROM products WHERE id = ?",
    [req.params.id],
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results[0]);
    }
  );
});

/* ==============================
   CART
============================== */

app.post("/api/cart", authenticateToken, (req, res) => {
  const { product_id, quantity } = req.body;
  const user_id = req.user.id;

  db.query(
    "INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)",
    [user_id, product_id, quantity],
    (err) => {
      if (err) return res.status(500).json(err);
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
      if (err) return res.status(500).json(err);
      res.json(results);
    }
  );
});

/* ==============================
   PLACE ORDER
============================== */

app.post("/api/place-order", authenticateToken, (req, res) => {
  const user_id = req.user.id;

  db.query(
    `SELECT cart.product_id, cart.quantity, products.price
     FROM cart
     JOIN products ON cart.product_id = products.id
     WHERE cart.user_id = ?`,
    [user_id],
    (err, cartItems) => {
      if (err) return res.status(500).json(err);
      if (cartItems.length === 0)
        return res.status(400).json({ message: "Cart is empty" });

      let total = 0;
      cartItems.forEach((item) => {
        total += item.price * item.quantity;
      });

      db.query(
        "INSERT INTO orders (user_id, total_amount) VALUES (?, ?)",
        [user_id, total],
        (err, orderResult) => {
          if (err) return res.status(500).json(err);

          const orderId = orderResult.insertId;

          cartItems.forEach((item) => {
            db.query(
              "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
              [orderId, item.product_id, item.quantity, item.price]
            );
          });

          db.query("DELETE FROM cart WHERE user_id = ?", [user_id]);

          res.json({ message: "Order placed successfully" });
        }
      );
    }
  );
});

/* ==============================
   MY ORDERS
============================== */

app.get("/api/my-orders", authenticateToken, (req, res) => {
  db.query(
    "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
    [req.user.id],
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results);
    }
  );
});

/* ==============================
   SERVER START
============================== */

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
