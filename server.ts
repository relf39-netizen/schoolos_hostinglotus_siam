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
        // Keep as is if not valid JSON
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

// DATA TRANSFER (Special case for migration) - Using Base64 to bypass strict firewalls
app.post('/api/v1/transfer/:table', async (req, res) => {
  const { table } = req.params;
  try {
    let items = [];
    
    // Check if data is Base64 encoded
    if (req.body.encodedData) {
      const decodedString = Buffer.from(req.body.encodedData, 'base64').toString('utf-8');
      items = JSON.parse(decodedString);
    } else {
      items = Array.isArray(req.body) ? req.body : [req.body];
    }
    
    if (items.length === 0) {
      return res.json({ success: true, message: 'No items to transfer' });
    }

    console.log(`[API] Transferring ${items.length} items into ${table}`);
    
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
        const params = [table, keys, ...values, ...updateParams];
        
        await connection.query(sql, params);
      }

      await connection.commit();
      return res.status(200).json({ success: true });
    } catch (err: any) {
      await connection.rollback();
      console.error(`[DATABASE ERROR] ${err.message}`);
      return res.status(500).json({ error: `Database error: ${err.message}` });
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error(`[API ERROR] Transfer failed for ${table}:`, error);
    return res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

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

    const [rows]: any = await pool.query(sql, params);
    
    // Parse JSON fields based on table
    const jsonFieldsMap: any = {
      profiles: ['roles', 'assigned_classes'],
      school_configs: ['internal_departments', 'external_agencies'],
      academic_enrollments: ['levels'],
      academic_test_scores: ['results'],
      documents: ['target_teachers', 'acknowledged_by', 'attachments'],
      attendance: ['coordinate']
    };
    
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
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS assigned_classes LONGTEXT",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signature_base_64 LONGTEXT",
        "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(100)"
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

      console.log('[MAINTENANCE] Schema fix completed');
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
    
    const jsonFieldsMap: any = {
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
      
      // Generate UUID if missing for certain tables
      const uuidTables = ['class_rooms', 'students', 'student_savings', 'academic_years', 'student_attendance', 'student_health_records', 'director_events', 'finance_accounts', 'finance_transactions'];
      if (uuidTables.includes(table) && !processedData.id) {
        processedData.id = uuidv4();
      }

      fieldsToSerialize.forEach((field: string) => {
        if (processedData[field] && typeof processedData[field] !== 'string') {
          processedData[field] = JSON.stringify(processedData[field]);
        }
      });

      const [result]: any = await pool.query(`INSERT INTO ?? SET ?`, [table, processedData]);
      results.push({ id: result.insertId || processedData.id, ...item });
    }
    
    res.json({ data: Array.isArray(req.body) ? results : results[0] });
  } catch (error: any) {
    console.error(error);
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
    app.get('*all', (req, res, next) => {
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
