import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from 'url';
import mysql from "mysql2/promise";

console.log("🔥 Final: full backend with upload and DB");

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

// ---------- File upload setup ----------
console.log("📁 Setting up file upload...");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, "uploads");

try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log(`✅ Created uploads directory: ${UPLOAD_DIR}`);
  } else {
    console.log(`✅ Uploads directory already exists`);
  }
} catch (err) {
  console.error("❌ Failed to create uploads directory:", err);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log("📁 Storage destination called");
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    console.log(`📁 Generating filename: img-${uniqueSuffix}${ext}`);
    cb(null, `img-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  console.log(`🔍 Checking file: ${file.originalname}, mimetype: ${file.mimetype}`);
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  if (allowedTypes.test(file.mimetype) && allowedTypes.test(path.extname(file.originalname).toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Only images are allowed'));
  }
};

const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, 
  fileFilter 
});
console.log("✅ Multer configured");

app.use("/uploads", express.static(UPLOAD_DIR));
console.log("✅ Static route /uploads set up");

// ---------- Database pool ----------
console.log("🗄️ Creating database pool...");
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

// ---------- Upload route ----------
app.post("/api/upload", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({
      success: true,
      data: {
        imageUrl: `http://localhost:${PORT}${imageUrl}`,
        filePath: imageUrl,
        filename: req.file.filename
      }
    });
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ error: "Upload failed", message: err.message });
  }
});

// ---------- Health endpoint ----------
app.get("/api/health", async (req, res) => {
  if (!pool) {
    return res.status(500).json({
      status: "unhealthy",
      database: "disconnected (pool missing)"
    });
  }
  try {
    await pool.query("SELECT 1");
    
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

// ---------- Start server ----------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on port ${PORT}`);
  testDatabaseConnection().then(connected => {
    if (connected) console.log("✅ DB test passed");
    else console.error("⚠️ DB test failed");
  });
});

export default app;