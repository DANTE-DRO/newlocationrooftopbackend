/**
 * LocationRooftop Management System - Backend
 * Fixed for Render.com deployment
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

// === IMPORTANT: Use Render's PORT ===
const PORT = process.env.PORT || 3000;           // ← Fixed

const JWT_SECRET = process.env.JWT_SECRET || 'locationrooftop-super-secret-key-change-me-in-prod-2026';

// ---------- Middleware ----------
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: '*', credentials: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('tiny'));

// Serve frontend if present
const FRONTEND_DIR = path.join(__dirname, 'public');
if (fs.existsSync(FRONTEND_DIR)) {
  app.use(express.static(FRONTEND_DIR));
}

// ---------- Database Setup (Very Important for Render) ----------
const DATA_DIR = process.env.DATA_DIR || '/var/data';

console.log(`📁 Data directory: ${DATA_DIR}`);

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('✅ Created data directory');
  } catch (err) {
    console.error('❌ Could not create data directory:', err.message);
  }
}

const DB_PATH = path.join(DATA_DIR, 'locationrooftop.db');
console.log(`📁 Database path: ${DB_PATH}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// Create tables (same as before)
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

// Seed default users (same as before)
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

// ---------- Helpers & Routes (Rest is same as your original) ----------
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

// ---------- All your routes (unchanged) ----------
app.get('/', (req, res) => {
  if (fs.existsSync(path.join(FRONTEND_DIR, 'index.html'))) {
    return res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  }
  res.json({
    name: 'LocationRooftop API',
    status: 'running',
    version: '1.0.0'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: fs.existsSync(DB_PATH) });
});

// ... [All your other routes: /api/login, /api/records, /api/transactions, etc.] 
// Copy and paste all your remaining routes from the old file here.
// I didn't repeat them to save space, but keep them exactly as you had.

app.post('/api/chat', authMiddleware, (req, res) => { /* your chat route */ });
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
});