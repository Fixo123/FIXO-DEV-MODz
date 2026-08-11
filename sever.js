const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;

// ---------- MIDDLEWARE ----------
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- IN-MEMORY STORAGE ----------
let apps = [];                     // Array to store apps { id, name, version, description, downloadUrl, imageUrl, category, createdAt }
let appIdCounter = 1;

// Traffic Statistics
let stats = {
  totalViews: 0,
  uniqueVisitors: new Set(),       // Store IP addresses or session IDs
  todayViews: 0,
  lastResetDate: new Date().toDateString(),
  totalApps: 0
};

// Reset todayViews at midnight (simple check on each request)
function resetTodayViewsIfNeeded() {
  const today = new Date().toDateString();
  if (stats.lastResetDate !== today) {
    stats.todayViews = 0;
    stats.lastResetDate = today;
  }
}

// ---------- TRAFFIC TRACKING MIDDLEWARE ----------
app.use((req, res, next) => {
  // Only track page views (GET requests for HTML pages)
  if (req.method === 'GET' && (req.path === '/' || req.path === '/admin' || req.path === '/admin.html')) {
    resetTodayViewsIfNeeded();
    
    // Get visitor IP (handle proxy headers)
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    stats.totalViews += 1;
    stats.todayViews += 1;
    stats.uniqueVisitors.add(ip);
    stats.totalApps = apps.length;
    
    console.log(`📊 Traffic: Total=${stats.totalViews}, Today=${stats.todayViews}, Unique=${stats.uniqueVisitors.size}`);
  }
  next();
});

// ---------- ROUTES ----------

// 1. Admin Login (no DB)
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === 'oshan123#') {
    return res.json({ success: true, message: 'Login successful' });
  } else {
    return res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

// 2. Get all apps (public)
app.get('/api/apps', (req, res) => {
  res.json(apps);
});

// 3. Get traffic stats (admin only - token protected)
app.get('/api/stats', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== 'oshan123#') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  res.json({
    totalViews: stats.totalViews,
    uniqueVisitors: stats.uniqueVisitors.size,
    todayViews: stats.todayViews,
    totalApps: apps.length,
    lastResetDate: stats.lastResetDate
  });
});

// 4. Add new app (admin only)
app.post('/api/apps', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== 'oshan123#') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  const { name, version, description, downloadUrl, imageUrl, category } = req.body;
  if (!name || !downloadUrl || !imageUrl) {
    return res.status(400).json({ success: false, message: 'Name, Download URL and Image URL are required' });
  }

  const newApp = {
    id: appIdCounter++,
    name,
    version: version || '1.0',
    description: description || '',
    downloadUrl,
    imageUrl,
    category: category || 'General',
    createdAt: new Date().toISOString()
  };
  apps.push(newApp);
  stats.totalApps = apps.length;
  
  io.emit('apps-updated');   // Real-time update
  res.json({ success: true, app: newApp });
});

// 5. Delete app (admin only)
app.delete('/api/apps/:id', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== 'oshan123#') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  const id = parseInt(req.params.id);
  const index = apps.findIndex(a => a.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'App not found' });
  }
  apps.splice(index, 1);
  stats.totalApps = apps.length;
  
  io.emit('apps-updated');
  res.json({ success: true });
});

// Serve frontend
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- SOCKET.IO ----------
io.on('connection', (socket) => {
  console.log('🔌 New client connected');
  socket.emit('initial-apps', apps);
  socket.on('disconnect', () => console.log('🔌 Client disconnected'));
});

// ---------- START SERVER ----------
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket (Socket.IO) enabled`);
  console.log(`💾 In-Memory Storage (no database)`);
});
