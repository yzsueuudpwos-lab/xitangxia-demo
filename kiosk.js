// 20261111 平板點餐模式：店員把平板交給客人，像自動販賣機一樣按一按就送出。
// 一按卡片 = +1；有辣度的菜才在卡片下面出現幾顆大按鈕（預設「正常」）；口味、升級加價交給店員。
// 訂單跟 table.html 一樣寫進同一桌的帳（預覽：localStorage），櫃臺會收到。
(function(){
var $=rc$,esc=rcEsc,money=rcMoney;
var P=new URLSearchParams(location.search),FIX=(P.get('table')||'').replace(/[^0-9A-Za-z]/g,'');
var S=rcDB.store(),MENU=[],cat=0,table=FIX||sessionStorage.rc_k_table||'',cart={},spice={},resetArm=0,doneTimer=null;
function items(){var o=[];MENU.forEach(function(c){c.items.forEach(function(i){o.push(i)})});return o}
function find(id){return items().filter(function(i){return i.id===id})[0]}
function spiceGroup(i){return (i.mods||[]).filter(function(g){return g.name==='辣度'})[0]}
function count(){return Object.keys(cart).reduce(function(s,k){return s+cart[k]},0)}
function total(){return Object.keys(cart).reduce(function(s,k){var i=find(k);return s+(i?i.price*cart[k]:0)},0)}
function show(v){['k-pick','k-menu','k-done'].forEach(function(x){$(x).hidden=x!==v})}
// ---- 選桌 ----
function pick(){show('k-pick');var n=+S.tables||12,h='';for(var t=1;t<=n;t++){var busy=rcDB.tableTab(t).orders.length;h+='<button data-tb="'+t+'"'+(busy?' class="busy"':'')+'>'+t+'<small>'+(busy?'用餐中':'　')+'</small></button>'}
 $('k-pick').innerHTML='<div class="khead"><h1>'+esc(S.name)+'</h1><span class="sp"></span><button id="theme-btn" aria-label="切換深色模式">🌙</button></div><div class="kpick"><h2>店員請先選桌號</h2><div class="g">'+h+'</div><p style="color:var(--sub)">選好再把平板交給客人。桌數 '+n+(S.tablesExample?'（範例）':'')+'</p></div>';rcTheme.apply();bindTheme()}
function bindTheme(){var b=$('theme-btn');if(b)b.onclick=function(){rcTheme.toggle();rcHaptic('light')}}
// ---- 點餐 ----
function menu(){show('k-menu');
 $('k-menu').innerHTML='<div class="khead"><span class="tb">'+esc(table)+' 桌</span><h1>'+esc(S.name)+'</h1><span class="sp"></span><span class="beer">🍺 啤酒冰箱自己拿，結帳時算</span>'+(FIX?'':'<button id="k-chg">換桌</button>')+'<button id="theme-btn" aria-label="切換深色模式">🌙</button></div>'+
 '<div class="kbody"><nav class="kcats" id="kcats"></nav><div class="kgrid" id="kgrid">'+skel()+'</div></div>'+
 '<div class="kbar"><div class="sum"><div class="tt" id="k-tt">還沒點</div><div class="ls" id="k-ls">按菜的照片就加一份</div></div><button class="reset" id="k-reset">重來</button><button class="send" id="k-send" disabled>送出點餐</button></div><div class="ksay" id="k-say"></div>';
 rcTheme.apply();bindTheme();rcScan('.send,.kcard,.reset');
 rcDB.ready.then(function(){MENU=rcDB.customerMenu();paint()},function(e){$('kgrid').innerHTML='<div class="say bad">菜單讀不到（'+esc(e.message)+'），請找店員</div>'});
}
function skel(){var h='';for(var i=0;i<6;i++)h+='<div class="sk" style="height:300px;border-radius:22px"></div>';return h}
function paint(){
 $('kcats').innerHTML=MENU.map(function(c,i){var n=c.items.reduce(function(s,it){return s+(cart[it.id]||0)},0);return '<button data-cat="'+i+'" class="'+(i===cat?'on':'')+'">'+esc(c.name)+'<span class="n">'+(n?'已點 '+n+' 份':c.items.length+' 樣')+'</span></button>'}).join('');
 var c=MENU[cat];
 $('kgrid').innerHTML=c.items.map(function(i){var q=cart[i.id]||0,sg=spiceGroup(i);
  return '<div role="button" tabindex="0" class="kcard'+(q?' has':'')+(i.soldOut?' so':'')+'" data-id="'+i.id+'" aria-label="'+esc(i.name)+' 加一份">'+
  '<div class="ph" style="'+(i.pic?'background-image:url('+esc(i.pic)+')':'')+'">'+(i.pic?'':'🍳')+'</div>'+
  (q?'<span class="cnt">'+q+'</span>':'<span class="tap">'+(i.soldOut?'今日售完':'按一下 +1')+'</span>')+
  '<div class="tx"><div class="nm">'+esc(i.name)+'</div><div class="pr">'+money(i.price)+'</div></div>'+
  (q&&sg?'<div class="kopt">'+['正常'].concat(sg.opts.map(function(o){return o.n})).map(function(n){var on=(spice[i.id]||'正常')===n;return '<span role="button" data-sp="'+esc(n)+'" data-for="'+i.id+'" class="'+(on?'on':'')+'" style="flex:1;display:flex;align-items:center;justify-content:center;min-height:60px;border-radius:14px;border:3px solid '+(on?'var(--k-ink)':'var(--line)')+';background:'+(on?'var(--k-ink)':'var(--bg)')+';color:'+(on?'var(--k-bg)':'var(--k-ink)')+';font-size:22px;font-weight:900">'+esc(n)+'</span>'}).join('')+'</div>':'')+
  '</div>'}).join('')+'<div class="kfoot">'+rcPromo()+'</div>';
 // − 按鈕放在卡片外層（避免 button 包 button）
 [].forEach.call(document.querySelectorAll('.kcard.has'),function(card){var m=document.createElement('span');m.className='kmin';m.setAttribute('role','button');m.setAttribute('aria-label','少一份');m.dataset.minus=card.dataset.id;m.textContent='−';card.appendChild(m)});
 bar();rcScan();
}
function bar(){var n=count();$('k-send').disabled=!n;$('k-tt').textContent=n?'共 '+n+' 份・'+money(total()):'還沒點';
 $('k-ls').textContent=n?Object.keys(cart).filter(function(k){return cart[k]>0}).map(function(k){var i=find(k);return i.name+(spice[k]&&spice[k]!=='正常'?'('+spice[k]+')':'')+'×'+cart[k]}).join('、'):'按菜的照片就加一份'}
function say(m){var e=$('k-say');e.textContent=m;rcHaptic('error');setTimeout(function(){e.textContent=''},3000)}
function send(){if(!count())return say('還沒點菜喔');if(!table)return say('還沒選桌號，請找店員');
 var b=$('k-send');b.disabled=true;b.textContent='送出中…';
 var its=Object.keys(cart).filter(function(k){return cart[k]>0}).map(function(k){var i=find(k);return {who:'平板',id:i.id,name:i.name,price:i.price,qty:cart[k],opts:spice[k]&&spice[k]!=='正常'?[{g:'辣度',n:spice[k],p:0}]:[],note:''}});
 rcDB.addOrderP({type:'dine',table:table,round:rcDB.tableTab(table).orders.length+1,no:rcDB.nextNo('T'),source:'kiosk',who:'平板',items:its,note:'平板點餐'}).then(function(o){rcHaptic('success');done(o)},function(e){b.disabled=false;b.textContent='送出點餐';say('送出失敗，請再按一次（點的菜還在）：'+e.message)})}
function done(o){show('k-done');var left=6;
 $('k-done').innerHTML='<div class="kdone"><div class="ic">✅</div><h2>已送出！</h2><div class="t2">請把平板交給店員</div><div>'+esc(o.table)+' 桌・第 '+o.round+' 次點餐・'+money(rcOrderTotal(o))+'</div><div class="ls">'+o.items.map(function(l){return esc(l.name)+(l.opts.length?'('+esc(l.opts[0].n)+')':'')+' ×'+l.qty}).join('、')+'</div><div class="cd" id="k-cd">'+left+' 秒後回到點餐畫面</div><button id="k-next">好，下一位</button></div>';
 rcScan('#k-next');clearInterval(doneTimer);doneTimer=setInterval(function(){left--;var e=$('k-cd');if(e)e.textContent=left+' 秒後回到點餐畫面';if(left<=0)next()},1000)}
function next(){clearInterval(doneTimer);cart={};spice={};cat=0;if(!FIX){table='';sessionStorage.removeItem('rc_k_table');pick()}else menu()}
document.addEventListener('click',function(e){var t=e.target;
 var tb=t.closest('[data-tb]');if(tb){table=tb.dataset.tb;sessionStorage.rc_k_table=table;rcHaptic('success');menu();return}
 var c=t.closest('[data-cat]');if(c){cat=+c.dataset.cat;rcHaptic('light');paint();$('kgrid').scrollTop=0;return}
 var sp=t.closest('[data-sp]');if(sp){spice[sp.dataset.for]=sp.dataset.sp;rcHaptic('light');paint();return}
 var mi=t.closest('[data-minus]');if(mi){var id=mi.dataset.minus;cart[id]=Math.max(0,(cart[id]||0)-1);if(!cart[id]){delete cart[id];delete spice[id]}rcHaptic('light');paint();return}
 var k=t.closest('.kcard');if(k){var i=find(k.dataset.id);if(!i)return;if(i.soldOut)return say(i.name+' 今天賣完了');cart[i.id]=(cart[i.id]||0)+1;rcHaptic('success');paint();return}
 if(t.closest('#k-send'))return send();
 if(t.closest('#k-reset')){if(!count())return;if(Date.now()-resetArm<3000){cart={};spice={};resetArm=0;rcHaptic('success');paint();var r=$('k-reset');r.textContent='重來';r.classList.remove('warn');return}
  resetArm=Date.now();var r2=$('k-reset');r2.textContent='再按一次清空';r2.classList.add('warn');rcHaptic('light');setTimeout(function(){var r3=$('k-reset');if(r3&&Date.now()-resetArm>=2900){r3.textContent='重來';r3.classList.remove('warn')}},3000);return}
 if(t.closest('#k-next'))return next();
 if(t.closest('#k-chg')){if(count()&&!confirm('已經點的菜會清掉，確定換桌？'))return;next();return}
});
window.rcKioskStart=function(){var bd=document.getElementById('badge');if(bd)bd.textContent=rcBadge();rcDB.ready.then(function(){S=rcDB.store();if(table)menu();else pick()},function(){if(table)menu();else pick()})};
})();
