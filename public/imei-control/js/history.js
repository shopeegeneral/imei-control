const filterImei = document.getElementById('filter-imei');
const filterAction = document.getElementById('filter-action');
const filterFrom = document.getElementById('filter-from');
const filterTo = document.getElementById('filter-to');
const filterBtn = document.getElementById('filter-btn');
const exportBtn = document.getElementById('export-btn');
const historyTable = document.getElementById('history-table');
const historyTableHead = document.getElementById('history-table-head');
const noHistory = document.getElementById('no-history');
const noHistoryTitle = document.getElementById('no-history-title');
const pagination = document.getElementById('pagination');
const historyStats = document.getElementById('history-stats');
const historyPageTitle = document.getElementById('history-page-title');
const historyPageSubtitle = document.getElementById('history-page-subtitle');
const tabScan = document.getElementById('tab-scan');
const tabModify = document.getElementById('tab-modify');

// Stats elements
const statTotal = document.getElementById('stat-total');
const statIn = document.getElementById('stat-in');
const statOut = document.getElementById('stat-out');
const statToday = document.getElementById('stat-today');

const PAGE_SIZE = 50;
let currentOffset = 0;
let totalRecords = 0;
let activeTab = 'scan';

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleString('vi-VN');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function loadStats() {
  if (activeTab !== 'scan') {
    return;
  }

  try {
    const warehouseId = getSelectedWarehouse();
    const params = new URLSearchParams();
    if (warehouseId) params.set('warehouse_id', warehouseId);
    
    const res = await fetch(`/api/history/stats?${params}`);
    const stats = await res.json();

    statTotal.textContent = stats.devices.total_devices;
    statIn.textContent = stats.devices.in_stock;
    statOut.textContent = stats.devices.out_stock;
    statToday.textContent = stats.today.total_scans;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function buildParams(offset) {
  const params = new URLSearchParams();
  const imei = filterImei.value.trim();
  const warehouse_id = getSelectedWarehouse();
  const action = filterAction.value;
  const from = filterFrom.value;
  const to = filterTo.value;

  if (imei) params.set('imei', imei);
  if (warehouse_id) params.set('warehouse_id', warehouse_id);
  if (action) params.set('action', action);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('limit', PAGE_SIZE);
  params.set('offset', offset);

  return params;
}

function setActiveTab(tab) {
  activeTab = tab;
  currentOffset = 0;
  filterAction.value = '';

  if (tab === 'scan') {
    tabScan.classList.add('active');
    tabModify.classList.remove('active');
    historyStats.classList.remove('hidden');
    historyPageTitle.textContent = 'Lịch sử scan';
    historyPageSubtitle.textContent = 'Tra cứu toàn bộ lượt scan vào/ra kho';
    filterImei.placeholder = 'Tìm theo IMEI...';
    filterAction.innerHTML = `
      <option value="">Tất cả</option>
      <option value="IN">Vào kho (IN)</option>
      <option value="OUT">Ra kho (OUT)</option>
    `;
    historyTableHead.innerHTML = `
      <th>IMEI</th>
      <th>Họ tên</th>
      <th>Kho</th>
      <th>Hành động</th>
      <th>Người scan</th>
      <th>Thời gian</th>
    `;
    noHistoryTitle.textContent = 'Chưa có lịch sử scan nào';
    loadStats();
  } else {
    tabModify.classList.add('active');
    tabScan.classList.remove('active');
    historyStats.classList.add('hidden');
    historyPageTitle.textContent = 'Lịch sử chỉnh sửa';
    historyPageSubtitle.textContent = 'Theo dõi toàn bộ thao tác chỉnh sửa thiết bị theo kho';
    filterImei.placeholder = 'Tìm theo IMEI, email, nội dung...';
    filterAction.innerHTML = `
      <option value="">Tất cả</option>
      <option value="Sửa">Sửa</option>
      <option value="Xóa">Xóa</option>
      <option value="Active">Active</option>
      <option value="Deactive">Deactive</option>
    `;
    historyTableHead.innerHTML = `
      <th>IMEI</th>
      <th>Email</th>
      <th>Kho</th>
      <th>Hành động</th>
      <th>Nội dung</th>
      <th>Thời gian</th>
    `;
    noHistoryTitle.textContent = 'Chưa có lịch sử chỉnh sửa nào';
  }

  loadHistory(0);
}

function renderModifyDetail(item) {
  if (!item.field_name) {
    return '-';
  }

  const oldValue = escapeHtml(item.old_value || 'Trống');
  const newValue = escapeHtml(item.new_value || 'Trống');
  return `<strong>${escapeHtml(item.field_name)}</strong><br><span class="text-gray-500">${oldValue} -> ${newValue}</span>`;
}

async function loadHistory(offset = 0) {
  currentOffset = offset;

  try {
    const endpoint = activeTab === 'scan' ? '/api/history' : '/api/history/modify';
    const res = await fetch(`${endpoint}?${buildParams(offset)}`);
    const { data, total } = await res.json();
    totalRecords = total;

    if (data.length === 0) {
      historyTable.innerHTML = '';
      noHistory.classList.remove('hidden');
      pagination.innerHTML = '';
      return;
    }

    noHistory.classList.add('hidden');
    historyTable.innerHTML = data.map((item) => {
      if (activeTab === 'scan') {
        return `
        <tr class="hover:bg-gray-50 transition-colors">
          <td class="px-6 py-4"><span class="font-mono font-medium text-base">${escapeHtml(item.imei)}</span></td>
          <td class="px-6 py-4 text-base font-medium">${escapeHtml(item.full_name) || '-'}</td>
          <td class="px-6 py-4 text-base text-gray-500">${escapeHtml(item.warehouse_name) || '-'}</td>
          <td class="px-6 py-4">
            <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold badge-dot ${item.action === 'IN' ? 'bg-green-50 text-green-700 badge-in' : 'bg-red-50 text-red-700 badge-out'}">
              ${item.action === 'IN' ? 'Vào kho' : 'Ra kho'}
            </span>
          </td>
          <td class="px-6 py-4 text-base text-gray-500">${escapeHtml(item.scanned_by) || '-'}</td>
          <td class="px-6 py-4 text-base text-gray-500">${formatTime(item.scanned_at)}</td>
        </tr>
        `;
      }

      return `
      <tr class="hover:bg-gray-50 transition-colors">
        <td class="px-6 py-4"><span class="font-mono font-medium text-base">${escapeHtml(item.imei)}</span></td>
        <td class="px-6 py-4 text-base text-gray-500">${escapeHtml(item.email) || '-'}</td>
        <td class="px-6 py-4 text-base text-gray-500">${escapeHtml(item.warehouse_name) || '-'}</td>
        <td class="px-6 py-4 text-base font-medium">${escapeHtml(item.action) || '-'}</td>
        <td class="px-6 py-4 text-base text-gray-500">${renderModifyDetail(item)}</td>
        <td class="px-6 py-4 text-base text-gray-500">${formatTime(item.created_at)}</td>
      </tr>
      `;
    }).join('');

    renderPagination();
  } catch (err) {
    console.error('Failed to load history:', err);
  }
}

function changePage(offset) {
  loadHistory(offset);
}

function renderPagination() {
  const totalPages = Math.ceil(totalRecords / PAGE_SIZE);
  const currentPage = Math.floor(currentOffset / PAGE_SIZE) + 1;

  if (totalPages <= 1) {
    pagination.innerHTML = `<span>${totalRecords} bản ghi</span>`;
    return;
  }

  let html = '';

  if (currentPage > 1) {
    html += `<button class="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer" onclick="changePage(${(currentPage - 2) * PAGE_SIZE})"><i class="fa-solid fa-chevron-left mr-1"></i>Trước</button>`;
  }

  html += `<span class="text-base">Trang ${currentPage} / ${totalPages} (${totalRecords} bản ghi)</span>`;

  if (currentPage < totalPages) {
    html += `<button class="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer" onclick="changePage(${currentPage * PAGE_SIZE})">Sau<i class="fa-solid fa-chevron-right ml-1"></i></button>`;
  }

  pagination.innerHTML = html;
}

// Filter button
filterBtn.addEventListener('click', () => loadHistory(0));
tabScan.addEventListener('click', () => setActiveTab('scan'));
tabModify.addEventListener('click', () => setActiveTab('modify'));

// Enter key on filter inputs
[filterImei, filterFrom, filterTo].forEach(el => {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadHistory(0);
  });
});

filterAction.addEventListener('change', () => loadHistory(0));

// Clear all filters
const clearFiltersBtn = document.getElementById('clear-filters-btn');
clearFiltersBtn.addEventListener('click', () => {
  filterImei.value = '';
  filterAction.value = '';
  filterFrom.value = '';
  filterTo.value = '';
  currentOffset = 0;
  loadHistory(0);
});


// Export CSV
exportBtn.addEventListener('click', () => {
  const endpoint = activeTab === 'scan' ? '/api/history/export' : '/api/history/modify/export';
  window.open(`${endpoint}?${buildParams(0)}`, '_blank');
});

// Initial load
setActiveTab('scan');

// Callback when sidebar warehouse filter changes
function onWarehouseChange(warehouseId) {
  if (activeTab === 'scan') {
    loadStats();
  }
  loadHistory(0);
}
