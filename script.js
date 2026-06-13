/* =========================================================
   Alexander Phan — Portfolio interactions
   ========================================================= */
(function () {
  'use strict';
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- year ---------- */
  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- nav: scrolled state ---------- */
  const nav = document.getElementById('nav');
  const onScrollNav = () => nav.classList.toggle('scrolled', window.scrollY > 24);
  onScrollNav();
  window.addEventListener('scroll', onScrollNav, { passive: true });

  /* ---------- scroll progress bar ---------- */
  const progress = document.querySelector('.scroll-progress span');
  const onProgress = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    progress.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
  };
  onProgress();
  window.addEventListener('scroll', onProgress, { passive: true });

  /* ---------- mobile menu ---------- */
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  const toggleMenu = (open) => {
    const willOpen = open ?? !mobileMenu.classList.contains('open');
    mobileMenu.classList.toggle('open', willOpen);
    hamburger.setAttribute('aria-expanded', String(willOpen));
  };
  hamburger.addEventListener('click', () => toggleMenu());
  mobileMenu.querySelectorAll('.m-link').forEach((a) =>
    a.addEventListener('click', () => toggleMenu(false))
  );

  /* ---------- cursor glow ---------- */
  const glow = document.querySelector('.cursor-glow');
  if (!prefersReduced && window.matchMedia('(pointer:fine)').matches) {
    let gx = 0, gy = 0, cx = 0, cy = 0;
    window.addEventListener('mousemove', (e) => {
      gx = e.clientX; gy = e.clientY; glow.style.opacity = '1';
    });
    (function trail() {
      cx += (gx - cx) * 0.12; cy += (gy - cy) * 0.12;
      glow.style.transform = `translate(${cx}px, ${cy}px)`;
      requestAnimationFrame(trail);
    })();
  }

  /* ---------- typewriter ---------- */
  const roles = [
    'Computer Science Student',
    'Full-Stack Developer',
    'Next.js & React Builder',
    'Problem Solver',
  ];
  const twEl = document.getElementById('typewriter');
  if (twEl) {
    let r = 0, c = 0, deleting = false;
    const tick = () => {
      const word = roles[r];
      twEl.textContent = word.slice(0, c);
      if (!deleting && c < word.length) { c++; setTimeout(tick, 70); }
      else if (!deleting && c === word.length) { deleting = true; setTimeout(tick, 1500); }
      else if (deleting && c > 0) { c--; setTimeout(tick, 35); }
      else { deleting = false; r = (r + 1) % roles.length; setTimeout(tick, 350); }
    };
    tick();
  }

  /* ---------- reveal on scroll + stagger ---------- */
  document.querySelectorAll('[data-stagger]').forEach((group) => {
    Array.from(group.children).forEach((child, i) => {
      child.style.transition = 'opacity .7s var(--ease), transform .7s var(--ease)';
      child.style.transitionDelay = (i * 0.06) + 's';
      child.style.opacity = '0';
      child.style.transform = 'translateY(28px)';
    });
  });

  const revealObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const delay = parseInt(el.dataset.delay || '0', 10);
      setTimeout(() => {
        el.classList.add('in-view');
        if (el.hasAttribute('data-stagger')) {
          Array.from(el.children).forEach((c) => { c.style.opacity = '1'; c.style.transform = 'none'; });
        }
        if (el.querySelector && el.querySelector('[data-count]')) startCounters(el);
      }, delay);
      obs.unobserve(el);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

  /* ---------- animated counters ---------- */
  function startCounters(scope) {
    scope.querySelectorAll('[data-count]').forEach((el) => {
      if (el.dataset.done) return;
      el.dataset.done = '1';
      const target = parseFloat(el.dataset.count);
      const decimals = parseInt(el.dataset.decimals || '0', 10);
      const suffix = el.dataset.suffix || '';
      const dur = 1500;
      const start = performance.now();
      const step = (now) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (target * eased).toFixed(decimals) + (p === 1 ? suffix : '');
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = target.toFixed(decimals) + suffix;
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- scroll spy (active nav link) ---------- */
  const sections = ['home', 'about', 'work', 'contact']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const navLinks = document.querySelectorAll('.nav-link');
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((l) =>
        l.classList.toggle('active', l.getAttribute('href') === '#' + entry.target.id)
      );
    });
  }, { threshold: 0.5 });
  sections.forEach((s) => spy.observe(s));

  /* ---------- build pseudo-QR for the attendance mock ---------- */
  (function buildQr() {
    const qr = document.getElementById('mockQr');
    if (!qr) return;
    const N = 11;
    const finder = (r, c) =>
      (r < 3 && c < 3) || (r < 3 && c > N - 4) || (r > N - 4 && c < 3);
    const ring = (r, c) => {
      const inSet = (r < 3 && c < 3) ? (r === 0 || r === 2 || c === 0 || c === 2 || (r === 1 && c === 1))
        : finder(r, c);
      return inSet;
    };
    // deterministic pattern
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const cell = document.createElement('span');
        let on = false;
        if (finder(r, c)) on = ring(r, c);
        else on = rand() > 0.52;
        if (!on) cell.style.background = 'transparent';
        qr.appendChild(cell);
      }
    }
  })();

  /* ---------- particle network (hero) ---------- */
  (function particles() {
    const canvas = document.getElementById('particles');
    if (!canvas || prefersReduced) return;
    const ctx = canvas.getContext('2d');
    let w, h, pts, raf;
    const COUNT = () => Math.min(70, Math.floor(window.innerWidth / 20));

    function resize() {
      const hero = canvas.parentElement;
      w = canvas.width = hero.offsetWidth;
      h = canvas.height = hero.offsetHeight;
    }
    function init() {
      resize();
      pts = Array.from({ length: COUNT() }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.45, vy: (Math.random() - 0.5) * 0.45,
      }));
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(124,92,255,.65)';
        ctx.fill();
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j];
          const dx = p.x - q.x, dy = p.y - q.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 130) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(124,92,255,${0.16 * (1 - dist / 130)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }
    init();
    draw();
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => { cancelAnimationFrame(raf); init(); draw(); }, 200);
    });
  })();

  /* ---------- copy-to-clipboard cards ---------- */
  const toast = document.getElementById('toast');
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch {}
        document.body.removeChild(ta);
      }
      showToast('Copied: ' + text);
    });
  });

  /* ---------- contact form -> mailto ---------- */
  const form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('cf-name').value.trim();
      const email = document.getElementById('cf-email').value.trim();
      const msg = document.getElementById('cf-msg').value.trim();
      const subject = encodeURIComponent(`Portfolio message from ${name}`);
      const body = encodeURIComponent(`${msg}\n\n— ${name}\n${email}`);
      window.location.href = `mailto:aalexanderphan@gmail.com?subject=${subject}&body=${body}`;
      showToast('Opening your email app…');
      form.reset();
    });
  }
})();
