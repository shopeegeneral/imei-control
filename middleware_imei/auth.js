// Middleware kiểm tra người dùng đã đăng nhập
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    // API request
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục' });
    }
    // Page request - redirect to login
    return res.redirect('/imei-control/login');
  }
  next();
}

// Middleware kiểm tra role admin
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục' });
    }
    return res.redirect('/imei-control/login');
  }

  if (req.session.role !== 'admin') {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(403).json({ error: 'Bạn không có quyền truy cập chức năng này' });
    }
    return res.status(403).send('Bạn không có quyền truy cập chức năng này');
  }
  
  next();
}

// Middleware kiểm tra role supervisor, security hoặc admin
function requireSupervisor(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục' });
    }
    return res.redirect('/imei-control/login');
  }

  const allowedRoles = ['admin', 'supervisor', 'security'];
  if (!allowedRoles.includes(req.session.role)) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(403).json({ error: 'Bạn không có quyền truy cập chức năng này' });
    }
    return res.status(403).send('Bạn không có quyền truy cập chức năng này');
  }
  
  next();
}

// Generic middleware kiểm tra role
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ error: 'Vui lòng đăng nhập để tiếp tục' });
      }
      return res.redirect('/imei-control/login');
    }

    if (!roles.includes(req.session.role)) {
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(403).json({ error: 'Bạn không có quyền truy cập chức năng này' });
      }
      return res.status(403).send('Bạn không có quyền truy cập chức năng này');
    }
    
    next();
  };
}

// Middleware kiểm tra đã đăng nhập (nếu đã đăng nhập thì redirect về trang chủ)
function checkAuth(req, res, next) {
  if (req.session && req.session.userId) {
    if (req.session.role === 'supervisor') {
      return res.redirect('/imei-control/devices');
    }
    return res.redirect('/imei-control/');
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireSupervisor,
  requireRole,
  checkAuth
};
