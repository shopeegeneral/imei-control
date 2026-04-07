const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const XLSX = require('xlsx');
const multer = require('multer');
const path = require('path');
const { syncExpiredDevices } = require('../utils/deviceExpiry');

// Multer config - store in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file Excel (.xlsx, .xls)'));
    }
  }
});

pool.query(`
  ALTER TABLE imei_devices
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS active_until DATE
`).then(() => {
  return pool.query(`
    ALTER TABLE imei_devices
    ALTER COLUMN created_at SET DEFAULT NOW(),
    ALTER COLUMN updated_at SET DEFAULT NOW(),
    ALTER COLUMN is_active SET DEFAULT TRUE
  `);
}).then(() => {
  return pool.query(`
    UPDATE imei_devices
    SET
      created_at = COALESCE(created_at, updated_at, NOW()),
      updated_at = COALESCE(updated_at, created_at, NOW()),
      is_active = COALESCE(is_active, TRUE)
    WHERE created_at IS NULL OR updated_at IS NULL OR is_active IS NULL
  `);
}).catch((err) => {
  console.error('imei_devices schema sync error:', err.message);
});

pool.query(`
  CREATE TABLE IF NOT EXISTS imei_modify_log (
    id SERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES imei_devices(id) ON DELETE SET NULL,
    imei VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    warehouse_name VARCHAR(255),
    field_name VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).then(() => {
  return pool.query(`
    ALTER TABLE imei_modify_log
    ADD COLUMN IF NOT EXISTS field_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS old_value TEXT,
    ADD COLUMN IF NOT EXISTS new_value TEXT
  `);
}).then(() => {
  return pool.query('CREATE INDEX IF NOT EXISTS idx_imei_modify_log_created_at ON imei_modify_log (created_at DESC)');
}).then(() => {
  return pool.query('CREATE INDEX IF NOT EXISTS idx_imei_modify_log_device_id ON imei_modify_log (device_id)');
}).catch((err) => {
  console.error('imei_modify_log schema sync error:', err.message);
});

function parseWarehouseId(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeActiveUntilDate(value) {
  if (value === undefined || value === null || value === '') {
    return { value: null };
  }

  const normalizedValue = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return { error: 'Thời gian active không hợp lệ' };
  }

  return { value: normalizedValue };
}

function isPastDate(dateValue) {
  return Boolean(dateValue) && dateValue < new Date().toISOString().slice(0, 10);
}

function normalizeTextValue(value, emptyLabel = 'Trống') {
  if (value === undefined || value === null) return emptyLabel;
  const normalized = String(value).trim();
  return normalized === '' ? emptyLabel : normalized;
}

function normalizeBooleanLabel(value) {
  return value === false ? 'No' : 'Yes';
}

function normalizeArrayValues(values) {
  return [...new Set((values || []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizeWarehouseIdList(values) {
  return [...new Set((values || []).map((value) => parseInt(value, 10)).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
}

function getWarehouseDisplayValue(allWarehouses, warehouseNames) {
  if (allWarehouses) return 'All';
  const normalizedNames = normalizeArrayValues(warehouseNames);
  return normalizedNames.length > 0 ? normalizedNames.join(', ') : 'Trống';
}

function createFieldDiff(fieldName, oldValue, newValue) {
  if (oldValue === newValue) return null;
  return {
    action: 'Sửa',
    fieldName,
    oldValue,
    newValue,
  };
}

async function getActorEmail(client, req) {
  if (req.session?.userId) {
    const result = await client.query(
      'SELECT email FROM imei_users WHERE id = $1 LIMIT 1',
      [req.session.userId]
    );

    if (result.rows[0]?.email) {
      return result.rows[0].email;
    }
  }

  return req.session?.username || 'unknown';
}

async function resolveWarehouseName(client, { warehouseId, deviceId, allWarehouses }) {
  if (warehouseId) {
    const warehouseResult = await client.query(
      'SELECT name FROM imei_warehouses WHERE id = $1 LIMIT 1',
      [warehouseId]
    );

    if (warehouseResult.rows[0]?.name) {
      return warehouseResult.rows[0].name;
    }
  }

  if (allWarehouses) {
    return 'All';
  }

  if (deviceId) {
    const warehouseResult = await client.query(
      `SELECT STRING_AGG(DISTINCT w.name, ', ' ORDER BY w.name) AS warehouse_name
       FROM imei_device_warehouses dw
       INNER JOIN imei_warehouses w ON dw.warehouse_id = w.id
       WHERE dw.device_id = $1`,
      [deviceId]
    );

    if (warehouseResult.rows[0]?.warehouse_name) {
      return warehouseResult.rows[0].warehouse_name;
    }
  }

  return 'N/A';
}

async function writeModifyLogs(client, req, entries, { deviceId = null, imei = '', warehouseId = null, allWarehouses = false } = {}) {
  if (!entries || entries.length === 0) {
    return;
  }

  const email = await getActorEmail(client, req);
  const warehouseName = await resolveWarehouseName(client, {
    warehouseId,
    deviceId,
    allWarehouses,
  });

  const values = [];
  const placeholders = entries.map((entry, index) => {
    const offset = index * 8;
    values.push(
      entry.deviceId ?? deviceId,
      entry.imei ?? imei ?? '',
      email,
      entry.action,
      warehouseName,
      entry.fieldName || null,
      entry.oldValue || null,
      entry.newValue || null,
    );

    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`;
  }).join(', ');

  await client.query(
    `INSERT INTO imei_modify_log (device_id, imei, email, action, warehouse_name, field_name, old_value, new_value)
     VALUES ${placeholders}`,
    values
  );
}

async function writeModifyLog(client, req, { deviceId = null, imei = '', action, warehouseId = null, allWarehouses = false, fieldName = null, oldValue = null, newValue = null }) {
  await writeModifyLogs(
    client,
    req,
    [{ action, fieldName, oldValue, newValue }],
    { deviceId, imei, warehouseId, allWarehouses }
  );
}

