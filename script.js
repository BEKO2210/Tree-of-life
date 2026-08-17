(() => {
  const sky = document.getElementById('sky');
  const tree = document.getElementById('tree');
  const energy = document.getElementById('energy');
  const boost = document.getElementById('boost');
  if (!sky || !tree || !energy) return;

  const coarse = matchMedia('(pointer:coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const memory = navigator.deviceMemory || 4;
  const low = coarse || memory <= 4;
  const DPR = Math.min(window.devicePixelRatio || 1, low ? 1.25 : 1.75);
  const MAX_SEGMENTS = low ? 950 : 2200;
  const STAR_COUNT = low ? 140 : 320;
  const PARTICLES = low ? 38 : 90;
  let W = 0, H = 0, tick = 0, awake = 0;
  let pointer = { x: .5, y: .5 };

  const rnd = s => { const x = Math.sin(s * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

  function fit(canvas) {
    canvas.width = Math.max(1, Math.floor(W * DPR));
    canvas.height = Math.max(1, Math.floor(H * DPR));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return ctx;
  }

  function drawSky() {
    const ctx = fit(sky);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#050713');
    g.addColorStop(.46, '#111b3a');
    g.addColorStop(1, '#02030a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < STAR_COUNT; i++) {
      const x = rnd(i) * W, y = rnd(i + 5) * H;
      ctx.globalAlpha = .2 + rnd(i + 9) * .75;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, .35 + rnd(i + 13) * 1.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const halo = ctx.createRadialGradient(W * .5, H * .44, 5, W * .5, H * .44, Math.min(W, H) * .55);
    halo.addColorStop(0, 'rgba(255,215,122,.17)');
    halo.addColorStop(.42, 'rgba(125,255,191,.08)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
  }

  function drawTree() {
    const ctx = fit(tree);
    ctx.clearRect(0, 0, W, H);
    const scale = Math.min(W / 900, H / 780) * (low ? .92 : 1.05);
    const baseX = W / 2, baseY = H * .92;

    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.scale(scale, scale);

    const trunkGlow = ctx.createRadialGradient(0, -300, 20, 0, -300, 420);
    trunkGlow.addColorStop(0, 'rgba(255,215,122,.20)');
    trunkGlow.addColorStop(.48, 'rgba(125,255,191,.08)');
    trunkGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = trunkGlow;
    ctx.fillRect(-520, -850, 1040, 950);

    const stack = [];
    for (let i = 0; i < 18; i++) {
      stack.push({ x: 0, y: 0, len: 165 + rnd(i) * 100, a: -Math.PI / 2 + (i - 8.5) * .035, w: 20 + rnd(i + 3) * 12, d: low ? 7 : 8, s: i + 1 });
    }

    let n = 0;
    while (stack.length && n < MAX_SEGMENTS) {
      const b = stack.pop(); n++;
      if (b.d <= 0 || b.w < .55) continue;
      const bend = (rnd(b.s) - .5) * .34;
      const a = b.a + bend;
      const x2 = b.x + Math.cos(a) * b.len;
      const y2 = b.y + Math.sin(a) * b.len;

      const grad = ctx.createLinearGradient(b.x, b.y, x2, y2);
      grad.addColorStop(0, 'rgba(88,48,22,.98)');
      grad.addColorStop(.55, 'rgba(151,91,39,.94)');
      grad.addColorStop(1, 'rgba(238,181,84,.76)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = b.w;
      ctx.lineCap = 'round';
      ctx.shadowBlur = low ? 0 : Math.min(10, b.w * .35);
      ctx.shadowColor = 'rgba(255,198,98,.22)';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      const px = -Math.sin(a), py = Math.cos(a);
      const curve = (rnd(b.s + 2) - .5) * b.len * .24;
      ctx.quadraticCurveTo((b.x + x2) / 2 + px * curve, (b.y + y2) / 2 + py * curve, x2, y2);
      ctx.stroke();

      if (b.d <= 3) {
        const leaves = low ? 2 : 4;
        for (let j = 0; j < leaves; j++) {
          const r = 3 + rnd(b.s + j * 7) * 6;
          ctx.shadowBlur = 0;
          ctx.fillStyle = rnd(b.s + j) > .45 ? 'rgba(125,255,191,.52)' : 'rgba(255,216,122,.56)';
          ctx.beginPath();
          ctx.ellipse(x2 + (rnd(j + b.s) - .5) * 18, y2 + (rnd(j + b.s + 9) - .5) * 18, r * .55, r, rnd(j) * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const forks = b.d > 5 ? 2 : (rnd(b.s + 17) > .63 ? 3 : 2);
      for (let i = 0; i < forks; i++) {
        const spread = forks === 2 ? (i ? .34 : -.34) : (i - 1) * .31;
        stack.push({
          x: x2, y: y2,
          len: b.len * (.70 + rnd(b.s + i + 30) * .08),
          a: a + spread + (rnd(b.s + i + 40) - .5) * .18,
          w: b.w * .67,
          d: b.d - 1,
          s: b.s * 1.37 + i * 11.7
        });
      }
    }

    // roots
    ctx.shadowBlur = 0;
    for (let i = 0; i < 22; i++) {
      const a = Math.PI + (i / 21) * Math.PI;
      const len = 75 + rnd(i + 200) * 210;
      ctx.strokeStyle = 'rgba(138,78,34,.68)';
      ctx.lineWidth = 3 + rnd(i + 70) * 7;
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.quadraticCurveTo(Math.cos(a) * len * .5, 18 + rnd(i) * 36, Math.cos(a) * len, Math.sin(a) * len * .16 + 26);
      ctx.stroke();
    }
    ctx.restore();
  }

  function resize() {
    W = Math.max(1, innerWidth);
    H = Math.max(1, innerHeight);
    drawSky();
    drawTree();
    fit(energy).clearRect(0, 0, W, H);
  }

  function animate() {
    tick += .016;
    const ctx = energy.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const px = (pointer.x - .5) * (low ? 7 : 15);
    const py = (pointer.y - .5) * (low ? 4 : 8);
    tree.style.transform = `translate3d(${px}px,${py}px,0) scale(${1 + awake * .012})`;
    sky.style.transform = `translate3d(${-px * .22}px,${-py * .16}px,0)`;

    ctx.globalCompositeOperation = 'screen';
    const pulse = .55 + .35 * Math.sin(tick * 1.5) + awake * .18;
    for (let i = 0; i < PARTICLES; i++) {
      const p = (rnd(i) + tick * (.012 + rnd(i + 1) * .022)) % 1;
      const x = W / 2 + Math.sin(p * 10 + i) * W * (.05 + p * .22);
      const y = H * .91 - p * H * .78;
      ctx.globalAlpha = .12 + pulse * .35;
      ctx.fillStyle = rnd(i + 3) > .48 ? '#ffd87a' : '#7dffbf';
      ctx.beginPath();
      ctx.arc(x, y, .8 + rnd(i + 4) * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!reduced) requestAnimationFrame(animate);
  }

  addEventListener('resize', () => {
    clearTimeout(window.__treeResizeTimer);
    window.__treeResizeTimer = setTimeout(resize, 120);
  }, { passive: true });

  addEventListener('pointermove', e => {
    pointer.x = e.clientX / Math.max(1, W);
    pointer.y = e.clientY / Math.max(1, H);
  }, { passive: true });

  addEventListener('deviceorientation', e => {
    if (typeof e.gamma === 'number') pointer.x = Math.max(0, Math.min(1, .5 + e.gamma / 90));
    if (typeof e.beta === 'number') pointer.y = Math.max(0, Math.min(1, .5 + (e.beta - 45) / 180));
  }, { passive: true });

  boost?.addEventListener('click', () => { awake = awake ? 0 : 1; });

  resize();
  if (!reduced) requestAnimationFrame(animate);
})();
