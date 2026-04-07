const searchInput = document.getElementById('search-input');
const filterHasBarcode = document.getElementById('filter-has-barcode');
const filterDepartment = document.getElementById('filter-department');
const filterCreatedDate = document.getElementById('filter-created-date');
const clearFiltersBtn = document.getElementById('clear-filters-btn');
const devicesTable = document.getElementById('devices-table');
const noDevices = document.getElementById('no-devices');
const addDeviceBtn = document.getElementById('add-device-btn');
const exportDevicesBtn = document.getElementById('export-devices-btn');
const sortTriggers = document.querySelectorAll('.sort-trigger');

// Modal elements
const deviceModal = document.getElementById('device-modal');
const modalTitle = document.getElementById('modal-title');
const deviceId = document.getElementById('device-id');
const deviceImei = document.getElementById('device-imei');
const deviceType = document.getElementById('device-type');
const deviceEmployeeCode = document.getElementById('device-employee-code');
const deviceFullname = document.getElementById('device-fullname');
const deviceEmail = document.getElementById('device-email');
const deviceActiveMode = document.getElementById('device-active-mode');
const deviceActiveUntil = document.getElementById('device-active-until');
const modalCancel = document.getElementById('modal-cancel');
const modalSave = document.getElementById('modal-save');
const warehouseCheckboxes = document.getElementById('warehouse-checkboxes');
const selectAllWarehousesBtn = document.getElementById('select-all-warehouses');
const deviceHasBarcode = document.getElementById('device-has-barcode');
const deviceWarehouseType = document.getElementById('device-warehouse-type');
const deviceDepartment = document.getElementById('device-department');

