const express = require('express');
const pool = require('../database/db');
const { requireRole } = require('../middleware_imei/auth');

const router = express.Router();

// GET /api/departments - Lấy danh sách bộ phận (có thể lọc theo warehouse_type)
router.get('/', async (req, res) => {
  try {
    const { warehouse_type } = req.query;
    let query = 'SELECT * FROM imei_department';
    const params = [];

    if (warehouse_type && ['WHS', 'SOC'].includes(warehouse_type)) {
      query += ' WHERE warehouse_type = $1';
      params.push(warehouse_type);
    }

    query += ' ORDER BY warehouse_type, name ASC';

    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get departments error:', err);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách bộ phận' });
  }
});

// POST /api/departments - Tạo bộ phận mới (chỉ admin/security)
router.post('/', requireRole('admin', 'security'), async (req, res) => {
  const { name, warehouse_type } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tên bộ phận không được để trống' });
  }
  if (!warehouse_type || !['WHS', 'SOC'].includes(warehouse_type)) {
    return res.status(400).json({ error: 'Loại kho không hợp lệ (WHS hoặc SOC)' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO imei_department (name, warehouse_type) VALUES ($1, $2) RETURNING *',
      [name.trim(), warehouse_type]
    );

    res.status(201).json({
      message: 'Tạo bộ phận thành công',
      department: result.rows[0]
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Tên bộ phận đã tồn tại' });
    }
    console.error('Create department error:', err);
    res.status(500).json({ error: 'Lỗi khi tạo bộ phận' });
  }
});

// PUT /api/departments/:id - Cập nhật bộ phận (chỉ admin/security)
router.put('/:id', requireRole('admin', 'security'), async (req, res) => {
  const { id } = req.params;
  const { name, warehouse_type } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tên bộ phận không được để trống' });
  }
  if (!warehouse_type || !['WHS', 'SOC'].includes(warehouse_type)) {
    return res.status(400).json({ error: 'Loại kho không hợp lệ (WHS hoặc SOC)' });
  }

  try {
    const result = await pool.query(
      'UPDATE imei_department SET name = $1, warehouse_type = $2 WHERE id = $3 RETURNING *',
      [name.trim(), warehouse_type, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy bộ phận' });
    }

    res.json({
      message: 'Cập nhật bộ phận thành công',
      department: result.rows[0]
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Tên bộ phận đã tồn tại' });
    }
    console.error('Update department error:', err);
    res.status(500).json({ error: 'Lỗi khi cập nhật bộ phận' });
  }
});

// DELETE /api/departments/:id - Xóa bộ phận (chỉ admin/security)
router.delete('/:id', requireRole('admin', 'security'), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM imei_department WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy bộ phận' });
    }

    res.json({ message: 'Xóa bộ phận thành công' });
  } catch (err) {
    console.error('Delete department error:', err);
    res.status(500).json({ error: 'Lỗi khi xóa bộ phận' });
  }
});

module.exports = router;
