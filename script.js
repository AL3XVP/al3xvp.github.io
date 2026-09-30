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

  /* ---------- scroll spy (active nav link) ---------- */
  const navLinks = document.querySelectorAll('.nav-link');
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((l) =>
        l.classList.toggle('active', l.getAttribute('href') === '#' + entry.target.id)
      );
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['home', 'about', 'work', 'contact']
    .map((id) => document.getElementById(id))
    .filter(Boolean)
    .forEach((s) => spy.observe(s));

  /* ---------- hero parallax (core drifts slower than the page) ---------- */
  const heroCanvas = document.getElementById('energyCore');
  if (heroCanvas && !prefersReduced) {
    let ticking = false;
    const updateHero = () => {
      const y = window.scrollY;
      if (y <= window.innerHeight) heroCanvas.style.transform = `translateY(${y * 0.35}px)`;
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(updateHero); }
    }, { passive: true });
    updateHero();
  }

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
})();
