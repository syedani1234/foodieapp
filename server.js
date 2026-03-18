import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";

console.log("🔥 Step 5: adding full health endpoint");

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

// Full health endpoint
app.get("/api/health", async (req, res) => {
  if (!pool) {
    return res.status(500).json({
      status: "unhealthy",
      database: "disconnected (pool missing)"
    });
  }
  try {
    await pool.query("SELECT 1");
    
    // Try to get counts – tables may not exist yet, so we catch errors
    let cuisineCount = 0, restaurantCount = 0, dealCount = 0;
    try {
      const [cuisineResult] = await pool.query("SELECT COUNT(*) as count FROM cuisines WHERE is_active = TRUE");
      cuisineCount = cuisineResult[0].count;
    } catch (e) { console.log("Cuisines table not ready yet"); }
    try {
      const [restaurantResult] = await pool.query("SELECT COUNT(*) as count FROM restaurants WHERE is_active = TRUE");
      restaurantCount = restaurantResult[0].count;
    } catch (e) { console.log("Restaurants table not ready yet"); }
    try {
      const [dealResult] = await pool.query("SELECT COUNT(*) as count FROM deals WHERE is_active = TRUE");
      dealCount = dealResult[0].count;
    } catch (e) { console.log("Deals table not ready yet"); }
    
    res.json({
      status: "healthy",
      database: "connected",
      counts: {
        cuisines: cuisineCount,
        restaurants: restaurantCount,
        deals: dealCount
      }
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      database: "disconnected",
      error: error.message
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on port ${PORT}`);
  testDatabaseConnection().then(connected => {
    if (connected) console.log("✅ DB test passed");
    else console.error("⚠️ DB test failed");
  });
});

export default app;