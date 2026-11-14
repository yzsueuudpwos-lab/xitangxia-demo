// 20261112 囍塘蝦點餐系統（示範版）資料層：本機模式用 localStorage；rc-config.js 填了 RC_API_URL 就由 rc-api.js 換成後端。
// 三個頁面（外帶 index.html、內用 table.html、櫃臺 counter.html）先用同一個瀏覽器的 localStorage 互通。
// 正式版：rcDB 這一層換成後端（GAS＋Sheets 或其他），畫面程式不用改。
(function(){
var K={menu:'rc_menu',store:'rc_store',orders:'rc_orders',calls:'rc_calls',seq:'rc_seq',beer:'rc_beer',paid:'rc_paid'};
function get(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function set(k,v){localStorage.setItem(k,JSON.stringify(v))}
var DB=window.rcDB={
  K:K,get:get,set:set,
  store:function(){return Object.assign({},window.RC_DEFAULT_STORE,get(K.store,{}))},
  saveStore:function(s){set(K.store,s)},
  menu:function(){return get(K.menu,null)||JSON.parse(JSON.stringify(window.RC_DEFAULT_MENU))},
  saveMenu:function(m){set(K.menu,m)},
  resetMenu:function(){localStorage.removeItem(K.menu)},
  // 客人看得到的菜單：拿掉隱藏品項、櫃台專用（啤酒）分類
  customerMenu:function(){return DB.menu().filter(function(c){return !c.counterOnly&&!c.hidden}).map(function(c){return Object.assign({},c,{items:c.items.filter(function(i){return !i.hidden})})}).filter(function(c){return c.items.length})},
  beerItems:function(){var out=[];DB.menu().forEach(function(c){if(c.counterOnly)c.items.forEach(function(i){if(!i.hidden)out.push(i)})});return out},
  orders:function(){return get(K.orders,[])},
  saveOrders:function(o){set(K.orders,o)},
  nextNo:function(prefix){var d=ymd(new Date())+prefix,s=get(K.seq,{});s[d]=(s[d]||0)+1;set(K.seq,s);return prefix+String(s[d]).padStart(3,'0')},
  addOrder:function(o){var all=DB.orders();o.id='o'+Date.now()+Math.random().toString(36).slice(2,6);o.createdAt=Date.now();o.status='new';all.push(o);DB.saveOrders(all);return o},
  updateOrder:function(id,patch){var all=DB.orders();all.forEach(function(o){if(o.id===id)Object.assign(o,patch)});DB.saveOrders(all)},
  // 一桌目前的帳（未結）：同桌所有加點＋櫃台加的啤酒
  tableTab:function(t){t=String(t);var os=DB.orders().filter(function(o){return o.type==='dine'&&String(o.table)===t&&!o.paidAt&&o.status!=='cancel'});var beer=(DB.beerMap()[t])||{};return {orders:os,beer:beer}},
  beerMap:function(){return get(K.beer,{})},
  setBeer:function(t,b){var all=get(K.beer,{});all[String(t)]=b;set(K.beer,all)},
  calls:function(){return get(K.calls,[])},
  addCall:function(t,why){var c=DB.calls().filter(function(x){return !(x.table===String(t)&&x.why===why)});c.push({id:'c'+Date.now(),table:String(t),why:why,at:Date.now()});set(K.calls,c)},
  doneCall:function(id){set(K.calls,DB.calls().filter(function(c){return c.id!==id}))},
  paidList:function(){return get(K.paid,[])},
  addPaid:function(p){var l=DB.paidList();l.push(p);set(K.paid,l)},
  // ---- 非同步版本（後端模式會被 rc-api.js 換掉；本機模式直接完成）----
  mode:'local',ready:Promise.resolve(),
  addOrderP:function(o){try{return Promise.resolve(DB.addOrder(o))}catch(e){return Promise.reject(e)}},
  saveMenuP:function(m){DB.saveMenu(m);return Promise.resolve()},
  resetMenuP:function(){DB.resetMenu();return Promise.resolve()},
  saveStoreP:function(s){DB.saveStore(Object.assign({},get(K.store,{}),s));return Promise.resolve()},
  resetDemoP:function(){['orders','calls','beer','paid','seq'].forEach(function(k){localStorage.removeItem(K[k])});return Promise.resolve()},
  // 結帳：spec={table,take,keys:['訂單ID_序']|null,closing,payment}
  pay:function(spec){var all=DB.orders(),ks={};(spec.keys||[]).forEach(function(k){ks[k]=1});
    function mine(o){return spec.take?o.id===spec.take:(o.type==='dine'&&String(o.table)===String(spec.table)&&!o.paidAt&&o.status!=='cancel')}
    all.forEach(function(o){if(!mine(o))return;o.items.forEach(function(l,i){if(ks[o.id+'_'+i])l.paid=true})});
    if(spec.closing){all.forEach(function(o){if(mine(o)){o.paidAt=Date.now();if(spec.take)o.status='done'}});if(!spec.take){DB.setBeer(spec.table,{});DB.calls().filter(function(x){return x.table===String(spec.table)}).forEach(function(x){DB.doneCall(x.id)})}}
    DB.saveOrders(all);DB.addPaid(spec.payment);return Promise.resolve()}
};
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
window.rcYmd=ymd;
window.rc$=function(id){return document.getElementById(id)};
window.rcEsc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
window.rcMoney=function(n){return 'NT$'+Number(n||0).toLocaleString('en-US')};
window.rcLineTotal=function(l){return (l.price+(l.opts||[]).reduce(function(s,o){return s+(o.p||0)},0))*l.qty};
window.rcFoodTotal=function(o){return (o.items||[]).reduce(function(s,l){return s+rcLineTotal(l)},0)};
window.rcOrderTotal=function(o){return rcFoodTotal(o)+(Number(o.deliveryFee)||0)};
var tt;window.rcToast=function(msg,kind,ms){var e=document.getElementById('toast');if(!e){e=document.createElement('div');e.id='toast';e.className='toast';e.setAttribute('role','status');document.body.appendChild(e)}e.textContent=msg;e.className='toast show '+(kind||'');clearTimeout(tt);tt=setTimeout(function(){e.className='toast '+(kind||'')},ms||2200)};
window.rcAgo=function(t){var m=Math.floor((Date.now()-t)/60000);return m<1?'剛剛':m<60?m+' 分鐘前':Math.floor(m/60)+' 小時 '+(m%60)+' 分前'};
window.rcTime=function(t){return new Date(t).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false})};
// 推廣連結（晋偉的系統）— 正式上線前把 href 換成他的介紹頁
window.RC_PROMO_HREF='https://line.me/R/ti/p/@551nbgfj';
window.rcBadge=function(){return DB.mode==='api'?'示範版':'示範版・本機模式'};
window.rcPromo=function(){return '<div class="promo"><a class="promo-card" href="'+RC_PROMO_HREF+'" target="_blank" rel="noopener">'+
'<span class="pc-tag">📱 小店也能有自己的點餐系統</span>'+
'<span class="pc-h">小本生意，<br>也跟上這個時代</span>'+
'<span class="pc-s">掃碼點餐・平板點餐・外帶・櫃臺結帳<br>不用買貴的 POS 機，店裡的手機平板就能用</span>'+
'<span class="pc-free">🎁 小本生意先免費用<br>幫你改到順手好用，滿意了才收費</span>'+
'<span class="pc-s2">讓每一家小店都能享受網路時代的方便</span>'+
'<span class="pc-btn"><b>LINE</b> 找我們聊聊 ›</span>'+
'<span class="pc-by">這套點餐系統由 宇智速 AI 工作室 提供</span>'+
'</a></div>'};
})();
