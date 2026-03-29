const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const XLSX = require('xlsx');
const multer = require('multer');
const path = require('path');

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

// GET /api/devices - List devices with pagination, search and warehouse filter
router.get('/', async (req, res) => {
  try {
    const { search, status, warehouse_id } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

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
    if (status && ['IN', 'OUT'].includes(status)) {
      params.push(status);
      conditions.push(`d.status = $${params.length}`);
    }
    if (warehouse_id && warehouse_id !== 'all') {
      params.push(warehouse_id);
      conditions.push(`(dw.warehouse_id = $${params.length} OR d.all_warehouses = true)`);
    }

    const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

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
      ORDER BY d.updated_at DESC
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

    // Get all existing IMEIs from DB
    const existingImeiResult = await pool.query('SELECT imei FROM imei_devices');
    const existingImeis = new Set(existingImeiResult.rows.map(r => r.imei));

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

      // Duplicate IMEI check in DB
      if (imei && existingImeis.has(imei)) {
        rowErrors.push(`IMEI "${imei}" đã tồn tại trong hệ thống`);
      }

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

    // If any errors, return immediately (no DB insert)
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

    // All validated - insert in transaction
    await client.query('BEGIN');

    for (const d of devices) {
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
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Đã thêm thành công ${devices.length} thiết bị`,
      count: devices.length
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
    const { imei, has_barcode, device_type, employee_code, full_name, email, warehouse_ids, all_warehouses, warehouse_type, department_id } = req.body;

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

    await client.query('BEGIN');

    // Insert device
    const result = await client.query(
      `INSERT INTO imei_devices (imei, has_barcode, device_type, employee_code, full_name, email, all_warehouses, warehouse_type, department_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [imei.trim(), effectiveHasBarcode, device_type?.trim() || '', employee_code?.trim() || '', full_name.trim(), email?.trim() || '', effectiveAllWarehouses, validWarehouseType, effectiveDeptId, createdBy]
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

// PUT /api/devices/:id - Update device
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { imei, has_barcode, device_type, employee_code, full_name, email, warehouse_ids, all_warehouses, warehouse_type, department_id } = req.body;

    // Supervisor không được gán All warehouses
    const isSupervisor = req.session?.role === 'supervisor';
    if (isSupervisor && all_warehouses) {
      return res.status(403).json({ error: 'Supervisor không có quyền gán thiết bị cho tất cả kho' });
    }
    const effectiveAllWarehouses = isSupervisor ? false : (all_warehouses || false);

    const validWarehouseType = warehouse_type && ['WHS', 'SOC'].includes(warehouse_type) ? warehouse_type : null;
    const effectiveDeptId = department_id ? parseInt(department_id) : null;
    const effectiveHasBarcode = has_barcode !== false ? true : false;

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE imei_devices SET imei = $1, has_barcode = $2, device_type = $3, employee_code = $4, full_name = $5, email = $6, all_warehouses = $7, warehouse_type = $8, department_id = $9, updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [imei?.trim(), effectiveHasBarcode, device_type?.trim() || '', employee_code?.trim() || '', full_name?.trim(), email?.trim() || '', effectiveAllWarehouses, validWarehouseType, effectiveDeptId, req.params.id]
    );
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Device not found' });
    }

    // Update warehouse relationships
    await client.query('DELETE FROM imei_device_warehouses WHERE device_id = $1', [req.params.id]);
    
    if (!all_warehouses && warehouse_ids && warehouse_ids.length > 0) {
      for (const warehouseId of warehouse_ids) {
        await client.query(
          'INSERT INTO imei_device_warehouses (device_id, warehouse_id) VALUES ($1, $2)',
          [req.params.id, warehouseId]
        );
      }
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'IMEI đã tồn tại trong hệ thống' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/devices/:id - Delete device
router.delete('/:id', async (req, res) => {
  try {
    console.log("DELETE device - role:", req.session?.role, "userId:", req.session?.userId);
    if (req.session?.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ admin mới có quyền xóa thiết bị' });
    }
    const result = await pool.query('DELETE FROM imei_devices WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json({ message: 'Device deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
