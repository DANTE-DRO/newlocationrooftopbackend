/**
 * LocationRooftop Management System - Backend
 * Fully Updated for Render.com Deployment
 */

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const app = express();

// === PORT (Render controls this) ===
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'locationrooftop-super-secret-key-change-me-in-prod-2026';

// ---------- Middleware ----------
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: '*', credentials: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('tiny'));

// Serve frontend (public folder)
const FRONTEND_DIR = path.join(__dirname, 'public');
if (fs.existsSync(FRONTEND_DIR)) {
  app.use(express.static(FRONTEND_DIR));
  console.log('✅ Frontend public folder served');
}

// ---------- DATABASE SETUP - FIXED FOR RENDER ----------
const DATA_DIR = process.env.DATA_DIR || '/var/data';

console.log(`📁 Data directory from env: ${DATA_DIR}`);

let finalDataDir = DATA_DIR;

// Try to create the directory (Render Disk)
if (!fs.existsSync(finalDataDir)) {
  try {
    fs.mkdirSync(finalDataDir, { recursive: true, mode: 0o777 });
    console.log(`✅ Created data directory: ${finalDataDir}`);
  } catch (err) {
    console.error(`❌ Could not create ${finalDataDir}:`, err.message);
    
    // Fallback: Use folder inside project (data will be lost on redeploy)
    finalDataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(finalDataDir)) {
      fs.mkdirSync(finalDataDir, { recursive: true });
      console.log(`⚠️ Using fallback directory: ${finalDataDir}`);
    }
  }
}

const DB_PATH = path.join(finalDataDir, 'locationrooftop.db');
console.log(`📁 Final Database path: ${DB_PATH}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    full_name TEXT,
    email TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    title TEXT,
    description TEXT,
    amount REAL DEFAULT 0,
    currency TEXT DEFAULT 'KES',
    metadata TEXT,
    source TEXT DEFAULT 'manual',
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    category TEXT,
    amount REAL NOT NULL,
    description TEXT,
    reference TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    position TEXT,
    department TEXT,
    phone TEXT,
    email TEXT,
    behavior_notes TEXT,
    conduct_score INTEGER DEFAULT 100,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    sku TEXT,
    quantity INTEGER DEFAULT 0,
    unit TEXT,
    unit_cost REAL DEFAULT 0,
    supplier TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT,
    action TEXT,
    details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed Default Users
function seedUser(username, plainPassword, role, fullName) {
  const row = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!row) {
    const hash = bcrypt.hashSync(plainPassword, 10);
    db.prepare('INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)')
      .run(username, hash, role, fullName);
    console.log(`Seeded user: ${username} (${role})`);
  }
}

seedUser('admin', '119722', 'admin', 'System Administrator');
seedUser('cost', 'cost123', 'cost_controller', 'Cost Controller');
seedUser('procurement', 'proc123', 'procurement', 'Procurement Officer');
seedUser('storekeeper', 'store123','storekeeper', 'Store Keeper');
seedUser('accounts', 'acc123', 'accounts', 'Accounts Officer');
seedUser('finance', 'fin123', 'finance_manager', 'Finance Manager');
seedUser('supervisor', 'sup123', 'supervisor', 'Supervisor');
seedUser('hr', 'hr123', 'hr', 'HR Manager');
seedUser('director', 'dir123', 'director', 'Director');
seedUser('auditor', 'aud123', 'auditor', 'Auditor');

// ---------- Helpers ----------
function logAudit(actor, action, details = '') {
  db.prepare('INSERT INTO audit_log (actor, action, details) VALUES (?, ?, ?)')
    .run(actor || 'system', action, typeof details === 'string' ? details : JSON.stringify(details));
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.replace(/^Bearer\s+/i, '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (roles.includes(req.user.role) || req.user.role === 'admin' || req.user.role === 'director') {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden — insufficient role' });
  };
}

// ---------- Routes ----------
app.get('/', (req, res) => {
  if (fs.existsSync(path.join(FRONTEND_DIR, 'index.html'))) {
    return res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  }
  res.json({ name: 'LocationRooftop API', status: 'running' });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(), 
    db: fs.existsSync(DB_PATH),
    dataDir: finalDataDir 
  });
});

// All other routes (login, records, etc.) are the same as your original code.
// Paste them here if missing. For now, the critical ones:

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, fullName: user.full_name },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  logAudit(user.username, 'login');
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, fullName: user.full_name } });
});

// ... (Add all your other routes here: records, transactions, staff, inventory, reports, chat, etc.)

// Catch-all error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
});