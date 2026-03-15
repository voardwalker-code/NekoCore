/* ============================================================
   NekoCore Star Field — Stars, Constellations & Comet
   Loaded immediately after the #stars canvas element
   ============================================================ */
(function() {
  'use strict';
  var canvas = document.getElementById('stars');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  var W, H, stars = [], cStars = [], cEdges = [], comet = null;
  var speedMult = 1.0;

  var CDEFS = [
    { pts:[[0.07,0.14],[0.12,0.11],[0.17,0.10],[0.22,0.12],[0.25,0.18],[0.29,0.23],[0.34,0.19]],
      edges:[[0,1],[1,2],[2,3],[3,0],[3,4],[4,5],[5,6]] },
    { pts:[[0.70,0.27],[0.76,0.32],[0.72,0.40],[0.730,0.405],[0.740,0.40],[0.68,0.50],[0.78,0.48],[0.72,0.23]],
      edges:[[0,2],[1,2],[2,3],[3,4],[4,5],[4,6],[7,0],[7,1]] },
    { pts:[[0.44,0.07],[0.49,0.12],[0.54,0.08],[0.59,0.13],[0.64,0.09]],
      edges:[[0,1],[1,2],[2,3],[3,4]] },
    { pts:[[0.86,0.62],[0.86,0.74],[0.80,0.68],[0.92,0.68]],
      edges:[[0,1],[2,3]] },
    { pts:[[0.38,0.53],[0.41,0.46],[0.45,0.43],[0.49,0.45],[0.52,0.51],[0.57,0.59],[0.45,0.60]],
      edges:[[0,1],[1,2],[2,3],[3,4],[4,5],[4,6],[6,0]] },
    { pts:[[0.60,0.68],[0.63,0.63],[0.66,0.60],[0.70,0.62],[0.73,0.67],[0.76,0.72],[0.78,0.78],[0.75,0.84],[0.71,0.83]],
      edges:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8]] },
  ];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function mkComet() {
    var side = Math.floor(Math.random() * 4);
    var x, y;
    if (side === 0) { x = Math.random() * W; y = -40; }
    else if (side === 1) { x = W + 40; y = Math.random() * H; }
    else if (side === 2) { x = Math.random() * W; y = H + 40; }
    else { x = -40; y = Math.random() * H; }
    var tx = W * 0.2 + Math.random() * W * 0.6;
    var ty = H * 0.2 + Math.random() * H * 0.6;
    var d = Math.hypot(tx - x, ty - y) || 1;
    var sp = 0.4 + Math.random() * 0.3;
    comet = { x: x, y: y, vx: (tx-x)/d*sp, vy: (ty-y)/d*sp,
              tailLen: 120 + Math.random() * 80, r: 3, alive: true };
  }

  function init() {
    stars = [];
    for (var i = 0; i < 400; i++) {
      var vx = (Math.random()-0.5)*0.028, vy = (Math.random()-0.5)*0.016;
      var isBright = Math.random() < 0.08;
      stars.push({ x: Math.random()*W, y: Math.random()*H,
                   r: isBright ? Math.random()*1.6+1.4 : Math.random()*1.2+0.4,
                   a: isBright ? Math.random()*0.3+0.7 : Math.random()*0.55+0.3,
                   da: (Math.random()-0.5)*0.004, vx: vx, vy: vy,
                   hue: isBright && Math.random() < 0.3 ? (Math.random() < 0.5 ? '160,235,200' : '180,200,255') : '210,225,255' });
    }
    cStars = []; cEdges = [];
    for (var ci = 0; ci < CDEFS.length; ci++) {
      var def = CDEFS[ci];
      var base = cStars.length;
      for (var pi = 0; pi < def.pts.length; pi++) {
        var fx = def.pts[pi][0], fy = def.pts[pi][1];
        cStars.push({ x: fx*W, y: fy*H, fx: fx, fy: fy,
                      r: Math.random()*0.8+2.2, a: 0.65+Math.random()*0.30,
                      da: (Math.random()-0.5)*0.0018,
                      vx: (Math.random()-0.5)*0.006,
                      vy: (Math.random()-0.5)*0.004 });
      }
      for (var ei = 0; ei < def.edges.length; ei++) {
        cEdges.push([base+def.edges[ei][0], base+def.edges[ei][1]]);
      }
    }
    if (!comet) mkComet();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    speedMult = Math.max(1.0, speedMult * 0.952);
    var sm = speedMult;
    var s, g, i, j, a, b, alpha;

    // Background stars
    for (i = 0; i < stars.length; i++) {
      s = stars[i];
      s.a += s.da;
      if (s.a < 0.15 || s.a > 0.95) s.da *= -1;
      s.x += s.vx * sm; s.y += s.vy * sm;
      if (s.x < -4) s.x = W+3; else if (s.x > W+4) s.x = -3;
      if (s.y < -4) s.y = H+3; else if (s.y > H+4) s.y = -3;
      if (s.r > 1.2) {
        g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3);
        g.addColorStop(0, 'rgba(' + s.hue + ',' + (s.a * 0.25) + ')');
        g.addColorStop(1, 'rgba(' + s.hue + ',0)');
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 3, 0, 6.2832);
        ctx.fillStyle = g; ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.2832);
      ctx.fillStyle = 'rgba(' + s.hue + ',' + s.a + ')';
      ctx.fill();
    }

    // Constellation edges
    for (i = 0; i < cEdges.length; i++) {
      a = cStars[cEdges[i][0]]; b = cStars[cEdges[i][1]];
      alpha = Math.min(a.a, b.a) * 0.35;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(140,200,255,' + alpha + ')';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Constellation stars
    for (i = 0; i < cStars.length; i++) {
      s = cStars[i];
      s.a += s.da;
      if (s.a < 0.40 || s.a > 0.96) s.da *= -1;
      s.x += s.vx * sm * 0.11; s.y += s.vy * sm * 0.11;
      if (s.x < -20) s.x = W+19; else if (s.x > W+20) s.x = -19;
      if (s.y < -20) s.y = H+19; else if (s.y > H+20) s.y = -19;
      g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r*4.5);
      g.addColorStop(0, 'rgba(200,230,255,' + (s.a*0.55) + ')');
      g.addColorStop(0.5, 'rgba(140,200,255,' + (s.a*0.15) + ')');
      g.addColorStop(1, 'rgba(140,200,255,0)');
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r*4.5, 0, 6.2832);
      ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832);
      ctx.fillStyle = 'rgba(230,245,255,' + s.a + ')'; ctx.fill();
    }

    // Comet
    if (comet && comet.alive) {
      comet.x += comet.vx * sm;
      comet.y += comet.vy * sm;
      var sp = Math.hypot(comet.vx, comet.vy) || 0.001;
      var nx = comet.vx / sp, ny = comet.vy / sp;
      var tail = comet.tailLen;
      // Outer glow trail
      var outerGrad = ctx.createLinearGradient(comet.x, comet.y, comet.x - nx*tail*1.2, comet.y - ny*tail*1.2);
      outerGrad.addColorStop(0, 'rgba(52,211,153,0.3)');
      outerGrad.addColorStop(0.4, 'rgba(34,211,238,0.08)');
      outerGrad.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.beginPath();
      ctx.moveTo(comet.x + ny*6, comet.y - nx*6);
      ctx.lineTo(comet.x - nx*tail*1.2, comet.y - ny*tail*1.2);
      ctx.lineTo(comet.x - ny*6, comet.y + nx*6);
      ctx.closePath();
      ctx.fillStyle = outerGrad; ctx.fill();
      // Core trail
      var grad = ctx.createLinearGradient(comet.x, comet.y, comet.x - nx*tail, comet.y - ny*tail);
      grad.addColorStop(0, 'rgba(220,245,255,0.95)');
      grad.addColorStop(0.1, 'rgba(52,211,153,0.7)');
      grad.addColorStop(0.4, 'rgba(34,211,238,0.25)');
      grad.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.beginPath();
      ctx.moveTo(comet.x + ny*2, comet.y - nx*2);
      ctx.lineTo(comet.x - nx*tail, comet.y - ny*tail);
      ctx.lineTo(comet.x - ny*2, comet.y + nx*2);
      ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      // Head glow
      var hg = ctx.createRadialGradient(comet.x, comet.y, 0, comet.x, comet.y, comet.r*6);
      hg.addColorStop(0, 'rgba(230,255,250,0.95)');
      hg.addColorStop(0.3, 'rgba(52,211,153,0.4)');
      hg.addColorStop(0.7, 'rgba(34,211,238,0.1)');
      hg.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.beginPath(); ctx.arc(comet.x, comet.y, comet.r*6, 0, 6.2832);
      ctx.fillStyle = hg; ctx.fill();
      // Core
      ctx.beginPath(); ctx.arc(comet.x, comet.y, comet.r, 0, 6.2832);
      ctx.fillStyle = '#eafaff'; ctx.fill();
      if (comet.x < -200 || comet.x > W+200 || comet.y < -200 || comet.y > H+200) {
        comet.alive = false;
        setTimeout(mkComet, 3000 + Math.random() * 8000);
      }
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', function() { resize(); init(); });
  resize(); init(); draw();
})();
