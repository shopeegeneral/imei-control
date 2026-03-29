// ==================== BLACKLIST MODULE ====================

let blPage = 1;
const BL_LIMIT = 20;
let blTotal = 0;
let blSearch = '';
let blAllItems = [];
let blEditId = null;

// ==================== LOAD DATA ====================

async function loadBlacklist() {
  const params = new URLSearchParams({ page: blPage, limit: BL_LIMIT });
  if (blSearch) params.set('search', blSearch);

  try {
    const res = await fetch(`/api/blacklist?${params}`);
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    blTotal = data.total;
    blAllItems = data.items;
    renderTable(data.items);
    renderPagination();
  } catch (err) {
    console.error(err);
    showToast('Lỗi', 'Không thể tải dữ liệu blacklist', 'error');
  }
}

// ==================== RENDER TABLE ====================

function renderTable(items) {
  const tbody = document.getElementById('bl-tbody');
  if (!items.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center;color:#aaa;padding:40px 20px;">
          <i class="fa-solid fa-ban" style="font-size:28px;margin-bottom:8px;display:block;"></i>
          Không có dữ liệu blacklist
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = items.map(entry => {
    const isExpired = entry.expires_at && new Date(entry.expires_at) < new Date();
    const expiresText = entry.expires_at
      ? new Date(entry.expires_at).toLocaleDateString('vi-VN')
      : 'Vĩnh viễn';
    const statusHtml = isExpired
      ? `<span style="background:#f39c12;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;white-space:nowrap;">Hết hạn</span>`
      : `<span style="background:#e74c3c;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;white-space:nowrap;">Đang BL</span>`;
    const created = entry.created_at ? new Date(entry.created_at).toLocaleDateString('vi-VN') : '—';

    return `
      <tr>
        <td style="font-weight:600;">${escapeHtml(entry.full_name)}</td>
        <td class="font-mono" style="white-space:nowrap;">${escapeHtml(entry.cccd)}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(entry.address || '')}">${escapeHtml(entry.address || '—')}</td>
        <td>${escapeHtml(entry.unit || '—')}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(entry.reason || '')}">${escapeHtml(entry.reason || '—')}</td>
        <td style="white-space:nowrap;">${expiresText} ${statusHtml}</td>
        <td style="white-space:nowrap;">${escapeHtml(entry.created_by || '—')}<br><small style="color:#aaa;">${created}</small></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px;margin-right:4px;" onclick="openEdit(${entry.id})">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn" style="padding:4px 10px;font-size:12px;background:#e74c3c;color:#fff;border:none;border-radius:6px;cursor:pointer;" onclick="deleteEntry(${entry.id}, '${escapeHtml(entry.full_name).replace(/'/g, "\\'")}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>`;
  }).join('');
}

// ==================== PAGINATION ====================

function renderPagination() {
  const pages = Math.ceil(blTotal / BL_LIMIT);
  const el = document.getElementById('bl-pagination');
  if (!el) return;

  let html = `<span style="color:#888;font-size:13px;margin-right:8px;">Tổng: ${blTotal}</span>`;
  if (blPage > 1) {
    html += `<button class="btn btn-secondary" style="padding:4px 12px;font-size:12px;margin-right:4px;" onclick="changePage(${blPage - 1})">‹ Trước</button>`;
  }
  if (pages > 1) {
    html += `<span style="font-size:13px;margin:0 8px;">${blPage} / ${pages}</span>`;
  }
  if (blPage < pages) {
    html += `<button class="btn btn-secondary" style="padding:4px 12px;font-size:12px;" onclick="changePage(${blPage + 1})">Sau ›</button>`;
  }
  el.innerHTML = html;
}

function changePage(p) {
  blPage = p;
  loadBlacklist();
}

// ==================== SEARCH ====================

document.getElementById('bl-search').addEventListener('input', function () {
  blSearch = this.value;
  blPage = 1;
  loadBlacklist();
});

// ==================== MODAL ====================

document.getElementById('bl-add-btn').addEventListener('click', () => openModal());

function openModal(entry = null) {
  blEditId = entry ? entry.id : null;
  document.getElementById('bl-modal-title').textContent = entry ? 'Chỉnh sửa Blacklist' : 'Thêm vào Blacklist';
  document.getElementById('bl-full-name').value = entry ? entry.full_name : '';
  document.getElementById('bl-cccd').value = entry ? entry.cccd : '';
  document.getElementById('bl-address').value = entry ? (entry.address || '') : '';
  document.getElementById('bl-unit').value = entry ? (entry.unit || '') : '';
  document.getElementById('bl-vehicle-info').value = entry ? (entry.vehicle_info || '') : '';
  document.getElementById('bl-reason').value = entry ? (entry.reason || '') : '';
  document.getElementById('bl-expires-at').value = entry && entry.expires_at
    ? entry.expires_at.split('T')[0]
    : '';
  document.getElementById('bl-modal').style.display = 'flex';
  document.getElementById('bl-full-name').focus();
}

function openEdit(id) {
  const entry = blAllItems.find(e => e.id === id);
  if (entry) openModal(entry);
}

function closeModal() {
  document.getElementById('bl-modal').style.display = 'none';
}

document.getElementById('bl-modal-cancel').addEventListener('click', closeModal);
document.getElementById('bl-modal-close-btn').addEventListener('click', closeModal);

document.getElementById('bl-modal').addEventListener('click', function (e) {
  if (e.target === this) closeModal();
});

document.getElementById('bl-modal-save').addEventListener('click', async () => {
  const full_name = document.getElementById('bl-full-name').value.trim();
  const cccd = document.getElementById('bl-cccd').value.trim();
  if (!full_name || !cccd) {
    showToast('Lỗi', 'Họ tên và CCCD là bắt buộc', 'error');
    return;
  }

  const body = {
    full_name,
    cccd,
    address: document.getElementById('bl-address').value.trim(),
    unit: document.getElementById('bl-unit').value.trim(),
    vehicle_info: document.getElementById('bl-vehicle-info').value.trim(),
    reason: document.getElementById('bl-reason').value.trim(),
    expires_at: document.getElementById('bl-expires-at').value || null,
  };

  const saveBtn = document.getElementById('bl-modal-save');
  saveBtn.disabled = true;

  try {
    const url = blEditId ? `/api/blacklist/${blEditId}` : '/api/blacklist';
    const method = blEditId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('Lỗi', data.error || 'Lỗi lưu dữ liệu', 'error');
      return;
    }
    closeModal();
    showToast('Thành công', blEditId ? 'Đã cập nhật bản ghi' : 'Đã thêm vào blacklist', 'success');
    loadBlacklist();
  } catch (err) {
    showToast('Lỗi', 'Lỗi kết nối', 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

// ==================== DELETE ====================

async function deleteEntry(id, name) {
  showConfirm(
    'Xoá khỏi Blacklist',
    `Bạn có chắc muốn xoá <strong>${name}</strong> khỏi blacklist không?`,
    async () => {
      try {
        const res = await fetch(`/api/blacklist/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          showToast('Lỗi', 'Không thể xoá bản ghi', 'error');
          return;
        }
        showToast('Thành công', 'Đã xoá khỏi blacklist', 'success');
        loadBlacklist();
      } catch (err) {
        showToast('Lỗi', 'Lỗi kết nối', 'error');
      }
    }
  );
}

// ==================== UTILS ====================

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', loadBlacklist);
