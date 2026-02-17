require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();

// =======================
// MIDDLEWARE
// =======================
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// =======================
// DATABASE CONNECTION
// Works for Local + Railway
// =======================
const db = mysql.createConnection({
  host: process.env.MYSQLHOST || "localhost",
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "Google@171",
  database: process.env.MYSQLDATABASE || "vastrika_store",
  port: process.env.MYSQLPORT || 3306
});

db.connect((err) => {
  if (err) {
    console.error("❌ DB Connection Failed:", err);
  } else {
    console.log("✅ Connected to Database");
  }
});

// =======================
// DEFAULT ROUTE
// =======================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// =======================
// REGISTER
// =======================
app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  db.query(
    "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
    [name, email, hashedPassword],
    (err) => {
      if (err) {
        return res.status(400).json({ message: "User already exists" });
      }
      res.json({ message: "Registered successfully" });
    }
  );
});

// =======================
// LOGIN
// =======================
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, results) => {
      if (results.length === 0) {
        return res.status(400).json({ message: "User not found" });
      }

      const user = results[0];
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET || "secret_key",
        { expiresIn: "1d" }
      );

      res.json({ token });
    }
  );
});

// =======================
// GET PRODUCTS
// =======================
app.get("/api/products", (req, res) => {
  db.query("SELECT * FROM products", (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
});

// =======================
// ADD TO CART
// =======================
app.post("/api/cart", (req, res) => {
  const { user_id, product_id, quantity } = req.body;

  db.query(
    "INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)",
    [user_id, product_id, quantity],
    (err) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Added to cart" });
    }
  );
});

// =======================
// GET CART
// =======================
app.get("/api/cart/:user_id", (req, res) => {
  const user_id = req.params.user_id;

  db.query(
    `SELECT cart.id, products.name, products.price, cart.quantity 
     FROM cart 
     JOIN products ON cart.product_id = products.id 
     WHERE cart.user_id = ?`,
    [user_id],
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results);
    }
  );
});

// =======================
// PLACE ORDER
// =======================
app.post("/api/orders", (req, res) => {
  const { user_id, total } = req.body;

  db.query(
    "INSERT INTO orders (user_id, total) VALUES (?, ?)",
    [user_id, total],
    (err, result) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Order placed", order_id: result.insertId });
    }
  );
});

// =======================
// GET ORDERS
// =======================
app.get("/api/orders/:user_id", (req, res) => {
  const user_id = req.params.user_id;

  db.query(
    "SELECT * FROM orders WHERE user_id = ?",
    [user_id],
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results);
    }
  );
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
