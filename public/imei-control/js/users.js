// ==================== USERS MODULE ====================

const usersTable = document.getElementById('users-table');
const noUsers = document.getElementById('no-users');
const searchInput = document.getElementById('search-input');
const filterRole = document.getElementById('filter-role');
const filterStatus = document.getElementById('filter-status');
const addUserBtn = document.getElementById('add-user-btn');

// Modal elements
const userModal = document.getElementById('user-modal');
const modalTitle = document.getElementById('modal-title');
const modalSave = document.getElementById('modal-save');
const modalCancel = document.getElementById('modal-cancel');
const modalCloseBtn = document.getElementById('modal-close-btn');

const userIdInput = document.getElementById('user-id');
const userEmailInput = document.getElementById('user-email');
const userFullnameInput = document.getElementById('user-fullname');
const userPasswordInput = document.getElementById('user-password');
const userConfirmPasswordInput = document.getElementById('user-confirm-password');
const userRoleSelect = document.getElementById('user-role');
const passwordGroup = document.getElementById('password-group');
const confirmPasswordGroup = document.getElementById('confirm-password-group');
const warehouseAccessGroup = document.getElementById('warehouse-access-group');
const warehouseCheckboxes = document.getElementById('warehouse-checkboxes');
const warehouseAccessAll = document.getElementById('warehouse-access-all');

let allUsers = [];
let allWarehouses = [];
let isEditMode = false;

// ==================== LOAD WAREHOUSES ====================

async function loadWarehousesForModal() {
  try {
    const res = await fetch('/api/warehouses');
    if (!res.ok) return;
    const data = await res.json();
    allWarehouses = data.data || [];
    renderWarehouseCheckboxes();
  } catch (err) {
    console.error('Error loading warehouses for modal:', err);
  }
}

function renderWarehouseCheckboxes(selectedIds = []) {
  // Keep the "all" checkbox, then add individual warehouses
  const warehouseItems = allWarehouses.map(w => `
    <div class="warehouse-checkbox-item">
      <label class="checkbox-label">
        <input type="checkbox" class="warehouse-id-cb" value="${w.id}" ${selectedIds.includes(w.id) ? 'checked' : ''}>
        <span>${w.name} <small style="color:#888;">(${w.warehouse_type || 'WHS'})</small></span>
      </label>
    </div>
  `).join('');

  // Replace content after the "all" checkbox
  warehouseCheckboxes.innerHTML = `
    <div class="warehouse-checkbox-item">
      <label class="checkbox-label">
        <input type="checkbox" id="warehouse-access-all" value="all" ${selectedIds.length === 0 ? 'checked' : ''}>
        <span>Tất cả kho</span>
      </label>
    </div>
    ${warehouseItems}
  `;

  // Re-attach "all" toggle logic
  const allCb = document.getElementById('warehouse-access-all');
  allCb.addEventListener('change', () => {
    if (allCb.checked) {
      document.querySelectorAll('.warehouse-id-cb').forEach(cb => cb.checked = false);
    }
  });

  document.querySelectorAll('.warehouse-id-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const allCb2 = document.getElementById('warehouse-access-all');
      if (cb.checked && allCb2) allCb2.checked = false;
      // If no specific selected, revert to "all"
      const anySelected = [...document.querySelectorAll('.warehouse-id-cb')].some(c => c.checked);
      if (!anySelected && allCb2) allCb2.checked = true;
    });
  });
}

function getSelectedWarehouseAccess() {
  const allCb = document.getElementById('warehouse-access-all');
  if (allCb && allCb.checked) return 'all';
  const selected = [...document.querySelectorAll('.warehouse-id-cb')]
    .filter(cb => cb.checked)
    .map(cb => parseInt(cb.value));
  return selected.length > 0 ? selected : 'all';
}

function showWarehouseAccessGroup(role, currentAccess = 'all') {
  const needsWarehouseSelect = ['supervisor', 'user'].includes(role);
  warehouseAccessGroup.style.display = needsWarehouseSelect ? '' : 'none';

  if (needsWarehouseSelect) {
    let selectedIds = [];
    if (currentAccess && currentAccess !== 'all') {
      try {
        selectedIds = typeof currentAccess === 'string' ? JSON.parse(currentAccess) : currentAccess;
      } catch (e) { selectedIds = []; }
    }
    renderWarehouseCheckboxes(selectedIds);
  }
}

// ==================== LOAD USERS ====================

