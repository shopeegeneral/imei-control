const imeiInput = document.getElementById('imei-input');
const scanBtn = document.getElementById('scan-btn');
const scannedByInput = document.getElementById('scanned-by');
const scanResult = document.getElementById('scan-result');
const deviceInfo = document.getElementById('device-info');

// Unified scan - no more separate modes
const scanInputLabel = document.getElementById('scan-input-label');

// Device picker modal
const devicePickerModal = document.getElementById('device-picker-modal');
const devicePickerList = document.getElementById('device-picker-list');
const devicePickerCancel = document.getElementById('device-picker-cancel');

devicePickerCancel.addEventListener('click', () => {
  devicePickerModal.classList.remove('show');
  imeiInput.focus();
});
devicePickerModal.addEventListener('click', (e) => {
  if (e.target === devicePickerModal) {
    devicePickerModal.classList.remove('show');
    imeiInput.focus();
  }
});

function showDevicePicker(devices) {
  devicePickerList.innerHTML = devices.map(d => {
    const inWarehouse = d.in_selected_warehouse;
    return `
    <button class="device-picker-item${inWarehouse ? ' in-warehouse' : ''}" onclick="pickDevice('${escapeHtml(d.imei)}')">
      <div style="display:flex; align-items:center; gap:12px; width:100%;">
        <i class="fa-solid fa-mobile-screen-button" style="font-size:20px; color:${inWarehouse ? '#6366f1' : '#94a3b8'}; flex-shrink:0;"></i>
        <div style="text-align:left; flex:1;">
          <div style="font-weight:600; font-family:monospace;">${escapeHtml(d.imei)}</div>
          <div style="font-size:13px; color:#64748b;">${escapeHtml(d.device_type || 'N/A')} · ${escapeHtml(d.full_name || '')}${d.department_name ? ' · ' + escapeHtml(d.department_name) : ''}</div>
        </div>
        ${inWarehouse
          ? '<span style="font-size:11px; color:#22c55e; font-weight:600; white-space:nowrap;"><i class="fa-solid fa-circle-check"></i> Kho này</span>'
          : '<span style="font-size:11px; color:#94a3b8; white-space:nowrap;">Kho khác</span>'}
      </div>
    </button>
  `;
  }).join('');
  devicePickerModal.classList.add('show');
}

async function pickDevice(imei) {
  devicePickerModal.classList.remove('show');
  await doScanWithImei(imei);
}

// Device info elements
const deviceInfoHeader = document.getElementById('device-info-header');
const deviceInfoIcon = document.getElementById('device-info-icon');
const deviceInfoStatus = document.getElementById('device-info-status');
const infoImei = document.getElementById('info-imei');
const infoType = document.getElementById('info-type');
const infoEmployeeCode = document.getElementById('info-employee-code');
const infoFullname = document.getElementById('info-fullname');
const infoEmail = document.getElementById('info-email');
const infoDepartment = document.getElementById('info-department');
const infoWarehouse = document.getElementById('info-warehouse');

// Quick register modal
const qrModal = document.getElementById('quick-register-modal');
const qrImei = document.getElementById('qr-imei');
const qrDeviceType = document.getElementById('qr-device-type');
const qrEmployeeCode = document.getElementById('qr-employee-code');
const qrFullname = document.getElementById('qr-fullname');
const qrEmail = document.getElementById('qr-email');
const qrWarehouse = document.getElementById('qr-warehouse');
const qrCancel = document.getElementById('qr-cancel');
const qrSubmit = document.getElementById('qr-submit');

// Helper function to escape HTML
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// Set scanned_by from logged-in user after user info is loaded
document.addEventListener('userLoaded', (e) => {
  scannedByInput.value = e.detail.email || e.detail.username || '';
});
// Sounds
const errorSound = new Audio('/imei-control/sounds/error.mp3');
const successSound = new Audio('/imei-control/sounds/success.mp3');

function playErrorSound() {
  errorSound.currentTime = 0;
  errorSound.play().catch(err => console.log('Cannot play sound:', err));
}

function playSuccessSound() {
  successSound.currentTime = 0;
  successSound.play().catch(err => console.log('Cannot play sound:', err));
}

