import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";

// ------------------------------------------------------------
// Global error handlers – catch any startup crashes and log them
// ------------------------------------------------------------
process.on('uncaughtException', (err) => {
  console.error('🔥 UNCAUGHT EXCEPTION:', err);
  setTimeout(() => process.exit(1), 1000);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

console.log("1. Starting server.js...");

const app = express();
const PORT = process.env.PORT || 4000;

console.log("2. Imports done, creating app...");

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

console.log("3. App created, setting up middleware...");

/* =========================
   DATABASE CONNECTION (Robust)
========================= */
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
  console.log("6. Database pool created");
} catch (err) {
  console.error("❌ Failed to create database pool:", err.message);
  pool = null;
}

console.log("7. Pool creation attempted, defining helper functions...");

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

console.log("8. Helpers defined, initializing database...");

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
    
  } catch (error) {
    console.error("❌ Database initialization error:", error);
    // Do NOT throw – allow server to continue
  }
}

async function checkAndAddMissingColumns() {
  try {
    console.log("🔍 Checking for missing columns...");
    
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

// Call initializeDatabase but DO NOT await – let it run in background, catch errors
initializeDatabase().catch(err => {
  console.error("❌ Unhandled error in initializeDatabase:", err);
});

console.log("9. initializeDatabase called, defining routes...");

/* =========================
   API ROUTES
========================= */

// Root endpoint
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
      upload_image: "POST /api/upload" // Note: upload endpoint is removed, but kept in doc for reference
    }
  });
});

// Health endpoint
app.get("/api/health", async (req, res) => {
  if (!pool) {
    return res.status(500).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      database: "disconnected (pool missing)"
    });
  }
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

// Cuisine routes
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

