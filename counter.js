// 20261112 囍塘蝦櫃臺（示範版）：接單、桌位、結帳（含啤酒）、菜單管理、今日小計。資料走 rcDB（後端或本機）。
(function(){
var $=rc$,esc=rcEsc,money=rcMoney,DB=rcDB;
var view='orders',curTable=null,curTake=null,seen=null,soundOn=false,actx=null;
var co={mode:'all',n:2,k:0,sel:{},method:'現金',recv:''};
var M=null,dirty=false,mcat=0;
function whoOf(l,o){return l.who||(o&&o.who)||''}
function S(){return DB.store()}
// 營業日：凌晨 6 點前算前一天（熱炒開到 02:00）
function bday(t){return rcYmd(new Date(t-6*3600e3))}
function today(t){return bday(t)===bday(Date.now())}
// ---------- 提示音＋震動 ----------
function beep(){if(!soundOn||!actx)return;try{[0,0.18,0.36].forEach(function(d,i){var o=actx.createOscillator(),g=actx.createGain();o.type='square';o.frequency.value=i===2?1320:988;g.gain.setValueAtTime(.18,actx.currentTime+d);g.gain.exponentialRampToValueAtTime(.001,actx.currentTime+d+.15);o.connect(g);g.connect(actx.destination);o.start(actx.currentTime+d);o.stop(actx.currentTime+d+.16)})}catch(e){}}
function enableSound(){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();actx.resume();soundOn=true;beep();rcHaptic('success');paintTop();rcToast('提示音已開啟，新訂單會叮咚＋震動','ok')}catch(e){rcToast('這台裝置不能播提示音，請留意畫面閃爍','bad')}}
// ---------- 出單（照抄蓮緣 RawBT 做法：canvas 點陣 → ESC/POS → intent）----------
function draw(lines){var W=384,lh=34,c=document.createElement('canvas');c.width=W;c.height=lines.length*lh+40;var g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,W,c.height);g.fillStyle='#000';g.textBaseline='top';
 lines.forEach(function(l,i){var s=typeof l==='string'?{t:l}:l;g.font=(s.b?'bold ':'')+(s.big?34:24)+'px sans-serif';if(s.r){g.textAlign='right';g.fillText(s.t,W-4,10+i*lh)}else{g.textAlign='left';g.fillText(s.t,4,10+i*lh,W-8)}});return c}
function raster(c){var g=c.getContext('2d'),W=c.width,H=c.height,d=g.getImageData(0,0,W,H).data,bw=W/8;var out=[0x1d,0x76,0x30,0,bw&255,bw>>8,H&255,H>>8];
 for(var y=0;y<H;y++)for(var x=0;x<bw;x++){var b=0;for(var i=0;i<8;i++){var p=(y*W+x*8+i)*4;if(d[p]<128)b|=0x80>>i}out.push(b)}out.push(0x0a,0x0a,0x0a,0x0a);return out}
function b64(a){var s='';for(var i=0;i<a.length;i+=8192)s+=String.fromCharCode.apply(null,a.slice(i,i+8192));return btoa(s)}
function printSay(msg,ok){var e=$('printSt');e.className=ok?'ok':'bad';e.textContent='🖨 '+rcTime(Date.now())+'　'+msg;rcHaptic(ok?'success':'error');rcToast(msg,ok?'ok':'bad',4000);return ok}
function printLines(lines,what){var m=$('pmode').value;localStorage.rc_pmode=m;
 if(m==='none')return printSay('目前設定「不印」。要出'+what+'請改列印方式後按「補印」。',false);
 if(m==='rawbt'){if(!/Android/i.test(navigator.userAgent))return printSay('RawBT 只能在 Android 平板用。這台叫不到 RawBT，請改「系統列印」。',false);
   var bytes=[0x1b,0x40].concat(raster(draw(lines)));location.href='intent:base64,'+b64(bytes)+'#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';return printSay('已送'+what+'到 RawBT。沒印出來請按「補印」。',true)}
 $('printArea').innerHTML=lines.map(function(l){var s=typeof l==='string'?{t:l}:l;return '<div style="'+(s.b?'font-weight:700;':'')+(s.big?'font-size:18px;':'')+(s.r?'text-align:right':'')+'">'+esc(s.t)+'</div>'}).join('');setTimeout(function(){window.print()},50);return printSay('已開系統列印（'+what+'）。',true)}
function kitchenLines(o){var L=[{t:S().name+'  廚房單',b:1},{t:(o.type==='dine'?o.table+' 桌 第'+o.round+'次':'外帶 '+o.no+' '+(o.name||'')),b:1,big:1},{t:rcTime(o.createdAt)+(o.pickup?'  取餐 '+o.pickup:'')},'--------------------------'];
 o.items.forEach(function(l){L.push({t:l.name+' x'+l.qty,b:1,big:1});if(whoOf(l,o))L.push('  👤 '+whoOf(l,o));if(l.opts.length||l.note)L.push('  '+l.opts.map(function(x){return x.n}).concat(l.note?[l.note]:[]).join('、'))});if(o.note)L.push({t:'備註：'+o.note,b:1});return L}
function billLines(title,lines,beer,total,pay){var L=[{t:S().name,b:1,big:1},{t:title,b:1},new Date().toLocaleString('zh-TW',{hour12:false}),'--------------------------'];
 lines.forEach(function(l){L.push(l.name+' x'+l.qty+(l.who?'（'+l.who+'）':''));L.push({t:money(rcLineTotal(l)),r:1})});
 beer.forEach(function(b){L.push(b.name+' x'+b.qty);L.push({t:money(b.price*b.qty),r:1})});
 L.push('--------------------------');L.push({t:'合計 '+money(total),b:1,big:1,r:1});if(pay){L.push({t:pay.method+(pay.method==='現金'?'  收 '+money(pay.recv)+'  找 '+money(pay.change):''),r:1})}L.push('謝謝光臨');return L}
