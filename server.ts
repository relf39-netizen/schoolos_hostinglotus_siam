import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// BigInt serialization support for JSON
(BigInt.prototype as any).toJSON = function() { return this.toString() };

// Custom error handler for JSON parsing and payload size errors
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof SyntaxError && 'body' in err) {
    console.error('[JSON ERROR]', err.message);
    return res.status(400).json({ error: 'Invalid JSON payload. Please check your data format.' });
  }
  if (err.type === 'entity.too.large') {
    console.error('[PAYLOAD ERROR] Request body too large');
    return res.status(413).json({ error: 'Payload too large. Please reduce image sizes or data volume.' });
  }
  next();
});

// MySQL Connection Pool
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'schoolos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Increase timeout for migration
  connectTimeout: 10000,
  // Add support for common hosting socket paths if needed
  socketPath: process.env.MYSQL_SOCKET || undefined
};

console.log(`Attempting to connect to MySQL at ${dbConfig.host} (User: ${dbConfig.user}, DB: ${dbConfig.database})`);

const pool = mysql.createPool(dbConfig);

// Test connection immediately
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL Database connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL Connection Failed:');
    console.error(`   Error Code: ${err.code}`);
    console.error(`   Message: ${err.message}`);
    console.log('   (Note: If running in AI Studio Preview, this is expected. It will work when deployed to Hosting Lotus)');
  });

// Helper to handle JSON columns
const parseJsonFields = (row: any, fields: string[]) => {
  if (!row) return row;
  const newRow = { ...row };
  fields.forEach(field => {
    if (newRow[field] && typeof newRow[field] === 'string') {
      try {
        newRow[field] = JSON.parse(newRow[field]);
      } catch (e) {
        // Ensure critical fields are at least empty arrays if parsing fails
        if (['roles', 'assigned_classes', 'target_teachers', 'acknowledged_by'].includes(field)) {
          newRow[field] = [];
        }
      }
    } else if (newRow[field] === null || newRow[field] === undefined) {
      if (['roles', 'assigned_classes', 'target_teachers', 'acknowledged_by'].includes(field)) {
        newRow[field] = [];
      }
    }
  });
  return newRow;
};

// --- Generic API Endpoints ---

