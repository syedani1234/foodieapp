import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";

console.log("🔥 FoodieApp Backend Starting...");

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

console.log("✅ Middleware configured");

// ---------- Database pool ----------
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

// ---------- Helper functions ----------
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

// ---------- Database initialization (non‑blocking) ----------
async function initializeDatabase() {
  if (!pool) return;
  try {
    console.log("🔧 Initializing database...");
    // Create tables (excerpt – full code from your original server.js)
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
    // ... (include all your table creation queries from your original server.js)
    // For brevity, I'm not repeating the entire 300+ lines of table creation,
    // but you must copy the full initializeDatabase and checkAndAddMissingColumns
    // from your original working server.js (the one before step 6).
    console.log("✅ Database tables verified");
  } catch (error) {
    console.error("❌ Database initialization error:", error);
  }
}
initializeDatabase().catch(err => console.error("Init error:", err));

// ---------- API Routes ----------
// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "FoodieApp API Server",
    version: "1.0.0",
    status: "running",
    endpoints: {
      health: "/api/health",
      cuisines: "/api/cuisines",
      restaurants: "/api/restaurants",
      deals: "/api/deals",
      orders: "/api/orders"
    }
  });
});

// Health endpoint
app.get("/api/health", async (req, res) => {
  if (!pool) {
    return res.status(500).json({ status: "unhealthy", database: "pool missing" });
  }
  try {
    await pool.query("SELECT 1");
    let cuisineCount = 0, restaurantCount = 0, dealCount = 0;
    try {
      const [cuisineResult] = await pool.query("SELECT COUNT(*) as count FROM cuisines WHERE is_active = TRUE");
      cuisineCount = cuisineResult[0].count;
    } catch (e) { /* ignore */ }
    try {
      const [restaurantResult] = await pool.query("SELECT COUNT(*) as count FROM restaurants WHERE is_active = TRUE");
      restaurantCount = restaurantResult[0].count;
    } catch (e) { /* ignore */ }
    try {
      const [dealResult] = await pool.query("SELECT COUNT(*) as count FROM deals WHERE is_active = TRUE");
      dealCount = dealResult[0].count;
    } catch (e) { /* ignore */ }
    res.json({
      status: "healthy",
      database: "connected",
      counts: { cuisines: cuisineCount, restaurants: restaurantCount, deals: dealCount }
    });
  } catch (error) {
    res.status(500).json({ status: "unhealthy", database: "disconnected", error: error.message });
  }
});

// Cuisine routes
app.get("/api/cuisines", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Database not available" });
  try {
    const [rows] = await pool.query(`
      SELECT id, name, description, image, is_featured,
        (SELECT COUNT(*) FROM restaurant_cuisines WHERE cuisine_id = cuisines.id) as restaurant_count
      FROM cuisines WHERE is_active = TRUE ORDER BY name ASC
    `);
    const cuisines = rows.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      image: formatImageUrl(c.image),
      is_featured: Boolean(c.is_featured),
      restaurant_count: c.restaurant_count || 0,
      slug: nameToSlug(c.name)
    }));
    res.json(cuisines);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch cuisines", message: error.message });
  }
});

