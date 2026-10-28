// Branded in-app input dialog: replaces native browser prompt dialogs.
window.appPrompt = (message, initialValue = '') => new Promise(resolve => {
  const old = document.getElementById('appPromptOverlay'); if (old) old.remove();
  const overlay = document.createElement('div'); overlay.id = 'appPromptOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(10,25,40,.58);display:flex;align-items:center;justify-content:center;padding:18px;';
  const box = document.createElement('div'); box.dir = 'rtl';
  box.style.cssText = 'width:min(520px,96vw);background:#f5f8fc;color:#183b58;border-radius:18px;padding:24px;box-shadow:0 18px 60px #0005;font-family:inherit;';
  const title = document.createElement('h3'); title.textContent = 'إدخال البيانات'; title.style.cssText='margin:0 0 14px;font-size:20px;';
  const label = document.createElement('p'); label.textContent = message; label.style.cssText='white-space:pre-wrap;line-height:1.8;margin:0 0 14px;';
  const input = document.createElement('textarea'); input.value = initialValue ?? ''; input.rows = message.includes('القائمة') ? 1 : 2; input.style.cssText='box-sizing:border-box;width:100%;padding:12px;border:1px solid #cbd9e8;border-radius:10px;background:white;color:#183b58;font:inherit;';
  const actions = document.createElement('div'); actions.style.cssText='display:flex;gap:10px;justify-content:flex-start;margin-top:18px;';
  const done = document.createElement('button'); done.textContent='تأكيد'; done.style.cssText='border:0;border-radius:10px;background:#19415f;color:white;padding:11px 20px;font:inherit;cursor:pointer;';
  const cancel = document.createElement('button'); cancel.textContent='إلغاء'; cancel.style.cssText='border:1px solid #d7e2ee;border-radius:10px;background:#eaf1f8;color:#183b58;padding:11px 20px;font:inherit;cursor:pointer;';
  let settled=false; const finish = value => { if(settled)return; settled=true; overlay.remove(); resolve(value); };
  done.onclick=()=>finish(input.value); cancel.onclick=()=>finish(null); overlay.onclick=e=>{if(e.target===overlay)finish(null)};
  input.onkeydown=e=>{if(e.key==='Escape')finish(null); if(e.key==='Enter'&&!e.shiftKey&&!message.includes('القائمة')){e.preventDefault();finish(input.value)}};
  actions.append(done,cancel); box.append(title,label,input,actions); overlay.append(box); document.body.append(overlay); input.focus();
});

const $=s=>document.querySelector(s);
let me=null, page='dashboard', cache={}, financeAutoRefreshTimer=null;

const PERMS=['dashboard','offers','followups','inquiry_register','bookings','booking_archive','customers','halls','packages','buffet','addons','operations_addons','contractors','work_orders','contractor_report','cashbox','expenses','finance','reports','users','discounts','booking_change_approvals','inventory','sales_performance','print_contract_initial','print_contract_final','accounting','delete_inquiries','delete_bookings','delete_reports','delete_all_data','delete_collections','delete_cash_journal','delete_inventory','delete_halls','delete_packages','delete_buffet','delete_addons','delete_operations_addons','delete_contractors','notify_followups','notify_finance','notify_discounts','notify_system'];

