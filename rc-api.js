// 20261112 後端資料層：rc-config.js 有 RC_API_URL 時，把 rcDB 換成「記憶體快取＋每 3 秒輪詢後端」。
// 畫面程式照舊同步讀 rcDB；寫入先改快取（畫面馬上變），同時送後端，失敗就跳紅字並重新同步。
// 跟 Google Apps Script 溝通一律 POST、Content-Type: text/plain（不觸發 CORS 預檢）。
(function(){
var URL=window.RC_API_URL;if(!URL)return;
var DB=window.rcDB,C={menu:null,store:{},orders:[],calls:[],beer:{},paid:[],rev:-1,staff:false},busy=false,timer=null;
DB.mode='api';
function pin(){return localStorage.rc_pin||''}
function call(action,data){
  return fetch(URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({action:action,pin:pin()},data||{})),redirect:'follow'})
   .then(function(r){if(!r.ok)throw new Error('後端回應 '+r.status);return r.json()})
   .then(function(j){if(!j||!j.ok)throw new Error((j&&j.error)||'後端錯誤');return j});
}
function fire(){try{window.dispatchEvent(new Event('storage'))}catch(e){}}
function oops(msg){try{window.dispatchEvent(new CustomEvent('rc-error',{detail:msg}))}catch(e){}if(window.rcToast)rcToast(msg,'bad',5000)}
function sync(force){
  if(busy)return Promise.resolve();busy=true;
  return call('listOrders',{since:force?'':C.rev}).then(function(j){busy=false;if(j.same)return;
    C.rev=j.rev;C.orders=j.orders||[];C.calls=j.calls||[];C.beer=j.beer||{};C.paid=j.paid||[];C.staff=!!j.staff;fire()},
   function(e){busy=false;throw e});
}
function after(p,what){return p.then(function(j){return sync(true).then(function(){return j})},function(e){oops(what+'沒成功：'+e.message);sync(true).catch(function(){});throw e})}
function upsert(o){var i=C.orders.findIndex(function(x){return x.id===o.id});if(i>=0)C.orders[i]=o;else C.orders.push(o)}
DB.sync=sync;
DB.store=function(){return Object.assign({},window.RC_DEFAULT_STORE,C.store)};
DB.menu=function(){return JSON.parse(JSON.stringify(C.menu||window.RC_DEFAULT_MENU))};
DB.saveMenu=function(m){C.menu=m};
DB.saveMenuP=function(m){return call('saveMenu',{menu:m}).then(function(j){C.menu=j.menu||m})};
DB.resetMenu=function(){};
DB.resetMenuP=function(){return call('resetMenu').then(function(j){C.menu=j.menu})};
DB.saveStore=function(s){C.store=Object.assign({},C.store,s)};
DB.saveStoreP=function(s){return call('saveStore',{store:s}).then(function(j){C.store=j.store})};
DB.checkPinP=function(){return call('checkPin')};
DB.orders=function(){return C.orders};
DB.saveOrders=function(){console.warn('後端模式不直接覆寫訂單')};
DB.nextNo=function(){return ''};
DB.addOrderP=function(o){var tmp='o'+Date.now()+Math.random().toString(36).slice(2,6);o=Object.assign({},o,{id:tmp});
  return call('placeOrder',{order:o}).then(function(j){upsert(j.order);fire();sync(true).catch(function(){});return j.order})};
DB.addOrder=function(o){var t=Object.assign({},o,{id:'o'+Date.now()+Math.random().toString(36).slice(2,6),createdAt:Date.now(),status:o.status||'new'});C.orders.push(t);
  after(call('placeOrder',{order:t}),'送出訂單');return t};
DB.updateOrder=function(id,patch){C.orders.forEach(function(o){if(o.id===id)Object.assign(o,patch)});
  if(patch.status)after(call('updateStatus',{id:id,status:patch.status}),'更新狀態')};
DB.beerMap=function(){return C.beer};
DB.setBeer=function(t,b){C.beer[String(t)]=b;after(call('addBeer',{table:String(t),beer:b}),'記啤酒')};
DB.calls=function(){return C.calls};
DB.addCall=function(t,why){C.calls=C.calls.filter(function(c){return !(c.table===String(t)&&c.why===why)});C.calls.push({id:'tmp'+Date.now(),table:String(t),why:why,at:Date.now()});
  after(call('callService',{table:String(t),why:why}),'呼叫服務')};
DB.doneCall=function(id){C.calls=C.calls.filter(function(c){return c.id!==id});after(call('doneCall',{id:id}),'處理呼叫')};
DB.paidList=function(){return C.paid};
DB.addPaid=function(p){C.paid.push(p)};
DB.pay=function(spec){ // 先在快取標好（畫面馬上清桌），再送後端
  var ks={};(spec.keys||[]).forEach(function(k){ks[k]=1});
  function mine(o){return spec.take?o.id===spec.take:(o.type==='dine'&&String(o.table)===String(spec.table)&&!o.paidAt&&o.status!=='cancel')}
  C.orders.forEach(function(o){if(!mine(o))return;o.items.forEach(function(l,i){if(ks[o.id+'_'+i])l.paid=true})});
  if(spec.closing){C.orders.forEach(function(o){if(mine(o)){o.paidAt=Date.now();if(spec.take)o.status='done'}});if(!spec.take){C.beer[String(spec.table)]={};C.calls=C.calls.filter(function(c){return c.table!==String(spec.table)})}}
  C.paid.push(spec.payment);
  return after(call('payTable',spec),'收款');
};
DB.resetDemoP=function(){return call('resetDemo').then(function(){return sync(true)})};
DB.ready=Promise.all([call('getMenu'),sync(true)]).then(function(r){C.menu=r[0].menu;C.store=r[0].store||{};
  timer=setInterval(function(){if(!document.hidden||Math.random()<.2)sync().catch(function(){})},window.RC_POLL_MS||3000)});
})();
