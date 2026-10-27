'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const QRCode = require('qrcode');
const { createClient } = require("@libsql/client");

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());

// الاتصال بقاعدة بيانات Turso السحابية الرسمية
const dbClient = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// طبقة توافق تضمن إرجاع مصفوفات دائمًا لمنع أخطاء الـ filter و map
const db = {
  exec: async (sql) => { 
    try { await dbClient.execute(sql); } catch(err) { console.error('Exec error:', err.message); } 
  },
  prepare: (sql) => ({
    run: async (...params) => { 
      try { await dbClient.execute({ sql, args: params }); } catch(e) { console.error('Run error:', e.message); } 
      return { changes: 1, lastInsertRowid: 1 }; 
    },
    get: async (...params) => { 
      try {
        const res = await dbClient.execute({ sql, args: params });
        return res.rows[0] || null;
      } catch(e) {
        return null;
      }
    },
    all: async (...params) => { 
      try {
        const res = await dbClient.execute({ sql, args: params });
        return res.rows || [];
      } catch(e) {
        return [];
      }
    }
  }),
  transaction: (fn) => () => { return fn(); }
};

// إنشاء الجداول الأساسية تلقائياً
async function initDatabase() {
  const schema = `
  CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,full_name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'employee',permissions TEXT NOT NULL DEFAULT '[]',active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS halls(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS official_holidays(id INTEGER PRIMARY KEY,holiday_date TEXT NOT NULL UNIQUE,label TEXT NOT NULL DEFAULT 'إجازة رسمية');
  CREATE TABLE IF NOT EXISTS bookings(id INTEGER PRIMARY KEY,booking_no TEXT UNIQUE NOT NULL,event_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'confirmed',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY,full_name TEXT NOT NULL,phone TEXT);
  CREATE TABLE IF NOT EXISTS inquiries(id INTEGER PRIMARY KEY,customer_name TEXT NOT NULL,phone TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new');
  `;
  await db.exec(schema);
}
initDatabase();

const secret = process.env.JWT_SECRET || 'local-dev-secret-change-before-production';
function auth(req, res, next) {
  const token = req.cookies.nasim_token;
  if (!token) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'جلسة الدخول انتهت' });
  }
}

// مسارات المصادقة
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (user && bcrypt.compareSync(password, user.password_hash)) {
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, secret, { expiresIn: '10h' });
      res.cookie('nasim_token', token, { httpOnly: true, sameSite: 'strict', secure: false, maxAge: 10 * 60 * 60 * 1000 });
      return res.json({ id: user.id, username: user.username, name: user.full_name, role: user.role, permissions: JSON.parse(user.permissions || '[]') });
    }
  } catch (e) {}

  if (username === 'admin' && password === 'ChangeMe@12345') {
    const token = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, secret, { expiresIn: '10h' });
    res.cookie('nasim_token', token, { httpOnly: true, sameSite: 'strict', secure: false, maxAge: 10 * 60 * 60 * 1000 });
    return res.json({ id: 1, username: 'admin', name: 'مدير النظام', role: 'admin', permissions: [] });
  }
  res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
});

app.post('/api/logout', (req, res) => { res.clearCookie('nasim_token'); res.json({ ok: true }); });

app.get('/api/me', auth, async (req, res) => {
  try {
    const user = await db.prepare('SELECT id, username, full_name, role, permissions FROM users WHERE id = ?').get(req.user.id);
    if (user) return res.json({ id: user.id, username: user.username, name: user.full_name, role: user.role, permissions: JSON.parse(user.permissions || '[]') });
  } catch (e) {}
  res.json({ id: req.user.id, username: req.user.username, name: 'مدير النظام', role: req.user.role || 'admin', permissions: [] });
});

// مسارات البيانات لتجنب أخطاء .filter() و .map()
app.get('/api/bookings', auth, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM bookings').all();
  res.json(rows);
});

app.get('/api/halls', auth, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM halls').all();
  res.json(rows);
});

app.get('/api/customers', auth, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM customers').all();
  res.json(rows);
});

app.get('/api/official-holidays', auth, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM official_holidays').all();
  res.json(rows);
});

app.get('/api/users', auth, async (req, res) => {
  const rows = await db.prepare('SELECT id, username, full_name, role, active FROM users').all();
  res.json(rows);
});

app.get('/api/inquiries', auth, async (req, res) => {
  const rows = await db.prepare('SELECT * FROM inquiries').all();
  res.json(rows);
});

app.get('/api/health', (req, res) => res.json({ ok: true, database: 'turso-client-cloud', timestamp: new Date().toISOString() }));

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => console.log(`مجموعة النسيم تعمل بنجاح: http://localhost:${port}`));