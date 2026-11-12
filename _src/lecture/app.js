/* Движок страниц-слайдов AI-часика. Взят из сайта лекций курса «ИИ в исследованиях» и обобщён:
   подписи «курс · неделя N» заданы в meta (tag, tagShort, titleL, titleR, heroCaps, probeLabel, hubLabel),
   служебные страницы показываются, только если для них есть данные. Шпаргалка показа в заметках — поле show.
   Дальше — исходный комментарий движка курса.
   Данные лекции — window.LECTURE (weeks/nedelya-N.js) и window.LECTURE_HOST (weeks/nedelya-N-vedushchiy.js).
   Версия одна для всех, как на мастер-классе Research Expo: у каждого слайда таймер, заметки ведущего по клавише N,
   пульт (P), короткая версия (K), страница «Подготовка». window.SITE_MODE = 'guest' оставлен только на крайний случай —
   сборка без таймера и заметок; build.py его не использует.
   words — «Слова ведущего»: что ведущий говорит на слайде. Показываются только в заметках (N) как «Что говорю», под слайдом их нет.
   day: 'Чт, 22 октября' — с этого слайда начинается второе занятие недели: время по плану снова считается от meta.start.
   Блоки схем: cycle — схема цикла из D.cycle с подсветкой текущего шага (hl), html — готовая схема в разметке
   из «Лекция N/…схемы.html» внутри .xs, стили схем недели — в D.css (zoom — масштаб, чтобы схема встала в слайд). У раздела (kind: 'section') body рисуется над заголовком.
   kind: 'probe' — проба на занятии: на слайде плашка «Проба · N мин», на главной — отдельная строка времени.
   Слайды рисуются классами .sl-* из «Фирменный стиль/styles.css». */
