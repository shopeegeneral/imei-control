const { Pool, types } = require('pg');
require('dotenv').config();

types.setTypeParser(1082, (value) => value);
 
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,  // Kill queries after 15s to prevent server hang
});
 
module.exports = pool;
 