// ---------- 畫面 ----------
function paintTop(){$('snd').textContent=soundOn?'🔔 提示音開':'🔕 點我開提示音';$('snd').className='btn'+(soundOn?'':' pri')}
function badges(){var os=DB.orders().filter(function(o){return o.status==='new'});$('bdg-orders').textContent=os.length||'';$('bdg-tables').textContent=DB.calls().length||''}
function render(){document.querySelectorAll('.rail button').forEach(function(b){b.classList.toggle('on',b.dataset.v===view||(view==='checkout'&&b.dataset.v==='tables'))});badges();
 var h={orders:vOrders,tables:vTables,checkout:vCheckout,menu:vMenu,today:vToday,set:vSet}[view]();$('main').innerHTML=h;rcScan()}
function callsBar(){var c=DB.calls();if(!c.length)return '';return '<div class="calls">'+c.map(function(x){return '<div class="call">🙋 '+esc(x.table)+' 桌：'+esc(x.why)+' <small>'+rcAgo(x.at)+'</small><button data-call="'+x.id+'">處理好了</button>'+(x.why.indexOf('結帳')>=0?'<button data-open="'+esc(x.table)+'">去結帳</button>':'')+'</div>'}).join('')+'</div>'}
function card(o,fresh){var t=o.type==='dine';
 var acts=o.status==='new'?'<button class="btn" data-st="cancel" data-id="'+o.id+'">取消</button><button class="btn pri act-main" data-st="accepted" data-id="'+o.id+'">接單＋出廚房單</button>'
  :o.status==='accepted'?'<button class="btn" data-reprint="'+o.id+'">補印</button><button class="btn ok act-main" data-st="ready" data-id="'+o.id+'">'+(t?'已上菜':'做好了，通知取餐')+'</button>'
  :(t?'<button class="btn" data-open="'+esc(o.table)+'">看 '+esc(o.table)+' 桌帳</button>':'<button class="btn pri act-main" data-take="'+o.id+'">客人來拿・收款</button>');
 return '<div class="card'+(fresh?' fresh':'')+'"><div class="h"><span>'+(t?esc(o.table)+' 桌':esc(o.no))+'</span><span class="typ '+(t?'d':'t')+'">'+(t?'內用・第'+o.round+'次':'外帶')+'</span></div>'+
 '<div class="who">'+rcTime(o.createdAt)+'（'+rcAgo(o.createdAt)+'）'+(t?'':'・'+esc(o.name)+' '+esc(o.phone)+'・取餐 <b>'+esc(o.pickup)+'</b>')+'</div>'+
 o.items.map(function(l){return '<div class="ln"><span>'+(whoOf(l,o)?'<small style="color:var(--brand);font-weight:800">'+esc(whoOf(l,o))+'・</small>':'')+'<b>'+esc(l.name)+'</b> ×'+l.qty+(l.opts.length||l.note?'<br><small>'+esc(l.opts.map(function(x){return x.n}).concat(l.note?[l.note]:[]).join('・'))+'</small>':'')+'</span><span>'+money(rcLineTotal(l))+'</span></div>'}).join('')+
 (o.note?'<div class="nt">📝 '+esc(o.note)+'</div>':'')+'<div class="ln" style="border:0;font-weight:900"><span>小計</span><span>'+money(rcOrderTotal(o))+'</span></div><div class="acts">'+acts+'</div></div>'}
var freshIds={};
function vOrders(){var os=DB.orders().filter(function(o){return today(o.createdAt)&&!o.paidAt&&o.status!=='cancel'&&o.status!=='done'});
 function col(st,title){var l=os.filter(function(o){return o.status===st});if(st==='ready')l=l.filter(function(o){return o.type==='takeout'||Date.now()-o.createdAt<36e5});return '<div class="col"><h2>'+title+' <span class="tag">'+l.length+'</span></h2>'+(l.map(function(o){return card(o,freshIds[o.id])}).join('')||'<div class="hint">（沒有）</div>')+'</div>'}
 return callsBar()+'<div class="kan">'+col('new','📥 新進來')+col('accepted','🔥 製作中')+col('ready','✅ 可取餐／已上菜')+'</div>'}
function tableAmt(t){var tab=DB.tableTab(t),food=0;tab.orders.forEach(function(o){o.items.forEach(function(l){if(!l.paid)food+=rcLineTotal(l)})});var beer=0,bn=0;beerList(tab.beer).forEach(function(b){beer+=b.price*b.qty;bn+=b.qty});return {tab:tab,food:food,beer:beer,bn:bn,total:food+beer}}
function beerList(m){return DB.beerItems().filter(function(b){return m[b.id]>0}).map(function(b){return {id:b.id,name:b.name,price:b.price,qty:m[b.id]}})}
function vTables(){var n=+S().tables||12,calls=DB.calls(),h='';
 for(var i=1;i<=n;i++){var a=tableAmt(i),busy=a.tab.orders.length||a.bn,first=a.tab.orders[0],nw=a.tab.orders.some(function(o){return o.status==='new'}),cl=calls.filter(function(c){return c.table==String(i)});
  h+='<button class="tb'+(busy?' busy':'')+'" data-open="'+i+'"><span class="no">'+i+' 桌</span>'+(cl.length?'<span class="flag">🙋 '+esc(cl[0].why)+'</span>':nw?'<span class="flag">新加點</span>':'')+
  (busy?'<span class="sub">'+(first?'開桌 '+rcTime(first.createdAt)+'・點了 '+a.tab.orders.length+' 次':'')+(a.bn?'・🍺 '+a.bn+' 瓶':'')+'</span><span class="amt">'+money(a.total)+'</span>':'<span class="sub">空桌</span>')+'</button>'}
 return callsBar()+'<div class="hint" style="margin-bottom:8px">點一桌就能加啤酒、結帳。桌數 '+n+'（'+(S().tablesExample?'範例，':'')+'可在 ⚙ 設定改）</div><div class="tables">'+h+'</div>'}