function showDeviceInfo(device, action) {
  const isIn = action === 'IN';

  deviceInfoHeader.className = isIn ? 'status-header-in' : 'status-header-out';
  deviceInfoHeader.style.cssText = 'padding: 16px 24px; display: flex; align-items: center; gap: 12px;';
  deviceInfoIcon.className = `fa-solid ${isIn ? 'fa-right-to-bracket' : 'fa-right-from-bracket'}`;
  deviceInfoIcon.style.fontSize = '24px';
  deviceInfoStatus.textContent = isIn ? 'VÀO KHO (IN)' : 'RA KHO (OUT)';

  infoImei.textContent = device.imei || '-';
  infoType.textContent = device.device_type || '-';
  infoEmployeeCode.textContent = device.employee_code || '-';
  infoFullname.textContent = device.full_name || '-';
  infoEmail.textContent = device.email || '-';
  infoDepartment.textContent = device.department_name || '-';
  infoWarehouse.textContent = device.warehouse || '-';

  deviceInfo.classList.remove('hidden');
}

function showScanError(msg) {
  scanResult.className = 'scan-result error flex mt-6 p-5 rounded-xl text-lg font-semibold items-center gap-3 bg-red-50 text-red-700 border border-red-200';
  scanResult.style.display = '';
  scanResult.innerHTML = msg;
  playErrorSound();
  deviceInfo.classList.add('hidden');
}

async function doScanWithImei(imei) {
  scanResult.className = 'scan-result';
  scanResult.style.display = 'none';
  deviceInfo.classList.add('hidden');

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        imei,
        scan_type: 'imei',
        scanned_by: scannedByInput.value.trim(),
        warehouse_id: getSelectedWarehouse(),
      }),
    });
    const data = await res.json();
    handleScanResponse(res, data, imei);
  } catch (err) {
    showScanError(`<i class="fa-solid fa-circle-xmark text-2xl shrink-0"></i><div style="font-size: 18px;">Lỗi kết nối server</div>`);
  }
  imeiInput.focus();
}

function handleScanResponse(res, data, inputValue) {
  if (res.ok) {
    if (data.action === 'select_device') {
      // Multiple devices for employee_code — show picker
      imeiInput.value = '';
      showDevicePicker(data.devices);
      return;
    }
    scanResult.style.display = 'none';
    showDeviceInfo(data.device, data.action);
    playSuccessSound();
    imeiInput.value = '';
    loadRecentScans();
    loadTodayStats();
  } else if (res.status === 404) {
    showScanError(`<i class="fa-solid fa-circle-xmark text-2xl shrink-0"></i><div><strong style="font-size: 20px;">Không tìm thấy</strong><br><span style="font-size: 17px; font-weight: 400; margin-top: 4px; display: block;"><strong>${escapeHtml(inputValue)}</strong> chưa được đăng ký trong hệ thống.</span></div>`);
    imeiInput.value = '';
  } else if (res.status === 403) {
    showScanError(`<i class="fa-solid fa-circle-xmark text-2xl shrink-0"></i><div><strong style="font-size: 20px;">Không thể scan</strong><br><span style="font-size: 17px; font-weight: 400; margin-top: 4px; display: block;">${escapeHtml(data.error || 'Thiết bị chưa được đăng ký tại kho này')}</span></div>`);
    imeiInput.value = '';
  } else {
    showScanError(`<i class="fa-solid fa-circle-xmark text-xl shrink-0"></i>${escapeHtml(data.error || 'Lỗi không xác định')}`);
  }
}

async function doScan() {
  const inputVal = imeiInput.value.trim();
  if (!inputVal) {
    imeiInput.focus();
    return;
  }

  scanResult.className = 'scan-result';
  scanResult.style.display = 'none';
  deviceInfo.classList.add('hidden');

  try {
    const body = {
      scan_type: 'unified',
      input_value: inputVal,
      scanned_by: scannedByInput.value.trim(),
      warehouse_id: getSelectedWarehouse(),
    };

    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = await res.json();
    handleScanResponse(res, data, inputVal);
  } catch (err) {
    showScanError(`<i class="fa-solid fa-circle-xmark text-2xl shrink-0"></i><div style="font-size: 18px;">Lỗi kết nối server</div>`);
  }

  imeiInput.focus();
}

function showQuickRegister(imei) {
  qrImei.value = imei;
  qrDeviceType.value = '';
  qrEmployeeCode.value = '';
  qrFullname.value = '';
  qrEmail.value = '';
  qrWarehouse.value = '';
  qrModal.classList.add('show');
  qrFullname.focus();
}

// Scan button click
scanBtn.addEventListener('click', doScan);

// Enter key to scan
imeiInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doScan();
});

// Quick register cancel
qrCancel.addEventListener('click', () => {
  qrModal.classList.remove('show');
  imeiInput.focus();
});

