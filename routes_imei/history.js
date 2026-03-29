const express = require('express');
const router = express.Router();
const pool = require('../database/db');

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
      `"${r.imei}","${r.device_type || ''}","${r.employee_code || ''}","${r.full_name || ''}","${r.email || ''}","${r.warehouse_name || ''}","${r.action}","${r.scanned_by}","${r.scanned_at}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=scan_history.csv');
    res.send('\uFEFF' + header + rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;