import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 4000;

/* =========================
   MIDDLEWARE CONFIGURATION
========================= */
app.use(cors({
  origin: "*",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================
   FILE UPLOAD CONFIGURATION
========================= */
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(`📁 Created uploads directory: ${UPLOAD_DIR}`);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `img-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error('Error: Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  },
  fileFilter: fileFilter
});

/* =========================
   STATIC FILES
========================= */
app.use("/uploads", express.static(UPLOAD_DIR, {
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000');
  }
}));

/* =========================
   DATABASE CONNECTION (Robust)
========================= */
let pool; // Declare pool variable

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
  pool = null; // Set pool to null so endpoints can handle it
}

// Test database connection
async function testDatabaseConnection() {
  if (!pool) {
    console.error("❌ No database pool available");
    return false;
  }
  try {
    const connection = await pool.getConnection();
    console.log("✅ Database connection successful");
    connection.release();
     return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    return false;
  }
}

/* =========================
   HELPER FUNCTIONS
========================= */
const formatImageUrl = (imagePath) => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  const normalizedPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `http://localhost:${PORT}${normalizedPath}`;
};

const slugToName = (slug) => {
  if (!slug || typeof slug !== 'string') return '';
  return slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};

const nameToSlug = (name) => {
  if (!name || typeof name !== 'string') return '';
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/\-+/g, '-');
};

const validateRequiredFields = (fields, data) => {
  const missing = [];
  for (const field of fields) {
    if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
      missing.push(field);
    }
  }
  return missing;
};

const formatDateForMySQL = (dateString) => {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (error) {
    return null;
  }
};