// Quick register submit
qrSubmit.addEventListener('click', async () => {
  const full_name = qrFullname.value.trim();
  if (!full_name) {
    qrFullname.focus();
    return;
  }

  try {
    const res = await fetch('/api/scan/quick-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imei: qrImei.value,
        device_type: qrDeviceType.value.trim(),
        employee_code: qrEmployeeCode.value.trim(),
        full_name,
        email: qrEmail.value.trim(),
        warehouse: qrWarehouse.value.trim(),
        warehouse_id: getSelectedWarehouse(),
        scanned_by: scannedByInput.value.trim(),
      }),
    });

    const data = await res.json();

    qrModal.classList.remove('show');

    if (res.ok) {
      // Don't show success message, only show device info
      scanResult.style.display = 'none';
      showDeviceInfo(data.device, data.action);
      playSuccessSound();
      imeiInput.value = '';
      // Refresh recent scans after successful scan
      loadRecentScans();
      loadTodayStats();
    } else {
      scanResult.className = 'scan-result error flex mt-6 p-5 rounded-xl text-lg font-semibold items-center gap-3 bg-red-50 text-red-700 border border-red-200';
      scanResult.style.display = '';
      scanResult.innerHTML = `<i class="fa-solid fa-circle-xmark text-2xl shrink-0"></i><div style="font-size: 18px;">${data.error}</div>`;
      playErrorSound();
    }
  } catch (err) {
    scanResult.className = 'scan-result error flex mt-6 p-5 rounded-xl text-lg font-semibold items-center gap-3 bg-red-50 text-red-700 border border-red-200';
    scanResult.style.display = '';
    scanResult.innerHTML = `<i class="fa-solid fa-circle-xmark text-2xl shrink-0"></i><div style="font-size: 18px;">Lỗi kết nối server</div>`;
    playErrorSound();
  }

  imeiInput.focus();
});

// Close modal on overlay click
qrModal.addEventListener('click', (e) => {
  if (e.target === qrModal) qrModal.classList.remove('show');
});

// ========== RECENT SCANS ==========
const recentScansContainer = document.getElementById('recent-scans');

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'Vừa xong';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
  return `${Math.floor(seconds / 86400)} ngày trước`;
}

function renderRecentScans(scans) {
  if (!scans || scans.length === 0) {
    recentScansContainer.innerHTML = `
      <div class="empty-state" style="padding: 40px 20px;">
        <div class="empty-icon" style="width: 48px; height: 48px; margin: 0 auto 12px; font-size: 20px;">
          <i class="fa-solid fa-clock"></i>
        </div>
        <p class="empty-title" style="font-size: 14px;">Chưa có scan nào</p>
      </div>
    `;
    return;
  }

  recentScansContainer.innerHTML = scans.map(scan => {
    const isIn = scan.action === 'IN';
    const actionClass = isIn ? 'in' : 'out';
    const actionIcon = isIn ? 'fa-right-to-bracket' : 'fa-right-from-bracket';
    const actionText = isIn ? 'Vào kho' : 'Ra kho';
    
    return `
      <div class="recent-item">
        <div class="recent-item-header">
          <div class="recent-imei">${scan.imei}</div>
          <div class="recent-time">${formatTimeAgo(scan.scanned_at)}</div>
        </div>
        <div class="recent-info">
          <div class="recent-name">${scan.full_name || 'N/A'}</div>
          <div class="recent-action ${actionClass}">
            <i class="fa-solid ${actionIcon}"></i>
            ${actionText}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function loadRecentScans() {
  try {
    const warehouseId = getSelectedWarehouse();
    const params = new URLSearchParams({ limit: 20 });
    if (warehouseId) params.set('warehouse_id', warehouseId);
    
    const res = await fetch(`/api/history?${params}`);
    const data = await res.json();
    
    if (res.ok) {
      renderRecentScans(data.data);
    }
  } catch (err) {
    console.error('Failed to load recent scans:', err);
  }
}

// Load recent scans on page load
loadRecentScans();
loadTodayStats();

// Auto-refresh recent scans every 10 seconds
setInterval(loadRecentScans, 45000);
setInterval(loadTodayStats, 45000);

// Callback when sidebar warehouse filter changes
function onWarehouseChange(warehouseId) {
  loadRecentScans();
  loadTodayStats();
}

// Load today stats for scorecards
async function loadTodayStats() {
  try {
    const warehouseId = getSelectedWarehouse();
    if (!warehouseId) return;

    const res = await fetch(`/api/scan/today-stats?warehouse_id=${warehouseId}`);
    const data = await res.json();

    const inEl = document.getElementById('today-in-count');
    const outEl = document.getElementById('today-out-count');
    if (inEl) inEl.textContent = data.in_count || 0;
    if (outEl) outEl.textContent = data.out_count || 0;
  } catch (err) {
    console.error('Failed to load today stats:', err);
  }
}