// Mass upload elements
const massUploadBtn = document.getElementById('mass-upload-btn');
const massUploadMenu = document.getElementById('mass-upload-menu');
const massUploadWrapper = document.getElementById('mass-upload-wrapper');
const downloadTemplateBtn = document.getElementById('download-template-btn');
const uploadFileBtn = document.getElementById('upload-file-btn');
const massUploadInput = document.getElementById('mass-upload-input');
const massModifyBtn = document.getElementById('mass-modify-btn');
const massModifyMenu = document.getElementById('mass-modify-menu');
const massModifyWrapper = document.getElementById('mass-modify-wrapper');
const downloadModifyTemplateBtn = document.getElementById('download-modify-template-btn');
const uploadModifyFileBtn = document.getElementById('upload-modify-file-btn');
const massModifyInput = document.getElementById('mass-modify-input');
const uploadErrorModal = document.getElementById('upload-error-modal');
const uploadErrorClose = document.getElementById('upload-error-close');
const uploadErrorOk = document.getElementById('upload-error-ok');
const uploadErrorSummary = document.getElementById('upload-error-summary');
const uploadErrorBody = document.getElementById('upload-error-body');

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleString('vi-VN');
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '-';

  if (typeof dateStr === 'string') {
    const matchedDate = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (matchedDate) return matchedDate[1];
  }

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '-';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateInputValue(dateStr) {
  const formatted = formatDateOnly(dateStr);
  return formatted === '-' ? '' : formatted;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function getTodayDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function updateActiveUntilState() {
  const isLimited = deviceActiveMode.value === 'limited';
  deviceActiveUntil.disabled = !isLimited;
  deviceActiveUntil.min = getTodayDateValue();

  if (isLimited) {
    deviceActiveUntil.style.backgroundColor = '';
    return;
  }

  deviceActiveUntil.value = '';
  deviceActiveUntil.style.backgroundColor = '#f8fafc';
}

async function loadFilterOptions() {
  try {
    const warehouseId = getSelectedWarehouse() || '';
    const params = new URLSearchParams();
    if (warehouseId) params.set('warehouse_id', warehouseId);

    const res = await fetch(`/api/devices/filter-options?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Lỗi tải filter');
    }

    const departments = data.departments || [];

    filterDepartment.innerHTML = '<option value="">Bộ phận: Tất cả</option>' + departments.map((department) => {
      const label = department.warehouse_type
        ? `${escapeHtml(department.name)} (${escapeHtml(department.warehouse_type)})`
        : escapeHtml(department.name);
      return `<option value="${department.id}">${label}</option>`;
    }).join('');
  } catch (err) {
    console.error('Failed to load device filter options:', err);
  }
}

// Load warehouses into checkboxes
let allWarehouses = [];
async function loadWarehouseCheckboxes() {
  try {
    const res = await fetch('/api/warehouses');
    const data = await res.json();
    
    if (!res.ok) {
      warehouseCheckboxes.innerHTML = '<p style="color: #e74c3c; font-size: 14px;">Lỗi tải danh sách kho</p>';
      return;
    }

    allWarehouses = data.data || [];
    
    if (allWarehouses.length === 0) {
      warehouseCheckboxes.innerHTML = '<p style="color: #7f8c8d; font-size: 14px;">Chưa có kho nào</p>';
      return;
    }

    const isSupervisor = (localStorage.getItem('userRole') || currentUser?.role) === 'supervisor';

    // Add "All" checkbox at the top — hidden for supervisor
    const allCheckbox = isSupervisor ? '' : `
      <label class="warehouse-checkbox-item" style="border-bottom: 2px solid #3498db; padding-bottom: 8px; margin-bottom: 8px;">
        <input type="checkbox" id="warehouse-all" value="all" class="warehouse-checkbox">
        <span style="font-weight: 600; color: #3498db;"><i class="fa-solid fa-globe"></i> Tất cả các kho (All)</span>
      </label>
    `;

    const warehouseCheckboxList = allWarehouses.map(w => `
      <label class="warehouse-checkbox-item">
        <input type="checkbox" name="warehouse" value="${w.id}" class="warehouse-checkbox specific-warehouse">
        <span>${escapeHtml(w.name)}</span>
      </label>
    `).join('');

    warehouseCheckboxes.innerHTML = allCheckbox + warehouseCheckboxList;

    // Handle "All" checkbox behavior (only exists for non-supervisor)
    const allCheckboxEl = document.getElementById('warehouse-all');
    const specificCheckboxes = warehouseCheckboxes.querySelectorAll('.specific-warehouse');

    if (allCheckboxEl) {
      allCheckboxEl.addEventListener('change', () => {
        if (allCheckboxEl.checked) {
          specificCheckboxes.forEach(cb => {
            cb.checked = false;
            cb.disabled = true;
          });
        } else {
          specificCheckboxes.forEach(cb => cb.disabled = false);
        }
      });

      specificCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
          if (cb.checked && allCheckboxEl.checked) {
            allCheckboxEl.checked = false;
          }
        });
      });
    }
  } catch (err) {
    warehouseCheckboxes.innerHTML = '<p style="color: #e74c3c; font-size: 14px;">Lỗi tải danh sách kho</p>';
    console.error('Failed to load warehouses:', err);
  }
}

// Load departments filtered by warehouse_type
async function loadDepartmentsForModal(warehouseType, selectedId = null) {
  deviceDepartment.innerHTML = '<option value="">Đang tải...</option>';
  deviceDepartment.disabled = true;

  if (!warehouseType) {
    deviceDepartment.innerHTML = '<option value="">-- Chọn loại kho trước --</option>';
    return;
  }

  try {
    const res = await fetch(`/api/departments?warehouse_type=${warehouseType}`);
    const data = await res.json();
    const departments = data.data || [];

    if (departments.length === 0) {
      deviceDepartment.innerHTML = '<option value="">Chưa có bộ phận nào</option>';
      return;
    }

    deviceDepartment.innerHTML = '<option value="">-- Chọn bộ phận --</option>' +
      departments.map(d => `<option value="${d.id}" ${d.id === selectedId ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('');
    deviceDepartment.disabled = false;
  } catch (err) {
    deviceDepartment.innerHTML = '<option value="">Lỗi tải bộ phận</option>';
    console.error('Load departments error:', err);
  }
}

// Warehouse type change → reload departments
deviceWarehouseType.addEventListener('change', () => {
  loadDepartmentsForModal(deviceWarehouseType.value);
});

// Get selected warehouse data
function getSelectedWarehouseData() {
  const allCheckbox = document.getElementById('warehouse-all');

  if (allCheckbox && allCheckbox.checked) {
    return { all_warehouses: true, warehouse_ids: [] };
  }

  const specificCheckboxes = warehouseCheckboxes.querySelectorAll('.specific-warehouse:checked');
  return {
    all_warehouses: false,
    warehouse_ids: Array.from(specificCheckboxes).map(cb => parseInt(cb.value))
  };
}

// Set selected warehouse data
function setSelectedWarehouseData(device) {
  const allCheckbox = document.getElementById('warehouse-all');
  const specificCheckboxes = warehouseCheckboxes.querySelectorAll('.specific-warehouse');

  if (device.all_warehouses && allCheckbox) {
    // Supervisor won't have allCheckbox — fall back to all specific checked
    allCheckbox.checked = true;
    specificCheckboxes.forEach(cb => {
      cb.checked = false;
      cb.disabled = true;
    });
  } else {
    if (allCheckbox) allCheckbox.checked = false;
    specificCheckboxes.forEach(cb => {
      cb.disabled = false;
      cb.checked = device.warehouse_ids && device.warehouse_ids.includes(parseInt(cb.value));
    });
  }
}

// Select all warehouses button behavior
selectAllWarehousesBtn.addEventListener('click', () => {
  const allCheckbox = document.getElementById('warehouse-all');
  const specificCheckboxes = warehouseCheckboxes.querySelectorAll('.specific-warehouse');

  // If "All" is checked, uncheck it and enable specific checkboxes
  if (allCheckbox && allCheckbox.checked) {
    allCheckbox.checked = false;
    specificCheckboxes.forEach(cb => {
      cb.disabled = false;
      cb.checked = false;
    });
  } else {
    // Toggle all specific checkboxes (supervisor mode: only specific warehouses)
    const allSpecificChecked = Array.from(specificCheckboxes).every(cb => cb.checked);
    specificCheckboxes.forEach(cb => cb.checked = !allSpecificChecked);
  }
});

let currentPage = 1;
const PAGE_LIMIT = 50;
let currentSortBy = '';
let currentSortOrder = 'desc';

function buildDevicesFilterParams(includePagination = true) {
  const params = new URLSearchParams();
  const search = searchInput.value.trim();
  const hasBarcode = filterHasBarcode.value;
  const departmentId = filterDepartment.value;
  const createdDate = filterCreatedDate.value;
  const warehouseId = getSelectedWarehouse() || '';

  if (search) params.set('search', search);
  if (hasBarcode) params.set('has_barcode', hasBarcode);
  if (departmentId) params.set('department_id', departmentId);
  if (createdDate) params.set('created_at', createdDate);
  if (warehouseId) params.set('warehouse_id', warehouseId);
  if (currentSortBy) {
    params.set('sort_by', currentSortBy);
    params.set('sort_order', currentSortOrder);
  }
  if (includePagination) {
    params.set('page', currentPage);
    params.set('limit', PAGE_LIMIT);
  }

  return params;
}

function updateSortIndicators() {
  sortTriggers.forEach((trigger) => {
    const indicator = trigger.querySelector('.sort-indicator');
    if (!indicator) return;

    if (trigger.dataset.sort !== currentSortBy) {
      indicator.textContent = '↕';
      trigger.classList.remove('active');
      return;
    }

    indicator.textContent = currentSortOrder === 'asc' ? '↑' : '↓';
    trigger.classList.add('active');
  });
}

function toggleSort(sortBy) {
  if (currentSortBy === sortBy) {
    currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortBy = sortBy;
    currentSortOrder = 'asc';
  }

  currentPage = 1;
  updateSortIndicators();
  loadDevices();
}

function renderPagination(total, page, limit, totalPages) {
  const paginationEl = document.getElementById('devices-pagination');
  if (!paginationEl) return;

  if (!total || totalPages <= 1) {
    paginationEl.innerHTML = total
      ? `<span class="pagination-info">Hiển thị ${total} thiết bị</span>`
      : '';
    return;
  }

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  // Build page number buttons (show up to 7 pages around current)
  const pages = [];
  const delta = 2;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
      pages.push(i);
    }
  }

  // Insert ellipsis markers
  const pageButtons = [];
  let prev = null;
  for (const p of pages) {
    if (prev && p - prev > 1) pageButtons.push('...');
    pageButtons.push(p);
    prev = p;
  }

  const btnHtml = pageButtons.map(p => {
    if (p === '...') return `<span class="pagination-ellipsis">…</span>`;
    return `<button class="pagination-btn ${p === page ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
  }).join('');

  paginationEl.innerHTML = `
    <div class="pagination-controls">
      <button class="pagination-btn" onclick="goToPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      ${btnHtml}
      <button class="pagination-btn" onclick="goToPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>
        <i class="fa-solid fa-chevron-right"></i>
      </button>
    </div>
    <span class="pagination-info">Hiển thị ${start}–${end} / ${total} thiết bị</span>
  `;
}

function goToPage(page) {
  currentPage = page;
  loadDevices();
}

async function loadDevices() {
  const params = buildDevicesFilterParams(true);
  const currentRole = localStorage.getItem('userRole') || currentUser?.role || '';
  const canDeleteDevice = currentRole === 'admin';

  try {
    const res = await fetch(`/api/devices?${params}`);
    const result = await res.json();
    const devices = result.data || [];

    if (devices.length === 0) {
      devicesTable.innerHTML = '';
      noDevices.classList.remove('hidden');
      renderPagination(0, 1, PAGE_LIMIT, 0);
      return;
    }

    noDevices.classList.add('hidden');
    renderPagination(result.total, result.page, result.limit, result.totalPages);
    devicesTable.innerHTML = devices.map(d => {
      const fullNameForJs = JSON.stringify(d.full_name || '');
      const activeBadge = d.is_active === false
        ? '<span class="badge badge-gray">Deactive</span>'
        : '<span class="badge badge-green">Active</span>';
      const activeUntilDisplay = normalizeDateInputValue(d.active_until);
      const activeUntilText = d.active_until
        ? escapeHtml(activeUntilDisplay)
        : 'Vĩnh viễn';
      const deptDisplay = escapeHtml(d.department_name) || '-';
      const createdAtDisplay = formatDateOnly(d.created_at);
      const createdByDisplay = escapeHtml(d.created_by_name) || '-';

      const barcodeBadge = d.has_barcode === false
        ? '<span class="badge badge-orange">No</span>'
        : '<span class="badge badge-green">Yes</span>';

      return `
      <tr class="hover:bg-gray-50 transition-colors">
        <td class="px-6 py-4"><span class="font-mono font-medium text-base">${escapeHtml(d.imei)}</span></td>
        <td class="px-6 py-4">${barcodeBadge}</td>
        <td class="px-6 py-4 text-base text-gray-500">${escapeHtml(d.device_type) || '-'}</td>
        <td class="px-6 py-4 text-base">${escapeHtml(d.employee_code) || '-'}</td>
        <td class="px-6 py-4 text-base font-medium">${escapeHtml(d.full_name)}</td>
        <td class="px-6 py-4 text-base text-gray-500">${escapeHtml(d.email) || '-'}</td>
        <td class="px-6 py-4">${activeBadge}</td>
        <td class="px-6 py-4 text-base text-gray-500">${activeUntilText}</td>
        <td class="px-6 py-4 text-base text-gray-500">${deptDisplay}</td>
        <td class="px-6 py-4 text-base text-gray-500">${createdAtDisplay}</td>
        <td class="px-6 py-4 text-base text-gray-500">${createdByDisplay}</td>
        <td class="px-6 py-4 action-menu-cell">
          <div class="action-menu-wrapper">
            <button onclick="toggleActionMenu(event, ${d.id})" class="btn-icon action-menu-trigger" title="Thao tác">
              <i class="fa-solid fa-bars"></i>
            </button>
            <div id="action-menu-${d.id}" class="action-menu-dropdown">
              <button onclick="handleEditFromMenu(${d.id})" class="action-menu-item action-menu-item-edit" type="button">
                <i class="fa-solid fa-pen-to-square"></i>
                <span>Sửa</span>
              </button>
              <button onclick="handleToggleFromMenu(${d.id}, ${d.is_active === false ? 'false' : 'true'})" class="action-menu-item ${d.is_active === false ? 'action-menu-item-unlock' : 'action-menu-item-lock'}" type="button">
                <i class="fa-solid ${d.is_active === false ? 'fa-lock-open' : 'fa-lock'}"></i>
                <span>${d.is_active === false ? 'Active' : 'Deactive'}</span>
              </button>
              ${canDeleteDevice ? `<button onclick="handleDeleteFromMenu(${d.id}, ${fullNameForJs})" class="action-menu-item action-menu-item-delete" type="button">
                <i class="fa-solid fa-trash"></i>
                <span>Xóa</span>
              </button>` : ''}
            </div>
          </div>
        </td>
      </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load devices:', err);
  }
}

// Add device
addDeviceBtn.addEventListener('click', () => {
  modalTitle.textContent = 'Thêm thiết bị';
  deviceId.value = '';
  deviceImei.value = '';
  deviceHasBarcode.value = 'yes';
  deviceType.value = '';
  deviceEmployeeCode.value = '';
  deviceFullname.value = '';
  deviceEmail.value = '';
  deviceActiveMode.value = 'permanent';
  deviceActiveUntil.value = '';
  deviceWarehouseType.value = '';
  deviceDepartment.innerHTML = '<option value="">-- Chọn loại kho trước --</option>';
  deviceDepartment.disabled = true;
  setSelectedWarehouseData({ all_warehouses: false, warehouse_ids: [] });
  deviceImei.readOnly = false;
  deviceImei.style.backgroundColor = '';
  updateActiveUntilState();
  deviceModal.classList.add('show');
  deviceImei.focus();
});

// Edit device
async function editDevice(id) {
  try {
    const res = await fetch(`/api/devices/${id}`);
    const device = await res.json();

    modalTitle.textContent = 'Sửa thiết bị';
    deviceId.value = device.id;
    deviceImei.value = device.imei;
    deviceHasBarcode.value = device.has_barcode === false ? 'no' : 'yes';
    deviceType.value = device.device_type;
    deviceEmployeeCode.value = device.employee_code;
    deviceFullname.value = device.full_name;
    deviceEmail.value = device.email;
    deviceActiveMode.value = device.active_until ? 'limited' : 'permanent';
    deviceActiveUntil.value = normalizeDateInputValue(device.active_until);
    deviceWarehouseType.value = device.warehouse_type || '';
    await loadDepartmentsForModal(device.warehouse_type, device.department_id);
    setSelectedWarehouseData(device);
    deviceImei.readOnly = true;
    deviceImei.style.backgroundColor = '#f8fafc';
    updateActiveUntilState();
    deviceModal.classList.add('show');
    deviceFullname.focus();
  } catch (err) {
    showToast('Lỗi', 'Lỗi tải thông tin thiết bị', 'error');
  }
}

deviceActiveMode.addEventListener('change', () => {
  updateActiveUntilState();
});

// Delete device
async function deleteDevice(id, name) {
  const auditWarehouseId = getSelectedWarehouse();
  showConfirm(
    'Xóa thiết bị',
    `Xóa thiết bị của "<strong>${name}</strong>"?<br>Toàn bộ lịch sử scan cũng sẽ bị xóa.`,
    async () => {
      try {
        const res = await fetch(`/api/devices/${id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audit_warehouse_id: auditWarehouseId }),
        });
        if (res.ok) {
          showToast('Thành công', 'Thiết bị đã được xóa', 'success');
          loadDevices();
        } else {
          const data = await res.json();
          showToast('Lỗi', data.error, 'error');
        }
      } catch (err) {
        showToast('Lỗi', 'Lỗi kết nối server', 'error');
      }
    }
  );
}

function closeActionMenus() {
  document.querySelectorAll('.action-menu-dropdown.show').forEach((menu) => {
    menu.classList.remove('show');
  });
}

function toggleActionMenu(event, id) {
  event.stopPropagation();
  const menu = document.getElementById(`action-menu-${id}`);
  if (!menu) return;

  const shouldOpen = !menu.classList.contains('show');
  closeActionMenus();
  if (shouldOpen) {
    menu.classList.add('show');
    setTimeout(() => menu.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }
}

function handleEditFromMenu(id) {
  closeActionMenus();
  editDevice(id);
}

function handleToggleFromMenu(id, currentActive) {
  closeActionMenus();
  toggleDeviceActive(id, currentActive);
}

function handleDeleteFromMenu(id, name) {
  closeActionMenus();
  deleteDevice(id, name);
}

async function toggleDeviceActive(id, currentActive) {
  const nextActive = !currentActive;
  const auditWarehouseId = getSelectedWarehouse();
  const title = nextActive ? 'Kích hoạt thiết bị' : 'Khóa thiết bị';
  const message = nextActive
    ? 'Bạn có chắc muốn kích hoạt lại thiết bị này?'
    : 'Bạn có chắc muốn khóa thiết bị này? Khi scan sẽ báo thiết bị đã bị khóa.';

  showConfirm(title, message, async () => {
    try {
      const res = await fetch(`/api/devices/${id}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextActive, audit_warehouse_id: auditWarehouseId }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast('Thành công', nextActive ? 'Đã kích hoạt thiết bị' : 'Đã khóa thiết bị', 'success');
        loadDevices();
      } else {
        showToast('Lỗi', data.error || 'Không thể cập nhật trạng thái thiết bị', 'error');
      }
    } catch (err) {
      showToast('Lỗi', 'Lỗi kết nối server', 'error');
    }
  });
}

// Save device (create or update)
modalSave.addEventListener('click', async () => {
  const imei = deviceImei.value.trim();
  const device_type = deviceType.value.trim();
  const employee_code = deviceEmployeeCode.value.trim();
  const full_name = deviceFullname.value.trim();
  const email = deviceEmail.value.trim();
  const active_until = deviceActiveMode.value === 'limited' ? deviceActiveUntil.value : '';
  const warehouse_type = deviceWarehouseType.value;
  const department_id = deviceDepartment.value;
  const today = getTodayDateValue();

  // Validate all required fields
  const missing = [];
  if (!imei) missing.push('IMEI');
  if (!device_type) missing.push('Loại thiết bị');
  if (!employee_code) missing.push('Mã nhân viên');
  if (!full_name) missing.push('Họ và tên');
  if (!email) missing.push('Email');
  if (!warehouse_type) missing.push('Loại kho');
  if (!department_id) missing.push('Bộ phận');

  const warehouseData = getSelectedWarehouseData();
  if (!warehouseData.all_warehouses && warehouseData.warehouse_ids.length === 0) {
    missing.push('Kho làm việc');
  }

  if (missing.length > 0) {
    showToast('Thiếu thông tin', `Vui lòng điền: ${missing.join(', ')}`, 'warning');
    return;
  }

  if (deviceActiveMode.value === 'limited' && !active_until) {
    showToast('Thiếu thông tin', 'Vui lòng chọn thời gian active', 'warning');
    return;
  }

  if (active_until && active_until < today) {
    showToast('Lỗi', 'Thời gian active không được nhỏ hơn ngày hiện tại', 'error');
    return;
  }

  const body = {
    imei,
    has_barcode: deviceHasBarcode.value === 'yes',
    device_type,
    employee_code,
    full_name,
    email,
    active_until,
    all_warehouses: warehouseData.all_warehouses,
    warehouse_ids: warehouseData.warehouse_ids,
    audit_warehouse_id: getSelectedWarehouse(),
    warehouse_type: warehouse_type || null,
    department_id: department_id ? parseInt(department_id) : null
  };

  try {
    const id = deviceId.value;
    const url = id ? `/api/devices/${id}` : '/api/devices';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (res.ok) {
      showToast('Thành công', id ? 'Cập nhật thiết bị thành công' : 'Thêm thiết bị thành công', 'success');
      deviceModal.classList.remove('show');
      loadDevices();
    } else if (res.status === 409 && data.existing_device) {
      // IMEI already exists — show existing device modal
      deviceModal.classList.remove('show');
      showExistingDeviceModal(data.existing_device);
    } else {
      showToast('Lỗi', data.error, 'error');
    }
  } catch (err) {
    showToast('Lỗi', 'Lỗi kết nối server', 'error');
  }
});

// Cancel modal
modalCancel.addEventListener('click', () => {
  deviceModal.classList.remove('show');
});

// Close modal on overlay click
deviceModal.addEventListener('click', (e) => {
  if (e.target === deviceModal) deviceModal.classList.remove('show');
});

// Search & filter
let searchTimeout;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  currentPage = 1;
  searchTimeout = setTimeout(loadDevices, 300);
});