function coLines(){if(curTake){var o=DB.orders().filter(function(x){return x.id===curTake})[0];return o?o.items.map(function(l,i){return Object.assign({},l,{oid:o.id,ix:i})}):[]}
 var out=[];DB.tableTab(curTable).orders.forEach(function(o){o.items.forEach(function(l,i){out.push(Object.assign({},l,{oid:o.id,ix:i,round:o.round,who:whoOf(l,o)}))})});return out}
function coCalc(){var lines=coLines(),open=lines.filter(function(l){return !l.paid}),beer=curTake?[]:beerList(DB.tableTab(curTable).beer);
 var food=open.reduce(function(s,l){return s+rcLineTotal(l)},0),bsum=beer.reduce(function(s,b){return s+b.price*b.qty},0),all=food+bsum,due=all;
 if(co.mode==='split'){var share=Math.floor(all/co.n);due=co.k===co.n-1?all:share}
 if(co.mode==='items'||co.mode==='person')due=open.filter(function(l){return co.sel[l.oid+'_'+l.ix]}).reduce(function(s,l){return s+rcLineTotal(l)},0);
 var recv=co.method==='現金'?(+co.recv||0):due;return {lines:lines,open:open,beer:beer,food:food,bsum:bsum,all:all,due:due,recv:recv,change:recv-due}}
function vCheckout(){var c=coCalc(),title=curTake?'外帶 '+(DB.orders().filter(function(x){return x.id===curTake})[0]||{}).no:curTable+' 桌';
 var left='<div class="panel"><h3>'+esc(title)+' 點的菜 <button class="btn" data-back>← 回桌位</button></h3>'+(co.mode==='items'?'<div class="say ok">點選這次要付的品項</div>':'')+(co.mode==='person'?personBtns(c):'')+
  (c.lines.map(function(l){var k=l.oid+'_'+l.ix;return '<div class="cl'+(l.paid?' paid':'')+(co.sel[k]?' sel':'')+'" '+(co.mode==='items'&&!l.paid?'data-pick="'+k+'"':'')+'><span>'+(co.mode==='items'&&!l.paid?(co.sel[k]?'☑ ':'☐ '):'')+(l.who?'<small style="display:inline;color:var(--brand);font-weight:800">'+esc(l.who)+'・</small>':'')+'<b>'+esc(l.name)+'</b> ×'+l.qty+(l.round?' <small style="display:inline">第'+l.round+'次</small>':'')+(l.opts.length||l.note?'<small>'+esc(l.opts.map(function(x){return x.n}).concat(l.note?[l.note]:[]).join('・'))+'</small>':'')+'</span><b>'+money(rcLineTotal(l))+'</b></div>'}).join('')||'<div class="hint">還沒有點菜</div>')+
  '<div class="tot" style="margin-top:8px"><span>菜（未付）</span><b>'+money(c.food)+'</b></div></div>';
 var beers=DB.beerItems(),bm=curTake?{}:DB.tableTab(curTable).beer;
 var mid=curTake?'<div class="panel"><h3>外帶單</h3><div class="hint">外帶不加啤酒。客人要買啤酒請到桌位或另外開一桌結。</div></div>':
  '<div class="panel"><h3>🍺 加啤酒（喝完數空瓶）</h3>'+(beers.length?beers.map(function(b){var q=bm[b.id]||0;return '<div class="beer"><span class="bn">'+esc(b.name)+'<small>'+money(b.price)+' / 瓶'+(b.example?' <span class="tag ex">範例</span>':'')+'</small></span><button data-beer="'+b.id+'" data-d="-1" aria-label="少一瓶">−</button><b>'+q+'</b><button class="plus" data-beer="'+b.id+'" data-d="1" aria-label="多一瓶">＋</button></div>'}).join(''):'<div class="hint">菜單管理裡還沒有「櫃台專用」的啤酒品項</div>')+
  '<div class="tot" style="margin-top:8px"><span>啤酒 '+c.beer.reduce(function(s,b){return s+b.qty},0)+' 瓶</span><b>'+money(c.bsum)+'</b></div><div class="hint">啤酒價錢、種類在「菜單管理 → 啤酒」改。</div></div>';
 var right='<div class="panel"><h3>結帳</h3><div class="tot"><span>總計</span><b>'+money(c.all)+'</b></div>'+
  '<div class="seg">'+[['all','一起付'],['split','平均分'],['person','依點餐人'],['items','依品項']].map(function(x){return '<button data-mode="'+x[0]+'" class="'+(co.mode===x[0]?'on':'')+'">'+x[1]+'</button>'}).join('')+'</div>'+
  (co.mode==='split'?'<div class="beer" style="border:0"><span class="bn">分 '+co.n+' 人<small>每人約 '+money(Math.floor(c.all/co.n))+'・這是第 '+(co.k+1)+'/'+co.n+' 份'+(co.k===co.n-1?'（最後一份收剩下的）':'')+'</small></span><button data-n="-1">−</button><b>'+co.n+'</b><button class="plus" data-n="1">＋</button></div>':'')+
  '<div class="tot big"><span>這次收</span><span>'+money(c.due)+'</span></div>'+
  '<div class="seg">'+['現金','LINE Pay','刷卡','街口'].map(function(m){return '<button data-pay="'+m+'" class="'+(co.method===m?'on':'')+'">'+m+'</button>'}).join('')+'</div>'+
  (co.method==='現金'?'<label class="hint" for="recv">客人給的錢</label><input id="recv" inputmode="numeric" pattern="[0-9]*" placeholder="輸入金額" onfocus="this.select()" value="'+esc(co.recv)+'" style="font-size:24px;font-weight:800">'+
   '<div class="cash">'+[['剛好',c.due],[100,100],[500,500],[1000,1000],[2000,2000],[3000,3000],[5000,5000],['清除','']].map(function(x){return '<button data-recv="'+x[1]+'">'+(typeof x[0]==='number'?x[0].toLocaleString():x[0])+'</button>'}).join('')+'</div>'+
   '<div class="tot"><span>找零</span></div><div class="change'+(c.change<0?' neg':'')+'" id="chg">'+(co.recv===''?'—':c.change<0?'還差 '+money(-c.change):money(c.change))+'</div>':'')+
  '<div class="say" id="co-say"></div><button class="btn ok big" id="pay-go"'+(c.due<=0?' disabled':'')+'>確認收款 '+money(c.due)+'</button>'+
  '<button class="btn big" style="margin-top:8px" id="bill-print">🖨 印帳單（給客人看）</button></div>';
 return '<div class="co">'+left+mid+right+'</div>'}
