const express = require('express');
const pool = require('../database/db');
const { requireSupervisor, requireRole } = require('../middleware_imei/auth');

const router = express.Router();

// GET /api/warehouses - Lấy danh sách kho (lọc theo warehouse_access của user)
router.get('/', async (req, res) => {
  try {
    const role = req.session?.role;
    const warehouseAccess = req.session?.warehouseAccess;

    // admin and security get all warehouses
    if (!role || ['admin', 'security'].includes(role) || !warehouseAccess || warehouseAccess === 'all') {
      const result = await pool.query('SELECT * FROM imei_warehouses ORDER BY name ASC');
      return res.json({ data: result.rows });
    }

    // supervisor / user: filter by warehouse_access
    let allowedIds = [];
    try {
      allowedIds = typeof warehouseAccess === 'string' ? JSON.parse(warehouseAccess) : warehouseAccess;
    } catch (e) {
      allowedIds = [];
    }

    if (!Array.isArray(allowedIds) || allowedIds.length === 0) {
      // fallback: all warehouses
      const result = await pool.query('SELECT * FROM imei_warehouses ORDER BY name ASC');
      return res.json({ data: result.rows });
    }

    const result = await pool.query(
      'SELECT * FROM imei_warehouses WHERE id = ANY($1::int[]) ORDER BY name ASC',
      [allowedIds]
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get warehouses error:', err);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách kho' });
  }
});

// POST /api/warehouses - Tạo kho mới (chỉ admin và security)
router.post('/', requireRole('admin', 'security'), async (req, res) => {
  const { name, warehouse_type } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tên kho không được để trống' });
  }

  const type = warehouse_type && ['WHS', 'SOC'].includes(warehouse_type) ? warehouse_type : 'WHS';

  try {
    const result = await pool.query(
      'INSERT INTO imei_warehouses (name, warehouse_type) VALUES ($1, $2) RETURNING *',
      [name.trim(), type]
    );

    res.status(201).json({
      message: 'Tạo kho thành công',
      warehouse: result.rows[0]
    });
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Tên kho đã tồn tại' });
    }
    console.error('Create warehouse error:', err);
    res.status(500).json({ error: 'Lỗi khi tạo kho' });
  }
});

// PUT /api/warehouses/:id - Cập nhật kho (chỉ admin và security)
router.put('/:id', requireRole('admin', 'security'), async (req, res) => {
  const { id } = req.params;
  const { name, warehouse_type } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tên kho không được để trống' });
  }

  const type = warehouse_type && ['WHS', 'SOC'].includes(warehouse_type) ? warehouse_type : 'WHS';

  try {
    const result = await pool.query(
      'UPDATE imei_warehouses SET name = $1, warehouse_type = $2 WHERE id = $3 RETURNING *',
      [name.trim(), type, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy kho' });
    }

    res.json({
      message: 'Cập nhật kho thành công',
      warehouse: result.rows[0]
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Tên kho đã tồn tại' });
    }
    console.error('Update warehouse error:', err);
    res.status(500).json({ error: 'Lỗi khi cập nhật kho' });
  }
});

// DELETE /api/warehouses/:id - Xóa kho (chỉ admin và security)
router.delete('/:id', requireRole('admin', 'security'), async (req, res) => {
  const { id } = req.params;

  try {
    // Check if warehouse is in use
    const checkDevices = await pool.query(
      'SELECT COUNT(*) FROM imei_device_warehouses WHERE warehouse_id = $1',
      [id]
    );

    if (parseInt(checkDevices.rows[0].count) > 0) {
      return res.status(409).json({ 
        error: 'Không thể xóa kho đang được sử dụng bởi thiết bị' 
      });
    }

    const result = await pool.query(
      'DELETE FROM imei_warehouses WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy kho' });
    }

    res.json({ message: 'Xóa kho thành công' });
  } catch (err) {
    console.error('Delete warehouse error:', err);
    res.status(500).json({ error: 'Lỗi khi xóa kho' });
  }
});

module.exports = router;