filterHasBarcode.addEventListener('change', () => {
  currentPage = 1;
  loadDevices();
});

filterDepartment.addEventListener('change', () => {
  currentPage = 1;
  loadDevices();
});

filterCreatedDate.addEventListener('change', () => {
  currentPage = 1;
  loadDevices();
});

clearFiltersBtn.addEventListener('click', () => {
  searchInput.value = '';
  filterHasBarcode.value = '';
  filterDepartment.value = '';
  filterCreatedDate.value = '';
  currentSortBy = '';
  currentSortOrder = 'desc';
  currentPage = 1;
  updateSortIndicators();
  loadDevices();
});

sortTriggers.forEach((trigger) => {
  trigger.addEventListener('click', () => toggleSort(trigger.dataset.sort));
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleSort(trigger.dataset.sort);
    }
  });
});

// Warehouse filter change handler (called by common.js)
function onWarehouseChange(warehouseId) {
  currentPage = 1;
  loadDevices();
}

exportDevicesBtn.addEventListener('click', () => {
  const params = buildDevicesFilterParams(false);
  const query = params.toString();
  const exportUrl = query ? `/api/devices/export?${query}` : '/api/devices/export';
  window.location.href = exportUrl;
});

// === MASS UPLOAD ===

// Toggle dropdown menu
massUploadBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  massModifyMenu.classList.remove('show');
  massUploadMenu.classList.toggle('show');
});

massModifyBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  massUploadMenu.classList.remove('show');
  massModifyMenu.classList.toggle('show');
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.action-menu-wrapper')) {
    closeActionMenus();
  }
  if (!massUploadWrapper.contains(e.target)) {
    massUploadMenu.classList.remove('show');
  }
  if (!massModifyWrapper.contains(e.target)) {
    massModifyMenu.classList.remove('show');
  }
});

// Download template
downloadTemplateBtn.addEventListener('click', () => {
  massUploadMenu.classList.remove('show');
  window.location.href = '/api/devices/template';
});

// Upload file - trigger file input
uploadFileBtn.addEventListener('click', () => {
  massUploadMenu.classList.remove('show');
  massUploadInput.value = '';
  massUploadInput.click();
});

downloadModifyTemplateBtn.addEventListener('click', () => {
  massModifyMenu.classList.remove('show');
  window.location.href = '/api/devices/mass-modify-template';
});

uploadModifyFileBtn.addEventListener('click', () => {
  massModifyMenu.classList.remove('show');
  massModifyInput.value = '';
  massModifyInput.click();
});

// Handle file selected
massUploadInput.addEventListener('change', async () => {
  const file = massUploadInput.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls'].includes(ext)) {
    showToast('Lỗi', 'Chỉ chấp nhận file Excel (.xlsx, .xls)', 'error');
    return;
  }

  // Show loading
  massUploadBtn.disabled = true;
  massUploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/devices/mass-upload', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (res.ok) {
      showToast('Thành công', data.message, 'success');
      loadDevices();
    } else if (res.status === 409 && data.needs_confirmation) {
      // Some IMEIs already exist — show confirmation modal
      showMassUploadConfirmModal(data, massUploadInput.files[0]);
    } else if (data.errors && data.errors.length > 0) {
      // Show error modal
      showUploadErrors(data);
    } else {
      showToast('Lỗi', data.error || 'Lỗi upload', 'error');
    }
  } catch (err) {
    console.error('Mass upload error:', err);
    showToast('Lỗi', 'Lỗi kết nối server', 'error');
  } finally {
    massUploadBtn.disabled = false;
    massUploadBtn.innerHTML = '<i class="fa-solid fa-file-arrow-up"></i> Mass Upload <i class="fa-solid fa-caret-down" style="margin-left: 4px;"></i>';
  }
});