const labels={dashboard:'لوحة المتابعة',followups:'الاستفسارات والمتابعة',inquiry_register:'سجل الاستفسارات والمتابعة',bookings:'الحجوزات',booking_archive:'سجل الحجوزات المكتملة والمؤجلة والملغاة',customers:'العملاء',halls:'القاعات',packages:'باكدجات القاعات',buffet:'باكدجات البوفيه وأصنافها',addons:'إضافات البوفيه',operations_addons:'إضافات التشغيل',contractors:'إضافة المتعهدين',work_orders:'أوامر الشغل',contractor_report:'تقرير المتعهدين',cashbox:'حركة الخزنة / اليومية',expenses:'المصروفات والمشتريات',finance:'تحصيل النقدية',reports:'التقارير',users:'الموظفون والصلاحيات',discounts:'طلبات الخصم الإضافية',booking_change_approvals:'طلبات تعديل الموعد أو إلغاء الحجز',inventory:'المخزن',offers:'العروض',sales_performance:'أداء مبيعات الموظفين',print_contract_initial:'طباعة العقد الابتدائي',print_contract_final:'طباعة العقد النهائي',accounting:'المحاسبة العامة',delete_inquiries:'حذف الاستفسارات والمتابعات',delete_bookings:'حذف الحجوزات',delete_reports:'حذف التقارير المحفوظة',delete_all_data:'صلاحية الحذف الشامل',delete_collections:'مسح سجلات التحصيل',delete_cash_journal:'مسح قيود الخزنة والمصروفات',delete_inventory:'مسح أصناف المخزن',delete_halls:'مسح القاعات',delete_packages:'مسح باكدجات القاعات',delete_buffet:'مسح باكدجات وأصناف البوفيه',delete_addons:'مسح إضافات البوفيه',delete_operations_addons:'مسح إضافات التشغيل',delete_contractors:'مسح/تعطيل المتعهدين',notify_followups:'تنبيهات الاستفسارات ومواعيد المتابعة',notify_finance:'تنبيهات الخزنة والتحصيل',notify_discounts:'تنبيهات الخصومات والموافقات',notify_system:'تنبيهات العمليات العامة بالنظام'};

const permissionModules=PERMS.filter(p=>!p.startsWith('delete_')&&!p.startsWith('notify_'));

const permissionChecklist=(includeActions=true)=>`<div class="permission-toolbar"><span>حدد مستوى الوصول لكل وظيفة</span><button type="button" class="secondary" onclick="setAllPermissionModes(this.closest('.checklist'),'none')">إلغاء الكل</button><button type="button" class="secondary" onclick="setAllPermissionModes(this.closest('.checklist'),'read')">قراءة فقط للكل</button></div><div class="permission-grid">${permissionModules.map(p=>`<div class="permission-row"><strong>${labels[p]||p}</strong><div class="permission-mode"><span class="permission-mode-caption">مستوى الوصول</span><select aria-label="مستوى الوصول: ${labels[p]\vert{}\vert{}p}" name="permission_mode" data-permission="${p}"><option value="none">ممنوع</option><option value="read">قراءة فقط</option><option value="edit">قراءة وتعديل</option></select></div></div>`).join('')}</div>${includeActions?`<h4 class="permission-actions-title">صلاحيات خاصة وحساسة</h4><div class="permission-actions-grid">${PERMS.filter(p=>p.startsWith('delete_')||p.startsWith('notify_')).map(p=>`<label><input type="checkbox" name="permissions" value="${p}">${labels[p]||p}</label>`).join('')}</div>`:''}`;

window.setAllPermissionModes=(root,mode)=>root?.querySelectorAll('select[name=permission_mode]').forEach(x=>{if(!x.disabled)x.value=mode});

function readPermissionForm(form){const out=[];form.querySelectorAll('select[name=permission_mode]').forEach(x=>{if(x.value==='read')out.push(x.dataset.permission);if(x.value==='edit')out.push(x.dataset.permission,'edit_'+x.dataset.permission)});form.querySelectorAll('input[name=permissions]:checked').forEach(x=>out.push(x.value));return [...new Set(out)];}

// دالة api النهائية الذكية: تحول أي استجابة إلى مصفوفة تدعم .filter و .map بالكامل
async function api(url,opts={}){
  const r=await fetch('/api'+url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'حدث خطأ');
  
  const rawArr = Array.isArray(d) ? d : (d.allRows || d.data || d.rows || d.buffets || d.items || d.archive || d.list || null);
  if (rawArr && Array.isArray(rawArr)) {
    const arr = [...rawArr];
    for (const k in d) {
      if (arr[k] === undefined) arr[k] = d[k];
    }
    return arr;
  }
  return d;
}

