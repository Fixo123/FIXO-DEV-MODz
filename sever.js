const express = require('express');
const mongoose = require('mongoose');
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

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection with better error handling
const MONGODB_URI = 'mongodb+srv://nima:nima@nimabot.gkpbhvh.mongodb.net';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ MongoDB connected successfully');
  // Start server only after DB connection
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket (Socket.IO) enabled`);
  });
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  console.log('⚠️  Starting server without MongoDB (using in-memory fallback)');
  // Still start the server even if DB fails (for demo)
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT} (without DB)`);
  });
});

// App Schema (fallback to in-memory if DB fails)
let App;
let inMemoryApps = [];

try {
  const appSchema = new mongoose.Schema({
    name: String,
    version: String,
    description: String,
    downloadUrl: String,
    imageUrl: String,
    category: String,
    createdAt: { type: Date, default: Date.now },
  });
  App = mongoose.model('App', appSchema);
} catch (e) {
  // If mongoose model already defined, use it
  App = mongoose.model('App');
}

// ---------- Helper functions ----------
async function getAllApps() {
  if (mongoose.connection.readyState === 1) {
    return await App.find().sort({ createdAt: -1 });
  } else {
    return inMemoryApps.sort((a, b) => b.createdAt - a.createdAt);
  }
}

async function addApp(data) {
  if (mongoose.connection.readyState === 1) {
    const newApp = new App(data);
    await newApp.save();
    return newApp;
  } else {
    const newApp = { ...data, _id: Date.now().toString(), createdAt: Date.now() };
    inMemoryApps.push(newApp);
    return newApp;
  }
}

async function deleteApp(id) {
  if (mongoose.connection.readyState === 1) {
    await App.findByIdAndDelete(id);
  } else {
    inMemoryApps = inMemoryApps.filter(app => app._id !== id);
  }
}

// ---------- ROUTES ----------

// 1. Admin Login (check password = oshan123#)
app.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
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
    const apps = await getAllApps();
    res.json(apps);
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
    const newApp = await addApp({ name, version, description, downloadUrl, imageUrl, category });
    io.emit('apps-updated');
    res.json({ success: true, app: newApp });
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
    await deleteApp(req.params.id);
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
    const apps = await getAllApps();
    socket.emit('initial-apps', apps);
  } catch (err) {
    console.error('Error sending initial apps:', err);
  }

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected');
  });
});
