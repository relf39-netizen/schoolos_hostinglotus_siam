const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Simple UUID-like generator to avoid ESM issues with 'uuid' package on some servers
const v4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
const uuidv4 = v4;

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// BigInt serialization support for JSON
BigInt.prototype.toJSON = function() { return this.toString() };

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'schoolos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
  socketPath: process.env.MYSQL_SOCKET || undefined
});

// Test connection immediately
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL Database connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL Connection Failed:', err.message);
  });

// Helper to handle JSON columns
const parseJsonFields = (row, fields) => {
  if (!row) return row;
  const newRow = { ...row };
  fields.forEach(field => {
    if (newRow[field] && typeof newRow[field] === 'string') {
      try {
        newRow[field] = JSON.parse(newRow[field]);
      } catch (e) {}
    }
  });
  return newRow;
};

// --- API Endpoints ---

// DATA SYNC (Base64 fallback for strict firewalls)
app.post(['/api/data-sync', '/api/v1/data-sync', '/api/bridge', '/api/v1/bridge'], async (req, res) => {
  console.log(`[Data Sync API] Incoming request from ${req.ip}`);
  try {
    // Support multiple parameter names to bypass specific WAF filters
    const payload = req.body.d || req.body.p || req.body.data || req.body.payload;
    
    if (!payload) {
      return res.status(400).json({ error: 'Missing payload' });
    }

    let decodedString;
    try {
      decodedString = Buffer.from(payload, 'base64').toString('utf-8');
    } catch (e) {
      return res.status(400).json({ error: 'Invalid base64 payload' });
    }

    let parsed;
    try {
      parsed = JSON.parse(decodedString);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON in payload' });
    }

    const { action, table, data, id, pk = 'id', onConflict, filters } = parsed;
    console.log(`[Data Sync API] ${action.toUpperCase()} on ${table}`, { id, pk });
    
    if (action === 'upsert') {
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const keys = Object.keys(item);
        const values = Object.values(item).map(v => (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `?? = VALUES(??)`).join(', ');
        const updateParams = keys.flatMap(k => [k, k]);
        const sql = `INSERT INTO ?? (??) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
        await pool.query(sql, [table, keys, ...values, ...updateParams]);
      }
      return res.json({ success: true });
    }

    if (action === 'insert') {
      const [result] = await pool.query(`INSERT INTO ?? SET ?`, [table, data]);
      return res.json({ success: true, data: { id: result.insertId || data.id } });
    }

    if (action === 'update') {
      if (id) {
        await pool.query(`UPDATE ?? SET ? WHERE ?? = ?`, [table, data, pk, id]);
      } else if (filters) {
        const whereClauses = Object.keys(filters).map(k => `?? = ?`);
        const whereParams = Object.entries(filters).flatMap(([k, v]) => [k, v]);
        const sql = `UPDATE ?? SET ? WHERE ${whereClauses.join(' AND ')}`;
        await pool.query(sql, [table, data, ...whereParams]);
      } else {
        return res.status(400).json({ error: 'Missing ID or filters for update' });
      }
      return res.json({ success: true });
    }

    if (action === 'delete') {
      if (id) {
        await pool.query(`DELETE FROM ?? WHERE ?? = ?`, [table, pk, id]);
      } else if (filters) {
        const whereClauses = Object.keys(filters).map(k => `?? = ?`);
        const whereParams = Object.entries(filters).flatMap(([k, v]) => [k, v]);
        const sql = `DELETE FROM ?? WHERE ${whereClauses.join(' AND ')}`;
        await pool.query(sql, [table, ...whereParams]);
      } else {
        return res.status(400).json({ error: 'Missing ID or filters for delete' });
      }
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error(`[Data Sync API Error]`, error);
    return res.status(500).json({ error: error.message });
  }
});

// GAS Bridge Endpoint
app.post('/api/gas/bridge', async (req, res) => {
  const { secret, action, table, data, id } = req.body;
  const serverSecret = process.env.GAS_SECRET_KEY;

  if (!serverSecret || secret !== serverSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    if (action === 'insert') {
      const [result] = await pool.query(`INSERT INTO ?? SET ?`, [table, data]);
      return res.json({ success: true, id: result.insertId || data.id });
    } 
    if (action === 'update') {
      await pool.query(`UPDATE ?? SET ? WHERE id = ?`, [table, data, id]);
      return res.json({ success: true });
    }
    if (action === 'upsert') {
      const keys = Object.keys(data);
      const values = Object.values(data).map(v => (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v);
      const placeholders = keys.map(() => '?').join(', ');
      const updateClause = keys.map(k => `?? = VALUES(??)`).join(', ');
      const updateParams = keys.flatMap(k => [k, k]);
      const sql = `INSERT INTO ?? (??) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
      await pool.query(sql, [table, keys, ...values, ...updateParams]);
      return res.json({ success: true });
    }
    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// DATA TRANSFER
app.post('/api/v1/transfer/:table', async (req, res) => {
  const { table } = req.params;
  try {
    let items = [];
    if (req.body.encodedData) {
      const decodedString = Buffer.from(req.body.encodedData, 'base64').toString('utf-8');
      items = JSON.parse(decodedString);
    } else {
      items = Array.isArray(req.body) ? req.body : [req.body];
    }
    
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const item of items) {
        const keys = Object.keys(item);
        if (keys.length === 0) continue;
        const values = Object.values(item).map(v => (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `?? = VALUES(??)`).join(', ');
        const updateParams = keys.flatMap(k => [k, k]);
        const sql = `INSERT INTO ?? (??) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
        await connection.query(sql, [table, keys, ...values, ...updateParams]);
      }
      await connection.commit();
      res.json({ success: true });
    } catch (err) {
      await connection.rollback();
      res.status(500).json({ error: err.message });
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// MAINTENANCE: Fix Database Schema
app.post('/api/maintenance/fix-schema', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    try {
      const schoolsAlter = [
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS wfh_mode_enabled BOOLEAN DEFAULT FALSE",
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS auto_check_out_enabled BOOLEAN DEFAULT FALSE",
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS auto_check_out_time VARCHAR(10) DEFAULT '16:30'",
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS late_time_threshold VARCHAR(10) DEFAULT '08:30'",
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS outgoing_book_prefix VARCHAR(50)",
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE"
      ];
      for (const sql of schoolsAlter) { try { await connection.query(sql); } catch (e) {} }

      const configsAlter = [
        "ALTER TABLE school_configs ADD COLUMN IF NOT EXISTS official_garuda_base_64 LONGTEXT",
        "ALTER TABLE school_configs ADD COLUMN IF NOT EXISTS director_signature_base_64 LONGTEXT",
        "ALTER TABLE school_configs ADD COLUMN IF NOT EXISTS director_signature_scale DOUBLE DEFAULT 1.0",
        "ALTER TABLE school_configs ADD COLUMN IF NOT EXISTS director_signature_y_offset DOUBLE DEFAULT 0",
        "ALTER TABLE school_configs ADD COLUMN IF NOT EXISTS officer_department VARCHAR(255)",
        "ALTER TABLE school_configs ADD COLUMN IF NOT EXISTS internal_departments LONGTEXT",
        "ALTER TABLE school_configs ADD COLUMN IF NOT EXISTS external_agencies LONGTEXT"
      ];
      for (const sql of configsAlter) { try { await connection.query(sql); } catch (e) {} }

      const profilesAlter = [
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assigned_classes LONGTEXT",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signature_base_64 LONGTEXT",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(100)"
      ];
      for (const sql of profilesAlter) { try { await connection.query(sql); } catch (e) {} }

      // Fix documents table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id INT AUTO_INCREMENT PRIMARY KEY,
          school_id VARCHAR(50),
          teacher_id VARCHAR(50),
          title TEXT,
          content TEXT,
          status VARCHAR(50),
          target_teachers LONGTEXT,
          acknowledged_by LONGTEXT,
          attachments LONGTEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Fix director_events table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS director_events (
          id VARCHAR(50) PRIMARY KEY,
          school_id VARCHAR(50),
          title TEXT,
          description TEXT,
          start_date DATETIME,
          end_date DATETIME,
          location TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Fix leave_requests table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS leave_requests (
          id INT AUTO_INCREMENT PRIMARY KEY,
          school_id VARCHAR(50),
          teacher_id VARCHAR(50),
          type VARCHAR(50),
          start_date DATE,
          end_date DATE,
          reason TEXT,
          status VARCHAR(50),
          attachments LONGTEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      res.json({ success: true, message: 'Database schema updated successfully' });
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { school_id, teacher_id, status, ...filters } = req.query;
    let sql = `SELECT * FROM ??`;
    const params = [table];
    const whereClauses = [];
    if (school_id) { whereClauses.push('school_id = ?'); params.push(school_id); }
    if (teacher_id) { whereClauses.push('teacher_id = ?'); params.push(teacher_id); }
    if (status) { whereClauses.push('status = ?'); params.push(status); }
    Object.entries(filters).forEach(([key, value]) => {
      whereClauses.push(`?? = ?`);
      params.push(key, value);
    });
    if (whereClauses.length > 0) sql += ` WHERE ${whereClauses.join(' AND ')}`;
    if (table !== 'super_admins') sql += ` ORDER BY created_at DESC`;
    const [rows] = await pool.query(sql, params);
    const jsonFieldsMap = {
      profiles: ['roles', 'assigned_classes'],
      school_configs: ['internal_departments', 'external_agencies'],
      academic_enrollments: ['levels'],
      academic_test_scores: ['results'],
      documents: ['target_teachers', 'acknowledged_by', 'attachments'],
      attendance: ['coordinate']
    };
    const fieldsToParse = jsonFieldsMap[table] || [];
    const processedRows = rows.map(row => parseJsonFields(row, fieldsToParse));
    res.json({ data: processedRows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const jsonFieldsMap = {
      profiles: ['roles', 'assigned_classes'],
      school_configs: ['internal_departments', 'external_agencies'],
      academic_enrollments: ['levels'],
      academic_test_scores: ['results'],
      documents: ['target_teachers', 'acknowledged_by', 'attachments'],
      attendance: ['coordinate']
    };
    const fieldsToSerialize = jsonFieldsMap[table] || [];
    const results = [];
    for (const item of items) {
      const processedData = { ...item };
      const uuidTables = ['class_rooms', 'students', 'student_savings', 'academic_years', 'student_attendance', 'student_health_records', 'director_events', 'finance_accounts', 'finance_transactions'];
      if (uuidTables.includes(table) && !processedData.id) processedData.id = uuidv4();
      fieldsToSerialize.forEach(field => {
        if (processedData[field] && typeof processedData[field] !== 'string') processedData[field] = JSON.stringify(processedData[field]);
      });
      const [result] = await pool.query(`INSERT INTO ?? SET ?`, [table, processedData]);
      results.push({ id: result.insertId || processedData.id, ...item });
    }
    res.json({ data: Array.isArray(req.body) ? results : results[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const data = req.body;
    const jsonFieldsMap = {
      profiles: ['roles', 'assigned_classes'],
      school_configs: ['internal_departments', 'external_agencies'],
      academic_enrollments: ['levels'],
      academic_test_scores: ['results'],
      documents: ['target_teachers', 'acknowledged_by', 'attachments'],
      attendance: ['coordinate']
    };
    const fieldsToSerialize = jsonFieldsMap[table] || [];
    const processedData = { ...data };
    fieldsToSerialize.forEach(field => {
      if (processedData[field] && typeof processedData[field] !== 'string') processedData[field] = JSON.stringify(processedData[field]);
    });
    await pool.query(`UPDATE ?? SET ? WHERE id = ?`, [table, processedData, id]);
    res.json({ data: { id, ...data } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/bulk/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { filters, data } = req.body;
    if (!filters || Object.keys(filters).length === 0) {
      return res.status(400).json({ error: 'Filters are required' });
    }
    let sql = `UPDATE ?? SET ?`;
    const params = [table, data];
    const whereClauses = Object.keys(filters).map(k => `?? = ?`);
    const whereParams = Object.entries(filters).flatMap(([k, v]) => [k, v]);
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
    params.push(...whereParams);
    await pool.query(sql, params);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const pkMap = {
      school_configs: 'school_id',
      schools: 'id',
      profiles: 'id'
    };
    const pk = pkMap[table] || 'id';
    await pool.query(`DELETE FROM ?? WHERE ?? = ?`, [table, pk, id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/:table/:id/delete', async (req, res) => {
  try {
    const { table, id } = req.params;
    const pkMap = {
      school_configs: 'school_id',
      schools: 'id',
      profiles: 'id'
    };
    const pk = pkMap[table] || 'id';
    await pool.query(`DELETE FROM ?? WHERE ?? = ?`, [table, pk, id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/:table/upsert', async (req, res) => {
  try {
    const { table } = req.params;
    const items = Array.isArray(req.body) ? req.body : [req.body];
    for (const item of items) {
      const keys = Object.keys(item);
      const values = Object.values(item).map(v => (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v);
      const placeholders = keys.map(() => '?').join(', ');
      const updateClause = keys.map(k => `?? = VALUES(??)`).join(', ');
      const updateParams = keys.flatMap(k => [k, k]);
      const sql = `INSERT INTO ?? (??) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
      const params = [table, keys, ...values, ...updateParams];
      await pool.query(sql, params);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Catch-all for undefined API routes to prevent HTML response
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// Serve static files from the React app
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
