/* =====================================================================
   Kona SDA — JavaScript del sitio (js/main.js)
   Se carga al final del <body> en todas las páginas. Cada bloque comprueba
   que sus elementos existen, así que solo actúa en las páginas que lo usan.
     1. Menú móvil y submenú "About Us"          (todas)
     2. Hero: secuencia (escritorio) o video     (index)
     3. Menú fijo en escritorio — home           (index)
     4. Menú fijo en escritorio — interiores     (about-us, our-beliefs, meet-our-pastor, contact, events)
     5. Parallax de imágenes de fondo            (index, contact)
     6. Calendario: vista de mes o de agenda     (events)
   ===================================================================== */

// ---------- Utilidades compartidas ----------
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DESKTOP = matchMedia('(min-width: 900px)');
// Hero del home: escritorio con ratón → secuencia con scroll; móvil y tableta → video (igual que en el CSS)
const SCROLL_HERO = matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches;
// Ahorro de datos activado en el navegador: solo la imagen fija
const SAVE_DATA = !!(navigator.connection && navigator.connection.saveData);

// Ejecuta fn como máximo una vez por fotograma al hacer scroll o cambiar el tamaño.
// Devuelve la función para pedir una actualización manualmente.
function onScrollFrame(fn, media) {
  let ticking = false;
  const request = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; fn(); });
  };
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  if (media) media.addEventListener('change', request);
  return request;
}

// Menú fijo en escritorio: añade .nav--stuck cuando shouldStick() es verdadero.
// onChange(on) se llama justo antes de cambiar la clase (para ajustes extra).
function stickyNav(nav, shouldStick, onChange) {
  let stuck = false;
  const check = () => {
    const on = DESKTOP.matches && shouldStick();
    if (on === stuck) return;
    stuck = on;
    if (onChange) onChange(on);
    nav.classList.toggle('nav--stuck', on);
  };
  onScrollFrame(check, DESKTOP);
  check();
}

// ---------- Menú móvil (todas las páginas) ----------
(() => {
  const menu = document.getElementById('menu');
  if (!menu) return;
  const openBtn = document.querySelector('.nav .nav__toggle');
  const closeBtn = menu.querySelector('[data-close]');
  // Con el menú abierto, el resto de la página queda inactivo (inert): el teclado no puede salir del menú
  const setPageInert = (on) => {
    [...document.body.children].forEach(el => { if (el !== menu && el.tagName !== 'SCRIPT') el.inert = on; });
  };
  const setMenu = (open) => {
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    openBtn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
    setPageInert(open);
    (open ? closeBtn : openBtn).focus();
  };
  // Respaldo para navegadores sin "inert": Tab y Shift+Tab dan la vuelta dentro del menú
  menu.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !menu.classList.contains('is-open')) return;
    const items = [...menu.querySelectorAll('a, button')].filter(el => el.offsetParent !== null);
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  openBtn.addEventListener('click', () => setMenu(true));
  closeBtn.addEventListener('click', () => setMenu(false));
  menu.querySelectorAll('a:not([data-submenu-toggle])').forEach(a => a.addEventListener('click', () => setMenu(false)));

  // Submenú "About Us" en el menú móvil: tocar ABOUT US lo abre o lo cierra
  menu.querySelectorAll('[data-submenu-toggle]').forEach(t => t.addEventListener('click', e => {
    e.preventDefault();
    const open = t.parentElement.classList.toggle('is-open');
    t.setAttribute('aria-expanded', String(open));
  }));
  // Si la página actual está dentro del submenú (Who We Are / Meet Our Pastor), mostrarlo ya abierto
  menu.querySelectorAll('[data-submenu-toggle]').forEach(t => {
    if (t.parentElement.querySelector('[aria-current="page"]')) {
      t.parentElement.classList.add('is-open');
      t.setAttribute('aria-expanded', 'true');
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('is-open')) setMenu(false); });
})();

// ---------- Hero del home (index.html) ----------
// Móvil y tableta: video en bucle, vertical u horizontal según la pantalla; se pausa fuera de la vista.
(() => {
  const video = document.querySelector('.hero__video');
  if (!video || SCROLL_HERO || REDUCED_MOTION || SAVE_DATA) return;   // sin video: queda el póster
  const portrait = matchMedia('(orientation: portrait)');
  const setSource = () => {
    video.src = portrait.matches ? video.dataset.portrait : video.dataset.landscape;
    if (!userPaused) video.play().catch(() => {});      // si el navegador bloquea el autoplay, queda el póster
  };
  // Botón de pausa (requisito de accesibilidad para movimiento que dura más de 5 segundos)
  const btn = document.querySelector('.hero__pause');
  let userPaused = false;
  const updateBtn = () => {
    btn.classList.toggle('is-paused', video.paused);
    btn.setAttribute('aria-label', video.paused ? 'Play background video' : 'Pause background video');
  };
  if (btn) {
    btn.hidden = false;
    btn.addEventListener('click', () => {
      userPaused = !video.paused;
      userPaused ? video.pause() : video.play().catch(() => {});
    });
    video.addEventListener('play', updateBtn);
    video.addEventListener('pause', updateBtn);
    updateBtn();
  }
  setSource();
  portrait.addEventListener('change', setSource);
  // Fuera de la vista se pausa; al volver solo se reanuda si el usuario no lo pausó
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) video.pause();
    else if (!userPaused) video.play().catch(() => {});
  }).observe(video);
})();