function personBtns(c){var g={},order=[];c.open.forEach(function(l){var w=l.who||'沒留名';if(!g[w]){g[w]={amt:0,keys:[]};order.push(w)}g[w].amt+=rcLineTotal(l);g[w].keys.push(l.oid+'_'+l.ix)});
 var cur=Object.keys(co.sel).join(',');
 return '<div class="say ok">點一位，就只收他點的菜。啤酒是大家喝的，留到最後一起付或平均分。</div><div class="pgrid">'+order.map(function(w){var on=g[w].keys.join(',')===cur;return '<button class="pbtn'+(on?' on':'')+'" data-person="'+esc(g[w].keys.join(','))+'">'+esc(w)+'<b>'+money(g[w].amt)+'</b></button>'}).join('')+'</div>'}
function pay(){var c=coCalc(),say=$('co-say');
 function bad(m){say.className='say bad';say.textContent=m;rcHaptic('error')}
 if(c.due<=0)return bad(co.mode==='person'?'請先點一位點餐人':co.mode==='items'?'請先點選這次要付的品項':'沒有要收的金額');
 if(co.method==='現金'&&co.recv!==''&&c.change<0)return bad('收的錢不夠，還差 '+money(-c.change));
 var recv=co.method==='現金'?(co.recv===''?c.due:+co.recv):c.due,p={at:Date.now(),table:curTable,take:curTake,method:co.method,amount:c.due,recv:recv,change:recv-c.due,mode:co.mode};
 var closing=false,payLines=[],payBeer=[],keys=null;
 if(co.mode==='items'||co.mode==='person'){keys=Object.keys(co.sel);payLines=c.open.filter(function(l){return co.sel[l.oid+'_'+l.ix]});closing=payLines.length>=c.open.length&&!c.beer.length;co.sel={}}
 else if(co.mode==='split'&&co.k<co.n-1){co.k++}
 else closing=true;
 if(closing){if(!keys)payLines=c.open;payBeer=c.beer;co.k=0;co.mode='all'}
 p.lines=payLines.map(function(l){return {name:l.name,qty:l.qty,amt:rcLineTotal(l),who:l.who||''}});p.beer=payBeer;p.closed=closing;
 DB.pay({table:curTake?'':curTable,take:curTake||'',keys:keys,closing:closing,payment:p}).catch(function(e){rcToast('收款沒存到後端：'+e.message+'。請重新整理確認','bad',6000)});
 co.recv='';rcHaptic('success');
 var msg='✅ 已收款 '+money(p.amount)+'（'+p.method+(p.method==='現金'?'，找 '+money(p.change):'')+'）'+(closing?(curTake?'，外帶單完成':'，'+curTable+' 桌已清桌'):'，還有剩下的要收');
 if(closing){var back=curTake?'orders':'tables';curTable=null;curTake=null;view=back;render();rcToast(msg,'ok',4000)}else{render();var s=$('co-say');s.className='say ok';s.textContent=msg}}
function vMenu(){if(!M)M=DB.menu();var c=M[mcat]||M[0];
 var cats='<div class="panel catl"><h3>分類 <button class="btn" data-mc-add>＋ 分類</button></h3>'+M.map(function(x,i){return '<div class="cr'+(i===mcat?' on':'')+'"><button class="nm" data-mc="'+i+'">'+esc(x.name)+(x.counterOnly?' 🍺':'')+(x.hidden?' 🙈':'')+' <span class="tag">'+x.items.length+'</span></button><button class="icon-btn" data-mcmv="'+i+'" data-d="-1" aria-label="上移">↑</button><button class="icon-btn" data-mcmv="'+i+'" data-d="1" aria-label="下移">↓</button></div>'}).join('')+'</div>';
 var items=c.items.map(function(it,j){return '<div class="mi'+(it.soldOut||it.hidden?' off':'')+'"><div class="ud"><button data-mimv="'+j+'" data-d="-1" aria-label="上移">▲</button><button data-mimv="'+j+'" data-d="1" aria-label="下移">▼</button></div><div class="ph" style="'+(it.pic?'background-image:url('+esc(it.pic)+')':'')+'"></div>'+
  '<div><input data-mi="'+j+'" data-f="name" value="'+esc(it.name)+'" aria-label="品名"><div class="hint">'+(it.mods&&it.mods.length?'選項：'+esc(it.mods.map(function(g){return g.name+'（'+g.opts.map(function(o){return o.n+(o.p?'+'+o.p:'')}).join('、')+'）'}).join('；')):'沒有選項')+(it.example?' <span class="tag ex">範例</span>':'')+'</div></div>'+
  '<input data-mi="'+j+'" data-f="price" inputmode="numeric" pattern="[0-9]*" value="'+it.price+'" aria-label="價錢" style="font-weight:800">'+
  '<div class="tg"><button data-mit="'+j+'" data-f="soldOut" class="'+(it.soldOut?'on':'')+'">'+(it.soldOut?'今日售完':'售完')+'</button><button data-mit="'+j+'" data-f="hidden" class="hid '+(it.hidden?'on':'')+'">'+(it.hidden?'已隱藏':'隱藏')+'</button><button data-opts="'+j+'">選項</button><button data-midel="'+j+'" aria-label="刪除">🗑</button></div></div>'}).join('');
 var right='<div class="panel"><h3><span>'+(c?'<input data-cname value="'+esc(c.name)+'" style="font-size:18px;font-weight:800;width:260px" aria-label="分類名稱">':'')+'</span><span style="display:flex;gap:6px"><button class="btn" data-mc-flag="counterOnly">'+(c.counterOnly?'🍺 櫃台專用（客人看不到）':'客人可點')+'</button><button class="btn" data-mc-flag="hidden">'+(c.hidden?'🙈 整類隱藏中':'整類顯示中')+'</button><button class="btn" data-mc-del>🗑 刪分類</button></span></h3>'+
  (c.counterOnly?'<div class="say ok">這一類是「櫃台專用」：客人手機上看不到，只會出現在結帳畫面的啤酒面板。</div>':'')+items+'<button class="btn" style="margin-top:10px" data-mi-add>＋ 新增品項</button></div>';
 return '<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><b style="font-size:20px">📋 菜單管理</b><span class="hint">改完按「儲存」，客人頁重新整理就看到。預覽：存在這台瀏覽器；正式版：存到後端，所有手機同步。</span><span style="flex:1"></span><button class="btn" data-mreset>還原成 iChef 原菜單</button><button class="btn pri" id="msave">'+(dirty?'💾 儲存（有改動）':'💾 已儲存')+'</button></div><div class="say" id="m-say"></div><div class="mg">'+cats+right+'</div>'}
