const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: '0134679258q',
  port: 5432,
});

async function exportImeiTables() {
  const client = await pool.connect();
  let sql = '';

  try {
    // Lấy danh sách tất cả bảng có tên bắt đầu bằng "imei"
    const tablesRes = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename LIKE 'imei%'
      ORDER BY tablename
    `);

    const tables = tablesRes.rows.map(r => r.tablename);
    console.log('Tìm thấy các bảng:', tables);

    for (const table of tables) {
      console.log(`Đang export bảng: ${table}`);

      // Lấy câu lệnh tạo bảng (CREATE TABLE)
      const createRes = await client.query(`
        SELECT 'CREATE TABLE IF NOT EXISTS ' || quote_ident(table_name) || ' (' ||
          string_agg(
            quote_ident(column_name) || ' ' ||
            CASE
              WHEN column_default LIKE 'nextval%' AND data_type = 'integer' THEN 'SERIAL'
              WHEN column_default LIKE 'nextval%' AND data_type = 'bigint' THEN 'BIGSERIAL'
              ELSE data_type ||
                CASE WHEN character_maximum_length IS NOT NULL
                  THEN '(' || character_maximum_length || ')'
                  ELSE '' END
            END ||
            CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
            ', ' ORDER BY ordinal_position
          ) || ');' AS create_stmt
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        GROUP BY table_name
      `, [table]);

      if (createRes.rows.length > 0) {
        sql += `\n-- Table: ${table}\n`;
        sql += `DROP TABLE IF EXISTS ${table} CASCADE;\n`;
        sql += createRes.rows[0].create_stmt + '\n';
      }

      // Lấy dữ liệu
      const dataRes = await client.query(`SELECT * FROM ${table}`);

      if (dataRes.rows.length > 0) {
        const columns = Object.keys(dataRes.rows[0]);
        const colList = columns.map(c => `"${c}"`).join(', ');

        for (const row of dataRes.rows) {
          const values = columns.map(col => {
            const val = row[col];
            if (val === null) return 'NULL';
            if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
            if (typeof val === 'number') return val;
            if (val instanceof Date) return `'${val.toISOString()}'`;
            return `'${String(val).replace(/'/g, "''")}'`;
          }).join(', ');

          sql += `INSERT INTO ${table} (${colList}) VALUES (${values});\n`;
        }
      }

      console.log(`  → ${dataRes.rows.length} rows`);
    }

    fs.writeFileSync('imei_backup.sql', sql, 'utf8');
    console.log('\n✅ Export xong! File: imei_backup.sql');

  } catch (err) {
    console.error('Lỗi:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

exportImeiTables();
