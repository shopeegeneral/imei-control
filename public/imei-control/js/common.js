// Common user authentication functions

let currentUser = null;

// Load and display current user info
async function loadCurrentUser() {
  try {
    const res = await fetch('/api/auth/me');
    
    if (!res.ok) {
      // Not logged in - redirect to login
      window.location.href = '/imei-control/login';
      return;
    }

    const data = await res.json();
    const user = data.user;
    currentUser = user; // Save to global

    // Update UI with user info
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const dropdownFullName = document.getElementById('dropdown-full-name');
    const dropdownUsername = document.getElementById('dropdown-username');

    if (userAvatar) {
      // Get initials from full name
      const initials = user.full_name
        .split(' ')
        .map(word => word[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
      userAvatar.textContent = initials;
    }

    if (userName) {
      userName.textContent = user.full_name;
    }

    if (dropdownFullName) {
      dropdownFullName.textContent = user.full_name;
    }

    if (dropdownUsername) {
      dropdownUsername.textContent = user.email || user.username;
    }

    // Filter menu by role
    filterMenuByRole(user.role);

    // Save role to localStorage for instant next page load
    localStorage.setItem('userRole', user.role);

    // Notify other scripts that user is loaded
    document.dispatchEvent(new CustomEvent('userLoaded', { detail: user }));

    return user;
  } catch (err) {
    console.error('Failed to load user:', err);
    window.location.href = '/imei-control/login';
  }
}

// Logout function
async function logout() {
  try {
    const res = await fetch('/api/auth/logout', {
      method: 'POST'
    });

    if (res.ok) {
      // Clear localStorage on logout
      localStorage.removeItem('userRole');
      window.location.href = '/imei-control/login';
    } else {
      showToast('Lỗi', 'Lỗi khi đăng xuất', 'error');
    }
  } catch (err) {
    console.error('Logout error:', err);
    showToast('Lỗi', 'Lỗi kết nối server', 'error');
  }
}

// Apply role-based styling and permissions
function filterMenuByRole(role) {
  // Remove old role classes first
  document.body.classList.remove('role-admin', 'role-security', 'role-supervisor', 'role-user');
  
  // Add current role class
  document.body.classList.add(`role-${role}`);
  
  // Mark sidebar menu as loaded to prevent flash
  const sidebarMenu = document.querySelector('.sidebar-menu');
  if (sidebarMenu) {
    sidebarMenu.classList.add('loaded');
  }
}

// Toggle user dropdown
function initUserMenu() {
  const userMenu = document.getElementById('user-menu');
  const userDropdown = document.getElementById('user-dropdown');
  const logoutBtn = document.getElementById('logout-btn');
  const changePasswordBtn = document.getElementById('change-password-btn');

  if (!userMenu || !userDropdown) return;

  // Toggle dropdown
  userMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    userMenu.classList.toggle('active');
    userDropdown.classList.toggle('show');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!userMenu.contains(e.target)) {
      userMenu.classList.remove('active');
      userDropdown.classList.remove('show');
    }
  });

  // Change password
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.classList.remove('active');
      userDropdown.classList.remove('show');
      openChangePasswordModal();
    });
  }

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirm(
        'Đăng xuất',
        'Bạn có chắc muốn đăng xuất khỏi hệ thống?',
        () => logout()
      );
    });
  }
}

// ========== CHANGE PASSWORD ==========
function openChangePasswordModal() {
  // Create modal dynamically
  let modal = document.getElementById('change-password-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'change-password-modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 450px;">
      <div class="modal-header">
        <h3 class="modal-title"><i class="fa-solid fa-key"></i> Đổi mật khẩu</h3>
        <button class="modal-close" id="cp-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label form-label-required">Mật khẩu hiện tại</label>
          <div class="input-with-icon">
            <i class="fa-solid fa-lock input-icon"></i>
            <input type="password" id="cp-current-password" class="form-input" placeholder="Nhập mật khẩu hiện tại">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label form-label-required">Mật khẩu mới</label>
          <div class="input-with-icon">
            <i class="fa-solid fa-lock input-icon"></i>
            <input type="password" id="cp-new-password" class="form-input" placeholder="Tối thiểu 6 ký tự" minlength="6">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label form-label-required">Xác nhận mật khẩu mới</label>
          <div class="input-with-icon">
            <i class="fa-solid fa-lock input-icon"></i>
            <input type="password" id="cp-confirm-password" class="form-input" placeholder="Nhập lại mật khẩu mới">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cp-cancel-btn">Huỷ</button>
        <button class="btn btn-primary" id="cp-save-btn">
          <i class="fa-solid fa-check"></i> Đổi mật khẩu
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 10);

  // Events
  const closeModal = () => {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 200);
  };

  document.getElementById('cp-close-btn').addEventListener('click', closeModal);
  document.getElementById('cp-cancel-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  document.getElementById('cp-save-btn').addEventListener('click', async () => {
    const currentPassword = document.getElementById('cp-current-password').value;
    const newPassword = document.getElementById('cp-new-password').value;
    const confirmPassword = document.getElementById('cp-confirm-password').value;

    if (!currentPassword) {
      showToast('Lỗi', 'Vui lòng nhập mật khẩu hiện tại', 'error');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      showToast('Lỗi', 'Mật khẩu mới phải có ít nhất 6 ký tự', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Lỗi', 'Mật khẩu xác nhận không khớp', 'error');
      return;
    }

    const saveBtn = document.getElementById('cp-save-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });

      const data = await res.json();

      if (res.ok) {
        showToast('Thành công', 'Đổi mật khẩu thành công', 'success');
        closeModal();
      } else {
        showToast('Lỗi', data.error || 'Đổi mật khẩu thất bại', 'error');
      }
    } catch (err) {
      console.error('Change password error:', err);
      showToast('Lỗi', 'Lỗi kết nối server', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Đổi mật khẩu';
    }
  });

  document.getElementById('cp-current-password').focus();
}