function mark(){dirty=true;var b=$('msave');if(b)b.textContent='💾 儲存（有改動）'}
function optsModal(j){var it=M[mcat].items[j],g=JSON.parse(JSON.stringify(it.mods||[]));
 function paint(){$('mbox').innerHTML='<h3 style="margin-top:0">'+esc(it.name)+' 的選項</h3><div class="hint">例：辣度（小辣／中辣／大辣，擇一）、升級（換溫體牛 +50）。</div>'+
  g.map(function(x,gi){return '<div class="og"><div class="row"><input data-g="'+gi+'" data-gf="name" value="'+esc(x.name)+'" placeholder="選項組名稱"><label style="white-space:nowrap"><input type="checkbox" data-g="'+gi+'" data-gf="max" style="width:auto;min-height:auto" '+(x.max===1?'checked':'')+'> 擇一</label><button class="icon-btn" data-gdel="'+gi+'">🗑</button></div>'+
   x.opts.map(function(o,oi){return '<div class="row"><input data-g="'+gi+'" data-o="'+oi+'" data-of="n" value="'+esc(o.n)+'" placeholder="選項"><input data-g="'+gi+'" data-o="'+oi+'" data-of="p" inputmode="numeric" value="'+o.p+'" style="width:100px" aria-label="加價"><button class="icon-btn" data-odel="'+gi+'_'+oi+'">✕</button></div>'}).join('')+'<button class="btn" data-oadd="'+gi+'">＋ 選項</button></div>'}).join('')+
  '<button class="btn" data-gadd>＋ 選項組</button><div style="display:flex;gap:8px;margin-top:14px"><button class="btn" style="flex:1" data-mclose>取消</button><button class="btn pri" style="flex:1" data-osave>套用</button></div>'}
 paint();$('modal').classList.add('on');
 $('mbox').oninput=function(e){var t=e.target,gi=t.dataset.g;if(gi==null)return;if(t.dataset.gf==='name')g[gi].name=t.value;else if(t.dataset.gf==='max')g[gi].max=t.checked?1:null;else if(t.dataset.of)g[gi].opts[t.dataset.o][t.dataset.of]=t.dataset.of==='p'?(+t.value.replace(/\D/g,'')||0):t.value};
 $('mbox').onchange=$('mbox').oninput;
 $('mbox').onclick=function(e){var t=e.target.closest('button');if(!t)return;
  if(t.hasAttribute('data-gadd')){g.push({name:'新選項組',max:1,opts:[{n:'',p:0}]});paint()}
  else if(t.dataset.gdel){g.splice(+t.dataset.gdel,1);paint()}
  else if(t.dataset.oadd){g[+t.dataset.oadd].opts.push({n:'',p:0});paint()}
  else if(t.dataset.odel){var a=t.dataset.odel.split('_');g[a[0]].opts.splice(+a[1],1);paint()}
  else if(t.hasAttribute('data-mclose'))$('modal').classList.remove('on');
  else if(t.hasAttribute('data-osave')){it.mods=g.map(function(x){return {name:x.name.trim()||'選項',max:x.max,opts:x.opts.filter(function(o){return String(o.n).trim()})}}).filter(function(x){return x.opts.length});$('modal').classList.remove('on');mark();render();rcToast('選項已套用，記得按「儲存」','ok')}}}
