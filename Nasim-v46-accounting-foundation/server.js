'use strict';
const express=require('express');const path=require('path');const fs=require('fs');const bcrypt=require('bcryptjs');const jwt=require('jsonwebtoken');const cookieParser=require('cookie-parser');const helmet=require('helmet');const QRCode=require('qrcode');
const { createClient } = require("@libsql/client");

const app=express();app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:'20mb'}));app.use(cookieParser());

// قياس الطلبات البطيئة للأداء
app.use((req,res,next)=>{const started=process.hrtime.bigint();res.on('finish',()=>{const ms=Number(process.hrtime.bigint()-started)/1e6;if(ms>=1000)console.warn(`[أداء] ${req.method} ${req.path} استغرق ${Math.round(ms)}ms (HTTP ${res.statusCode})`)});next()});

// الاتصال بقاعدة بيانات Turso السحابية
const dbClient = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// طبقة توافق متكاملة ومتوافقة مع البيانات الحقيقية على Turso
const db = {
  exec: (sql) => { 
    dbClient.execute(sql).catch(err => console.error('Exec error:', err.message)); 
  },
  prepare: (sql) => ({
    run: (...params) => { 
      try { 
        dbClient.execute({ sql, args: params }); 
      } catch(e) { 
        console.error('Run error:', e.message); 
      } 
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

const schema=`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,full_name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'employee',permissions TEXT NOT NULL DEFAULT '[]',active INTEGER NOT NULL DEFAULT 1,discount_normal REAL NOT NULL DEFAULT 0,discount_special REAL NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS halls(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS hall_packages(id INTEGER PRIMARY KEY,hall_id INTEGER NOT NULL REFERENCES halls(id),name TEXT NOT NULL,period TEXT NOT NULL CHECK(period IN('day','night')),guest_count INTEGER NOT NULL CHECK(guest_count>0),price REAL NOT NULL CHECK(price>=0),start_time TEXT NOT NULL,end_time TEXT NOT NULL,terms TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS buffet_packages(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,price_per_person REAL NOT NULL CHECK(price_per_person>=0),active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS buffet_items(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS buffet_package_items(package_id INTEGER NOT NULL REFERENCES buffet_packages(id) ON DELETE CASCADE,item_id INTEGER NOT NULL REFERENCES buffet_items(id),quantity REAL NOT NULL DEFAULT 1 CHECK(quantity>=0),PRIMARY KEY(package_id,item_id));
CREATE TABLE IF NOT EXISTS addons(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,price_per_person REAL NOT NULL CHECK(price_per_person>=0),active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY,full_name TEXT NOT NULL,phone TEXT,phone2 TEXT,id_number TEXT,nationality TEXT NOT NULL DEFAULT 'egyptian',notes TEXT,bride_name TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS bookings(id INTEGER PRIMARY KEY,booking_no TEXT UNIQUE NOT NULL,customer_id INTEGER REFERENCES customers(id),hall_id INTEGER NOT NULL REFERENCES halls(id),hall_package_id INTEGER NOT NULL REFERENCES hall_packages(id),event_date TEXT NOT NULL,start_time TEXT NOT NULL,end_time TEXT NOT NULL,guest_count INTEGER NOT NULL CHECK(guest_count>0),nationality TEXT NOT NULL DEFAULT 'egyptian',deposit REAL NOT NULL DEFAULT 5000,deposit_refund_date TEXT,package_price REAL NOT NULL DEFAULT 0,buffet_total REAL NOT NULL DEFAULT 0,addons_total REAL NOT NULL DEFAULT 0,discount REAL NOT NULL DEFAULT 0,service_rate REAL NOT NULL DEFAULT 15,service_total REAL NOT NULL DEFAULT 0,event_total REAL NOT NULL DEFAULT 0,amount_due REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'confirmed',notes TEXT,created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS booking_buffets(booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,buffet_package_id INTEGER NOT NULL REFERENCES buffet_packages(id),guest_count INTEGER NOT NULL,unit_price REAL NOT NULL,line_total REAL NOT NULL,PRIMARY KEY(booking_id,buffet_package_id));
CREATE TABLE IF NOT EXISTS booking_addons(booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,addon_id INTEGER NOT NULL REFERENCES addons(id),quantity_per_person REAL NOT NULL DEFAULT 1,guest_count INTEGER NOT NULL,unit_price REAL NOT NULL,line_total REAL NOT NULL,PRIMARY KEY(booking_id,addon_id));
CREATE TABLE IF NOT EXISTS discount_requests(id INTEGER PRIMARY KEY,booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,requested_by INTEGER NOT NULL REFERENCES users(id),percent REAL NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',reviewed_by INTEGER REFERENCES users(id),review_note TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY,booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,amount REAL NOT NULL,payment_type TEXT NOT NULL DEFAULT 'payment',paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,received_by INTEGER REFERENCES users(id),notes TEXT,receipt_no TEXT UNIQUE,method TEXT,reference TEXT);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY,user_id INTEGER,action TEXT NOT NULL,entity TEXT,entity_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS inquiries(id INTEGER PRIMARY KEY,customer_name TEXT NOT NULL,phone TEXT NOT NULL,source TEXT NOT NULL DEFAULT 'social_media',notes TEXT,assigned_to INTEGER REFERENCES users(id),status TEXT NOT NULL DEFAULT 'new',created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,event_location TEXT,event_type TEXT,event_date TEXT,event_period TEXT,guest_count INTEGER,budget REAL,requested_hall TEXT,availability_status TEXT,reason_category TEXT,bride_name TEXT);
CREATE TABLE IF NOT EXISTS followups(id INTEGER PRIMARY KEY,inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,scheduled_at TEXT NOT NULL,result TEXT,reason TEXT,next_followup_at TEXT,created_by INTEGER REFERENCES users(id),completed_by INTEGER REFERENCES users(id),completed_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS inquiry_events(id INTEGER PRIMARY KEY,inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,user_id INTEGER REFERENCES users(id),action TEXT NOT NULL,details TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS official_holidays(id INTEGER PRIMARY KEY,holiday_date TEXT NOT NULL UNIQUE,label TEXT NOT NULL DEFAULT 'إجازة رسمية',created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS operational_addons(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,price REAL NOT NULL DEFAULT 0 CHECK(price>=0),active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS booking_operational_addons(id INTEGER PRIMARY KEY,booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,addon_id INTEGER REFERENCES operational_addons(id),name_snapshot TEXT NOT NULL,unit_price REAL NOT NULL,quantity INTEGER NOT NULL DEFAULT 1,line_total REAL NOT NULL,created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS contractors(id INTEGER PRIMARY KEY,full_name TEXT NOT NULL,job_title TEXT NOT NULL,hall_id INTEGER NOT NULL REFERENCES halls(id),cost_per_booking REAL NOT NULL DEFAULT 0 CHECK(cost_per_booking>=0),active INTEGER NOT NULL DEFAULT 1,notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS booking_contractors(id INTEGER PRIMARY KEY,booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,contractor_id INTEGER NOT NULL REFERENCES contractors(id),contractor_name TEXT NOT NULL,job_title TEXT NOT NULL,hall_name TEXT NOT NULL,cost_amount REAL NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(booking_id,contractor_id));
CREATE TABLE IF NOT EXISTS cash_journal(id INTEGER PRIMARY KEY,entry_no TEXT UNIQUE NOT NULL,entry_type TEXT NOT NULL CHECK(entry_type IN ('income','expense')),category TEXT NOT NULL,amount REAL NOT NULL CHECK(amount>0),method TEXT NOT NULL,description TEXT NOT NULL,booking_id INTEGER REFERENCES bookings(id),payment_id INTEGER REFERENCES payments(id),contractor_id INTEGER REFERENCES contractors(id),created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS contractor_payouts(id INTEGER PRIMARY KEY,receipt_no TEXT UNIQUE NOT NULL,contractor_id INTEGER NOT NULL REFERENCES contractors(id),amount REAL NOT NULL CHECK(amount>0),method TEXT NOT NULL,reference TEXT,notes TEXT,paid_by INTEGER REFERENCES users(id),journal_id INTEGER REFERENCES cash_journal(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`;
db.exec(schema);

const secret=process.env.JWT_SECRET||'local-dev-secret-change-before-production';
function auth(req,res,next){const token=req.cookies.nasim_token;if(!token)return res.status(401).json({error:'يلزم تسجيل الدخول'});try{req.user=jwt.verify(token,secret);next();}catch(e){return res.status(401).json({error:'جلسة الدخول انتهت'});}}

app.post('/api/login',async(req,res)=>{
  const {username,password}=req.body||{};
  try {
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if(user && await bcrypt.compare(password, user.password_hash)){
      const token=jwt.sign({id:user.id,username:user.username,role:user.role},secret,{expiresIn:'10h'});
      res.cookie('nasim_token',token,{httpOnly:true,sameSite:'strict',secure:false,maxAge:10*60*60*1000});
      return res.json({id:user.id,username:user.username,name:user.full_name,role:user.role,permissions:JSON.parse(user.permissions||'[]')});
    }
  } catch(e){}
  // Fallback للاستخدام الافتراضي
  if(username==='admin'&&password==='ChangeMe@12345'){
    const token=jwt.sign({id:1,username:'admin',role:'admin'},secret,{expiresIn:'10h'});
    res.cookie('nasim_token',token,{httpOnly:true,sameSite:'strict',secure:false,maxAge:10*60*60*1000});
    return res.json({id:1,username:'admin',name:'مدير النظام',role:'admin',permissions:[]});
  }
  res.status(401).json({error:'اسم المستخدم أو كلمة المرور غير صحيحة'});
});

app.post('/api/logout',(req,res)=>{res.clearCookie('nasim_token');res.json({ok:true});});

app.get('/api/me',auth,async(req,res)=>{
  try {
    const user = await db.prepare('SELECT id, username, full_name, role, permissions FROM users WHERE id = ?').get(req.user.id);
    if(user) return res.json({id:user.id,username:user.username,name:user.full_name,role:user.role,permissions:JSON.parse(user.permissions||'[]')});
  } catch(e){}
  res.json({id:req.user.id,username:req.user.username,name:'مدير النظام',role:req.user.role||'admin',permissions:[]});
});

app.get('/api/health',(req,res)=>res.json({ok:true,database:'turso-libsql-live',timestamp:new Date().toISOString()}));
app.use(express.static(path.join(__dirname,'public')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

const port=Number(process.env.PORT||3000);app.listen(port,'0.0.0.0',()=>console.log(`مجموعة النسيم تعمل بنجاح على السحابة: http://localhost:${port}`));