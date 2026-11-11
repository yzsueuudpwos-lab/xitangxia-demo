// 20261110 熱炒店手感（照抄記帳 App 已驗證做法，改名 ly*）
// 1) 觸覺：Android 用 navigator.vibrate；iPhone 在按鈕上蓋透明 switch label（真實手指點才會震）
// 2) 加到主畫面提示：不是從主畫面圖示打開、沒關過、是手機時才顯示；按 ✕ 後不再出現
// 震動只是附加，畫面上一定另外有文字回饋。
(function () {
  function haptic(kind) {
    try {
      if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
      var P = { light: 8, success: [10, 60, 16], error: [22, 50, 22, 50, 22] };
      return !!navigator.vibrate(P[kind] || P.light);
    } catch (e) { return false; }
  }
  window.rcHaptic = haptic;
  function overlay(btn) {
    if (!btn || btn.querySelector('.ios-haptic')) return;
    btn.classList.add('haptic-btn');
    var wrap = document.createElement('span');
    wrap.className = 'ios-haptic';
    wrap.setAttribute('aria-hidden', 'true');
    var id = 'haptic-sw-' + Math.random().toString(36).slice(2, 9);
    var sw = document.createElement('input');
    sw.type = 'checkbox';           // 不給 name，避免被表單送出
    sw.id = id;
    sw.tabIndex = -1;
    try { sw.setAttribute('switch', ''); } catch (e) {}
    var lab = document.createElement('label');
    lab.htmlFor = id;
    lab.className = 'ios-haptic-lab';
    sw.addEventListener('click', function (e) { e.stopPropagation(); });
    wrap.appendChild(sw);
    wrap.appendChild(lab);
    btn.insertBefore(wrap, btn.firstChild);
  }
  window.rcHapticOverlay = overlay;
  var SEL = [];
  // rcScan('選擇器') 登記目標並蓋上；之後動態重畫按鈕，直接呼叫 rcScan() 再蓋一次
  window.rcScan = function (sel) {
    if (sel && SEL.indexOf(sel) < 0) SEL.push(sel);
    if (!SEL.length) return;
    try { document.querySelectorAll(SEL.join(',')).forEach(overlay); } catch (e) {}
  };
  // <a onclick="...;return rcNoNav(event)">：點在 iPhone 觸覺 label 上時不要取消事件（取消會讓開關不切換、不震）
  window.rcNoNav = function (e) {
    return !!(e && e.target && e.target.closest && e.target.closest('.ios-haptic'));
  };
  // 加到主畫面提示
  window.rcA2hs = function (key, iosText, otherText) {
    var box = document.getElementById('a2hs'), x = document.getElementById('a2hs-x');
    if (!box || !x) return;
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    var dismissed = false;
    try { dismissed = localStorage.getItem(key) === '1'; } catch (_) {}
    var mobile = window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 640px)').matches);
    if (standalone || dismissed || !mobile) return;
    var ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var t = box.querySelector('.a2hs-t');
    if (t) t.textContent = ios ? iosText : otherText;
    box.hidden = false;
    x.addEventListener('click', function () {
      box.hidden = true;
      try { localStorage.setItem(key, '1'); } catch (_) {}
    });
  };
})();