// Warehouse filter functions
async function loadWarehouseFilter() {
  const warehouseFilter = document.getElementById('warehouse-filter');
  if (!warehouseFilter) return;

  try {
    const res = await fetch('/api/warehouses');
    const data = await res.json();

    if (!res.ok) {
      console.error('Failed to load warehouses');
      return;
    }

    const warehouses = data.data;
    
    // Don't allow "all" option - must select a warehouse
    warehouseFilter.innerHTML = warehouses.map(w => 
      `<option value="${w.id}">${w.name}</option>`
    ).join('');

    // Load saved selection from localStorage or default to first warehouse
    const savedWarehouse = localStorage.getItem('selectedWarehouse');
    if (savedWarehouse && savedWarehouse !== 'all') {
      // Check if saved warehouse still exists
      const warehouseExists = warehouses.some(w => w.id.toString() === savedWarehouse);
      if (warehouseExists) {
        warehouseFilter.value = savedWarehouse;
      } else if (warehouses.length > 0) {
        warehouseFilter.value = warehouses[0].id;
        localStorage.setItem('selectedWarehouse', warehouses[0].id);
      }
    } else if (warehouses.length > 0) {
      warehouseFilter.value = warehouses[0].id;
      localStorage.setItem('selectedWarehouse', warehouses[0].id);
    }

    // Listen for changes
    warehouseFilter.addEventListener('change', (e) => {
      const selectedValue = e.target.value;
      localStorage.setItem('selectedWarehouse', selectedValue);
      
      // Reload page to reflect new warehouse
      window.location.reload();
    });

  } catch (err) {
    console.error('Load warehouse filter error:', err);
  }
}

// Get selected warehouse ID
function getSelectedWarehouse() {
  const saved = localStorage.getItem('selectedWarehouse');
  return saved === 'all' ? null : saved;
}

// ========== TOAST NOTIFICATION SYSTEM ==========
function showToast(title, message, type = 'error') {
  // Create toast container if not exists
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  // Icon and color based on type
  const config = {
    success: { icon: 'fa-circle-check', color: '#27ae60' },
    error: { icon: 'fa-circle-xmark', color: '#e74c3c' },
    warning: { icon: 'fa-triangle-exclamation', color: '#f39c12' },
    info: { icon: 'fa-circle-info', color: '#3498db' }
  };

  const typeConfig = config[type] || config.error;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${typeConfig.icon} toast-icon"></i>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;
  
  toastContainer.appendChild(toast);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// Confirmation dialog with custom styling
function showConfirm(title, message, onConfirm, onCancel = null) {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay confirm-dialog';
  overlay.innerHTML = `
    <div class="modal-content" style="max-width: 420px;">
      <div class="modal-header">
        <h3>${title}</h3>
      </div>
      <div class="modal-body">
        <p style="font-size: 15px; color: #5a6c7d; line-height: 1.6; margin: 0;">${message}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary confirm-cancel">Hủy</button>
        <button class="btn btn-primary confirm-ok">Xác nhận</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 10);

  const cancelBtn = overlay.querySelector('.confirm-cancel');
  const okBtn = overlay.querySelector('.confirm-ok');

  const close = (confirmed) => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
    if (confirmed && onConfirm) onConfirm();
    if (!confirmed && onCancel) onCancel();
  };

  cancelBtn.addEventListener('click', () => close(false));
  okBtn.addEventListener('click', () => close(true));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(false);
  });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Mark menu as loaded if role is already set from localStorage
  const sidebarMenu = document.querySelector('.sidebar-menu');
  if (sidebarMenu && localStorage.getItem('userRole')) {
    sidebarMenu.classList.add('loaded');
  }
  
  loadCurrentUser();
  initUserMenu();
  loadWarehouseFilter();
});
