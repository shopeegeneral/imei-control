const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../database/db');

const router = express.Router();

// GET /api/users - Lấy danh sách users
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, full_name, role, is_active, warehouse_access, created_at, updated_at
       FROM imei_users
       ORDER BY created_at DESC`
    );

    res.json({ users: result.rows });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Lỗi server khi lấy danh sách users' });
  }
});

// GET /api/users/:id - Lấy thông tin 1 user
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, email, full_name, role, is_active, warehouse_access, created_at, updated_at
       FROM imei_users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User không tồn tại' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/users/:id - Cập nhật user
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, role, password, warehouse_access } = req.body;

    // Check user exists
    const existing = await pool.query('SELECT id, role FROM imei_users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User không tồn tại' });
    }

    // Security can only edit users with 'user' role
    if (req.session.role === 'security' && existing.rows[0].role !== 'user') {
      return res.status(403).json({ error: 'Security chỉ được phép chỉnh sửa tài khoản có vai trò User' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIdx = 1;

    if (full_name) {
      updates.push(`full_name = $${paramIdx++}`);
      values.push(full_name);
    }

    if (role) {
      const allowedRoles = ['admin', 'security', 'supervisor', 'user'];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: 'Role không hợp lệ' });
      }
      // Security can only set role to 'user'
      if (req.session.role === 'security' && role !== 'user') {
        return res.status(403).json({ error: 'Security chỉ được phép gán vai trò User' });
      }
      updates.push(`role = $${paramIdx++}`);
      values.push(role);
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
      }
      const password_hash = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${paramIdx++}`);
      values.push(password_hash);
    }

    // Update warehouse_access if provided
    if (warehouse_access !== undefined) {
      let warehouseVal = 'all';
      if (warehouse_access === 'all') {
        warehouseVal = 'all';
      } else if (Array.isArray(warehouse_access)) {
        warehouseVal = JSON.stringify(warehouse_access);
      } else if (typeof warehouse_access === 'string') {
        warehouseVal = warehouse_access;
      }
      updates.push(`warehouse_access = $${paramIdx++}`);
      values.push(warehouseVal);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Không có dữ liệu để cập nhật' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `UPDATE imei_users SET ${updates.join(', ')} WHERE id = $${paramIdx}
                   RETURNING id, email, full_name, role, is_active, warehouse_access, created_at, updated_at`;
    
    const result = await pool.query(query, values);

    res.json({ 
      message: 'Cập nhật thành công',
      user: result.rows[0] 
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Lỗi server khi cập nhật user' });
  }
});

// PUT /api/users/:id/status - Kích hoạt / vô hiệu hóa user
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active phải là boolean' });
    }

    // Prevent self-deactivation
    if (req.session.userId === parseInt(id) && !is_active) {
      return res.status(400).json({ error: 'Không thể vô hiệu hóa chính mình' });
    }

    // Security can only toggle status of 'user' role
    if (req.session.role === 'security') {
      const target = await pool.query('SELECT role FROM imei_users WHERE id = $1', [id]);
      if (target.rows.length > 0 && target.rows[0].role !== 'user') {
        return res.status(403).json({ error: 'Security chỉ được phép thay đổi trạng thái tài khoản có vai trò User' });
      }
    }

    const result = await pool.query(
      `UPDATE imei_users SET is_active = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING id, email, full_name, role, is_active`,
      [is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User không tồn tại' });
    }

    res.json({ 
      message: is_active ? 'Kích hoạt thành công' : 'Vô hiệu hóa thành công',
      user: result.rows[0] 
    });
  } catch (err) {
    console.error('Toggle status error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
