const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { syncExpiredDevices } = require('../utils/deviceExpiry');

// POST /api/scan - Unified scan: try IMEI first, then employee_code (for has_barcode=false devices)
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { imei, employee_code, scan_type, input_value, scanned_by, warehouse_id } = req.body;

    // Support unified scan (new) and legacy scan types
    const isUnified = scan_type === 'unified';
    const scanInput = isUnified ? (input_value || '').trim() : null;

    if (isUnified && !scanInput) {
      return res.status(400).json({ error: 'Vui lòng nhập IMEI hoặc mã nhân viên' });
    }
    if (!isUnified && scan_type !== 'employee_code' && !imei) {
      return res.status(400).json({ error: 'IMEI is required' });
    }
    if (!isUnified && scan_type === 'employee_code' && !employee_code) {
      return res.status(400).json({ error: 'Mã nhân viên is required' });
    }
    if (!warehouse_id) {
      return res.status(400).json({ error: 'Vui lòng chọn kho trước khi scan' });
    }

    await client.query('BEGIN');
    await syncExpiredDevices(client);

    let device;
    let trimmedImei;

    if (isUnified) {
      // Step 1: Try to find by IMEI first
      const imeiResult = await client.query(
        `SELECT d.*, dep.name AS department_name
         FROM imei_devices d
         LEFT JOIN imei_department dep ON d.department_id = dep.id
         WHERE d.imei = $1`,
        [scanInput]
      );

      if (imeiResult.rows.length > 0) {
        // Found by IMEI - use it
        device = imeiResult.rows[0];
        trimmedImei = device.imei;
      } else {
        // Step 2: Try to find by employee_code (only devices with has_barcode = false)
        const empResult = await client.query(
          `SELECT d.*, dep.name AS department_name,
                  (d.all_warehouses = TRUE OR EXISTS (
                    SELECT 1 FROM imei_device_warehouses dw
                    WHERE dw.device_id = d.id AND dw.warehouse_id = $2
                  )) AS in_selected_warehouse
           FROM imei_devices d
           LEFT JOIN imei_department dep ON d.department_id = dep.id
           WHERE LOWER(d.employee_code) = LOWER($1) AND d.has_barcode = false
           ORDER BY d.updated_at DESC`,
          [scanInput, warehouse_id]
        );

        if (empResult.rows.length === 0) {
          // Also check if employee_code exists but has_barcode = true
          const barcodeCheck = await client.query(
            `SELECT 1 FROM imei_devices WHERE LOWER(employee_code) = LOWER($1) AND has_barcode = true LIMIT 1`,
            [scanInput]
          );

          await client.query('ROLLBACK');

          if (barcodeCheck.rows.length > 0) {
            return res.status(403).json({
              error: 'Thiết bị này có mã vạch, vui lòng scan IMEI trực tiếp trên thiết bị'
            });
          }

          return res.status(404).json({ error: 'Không tìm thấy thiết bị', input_value: scanInput });
        }

        if (empResult.rows.length > 1) {
          const devicesInWarehouse = empResult.rows.filter(d => d.in_selected_warehouse);
          if (devicesInWarehouse.length === 1) {
            device = devicesInWarehouse[0];
            trimmedImei = device.imei;
          } else {
            await client.query('ROLLBACK');
            const sorted = [
              ...empResult.rows.filter(d => d.in_selected_warehouse),
              ...empResult.rows.filter(d => !d.in_selected_warehouse),
            ];
            return res.json({
              action: 'select_device',
              devices: sorted.map(d => ({
                id: d.id, imei: d.imei, device_type: d.device_type,
                full_name: d.full_name, employee_code: d.employee_code,
                department_name: d.department_name,
                in_selected_warehouse: d.in_selected_warehouse,
              })),
            });
          }
        } else {
          device = empResult.rows[0];
          trimmedImei = device.imei;
        }
      }
    } else if (scan_type === 'employee_code') {
      // Legacy: Look up by employee_code
      const empCode = employee_code.trim();
      const deviceResult = await client.query(
        `SELECT d.*, dep.name AS department_name,
                (d.all_warehouses = TRUE OR EXISTS (
                  SELECT 1 FROM imei_device_warehouses dw
                  WHERE dw.device_id = d.id AND dw.warehouse_id = $2
                )) AS in_selected_warehouse
         FROM imei_devices d
         LEFT JOIN imei_department dep ON d.department_id = dep.id
         WHERE LOWER(d.employee_code) = LOWER($1)
         ORDER BY d.updated_at DESC`,
        [empCode, warehouse_id]
      );

      if (deviceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy thiết bị với mã nhân viên này', employee_code: empCode });
      }

      if (deviceResult.rows.length > 1) {
        const devicesInWarehouse = deviceResult.rows.filter(d => d.in_selected_warehouse);
        if (devicesInWarehouse.length === 1) {
          device = devicesInWarehouse[0];
          trimmedImei = device.imei;
        } else {
          await client.query('ROLLBACK');
          const sorted = [
            ...deviceResult.rows.filter(d => d.in_selected_warehouse),
            ...deviceResult.rows.filter(d => !d.in_selected_warehouse),
          ];
          return res.json({
            action: 'select_device',
            devices: sorted.map(d => ({
              id: d.id, imei: d.imei, device_type: d.device_type,
              full_name: d.full_name, employee_code: d.employee_code,
              department_name: d.department_name,
              in_selected_warehouse: d.in_selected_warehouse,
            })),
          });
        }
      } else {
        device = deviceResult.rows[0];
        trimmedImei = device.imei;
      }
    } else {
      // Legacy: IMEI scan
      trimmedImei = imei.trim();

      const deviceResult = await client.query(
        `SELECT d.*, dep.name AS department_name
         FROM imei_devices d
         LEFT JOIN imei_department dep ON d.department_id = dep.id
         WHERE d.imei = $1`,
        [trimmedImei]
      );

      if (deviceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Device not found', imei: trimmedImei });
      }

      device = deviceResult.rows[0];
    }

    if (device.is_active === false) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'Thiết bị này đã bị khóa',
        imei: trimmedImei,
      });
    }

    // Check if device is registered in the selected warehouse OR has access to all warehouses
    if (!device.all_warehouses) {
      const warehouseCheckResult = await client.query(
        'SELECT 1 FROM imei_device_warehouses WHERE device_id = $1 AND warehouse_id = $2',
        [device.id, warehouse_id]
      );

      if (warehouseCheckResult.rows.length === 0) {
        await client.query('ROLLBACK');
        // Get warehouse name for error message
        const whResult = await client.query('SELECT name FROM imei_warehouses WHERE id = $1', [warehouse_id]);
        const warehouseName = whResult.rows.length > 0 ? whResult.rows[0].name : 'kho này';
        return res.status(403).json({
          error: `Thiết bị này chưa được đăng ký tại ${warehouseName}`,
          imei: trimmedImei,
        });
      }
    }

    // Get warehouse name
    let warehouseName = '';
    const whResult = await client.query('SELECT name FROM imei_warehouses WHERE id = $1', [warehouse_id]);
    if (whResult.rows.length > 0) {
      warehouseName = whResult.rows[0].name;
    }

    // Determine status PER WAREHOUSE from last scan at this warehouse
    const lastScan = await client.query(
      `SELECT action FROM imei_scan_history 
       WHERE device_id = $1 AND warehouse_id = $2 
       ORDER BY scanned_at DESC LIMIT 1`,
      [device.id, warehouse_id]
    );

    // If no previous scan at this warehouse → IN, otherwise toggle
    const lastAction = lastScan.rows.length > 0 ? lastScan.rows[0].action : 'OUT';
    const newStatus = lastAction === 'IN' ? 'OUT' : 'IN';

    // Log scan history with warehouse info
    await client.query(
      `INSERT INTO imei_scan_history (device_id, imei, action, scanned_by, warehouse_id, warehouse_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [device.id, trimmedImei, newStatus, scanned_by?.trim() || '', warehouse_id, warehouseName]
    );

    await client.query('COMMIT');

    res.json({
      message: `${newStatus === 'IN' ? 'Vào kho' : 'Ra kho'} thành công (${warehouseName})`,
      action: newStatus,
      device: { ...device, status: newStatus, warehouse: warehouseName },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/scan/quick-register - Register new device & check IN
router.post('/quick-register', async (req, res) => {
  const client = await pool.connect();
  try {
    const { imei, device_type, employee_code, full_name, email, warehouse, warehouse_id, scanned_by } = req.body;
    if (!imei || !full_name) {
      return res.status(400).json({ error: 'IMEI và Họ tên là bắt buộc' });
    }

    const trimmedImei = imei.trim();
    await client.query('BEGIN');

    // Get warehouse name if warehouse_id provided
    let warehouseName = '';
    if (warehouse_id) {
      const whResult = await client.query('SELECT name FROM imei_warehouses WHERE id = $1', [warehouse_id]);
      if (whResult.rows.length > 0) {
        warehouseName = whResult.rows[0].name;
      }
    }

    // Create device with status IN
    const deviceResult = await client.query(
      `INSERT INTO imei_devices (imei, device_type, employee_code, full_name, email, warehouse, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'IN') RETURNING *`,
      [trimmedImei, device_type?.trim() || '', employee_code?.trim() || '', full_name.trim(), email?.trim() || '', warehouse?.trim() || '']
    );
    const device = deviceResult.rows[0];

    // Log scan history with warehouse info
    await client.query(
      `INSERT INTO imei_scan_history (device_id, imei, action, scanned_by, note, warehouse_id, warehouse_name)
       VALUES ($1, $2, 'IN', $3, $4, $5, $6)`,
      [device.id, trimmedImei, scanned_by?.trim() || '', 'Đăng ký nhanh & Check IN', warehouse_id || null, warehouseName]
    );

    // If warehouse_id provided, also assign device to that warehouse
    if (warehouse_id) {
      await client.query(
        `INSERT INTO imei_device_warehouses (device_id, warehouse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [device.id, warehouse_id]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Đăng ký & Vào kho thành công',
      action: 'IN',
      device,
    });
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

// GET /api/scan/today-stats - Get today's IN/OUT counts for a warehouse
router.get('/today-stats', async (req, res) => {
  try {
    const { warehouse_id } = req.query;
    if (!warehouse_id) {
      return res.json({ in_count: 0, out_count: 0 });
    }

    const result = await pool.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN action = 'IN' THEN 1 ELSE 0 END), 0) as in_count,
        COALESCE(SUM(CASE WHEN action = 'OUT' THEN 1 ELSE 0 END), 0) as out_count
       FROM imei_scan_history
       WHERE warehouse_id = $1
         AND scanned_at >= CURRENT_DATE
         AND scanned_at < CURRENT_DATE + INTERVAL '1 day'`,
      [warehouse_id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
