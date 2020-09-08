const { createPool } = require("mysql");

const pool = createPool({
  host: 'localhost',
  port: 3306,
  user: 'sunil',
  password: 'P@ssw0rd#222',
  database: 'my_project',
  connectionLimit: 10
});

module.exports = pool;
