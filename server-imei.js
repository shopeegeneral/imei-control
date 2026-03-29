const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Dùng 1 pool duy nhất
const pool = require('./database/db');
global.db = pool;
global.dbPool = pool;
global.getPool = () => pool;

// ===========================================
// MIDDLEWARE
// ===========================================
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
}));

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===========================================
// REQUEST LOGGER
// ===========================================
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${ms}ms`);
  });
  next();
});

// ===========================================
// IMEI SESSION
// ===========================================
const imeiSession = session({
  store: new pgSession({
    pool: pool,
    tableName: 'imei_sessions',
    createTableIfMissing: true,
    pruneSessionInterval: 600,
    disableTouch: true
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'imei_sid',
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: false,
    sameSite: 'lax'
  },
  rolling: false
});

// ===========================================
// IMEI CONTROL ROUTES
// ===========================================
app.use('/imei-control', express.static(path.join(__dirname, 'public', 'imei-control')));

const { requireAuth, requireSupervisor, requireAdmin, requireRole, checkAuth } = require('./middleware_imei/auth');

app.use('/api', imeiSession);
app.use('/imei-control', imeiSession);

app.use('/api/auth', require('./routes_imei/auth'));
app.use('/api/devices', requireSupervisor, require('./routes_imei/devices'));
app.use('/api/scan', requireRole('admin', 'user', 'security'), require('./routes_imei/scan'));
app.use('/api/history', requireAuth, require('./routes_imei/history'));
app.use('/api/warehouses', requireAuth, require('./routes_imei/warehouses'));
app.use('/api/departments', requireSupervisor, require('./routes_imei/departments'));
app.use('/api/users', requireRole('admin', 'security'), require('./routes_imei/users'));
app.use('/api/blacklist', requireAuth, require('./routes_imei/blacklist'));

app.get('/', (req, res) => res.redirect('/imei-control/login'));
app.get('/imei-control', requireRole('admin', 'user', 'security'), (req, res) => res.sendFile(path.join(__dirname, 'public', 'imei-control', 'index.html')));
app.get('/imei-control/devices', requireSupervisor, (req, res) => res.sendFile(path.join(__dirname, 'public', 'imei-control', 'devices.html')));
app.get('/imei-control/warehouses', requireSupervisor, (req, res) => res.sendFile(path.join(__dirname, 'public', 'imei-control', 'warehouses.html')));
app.get('/imei-control/departments', requireSupervisor, (req, res) => res.sendFile(path.join(__dirname, 'public', 'imei-control', 'departments.html')));
app.get('/imei-control/history', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'imei-control', 'history.html')));
app.get('/imei-control/login', checkAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'imei-control', 'login.html')));
app.get('/imei-control/register', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'imei-control', 'register.html')));
app.get('/imei-control/users',          requireRole('admin', 'security'), (req, res) => res.sendFile(path.join(__dirname, 'public', 'imei-control', 'users.html')));
app.get('/imei-control/scan-blacklist', requireRole('admin', 'user'),     (req, res) => res.sendFile(path.join(__dirname, 'public', 'imei-control', 'scan-blacklist.html')));
app.get('/imei-control/blacklist',      requireAdmin,                     (req, res) => res.sendFile(path.join(__dirname, 'public', 'imei-control', 'blacklist.html')));

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Auto kill idle connections every 15 minutes (disabled)
// setInterval(async () => {
//   try {
//     const result = await pool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND datname = current_database() AND query_start < now() - INTERVAL '10 minutes'");
//     console.log('Auto-kill ran, killed:', result.rowCount);
//   } catch (err) {
//     console.error('Auto-kill error:', err.message);
//   }
// }, 10 * 1000);

app.listen(PORT, () => {
  console.log(`✅ IMEI Control Server running at http://localhost:${PORT}`);
  console.log(`📌 App: http://localhost:${PORT}/imei-control`);
});