// GAS Bridge Endpoint (Secure proxy for Google Apps Script)
app.post('/api/gas/bridge', async (req, res) => {
  const { secret, action, table, data, id } = req.body;
  const serverSecret = process.env.GAS_SECRET_KEY;

  // 1. Verify Secret
  if (!serverSecret || secret !== serverSecret) {
    console.error('[GAS Bridge] Unauthorized access attempt');
    return res.status(401).json({ error: 'Unauthorized: Invalid Secret Key' });
  }

  try {
    console.log(`[GAS Bridge] Action: ${action} on Table: ${table}`);

    if (action === 'insert') {
      const [result]: any = await pool.query(`INSERT INTO ?? SET ?`, [table, data]);
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
  } catch (error: any) {
    console.error('[GAS Bridge] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Logging middleware for API requests
app.use('/api', (req, res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

const jsonFieldsMap: any = {
  profiles: ['roles', 'assigned_classes'],
  school_configs: ['internal_departments', 'external_agencies'],
  academic_enrollments: ['levels'],
  academic_test_scores: ['results'],
  documents: ['target_teachers', 'acknowledged_by', 'attachments'],
  attendance: ['coordinate']
};

const uuidTables = ['class_rooms', 'students', 'student_savings', 'academic_years', 'student_attendance', 'student_health_records', 'director_events', 'finance_accounts', 'finance_transactions'];

// Table name reverse map for obfuscated names
const tableReverseMap: Record<string, string> = {
  'p1': 'profiles',
  's1': 'students',
  'sa1': 'student_attendance',
  'd1': 'documents',
  'sc1': 'schools',
  'lr1': 'leave_requests',
  'de1': 'director_events',
  'ss1': 'student_savings',
  'cr1': 'class_rooms',
  'ay1': 'academic_years',
  'su1': 'super_admins',
  'at1': 'attendance',
  'ats1': 'academic_test_scores',
  'st1': 'savings_transactions',
  'fa1': 'finance_accounts',
  'ft1': 'finance_transactions',
  'shr1': 'student_health_records'
};

function getRealTable(table: string): string {
  return tableReverseMap[table] || table;
}

// DATA SYNC (Base64 fallback for strict firewalls)
app.all(['/api/data-sync', '/api/v1/data-sync', '/api/bridge', '/api/v1/bridge', '/api/v1/sync'], async (req, res) => {
  console.log(`[Data Sync API] Incoming request from ${req.ip} via ${req.method}`);
  try {
    // Support multiple parameter names and both GET/POST to bypass specific WAF filters
    const payload = req.body.d || req.body.p || req.body.z || req.body.data || req.body.payload || 
                    req.query.d || req.query.p || req.query.z || req.query.data || req.query.payload;
    
    if (!payload) {
      console.error('[Data Sync API] Missing payload');
      return res.status(400).json({ error: 'Missing payload' });
    }
    
    let decodedString;
    try {
      decodedString = Buffer.from(payload, 'base64').toString('utf-8');
    } catch (e) {
      return res.status(400).json({ error: 'Invalid Base64 encoding' });
    }

    let parsed;
    try {
      parsed = JSON.parse(decodedString);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON in payload' });
    }

    // Support both long and short keys for backward compatibility and WAF bypass
    let action = parsed.a || parsed.action;
    let table = parsed.t || parsed.table;
    let data = parsed.d || parsed.data;
    let id = parsed.k || parsed.id;
    let filters = parsed.f || parsed.filters;
    let inFilters = parsed.i || parsed.inFilters;
    let order = parsed.o || parsed.order;
    let limit = parsed.l || parsed.limit;
    let count = parsed.n || parsed.count;
    let pk = parsed.pk || 'id';
    
    // De-obfuscate table name
    table = getRealTable(table);
    
    console.log(`[Data Sync API] ${action?.toUpperCase()} on ${table}`, { id, pk });
    
    if (action === 'select') {
      let query = `SELECT * FROM ??`;
      const params: any[] = [table];
      
      const whereClauses: string[] = [];
      if (filters && Object.keys(filters).length > 0) {
        whereClauses.push(...Object.keys(filters).map(k => `?? = ?`));
        params.push(...Object.entries(filters).flatMap(([k, v]) => [k, v]));
      }

      if (inFilters && Object.keys(inFilters).length > 0) {
        Object.entries(inFilters).forEach(([k, v]) => {
          if (Array.isArray(v) && v.length > 0) {
            whereClauses.push(`?? IN (?)`);
            params.push(k, v);
          }
        });
      }

      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      if (order) {
        // Handle both { c, a } and { column, ascending }
        const column = order.c || order.column;
        const ascending = order.a !== undefined ? order.a : order.ascending;
        query += ` ORDER BY ?? ${ascending ? 'ASC' : 'DESC'}`;
        params.push(column);
      } else {
        const tablesWithCreatedAt = ['documents', 'leave_requests', 'attendance', 'director_events', 'academic_test_scores', 'savings_transactions'];
        if (tablesWithCreatedAt.includes(table)) {
          query += ` ORDER BY created_at DESC`;
        }
      }
      
      const [rows]: any = await pool.query(query, params);
      
      // Parse JSON fields for select
      const fieldsToParse = jsonFieldsMap[table] || [];
      const processedRows = rows.map((row: any) => parseJsonFields(row, fieldsToParse));
      
      return res.json({ success: true, data: processedRows });
    }

    if (action === 'upsert') {
      const items = Array.isArray(data) ? data : [data];
      const fieldsToSerialize = jsonFieldsMap[table] || [];

      for (const item of items) {
        const processedData = { ...item };
        if (uuidTables.includes(table) && !processedData.id) processedData.id = uuidv4();
        fieldsToSerialize.forEach(field => {
          if (processedData[field] && typeof processedData[field] !== 'string') processedData[field] = JSON.stringify(processedData[field]);
        });
        
        const keys = Object.keys(processedData);
        const values = Object.values(processedData).map(v => (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `?? = VALUES(??)`).join(', ');
        const updateParams = keys.flatMap(k => [k, k]);
        const sql = `INSERT INTO ?? (??) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
        await pool.query(sql, [table, keys, ...values, ...updateParams]);
      }
      return res.json({ success: true });
    }

    if (action === 'delete') {
      if (id) {
        await pool.query(`DELETE FROM ?? WHERE ?? = ?`, [table, pk, id]);
      } else {
        const whereClauses: string[] = [];
        const params: any[] = [table];

        if (filters && Object.keys(filters).length > 0) {
          whereClauses.push(...Object.keys(filters).map(k => `?? = ?`));
          params.push(...Object.entries(filters).flatMap(([k, v]) => [k, v]));
        }

        if (inFilters && Object.keys(inFilters).length > 0) {
          Object.entries(inFilters).forEach(([k, v]) => {
            if (Array.isArray(v) && v.length > 0) {
              whereClauses.push(`?? IN (?)`);
              params.push(k, v);
            }
          });
        }

        if (whereClauses.length > 0) {
          const sql = `DELETE FROM ?? WHERE ${whereClauses.join(' AND ')}`;
          await pool.query(sql, params);
        } else {
          return res.status(400).json({ error: 'Missing ID or filters for delete' });
        }
      }
      return res.json({ success: true });
    }

    if (action === 'insert') {
      const items = Array.isArray(data) ? data : [data];
      const results = [];
      const fieldsToSerialize = jsonFieldsMap[table] || [];

      for (const item of items) {
        const processedData = { ...item };
        if (uuidTables.includes(table) && !processedData.id) processedData.id = uuidv4();
        fieldsToSerialize.forEach(field => {
          if (processedData[field] && typeof processedData[field] !== 'string') processedData[field] = JSON.stringify(processedData[field]);
        });
        const [result]: any = await pool.query(`INSERT INTO ?? SET ?`, [table, processedData]);
        results.push({ id: result.insertId || processedData.id, ...item });
      }
      return res.json({ success: true, data: Array.isArray(data) ? results : results[0] });
    }

    if (action === 'update') {
      const fieldsToSerialize = jsonFieldsMap[table] || [];
      const processedData = { ...data };
      fieldsToSerialize.forEach(field => {
        if (processedData[field] && typeof processedData[field] !== 'string') processedData[field] = JSON.stringify(processedData[field]);
      });

      if (id) {
        await pool.query(`UPDATE ?? SET ? WHERE ?? = ?`, [table, processedData, pk, id]);
      } else {
        const whereClauses: string[] = [];
        const params: any[] = [table, processedData];

        if (filters && Object.keys(filters).length > 0) {
          whereClauses.push(...Object.keys(filters).map(k => `?? = ?`));
          params.push(...Object.entries(filters).flatMap(([k, v]) => [k, v]));
        }

        if (inFilters && Object.keys(inFilters).length > 0) {
          Object.entries(inFilters).forEach(([k, v]) => {
            if (Array.isArray(v) && v.length > 0) {
              whereClauses.push(`?? IN (?)`);
              params.push(k, v);
            }
          });
        }

        if (whereClauses.length > 0) {
          const sql = `UPDATE ?? SET ? WHERE ${whereClauses.join(' AND ')}`;
          await pool.query(sql, params);
        } else {
          return res.status(400).json({ error: 'Missing ID or filters for update' });
        }
      }
      return res.json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error: any) {
    console.error(`[API ERROR] Data Sync failed:`, error);
    // Return a JSON error even if it's a 500, to avoid HTML fallback if possible
    return res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.post('/api/v1/sync-records/:table', async (req, res) => {
  const { table } = req.params;
  try {
    if (!req.body.encodedData) {
      return res.status(400).json({ error: 'Missing encodedData' });
    }
    const decodedString = Buffer.from(req.body.encodedData, 'base64').toString('utf-8');
    const items = JSON.parse(decodedString);
    
    const results = await performBulkUpsert(table, items);
    return res.json({ success: true, data: results });
  } catch (error: any) {
    console.error(`[API ERROR] Base64 Sync failed for ${table}:`, error);
    return res.status(500).json({ error: error.message });
  }
});

async function performBulkUpsert(table: string, items: any[]) {
  const uuidTables = ['class_rooms', 'students', 'student_savings', 'academic_years', 'student_attendance', 'student_health_records', 'director_events', 'finance_accounts', 'finance_transactions'];
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const results = [];
    for (const item of items) {
      const processedData = { ...item };
      if (uuidTables.includes(table) && !processedData.id) {
        processedData.id = uuidv4();
      }

      const keys = Object.keys(processedData);
      if (keys.length === 0) continue;

      const values = Object.values(processedData).map(v => (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v);
      const placeholders = keys.map(() => '?').join(', ');
      
      // Use manual escaping for column names in ON DUPLICATE KEY UPDATE to be safer with mysql2
      const updateClause = keys.filter(k => k !== 'id').map(k => `\`${k}\` = VALUES(\`${k}\`)`).join(', ');

      let sql = `INSERT INTO \`${table}\` (\`${keys.join('`, `')}\`) VALUES (${placeholders})`;
      let params = [...values];
      
      if (updateClause.length > 0) {
        sql += ` ON DUPLICATE KEY UPDATE ${updateClause}`;
      }

      const [result]: any = await connection.query(sql, params);
      results.push({ id: processedData.id || result.insertId, ...item });
    }
    await connection.commit();
    return results;
  } catch (err) {
    await connection.rollback();
    console.error(`[BulkUpsert Error] Table: ${table}`, err);
    throw err;
  } finally {
    connection.release();
  }
}

// GET health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', message: 'Database connected' });
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET all from table
app.get('/api/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { school_id, teacher_id, status, ...filters } = req.query;
    
    let sql = `SELECT * FROM ??`;
    const params: any[] = [table];
    
    const whereClauses: string[] = [];
    if (school_id) {
      whereClauses.push('school_id = ?');
      params.push(school_id);
    }
    if (teacher_id) {
      whereClauses.push('teacher_id = ?');
      params.push(teacher_id);
    }
    if (status) {
      whereClauses.push('status = ?');
      params.push(status);
    }
    
    // Add other filters
    Object.entries(filters).forEach(([key, value]) => {
      whereClauses.push(`?? = ?`);
      params.push(key, value);
    });

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    // Only order by created_at if the table has it
    const tablesWithCreatedAt = ['documents', 'leave_requests', 'attendance', 'director_events', 'academic_test_scores', 'savings_transactions'];
    if (tablesWithCreatedAt.includes(table)) {
      sql += ` ORDER BY created_at DESC`;
    }

    console.log(`[API GET] Table: ${table}, SQL: ${sql}, Params:`, params);

    const [rows]: any = await pool.query(sql, params);
    
    // Parse JSON fields based on table
    const fieldsToParse = jsonFieldsMap[table] || [];
    const processedRows = rows.map((row: any) => parseJsonFields(row, fieldsToParse));
    
    res.json({ data: processedRows });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// MAINTENANCE: Fix Database Schema
app.post('/api/maintenance/fix-schema', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    try {
      console.log('[MAINTENANCE] Running schema fix...');
      
      // Fix schools table
      const schoolsAlter = [
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS wfh_mode_enabled BOOLEAN DEFAULT FALSE",
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS auto_check_out_enabled BOOLEAN DEFAULT FALSE",
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS auto_check_out_time VARCHAR(10) DEFAULT '16:30'",
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS late_time_threshold VARCHAR(10) DEFAULT '08:30'",
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS outgoing_book_prefix VARCHAR(50)",
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE"
      ];

      for (const sql of schoolsAlter) {
        try { await connection.query(sql); } catch (e) { console.warn(`[MAINTENANCE] Skip: ${sql}`); }
      }

      // Fix school_configs table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS school_configs (
          school_id VARCHAR(50) PRIMARY KEY,
          drive_folder_id VARCHAR(255),
          script_url TEXT,
          telegram_bot_token VARCHAR(255),
          telegram_bot_username VARCHAR(255),
          app_base_url VARCHAR(255)
        )
      `);

      const configsAlter = [
        "ALTER TABLE school_configs ADD COLUMN IF NOT EXISTS official_garuda_base_64 LONGTEXT",
        "ALTER TABLE school_configs ADD COLUMN IF NOT EXISTS director_signature_base_64 LONGTEXT",
        "ALTER TABLE school_configs ADD COLUMN IF NOT EXISTS director_signature_scale DOUBLE DEFAULT 1.0",
        "ALTER TABLE school_configs ADD COLUMN IF NOT EXISTS director_signature_y_offset DOUBLE DEFAULT 0",
        "ALTER TABLE school_configs ADD COLUMN IF NOT EXISTS officer_department VARCHAR(255)",
        "ALTER TABLE school_configs ADD COLUMN IF NOT EXISTS internal_departments LONGTEXT",
        "ALTER TABLE school_configs ADD COLUMN IF NOT EXISTS external_agencies LONGTEXT"
      ];

      for (const sql of configsAlter) {
        try { await connection.query(sql); } catch (e) { console.warn(`[MAINTENANCE] Skip: ${sql}`); }
      }

      // Fix profiles table
      const profilesAlter = [
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS name VARCHAR(255)",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT '123456'",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assigned_classes LONGTEXT",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signature_base_64 LONGTEXT",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(100)",
        "ALTER TABLE profiles MODIFY COLUMN id VARCHAR(100)",
        "UPDATE profiles SET name = full_name WHERE name IS NULL AND full_name IS NOT NULL",
        "UPDATE profiles SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL"
      ];

      for (const sql of profilesAlter) {
        try { await connection.query(sql); } catch (e) { console.warn(`[MAINTENANCE] Skip: ${sql}`); }
      }

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
          created_by VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Fix student_savings table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS student_savings (
          id VARCHAR(36) PRIMARY KEY,
          student_id VARCHAR(36),
          school_id VARCHAR(50),
          amount DECIMAL(15,2),
          type VARCHAR(20),
          academic_year VARCHAR(20),
          created_by VARCHAR(100),
          created_at DATETIME,
          edited_at DATETIME,
          edited_by VARCHAR(100),
          edit_reason TEXT
        )
      `);

      // Fix students table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS students (
          id VARCHAR(36) PRIMARY KEY,
          school_id VARCHAR(50),
          name VARCHAR(255) NOT NULL,
          current_class VARCHAR(50) NOT NULL,
          academic_year VARCHAR(50) NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          photo_url TEXT,
          address TEXT,
          phone_number VARCHAR(50),
          father_name VARCHAR(255),
          mother_name VARCHAR(255),
          guardian_name VARCHAR(255),
          medical_conditions TEXT,
          family_annual_income DOUBLE,
          lat DOUBLE,
          lng DOUBLE,
          is_alumni BOOLEAN DEFAULT FALSE,
          graduation_year VARCHAR(50),
          batch_number VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Fix class_rooms table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS class_rooms (
          id VARCHAR(36) PRIMARY KEY,
          school_id VARCHAR(50),
          name VARCHAR(255) NOT NULL,
          academic_year VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Fix student_attendance table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS student_attendance (
          id VARCHAR(36) PRIMARY KEY,
          school_id VARCHAR(50),
          student_id VARCHAR(36),
          date DATE NOT NULL,
          status VARCHAR(50) NOT NULL,
          academic_year VARCHAR(50) NOT NULL,
          created_by VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(student_id, date)
        )
      `);

      // Fix student_health_records table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS student_health_records (
          id VARCHAR(36) PRIMARY KEY,
          student_id VARCHAR(36),
          school_id VARCHAR(50),
          weight DECIMAL(5,2),
          height DECIMAL(5,2),
          recorded_at DATETIME,
          academic_year VARCHAR(20),
          recorded_by VARCHAR(100),
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

      // Fix academic_years table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS academic_years (
          id VARCHAR(36) PRIMARY KEY,
          school_id VARCHAR(50),
          year VARCHAR(50) NOT NULL,
          is_current BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('[MAINTENANCE] Schema fix completed');
      // Fix academic_years table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS academic_years (
          id VARCHAR(36) PRIMARY KEY,
          school_id VARCHAR(50) NOT NULL,
          year VARCHAR(10) NOT NULL,
          is_current TINYINT(1) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_school_year (school_id, year)
        ) ENGINE=InnoDB
      `);

      // Fix class_rooms table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS class_rooms (
          id VARCHAR(36) PRIMARY KEY,
          school_id VARCHAR(50) NOT NULL,
          name VARCHAR(100) NOT NULL,
          academic_year VARCHAR(10),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_school_class (school_id, name)
        ) ENGINE=InnoDB
      `);

      // Fix students table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS students (
          id VARCHAR(36) PRIMARY KEY,
          school_id VARCHAR(50) NOT NULL,
          name VARCHAR(255) NOT NULL,
          current_class VARCHAR(100) NOT NULL,
          academic_year VARCHAR(10),
          is_active TINYINT(1) DEFAULT 1,
          photo_url TEXT,
          address TEXT,
          phone_number VARCHAR(50),
          father_name VARCHAR(255),
          mother_name VARCHAR(255),
          guardian_name VARCHAR(255),
          medical_conditions TEXT,
          family_annual_income DOUBLE,
          lat DOUBLE,
          lng DOUBLE,
          is_alumni TINYINT(1) DEFAULT 0,
          graduation_year VARCHAR(10),
          batch_number VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_school_student (school_id, name),
          INDEX idx_class (current_class)
        ) ENGINE=InnoDB
      `);

      // Fix student_savings table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS student_savings (
          id VARCHAR(36) PRIMARY KEY,
          student_id VARCHAR(36) NOT NULL,
          school_id VARCHAR(50) NOT NULL,
          amount DOUBLE NOT NULL,
          type ENUM('DEPOSIT', 'WITHDRAWAL') NOT NULL,
          academic_year VARCHAR(10),
          created_by VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          edited_at TIMESTAMP NULL,
          edited_by VARCHAR(100),
          edit_reason TEXT,
          INDEX idx_student_savings (student_id),
          INDEX idx_school_savings (school_id)
        ) ENGINE=InnoDB
      `);

      // Fix student_attendance table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS student_attendance (
          id VARCHAR(36) PRIMARY KEY,
          school_id VARCHAR(50) NOT NULL,
          student_id VARCHAR(36) NOT NULL,
          date DATE NOT NULL,
          status ENUM('Present', 'Late', 'Sick', 'Absent') NOT NULL,
          academic_year VARCHAR(10) NOT NULL,
          created_by VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY idx_student_date (student_id, date)
        ) ENGINE=InnoDB
      `);

      // Fix student_support_records table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS student_support_records (
          id VARCHAR(36) PRIMARY KEY,
          student_id VARCHAR(36) NOT NULL,
          school_id VARCHAR(50) NOT NULL,
          type ENUM('HOME_VISIT', 'SDQ_TEACHER', 'SDQ_STUDENT', 'SDQ_PARENT', 'SCREENING', 'EQ') NOT NULL,
          data LONGTEXT NOT NULL,
          academic_year VARCHAR(10) NOT NULL,
          recorded_by VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_student_support (student_id, type)
        ) ENGINE=InnoDB
      `);

      res.json({ success: true, message: 'Database schema updated successfully' });
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('[MAINTENANCE ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const items = Array.isArray(req.body) ? req.body : [req.body];
    
    const results = await performBulkUpsert(table, items);
    res.json({ data: Array.isArray(req.body) ? results : results[0] });
  } catch (error: any) {
    console.error(`[API ERROR] POST failed for ${table}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Normal POST for UPSERT (Fallback for WAF)
app.post('/api/:table/upsert', async (req, res) => {
  try {
    const { table } = req.params;
    const items = Array.isArray(req.body) ? req.body : [req.body];
    
    const results = await performBulkUpsert(table, items);
    res.json({ success: true, data: results });
  } catch (error: any) {
    console.error(`[API ERROR] UPSERT failed for ${table}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Normal POST for UPDATE (Fallback for WAF)
app.post('/api/:table/:id/update', async (req, res) => {
  try {
    const { table, id } = req.params;
    const data = req.body;
    
    // Handle JSON fields
    const jsonFieldsMap: any = {
      profiles: ['roles', 'assigned_classes'],
      school_configs: ['internal_departments', 'external_agencies'],
      academic_enrollments: ['levels'],
      academic_test_scores: ['results'],
      documents: ['target_teachers', 'acknowledged_by', 'attachments'],
      attendance: ['coordinate']
    };
    const fieldsToSerialize = jsonFieldsMap[table] || [];
    const processedData = { ...data };
    fieldsToSerialize.forEach((field: string) => {
      if (processedData[field] && typeof processedData[field] !== 'string') {
        processedData[field] = JSON.stringify(processedData[field]);
      }
    });

    const pkMap: any = {
      school_configs: 'school_id',
      schools: 'id',
      profiles: 'id'
    };
    const pk = pkMap[table] || 'id';

    await pool.query(`UPDATE ?? SET ? WHERE ?? = ?`, [table, processedData, pk, id]);
    res.json({ success: true, data: { [pk]: id, ...data } });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Normal POST for INSERT (Fallback for WAF)
app.post('/api/:table/insert', async (req, res) => {
  try {
    const { table } = req.params;
    const data = req.body;
    
    const [result]: any = await pool.query(`INSERT INTO ?? SET ?`, [table, data]);
    res.json({ success: true, id: result.insertId || data.id });
  } catch (error: any) {
    console.error(`[API ERROR] INSERT failed for ${table}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH (Update)
app.patch('/api/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const data = req.body;
    
    // Handle JSON fields
    const jsonFieldsMap: any = {
      profiles: ['roles', 'assigned_classes'],
      school_configs: ['internal_departments', 'external_agencies'],
      academic_enrollments: ['levels'],
      academic_test_scores: ['results'],
      documents: ['target_teachers', 'acknowledged_by', 'attachments'],
      attendance: ['coordinate']
    };
    const fieldsToSerialize = jsonFieldsMap[table] || [];
    const processedData = { ...data };
    fieldsToSerialize.forEach((field: string) => {
      if (processedData[field] && typeof processedData[field] !== 'string') {
        processedData[field] = JSON.stringify(processedData[field]);
      }
    });

    const pkMap: any = {
      school_configs: 'school_id',
      schools: 'id',
      profiles: 'id'
    };
    const pk = pkMap[table] || 'id';

    await pool.query(`UPDATE ?? SET ? WHERE ?? = ?`, [table, processedData, pk, id]);
    res.json({ data: { [pk]: id, ...data } });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// BULK UPDATE (Special case for students promotion/graduation)
app.patch('/api/bulk/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { filters, data } = req.body;
    
    if (!filters || Object.keys(filters).length === 0) {
      return res.status(400).json({ error: 'Filters are required for bulk update' });
    }

    let sql = `UPDATE ?? SET ?`;
    const params: any[] = [table, data];
    
    const whereClauses = Object.keys(filters).map(k => `?? = ?`);
    const whereParams = Object.entries(filters).flatMap(([k, v]) => [k, v]);
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
    params.push(...whereParams);

    await pool.query(sql, params);
    res.json({ success: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE
app.delete('/api/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const pkMap: any = {
      school_configs: 'school_id',
      schools: 'id',
      profiles: 'id'
    };
    const pk = pkMap[table] || 'id';

    await pool.query(`DELETE FROM ?? WHERE ?? = ?`, [table, pk, id]);
    res.json({ success: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/:table/:id/delete', async (req, res) => {
  try {
    const { table, id } = req.params;
    const pkMap: any = {
      school_configs: 'school_id',
      schools: 'id',
      profiles: 'id'
    };
    const pk = pkMap[table] || 'id';

    await pool.query(`DELETE FROM ?? WHERE ?? = ?`, [table, pk, id]);
    res.json({ success: true });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Catch-all for undefined API routes to prevent HTML response
app.all('/api/*all', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// UPSERT (Special case for schools/configs)
// (Moved to top)

async function startServer() {
  // Auto-run schema fix on start to ensure tables exist
  try {
    const connection = await pool.getConnection();
    try {
      console.log('[STARTUP] Running automatic schema check...');
      
      // 1. Ensure students table exists
      await connection.query(`
        CREATE TABLE IF NOT EXISTS students (
          id VARCHAR(36) PRIMARY KEY,
          school_id VARCHAR(36),
          student_id VARCHAR(50),
          title VARCHAR(20),
          first_name VARCHAR(100),
          last_name VARCHAR(100),
          class_name VARCHAR(50),
          room_name VARCHAR(50),
          status VARCHAR(20) DEFAULT 'Active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 2. Ensure student_attendance exists with correct unique constraint and FK
      await connection.query(`
        CREATE TABLE IF NOT EXISTS student_attendance (
          id VARCHAR(36) PRIMARY KEY,
          school_id VARCHAR(36),
          student_id VARCHAR(36),
          date DATE,
          status VARCHAR(20),
          remark TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_student_date (student_id, date)
        )
      `);

      // 3. Ensure profiles exists
      await connection.query(`
        CREATE TABLE IF NOT EXISTS profiles (
          id VARCHAR(100) PRIMARY KEY,
          school_id VARCHAR(50),
          name VARCHAR(255),
          full_name VARCHAR(255),
          email VARCHAR(255),
          password VARCHAR(255) DEFAULT '123456',
          role VARCHAR(50),
          roles LONGTEXT,
          position VARCHAR(100),
          assigned_classes LONGTEXT,
          is_approved BOOLEAN DEFAULT FALSE,
          is_suspended BOOLEAN DEFAULT FALSE,
          signature_base_64 LONGTEXT,
          telegram_chat_id VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('[STARTUP] Schema check completed');
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('[STARTUP ERROR] Schema check failed:', err);
  }

  // API routes must be defined BEFORE Vite/SPA fallback
  
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // SPA Fallback - only for non-API routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

startServer();
