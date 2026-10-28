'use strict';
const express=require('express');const path=require('path');const fs=require('fs');const { Pool } = require('pg');const bcrypt=require('bcryptjs');const jwt=require('jsonwebtoken');const cookieParser=require('cookie-parser');const helmet=require('helmet');const QRCode=require('qrcode');
const app=express();app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:'20mb'}));app.use(cookieParser());

// الاتصال بـ PostgreSQL على Supabase باستخدام متغير البيئة DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// دالة مساعدة لتنفيذ الاستعلامات
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration >= 1000) {
    console.warn(`[أداء] استغرق الاستعلام ${duration}ms`);
  }
  return res;
}

// قياس الطلبات البطيئة
app.use((req,res,next)=>{const started=process.hrtime.bigint();res.on('finish',()=>{const ms=Number(process.hrtime.bigint()-started)/1e6;if(ms>=1000)console.warn(`[أداء] ${req.method} ${req.path} استغرق ${Math.round(ms)}ms (HTTP ${res.statusCode})`)});next()});

// إنشاء الجداول في PostgreSQL عند بدء التشغيل تلقائياً
async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,full_name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'employee',permissions TEXT NOT NULL DEFAULT '[]',active INTEGER NOT NULL DEFAULT 1,discount_normal REAL NOT NULL DEFAULT 0,discount_special REAL NOT NULL DEFAULT 0,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS halls(id SERIAL PRIMARY KEY,name TEXT UNIQUE NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS hall_packages(id SERIAL PRIMARY KEY,hall_id INTEGER NOT NULL REFERENCES halls(id),name TEXT NOT NULL,period TEXT NOT NULL,guest_count INTEGER NOT NULL,price REAL NOT NULL,start_time TEXT NOT NULL,end_time TEXT NOT NULL,terms TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS buffet_packages(id SERIAL PRIMARY KEY,name TEXT UNIQUE NOT NULL,price_per_person REAL NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS buffet_items(id SERIAL PRIMARY KEY,name TEXT UNIQUE NOT NULL,active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS buffet_package_items(package_id INTEGER NOT NULL REFERENCES buffet_packages(id) ON DELETE CASCADE,item_id INTEGER NOT NULL REFERENCES buffet_items(id),quantity REAL NOT NULL DEFAULT 1,PRIMARY KEY(package_id,item_id));
    CREATE TABLE IF NOT EXISTS addons(id SERIAL PRIMARY KEY,name TEXT UNIQUE NOT NULL,price_per_person REAL NOT NULL,active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS customers(id SERIAL PRIMARY KEY,full_name TEXT NOT NULL,phone TEXT,phone2 TEXT,id_number TEXT,nationality TEXT NOT NULL DEFAULT 'egyptian',notes TEXT,bride_name TEXT,contractor_name TEXT,address TEXT,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS bookings(id SERIAL PRIMARY KEY,booking_no TEXT UNIQUE NOT NULL,customer_id INTEGER REFERENCES customers(id),hall_id INTEGER NOT NULL REFERENCES halls(id),hall_package_id INTEGER NOT NULL REFERENCES hall_packages(id),event_date TEXT NOT NULL,start_time TEXT NOT NULL,end_time TEXT NOT NULL,guest_count INTEGER NOT NULL,nationality TEXT NOT NULL DEFAULT 'egyptian',deposit REAL NOT NULL DEFAULT 5000,deposit_refund_date TEXT,package_price REAL NOT NULL DEFAULT 0,buffet_total REAL NOT NULL DEFAULT 0,addons_total REAL NOT NULL DEFAULT 0,discount REAL NOT NULL DEFAULT 0,service_rate REAL NOT NULL DEFAULT 15,service_total REAL NOT NULL DEFAULT 0,event_total REAL NOT NULL DEFAULT 0,amount_due REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'confirmed',notes TEXT,created_by INTEGER REFERENCES users(id),created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,cancel_reason TEXT NOT NULL DEFAULT '',postponed_from_date TEXT,completed_at TIMESTAMP,special_discount REAL NOT NULL DEFAULT 0,extra_guest_total REAL NOT NULL DEFAULT 0,offer_id INTEGER,offer_discount REAL NOT NULL DEFAULT 0,buffet_discount REAL NOT NULL DEFAULT 0,package_offer_discount REAL NOT NULL DEFAULT 0,free_meals INTEGER NOT NULL DEFAULT 0,booking_stage TEXT NOT NULL DEFAULT 'preliminary',event_type TEXT NOT NULL DEFAULT 'wedding');
  `);
  // التحقق من وجود حساب مدير افتراضي
  const adminCheck = await query('SELECT id FROM users WHERE username=$1', ['admin']);
  if (adminCheck.rows.length === 0) {
    const hash = bcrypt.hashSync('ChangeMe@12345', 12);
    await query('INSERT INTO users(username,password_hash,full_name,role,permissions) VALUES($1,$2,$3,$4,$5)', 
      ['admin', hash, 'مدير النظام', 'admin', JSON.stringify(['dashboard','bookings','customers','halls','packages','buffet','addons','users','finance'])]);
  }
  console.log('تم فحص وإنشاء جداول قاعدة البيانات بنجاح على Supabase.');
}
initDB().catch(err => console.error('خطأ في إعداد قاعدة البيانات:', err));

const secret=process.env.JWT_SECRET||'local-dev-secret-change-before-production';

// باقي مسارات التطبيق تعمل بـ express...
app.get('/api/health',(req,res)=>res.json({ok:true,database:'postgresql',timestamp:new Date().toISOString()}));
app.use(express.static(path.join(__dirname,'public')));

const port=Number(process.env.PORT||3000);
app.listen(port,'0.0.0.0',()=>console.log(`مجموعة النسيم تعمل على السيرفر: http://localhost:${port}`));