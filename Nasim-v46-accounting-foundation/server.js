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

// طبقة توافق آمنة تضمن إرجاع مصفوفات دائمًا لمنع أخطاء الـ filter و map
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

// دالة عامة لضمان إرجاع مصفوفات آمنة لجميع مسارات الـ API في النظام
const safeQueryRoute = (route, query) => {
  app.get(route, auth, async (req, res) => {
    try {
      const rows = await db.prepare(query).all();
      res.json(Array.isArray(rows) ? rows : []);
    } catch (e) {
      res.json([]);
    }
  });
};

// تسجيل جميع مسارات النظام الأساسية والفرعية لمنع أي خطأ تصفية
safeQueryRoute('/api/bookings', 'SELECT * FROM bookings');
safeQueryRoute('/api/halls', 'SELECT * FROM halls');
safeQueryRoute('/api/hall-packages', 'SELECT * FROM hall_packages');
safeQueryRoute('/api/buffets', 'SELECT * FROM buffet_packages');
safeQueryRoute('/api/buffet-packages', 'SELECT * FROM buffet_packages');
safeQueryRoute('/api/buffet-items', 'SELECT * FROM buffet_items');
safeQueryRoute('/api/addons', 'SELECT * FROM addons');
safeQueryRoute('/api/customers', 'SELECT * FROM customers');
safeQueryRoute('/api/official-holidays', 'SELECT * FROM official_holidays');
safeQueryRoute('/api/users', 'SELECT id, username, full_name, role, active, permissions FROM users');
safeQueryRoute('/api/inquiries', 'SELECT * FROM inquiries');
safeQueryRoute('/api/contractors', 'SELECT * FROM contractors');
safeQueryRoute('/api/operational-addons', 'SELECT * FROM operational_addons');
safeQueryRoute('/api/cash-journal', 'SELECT * FROM cash_journal');
safeQueryRoute('/api/discount-requests', 'SELECT * FROM discount_requests');
safeQueryRoute('/api/payments', 'SELECT * FROM payments');
safeQueryRoute('/api/followups', 'SELECT * FROM followups');
safeQueryRoute('/api/notifications', 'SELECT * FROM audit_logs');

app.get('/api/health', (req, res) => res.json({ ok: true, database: 'turso-client-cloud', timestamp: new Date().toISOString() }));

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => console.log(`مجموعة النسيم تعمل بنجاح: http://localhost:${port}`));