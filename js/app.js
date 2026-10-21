/* InvestBatumi — interactive behaviour (vanilla JS, no dependencies) */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  // Splash screen pop-up logic
  window.addEventListener('load', () => {
    const splash = document.getElementById('splash');
    if (splash) {
      // Check if it's the first time opening the site in this session
      const isFirstLoad = !sessionStorage.getItem('splash_shown');
      const duration = isFirstLoad ? 3500 : 1200; // 3.5s for first load, 1.2s for page transitions
      
      if (isFirstLoad) {
        sessionStorage.setItem('splash_shown', 'true');
      }

      // If it's a fast transition, speed up the CSS animation as well
      if (!isFirstLoad) {
        const logo = splash.querySelector('.splash-logo');
        if (logo) logo.style.animationDuration = '1.2s';
      }

      setTimeout(() => {
        splash.classList.add('hidden');
      }, duration);
    }
  });

  /* ------------------------------------------------ config */
  // Optional: set to a form-backend URL (Formspree, Netlify, your API …) to receive leads.
  const FORM_ENDPOINT = '';

  const LOCALES = { tr: 'tr-TR', en: 'en-US', ru: 'ru-RU', he: 'he-IL', ar: 'ar-u-nu-latn' };
  const RTL = ['he', 'ar'];
  const LANGS = Object.keys(LOCALES);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ------------------------------------------------ i18n core */
  let lang = 'en';
  // Numbers, ranges and currency amounts must stay left-to-right inside RTL sentences.
  const BIDI_NUM = /[$≈]?\d(?:[\d.,]*\d)?(?:[%+]|k)?(?:\s?[–-]\s?[$]?\d(?:[\d.,]*\d)?(?:[%+]|k)?)*/g;
  const t = (key, vars) => {
    let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    if (vars) Object.keys(vars).forEach(k => { s = s.replace('{' + k + '}', vars[k]); });
    if (RTL.includes(lang)) s = s.replace(BIDI_NUM, '\u2066$&\u2069');
    return s;
  };
  const nf = (opts) => new Intl.NumberFormat(LOCALES[lang], opts);
  const money = (n) => nf({ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const num = (n, d = 1) => nf({ minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  const pct = (n, d = 1) => num(n, d) + '%';

  function detectLang() {
    const saved = localStorage.getItem('ib_lang');
    if (saved && LANGS.includes(saved)) return saved;
    for (const l of (navigator.languages || [navigator.language || 'en'])) {
      const code = l.slice(0, 2).toLowerCase();
      if (code === 'iw') return 'he';
      if (LANGS.includes(code)) return code;
    }
    return 'en';
  }

  function applyStatic() {
    $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  }

  function setLang(next, persist = true) {
    lang = next;
    const html = document.documentElement;
    html.lang = lang;
    html.dir = RTL.includes(lang) ? 'rtl' : 'ltr';
    document.title = t('meta.title');
    $('meta[name="description"]').setAttribute('content', t('meta.desc'));
    if (persist) localStorage.setItem('ib_lang', lang);
    $('#lang-current').textContent = lang.toUpperCase();
    $$('#lang-list button').forEach(b => b.setAttribute('aria-current', String(b.dataset.lang === lang)));
    applyStatic();
    renderRoi();
    renderDistricts();
    renderChart();
    renderQuiz();
    renderScore();
    renderCompare();
    renderWhy();
    renderSupply(supplyShown);
  }

  /* ------------------------------------------------ language menu / nav */
  const langMenu = $('#lang-menu');
  $('#lang-list').addEventListener('click', e => {
    const b = e.target.closest('button[data-lang]');
    if (!b) return;
    setLang(b.dataset.lang);
    langMenu.open = false;
  });
  document.addEventListener('click', e => { if (!langMenu.contains(e.target)) langMenu.open = false; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { langMenu.open = false; closeNav(); } });

  const nav = $('#main-nav'), navBtn = $('#nav-toggle');
  function closeNav() { nav.classList.remove('open'); navBtn.setAttribute('aria-expanded', 'false'); }
  navBtn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    navBtn.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', e => { if (e.target.closest('a')) closeNav(); });

  const header = $('#site-header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------------ ROI calculator */
  const MODEL = { grossAtBench: 7.25, benchOcc: 65, agency: 13.5, tax: 5 };
  const roiEls = {
    priceNum: $('#roi-price-num'), price: $('#roi-price'), occ: $('#roi-occ'), occOut: $('#roi-occ-out'),
    agency: $('#roi-agency'), opex: $('#roi-opex'), opexOut: $('#roi-opex-out'),
    gross: $('#kpi-gross'), net: $('#kpi-net'), band: $('#kpi-band'), payback: $('#kpi-payback'),
    year: $('#cash-year'), month: $('#cash-month'), wf: $('#waterfall')
  };
  let roiState = null;

  function fillRange(el) {
    const p = ((el.value - el.min) / (el.max - el.min)) * 100;
    el.style.setProperty('--p', Math.max(0, Math.min(100, p)) + '%');
  }

  function calcRoi() {
    const price = Math.max(0, Number(roiEls.priceNum.value) || 0);
    const occ = Number(roiEls.occ.value);
    const mgmt = Number($('input[name="mgmt"]:checked').value);
    const agencyOn = roiEls.agency.checked;
    const opex = Number(roiEls.opex.value);
    const grossYield = MODEL.grossAtBench * occ / MODEL.benchOcc;
    const gross = price * grossYield / 100;
    const items = [
      { key: 'roi.res.mgmt', v: gross * mgmt / 100, c: '#7f8da3' },
      { key: 'roi.res.agency', v: agencyOn ? gross * MODEL.agency / 100 : 0, c: '#8f7fb3' },
      { key: 'roi.res.opex', v: gross * opex / 100, c: '#b58b6c' },
      { key: 'roi.res.tax', v: gross * MODEL.tax / 100, c: '#d77a6a' }
    ];
    const net = gross - items.reduce((a, i) => a + i.v, 0);
    return { price, occ, mgmt, agencyOn, opex, grossYield, gross, items, net, netYield: price ? net / price * 100 : 0 };
  }

  function renderRoi() {
    const r = roiState = calcRoi();
    roiEls.occOut.textContent = r.occ + '%';
    roiEls.opexOut.textContent = r.opex + '%';
    [roiEls.price, roiEls.occ, roiEls.opex].forEach(fillRange);

    roiEls.gross.textContent = pct(r.grossYield);
    roiEls.net.textContent = pct(r.netYield);
    const ny = Math.round(r.netYield * 10) / 10;
    const band = ny >= 3 && ny <= 4 ? 'in' : ny > 4 ? 'above' : 'below';
    roiEls.band.textContent = t('roi.band.' + band);
    roiEls.band.classList.toggle('warn', band === 'below');
    roiEls.payback.textContent = r.net > 0 ? `${Math.round(r.price / r.net)} ${t('roi.yrs')}` : '—';
    roiEls.year.textContent = money(r.net);
    roiEls.month.textContent = money(r.net / 12);

    // waterfall
    const g = r.gross || 1;
    let remaining = g;
    const rows = [`<li class="wf-row"><span class="wf-label">${t('roi.res.gross')}</span><span class="wf-track"><i class="wf-bar" style="--s:0%;--w:100%;--c:var(--teal)"></i></span><b class="ltr">${money(r.gross)}<small>${pct(r.grossYield)}</small></b></li>`];
    r.items.forEach(it => {
      remaining -= it.v;
      const start = Math.max(0, remaining / g * 100), w = it.v / g * 100;
      rows.push(`<li class="wf-row"><span class="wf-label">${t(it.key)}</span><span class="wf-track"><i class="wf-bar" style="--s:${start.toFixed(2)}%;--w:${w.toFixed(2)}%;--c:${it.c}"></i></span><b class="ltr">−${money(it.v)}<small>−${pct(r.price ? it.v / r.price * 100 : 0)}</small></b></li>`);
    });
    rows.push(`<li class="wf-row is-net"><span class="wf-label">${t('roi.res.net')}</span><span class="wf-track"><i class="wf-bar" style="--s:0%;--w:${Math.max(0, r.net / g * 100).toFixed(2)}%;--c:var(--gold)"></i></span><b class="ltr">${money(r.net)}<small>${pct(r.netYield)}</small></b></li>`);
    roiEls.wf.innerHTML = rows.join('');
  }

  roiEls.price.addEventListener('input', () => { roiEls.priceNum.value = roiEls.price.value; renderRoi(); });
  roiEls.priceNum.addEventListener('input', () => { roiEls.price.value = roiEls.priceNum.value; renderRoi(); });
  [roiEls.occ, roiEls.opex, roiEls.agency].forEach(el => el.addEventListener('input', renderRoi));
  $$('input[name="mgmt"]').forEach(el => el.addEventListener('change', renderRoi));

  /* ------------------------------------------------ districts */
  const DISTRICTS = [
    { k: 'd1', v: 51 }, { k: 'd2', v: 100 }, { k: 'd3', v: 100 }
  ];
  let distIdx = 0;
  const distTabs = $('#dist-tabs'), distPanel = $('#dist-panel');

  function renderDistricts(animate = false) {
    distTabs.innerHTML = DISTRICTS.map((d, i) => `
      <button type="button" role="tab" class="tab" id="tab-${d.k}" aria-selected="${i === distIdx}" aria-controls="dist-panel" tabindex="${i === distIdx ? 0 : -1}" data-i="${i}">
        <b>${t(d.k + '.name')}</b><small>${t(d.k + '.tag')}</small>
      </button>`).join('');
    const d = DISTRICTS[distIdx], metric = t(d.k + '.metric');
    distPanel.setAttribute('aria-labelledby', 'tab-' + d.k);
    distPanel.innerHTML = `
      <div class="dist-visual"><div class="donut" style="--v:${d.v}"><div class="donut-in"><b class="${metric.length > 7 ? 'sm' : ''}">${metric}</b><span>${t(d.k + '.ml')}</span></div></div></div>
      <div class="dist-body">
        <span class="badge badge-gold">${t(d.k + '.tag')}</span>
        <h3>${t(d.k + '.name')}</h3>
        <p>${t(d.k + '.desc')}</p>
        <ul class="checklist">${[1, 2, 3].map(n => `<li><svg class="icon"><use href="#i-check"/></svg><span>${t(d.k + '.b' + n)}</span></li>`).join('')}</ul>
      </div>`;
    if (animate) { distPanel.style.animation = 'none'; void distPanel.offsetWidth; distPanel.style.animation = ''; }
  }
  distTabs.addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (!b) return;
    distIdx = Number(b.dataset.i); renderDistricts(true);
  });
  distTabs.addEventListener('keydown', e => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    let step = keys[e.key];
    if (document.dir === 'rtl' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) step = -step;
    distIdx = (distIdx + step + DISTRICTS.length) % DISTRICTS.length;
    renderDistricts(true);
    $('#tab-' + DISTRICTS[distIdx].k).focus();
  });

  /* ------------------------------------------------ seasonality chart */
  const COAST = [18, 20, 28, 42, 60, 80, 95, 98, 78, 52, 30, 20];
  const NIGHT = [62, 64, 66, 70, 76, 84, 92, 95, 84, 74, 68, 66];
  function smoothPath(pts) {
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
    }
    return d;
  }
  function renderChart() {
    const svg = $('#season-chart');
    const L = 34, R = 590, T = 12, B = 178;
    const x = i => L + (R - L) * i / 11, y = v => B - (B - T) * v / 100;
    const mk = arr => arr.map((v, i) => [Math.round(x(i) * 10) / 10, Math.round(y(v) * 10) / 10]);
    const night = mk(NIGHT), coast = mk(COAST);
    const nightPath = smoothPath(night);
    const area = `${nightPath} L${R},${B} L${L},${B} Z`;
    const mf = new Intl.DateTimeFormat(LOCALES[lang], { month: 'short' });
    const grid = [0, 25, 50, 75, 100].map(v => `<line x1="${L}" x2="${R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.08)" stroke-dasharray="${v ? '3 5' : '0'}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" direction="ltr">${v}</text>`).join('');
    const months = Array.from({ length: 12 }, (_, i) => `<text x="${x(i)}" y="198" text-anchor="middle">${mf.format(new Date(2026, i, 1))}</text>`).join('');
    svg.innerHTML = `
      <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9b96e" stop-opacity=".32"/><stop offset="1" stop-color="#e9b96e" stop-opacity="0"/></linearGradient></defs>
      ${grid}${months}
      <path d="${area}" fill="url(#ag)"/>
      <path class="line" d="${smoothPath(coast)}" stroke="#7f8da3"/>
      <path class="line" d="${nightPath}" stroke="#e9b96e"/>
      ${night.map((p, i) => i === 0 || i === 11 ? `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="#e9b96e"/>` : '').join('')}`;
    svg.setAttribute('direction', 'ltr');
  }

  /* ------------------------------------------------ eligibility quiz */
  const quiz = { step: 0, a: [], done: false };
  const quizBody = $('#quiz-body'), quizBar = $('#quiz-bar'), quizStep = $('#quiz-step'), quizBack = $('#quiz-back');
  const QUESTIONS = [
    { q: 'quiz.q1', opts: ['quiz.b0', 'quiz.b1', 'quiz.b2', 'quiz.b3'] },
    { q: 'quiz.q2', opts: ['quiz.g1', 'quiz.g2', 'quiz.g3'] },
    { q: 'quiz.q3', opts: ['quiz.yes', 'quiz.no'] }
  ];
  function renderQuiz() {
    quizBack.style.visibility = (quiz.step === 0 && !quiz.done) ? 'hidden' : 'visible';
    if (!quiz.done) {
      const q = QUESTIONS[quiz.step];
      quizStep.textContent = t('quiz.step', { n: quiz.step + 1, m: 3 });
      quizBar.style.width = (quiz.step / 3 * 100) + '%';
      quizBody.innerHTML = `<p class="quiz-q">${t(q.q)}</p><div class="opts" role="group" aria-label="${t(q.q)}">${q.opts.map((o, i) => `<button type="button" class="opt" data-i="${i}">${t(o)}</button>`).join('')}</div>`;
      return;
    }
    const [budget, goal, days] = quiz.a;
    const tier = budget === 0 ? 'low' : budget === 1 ? 'mid' : 'high';
    const taxKey = days === 0 ? 'quiz.r.tax183' : budget === 3 ? 'quiz.r.taxhnwi' : 'quiz.r.taxnone';
    quizStep.textContent = t('quiz.badge');
    quizBar.style.width = '100%';
    quizBody.innerHTML = `<div class="quiz-res">
      <span class="badge ${tier === 'low' ? '' : 'badge-gold'}">${t('quiz.badge')}</span>
      <h4>${t('quiz.r.' + tier + '.h')}</h4>
      <p>${t('quiz.r.' + tier + '.t')}</p>
      <p class="tax-line">${t(taxKey)}</p>
      <p>${t('quiz.r.g' + (goal + 1))}</p>
      <div class="quiz-actions">
        <a class="btn btn-gold btn-sm" href="#contact">${t('quiz.cta')}</a>
        <button type="button" class="btn btn-ghost btn-sm" id="quiz-restart">${t('quiz.restart')}</button>
      </div></div>`;
  }
  quizBody.addEventListener('click', e => {
    const opt = e.target.closest('.opt');
    if (opt) {
      quiz.a[quiz.step] = Number(opt.dataset.i);
      if (quiz.step < 2) quiz.step++; else quiz.done = true;
      renderQuiz();
    } else if (e.target.closest('#quiz-restart')) {
      quiz.step = 0; quiz.a = []; quiz.done = false; renderQuiz();
    }
  });
  quizBack.addEventListener('click', () => {
    if (quiz.done) { quiz.done = false; quiz.step = 2; } else if (quiz.step > 0) quiz.step--;
    renderQuiz();
  });

  /* ------------------------------------------------ asset scorecard */
  const scoreBoxes = $$('#scorecard input');
  function renderScore() {
    const n = scoreBoxes.filter(b => b.checked).length;
    $('#score-val').textContent = `${n}/4`;
    $('#score-bar').style.width = (n * 25) + '%';
    const v = $('#score-verdict');
    v.textContent = t('risk.v' + n);
    v.classList.toggle('bad', n <= 1);
  }
  scoreBoxes.forEach(b => b.addEventListener('change', renderScore));

  /* ------------------------------------------------ why Batumi: balance scale */
  let whyMode = 'std';
  const WHY = {
    std:   { exp: 85, expL: 'why.m.high', cf: 55, cfL: 'why.m.mod' },
    brand: { exp: 25, expL: 'why.m.low',  cf: 90, cfL: 'why.m.str' }
  };
  function renderWhy() {
    const m = WHY[whyMode];
    $('#balance').dataset.mode = whyMode;
    $$('#why-mode .pill').forEach(p => {
      const on = p.dataset.v === whyMode;
      p.classList.toggle('is-on', on);
      p.setAttribute('aria-pressed', String(on));
    });
    $('#why-verdict').textContent = t('why.v.' + whyMode);
    $('#scale-cap').textContent = t('why.bal.adv') + ' / ' + t('why.bal.risk') + ': ' + t('why.v.' + whyMode);
    $('#m-exp-val').textContent = t(m.expL);
    $('#m-cf-val').textContent = t(m.cfL);
    $('#m-exp-bar').style.setProperty('--w', m.exp + '%');
    $('#m-cf-bar').style.setProperty('--w', m.cf + '%');
  }
  $('#why-mode').addEventListener('click', e => {
    const b = e.target.closest('.pill'); if (!b) return;
    whyMode = b.dataset.v; renderWhy();
  });

  /* ------------------------------------------------ project comparison */
  const PROJECTS = [
    { n: 'p_azure', h: 'turnkey', d: 'old', y: 5.5, isPartner: true },
    { n: 'p1', h: 'turnkey', d: 'new', y: 6.0 },
    { n: 'p2', h: 'turnkey', d: 'new', y: 6.5 },
    { n: 'p5', h: 'white',   d: 'hero', y: 6.8 },
    { n: 'p3', h: 'turnkey', d: 'old', y: 7.0 },
    { n: 'p6', h: 'white',   d: 'hero', y: 7.2 },
    { n: 'p4', h: 'white',   d: 'old', y: 7.5 }
  ];
  const cmpFilter = { h: 'all', d: 'all' };
  function renderCompare() {
    const list = PROJECTS.filter(p => (cmpFilter.h === 'all' || p.h === cmpFilter.h) && (cmpFilter.d === 'all' || p.d === cmpFilter.d));
    $('#cmp-list').innerHTML = list.length ? list.map((p, i) => {
      const pos = Math.max(0, Math.min(100, (p.y - 5) / 3 * 100)).toFixed(1) + '%';
      const partnerBadge = p.isPartner ? `<span class="badge badge-gold" style="font-size:.7rem;padding:2px 8px;margin-inline-start:6px;">★ ${t('azure.cmp.badge') || 'Yetkili Satış Acentesi'}</span>` : '';
      return `<li class="cmp-row ${p.isPartner ? 'is-partner-row' : ''}" style="animation-delay:${i * 60}ms">
        <div class="cmp-info"><b>${t(p.n)}${partnerBadge}</b><div class="cmp-tags"><span class="t-${p.h}">${t(p.h === 'white' ? 'cmp.white' : 'cmp.turnkey')}</span><span>${t('cmp.d.' + p.d)}</span></div></div>
        <div class="cmp-track" role="img" aria-label="${t(p.n)}: ${num(p.y)} ${t('cmp.years')}"><i class="cmp-fill" style="--w:${pos}"></i><span class="cmp-val ltr" style="--w:${pos}">${num(p.y)}</span></div>
      </li>`;
    }).join('') : `<li class="cmp-empty">${t('cmp.empty')}</li>`;
  }
  $('#f-handover').addEventListener('click', e => {
    const b = e.target.closest('.pill'); if (!b) return;
    cmpFilter.h = b.dataset.v;
    $$('#f-handover .pill').forEach(p => p.classList.toggle('is-on', p === b));
    renderCompare();
  });
  $('#f-district').addEventListener('change', e => { cmpFilter.d = e.target.value; renderCompare(); });

  /* ------------------------------------------------ downloads */
  function download(name, text, mime) {
    const blob = new Blob(['\ufeff' + text], { type: mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  const line = (k, v) => `• ${k}: ${v}`;
  const BUILD = {
    brief() {
      const out = [t('brief.title'), new Date().toLocaleDateString(LOCALES[lang]), '', '== ' + t('brief.kpi') + ' ==',
        line(t('hero.s1'), '7.1–7.4%'), line(t('hero.s2'), '3.0–4.0%'), line(t('hero.s3'), '5%'), line(t('hero.s4'), '0%'),
        line(t('market.israel'), '13–14%'), line(t('market.eu'), '≈13%'),
        line(t('a1.t'), '$1.016–1.3B'), line(t('a2.t'), '52–70%'), '',
        '== ' + t('dist.title') + ' ==',
        line(t('d1.name'), `${t('d1.metric')} ${t('d1.ml')}`), line(t('d2.name'), `${t('d2.metric')} ${t('d2.ml')}`), line(t('d3.name'), `${t('d3.metric')} ${t('d3.ml')}`), '',
        '== ' + t('cas.title') + ' ==',
        line(t('cas.tbilisi'), '5,000,000 GEL'), line(t('cas.batumi'), '250,000 GEL (~$90k)'), line(t('cas.adr'), '$35–$75+'), '',
        '== ' + t('leg.title') + ' ==',
        line(t('leg.t1.title'), '$150,000'), line(t('leg.t2.title'), '$300,000+'), '',
        '== ' + t('risk.title') + ' ==',
        line(t('risk.supply.label'), '58,000'), t('risk.strat.text'), '',
        t('rep.src'), t('ft.disc')];
      return out.join('\r\n');
    },
    checklist() {
      const out = [t('check.title'), '', '== ' + t('leg.title') + ' ==',
        `[ ] ${t('leg.t1.title')} — $150,000 — ${t('leg.t1.text')}`,
        `[ ] ${t('leg.t2.title')} — $300,000+ — ${t('leg.t2.text')}`, '',
        '== ' + t('leg.tax.title') + ' ==',
        `[ ] ${t('tx1.t')} — 5% — ${t('tx1.d')}`, `[ ] ${t('tx2.t')} — 0% — ${t('tx2.d')}`,
        `[ ] ${t('tx3.t')} — 0% — ${t('tx3.d')}`, `[ ] ${t('tx4.t')} — ${t('tx4.big')} — ${t('tx4.d')}`, '',
        '== ' + t('leg.tr.title') + ' ==',
        `[ ] ${t('leg.tr.a')} — ${t('leg.tr.a.t')}`, `[ ] ${t('leg.tr.b')} — ${t('leg.tr.b.t')}`, '', t('ft.disc')];
      return out.join('\r\n');
    },
    roi() {
      const r = roiState, q = s => '"' + String(s).replace(/"/g, '""') + '"';
      const rows = [[t('roi.csv.title'), ''],
        [t('roi.price'), r.price], [t('roi.occ') + ' %', r.occ], [t('roi.mgmt') + ' %', r.mgmt],
        [t('roi.agency'), r.agencyOn ? MODEL.agency + '%' : '0%'], [t('roi.opex') + ' %', r.opex],
        [t('roi.gross.yield') + ' %', r.grossYield.toFixed(2)], [t('roi.res.gross'), r.gross.toFixed(0)],
        ...r.items.map(i => [t(i.key), '-' + i.v.toFixed(0)]),
        [t('roi.res.net'), r.net.toFixed(0)], [t('roi.net.yield') + ' %', r.netYield.toFixed(2)],
        [t('roi.payback') + ' (' + t('roi.yrs') + ')', r.net > 0 ? (r.price / r.net).toFixed(1) : ''],
        [t('roi.assump'), '']];
      return rows.map(([a, b]) => q(a) + ',' + q(b)).join('\r\n');
    }
  };
  $$('[data-dl]').forEach(btn => btn.addEventListener('click', () => {
    const k = btn.dataset.dl;
    if (k === 'roi') download(`investbatumi-roi-${lang}.csv`, BUILD.roi(), 'text/csv');
    else download(`investbatumi-${k}-${lang}.txt`, BUILD[k](), 'text/plain');
  }));

  /* ------------------------------------------------ contact form */
  const form = $('#contact-form'), status = $('#ct-status');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    status.classList.remove('err');
    if (!form.name.value.trim() || !form.email.checkValidity() || !form.email.value) {
      status.textContent = t('ct.err'); status.classList.add('err'); return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    data.lang = lang;
    try {
      if (FORM_ENDPOINT) {
        const res = await fetch(FORM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
        if (!res.ok) throw new Error('bad status');
      }
      status.textContent = t('ct.ok'); form.reset();
    } catch (err) {
      status.textContent = t('ct.err'); status.classList.add('err');
    }
  });

  /* ------------------------------------------------ reveal / count-up / scrollspy */
  let supplyShown = 0;
  const supplyEl = $('#supply-num');
  function renderSupply(v) { supplyShown = v; supplyEl.textContent = nf({ maximumFractionDigits: 0 }).format(Math.round(v)); }

  function countUp(el, to) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return renderSupply(to);
    const t0 = performance.now(), dur = 1800;
    (function frame(now) {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      renderSupply(to * e);
      if (p < 1) requestAnimationFrame(frame);
    })(t0);
  }

  $$('.reveal').forEach(el => {
    const sibs = Array.from(el.parentElement.children).filter(c => c.classList.contains('reveal'));
    el.style.setProperty('--d', (sibs.indexOf(el) % 4) * 90 + 'ms');
  });
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      if (en.target.contains(supplyEl) && !supplyEl.dataset.done) { supplyEl.dataset.done = '1'; countUp(supplyEl, 58000); }
      io.unobserve(en.target);
    });
  }, { threshold: .15, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal, #season-chart').forEach(el => io.observe(el));

  const links = $$('.main-nav a');
  const spy = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach(a => { const s = $(a.getAttribute('href')); if (s) spy.observe(s); });

  /* ------------------------------------------------ azure tower interactivity */
  const azVideo = $('#azure-video-player');
  const azPlayBtn = $('#azure-video-toggle');
  const azSoundBtn = $('#azure-video-sound');

  if (azVideo && azPlayBtn) {
    const playIcon = azPlayBtn.querySelector('.play-icon');
    const pauseIcon = azPlayBtn.querySelector('.pause-icon');

    azPlayBtn.addEventListener('click', () => {
      if (azVideo.paused) {
        azVideo.play();
        if (playIcon) playIcon.classList.add('is-hidden');
        if (pauseIcon) pauseIcon.classList.remove('is-hidden');
      } else {
        azVideo.pause();
        if (playIcon) playIcon.classList.remove('is-hidden');
        if (pauseIcon) pauseIcon.classList.add('is-hidden');
      }
    });

    if (azSoundBtn) {
      const mutedIcon = azSoundBtn.querySelector('.muted-icon');
      const soundIcon = azSoundBtn.querySelector('.sound-icon');
      azSoundBtn.addEventListener('click', () => {
        azVideo.muted = !azVideo.muted;
        if (mutedIcon) mutedIcon.classList.toggle('is-hidden', !azVideo.muted);
        if (soundIcon) soundIcon.classList.toggle('is-hidden', azVideo.muted);
      });
    }
  }

  // Floor plan tabs
  const planTabs = $$('.plan-tab-btn');
  const planPanels = $$('.azure-plan-panel');
  planTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.plan;
      planTabs.forEach(b => {
        const isSelected = b === btn;
        b.classList.toggle('is-active', isSelected);
        b.setAttribute('aria-selected', String(isSelected));
      });
      planPanels.forEach(panel => {
        const match = panel.id === 'plan-panel-' + target;
        panel.classList.toggle('is-hidden-panel', !match);
        panel.classList.toggle('is-active', match);
      });
    });
  });

  // Plan contact buttons prefill (supports localized data-msg-key)
  $$('.plan-contact-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const msg = btn.dataset.msgKey ? t(btn.dataset.msgKey) : btn.dataset.targetMsg;
      const interest = btn.dataset.targetInterest || 'azure';
      const intSelect = $('#ct-interest');
      const msgField = $('#ct-msg');
      if (intSelect) intSelect.value = interest;
      if (msgField && msg) msgField.value = msg;
    });
  });

  // Quick load Azure Tower in ROI Calculator
  function loadAzureRoi() {
    roiEls.priceNum.value = '114000';
    roiEls.price.value = '114000';
    roiEls.occ.value = '65';
    roiEls.agency.checked = true;
    roiEls.opex.value = '12';
    const mgmt20 = $('input[name="mgmt"][value="20"]');
    if (mgmt20) mgmt20.checked = true;
    renderRoi();
    const roiSec = $('#roi');
    if (roiSec) roiSec.scrollIntoView({ behavior: 'smooth' });
  }

  const loadAzureBtn = $('#btn-load-azure');
  if (loadAzureBtn) loadAzureBtn.addEventListener('click', loadAzureRoi);
  const loadAzureBtn2 = $('#azure-load-roi-btn');
  if (loadAzureBtn2) loadAzureBtn2.addEventListener('click', loadAzureRoi);

  /* ------------------------------------------------ azure drone 360 album (2s rotation) */
  (function initDroneAlbum() {
    const stage = $('#drone-stage');
    const imgEl = $('#drone-slide-img');
    const idxEl = $('#drone-active-idx');
    const captionEl = $('#drone-slide-caption');
    const prevBtn = $('#drone-prev');
    const nextBtn = $('#drone-next');
    const playToggleBtn = $('#drone-play-toggle');
    const progressBar = $('#drone-progress-bar');
    const thumbsTrack = $('#drone-thumbs-track');
    const fullscreenBtn = $('#drone-fullscreen-btn');
    const lightbox = $('#drone-lightbox');
    const lightboxImg = $('#drone-lightbox-img');
    const lightboxIdx = $('#drone-lightbox-idx');
    const lightboxClose = $('#drone-lightbox-close');
    const lightboxPrev = $('#drone-lightbox-prev');
    const lightboxNext = $('#drone-lightbox-next');

    if (!stage || !imgEl || !thumbsTrack) return;

    const TOTAL_SLIDES = 24;
    const INTERVAL_MS = 2000; // 2 seconds per slide as requested!
    let currentIndex = 0;
    let isPlaying = true;
    let progressStartTime = 0;
    let animFrameId = null;

    // Compact metadata for the 24 drone shots
    const slides = Array.from({ length: TOTAL_SLIDES }, (_, i) => {
      const num = String(i + 1).padStart(2, '0');
      return {
        id: i + 1,
        src: `assets/azure/drone/drone-${num}.jpg`,
        thumb: `assets/azure/drone/thumbs/thumb-${num}.jpg`,
        caption: 'Azure Tower'
      };
    });

    // Populate thumbnails
    const frag = document.createDocumentFragment();
    slides.forEach((slide, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'album-thumb-btn' + (i === 0 ? ' active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-label', `Fotoğraf ${i + 1}`);
      btn.innerHTML = `<img src="${slide.thumb}" alt="Azure Tower Drone ${i + 1}" loading="lazy">`;
      btn.addEventListener('click', () => {
        goToSlide(i);
        restartTimer();
      });
      frag.appendChild(btn);
    });
    thumbsTrack.appendChild(frag);

    const thumbBtns = thumbsTrack.querySelectorAll('.album-thumb-btn');

    // Preload helper
    const preloaded = new Set();
    function preloadAhead(index) {
      for (let offset = 1; offset <= 3; offset++) {
        const nextI = (index + offset) % TOTAL_SLIDES;
        if (!preloaded.has(nextI)) {
          const img = new Image();
          img.src = slides[nextI].src;
          preloaded.add(nextI);
        }
      }
    }

    function updateProgressBar(progress) {
      if (progressBar) {
        progressBar.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
      }
    }

    function animateProgress(timestamp) {
      if (!isPlaying) return;
      if (!progressStartTime) progressStartTime = timestamp;
      const elapsed = timestamp - progressStartTime;
      const progress = elapsed / INTERVAL_MS;

      if (progress >= 1) {
        updateProgressBar(1);
        goToSlide((currentIndex + 1) % TOTAL_SLIDES);
        progressStartTime = performance.now();
        animFrameId = requestAnimationFrame(animateProgress);
      } else {
        updateProgressBar(progress);
        animFrameId = requestAnimationFrame(animateProgress);
      }
    }

    function goToSlide(newIndex) {
      currentIndex = (newIndex + TOTAL_SLIDES) % TOTAL_SLIDES;
      const slide = slides[currentIndex];

      // Smooth fade transition
      imgEl.style.opacity = '0.3';
      imgEl.classList.remove('animating');
      
      const newImg = new Image();
      newImg.src = slide.src;
      newImg.onload = () => {
        imgEl.src = slide.src;
        imgEl.alt = slide.caption;
        imgEl.style.opacity = '1';
        setTimeout(() => imgEl.classList.add('animating'), 20);
      };

      if (idxEl) idxEl.textContent = String(currentIndex + 1).padStart(2, '0');
      if (captionEl) captionEl.textContent = t('azure.album.cap');

      // Update active thumbnail & scroll ONLY the horizontal track (never scroll window/page!)
      thumbBtns.forEach((btn, i) => {
        const isActive = i === currentIndex;
        btn.classList.toggle('active', isActive);
        if (isActive && thumbsTrack) {
          const targetLeft = btn.offsetLeft - (thumbsTrack.clientWidth - btn.clientWidth) / 2;
          thumbsTrack.scrollTo({ left: targetLeft, behavior: 'smooth' });
        }
      });

      // Update lightbox if open
      if (lightbox && lightbox.classList.contains('open') && lightboxImg) {
        lightboxImg.src = slide.src;
        if (lightboxIdx) lightboxIdx.textContent = `${String(currentIndex + 1).padStart(2, '0')} / ${TOTAL_SLIDES}`;
      }

      preloadAhead(currentIndex);
    }

    function startTimer() {
      if (!isPlaying) return;
      progressStartTime = performance.now();
      cancelAnimationFrame(animFrameId);
      animFrameId = requestAnimationFrame(animateProgress);
      updatePlayButtonUI();
    }

    function stopTimer() {
      cancelAnimationFrame(animFrameId);
      progressStartTime = 0;
      updatePlayButtonUI();
    }

    function restartTimer() {
      progressStartTime = performance.now();
      if (isPlaying) {
        cancelAnimationFrame(animFrameId);
        animFrameId = requestAnimationFrame(animateProgress);
      }
    }

    function updatePlayButtonUI() {
      if (!playToggleBtn) return;
      const pauseIcon = playToggleBtn.querySelector('.pause-icon');
      const playIcon = playToggleBtn.querySelector('.play-icon');
      if (pauseIcon) pauseIcon.classList.toggle('is-hidden', !isPlaying);
      if (playIcon) playIcon.classList.toggle('is-hidden', isPlaying);
    }

    // Controls
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        goToSlide(currentIndex - 1);
        restartTimer();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        goToSlide(currentIndex + 1);
        restartTimer();
      });
    }

    if (playToggleBtn) {
      playToggleBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        if (isPlaying) {
          startTimer();
        } else {
          stopTimer();
        }
      });
    }

    // Pause on hover over main viewport so user can inspect details
    stage.addEventListener('mouseenter', () => {
      if (isPlaying) cancelAnimationFrame(animFrameId);
    });

    stage.addEventListener('mouseleave', () => {
      if (isPlaying) {
        progressStartTime = performance.now();
        animFrameId = requestAnimationFrame(animateProgress);
      }
    });

    // Keyboard navigation when stage is focused
    stage.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        goToSlide(currentIndex - 1);
        restartTimer();
      } else if (e.key === 'ArrowRight') {
        goToSlide(currentIndex + 1);
        restartTimer();
      } else if (e.key === ' ') {
        e.preventDefault();
        playToggleBtn.click();
      }
    });

    // Lightbox modal logic
    if (fullscreenBtn && lightbox) {
      fullscreenBtn.addEventListener('click', () => {
        lightbox.classList.add('open');
        lightboxImg.src = slides[currentIndex].src;
        if (lightboxIdx) lightboxIdx.textContent = `${String(currentIndex + 1).padStart(2, '0')} / ${TOTAL_SLIDES}`;
      });

      if (lightboxClose) {
        lightboxClose.addEventListener('click', () => lightbox.classList.remove('open'));
      }

      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) lightbox.classList.remove('open');
      });

      if (lightboxPrev) {
        lightboxPrev.addEventListener('click', (e) => {
          e.stopPropagation();
          goToSlide(currentIndex - 1);
          restartTimer();
        });
      }

      if (lightboxNext) {
        lightboxNext.addEventListener('click', (e) => {
          e.stopPropagation();
          goToSlide(currentIndex + 1);
          restartTimer();
        });
      }

      window.addEventListener('keydown', (e) => {
        if (lightbox.classList.contains('open')) {
          if (e.key === 'Escape') lightbox.classList.remove('open');
          if (e.key === 'ArrowLeft') { goToSlide(currentIndex - 1); restartTimer(); }
          if (e.key === 'ArrowRight') { goToSlide(currentIndex + 1); restartTimer(); }
        }
      });
    }

    // Pause auto-rotation when the album is not in the viewport
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            if (isPlaying) restartTimer();
          } else {
            cancelAnimationFrame(animFrameId);
          }
        });
      }, { threshold: 0.1 });
      observer.observe(stage);
    }

    // Initial preloading & start
    preloadAhead(0);
    startTimer();
  })();

  /* ------------------------------------------------ boot */
  setLang(detectLang(), false);
})();