function buildDeviceFilterQuery(query = {}) {
  const { search, warehouse_id, has_barcode, department_id, created_at } = query;

  const joins = `
      FROM imei_devices d
      LEFT JOIN imei_device_warehouses dw ON d.id = dw.device_id
      LEFT JOIN imei_warehouses w ON dw.warehouse_id = w.id
      LEFT JOIN imei_department dep ON d.department_id = dep.id
      LEFT JOIN imei_users u ON d.created_by = u.id
    `;

  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(d.imei ILIKE $${params.length} OR d.full_name ILIKE $${params.length} OR d.employee_code ILIKE $${params.length})`);
  }
  if (warehouse_id && warehouse_id !== 'all') {
    params.push(warehouse_id);
    conditions.push(`(dw.warehouse_id = $${params.length} OR d.all_warehouses = true)`);
  }
  if (has_barcode && ['yes', 'no'].includes(String(has_barcode).toLowerCase())) {
    params.push(String(has_barcode).toLowerCase() === 'yes');
    conditions.push(`d.has_barcode = $${params.length}`);
  }
  if (department_id) {
    params.push(parseInt(department_id));
    conditions.push(`d.department_id = $${params.length}`);
  }
  if (created_at) {
    params.push(created_at);
    conditions.push(`DATE(d.created_at) = $${params.length}::date`);
  }

  const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

  return { joins, whereClause, params };
}

function buildDeviceOrderQuery(query = {}) {
  const sortColumnMap = {
    imei: 'd.imei',
    has_barcode: 'd.has_barcode',
    is_active: 'd.is_active',
    active_until: 'd.active_until',
    device_type: 'd.device_type',
    employee_code: 'd.employee_code',
    full_name: 'd.full_name',
    email: 'd.email',
    department_name: 'dep.name',
    created_at: 'd.created_at',
    created_by_name: 'u.full_name',
  };

  const sortBy = sortColumnMap[query.sort_by] || null;
  const sortOrder = String(query.sort_order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  if (!sortBy) {
    return 'ORDER BY d.updated_at DESC';
  }

  return `ORDER BY ${sortBy} ${sortOrder} NULLS LAST, d.id DESC`;
}

// GET /api/devices/check - Check device by IMEI or employee_code (all warehouses)
router.get('/check', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: 'Vui lòng nhập IMEI hoặc mã nhân viên' });
    }

    await syncExpiredDevices(pool);

    // Search by IMEI first, then by employee_code
    const result = await pool.query(`
      SELECT d.*,
        dep.name AS department_name,
        d.all_warehouses,
        ARRAY_AGG(DISTINCT jsonb_build_object('id', w.id, 'name', w.name, 'warehouse_type', w.warehouse_type))
          FILTER (WHERE w.id IS NOT NULL) AS warehouses
      FROM imei_devices d
      LEFT JOIN imei_department dep ON d.department_id = dep.id
      LEFT JOIN imei_device_warehouses dw ON d.id = dw.device_id
      LEFT JOIN imei_warehouses w ON dw.warehouse_id = w.id
      WHERE d.imei = $1 OR LOWER(d.employee_code) = LOWER($1)
      GROUP BY d.id, dep.name
      ORDER BY d.updated_at DESC
    `, [q]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy thiết bị' });
    }

    const devices = result.rows.map(row => ({
      id: row.id,
      imei: row.imei,
      device_type: row.device_type,
      employee_code: row.employee_code,
      full_name: row.full_name,
      email: row.email,
      status: row.status,
      is_active: row.is_active,
      active_until: row.active_until,
      has_barcode: row.has_barcode,
      all_warehouses: row.all_warehouses,
      department_name: row.department_name,
      warehouses: row.warehouses || [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    res.json({ devices });
  } catch (err) {
    console.error('Check device error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// GET /api/devices - List devices with pagination, search and warehouse filter
router.get('/', async (req, res) => {
  try {
    await syncExpiredDevices(pool);

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const { joins, whereClause, params } = buildDeviceFilterQuery(req.query);
    const orderClause = buildDeviceOrderQuery(req.query);

    // Count total distinct devices matching filters
    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT d.id) AS total ${joins} ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Data query with pagination
    const dataParams = [...params, limit, offset];
    const dataQuery = `
      SELECT DISTINCT d.*,
        ARRAY_AGG(DISTINCT w.id) as warehouse_ids,
        ARRAY_AGG(DISTINCT w.name) as warehouse_names,
        dep.name AS department_name,
        u.full_name AS created_by_name
      ${joins}
      ${whereClause}
      GROUP BY d.id, dep.name, u.full_name
      ${orderClause}
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `;

    const result = await pool.query(dataQuery, dataParams);

    res.json({
      data: result.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devices/export - Export devices to Excel, respecting current filters
router.get('/export', async (req, res) => {
  try {
    await syncExpiredDevices(pool);

    const { joins, whereClause, params } = buildDeviceFilterQuery(req.query);
    const orderClause = buildDeviceOrderQuery(req.query);
    const result = await pool.query(
      `
      SELECT d.*,
        ARRAY_AGG(DISTINCT w.id) FILTER (WHERE w.id IS NOT NULL) as warehouse_ids,
        ARRAY_AGG(DISTINCT w.name) FILTER (WHERE w.name IS NOT NULL) as warehouse_names,
        dep.name AS department_name,
        u.full_name AS created_by_name
      ${joins}
      ${whereClause}
      GROUP BY d.id, dep.name, u.full_name
      ${orderClause}
      `,
      params
    );

    const rows = result.rows.map((device) => ({
      IMEI: device.imei || '',
      'Co ma vach': device.has_barcode === false ? 'No' : 'Yes',
      'Kich hoat': device.is_active === false ? 'Deactive' : 'Active',
      'Loai thiet bi': device.device_type || '',
      'Ma nhan vien': device.employee_code || '',
      'Ho va ten': device.full_name || '',
      Email: device.email || '',
      'Loai kho': device.warehouse_type || '',
      'Bo phan': device.department_name || '',
      'Kho': device.all_warehouses ? 'All' : (device.warehouse_names || []).filter(Boolean).join(', '),
      'Tao boi': device.created_by_name || '',
      'Ngay tao': device.created_at ? new Date(device.created_at).toLocaleString('vi-VN') : '',
      'Active den ngay': device.active_until || '',
      'Ngay cap nhat': device.updated_at ? new Date(device.updated_at).toLocaleString('vi-VN') : '',
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{
      IMEI: '',
      'Co ma vach': '',
      'Kich hoat': '',
      'Loai thiet bi': '',
      'Ma nhan vien': '',
      'Ho va ten': '',
      Email: '',
      'Loai kho': '',
      'Bo phan': '',
      'Kho': '',
      'Tao boi': '',
      'Ngay tao': '',
      'Active den ngay': '',
      'Ngay cap nhat': '',
    }]);

    worksheet['!cols'] = [
      { wch: 20 },
      { wch: 12 },
      { wch: 12 },
      { wch: 18 },
      { wch: 15 },
      { wch: 28 },
      { wch: 28 },
      { wch: 12 },
      { wch: 20 },
      { wch: 32 },
      { wch: 20 },
      { wch: 22 },
      { wch: 16 },
      { wch: 22 },
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Devices');

    const dateStamp = new Date().toISOString().slice(0, 10);
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=devices_export_${dateStamp}.xlsx`);
    res.send(buffer);
  } catch (err) {
    console.error('Devices export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devices/filter-options - Options for device filters
router.get('/filter-options', async (req, res) => {
  try {
    const { warehouse_id } = req.query;

    let warehouseType = null;
    if (warehouse_id) {
      const warehouseResult = await pool.query(
        'SELECT warehouse_type FROM imei_warehouses WHERE id = $1 LIMIT 1',
        [warehouse_id]
      );
      warehouseType = warehouseResult.rows[0]?.warehouse_type || null;
    }

    const departmentQuery = warehouseType
      ? `
        SELECT id, name, warehouse_type
        FROM imei_department
        WHERE warehouse_type = $1
        ORDER BY warehouse_type, name ASC
      `
      : `
        SELECT id, name, warehouse_type
        FROM imei_department
        ORDER BY warehouse_type, name ASC
      `;

    const departmentsResult = await pool.query(
      departmentQuery,
      warehouseType ? [warehouseType] : []
    );

    res.json({
      departments: departmentsResult.rows,
    });
  } catch (err) {
    console.error('Device filter options error:', err);
    res.status(500).json({ error: 'Lỗi khi tải dữ liệu filter thiết bị' });
  }
});

// GET /api/devices/template - Download Excel template
router.get('/template', async (req, res) => {
  try {
    const role = req.session?.role;
    const warehouseAccess = req.session?.warehouseAccess;
    const isSupervisor = role === 'supervisor';

    // Get accessible warehouses (supervisor sees only allowed warehouses)
    let warehouseRows;
    if (isSupervisor && warehouseAccess && warehouseAccess !== 'all') {
      let allowedIds = [];
      try { allowedIds = typeof warehouseAccess === 'string' ? JSON.parse(warehouseAccess) : warehouseAccess; } catch (e) { allowedIds = []; }
      if (allowedIds.length > 0) {
        const r = await pool.query('SELECT id, name FROM imei_warehouses WHERE id = ANY($1::int[]) ORDER BY name', [allowedIds]);
        warehouseRows = r.rows;
      } else {
        warehouseRows = [];
      }
    } else {
      const r = await pool.query('SELECT id, name FROM imei_warehouses ORDER BY name');
      warehouseRows = r.rows;
    }
    const warehouseNames = warehouseRows.map(r => r.name);

    // Get all departments for instruction sheet
    const deptResult = await pool.query('SELECT name, warehouse_type FROM imei_department ORDER BY warehouse_type, name');
    const deptNames = deptResult.rows.map(d => d.name);

    const wb = XLSX.utils.book_new();

    // Main data sheet — new columns: Loại kho, Bộ phận added
    const headers = ['IMEI', 'Có mã vạch', 'Loại thiết bị', 'Mã nhân viên', 'Email', 'Họ và tên', 'Loại kho', 'Bộ phận', 'Kho'];
    const sampleData = [
      ['123456789012345', 'Yes', 'Phone', 'NV001', 'nguyen@company.com', 'Nguyễn Văn A', 'WHS', 'Inbound', warehouseNames[0] || 'HCM-WH1'],
      ['987654321098765', 'No', 'Tablet', 'NV002', 'tran@company.com', 'Trần Thị B', 'SOC', 'Sort', warehouseNames[0] || 'HCM-WH1'],
      ['111222333444555', 'Yes', 'Phone', 'NV003', 'le@company.com', 'Lê Văn C', 'WHS', 'Inbound', isSupervisor ? (warehouseNames[0] || '') : 'All'],
    ];

    const wsData = [headers, ...sampleData];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 20 }, // IMEI
      { wch: 12 }, // Có mã vạch
      { wch: 15 }, // Loại thiết bị
      { wch: 15 }, // Mã nhân viên
      { wch: 25 }, // Email
      { wch: 25 }, // Họ và tên
      { wch: 12 }, // Loại kho
      { wch: 20 }, // Bộ phận
      { wch: 30 }, // Kho
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');

    // Instructions sheet
    const maxList = Math.max(warehouseNames.length, deptNames.length, 12);
    const instrData = [
      ['HƯỚNG DẪN MASS UPLOAD THIẾT BỊ', '', '', '', 'DANH SÁCH KHO (copy để dùng)', '', 'DANH SÁCH BỘ PHẬN (copy để dùng)'],
      [],
      ['Cột', 'Mô tả', 'Bắt buộc', '', warehouseNames[0] || '', '', deptNames[0] || ''],
      ['IMEI', 'Số IMEI của thiết bị (duy nhất)', 'Có', '', warehouseNames[1] || '', '', deptNames[1] || ''],
      ['Có mã vạch', 'Yes hoặc No (thiết bị có mã vạch IMEI không?)', 'Có', '', warehouseNames[2] || '', '', deptNames[2] || ''],
      ['Loại thiết bị', 'VD: Phone, Tablet, Scanner', 'Có', '', warehouseNames[3] || '', '', deptNames[3] || ''],
      ['Mã nhân viên', 'Mã nhân viên sở hữu thiết bị', 'Có', '', warehouseNames[4] || '', '', deptNames[4] || ''],
      ['Email', 'Email nhân viên', 'Có', '', warehouseNames[5] || '', '', deptNames[5] || ''],
      ['Họ và tên', 'Tên đầy đủ nhân viên', 'Có', '', warehouseNames[6] || '', '', deptNames[6] || ''],
      ['Loại kho', 'WHS hoặc SOC', 'Có', '', warehouseNames[7] || '', '', deptNames[7] || ''],
      ['Bộ phận', 'Tên bộ phận (xem cột G)', 'Có', '', warehouseNames[8] || '', '', deptNames[8] || ''],
      ['Kho', 'Tên kho (xem cột E)', 'Có', '', warehouseNames[9] || '', '', deptNames[9] || ''],
      [],
      ['QUY TẮC CỘT KHO:'],
      [isSupervisor ? '- Chỉ được dùng kho trong danh sách cột E' : '- Nhập "All" để gán thiết bị cho tất cả kho'],
      ['- Nhập tên 1 kho: VD "HCM-WH1"'],
      ['- Nhập nhiều kho, cách nhau bằng dấu phẩy: VD "HCM-WH1, HN-WH2"'],
    ];

    // Fill remaining warehouse & department names
    for (let i = 10; i < Math.max(warehouseNames.length, deptNames.length); i++) {
      const rowIdx = i + 2;
      while (instrData.length <= rowIdx) instrData.push([]);
      const row = instrData[rowIdx];
      while (row.length < 7) row.push('');
      if (i < warehouseNames.length) row[4] = warehouseNames[i];
      if (i < deptNames.length) row[6] = deptNames[i];
    }

    const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
    wsInstr['!cols'] = [{ wch: 20 }, { wch: 40 }, { wch: 12 }, { wch: 3 }, { wch: 30 }, { wch: 3 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Hướng dẫn');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=mass_upload_template.xlsx');
    res.send(buffer);
  } catch (err) {
    console.error('Template download error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devices/mass-modify-template - Download Excel template for mass modify
router.get('/mass-modify-template', async (req, res) => {
  try {
    const workbook = XLSX.utils.book_new();

    const headers = ['IMEI', 'Action'];
    const sampleData = [
      ['123456789012345', 'Active'],
      ['987654321098765', 'Deactive'],
      ['111222333444555', 'Delete'],
    ];

    const sheet = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    sheet['!cols'] = [
      { wch: 22 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Modify');

    const guide = XLSX.utils.aoa_to_sheet([
      ['HUONG DAN MASS MODIFY THIET BI'],
      [],
      ['Cot', 'Mo ta'],
      ['IMEI', 'IMEI cua thiet bi can thay doi'],
      ['Action', 'Chi chap nhan: Active, Deactive, Delete'],
      [],
      ['Luu y'],
      ['- IMEI phai ton tai trong he thong'],
      ['- IMEI phai thuoc kho dang chon hien tai'],
      ['- Delete chi cho phep voi role Admin'],
      ['- Neu file co loi, he thong se khong thuc hien dong nao'],
    ]);
    guide['!cols'] = [{ wch: 20 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(workbook, guide, 'Huong dan');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=mass_modify_template.xlsx');
    res.send(buffer);
  } catch (err) {
    console.error('Mass modify template error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devices/mass-modify - Mass modify devices from Excel
router.post('/mass-modify', upload.single('file'), async (req, res) => {
  const client = await pool.connect();
  try {
    await syncExpiredDevices(client);

    if (!req.file) {
      return res.status(400).json({ error: 'Vui lòng chọn file Excel' });
    }

    const warehouseId = parseInt(req.body.warehouse_id);
    if (!warehouseId) {
      return res.status(400).json({ error: 'Thiếu warehouse_id hiện tại' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (rows.length < 2) {
      return res.status(400).json({ error: 'File không có dữ liệu (cần ít nhất 1 dòng dữ liệu sau header)' });
    }

    const expectedHeaders = ['IMEI', 'Action'];
    const header = rows[0].map((cell) => String(cell).trim());
    const headerMatch = expectedHeaders.every((value, index) => header[index] === value);
    if (!headerMatch) {
      return res.status(400).json({
        error: 'Header không đúng định dạng. Vui lòng tải và sử dụng file mẫu mới nhất.',
        expected: expectedHeaders,
        received: header.slice(0, 2),
      });
    }

    const actions = [];
    const errors = [];
    const fileImeis = new Set();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const rowErrors = [];

      if (row.every((cell) => String(cell).trim() === '')) continue;

      const imei = String(row[0] || '').trim();
      const action = String(row[1] || '').trim();
      const normalizedAction = action.toLowerCase();

      if (!imei) rowErrors.push('IMEI không được để trống');
      if (!action) rowErrors.push('Action không được để trống');
      if (action && !['active', 'deactive', 'delete'].includes(normalizedAction)) {
        rowErrors.push(`Action "${action}" không hợp lệ (chỉ chấp nhận Active, Deactive, Delete)`);
      }
      if (imei && fileImeis.has(imei)) {
        rowErrors.push(`IMEI "${imei}" bị trùng trong file`);
      }
      if (imei) fileImeis.add(imei);

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, errors: rowErrors });
      } else {
        actions.push({ row: rowNum, imei, normalizedAction, rawAction: action });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Dữ liệu có lỗi',
        totalRows: rows.length - 1,
        errorCount: errors.length,
        errors,
      });
    }

    if (actions.length === 0) {
      return res.status(400).json({ error: 'File không có dữ liệu hợp lệ' });
    }

    const imeis = actions.map((item) => item.imei);
    const deviceResult = await client.query(
      `SELECT d.id, d.imei, d.all_warehouses, d.is_active, d.active_until,
              ARRAY_AGG(dw.warehouse_id) FILTER (WHERE dw.warehouse_id IS NOT NULL) AS warehouse_ids
       FROM imei_devices d
       LEFT JOIN imei_device_warehouses dw ON d.id = dw.device_id
       WHERE d.imei = ANY($1::text[])
       GROUP BY d.id`,
      [imeis]
    );

    const deviceMap = new Map(deviceResult.rows.map((device) => [device.imei, device]));

    for (const item of actions) {
      const rowErrors = [];
      const device = deviceMap.get(item.imei);

      if (!device) {
        rowErrors.push(`IMEI "${item.imei}" không tồn tại trong hệ thống`);
      } else {
        const warehouseIds = (device.warehouse_ids || []).map((id) => parseInt(id));
        const inCurrentWarehouse = device.all_warehouses || warehouseIds.includes(warehouseId);

        if (!inCurrentWarehouse) {
          rowErrors.push(`IMEI "${item.imei}" không thuộc kho hiện tại`);
        }

        if (item.normalizedAction === 'active' && isPastDate(device.active_until)) {
          rowErrors.push(`IMEI "${item.imei}" đã hết hạn active, vui lòng cập nhật lại ngày active trước`);
        }

        if (item.normalizedAction === 'delete' && req.session?.role !== 'admin') {
          rowErrors.push('Chỉ Admin mới có quyền Delete thiết bị');
        }
      }

      if (rowErrors.length > 0) {
        errors.push({ row: item.row, errors: rowErrors });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Dữ liệu có lỗi',
        totalRows: rows.length - 1,
        errorCount: errors.length,
        errors,
      });
    }

    await client.query('BEGIN');

    let updatedCount = 0;
    let deletedCount = 0;
    for (const item of actions) {
      const device = deviceMap.get(item.imei);

      if (item.normalizedAction === 'active') {
        await client.query('UPDATE imei_devices SET is_active = TRUE, updated_at = NOW() WHERE id = $1', [device.id]);
        await writeModifyLog(client, req, {
          deviceId: device.id,
          imei: device.imei,
          action: 'Active',
          warehouseId,
          allWarehouses: device.all_warehouses,
        });
        updatedCount += 1;
      } else if (item.normalizedAction === 'deactive') {
        await client.query('UPDATE imei_devices SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [device.id]);
        await writeModifyLog(client, req, {
          deviceId: device.id,
          imei: device.imei,
          action: 'Deactive',
          warehouseId,
          allWarehouses: device.all_warehouses,
        });
        updatedCount += 1;
      } else if (item.normalizedAction === 'delete') {
        await writeModifyLog(client, req, {
          deviceId: device.id,
          imei: device.imei,
          action: 'Xóa',
          warehouseId,
          allWarehouses: device.all_warehouses,
        });
        await client.query('DELETE FROM imei_devices WHERE id = $1', [device.id]);
        deletedCount += 1;
      }
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Mass Modify thành công: ${updatedCount} cập nhật, ${deletedCount} xóa`,
      updatedCount,
      deletedCount,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Mass modify error:', err);
    res.status(500).json({ error: 'Lỗi server: ' + err.message });
  } finally {
    client.release();
  }
});

// POST /api/devices/mass-upload - Mass upload devices from Excel
router.post('/mass-upload', upload.single('file'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Vui lòng chọn file Excel' });
    }

    const isSupervisor = req.session?.role === 'supervisor';
    const createdBy = req.session?.userId || null;

    // Determine supervisor's allowed warehouse IDs
    let supervisorAllowedIds = null; // null = all allowed
    if (isSupervisor) {
      const warehouseAccess = req.session?.warehouseAccess;
      if (!warehouseAccess || warehouseAccess === 'all') {
        supervisorAllowedIds = null; // supervisor with full access
      } else {
        try {
          supervisorAllowedIds = typeof warehouseAccess === 'string' ? JSON.parse(warehouseAccess) : warehouseAccess;
        } catch (e) {
          supervisorAllowedIds = [];
        }
      }
    }

    // Parse Excel
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rows.length < 2) {
      return res.status(400).json({ error: 'File không có dữ liệu (cần ít nhất 1 dòng dữ liệu sau header)' });
    }

    // Validate header
    const expectedHeaders = ['IMEI', 'Có mã vạch', 'Loại thiết bị', 'Mã nhân viên', 'Email', 'Họ và tên', 'Loại kho', 'Bộ phận', 'Kho'];
    const header = rows[0].map(h => String(h).trim());
    const headerMatch = expectedHeaders.every((h, i) => header[i] === h);
    if (!headerMatch) {
      return res.status(400).json({
        error: 'Header không đúng định dạng. Vui lòng tải và sử dụng file mẫu mới nhất.',
        expected: expectedHeaders,
        received: header.slice(0, 9)
      });
    }

    // Get all warehouses from DB
    const warehouseResult = await pool.query('SELECT id, name FROM imei_warehouses');
    const warehouseMap = {}; // name.toLowerCase() -> id
    const warehouseIdToName = {}; // id -> name
    warehouseResult.rows.forEach(w => {
      warehouseMap[w.name.trim().toLowerCase()] = w.id;
      warehouseIdToName[w.id] = w.name;
    });

    // Get all departments from DB
    const deptResult = await pool.query('SELECT id, name, warehouse_type FROM imei_department');
    // dept key: "name|||warehouse_type" (lowercased) -> id
    const deptMap = {};
    // also name-only lookup for when warehouse_type not provided
    const deptNameMap = {}; // name.toLowerCase() -> [{id, warehouse_type}]
    deptResult.rows.forEach(d => {
      const key = `${d.name.trim().toLowerCase()}|||${d.warehouse_type}`;
      deptMap[key] = d.id;
      const nameKey = d.name.trim().toLowerCase();
      if (!deptNameMap[nameKey]) deptNameMap[nameKey] = [];
      deptNameMap[nameKey].push({ id: d.id, warehouse_type: d.warehouse_type });
    });

    // Get all existing IMEIs from DB with full info
    const existingImeiResult = await pool.query(`
      SELECT d.id, d.imei, d.full_name, d.employee_code, d.email, d.device_type,
             d.is_active, d.active_until, d.all_warehouses,
             ARRAY_AGG(DISTINCT w.name) FILTER (WHERE w.name IS NOT NULL) as warehouse_names,
             ARRAY_AGG(DISTINCT dw.warehouse_id) FILTER (WHERE dw.warehouse_id IS NOT NULL) as warehouse_ids
      FROM imei_devices d
      LEFT JOIN imei_device_warehouses dw ON d.id = dw.device_id
      LEFT JOIN imei_warehouses w ON dw.warehouse_id = w.id
      GROUP BY d.id
    `);
    const existingImeis = new Set(existingImeiResult.rows.map(r => r.imei));
    const existingDeviceMap = new Map(existingImeiResult.rows.map(r => [r.imei, r]));

    const confirmExisting = req.body.confirm_existing === 'true' || req.body.confirm_existing === true;

    // Validate each row
    const errors = [];
    const devices = [];
    const fileImeis = new Set();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1; // 1-based, plus header
      const rowErrors = [];

      // Skip completely empty rows
      if (row.every(cell => String(cell).trim() === '')) continue;

      const imei = String(row[0] || '').trim();
      const hasBarcodeStr = String(row[1] || '').trim().toLowerCase();
      const deviceType = String(row[2] || '').trim();
      const employeeCode = String(row[3] || '').trim();
      const email = String(row[4] || '').trim();
      const fullName = String(row[5] || '').trim();
      const warehouseTypeStr = String(row[6] || '').trim().toUpperCase();
      const deptNameStr = String(row[7] || '').trim();
      const warehouseStr = String(row[8] || '').trim();

      // Required field validation
      if (!imei) rowErrors.push('IMEI không được để trống');
      if (!hasBarcodeStr) rowErrors.push('Có mã vạch không được để trống');
      else if (!['yes', 'no'].includes(hasBarcodeStr)) rowErrors.push(`Có mã vạch "${hasBarcodeStr}" không hợp lệ (chỉ chấp nhận Yes hoặc No)`);
      if (!deviceType) rowErrors.push('Loại thiết bị không được để trống');
      if (!employeeCode) rowErrors.push('Mã nhân viên không được để trống');
      if (!email) rowErrors.push('Email không được để trống');
      if (!fullName) rowErrors.push('Họ và tên không được để trống');
      if (!warehouseTypeStr) rowErrors.push('Loại kho không được để trống');
      if (!deptNameStr) rowErrors.push('Bộ phận không được để trống');
      if (!warehouseStr) rowErrors.push('Kho không được để trống');

      const hasBarcode = hasBarcodeStr === 'yes';

      // Warehouse type validation
      let validWarehouseType = null;
      if (warehouseTypeStr) {
        if (!['WHS', 'SOC'].includes(warehouseTypeStr)) {
          rowErrors.push(`Loại kho "${warehouseTypeStr}" không hợp lệ (chỉ chấp nhận WHS hoặc SOC)`);
        } else {
          validWarehouseType = warehouseTypeStr;
        }
      }

      // Department lookup (optional field)
      let deptId = null;
      if (deptNameStr) {
        const deptKey = `${deptNameStr.toLowerCase()}|||${validWarehouseType}`;
        if (validWarehouseType && deptMap[deptKey] !== undefined) {
          deptId = deptMap[deptKey];
        } else if (!validWarehouseType) {
          // No warehouse type — try name-only lookup
          const matches = deptNameMap[deptNameStr.toLowerCase()];
          if (matches && matches.length === 1) {
            deptId = matches[0].id;
          } else if (matches && matches.length > 1) {
            rowErrors.push(`Bộ phận "${deptNameStr}" tồn tại ở nhiều loại kho, vui lòng điền thêm cột Loại kho`);
          } else {
            rowErrors.push(`Bộ phận "${deptNameStr}" không tồn tại`);
          }
        } else {
          rowErrors.push(`Bộ phận "${deptNameStr}" không tồn tại trong loại kho ${validWarehouseType}`);
        }
      }

      // Duplicate IMEI check within file
      if (imei && fileImeis.has(imei)) {
        rowErrors.push(`IMEI "${imei}" bị trùng trong file`);
      }
      if (imei) fileImeis.add(imei);

      // Duplicate IMEI check in DB — handled separately for confirm flow
      // (moved to after validation loop)

      // Warehouse validation
      let allWarehousesFlag = false;
      let warehouseIds = [];

      if (warehouseStr) {
        if (warehouseStr.toLowerCase() === 'all') {
          // Supervisor cannot use All
          if (isSupervisor) {
            rowErrors.push('Supervisor không được phép gán thiết bị cho tất cả kho');
          } else {
            allWarehousesFlag = true;
          }
        } else {
          const inputWarehouseNames = warehouseStr.split(',').map(s => s.trim()).filter(s => s);
          for (const wName of inputWarehouseNames) {
            const wId = warehouseMap[wName.toLowerCase()];
            if (!wId) {
              rowErrors.push(`Kho "${wName}" không tồn tại`);
            } else {
              // Supervisor access check
              if (isSupervisor && supervisorAllowedIds !== null && !supervisorAllowedIds.includes(wId) && !supervisorAllowedIds.includes(String(wId))) {
                rowErrors.push(`Supervisor không có quyền truy cập kho "${wName}"`);
              } else {
                warehouseIds.push(wId);
              }
            }
          }
        }
      }

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, errors: rowErrors });
      } else {
        devices.push({
          imei, hasBarcode, deviceType, employeeCode, email, fullName,
          validWarehouseType, deptId,
          allWarehousesFlag, warehouseIds
        });
      }
    }

    // If any validation errors, return immediately (no DB insert)
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Dữ liệu có lỗi',
        totalRows: rows.length - 1,
        errorCount: errors.length,
        errors
      });
    }

    if (devices.length === 0) {
      return res.status(400).json({ error: 'File không có dữ liệu hợp lệ' });
    }

    // Separate new devices from existing ones
    const newDevices = [];
    const existingToAddWarehouse = [];
    const skippedDevices = [];

    for (const d of devices) {
      if (existingImeis.has(d.imei)) {
        const existingDevice = existingDeviceMap.get(d.imei);
        if (existingDevice.all_warehouses) {
          skippedDevices.push({
            imei: d.imei,
            full_name: existingDevice.full_name,
            reason: 'Thiết bị đã có quyền truy cập tất cả kho',
          });
        } else {
          // Check which warehouses need to be added
          const currentWIds = (existingDevice.warehouse_ids || []).map(id => parseInt(id));
          const newWIds = d.warehouseIds.filter(wId => !currentWIds.includes(wId));
          if (newWIds.length === 0 && !d.allWarehousesFlag) {
            skippedDevices.push({
              imei: d.imei,
              full_name: existingDevice.full_name,
              reason: 'Thiết bị đã có trong tất cả kho được chọn',
            });
          } else {
            existingToAddWarehouse.push({
              ...d,
              existingDeviceId: existingDevice.id,
              existingDevice,
              newWarehouseIds: newWIds,
            });
          }
        }
      } else {
        newDevices.push(d);
      }
    }

    // If there are existing devices and user hasn't confirmed yet
    if (existingToAddWarehouse.length > 0 && !confirmExisting) {
      return res.status(409).json({
        error: 'Một số IMEI đã tồn tại trong hệ thống',
        needs_confirmation: true,
        new_count: newDevices.length,
        existing_devices: existingToAddWarehouse.map(d => ({
          imei: d.imei,
          full_name: d.existingDevice.full_name,
          employee_code: d.existingDevice.employee_code,
          device_type: d.existingDevice.device_type,
          is_active: d.existingDevice.is_active,
          warehouse_names: (d.existingDevice.warehouse_names || []).filter(Boolean),
          all_warehouses: d.existingDevice.all_warehouses,
        })),
        skipped_devices: skippedDevices,
      });
    }

    // All validated - insert in transaction
    await client.query('BEGIN');

    let createdCount = 0;
    let addedWarehouseCount = 0;

    // Create new devices
    for (const d of newDevices) {
      const insertResult = await client.query(
        `INSERT INTO imei_devices (imei, has_barcode, device_type, employee_code, full_name, email, all_warehouses, warehouse_type, department_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [d.imei, d.hasBarcode, d.deviceType, d.employeeCode, d.fullName, d.email, d.allWarehousesFlag, d.validWarehouseType, d.deptId, createdBy]
      );

      const deviceId = insertResult.rows[0].id;

      if (!d.allWarehousesFlag && d.warehouseIds.length > 0) {
        for (const wId of d.warehouseIds) {
          await client.query(
            'INSERT INTO imei_device_warehouses (device_id, warehouse_id) VALUES ($1, $2)',
            [deviceId, wId]
          );
        }
      }
      createdCount++;
    }

    // Add warehouse access for existing devices (only if confirmed)
    if (confirmExisting) {
      for (const d of existingToAddWarehouse) {
        for (const wId of d.newWarehouseIds) {
          await client.query(
            'INSERT INTO imei_device_warehouses (device_id, warehouse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [d.existingDeviceId, wId]
          );
        }
        await client.query('UPDATE imei_devices SET updated_at = NOW() WHERE id = $1', [d.existingDeviceId]);

        // Audit log
        const addedNames = [];
        for (const wId of d.newWarehouseIds) {
          const nameResult = await client.query('SELECT name FROM imei_warehouses WHERE id = $1', [wId]);
          if (nameResult.rows[0]) addedNames.push(nameResult.rows[0].name);
        }
        if (addedNames.length > 0) {
          await writeModifyLog(client, req, {
            deviceId: d.existingDeviceId,
            imei: d.imei,
            action: 'Sửa',
            fieldName: 'Thêm kho (Mass Upload)',
            oldValue: 'Trống',
            newValue: addedNames.join(', '),
          });
        }
        addedWarehouseCount++;
      }
    }

    await client.query('COMMIT');

    const messages = [];
    if (createdCount > 0) messages.push(`${createdCount} thiết bị mới`);
    if (addedWarehouseCount > 0) messages.push(`${addedWarehouseCount} thiết bị thêm kho`);
    if (skippedDevices.length > 0) messages.push(`${skippedDevices.length} bỏ qua`);

    res.json({
      success: true,
      message: `Thành công: ${messages.join(', ')}`,
      createdCount,
      addedWarehouseCount,
      skippedCount: skippedDevices.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Mass upload error:', err);
    res.status(500).json({ error: 'Lỗi server: ' + err.message });
  } finally {
    client.release();
  }
});

// GET /api/devices/:id - Get single device
router.get('/:id', async (req, res) => {
  try {
    await syncExpiredDevices(pool);

    const result = await pool.query(`
      SELECT d.*,
        ARRAY_AGG(w.id) FILTER (WHERE w.id IS NOT NULL) as warehouse_ids,
        ARRAY_AGG(w.name) FILTER (WHERE w.name IS NOT NULL) as warehouse_names,
        dep.name AS department_name,
        u.full_name AS created_by_name
      FROM imei_devices d
      LEFT JOIN imei_device_warehouses dw ON d.id = dw.device_id
      LEFT JOIN imei_warehouses w ON dw.warehouse_id = w.id
      LEFT JOIN imei_department dep ON d.department_id = dep.id
      LEFT JOIN imei_users u ON d.created_by = u.id
      WHERE d.id = $1
      GROUP BY d.id, dep.name, u.full_name
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devices - Create device
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { imei, has_barcode, device_type, employee_code, full_name, email, warehouse_ids, all_warehouses, warehouse_type, department_id, active_until } = req.body;
    const normalizedActiveUntil = normalizeActiveUntilDate(active_until);

    if (normalizedActiveUntil.error) {
      return res.status(400).json({ error: normalizedActiveUntil.error });
    }
    if (isPastDate(normalizedActiveUntil.value)) {
      return res.status(400).json({ error: 'Thời gian active không được nhỏ hơn ngày hiện tại' });
    }

    // Validate all required fields
    const missing = [];
    if (!imei) missing.push('IMEI');
    if (!device_type) missing.push('Loại thiết bị');
    if (!employee_code) missing.push('Mã nhân viên');
    if (!full_name) missing.push('Họ và tên');
    if (!email) missing.push('Email');
    if (!warehouse_type) missing.push('Loại kho');
    if (!department_id) missing.push('Bộ phận');
    if (!all_warehouses && (!warehouse_ids || warehouse_ids.length === 0)) missing.push('Kho làm việc');

    if (missing.length > 0) {
      return res.status(400).json({ error: `Vui lòng điền đầy đủ: ${missing.join(', ')}` });
    }

    // Supervisor không được gán All warehouses
    const isSupervisor = req.session?.role === 'supervisor';
    const effectiveAllWarehouses = isSupervisor ? false : (all_warehouses || false);
    if (isSupervisor && all_warehouses) {
      return res.status(403).json({ error: 'Supervisor không có quyền gán thiết bị cho tất cả kho' });
    }

    const validWarehouseType = warehouse_type && ['WHS', 'SOC'].includes(warehouse_type) ? warehouse_type : null;
    const effectiveDeptId = department_id ? parseInt(department_id) : null;
    const effectiveHasBarcode = has_barcode !== false ? true : false;
    const createdBy = req.session?.userId || null;

    // Check if IMEI already exists BEFORE insert
    const trimmedImei = imei.trim();
    const existingCheck = await client.query(`
      SELECT d.*,
        ARRAY_AGG(DISTINCT w.id) FILTER (WHERE w.id IS NOT NULL) as warehouse_ids,
        ARRAY_AGG(DISTINCT w.name) FILTER (WHERE w.name IS NOT NULL) as warehouse_names,
        dep.name AS department_name
      FROM imei_devices d
      LEFT JOIN imei_device_warehouses dw ON d.id = dw.device_id
      LEFT JOIN imei_warehouses w ON dw.warehouse_id = w.id
      LEFT JOIN imei_department dep ON d.department_id = dep.id
      WHERE d.imei = $1
      GROUP BY d.id, dep.name
    `, [trimmedImei]);

    if (existingCheck.rows.length > 0) {
      const existing = existingCheck.rows[0];
      return res.status(409).json({
        error: 'IMEI đã tồn tại trong hệ thống',
        existing_device: {
          id: existing.id,
          imei: existing.imei,
          full_name: existing.full_name,
          employee_code: existing.employee_code,
          email: existing.email,
          device_type: existing.device_type,
          has_barcode: existing.has_barcode,
          is_active: existing.is_active,
          active_until: existing.active_until,
          department_name: existing.department_name,
          warehouse_type: existing.warehouse_type,
          warehouse_ids: existing.warehouse_ids || [],
          warehouse_names: (existing.warehouse_names || []).filter(Boolean),
          all_warehouses: existing.all_warehouses,
        },
      });
    }

    await client.query('BEGIN');

    // Insert device
    const result = await client.query(
      `INSERT INTO imei_devices (imei, has_barcode, device_type, employee_code, full_name, email, all_warehouses, warehouse_type, department_id, created_by, active_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [trimmedImei, effectiveHasBarcode, device_type?.trim() || '', employee_code?.trim() || '', full_name.trim(), email?.trim() || '', effectiveAllWarehouses, validWarehouseType, effectiveDeptId, createdBy, normalizedActiveUntil.value]
    );

    const device = result.rows[0];

    // Insert warehouse relationships only if not all_warehouses
    if (!all_warehouses && warehouse_ids && warehouse_ids.length > 0) {
      for (const warehouseId of warehouse_ids) {
        await client.query(
          'INSERT INTO imei_device_warehouses (device_id, warehouse_id) VALUES ($1, $2)',
          [device.id, warehouseId]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(device);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'IMEI đã tồn tại trong hệ thống' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/devices/:id/add-warehouse - Add warehouse access to existing device
router.post('/:id/add-warehouse', async (req, res) => {
  const client = await pool.connect();
  try {
    const deviceId = parseInt(req.params.id, 10);
    const { warehouse_ids } = req.body;

    if (!deviceId || !Number.isInteger(deviceId)) {
      return res.status(400).json({ error: 'Device ID không hợp lệ' });
    }
    if (!warehouse_ids || !Array.isArray(warehouse_ids) || warehouse_ids.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn ít nhất 1 kho' });
    }

    const isSupervisor = req.session?.role === 'supervisor';

    // Check device exists
    const deviceResult = await client.query(`
      SELECT d.*,
        ARRAY_AGG(DISTINCT dw.warehouse_id) FILTER (WHERE dw.warehouse_id IS NOT NULL) AS current_warehouse_ids
      FROM imei_devices d
      LEFT JOIN imei_device_warehouses dw ON d.id = dw.device_id
      WHERE d.id = $1
      GROUP BY d.id
    `, [deviceId]);

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thiết bị không tồn tại' });
    }

    const device = deviceResult.rows[0];

    // Check if device has all_warehouses access
    if (device.all_warehouses) {
      return res.status(400).json({ error: 'Thiết bị đã được cấp quyền truy cập tất cả kho' });
    }

    // Supervisor permission check
    if (isSupervisor) {
      const warehouseAccess = req.session?.warehouseAccess;
      if (warehouseAccess && warehouseAccess !== 'all') {
        let allowedIds = [];
        try { allowedIds = typeof warehouseAccess === 'string' ? JSON.parse(warehouseAccess) : warehouseAccess; } catch (e) { allowedIds = []; }
        for (const wId of warehouse_ids) {
          if (!allowedIds.includes(wId) && !allowedIds.includes(String(wId))) {
            return res.status(403).json({ error: 'Supervisor không có quyền truy cập kho được chọn' });
          }
        }
      }
    }

    const currentWarehouseIds = (device.current_warehouse_ids || []).map(id => parseInt(id));
    const newWarehouseIds = warehouse_ids.filter(wId => !currentWarehouseIds.includes(parseInt(wId)));

    if (newWarehouseIds.length === 0) {
      return res.status(400).json({ error: 'Thiết bị đã có trong tất cả kho được chọn' });
    }

    // Validate warehouse IDs exist
    const warehouseCheck = await client.query(
      'SELECT id, name FROM imei_warehouses WHERE id = ANY($1::int[])',
      [newWarehouseIds]
    );
    if (warehouseCheck.rows.length !== newWarehouseIds.length) {
      return res.status(400).json({ error: 'Một số kho không tồn tại' });
    }

    await client.query('BEGIN');

    // Insert new warehouse relationships
    for (const wId of newWarehouseIds) {
      await client.query(
        'INSERT INTO imei_device_warehouses (device_id, warehouse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [deviceId, wId]
      );
    }

    // Update device updated_at
    await client.query('UPDATE imei_devices SET updated_at = NOW() WHERE id = $1', [deviceId]);

    // Write audit log
    const addedWarehouseNames = warehouseCheck.rows.map(w => w.name).sort();
    await writeModifyLog(client, req, {
      deviceId,
      imei: device.imei,
      action: 'Sửa',
      fieldName: 'Thêm kho',
      oldValue: 'Trống',
      newValue: addedWarehouseNames.join(', '),
    });

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Đã thêm thiết bị vào ${addedWarehouseNames.join(', ')}`,
      added_warehouses: addedWarehouseNames,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Add warehouse error:', err);
    res.status(500).json({ error: 'Lỗi server: ' + err.message });
  } finally {
    client.release();
  }
});

// PUT /api/devices/:id - Update device
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { imei, has_barcode, device_type, employee_code, full_name, email, warehouse_ids, all_warehouses, warehouse_type, department_id, audit_warehouse_id, active_until } = req.body;
    const auditWarehouseId = parseWarehouseId(audit_warehouse_id);
    const normalizedActiveUntil = normalizeActiveUntilDate(active_until);

    if (normalizedActiveUntil.error) {
      return res.status(400).json({ error: normalizedActiveUntil.error });
    }
    if (isPastDate(normalizedActiveUntil.value)) {
      return res.status(400).json({ error: 'Thời gian active không được nhỏ hơn ngày hiện tại' });
    }

    // Supervisor không được gán All warehouses
    const isSupervisor = req.session?.role === 'supervisor';
    if (isSupervisor && all_warehouses) {
      return res.status(403).json({ error: 'Supervisor không có quyền gán thiết bị cho tất cả kho' });
    }
    const effectiveAllWarehouses = isSupervisor ? false : (all_warehouses || false);

    const validWarehouseType = warehouse_type && ['WHS', 'SOC'].includes(warehouse_type) ? warehouse_type : null;
    const effectiveDeptId = department_id ? parseInt(department_id) : null;
    const effectiveHasBarcode = has_barcode !== false ? true : false;
    const nextWarehouseIds = normalizeWarehouseIdList(effectiveAllWarehouses ? [] : warehouse_ids);

    await client.query('BEGIN');

    const existingDeviceResult = await client.query(`
      SELECT d.id,
             d.imei,
             d.has_barcode,
             d.device_type,
             d.employee_code,
             d.full_name,
             d.email,
             d.all_warehouses,
             d.warehouse_type,
             d.department_id,
             d.active_until,
             dep.name AS department_name,
             ARRAY_AGG(DISTINCT dw.warehouse_id) FILTER (WHERE dw.warehouse_id IS NOT NULL) AS warehouse_ids,
             ARRAY_AGG(DISTINCT w.name) FILTER (WHERE w.name IS NOT NULL) AS warehouse_names
      FROM imei_devices d
      LEFT JOIN imei_device_warehouses dw ON d.id = dw.device_id
      LEFT JOIN imei_warehouses w ON dw.warehouse_id = w.id
      LEFT JOIN imei_department dep ON d.department_id = dep.id
      WHERE d.id = $1
      GROUP BY d.id, dep.name
    `, [req.params.id]);
    if (existingDeviceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Device not found' });
    }

    const existingDevice = existingDeviceResult.rows[0];
    if (imei && imei.trim() !== existingDevice.imei) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Không được phép chỉnh sửa IMEI của thiết bị' });
    }

    const result = await client.query(
      `UPDATE imei_devices SET has_barcode = $1, device_type = $2, employee_code = $3, full_name = $4, email = $5, all_warehouses = $6, warehouse_type = $7, department_id = $8, active_until = $9, updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [effectiveHasBarcode, device_type?.trim() || '', employee_code?.trim() || '', full_name?.trim(), email?.trim() || '', effectiveAllWarehouses, validWarehouseType, effectiveDeptId, normalizedActiveUntil.value, req.params.id]
    );
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Device not found' });
    }

    let nextDepartmentName = null;
    if (effectiveDeptId) {
      const departmentResult = await client.query(
        'SELECT name FROM imei_department WHERE id = $1 LIMIT 1',
        [effectiveDeptId]
      );
      nextDepartmentName = departmentResult.rows[0]?.name || null;
    }

    let nextWarehouseNames = [];
    if (!effectiveAllWarehouses && nextWarehouseIds.length > 0) {
      const warehouseResult = await client.query(
        'SELECT name FROM imei_warehouses WHERE id = ANY($1::int[]) ORDER BY name',
        [nextWarehouseIds]
      );
      nextWarehouseNames = warehouseResult.rows.map((row) => row.name);
    }

    // Update warehouse relationships
    await client.query('DELETE FROM imei_device_warehouses WHERE device_id = $1', [req.params.id]);
    
    if (!effectiveAllWarehouses && nextWarehouseIds.length > 0) {
      for (const warehouseId of nextWarehouseIds) {
        await client.query(
          'INSERT INTO imei_device_warehouses (device_id, warehouse_id) VALUES ($1, $2)',
          [req.params.id, warehouseId]
        );
      }
    }

    const existingWarehouseNames = normalizeArrayValues(existingDevice.warehouse_names);
    const existingWarehouseDisplay = getWarehouseDisplayValue(existingDevice.all_warehouses, existingWarehouseNames);
    const nextWarehouseDisplay = getWarehouseDisplayValue(effectiveAllWarehouses, nextWarehouseNames);
    const editLogs = [
      createFieldDiff('Có mã vạch', normalizeBooleanLabel(existingDevice.has_barcode), normalizeBooleanLabel(effectiveHasBarcode)),
      createFieldDiff('Loại thiết bị', normalizeTextValue(existingDevice.device_type), normalizeTextValue(device_type)),
      createFieldDiff('Mã nhân viên', normalizeTextValue(existingDevice.employee_code), normalizeTextValue(employee_code)),
      createFieldDiff('Họ và tên', normalizeTextValue(existingDevice.full_name), normalizeTextValue(full_name)),
      createFieldDiff('Email', normalizeTextValue(existingDevice.email), normalizeTextValue(email)),
      createFieldDiff('Loại kho', normalizeTextValue(existingDevice.warehouse_type), normalizeTextValue(validWarehouseType)),
      createFieldDiff('Bộ phận', normalizeTextValue(existingDevice.department_name), normalizeTextValue(nextDepartmentName)),
      createFieldDiff('Active đến ngày', existingDevice.active_until || 'Vĩnh viễn', normalizedActiveUntil.value || 'Vĩnh viễn'),
      createFieldDiff('Kho làm việc', existingWarehouseDisplay, nextWarehouseDisplay),
    ].filter(Boolean);

    if (!existingDevice.all_warehouses && !effectiveAllWarehouses) {
      const existingWarehouseSet = new Set(existingWarehouseNames);
      const nextWarehouseNameList = normalizeArrayValues(nextWarehouseNames);
      const nextWarehouseSet = new Set(nextWarehouseNameList);
      const addedWarehouses = nextWarehouseNameList.filter((name) => !existingWarehouseSet.has(name));
      const removedWarehouses = existingWarehouseNames.filter((name) => !nextWarehouseSet.has(name));

      if (addedWarehouses.length > 0) {
        editLogs.push({
          action: 'Sửa',
          fieldName: 'Kho thêm',
          oldValue: 'Trống',
          newValue: addedWarehouses.join(', '),
        });
      }

      if (removedWarehouses.length > 0) {
        editLogs.push({
          action: 'Sửa',
          fieldName: 'Kho bỏ',
          oldValue: removedWarehouses.join(', '),
          newValue: 'Trống',
        });
      }
    }

    await writeModifyLogs(client, req, editLogs, {
      deviceId: parseInt(req.params.id, 10),
      imei: existingDevice.imei,
      warehouseId: auditWarehouseId,
      allWarehouses: effectiveAllWarehouses,
    });

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'IMEI đã tồn tại trong hệ thống' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/devices/:id/active - Toggle device active/deactive
router.patch('/:id/active', async (req, res) => {
  const client = await pool.connect();
  try {
    await syncExpiredDevices(client);

    const { is_active, audit_warehouse_id } = req.body;
    const auditWarehouseId = parseWarehouseId(audit_warehouse_id);

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active phải là true hoặc false' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE imei_devices
       SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Device not found' });
    }

    if (is_active && isPastDate(result.rows[0].active_until)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Thiết bị đã hết hạn active, vui lòng cập nhật lại ngày active trước khi kích hoạt' });
    }

    await writeModifyLog(client, req, {
      deviceId: result.rows[0].id,
      imei: result.rows[0].imei,
      action: is_active ? 'Active' : 'Deactive',
      warehouseId: auditWarehouseId,
      allWarehouses: result.rows[0].all_warehouses,
    });

    await client.query('COMMIT');

    res.json({
      message: is_active ? 'Kích hoạt thiết bị thành công' : 'Khóa thiết bị thành công',
      device: result.rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/devices/:id - Delete device
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    console.log("DELETE device - role:", req.session?.role, "userId:", req.session?.userId);
    if (req.session?.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ admin mới có quyền xóa thiết bị' });
    }

    const auditWarehouseId = parseWarehouseId(req.body?.audit_warehouse_id);

    await client.query('BEGIN');

    const existingResult = await client.query(
      'SELECT id, imei, all_warehouses FROM imei_devices WHERE id = $1',
      [req.params.id]
    );

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Device not found' });
    }

    const existingDevice = existingResult.rows[0];

    await writeModifyLog(client, req, {
      deviceId: existingDevice.id,
      imei: existingDevice.imei,
      action: 'Xóa',
      warehouseId: auditWarehouseId,
      allWarehouses: existingDevice.all_warehouses,
    });

    const result = await client.query('DELETE FROM imei_devices WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Device not found' });
    }

    await client.query('COMMIT');
    res.json({ message: 'Device deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
