const express = require('express');
const router = express.Router();
const pool = require('../database/db');

function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

async function resolveWarehouseNameById(warehouseId) {
  if (!warehouseId || warehouseId === 'all') {
    return null;
  }

  const result = await pool.query(
    'SELECT name FROM imei_warehouses WHERE id = $1 LIMIT 1',
    [toInt(warehouseId, 0)]
  );

  return result.rows[0]?.name || null;
}

function escapeCsvValue(value) {
  return String(value ?? '').replace(/"/g, '""');
}

// GET /api/history
router.get('/', async (req, res) => {
  try {
    const { imei, action, from, to, warehouse_id, limit = 100, offset = 0 } = req.query;
    const conditions = [];
    const params = [];

    if (imei) {
      params.push(`%${imei}%`);
      conditions.push(`h.imei ILIKE $${params.length}`);
    }
    if (action && ['IN', 'OUT'].includes(action)) {
      params.push(action);
      conditions.push(`h.action = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`h.scanned_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`h.scanned_at <= $${params.length}::date + INTERVAL '1 day'`);
    }
    if (warehouse_id && warehouse_id !== 'all') {
      params.push(parseInt(warehouse_id));
      conditions.push(`h.warehouse_id = $${params.length}`);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // COUNT riêng, không wrap subquery
    const countParams = [...params];
    const countQuery = `
      SELECT COUNT(*) as total
      FROM imei_scan_history h
      ${where}
    `;
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    // Data query riêng
    params.push(parseInt(limit));
    params.push(parseInt(offset));
    const dataQuery = `
      SELECT h.*, d.full_name, d.employee_code, d.device_type
      FROM imei_scan_history h
      LEFT JOIN imei_devices d ON h.device_id = d.id
      ${where}
      ORDER BY h.scanned_at DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
    `;
    const result = await pool.query(dataQuery, params);
    res.json({ data: result.rows, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/history/modify
router.get('/modify', async (req, res) => {
  try {
    const { imei, action, from, to, warehouse_id, limit = 100, offset = 0 } = req.query;
    const conditions = [];
    const params = [];

    if (imei) {
      params.push(`%${imei}%`);
      conditions.push(`(
        ml.imei ILIKE $${params.length}
        OR ml.email ILIKE $${params.length}
        OR COALESCE(ml.field_name, '') ILIKE $${params.length}
        OR COALESCE(ml.old_value, '') ILIKE $${params.length}
        OR COALESCE(ml.new_value, '') ILIKE $${params.length}
      )`);
    }
    if (action && ['Sửa', 'Xóa', 'Active', 'Deactive'].includes(action)) {
      params.push(action);
      conditions.push(`ml.action = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`ml.created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`ml.created_at <= $${params.length}::date + INTERVAL '1 day'`);
    }
    if (warehouse_id && warehouse_id !== 'all') {
      const warehouseName = await resolveWarehouseNameById(warehouse_id);
      if (warehouseName) {
        params.push(`%${warehouseName}%`);
        conditions.push(`COALESCE(ml.warehouse_name, '') ILIKE $${params.length}`);
      }
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM imei_modify_log ml ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const dataParams = [...params, toInt(limit, 100), toInt(offset, 0)];
    const result = await pool.query(
      `SELECT ml.*
       FROM imei_modify_log ml
       ${where}
       ORDER BY ml.created_at DESC, ml.id DESC
       LIMIT $${dataParams.length - 1}
       OFFSET $${dataParams.length}`,
      dataParams
    );

    res.json({ data: result.rows, total, limit: toInt(limit, 100), offset: toInt(offset, 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/history/stats
router.get('/stats', async (req, res) => {
  try {
    const { warehouse_id } = req.query;
    const stats = {};

    if (warehouse_id && warehouse_id !== 'all') {
      const whId = parseInt(warehouse_id);

      const deviceStats = await pool.query(`
        SELECT
          COUNT(DISTINCT sub.device_id) as total_devices,
          COUNT(DISTINCT sub.device_id) FILTER (WHERE sub.action = 'IN') as in_stock,
          COUNT(DISTINCT sub.device_id) FILTER (WHERE sub.action = 'OUT') as out_stock
        FROM (
          SELECT DISTINCT ON (h.device_id) h.device_id, h.action
          FROM imei_scan_history h
          WHERE h.warehouse_id = $1
          ORDER BY h.device_id, h.scanned_at DESC
        ) sub
      `, [whId]);
      stats.devices = deviceStats.rows[0];

      const todayScans = await pool.query(`
        SELECT
          COUNT(*) as total_scans,
          COUNT(*) FILTER (WHERE action = 'IN') as check_ins,
          COUNT(*) FILTER (WHERE action = 'OUT') as check_outs
        FROM imei_scan_history
        WHERE warehouse_id = $1
          AND scanned_at >= CURRENT_DATE
          AND scanned_at < CURRENT_DATE + INTERVAL '1 day'
      `, [whId]);
      stats.today = todayScans.rows[0];
    } else {
      const deviceStats = await pool.query(`
        SELECT
          COUNT(*) as total_devices,
          COUNT(*) FILTER (WHERE status = 'IN') as in_stock,
          COUNT(*) FILTER (WHERE status = 'OUT') as out_stock
        FROM imei_devices
      `);
      stats.devices = deviceStats.rows[0];

      const todayScans = await pool.query(`
        SELECT
          COUNT(*) as total_scans,
          COUNT(*) FILTER (WHERE action = 'IN') as check_ins,
          COUNT(*) FILTER (WHERE action = 'OUT') as check_outs
        FROM imei_scan_history
        WHERE scanned_at >= CURRENT_DATE
          AND scanned_at < CURRENT_DATE + INTERVAL '1 day'
      `);
      stats.today = todayScans.rows[0];
    }

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/history/export
router.get('/export', async (req, res) => {
  try {
    const { from, to, warehouse_id } = req.query;
    const conditions = [];
    const params = [];

    if (from) {
      params.push(from);
      conditions.push(`h.scanned_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`h.scanned_at <= $${params.length}::date + INTERVAL '1 day'`);
    }
    if (warehouse_id && warehouse_id !== 'all') {
      params.push(parseInt(warehouse_id));
      conditions.push(`h.warehouse_id = $${params.length}`);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const query = `
      SELECT h.imei, d.device_type, d.employee_code, d.full_name, d.email,
             h.action, h.scanned_by, h.scanned_at, h.warehouse_name
      FROM imei_scan_history h
      LEFT JOIN imei_devices d ON h.device_id = d.id
      ${where}
      ORDER BY h.scanned_at DESC
    `;
    const result = await pool.query(query, params);

    const header = 'IMEI,Loai thiet bi,Ma NV,Ho ten,Email,Kho,Hanh dong,Nguoi scan,Thoi gian\n';
    const rows = result.rows.map(r =>
      `"${escapeCsvValue(r.imei)}","${escapeCsvValue(r.device_type)}","${escapeCsvValue(r.employee_code)}","${escapeCsvValue(r.full_name)}","${escapeCsvValue(r.email)}","${escapeCsvValue(r.warehouse_name)}","${escapeCsvValue(r.action)}","${escapeCsvValue(r.scanned_by)}","${escapeCsvValue(r.scanned_at)}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=scan_history.csv');
    res.send('\uFEFF' + header + rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/history/modify/export
router.get('/modify/export', async (req, res) => {
  try {
    const { imei, action, from, to, warehouse_id } = req.query;
    const conditions = [];
    const params = [];

    if (imei) {
      params.push(`%${imei}%`);
      conditions.push(`(
        ml.imei ILIKE $${params.length}
        OR ml.email ILIKE $${params.length}
        OR COALESCE(ml.field_name, '') ILIKE $${params.length}
        OR COALESCE(ml.old_value, '') ILIKE $${params.length}
        OR COALESCE(ml.new_value, '') ILIKE $${params.length}
      )`);
    }
    if (action && ['Sửa', 'Xóa', 'Active', 'Deactive'].includes(action)) {
      params.push(action);
      conditions.push(`ml.action = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`ml.created_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`ml.created_at <= $${params.length}::date + INTERVAL '1 day'`);
    }
    if (warehouse_id && warehouse_id !== 'all') {
      const warehouseName = await resolveWarehouseNameById(warehouse_id);
      if (warehouseName) {
        params.push(`%${warehouseName}%`);
        conditions.push(`COALESCE(ml.warehouse_name, '') ILIKE $${params.length}`);
      }
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await pool.query(
      `SELECT ml.*
       FROM imei_modify_log ml
       ${where}
       ORDER BY ml.created_at DESC, ml.id DESC`,
      params
    );

    const header = 'IMEI,Email,Kho,Hanh dong,Truong,Cu,Moi,Thoi gian\n';
    const rows = result.rows.map((row) =>
      `"${escapeCsvValue(row.imei)}","${escapeCsvValue(row.email)}","${escapeCsvValue(row.warehouse_name)}","${escapeCsvValue(row.action)}","${escapeCsvValue(row.field_name)}","${escapeCsvValue(row.old_value)}","${escapeCsvValue(row.new_value)}","${escapeCsvValue(row.created_at)}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=modify_history.csv');
    res.send('\uFEFF' + header + rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;