function vToday(){var ps=DB.paidList().filter(function(p){return today(p.at)}),sum=0,byM={},items={},beer={},take=0,dine=0;
 ps.forEach(function(p){sum+=p.amount;byM[p.method]=(byM[p.method]||0)+p.amount;if(p.take)take+=p.amount;else dine+=p.amount;(p.lines||[]).forEach(function(l){items[l.name]=(items[l.name]||0)+l.qty});(p.beer||[]).forEach(function(b){beer[b.name]=(beer[b.name]||0)+b.qty})});
 var top=Object.keys(items).sort(function(a,b){return items[b]-items[a]}).slice(0,10),bt=Object.keys(beer).reduce(function(s,k){return s+beer[k]},0),open=0;for(var i=1;i<=(+S().tables||12);i++)open+=tableAmt(i).total;
 return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><b style="font-size:20px">📊 今日小計 '+bday(Date.now())+'</b>'+(ps.some(function(p){return p.example})?' <span class="tag ex">含範例資料</span>':'')+'<span style="flex:1"></span><button class="btn" id="day-print">🖨 印日結</button></div>'+
 '<div class="stat"><div class="panel">已收<b>'+money(sum)+'</b></div><div class="panel">收款筆數<b>'+ps.length+'</b></div><div class="panel">🍺 啤酒<b>'+bt+' 瓶</b></div><div class="panel">還沒結的桌<b>'+money(open)+'</b></div></div>'+
 '<div class="co" style="grid-template-columns:1fr 1fr 1fr"><div class="panel"><h3>付款方式</h3>'+(Object.keys(byM).map(function(k){return '<div class="tot"><span>'+esc(k)+'</span><b>'+money(byM[k])+'</b></div>'}).join('')||'<div class="hint">今天還沒收款</div>')+'<hr style="border:0;border-top:1px solid var(--line)"><div class="tot"><span>內用</span><b>'+money(dine)+'</b></div><div class="tot"><span>外帶</span><b>'+money(take)+'</b></div></div>'+
 '<div class="panel"><h3>熱銷前 10</h3>'+(top.map(function(k,i){return '<div class="tot"><span>'+(i+1)+'. '+esc(k)+'</span><b>'+items[k]+' 份</b></div>'}).join('')||'<div class="hint">—</div>')+'</div>'+
 '<div class="panel"><h3>啤酒</h3>'+(Object.keys(beer).map(function(k){return '<div class="tot"><span>'+esc(k)+'</span><b>'+beer[k]+' 瓶</b></div>'}).join('')||'<div class="hint">—</div>')+'</div></div>'}
function vSet(){var s=S(),api=DB.mode==='api';return '<div class="panel" style="max-width:640px"><h3>⚙ 設定</h3>'+
 (api?'<label class="hint" for="pin-in">店員密碼（PIN）— 接單、結帳、改菜單都要</label><div style="display:flex;gap:8px"><input id="pin-in" type="password" inputmode="numeric" autocomplete="off" value="'+esc(localStorage.rc_pin||'')+'"><button class="btn pri" id="pin-set" style="min-width:120px">確認</button></div><div class="say" id="pin-say"></div><hr style="border:0;border-top:1px solid var(--line);margin:18px 0">':'<div class="say ok">現在是本機模式（沒填後端網址），資料只存在這台瀏覽器。</div>')+
 '<label class="hint">店名</label><input id="s-name" value="'+esc(s.name)+'"><label class="hint">桌數</label><input id="s-tables" inputmode="numeric" value="'+esc(s.tables)+'">'+
 '<div class="say" id="s-say"></div><button class="btn pri big" id="s-save">儲存設定</button><hr style="border:0;border-top:1px solid var(--line);margin:18px 0">'+
 '<div class="hint">各桌 QR Code：首頁的「印桌貼 QR」。</div><button class="btn" style="margin-top:10px" id="demo">載入示範訂單（範例資料）</button> <button class="btn" id="wipe">清空示範訂單（菜單不動）</button></div>'}
// 示範訂單：名字都標「範例」
var DEMO=[
 ['dine',{table:'5',who:'範例小明'},[['305df7f3','胡椒蝦',500,1,[{g:'口味',n:'調味加重',p:0}],'範例小明'],['高麗菜','高麗菜',120,1,null,'範例小明'],['蒜泥白肉','蒜泥白肉',250,1,null,'範例阿土伯']],'ready',48],
 ['dine',{table:'5',who:'範例阿土伯'},[['鹽烤軟絲','鹽烤軟絲',400,1,null,'範例阿土伯'],['菜脯蛋炒飯','菜脯蛋炒飯',150,1,[{g:'辣度',n:'小辣',p:0}],'範例美玲']],'accepted',12],
 ['dine',{table:'2',who:'平板',source:'kiosk'},[['三杯蝦','三杯蝦',500,1,null,'平板'],['炒大蛤蜊','炒大蛤蜊',300,1,null,'平板'],['白飯','白飯（1碗）',20,3,null,'平板']],'ready',30],
 ['dine',{table:'8'},[['鳳梨苦瓜雞','鳳梨苦瓜雞',850,1],['金沙軟絲','金沙軟絲',450,1]],'new',1],
 ['takeout',{name:'範例陳小姐',phone:'0900000001',pickup:'今天 21:30'},[['奶油蝦','奶油蝦',550,1],['塔香地瓜葉','塔香地瓜葉',150,1]],'new',2]];
function demoItems(rows){var idx={};DB.menu().forEach(function(c){c.items.forEach(function(i){idx[i.name]=i.id})});
 return rows.map(function(r){var id=r[0].length===8&&/^[0-9a-f]+$/.test(r[0])?r[0]:(idx[r[1]]||'x');return {id:id,name:r[1],price:r[2],qty:r[3],opts:r[4]||[],note:'',who:r[5]||''}})}
