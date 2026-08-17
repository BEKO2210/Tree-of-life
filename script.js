(() => {
  'use strict';

  const VERSION = '7.0.0';
  const canvas = document.getElementById('scene');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) return;

  const bgCanvas = document.createElement('canvas');
  const bg = bgCanvas.getContext('2d', { alpha: false });
  const treeCanvas = document.createElement('canvas');
  const tree = treeCanvas.getContext('2d');
  const glowCanvas = document.createElement('canvas');
  const glow = glowCanvas.getContext('2d');
  if (!bg || !tree || !glow) return;

  const coarse = matchMedia('(pointer: coarse)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;

  const TAU = Math.PI * 2;
  const PHASE = Object.freeze({ seed: 0, roots: .65, trunk: 1.4, limbs: 4.6, crown: 8.1, leaves: 11.6, settle: 16.4 });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const QUALITY = {
    low:    { resolution: .86, dpr: 1.0, maxSegments: 820,  maxLeaves: 1650, stars: 90,  motes: 12, depth: 5 },
    medium: { resolution: .92, dpr: 1.25,maxSegments: 1320, maxLeaves: 3000, stars: 145, motes: 22, depth: 6 },
    high:   { resolution: 1.0, dpr: 1.5, maxSegments: 2100, maxLeaves: 5200, stars: 220, motes: 34, depth: 7 }
  };

  let W = 1, H = 1, SCALE = 1, profile = QUALITY.medium;
  let segments = [], leaves = [], startOrder = [], leafOrder = [];
  let nextSegment = 0, nextLeaf = 0, activeSegments = [], activeLeaves = [];
  let motes = [];
  let startTime = 0, lastFrame = 0, raf = 0, resizeTimer = 0;
  let seed = 47291, settled = false, degraded = false;
  let fpsFrames = 0, fpsWindowStart = 0, fpsAverage = 60;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  const debug = window.__TREE_DEBUG__ = {
    version: VERSION,
    renderer: 'incremental-canvas-cache',
    quality: 'medium',
    resolutionScale: 1,
    segmentCount: 0,
    leafCount: 0,
    activeSegments: 0,
    activeLeaves: 0,
    committedSegments: 0,
    committedLeaves: 0,
    fps: 0,
    degraded: false,
    state: 'booting'
  };

  function chooseProfile() {
    const short = Math.min(innerWidth, innerHeight);
    const area = innerWidth * innerHeight;
    if (reduced.matches || (coarse.matches && (short < 900 || memory <= 4 || cores <= 6)) || area > 2_500_000) {
      debug.quality = 'low';
      return QUALITY.low;
    }
    if (!coarse.matches && memory >= 8 && cores >= 8 && short >= 900 && area < 2_200_000) {
      debug.quality = 'high';
      return QUALITY.high;
    }
    debug.quality = 'medium';
    return QUALITY.medium;
  }

  function configureSurface(surface, context) {
    surface.width = Math.max(1, Math.round(W * SCALE));
    surface.height = Math.max(1, Math.round(H * SCALE));
    if (surface === canvas) {
      surface.style.width = W + 'px';
      surface.style.height = H + 'px';
    }
    context.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    context.imageSmoothingEnabled = true;
  }

  function renderBackground() {
    bg.save();
    bg.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    const sky = bg.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#010208');
    sky.addColorStop(.38, '#071229');
    sky.addColorStop(.68, '#081331');
    sky.addColorStop(1, '#010208');
    bg.fillStyle = sky;
    bg.fillRect(0, 0, W, H);

    const r = rng(seed ^ 0x51A2);
    const aura = bg.createRadialGradient(W*.5, H*.54, 0, W*.5, H*.54, Math.max(W,H)*.56);
    aura.addColorStop(0, 'rgba(42,76,148,.30)');
    aura.addColorStop(.38, 'rgba(18,35,80,.15)');
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    bg.fillStyle = aura;
    bg.fillRect(0,0,W,H);

    for (let i = 0; i < profile.stars; i++) {
      const x = r()*W, y = r()*H*.78;
      const radius = .3 + r()*1.3;
      bg.fillStyle = `rgba(${205+Math.floor(r()*50)},${218+Math.floor(r()*37)},255,${.14+r()*.56})`;
      bg.beginPath();
      bg.arc(x,y,radius,0,TAU);
      bg.fill();
    }

    const hazeCount = debug.quality === 'low' ? 3 : 5;
    for (let i=0;i<hazeCount;i++) {
      const x=(.15+r()*.7)*W, y=(.18+r()*.45)*H, rad=(.07+r()*.11)*Math.max(W,H);
      const g=bg.createRadialGradient(x,y,0,x,y,rad);
      const warm=r()>.55;
      g.addColorStop(0,warm?'rgba(255,196,92,.055)':'rgba(69,151,255,.065)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      bg.fillStyle=g; bg.fillRect(x-rad,y-rad,rad*2,rad*2);
    }

    const floor = bg.createLinearGradient(0,H*.72,0,H);
    floor.addColorStop(0,'rgba(0,0,0,0)'); floor.addColorStop(1,'rgba(0,0,0,.60)');
    bg.fillStyle=floor; bg.fillRect(0,H*.72,W,H*.28);
    bg.restore();
  }

  function qcurve(x,y,len,a,bend) {
    const x2=x+Math.cos(a)*len, y2=y+Math.sin(a)*len;
    const cx=(x+x2)*.5+Math.cos(a-Math.PI/2)*len*bend;
    const cy=(y+y2)*.5+Math.sin(a-Math.PI/2)*len*bend;
    return {x1:x,y1:y,cx,cy,x2,y2};
  }

  function addSegment(data) {
    if (segments.length >= profile.maxSegments) return null;
    data.id = segments.length;
    segments.push(data);
    return data;
  }

  function addLeaves(r, s, count, startBase) {
    if (leaves.length >= profile.maxLeaves) return;
    const dx=s.x2-s.x1, dy=s.y2-s.y1;
    const tangent=Math.atan2(dy,dx);
    for(let i=0;i<count && leaves.length<profile.maxLeaves;i++) {
      const along=.55+r()*.55;
      const x=lerp(s.cx,s.x2,along)+(r()-.5)*11;
      const y=lerp(s.cy,s.y2,along)+(r()-.5)*11;
      const hue=r();
      leaves.push({
        x,y,
        rx:1.6+r()*2.7,
        ry:3.4+r()*5.0,
        a:tangent+(r()-.5)*1.25,
        start:Math.max(startBase,PHASE.leaves+r()*1.55),
        duration:.65+r()*.48,
        hue,
        phase:r()*TAU,
        committed:false
      });
    }
  }

  function branchPalette(depth, type) {
    if(type==='root') return {dark:'#2b1b12', mid:'#694227', light:'#a36d37', glow:'rgba(255,173,76,.12)'};
    const tip=clamp(1-depth/7,0,1);
    return {
      dark: tip>.58?'#493019':'#2b1c12',
      mid: tip>.58?'#9d6b31':'#724521',
      light: tip>.58?'#d6a34f':'#a66d31',
      glow: tip>.52?'rgba(255,215,115,.16)':'rgba(89,240,180,.10)'
    };
  }

  function growSubtree(r, opt) {
    const {x,y,len,a,w,depth,start,type,lean=0} = opt;
    if(depth<=0 || len<H*.010 || w<.58 || segments.length>=profile.maxSegments) return;
    const bend=(r()-.5)*.42+lean*.075;
    const c=qcurve(x,y,len,a,bend);
    const duration=clamp((len/(type==='root'?112:132))*(1+.065*Math.min(w,14)),.46,2.15);
    const end=start+duration;
    const palette=branchPalette(depth,type);
    const s=addSegment({...c,w,start,end,type,depth,palette,committed:false});
    if(!s) return;

    if(depth<=2 && type!=='root') addLeaves(r,s,2+Math.floor(r()*4),end-.10);
    if(depth<=1) return;

    let forks=2;
    if(type==='crown' && depth>=4 && r()>.38) forks=3;
    if(type==='branch' && depth>=5 && r()>.78) forks=3;
    if(type==='root' && depth<=2) forks=1;

    for(let i=0;i<forks;i++) {
      if(segments.length>=profile.maxSegments) break;
      const u=forks===1?.5:i/(forks-1);
      const baseSpread=type==='root'?.82:type==='crown'?.62:.56;
      const spread=(-1+u*2)*baseSpread+(r()-.5)*.19;
      const childType=depth<=3 && type!=='root'?'crown':type;
      growSubtree(r,{
        x:c.x2,y:c.y2,
        len:len*(type==='root'?(.68+r()*.11):(.61+r()*.17)),
        a:a+spread,
        w:w*(type==='root'?(.72+r()*.04):(.66+r()*.07)),
        depth:depth-1,
        start:end-.14+r()*.10,
        type:childType,
        lean:spread
      });
    }
  }

  function buildTreeModel() {
    segments=[]; leaves=[];
    const r=rng(seed);
    const baseX=W*.5, baseY=H*.925;
    const trunkNodes=[];
    const trunkSteps=debug.quality==='low'?9:debug.quality==='medium'?11:13;
    let x=baseX, y=baseY, w=H*(debug.quality==='low'?.017:.0205), time=PHASE.trunk;
    trunkNodes.push({x,y,w,time});

    const rootCount=debug.quality==='low'?7:9;
    for(let i=0;i<rootCount;i++) {
      const u=-1+i/(rootCount-1)*2;
      const a=Math.PI/2+u*.96+(r()-.5)*.12;
      growSubtree(r,{x:baseX,y:baseY-H*.004,len:H*(.082+r()*.055),a,w:H*.0105,depth:debug.quality==='high'?5:4,start:PHASE.roots+r()*.42,type:'root',lean:u});
    }

    for(let i=0;i<trunkSteps;i++) {
      const p=i/(trunkSteps-1);
      const len=H*lerp(.082,.042,p);
      const a=-Math.PI/2+(r()-.5)*lerp(.07,.18,p)+Math.sin(i*.72)*.015;
      const c=qcurve(x,y,len,a,(r()-.5)*.13);
      const duration=lerp(.78,.56,p);
      const palette=branchPalette(7-Math.floor(p*4),'trunk');
      addSegment({...c,w,start:time,end:time+duration,type:'trunk',depth:7-Math.floor(p*4),palette,committed:false});
      time += duration-.06;
      x=c.x2; y=c.y2; w*=.86;
      trunkNodes.push({x,y,w,time});
    }

    for(let i=1;i<trunkNodes.length-1;i++) {
      const n=trunkNodes[i];
      const p=i/(trunkNodes.length-1);
      const depth=clamp(Math.round(profile.depth-(p>.66?1:0)),4,profile.depth);
      const len=H*lerp(.205,.105,p);
      const preferred=(i%2===0?1:-1);
      const sideRoll=r();
      const sides=sideRoll<.34?[preferred]:sideRoll<.47?[-preferred]:[-1,1];
      for(const side of sides) {
        if(i>2 && r()>.91) continue;
        const upright=lerp(.98,.38,p);
        const a=-Math.PI/2+side*(upright+r()*.23)+(r()-.5)*.18;
        const choreography=lerp(PHASE.limbs,PHASE.crown-.35,p);
        const branchStart=Math.max(n.time+.22+r()*.36,choreography+r()*.32);
        growSubtree(r,{x:n.x,y:n.y,len:len*(.78+r()*.34),a,w:n.w*(.72+r()*.13),depth,start:branchStart,type:p>.60?'crown':'branch',lean:side*(.6+r()*.55)});
      }
    }

    const top=trunkNodes[trunkNodes.length-1];
    const fans=debug.quality==='low'?5:7;
    for(let i=0;i<fans;i++) {
      const u=-1+i/(fans-1)*2;
      const a=-Math.PI/2+u*.47+(r()-.5)*.10;
      growSubtree(r,{x:top.x,y:top.y,len:H*(.115+r()*.065),a,w:top.w*(.82+r()*.15),depth:debug.quality==='high'?6:5,start:Math.max(top.time+.10,PHASE.crown)+r()*.55,type:'crown',lean:u});
    }

    const terminalSegments=segments.filter(s=>s.type!=='root' && s.depth<=2);
    for(const s of terminalSegments) {
      if(leaves.length>=profile.maxLeaves) break;
      addLeaves(r,s,1+Math.floor(r()*3),Math.max(s.end-.05,PHASE.leaves));
    }

    startOrder=segments.map((_,i)=>i).sort((a,b)=>segments[a].start-segments[b].start);
    leafOrder=leaves.map((_,i)=>i).sort((a,b)=>leaves[a].start-leaves[b].start);
    debug.segmentCount=segments.length; debug.leafCount=leaves.length;
  }

  function tracePartial(c,s,p) {
    if(p>=.999){c.beginPath();c.moveTo(s.x1,s.y1);c.quadraticCurveTo(s.cx,s.cy,s.x2,s.y2);return;}
    const ax=lerp(s.x1,s.cx,p), ay=lerp(s.y1,s.cy,p);
    const bx=lerp(s.cx,s.x2,p), by=lerp(s.cy,s.y2,p);
    c.beginPath(); c.moveTo(s.x1,s.y1); c.quadraticCurveTo(ax,ay,lerp(ax,bx,p),lerp(ay,by,p));
  }

  function strokeBranch(c,s,p=1,active=false) {
    tracePartial(c,s,p);
    c.lineCap='round'; c.lineJoin='round';
    c.strokeStyle=s.palette.dark; c.lineWidth=Math.max(.7,s.w*1.28); c.stroke();
    tracePartial(c,s,p);
    c.strokeStyle=s.palette.mid; c.lineWidth=Math.max(.55,s.w*.95); c.stroke();
    tracePartial(c,s,p);
    c.strokeStyle=s.palette.light; c.globalAlpha=s.type==='root'?.32:.48; c.lineWidth=Math.max(.38,s.w*.18); c.stroke(); c.globalAlpha=1;

    if(!active && s.w>3.2 && s.type!=='root') {
      const grain=Math.min(7,Math.max(2,Math.floor(s.w*.55)));
      c.save(); c.globalAlpha=.18; c.strokeStyle='#f0bd69'; c.lineWidth=.45;
      for(let i=1;i<=grain;i++) {
        const t=i/(grain+1), x=lerp(s.x1,s.x2,t), y=lerp(s.y1,s.y2,t);
        c.beginPath(); c.moveTo(x-s.w*.18,y); c.lineTo(x+s.w*.18,y); c.stroke();
      }
      c.restore();
    }
  }

  function strokeGlow(c,s,p=1) {
    tracePartial(c,s,p); c.lineCap='round'; c.lineJoin='round';
    c.strokeStyle=s.palette.glow; c.lineWidth=Math.max(1,s.w*.48); c.stroke();
  }

  function leafColors(h) {
    if(h<.42) return ['#6dcf8e','#baf0a1'];
    if(h<.78) return ['#d9a83e','#ffe08a'];
    return ['#67cdb6','#9ef0cb'];
  }

  function drawLeaf(c,l,alpha=1) {
    const colors=leafColors(l.hue);
    c.save(); c.translate(l.x,l.y); c.rotate(l.a); c.globalAlpha=alpha;
    c.fillStyle=colors[0]; c.beginPath(); c.ellipse(0,0,l.rx,l.ry,0,0,TAU); c.fill();
    c.globalAlpha=alpha*.6; c.fillStyle=colors[1]; c.beginPath(); c.ellipse(-l.rx*.18,-l.ry*.14,l.rx*.38,l.ry*.68,0,0,TAU); c.fill();
    c.restore();
  }

  function clearCaches() {
    tree.setTransform(SCALE,0,0,SCALE,0,0); tree.clearRect(0,0,W,H);
    glow.setTransform(SCALE,0,0,SCALE,0,0); glow.clearRect(0,0,W,H);
    nextSegment=0; nextLeaf=0; activeSegments=[]; activeLeaves=[];
    for(const s of segments) s.committed=false;
    for(const l of leaves) l.committed=false;
    debug.committedSegments=0; debug.committedLeaves=0;
  }

  function commitSegment(s) {
    if(s.committed) return;
    strokeBranch(tree,s,1,false);
    if(s.type!=='root') strokeGlow(glow,s,1);
    s.committed=true; debug.committedSegments++;
  }

  function commitLeaf(l) {
    if(l.committed) return;
    drawLeaf(tree,l,1);
    l.committed=true; debug.committedLeaves++;
  }

  function updateTimeline(t) {
    while(nextSegment<startOrder.length && segments[startOrder[nextSegment]].start<=t) {
      activeSegments.push(startOrder[nextSegment++]);
    }
    const remaining=[];
    for(const id of activeSegments) {
      const s=segments[id];
      if(t>=s.end) commitSegment(s); else remaining.push(id);
    }
    activeSegments=remaining;

    while(nextLeaf<leafOrder.length && leaves[leafOrder[nextLeaf]].start<=t) {
      activeLeaves.push(leafOrder[nextLeaf++]);
    }
    const remainingLeaves=[];
    for(const id of activeLeaves) {
      const l=leaves[id];
      if(t>=l.start+l.duration) commitLeaf(l); else remainingLeaves.push(id);
    }
    activeLeaves=remainingLeaves;
    debug.activeSegments=activeSegments.length; debug.activeLeaves=activeLeaves.length;
  }

  function buildMotes() {
    const r=rng(seed ^ 0x7A41);
    motes=Array.from({length:profile.motes},()=>({
      x:(.28+r()*.44)*W,y:(.20+r()*.72)*H,baseX:(.25+r()*.50)*W,
      speed:8+r()*16,swing:5+r()*11,size:.55+r()*1.45,phase:r()*TAU,hue:r()>.42
    }));
  }

  function drawFrame(now) {
    const t=(now-startTime)/1000;
    const dt=lastFrame?Math.min((now-lastFrame)/1000,.05):0; lastFrame=now;
    updateTimeline(t);

    pointer.x=lerp(pointer.x,pointer.tx,.045); pointer.y=lerp(pointer.y,pointer.ty,.045);
    const motion=smooth(clamp((t-PHASE.settle)/2.4,0,1));
    const camX=pointer.x*(degraded?4:7)*motion, camY=pointer.y*(degraded?3:5)*motion;

    ctx.setTransform(SCALE,0,0,SCALE,0,0);
    ctx.drawImage(bgCanvas,0,0,W,H);

    const pulse=clamp(t/2.2,0,1)*(1-clamp((t-PHASE.settle)/5,0,.55));
    const aura=ctx.createRadialGradient(W*.5,H*.905,0,W*.5,H*.905,Math.min(W,H)*(.11+.03*pulse));
    aura.addColorStop(0,`rgba(255,211,105,${.055+.12*pulse})`);
    aura.addColorStop(.45,`rgba(78,226,174,${.025+.055*pulse})`); aura.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=aura; ctx.fillRect(W*.28,H*.70,W*.44,H*.30);

    ctx.save(); ctx.translate(camX,camY);
    ctx.drawImage(treeCanvas,0,0,W,H);
    ctx.globalCompositeOperation='screen'; ctx.globalAlpha=degraded?.45:.78; ctx.drawImage(glowCanvas,0,0,W,H); ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';

    for(const id of activeSegments) {
      const s=segments[id]; const p=easeOut(clamp((t-s.start)/(s.end-s.start),0,1));
      strokeBranch(ctx,s,p,true);
      if(!degraded && s.type!=='root') { ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.72;strokeGlow(ctx,s,p);ctx.restore(); }
    }

    for(const id of activeLeaves) {
      const l=leaves[id]; const p=smooth(clamp((t-l.start)/l.duration,0,1));
      const sway=.96+Math.sin(t*2.0+l.phase)*.04;
      ctx.save();ctx.translate(l.x,l.y);ctx.scale(sway,sway);ctx.translate(-l.x,-l.y);drawLeaf(ctx,l,p);ctx.restore();
    }
    ctx.restore();

    if(!degraded && !reduced.matches) {
      ctx.globalCompositeOperation='screen';
      const moteOn=smooth(clamp((t-.6)/11,0,1));
      for(const m of motes) {
        m.y-=m.speed*dt; m.x=m.baseX+Math.sin(t*.72+m.phase)*m.swing;
        if(m.y<H*.08){m.y=H*(.79+Math.random()*.15);m.baseX=(.27+Math.random()*.46)*W;}
        const c=m.hue?'125,255,191':'255,218,120';
        ctx.fillStyle=`rgba(${c},${moteOn*(.035+.075*(.5+.5*Math.sin(t*1.8+m.phase)))})`;
        ctx.beginPath();ctx.arc(m.x,m.y,m.size,0,TAU);ctx.fill();
      }
      ctx.globalCompositeOperation='source-over';
    }

    const vignette=ctx.createRadialGradient(W*.5,H*.52,Math.min(W,H)*.25,W*.5,H*.52,Math.max(W,H)*.72);
    vignette.addColorStop(0,'rgba(0,0,0,0)'); vignette.addColorStop(.72,'rgba(0,0,0,.08)'); vignette.addColorStop(1,'rgba(0,0,0,.64)');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);

    if(!settled && debug.committedSegments===segments.length && debug.committedLeaves===leaves.length) {
      settled=true; debug.state='settled'; document.body.classList.add('settled');
    }

    fpsFrames++;
    if(!fpsWindowStart) fpsWindowStart=now;
    if(now-fpsWindowStart>=1200) {
      fpsAverage=fpsFrames*1000/(now-fpsWindowStart); debug.fps=Math.round(fpsAverage);
      if(t>1.5 && t<12 && fpsAverage<42 && !degraded) { degraded=true; debug.degraded=true; }
      fpsFrames=0;fpsWindowStart=now;
    }

    debug.state=settled?'settled':'growing';
    if(!document.hidden) raf=requestAnimationFrame(drawFrame);
  }

  function resetScene() {
    seed=(seed+97)>>>0; settled=false; degraded=false;
    debug.degraded=false; document.body.classList.remove('settled');
    renderBackground(); buildTreeModel(); clearCaches(); buildMotes();
    startTime=performance.now(); lastFrame=0; fpsFrames=0; fpsWindowStart=0;
    debug.resolutionScale=Number(SCALE.toFixed(2)); debug.state='growing';
    document.body.classList.add('ready');
  }

  function resize() {
    cancelAnimationFrame(raf);
    profile=chooseProfile();
    W=Math.max(1,innerWidth);H=Math.max(1,innerHeight);
    const dpr=Math.min(devicePixelRatio||1,profile.dpr);
    SCALE=Math.max(.72,profile.resolution*dpr);
    configureSurface(canvas,ctx); configureSurface(bgCanvas,bg); configureSurface(treeCanvas,tree); configureSurface(glowCanvas,glow);
    resetScene();
    if(reduced.matches) {
      for(const s of segments) commitSegment(s); for(const l of leaves) commitLeaf(l);
      settled=true; debug.state='settled-static'; document.body.classList.add('settled');
      drawFrame(performance.now()+22000); cancelAnimationFrame(raf);
    } else raf=requestAnimationFrame(drawFrame);
  }

  addEventListener('pointermove',e=>{pointer.tx=clamp((e.clientX/W-.5)*2,-1,1);pointer.ty=clamp((e.clientY/H-.5)*2,-1,1);},{passive:true});
  addEventListener('deviceorientation',e=>{if(typeof e.gamma==='number')pointer.tx=clamp(e.gamma/38,-1,1);if(typeof e.beta==='number')pointer.ty=clamp((e.beta-45)/65,-1,1)*.65;},{passive:true});
  addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,140);},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);}else{lastFrame=performance.now();raf=requestAnimationFrame(drawFrame);}});
  coarse.addEventListener?.('change',resize); reduced.addEventListener?.('change',resize);

  resize();
})();
