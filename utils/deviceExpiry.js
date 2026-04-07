async function getExpirySchemaState(db) {
  const schemaResult = await db.query(`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'imei_devices'
          AND column_name = 'active_until'
      ) AS has_active_until,
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'imei_modify_log'
      ) AS has_modify_log
  `);

  return schemaResult.rows[0] || { has_active_until: false, has_modify_log: false };
}

async function syncExpiredDevices(db) {
  const schemaState = await getExpirySchemaState(db);
  if (!schemaState.has_active_until) {
    return 0;
  }

  const expiredResult = await db.query(`
    WITH expired AS (
      UPDATE imei_devices d
      SET is_active = FALSE,
          updated_at = NOW()
      WHERE d.is_active = TRUE
        AND d.active_until IS NOT NULL
        AND d.active_until < CURRENT_DATE
      RETURNING d.id, d.imei, d.all_warehouses
    )
    SELECT e.id,
           e.imei,
           e.all_warehouses,
           CASE
             WHEN e.all_warehouses THEN 'All'
             ELSE COALESCE((
               SELECT STRING_AGG(DISTINCT w.name, ', ' ORDER BY w.name)
               FROM imei_device_warehouses dw
               INNER JOIN imei_warehouses w ON dw.warehouse_id = w.id
               WHERE dw.device_id = e.id
             ), 'N/A')
           END AS warehouse_name
    FROM expired e
  `);

  if (expiredResult.rows.length === 0) {
    return 0;
  }

  if (!schemaState.has_modify_log) {
    return expiredResult.rows.length;
  }

  for (const row of expiredResult.rows) {
    await db.query(
      `INSERT INTO imei_modify_log (device_id, imei, email, action, warehouse_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.id, row.imei || '', 'system@auto-expiry', 'Deactive', row.warehouse_name || 'N/A']
    );
  }

  return expiredResult.rows.length;
}

module.exports = {
  syncExpiredDevices,
};