function seedDemo(){
 if(DB.mode==='api'){var chain=Promise.resolve();
  DEMO.forEach(function(d){chain=chain.then(function(){return DB.addOrderP(Object.assign({type:d[0],items:demoItems(d[2]),note:'',status:d[3]},d[1]))})});
  return chain.then(function(){DB.setBeer('5',{b1:3,b3:2});DB.setBeer('2',{b1:4});DB.addCall('5','🧾 我要結帳')})}
 DEMO.forEach(function(d){var extra=Object.assign({},d[1]);if(d[0]==='dine'){extra.round=DB.tableTab(extra.table).orders.length+1;extra.no=DB.nextNo('T')}else extra.no=DB.nextNo('A');
  var o=DB.addOrder(Object.assign({type:d[0],items:demoItems(d[2]),note:''},extra));DB.updateOrder(o.id,{status:d[3],createdAt:Date.now()-d[4]*60000})});
 DB.setBeer('5',{b1:3,b3:2});DB.setBeer('2',{b1:4});DB.addCall('5','🧾 我要結帳');
 DB.addPaid({at:Date.now()-90*60000,table:'3',method:'現金',amount:1730,recv:2000,change:270,lines:[{name:'胡椒蝦',qty:1,amt:500},{name:'蔥爆牛肉',qty:1,amt:250},{name:'炒大蛤蜊',qty:1,amt:300}],beer:[{name:'台灣啤酒 金牌（瓶）',price:90,qty:6}],closed:true,example:true});
 DB.addPaid({at:Date.now()-70*60000,take:'demo',method:'LINE Pay',amount:700,recv:700,change:0,lines:[{name:'胡椒蝦',qty:1,amt:500},{name:'菜脯蛋炒飯',qty:1,amt:150}],beer:[],closed:true,example:true})}
// ---------- 事件 ----------
function poll(){var os=DB.orders(),ids={};os.forEach(function(o){ids[o.id]=1});
 if(seen){var nw=os.filter(function(o){return !seen[o.id]&&o.status==='new'});if(nw.length){nw.forEach(function(o){freshIds[o.id]=1});beep();rcHaptic('success');rcToast('🔔 新訂單：'+nw.map(function(o){return o.type==='dine'?o.table+' 桌加點':'外帶 '+o.no}).join('、'),'ok',5000);if(view==='orders'||view==='tables')render();else badges()}
  var cs=DB.calls().length;if(cs>lastCalls){beep();rcHaptic('success');rcToast('🙋 有客人在叫服務','ok',4000);if(view==='orders'||view==='tables')render()}lastCalls=cs}
 else lastCalls=DB.calls().length;seen=ids;badges()}
