const searchInput = document.getElementById('search-input');
const filterStatus = document.getElementById('filter-status');
const devicesTable = document.getElementById('devices-table');
const noDevices = document.getElementById('no-devices');
const addDeviceBtn = document.getElementById('add-device-btn');

// Modal elements
const deviceModal = document.getElementById('device-modal');
const modalTitle = document.getElementById('modal-title');
const deviceId = document.getElementById('device-id');
const deviceImei = document.getElementById('device-imei');
const deviceType = document.getElementById('device-type');
const deviceEmployeeCode = document.getElementById('device-employee-code');
const deviceFullname = document.getElementById('device-fullname');
const deviceEmail = document.getElementById('device-email');
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
const uploadErrorModal = document.getElementById('upload-error-modal');
const uploadErrorClose = document.getElementById('upload-error-close');
const uploadErrorOk = document.getElementById('upload-error-ok');
const uploadErrorSummary = document.getElementById('upload-error-summary');
const uploadErrorBody = document.getElementById('upload-error-body');

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleString('vi-VN');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
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
const PAGE_LIMIT = 20;

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
  const params = new URLSearchParams();
  const search = searchInput.value.trim();
  const status = filterStatus.value;
  const warehouseId = getSelectedWarehouse() || '';

  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (warehouseId) params.set('warehouse_id', warehouseId);
  params.set('page', currentPage);
  params.set('limit', PAGE_LIMIT);

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
      let warehouseDisplay = '-';
      if (d.all_warehouses) {
        warehouseDisplay = '<span style="color: #3498db; font-weight: 600;"><i class="fa-solid fa-globe"></i> Tất cả</span>';
      } else if (d.warehouse_names && d.warehouse_names.filter(Boolean).length > 0) {
        warehouseDisplay = d.warehouse_names.filter(Boolean).join(', ');
      }

      const whTypeBadge = d.warehouse_type
        ? `<span class="badge ${d.warehouse_type === 'SOC' ? 'badge-orange' : 'badge-green'}">${d.warehouse_type}</span>`
        : '<span class="badge badge-gray">-</span>';

      const deptDisplay = escapeHtml(d.department_name) || '-';
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
        <td class="px-6 py-4">${whTypeBadge}</td>
        <td class="px-6 py-4 text-base text-gray-500">${deptDisplay}</td>
        <td class="px-6 py-4 text-base text-gray-500">${warehouseDisplay}</td>
        <td class="px-6 py-4 text-base text-gray-500">${createdByDisplay}</td>
        <td class="px-6 py-4">
          <div class="flex gap-2">
            <button onclick="editDevice(${d.id})" class="btn-icon btn-icon-edit" title="Sửa"><i class="fa-solid fa-pen-to-square"></i></button>
            <button onclick="deleteDevice(${d.id}, '${escapeHtml(d.full_name)}')" class="btn-icon btn-icon-delete" title="Xoá"><i class="fa-solid fa-trash"></i></button>
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
  deviceWarehouseType.value = '';
  deviceDepartment.innerHTML = '<option value="">-- Chọn loại kho trước --</option>';
  deviceDepartment.disabled = true;
  setSelectedWarehouseData({ all_warehouses: false, warehouse_ids: [] });
  deviceImei.readOnly = false;
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
    deviceWarehouseType.value = device.warehouse_type || '';
    await loadDepartmentsForModal(device.warehouse_type, device.department_id);
    setSelectedWarehouseData(device);
    deviceImei.readOnly = false;
    deviceModal.classList.add('show');
    deviceFullname.focus();
  } catch (err) {
    showToast('Lỗi', 'Lỗi tải thông tin thiết bị', 'error');
  }
}

// Delete device
async function deleteDevice(id, name) {
  showConfirm(
    'Xóa thiết bị',
    `Xóa thiết bị của "<strong>${name}</strong>"?<br>Toàn bộ lịch sử scan cũng sẽ bị xóa.`,
    async () => {
      try {
        const res = await fetch(`/api/devices/${id}`, { method: 'DELETE' });
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

// Save device (create or update)
modalSave.addEventListener('click', async () => {
  const imei = deviceImei.value.trim();
  const device_type = deviceType.value.trim();
  const employee_code = deviceEmployeeCode.value.trim();
  const full_name = deviceFullname.value.trim();
  const email = deviceEmail.value.trim();
  const warehouse_type = deviceWarehouseType.value;
  const department_id = deviceDepartment.value;

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

  const body = {
    imei,
    has_barcode: deviceHasBarcode.value === 'yes',
    device_type,
    employee_code,
    full_name,
    email,
    all_warehouses: warehouseData.all_warehouses,
    warehouse_ids: warehouseData.warehouse_ids,
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

filterStatus.addEventListener('change', () => {
  currentPage = 1;
  loadDevices();
});

// Warehouse filter change handler (called by common.js)
function onWarehouseChange(warehouseId) {
  currentPage = 1;
  loadDevices();
}

// === MASS UPLOAD ===

// Toggle dropdown menu
massUploadBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  massUploadMenu.classList.toggle('show');
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!massUploadWrapper.contains(e.target)) {
    massUploadMenu.classList.remove('show');
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

// Initial load
loadDevices();
loadWarehouseCheckboxes();