// Escritorio: secuencia de 60 imágenes controlada por el scroll.
(() => {
  const FRAMES = 60;                                    // img/hero/desktop/frame_001…060.webp
  const wrap   = document.getElementById('hero-scroll');
  if (!wrap || !SCROLL_HERO) return;
  const hero   = document.getElementById('hero');
  const canvas = hero.querySelector('.hero__canvas');
  const ctx    = canvas.getContext('2d');
  const src    = i => `img/hero/desktop/frame_${String(i + 1).padStart(3, '0')}.webp`;

  const frames = new Array(FRAMES);
  let current = 0, target = 0, drawn = -1, raf = 0;

  // Tamaño del canvas según pantalla (máx. 2x de densidad)
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.round(canvas.clientWidth  * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    drawn = -1; draw(Math.round(current));
  }

  // Fotograma cargado más cercano al pedido
  function nearest(i) {
    for (let d = 0; d < FRAMES; d++) {
      if (frames[i - d]) return frames[i - d];
      if (frames[i + d]) return frames[i + d];
    }
    return null;
  }

  // Dibuja con encuadre "cover" centrado
  function draw(i) {
    const img = nearest(i);
    if (!img || (i === drawn && img === frames[i])) return;
    const cw = canvas.width, ch = canvas.height;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    drawn = frames[i] ? i : -1;
  }

  // Progreso del scroll dentro del contenedor → índice de fotograma
  function updateTarget() {
    const range = wrap.offsetHeight - window.innerHeight;
    const p = range > 0 ? Math.min(Math.max(-wrap.getBoundingClientRect().top / range, 0), 1) : 0;
    target = p * (FRAMES - 1);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // Suavizado: el fotograma se acerca al objetivo en cada cuadro
  function tick() {
    current += (target - current) * 0.18;
    if (Math.abs(target - current) < 0.05) current = target;
    draw(Math.round(current));
    raf = current !== target ? requestAnimationFrame(tick) : 0;
  }

  // Orden de carga: primero fotogramas repartidos, luego se rellenan huecos
  function loadOrder() {
    const seen = new Set(), order = [];
    for (let step = 16; step >= 1; step /= 2)
      for (let i = 0; i < FRAMES; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
    return order;
  }

  function load(i) {
    return new Promise(res => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { frames[i] = img; if (Math.abs(i - current) < 3 || drawn === -1) draw(Math.round(current)); res(); };
      img.onerror = () => { if (i === 0) hero.classList.add('is-missing'); res(); };
      img.src = src(i);
    });
  }

  async function preload(list) {
    let next = 0;
    const worker = async () => { while (next < list.length) await load(list[next++]); };
    await Promise.all(Array.from({ length: 4 }, worker));   // 4 descargas en paralelo
  }

  resize();
  window.addEventListener('resize', resize);

  if (REDUCED_MOTION || SAVE_DATA) { load(0); return; }    // solo el primer fotograma
  window.addEventListener('scroll', updateTarget, { passive: true });
  updateTarget();
  // El resto de fotogramas se descarga cuando la página ya terminó de cargar
  const start = () => preload(loadOrder());
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();

// ---------- Home: menú fijo en escritorio al empezar a ver "About Us" (index.html) ----------
(() => {
  const nav   = document.querySelector('.hero .nav');
  const hero  = document.getElementById('hero');
  const wrap  = document.getElementById('hero-scroll');
  const about = document.getElementById('about');
  if (!nav || !about) return;
  stickyNav(nav, () => about.getBoundingClientRect().top < window.innerHeight, on => {
    if (on) hero.style.setProperty('--nav-h', nav.offsetHeight + 'px');  // reserva el espacio del menú
    hero.classList.toggle('has-stuck-nav', on);
    wrap.classList.toggle('has-stuck-nav', on);
  });
})();

// ---------- Páginas interiores: menú fijo en escritorio al salir del banner ----------
(() => {
  const nav  = document.querySelector('.site-header .nav');
  const hero = document.querySelector('.page-hero');
  if (!nav || !hero) return;
  // se fija cuando el banner casi ha salido de la pantalla
  stickyNav(nav, () => hero.getBoundingClientRect().bottom < nav.offsetHeight);
})();

// ---------- Parallax de las secciones con imagen de fondo (index.html y contact.html) ----------
(() => {
  if (REDUCED_MOTION) return;
  const items = [...document.querySelectorAll('.parallax, [data-parallax]')]
    .map(el => ({ el, img: el.querySelector('.parallax__img'), on: false }));
  if (!items.length) return;
  const request = onScrollFrame(() => {
    const vh = window.innerHeight;
    for (const it of items) {
      if (!it.on) continue;
      const r = it.el.getBoundingClientRect();
      // -1 cuando entra por abajo, +1 cuando sale por arriba
      const p = Math.max(-1, Math.min(1, (vh - r.top) / (vh + r.height) * 2 - 1));
      it.img.style.transform = `translate3d(0, ${(-p * r.height * 0.12).toFixed(1)}px, 0)`;
    }
  });
  // Solo se calcula mientras la sección está en pantalla
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { items.find(i => i.el === e.target).on = e.isIntersecting; });
    request();
  }, { rootMargin: '100px 0px' });
  items.forEach(i => io.observe(i.el));
})();

// ---------- Calendario: vista de mes en pantallas grandes, de agenda en móvil (events.html) ----------
// El src se pone aquí para que el calendario se cargue una sola vez, ya con la vista correcta.
(() => {
  const cal = document.querySelector('.calendar__embed[data-src]');
  if (!cal) return;
  cal.src = matchMedia('(max-width: 640px)').matches ? cal.dataset.mobileSrc : cal.dataset.src;
})();
