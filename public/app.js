async function api(url, opts={}){
  const r=await fetch('/api'+url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'حدث خطأ');
  
  // حل ذكي ونهائي: جعل الكائن المستلم يدعم دوال المصفوفة مباشرة لمنع انهيار الـ filter و map
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const arr = d.allRows || d.data || d.rows || d.buffets || d.items || [];
    if (!d.allRows) d.allRows = arr;
    if (!d.data) d.data = arr;
    if (!d.filter) d.filter = (fn) => arr.filter(fn);
    if (!d.map) d.map = (fn) => arr.map(fn);
    if (!d.forEach) d.forEach = (fn) => arr.forEach(fn);
    if (d.length === undefined) d.length = arr.length;
  }
  return d;
}