// Get restaurants by cuisine slug
app.get("/cuisines/:slug", async (req, res) => {
  const slug = req.params.slug;
  try {
    const cuisineName = slugToName(slug).trim();
    console.log(`Looking for cuisine: "${cuisineName}" (from slug "${slug}")`);

    let [cuisineRows] = await pool.query(
      `SELECT id, name, description, image, is_featured 
       FROM cuisines 
       WHERE LOWER(TRIM(name)) = LOWER(?) AND is_active = TRUE`,
      [cuisineName]
    );

    if (cuisineRows.length === 0) {
      [cuisineRows] = await pool.query(
        `SELECT id, name, description, image, is_featured 
         FROM cuisines 
         WHERE slug = ? AND is_active = TRUE`,
        [slug]
      );
    }

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

// Restaurant routes (GET all, GET by ID, POST)
app.get("/restaurants", async (req, res) => {
  try {
    const { q = '', cuisine = '', _page = 1, _limit = 12, sort = 'name', order = 'asc' } = req.query;
    
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
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
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

// Menu items POST (without image upload)
app.post("/api/menu-items", async (req, res) => {
  try {
    const { restaurant_id, name, description, base_price, is_available } = req.body;

    if (!restaurant_id || !name || !base_price) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "restaurant_id, name, and base_price are required"
      });
    }

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

    const [result] = await pool.query(
      `INSERT INTO menu_items 
       (restaurant_id, name, description, base_price, image, is_available)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        parseInt(restaurant_id),
        name.trim(),
        description || '',
        parseFloat(base_price),
        null, // image not supported in this version
        is_available === 'true' || is_available === true || is_available === '1'
      ]
    );

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
        image: null,
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

// Deals routes (simplified – add all your deal endpoints here)
app.get("/deals", async (req, res) => {
  try {
    let query = `
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

app.get("/api/deals", async (req, res) => {
  try {
    const { featured, restaurant_id, limit = 20, page = 1 } = req.query;
    const whereConditions = ["d.is_active = TRUE"];
    const params = [];
    if (featured === 'true') whereConditions.push("d.is_featured = TRUE");
    if (restaurant_id) {
      whereConditions.push("d.restaurant_id = ?");
      params.push(parseInt(restaurant_id));
    }
    whereConditions.push("(d.valid_until >= CURDATE() OR d.valid_until IS NULL)");
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    
    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM deals d ${whereClause}`, params);
    const total = countResult[0].total || 0;
    
    const query = `
      SELECT d.*, r.name as restaurant_name, r.image as restaurant_image
      FROM deals d
      LEFT JOIN restaurants r ON d.restaurant_id = r.id
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [deals] = await pool.query(query, [...params, take, skip]);
    
    const formattedDeals = deals.map(deal => ({
      id: deal.id,
      title: deal.title,
      slug: deal.slug,
      description: deal.description || '',
      restaurant_id: deal.restaurant_id,
      restaurant_name: deal.restaurant_name,
      restaurant_image: formatImageUrl(deal.restaurant_image),
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
    
    res.json({
      success: true,
      data: formattedDeals,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error("❌ /api/deals error:", error);
    res.status(500).json({ error: "Failed to fetch deals", message: error.message });
  }
});

app.get("/api/deals/:id", async (req, res) => {
  try {
    const dealId = parseInt(req.params.id);
    if (isNaN(dealId) || dealId <= 0) {
      return res.status(400).json({ error: "Invalid deal ID" });
    }
    const [deals] = await pool.query(
      `SELECT d.*, r.name AS restaurant_name, r.image AS restaurant_image
       FROM deals d
       LEFT JOIN restaurants r ON d.restaurant_id = r.id
       WHERE d.id = ? AND d.is_active = TRUE`,
      [dealId]
    );
    if (deals.length === 0) {
      return res.status(404).json({ error: "Deal not found" });
    }
    const deal = deals[0];
    res.json({ success: true, data: deal });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Orders endpoints (simplified)
app.post("/api/orders", async (req, res) => {
  let connection;
  try {
    const { user_id, restaurant_id, items, delivery_address, contact_number, payment_method, notes, total_amount } = req.body;
    if (!restaurant_id || !items || !items.length || !delivery_address || !contact_number) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    const [restaurantCheck] = await pool.query("SELECT id FROM restaurants WHERE id = ? AND is_active = TRUE", [restaurant_id]);
    if (restaurantCheck.length === 0) {
      return res.status(400).json({ success: false, error: "Invalid or inactive restaurant" });
    }
    const orderNumber = `ORD${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [orderResult] = await connection.query(
      `INSERT INTO orders (user_id, restaurant_id, order_number, total_amount, status, payment_method, delivery_address, contact_number, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id || 1, restaurant_id, orderNumber, total_amount || 0, "pending", payment_method || "Cash on Delivery", delivery_address, contact_number, notes || null]
    );
    const orderId = orderResult.insertId;
    for (const item of items) {
      const quantity = item.quantity || 1;
      const unitPrice = item.price || 0;
      if (item.deal_id) {
        await connection.query(
          `INSERT INTO order_items (order_id, deal_id, quantity, unit_price) VALUES (?, ?, ?, ?)`,
          [orderId, item.deal_id, quantity, unitPrice]
        );
      } else {
        const menuItemId = item.menu_item_id || item.id;
        if (!menuItemId) throw new Error("Item has neither menu_item_id nor deal_id");
        await connection.query(
          `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, ?, ?, ?)`,
          [orderId, menuItemId, quantity, unitPrice]
        );
      }
    }
    await connection.commit();
    connection.release();
    const [newOrder] = await pool.query(
      `SELECT o.*, r.name as restaurant_name, r.address as restaurant_address
       FROM orders o LEFT JOIN restaurants r ON o.restaurant_id = r.id WHERE o.id = ?`,
      [orderId]
    );
    const [orderItems] = await pool.query(
      `SELECT oi.*, mi.name as item_name, d.title as deal_name
       FROM order_items oi
       LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
       LEFT JOIN deals d ON oi.deal_id = d.id
       WHERE oi.order_id = ?`,
      [orderId]
    );
    const order = newOrder[0];
    order.items = orderItems;
    res.status(201).json({ success: true, message: "Order placed successfully", order });
  } catch (error) {
    if (connection) { await connection.rollback(); connection.release(); }
    console.error("❌ Error creating order:", error);
    res.status(500).json({ success: false, error: "Failed to create order", message: error.message });
  }
});

app.get("/api/orders/:id", async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    if (isNaN(orderId) || orderId <= 0) return res.status(400).json({ success: false, error: "Invalid order ID" });
    const [orderRows] = await pool.query(
      `SELECT o.*, r.name as restaurant_name, r.address as restaurant_address, r.image as restaurant_image
       FROM orders o LEFT JOIN restaurants r ON o.restaurant_id = r.id WHERE o.id = ?`,
      [orderId]
    );
    if (orderRows.length === 0) return res.status(404).json({ success: false, error: "Order not found" });
    const order = orderRows[0];
    const [itemRows] = await pool.query(
      `SELECT oi.*, mi.name as item_name, mi.description as item_description, mi.image as item_image,
              d.title as deal_name, d.description as deal_description, d.image as deal_image
       FROM order_items oi
       LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
       LEFT JOIN deals d ON oi.deal_id = d.id
       WHERE oi.order_id = ?`,
      [orderId]
    );
    order.items = itemRows.map(row => ({
      ...row,
      name: row.item_name || row.deal_name || "Item",
      description: row.item_description || row.deal_description || "",
      image: row.item_image || row.deal_image || null
    }));
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug and docs endpoints
app.get("/api/debug/db", async (req, res) => {
  try {
    const [tables] = await pool.query("SHOW TABLES");
    const tableNames = tables.map(t => Object.values(t)[0]);
    const tableInfo = {};
    for (const tableName of tableNames) {
      const [columns] = await pool.query(`DESCRIBE ${tableName}`);
      const [count] = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      tableInfo[tableName] = { columns: columns.map(c => c.Field), count: count[0].count };
    }
    res.json({ tables: tableNames, tableInfo, database: process.env.DB_NAME || "foodieapp" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/docs", (req, res) => {
  res.json({
    title: "FoodieApp API Documentation",
    version: "1.0.0",
    baseUrl: `http://localhost:${PORT}`,
    endpoints: [
      { method: "GET", path: "/api/health", description: "Health check endpoint" },
      { method: "GET", path: "/api/cuisines", description: "Get all cuisines" },
      { method: "POST", path: "/api/cuisines", description: "Create new cuisine" },
      { method: "GET", path: "/cuisines/:slug", description: "Get restaurants by cuisine slug" },
      { method: "GET", path: "/api/restaurants", description: "Get all restaurants with filters" },
      { method: "POST", path: "/api/restaurants", description: "Create new restaurant" },
      { method: "GET", path: "/api/restaurants/:id", description: "Get restaurant details with menu" },
      { method: "GET", path: "/deals", description: "Get all active deals (simple)" },
      { method: "GET", path: "/api/deals", description: "Get all deals with filters and pagination" },
      { method: "GET", path: "/api/deals/:id", description: "Get single deal by ID" },
      { method: "POST", path: "/api/deals", description: "Create new deal (without image)" },
      { method: "PATCH", path: "/api/deals/:id", description: "Update existing deal (without image)" },
      { method: "DELETE", path: "/api/deals/:id", description: "Delete deal" },
      { method: "POST", path: "/api/orders", description: "Place a new order" },
      { method: "GET", path: "/api/orders/:id", description: "Get order details by ID" },
      { method: "GET", path: "/api/debug/db", description: "Debug database information" }
    ]
  });
});

console.log("10. Routes defined, setting up error handlers...");

/* =========================
   ERROR HANDLING MIDDLEWARE
========================= */
app.use((error, req, res, next) => {
  console.error("❌ Server error:", error);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    message: `Cannot ${req.method} ${req.originalUrl}`,
    suggestion: "Check the documentation at /api/docs"
  });
});

console.log("11. Error handlers set, exporting app...");

export default app;

console.log("12. App exported, starting server...");

const port = process.env.PORT || 4000;
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server is running on port ${port}`);
  testDatabaseConnection().then(connected => {
    if (connected) console.log("✅ DB connected");
    else console.error("⚠️ DB connection failed");
  }).catch(err => console.error("⚠️ DB test error:", err));
});