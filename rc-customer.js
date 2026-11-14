// 20261112 客人點餐（外帶＋內用共用）。資料走 rcDB：有後端就送後端，沒有就本機。
// 20261114 外帶可選自取或 Lalamove 外送；外送費由後端向 Lalamove 估價，估不到就由店家電話告知。
(function(){
var $=rc$,esc=rcEsc,money=rcMoney;
var P=new URLSearchParams(location.search);
var MODE=document.body.dataset.mode; // takeout | dine
var TABLE=MODE==='dine'?(P.get('table')||'').replace(/[^0-9A-Za-z]/g,''):'';
var S=rcDB.store(),MENU=[],cart=[],cur=null,curSel={},curQty=1;
var WHO=localStorage.rc_who||'',WHO_SET=!!localStorage.rc_who_set;
var FULFILL=sessionStorage.rc_fulfill||'pickup';
var FEE={status:'idle',fee:0,addr:'',quoteId:''};
var feeTimer=null;
var CART_KEY='rc_cart_'+MODE+(TABLE||'');
try{cart=JSON.parse(sessionStorage.getItem(CART_KEY)||'[]')}catch(e){cart=[]}
function saveCart(){sessionStorage.setItem(CART_KEY,JSON.stringify(cart))}
function isOpen(d){d=d||new Date();var h=d.getHours();if(d.getDay()===1&&h>=2)return false;if(d.getDay()===2&&h<2)return false;return h>=18||h<2}
function allItems(){var o=[];MENU.forEach(function(c){c.items.forEach(function(i){o.push(i)})});return o}
function find(id){return allItems().filter(function(i){return i.id===id})[0]}
function cartQty(id){return cart.filter(function(l){return l.id===id}).reduce(function(s,l){return s+l.qty},0)}
function cartTotal(){return cart.reduce(function(s,l){return s+rcLineTotal(l)},0)}
function cartCount(){return cart.reduce(function(s,l){return s+l.qty},0)}

function shell(){
  var open=isOpen();
  var mode=MODE==='dine'?'<span class="mode">🍽 '+esc(TABLE||'?')+' 桌・內用</span>':'<span class="mode">🥡 外帶／外送・'+esc(S.prep)+'</span>';
  var notice=MODE==='dine'
    ?'🍺 <b>啤酒不用在這裡點</b>：冰箱自己拿，喝多少算多少，結帳時櫃台幫你加。'
    :'🍺 啤酒請到店現場購買，線上不販售。<b>外送不含酒類</b>。付款：自取是取餐時付，外送是送到時付（外送費先預估，實際以 Lalamove 叫車金額為準，多退少補）。';
  document.getElementById('app').innerHTML=
  '<div class="cover" style="background-image:url('+esc(S.cover)+')"><div class="tools"><button class="icon-btn" id="theme-btn" aria-label="切換深色模式">🌙</button></div></div>'+
  '<div class="shop">'+mode+'<h1>'+esc(S.name)+'</h1><div class="meta"><span class="open-st '+(open?'on':'off')+'">'+(open?'● 營業中':'● 目前休息中')+'</span>・'+esc(S.hours)+'<br>📍 '+esc(S.address)+'<br>📞 <a href="tel:'+esc(S.phone.replace(/-/g,''))+'">'+esc(S.phone)+'</a></div></div>'+
  '<div class="a2hs" id="a2hs" hidden><span class="a2hs-t"></span><button class="a2hs-x" id="a2hs-x" aria-label="關閉">✕</button></div>'+
  (MODE==='dine'&&!TABLE?'<div class="notice say bad">找不到桌號，請重新掃桌上的 QR Code，或請服務生幫忙。</div>':'')+
  '<div class="notice">'+notice+'</div>'+
  (MODE==='dine'?'<div class="whobar" id="whobar"></div><div class="dinebar"><button class="btn" id="btn-ordered">🧾 已點的菜 <span id="ordered-n"></span></button><button class="btn" id="btn-call">🙋 呼叫服務</button></div>':'')+
  '<div class="search"><input id="q" type="search" placeholder="搜尋菜名，例如：蝦、蛤蜊、炒飯" enterkeyhint="search" autocomplete="off"></div>'+
  '<nav class="tabs" id="tabs"></nav><div id="menu">'+skeleton()+'</div>'+rcPromo()+
  '<button class="cartbar" id="cartbar" hidden><span class="n" id="cb-n">0</span><span>'+(MODE==='dine'?'看一下，送出點餐':'看購物車')+'</span><span class="t" id="cb-t"></span></button>'+
  '<div class="mask" id="mask"></div><div class="sheet" id="sheet" role="dialog" aria-modal="true"></div>'+
  '<div class="preview-badge">'+rcBadge()+'</div>';
}
function skeleton(){var h='';for(var i=0;i<6;i++)h+='<div style="display:flex;gap:12px;padding:12px"><div class="sk" style="width:76px;height:76px"></div><div style="flex:1"><div class="sk" style="height:18px;width:60%;margin:8px 0"></div><div class="sk" style="height:16px;width:30%"></div></div></div>';return h}

function renderMenu(){
  var q=($('q').value||'').trim();
  var html='',tabs='';
  MENU.forEach(function(c){
    var items=c.items.filter(function(i){return !q||i.name.indexOf(q)>=0});
    if(!items.length)return;
    tabs+='<button data-cat="'+c.id+'">'+esc(c.name)+'</button>';
    html+='<section class="sec" id="sec-'+c.id+'"><h2>'+esc(c.name)+'</h2>'+items.map(itemRow).join('')+'</section>';
  });
  $('menu').innerHTML=html||'<div class="empty">找不到「'+esc(q)+'」，換個字試試看</div>';
  $('tabs').innerHTML=tabs;
  spy();
}
function itemRow(i){
  var q=cartQty(i.id),so=i.soldOut;
  return '<div class="item'+(so?' so':'')+'" data-id="'+i.id+'"><div class="ph" style="'+(i.pic?'background-image:url('+esc(i.pic)+')':'')+'">'+(i.pic?'':'🍳')+'</div>'+
  '<div class="tx"><div class="nm">'+esc(i.name)+'</div><div class="pr">'+money(i.price)+(i.example?' <span class="tag ex">範例</span>':'')+'</div>'+
  (so?'<div class="hint">今日售完</div>':(i.mods&&i.mods.length?'<div class="hint">'+(MODE==='dine'?'按＋直接點；要調辣度按菜名 ':'可選 ')+i.mods.map(function(m){return m.name}).join('／')+'</div>':''))+'</div>'+
  (so?'':(MODE==='dine'&&q?'<button class="minus" data-minus="'+i.id+'" aria-label="少一份 '+esc(i.name)+'">−</button>':'')+'<button class="add" data-add="'+i.id+'" aria-label="加入 '+esc(i.name)+'">＋'+(q?'<span class="q">'+q+'</span>':'')+'</button>')+'</div>';
}
var spyOn=true;
function spy(){
  var secs=[].slice.call(document.querySelectorAll('.sec'));
  function upd(){if(!spyOn)return;var top=$('tabs').getBoundingClientRect().bottom+8,cur=secs[0];secs.forEach(function(s){if(s.getBoundingClientRect().top<=top)cur=s});
    document.querySelectorAll('#tabs button').forEach(function(b){var on=cur&&('sec-'+b.dataset.cat)===cur.id;b.classList.toggle('on',on);if(on&&b.scrollIntoViewIfNeeded)b.scrollIntoViewIfNeeded()})}
  window.onscroll=upd;upd();
}
function updCartBar(){
  var n=cartCount();$('cartbar').hidden=!n;$('cb-n').textContent=n;$('cb-t').textContent=money(cartTotal());
  document.querySelectorAll('[data-add]').forEach(function(b){var q=cartQty(b.dataset.add),s=b.querySelector('.q');if(q){if(!s){s=document.createElement('span');s.className='q';b.appendChild(s)}s.textContent=q}else if(s)s.remove()});
  saveCart();
}
function addLine(item,opts,qty,note){
  var key=item.id+'|'+opts.map(function(o){return o.n}).join(',')+'|'+(note||'');
  var l=cart.filter(function(x){return x.key===key})[0];
  if(l)l.qty+=qty;else cart.push({key:key,id:item.id,name:item.name,price:item.price,opts:opts,qty:qty,note:note||''});
  updCartBar();rcHaptic('success');rcToast('已加入 '+item.name+(qty>1?' ×'+qty:''),'ok',1500);
}
// ---- sheets ----
function openSheet(html){$('sheet').innerHTML='<div class="grab"></div>'+html;$('sheet').classList.add('on');$('mask').classList.add('on');document.body.style.overflow='hidden';rcScan()}
function closeSheet(){$('sheet').classList.remove('on');$('mask').classList.remove('on');document.body.style.overflow=''}
window.rcCloseSheet=closeSheet;
function itemSheet(i){
  cur=i;curSel={};curQty=1;
  var mods=(i.mods||[]).slice();
  openSheet((i.pic?'<div class="bd"><div class="bigph" style="background-image:url('+esc(i.pic)+')"></div></div>':'')+
  '<div class="hd"><h3>'+esc(i.name)+'</h3><button class="icon-btn" data-close aria-label="關閉">✕</button></div><div class="bd">'+
  '<div class="pr" style="color:var(--brand);font-weight:800;font-size:18px">'+money(i.price)+'</div>'+
  mods.map(function(g,gi){return '<div class="grp"><div class="gt">'+esc(g.name)+' <small>（選填'+(g.max===1?'，擇一':'')+'）</small></div><div class="chips">'+
    g.opts.map(function(o,oi){return '<button data-opt="'+gi+'_'+oi+'">'+esc(o.n)+(o.p?' +'+o.p:'')+'</button>'}).join('')+'</div></div>'}).join('')+
  '<label class="f" for="note">備註（選填）</label><input id="note" placeholder="例：不要香菜、蔥另外放" maxlength="40">'+
  '<div class="qty"><button data-q="-1" aria-label="少一份">−</button><b id="qn">1</b><button data-q="1" aria-label="多一份">＋</button></div>'+
  '<button class="btn pri big" id="add-go">加入購物車・<span id="add-t">'+money(i.price)+'</span></button></div>');
}
function curOpts(){var out=[];Object.keys(curSel).forEach(function(k){if(curSel[k]){var a=k.split('_');var o=cur.mods[a[0]].opts[a[1]];out.push({g:cur.mods[a[0]].name,n:o.n,p:o.p})}});return out}
function updAddBtn(){var t=(cur.price+curOpts().reduce(function(s,o){return s+o.p},0))*curQty;$('add-t').textContent=money(t);$('qn').textContent=curQty}

function pickupSlots(){
  var out=[],d=new Date(Date.now()+30*60000);d.setSeconds(0,0);d.setMinutes(Math.ceil(d.getMinutes()/15)*15);
  if(!isOpen(d)){d=new Date();if(d.getHours()>=2){d.setHours(18,30,0,0);if(d.getDay()===1)d.setDate(d.getDate()+1)}}
  for(var k=0;out.length<16&&k<200;k++){var t=new Date(d.getTime()+k*15*60000);if(isOpen(t))out.push(t)}
  return out;
}
function dayLabel(t){var n=new Date(),a=new Date(n.getFullYear(),n.getMonth(),n.getDate()),b=new Date(t.getFullYear(),t.getMonth(),t.getDate());var diff=Math.round((b-a)/864e5);if(diff===1&&t.getHours()<2&&new Date().getHours()>=18)return '今晚 '+rcTime(t)+'（過午夜）';return (diff===0?'今天':diff===1?'明天':(t.getMonth()+1)+'/'+t.getDate())+' '+rcTime(t)}
function isDlv(){return MODE==='takeout'&&FULFILL==='delivery'}
function foodSum(){return cartTotal()}
function grandSum(){return foodSum()+(isDlv()&&FEE.status==='ok'?FEE.fee:0)}
function feeHtml(){
  if(!isDlv())return '';
  if(FEE.status==='loading')return '<div class="fee-box wait" id="fee-box">正在估算外送費…</div>';
  if(FEE.status==='err')return '<div class="fee-box bad" id="fee-box"><b>'+esc(RC_DELIVERY_FAIL_MSG)+'</b>'+(FEE.why?'<br>（'+esc(FEE.why)+'）':'')+'<div class="dlv-note">訂單一樣可以送出。</div></div>';
  if(FEE.status==='ok')return '<div class="fee-box" id="fee-box"><span class="fee-n">外送費預估 '+money(FEE.fee)+'</span>'+'<div class="dlv-note">（實際以 Lalamove 叫車金額為準，多退少補）'+(FEE.km?'距離約 '+esc(FEE.km)+' 公里。':'')+'</div></div>';
  return '<div class="fee-box wait" id="fee-box">請填完整的外送地址（路段＋門牌），再按「查詢預估外送費」。也可以停一下自動幫你查。</div>';
}
function sumHtml(){
  var feeOn=isDlv()&&FEE.status==='ok';
  return (isDlv()?'<div class="sum sub"><span>餐點</span><span>'+money(foodSum())+'</span></div>':'')+
    (feeOn?'<div class="sum sub" id="fee-line"><span>外送費預估</span><span>'+money(FEE.fee)+'</span></div>':(isDlv()&&FEE.status==='err'?'<div class="sum sub" id="fee-line"><span>外送費</span><span>店家電話告知</span></div>':''))+
    '<div class="sum"><span>合計</span><span id="sum-t">'+money(grandSum())+'</span></div>';
}
function applyFulfillUI(){
  if(MODE!=='takeout')return;
  document.querySelectorAll('[data-fulfill]').forEach(function(b){b.classList.toggle('on',b.dataset.fulfill===FULFILL)});
  var box=$('dlv-box');if(box)box.hidden=!isDlv();
  var lab=$('pt-lab');if(lab)lab.textContent=isDlv()?'希望送到時間':'取餐時間';
  var nml=$('nm-lab');if(nml)nml.textContent=isDlv()?'收件人姓名':'取餐人姓名';
  var hint=$('pay-hint');if(hint)hint.textContent=isDlv()?'送到時付款（現金／行動支付依店家）。外送費實際以 Lalamove 叫車金額為準，多退少補。':'取餐時現場付款（現金／行動支付依店家）。';
  var fb=$('fee-box');if(fb)fb.outerHTML=feeHtml(); else if($('dlv-box'))$('dlv-box').insertAdjacentHTML('beforeend',feeHtml());
  paintSum();
  if(isDlv())scheduleQuote();
}
function paintSum(){
  var wrap=$('sum-wrap');if(!wrap)return;
  wrap.innerHTML=sumHtml();
}
function requestQuote(){
  if(!isDlv())return;
  var ad=($('ad')&&$('ad').value||'').trim(),fl=($('ad2')&&$('ad2').value||'').trim();
  if(!rcAddrOk(ad)){FEE={status:'idle',fee:0,addr:'',quoteId:''};var fb=$('fee-box');if(fb)fb.outerHTML=feeHtml();paintSum();var say=$('say');if(say){say.className='say bad';say.textContent='請填完整的外送地址，包含路段與門牌'}rcHaptic('error');return}
  FEE.status='loading';FEE.addr=ad;var fb2=$('fee-box');if(fb2)fb2.outerHTML=feeHtml();
  var btn=$('dl-quote');if(btn){btn.disabled=true;btn.textContent='正在估算…'}
  rcQuoteDelivery(ad,fl).then(function(q){
    if(!isDlv())return;
    if((($('ad')&&$('ad').value)||'').trim()!==ad)return;
    FEE={status:'ok',fee:q.fee,addr:ad,quoteId:q.quoteId||'',km:q.distanceKm||''};
    var fb=$('fee-box');if(fb)fb.outerHTML=feeHtml();paintSum();rcHaptic('success');
  },function(e){
    if(!isDlv())return;
    FEE={status:'err',fee:0,addr:ad,quoteId:'',why:e.why||'',unsupported:!!e.unsupported};
    var fb=$('fee-box');if(fb)fb.outerHTML=feeHtml();paintSum();rcHaptic('error');
  }).then(function(){var b=$('dl-quote');if(b){b.disabled=false;b.textContent='查詢預估外送費'}});
}
function scheduleQuote(){
  if(!isDlv())return;
  var ad=($('ad')&&$('ad').value||'').trim();
  clearTimeout(feeTimer);
  if(!rcAddrOk(ad)){FEE={status:'idle',fee:0,addr:'',quoteId:''};var fb=$('fee-box');if(fb)fb.outerHTML=feeHtml();paintSum();return}
  feeTimer=setTimeout(requestQuote,900);
}
function cartSheet(){
  if(!cart.length){closeSheet();return}
  var lines=cart.map(function(l,ix){return '<div class="line"><div class="tx"><b>'+esc(l.name)+'</b><div class="op">'+esc(l.opts.map(function(o){return o.n+(o.p?'+'+o.p:'')}).concat(l.note?['備註：'+l.note]:[]).join('・'))+'</div><div style="color:var(--brand);font-weight:800">'+money(rcLineTotal(l))+'</div></div><div class="mini"><button data-l="'+ix+'" data-d="-1" aria-label="少一份">−</button><b>'+l.qty+'</b><button data-l="'+ix+'" data-d="1" aria-label="多一份">＋</button></div></div>'}).join('');
  var form=MODE==='takeout'
   ?'<label class="f">取餐方式</label><div class="fulfill" role="group" aria-label="取餐方式">'+
      '<button type="button" class="ff-btn'+(FULFILL==='pickup'?' on':'')+'" data-fulfill="pickup">🏪 自取<small>到店拿・取餐時付款</small></button>'+
      '<button type="button" class="ff-btn'+(FULFILL==='delivery'?' on':'')+'" data-fulfill="delivery">🛵 外送<small>Lalamove・送到時付款</small></button></div>'+
    '<div id="dlv-box"'+(isDlv()?'':' hidden')+'>'+
      '<div class="dlv-note">📦 從 '+esc((window.RC_PICKUP_ADDRESS)||S.address)+' 出發。<b>外送不含酒類</b>。</div>'+
      '<label class="f" for="ad">外送地址</label><textarea id="ad" autocomplete="street-address" placeholder="例：台北市中山區南京東路一段100號 3樓" maxlength="200">'+esc(localStorage.rc_ad||'')+'</textarea>'+
      '<label class="f" for="ad2">樓層／門鈴／備註（選填）</label><input id="ad2" placeholder="例：3樓，按 301 門鈴" maxlength="40" value="'+esc(localStorage.rc_ad2||'')+'">'+
      '<button type="button" class="btn big" id="dl-quote" style="margin-top:10px">查詢預估外送費</button>'+
      feeHtml()+
    '</div>'+
    '<label class="f" for="pt" id="pt-lab">'+(isDlv()?'希望送到時間':'取餐時間')+'</label><select id="pt"><option value="asap">'+(isDlv()?'盡快送達（'+esc(S.prep)+'）':'盡快（'+esc(S.prep)+'）')+'</option>'+pickupSlots().map(function(t){return '<option value="'+t.getTime()+'">'+dayLabel(t)+'</option>'}).join('')+'</select>'+
    '<label class="f" for="nm" id="nm-lab">'+(isDlv()?'收件人姓名':'取餐人姓名')+'</label><input id="nm" autocomplete="name" placeholder="例：王先生" maxlength="20" value="'+esc(localStorage.rc_nm||'')+'">'+
    '<label class="f" for="ph">手機</label><input id="ph" type="tel" inputmode="numeric" autocomplete="tel" placeholder="09xxxxxxxx" maxlength="12" value="'+esc(localStorage.rc_ph||'')+'">'+
    '<label class="f" for="on">整單備註（選填）</label><input id="on" placeholder="例：要餐具 3 副" maxlength="60">'
   :'<label class="f" for="on">備註（選填）</label><input id="on" placeholder="例：先上青菜、要小碗 2 個" maxlength="60">';
  openSheet('<div class="hd"><h3>'+(MODE==='dine'?esc(TABLE)+' 桌・這次要加點':'購物車')+'</h3><button class="icon-btn" data-close aria-label="關閉">✕</button></div><div class="bd">'+lines+
   '<div id="sum-wrap">'+sumHtml()+'</div>'+(MODE==='dine'?'<div class="hint" style="color:var(--sub);font-size:13px">啤酒不用點，結帳時櫃台加入。付款在櫃台。</div>':'<div class="hint" id="pay-hint" style="color:var(--sub);font-size:13px">'+(isDlv()?'送到時付款（現金／行動支付依店家）。外送費實際以 Lalamove 叫車金額為準，多退少補。':'取餐時現場付款（現金／行動支付依店家）。')+'</div>')+
   form+'<div class="say" id="say"></div><button class="btn pri big" id="submit">'+(MODE==='dine'?'送出加點到廚房':'送出訂單')+'</button><div style="height:10px"></div></div>');
  if(MODE==='takeout'&&isDlv())scheduleQuote();
}
function submit(){
  var say=$('say'),btn=$('submit');
  function bad(m){say.className='say bad';say.textContent=m;rcHaptic('error');btn.disabled=false;btn.textContent=MODE==='dine'?'送出加點到廚房':'送出訂單'}
  if(!cart.length)return bad('購物車是空的');
  if(MODE==='dine'&&!TABLE)return bad('找不到桌號，請重新掃桌上的 QR Code');
  var o={type:MODE,items:cart.map(function(l){return {id:l.id,name:l.name,price:l.price,opts:l.opts,qty:l.qty,note:l.note}}),note:($('on').value||'').trim()};
  if(MODE==='takeout'){
    var nm=$('nm').value.trim(),ph=$('ph').value.replace(/\D/g,'');
    if(!nm)return bad(isDlv()?'請填收件人姓名':'請填取餐人姓名，店家叫號才找得到你');
    if(!/^09\d{8}$/.test(ph)&&!/^0\d{8,9}$/.test(ph))return bad('手機號碼格式不對，請填 10 碼，例如 0912345678');
    localStorage.rc_nm=nm;localStorage.rc_ph=ph;
    o.name=nm;o.phone=ph;var pt=$('pt').value;o.pickup=pt==='asap'?(isDlv()?'盡快送達':'盡快'):dayLabel(new Date(+pt));o.no=rcDB.nextNo('A');
    o.fulfill=FULFILL==='delivery'?'delivery':'pickup';
    if(o.fulfill==='delivery'){
      var ad=($('ad')&&$('ad').value||'').trim(),ad2=($('ad2')&&$('ad2').value||'').trim();
      if(!rcAddrOk(ad))return bad('請填完整的外送地址，包含路段與門牌');
      if(FEE.status==='loading')return bad('外送費還在估算，請稍等一下再送出');
      if((FEE.status!=='ok'&&FEE.status!=='err')||FEE.addr!==ad){requestQuote();return bad('正在幫你估算外送費，估好後請再按一次送出')}
      localStorage.rc_ad=ad;localStorage.rc_ad2=ad2;
      var okFee=FEE.status==='ok';
      o.address=ad;o.addressNote=ad2;o.deliveryFee=okFee?FEE.fee:0;o.deliveryQuoteId=okFee?(FEE.quoteId||''):'';
      // 後端還沒有外送欄位（舊版）時，把外送資訊放進備註，店家接單頁一樣看得到
      if(FEE.unsupported)o.note=('🛵外送：'+ad+(ad2?' '+ad2:'')+'｜外送費電話告知'+(o.note?'｜'+o.note:'')).slice(0,80);
    }
  }else{
    o.who=WHO;o.items.forEach(function(l){l.who=WHO});o.table=TABLE;o.round=rcDB.tableTab(TABLE).orders.length+1;o.no=rcDB.nextNo('T');
  }
  btn.disabled=true;btn.textContent='送出中…';say.className='say';say.textContent='';
  // 送到後端（或本機）；失敗就保留購物車並顯示錯誤
  rcDB.addOrderP(o).then(function(saved){
    cart=[];updCartBar();rcHaptic('success');
    if(MODE==='takeout'){localStorage.rc_my_last=saved.id;doneSheet(saved.id)}
    else{rcToast('已送出第 '+saved.round+' 次點餐，廚房收到了','ok',2500);orderedSheet(true)}
  },function(e){bad('送出失敗，點的菜還在購物車，請再按一次。（'+e.message+'）')});
}
function doneSheet(id){
  var o=rcDB.orders().filter(function(x){return x.id===id})[0];if(!o)return;
  var st=o.status,step=st==='new'?1:st==='accepted'?2:3;
  var dlv=o.fulfill==='delivery';
  var label={new:'等店家確認中…',accepted:'店家已接單，正在準備',ready:dlv?'餐點好了，準備叫外送':'餐點好了，可以來拿了！',done:dlv?'已送達，謝謝光臨':'已取餐，謝謝光臨',cancel:'這張單已取消，請打電話給店家'}[st]||'';
  var feeLine=dlv?'<div class="sum sub"><span>餐點</span><span>'+money(rcFoodTotal(o))+'</span></div>'+(o.deliveryFee?'<div class="sum sub"><span>外送費預估</span><span>'+money(o.deliveryFee)+'</span></div><div class="dlv-note">實際以 Lalamove 叫車金額為準，多退少補。</div>':'<div class="sum sub"><span>外送費</span><span>店家電話告知</span></div>'):'';
  openSheet('<div class="hd"><h3>訂單已送出</h3><button class="icon-btn" data-close aria-label="關閉">✕</button></div><div class="bd done">'+
   '<div>'+(dlv?'外送編號':'取餐號碼')+'</div><div class="no">'+esc(o.no||'取號中…')+'</div><div class="say '+(st==='cancel'?'bad':'ok')+'" id="live-st">'+label+'</div>'+
   '<div class="steps"><div class="'+(step>=1?'on':'')+'">① 已送出</div><div class="'+(step>=2?'on':'')+'">② 店家接單</div><div class="'+(step>=3?'on':'')+'">'+(dlv?'③ 準備外送':'③ 可取餐')+'</div></div>'+
   '<div style="text-align:left">'+o.items.map(function(l){return '<div class="line"><div class="tx">'+esc(l.name)+' ×'+l.qty+'<div class="op">'+esc(l.opts.map(function(x){return x.n}).join('・'))+'</div></div><b>'+money(rcLineTotal(l))+'</b></div>'}).join('')+
   feeLine+'<div class="sum"><span>合計（'+(dlv?'送到時付款':'現場付款')+'）</span><span>'+money(rcOrderTotal(o))+'</span></div>'+
   '<div>'+(dlv?'希望送到':'取餐時間')+'：<b>'+esc(o.pickup)+'</b>　姓名：'+esc(o.name)+'</div>'+(dlv?'<div style="margin-top:6px">🛵 外送（Lalamove）<br>地址：'+esc(o.address)+(o.addressNote?'<br>'+esc(o.addressNote):'')+'</div>':'')+'</div>'+
   '<div style="display:flex;gap:8px;margin:16px 0"><a class="btn" style="flex:1;text-decoration:none;color:var(--ink)" href="tel:'+esc(S.phone.replace(/-/g,''))+'">📞 打給店家</a><button class="btn pri" style="flex:1" data-close>再點別的</button></div></div>');
  $('sheet').dataset.live=id;
}
function orderedSheet(justSent){
  var tab=rcDB.tableTab(TABLE),os=tab.orders;
  var lab={new:['new','等店家確認'],accepted:['cook','廚房準備中'],ready:['done','已上菜']};
  var total=os.reduce(function(s,o){return s+rcOrderTotal(o)},0);
  openSheet('<div class="hd"><h3>'+esc(TABLE)+' 桌・已點的菜</h3><button class="icon-btn" data-close aria-label="關閉">✕</button></div><div class="bd">'+
   (justSent?'<div class="say ok">✅ 已送到廚房！要再加點，直接回菜單點就好。</div>':'')+
   (os.length?os.map(function(o){var l=lab[o.status]||['new',o.status];return '<div style="margin-top:10px;font-weight:800">第 '+o.round+' 次・'+rcTime(o.createdAt)+' <span class="st '+l[0]+'">'+l[1]+'</span></div>'+o.items.map(function(x){return '<div class="line"><div class="tx"><b class="whotag">'+esc(x.who||o.who||'沒留名')+'</b>・'+esc(x.name)+' ×'+x.qty+'<span class="op">・第'+esc(o.table)+'桌</span><div class="op">'+esc(x.opts.map(function(y){return y.n}).concat(x.note?[x.note]:[]).join('・'))+'</div></div><b>'+money(rcLineTotal(x))+'</b></div>'}).join('')}).join(''):'<div class="empty">這桌還沒點菜</div>')+
   '<div class="sum"><span>目前小計（不含啤酒）</span><span>'+money(total)+'</span></div><div style="color:var(--sub);font-size:14px">要結帳請到櫃台，或按「呼叫服務」選「我要結帳」。</div><button class="btn big" style="margin:14px 0" data-close>回菜單</button></div>');
  $('sheet').dataset.live='';
}
function callSheet(){
  openSheet('<div class="hd"><h3>呼叫服務</h3><button class="icon-btn" data-close aria-label="關閉">✕</button></div><div class="bd"><div class="chips" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
   ['💧 加水／冰塊','🥢 碗筷／餐具','🧻 衛生紙','🧾 我要結帳','🍺 再拿啤酒','🙋 其他'].map(function(w){return '<button class="callw" style="min-height:64px;font-size:17px" data-why="'+w+'">'+w+'</button>'}).join('')+'</div><div class="say" id="say"></div><div style="height:12px"></div></div>');
}
// ---- 點餐人（可跳過）----
// 預覽：「用 LINE 登入」是模擬的，隨機給一個範例名字。
// 正式版：用 LINE Login / LIFF（liff.init({liffId}) → liff.isLoggedIn()? liff.getProfile() : liff.login()），
// 拿 profile.displayName 當點餐人；只存名字和 userId，不要拿好友或電話權限。
var FAKE_LINE=['範例小明','範例阿土伯','範例美玲','範例阿雄','範例志明'];
function whoBar(){var e=$('whobar');if(!e)return;e.innerHTML=WHO?'👤 點餐人：<b>'+esc(WHO)+'</b>'+(localStorage.rc_who_line?' <span class="tag ex">LINE 範例</span>':'')+' <button class="btn" id="who-chg">換人</button>':'👤 還沒留名字 <button class="btn" id="who-chg">留名字（方便分帳）</button>'}
function whoSheet(){
  openSheet('<div class="hd"><h3>'+esc(TABLE)+' 桌・誰要點菜？</h3><button class="icon-btn" data-close aria-label="關閉">✕</button></div><div class="bd who-step">'+
  '<p style="margin:0 0 12px;color:var(--sub)">留個名字，大家一起點也分得清楚、結帳可以各付各的。不想留也可以直接點。</p>'+
  '<button class="btn big line-btn" id="who-line">用 LINE 登入</button>'+
  '<div class="who-or">或</div><div style="display:flex;gap:8px"><input id="who-nick" placeholder="打個暱稱，例如：阿明" maxlength="10" value="'+esc(localStorage.rc_who_line?'':WHO)+'"><button class="btn pri" id="who-ok" style="min-width:110px">確定</button></div>'+
  '<div class="say" id="who-say"></div><button class="btn big" id="who-skip" style="margin:14px 0">先不用，直接點</button></div>');
}
function setWho(n,line){WHO=n;localStorage.rc_who=n;localStorage.rc_who_set='1';WHO_SET=true;if(line)localStorage.rc_who_line='1';else localStorage.removeItem('rc_who_line');whoBar()}
function bind(){
  document.addEventListener('click',function(e){
    var t=e.target.closest('button,[data-close],.item,#mask');if(!t)return;
    if(t.id==='mask'||t.hasAttribute('data-close'))return closeSheet();
    if(t.dataset.cat){spyOn=false;var s=$('sec-'+t.dataset.cat);window.scrollTo({top:s.getBoundingClientRect().top+scrollY-$('tabs').offsetHeight-4,behavior:'smooth'});document.querySelectorAll('#tabs button').forEach(function(b){b.classList.toggle('on',b===t)});setTimeout(function(){spyOn=true},700);return}
    if(t.dataset.minus){for(var mx=cart.length-1;mx>=0;mx--){if(cart[mx].id===t.dataset.minus){cart[mx].qty--;if(cart[mx].qty<=0)cart.splice(mx,1);break}}rcHaptic('light');renderMenu();updCartBar();return}
    if(t.dataset.add||t.classList.contains('item')){var i=find(t.dataset.add||t.dataset.id);if(!i||i.soldOut)return;
      if(t.dataset.add&&(MODE==='dine'||!(i.mods&&i.mods.length))){addLine(i,[],1,'');if(MODE==='dine')renderMenu(),updCartBar();return}
      rcHaptic('light');itemSheet(i);return}
    if(t.dataset.opt){var k=t.dataset.opt,gi=k.split('_')[0],g=cur.mods[gi];var was=curSel[k];if(g.max===1)Object.keys(curSel).forEach(function(x){if(x.split('_')[0]===gi)curSel[x]=false});curSel[k]=!was;
      t.parentNode.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',!!curSel[b.dataset.opt])});rcHaptic('light');updAddBtn();return}
    if(t.dataset.q){curQty=Math.max(1,Math.min(20,curQty+(+t.dataset.q)));rcHaptic('light');updAddBtn();return}
    if(t.id==='add-go'){addLine(cur,curOpts(),curQty,($('note').value||'').trim());closeSheet();return}
    if(t.dataset.l){var l=cart[+t.dataset.l];l.qty+=+t.dataset.d;if(l.qty<=0)cart.splice(+t.dataset.l,1);rcHaptic('light');updCartBar();cartSheet();return}
    if(t.id==='cartbar'){cartSheet();return}
    if(t.dataset.fulfill){FULFILL=t.dataset.fulfill;sessionStorage.rc_fulfill=FULFILL;rcHaptic('light');applyFulfillUI();return}
    if(t.id==='dl-quote'){clearTimeout(feeTimer);requestQuote();return}
    if(t.id==='submit'){submit();return}
    if(t.id==='btn-ordered'){orderedSheet(false);return}
    if(t.id==='btn-call'){callSheet();return}
    if(t.id==='who-chg'){whoSheet();return}
    if(t.id==='who-line'){t.disabled=true;t.textContent='LINE 登入中…（預覽模擬）';setTimeout(function(){var n=FAKE_LINE[Math.floor(Math.random()*FAKE_LINE.length)];setWho(n,true);rcHaptic('success');var s=$('who-say');s.className='say ok';s.textContent='✅ 已用 LINE 登入：'+n+'（範例名字）';setTimeout(closeSheet,1200)},600);return}
    if(t.id==='who-ok'){var nk=($('who-nick').value||'').trim();if(!nk){var s2=$('who-say');s2.className='say bad';s2.textContent='請打個暱稱，或按「先不用，直接點」';rcHaptic('error');return}setWho(nk,false);rcHaptic('success');rcToast('好的，'+nk+'，開始點菜吧','ok');closeSheet();return}
    if(t.id==='who-skip'){setWho('',false);rcHaptic('light');closeSheet();return}
    if(t.classList.contains('callw')){rcDB.addCall(TABLE,t.dataset.why);rcHaptic('success');var sy=$('say');sy.className='say ok';sy.textContent='✅ 已通知櫃台：'+t.dataset.why+'，服務生馬上過去';setTimeout(closeSheet,1600);return}
  });
  $('q').addEventListener('input',function(){renderMenu();updCartBar()});
  document.addEventListener('input',function(e){if(e.target.closest&&e.target.closest('#sheet')){var s=$('say');if(s&&s.className.indexOf('bad')>=0){s.className='say';s.textContent=''}if(e.target.id==='ad')scheduleQuote()}});
  function live(){var id=$('sheet').dataset.live;if(id&&$('sheet').classList.contains('on'))doneSheet(id);if(MODE==='dine'){var n=rcDB.tableTab(TABLE).orders.length;var e=$('ordered-n');if(e)e.textContent=n?'('+n+')':''}}
  window.addEventListener('storage',live);setInterval(live,4000);live();
}
window.rcCustomerStart=function(){
  shell();bind();
  rcScan('.cartbar,#submit,#add-go,.add,.minus,#btn-call,.callw,#who-line,#who-ok,#who-skip,.ff-btn,#dl-quote');
  // 骨架先出現；正式版這裡等後端菜單回來
  // 骨架先出現，等菜單（後端或本機）到了再換掉
  rcDB.ready.then(function(){S=rcDB.store();MENU=rcDB.customerMenu();renderMenu();updCartBar();rcScan();
    if(MODE==='takeout'&&localStorage.rc_my_last&&location.hash==='#last')doneSheet(localStorage.rc_my_last)},
    function(e){$('menu').innerHTML='<div class="say bad" style="margin:12px">菜單讀不到（'+esc(e.message)+'）。請檢查網路後重新整理，或直接打電話 '+esc(S.phone)+'。</div>'});
  if(MODE==='dine'&&TABLE){whoBar();if(!WHO_SET)setTimeout(whoSheet,400)}
  rcA2hs('rc_a2hs_'+MODE,'加到主畫面更好點：按下方「分享」→「加入主畫面」','加到主畫面更好點：按右上「⋮」→「加到主畫面」');
};
})();
