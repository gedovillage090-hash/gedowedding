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

const permissionChecklist=(includeActions=true)=>`<div class="permission-toolbar"><span>حدد مستوى الوصول لكل وظيفة</span><button type="button" class="secondary" onclick="setAllPermissionModes(this.closest('.checklist'),'none')">إلغاء الكل</button><button type="button" class="secondary" onclick="setAllPermissionModes(this.closest('.checklist'),'read')">قراءة فقط للكل</button></div><div class="permission-grid">${permissionModules.map(p=>`<div class="permission-row"><strong>${labels[p]||p}</strong><div class="permission-mode"><span class="permission-mode-caption">مستوى الوصول</span><select aria-label="مستوى الوصول: ${labels[p]||p}" name="permission_mode" data-permission="${p}"><option value="none">ممنوع</option><option value="read">قراءة فقط</option><option value="edit">قراءة وتعديل</option></select></div></div>`).join('')}</div>${includeActions?`<h4 class="permission-actions-title">صلاحيات خاصة وحساسة</h4><div class="permission-actions-grid">${PERMS.filter(p=>p.startsWith('delete_')||p.startsWith('notify_')).map(p=>`<label><input type="checkbox" name="permissions" value="${p}">${labels[p]||p}</label>`).join('')}</div>`:''}`;

window.setAllPermissionModes=(root,mode)=>root?.querySelectorAll('select[name=permission_mode]').forEach(x=>{if(!x.disabled)x.value=mode});

function readPermissionForm(form){const out=[];form.querySelectorAll('select[name=permission_mode]').forEach(x=>{if(x.value==='read')out.push(x.dataset.permission);if(x.value==='edit')out.push(x.dataset.permission,'edit_'+x.dataset.permission)});form.querySelectorAll('input[name=permissions]:checked').forEach(x=>out.push(x.value));return [...new Set(out)];}

async function api(url,opts={}){const r=await fetch('/api'+url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'حدث خطأ');return d}

// الدالة المعدلة والآمنة 100% التي تدعم allRows و buffets وكل الأشكال لتجنب أخطاء map و filter
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
  const tableRows=[`<tr class="title"><th colspan="${headers.length}">${xmlEsc(title)}</th></tr>`,`<tr class="meta"><td colspan="${headers.length}">تاريخ التصدير: ${xmlEsc(new Date().toLocaleString('ar-EG'))}</td></tr>`,`<tr class="head">${headers.map(h=>`<th>${xmlEsc(h)}</th>`).join('')}</tr>`,...rows.map((r,i)=>`<tr class="${i%2?'odd':'even'}">${r.map(v=>`<td>${xmlEsc(v)}</td>`).join('')}</tr>`)];
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
  try{me=await api('/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});$('#login').hidden=true;$('#app').hidden=false;await boot()}catch(err){$('#loginError').textContent=err.message||'تعذر تسجيل الدخول';if(me){$('#login').hidden=true;$('#app').hidden=false;$('#page').innerHTML=`<div class="panel error">تم تسجيل الدخول لكن تعذر تحميل لوحة التحكم: ${esc(err.message)}. حدّث الصفحة أو راجع نافذة السيرفر.</div>`}}finally{btn.disabled=false;btn.textContent='تسجيل الدخول'}
});

async function getFollowupReminderNotifications(){
  if(!allowed('followups')||!(me?.role==='admin'||me?.permissions?.includes('notify_followups')))return [];
  try{const data=await api('/followups'),rows=asRows(data),now=new Date(),today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;return rows.filter(f=>{const d=new Date(f.scheduled_at);if(Number.isNaN(d.getTime()))return false;const day=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return day<=today}).map(f=>({id:-Number(f.id),reminder:true,action:'followup_reminder',title:new Date(f.scheduled_at)<now?'متابعة عميل متأخرة':'موعد متابعة عميل اليوم',details:`العميل: ${f.customer_name||'—'} · الموبايل: ${f.phone||'—'} · موعد المتابعة: ${new Date(f.scheduled_at).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'})} · الحالة: ${f.inquiry_status||'يحتاج متابعة'}`,employee:f.employee||'خدمة العملاء',created_at:f.scheduled_at,inquiry_id:f.inquiry_id,scheduled_at:f.scheduled_at})).sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at))}catch{return []}
}