async function loadUsers() {
  try {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('Failed to load users');
    
    const data = await res.json();
    allUsers = data.users || [];
    renderUsers();
  } catch (err) {
    console.error('Error loading users:', err);
    showToast('Lỗi', 'Không thể tải danh sách users', 'error');
  }
}

// ==================== RENDER TABLE ====================

function renderUsers() {
  const search = searchInput.value.toLowerCase().trim();
  const roleFilter = filterRole.value;
  const statusFilter = filterStatus.value;

  let filtered = allUsers.filter(user => {
    // Search filter
    if (search) {
      const matchSearch = 
        (user.email || '').toLowerCase().includes(search) ||
        (user.full_name || '').toLowerCase().includes(search);
      if (!matchSearch) return false;
    }

    // Role filter
    if (roleFilter && user.role !== roleFilter) return false;

    // Status filter
    if (statusFilter !== '') {
      const isActive = statusFilter === 'true';
      if (user.is_active !== isActive) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    usersTable.innerHTML = '';
    noUsers.classList.remove('hidden');
    return;
  }

  noUsers.classList.add('hidden');

  usersTable.innerHTML = filtered.map(user => {
    const roleBadge = getRoleBadge(user.role);
    const statusBadge = user.is_active
      ? '<span class="badge badge-green">Hoạt động</span>'
      : '<span class="badge badge-red">Vô hiệu</span>';
    const createdAt = new Date(user.created_at).toLocaleDateString('vi-VN');
    const warehouseBadge = getWarehouseBadge(user.role, user.warehouse_access, user.id);

    return `
      <tr>
        <td>
          <div class="user-cell">
            <div class="user-cell-avatar">${getInitials(user.full_name)}</div>
            <span>${user.email}</span>
          </div>
        </td>
        <td>${user.full_name}</td>
        <td>${roleBadge}</td>
        <td>${warehouseBadge}</td>
        <td>${statusBadge}</td>
        <td>${createdAt}</td>
        <td>
          ${canManageUser(user) ? `<div class="action-buttons">
            <button class="btn-icon btn-icon-edit" title="Sửa" onclick="editUser(${user.id})">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            ${user.is_active
              ? `<button class="btn-icon btn-icon-delete" title="Vô hiệu hóa" onclick="toggleUserStatus(${user.id}, false)">
                  <i class="fa-solid fa-ban"></i>
                </button>`
              : `<button class="btn-icon" title="Kích hoạt" style="color: #27ae60;" onclick="toggleUserStatus(${user.id}, true)">
                  <i class="fa-solid fa-check-circle"></i>
                </button>`
            }
          </div>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

function getRoleBadge(role) {
  switch (role) {
    case 'admin':
      return '<span class="badge badge-red">Admin</span>';
    case 'security':
      return '<span class="badge badge-orange">Security</span>';
    case 'supervisor':
      return '<span class="badge badge-blue">Supervisor</span>';
    case 'user':
      return '<span class="badge badge-gray">User</span>';
    default:
      return `<span class="badge">${role}</span>`;
  }
}

function getInitials(name) {
  if (!name) return '--';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function getWarehouseBadge(role, warehouseAccess, userId) {
  // admin and security always have full access
  if (['admin', 'security'].includes(role)) {
    return '<span class="badge badge-blue">Tất cả kho</span>';
  }
  if (!warehouseAccess || warehouseAccess === 'all') {
    return '<span class="badge badge-blue">Tất cả kho</span>';
  }
  try {
    const ids = typeof warehouseAccess === 'string' ? JSON.parse(warehouseAccess) : warehouseAccess;
    if (!Array.isArray(ids) || ids.length === 0) return '<span class="badge badge-blue">Tất cả kho</span>';
    // Find warehouse names
    const names = ids.map(id => {
      const w = allWarehouses.find(wh => wh.id === id || wh.id === parseInt(id));
      return w ? w.name : `#${id}`;
    });
    return `<span class="badge badge-gray warehouse-access-badge" onclick="showWarehouseAccessModal(${userId})" title="Bấm để xem chi tiết">${ids.length} kho <i class="fa-solid fa-eye" style="margin-left:4px;font-size:10px;"></i></span>`;
  } catch (e) {
    return '<span class="badge badge-blue">Tất cả kho</span>';
  }
}

// ==================== MODAL ====================

function openCreateModal() {
  isEditMode = false;
  modalTitle.textContent = 'Tạo tài khoản mới';
  modalSave.innerHTML = '<i class="fa-solid fa-user-plus"></i> Tạo tài khoản';

  // Reset form
  userIdInput.value = '';
  userEmailInput.value = '';
  userFullnameInput.value = '';
  userPasswordInput.value = '';
  userConfirmPasswordInput.value = '';
  userRoleSelect.value = 'user';

  // Show password fields
  passwordGroup.style.display = '';
  confirmPasswordGroup.style.display = '';
  userEmailInput.disabled = false;

  // Apply role restrictions for security
  applyRoleRestrictions();

  // Show/hide warehouse access
  showWarehouseAccessGroup(userRoleSelect.value);

  userModal.classList.add('show');
  userEmailInput.focus();
}

function openEditModal(user) {
  isEditMode = true;
  modalTitle.textContent = 'Chỉnh sửa tài khoản';
  modalSave.innerHTML = '<i class="fa-solid fa-check"></i> Cập nhật';
  
  userIdInput.value = user.id;
  userEmailInput.value = user.email;
  userFullnameInput.value = user.full_name;
  userPasswordInput.value = '';
  userConfirmPasswordInput.value = '';
  userRoleSelect.value = user.role;
  
  // Hide password fields for edit (optional: show with hint)
  passwordGroup.style.display = '';
  confirmPasswordGroup.style.display = '';
  userEmailInput.disabled = true;

  // Update password label hint
  const pwLabel = passwordGroup.querySelector('.form-label');
  pwLabel.classList.remove('form-label-required');
  pwLabel.textContent = 'Mật khẩu mới (để trống nếu không đổi)';

  // Apply role restrictions for security
  applyRoleRestrictions();

  // Show/hide warehouse access with current value
  showWarehouseAccessGroup(user.role, user.warehouse_access);

  userModal.classList.add('show');
  userFullnameInput.focus();
}

function closeModal() {
  userModal.classList.remove('show');
  
  // Reset password label
  const pwLabel = passwordGroup.querySelector('.form-label');
  pwLabel.classList.add('form-label-required');
  pwLabel.textContent = 'Mật khẩu';
}

// ==================== CRUD ====================

async function saveUser() {
  const email = userEmailInput.value.trim();
  const fullName = userFullnameInput.value.trim();
  const password = userPasswordInput.value;
  const confirmPassword = userConfirmPasswordInput.value;
  const role = userRoleSelect.value;
  const warehouseAccess = getSelectedWarehouseAccess();

  // Validations
  if (!email || !fullName) {
    showToast('Lỗi', 'Email và họ tên là bắt buộc', 'error');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showToast('Lỗi', 'Email không hợp lệ', 'error');
    return;
  }

  if (!isEditMode) {
    // Create mode: password required
    if (!password) {
      showToast('Lỗi', 'Mật khẩu là bắt buộc', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('Lỗi', 'Mật khẩu phải có ít nhất 6 ký tự', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast('Lỗi', 'Mật khẩu xác nhận không khớp', 'error');
      return;
    }
  } else {
    // Edit mode: password optional, but if filled must match
    if (password && password.length < 6) {
      showToast('Lỗi', 'Mật khẩu phải có ít nhất 6 ký tự', 'error');
      return;
    }
    if (password && password !== confirmPassword) {
      showToast('Lỗi', 'Mật khẩu xác nhận không khớp', 'error');
      return;
    }
  }

  modalSave.disabled = true;
  modalSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

  try {
    let res;
    
    if (isEditMode) {
      // Update user
      const body = { full_name: fullName, role, warehouse_access: warehouseAccess };
      if (password) body.password = password;

      res = await fetch(`/api/users/${userIdInput.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } else {
      // Create user
      res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
          role,
          warehouse_access: warehouseAccess
        })
      });
    }

    const data = await res.json();

    if (res.ok) {
      showToast('Thành công', isEditMode ? 'Cập nhật tài khoản thành công' : `Tạo tài khoản thành công cho ${email}`, 'success');
      closeModal();
      loadUsers();
    } else {
      showToast('Lỗi', data.error || 'Thao tác thất bại', 'error');
    }
  } catch (err) {
    console.error('Save user error:', err);
    showToast('Lỗi', 'Lỗi kết nối server', 'error');
  } finally {
    modalSave.disabled = false;
    modalSave.innerHTML = isEditMode 
      ? '<i class="fa-solid fa-check"></i> Cập nhật'
      : '<i class="fa-solid fa-user-plus"></i> Tạo tài khoản';
  }
}

function editUser(id) {
  const user = allUsers.find(u => u.id === id);
  if (!user) return;
  openEditModal(user);
}

function toggleUserStatus(id, activate) {
  const user = allUsers.find(u => u.id === id);
  if (!user) return;

  const action = activate ? 'kích hoạt' : 'vô hiệu hóa';
  showConfirm(
    `${activate ? 'Kích hoạt' : 'Vô hiệu hóa'} tài khoản`,
    `Bạn có chắc muốn ${action} tài khoản <strong>${user.full_name}</strong> (${user.email})?`,
    async () => {
      try {
        const res = await fetch(`/api/users/${id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: activate })
        });
        
        const data = await res.json();
        
        if (res.ok) {
          showToast('Thành công', `Đã ${action} tài khoản ${user.email}`, 'success');
          loadUsers();
        } else {
          showToast('Lỗi', data.error || 'Thao tác thất bại', 'error');
        }
      } catch (err) {
        console.error('Toggle status error:', err);
        showToast('Lỗi', 'Lỗi kết nối server', 'error');
      }
    }
  );
}

// ==================== EVENT LISTENERS ====================

addUserBtn.addEventListener('click', openCreateModal);
modalCancel.addEventListener('click', closeModal);
modalCloseBtn.addEventListener('click', closeModal);
modalSave.addEventListener('click', saveUser);

userModal.addEventListener('click', (e) => {
  if (e.target === userModal) closeModal();
});

searchInput.addEventListener('input', renderUsers);
filterRole.addEventListener('change', renderUsers);
filterStatus.addEventListener('change', renderUsers);

// Toggle warehouse access group when role changes
userRoleSelect.addEventListener('change', () => {
  showWarehouseAccessGroup(userRoleSelect.value);
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && userModal.classList.contains('show')) {
    closeModal();
  }
});

// ==================== ROLE RESTRICTIONS ====================

// Security can only create/edit 'user' role
function applyRoleRestrictions() {
  const role = currentUser ? currentUser.role : localStorage.getItem('userRole');
  const options = userRoleSelect.querySelectorAll('option');

  if (role === 'security') {
    // Disable all roles except 'user'
    options.forEach(opt => {
      opt.disabled = opt.value !== 'user';
    });
    userRoleSelect.value = 'user';
  } else {
    // Admin - enable all
    options.forEach(opt => {
      opt.disabled = false;
    });
  }
}

// Security: hide edit/toggle buttons for non-user roles
function canManageUser(user) {
  const myRole = currentUser ? currentUser.role : localStorage.getItem('userRole');
  if (myRole === 'admin') return true;
  if (myRole === 'security') return user.role === 'user';
  return false;
}

// ==================== WAREHOUSE ACCESS MODAL ====================

function showWarehouseAccessModal(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  let warehouseNames = [];
  try {
    const ids = typeof user.warehouse_access === 'string' ? JSON.parse(user.warehouse_access) : user.warehouse_access;
    if (Array.isArray(ids)) {
      warehouseNames = ids.map(id => {
        const w = allWarehouses.find(wh => wh.id === id || wh.id === parseInt(id));
        return w ? { name: w.name, type: w.warehouse_type || 'WHS' } : { name: `#${id}`, type: '?' };
      });
    }
  } catch (e) { /* ignore */ }

  // Remove existing modal if any
  let existing = document.getElementById('warehouse-access-detail-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'warehouse-access-detail-modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 480px;">
      <div class="modal-header-row">
        <h3 class="modal-title">
          <i class="fa-solid fa-warehouse" style="color: #3498db;"></i>
          Kho truy cập
        </h3>
        <button class="modal-close-btn" id="wh-access-close">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div style="padding: 16px 20px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e2e8f0;">
          <div class="user-cell-avatar">${getInitials(user.full_name)}</div>
          <div>
            <div style="font-weight:600;color:#1e293b;font-size:15px;">${user.full_name}</div>
            <div style="font-size:13px;color:#64748b;">${user.email} • ${getRoleBadge(user.role)}</div>
          </div>
        </div>
        <div style="margin-bottom:8px;font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
          <i class="fa-solid fa-list"></i> ${warehouseNames.length} kho được truy cập
        </div>
        <div class="wh-access-list">
          ${warehouseNames.map((w, i) => `
            <div class="wh-access-item">
              <div class="wh-access-num">${i + 1}</div>
              <div class="wh-access-name">${w.name}</div>
              <span class="badge ${w.type === 'SOC' ? 'badge-orange' : 'badge-green'}" style="font-size:11px;">${w.type}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="wh-access-ok">Đóng</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 10);

  const closeModal = () => {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 200);
  };

  document.getElementById('wh-access-close').addEventListener('click', closeModal);
  document.getElementById('wh-access-ok').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
}

// ==================== INIT ====================

loadUsers();
loadWarehousesForModal();
