const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
const MONGODB_URI = 'mongodb+srv://nima:nima@nimabot.gkpbhvh.mongodb.net';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// App Schema (for mod apps)
const appSchema = new mongoose.Schema({
  name: { type: String, required: true },
  version: { type: String, required: true },
  description: { type: String, required: true },
  downloadUrl: { type: String, required: true },
  imageUrl: { type: String, required: true },
  category: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const App = mongoose.model('App', appSchema);

// ---------- ROUTES ----------

// 1. Admin Login (password = oshan123#)
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;
  if (password === 'oshan123#') {
    return res.json({ success: true, message: 'Login successful' });
  } else {
    return res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

// 2. Get all apps (public)
app.get('/api/apps', async (req, res) => {
  try {
    const apps = await App.find().sort({ createdAt: -1 });
    res.json(apps);
  } catch (err) {
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
    // Validation
    if (!name || !version || !description || !downloadUrl || !imageUrl || !category) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const newApp = new App({ name, version, description, downloadUrl, imageUrl, category });
    await newApp.save();
    res.json({ success: true, app: newApp });
  } catch (err) {
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
    const deleted = await App.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'App not found' });
    }
    res.json({ success: true });
  } catch (err) {
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});