var lastCalls=0;
function bind(){
 document.addEventListener('click',function(e){var t=e.target.closest('button,[data-pick]');if(!t)return;var d=t.dataset;
  if(t.closest('.rail')&&d.v){if(view==='menu'&&dirty&&d.v!=='menu'&&!confirm('菜單有改動還沒儲存，確定離開？'))return;view=d.v;curTable=null;curTake=null;render();return}
  if(t.id==='snd')return enableSound();
  if(d.st){var o=DB.orders().filter(function(x){return x.id===d.id})[0];if(d.st==='cancel'&&!confirm('確定取消這張單？'))return;DB.updateOrder(d.id,{status:d.st});delete freshIds[d.id];if(d.st==='accepted'&&o)printLines(kitchenLines(o),'廚房單');else rcHaptic('success');rcToast(d.st==='accepted'?'已接單':d.st==='ready'?'已標記完成':'已取消','ok');render();return}
  if(d.reprint){var o2=DB.orders().filter(function(x){return x.id===d.reprint})[0];if(o2)printLines(kitchenLines(o2),'廚房單');return}
  if(d.call){DB.doneCall(d.call);rcHaptic('success');render();return}
  if(d.open){curTable=d.open;curTake=null;co={mode:'all',n:2,k:0,sel:{},method:'現金',recv:''};view='checkout';render();return}
  if(d.take){curTake=d.take;curTable=null;co={mode:'all',n:2,k:0,sel:{},method:'現金',recv:''};view='checkout';render();return}
  if(t.hasAttribute('data-back')){view=curTake?'orders':'tables';curTable=null;curTake=null;render();return}
  if(d.beer){var b=DB.tableTab(curTable).beer;b[d.beer]=Math.max(0,(b[d.beer]||0)+(+d.d));DB.setBeer(curTable,b);rcHaptic('light');render();return}
  if(d.mode){co.mode=d.mode;co.sel={};co.k=0;render();return}
  if(d.n){co.n=Math.max(2,Math.min(20,co.n+(+d.n)));co.k=Math.min(co.k,co.n-1);render();return}
  if(d.pay){co.method=d.pay;render();return}
  if(d.recv!=null&&t.closest('.cash')){co.recv=d.recv;rcHaptic('light');render();return}
  if(d.person!=null){co.sel={};d.person.split(',').forEach(function(k){co.sel[k]=1});rcHaptic('light');render();return}
  if(d.pick){if(co.sel[d.pick])delete co.sel[d.pick];else co.sel[d.pick]=1;render();return}
  if(t.id==='pay-go')return pay();
  if(t.id==='bill-print'){var c=coCalc();printLines(billLines(curTake?'外帶':curTable+' 桌',c.open,c.beer,c.all),'帳單');return}
  if(t.id==='day-print'){var ps=DB.paidList().filter(function(p){return today(p.at)}),s2=ps.reduce(function(a,p){return a+p.amount},0);printLines([{t:S().name+' 日結',b:1,big:1},rcYmd(new Date()),'收款 '+ps.length+' 筆',{t:'合計 '+money(s2),b:1,big:1}],'日結');return}
  // 菜單管理
  if(d.mc!=null){mcat=+d.mc;render();return}
  if(d.mcmv!=null){var i=+d.mcmv,j=i+(+d.d);if(j<0||j>=M.length)return;var x=M.splice(i,1)[0];M.splice(j,0,x);mcat=j;mark();render();return}
  if(t.hasAttribute('data-mc-add')){var nm=prompt('新分類名稱（例：飲料）');if(!nm)return;M.push({id:'c'+Date.now(),name:nm.trim(),items:[]});mcat=M.length-1;mark();render();return}
  if(d.mcFlag){M[mcat][d.mcFlag]=!M[mcat][d.mcFlag];mark();render();return}
  if(t.hasAttribute('data-mc-del')){if(!confirm('確定刪除分類「'+M[mcat].name+'」和裡面 '+M[mcat].items.length+' 個品項？（按儲存才會真的刪）'))return;M.splice(mcat,1);mcat=0;mark();render();return}
  if(d.mimv!=null){var it=M[mcat].items,a=+d.mimv,bq=a+(+d.d);if(bq<0||bq>=it.length)return;it.splice(bq,0,it.splice(a,1)[0]);mark();render();return}
  if(d.mit!=null){var m=M[mcat].items[+d.mit];m[d.f]=!m[d.f];rcHaptic('light');mark();render();return}
  if(d.midel!=null){var m2=M[mcat].items[+d.midel];if(!confirm('確定刪除「'+m2.name+'」？（只是暫時不賣可以用「售完」或「隱藏」）'))return;M[mcat].items.splice(+d.midel,1);mark();render();return}
  if(t.hasAttribute('data-mi-add')){M[mcat].items.push({id:'n'+Date.now().toString(36),name:'新品項',price:0,mods:[]});mark();render();var ins=document.querySelectorAll('[data-f=name]');var last=ins[ins.length-1];if(last){last.focus();last.select()}return}
  if(d.opts!=null){optsModal(+d.opts);return}
  if(t.hasAttribute('data-mreset')){if(!confirm('還原成從 iChef 讀到的原菜單？你在這裡的修改都會不見。'))return;DB.resetMenuP().then(function(){M=null;dirty=false;render();rcToast('已還原','ok')},function(e){rcToast('還原失敗：'+e.message,'bad',5000)});return}
  if(t.id==='msave'){var say=$('m-say');var badp=[];M.forEach(function(c){c.items.forEach(function(i){if(!(i.price>0))badp.push(i.name)})});
   if(badp.length){say.className='say bad';say.textContent='這些品項價錢是 0，請先填：'+badp.slice(0,5).join('、');rcHaptic('error');return}
   t.disabled=true;t.textContent='儲存中…';DB.saveMenuP(M).then(function(){dirty=false;say.className='say ok';say.textContent='✅ 已儲存 '+rcTime(Date.now())+'。客人頁重新整理就會看到新菜單。';rcHaptic('success');t.disabled=false;t.textContent='💾 已儲存'},function(err){say.className='say bad';say.textContent='儲存失敗，修改還在畫面上，請再按一次。（'+err.message+'）';rcHaptic('error');t.disabled=false;t.textContent='💾 儲存（有改動）'});return}
  if(t.id==='s-save'){var e3=$('s-say');var n=parseInt($('s-tables').value,10);if(!(n>0&&n<=200)){e3.className='say bad';e3.textContent='桌數請填 1–200';rcHaptic('error');return}DB.saveStoreP({name:$('s-name').value.trim()||S().name,tables:n,tablesExample:false}).then(function(){e3.className='say ok';e3.textContent='✅ 已儲存';rcHaptic('success')},function(err){e3.className='say bad';e3.textContent='儲存失敗：'+err.message;rcHaptic('error')});return}
  if(t.id==='pin-set'){localStorage.rc_pin=($('pin-in').value||'').trim();var e4=$('pin-say');DB.checkPinP().then(function(){e4.className='say ok';e4.textContent='✅ 密碼正確';rcHaptic('success');DB.sync&&DB.sync(true)},function(err){e4.className='say bad';e4.textContent=err.message;rcHaptic('error')});return}
  if(t.id==='demo'){t.disabled=true;Promise.resolve(seedDemo()).then(function(){rcToast('已載入示範訂單（範例）','ok');view='orders';render()},function(e){t.disabled=false;rcToast('載入失敗：'+e.message,'bad',5000)});return}
  if(t.id==='wipe'){if(!confirm('清空所有示範訂單、桌帳、服務呼叫、收款紀錄？（菜單不動）'))return;DB.resetDemoP().then(function(){seen=null;poll();render();rcToast('已清空','ok')},function(e){rcToast('清空失敗：'+e.message,'bad',5000)});return}
 });
 document.addEventListener('input',function(e){var t=e.target;
  if(t.id==='recv'){co.recv=t.value.replace(/\D/g,'');var c=coCalc(),g=$('chg');g.className='change'+(c.change<0?' neg':'');g.textContent=co.recv===''?'—':c.change<0?'還差 '+money(-c.change):money(c.change);return}
  if(t.dataset.mi!=null){var m=M[mcat].items[+t.dataset.mi];m[t.dataset.f]=t.dataset.f==='price'?(+t.value.replace(/\D/g,'')||0):t.value;mark();return}
  if(t.hasAttribute('data-cname')){M[mcat].name=t.value;mark();return}
 });
 window.addEventListener('storage',function(){poll();if(view==='checkout'&&document.activeElement&&document.activeElement.id!=='recv')render();else if(view!=='menu'&&view!=='checkout'&&view!=='set')render()});
 window.addEventListener('rc-error',function(e){rcToast(e.detail,'bad',5000)});
 setInterval(poll,2500);
 setInterval(function(){$('clock').textContent=new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false})},1000);
 window.addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue=''}});
}
window.rcCounterStart=function(){
 $('badge').textContent=rcBadge();$('pmode').value=localStorage.rc_pmode||'rawbt';paintTop();bind();
 rcScan('.act-main,#pay-go,#msave,#s-save,#snd');
 var v=new URLSearchParams(location.search).get('v');if(v)view=v;
 DB.ready.then(function(){
  if(DB.mode==='api'&&!v){DB.checkPinP().then(function(){poll();render()},function(){view='set';render();var e=$('pin-say');if(e){e.className='say bad';e.textContent='請先輸入店員密碼'}})}
  else{poll();render()}
 },function(e){$('main').innerHTML='<div class="say bad">連不上後端：'+esc(e.message)+'。請檢查網路，或重新整理。</div>'});
};
})();
