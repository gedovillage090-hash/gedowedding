'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());

// إعداد اتصال Supabase
let rawUrl = process.env.SUPABASE_URL || 'https://iunfggqlwjvijmrirmgl.supabase.co';
const SUPABASE_URL = rawUrl.replace(/[\[\]]/g, '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_KEY || 'sb_secret_zD5B4amgiuR-ZVB7b55TdQ_G_7_oCq8').trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

// دالة جلب البيانات مع حماية تامة
async function fetchSafeTable(res, tableName) {
  try {
    const { data, error } = await supabase.from(tableName).select('*').order('id', { ascending: false });
    if (error) return res.json([]);
    return res.json(data || []);
  } catch (err) {
    return res.json([]);
  }
}

// مسار تسجيل الدخول المحدث (يقبل الكلمة المشفرة أو العادية)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  try {
    const { data: u, error } = await supabase.from('users').select('*').eq('username', String(username || '')).eq('active', 1).single();
    
    if (error || !u) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const isValid = bcrypt.compareSync(String(password || ''), u.password_hash) || String(password) === String(u.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    const token = jwt.sign({ id: u.id, username: u.username, full_name: u.full_name, role: u.role }, secret, { expiresIn: '10h' });
    res.cookie('nasim_token', token, { httpOnly: true, sameSite: 'strict', secure: false, maxAge: 10 * 60 * 60 * 1000 });
    res.json({ id: u.id, username: u.username, name: u.full_name, role: u.role, permissions: JSON.parse(u.permissions || '[]') });
  } catch (e) {
    res.status(500).json({ error: 'خطأ في الاتصال بقاعدة البيانات' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('nasim_token');
  res.json({ ok: true });
});

app.get('/api/me', auth, async (req, res) => {
  try {
    const { data: u } = await supabase.from('users').select('*').eq('id', req.user.id).single();
    if (!u) return res.status(401).json({ error: 'المستخدم غير موجود' });
    res.json({ id: u.id, username: u.username, name: u.full_name, role: u.role, permissions: JSON.parse(u.permissions || '[]') });
  } catch (e) {
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

// المسارات
app.get('/api/bookings', auth, (req, res) => fetchSafeTable(res, 'bookings'));
app.get('/api/booking_archive', auth, (req, res) => fetchSafeTable(res, 'booking_archive'));
app.get('/api/halls', auth, (req, res) => fetchSafeTable(res, 'halls'));
app.get('/api/packages', auth, (req, res) => fetchSafeTable(res, 'packages'));
app.get('/api/buffet_packages', auth, (req, res) => fetchSafeTable(res, 'buffet_packages'));
app.get('/api/buffet_items', auth, (req, res) => fetchSafeTable(res, 'buffet_items'));
app.get('/api/buffet_addons', auth, (req, res) => fetchSafeTable(res, 'buffet_addons'));
app.get('/api/addons', auth, (req, res) => fetchSafeTable(res, 'addons'));
app.get('/api/contractors', auth, (req, res) => fetchSafeTable(res, 'contractors'));
app.get('/api/expenses', auth, (req, res) => fetchSafeTable(res, 'expenses'));
app.get('/api/inquiries', auth, (req, res) => fetchSafeTable(res, 'inquiries'));
app.get('/api/notifications', auth, (req, res) => fetchSafeTable(res, 'notifications'));
app.get('/api/safe_transactions', auth, (req, res) => fetchSafeTable(res, 'safe_transactions'));
app.get('/api/inventory', auth, (req, res) => fetchSafeTable(res, 'inventory'));
app.get('/api/work_orders', auth, (req, res) => fetchSafeTable(res, 'work_orders'));
app.get('/api/offers', auth, (req, res) => fetchSafeTable(res, 'offers'));

app.get('/api/health', (req, res) => res.json({ ok: true, database: 'supabase', timestamp: new Date().toISOString() }));

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => console.log(`مجموعة النسيم تعمل عبر سحابة Supabase: http://localhost:${port}`));
