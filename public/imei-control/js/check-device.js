// ==================== CHECK DEVICE MODULE ====================

const checkInput = document.getElementById('check-input');
const checkBtn = document.getElementById('check-btn');
const checkResult = document.getElementById('check-result');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('vi-VN');
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '-';
  if (dateStr.length === 10) return dateStr.split('-').reverse().join('/');
  return new Date(dateStr).toLocaleDateString('vi-VN');
}

async function checkDevice() {
  const query = checkInput.value.trim();
  if (!query) {
    showToast('Lỗi', 'Vui lòng nhập IMEI hoặc mã nhân viên', 'error');
    checkInput.focus();
    return;
  }

  checkBtn.disabled = true;
  checkBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...';
  checkResult.innerHTML = '<div class="check-loading"><i class="fa-solid fa-spinner fa-spin"></i> Đang tìm kiếm...</div>';

  try {
    const res = await fetch(`/api/devices/check?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!res.ok) {
      checkResult.innerHTML = `
        <div class="card">
          <div class="card-padding">
            <div class="check-not-found">
              <i class="fa-solid fa-circle-xmark"></i>
              <h3>Không tìm thấy thiết bị</h3>
              <p>Không có thiết bị nào khớp với "<strong>${escapeHtml(query)}</strong>"</p>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const devices = data.devices || [];
    if (devices.length === 0) {
      checkResult.innerHTML = `
        <div class="card">
          <div class="card-padding">
            <div class="check-not-found">
              <i class="fa-solid fa-circle-xmark"></i>
              <h3>Không tìm thấy thiết bị</h3>
              <p>Không có thiết bị nào khớp với "<strong>${escapeHtml(query)}</strong>"</p>
            </div>
          </div>
        </div>
      `;
      return;
    }

    // Render each device
    checkResult.innerHTML = devices.map(device => renderDeviceCard(device)).join('');

  } catch (err) {
    console.error('Check device error:', err);
    checkResult.innerHTML = `
      <div class="card">
        <div class="card-padding">
          <div class="check-not-found" style="color: #e74c3c;">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <h3>Lỗi kết nối</h3>
            <p>Không thể kết nối server. Vui lòng thử lại.</p>
          </div>
        </div>
      </div>
    `;
  } finally {
    checkBtn.disabled = false;
    checkBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Kiểm tra';
  }
}

function renderDeviceCard(device) {
  const statusClass = device.is_active ? 'check-status-active' : 'check-status-inactive';
  const statusText = device.is_active ? 'Active' : 'Deactive';
  const statusIcon = device.is_active ? 'fa-circle-check' : 'fa-circle-xmark';

  const scanStatusClass = device.status === 'IN' ? 'check-scan-in' : 'check-scan-out';
  const scanStatusText = device.status === 'IN' ? 'Trong kho' : 'Ngoài kho';
  const scanStatusIcon = device.status === 'IN' ? 'fa-right-to-bracket' : 'fa-right-from-bracket';

  const activeUntilText = device.active_until
    ? formatDateOnly(device.active_until)
    : 'Vĩnh viễn';

  // Warehouse badges
  let warehouseHtml;
  if (device.all_warehouses) {
    warehouseHtml = '<span class="badge badge-blue">Tất cả kho (All)</span>';
  } else if (device.warehouses && device.warehouses.length > 0) {
    warehouseHtml = device.warehouses.map(w =>
      `<span class="badge ${w.warehouse_type === 'SOC' ? 'badge-orange' : 'badge-blue'}">${escapeHtml(w.name)}</span>`
    ).join(' ');
  } else {
    warehouseHtml = '<span class="badge badge-gray">Chưa gán kho</span>';
  }

  // Warnings
  let warningHtml = '';
  if (!device.is_active) {
    warningHtml += '<div class="existing-device-warning"><i class="fa-solid fa-triangle-exclamation"></i> Thiết bị đang bị <strong>khóa (Deactive)</strong></div>';
  }
  if (device.active_until && device.active_until < new Date().toISOString().slice(0, 10)) {
    warningHtml += '<div class="existing-device-warning"><i class="fa-solid fa-triangle-exclamation"></i> Thiết bị đã <strong>hết hạn active</strong></div>';
  }

  return `
    <div class="card mb-4 check-device-card">
      <div class="check-device-header">
        <div class="check-device-header-left">
          <span class="check-device-imei font-mono">${escapeHtml(device.imei)}</span>
          <span class="check-status-badge ${statusClass}">
            <i class="fa-solid ${statusIcon}"></i> ${statusText}
          </span>
          <span class="check-status-badge ${scanStatusClass}">
            <i class="fa-solid ${scanStatusIcon}"></i> ${scanStatusText}
          </span>
        </div>
        <div class="check-device-header-right">
          <span class="badge badge-gray">${escapeHtml(device.device_type || 'N/A')}</span>
        </div>
      </div>
      ${warningHtml ? `<div style="padding: 0 20px;">${warningHtml}</div>` : ''}
      <div class="check-device-body">
        <table class="existing-device-table">
          <tr><td class="ed-label">IMEI / Service Tag</td><td class="ed-value font-mono">${escapeHtml(device.imei)}</td></tr>
          <tr><td class="ed-label">Loại thiết bị</td><td class="ed-value">${escapeHtml(device.device_type || '-')}</td></tr>
          <tr><td class="ed-label">Mã nhân viên</td><td class="ed-value">${escapeHtml(device.employee_code || '-')}</td></tr>
          <tr><td class="ed-label">Họ và tên</td><td class="ed-value" style="font-weight:600;">${escapeHtml(device.full_name || '-')}</td></tr>
          <tr><td class="ed-label">Email</td><td class="ed-value">${escapeHtml(device.email || '-')}</td></tr>
          <tr><td class="ed-label">Bộ phận</td><td class="ed-value">${escapeHtml(device.department_name || '-')}</td></tr>
          <tr><td class="ed-label">Kho truy cập</td><td class="ed-value">${warehouseHtml}</td></tr>
          <tr><td class="ed-label">Active đến ngày</td><td class="ed-value">${activeUntilText}</td></tr>
          <tr><td class="ed-label">Has Barcode</td><td class="ed-value">${device.has_barcode ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-gray">No</span>'}</td></tr>
          <tr><td class="ed-label">Ngày tạo</td><td class="ed-value">${formatDate(device.created_at)}</td></tr>
          <tr><td class="ed-label">Cập nhật lần cuối</td><td class="ed-value">${formatDate(device.updated_at)}</td></tr>
        </table>
      </div>
    </div>
  `;
}

// Event listeners
checkBtn.addEventListener('click', checkDevice);
checkInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') checkDevice();
});

// Auto focus input
checkInput.focus();