function asRows(value){
  if(Array.isArray(value))return value;
  if(value&&Array.isArray(value.rows))return value.rows;
  if(value&&Array.isArray(value.data))return value.data;
  if(value&&Array.isArray(value.allRows))return value.allRows;
  if(value&&Array.isArray(value.buffets))return value.buffets;
  if(value&&Array.isArray(value.requests))return value.requests;
  if(value&&Array.isArray(value.items))return value.items;
  if(value&&Array.isArray(value.archive))return value.archive;
  if(value&&Array.isArray(value.list))return value.list;
  return []
}

function notice(msg,bad=false){$('#notice').innerHTML=`<div class="notice ${bad?'bad':''}">${esc(msg)}</div>`;setTimeout(()=>$('#notice').innerHTML='',4500)}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function formatTime12(value){const s=String(value??'').trim();const m=s.match(/^(\d{1,2}):(\d{2})/);if(!m)return s||'—';let h=Number(m[1]);const mm=m[2];if(h<0||h>23)return s;const ap=h>=12?'م':'ص';h=h%12||12;return `${h}:${mm} ${ap}`}
function money(v){return (Number(v)||0).toLocaleString('ar-EG',{maximumFractionDigits:2})+' ج.م'}

function downloadExcel(filename,title,headers,rows){
  const xmlEsc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const tableRows=[`<tr class="title"><th colspan="${headers.length}">${xmlEsc(title)}</th></tr>`,`<tr class="meta"><td colspan="${headers.length}">تاريخ التصدير: ${xmlEsc(new Date().toLocaleString('ar-EG'))}</td></tr>`,`<tr class="head">${headers.map(h=>`<th>${xmlEsc(h)}</th>`).join('')}</tr>`,...rows.map((r,i)=>`<tr class="${i\%2?'odd':'even'}">${r.map(v=>`<td>${xmlEsc(v)}</td>`).join('')}</tr>`)];
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Tahoma,Arial,sans-serif;color:#20364b}table{border-collapse:collapse;width:100%;direction:rtl}td,th{border:1px solid #d6e0eb;padding:8px 10px;text-align:right;vertical-align:top;white-space:pre-wrap;mso-number-format:"\@"}.title th{background:#173e5b;color:#fff;font-size:18pt;padding:16px}.meta td{background:#edf3f8;color:#52677a}.head th{background:#245b7a;color:#fff;font-weight:bold}.odd td{background:#f3f7fb}.even td{background:#fff}tr{mso-height-source:auto}</style></head><body><table>${tableRows.join('')}</table></body></html>`;
  const blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename.replace(/\.csv$/i,'.xls');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)
}