/* =========================
   DATABASE INITIALIZATION WITH COLUMN CHECKING
========================= */
async function initializeDatabase() {
  try {
    console.log("🔧 Initializing database...");
    
    // Create cuisines table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cuisines (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        image VARCHAR(500),
        is_featured BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // Create restaurants table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS restaurants (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        address TEXT,
        city VARCHAR(100),
        phone VARCHAR(20),
        email VARCHAR(100),
        website VARCHAR(200),
        opening_hours TEXT,
        image VARCHAR(500),
        cover_image VARCHAR(500),
        rating DECIMAL(3,2) DEFAULT 0.00,
        delivery_time VARCHAR(50) DEFAULT '30-45 minutes',
        minimum_order DECIMAL(10,2) DEFAULT 0.00,
        delivery_fee DECIMAL(10,2) DEFAULT 2.99,
        is_active BOOLEAN DEFAULT TRUE,
        is_featured BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // Create restaurant_cuisines junction table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS restaurant_cuisines (
        restaurant_id INT NOT NULL,
        cuisine_id INT NOT NULL,
        PRIMARY KEY (restaurant_id, cuisine_id),
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
        FOREIGN KEY (cuisine_id) REFERENCES cuisines(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // Create deals table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deals (
        id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(200) NOT NULL,
        slug VARCHAR(200) UNIQUE,
        description TEXT,
        restaurant_id INT,
        cuisine_id INT,
        original_price DECIMAL(10,2) NOT NULL,
        discount_price DECIMAL(10,2) NOT NULL,
        discount_percent INT,
        image VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        is_featured BOOLEAN DEFAULT FALSE,
        tags TEXT,
        valid_from DATETIME,
        valid_until DATETIME,
        quantity_available INT,
        has_customization BOOLEAN DEFAULT FALSE,
        deal_type ENUM('pizza', 'burger', 'combo', 'other') DEFAULT 'other',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE SET NULL,
        FOREIGN KEY (cuisine_id) REFERENCES cuisines(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // Create menu items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        restaurant_id INT NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        base_price DECIMAL(10,2) NOT NULL,
        image VARCHAR(500),
        is_available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // Create orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT DEFAULT 1,
        restaurant_id INT,
        order_number VARCHAR(50) UNIQUE,
        total_amount DECIMAL(10,2) NOT NULL,
        status ENUM('pending', 'preparing', 'ready', 'delivered', 'cancelled') DEFAULT 'pending',
        payment_method VARCHAR(50),
        delivery_address TEXT,
        contact_number VARCHAR(20),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // Create order items table – initially menu_item_id is NOT NULL, but we'll alter later
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        order_id INT NOT NULL,
        menu_item_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    console.log("✅ Database tables created/verified");
    
    // Check and add missing columns
    await checkAndAddMissingColumns();
    
    // ❌ Sample data insertion removed – tables start empty
    // await insertSampleData();
    
  } catch (error) {
    console.error("❌ Database initialization error:", error);
    throw error;
  }
}

async function checkAndAddMissingColumns() {
  try {
    console.log("🔍 Checking for missing columns...");
    
    // Helper to add column if missing
    const addColumnIfMissing = async (table, column, definition) => {
      try {
        const [rows] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
        if (rows.length === 0) {
          console.log(`⚠️  Adding missing column '${column}' to ${table}`);
          await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
      } catch (err) {
        console.log(`⚠️  Could not check/add column ${column} in ${table}:`, err.message);
      }
    };

    // Deals table columns – ensure all exist
    const dealColumns = [
      { name: 'cuisine_id', type: 'INT NULL AFTER restaurant_id' },
      { name: 'tags', type: 'TEXT' },
      { name: 'valid_from', type: 'DATETIME' },
      { name: 'valid_until', type: 'DATETIME' },
      { name: 'quantity_available', type: 'INT' },
      { name: 'has_customization', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'deal_type', type: "ENUM('pizza','burger','combo','other') DEFAULT 'other'" },
      { name: 'slug', type: 'VARCHAR(200) UNIQUE' },
      { name: 'is_featured', type: 'BOOLEAN DEFAULT FALSE' }
    ];
    for (const col of dealColumns) {
      await addColumnIfMissing('deals', col.name, col.type);
    }

    // Restaurants table columns – ensure all expected columns exist
    const restaurantColumns = [
      { name: 'address', type: 'TEXT AFTER description' },
      { name: 'phone', type: 'VARCHAR(20)' },
      { name: 'email', type: 'VARCHAR(100)' },
      { name: 'website', type: 'VARCHAR(200)' },
      { name: 'opening_hours', type: 'TEXT' },
      { name: 'image', type: 'VARCHAR(500)' },
      { name: 'cover_image', type: 'VARCHAR(500)' },
      { name: 'rating', type: 'DECIMAL(3,2) DEFAULT 0.00' },
      { name: 'delivery_time', type: "VARCHAR(50) DEFAULT '30-45 minutes'" },
      { name: 'minimum_order', type: 'DECIMAL(10,2) DEFAULT 0.00' },
      { name: 'delivery_fee', type: 'DECIMAL(10,2) DEFAULT 2.99' },
      { name: 'is_active', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'is_featured', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
      { name: 'updated_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' },
      { name: 'city', type: 'VARCHAR(100)' }
    ];
    for (const col of restaurantColumns) {
      await addColumnIfMissing('restaurants', col.name, col.type);
    }

    // Orders table columns (ensure all exist)
    await addColumnIfMissing('orders', 'user_id', 'INT DEFAULT 1');
    await addColumnIfMissing('orders', 'restaurant_id', 'INT');
    await addColumnIfMissing('orders', 'order_number', 'VARCHAR(50) UNIQUE');
    await addColumnIfMissing('orders', 'total_amount', 'DECIMAL(10,2) NOT NULL');
    await addColumnIfMissing('orders', 'status', "ENUM('pending','preparing','ready','delivered','cancelled') DEFAULT 'pending'");
    await addColumnIfMissing('orders', 'payment_method', 'VARCHAR(50)');
    await addColumnIfMissing('orders', 'delivery_address', 'TEXT');
    await addColumnIfMissing('orders', 'contact_number', 'VARCHAR(20)');
    await addColumnIfMissing('orders', 'notes', 'TEXT');
    await addColumnIfMissing('orders', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    await addColumnIfMissing('orders', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    // Order_items table – add deal_id and make menu_item_id nullable
    try {
      const [menuItemCol] = await pool.query("SHOW COLUMNS FROM order_items WHERE Field = 'menu_item_id' AND `Null` = 'NO'");
      if (menuItemCol.length > 0) {
        console.log("⚠️  Modifying menu_item_id to allow NULL");
        await pool.query("ALTER TABLE order_items MODIFY menu_item_id INT NULL");
      }
    } catch (err) {
      console.log("⚠️  Could not modify menu_item_id:", err.message);
    }

    await addColumnIfMissing('order_items', 'deal_id', 'INT NULL AFTER menu_item_id');

    // Add foreign key for deal_id
    try {
      await pool.query("ALTER TABLE order_items ADD FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL");
    } catch (err) {
      console.log("⚠️  Could not add deal_id foreign key (may already exist):", err.message);
    }

    // Add indexes for performance
    try {
      await pool.query("CREATE INDEX idx_restaurant_cuisines_restaurant ON restaurant_cuisines(restaurant_id)");
      await pool.query("CREATE INDEX idx_restaurant_cuisines_cuisine ON restaurant_cuisines(cuisine_id)");
      await pool.query("CREATE INDEX idx_deals_restaurant ON deals(restaurant_id)");
      await pool.query("CREATE INDEX idx_deals_cuisine ON deals(cuisine_id)");
      await pool.query("CREATE INDEX idx_menu_items_restaurant ON menu_items(restaurant_id)");
      await pool.query("CREATE INDEX idx_orders_restaurant ON orders(restaurant_id)");
      await pool.query("CREATE INDEX idx_order_items_order ON order_items(order_id)");
    } catch (err) {
      // indexes may already exist
    }

    console.log("✅ Column check completed");
  } catch (error) {
    console.log("⚠️  Could not check/add columns:", error.message);
  }
}

// ❌ The insertSampleData() function has been removed entirely.

initializeDatabase().catch(console.error);

/* =========================
   API ROUTES
========================= */

/* =========================
   1. HEALTH CHECK & ROOT ENDPOINTS
========================= */
app.get("/", (req, res) => {
  res.json({
    message: "FoodieApp API Server",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    endpoints: {
      documentation: "GET /api/docs",
      health_check: "GET /api/health",
      all_cuisines: "GET /api/cuisines",
      cuisine_restaurants: "GET /cuisines/:slug",
      all_restaurants: "GET /api/restaurants",
      restaurant_details: "GET /api/restaurants/:id",
      deals: "GET /deals",
      deals_filtered: "GET /api/deals",
      create_deal: "POST /api/deals",
      update_deal: "PATCH /api/deals/:id",
      upload_image: "POST /api/upload"
    }
  });
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    
    const [cuisineResult] = await pool.query("SELECT COUNT(*) as count FROM cuisines WHERE is_active = TRUE");
    const [restaurantResult] = await pool.query("SELECT COUNT(*) as count FROM restaurants WHERE is_active = TRUE");
    const [dealResult] = await pool.query("SELECT COUNT(*) as count FROM deals WHERE is_active = TRUE");
    
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: "connected",
      uptime: process.uptime(),
      counts: {
        cuisines: cuisineResult[0].count,
        restaurants: restaurantResult[0].count,
        deals: dealResult[0].count
      },
      endpoints: {
        all_cuisines: `http://localhost:${PORT}/api/cuisines`,
        all_restaurants: `http://localhost:${PORT}/api/restaurants`,
        all_deals: `http://localhost:${PORT}/deals`,
        filtered_deals: `http://localhost:${PORT}/api/deals`
      }
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      database: "disconnected",
      error: error.message
    });
  }
});

/* =========================
   2. CUISINE ENDPOINTS
========================= */

// GET all cuisines
app.get("/api/cuisines", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        id,
        name,
        description,
        image,
        is_featured,
        (SELECT COUNT(*) FROM restaurant_cuisines WHERE cuisine_id = cuisines.id) as restaurant_count
      FROM cuisines 
      WHERE is_active = TRUE
      ORDER BY name ASC
    `);
    
    const cuisines = rows.map(cuisine => ({
      id: cuisine.id,
      name: cuisine.name,
      description: cuisine.description || '',
      image: formatImageUrl(cuisine.image),
      is_featured: Boolean(cuisine.is_featured),
      restaurant_count: cuisine.restaurant_count || 0,
      slug: nameToSlug(cuisine.name)
    }));
    
    res.json(cuisines);
    
  } catch (error) {
    console.error("❌ /api/cuisines error:", error);
    res.status(500).json({
      error: "Failed to fetch cuisines",
      message: error.message
    });
  }
});

// POST create new cuisine
app.post("/api/cuisines", async (req, res) => {
  try {
    const { name, description, image, is_featured } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({
        error: "Validation error",
        message: "Cuisine name is required"
      });
    }
    
    const cuisineName = name.trim();
    
    const [existing] = await pool.query(
      "SELECT id FROM cuisines WHERE LOWER(name) = LOWER(?)",
      [cuisineName]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({
        error: "Cuisine already exists",
        message: `A cuisine with name "${cuisineName}" already exists`
      });
    }
    
    const [result] = await pool.query(
      `INSERT INTO cuisines (name, description, image, is_featured) 
       VALUES (?, ?, ?, ?)`,
      [
        cuisineName,
        description || '',
        image || null,
        is_featured || false
      ]
    );
    
    res.status(201).json({
      success: true,
      message: "Cuisine created successfully",
      data: {
        id: result.insertId,
        name: cuisineName,
        slug: nameToSlug(cuisineName)
      }
    });
    
  } catch (error) {
    console.error("❌ Error creating cuisine:", error);
    res.status(500).json({
      error: "Failed to create cuisine",
      message: error.message
    });
  }
});

// GET restaurants by cuisine slug (UPDATED for better matching)
app.get("/cuisines/:slug", async (req, res) => {
  const slug = req.params.slug;
  try {
    const cuisineName = slugToName(slug).trim();
    console.log(`Looking for cuisine: "${cuisineName}" (from slug "${slug}")`);

    // First try: match by name (case-insensitive, trimmed)
    let [cuisineRows] = await pool.query(
      `SELECT id, name, description, image, is_featured 
       FROM cuisines 
       WHERE LOWER(TRIM(name)) = LOWER(?) AND is_active = TRUE`,
      [cuisineName]
    );

    // Second try: if no match, try matching the slug directly (if we stored slugs)
    if (cuisineRows.length === 0) {
      [cuisineRows] = await pool.query(
        `SELECT id, name, description, image, is_featured 
         FROM cuisines 
         WHERE slug = ? AND is_active = TRUE`,
        [slug]
      );
    }

    // Third try: try a LIKE match with hyphens replaced by spaces
    if (cuisineRows.length === 0) {
      const likeName = slug.replace(/-/g, ' ');
      [cuisineRows] = await pool.query(
        `SELECT id, name, description, image, is_featured 
         FROM cuisines 
         WHERE LOWER(TRIM(name)) LIKE LOWER(?) AND is_active = TRUE`,
        [`%${likeName}%`]
      );
    }

    if (cuisineRows.length === 0) {
      return res.status(404).json({
        error: "Cuisine not found",
        message: `Cuisine "${slug}" does not exist in our database.`
      });
    }

    const cuisine = cuisineRows[0];

    const [restaurantRows] = await pool.query(
      `SELECT 
        r.id,
        r.name,
        r.image,
        r.address,
        r.description,
        r.rating,
        r.delivery_time,
        r.delivery_fee,
        r.minimum_order
      FROM restaurants r
      INNER JOIN restaurant_cuisines rc ON r.id = rc.restaurant_id
      WHERE rc.cuisine_id = ? AND r.is_active = TRUE
      ORDER BY r.name ASC`,
      [cuisine.id]
    );

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as count FROM restaurant_cuisines WHERE cuisine_id = ?`,
      [cuisine.id]
    );

    const restaurant_count = countResult[0].count || 0;

    const restaurants = restaurantRows.map(restaurant => ({
      id: restaurant.id,
      name: restaurant.name,
      image: formatImageUrl(restaurant.image),
      location: restaurant.address || '',
      description: restaurant.description || '',
      rating: parseFloat(restaurant.rating) || 4.0,
      delivery_time: restaurant.delivery_time || '30-45 minutes',
      delivery_fee: parseFloat(restaurant.delivery_fee) || 2.99,
      minimum_order: parseFloat(restaurant.minimum_order) || 0,
      cuisine_name: cuisine.name
    }));

    const response = {
      cuisine: {
        id: cuisine.id,
        name: cuisine.name,
        description: cuisine.description || '',
        image: formatImageUrl(cuisine.image),
        is_featured: Boolean(cuisine.is_featured),
        restaurant_count: restaurant_count,
        slug: slug
      },
      restaurants: restaurants,
      count: restaurants.length
    };

    res.json(response);
  } catch (error) {
    console.error(`❌ GET /cuisines/${slug} error:`, error);
    res.status(500).json({
      error: "Server error",
      message: "Failed to fetch cuisine data",
      details: error.message
    });
  }
});

