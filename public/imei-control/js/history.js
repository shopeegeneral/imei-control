const filterImei = document.getElementById('filter-imei');
const filterAction = document.getElementById('filter-action');
const filterFrom = document.getElementById('filter-from');
const filterTo = document.getElementById('filter-to');
const filterBtn = document.getElementById('filter-btn');
const exportBtn = document.getElementById('export-btn');
const historyTable = document.getElementById('history-table');
const noHistory = document.getElementById('no-history');
const pagination = document.getElementById('pagination');

// Stats elements
const statTotal = document.getElementById('stat-total');
const statIn = document.getElementById('stat-in');
const statOut = document.getElementById('stat-out');
const statToday = document.getElementById('stat-today');

const PAGE_SIZE = 50;
let currentOffset = 0;
let totalRecords = 0;

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleString('vi-VN');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function loadStats() {
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

async function loadHistory(offset = 0) {
  currentOffset = offset;

  try {
    const res = await fetch(`/api/history?${buildParams(offset)}`);
    const { data, total } = await res.json();
    totalRecords = total;

    if (data.length === 0) {
      historyTable.innerHTML = '';
      noHistory.classList.remove('hidden');
      pagination.innerHTML = '';
      return;
    }

    noHistory.classList.add('hidden');
    historyTable.innerHTML = data.map(h => {
      return `
      <tr class="hover:bg-gray-50 transition-colors">
        <td class="px-6 py-4"><span class="font-mono font-medium text-base">${escapeHtml(h.imei)}</span></td>
        <td class="px-6 py-4 text-base font-medium">${escapeHtml(h.full_name) || '-'}</td>
        <td class="px-6 py-4 text-base text-gray-500">${escapeHtml(h.warehouse_name) || '-'}</td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold badge-dot ${h.action === 'IN' ? 'bg-green-50 text-green-700 badge-in' : 'bg-red-50 text-red-700 badge-out'}">
            ${h.action === 'IN' ? 'Vào kho' : 'Ra kho'}
          </span>
        </td>
        <td class="px-6 py-4 text-base text-gray-500">${escapeHtml(h.scanned_by) || '-'}</td>
        <td class="px-6 py-4 text-base text-gray-500">${formatTime(h.scanned_at)}</td>
      </tr>
      `;
    }).join('');

    renderPagination();
  } catch (err) {
    console.error('Failed to load history:', err);
  }
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
    html += `<button class="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer" onclick="loadHistory(${(currentPage - 2) * PAGE_SIZE})"><i class="fa-solid fa-chevron-left mr-1"></i>Trước</button>`;
  }

  html += `<span class="text-base">Trang ${currentPage} / ${totalPages} (${totalRecords} bản ghi)</span>`;

  if (currentPage < totalPages) {
    html += `<button class="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer" onclick="loadHistory(${currentPage * PAGE_SIZE})">Sau<i class="fa-solid fa-chevron-right ml-1"></i></button>`;
  }

  pagination.innerHTML = html;
}

// Filter button
filterBtn.addEventListener('click', () => loadHistory(0));

// Enter key on filter inputs
[filterImei, filterFrom, filterTo].forEach(el => {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadHistory(0);
  });
});

filterAction.addEventListener('change', () => loadHistory(0));


// Export CSV
exportBtn.addEventListener('click', () => {
  const params = new URLSearchParams();
  const warehouse_id = getSelectedWarehouse();
  const from = filterFrom.value;
  const to = filterTo.value;

  if (warehouse_id) params.set('warehouse_id', warehouse_id);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  window.open(`/api/history/export?${params}`, '_blank');
});

// Initial load
loadStats();
loadHistory();

// Callback when sidebar warehouse filter changes
function onWarehouseChange(warehouseId) {
  loadStats();
  loadHistory(0);
}
