/* =========================================================
   Energy Core — animated Three.js hero background
   ---------------------------------------------------------
   Framework-agnostic: call createEnergyCore(container, options)
   and keep the returned handle. handle.destroy() stops the loop
   and frees every geometry, material, texture and GL context,
   so it drops straight into a React/Next useEffect cleanup or a
   Svelte onDestroy.
   ========================================================= */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const PALETTE = {
  orange: new THREE.Color('#ff6a00'),
  amber: new THREE.Color('#ffa31a'),
  core: new THREE.Color('#fff3b0'),
};

const DEFAULTS = {
  bloomStrength: 1.8,
  bloomRadius: 0.6,
  bloomThreshold: 0.1,
  // Shift the object sideways (fraction of the viewport width) on wide
  // screens so hero copy can sit beside it. The camera still looks
  // straight at the core; this is a lens shift, not a rotation.
  offsetX: 0,
  offsetMinWidth: 1024,
  // On portrait screens, raise the object by this fraction of the height.
  portraitOffsetY: 0,
  interactive: true,      // drag to rotate; hover near the core or click to flare
  parallaxDegrees: 5,
};

const rand = (a, b) => a + Math.random() * (b - a);
// Roughly normal jitter so ring particles cluster near the centreline.
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

export function createEnergyCore(container, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;

  const disposables = [];
  const track = (thing) => { disposables.push(thing); return thing; };

  /* ---------- renderer / scene / camera ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
  renderer.setClearColor(0x000000, 1);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

  // root tilts with the pointer (parallax); spin holds whatever rotation the
  // visitor drags in; the layers animate inside that
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  scene.add(root);

  /* ---------- 1. core + halo ---------- */
  const coreMat = track(new THREE.MeshBasicMaterial({
    color: PALETTE.core.clone().multiplyScalar(0.28), // keeps its warm tint instead of clipping to white
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  const core = new THREE.Mesh(track(new THREE.SphereGeometry(0.4, 48, 32)), coreMat);
  spin.add(core);

  const haloTex = track(radialTexture([
    [0, 'rgba(255,243,176,.3)'],
    [0.1, 'rgba(255,190,90,.35)'],
    [0.35, 'rgba(255,106,0,.07)'],
    [1, 'rgba(255,106,0,0)'],
  ]));
  const haloMat = track(new THREE.SpriteMaterial({
    map: haloTex, color: 0xffffff, blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, opacity: 0.12,
  }));
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(2.1);
  spin.add(halo);

  /* ---------- 2. wireframe icosphere ---------- */
  const wireGeo = track(new THREE.WireframeGeometry(track(new THREE.IcosahedronGeometry(2, isMobile ? 2 : 3))));
  const wireMat = track(new THREE.LineBasicMaterial({
    color: PALETTE.orange.clone().multiplyScalar(0.7), transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const wire = new THREE.LineSegments(wireGeo, wireMat);
  spin.add(wire);

  /* ---------- 3. partial arc ---------- */
  const ARC_RADIUS = 2.4;
  const ARC_TILT = THREE.MathUtils.degToRad(20);
  const arcPivot = new THREE.Group();
  arcPivot.rotation.x = ARC_TILT;
  arcPivot.rotation.z = THREE.MathUtils.degToRad(-8);
  const arcMat = track(new THREE.MeshBasicMaterial({
    color: PALETTE.amber.clone().lerp(PALETTE.orange, 0.35).multiplyScalar(0.6), transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const arc = new THREE.Mesh(track(new THREE.TorusGeometry(ARC_RADIUS, 0.032, 12, 220, Math.PI * 1.5)), arcMat);
  arcPivot.add(arc);
  spin.add(arcPivot);

  /* ---------- 4. particle rings ---------- */
  const ringMat = track(new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: renderer.getPixelRatio() },
      uBoost: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute float aBright;
      attribute vec3 aColor;
      uniform float uPixelRatio;
      uniform float uBoost;
      varying vec3 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio * (12.0 / -mv.z);
        vColor = aColor * aBright * uBoost;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        // edges in ascending order: a reversed smoothstep is undefined in GLSL
        // and returns NaN on some GPUs, which bloom smears into black blocks
        float a = 1.0 - smoothstep(0.0, 0.5, d);
        gl_FragColor = vec4(max(vColor * a * a, 0.0), 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));

  const ringSpecs = [
    { radius: 2.65, squash: 0.94, tilt: [72, 0, 12], speed: 0.10, count: 2600 },
    { radius: 2.95, squash: 0.88, tilt: [58, 30, -24], speed: -0.07, count: 2200 },
    { radius: 3.2, squash: 0.92, tilt: [96, -24, 40], speed: 0.05, count: 2000 },
    { radius: 3.4, squash: 0.85, tilt: [80, 48, -6], speed: -0.035, count: 1600 },
  ];
  const rings = (isMobile ? ringSpecs.slice(0, 3) : ringSpecs).map((spec) => {
    const count = isMobile ? Math.round(spec.count * 0.35) : spec.count;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const bright = new Float32Array(count);
    const tmp = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const t = Math.random() * Math.PI * 2;
      const r = spec.radius + gauss() * 0.14;
      pos[i * 3] = Math.cos(t) * r;
      pos[i * 3 + 1] = Math.sin(t) * r * spec.squash;
      pos[i * 3 + 2] = gauss() * 0.07;
      tmp.copy(PALETTE.orange).lerp(PALETTE.amber, Math.random());
      if (Math.random() < 0.06) tmp.lerp(PALETTE.core, 0.7); // a few hot sparks
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
      size[i] = Math.random() < 0.08 ? rand(2.4, 4) : rand(0.6, 2);
      bright[i] = rand(0.2, 0.85);
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));

    const pivot = new THREE.Group();
    pivot.rotation.set(...spec.tilt.map(THREE.MathUtils.degToRad));
    const points = new THREE.Points(geo, ringMat);
    pivot.add(points);
    spin.add(pivot);
    return { points, speed: spec.speed };
  });

  /* ---------- 5. light rays ---------- */
  const rayGroup = new THREE.Group();
  spin.add(rayGroup);
  const rayGeo = track(new THREE.CylinderGeometry(0.002, 0.014, 1, 6, 1, true));
  rayGeo.translate(0, 0.5, 0); // base at the origin, pointing +Y
  const UP = new THREE.Vector3(0, 1, 0);
  const rayCount = isMobile ? 16 : 22;
  const rays = Array.from({ length: rayCount }, () => {
    const mat = track(new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: PALETTE.amber.clone().lerp(PALETTE.core, rand(0.2, 0.7)) },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */`
        varying float vT;
        void main() {
          vT = uv.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vT;
        void main() {
          // start the fade at the core's surface so the rays don't stack into a blob
          float t = clamp(vT, 0.0, 1.0); // pow() of a negative base is NaN
          float fade = pow(1.0 - t, 1.8) * smoothstep(0.12, 0.4, t);
          gl_FragColor = vec4(max(uColor * fade * uOpacity * 0.5, 0.0), 1.0);
        }`,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
    }));
    const mesh = new THREE.Mesh(rayGeo, mat);
    const dir = new THREE.Vector3().randomDirection();
    mesh.quaternion.setFromUnitVectors(UP, dir);
    const length = rand(3, 6);
    mesh.scale.set(1, length, 1);
    rayGroup.add(mesh);
    return { mesh, mat, length, phase: rand(0, 100), rate: rand(0.6, 1.8) };
  });

  /* ---------- post-processing ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), opts.bloomStrength, opts.bloomRadius, opts.bloomThreshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- sizing ---------- */
  let width = 1, height = 1;
  function resize() {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    const aspect = width / height;
    camera.aspect = aspect;
    // keep the rings (r ≈ 3.5) in frame on tall/narrow screens
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, 0, Math.max(12, 3.9 / (halfH * Math.min(aspect, 1))));
    const shiftX = width >= opts.offsetMinWidth ? opts.offsetX : 0;
    const shiftY = aspect < 0.8 ? opts.portraitOffsetY : 0;
    if (shiftX || shiftY) camera.setViewOffset(width, height, -shiftX * width, shiftY * height, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();

    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    // bloom at reduced resolution is much cheaper and looks the same
    const bloomScale = isMobile ? 0.5 : 0.75;
    bloom.resolution.set(width * bloomScale, height * bloomScale);
    if (!running) renderFrame(0);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  /* ---------- pointer: parallax + flare ---------- */
  const pointer = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  let flare = 0;            // 0..1, decays
  let lastFlare = 0;
  const coreScreen = new THREE.Vector3();

  function triggerFlare() {
    const now = performance.now();
    if (now - lastFlare < 900) return;
    lastFlare = now;
    flare = 1;
  }
  // distance (px) from the pointer to the core, and the object's on-screen radius
  function coreDistance(e) {
    const rect = container.getBoundingClientRect();
    coreScreen.set(0, 0, 0).applyMatrix4(root.matrixWorld).project(camera);
    const cx = rect.left + (coreScreen.x + 1) / 2 * rect.width;
    const cy = rect.top + (1 - coreScreen.y) / 2 * rect.height;
    const halfH = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return { d: Math.hypot(e.clientX - cx, e.clientY - cy), objectR: (3.4 / halfH) * rect.height / 2, rect };
  }
  const isControl = (el) => el.closest && el.closest('a, button, input, textarea, select, label');

  function onPointerMove(e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    if (!opts.interactive || drag) return;
    const { d, objectR, rect } = coreDistance(e);
    if (d < Math.min(rect.width, rect.height) * 0.12) triggerFlare();
  }
  function onClick(e) {
    if (!opts.interactive) return;
    if (suppressClick) { suppressClick = false; return; } // that was the end of a drag
    // don't hijack real links/buttons sitting over the canvas
    if (isControl(e.target)) return;
    triggerFlare();
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  const clickTarget = container.parentElement || container;
  clickTarget.addEventListener('click', onClick);

  /* ---------- drag to rotate (with momentum) ---------- */
  const AXIS_X = new THREE.Vector3(1, 0, 0);
  const AXIS_Y = new THREE.Vector3(0, 1, 0);
  const qStep = new THREE.Quaternion();
  const spinVel = { x: 0, y: 0 }; // rad/s about the screen's X / Y axes
  let drag = null;
  let suppressClick = false;

  // rotate about screen-space axes so the object follows the pointer
  // however it's already turned
  function rotateBy(ax, ay) {
    spin.quaternion.premultiply(qStep.setFromAxisAngle(AXIS_Y, ay));
    spin.quaternion.premultiply(qStep.setFromAxisAngle(AXIS_X, ax));
  }
  function onDragStart(e) {
    if (!opts.interactive || drag || (e.pointerType === 'mouse' && e.button !== 0) || isControl(e.target)) return;
    const { d, objectR } = coreDistance(e);
    if (d > objectR) return; // only grab the object itself; the rest of the hero behaves normally
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    spinVel.x = spinVel.y = 0;
    clickTarget.setPointerCapture(e.pointerId);
    clickTarget.style.cursor = 'grabbing';
    if (e.pointerType === 'mouse') e.preventDefault(); // no text selection while dragging
  }
  function onDragMove(e) {
    if (!drag) {
      if (opts.interactive && e.pointerType === 'mouse') {
        clickTarget.style.cursor = !isControl(e.target) && coreDistance(e).d < coreDistance(e).objectR ? 'grab' : '';
      }
      return;
    }
    if (e.pointerId !== drag.id) return;
    const now = performance.now();
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const perPx = 3 / Math.max(1, height); // ~a half turn per hero height
    rotateBy(dy * perPx, dx * perPx);
    const dtMove = Math.max(1, now - drag.t) / 1000;
    spinVel.x = spinVel.x * 0.4 + (dy * perPx / dtMove) * 0.6;
    spinVel.y = spinVel.y * 0.4 + (dx * perPx / dtMove) * 0.6;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
    if (!running) renderFrame(0); // reduced motion / paused: still respond to the drag
  }
  function onDragEnd(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved > 6) suppressClick = true;
    // held still before letting go → no fling
    if (e.type === 'pointercancel' || performance.now() - drag.t > 90 || reducedMotion) spinVel.x = spinVel.y = 0;
    if (clickTarget.hasPointerCapture(e.pointerId)) clickTarget.releasePointerCapture(e.pointerId);
    clickTarget.style.cursor = '';
    drag = null;
  }
  // vertical swipes still scroll the page on touch screens; sideways ones spin
  const prevTouchAction = clickTarget.style.touchAction;
  clickTarget.style.touchAction = 'pan-y pinch-zoom';
  clickTarget.addEventListener('pointerdown', onDragStart);
  clickTarget.addEventListener('pointermove', onDragMove);
  clickTarget.addEventListener('pointerup', onDragEnd);
  clickTarget.addEventListener('pointercancel', onDragEnd);

  /* ---------- animation ---------- */
  const clock = new THREE.Clock();
  let raf = 0;
  let running = false;
  let visible = true;
  let elapsed = 0;

  // Perspective makes a tilted ring's near edge project further out than its
  // far edge, so the arc looks off-centre around the sphere. For a circle of
  // radius r with unit normal n at depth D, the projected centre shifts by
  // -r² · n_z · (n_x, n_y) / D; offset the arc by the opposite so it always
  // frames the sphere evenly, whatever angle it's been spun to.
  const arcNormal = new THREE.Vector3();
  const arcTarget = new THREE.Vector3();
  function centerArc() {
    arcPivot.position.set(0, 0, 0);
    root.updateMatrixWorld(true);
    arcNormal.set(0, 0, 1).transformDirection(arcPivot.matrixWorld);
    const k = (ARC_RADIUS ** 2) * arcNormal.z / camera.position.z;
    arcTarget.set(k * arcNormal.x, k * arcNormal.y, 0);
    arcPivot.position.copy(spin.worldToLocal(arcTarget));
  }

  function renderFrame(dt) {
    const t = elapsed;
    flare = Math.max(0, flare - dt * 1.4);
    const f = flare * flare * (3 - 2 * flare); // smoothstep ease-out

    const pulse = 1 + Math.sin(t * 2.2) * 0.05;
    core.scale.setScalar(pulse * (1 + f * 0.35));
    halo.scale.setScalar(2.1 * pulse * (1 + f * 1.1));
    haloMat.opacity = 0.12 + f * 0.6;

    wire.rotation.y = t * 0.12;
    wire.rotation.x = t * 0.05;
    arc.rotation.z = -t * 0.35;
    rings.forEach((r) => { r.points.rotation.z = t * r.speed; });
    ringMat.uniforms.uBoost.value = 1 + f * 0.8;

    rayGroup.rotation.y = t * 0.04;
    rayGroup.rotation.z = t * 0.025;
    rays.forEach((r) => {
      const n = Math.sin(t * r.rate + r.phase) * 0.5 + Math.sin(t * r.rate * 2.3 + r.phase * 1.7) * 0.5;
      r.mesh.scale.y = r.length * (0.85 + 0.15 * n) * (1 + f * 0.45);
      r.mat.uniforms.uOpacity.value = (0.55 + 0.45 * (n * 0.5 + 0.5)) * (1 + f * 0.8);
    });

    const maxTilt = THREE.MathUtils.degToRad(opts.parallaxDegrees);
    const ease = 1 - Math.pow(0.02, dt || 0); // frame-rate independent lerp
    tilt.x += (pointer.y * maxTilt - tilt.x) * ease;
    tilt.y += (pointer.x * maxTilt - tilt.y) * ease;
    root.rotation.x = tilt.x;
    root.rotation.y = tilt.y;

    // momentum after a fling
    if (!drag && Math.abs(spinVel.x) + Math.abs(spinVel.y) > 1e-3) {
      rotateBy(spinVel.x * dt, spinVel.y * dt);
      const damp = Math.exp(-2.2 * dt);
      spinVel.x *= damp;
      spinVel.y *= damp;
    }

    centerArc();

    bloom.strength = opts.bloomStrength * (1 + f * 0.35);
    composer.render(dt);
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    renderFrame(dt);
  }
  function start() {
    if (running || reducedMotion || !visible || document.hidden) return;
    running = true;
    clock.getDelta();
    loop();
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  // Only spend GPU time while the hero is on screen and the tab is visible.
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    visible ? start() : stop();
  });
  io.observe(container);
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);

  if (reducedMotion) {
    // one still frame, a little way into the motion so it isn't too symmetric
    elapsed = 6;
    resize();
    renderFrame(0);
  } else {
    resize();
    start();
  }

  return {
    flare: triggerFlare,
    destroy() {
      stop();
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      clickTarget.removeEventListener('click', onClick);
      clickTarget.removeEventListener('pointerdown', onDragStart);
      clickTarget.removeEventListener('pointermove', onDragMove);
      clickTarget.removeEventListener('pointerup', onDragEnd);
      clickTarget.removeEventListener('pointercancel', onDragEnd);
      clickTarget.style.touchAction = prevTouchAction;
      clickTarget.style.cursor = '';
      document.removeEventListener('visibilitychange', onVisibility);
      disposables.forEach((d) => d.dispose());
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

function radialTexture(stops, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