/* =========================
   3. RESTAURANT ENDPOINTS
========================= */

/* =========================
   MENU ITEM ENDPOINTS
========================= */

// POST create a new menu item (with optional image)
app.post("/api/menu-items", upload.single('image'), async (req, res) => {
  try {
    const { restaurant_id, name, description, base_price, is_available } = req.body;

    // Validate required fields
    if (!restaurant_id || !name || !base_price) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "restaurant_id, name, and base_price are required"
      });
    }

    // Check if restaurant exists
    const [restaurant] = await pool.query(
      "SELECT id FROM restaurants WHERE id = ? AND is_active = TRUE",
      [parseInt(restaurant_id)]
    );
    if (restaurant.length === 0) {
      return res.status(400).json({
        error: "Invalid restaurant",
        message: `Restaurant with ID ${restaurant_id} does not exist or is inactive`
      });
    }

    // Handle image path if uploaded
    const image = req.file ? `/uploads/${req.file.filename}` : null;

    // Insert into database
    const [result] = await pool.query(
      `INSERT INTO menu_items 
       (restaurant_id, name, description, base_price, image, is_available)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        parseInt(restaurant_id),
        name.trim(),
        description || '',
        parseFloat(base_price),
        image,
        is_available === 'true' || is_available === true || is_available === '1'
      ]
    );

    // Fetch the newly created item to return full details
    const [newItem] = await pool.query(
      "SELECT * FROM menu_items WHERE id = ?",
      [result.insertId]
    );

    const item = newItem[0];
    res.status(201).json({
      success: true,
      message: "Menu item created successfully",
      data: {
        id: item.id,
        restaurant_id: item.restaurant_id,
        name: item.name,
        description: item.description,
        base_price: parseFloat(item.base_price),
        image: formatImageUrl(item.image),
        is_available: Boolean(item.is_available),
        created_at: item.created_at,
        updated_at: item.updated_at
      }
    });
  } catch (error) {
    console.error("❌ Error creating menu item:", error);
    res.status(500).json({
      error: "Failed to create menu item",
      message: error.message
    });
  }
});

// GET all restaurants with filters
app.get("/restaurants", async (req, res) => {
  try {
    const { 
      q = '', 
      cuisine = '', 
      _page = 1, 
      _limit = 12,
      sort = 'name',
      order = 'asc'
    } = req.query;
    
    const page = Math.max(1, parseInt(_page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(_limit) || 12));
    const offset = (page - 1) * limit;
    
    const whereConditions = ["r.is_active = TRUE"];
    const params = [];
    
    if (q && q.trim() !== '') {
      whereConditions.push("(r.name LIKE ? OR r.description LIKE ?)");
      const searchTerm = `%${q.trim()}%`;
      params.push(searchTerm, searchTerm);
    }
    
    if (cuisine && cuisine.trim() !== '') {
      whereConditions.push("rc.cuisine_id IN (SELECT id FROM cuisines WHERE LOWER(name) = LOWER(?))");
      params.push(cuisine.trim());
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';
    
    const [countResult] = await pool.query(
      `SELECT COUNT(DISTINCT r.id) as total
       FROM restaurants r
       LEFT JOIN restaurant_cuisines rc ON r.id = rc.restaurant_id
       ${whereClause}`,
      params
    );
    
    const total = countResult[0].total || 0;
    const totalPages = Math.ceil(total / limit);
    
    const validSortColumns = ['name', 'rating', 'delivery_fee', 'created_at'];
    const sortColumn = validSortColumns.includes(sort) ? sort : 'name';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    
    const [rows] = await pool.query(
      `SELECT DISTINCT
        r.id,
        r.name,
        r.image,
        r.address,
        r.description,
        r.rating,
        r.delivery_time,
        r.delivery_fee,
        GROUP_CONCAT(DISTINCT c.name SEPARATOR ', ') AS cuisine_names,
        GROUP_CONCAT(DISTINCT c.id) AS cuisine_ids
       FROM restaurants r
       LEFT JOIN restaurant_cuisines rc ON r.id = rc.restaurant_id
       LEFT JOIN cuisines c ON rc.cuisine_id = c.id
       ${whereClause}
       GROUP BY r.id
       ORDER BY r.${sortColumn} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    
    const restaurants = rows.map(restaurant => ({
      id: restaurant.id,
      name: restaurant.name,
      image: formatImageUrl(restaurant.image),
      location: restaurant.address || '',
      description: restaurant.description || '',
      rating: parseFloat(restaurant.rating) || 4.0,
      delivery_time: restaurant.delivery_time || '30-45 minutes',
      delivery_fee: parseFloat(restaurant.delivery_fee) || 2.99,
      minimum_order: parseFloat(restaurant.minimum_order) || 0,
      cuisine_names: restaurant.cuisine_names || '',
      cuisine_ids: restaurant.cuisine_ids ? restaurant.cuisine_ids.split(',').map(id => parseInt(id)) : []
    }));
    
    res.setHeader('X-Total-Count', total);
    res.setHeader('X-Total-Pages', totalPages);
    res.setHeader('X-Current-Page', page);
    res.setHeader('X-Per-Page', limit);
    
    res.json(restaurants);
    
  } catch (error) {
    console.error("❌ /api/restaurants error:", error);
    res.status(500).json({
      error: "Failed to fetch restaurants",
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.sql : undefined
    });
  }
});

// GET restaurant details by ID
app.get("/api/restaurants/:id", async (req, res) => {
  try {
    const restaurantId = parseInt(req.params.id);
    
    if (isNaN(restaurantId) || restaurantId <= 0) {
      return res.status(400).json({
        error: "Invalid restaurant ID",
        message: "Restaurant ID must be a positive number"
      });
    }
    
    const [restaurantRows] = await pool.query(
      `SELECT r.*, 
        GROUP_CONCAT(DISTINCT c.name SEPARATOR ', ') as cuisine_names,
        GROUP_CONCAT(DISTINCT c.id) as cuisine_ids
       FROM restaurants r
       LEFT JOIN restaurant_cuisines rc ON r.id = rc.restaurant_id
       LEFT JOIN cuisines c ON rc.cuisine_id = c.id
       WHERE r.id = ? AND r.is_active = TRUE
       GROUP BY r.id`,
      [restaurantId]
    );
    
    if (restaurantRows.length === 0) {
      return res.status(404).json({
        error: "Restaurant not found",
        message: `Restaurant with ID ${restaurantId} does not exist or is inactive`
      });
    }
    
    const restaurant = restaurantRows[0];
    
    const [menuRows] = await pool.query(
      `SELECT 
        id,
        name,
        description,
        image,
        base_price,
        is_available
       FROM menu_items 
       WHERE restaurant_id = ? AND is_available = TRUE
       ORDER BY name ASC`,
      [restaurantId]
    );
    
    const response = {
      id: restaurant.id,
      name: restaurant.name,
      description: restaurant.description || '',
      address: restaurant.address || '',
      city: restaurant.city || '',
      phone: restaurant.phone || '',
      email: restaurant.email || '',
      website: restaurant.website || '',
      opening_hours: restaurant.opening_hours || '',
      image: formatImageUrl(restaurant.image),
      cover_image: formatImageUrl(restaurant.cover_image),
      rating: parseFloat(restaurant.rating) || 4.0,
      delivery_time: restaurant.delivery_time || '30-45 minutes',
      delivery_fee: parseFloat(restaurant.delivery_fee) || 2.99,
      minimum_order: parseFloat(restaurant.minimum_order) || 0,
      is_active: Boolean(restaurant.is_active),
      is_featured: Boolean(restaurant.is_featured),
      cuisine_names: restaurant.cuisine_names || '',
      cuisine_ids: restaurant.cuisine_ids ? restaurant.cuisine_ids.split(',').map(id => parseInt(id)) : [],
      menu: menuRows.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description || '',
        image: formatImageUrl(item.image),
        base_price: parseFloat(item.base_price) || 0,
        is_available: Boolean(item.is_available)
      }))
    };
    
    res.json(response);
    
  } catch (error) {
    console.error("❌ /api/restaurants/:id error:", error);
    res.status(500).json({
      error: "Failed to fetch restaurant details",
      message: error.message
    });
  }
});

