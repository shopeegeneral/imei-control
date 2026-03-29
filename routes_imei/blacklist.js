const express = require('express');
const router = express.Router();
const pool = require('../database/db');

// Middleware: only admin can manage (CRUD); scan is allowed for all authenticated users
function adminOnly(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  return res.status(403).json({ error: 'Chỉ Admin có quyền truy cập chức năng này' });
}

// Initialize table on startup
pool.query(`
  CREATE TABLE IF NOT EXISTS blacklist (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    cccd VARCHAR(50) NOT NULL,
    address TEXT,
    unit VARCHAR(255),
    vehicle_info TEXT,
    reason TEXT,
    expires_at DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255)
  )
`).catch(err => console.error('Blacklist table init error:', err.message));

// GET /api/blacklist — list with optional search & pagination
router.get('/', adminOnly, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();

  try {
    let params = [];
    let where = '';
    if (search) {
      where = ' WHERE full_name ILIKE $1 OR cccd ILIKE $1 OR unit ILIKE $1';
      params.push(`%${search}%`);
    }

    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT * FROM blacklist${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM blacklist${where}`, params),
    ]);

    res.json({ items: rows.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/blacklist — create new entry
router.post('/', adminOnly, async (req, res) => {
  const { full_name, cccd, address, unit, vehicle_info, reason, expires_at } = req.body;
  if (!full_name || !cccd) {
    return res.status(400).json({ error: 'Họ tên và CCCD là bắt buộc' });
  }

  const created_by = req.session.username || String(req.session.userId || '');

  try {
    const result = await pool.query(
      `INSERT INTO blacklist (full_name, cccd, address, unit, vehicle_info, reason, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        full_name.trim(),
        cccd.trim(),
        address ? address.trim() : null,
        unit ? unit.trim() : null,
        vehicle_info ? vehicle_info.trim() : null,
        reason ? reason.trim() : null,
        expires_at || null,
        created_by,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/blacklist/:id — update entry
router.put('/:id', adminOnly, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) return res.status(400).json({ error: 'ID không hợp lệ' });

  const { full_name, cccd, address, unit, vehicle_info, reason, expires_at } = req.body;
  if (!full_name || !cccd) {
    return res.status(400).json({ error: 'Họ tên và CCCD là bắt buộc' });
  }

  try {
    const result = await pool.query(
      `UPDATE blacklist SET full_name=$1, cccd=$2, address=$3, unit=$4, vehicle_info=$5, reason=$6, expires_at=$7
       WHERE id=$8 RETURNING *`,
      [
        full_name.trim(),
        cccd.trim(),
        address ? address.trim() : null,
        unit ? unit.trim() : null,
        vehicle_info ? vehicle_info.trim() : null,
        reason ? reason.trim() : null,
        expires_at || null,
        id,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/blacklist/:id — delete entry
router.delete('/:id', adminOnly, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) return res.status(400).json({ error: 'ID không hợp lệ' });

  try {
    const result = await pool.query('DELETE FROM blacklist WHERE id=$1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/blacklist/scan — search by last N digits of CCCD
router.post('/scan', async (req, res) => {
  const suffix = (req.body.suffix || '').trim();
  if (!suffix) {
    return res.status(400).json({ error: 'Vui lòng nhập số cuối CCCD' });
  }
  // Only allow digits
  if (!/^\d+$/.test(suffix)) {
    return res.status(400).json({ error: 'Số cuối CCCD chỉ được chứa chữ số' });
  }
  if (suffix.length < 4) {
    return res.status(400).json({ error: 'Vui lòng nhập ít nhất 4 số cuối CCCD' });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM blacklist WHERE cccd LIKE $1 ORDER BY full_name ASC",
      [`%${suffix}`]
    );
    res.json({ matches: result.rows, suffix });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