massModifyInput.addEventListener('change', async () => {
  const file = massModifyInput.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls'].includes(ext)) {
    showToast('Lỗi', 'Chỉ chấp nhận file Excel (.xlsx, .xls)', 'error');
    return;
  }

  const warehouseId = getSelectedWarehouse();
  if (!warehouseId) {
    showToast('Lỗi', 'Vui lòng chọn kho trước khi Mass Modify', 'error');
    return;
  }

  massModifyBtn.disabled = true;
  massModifyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('warehouse_id', warehouseId);

  try {
    const res = await fetch('/api/devices/mass-modify', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (res.ok) {
      showToast('Thành công', data.message, 'success');
      loadDevices();
    } else if (data.errors && data.errors.length > 0) {
      showUploadErrors(data);
    } else {
      showToast('Lỗi', data.error || 'Lỗi Mass Modify', 'error');
    }
  } catch (err) {
    console.error('Mass modify error:', err);
    showToast('Lỗi', 'Lỗi kết nối server', 'error');
  } finally {
    massModifyBtn.disabled = false;
    massModifyBtn.innerHTML = '<i class="fa-solid fa-file-pen"></i> Mass Modify <i class="fa-solid fa-caret-down" style="margin-left: 4px;"></i>';
  }
});

// Show upload error modal
function showUploadErrors(data) {
  uploadErrorSummary.innerHTML = `
    <div class="upload-error-stats">
      <span class="error-stat"><i class="fa-solid fa-file-lines"></i> Tổng dòng: <strong>${data.totalRows}</strong></span>
      <span class="error-stat error-stat-bad"><i class="fa-solid fa-circle-xmark"></i> Lỗi: <strong>${data.errorCount}</strong></span>
    </div>
    <p style="margin-top: 8px; color: #7f8c8d; font-size: 13px;">
      Không có thiết bị nào được thêm. Vui lòng sửa các lỗi bên dưới và upload lại.
    </p>
  `;

  uploadErrorBody.innerHTML = data.errors.map(e => `
    <tr>
      <td style="text-align: center; font-weight: 600;">${e.row}</td>
      <td>
        <ul class="upload-error-list">
          ${e.errors.map(err => `<li>${escapeHtml(err)}</li>`).join('')}
        </ul>
      </td>
    </tr>
  `).join('');

  uploadErrorModal.classList.add('show');
}