// POST create new restaurant
app.post("/api/restaurants", async (req, res) => {
  try {
    const {
      name,
      description,
      address,
      city,
      phone,
      email,
      website,
      opening_hours,
      image,
      cover_image,
      rating,
      delivery_time,
      minimum_order,
      delivery_fee,
      is_featured,
      cuisine_ids
    } = req.body;
    
    const missingFields = validateRequiredFields(['name', 'address'], req.body);
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: "Validation error",
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }
    
    const [result] = await pool.query(
      `INSERT INTO restaurants 
       (name, description, address, city, phone, email, website, opening_hours, 
        image, cover_image, rating, delivery_time, minimum_order, delivery_fee, is_featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        description || '',
        address || '',
        city || '',
        phone || '',
        email || '',
        website || '',
        opening_hours || '',
        image || null,
        cover_image || null,
        parseFloat(rating) || 0.00,
        delivery_time || '30-45 minutes',
        parseFloat(minimum_order) || 0.00,
        parseFloat(delivery_fee) || 2.99,
        is_featured || false
      ]
    );
    
    const restaurantId = result.insertId;
    
    if (cuisine_ids && Array.isArray(cuisine_ids) && cuisine_ids.length > 0) {
      for (const cuisineId of cuisine_ids) {
        const [cuisineExists] = await pool.query(
          "SELECT id FROM cuisines WHERE id = ?",
          [parseInt(cuisineId)]
        );
        
        if (cuisineExists.length > 0) {
          await pool.query(
            "INSERT INTO restaurant_cuisines (restaurant_id, cuisine_id) VALUES (?, ?)",
            [restaurantId, parseInt(cuisineId)]
          );
        }
      }
    }
    
    res.status(201).json({
      success: true,
      message: "Restaurant created successfully",
      data: {
        id: restaurantId,
        name: name.trim(),
        cuisine_ids: cuisine_ids || []
      }
    });
    
  } catch (error) {
    console.error("❌ Error creating restaurant:", error);
    res.status(500).json({
      error: "Failed to create restaurant",
      message: error.message
    });
  }
});

/* =========================
   4. DEAL ENDPOINTS - FIXED VERSION
========================= */

// GET all active deals (simple version)
app.get("/deals", async (req, res) => {
  try {
    // First check if cuisine_id column exists
    let query;
    try {
      const [columns] = await pool.query("SHOW COLUMNS FROM deals LIKE 'cuisine_id'");
      if (columns.length > 0) {
        query = `
          SELECT 
            d.*,
            r.name AS restaurant_name,
            r.image AS restaurant_image,
            c.name as cuisine_name
          FROM deals d
          LEFT JOIN restaurants r ON d.restaurant_id = r.id AND r.is_active = TRUE
          LEFT JOIN cuisines c ON d.cuisine_id = c.id
          WHERE d.is_active = TRUE 
            AND (d.valid_until >= CURDATE() OR d.valid_until IS NULL)
          ORDER BY d.created_at DESC
        `;
      } else {
        query = `
          SELECT 
            d.*,
            r.name AS restaurant_name,
            r.image AS restaurant_image
          FROM deals d
          LEFT JOIN restaurants r ON d.restaurant_id = r.id AND r.is_active = TRUE
          WHERE d.is_active = TRUE 
            AND (d.valid_until >= CURDATE() OR d.valid_until IS NULL)
          ORDER BY d.created_at DESC
        `;
      }
    } catch (error) {
      query = `
        SELECT 
          d.*,
          r.name AS restaurant_name,
          r.image AS restaurant_image
        FROM deals d
        LEFT JOIN restaurants r ON d.restaurant_id = r.id AND r.is_active = TRUE
        WHERE d.is_active = TRUE 
          AND (d.valid_until >= CURDATE() OR d.valid_until IS NULL)
        ORDER BY d.created_at DESC
      `;
    }
    
    const [deals] = await pool.query(query);
    
    const formattedDeals = deals.map(deal => ({
      id: deal.id,
      title: deal.title,
      slug: deal.slug,
      description: deal.description || '',
      restaurant_id: deal.restaurant_id || null,
      restaurant_name: deal.restaurant_name || '',
      restaurant_image: formatImageUrl(deal.restaurant_image),
      cuisine_id: deal.cuisine_id || null,
      cuisine_name: deal.cuisine_name || null,
      original_price: parseFloat(deal.original_price) || 0,
      discount_price: parseFloat(deal.discount_price) || 0,
      discount_percent: parseInt(deal.discount_percent) || 0,
      image: formatImageUrl(deal.image),
      is_active: Boolean(deal.is_active),
      is_featured: Boolean(deal.is_featured),
      tags: deal.tags || '',
      valid_from: deal.valid_from,
      valid_until: deal.valid_until,
      quantity_available: deal.quantity_available,
      has_customization: Boolean(deal.has_customization || false),
      deal_type: deal.deal_type || 'other',
      created_at: deal.created_at,
      updated_at: deal.updated_at
    }));
    
    res.json(formattedDeals);
  } catch (error) {
    console.error("❌ /deals error:", error);
    res.status(500).json({ 
      error: "Failed to fetch deals",
      message: error.message
    });
  }
});

// GET all deals with filters and pagination - FIXED
app.get("/api/deals", async (req, res) => {
  try {
    const {
      featured,
      active = 'true',
      restaurant_id,
      cuisine_id,
      limit = 20,
      page = 1,
      deal_type,
      has_customization
    } = req.query;

    const whereConditions = ["d.is_active = TRUE"];
    const params = [];
    
    if (featured === 'true') whereConditions.push("d.is_featured = TRUE");
    if (restaurant_id) {
      whereConditions.push("d.restaurant_id = ?");
      params.push(parseInt(restaurant_id));
    }
    
    // Check if cuisine_id column exists before filtering by it
    let cuisineIdExists = false;
    try {
      const [columns] = await pool.query("SHOW COLUMNS FROM deals LIKE 'cuisine_id'");
      cuisineIdExists = columns.length > 0;
    } catch (error) {
      cuisineIdExists = false;
    }
    
    if (cuisineIdExists && cuisine_id) {
      whereConditions.push("d.cuisine_id = ?");
      params.push(parseInt(cuisine_id));
    }
    
    // Check if deal_type column exists
    let dealTypeExists = false;
    try {
      const [columns] = await pool.query("SHOW COLUMNS FROM deals LIKE 'deal_type'");
      dealTypeExists = columns.length > 0;
    } catch (error) {
      dealTypeExists = false;
    }
    
    if (dealTypeExists && deal_type) {
      whereConditions.push("d.deal_type = ?");
      params.push(deal_type);
    }
    
    // Check if has_customization column exists
    let hasCustomizationExists = false;
    try {
      const [columns] = await pool.query("SHOW COLUMNS FROM deals LIKE 'has_customization'");
      hasCustomizationExists = columns.length > 0;
    } catch (error) {
      hasCustomizationExists = false;
    }
    
    if (hasCustomizationExists && has_customization === 'true') {
      whereConditions.push("d.has_customization = TRUE");
    }
    
    whereConditions.push("(d.valid_until >= CURDATE() OR d.valid_until IS NULL)");
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM deals d ${whereClause}`,
      params
    );
    
    const total = countResult[0].total || 0;
    
    // Build query based on available columns
    let query;
    if (cuisineIdExists) {
      query = `
        SELECT 
          d.*,
          r.name as restaurant_name,
          r.image as restaurant_image,
          c.name as cuisine_name
        FROM deals d
        LEFT JOIN restaurants r ON d.restaurant_id = r.id
        LEFT JOIN cuisines c ON d.cuisine_id = c.id
        ${whereClause}
        ORDER BY d.created_at DESC
        LIMIT ? OFFSET ?
      `;
    } else {
      query = `
        SELECT 
          d.*,
          r.name as restaurant_name,
          r.image as restaurant_image
        FROM deals d
        LEFT JOIN restaurants r ON d.restaurant_id = r.id
        ${whereClause}
        ORDER BY d.created_at DESC
        LIMIT ? OFFSET ?
      `;
    }
    
    const [deals] = await pool.query(query, [...params, take, skip]);
    
    const formattedDeals = deals.map(deal => {
      let discountPercent = deal.discount_percent;
      if (!discountPercent && deal.original_price && deal.discount_price) {
        discountPercent = Math.round(((deal.original_price - deal.discount_price) / deal.original_price) * 100);
      }
      
      let detectedDealType = deal.deal_type || 'other';
      if (detectedDealType === 'other') {
        const title = (deal.title || '').toLowerCase();
        if (title.includes('pizza') && title.includes('burger')) {
          detectedDealType = 'combo';
        } else if (title.includes('pizza')) {
          detectedDealType = 'pizza';
        } else if (title.includes('burger')) {
          detectedDealType = 'burger';
        } else if (title.includes('combo')) {
          detectedDealType = 'combo';
        }
      }
      
      let hasCustomization = deal.has_customization || false;
      if (!hasCustomization) {
        const title = (deal.title || '').toLowerCase();
        const description = (deal.description || '').toLowerCase();
        const tags = (deal.tags || '').toLowerCase();
        
        const hasPizza = title.includes('pizza') || description.includes('pizza') || tags.includes('pizza');
        const hasBurger = title.includes('burger') || description.includes('burger') || tags.includes('burger');
        const hasCombo = title.includes('combo') || description.includes('combo') || tags.includes('combo');
        
        hasCustomization = hasPizza || hasBurger || hasCombo;
      }
      
      return {
        id: deal.id,
        title: deal.title,
        slug: deal.slug,
        description: deal.description || '',
        restaurant_id: deal.restaurant_id,
        restaurant_name: deal.restaurant_name,
        restaurant_image: formatImageUrl(deal.restaurant_image),
        cuisine_id: deal.cuisine_id || null,
        cuisine_name: deal.cuisine_name || null,
        original_price: parseFloat(deal.original_price) || 0,
        discount_price: parseFloat(deal.discount_price) || 0,
        discount_percent: discountPercent || 0,
        image: formatImageUrl(deal.image),
        is_active: Boolean(deal.is_active),
        is_featured: Boolean(deal.is_featured),
        tags: deal.tags || '',
        valid_from: deal.valid_from,
        valid_until: deal.valid_until,
        quantity_available: deal.quantity_available,
        has_customization: hasCustomization,
        deal_type: detectedDealType,
        created_at: deal.created_at,
        updated_at: deal.updated_at
      };
    });
    
    res.json({
      success: true,
      data: formattedDeals,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error("❌ /api/deals error:", error);
    res.status(500).json({ 
      error: "Failed to fetch deals",
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.sql : undefined
    });
  }
});

// GET single deal by ID - FIXED
app.get("/api/deals/:id", async (req, res) => {
  try {
    const dealId = parseInt(req.params.id);
    
    if (isNaN(dealId) || dealId <= 0) {
      return res.status(400).json({
        error: "Invalid deal ID",
        message: "Deal ID must be a positive number"
      });
    }
    
    // Check if cuisine_id column exists
    let query;
    try {
      const [columns] = await pool.query("SHOW COLUMNS FROM deals LIKE 'cuisine_id'");
      if (columns.length > 0) {
        query = `
          SELECT 
            d.*,
            r.name AS restaurant_name,
            r.image AS restaurant_image,
            c.name as cuisine_name
          FROM deals d
          LEFT JOIN restaurants r ON d.restaurant_id = r.id
          LEFT JOIN cuisines c ON d.cuisine_id = c.id
          WHERE d.id = ? AND d.is_active = TRUE
        `;
      } else {
        query = `
          SELECT 
            d.*,
            r.name AS restaurant_name,
            r.image AS restaurant_image
          FROM deals d
          LEFT JOIN restaurants r ON d.restaurant_id = r.id
          WHERE d.id = ? AND d.is_active = TRUE
        `;
      }
    } catch (error) {
      query = `
        SELECT 
          d.*,
          r.name AS restaurant_name,
          r.image AS restaurant_image
        FROM deals d
        LEFT JOIN restaurants r ON d.restaurant_id = r.id
        WHERE d.id = ? AND d.is_active = TRUE
      `;
    }
    
    const [deals] = await pool.query(query, [dealId]);
    
    if (deals.length === 0) {
      return res.status(404).json({
        error: "Deal not found",
        message: `Deal with ID ${dealId} does not exist or is inactive`
      });
    }
    
    const deal = deals[0];
    
    let discountPercent = deal.discount_percent;
    if (!discountPercent && deal.original_price && deal.discount_price) {
      discountPercent = Math.round(((deal.original_price - deal.discount_price) / deal.original_price) * 100);
    }
    
    let detectedDealType = deal.deal_type || 'other';
    if (detectedDealType === 'other') {
      const title = (deal.title || '').toLowerCase();
      if (title.includes('pizza') && title.includes('burger')) {
        detectedDealType = 'combo';
      } else if (title.includes('pizza')) {
        detectedDealType = 'pizza';
      } else if (title.includes('burger')) {
        detectedDealType = 'burger';
      } else if (title.includes('combo')) {
        detectedDealType = 'combo';
      }
    }
    
    let hasCustomization = deal.has_customization || false;
    if (!hasCustomization) {
      const title = (deal.title || '').toLowerCase();
      const description = (deal.description || '').toLowerCase();
      const tags = (deal.tags || '').toLowerCase();
      
      const hasPizza = title.includes('pizza') || description.includes('pizza') || tags.includes('pizza');
      const hasBurger = title.includes('burger') || description.includes('burger') || tags.includes('burger');
      const hasCombo = title.includes('combo') || description.includes('combo') || tags.includes('combo');
      
      hasCustomization = hasPizza || hasBurger || hasCombo;
    }
    
    const formattedDeal = {
      id: deal.id,
      title: deal.title,
      slug: deal.slug,
      description: deal.description || '',
      restaurant_id: deal.restaurant_id,
      restaurant_name: deal.restaurant_name,
      restaurant_image: formatImageUrl(deal.restaurant_image),
      cuisine_id: deal.cuisine_id || null,
      cuisine_name: deal.cuisine_name || null,
      original_price: parseFloat(deal.original_price) || 0,
      discount_price: parseFloat(deal.discount_price) || 0,
      discount_percent: discountPercent || 0,
      image: formatImageUrl(deal.image),
      is_active: Boolean(deal.is_active),
      is_featured: Boolean(deal.is_featured),
      tags: deal.tags || '',
      valid_from: deal.valid_from,
      valid_until: deal.valid_until,
      quantity_available: deal.quantity_available,
      has_customization: hasCustomization,
      deal_type: detectedDealType,
      created_at: deal.created_at,
      updated_at: deal.updated_at
    };
    
    res.json({
      success: true,
      data: formattedDeal
    });
    
  } catch (error) {
    console.error("❌ /api/deals/:id error:", error);
    res.status(500).json({
      error: "Failed to fetch deal",
      message: error.message
    });
  }
});

// GET deal customization data
app.get("/api/deals/:id/customization", async (req, res) => {
  try {
    const dealId = parseInt(req.params.id);
    
    if (isNaN(dealId) || dealId <= 0) {
      return res.status(400).json({
        error: "Invalid deal ID",
        message: "Deal ID must be a positive number"
      });
    }
    
    const [deals] = await pool.query(
      `SELECT 
        d.*,
        r.name AS restaurant_name,
        r.image AS restaurant_image
       FROM deals d
       LEFT JOIN restaurants r ON d.restaurant_id = r.id
       WHERE d.id = ? AND d.is_active = TRUE`,
      [dealId]
    );
    
    if (deals.length === 0) {
      return res.status(404).json({
        error: "Deal not found",
        message: `Deal with ID ${dealId} does not exist or is inactive`
      });
    }
    
    const deal = deals[0];
    
    const title = (deal.title || '').toLowerCase();
    const description = (deal.description || '').toLowerCase();
    const tags = (deal.tags || '').toLowerCase();
    
    const hasPizza = title.includes('pizza') || description.includes('pizza') || tags.includes('pizza');
    const hasBurger = title.includes('burger') || description.includes('burger') || tags.includes('burger');
    const hasCombo = title.includes('combo') || description.includes('combo') || tags.includes('combo');
    
    let dealType = deal.deal_type || 'other';
    if (dealType === 'other') {
      if (hasPizza && hasBurger) {
        dealType = 'combo';
      } else if (hasPizza) {
        dealType = 'pizza';
      } else if (hasBurger) {
        dealType = 'burger';
      } else if (hasCombo) {
        dealType = 'combo';
      }
    }
    
    let items = [];
    
    if (dealType === 'pizza' || (hasPizza && !hasBurger)) {
      items = [
        {
          id: 1,
          name: deal.title.includes('Pizza') ? deal.title : 'Cheese Pizza',
          description: deal.description || 'Delicious cheese pizza with mozzarella and tomato sauce',
          base_price: deal.discount_price || 399,
          crusts: [
            { id: 1, name: "Regular", price: 0 },
            { id: 2, name: "Thin Crust", price: 20 },
            { id: 3, name: "Cheesy Crust", price: 30 }
          ],
          toppings: [
            { id: 1, name: "Extra Cheese", price: 20 },
            { id: 2, name: "Mushrooms", price: 15 },
            { id: 3, name: "Olives", price: 10 },
            { id: 4, name: "Pepperoni", price: 25 }
          ]
        }
      ];
    } else if (dealType === 'burger' || (hasBurger && !hasPizza)) {
      items = [
        {
          id: 2,
          name: deal.title.includes('Burger') ? deal.title : 'Beef Burger',
          description: deal.description || 'Juicy beef burger with lettuce, tomato, and special sauce',
          base_price: deal.discount_price || 249,
          sizes: [
            { id: 1, name: "Regular", price: 0 },
            { id: 2, name: "Large", price: 50 },
            { id: 3, name: "Jumbo", price: 80 }
          ],
          addons: [
            { id: 1, name: "Extra Patty", price: 50 },
            { id: 2, name: "Bacon", price: 30 },
            { id: 3, name: "Cheese Slice", price: 20 },
            { id: 4, name: "Avocado", price: 25 },
            { id: 5, name: "Fried Egg", price: 15 }
          ]
        }
      ];
    } else if (dealType === 'combo' || (hasPizza && hasBurger)) {
      const totalPrice = deal.discount_price || 599;
      const pizzaPrice = Math.floor(totalPrice * 0.6);
      const burgerPrice = Math.floor(totalPrice * 0.4);
      
      items = [
        {
          id: 1,
          name: 'Cheese Pizza',
          description: 'Delicious cheese pizza with mozzarella and tomato sauce',
          base_price: pizzaPrice,
          crusts: [
            { id: 1, name: "Regular", price: 0 },
            { id: 2, name: "Thin Crust", price: 20 },
            { id: 3, name: "Cheesy Crust", price: 30 }
          ],
          toppings: [
            { id: 1, name: "Extra Cheese", price: 20 },
            { id: 2, name: "Mushrooms", price: 15 },
            { id: 3, name: "Olives", price: 10 },
            { id: 4, name: "Pepperoni", price: 25 }
          ]
        },
        {
          id: 2,
          name: 'Beef Burger',
          description: 'Juicy beef burger with lettuce, tomato, and special sauce',
          base_price: burgerPrice,
          sizes: [
            { id: 1, name: "Regular", price: 0 },
            { id: 2, name: "Large", price: 50 },
            { id: 3, name: "Jumbo", price: 80 }
          ],
          addons: [
            { id: 1, name: "Extra Patty", price: 50 },
            { id: 2, name: "Bacon", price: 30 },
            { id: 3, name: "Cheese Slice", price: 20 },
            { id: 4, name: "Avocado", price: 25 },
            { id: 5, name: "Fried Egg", price: 15 }
          ]
        }
      ];
    } else {
      items = [
        {
          id: 3,
          name: deal.title,
          description: deal.description || 'Special offer',
          base_price: deal.discount_price || 0
        }
      ];
    }
    
    const response = {
      success: true,
      deal: {
        id: deal.id,
        title: deal.title,
        description: deal.description || '',
        discount_price: parseFloat(deal.discount_price) || 0,
        original_price: parseFloat(deal.original_price) || 0,
        restaurant_name: deal.restaurant_name || 'Restaurant',
        restaurant_image: formatImageUrl(deal.restaurant_image),
        discount_percent: deal.discount_percent || 0
      },
      items: items,
      deal_type: dealType
    };
    
    res.json(response);
    
  } catch (error) {
    console.error("❌ /api/deals/:id/customization error:", error);
    res.status(500).json({
      error: "Failed to fetch deal customization",
      message: error.message
    });
  }
});

// POST create new deal - FIXED
app.post("/api/deals", upload.single('image'), async (req, res) => {
  try {
    const {
      title,
      description,
      original_price,
      discount_price,
      discount_percent,
      restaurant_id,
      cuisine_id,
      valid_from,
      valid_until,
      tags,
      deal_type,
      is_featured,
      is_active = true,
      has_customization,
      quantity_available
    } = req.body;
    
    const missingFields = validateRequiredFields(['title', 'original_price', 'restaurant_id'], req.body);
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: "Validation error",
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }
    
    const [restaurantRows] = await pool.query(
      "SELECT id FROM restaurants WHERE id = ? AND is_active = TRUE",
      [parseInt(restaurant_id)]
    );
    
    if (restaurantRows.length === 0) {
      return res.status(400).json({
        error: "Invalid restaurant",
        message: `Restaurant with ID ${restaurant_id} does not exist or is inactive`
      });
    }
    
    // Check if cuisine_id column exists
    let cuisineIdExists = false;
    try {
      const [columns] = await pool.query("SHOW COLUMNS FROM deals LIKE 'cuisine_id'");
      cuisineIdExists = columns.length > 0;
    } catch (error) {
      cuisineIdExists = false;
    }
    
    let finalCuisineId = null;
    if (cuisineIdExists && cuisine_id) {
      const [cuisineRows] = await pool.query(
        "SELECT id FROM cuisines WHERE id = ?",
        [parseInt(cuisine_id)]
      );
      
      if (cuisineRows.length === 0) {
        return res.status(400).json({
          error: "Invalid cuisine",
          message: `Cuisine with ID ${cuisine_id} does not exist`
        });
      }
      finalCuisineId = parseInt(cuisine_id);
    }
    
    const slug = nameToSlug(title);
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    
    const validFromMySQL = valid_from ? formatDateForMySQL(valid_from) : null;
    const validUntilMySQL = valid_until ? formatDateForMySQL(valid_until) : null;
    
    let finalDiscountPercent = discount_percent || 0;
    const originalPriceNum = parseFloat(original_price);
    const discountPriceNum = parseFloat(discount_price) || 0;
    
    if (discount_price && !discount_percent && originalPriceNum > 0) {
      finalDiscountPercent = Math.round(((originalPriceNum - discountPriceNum) / originalPriceNum) * 100);
    }
    
    let detectedDealType = deal_type || 'other';
    if (detectedDealType === 'other') {
      const titleLower = (title || '').toLowerCase();
      if (titleLower.includes('pizza') && titleLower.includes('burger')) {
        detectedDealType = 'combo';
      } else if (titleLower.includes('pizza')) {
        detectedDealType = 'pizza';
      } else if (titleLower.includes('burger')) {
        detectedDealType = 'burger';
      } else if (titleLower.includes('combo')) {
        detectedDealType = 'combo';
      }
    }
    
    let detectedHasCustomization = has_customization || false;
    if (!detectedHasCustomization) {
      const titleLower = (title || '').toLowerCase();
      const descriptionLower = (description || '').toLowerCase();
      const tagsLower = (tags || '').toLowerCase();
      
      const hasPizza = titleLower.includes('pizza') || descriptionLower.includes('pizza') || tagsLower.includes('pizza');
      const hasBurger = titleLower.includes('burger') || descriptionLower.includes('burger') || tagsLower.includes('burger');
      const hasCombo = titleLower.includes('combo') || descriptionLower.includes('combo') || tagsLower.includes('combo');
      
      detectedHasCustomization = hasPizza || hasBurger || hasCombo;
    }
    
    // Build insert query based on available columns
    let insertQuery;
    let insertValues;
    
    if (cuisineIdExists) {
      insertQuery = `
        INSERT INTO deals 
         (title, slug, description, restaurant_id, cuisine_id, image, discount_price, 
          original_price, discount_percent, valid_from, valid_until, tags, 
          has_customization, deal_type, is_featured, quantity_available, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      insertValues = [
        title.trim(),
        slug,
        description || '',
        parseInt(restaurant_id),
        finalCuisineId,
        image,
        discountPriceNum,
        originalPriceNum,
        finalDiscountPercent,
        validFromMySQL,
        validUntilMySQL,
        tags || '',
        detectedHasCustomization,
        detectedDealType,
        is_featured === 'true' || is_featured === true,
        quantity_available || null,
        is_active === 'true' || is_active === true
      ];
    } else {
      insertQuery = `
        INSERT INTO deals 
         (title, slug, description, restaurant_id, image, discount_price, 
          original_price, discount_percent, valid_from, valid_until, tags, 
          has_customization, deal_type, is_featured, quantity_available, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      insertValues = [
        title.trim(),
        slug,
        description || '',
        parseInt(restaurant_id),
        image,
        discountPriceNum,
        originalPriceNum,
        finalDiscountPercent,
        validFromMySQL,
        validUntilMySQL,
        tags || '',
        detectedHasCustomization,
        detectedDealType,
        is_featured === 'true' || is_featured === true,
        quantity_available || null,
        is_active === 'true' || is_active === true
      ];
    }
    
    const [result] = await pool.query(insertQuery, insertValues);
    
    // Get created deal
    const [newDeal] = await pool.query(
      `SELECT d.*, r.name as restaurant_name, r.image as restaurant_image 
       FROM deals d 
       LEFT JOIN restaurants r ON d.restaurant_id = r.id 
       WHERE d.id = ?`,
      [result.insertId]
    );
    
    const deal = newDeal[0];
    const formattedDeal = {
      id: deal.id,
      title: deal.title,
      slug: deal.slug,
      description: deal.description || '',
      restaurant_id: deal.restaurant_id,
      restaurant_name: deal.restaurant_name,
      restaurant_image: formatImageUrl(deal.restaurant_image),
      cuisine_id: deal.cuisine_id || null,
      original_price: parseFloat(deal.original_price) || 0,
      discount_price: parseFloat(deal.discount_price) || 0,
      discount_percent: parseInt(deal.discount_percent) || 0,
      image: formatImageUrl(deal.image),
      is_active: Boolean(deal.is_active),
      is_featured: Boolean(deal.is_featured),
      tags: deal.tags || '',
      valid_from: deal.valid_from,
      valid_until: deal.valid_until,
      quantity_available: deal.quantity_available,
      has_customization: Boolean(deal.has_customization || false),
      deal_type: deal.deal_type || 'other',
      created_at: deal.created_at,
      updated_at: deal.updated_at
    };
    
    res.status(201).json({
      success: true,
      message: "Deal created successfully",
      data: formattedDeal
    });
    
  } catch (error) {
    console.error("❌ Error creating deal:", error);
    res.status(500).json({
      error: "Failed to create deal",
      message: error.message
    });
  }
});

// PATCH update deal - FIXED
app.patch("/api/deals/:id", upload.single('image'), async (req, res) => {
  try {
    const dealId = parseInt(req.params.id);
    
    if (isNaN(dealId) || dealId <= 0) {
      return res.status(400).json({
        error: "Invalid deal ID",
        message: "Deal ID must be a positive number"
      });
    }
    
    const {
      title,
      description,
      restaurant_id,
      cuisine_id,
      discount_price,
      original_price,
      discount_percent,
      valid_from,
      valid_until,
      tags,
      has_customization,
      deal_type,
      is_active,
      is_featured,
      quantity_available
    } = req.body;
    
    const [existingDeal] = await pool.query(
      "SELECT id FROM deals WHERE id = ?",
      [dealId]
    );
    
    if (existingDeal.length === 0) {
      return res.status(404).json({
        error: "Deal not found",
        message: `Deal with ID ${dealId} does not exist`
      });
    }
    
    const updates = [];
    const values = [];
    
    if (title !== undefined) {
      updates.push("title = ?");
      values.push(title.trim());
      const slug = nameToSlug(title);
      updates.push("slug = ?");
      values.push(slug);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description);
    }
    if (restaurant_id !== undefined) {
      const [restaurantRows] = await pool.query(
        "SELECT id FROM restaurants WHERE id = ?",
        [parseInt(restaurant_id)]
      );
      
      if (restaurantRows.length === 0) {
        return res.status(400).json({
          error: "Invalid restaurant",
          message: `Restaurant with ID ${restaurant_id} does not exist`
        });
      }
      updates.push("restaurant_id = ?");
      values.push(parseInt(restaurant_id));
    }
    
    // Check if cuisine_id column exists
    let cuisineIdExists = false;
    try {
      const [columns] = await pool.query("SHOW COLUMNS FROM deals LIKE 'cuisine_id'");
      cuisineIdExists = columns.length > 0;
    } catch (error) {
      cuisineIdExists = false;
    }
    
    if (cuisineIdExists && cuisine_id !== undefined) {
      updates.push("cuisine_id = ?");
      values.push(cuisine_id ? parseInt(cuisine_id) : null);
    }
    
    if (req.file) {
      const image = `/uploads/${req.file.filename}`;
      updates.push("image = ?");
      values.push(image);
    }
    if (discount_price !== undefined) {
      updates.push("discount_price = ?");
      values.push(parseFloat(discount_price) || 0);
    }
    if (original_price !== undefined) {
      updates.push("original_price = ?");
      values.push(parseFloat(original_price) || 0);
    }
    if (discount_percent !== undefined) {
      updates.push("discount_percent = ?");
      values.push(parseInt(discount_percent) || 0);
    }
    if (valid_from !== undefined) {
      updates.push("valid_from = ?");
      values.push(valid_from ? formatDateForMySQL(valid_from) : null);
    }
    if (valid_until !== undefined) {
      updates.push("valid_until = ?");
      values.push(valid_until ? formatDateForMySQL(valid_until) : null);
    }
    if (tags !== undefined) {
      updates.push("tags = ?");
      values.push(tags);
    }
    if (has_customization !== undefined) {
      updates.push("has_customization = ?");
      values.push(has_customization === 'true' || has_customization === true);
    }
    if (deal_type !== undefined) {
      updates.push("deal_type = ?");
      values.push(deal_type);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active === 'true' || is_active === true);
    }
    if (is_featured !== undefined) {
      updates.push("is_featured = ?");
      values.push(is_featured === 'true' || is_featured === true);
    }
    if (quantity_available !== undefined) {
      updates.push("quantity_available = ?");
      values.push(quantity_available);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        error: "No updates provided",
        message: "Please provide at least one field to update"
      });
    }
    
    values.push(dealId);
    
    await pool.query(
      `UPDATE deals SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
    
    const [updatedDeal] = await pool.query(
      `SELECT d.*, r.name as restaurant_name, r.image as restaurant_image 
       FROM deals d 
       LEFT JOIN restaurants r ON d.restaurant_id = r.id 
       WHERE d.id = ?`,
      [dealId]
    );
    
    const deal = updatedDeal[0];
    const formattedDeal = {
      id: deal.id,
      title: deal.title,
      slug: deal.slug,
      description: deal.description || '',
      restaurant_id: deal.restaurant_id,
      restaurant_name: deal.restaurant_name,
      restaurant_image: formatImageUrl(deal.restaurant_image),
      cuisine_id: deal.cuisine_id || null,
      original_price: parseFloat(deal.original_price) || 0,
      discount_price: parseFloat(deal.discount_price) || 0,
      discount_percent: parseInt(deal.discount_percent) || 0,
      image: formatImageUrl(deal.image),
      is_active: Boolean(deal.is_active),
      is_featured: Boolean(deal.is_featured),
      tags: deal.tags || '',
      valid_from: deal.valid_from,
      valid_until: deal.valid_until,
      quantity_available: deal.quantity_available,
      has_customization: Boolean(deal.has_customization || false),
      deal_type: deal.deal_type || 'other',
      created_at: deal.created_at,
      updated_at: deal.updated_at
    };
    
    res.json({
      success: true,
      message: "Deal updated successfully",
      data: formattedDeal
    });
    
  } catch (error) {
    console.error("❌ Error updating deal:", error);
    res.status(500).json({
      error: "Failed to update deal",
      message: error.message
    });
  }
});

// DELETE deal
app.delete("/api/deals/:id", async (req, res) => {
  try {
    const dealId = parseInt(req.params.id);
    
    if (isNaN(dealId) || dealId <= 0) {
      return res.status(400).json({
        error: "Invalid deal ID",
        message: "Deal ID must be a positive number"
      });
    }
    
    const [existingDeal] = await pool.query(
      "SELECT id FROM deals WHERE id = ?",
      [dealId]
    );
    
    if (existingDeal.length === 0) {
      return res.status(404).json({
        error: "Deal not found",
        message: `Deal with ID ${dealId} does not exist`
      });
    }
    
    await pool.query(
      "UPDATE deals SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [dealId]
    );
    
    res.json({
      success: true,
      message: "Deal deleted successfully"
    });
    
  } catch (error) {
    console.error("❌ Error deleting deal:", error);
    res.status(500).json({
      error: "Failed to delete deal",
      message: error.message
    });
  }
});

/* =========================
   5. UPLOAD ENDPOINTS
========================= */

// POST upload image
app.post("/api/upload", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: "No file uploaded",
        message: "Please select an image file to upload"
      });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    
    res.json({
      success: true,
      message: "File uploaded successfully",
      data: {
        imageUrl: formatImageUrl(imageUrl),
        filePath: imageUrl,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error("❌ Upload error:", error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: "File too large",
        message: "Maximum file size is 5MB"
      });
    }
    
    res.status(500).json({ 
      error: "Failed to upload file",
      message: error.message 
    });
  }
});

/* =========================
   6. ORDER ENDPOINTS (UPDATED)
========================= */

// POST /api/orders – Place a new order (supports both menu items and deals)
app.post("/api/orders", async (req, res) => {
  let connection;
  try {
    const {
      user_id,
      restaurant_id,
      items,               // array of { menu_item_id?, deal_id?, quantity, price }
      delivery_address,
      contact_number,
      payment_method,
      notes,
      total_amount
    } = req.body;

    // Basic validation
    if (!restaurant_id || !items || !items.length || !delivery_address || !contact_number) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields"
      });
    }

    // Verify restaurant exists
    const [restaurantCheck] = await pool.query(
      "SELECT id FROM restaurants WHERE id = ? AND is_active = TRUE",
      [restaurant_id]
    );
    if (restaurantCheck.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid or inactive restaurant"
      });
    }

    // Generate a unique order number
    const orderNumber = `ORD${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`;

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Insert order
    const [orderResult] = await connection.query(
      `INSERT INTO orders
       (user_id, restaurant_id, order_number, total_amount, status,
        payment_method, delivery_address, contact_number, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id || 1,
        restaurant_id,
        orderNumber,
        total_amount || 0,
        "pending",
        payment_method || "Cash on Delivery",
        delivery_address,
        contact_number,
        notes || null
      ]
    );

    const orderId = orderResult.insertId;

    // Insert order items – can be menu items or deals
    for (const item of items) {
      const quantity = item.quantity || 1;
      const unitPrice = item.price || 0;

      if (item.deal_id) {
        // It's a deal
        await connection.query(
          `INSERT INTO order_items (order_id, deal_id, quantity, unit_price)
           VALUES (?, ?, ?, ?)`,
          [orderId, item.deal_id, quantity, unitPrice]
        );
      } else {
        // Regular menu item
        const menuItemId = item.menu_item_id || item.id;
        if (!menuItemId) {
          throw new Error("Item has neither menu_item_id nor deal_id");
        }
        await connection.query(
          `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
           VALUES (?, ?, ?, ?)`,
          [orderId, menuItemId, quantity, unitPrice]
        );
      }
    }

    await connection.commit();
    connection.release();

    // Retrieve the created order with details
    const [newOrder] = await pool.query(
      `SELECT o.*, r.name as restaurant_name, r.address as restaurant_address
       FROM orders o
       LEFT JOIN restaurants r ON o.restaurant_id = r.id
       WHERE o.id = ?`,
      [orderId]
    );

    const [orderItems] = await pool.query(
      `SELECT oi.*, 
              mi.name as item_name, 
              d.title as deal_name,
              d.description as deal_description
       FROM order_items oi
       LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
       LEFT JOIN deals d ON oi.deal_id = d.id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    const order = newOrder[0];
    order.items = orderItems;

    res.status(201).json({
      success: true,
      message: "Order placed successfully",
      order
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error("❌ Error creating order:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create order",
      message: error.message
    });
  }
});

// GET /api/orders/:id – Retrieve an order by ID (UPDATED: removed phone column)
app.get("/api/orders/:id", async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    if (isNaN(orderId) || orderId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid order ID"
      });
    }

    const [orderRows] = await pool.query(
      `SELECT o.*, r.name as restaurant_name, r.address as restaurant_address,
              r.image as restaurant_image
       FROM orders o
       LEFT JOIN restaurants r ON o.restaurant_id = r.id
       WHERE o.id = ?`,
      [orderId]
    );

    if (orderRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Order not found"
      });
    }

    const order = orderRows[0];

    const [itemRows] = await pool.query(
      `SELECT oi.*, 
              mi.name as item_name, mi.description as item_description, mi.image as item_image,
              d.title as deal_name, d.description as deal_description, d.image as deal_image
       FROM order_items oi
       LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
       LEFT JOIN deals d ON oi.deal_id = d.id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    // Normalize item names for frontend
    order.items = itemRows.map(row => ({
      ...row,
      name: row.item_name || row.deal_name || "Item",
      description: row.item_description || row.deal_description || "",
      image: row.item_image || row.deal_image || null
    }));

    res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error("❌ Error fetching order:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch order",
      message: error.message
    });
  }
});

