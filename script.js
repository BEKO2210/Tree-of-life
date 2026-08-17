(() => {
  const canvas = document.getElementById('scene');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  const bg = document.createElement('canvas');
  const bgx = bg.getContext('2d', { alpha: false });
  if (!bgx) return;

  const coarse = matchMedia('(pointer: coarse)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
  const smooth = (a, b, v) => { const t = inv(a, b, v); return t * t * (3 - 2 * t); };
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s += 0x6D2B79F5;
      let t = s;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const presets = [
    { dpr: 1.1, seg: 420, stars: 70, motes: 16, trunk: 8, leaves: 80 },
    { dpr: 1.4, seg: 700, stars: 120, motes: 28, trunk: 10, leaves: 140 },
    { dpr: 1.7, seg: 960, stars: 180, motes: 42, trunk: 12, leaves: 210 }
  ];

  let W = 1, H = 1, DPR = 1, quality = 1, preset = presets[1];
  let seed = 19, segments = [], leaves = [], motes = [];
  let cycleStart = 0, last = 0, resizeTimer = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  function detectQuality() {
    if (reduce.matches) return 0;
    const short = Math.min(innerWidth, innerHeight);
    if (coarse.matches && (short < 820 || memory <= 4 || cores <= 6)) return 0;
    if (!coarse.matches && short > 1000 && memory >= 8 && cores >= 8) return 2;
    return 1;
  }

  function timing() {
    if (quality === 0) return { roots: .7, trunk: 1.5, branches: 4.0, crown: 7.1, leaves: 10.1, idle: 13.2, restart: 23 };
    if (quality === 2) return { roots: 1.1, trunk: 2.2, branches: 6.0, crown: 10.2, leaves: 15.0, idle: 19.4, restart: 34 };
    return { roots: .9, trunk: 1.9, branches: 5.1, crown: 8.8, leaves: 12.9, idle: 16.8, restart: 29 };
  }

  function setSize(c, cctx) {
    c.width = Math.max(1, Math.round(W * DPR));
    c.height = Math.max(1, Math.round(H * DPR));
    cctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function drawBackground() {
    bgx.clearRect(0, 0, W, H);
    const g = bgx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#02030a');
    g.addColorStop(.43, '#08112a');
    g.addColorStop(1, '#010104');
    bgx.fillStyle = g;
    bgx.fillRect(0, 0, W, H);

    const aura = bgx.createRadialGradient(W*.5, H*.56, 0, W*.5, H*.56, Math.max(W,H)*.55);
    aura.addColorStop(0, 'rgba(38,66,128,.28)');
    aura.addColorStop(.42, 'rgba(13,22,56,.14)');
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    bgx.fillStyle = aura;
    bgx.fillRect(0,0,W,H);

    const r = rng(seed * 31 + W + H);
    for (let i=0;i<preset.stars;i++) {
      bgx.fillStyle = `rgba(255,255,255,${.16+r()*.55})`;
      bgx.beginPath();
      bgx.arc(r()*W, r()*H*.74, .35+r()*1.4, 0, Math.PI*2);
      bgx.fill();
    }

    for (let i=0;i<(quality===0?3:quality===1?5:6);i++) {
      const x=(.18+r()*.64)*W, y=(.12+r()*.42)*H, rad=(.08+r()*.12)*Math.max(W,H);
      const warm=r()>.5;
      const n=bgx.createRadialGradient(x,y,0,x,y,rad);
      n.addColorStop(0,warm?'rgba(255,205,120,.075)':'rgba(125,255,191,.065)');
      n.addColorStop(1,'rgba(0,0,0,0)');
      bgx.fillStyle=n;
      bgx.fillRect(x-rad,y-rad,rad*2,rad*2);
    }
  }

  function curve(x, y, len, a, bend) {
    const x2=x+Math.cos(a)*len, y2=y+Math.sin(a)*len;
    const cx=(x+x2)/2+Math.cos(a-Math.PI/2)*len*bend;
    const cy=(y+y2)/2+Math.sin(a-Math.PI/2)*len*bend;
    return {x1:x,y1:y,cx,cy,x2,y2};
  }

  function addSegment(seg) {
    if (segments.length >= preset.seg) return null;
    segments.push(seg);
    return seg;
  }

  function addLeaf(x,y,start,size,hue,phase) {
    if (leaves.length >= preset.leaves) return;
    leaves.push({x,y,start,size,hue,phase});
  }

  function growBranch(r, opt) {
    const {x,y,len,a,w,depth,start,type,stage} = opt;
    if (depth<=0 || len<H*.013 || w<.7 || segments.length>=preset.seg) return;

    const c=curve(x,y,len,a,(r()-.5)*.30);
    const twig=depth<=2;
    const energy=clamp(1-depth/7,0,1);
    const end=start+(type==='root'?.78:.68)+(len/H)*3.4;
    const bark=type==='root'?[96,69,46]:[Math.round(130+energy*90),Math.round(78+energy*65),Math.round(34+energy*46)];
    const glow=energy>.55?[255,220,132]:[125,255,191];

    if (!addSegment({...c,w,start,end,type,stage,bark,glow,twig})) return;

    if (type!=='root' && twig) {
      const count=1+(r()>.6?1:0);
      for(let i=0;i<count;i++) addLeaf(c.x2+(r()-.5)*11,c.y2+(r()-.5)*11,end+r()*.3,2.4+r()*5.8,r()>.42?0:1,r()*Math.PI*2);
    }

    if (depth<=1) return;
    const forks = type==='crown'&&depth>3?3:2;
    for(let i=0;i<forks;i++) {
      if (segments.length>=preset.seg) break;
      const u=forks===1?.5:i/(forks-1);
      const spreadBase=type==='root'?.86:type==='crown'?.70:.64;
      const spread=(-1+u*2)*spreadBase+(r()-.5)*.16;
      growBranch(r,{
        x:c.x2,y:c.y2,
        len:len*(type==='root'?(.70+r()*.08):(.63+r()*.13)),
        a:a+spread,
        w:w*(type==='root'?.75:(.69+r()*.05)),
        depth:depth-1,
        start:end-.08+r()*.10,
        type:twig?'twig':type,
        stage:twig?'crown':stage
      });
    }
  }

  function buildTree() {
    const r=rng(seed);
    const T=timing();
    segments=[]; leaves=[]; motes=[];

    const baseX=W*.5, baseY=H*.93;
    const nodes=[];
    let x=baseX,y=baseY,w=H*(quality===0?.014:quality===1?.017:.020), start=T.trunk;
    nodes.push({x,y,w,start});

    for(let i=0;i<preset.trunk;i++) {
      const p=i/Math.max(1,preset.trunk-1);
      const len=H*lerp(.090,.047,p);
      const a=-Math.PI/2+(r()-.5)*lerp(.10,.22,p);
      const c=curve(x,y,len,a,(r()-.5)*.16);
      const end=start+.88+(len/H)*4.0;
      addSegment({...c,w,start,end,type:'trunk',stage:'trunk',bark:[154,94,44],glow:[255,221,132],twig:false});
      x=c.x2; y=c.y2; w*=.86; start=end-.09;
      nodes.push({x,y,w,start});
    }

    const rootCount=quality===0?5:quality===1?7:9;
    for(let i=0;i<rootCount;i++) {
      const u=-1+(i/Math.max(1,rootCount-1))*2;
      growBranch(r,{x:baseX,y:baseY-H*.004,len:H*(.072+r()*.042),a:Math.PI/2+u*.83+(r()-.5)*.15,w:H*.009,depth:quality===0?3:quality===1?4:5,start:T.roots+r()*.6,type:'root',stage:'roots'});
    }

    for(let i=1;i<nodes.length-1;i++) {
      const n=nodes[i];
      const lift=1-i/nodes.length;
      const len=H*(.10+lift*.16);
      const depth=Math.round((quality===0?3:quality===1?4:5)+lift*2.0);
      for(const side of [-1,1]) {
        if(r()>.88&&i>2) continue;
        const stage=i>=nodes.length-3?'crown':'branches';
        const s=stage==='crown'?T.crown:T.branches;
        growBranch(r,{x:n.x,y:n.y,len:len*(.84+r()*.27),a:-Math.PI/2+side*(.70+r()*.33)+(r()-.5)*.14,w:n.w*.82,depth,start:s+(1-lift)*1.4+r()*.34,type:stage==='crown'?'crown':'branch',stage});
      }
    }

    const top=nodes[nodes.length-1];
    const fans=quality===0?5:quality===1?7:9;
    for(let i=0;i<fans;i++) {
      const u=-1+(i/Math.max(1,fans-1))*2;
      growBranch(r,{x:top.x,y:top.y,len:H*(.12+r()*.07),a:-Math.PI/2+u*.55+(r()-.5)*.14,w:top.w*.94,depth:quality===0?4:5,start:T.crown+r()*.55,type:'crown',stage:'crown'});
    }

    motes=Array.from({length:preset.motes},()=>({x:(.24+r()*.52)*W,y:(.22+r()*.68)*H,baseX:(.24+r()*.52)*W,size:.8+r()*2.2,speed:9+r()*18,swing:6+r()*14,phase:r()*Math.PI*2,hue:r()>.35?0:1}));
  }

  function drawPartial(s,p) {
    if(p>=.999){ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.quadraticCurveTo(s.cx,s.cy,s.x2,s.y2);ctx.stroke();return;}
    const ax=lerp(s.x1,s.cx,p), ay=lerp(s.y1,s.cy,p), bx=lerp(s.cx,s.x2,p), by=lerp(s.cy,s.y2,p);
    ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.quadraticCurveTo(ax,ay,lerp(ax,bx,p),lerp(ay,by,p));ctx.stroke();
  }

  function reset() {
    seed += 17;
    buildTree();
    cycleStart=performance.now();
    last=0;
    document.body.classList.add('ready');
  }

  function resize() {
    quality=detectQuality(); preset=presets[quality];
    DPR=Math.min(devicePixelRatio||1,preset.dpr);
    W=Math.max(1,innerWidth); H=Math.max(1,innerHeight);
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    setSize(canvas,ctx); setSize(bg,bgx);
    drawBackground(); reset();
  }

  function render(now) {
    const T=timing();
    if(!last) last=now;
    const dt=Math.min((now-last)/1000,.05); last=now;
    const t=(now-cycleStart)/1000;
    if(t>T.restart){reset();requestAnimationFrame(render);return;}

    pointer.x=lerp(pointer.x,pointer.tx,.05); pointer.y=lerp(pointer.y,pointer.ty,.05);
    const idle=smooth(T.idle-1.8,T.idle+1.5,t);
    const camX=pointer.x*(quality===0?6:quality===1?10:14)*idle;
    const camY=(pointer.y*(quality===0?4:quality===1?6:8)+Math.sin(now*.00018)*2.5)*idle;

    ctx.clearRect(0,0,W,H);
    ctx.drawImage(bg,0,0,W,H);

    const core=smooth(0,T.trunk+.8,t);
    const aura=ctx.createRadialGradient(W*.5,H*.87,0,W*.5,H*.87,W*.18);
    aura.addColorStop(0,`rgba(255,220,132,${.04+core*.12})`);
    aura.addColorStop(.45,`rgba(125,255,191,${.02+core*.05})`);
    aura.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=aura;ctx.fillRect(0,H*.64,W,H*.36);

    ctx.save();ctx.translate(camX,camY);ctx.lineCap='round';ctx.lineJoin='round';

    for(let pass=0;pass<2;pass++) {
      const glowPass=pass===1;
      if(glowPass) ctx.globalCompositeOperation='screen';
      for(const s of segments) {
        if(t<=s.start) continue;
        const p=easeOut(inv(s.start,s.end,t));
        if(p<=.001) continue;
        if(!glowPass) {
          ctx.lineWidth=s.w*1.08;
          ctx.strokeStyle=`rgba(${s.bark[0]},${s.bark[1]},${s.bark[2]},.96)`;
          ctx.shadowBlur=s.type==='root'?0:Math.min(3,s.w*.2);
          ctx.shadowColor='rgba(0,0,0,.22)';
        } else {
          if(s.type==='root'||s.w>7.5) continue;
          const a=(.08+(s.twig?.08:.03))*smooth(s.start,s.end+.9,t)*(.72+Math.sin(now*.0014)*.28);
          ctx.lineWidth=Math.max(.55,s.w*.22);
          ctx.strokeStyle=`rgba(${s.glow[0]},${s.glow[1]},${s.glow[2]},${a})`;
          ctx.shadowColor=`rgba(${s.glow[0]},${s.glow[1]},${s.glow[2]},${a})`;
          ctx.shadowBlur=5;
        }
        drawPartial(s,p);
      }
      ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';
    }

    ctx.globalCompositeOperation='screen';
    for(const l of leaves) {
      if(t<Math.max(T.leaves,l.start)) continue;
      const appear=smooth(Math.max(T.leaves,l.start),Math.max(T.leaves,l.start)+1.8,t);
      const wave=.82+Math.sin(now*.002+l.phase)*.22;
      const c=l.hue===0?[255,218,122]:[125,255,191];
      ctx.fillStyle=`rgba(${c[0]},${c[1]},${c[2]},${appear*(l.hue===0?.18:.14)*wave})`;
      ctx.shadowColor=`rgba(${c[0]},${c[1]},${c[2]},${appear*.20})`;
      ctx.shadowBlur=l.size*3.5;
      ctx.beginPath();ctx.arc(l.x,l.y,l.size*(.85+wave*.25),0,Math.PI*2);ctx.fill();
    }
    ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';ctx.restore();

    const moteOn=smooth(T.roots,T.leaves+1,t);
    ctx.globalCompositeOperation='screen';
    for(const m of motes) {
      m.y-=m.speed*dt; m.x=m.baseX+Math.sin(t*.8+m.phase)*m.swing;
      if(m.y<H*.08){m.y=H*(.78+Math.random()*.14);m.baseX=(.24+Math.random()*.52)*W;}
      const c=m.hue===0?[255,220,132]:[125,255,191];
      ctx.fillStyle=`rgba(${c[0]},${c[1]},${c[2]},${moteOn*(.05+.08*(.5+.5*Math.sin(t*2+m.phase)))})`;
      ctx.beginPath();ctx.arc(m.x,m.y,m.size,0,Math.PI*2);ctx.fill();
    }
    ctx.globalCompositeOperation='source-over';

    requestAnimationFrame(render);
  }

  addEventListener('pointermove',e=>{pointer.tx=clamp((e.clientX/W-.5)*2,-1,1);pointer.ty=clamp((e.clientY/H-.5)*2,-1,1);},{passive:true});
  addEventListener('deviceorientation',e=>{if(typeof e.gamma==='number')pointer.tx=clamp(e.gamma/35,-1,1);if(typeof e.beta==='number')pointer.ty=clamp((e.beta-45)/60,-1,1)*.7;},{passive:true});
  addEventListener('pointerdown',()=>{if((performance.now()-cycleStart)/1000>timing().idle*.8)reset();},{passive:true});
  addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,90);},{passive:true});
  document.addEventListener('visibilitychange',()=>{last=0;});
  reduce.addEventListener?.('change',resize);
  coarse.addEventListener?.('change',resize);

  resize();
  requestAnimationFrame(render);
})();
