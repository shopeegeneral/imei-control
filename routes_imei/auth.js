const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../database/db');
const { requireRole } = require('../middleware_imei/auth');

const router = express.Router();

// POST /api/auth/register - Đăng ký tài khoản mới (admin hoặc security)
router.post('/register', requireRole('admin', 'security'), async (req, res) => {
  const { email, password, full_name, role, warehouse_access } = req.body;

  // Validate
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Email, password và họ tên là bắt buộc' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Email không hợp lệ' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
  }

  try {
    // Check if email exists
    const existingUser = await pool.query(
      'SELECT id FROM imei_users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email đã tồn tại' });
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Validate role
    const allowedRoles = ['admin', 'security', 'supervisor', 'user'];
    const userRole = role && allowedRoles.includes(role) ? role : 'user';

    // Security can only create 'user' role
    if (req.session.role === 'security' && userRole !== 'user') {
      return res.status(403).json({ error: 'Security chỉ được phép tạo tài khoản với vai trò User' });
    }

    // Warehouse access: admin/security get 'all', others use provided value or 'all'
    let warehouseAccess = 'all';
    if (['supervisor', 'user'].includes(userRole) && warehouse_access) {
      // Expect array of IDs or 'all'
      if (warehouse_access === 'all') {
        warehouseAccess = 'all';
      } else if (Array.isArray(warehouse_access)) {
        warehouseAccess = JSON.stringify(warehouse_access);
      }
    }

    // Insert user (store email as username for backwards compatibility)
    const result = await pool.query(
      `INSERT INTO imei_users (username, password_hash, full_name, email, role, warehouse_access, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id, username, full_name, email, role, warehouse_access, created_at`,
      [email, password_hash, full_name, email, userRole, warehouseAccess]
    );

    const user = result.rows[0];

    res.status(201).json({
      message: 'Đăng ký thành công',
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        warehouse_access: user.warehouse_access,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Lỗi server khi đăng ký' });
  }
});

// POST /api/auth/login - Đăng nhập
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email và password là bắt buộc' });
  }

  try {
    // Get user by email
    const result = await pool.query(
      'SELECT * FROM imei_users WHERE email = $1 AND is_active = true',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }

    const user = result.rows[0];

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }

    // Save to session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.full_name = user.full_name;
    req.session.warehouseAccess = user.warehouse_access || 'all';

    res.json({
      message: 'Đăng nhập thành công',
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        warehouse_access: user.warehouse_access || 'all'
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Lỗi server khi đăng nhập' });
  }
});

// POST /api/auth/change-password - Đổi mật khẩu
router.post('/change-password', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục' });
  }

  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Mật khẩu hiện tại và mật khẩu mới là bắt buộc' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
  }

  try {
    const result = await pool.query('SELECT * FROM imei_users WHERE id = $1', [req.session.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User không tồn tại' });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
    }

    const password_hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE imei_users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [password_hash, req.session.userId]);

    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Lỗi server khi đổi mật khẩu' });
  }
});

// POST /api/auth/logout - Đăng xuất
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Lỗi khi đăng xuất' });
    }
    res.clearCookie('imei_sid'); // Fix: clear correct cookie name
    res.json({ message: 'Đăng xuất thành công' });
  });
});

// GET /api/auth/me - Lấy thông tin user hiện tại
router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Chưa đăng nhập' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, full_name, email, role, created_at FROM imei_users WHERE id = $1',
      [req.session.userId]
    );

    if (result.rows.length === 0) {
      req.session.destroy();
      return res.status(401).json({ error: 'User không tồn tại' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
