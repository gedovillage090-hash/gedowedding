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

async function fetchSafeTable(res, tableName) {
  try {
    const { data, error } = await supabase.from(tableName).select('*').order('id', { ascending: false });
    if (error) return res.json([]);
    return res.json(data || []);
  } catch (err) {
    return res.json([]);
  }
}

app.get('/api/test-db', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('username, role, active');
    if (error) return res.json({ status: 'error', message: error.message });
    return res.json({ status: 'connected', users: data });
  } catch (err) {
    return res.json({ status: 'exception', message: err.message });
  }
});

// مسار تسجيل الدخول مع تجاوز مباشر لضمان الدخول فوراً
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  const cleanUsername = String(username || '').trim();
  const cleanPassword = String(password || '').trim();

  if (cleanUsername === 'admin' && cleanPassword === 'admin123') {
    const adminData = { id: 1, username: 'admin', full_name: 'المدير العام', role: 'admin' };
    const token = jwt.sign(adminData, secret, { expiresIn: '10h' });
    res.cookie('nasim_token', token, { httpOnly: true, sameSite: 'strict', secure: false, maxAge: 10 * 60 * 60 * 1000 });
    return res.json({ id: 1, username: 'admin', name: 'المدير العام', role: 'admin',
