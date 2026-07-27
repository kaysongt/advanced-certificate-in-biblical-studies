/* KingsWord Training Institute — course interactions */
(function () {
  'use strict';

  var KEY = 'kti.progress.v1';
  var TKEY = 'kti.theme';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  }

  /* ---------- theme ---------- */

  function initTheme() {
    var btn = document.querySelector('.themetoggle');
    if (!btn) return;
    var stored = null;
    try { stored = localStorage.getItem(TKEY); } catch (e) {}
    if (stored) document.documentElement.setAttribute('data-theme', stored);
    function label() {
      var cur = document.documentElement.getAttribute('data-theme');
      if (!cur) {
        cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      btn.textContent = cur === 'dark' ? 'Light' : 'Dark';
    }
    label();
    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      if (!cur) {
        cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(TKEY, next); } catch (e) {}
      label();
    });
  }

  /* ---------- quiz ---------- */

  function initQuiz(quiz) {
    var qs = Array.prototype.slice.call(quiz.querySelectorAll('.q'));
    var total = qs.length;
    var scoreEl = quiz.querySelector('.score');
    var verdictEl = quiz.querySelector('.verdict');
    var resetBtn = quiz.querySelector('.reset');
    var id = quiz.getAttribute('data-quiz');
    var answered = 0, correct = 0;

    function paint() {
      if (scoreEl) scoreEl.textContent = answered + ' of ' + total + ' answered';
      if (answered === total && verdictEl) {
        var pct = Math.round((correct / total) * 100);
        verdictEl.textContent = correct + ' of ' + total + ' correct (' + pct + '%). ' +
          (pct >= 70 ? 'Pass.' : 'Review the lesson and try again.');
        verdictEl.className = 'verdict ' + (pct >= 70 ? 'pass' : 'fail');
        if (id) {
          var d = load();
          d.quiz = d.quiz || {};
          d.quiz[id] = { correct: correct, total: total };
          save(d);
        }
      }
    }

    qs.forEach(function (q) {
      var opts = Array.prototype.slice.call(q.querySelectorAll('.opt'));
      var why = q.querySelector('.why');
      opts.forEach(function (opt) {
        opt.addEventListener('click', function () {
          if (q.getAttribute('data-done')) return;
          q.setAttribute('data-done', '1');
          var isRight = opt.getAttribute('data-correct') === '1';
          answered++;
          if (isRight) correct++;
          opts.forEach(function (o) {
            o.disabled = true;
            if (o.getAttribute('data-correct') === '1') o.classList.add('right');
            else if (o === opt) o.classList.add('wrong');
            else o.classList.add('dim');
          });
          if (why) why.classList.add('show');
          paint();
        });
      });
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        answered = 0; correct = 0;
        qs.forEach(function (q) {
          q.removeAttribute('data-done');
          var why = q.querySelector('.why');
          if (why) why.classList.remove('show');
          q.querySelectorAll('.opt').forEach(function (o) {
            o.disabled = false;
            o.classList.remove('right', 'wrong', 'dim');
          });
        });
        if (verdictEl) { verdictEl.textContent = ''; verdictEl.className = 'verdict'; }
        paint();
      });
    }
    paint();
  }

  /* ---------- lesson completion ---------- */

  function initDone() {
    var strip = document.querySelector('.done-strip');
    if (!strip) return;
    var id = strip.getAttribute('data-lesson');
    var btn = strip.querySelector('button');
    var txt = strip.querySelector('.txt');

    function paint() {
      var d = load();
      var done = d.done && d.done[id];
      strip.classList.toggle('is-done', !!done);
      txt.textContent = done ? 'Lesson complete.' : 'Mark this lesson complete when you have finished the reading and the quiz.';
      btn.textContent = done ? 'Undo' : 'Mark complete';
      btn.className = done ? 'btn' : 'btn primary';
    }
    btn.addEventListener('click', function () {
      var d = load();
      d.done = d.done || {};
      if (d.done[id]) delete d.done[id]; else d.done[id] = 1;
      save(d);
      paint();
    });
    paint();
  }

  /* ---------- progress rings and lesson bar state ---------- */

  function initProgress() {
    var d = load();
    var done = d.done || {};

    document.querySelectorAll('[data-progress]').forEach(function (el) {
      var ids = (el.getAttribute('data-progress') || '').split(',').filter(Boolean);
      if (!ids.length) return;
      var n = ids.filter(function (i) { return done[i]; }).length;
      var pct = Math.round((n / ids.length) * 100);

      var ring = el.querySelector('.ring');
      if (ring) {
        var fg = ring.querySelector('.fg');
        var lbl = ring.querySelector('.lbl');
        if (fg) {
          var r = fg.r.baseVal.value;
          var c = 2 * Math.PI * r;
          fg.style.strokeDasharray = c;
          fg.style.strokeDashoffset = c * (1 - n / ids.length);
        }
        if (lbl) lbl.textContent = pct + '%';
      }
      var meter = el.querySelector('.meter > i');
      if (meter) meter.style.width = pct + '%';
      var cnt = el.querySelector('[data-count]');
      if (cnt) cnt.textContent = n + ' of ' + ids.length + ' complete';
    });

    document.querySelectorAll('.lessonbar a[data-lid]').forEach(function (a) {
      if (done[a.getAttribute('data-lid')]) a.classList.add('done');
    });
  }

  /* ---------- rail scrollspy ---------- */

  function initRail() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.rail ol a[href^="#"]'));
    if (!links.length) return;
    var targets = links.map(function (a) {
      return document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
    });
    function spy() {
      var best = 0;
      for (var i = 0; i < targets.length; i++) {
        if (targets[i] && targets[i].getBoundingClientRect().top <= 120) best = i;
      }
      links.forEach(function (a, i) { a.classList.toggle('active', i === best); });
    }
    var tick = false;
    window.addEventListener('scroll', function () {
      if (tick) return;
      tick = true;
      requestAnimationFrame(function () { spy(); tick = false; });
    }, { passive: true });
    spy();
  }

  /* ---------- go ---------- */

  function boot() {
    initTheme();
    document.querySelectorAll('.quiz').forEach(initQuiz);
    initDone();
    initProgress();
    initRail();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