function downloadCsv(filename,rows){
  const cell=v=>{let s=String(v??'');if(/^[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
  const csv='\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);notice('تم تجهيز ملف جدول بيانات بصيغة متوافقة مع إكسل؛ افتحه ببرنامج الجداول')
}

function allowed(p){
  if(p==='day_bookings')return me?.role==='admin'||me?.permissions?.includes('bookings');
  if(p==='inquiry_register')return me?.role==='admin'||me?.permissions?.includes('followups')||me?.permissions?.includes('inquiry_register');
  if(p==='booking_change_approvals')return me?.role==='admin';
  if(p==='sales_performance')return true;
  if(p==='expenses')return me?.role==='admin'||me?.permissions?.includes('expenses')||me?.permissions?.includes('edit_expenses');
  if(p==='cashbox')return me?.role==='admin'||me?.permissions?.includes('cashbox')||me?.permissions?.includes('edit_cashbox');
  if(p==='booking_archive')return me?.role==='admin'||me?.permissions?.includes('bookings');
  if(p==='notifications')return me?.role==='admin'||['notify_followups','notify_finance','notify_discounts','notify_system'].some(k=>me?.permissions?.includes(k));
  return me?.role==='admin'||me?.permissions?.includes(p)||me?.permissions?.includes('edit_'+p)
}

function applyCurrentPermissionsToNav(){
  document.querySelectorAll('#nav button[data-page]').forEach(b=>{b.hidden=!allowed(b.dataset.page)});
  document.querySelectorAll('.nav-group').forEach(g=>{const sub=g.querySelector('.nav-subgroup');if(!sub)return;g.hidden=![...sub.querySelectorAll('[data-page]')].some(b=>allowed(b.dataset.page));});
}

$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.submitter||e.target.querySelector('button[type=submit],button');btn.disabled=true;btn.textContent='جارٍ تسجيل الدخول...';$('#loginError').textContent='';
  try{me=await api('/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});$('#login').hidden=true;$('#app').hidden=false;await boot()}catch(err){$('#loginError').textContent=err.message\vert{}\vert{}'تعذر تسجيل الدخول';if(me){$('#login').hidden=true;$('#app').hidden=false;$('#page').innerHTML=`<div class="panel error">تم تسجيل الدخول لكن تعذر تحميل لوحة التحكم: ${esc(err.message)}. حدّث الصفحة أو راجع نافذة السيرفر.</div>`}}finally{btn.disabled=false;btn.textContent='تسجيل الدخول'}
});

async function getFollowupReminderNotifications(){
  if(!allowed('followups')||!(me?.role==='admin'||me?.permissions?.includes('notify_followups')))return [];
  try{const data=await api('/followups'),rows=asRows(data),now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;return rows.filter(f=>{const d=new Date(f.scheduled_at);if(Number.isNaN(d.getTime()))return false;const day=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return day<=today}).map(f=>({id:-Number(f.id),reminder:true,action:'followup_reminder',title:new Date(f.scheduled_at)<now?'متابعة عميل متأخرة':'موعد متابعة عميل اليوم',details:`العميل: ${f.customer_name||'—'} · الموبايل: ${f.phone||'—'} · موعد المتابعة: ${new Date(f.scheduled_at).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'})} · الحالة: ${f.inquiry_status||'يحتاج متابعة'}`,employee:f.employee||'خدمة العملاء',created_at:f.scheduled_at,inquiry_id:f.inquiry_id,scheduled_at:f.scheduled_at})).sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at))}catch{return []}
}

async function refreshBell(){
  try{const base=asRows(await api('/notifications')),reminders=await getFollowupReminderNotifications(),rows=[...reminders,...base];const menu=$('#bellItems'),count=$('#bellCount');if(!menu)return;const key='nasim_seen_notifications_'+(me?.id||me?.username||'user');let seen=[];try{seen=JSON.parse(localStorage.getItem(key)||'[]')}catch{}const unread=rows.filter(n=>!seen.includes(Number(n.id)));count.textContent=unread.length;count.hidden=!unread.length;menu.innerHTML=rows.length?rows.slice(0,8).map(n=>`<button type="button" class="bell-item ${n.reminder?'bell-reminder-item':''}" onclick="${n.reminder?'show(\'followups\')':'openNotificationPage()'}"><b>${n.reminder?'🔔 ':''}${esc(n.title||'عملية بالنظام')}</b><span>${esc(n.details||'تم تسجيل عملية بالنظام')}</span><small>${esc(n.employee||'النظام')} · ${esc(new Date(n.created_at).toLocaleString('ar-EG'))}</small></button>`).join(''):'<p class="muted bell-empty">لا توجد تنبيهات مسجلة.</p>'}catch{}
}

window.openNotificationPage=()=>{if($('#bellMenu'))$('#bellMenu').hidden=true;show('notifications')};

$('#notificationBell')?.addEventListener('click',async()=>{await refreshBell();const menu=$('#bellMenu');menu.hidden=!menu.hidden;if(!menu.hidden){try{const rows=asRows(await api('/notifications'));const key='nasim_seen_notifications_'+(me?.id||me?.username||'user');const seen=new Set(JSON.parse(localStorage.getItem(key)||'[]'));rows.forEach(n=>seen.add(Number(n.id)));localStorage.
