let warehouses = [];
let editingId = null;

const warehousesTable = document.getElementById('warehouses-table');
const searchInput = document.getElementById('search-input');
const addWarehouseBtn = document.getElementById('add-warehouse-btn');
const warehouseModal = document.getElementById('warehouse-modal');
const modalTitle = document.getElementById('modal-title');
const modalClose = document.getElementById('modal-close');
const cancelBtn = document.getElementById('cancel-btn');
const saveBtn = document.getElementById('save-btn');
const warehouseNameInput = document.getElementById('warehouse-name');
const warehouseTypeSelect = document.getElementById('warehouse-type');

// Load warehouses
async function loadWarehouses() {
  try {
    const res = await fetch('/api/warehouses');
    const data = await res.json();
    
    if (res.ok) {
      warehouses = data.data;
      renderWarehouses();
    }
  } catch (err) {
    console.error('Load warehouses error:', err);
    warehousesTable.innerHTML = '<tr><td colspan="3" class="text-center" style="color: #e74c3c;">Lỗi khi tải dữ liệu</td></tr>';
  }
}

// Render warehouses table
function renderWarehouses() {
  const searchTerm = searchInput.value.toLowerCase();
  const filtered = warehouses.filter(w => 
    w.name.toLowerCase().includes(searchTerm)
  );

  if (filtered.length === 0) {
    warehousesTable.innerHTML = '<tr><td colspan="4" class="text-center">Không có kho nào</td></tr>';
    return;
  }

  const role = currentUser ? currentUser.role : localStorage.getItem('userRole');
  const canManage = ['admin', 'security'].includes(role);

  warehousesTable.innerHTML = filtered.map(warehouse => `
    <tr>
      <td><span class="badge badge-blue">${warehouse.id}</span></td>
      <td><strong>${warehouse.name}</strong></td>
      <td><span class="badge ${warehouse.warehouse_type === 'SOC' ? 'badge-orange' : 'badge-green'}">${warehouse.warehouse_type || 'WHS'}</span></td>
      <td>
        ${canManage ? `<div class="action-buttons">
          <button class="btn-icon btn-icon-edit" onclick="editWarehouse(${warehouse.id})">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-icon btn-icon-delete" onclick="deleteWarehouse(${warehouse.id})">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>` : ''}
      </td>
    </tr>
  `).join('');
}

// Show modal
function showModal(title, warehouse = null) {
  modalTitle.textContent = title;
  editingId = warehouse ? warehouse.id : null;
  warehouseNameInput.value = warehouse ? warehouse.name : '';
  warehouseTypeSelect.value = warehouse ? (warehouse.warehouse_type || 'WHS') : 'WHS';
  warehouseModal.classList.add('show');
  warehouseNameInput.focus();
}

// Hide modal
function hideModal() {
  warehouseModal.classList.remove('show');
  editingId = null;
  warehouseNameInput.value = '';
  warehouseTypeSelect.value = 'WHS';
}

// Add warehouse
addWarehouseBtn.addEventListener('click', () => {
  showModal('Thêm kho mới');
});

// Edit warehouse
function editWarehouse(id) {
  const warehouse = warehouses.find(w => w.id === id);
  if (warehouse) {
    showModal('Sửa kho', warehouse);
  }
}

// Delete warehouse
async function deleteWarehouse(id) {
  const warehouse = warehouses.find(w => w.id === id);
  
  showConfirm(
    'Xóa kho',
    `Bạn có chắc muốn xóa kho "<strong>${warehouse.name}</strong>"?`,
    async () => {
      try {
        const res = await fetch(`/api/warehouses/${id}`, {
          method: 'DELETE'
        });

        const data = await res.json();

        if (res.ok) {
          showToast('Đã xóa', data.message, 'success');
          loadWarehouses();
        } else {
          showToast('Lỗi', data.error || 'Lỗi khi xóa kho', 'error');
        }
      } catch (err) {
        console.error('Delete warehouse error:', err);
        showToast('Lỗi', 'Lỗi kết nối server', 'error');
      }
    }
  );
}

// Save warehouse
saveBtn.addEventListener('click', async () => {
  const name = warehouseNameInput.value.trim();
  
  if (!name) {
    showToast('Thiếu thông tin', 'Vui lòng nhập tên kho', 'warning');
    warehouseNameInput.focus();
    return;
  }

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

  try {
    const url = editingId ? `/api/warehouses/${editingId}` : '/api/warehouses';
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, warehouse_type: warehouseTypeSelect.value })
    });

    const data = await res.json();

    if (res.ok) {
      showToast('Thành công', data.message, 'success');
      hideModal();
      loadWarehouses();
    } else {
      showToast('Lỗi', data.error || 'Lỗi khi lưu kho', 'error');
    }
  } catch (err) {
    console.error('Save warehouse error:', err);
    showToast('Lỗi', 'Lỗi kết nối server', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Lưu';
  }
});

// Close modal
modalClose.addEventListener('click', hideModal);
cancelBtn.addEventListener('click', hideModal);

// Close modal on overlay click
warehouseModal.addEventListener('click', (e) => {
  if (e.target === warehouseModal) hideModal();
});

// Search
searchInput.addEventListener('input', renderWarehouses);

// Hide warehouse management buttons for supervisor
function applyWarehousePermissions() {
  const role = currentUser ? currentUser.role : localStorage.getItem('userRole');
  if (role === 'supervisor') {
    if (addWarehouseBtn) addWarehouseBtn.style.display = 'none';
  }
}

document.addEventListener('userLoaded', () => applyWarehousePermissions());

// Load initial data
loadWarehouses();
