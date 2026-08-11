const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// ---------- MIDDLEWARE ----------
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- MySQL CONNECTION (Pool) ----------
const pool = mysql.createPool({
  host: 'mysql.railway.internal',
  user: 'root',
  password: 'OklBKEcqBkQvgCjklhfclqJgmjsOXugE',
  database: 'railway',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection and create table if not exists
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ MySQL connection error:', err.message);
    console.log('⚠️  Server will continue without database (some features may fail)');
  } else {
    console.log('✅ MySQL connected successfully');
    
    // Create apps table if not exists
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS apps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        version VARCHAR(50) NOT NULL,
        description TEXT,
        downloadUrl VARCHAR(512) NOT NULL,
        imageUrl VARCHAR(512) NOT NULL,
        category VARCHAR(100),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    connection.query(createTableSQL, (err) => {
      if (err) {
        console.error('❌ Error creating table:', err.message);
      } else {
        console.log('✅ Apps table ready');
      }
      connection.release();
    });
  }
});

// Promise wrapper for pool
const query = (sql, params) => {
  return new Promise((resolve, reject) => {
    pool.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

// ---------- ROUTES ----------

// 1. Admin Login (password check only - no DB dependency)
app.post('/api/admin/login', (req, res) => {
  try {
    const { password } = req.body;
    console.log('Login attempt with password:', password);
    
    if (password === 'oshan123#') {
      return res.json({ success: true, message: 'Login successful' });
    } else {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 2. Get all apps
app.get('/api/apps', async (req, res) => {
  try {
    const results = await query('SELECT * FROM apps ORDER BY createdAt DESC');
    res.json(results);
  } catch (err) {
    console.error('Error fetching apps:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Add new app (admin only)
app.post('/api/apps', async (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== 'oshan123#') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { name, version, description, downloadUrl, imageUrl, category } = req.body;
    const sql = `
      INSERT INTO apps (name, version, description, downloadUrl, imageUrl, category)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const params = [name, version, description, downloadUrl, imageUrl, category];
    const result = await query(sql, params);
    
    // Get the newly inserted app
    const newApp = await query('SELECT * FROM apps WHERE id = ?', [result.insertId]);
    
    // Emit real-time update
    io.emit('apps-updated');
    
    res.json({ success: true, app: newApp[0] });
  } catch (err) {
    console.error('Error adding app:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete app (admin only)
app.delete('/api/apps/:id', async (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== 'oshan123#') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const id = req.params.id;
    await query('DELETE FROM apps WHERE id = ?', [id]);
    
    // Emit real-time update
    io.emit('apps-updated');
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting app:', err);
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- SOCKET.IO ----------
io.on('connection', async (socket) => {
  console.log('🔌 New client connected');
  try {
    const apps = await query('SELECT * FROM apps ORDER BY createdAt DESC');
    socket.emit('initial-apps', apps);
  } catch (err) {
    console.error('Error sending initial apps:', err);
  }

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected');
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket (Socket.IO) enabled`);
});
