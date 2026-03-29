// ==================== SCAN BLACKLIST MODULE ====================

const suffixInput = document.getElementById('cccd-suffix-input');
const scanBtn = document.getElementById('scan-blacklist-btn');
const resultArea = document.getElementById('scan-blacklist-result');

let _pickerEntries = [];

// ==================== SCAN ====================

scanBtn.addEventListener('click', doScanBlacklist);
suffixInput.addEventListener('keydown', e => { if (e.key === 'Enter') doScanBlacklist(); });

async function doScanBlacklist() {
  const suffix = suffixInput.value.trim();
  if (!suffix) {
    showInlineResult('error', 'Vui lòng nhập số cuối CCCD');
    return;
  }
  if (!/^\d+$/.test(suffix)) {
    showInlineResult('error', 'Chỉ nhập chữ số (VD: 1234)');
    return;
  }
  if (suffix.length < 4) {
    showInlineResult('error', 'Vui lòng nhập ít nhất <strong>4 số cuối</strong> CCCD');
    return;
  }

  scanBtn.disabled = true;
  scanBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tìm...';
  resultArea.innerHTML = '';

  try {
    const res = await fetch('/api/blacklist/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suffix }),
    });
    const data = await res.json();

    if (!res.ok) {
      showInlineResult('error', escapeHtml(data.error || 'Lỗi hệ thống'));
      return;
    }

    if (data.matches.length === 0) {
      showInlineResult('clear', `Không tìm thấy ai trong Blacklist với <strong>${data.matches.length}</strong> kết quả — ${data.suffix} số cuối CCCD không trùng`);
    } else if (data.matches.length === 1) {
      showDetailModal(data.matches[0]);
    } else {
      showPickerModal(data.matches, suffix);
    }
  } catch (err) {
    showInlineResult('error', 'Lỗi kết nối. Vui lòng thử lại.');
  } finally {
    scanBtn.disabled = false;
    scanBtn.innerHTML = '<i class="fa-solid fa-search"></i> Scan';
  }
}

// ==================== INLINE RESULT ====================

function showInlineResult(type, html) {
  const config = {
    error:   { icon: 'fa-circle-xmark',       bg: '#fef2f2', border: '#fca5a5', color: '#dc2626' },
    clear:   { icon: 'fa-circle-check',        bg: '#f0fdf4', border: '#86efac', color: '#16a34a' },
    warning: { icon: 'fa-triangle-exclamation', bg: '#fffbeb', border: '#fcd34d', color: '#d97706' },
  };
  const c = config[type];
  resultArea.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-radius:10px;
                background:${c.bg};border:1.5px solid ${c.border};color:${c.color};margin-top:12px;">
      <i class="fa-solid ${c.icon}" style="font-size:20px;flex-shrink:0;"></i>
      <span style="font-size:14px;line-height:1.5;">${html}</span>
    </div>`;
}

// ==================== DETAIL MODAL ====================

function showDetailModal(entry) {
  const now = new Date();
  const isExpired = entry.expires_at && new Date(entry.expires_at) < now;
  const statusHtml = isExpired
    ? `<span style="background:#f39c12;color:#fff;padding:3px 12px;border-radius:12px;font-size:13px;">Hết hạn</span>`
    : `<span style="background:#e74c3c;color:#fff;padding:3px 12px;border-radius:12px;font-size:13px;">Đang Blacklist</span>`;

  document.getElementById('detail-name').textContent = entry.full_name;
  document.getElementById('detail-status').innerHTML = statusHtml;
  document.getElementById('detail-cccd').textContent = entry.cccd;
  document.getElementById('detail-address').textContent = entry.address || '—';
  document.getElementById('detail-unit').textContent = entry.unit || '—';
  document.getElementById('detail-vehicle').textContent = entry.vehicle_info || '—';
  document.getElementById('detail-reason').textContent = entry.reason || '—';
  document.getElementById('detail-expires').textContent = entry.expires_at
    ? new Date(entry.expires_at).toLocaleDateString('vi-VN')
    : 'Vĩnh viễn';
  document.getElementById('detail-added-by').textContent = entry.created_by || '—';
  document.getElementById('detail-added-at').textContent = entry.created_at
    ? new Date(entry.created_at).toLocaleString('vi-VN')
    : '—';

  document.getElementById('blacklist-detail-modal').style.display = 'flex';
}

document.getElementById('detail-modal-close').addEventListener('click', () => {
  document.getElementById('blacklist-detail-modal').style.display = 'none';
  resultArea.innerHTML = '';
  suffixInput.value = '';
  suffixInput.focus();
});

document.getElementById('blacklist-detail-modal').addEventListener('click', function (e) {
  if (e.target === this) {
    document.getElementById('detail-modal-close').click();
  }
});

// ==================== PICKER MODAL ====================

function showPickerModal(entries, suffix) {
  _pickerEntries = entries;
  document.getElementById('picker-title').textContent =
    `Tìm thấy ${entries.length} người có ${suffix} số cuối CCCD. Chọn để xem chi tiết:`;

  const list = document.getElementById('picker-list');
  list.innerHTML = entries.map(e => `
    <div onclick="selectEntry(${e.id})"
         style="cursor:pointer;padding:12px 16px;border:1.5px solid #e2e8f0;border-radius:8px;
                display:flex;justify-content:space-between;align-items:center;
                transition:background .15s;margin-bottom:6px;"
         onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
      <div>
        <div style="font-weight:600;font-size:15px;">${escapeHtml(e.full_name)}</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">
          CCCD: <span class="font-mono">${escapeHtml(e.cccd)}</span>
          &bull; ${escapeHtml(e.unit || '—')}
        </div>
      </div>
      <i class="fa-solid fa-chevron-right" style="color:#aaa;"></i>
    </div>`).join('');

  document.getElementById('picker-modal').style.display = 'flex';
}

function selectEntry(id) {
  const entry = _pickerEntries.find(e => e.id === id);
  if (entry) {
    document.getElementById('picker-modal').style.display = 'none';
    showDetailModal(entry);
  }
}

document.getElementById('picker-modal-close').addEventListener('click', () => {
  document.getElementById('picker-modal').style.display = 'none';
});

document.getElementById('picker-modal').addEventListener('click', function (e) {
  if (e.target === this) document.getElementById('picker-modal-close').click();
});

// ==================== UTILS ====================

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