/* =========================
   7. DEBUG & UTILITY ENDPOINTS
========================= */

// GET debug info for database
app.get("/api/debug/db", async (req, res) => {
  try {
    const [tables] = await pool.query("SHOW TABLES");
    const tableNames = tables.map(t => Object.values(t)[0]);
    
    const tableInfo = {};
    
    for (const tableName of tableNames) {
      const [columns] = await pool.query(`DESCRIBE ${tableName}`);
      const [count] = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      tableInfo[tableName] = {
        columns: columns.map(c => c.Field),
        count: count[0].count
      };
    }
    
    res.json({
      tables: tableNames,
      tableInfo,
      database: process.env.DB_NAME || "foodieapp"
    });
  } catch (error) {
    console.error("❌ Debug endpoint error:", error);
    res.status(500).json({ 
      error: "Failed to fetch debug data",
      message: error.message 
    });
  }
});

// GET API documentation
app.get("/api/docs", (req, res) => {
  res.json({
    title: "FoodieApp API Documentation",
    version: "1.0.0",
    baseUrl: `http://localhost:${PORT}`,
    endpoints: [
      {
        method: "GET",
        path: "/api/health",
        description: "Health check endpoint"
      },
      {
        method: "GET",
        path: "/api/cuisines",
        description: "Get all cuisines"
      },
      {
        method: "POST",
        path: "/api/cuisines",
        description: "Create new cuisine"
      },
      {
        method: "GET",
        path: "/cuisines/:slug",
        description: "Get restaurants by cuisine slug"
      },
      {
        method: "GET",
        path: "/api/restaurants",
        description: "Get all restaurants with filters"
      },
      {
        method: "POST",
        path: "/api/restaurants",
        description: "Create new restaurant"
      },
      {
        method: "GET",
        path: "/api/restaurants/:id",
        description: "Get restaurant details with menu"
      },
      {
        method: "GET",
        path: "/deals",
        description: "Get all active deals (simple)"
      },
      {
        method: "GET",
        path: "/api/deals",
        description: "Get all deals with filters and pagination"
      },
      {
        method: "GET",
        path: "/api/deals/:id",
        description: "Get single deal by ID"
      },
      {
        method: "GET",
        path: "/api/deals/:id/customization",
        description: "Get deal customization data"
      },
      {
        method: "POST",
        path: "/api/deals",
        description: "Create new deal (with image upload)"
      },
      {
        method: "PATCH",
        path: "/api/deals/:id",
        description: "Update existing deal (partial update)"
      },
      {
        method: "DELETE",
        path: "/api/deals/:id",
        description: "Delete deal"
      },
      {
        method: "POST",
        path: "/api/upload",
        description: "Upload image file"
      },
      // New order endpoints
      {
        method: "POST",
        path: "/api/orders",
        description: "Place a new order (supports menu items and deals)"
      },
      {
        method: "GET",
        path: "/api/orders/:id",
        description: "Get order details by ID"
      },
      {
        method: "GET",
        path: "/api/debug/db",
        description: "Debug database information"
      }
    ]
  });
});

/* =========================
   ERROR HANDLING MIDDLEWARE
========================= */
app.use((error, req, res, next) => {
  console.error("❌ Server error:", error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: "File upload error",
        message: "Maximum file size is 5MB"
      });
    }
    return res.status(400).json({
      error: "File upload error",
      message: error.message
    });
  }
  
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
    suggestion: "Check the documentation at /api/docs"
  });
});

/* =========================
   START SERVER (Universal: works on both Pxxl and Vercel)
========================= */

// Export the app for potential serverless environments (like Vercel)
export default app;

// Start the server only if this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 4000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server is running on port ${port}`);
    // Test database connection asynchronously
    testDatabaseConnection().then(connected => {
      if (connected) {
        console.log("✅ Database connected successfully");
      } else {
        console.error("⚠️ Database connection failed");
      }
    }).catch(err => {
      console.error("⚠️ Error testing database connection:", err);
    });
  });
}