// Close error modal
uploadErrorClose.addEventListener('click', () => {
  uploadErrorModal.classList.remove('show');
});
uploadErrorOk.addEventListener('click', () => {
  uploadErrorModal.classList.remove('show');
});
uploadErrorModal.addEventListener('click', (e) => {
  if (e.target === uploadErrorModal) uploadErrorModal.classList.remove('show');
});

// === EXISTING DEVICE MODAL (single create) ===
const existingDeviceModal = document.getElementById('existing-device-modal');
const existingDeviceBody = document.getElementById('existing-device-body');
const existingDeviceFooter = document.getElementById('existing-device-footer');
const existingDeviceClose = document.getElementById('existing-device-close');

function closeExistingDeviceModal() {
  existingDeviceModal.classList.remove('show');
}

existingDeviceClose.addEventListener('click', closeExistingDeviceModal);
existingDeviceModal.addEventListener('click', (e) => {
  if (e.target === existingDeviceModal) closeExistingDeviceModal();
});

function showExistingDeviceModal(device) {
  const selectedWarehouseId = getSelectedWarehouse();
  const selectedWarehouse = allWarehouses.find(w => String(w.id) === String(selectedWarehouseId));
  const selectedWarehouseName = selectedWarehouse ? selectedWarehouse.name : 'kho hiện tại';

  const warehouseDisplay = device.all_warehouses
    ? '<span class="badge badge-blue">Tất cả kho (All)</span>'
    : (device.warehouse_names && device.warehouse_names.length > 0)
      ? device.warehouse_names.map(n => `<span class="badge badge-blue">${escapeHtml(n)}</span>`).join(' ')
      : '<span class="badge badge-gray">Chưa gán kho</span>';

  const statusBadge = device.is_active === false
    ? '<span class="badge badge-red">Deactive</span>'
    : '<span class="badge badge-green">Active</span>';

  const activeUntilText = device.active_until
    ? formatDateOnly(device.active_until)
    : 'Vĩnh viễn';

  let warningHtml = '';
  if (device.is_active === false) {
    warningHtml += '<div class="existing-device-warning"><i class="fa-solid fa-triangle-exclamation"></i> Thiết bị này đang bị <strong>khóa (Deactive)</strong></div>';
  }
  if (device.active_until && device.active_until < new Date().toISOString().slice(0, 10)) {
    warningHtml += '<div class="existing-device-warning"><i class="fa-solid fa-triangle-exclamation"></i> Thiết bị này đã <strong>hết hạn active</strong></div>';
  }

  // Check if device already has all warehouses or already in selected warehouse
  const alreadyHasAllWarehouses = device.all_warehouses;
  const alreadyInSelectedWarehouse = device.warehouse_ids && device.warehouse_ids.includes(parseInt(selectedWarehouseId));

  let infoMessage = '';
  if (alreadyHasAllWarehouses) {
    infoMessage = '<div class="existing-device-info-msg"><i class="fa-solid fa-circle-info"></i> Thiết bị đã được cấp quyền truy cập <strong>tất cả kho</strong>, không cần thêm.</div>';
  } else if (alreadyInSelectedWarehouse) {
    infoMessage = `<div class="existing-device-info-msg"><i class="fa-solid fa-circle-info"></i> Thiết bị đã được đăng ký tại <strong>${escapeHtml(selectedWarehouseName)}</strong>.</div>`;
  }

  existingDeviceBody.innerHTML = `
    <div class="existing-device-detail">
      <p class="existing-device-subtitle">Thiết bị này đã được đăng ký với thông tin sau:</p>
      ${warningHtml}
      <table class="existing-device-table">
        <tr><td class="ed-label">IMEI</td><td class="ed-value font-mono">${escapeHtml(device.imei)}</td></tr>
        <tr><td class="ed-label">Họ và tên</td><td class="ed-value">${escapeHtml(device.full_name)}</td></tr>
        <tr><td class="ed-label">Mã NV</td><td class="ed-value">${escapeHtml(device.employee_code)}</td></tr>
        <tr><td class="ed-label">Email</td><td class="ed-value">${escapeHtml(device.email)}</td></tr>
        <tr><td class="ed-label">Loại thiết bị</td><td class="ed-value">${escapeHtml(device.device_type)}</td></tr>
        <tr><td class="ed-label">Trạng thái</td><td class="ed-value">${statusBadge}</td></tr>
        <tr><td class="ed-label">Active đến ngày</td><td class="ed-value">${activeUntilText}</td></tr>
        <tr><td class="ed-label">Kho hiện tại</td><td class="ed-value">${warehouseDisplay}</td></tr>
      </table>
      ${infoMessage}
      ${!alreadyHasAllWarehouses && !alreadyInSelectedWarehouse ? `<p class="existing-device-question">Bạn có muốn đăng ký thiết bị này cho <strong>${escapeHtml(selectedWarehouseName)}</strong> không?</p>` : ''}
    </div>
  `;

  if (alreadyHasAllWarehouses || alreadyInSelectedWarehouse) {
    existingDeviceFooter.innerHTML = '<button class="btn btn-secondary" id="existing-device-ok">Đóng</button>';
    document.getElementById('existing-device-ok').addEventListener('click', closeExistingDeviceModal);
  } else {
    existingDeviceFooter.innerHTML = `
      <button class="btn btn-secondary" id="existing-device-cancel">Hủy</button>
      <button class="btn btn-primary" id="existing-device-confirm">
        <i class="fa-solid fa-plus"></i>
        Đăng ký cho ${escapeHtml(selectedWarehouseName)}
      </button>
    `;
    document.getElementById('existing-device-cancel').addEventListener('click', closeExistingDeviceModal);
    document.getElementById('existing-device-confirm').addEventListener('click', async () => {
      const confirmBtn = document.getElementById('existing-device-confirm');
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

      try {
        const res = await fetch(`/api/devices/${device.id}/add-warehouse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ warehouse_ids: [parseInt(selectedWarehouseId)] }),
        });
        const result = await res.json();
        if (res.ok) {
          showToast('Thành công', result.message, 'success');
          closeExistingDeviceModal();
          loadDevices();
        } else {
          showToast('Lỗi', result.error, 'error');
        }
      } catch (err) {
        showToast('Lỗi', 'Lỗi kết nối server', 'error');
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i class="fa-solid fa-plus"></i> Đăng ký cho ${escapeHtml(selectedWarehouseName)}`;
      }
    });
  }

  existingDeviceModal.classList.add('show');
}

// === MASS UPLOAD CONFIRM MODAL ===
const massConfirmModal = document.getElementById('mass-upload-confirm-modal');
const massConfirmBody = document.getElementById('mass-confirm-body');
const massConfirmClose = document.getElementById('mass-confirm-close');
const massConfirmCancel = document.getElementById('mass-confirm-cancel');
const massConfirmOk = document.getElementById('mass-confirm-ok');

let pendingMassUploadFile = null;

function closeMassConfirmModal() {
  massConfirmModal.classList.remove('show');
  pendingMassUploadFile = null;
}

massConfirmClose.addEventListener('click', closeMassConfirmModal);
massConfirmCancel.addEventListener('click', closeMassConfirmModal);
massConfirmModal.addEventListener('click', (e) => {
  if (e.target === massConfirmModal) closeMassConfirmModal();
});

function showMassUploadConfirmModal(data, file) {
  pendingMassUploadFile = file;

  const existingDevices = data.existing_devices || [];
  const skippedDevices = data.skipped_devices || [];
  const newCount = data.new_count || 0;

  let summaryHtml = '<div class="mass-confirm-summary">';
  if (newCount > 0) {
    summaryHtml += `<span class="mass-confirm-stat mass-confirm-new"><i class="fa-solid fa-plus-circle"></i> ${newCount} thiết bị mới sẽ được tạo</span>`;
  }
  if (existingDevices.length > 0) {
    summaryHtml += `<span class="mass-confirm-stat mass-confirm-existing"><i class="fa-solid fa-warehouse"></i> ${existingDevices.length} thiết bị sẽ được thêm kho</span>`;
  }
  if (skippedDevices.length > 0) {
    summaryHtml += `<span class="mass-confirm-stat mass-confirm-skipped"><i class="fa-solid fa-forward"></i> ${skippedDevices.length} bỏ qua</span>`;
  }
  summaryHtml += '</div>';

  let tableHtml = '';
  if (existingDevices.length > 0) {
    tableHtml += `
      <h4 class="mass-confirm-section-title"><i class="fa-solid fa-warehouse"></i> Thiết bị sẽ được thêm kho</h4>
      <div class="upload-error-table-wrapper">
        <table class="data-table upload-error-table">
          <thead>
            <tr>
              <th>IMEI</th>
              <th>Họ tên</th>
              <th>Mã NV</th>
              <th>Kho hiện tại</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            ${existingDevices.map(d => {
              const statusBadge = d.is_active === false
                ? '<span class="badge badge-red">Deactive</span>'
                : '<span class="badge badge-green">Active</span>';
              const warehouses = d.all_warehouses
                ? '<span class="badge badge-blue">All</span>'
                : (d.warehouse_names || []).map(n => `<span class="badge badge-blue">${escapeHtml(n)}</span>`).join(' ') || '-';
              return `
                <tr>
                  <td class="font-mono">${escapeHtml(d.imei)}</td>
                  <td>${escapeHtml(d.full_name)}</td>
                  <td>${escapeHtml(d.employee_code)}</td>
                  <td>${warehouses}</td>
                  <td>${statusBadge}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  if (skippedDevices.length > 0) {
    tableHtml += `
      <h4 class="mass-confirm-section-title" style="color: #95a5a6;"><i class="fa-solid fa-forward"></i> Bỏ qua (không cần thêm)</h4>
      <div class="upload-error-table-wrapper">
        <table class="data-table upload-error-table">
          <thead>
            <tr>
              <th>IMEI</th>
              <th>Họ tên</th>
              <th>Lý do</th>
            </tr>
          </thead>
          <tbody>
            ${skippedDevices.map(d => `
              <tr>
                <td class="font-mono">${escapeHtml(d.imei)}</td>
                <td>${escapeHtml(d.full_name)}</td>
                <td style="color: #95a5a6;">${escapeHtml(d.reason)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  massConfirmBody.innerHTML = summaryHtml + tableHtml;
  massConfirmModal.classList.add('show');
}

massConfirmOk.addEventListener('click', async () => {
  if (!pendingMassUploadFile) {
    showToast('Lỗi', 'Không tìm thấy file để upload', 'error');
    closeMassConfirmModal();
    return;
  }

  massConfirmOk.disabled = true;
  massConfirmOk.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';

  const formData = new FormData();
  formData.append('file', pendingMassUploadFile);
  formData.append('confirm_existing', 'true');

  try {
    const res = await fetch('/api/devices/mass-upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (res.ok) {
      showToast('Thành công', data.message, 'success');
      closeMassConfirmModal();
      loadDevices();
    } else if (data.errors && data.errors.length > 0) {
      closeMassConfirmModal();
      showUploadErrors(data);
    } else {
      showToast('Lỗi', data.error || 'Lỗi upload', 'error');
    }
  } catch (err) {
    console.error('Confirm mass upload error:', err);
    showToast('Lỗi', 'Lỗi kết nối server', 'error');
  } finally {
    massConfirmOk.disabled = false;
    massConfirmOk.innerHTML = '<i class="fa-solid fa-check"></i> Xác nhận tất cả';
  }
});

// Initial load
loadFilterOptions();
updateSortIndicators();
loadDevices();
loadWarehouseCheckboxes();