async function refreshBell(){
  try{const base=asRows(await api('/notifications')),reminders=await getFollowupReminderNotifications(),rows=[...reminders,...base];const menu=$('#bellItems'),count=$('#bellCount');if(!menu)return;const key='nasim_seen_notifications_'+(me?.id||me?.username||'user');let seen=[];try{seen=JSON.parse(localStorage.getItem(key)||'[]')}catch{}const unread=rows.filter(n=>!seen.includes(Number(n.id)));count.textContent=unread.length;count.hidden=!unread.length;menu.innerHTML=rows.length?rows.slice(0,8).map(n=>`<button type="button" class="bell-item ${n.reminder?'bell-reminder-item':''}" onclick="${n.reminder?'show(\'followups\')':'openNotificationPage()'}"><b>${n.reminder?'🔔 ':''}${esc(n.title||'عملية بالنظام')}</b><span>${esc(n.details||'تم تسجيل عملية بالنظام')}</span><small>${esc(n.employee||'النظام')} · ${esc(new Date(n.created_at).toLocaleString('ar-EG'))}</small></button>`).join(''):'<p class="muted bell-empty">لا توجد تنبيهات مسجلة.</p>'}catch{}
}

window.openNotificationPage=()=>{if($('#bellMenu'))$('#bellMenu').hidden=true;show('notifications')};

$('#notificationBell')?.addEventListener('click',async()=>{await refreshBell();const menu=$('#bellMenu');menu.hidden=!menu.hidden;if(!menu.hidden){try{const rows=asRows(await api('/notifications'));const key='nasim_seen_notifications_'+(me?.id||me?.username||'user');const seen=new Set(JSON.parse(localStorage.getItem(key)||'[]'));rows.forEach(n=>seen.add(Number(n.id)));localStorage.setItem(key,JSON.stringify([...seen].slice(-500)));}catch{}await refreshBell()}});

$('#openAllNotifications')?.addEventListener('click',()=>window.openNotificationPage());
document.addEventListener('click',e=>{const w=$('.bell-wrap');if(w&&!w.contains(e.target)&&$('#bellMenu'))$('#bellMenu').hidden=true});
$('#logout').onclick=async()=>{await api('/logout',{method:'POST'});location.reload()};

$('#changeOwnPassword')?.addEventListener('click',async()=>{
  const current=prompt('اكتب كلمة المرور الحالية:');if(current===null)return;
  const next=prompt('اكتب كلمة المرور الجديدة (10 أحرف على الأقل):');if(next===null)return;
  const confirm=prompt('أعد كتابة كلمة المرور الجديدة:');if(confirm===null)return;
  if(next!==confirm)return notice('كلمتا المرور غير متطابقتين',true);
  try{await api('/change-own-password',{method:'POST',body:JSON.stringify({current_password:current,new_password:next})});notice('تم تغيير كلمة المرور بنجاح')}catch(e){notice(e.message,true)}
});

