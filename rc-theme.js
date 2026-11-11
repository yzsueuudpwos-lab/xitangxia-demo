// 20261111 熱炒店主題：放在 <head> 先跑，避免先閃一下白底。
// 沒選過＝跟手機系統（深色／淺色）；按 🌙/☀️ 後存在 localStorage 'rc-theme'，蓋過系統設定。
// 照抄記帳 App theme.js，改名 rcTheme、鍵名 ly-theme；淺色 theme-color 用熱炒店綠。
(function () {
  var KEY = 'rc-theme', root = document.documentElement, mq = null;
  try { mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null; } catch (e) {}
  function saved() { try { var v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null; } catch (e) { return null; } }
  function effective() { return saved() || (mq && mq.matches ? 'dark' : 'light'); }
  function apply() {
    var t = effective();
    root.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'dark' ? '#1a1210' : '#c8372d');
    var b = document.getElementById('theme-btn');
    if (b) {
      b.textContent = t === 'dark' ? '☀️' : '🌙';
      b.setAttribute('aria-label', t === 'dark' ? '改成淺色模式' : '改成深色模式');
      b.title = b.getAttribute('aria-label');
    }
    return t;
  }
  window.rcTheme = {
    apply: apply,
    toggle: function () {
      var next = effective() === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) {}
      return apply();
    }
  };
  apply();
  if (mq) {
    var onChange = function () { if (!saved()) apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  function bind() {
    apply();
    var b = document.getElementById('theme-btn');
    if (!b || b.getAttribute('data-ly-theme-bound')) return;
    b.setAttribute('data-ly-theme-bound', '1');
    b.addEventListener('click', function () {
      window.rcTheme.toggle();
      if (window.rcHaptic) window.rcHaptic('light');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
