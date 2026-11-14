// 20261114 外送費預估（Lalamove）。與蓮緣 ly-delivery.js 同一套報價約定。
// 報價在後端 Apps Script（action=lalamoveQuote，金鑰只放在指令碼屬性），網頁沒有任何金鑰。
// 估不到（後端還沒接上、地址找不到、Lalamove 沒回）→ 前端顯示「暫時無法估算，店家會用電話告知外送費」，訂單照樣可以送出。
(function(){
window.RC_PICKUP_ADDRESS=(window.RC_DEFAULT_STORE&&RC_DEFAULT_STORE.address)||'台北市中山區民生東路二段65號1樓';
window.RC_DELIVERY_FAIL_MSG='暫時無法估算，店家會用電話告知外送費';

window.rcAddrOk=function(addr){
  var s=String(addr||'').replace(/\s+/g,'');
  if(s.length<8)return false;
  return /[市區鄉鎮路街巷弄號樓]/.test(s)||s.length>=10;
};

// 成功 resolve {fee,quoteId,distanceKm}；失敗 reject Error（e.unsupported=true 表示後端還沒有這個功能）
window.rcQuoteDelivery=function(addr,floor){
  return new Promise(function(resolve,reject){
    if(!rcAddrOk(addr))return reject(new Error('請填完整的外送地址，包含路段與門牌'));
    if(!window.RC_API_URL){var e0=new Error('no-backend');e0.unsupported=true;return reject(e0)}
    var ac=window.AbortController?new AbortController():null,tm=setTimeout(function(){if(ac)ac.abort()},15000);
    fetch(RC_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'lalamoveQuote',address:String(addr).trim(),floor:String(floor||'').trim()}),redirect:'follow',signal:ac&&ac.signal})
      .then(function(r){if(!r.ok)throw new Error('後端回應 '+r.status);return r.json()})
      .then(function(j){
        if(j&&j.ok&&isFinite(+j.fee)&&+j.fee>0)return resolve({fee:Math.round(+j.fee),quoteId:j.quotationId||'',distanceKm:j.distanceKm||''});
        var e=new Error((j&&j.error)||'預估失敗');if(j&&/不認得的動作/.test(String(j.error||'')))e.unsupported=true;
        if(j&&/geocode/.test(String(j.error||'')))e.why='找不到這個地址，可以再核對一次';
        throw e;
      })
      .catch(reject).then(function(){clearTimeout(tm)});
  });
};
})();
