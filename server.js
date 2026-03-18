import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";

console.log("🔥 Step 4: adding database pool");

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: "*",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

console.log("✅ Middleware added");

// Database pool
let pool;
try {
  pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "root123",
    database: process.env.DB_NAME || "foodieapp",
    port: process.env.DB_PORT || 3306,
    connectionLimit: 20,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  });
  console.log("✅ Database pool created");
} catch (err) {
  console.error("❌ Failed to create database pool:", err.message);
  pool = null;
}

async function testDatabaseConnection() {
  if (!pool) return false;
  try {
    const conn = await pool.getConnection();
    conn.release();
    console.log("✅ Database connection successful");
    return true;
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    return false;
  }
}

// Health endpoint (still simple, doesn't use DB)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on port ${PORT}`);
  // Test DB after startup
  testDatabaseConnection().then(connected => {
    if (connected) console.log("✅ DB test passed");
    else console.error("⚠️ DB test failed");
  });
});

export default app;