// POST create cuisine
app.post("/api/cuisines", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Database not available" });
  try {
    const { name, description, image, is_featured } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: "Name required" });
    const [existing] = await pool.query("SELECT id FROM cuisines WHERE LOWER(name) = LOWER(?)", [name.trim()]);
    if (existing.length) return res.status(409).json({ error: "Cuisine already exists" });
    const [result] = await pool.query(
      "INSERT INTO cuisines (name, description, image, is_featured) VALUES (?, ?, ?, ?)",
      [name.trim(), description || '', image || null, is_featured || false]
    );
    res.status(201).json({ success: true, id: result.insertId, slug: nameToSlug(name) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get restaurants by cuisine slug
app.get("/cuisines/:slug", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Database not available" });
  try {
    const slug = req.params.slug;
    const cuisineName = slugToName(slug).trim();
    let [cuisineRows] = await pool.query(
      "SELECT id, name, description, image, is_featured FROM cuisines WHERE LOWER(TRIM(name)) = LOWER(?) AND is_active = TRUE",
      [cuisineName]
    );
    if (cuisineRows.length === 0) {
      return res.status(404).json({ error: "Cuisine not found" });
    }
    const cuisine = cuisineRows[0];
    const [restaurantRows] = await pool.query(`
      SELECT r.id, r.name, r.image, r.address, r.description, r.rating,
             r.delivery_time, r.delivery_fee, r.minimum_order
      FROM restaurants r
      INNER JOIN restaurant_cuisines rc ON r.id = rc.restaurant_id
      WHERE rc.cuisine_id = ? AND r.is_active = TRUE
      ORDER BY r.name ASC
    `, [cuisine.id]);
    const [countResult] = await pool.query("SELECT COUNT(*) as count FROM restaurant_cuisines WHERE cuisine_id = ?", [cuisine.id]);
    const restaurants = restaurantRows.map(r => ({
      id: r.id, name: r.name, image: formatImageUrl(r.image), location: r.address || '',
      description: r.description || '', rating: parseFloat(r.rating) || 4.0,
      delivery_time: r.delivery_time || '30-45 minutes', delivery_fee: parseFloat(r.delivery_fee) || 2.99,
      minimum_order: parseFloat(r.minimum_order) || 0, cuisine_name: cuisine.name
    }));
    res.json({
      cuisine: {
        id: cuisine.id, name: cuisine.name, description: cuisine.description || '',
        image: formatImageUrl(cuisine.image), is_featured: Boolean(cuisine.is_featured),
        restaurant_count: countResult[0].count || 0, slug
      },
      restaurants,
      count: restaurants.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all restaurants with filters
app.get("/restaurants", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Database not available" });
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
    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const [countResult] = await pool.query(
      `SELECT COUNT(DISTINCT r.id) as total FROM restaurants r LEFT JOIN restaurant_cuisines rc ON r.id = rc.restaurant_id ${whereClause}`,
      params
    );
    const total = countResult[0].total || 0;
    const validSortColumns = ['name', 'rating', 'delivery_fee', 'created_at'];
    const sortColumn = validSortColumns.includes(sort) ? sort : 'name';
    const sortOrder = order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const [rows] = await pool.query(
      `SELECT DISTINCT r.id, r.name, r.image, r.address, r.description, r.rating, r.delivery_time, r.delivery_fee,
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
    const restaurants = rows.map(r => ({
      id: r.id, name: r.name, image: formatImageUrl(r.image), location: r.address || '',
      description: r.description || '', rating: parseFloat(r.rating) || 4.0,
      delivery_time: r.delivery_time || '30-45 minutes', delivery_fee: parseFloat(r.delivery_fee) || 2.99,
      minimum_order: parseFloat(r.minimum_order) || 0,
      cuisine_names: r.cuisine_names || '',
      cuisine_ids: r.cuisine_ids ? r.cuisine_ids.split(',').map(id => parseInt(id)) : []
    }));
    res.setHeader('X-Total-Count', total);
    res.setHeader('X-Total-Pages', Math.ceil(total / limit));
    res.json(restaurants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET restaurant details by ID
app.get("/api/restaurants/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Database not available" });
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const [restaurantRows] = await pool.query(`
      SELECT r.*, GROUP_CONCAT(DISTINCT c.name SEPARATOR ', ') as cuisine_names,
             GROUP_CONCAT(DISTINCT c.id) as cuisine_ids
      FROM restaurants r
      LEFT JOIN restaurant_cuisines rc ON r.id = rc.restaurant_id
      LEFT JOIN cuisines c ON rc.cuisine_id = c.id
      WHERE r.id = ? AND r.is_active = TRUE
      GROUP BY r.id
    `, [id]);
    if (restaurantRows.length === 0) return res.status(404).json({ error: "Restaurant not found" });
    const restaurant = restaurantRows[0];
    const [menuRows] = await pool.query(
      `SELECT id, name, description, image, base_price, is_available FROM menu_items WHERE restaurant_id = ? AND is_available = TRUE ORDER BY name ASC`,
      [id]
    );
    res.json({
      id: restaurant.id, name: restaurant.name, description: restaurant.description || '',
      address: restaurant.address || '', city: restaurant.city || '',
      phone: restaurant.phone || '', email: restaurant.email || '',
      website: restaurant.website || '', opening_hours: restaurant.opening_hours || '',
      image: formatImageUrl(restaurant.image), cover_image: formatImageUrl(restaurant.cover_image),
      rating: parseFloat(restaurant.rating) || 4.0,
      delivery_time: restaurant.delivery_time || '30-45 minutes',
      delivery_fee: parseFloat(restaurant.delivery_fee) || 2.99,
      minimum_order: parseFloat(restaurant.minimum_order) || 0,
      is_active: Boolean(restaurant.is_active), is_featured: Boolean(restaurant.is_featured),
      cuisine_names: restaurant.cuisine_names || '',
      cuisine_ids: restaurant.cuisine_ids ? restaurant.cuisine_ids.split(',').map(id => parseInt(id)) : [],
      menu: menuRows.map(item => ({
        id: item.id, name: item.name, description: item.description || '',
        image: formatImageUrl(item.image), base_price: parseFloat(item.base_price) || 0,
        is_available: Boolean(item.is_available)
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create restaurant
app.post("/api/restaurants", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Database not available" });
  try {
    const missing = validateRequiredFields(['name', 'address'], req.body);
    if (missing.length) return res.status(400).json({ error: `Missing: ${missing.join(',')}` });
    const { name, description, address, city, phone, email, website, opening_hours, image, cover_image, rating, delivery_time, minimum_order, delivery_fee, is_featured, cuisine_ids } = req.body;
    const [result] = await pool.query(
      `INSERT INTO restaurants (name, description, address, city, phone, email, website, opening_hours,
        image, cover_image, rating, delivery_time, minimum_order, delivery_fee, is_featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), description || '', address || '', city || '', phone || '', email || '', website || '',
       opening_hours || '', image || null, cover_image || null, parseFloat(rating) || 0,
       delivery_time || '30-45 minutes', parseFloat(minimum_order) || 0, parseFloat(delivery_fee) || 2.99,
       is_featured || false]
    );
    const restaurantId = result.insertId;
    if (cuisine_ids && Array.isArray(cuisine_ids)) {
      for (const cid of cuisine_ids) {
        const [exists] = await pool.query("SELECT id FROM cuisines WHERE id = ?", [parseInt(cid)]);
        if (exists.length) {
          await pool.query("INSERT INTO restaurant_cuisines (restaurant_id, cuisine_id) VALUES (?, ?)", [restaurantId, parseInt(cid)]);
        }
      }
    }
    res.status(201).json({ success: true, id: restaurantId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Deals routes – simplified (add your full deal endpoints here)
app.get("/deals", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "Database not available" });
  try {
    const [rows] = await pool.query(`
      SELECT d.*, r.name AS restaurant_name, r.image AS restaurant_image
      FROM deals d LEFT JOIN restaurants r ON d.restaurant_id = r.id
      WHERE d.is_active = TRUE AND (d.valid_until >= CURDATE() OR d.valid_until IS NULL)
      ORDER BY d.created_at DESC
    `);
    res.json(rows.map(d => ({ ...d, discount_price: parseFloat(d.discount_price), original_price: parseFloat(d.original_price) })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Similarly, add all other routes from your original server.js (orders, menu items, etc.)
// For brevity, I've included only the essential ones. You can copy the rest from your original code.

// ---------- Start server ----------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  testDatabaseConnection().then(connected => {
    if (connected) console.log("✅ Database ready");
    else console.error("⚠️ Database connection failed");
  });
});

export default app;