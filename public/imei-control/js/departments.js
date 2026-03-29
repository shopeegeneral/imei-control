let departments = [];
let editingId = null;

const deptsTable = document.getElementById('departments-table');
const searchInput = document.getElementById('search-input');
const filterType = document.getElementById('filter-type');
const addDeptBtn = document.getElementById('add-dept-btn');
const deptModal = document.getElementById('dept-modal');
const modalTitle = document.getElementById('modal-title');
const modalClose = document.getElementById('modal-close');
const cancelBtn = document.getElementById('cancel-btn');
const saveBtn = document.getElementById('save-btn');
const deptNameInput = document.getElementById('dept-name');
const deptTypeSelect = document.getElementById('dept-type');

// Load departments
async function loadDepartments() {
  try {
    const res = await fetch('/api/departments');
    const data = await res.json();

    if (res.ok) {
      departments = data.data;
      renderDepartments();
    }
  } catch (err) {
    console.error('Load departments error:', err);
    deptsTable.innerHTML = '<tr><td colspan="4" class="text-center" style="color: #e74c3c;">Lỗi khi tải dữ liệu</td></tr>';
  }
}

// Render table
function renderDepartments() {
  const searchTerm = searchInput.value.toLowerCase();
  const typeFilter = filterType.value;
  const role = currentUser ? currentUser.role : localStorage.getItem('userRole');
  const canManage = ['admin', 'security'].includes(role);

  // Hide add button for non-managers
  if (addDeptBtn) addDeptBtn.style.display = canManage ? '' : 'none';

  const filtered = departments.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(searchTerm);
    const matchType = !typeFilter || d.warehouse_type === typeFilter;
    return matchSearch && matchType;
  });

  if (filtered.length === 0) {
    deptsTable.innerHTML = '<tr><td colspan="4" class="text-center">Không có bộ phận nào</td></tr>';
    return;
  }

  deptsTable.innerHTML = filtered.map(dept => `
    <tr>
      <td><span class="badge badge-blue">${dept.id}</span></td>
      <td><strong>${dept.name}</strong></td>
      <td><span class="badge ${dept.warehouse_type === 'SOC' ? 'badge-orange' : 'badge-green'}">${dept.warehouse_type}</span></td>
      <td>
        ${canManage ? `<div class="action-buttons">
          <button class="btn-icon btn-icon-edit" onclick="editDept(${dept.id})">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-icon btn-icon-delete" onclick="deleteDept(${dept.id})">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>` : ''}
      </td>
    </tr>
  `).join('');
}

// Show modal
function showModal(title, dept = null) {
  modalTitle.textContent = title;
  editingId = dept ? dept.id : null;
  deptNameInput.value = dept ? dept.name : '';
  deptTypeSelect.value = dept ? dept.warehouse_type : 'WHS';
  deptModal.classList.add('show');
  deptNameInput.focus();
}

// Hide modal
function hideModal() {
  deptModal.classList.remove('show');
  editingId = null;
  deptNameInput.value = '';
  deptTypeSelect.value = 'WHS';
}

// Add
addDeptBtn.addEventListener('click', () => {
  showModal('Thêm bộ phận');
});

// Edit
function editDept(id) {
  const dept = departments.find(d => d.id === id);
  if (dept) showModal('Sửa bộ phận', dept);
}

// Delete
async function deleteDept(id) {
  const dept = departments.find(d => d.id === id);

  showConfirm(
    'Xóa bộ phận',
    `Bạn có chắc muốn xóa bộ phận "<strong>${dept.name}</strong>"?`,
    async () => {
      try {
        const res = await fetch(`/api/departments/${id}`, { method: 'DELETE' });
        const data = await res.json();

        if (res.ok) {
          showToast('Thành công', data.message, 'success');
          loadDepartments();
        } else {
          showToast('Lỗi', data.error || 'Lỗi khi xóa bộ phận', 'error');
        }
      } catch (err) {
        showToast('Lỗi', 'Lỗi kết nối server', 'error');
      }
    }
  );
}

// Save
saveBtn.addEventListener('click', async () => {
  const name = deptNameInput.value.trim();
  const warehouse_type = deptTypeSelect.value;

  if (!name) {
    showToast('Thiếu thông tin', 'Vui lòng nhập tên bộ phận', 'warning');
    deptNameInput.focus();
    return;
  }

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

  try {
    const url = editingId ? `/api/departments/${editingId}` : '/api/departments';
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, warehouse_type })
    });

    const data = await res.json();

    if (res.ok) {
      showToast('Thành công', data.message, 'success');
      hideModal();
      loadDepartments();
    } else {
      showToast('Lỗi', data.error || 'Lỗi khi lưu bộ phận', 'error');
    }
  } catch (err) {
    showToast('Lỗi', 'Lỗi kết nối server', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Lưu';
  }
});

// Close modal
modalClose.addEventListener('click', hideModal);
cancelBtn.addEventListener('click', hideModal);
deptModal.addEventListener('click', (e) => {
  if (e.target === deptModal) hideModal();
});

// Search & filter
searchInput.addEventListener('input', renderDepartments);
filterType.addEventListener('change', renderDepartments);

// Load initial data
loadDepartments();