(() => {
  'use strict';
  const D = window.LECTURE;
  /* Стили недели (например, схемы блока html) — D.css, вставляются в страницу один раз. */
  if (D.css) { const st = document.createElement('style'); st.textContent = D.css; document.head.appendChild(st); }
  /* Заметки ведущего лежат в отдельном файле и попадают только в версию ведущего. */
  const HD = window.LECTURE_HOST;
  if (HD) {
    for (const s of D.slides) {
      if (HD.slides && HD.slides[s.n]) Object.assign(s, HD.slides[s.n]);
      if (HD.more && HD.more[s.n]) s.more = (s.more || []).concat(HD.more[s.n]);
    }
    if (HD.prep) D.pages.prep = HD.prep;
  }
  const HOST = window.SITE_MODE !== 'guest';
  const M0 = D.meta;
  const TAG = M0.tag || `${M0.course} · Неделя ${M0.week}`;          // подпись слайда и заголовков страниц
  const TAG_SHORT = M0.tagShort || `Неделя ${M0.week}`;               // ссылка «на главную» в верхней строке
  const PROBE = M0.probeLabel || 'Проба';
  D.hw = D.hw || { must: [], opt: [] }; D.hw.must = D.hw.must || []; D.hw.opt = D.hw.opt || [];
  D.pages = D.pages || {}; D.prompts = D.prompts || {};   // одна версия для всех: таймер и заметки у каждого
  const SHOTS = window.LECTURE_SHOTS || {};
  const FILES = window.LECTURE_FILES || {};
  const fileKey = k => String(k || '').normalize('NFC').toLowerCase().trim();
  const fileOf = f => f.url ? [f.url, f.ext] : (FILES[fileKey(f.file)] || FILES[fileKey(f.t)] || null);
  const app = document.getElementById('app');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- хранилище в браузере: только удобства, всё в try/catch ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(D.id + ':' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(D.id + ':' + k, JSON.stringify(v)); } catch (e) { /* без хранилища — просто не запоминаем */ } }
  };

  /* ---------- текст ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function md(s, ph) {
    let h = esc(s);
    h = h.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/\[([^\]]+)\]\((#[a-z0-9]+)\)/g, '<a href="$2">$1</a>');
    h = h.replace(/\[([^\]]+)\]\((files\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/\{\{(\d+)(?:\|([^}]+))?\}\}/g, (m, n, t) => `<a href="#s${n}">${t || 'слайд ' + n}</a>`);
    h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    if (ph) h = h.replace(/⟪([^⟫]*)⟫/g, '<mark class="ph">⟪$1⟫</mark>');
    return h;
  }
  const arr = v => v == null ? [] : (Array.isArray(v) ? v : [v]);
  const paras = v => arr(v).map(x => `<p>${md(x)}</p>`).join('');
  const ul = v => `<ul>${arr(v).map(x => `<li>${md(x)}</li>`).join('')}</ul>`;
  const fmtNum = x => String(x).replace('.', ',');
  const fmtMin = m => m < 1 && m > 0 ? `${Math.round(m * 60)} с` : `${fmtNum(m)} мин`;
  const pad = n => String(n).padStart(2, '0');
  const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const clock = m => { m = Math.floor(m + 1e-6); return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; };
  const clockS = sec => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };

  /* ---------- слайды, части, время ---------- */
  const ALL = D.slides;
  const byN = new Map(ALL.map(s => [s.n, s]));
  const partOf = s => D.parts.find(p => p.id === s.part);
  const S = {
    view: 'home', n: 1, face: 0,
    short: HOST ? store.get('short', false) : false,
    notes: HOST ? store.get('notes', false) : false,
    focus: false, toc: false
  };
  const isCut = s => S.short && s.short && s.short.cut;
  const mins = s => (S.short && s.short && s.short.min != null) ? s.short.min : (s.min || 0);
  const active = () => ALL.filter(s => !isCut(s));
  function plan() {
    // at — минута от начала своего занятия: на слайде с полем day (второе занятие недели) отсчёт снова с meta.start
    // sess — минуты каждого занятия недели: лимит сверяем по занятию, вопросы в конце — от последнего
    let t = 0, run = 0; const at = new Map(), sess = [];
    for (const s of ALL) { if (s.day && run) { sess.push(run); run = 0; } at.set(s.n, run); if (!isCut(s)) { t += mins(s); run += mins(s); } }
    sess.push(run);
    return { at, total: t, sess };
  }
  const START = toMin(D.meta.start), END = toMin(D.meta.end);
  const partMin = p => active().filter(s => s.part === p.id).reduce((a, s) => a + mins(s), 0);
  function neighbour(n, dir) {
    let i = ALL.findIndex(s => s.n === n) + dir;
    while (i >= 0 && i < ALL.length) { if (!isCut(ALL[i])) return ALL[i]; i += dir; }
    return null;
  }
  const demoPill = s => (s.demo && s.demo.pill) || 'Показ';
  const kindLabel = (s, face) => face === 1 ? demoPill(s) : ({ title: 'Титул', section: 'Раздел', qs: 'Вопросы', try: 'Домашка', final: 'Вопросы', probe: PROBE }[s.kind] || (s.demo ? 'Рассказ и показ' : 'Рассказ'));
  const shortTag = s => s.short && s.short.r ? 'Р4-' + s.short.r : 'короткая версия';
  const R4 = ALL.some(s => s.short && s.short.r);
  const HAS_SHORT = ALL.some(s => s.short);   // нет короткой версии — нет и переключателя
  const hwFrom = n => [...D.hw.must, ...D.hw.opt].filter(h => arr(h.from).includes(n));

  /* ========== Слайд ========== */
  function metaRow(s) {
    const p = partOf(s);
    const L = s.kind === 'title' ? (M0.titleL || `${D.meta.org} · ${D.meta.course}`) : TAG;
    const R = s.kind === 'title' ? (M0.titleR != null ? M0.titleR : `Неделя ${D.meta.week} из ${D.meta.weeks}`) : p.label;
    return `<div class="sl-meta"><span>${esc(L)}</span><span>${esc(R)}</span></div>`;
  }

  function timelineSVG(v) {
    const t0 = Date.UTC(2025, 0, 1), day = 864e5, px = 0.9118;
    const X = iso => { const [y, m, d] = iso.split('-').map(Number); return 150 + px * (Date.UTC(y, m - 1, d || 15) - t0) / day; };
    const names = ['янв', 'апр', 'июл', 'окт'];
    let g = '';
    for (const y of [2025, 2026]) for (let q = 0; q < 4; q++) {
      const x = X(`${y}-${pad(q * 3 + 1)}-01`);
      g += `<line class="grid" x1="${x.toFixed(1)}" y1="16" x2="${x.toFixed(1)}" y2="186"/><text x="${x.toFixed(1)}" y="206" text-anchor="middle">${q === 0 ? 'янв ' + y : names[q]}</text>`;
    }
    g += `<line class="axis" x1="150" y1="186" x2="760" y2="186"/>`;
    v.lanes.forEach((ln, i) => {
      const y = 46 + i * 56;
      g += `<text class="lane-name" x="0" y="${y + 4}">${esc(ln.name)}</text>`;
      let prev = -99, off = false;
      ln.events.forEach(([d, label]) => {
        const x = X(d);
        off = (x - prev < 7) ? !off : false;
        prev = x;
        g += `<circle class="${ln.cls}" cx="${x.toFixed(1)}" cy="${y + (off ? 6 : 0)}" r="5"><title>${esc(d.split('-').reverse().join('.'))} — ${esc(label)}</title></circle>`;
      });
      g += `<text class="count" x="832" y="${y + 5}" text-anchor="end">${esc(ln.count)}</text>`;
    });
    return `<svg class="sl-chart x-svg" viewBox="0 0 832 230" width="832" height="230" role="img" aria-label="${esc(v.aria)}">${g}</svg>`;
  }

  /* Схема цикла: строки шагов, полосы сверху и снизу, подписи частей. hl — что подсвечено (ключи шагов и полос),
     fade — приглушить то, что после подсвеченного, mark — подпись у подсвеченного («вы здесь») */
  let cycleN = 0;
  // Схема цикла опроса из D.cycle. v.hl — ключи шагов в подсветке («А», «5», «top», «bottom»), v.fade — бледнее всё после них,
  // v.mark — подпись под названием ряда вместо тега («вы здесь»), v.compact — без подписей шагов (для слайда-раздела)
  function cycleSVG(C, v) {
    if (!C) return '';
    v = v || {};
    const hl = new Set(arr(v.hl)), W = 832, x0 = 96, cp = !!v.compact;
    const BH = cp ? 24 : 28, H = cp ? 40 : 58, G = cp ? 6 : 8;
    const keys = [];
    if (C.top) keys.push('top');
    C.rows.forEach(r => r.steps.forEach(st => keys.push(st[0])));
    if (C.bottom) keys.push('bottom');
    const lastHl = Math.max(-1, ...keys.map((k, i) => hl.has(k) ? i : -1));
    const cls = k => { const i = keys.indexOf(k); return hl.has(k) ? 'cur' : (v.fade && i > lastHl ? 'next' : ''); };
    let g = '', y = 0;
    const band = (key, b, cl) => {
      const c = cls(key), ty = y + BH / 2 + 4.5;
      g += `<rect class="cy-band ${cl} ${c}" x="0" y="${y}" width="${W}" height="${BH}" rx="6"/><text class="cy-bt ${c}" x="14" y="${ty}">${esc(b.t)}</text>${b.tag ? `<text class="cy-tag ${c}" x="${W - 12}" y="${ty}" text-anchor="end">${esc(b.tag)}</text>` : ''}`;
      y += BH;
    };
    if (C.top) { band('top', C.top, 'top'); y += G; }
    C.rows.forEach((r, ri) => {
      if (ri > 0 && C.field) { g += `<line class="cy-field" x1="0" y1="${y + 6}" x2="${W}" y2="${y + 6}"/><text class="cy-ft" x="${W / 2}" y="${y + 10}" text-anchor="middle">${esc(C.field)}</text>`; y += cp ? 12 : 14; }
      const n = r.steps.length, gp = n > 4 ? 10 : 14, bw = (W - x0 - gp * (n - 1)) / n;
      const here = v.mark && r.steps.some(st => hl.has(st[0]));
      g += `<text class="cy-rl" x="0" y="${y + (cp ? 18 : 24)}">${esc(r.label)}</text>`;
      if (here) g += `<text class="cy-mark" x="0" y="${y + (cp ? 33 : 41)}">${esc(v.mark)}</text>`;
      else if (r.tag) g += `<text class="cy-rt" x="0" y="${y + (cp ? 33 : 41)}">${esc(r.tag)}</text>`;
      r.steps.forEach((st, i) => {
        const [k, name, sub] = st, x = x0 + i * (bw + gp), c = cls(k);
        g += `<g class="cy-step ${c}"><rect class="cy-box" x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${H}" rx="8"/><text class="cy-t" x="${(x + 10).toFixed(1)}" y="${y + (cp ? 25 : 23)}">${esc(k)}. ${esc(name)}</text>${cp ? '' : `<text class="cy-s" x="${(x + 10).toFixed(1)}" y="${y + 42}">${esc(sub || '')}</text>`}</g>`;
      });
      y += H;
      if (r.tags) {
        y += 4;
        r.tags.forEach(([a, b, t]) => {
          const xa = x0 + a * (bw + gp), xb = x0 + b * (bw + gp) + bw;
          g += `<line class="cy-br" x1="${xa.toFixed(1)}" y1="${y + 2}" x2="${xb.toFixed(1)}" y2="${y + 2}"/><text class="cy-tag" x="${((xa + xb) / 2).toFixed(1)}" y="${y + 15}" text-anchor="middle">${esc(t)}</text>`;
        });
        y += 18;
      }
      y += G;
    });
    if (C.bottom) band('bottom', C.bottom, 'bot');
    const pid = 'cy-hatch-' + (++cycleN);
    g = g.replace('class="cy-band bot', `fill="url(#${pid})" class="cy-band bot`);
    const pat = `<defs><pattern id="${pid}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" class="cy-hbg"/><line x1="0" y1="0" x2="0" y2="7" class="cy-hl"/></pattern></defs>`;
    return `<svg class="x-cycle${cp ? ' compact' : ''}" viewBox="0 0 ${W} ${y}" width="${W}" height="${y}" role="img" aria-label="${esc(v.aria || C.aria || 'Схема цикла опроса')}">${pat}${g}</svg>`;
  }

  const B = {
    p: v => `<p class="sl-body">${md(v)}</p>`,
    lead: v => `<p class="sl-lead">${md(v)}</p>`,
    label: v => `<span class="x-lbl">${md(v)}</span>`,
    cap: v => `<p class="sl-caption">${md(v)}</p>`,
    list: (v, b) => `<ul class="sl-list${b.sm ? ' sm' : ''}">${v.map(x => `<li><span>${md(x)}</span></li>`).join('')}</ul>`,
    grid: (v, b) => `<div class="sl-grid2${b.cols ? ' c' + b.cols : ''}">${v.map(([h, p]) => `<div class="sl-cell"><h3>${md(h)}</h3>${p ? `<p>${md(p)}</p>` : ''}</div>`).join('')}</div>`,
    cards: (v, b) => `<div class="sl-cards${b.cols && b.cols !== 3 ? ' c' + b.cols : ''}">${v.map(c => `<div class="sl-card">${c[0] ? `<span class="sl-label">${md(c[0])}</span>` : ''}<h3>${md(c[1])}</h3>${c[2] ? `<p>${md(c[2])}</p>` : ''}</div>`).join('')}</div>`,
    compare: v => `<div class="sl-compare${v.length === 3 ? ' c3' : ''}">${v.map(c => `<div class="sl-col${c.accent ? ' is-accent' : ''}"><h3>${md(c.h)}</h3>${c.rows ? `<dl>${c.rows.map(([t, d]) => `<dt>${md(t)}</dt><dd>${md(d)}</dd>`).join('')}</dl>` : ''}${c.list ? `<ul>${c.list.map(x => `<li><span>${md(x)}</span></li>`).join('')}</ul>` : ''}${c.p ? `<p class="sl-small">${md(c.p)}</p>` : ''}${c.frag ? `<div class="frag">${md(c.frag)}</div>` : ''}</div>`).join('')}</div>`,
    table: v => `<div class="x-tablewrap"><table class="sl-table"${v.cw ? '' : ''}><thead><tr>${v.head.map((x, i) => `<th${(v.num || []).includes(i) ? ' class="num"' : ''}${v.cw && v.cw[i] ? ` style="width:${v.cw[i]}"` : ''}>${md(x)}</th>`).join('')}</tr></thead><tbody>${v.rows.map((r, ri) => `<tr${v.mark === ri ? ' class="is-mark"' : ''}>${r.map((x, i) => `<td${(v.num || []).includes(i) ? ' class="num"' : ''}>${md(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
    flow: v => `<div class="x-flow">${v.map((x, i) => (i ? '<span class="ar">→</span>' : '') + `<div class="st${x.sunk ? ' sunk' : ''}">${typeof x === 'string' ? md(x) : `<b>${md(x.h)}</b>${x.p ? `<small>${md(x.p)}</small>` : ''}`}</div>`).join('')}</div>`,
    scheme: v => { const wk = v.layers.some(l => l[2]); const bands = v.bands || []; return `<div class="sl-scheme${wk ? ' wk' : ''}${bands.length ? '' : ' nob'}"><div class="sl-layers">${v.layers.map(([h, p, w]) => `<div class="sl-layer${wk ? ' wk' : ''}"><h3>${md(h)}</h3><p>${md(p)}</p>${wk ? `<span class="x-week">${md(w || '')}</span>` : ''}</div>`).join('')}</div>${bands.length ? `<div class="sl-through">${bands.map(([t, c]) => `<div class="sl-band ${c}">${esc(t)}</div>`).join('')}</div>` : ''}</div>`; },
    window: v => `<div class="x-stack" style="gap:10px"><div class="x-brace">${esc(v.label)}</div><div class="x-window">${v.items.map(([t, sub, cls, f]) => `<div style="flex:${f || 1}"><div class="bx ${cls || ''}"></div><div class="t">${md(t)}${sub ? `<small>${md(sub)}</small>` : ''}</div></div>`).join('')}</div></div>`,
    tokens: v => `<div class="x-tokens">${v.map(l => `<div class="line"><span class="sl-label">${esc(l.lang)}</span><div class="seq">${l.toks.map(t => `<span class="tk">${esc(t)}</span>`).join('')}</div><div class="cnt">${l.toks.length}<small>токенов</small></div></div>`).join('')}</div>`,
    next: v => `<div class="x-next"><div class="q">${md(v.q)} <i></i></div>${v.opts.map(([w, p], i) => `<div class="opt${i === 0 ? ' top' : ''}"><span>${esc(w)}</span><div class="b"><i style="width:${p}%"></i></div><span>${p ? p + '%' : '…'}</span></div>`).join('')}</div>`,
    snow: v => `<div class="x-snow">${v.map((lbl, i) => `<div class="r">${Array.from({ length: i + 1 }, (_, j) => `<i class="${j === i ? 'new' : ''}"></i>`).join('')}<span>${md(lbl)}</span></div>`).join('')}</div>`,
    scale: v => `<div class="x-scale${v.length === 3 ? ' c3' : ''}">${v.map(s => `<div class="s"><h3>${md(s.h)}</h3>${s.p ? `<p>${md(s.p)}</p>` : ''}${s.rows ? `<dl>${s.rows.map(([t, d]) => `<dt>${md(t)}</dt><dd>${md(d)}</dd>`).join('')}</dl>` : ''}</div>`).join('')}</div>`,
    axis: v => `<div class="x-axis"><span>${md(v[0])}</span><span>${md(v[1])}</span></div>`,
    timeline: v => timelineSVG(v),
    qs: (v, b) => `<ol class="sl-qs${b.one ? ' one' : ''}${b.cols2 ? ' c2' : ''}">${v.map(x => `<li><span>${md(x)}</span></li>`).join('')}</ol>`,
    try: v => `<dl class="sl-try">${v.map(([t, d]) => `<dt>${md(t)}</dt><dd>${Array.isArray(d) ? `<ol>${d.map(x => `<li><span>${md(x)}</span></li>`).join('')}</ol>` : md(d)}</dd>`).join('')}</dl>`,
    steps: v => `<ol class="sl-steps">${v.map(x => `<li><span>${md(x)}</span></li>`).join('')}</ol>`,
    shots: (v, b) => `<div class="x-shots" style="grid-template-columns:repeat(${b.cols || v.length},1fr)">${v.map(x => shotHTML(x, b.wide)).join('')}</div>`,
    fig: v => `<div class="x-fig"><b>${md(v[0])}</b><span>${md(v[1])}</span></div>`,
    dates: v => `<div class="x-dates">${v.map(d => `<div${d.accent ? ' class="is-accent"' : ''}><b>${md(d.h)}</b><span>${md(d.p)}</span></div>`).join('')}</div>`,
    cycle: v => `<div class="x-cyclewrap">${cycleSVG(D.cycle, v)}</div>`,
    html: (v, b) => `<div class="x-html xs"${b.zoom ? ` style="zoom:${b.zoom}"` : ''}>${v}</div>`,
    // Проба недели 3: шаги с отметками (запоминаются в браузере), «что ожидаем», файлы и промпты прямо на слайде
    probe: v => {
      const steps = (v.steps || []).map((x, i) => { const k = `${v.id}:${i}`, on = store.get('ck:' + k, false); return `<li><label><input type="checkbox" data-ck="${esc(k)}"${on ? ' checked' : ''}><span>${md(x)}</span></label></li>`; }).join('');
      const files = (v.files || []).map(f => { const got = fileOf(f); return got ? `<a class="pf" href="${esc(got[0])}" download target="_blank" rel="noopener"><span class="ext">${esc(got[1])}</span>${md(f.t)}</a>` : `<span class="pf soon"><span class="ext">${esc(f.ext || 'FILE')}</span>${md(f.t)}</span>`; });
      const prompts = (v.prompts || []).filter(n => D.prompts[n]).map(n => `<button class="pf pp" data-copy="${esc(n)}" title="Скопировать промпт"><span class="ext">⧉</span>${esc(n)}</button>`);
      const links = files.concat(prompts);
      return `<div class="x-probe">${steps ? `<ol class="pr-steps">${steps}</ol>` : ''}<div class="pr-side">${v.expect ? `<div class="pr-exp"><span class="sl-label">Что ожидаем</span><span>${md(v.expect)}</span></div>` : ''}${links.length ? `<div class="pr-files"><span class="sl-label">${esc(v.filesL || 'Файлы и промпты')}</span><span class="pr-row">${links.join('')}</span></div>` : ''}</div></div>`;
    },
    row: (v, b) => `<div class="x-row"${b.w ? ` style="grid-template-columns:${b.w}"` : ''}>${v.map(col => `<div class="x-stack"${b.g ? ` style="gap:${b.g}px"` : ''}>${arr(col).map(block).join('')}</div>`).join('')}</div>`
  };
  function block(b) { const k = Object.keys(b).find(k => B[k]); return k ? B[k](b[k], b) : ''; }
  // шаг списка: строка или {t, shots, prompt} — скриншоты и промпт прямо под текстом шага
  function stepLI(x) {
    if (typeof x === 'string') return `<li><span>${md(x)}</span></li>`;
    const sh = arr(x.shots);
    return `<li><span>${md(x.t)}${sh.length ? `<div class="x-shots step-shots" style="grid-template-columns:repeat(${Math.min(sh.length, x.cols || 2)},1fr)">${sh.map(s => shotHTML(s)).join('')}</div>` : ''}${arr(x.prompt).map(promptHTML).join('')}</span></li>`;
  }
  function shotHTML(x, wide) {
    const src = SHOTS[x.file];
    return `<figure class="x-shot${wide ? ' wide' : ''}" style="margin:0">${src ? `<img src="${src}" alt="${esc(x.name)}" data-zoom="${esc(x.name)}">` : `<div class="ph">скриншот: ${esc(x.file)}</div>`}${x.nocap ? '' : `<figcaption class="cap">${md(x.name)}</figcaption>`}</figure>`;
  }

  function demoSlide(s) {
    const d = s.demo;
    return `<div class="sl" style="gap:${d.gap || 24}px">${metaRow(s)}<span class="sl-pill">${esc(demoPill(s))}</span><div class="sl-head"><h2 class="sl-title">${md(d.t)}</h2>${d.see ? `<p class="sl-lead">${md(d.see)}</p>` : ''}</div><ol class="sl-steps">${d.steps.map(x => `<li><span>${md(x)}</span></li>`).join('')}</ol>${d.you ? `<div class="sl-callout"><span class="sl-label">${esc(d.youL || 'Теперь вы')}</span><span>${md(d.you)}</span></div>` : ''}${d.take !== undefined ? (d.take ? `<p class="sl-take">${md(d.take)}</p>` : '') : (s.take ? `<p class="sl-take">${md(s.take)}</p>` : '')}</div>`;
  }
  function slideHTML(s, face = 0) {
    if (face === 1 && s.demo) return demoSlide(s);
    const p = partOf(s);
    if (s.kind === 'title' || s.kind === 'final') return `<div class="sl">${metaRow(s)}<div class="sl-head" style="margin-top:auto"><h1 class="sl-display">${md(s.t)}</h1>${s.lead ? `<p class="sl-lead">${md(s.lead)}</p>` : ''}</div><p class="sl-take sl-small" style="font-family:var(--font-sans);margin-top:var(--space-5)">${md(s.foot)}</p></div>`;
    if (s.kind === 'section') return `<div class="sl sl-dark">${metaRow(s)}${(s.body || []).map(block).join('')}<div class="x-sec" style="display:flex;gap:var(--space-5);align-items:flex-end;margin-top:auto">${p.num != null && !s.nonum ? `<div class="sl-partnum">${p.num}</div>` : ''}<div class="sl-head" style="padding-bottom:12px"><h2 class="sl-title">${md(s.t)}</h2><p class="sl-lead">${md(s.lead)}${S.short && s.short && s.short.note ? ' ' + md(s.short.note) : ''}</p></div></div></div>`;
    let h = `<div class="sl${(s.kind === 'probe' && D.meta.probeTime === false) || s.cls === 'probe-like' ? ' is-probe' : ''}"${s.gap ? ` style="gap:${s.gap}px"` : ''}>${metaRow(s)}`;
    if (s.kind === 'probe') h += `<span class="sl-pill probe">${esc(PROBE)}${D.meta.probeTime === false ? '' : ' · ' + esc(fmtMin(mins(s)))}</span>`;
    h += `<div class="sl-head"><h2 class="sl-title"${s.tw ? ` style="max-width:${s.tw}px"` : ''}>${md(s.t)}</h2>${s.lead ? `<p class="sl-lead"${s.lw ? ` style="max-width:${s.lw}px"` : ''}>${md(s.lead)}</p>` : ''}</div>`;
    for (const b of s.body || []) h += block(b);
    for (const c of arr(s.cap)) h += `<p class="sl-caption">${md(c)}</p>`;
    if (S.short && s.short && s.short.note) h += `<p class="sl-caption short-note">${md(s.short.note)}</p>`;
    if (s.co) h += `<div class="sl-callout"><span class="sl-label">${esc(s.co.l)}</span><span>${md(s.co.t)}</span></div>`;
    if (s.take) h += `<p class="sl-take">${md(s.take)}</p>`;
    return h + '</div>';
  }

  /* ---------- вписать слайд 960×540 в контейнер ---------- */
  function fitSlide() {
    const st = $('#stage'), f = $('#fit');
    if (!st || !f) return;
    const sl = f.firstElementChild;
    const focus = document.body.classList.contains('focus');
    if (window.innerWidth < 720 && !focus) {
      st.classList.add('reflow'); f.style.width = f.style.height = ''; sl.style.transform = '';
      document.documentElement.style.setProperty('--slide-x', '0px');
      return;
    }
    st.classList.remove('reflow');
    const cs = getComputedStyle(st);
    const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
    const availW = st.clientWidth - padL - padR;
    const tb = focus ? 0 : ($('.tb') ? $('.tb').offsetHeight : 0);
    const ft = focus ? 0 : ($('.ft') ? $('.ft').offsetHeight : 0);
    const availH = window.innerHeight - tb - ft - (focus ? 0 : 32);
    const k = Math.max(0.25, Math.min(availW / 960, availH / 540));
    f.style.width = (960 * k) + 'px'; f.style.height = (540 * k) + 'px';
    sl.style.transform = `scale(${k})`;
    const x = f.getBoundingClientRect().left - st.getBoundingClientRect().left - padL;
    document.documentElement.style.setProperty('--slide-x', Math.max(0, x) + 'px');
  }
  function fitInto(box, maxW, maxH) {
    if (!box) return;
    const sl = box.firstElementChild;
    const k = Math.min(maxW / 960, maxH / 540);
    box.style.width = (960 * k) + 'px'; box.style.height = (540 * k) + 'px';
    sl.style.transform = `scale(${k})`;
  }

  /* ========== Таймер слайда ========== */
  const T = {
    total: 0, left: 0, run: false, last: 0,
    reset(sec, auto) { this.total = sec; this.left = sec; this.run = !!auto; this.last = performance.now(); draw(); },
    toggle() { this.run = !this.run; this.last = performance.now(); draw(); },
    tick() { if (!this.run) return; const now = performance.now(); this.left -= (now - this.last) / 1000; this.last = now; }
  };
  function timerState() {
    const over = T.left < 0;
    return { txt: (over ? '+' : '') + clockS(Math.abs(T.left)), cls: over ? 'over' : (T.left <= 60 && T.total > 60 ? 'warn' : '') };
  }
  function lectureClock(s) {
    const st = store.get('start', null);
    const now = new Date();
    let base;
    if (st) base = new Date(st);
    else { base = new Date(now); base.setHours(Math.floor(START / 60), START % 60, 0, 0); }
    const p = plan();
    const planned = new Date(base.getTime() + (p.at.get(s.n) || 0) * 60000);
    const delta = (now - planned) / 60000;
    const live = Math.abs((now - base) / 60000) < 240;
    const nowS = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const plS = `${pad(planned.getHours())}:${pad(planned.getMinutes())}`;
    let dl = '';
    if (live) dl = Math.abs(delta) < 1 ? ' · по плану' : (delta > 0 ? ` · <span class="late">отстаём на ${Math.round(delta)} мин</span>` : ` · опережаем на ${Math.round(-delta)} мин`);
    return `Сейчас <b>${nowS}</b> · слайд по плану с <b>${plS}</b>${dl}`;
  }
  function draw() {
    const t = timerState();
    $$('[data-tm]').forEach(el => { el.textContent = t.txt; });
    $$('.tm, .pult-big').forEach(el => { el.classList.toggle('warn', t.cls === 'warn'); el.classList.toggle('over', t.cls === 'over'); });
    $$('[data-tm-play]').forEach(el => { el.textContent = T.run ? '❚❚' : '▶'; el.setAttribute('aria-label', T.run ? 'Пауза' : 'Старт'); });
    const share = T.total > 0 ? Math.min(1, Math.max(0, (T.total - T.left) / T.total)) : 0;
    $$('[data-tm-line]').forEach(el => { el.style.width = (share * 100).toFixed(2) + '%'; el.parentNode.classList.toggle('warn', t.cls === 'warn'); el.parentNode.classList.toggle('over', t.cls === 'over'); el.parentNode.classList.toggle('paused', !T.run); });
    const s = byN.get(S.n);
    if (s) $$('[data-clock]').forEach(el => { el.innerHTML = lectureClock(s); });
  }
  setInterval(() => { T.tick(); draw(); }, 250);
  function slideSeconds(s) {
    if (s.kind === 'final') { const p = plan(); return Math.max(0, (END - START - p.sess[p.sess.length - 1])) * 60; }
    return mins(s) * 60;
  }

  /* ========== Оболочка: верх и низ ========== */
  const btn = (act, label, key, extra = '') => `<button class="btn" data-act="${act}" title="${esc(label)}${key ? ' (' + key + ')' : ''}" ${extra}><span class="lbl">${esc(label)}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  const themeBtn = () => `<button class="btn" data-act="theme" aria-label="Сменить тему" title="Светлая или тёмная тема" style="padding:0 10px"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor"/></svg></button>`;
  const homeLink = () => `<a class="tb-home" href="#home">${M0.tag ? '' : `<span class="long">${esc(D.meta.course)} · </span>`}${esc(TAG_SHORT)}</a>`;

  function topbarSlide(s, face) {
    const p = partOf(s);
    const sec = ALL.find(x => x.part === p.id && x.kind === 'section');
    const timer = HOST ? `<div class="tm" role="timer"><span class="caps">${s.kind === 'final' ? 'на вопросы' : 'план ' + fmtMin(mins(s))}</span><b class="tm-v" data-tm>0:00</b><button data-act="tm-play" data-tm-play aria-label="Старт">▶</button><button data-act="tm-reset" aria-label="Сначала">↺</button></div>` : '';
    const show = s.demo ? `<button class="btn btn-show" data-act="face" aria-pressed="${face === 1}" title="Показ (D)"><b>Показ</b><kbd>D</kbd></button>` : '';
    return `<header class="tb gut"><div class="tb-left">${homeLink()}<span class="tb-sep"></span><span class="tb-kind">${kindLabel(s, face)}</span><a class="tb-part" href="#s${sec ? sec.n : s.n}">${esc(p.label)}${p.num ? ' · ' + esc(p.title) : ''}</a><span class="tb-sep s2"></span><span class="tb-num">Слайд ${s.n}</span></div><div class="tb-right">${show}${timer}${btn('toc', 'Содержание', 'M')}${themeBtn()}${HOST ? btn('notes', 'Заметки', 'N', `aria-pressed="${S.notes}"`) : ''}${btn('focus', 'Фокус', 'F')}</div></header>`;
  }
  function footerSlide(s, face) {
    const list = active();
    const i = list.findIndex(x => x.n === s.n);
    const pos = i >= 0 ? i + 1 : '—';
    let nextTxt = '';
    if (s.demo && face === 0) nextTxt = `Дальше — ${demoPill(s).toLowerCase()}: ${s.demo.t}`;
    else { const nx = neighbour(s.n, 1); nextTxt = nx ? `Дальше — ${nx.n}. ${nx.t}` : 'Это последний слайд'; }
    const pct = i >= 0 ? ((i + (face === 1 ? 0.5 : 0) + 1) / list.length) * 100 : 0;
    return `<footer class="ft gut"><button class="btn" data-act="prev" aria-label="Назад">← <span class="lbl2">Назад</span></button><div class="ft-mid"><div class="ft-row"><span class="next">${esc(nextTxt.replace(/\*\*/g, ''))}</span><span class="keys">← → слайды · ↓ ↑ разделы · M содержание · F фокус${HOST ? ' · N заметки · P пульт' : ''}</span></div><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div></div><span class="tb-num">${pos} / ${list.length}</span><button class="btn btn-main" data-act="next" aria-label="Далее"><span class="lbl2">Далее</span> →</button></footer>`;
  }
  const HUB = window.SITE_HUB || '';
  const pageNav = cur => `<nav class="tb-nav" aria-label="Разделы сайта">${HUB ? `<a href="${esc(HUB)}">${esc(M0.hubLabel || 'Все недели')}</a>` : ''}${PAGE_ORDER.filter(hasPage).map(id => `<a href="#${id}"${cur === id ? ' aria-current="page"' : ''}>${esc(PAGES[id].nav)}</a>`).join('')}</nav>`;
  function topbarPage(cur) {
    return `<header class="tb gut"><div class="tb-left">${homeLink()}<span class="tb-sep"></span>${pageNav(cur)}</div><div class="tb-right">${btn('toc', 'Содержание', 'M')}${themeBtn()}</div></header>`;
  }

  /* ========== Подробности под слайдом ========== */
  function linksHTML(v) {
    return `<ul class="links">${v.map(([t, u, n]) => u ? `<li><a href="${esc(u)}"${u[0] === '#' ? '' : ' target="_blank" rel="noopener"'}><span class="t">${md(t)}</span>${n ? `<span class="n">${md(n)}</span>` : ''}<span class="go">${u[0] === '#' ? '→' : '↗'}</span></a></li>` : `<li><div class="nolink"><span class="t">${md(t)}</span>${n ? `<span class="n">${md(n)}</span>` : ''}<span class="go">проверить</span></div></li>`).join('')}</ul>`;
  }
  function promptHTML(name) {
    const p = D.prompts[name];
    if (!p) return '';
    const ph = /⟪/.test(p.text);
    return `<div class="prompt"><div class="prompt-h"><span class="nm">${esc(name)}</span><button class="btn" data-copy="${esc(name)}">Скопировать</button></div><pre>${md(p.text, true)}</pre>${ph ? `<div class="hint">${md(p.phHint || 'Подсвечены места, которые нужно заменить своим: бриф, требования, пример.')}</div>` : ''}${p.note ? `<div class="hint">${md(p.note)}</div>` : ''}</div>`;
  }
  function filesHTML(v, two) {
    return `<div class="files${two ? ' two' : ''}">${v.map(f => {
      const got = fileOf(f);
      const inner = `<span class="ext">${esc(got ? got[1] : f.ext)}</span><span><span class="t">${md(f.t)}</span><br><span class="n">${md(f.n || '')}</span></span>`;
      return got ? `<a class="file" href="${esc(got[0])}" target="_blank" rel="noopener">${inner}</a>` : `<div class="file soon">${inner}</div>`;
    }).join('')}</div>`;
  }
  function tableHTML(v) {
    return `<div class="tw"><table class="dt"><thead><tr>${v.head.map(x => `<th>${md(x)}</th>`).join('')}</tr></thead><tbody>${v.rows.map((r, ri) => `<tr${v.mark === ri ? ' class="is-mark"' : ''}>${r.map((x, i) => `<td${(v.center || []).includes(i) ? ' class="c"' : ''}>${md(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  const CO = { mine: 'Как у меня', best: 'Лучшие практики', trap: 'Ловушка', retry: 'Если не получилось' };
  function coHTML(c, open) {
    const src = arr(c.src).map(([t, u]) => `<span class="src">Источник: <a href="${esc(u)}" target="_blank" rel="noopener">${md(t)} ↗</a></span>`).join('');
    return `<details class="co ${c.co}"${open ? ' open' : ''}><summary><span class="co-l">${CO[c.co]}</span><span class="co-t">${md(c.t)}</span></summary><div class="co-b">${paras(c.text)}${c.list ? `<div class="prose">${ul(c.list)}</div>` : ''}${src}</div></details>`;
  }
  function moreHTML(m) {
    let h = '';
    if (m.lead) h += `<p class="lead">${md(m.lead)}</p>`;
    if (m.text) h += `<div class="prose">${paras(m.text)}</div>`;
    if (m.list) h += `<div class="prose">${ul(m.list)}</div>`;
    if (m.steps) h += `<ol class="ol-steps">${m.steps.map(stepLI).join('')}</ol>`;
    if (m.table) h += tableHTML(m.table);
    if (m.links) h += linksHTML(m.links);
    if (m.files) h += filesHTML(m.files, true);
    if (m.shots) h += `<div class="x-shots" style="grid-template-columns:repeat(${Math.min(m.shots.length, 2)},1fr)">${m.shots.map(x => shotHTML(x)).join('')}</div>`;
    for (const p of arr(m.prompt)) h += promptHTML(p);
    if (m.html) h += `<div class="x-html xs in-details">${m.html}</div>`;
    if (m.after) h += `<div class="prose">${paras(m.after)}</div>`;
    return h;
  }
  function hwMini(h) {
    return `<div class="hw"><div class="hw-top"><span class="chip${h.must ? ' clay' : ''}"><b>${esc(h.id)}</b> · ${h.must ? 'обязательно' : 'по желанию'}</span><a class="chip" href="#dz">Вся домашка →</a></div><h3>${md(h.t)}</h3>${h.was ? `<p class="was">${md(h.was)}</p>` : ''}${h.files ? `<div class="hw-sub"><span class="caps">Файлы</span>${filesHTML(h.files, true)}</div>` : ''}</div>`;
  }
  function detailsHTML(s) {
    const secs = [];
    const p = partOf(s);
    if (s.kind === 'section') {
      if (p.take) secs.push({ h: 'Что унесёте из этой части', html: `<div class="prose">${ul(p.take)}</div>` });
      const rows = ALL.filter(x => x.part === p.id && x.kind !== 'section');
      const pl = plan();
      secs.push({ h: 'Слайды части', html: `<div class="tw"><table class="dt"><thead><tr><th>№</th><th>Слайд</th><th>Минут</th>${HOST ? '<th>По плану</th>' : ''}</tr></thead><tbody>${rows.map(x => `<tr><td>${x.n}</td><td><a href="#s${x.n}">${md(x.t)}</a>${x.demo ? ' <span class="caps" style="color:var(--clay-text)">показ</span>' : ''}${isCut(x) ? ' <span class="caps">вырезан в короткой версии</span>' : ''}</td><td>${fmtNum(mins(x))}</td>${HOST ? `<td class="mono">${clock(START + pl.at.get(x.n))}</td>` : ''}</tr>`).join('')}</tbody></table></div>` });
    }
    if (s.demo) {
      const d = s.demo;
      const dh = { 'Практика': 'Что делали на занятии', 'Обсуждение': 'Что обсуждали на занятии' }[d.pill] || 'Что показывали на занятии';
      secs.push({ h: HOST ? demoPill(s) : dh, html: `<p class="lead">${md(d.t)}${d.see ? '. ' + md(d.see) : ''}</p><ol class="ol-steps">${d.steps.map(x => `<li><span>${md(x)}</span></li>`).join('')}</ol>${d.you ? `<div class="prose"><p><b>${esc(d.youL || 'Теперь вы')}:</b> ${md(d.you)}</p></div>` : ''}${d.more ? `<ol class="ol-steps">${d.more.map(x => `<li><span>${md(x)}</span></li>`).join('')}</ol>` : ''}${d.prompt ? arr(d.prompt).map(promptHTML).join('') : ''}${d.links ? linksHTML(d.links) : ''}` });
    }
    const cos = [];
    for (const m of s.more || []) {
      if (m.co) { if (m.co === 'check' && !HOST) continue; cos.push(m); continue; }
      if (m.host && !HOST) continue;
      secs.push({ h: m.h, html: m.big ? `<div class="big">${moreHTML(m)}</div>` : moreHTML(m) });   // big — раздел под слайдом крупным текстом
    }
    if (s.gpt) secs.push({ h: s.gptH || 'Как это в ChatGPT', html: `<div class="prose">${paras(s.gpt)}</div>` });
    if (cos.length) secs.push({ h: 'Подробнее', html: `<div class="cos">${cos.map((c, i) => coHTML(c, false)).join('')}</div>` });
    const hws = hwFrom(s.n);
    if (hws.length) secs.push({ h: 'Дома', html: hws.map(hwMini).join('') });
    const chips = [];
    if (s.week) chips.push(`<span class="chip">Подробно — <b>неделя ${s.week[0]}</b> · ${esc(s.week[1])}</span>`);
    if (S.short && s.short && s.short.cut) chips.push(`<span class="chip clay">В короткой версии пропускается${s.short.r ? ' · Р4-' + esc(s.short.r) : ''}</span>`);
    if (!secs.length && !chips.length) return '';
    const L = 'ABCDEFGHIJ';
    return `<div class="details gut"><div class="details-in">${chips.length ? `<div class="dstrip">${chips.join('')}</div>` : ''}${secs.map((x, i) => `<section class="dsec" id="d${i}"><h2><span class="lt">${L[i]}</span>${md(x.h)}</h2>${x.html}</section>`).join('')}</div></div>`;
  }

  /* ========== Заметки ведущего ========== */
  function notesBody(s, face, compact) {
    const pl = plan();
    let h = '';
    if (!compact) h += `<h3>Слайд ${s.n} · ${fmtMin(mins(s))} · ${clock(START + (pl.at.get(s.n) || 0))}</h3><div class="clock" data-clock></div>`;
    const sec = (cls, title, body) => body ? `<div class="nsec ${cls}"><span class="caps">${title}</span>${body}</div>` : '';
    if (face === 1 && s.demo) h += sec('', 'Показ — шаги', `<ul>${s.demo.steps.map(x => `<li>${md(x)}</li>`).join('')}</ul>`);
    const say = s.say || s.words;
    h += sec('', 'Что говорю', say ? (Array.isArray(say) && say.length > 1 && s.say ? ul(say) : paras(say)) : '');
    h += sec('', 'Шпаргалка показа', s.show ? ul(s.show) : '');
    h += sec('', 'Главное', s.main ? paras(s.main) : '');
    h += sec('', 'Переход', s.next ? paras(s.next) : '');
    h += sec('', 'Подготовить', s.prep ? paras(s.prep) : '');
    h += sec('warn', 'Проверить', s.check ? ul(s.check) : '');
    if (s.short) h += sec('', s.short.r ? `Короткая версия · Р4-${esc(s.short.r)}` : 'Короткая версия', paras(s.short.cut ? 'В короткой версии слайд пропускается.' + (s.short.why ? ' ' + s.short.why : '') : (s.short.min != null ? `${fmtNum(s.min)} → ${fmtNum(s.short.min)} мин.` : 'На слайде появляется строка: ' + s.short.note) + (s.short.why ? ' ' + s.short.why : '')));
    return h;
  }
  function notesHTML(s, face) {
    return `<aside class="notes" aria-label="Заметки ведущего"><div class="notes-top"><span class="caps">Заметки ведущего</span><button class="notes-x" data-act="notes" aria-label="Закрыть заметки">✕</button></div>${notesBody(s, face)}<div class="pult-row">${HAS_SHORT ? `<button class="btn" style="background:transparent;color:inherit;border-color:rgba(176,174,165,.45)" data-act="short" aria-pressed="${S.short}">Короткая версия · K</button>` : ''}<button class="btn" style="background:transparent;color:inherit;border-color:rgba(176,174,165,.45)" data-act="pult">Пульт в окне · P</button><button class="btn" style="background:transparent;color:inherit;border-color:rgba(176,174,165,.45)" data-act="start">Начали сейчас</button></div><div class="nkeys">← → слайды · D показ · ↓ ↑ разделы<br>T таймер · R сначала · K короткая версия<br>M содержание · N заметки · P пульт · F фокус<br>номер слайда + Enter — перейти</div></aside>`;
  }

  /* ========== Виды ========== */
  function viewSlide(n, face) {
    const s = byN.get(n);
    if (!s) return viewHome();
    face = s.demo ? face : 0;
    const changed = S.view !== 'slide' || S.n !== n;
    S.view = 'slide'; S.n = n; S.face = face;
    document.title = `${s.n}. ${s.t.replace(/\*\*/g, '')} — ${TAG}`;
    const dark = s.kind === 'section' && face === 0;
    document.body.classList.toggle('dark-slide', dark);
    const cutFlag = (HOST && isCut(s)) ? `<span class="chip clay cut-flag">Пропускается в короткой версии</span>` : '';
    app.innerHTML = `<div class="app">${topbarSlide(s, face)}<main id="main"><div class="stage gut" id="stage"><div class="fit${dark ? ' is-dark' : ''}" id="fit">${slideHTML(s, face)}${HOST ? '<div class="tm-line" aria-hidden="true"><i data-tm-line></i></div>' : ''}</div>${cutFlag}</div>${detailsHTML(s)}</main>${footerSlide(s, face)}</div>${HOST && S.notes ? notesHTML(s, face) : ''}${S.toc ? tocHTML() : ''}`;
    document.body.classList.toggle('notes-open', HOST && S.notes);
    fitSlide();
    if (changed) { T.reset(slideSeconds(s), HOST); window.scrollTo(0, 0); }
    draw();
    send({ t: 'state', n: S.n, face: S.face, short: S.short });
  }

  function viewHome() {
    S.view = 'home';
    document.body.classList.remove('dark-slide', 'notes-open');
    document.title = M0.tag ? `${D.meta.title} — ${TAG}` : `${D.meta.course} · Неделя ${D.meta.week}. ${D.meta.title}`;
    const m = D.meta, pl = plan();
    const parts = D.parts.map(p => ({ p, min: partMin(p), first: active().find(s => s.part === p.id) }));
    const q = Math.max(0, END - START - pl.sess[pl.sess.length - 1]);
    let t = START;
    const rows = parts.map(({ p, min, first }) => {
      const sl = ALL.filter(s => s.part === p.id);
      if (sl[0] && sl[0].day) t = START;   // второе занятие недели — время снова с начала
      const r = `<li><a href="#s${first ? first.n : sl[0].n}"><span class="tm0">${clock(t)}</span><span class="pt">${esc(p.num ? 'Часть ' + p.num + '. ' + p.title : p.title)}${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</span><span class="sl0">слайды ${sl[0].n}–${sl[sl.length - 1].n}</span><span class="mn">${fmtNum(min)} мин</span></a></li>`;
      t += min; return r;
    }).join('') + (q > 0 ? `<li><a href="#s${ALL[ALL.length - 1].n}"><span class="tm0">${clock(t)}</span><span class="pt">Вопросы<small>до ${esc(m.end)}</small></span><span class="sl0"></span><span class="mn">${fmtNum(Math.round(q * 10) / 10)} мин</span></a></li>` : '');
    const strip = parts.map(({ p, min, first }) => `<a href="#s${first ? first.n : ''}" style="flex:${min} 1 0" title="${esc(p.title)} · ${fmtNum(min)} мин">${esc(p.num ? 'Ч' + p.num : p.title)} · ${fmtNum(min)}</a>`).join('') + (q > 0 ? `<a class="q" href="#s${ALL[ALL.length - 1].n}" style="flex:${q} 1 0" title="Вопросы">Вопросы</a>` : '');
    const showMin = active().filter(s => s.demo).reduce((a, s) => a + mins(s), 0);
    const talkMin = active().filter(s => !s.demo && !['qs', 'final', 'try', 'probe'].includes(s.kind)).reduce((a, s) => a + mins(s), 0);
    const probeMin = active().filter(s => s.kind === 'probe').reduce((a, s) => a + mins(s), 0);
    const askMin = active().filter(s => ['qs', 'try'].includes(s.kind)).reduce((a, s) => a + mins(s), 0);
    const over = Math.max(...pl.sess) - D.meta.limit;
    const seg = HOST && HAS_SHORT ? `<div class="seg" role="group" aria-label="Версия занятия"><button data-act="short-off" aria-pressed="${!S.short}">Полная</button><button data-act="short-on" aria-pressed="${S.short}">Короткая${R4 ? ' · Р4' : ''}</button></div>` : '';
    app.innerHTML = `<div class="app">${topbarPage('home')}<main class="page gut"><div class="page-in">
      <section class="hero">
        <div class="hero-chips">${HUB ? `<a class="chip" href="${esc(HUB)}">← ${esc(M0.hubLabel || 'Все недели курса')}</a>` : ''}${m.date ? `<span class="chip"><b>${esc(m.date)}</b></span>` : ''}${m.tz ? `<span class="chip">${esc(m.start)}–${esc(m.end)} ${esc(m.tz)}</span>` : ''}${m.format ? `<span class="chip">${esc(m.format)}</span>` : ''}</div>
        <span class="caps">${esc(M0.heroCaps || `${m.org} · ${m.course} · неделя ${m.week} из ${m.weeks}`)}</span>
        <h1>${esc(m.title)}</h1>
        <p class="lead">${md(m.lead)}</p>
        <p class="muted" style="margin:0">${esc(m.hostLine || `Ведёт ${m.host} · ${m.hostRole}`)}</p>
        <div class="hero-cta"><a class="btn btn-main btn-big" href="#s1">Начать →</a><span class="muted" style="font-size:14px">${ALL.length} слайдов · листайте стрелками ← →</span></div>
      </section>
      ${m.notice ? `<div class="note"><span class="caps">${esc(m.notice.h)}</span><p>${md(m.notice.t)}</p></div>` : ''}
      <section class="block"><h2>Главная идея</h2><p class="idea">${md(m.idea)}</p></section>
      <section class="block map"><h2>Карта занятия</h2>
        <div class="stats">${HOST ? seg : ''}<span>Всего <b>${fmtNum(pl.total)} мин</b>${pl.sess.length > 1 ? ` · по занятиям ${pl.sess.map(x => fmtNum(Math.round(x * 10) / 10)).join(' + ')}` : ''}${HOST && over > 0 ? ` · на ${fmtNum(over)} больше лимита ${m.limit}` : ''}</span><span>рассказ <b>${fmtNum(talkMin)}</b></span>${showMin ? `<span>рассказ и показ <b>${fmtNum(showMin)}</b></span>` : ''}${probeMin ? `<span>${esc(M0.probeLabel ? PROBE.toLowerCase() : 'пробы')} <b>${fmtNum(probeMin)}</b></span>` : ''}<span>${esc(m.askLabel || 'знакомство и итог')} <b>${fmtNum(askMin)}</b></span></div>
        <div class="map-strip" aria-hidden="true">${strip}</div>
        <ol class="map-rows">${rows}</ol>
      </section>
      ${D.promise ? '' : '<!--'}<section class="block"><h2>Что обещаем и чего нет</h2><div class="two"><div><h3 class="col-h">Обещаем</h3><div class="prose">${ul(D.promise)}</div></div><div><h3 class="col-h" style="border-top-color:var(--line)">Не обещаем</h3><div class="prose">${ul(D.nopromise)}</div></div></div></section>${D.promise ? '' : '-->'}
      ${D.series ? `<section class="block"><h2>${esc(D.series.h)}</h2>${D.series.sub ? `<p class="sub">${md(D.series.sub)}</p>` : ''}${tableHTML(D.series).replace('class="dt"', 'class="dt weeks"')}</section>` : (D.weeks ? `<section class="block"><h2>Неделя ${D.meta.week} в курсе</h2><p class="sub">Недели складываются в одну линию: результат одной становится материалом следующей.</p>${tableHTML({ head: ['Неделя', 'Тема', 'Ведёт', 'На выходе'], rows: D.weeks.map(w => [String(w[0]), w[1], w[2], w[3]]), mark: D.meta.week - 1 }).replace('class="dt"', 'class="dt weeks"')}</section>` : '')}
      ${D.rhythm ? `<section class="block"><h2>${esc(D.rhythmH || 'Ритм недели')}</h2>${tableHTML({ head: ['Когда', 'Что'], rows: D.rhythm })}</section>` : ''}
      <section class="block"><h2>Ещё на сайте</h2><div class="files two">${PAGE_ORDER.filter(id => id !== 'home' && hasPage(id)).map(id => `<a class="file" href="#${id}"><span class="ext">${esc(PAGES[id].ext)}</span><span><span class="t">${esc(PAGES[id].title)}</span><br><span class="n">${esc(PAGES[id].sub)}</span></span></a>`).join('')}</div></section>
      ${m.updatedNote ? `<p class="muted" style="font-size:13px;margin:0">${md(m.updatedNote)}</p>` : ''}
    </div></main></div>${S.toc ? tocHTML() : ''}`;
    window.scrollTo(0, 0);
  }

  /* ---------- служебные страницы ---------- */
  const PAGE_ORDER = ['home', 'dz', 'materialy', 'prompty', 'slovar', 'lyubopytnym', 'kto', 'podgotovka'];
  const PAGES = {
    home: { nav: 'Главная', title: 'Главная', ext: '⌂', sub: '' },
    dz: { nav: 'Домашка', title: 'Домашка', ext: 'ДЗ', sub: 'Обязательно, по желанию, что принести в субботу' },
    materialy: { nav: 'Материалы', title: 'Материалы и ссылки', ext: 'MD', sub: 'Файлы недели, сервисы и инструменты' },
    prompty: { nav: 'Промпты', title: 'Промпты', ext: 'TXT', sub: 'Копируются кнопкой, свои значения подсвечены' },
    slovar: { nav: 'Словарь', title: 'Словарь', ext: 'А–Я', sub: 'Общие слова курса со ссылками на слайды' },
    lyubopytnym: { nav: 'Для любопытных', title: 'Для любопытных', ext: '↗', sub: 'Видео, гайды и статьи, если хочется глубже' },
    kto: { nav: 'Кто ведёт', title: 'Кто ведёт курс', ext: 'Мы', sub: 'Ведущие и организатор' },
    podgotovka: { nav: 'Подготовка', title: 'Подготовка ведущего', ext: 'ЧЛ', sub: 'Что подготовить и проверить до ' + String(D.meta.date).replace(/\s+\d{4}$/, ''), host: true }
  };
  // страница есть, только если для неё есть данные; подписи можно поменять в D.pageText
  for (const [id, v] of Object.entries(D.pageText || {})) Object.assign(PAGES[id], v);
  const PAGE_DATA = { home: () => true, dz: () => D.hw.must.length + D.hw.opt.length > 0, materialy: () => !!D.pages.materials, prompty: () => Object.keys(D.prompts).length > 0, slovar: () => !!D.pages.terms, lyubopytnym: () => !!D.pages.curious, kto: () => !!D.pages.people, podgotovka: () => true };
  function hasPage(id) { return PAGE_DATA[id]() && (!PAGES[id].host || (HOST && !!D.pages.prep)); }
  function pageShell(id, inner) {
    S.view = 'page';
    document.body.classList.remove('dark-slide', 'notes-open');
    document.title = `${PAGES[id].title} — ${TAG}`;
    app.innerHTML = `<div class="app">${topbarPage(id)}<main class="page gut"><div class="page-in">${inner}</div></main></div>${S.toc ? tocHTML() : ''}`;
  }
  const pageHead = (title, lead) => `<header class="page-h"><span class="caps">${esc(M0.tag ? TAG : `${D.meta.course} · неделя ${D.meta.week}`)}</span><h1>${esc(title)}</h1>${lead ? `<p class="lead">${md(lead)}</p>` : ''}</header>`;
  function checklist(key, items, title) {
    const done = items.filter((_, i) => store.get(`ck:${key}:${i}`, false)).length;
    return `<div class="check" data-check="${esc(key)}"><div class="check-h"><span class="caps">${esc(title || 'Что должно получиться')}</span><span class="cnt" data-cnt>${done} из ${items.length}</span></div>${items.map((x, i) => `<label><input type="checkbox" id="ck-${esc(key)}-${i}" data-ck="${esc(key)}:${i}"${store.get(`ck:${key}:${i}`, false) ? ' checked' : ''}><span>${md(x)}</span></label>`).join('')}</div>`;
  }
  const PAGE_VIEWS = {
    dz() {
      const card = h => `<article class="hw" id="${esc(h.id)}"><div class="hw-top"><span class="chip${h.must ? ' clay' : ''}"><b>${esc(h.id)}</b> · ${h.must ? 'обязательно' : 'по желанию'}</span>${arr(h.from).map(n => `<a class="chip" href="#s${n}">родилось на слайде ${n}</a>`).join('')}</div><h3>${md(h.t)}</h3>${h.was ? `<p class="was">${md(h.was)}</p>` : ''}${h.files ? `<div class="hw-sub"><span class="caps">Файлы</span>${filesHTML(h.files, true)}</div>` : ''}${h.how ? `<div class="prose" style="font-size:15px">${paras(h.how)}</div>` : ''}${h.steps ? `<div class="hw-sub"><span class="caps">Шаги</span><ol class="ol-steps">${h.steps.map(stepLI).join('')}</ol></div>` : ''}${h.result ? `<div class="hw-sub"><span class="caps">Что получится и как показать</span><div class="prose" style="font-size:15px">${paras(h.result)}</div></div>` : ''}${h.check ? checklist(h.id, h.check) : ''}${h.retry ? `<div class="retry"><span class="caps">Если не получилось</span><span>${md(h.retry)}</span></div>` : ''}${arr(h.prompt).map(promptHTML).join('')}</article>`;
      pageShell('dz', `${pageHead(D.hw.title || 'Домашка недели ' + D.meta.week, D.hw.lead)}
        <section class="block"><h2>Обязательно</h2><div class="cos" style="gap:16px">${D.hw.must.map(card).join('')}</div></section>
        ${D.hw.opt.length ? `<section class="block"><h2>По желанию</h2><div class="cos" style="gap:16px">${D.hw.opt.map(card).join('')}</div></section>` : ''}
        ${D.hw.bring ? `<section class="block"><h2>${esc(D.hw.bringH || 'Что принести в субботу')}</h2>${checklist('bring', D.hw.bring, D.hw.bringL || 'Для разбора работ')}</section>` : ''}
        ${D.pages.curious ? `<section class="block"><h2>Для любопытных</h2><p class="sub" style="margin:0">Видео, гайды и статьи — на отдельной странице.</p><div><a class="btn" href="#lyubopytnym">Для любопытных →</a></div></section>` : ''}`);
    },
    materialy() {
      const M = D.pages.materials;
      pageShell('materialy', `${pageHead('Материалы и ссылки', M.lead)}
        <section class="block"><h2>${esc(M.filesH || 'Файлы недели')}</h2>${filesHTML(M.files, true)}</section>
        ${(M.groups || []).map(g => `<section class="block"><h2>${esc(g.h)}</h2>${g.sub ? `<p class="sub">${md(g.sub)}</p>` : ''}${linksHTML(g.links)}</section>`).join('')}`);
    },
    prompty() {
      pageShell('prompty', `${pageHead('Промпты', D.pages.promptsLead)}${Object.keys(D.prompts).map(k => `<section class="block"><h2>${esc(k)}</h2>${D.prompts[k].where ? `<p class="sub">${md(D.prompts[k].where)}</p>` : ''}${promptHTML(k)}</section>`).join('')}`);
    },
    slovar() {
      pageShell('slovar', `${pageHead('Словарь', D.pages.termsLead)}<dl class="terms">${D.pages.terms.map(([t, en, d, n]) => `<div id="t-${esc(t.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-'))}"><dt>${esc(t)}${en ? `<small>${esc(en)}</small>` : ''}</dt><dd>${md(d)}${n ? ` ${arr(n).map(x => `<a href="#s${x}">слайд ${x}</a>`).join(', ')}` : ''}</dd></div>`).join('')}</dl>`);
    },
    lyubopytnym() {
      const C = D.pages.curious;
      pageShell('lyubopytnym', `${pageHead('Для любопытных', C.lead)}
        ${C.person ? `<section class="block"><h2>${esc(C.person.name)}</h2><div class="person"><span class="caps">${esc(C.person.role)}</span>${paras(C.person.who)}<p class="muted">${md(C.person.why)}</p></div>${linksHTML(C.person.links)}</section>` : ''}
        ${C.groups.map(g => `<section class="block"><h2>${esc(g.h)}</h2>${g.sub ? `<p class="sub">${md(g.sub)}</p>` : ''}${g.files ? filesHTML(g.files, true) : ''}${g.links ? linksHTML(g.links) : ''}</section>`).join('')}`);
    },
    kto() {
      const K = D.pages.people;
      pageShell('kto', `${pageHead('Кто ведёт курс', K.lead)}<div class="two">${K.list.map(p => `<article class="person"><span class="caps">${esc(p.weeks)}</span><h3>${esc(p.name)}</h3><p class="muted">${md(p.role)}</p>${paras(p.text)}${p.links ? linksHTML(p.links) : ''}</article>`).join('')}</div><section class="block"><h2>Организатор</h2><div class="prose">${paras(K.org)}</div></section>`);
    },
    podgotovka() {
      const P = D.pages.prep;
      const checks = ALL.filter(s => s.check).map(s => `<li><a href="#s${s.n}">Слайд ${s.n}</a>: ${s.check.map(md).join(' ')}</li>`).join('');
      pageShell('podgotovka', `${pageHead('Подготовка ведущего', P.lead)}
        ${P.tasks ? `<section class="block"><h2>Задачи до занятия</h2><p class="sub">Сделать руками: скриншоты, прогоны, проверки. После каждого пункта — пересобрать сайт.</p>${checklist('prep-tasks', P.tasks.map(([a, b]) => `**${a}** — ${b}`), 'Задачи')}</section>` : ''}
        <section class="block"><h2>Что подготовить</h2>${checklist('prep-mat', P.materials.map(([a, b]) => `**${a}** — ${b}`), 'Материалы')}</section>
        ${P.key ? `<section class="block"><h2>Ключ к учебной выгрузке</h2><div class="prose">${ul(P.key)}</div></section>` : ''}
        <section class="block"><h2>Что проверить перед занятием</h2>${checklist('prep-check', P.checks, 'Проверки')}</section>
        <section class="block"><h2>Пометки «проверить» на слайдах</h2><div class="prose"><ul>${checks}</ul></div></section>
        <section class="block"><h2>Что ещё открыто</h2><div class="prose">${ul(P.open)}</div></section>
        <section class="block"><h2>Как вести с сайта</h2><div class="prose">${ul(P.how)}</div></section>`);
    }
  };

  /* ========== Содержание (M) ========== */
  function tocHTML() {
    const pl = plan();
    const cur = S.view === 'slide' ? S.n : -1;
    const seg = HOST && HAS_SHORT ? `<div class="seg" role="group" aria-label="Версия занятия"><button data-act="short-off" aria-pressed="${!S.short}">Полная · ${fmtNum(fullTotal)} мин</button><button data-act="short-on" aria-pressed="${S.short}">Короткая · ${fmtNum(shortTotal)} мин</button></div>` : '';
    return `<div class="toc gut" role="dialog" aria-label="Содержание"><div class="toc-in"><div class="toc-h"><h2>Содержание</h2><div class="pult-row">${seg}<a class="btn" href="#home">Главная</a><button class="btn" data-act="toc" aria-label="Закрыть">Закрыть <kbd>Esc</kbd></button></div></div><div class="toc-grid">${D.parts.map(p => `<div class="toc-part"><h3>${esc(p.num ? 'Часть ' + p.num + '. ' + p.title : p.title)}<span>${fmtNum(partMin(p))} мин</span></h3><ol>${ALL.filter(s => s.part === p.id).map(s => `<li><a href="#s${s.n}"${s.n === cur ? ' aria-current="true"' : ''} class="${isCut(s) ? 'is-cut' : ''}"><span class="n">${s.n}</span><span>${md(s.t)}${s.demo ? '<span class="k">показ</span>' : ''}${HOST && s.short ? `<span class="k" style="color:var(--ink-muted)">${esc(shortTag(s))}</span>` : ''}</span><span class="m">${isCut(s) ? '—' : fmtNum(mins(s))}</span>${HOST ? `<span class="c">${isCut(s) ? '' : clock(START + pl.at.get(s.n))}</span>` : '<span></span>'}</a></li>`).join('')}</ol></div>`).join('')}</div></div></div>`;
  }
  let fullTotal = 0, shortTotal = 0;
  { const keep = S.short; S.short = false; fullTotal = plan().total; S.short = true; shortTotal = plan().total; S.short = keep; }

  /* ========== Пульт ведущего (P) — второе окно ========== */
  let pultWin = null, pultAlive = false;
  function viewPult() {
    S.view = 'pult';
    document.title = 'Пульт — ' + TAG;
    renderPult(true);
    send({ t: 'hello' });
    setTimeout(() => { if (!pultAlive) renderPult(true); }, 1200);
  }
  function renderPult(resetTimer) {
    const s = byN.get(S.n) || ALL[0];
    const face = s.demo ? S.face : 0;
    const nx = (s.demo && face === 0) ? { s, face: 1 } : (neighbour(s.n, 1) ? { s: neighbour(s.n, 1), face: 0 } : null);
    const list = active(); const i = list.findIndex(x => x.n === s.n);
    app.innerHTML = `<div class="pult"><section class="pult-main"><div class="pult-bar"><span class="caps">Сейчас · слайд ${s.n} · ${i + 1} из ${list.length} · ${kindLabel(s, face)}${pultAlive ? '' : ' · основное окно не отвечает, пульт листает сам'}</span><div class="pult-row"><button class="btn" data-act="prev">← Назад</button>${s.demo ? `<button class="btn btn-show" data-act="face" aria-pressed="${face === 1}"><b>Показ</b><kbd>D</kbd></button>` : ''}<button class="btn btn-main" data-act="next">Далее →</button></div></div><div class="pult-now" id="pnow"><div class="fit${s.kind === 'section' && face === 0 ? ' is-dark' : ''}" id="pfit">${slideHTML(s, face)}</div></div>${s.main ? `<p style="margin:0;font-size:17px;line-height:25px"><span class="caps">Главное · </span>${md(s.main)}</p>` : ''}</section>
      <aside class="pult-side"><div class="pult-row" style="justify-content:space-between"><span class="caps">${s.kind === 'final' ? 'На вопросы' : 'План ' + fmtMin(mins(s))}</span><div class="pult-row"><button class="btn" data-act="tm-play" data-tm-play>▶</button><button class="btn" data-act="tm-reset">↺</button></div></div><div class="pult-big" data-tm>0:00</div><div class="clock" data-clock style="font-family:var(--font-mono);font-size:13px;color:var(--on-slab-muted)"></div><div class="pult-row"><button class="btn" data-act="start">Начали сейчас</button>${HAS_SHORT ? `<button class="btn" data-act="short" aria-pressed="${S.short}">Короткая версия · K</button>` : ''}</div>
      ${nx ? `<div class="pult-next"><span class="caps">Дальше</span><div class="fit" id="pnext">${slideHTML(nx.s, nx.face)}</div><span style="font-size:14px">${nx.face ? 'Показ: ' + md(nx.s.demo.t) : nx.s.n + '. ' + md(nx.s.t)}</span></div>` : ''}
      ${notesBody(s, face, true)}</aside></div>`;
    const side = $('.pult-side');
    fitInto($('#pnext'), side ? side.clientWidth - 40 : 360, 220);
    const now = $('#pnow');
    if (now) fitInto($('#pfit'), now.clientWidth, Math.max(200, now.clientHeight));
    if (resetTimer) T.reset(slideSeconds(s), true);
    draw();
  }

  /* ---------- связь окон: postMessage, BroadcastChannel, localStorage ---------- */
  const WIN = Math.random().toString(36).slice(2);
  const seen = new Set();
  let chan = null;
  try { chan = new BroadcastChannel('kurs-' + D.id); } catch (e) { chan = null; }
  function send(msg) {
    if (!HOST) return;
    msg.kurs = D.id; msg.from = WIN; msg.id = WIN + Math.random().toString(36).slice(2);
    try { chan && chan.postMessage(msg); } catch (e) { }
    try { if (pultWin && !pultWin.closed) pultWin.postMessage(msg, '*'); } catch (e) { }
    try { if (window.opener && !window.opener.closed) window.opener.postMessage(msg, '*'); } catch (e) { }
    try { localStorage.setItem(D.id + ':bus', JSON.stringify(msg)); } catch (e) { }
  }
  function receive(msg) {
    if (!msg || msg.kurs !== D.id || msg.from === WIN || seen.has(msg.id)) return;
    seen.add(msg.id);
    if (S.view === 'pult') {
      if (msg.t === 'state') {
        pultAlive = true;
        const moved = msg.n !== S.n;
        S.n = msg.n; S.face = msg.face;
        if (msg.short !== S.short) S.short = msg.short;
        renderPult(moved);
      }
    } else {
      if (msg.t === 'hello' && S.view === 'slide') send({ t: 'state', n: S.n, face: S.face, short: S.short });
      if (msg.t === 'hello' && S.view !== 'slide') goSlide(1, 0);
      if (msg.t === 'go') goSlide(msg.n, msg.face);
      if (msg.t === 'short') setShort(msg.v, true);
    }
  }
  if (chan) chan.onmessage = e => receive(e.data);
  window.addEventListener('message', e => receive(e.data));
  window.addEventListener('storage', e => { if (e.key === D.id + ':bus' && e.newValue) { try { receive(JSON.parse(e.newValue)); } catch (er) { } } });
  function openPult() {
    const url = location.href.split('#')[0] + '#pult';
    try { pultWin = window.open(url, 'kurs-pult-' + D.id, 'popup,width=1280,height=800'); } catch (e) { pultWin = null; }
    if (!pultWin) toast('Браузер не открыл окно. Разрешите всплывающие окна для этой страницы');
  }

  /* ========== Навигация ========== */
  function goSlide(n, face) {
    if (S.view === 'pult') {
      S.n = n; S.face = face; renderPult(true);
      send({ t: 'go', n, face });
      return;
    }
    const h = `#s${n}${face ? 'p' : ''}`;
    if (location.hash === h) viewSlide(n, face); else location.hash = h;
  }
  function step(dir) {
    if (S.view === 'home' && dir > 0) return goSlide(active()[0].n, 0);
    if (S.view !== 'slide' && S.view !== 'pult') return;
    const s = byN.get(S.n);
    if (dir > 0) {
      if (s.demo && S.face === 0) return goSlide(s.n, 1);
      const nx = neighbour(s.n, 1); if (nx) goSlide(nx.n, 0);
    } else {
      if (S.face === 1) return goSlide(s.n, 0);
      const pv = neighbour(s.n, -1); if (pv) goSlide(pv.n, 0);
    }
  }
  function jumpSection(dir) {
    const tops = [0, ...$$('.dsec').map(el => el.getBoundingClientRect().top + window.scrollY - ($('.tb') ? $('.tb').offsetHeight : 0) - 16)];
    const y = window.scrollY;
    let target = null;
    if (dir > 0) target = tops.find(t => t > y + 4);
    else target = [...tops].reverse().find(t => t < y - 4);
    if (target != null) window.scrollTo({ top: target, behavior: 'smooth' });
  }
  function setShort(v, quiet) {
    if (!HOST) return;
    S.short = v; store.set('short', v);
    if (!quiet) send({ t: 'short', v });
    if (S.view === 'slide') {
      const s = byN.get(S.n);
      T.reset(slideSeconds(s), T.run);
      viewSlide(S.n, S.face);
    } else if (S.view === 'pult') renderPult(false);
    else route();
    toast(v ? `Короткая версия: ${fmtNum(shortTotal)} мин` : `Полная версия: ${fmtNum(fullTotal)} мин`);
  }
  function route() {
    const h = decodeURIComponent(location.hash.slice(1)) || 'home';
    const m = h.match(/^s(\d+)(p?)$/);
    if (m && byN.has(+m[1])) return viewSlide(+m[1], m[2] ? 1 : 0);
    if (h === 'pult' && HOST) return viewPult();
    if (PAGE_VIEWS[h] && hasPage(h)) { PAGE_VIEWS[h](); window.scrollTo(0, 0); return; }
    return viewHome();
  }
  function rerender() { if (S.view === 'slide') viewSlide(S.n, S.face); else if (S.view === 'pult') renderPult(false); else route(); }

  /* ---------- тема ---------- */
  function applyTheme(t) { if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
  const THEME_KEY = 'kurs-ai:theme';
  let savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { savedTheme = null; }
  applyTheme(savedTheme);
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const t = cur === 'dark' ? 'light' : 'dark';
    applyTheme(t); try { localStorage.setItem(THEME_KEY, t); } catch (e) { }
  }

  /* ---------- тост, копирование, лайтбокс ---------- */
  let toastT = null;
  function toast(t) {
    let el = $('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2200);
  }
  function copyText(text, btnEl) {
    const done = () => { if (btnEl) { const o = btnEl.textContent; btnEl.textContent = '✓ Скопировано'; setTimeout(() => { btnEl.textContent = o; }, 2200); } };
    const fallback = () => {
      const pre = btnEl && btnEl.closest('.prompt') ? btnEl.closest('.prompt').querySelector('pre') : null;
      if (pre) { const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
      try { if (document.execCommand('copy')) return done(); } catch (e) { }
      toast('Выделите текст вручную и скопируйте');
    };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  }
  function lightbox(src, cap) {
    const el = document.createElement('div');
    el.className = 'lb'; el.setAttribute('role', 'dialog');
    el.innerHTML = `<figure><img src="${src}" alt=""><figcaption><span>${esc(cap)}</span><span>Esc — закрыть</span></figcaption></figure>`;
    el.addEventListener('click', () => el.remove());
    document.body.appendChild(el);
  }

  /* ========== События ========== */
  document.addEventListener('click', e => {
    const z = e.target.closest('[data-zoom]');
    if (z) { lightbox(z.getAttribute('src'), z.dataset.zoom); return; }
    const c = e.target.closest('[data-copy]');
    if (c) { const p = D.prompts[c.dataset.copy]; if (p) copyText(p.copy || p.text, c); return; }  // copy — если копировать надо больше, чем показано (промпт вместе с образцами)
    const a = e.target.closest('[data-act]');
    if (!a) {
      if (S.toc && e.target.closest('.toc a[href^="#"]')) { S.toc = false; }
      return;
    }
    const act = a.dataset.act;
    if (act === 'next') step(1);
    else if (act === 'prev') step(-1);
    else if (act === 'face') goSlide(S.n, S.face ? 0 : 1);
    else if (act === 'toc') { S.toc = !S.toc; rerender(); }
    else if (act === 'theme') toggleTheme();
    else if (act === 'notes') { S.notes = !S.notes; store.set('notes', S.notes); rerender(); }
    else if (act === 'focus') toggleFocus();
    else if (act === 'pult') openPult();
    else if (act === 'short') setShort(!S.short);
    else if (act === 'short-on') setShort(true);
    else if (act === 'short-off') setShort(false);
    else if (act === 'tm-play') T.toggle();
    else if (act === 'tm-reset') { const s = byN.get(S.n); if (s) T.reset(slideSeconds(s), false); }
    else if (act === 'start') { store.set('start', new Date(Date.now() - (plan().at.get(S.n) || 0) * 60000).toISOString()); toast('Время занятия отсчитывается от этого слайда'); draw(); }
  });
  document.addEventListener('change', e => {
    const i = e.target.closest('[data-ck]');
    if (!i) return;
    store.set('ck:' + i.dataset.ck, i.checked);
    if (i.closest('.x-probe')) i.blur();
    const box = i.closest('[data-check]');
    if (box) { const all = $$('input', box); box.querySelector('[data-cnt]').textContent = `${all.filter(x => x.checked).length} из ${all.length}`; }
  });
  function toggleFocus(v) {
    S.focus = v == null ? !S.focus : v;
    document.body.classList.toggle('focus', S.focus);
    fitSlide();
  }
  let digits = '', digitsT = null;
  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const code = e.code, key = e.key;
    if (key === 'Escape') {
      if ($('.lb')) { $('.lb').remove(); return; }
      if (S.toc) { S.toc = false; rerender(); return; }
      if (S.focus) { toggleFocus(false); return; }
      if (S.notes && S.view === 'slide') { S.notes = false; store.set('notes', false); rerender(); }
      return;
    }
    const nav = S.view === 'slide' || S.view === 'pult';
    if (key === 'ArrowRight' || key === 'PageDown') { if (nav || S.view === 'home') { e.preventDefault(); step(1); } return; }
    if (key === 'ArrowLeft' || key === 'PageUp') { if (nav) { e.preventDefault(); step(-1); } return; }
    if (S.view === 'slide' && !S.focus && (key === 'ArrowDown' || key === 'ArrowUp')) { e.preventDefault(); jumpSection(key === 'ArrowDown' ? 1 : -1); return; }
    if (/^Digit\d$|^Numpad\d$/.test(code) && nav) {
      digits += code.slice(-1); clearTimeout(digitsT); digitsT = setTimeout(() => { digits = ''; }, 1600);
      toast('Слайд ' + digits + ' — нажмите Enter'); return;
    }
    if ((key === 'Enter' || code === 'NumpadEnter') && digits) { const n = +digits; digits = ''; if (byN.has(n)) goSlide(n, 0); return; }
    if (code === 'KeyM') { S.toc = !S.toc; rerender(); return; }
    if (code === 'KeyF' && S.view === 'slide') { toggleFocus(); return; }
    if (code === 'KeyD' && nav) { const s = byN.get(S.n); if (s && s.demo) goSlide(S.n, S.face ? 0 : 1); return; }
    if (!HOST) return;
    if (code === 'KeyN' && S.view === 'slide') { S.notes = !S.notes; store.set('notes', S.notes); rerender(); return; }
    if (code === 'KeyP' && S.view === 'slide') { openPult(); return; }
    if (code === 'KeyT') { T.toggle(); return; }
    if (code === 'KeyR') { const s = byN.get(S.n); if (s) T.reset(slideSeconds(s), false); return; }
    if (code === 'KeyK') { setShort(!S.short); return; }
  });
  window.addEventListener('hashchange', () => { if (S.view !== 'pult') { S.toc = false; route(); } });
  window.addEventListener('resize', () => { if (S.view === 'slide') fitSlide(); else if (S.view === 'pult') renderPult(false); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S.view === 'slide') fitSlide(); });

  route();
})();
