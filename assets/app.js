/* AI-часик: поиск по всем часикам, кнопка «Скопировать», подсветка темы на циферблате. */
(function () {
  var base = document.documentElement.getAttribute('data-base') || '';
  var DATA = window.CHASIK_INDEX || [];

  function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е'); }
  // Грубая основа слова, чтобы «лимиты» находили «лимит», а «контекста» — «контекст».
  function stem(w) {
    if (w.length > 6) return w.slice(0, -2);
    if (w.length > 4) return w.slice(0, -1);
    return w;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function highlight(text, stems) {
    var out = esc(text);
    stems.forEach(function (st) {
      if (st.length < 2) return;
      var re = new RegExp('(' + st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/е/g, '[её]') + ')', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }
  function fmt(t) { var m = Math.floor(t / 60), s = t % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }

  var KIND = { term: 'Термин', tip: 'Лайфхак', question: 'Вопрос из зала', topic: 'Тема' };
  var ORDER = { term: 0, tip: 1, question: 2, topic: 3 };

  function search(q) {
    var words = norm(q).split(/[^a-zа-я0-9-]+/i).filter(Boolean);
    if (!words.length) return { stems: [], items: [] };
    var stems = words.map(stem);
    var items = DATA.filter(function (it) {
      var hay = norm(it.title + ' ' + it.text);
      return stems.every(function (st) { return hay.indexOf(st) !== -1; });
    }).map(function (it) {
      var inTitle = stems.every(function (st) { return norm(it.title).indexOf(st) !== -1; });
      return { it: it, score: (inTitle ? 0 : 10) + ORDER[it.type] };
    }).sort(function (a, b) { return a.score - b.score || b.it.n - a.it.n; }).map(function (x) { return x.it; });
    return { stems: stems, items: items };
  }

  var input = document.getElementById('q');
  var box = document.getElementById('results');
  var hide = document.querySelectorAll('[data-hide-on-search]');
  if (input && box) {
    var run = function () {
      var q = input.value.trim();
      for (var i = 0; i < hide.length; i++) hide[i].hidden = !!q;
      if (!q) { box.innerHTML = ''; return; }
      var r = search(q);
      if (!r.items.length) {
        box.innerHTML = '<li class="empty">Ничего не нашлось. Попробуйте другое слово или откройте указатель — там всё по алфавиту.</li>';
        return;
      }
      box.innerHTML = r.items.slice(0, 20).map(function (it) {
        return '<li><div class="kind">' + KIND[it.type] + ', часик ' + it.n + '</div>' +
          '<div class="r-title"><a href="' + base + it.href + '">' + highlight(it.title, r.stems) + '</a></div>' +
          '<p class="r-text">' + highlight(it.text, r.stems) + '</p>' +
          '<a class="tc" href="' + esc(it.video) + '" target="_blank" rel="noopener noreferrer" aria-label="Смотреть с ' + fmt(it.t) + '">' + fmt(it.t) + '</a></li>';
      }).join('');
    };
    input.addEventListener('input', run);
    var pre = new URLSearchParams(location.search).get('q');
    if (pre) { input.value = pre; run(); }
  }

  // Скопировать промпт
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.copy');
    if (!b) return;
    var text = b.parentNode.querySelector('blockquote').innerText.trim();
    var done = function () { b.textContent = 'Скопировано'; setTimeout(function () { b.textContent = 'Скопировать'; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(text); done(); });
    } else { fallback(text); done(); }
  });
  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (err) {}
    document.body.removeChild(ta);
  }

  // Тема в списке ↔ отметка на циферблате
  function hot(i, on) {
    var els = document.querySelectorAll('[data-topic="' + i + '"]');
    for (var k = 0; k < els.length; k++) els[k].classList.toggle('is-hot', on);
  }
  var tops = document.querySelectorAll('[data-topic]');
  for (var j = 0; j < tops.length; j++) {
    (function (el) {
      var i = el.getAttribute('data-topic');
      el.addEventListener('mouseenter', function () { hot(i, true); });
      el.addEventListener('mouseleave', function () { hot(i, false); });
      el.addEventListener('focusin', function () { hot(i, true); });
      el.addEventListener('focusout', function () { hot(i, false); });
    })(tops[j]);
  }
})();
