const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');

const app = express();
app.use(cors());
app.use(express.json());

// Session management for online users
app.use(session({
    secret: 'fixo_dev_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 300000 } // 5 minutes
}));

// MongoDB Connection
const MONGODB_URI = 'mongodb+srv://nima:nima@nimabot.gkpbhvh.mongodb.net/';
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: 'fixo_dev_modz'
})
.then(() => console.log('✅ MongoDB connected successfully!'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ==================== SCHEMAS ====================

// Mods Schema
const modSchema = new mongoose.Schema({
    name: { type: String, required: true },
    logo: { type: String, default: '📱' },
    version: { type: String, default: 'v1.0' },
    desc: { type: String, default: 'Premium modded app' },
    link: { type: String, default: '#' },
    createdAt: { type: Date, default: Date.now }
});
const Mod = mongoose.model('Mod', modSchema);

// Stats Schema
const statsSchema = new mongoose.Schema({
    totalVisitors: { type: Number, default: 0 },
    totalPageViews: { type: Number, default: 0 },
    totalDownloads: { type: Number, default: 0 },
    dailyData: { type: Map, of: Object, default: {} },
    lastReset: { type: String, default: () => new Date().toDateString() }
});
const Stats = mongoose.model('Stats', statsSchema);

// Online Sessions Schema (simplified)
const sessionSchema = new mongoose.Schema({
    sessionId: { type: String, unique: true },
    lastSeen: { type: Date, default: Date.now }
});
const Session = mongoose.model('Session', sessionSchema);

// ==================== API ROUTES ====================

// 1. Get all mods
app.get('/api/mods', async (req, res) => {
    try {
        const mods = await Mod.find().sort({ createdAt: -1 });
        res.json(mods);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Add a new mod
app.post('/api/mods', async (req, res) => {
    try {
        const { name, logo, version, desc, link } = req.body;
        const mod = new Mod({ name, logo, version, desc, link });
        await mod.save();
        res.json(mod);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Delete a mod
app.delete('/api/mods/:id', async (req, res) => {
    try {
        await Mod.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Get stats
app.get('/api/stats', async (req, res) => {
    try {
        let stats = await Stats.findOne();
        if (!stats) {
            stats = new Stats();
            await stats.save();
        }
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Update stats (track visitor)
app.post('/api/stats/visitor', async (req, res) => {
    try {
        const sessionId = req.session.id;
        const today = new Date().toISOString().split('T')[0];
        
        let stats = await Stats.findOne();
        if (!stats) {
            stats = new Stats();
        }
        
        // Check if session already tracked today
        const sessionKey = `visitor_${today}_${sessionId}`;
        if (!req.session[sessionKey]) {
            req.session[sessionKey] = true;
            stats.totalVisitors += 1;
            
            if (!stats.dailyData) stats.dailyData = new Map();
            const dayData = stats.dailyData.get(today) || { visitors: 0, views: 0, downloads: 0 };
            dayData.visitors += 1;
            stats.dailyData.set(today, dayData);
            
            await stats.save();
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 6. Track page view
app.post('/api/stats/pageview', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        let stats = await Stats.findOne();
        if (!stats) stats = new Stats();
        
        stats.totalPageViews += 1;
        if (!stats.dailyData) stats.dailyData = new Map();
        const dayData = stats.dailyData.get(today) || { visitors: 0, views: 0, downloads: 0 };
        dayData.views += 1;
        stats.dailyData.set(today, dayData);
        
        await stats.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. Track download
app.post('/api/stats/download', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        let stats = await Stats.findOne();
        if (!stats) stats = new Stats();
        
        stats.totalDownloads += 1;
        if (!stats.dailyData) stats.dailyData = new Map();
        const dayData = stats.dailyData.get(today) || { visitors: 0, views: 0, downloads: 0 };
        dayData.downloads += 1;
        stats.dailyData.set(today, dayData);
        
        await stats.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 8. Online users
app.get('/api/online', async (req, res) => {
    try {
        const fiveMinutesAgo = new Date(Date.now() - 300000);
        await Session.deleteMany({ lastSeen: { $lt: fiveMinutesAgo } });
        
        // Update current session
        const sessionId = req.session.id;
        await Session.findOneAndUpdate(
            { sessionId },
            { lastSeen: new Date() },
            { upsert: true }
        );
        
        const count = await Session.countDocuments();
        res.json({ online: count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 9. Reset stats (admin only - optional)
app.post('/api/stats/reset', async (req, res) => {
    try {
        await Stats.deleteMany({});
        const stats = new Stats();
        await stats.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 MongoDB connected to fixo_dev_modz database`);
});