async function boot(){
  $('#login').hidden=true;$('#app').hidden=false;$('#who').textContent=me.name+' ('+me.username+')';
  document.querySelectorAll('#nav button[data-page]').forEach(b=>{const p=b.dataset.page;b.hidden=!allowed(p);b.onclick=()=>show(p)});
  applyCurrentPermissionsToNav();
  document.querySelectorAll('.nav-group').forEach(g=>{const toggle=g.querySelector('.nav-group-toggle'),sub=g.querySelector('.nav-subgroup');const visible=[...sub.querySelectorAll('[data-page]')].some(b=>allowed(b.dataset.page));g.hidden=!visible;sub.hidden=true;sub.classList.remove('open');toggle.onclick=()=>{const open=sub.hidden;sub.hidden=!open;sub.classList.toggle('open',open);toggle.classList.toggle('expanded',open)}});
  const initialPage=decodeURIComponent(location.hash.replace(/^#\/?/,''));
  await show(initialPage&&allowed(initialPage)?initialPage:(allowed('dashboard')?'dashboard':PERMS.find(allowed)||'halls'));
  if(allowed('followups')){try{const fd=await api('/followups');const btn=document.querySelector('#nav button[data-page=followups]');if(btn&&fd.upcoming_count>0){btn.innerHTML='الاستفسارات والمتابعة <span class="nav-badge">'+fd.upcoming_count+'</span>';btn.title='يوجد '+fd.upcoming_count+' موعد متابعة خلال 24 ساعة'}}catch{}}
  await refreshBell();
  if(!window.nasimBellPolling){window.nasimBellPolling=setInterval(()=>{if(me)refreshBell()},8000)}
}

async function show(p){
  try{const fresh=await api('/me');if(me&&fresh.id===me.id){me=fresh;$('#who').textContent=me.name+' ('+me.username+')';applyCurrentPermissionsToNav();}}catch{}
  if(!allowed(p)){const deniedRoot=$('#page');deniedRoot.innerHTML='<div class="panel error">لا تملك صلاحية الوصول إلى هذا القسم. تم تحديث صلاحيات الحساب من السيرفر.</div>';return;}
  if(financeAutoRefreshTimer){clearInterval(financeAutoRefreshTimer);financeAutoRefreshTimer=null;}
  const bookingOverlay=document.getElementById('bookingFullscreenOverlay');
  if(bookingOverlay){bookingOverlay.hidden=true;document.body.classList.remove('booking-fullscreen-open');bookingOverlay.remove()}
  page=p;if(location.hash!=='#/'+p)history.replaceState(null,'','#/'+p);
  document.querySelectorAll('#nav button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===p));
  document.querySelectorAll('.nav-subgroup').forEach(sub=>{if(sub.querySelector(`[data-page=\"${p}\"]`)){sub.hidden=false;sub.classList.add('open');sub.closest('.nav-group')?.querySelector('.nav-group-toggle')?.classList.add('expanded')}});
  const root=$('#page');
  try{
    if(p==='dashboard'){const d=await api('/summary');root.innerHTML=`<div class="page-head"><h1>لوحة المتابعة</h1><span class="muted">البيانات محفوظة محليًا</span></div><div class="cards">${[['القاعات',d.halls],['باكدجات القاعات',d.packages],['الحجوزات',d.bookings],['المدفوعات',money(d.revenue)]].map(x=>`<div class="card"><div class="muted">${x[0]}</div><div class="metric">${x[1]}</div></div>`).join('')}</div><div class="panel"><h3>مهم</h3><p>غيّر كلمة مرور المدير الافتراضية من إدارة الموظفين قبل استخدام بيانات حقيقية.</p></div>${me.role==='admin'?await approvalsPanel():''}${me.role==='admin'?await bookingChangeApprovalsPanel():''}`;return}
    if(['halls','packages','buffet','addons'].includes(p)){await catalogPage(p);return}
    if(p==='operations_addons'){await operationalAddonsPage();return}
    if(p==='inventory'){await inventoryPage();return}
    if(p==='offers'){await offersPage();return}
    if(p==='contractors'){await contractorsPage();return}
    if(p==='work_orders'){await workOrdersPage();return}
    if(p==='contractor_report'){await contractorReportPage();return}
    if(p==='accounting'){await accountingPage();return}
    if(p==='cashbox'){if(!me.permissions?.includes('cashbox')&&!me.permissions?.includes('edit_cashbox')&&me.role!=='admin'){root.innerHTML='<div class="panel error">لا تملك صلاحية عرض حركة الخزنة.</div>';return}await cashboxPage();return}
    if(p==='expenses'){if(!me.permissions?.includes('expenses')&&!me.permissions?.includes('edit_expenses')&&me.role!=='admin'){root.innerHTML='<div class="panel error">لا تملك صلاحية عرض المصروفات والمشتريات.</div>';return}await expensesPage();return}
    if(p==='users'){await usersPage();return}
    if(p==='discounts'){if(me.role!=='admin'&&!me.permissions?.includes('discounts')){root.innerHTML='<div class="panel error">هذا القسم متاح للمدير المخوّل بمراجعة الخصومات فقط.</div>';return}root.innerHTML=`<div class="page-head"><h1>طلبات الخصم الإضافية</h1><span class="muted">طلبات الخصم التي تتجاوز الحد المسموح للموظف</span></div>${await approvalsPanel()}`;return}
    if(p==='booking_change_approvals'){if(me.role!=='admin'){root.innerHTML='<div class="panel error">هذا القسم متاح لمدير النظام فقط.</div>';return}root.innerHTML=`<div class="page-head"><h1>طلبات تعديل الموعد أو إلغاء الحجز</h1><span class="muted">طلبات التأجيل والإلغاء فقط؛ لا يتغير الحجز إلا بعد موافقة المدير</span></div>${await bookingChangeApprovalsPanel()}`;return}
    if(p==='bookings'){await bookingsPage(false);return}
    if(p==='day_bookings'){await bookingsPage(true);return}
    if(p==='booking_archive'){await bookingsArchivePage();return}
    if(p==='followups'){await followupsPage();return}
    if(p==='inquiry_register'){await inquiryRegisterPage();return}
    if(p==='notifications'){await notificationsPage();return}
    if(p==='finance'){await financePage();return}
    if(p==='backup'){await backupPage();return}
    if(p==='reports'){await reportsWorkspace();return}
    if(p==='sales_performance'){await employeeSalesPerformancePage();return}
    root.innerHTML='<div class="panel">القسم غير متاح لهذا الحساب.</div>'
  }catch(e){root.innerHTML=`<div class="panel error">${esc(e.message)}</div>`}
}

async function employeeSalesPerformancePage(){
  const root=$('#page');
  root.innerHTML='<div class="page-head"><h1>أداء مبيعات الموظفين</h1><span class="muted">سجل تفصيلي لكل موظف وإضافة وحجز وتعديل</span></div><div class="panel"><form id="salesPerfFilter" class="grid-form"><label>الموظف<select name="user_id" id="salesPerfUser"><option value="">كل الموظفين</option></select></label><label>من تاريخ<input name="from" type="date"></label><label>إلى تاريخ<input name="to" type="date"></label><label>رقم الحجز<input name="booking_no" placeholder="NS-..." /></label><div class="full"><button>عرض التقرير</button> <button type="button" class="secondary" id="salesPerfExport">تصدير إلى ملف جدول بيانات</button></div></form></div><div id="salesPerfSummary" class="cards"></div><div class="panel"><h3>ملخص أداء كل موظف</h3><div id="salesPerfEmployees"></div></div><div class="panel"><h3>تفاصيل مبيعات إضافات التشغيل</h3><div id="salesPerfRows"></div></div><div class="panel"><h3>سجل التعديلات والإجراءات على الحجوزات</h3><p class="muted">يشمل من أنشأ الحجز أو عدّله أو أجّله أو ألغاه، وتفاصيل تغييرات إضافات التشغيل.</p><div id="salesPerfActivity"></div></div>';
  
  let latest=null;const form=$('#salesPerfFilter');
  async function load(){
    const q=new URLSearchParams(Object.fromEntries(new FormData(form)));
    latest=await api('/reports/employee-sales?'+q.toString());
    const user=$('#salesPerfUser'),keep=user.value;
    const canSeeAll=me?.role==='admin'||me?.permissions?.includes('reports');
    user.innerHTML=(canSeeAll?'<option value="">كل الموظفين</option>':'')+latest.users.map(u=>`<option value="${u.id}">${esc(u.full_name)} (${esc(u.username)})</option>`).join('');
    if(!canSeeAll&&latest.users[0])user.value=String(latest.users[0].id);else user.value=keep;
  }
  form.onsubmit=async e=>{e.preventDefault();await load()};
  $('#salesPerfExport').onclick=()=>downloadExcel('sales-performance.xls','أداء مبيعات الموظفين',['الموظف','العملية','التفاصيل','التاريخ'],[]);
  await load();
}
