// SKRT DERBY - Multiplayer Game Engine
// Full multiplayer support via WebSocket

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let W, H;

function resize() { W = canvas.width = canvas.innerWidth; H = canvas.height = canvas.innerHeight; }
resize(); window.addEventListener('resize', resize);

// ── State ──────────────────────────────────────────
let gameState = 'menu'; // menu -> lobby -> countdown -> playing -> gameover
let playerId = null;
let roomId = null;
let ws = null;
let myCar = null;
let cars = {};
let powerUps = [];
let particles = [];
let score = 0, kills = 0, timer = 120;
let lastTime = 0;
let keys = {};
const ARENA_MARGIN = 60;

// ── Car Configs ────────────────────────────────────
const CAR_TYPES = {
  brawler:  { speed:4.5, armor:150, handling:0.08, color:'#ff3d00', size:18, name:'Brawler' },
  speedster:{ speed:6.5, armor:80,  handling:0.06, color:'#00ff88', size:15, name:'Speedster' },
  tank:     { speed:2.8, armor:250, handling:0.04, color:'#4488ff', size:24, name:'Tank' },
  drifter:  { speed:5.0, armor:100, handling:0.12, color:'#ff8800', size:17, name:'Drifter' },
  lightning:{ speed:5.8, armor:70,  handling:0.09, color:'#ffff00', size:16, name:'Lightning' },
};

// ── Input ──────────────────────────────────────────
window.addEventListener('keydown', e => { keys[e.key] = true; e.preventDefault(); });
window.addEventListener('keyup', e => { keys[e.key] = false; });
// Touch controls exposed globally
window.pressKey = k => { keys[k] = true; };
window.releaseKey = k => { keys[k] = false; };

// ── Particles ──────────────────────────────────────
function spawnParticles(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    particles.push({ x, y, vx:(Math.random()-0.5)*8, vy:(Math.random()-0.5)*8, life:30+Math.random()*20, maxLife:50, color, size:1+Math.random()*3 });
  }
}

// ── PowerUps ───────────────────────────────────────
function spawnPowerUp() {
  const types = ['repair','repair','speed','speed','shield'];
  const x = ARENA_MARGIN+30+Math.random()*(W-ARENA_MARGIN*2-60);
  const y = ARENA_MARGIN+70+Math.random()*(H-ARENA_MARGIN*2-110);
  powerUps.push({ id:Date.now()+Math.random(), x, y, type:types[Math.floor(Math.random()*types.length)], radius:10, pulse:0 });
}

// ── WebSocket ──────────────────────────────────────
function connect(playerName, carType, room) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws/game`);
  
  ws.onopen = () => {
    ws.send(JSON.stringify({ type:'join', room:room, name:playerName, car:carType }));
    gameState = 'lobby';
    updateOverlay('Waiting for players...', `Room: ${room}<br>Share this room code with friends!`, false);
  };
  
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    if (msg.type === 'player_joined') {
      updateOverlay(`Players: ${msg.count}/8`, `Room: ${room}`, msg.count >= 2);
    }
    
    if (msg.type === 'game_start') {
      startGame(msg.players, msg.seed);
    }
    
    if (msg.type === 'game_update') {
      // Update other players' cars
      if (msg.players) {
        msg.players.forEach(p => {
          if (p.id !== playerId) {
            if (!cars[p.id]) {
              cars[p.id] = { id:p.id, x:p.x, y:p.y, angle:p.angle, health:p.health, maxHealth:p.maxHealth, size:p.size||18, color:p.color||'#888', alive:true, name:p.name };
            } else {
              Object.assign(cars[p.id], { x:p.x, y:p.y, angle:p.angle, health:p.health, alive:p.alive });
            }
          }
        });
      }
      // Sync powerups from host
      if (msg.powerUps) powerUps = msg.powerUps;
      if (msg.timer !== undefined) timer = msg.timer;
    }
    
    if (msg.type === 'player_left') {
      if (cars[msg.id]) { spawnParticles(cars[msg.id].x, cars[msg.id].y, 20, '#fff'); cars[msg.id].alive = false; }
    }
    
    if (msg.type === 'game_over') {
      gameState = 'gameover';
      updateOverlay('Game Over!', `Final Score: ${msg.scores[playerId]||0} | Rank: ${msg.ranks[playerId]||'?'}`, true);
    }
    
    if (msg.type === 'kill_feed') {
      showKillFeed(msg.killer, msg.victim);
    }
  };
  
  ws.onclose = () => {
    if (gameState === 'playing') {
      updateOverlay('Disconnected', 'Connection to server lost', true);
      gameState = 'menu';
    }
  };
}

function sendGameState() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !myCar) return;
  ws.send(JSON.stringify({
    type: 'game_state',
    x: myCar.x, y: myCar.y, angle: myCar.angle,
    speed: myCar.speed, health: myCar.health,
  }));
}

// ── Game Start ─────────────────────────────────────
function startGame(players, seed) {
  gameState = 'countdown';
  let countdown = 3;
  cars = {};
  powerUps = [];
  particles = [];
  score = 0; kills = 0; timer = 120;
  
  const spawns = [
    [W*0.5, H*0.3], [W*0.3, H*0.7], [W*0.7, H*0.7],
    [W*0.3, H*0.3], [W*0.7, H*0.3], [W*0.5, H*0.7],
    [W*0.15, H*0.5], [W*0.85, H*0.5],
  ];
  
  let i = 0;
  Object.entries(players).forEach(([id, p]) => {
    const [sx, sy] = spawns[i++] || [W*0.5, H*0.5];
    const cfg = CAR_TYPES[p.car] || CAR_TYPES.brawler;
    const car = { id, name:p.name, x:sx, y:sy, angle:Math.random()*Math.PI*2, speed:0, maxSpeed:cfg.speed, accel:0.15, friction:0.96, handling:cfg.handling, maxHealth:cfg.armor, health:cfg.armor, size:cfg.size, color:cfg.color, alive:true, isLocal:(id===playerId), flash:0, invincible:0 };
    cars[id] = car;
    if (id === playerId) myCar = car;
  });
  
  hideOverlay();
  
  const countInterval = setInterval(() => {
    showToast(countdown > 0 ? countdown : 'GO!', countdown === 0 ? '#00ff88' : '#ff3d00');
    countdown--;
    if (countdown < 0) { clearInterval(countInterval); gameState = 'playing'; hideToast(); }
  }, 800);
}

// ── Car Update ─────────────────────────────────────
function updateCar(car, dt) {
  if (!car.alive) return;
  car.invincible = Math.max(0, car.invincible - 1);
  car.flash = Math.max(0, car.flash - 1);
  
  if (car.isLocal) {
    if (keys['ArrowLeft']||keys['a']||keys['A']) car.angle -= car.handling;
    if (keys['ArrowRight']||keys['d']||keys['D']) car.angle += car.handling;
    if (keys['ArrowUp']||keys['w']||keys['W']) car.speed = Math.min(car.speed + car.accel, car.maxSpeed);
    else if (keys['ArrowDown']||keys['s']||keys['S']) car.speed = Math.max(car.speed - car.accel*1.5, -car.maxSpeed*0.5);
    else car.speed *= car.friction;
  }
  
  car.x += Math.cos(car.angle) * car.speed;
  car.y += Math.sin(car.angle) * car.speed;
  
  // Walls
  if (car.x - car.size < ARENA_MARGIN) { car.x = ARENA_MARGIN + car.size; car.speed *= -0.3; damageCar(car, 5); }
  if (car.x + car.size > W - ARENA_MARGIN) { car.x = W - ARENA_MARGIN - car.size; car.speed *= -0.3; damageCar(car, 5); }
  if (car.y - car.size < ARENA_MARGIN + 40) { car.y = ARENA_MARGIN + 40 + car.size; car.speed *= -0.3; damageCar(car, 5); }
  if (car.y + car.size > H - ARENA_MARGIN) { car.y = H - ARENA_MARGIN - car.size; car.speed *= -0.3; damageCar(car, 5); }
  
  if (car.health <= 0) {
    car.alive = false;
    spawnParticles(car.x, car.y, 30, car.color);
    spawnParticles(car.x, car.y, 15, '#ffff00');
    if (car.isLocal) { score += 50; kills++; } else { score += 100; }
  }
}

function damageCar(car, amount) {
  if (car.invincible > 0) return;
  car.health -= amount;
  car.flash = 8;
  car.invincible = 5;
}

// ── Collisions ─────────────────────────────────────
function checkCollisions() {
  const carList = Object.values(cars);
  for (let i = 0; i < carList.length; i++) {
    for (let j = i + 1; j < carList.length; j++) {
      const a = carList[i], b = carList[j];
      if (!a.alive || !b.alive) continue;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const minDist = a.size + b.size;
      if (dist < minDist && dist > 0) {
        const nx = (b.x - a.x) / dist;
        const ny = (b.y - a.y) / dist;
        const overlap = minDist - dist;
        a.x -= nx * overlap/2; a.y -= ny * overlap/2;
        b.x += nx * overlap/2; b.y += ny * overlap/2;
        const relSpeed = Math.abs(a.speed - b.speed) + Math.abs((a.speed+b.speed)/2)*0.5;
        const dmg = Math.min(relSpeed * 4, 40);
        damageCar(a, dmg); damageCar(b, dmg);
        a.speed *= -0.5; b.speed *= -0.5;
        if (a.isLocal || b.isLocal) spawnParticles((a.x+b.x)/2, (a.y+b.y)/2, 8, '#ff6600');
      }
    }
  }
  // Powerups
  carList.forEach(car => {
    if (!car.alive || !car.isLocal) return;
    powerUps.forEach((p, idx) => {
      if (Math.hypot(car.x-p.x, car.y-p.y) < car.size+p.radius) {
        if (p.type==='repair') car.health = Math.min(car.health+40, car.maxHealth);
        if (p.type==='speed') { car.maxSpeed*=1.5; setTimeout(()=>{if(car.alive)car.maxSpeed=CAR_TYPES[Object.keys(CAR_TYPES).find(k=>CAR_TYPES[k].color===car.color)||'brawler'].speed;},5000); }
        if (p.type==='shield') car.invincible = 180;
        powerUps.splice(idx,1); score += 25;
      }
    });
  });
}

// ── Render ─────────────────────────────────────────
function drawArena() {
  ctx.fillStyle = '#1a1a0a'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
  for (let x = ARENA_MARGIN; x < W - ARENA_MARGIN; x += 40) { ctx.beginPath(); ctx.moveTo(x, ARENA_MARGIN+40); ctx.lineTo(x, H-ARENA_MARGIN); ctx.stroke(); }
  for (let y = ARENA_MARGIN+40; y < H - ARENA_MARGIN; y += 40) { ctx.beginPath(); ctx.moveTo(ARENA_MARGIN, y); ctx.lineTo(W-ARENA_MARGIN, y); ctx.stroke(); }
  ctx.strokeStyle = '#ff3d00'; ctx.lineWidth = 4;
  ctx.strokeRect(ARENA_MARGIN, ARENA_MARGIN+40, W-ARENA_MARGIN*2, H-ARENA_MARGIN*2-40);
  ctx.fillStyle = '#222'; ctx.fillRect(W/2-30, H/2-30, 60, 60);
  ctx.fillStyle = '#333'; ctx.fillRect(W/2-22, H/2-22, 44, 44);
}

function drawCar(car) {
  if (!car.alive) return;
  ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
  const c = car.flash > 0 ? '#fff' : car.color;
  ctx.fillStyle = c;
  ctx.fillRect(-car.size, -car.size*0.65, car.size*2, car.size*1.3);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(car.size*0.3, -car.size*0.4, car.size*0.8, car.size*0.8);
  ctx.fillStyle = '#111';
  ctx.fillRect(-car.size-3, -car.size*0.7, 6, car.size*0.35); ctx.fillRect(-car.size-3, car.size*0.35, 6, car.size*0.35);
  ctx.fillRect(car.size-3, -car.size*0.7, 6, car.size*0.35); ctx.fillRect(car.size-3, car.size*0.35, 6, car.size*0.35);
  if (car.isLocal) { ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(car.size+5,0,3,0,Math.PI*2); ctx.fill(); }
  // Name tag
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  ctx.fillText(car.name||'', 0, -car.size-16);
  // Health bar
  const bw = car.size*2.5, hp = car.health/car.maxHealth;
  ctx.fillStyle = '#333'; ctx.fillRect(-bw/2, -car.size-10, bw, 3);
  ctx.fillStyle = hp>0.5?'#0f0':hp>0.25?'#ff0':'#f00';
  ctx.fillRect(-bw/2, -car.size-10, bw*hp, 3);
  ctx.restore();
}

function drawPowerUps() {
  const colors = { repair:'#00ff88', speed:'#ffdd00', shield:'#00d4ff' };
  powerUps.forEach(p => {
    p.pulse += 0.1;
    ctx.fillStyle = colors[p.type]||'#fff';
    ctx.globalAlpha = 0.6 + Math.sin(p.pulse)*0.4;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.stroke();
    ctx.globalAlpha=1;
    ctx.fillStyle='#000'; ctx.font='bold 8px monospace'; ctx.textAlign='center';
    ctx.fillText(p.type[0].toUpperCase(), p.x, p.y+3);
  });
}

function drawParticles() {
  particles.forEach(p => {
    const a = p.life/p.maxLife;
    ctx.fillStyle = p.color; ctx.globalAlpha = a;
    ctx.fillRect(p.x-p.size/2, p.y-p.size/2, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

// ── UI ─────────────────────────────────────────────
const overlayEl = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayMsg = document.getElementById('overlayMsg');
const toastEl = document.getElementById('toast') || createToast();

function createToast() {
  const el = document.createElement('div');
  el.id = 'toast';
  el.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-family:Orbitron;font-size:4rem;font-weight:900;color:#fff;text-shadow:0 0 20px #ff3d00;pointer-events:none;z-index:50;display:none';
  document.getElementById('canvasWrap').appendChild(el);
  return el;
}

function showToast(text, color) { toastEl.textContent = text; toastEl.style.color = color||'#fff'; toastEl.style.display = 'block'; }
function hideToast() { toastEl.style.display = 'none'; }

function updateOverlay(title, msg, showBtn) {
  overlayEl.style.display = 'flex';
  overlayTitle.textContent = title;
  overlayMsg.innerHTML = msg + (showBtn ? '<br><br><button class="btn" onclick="location.reload()">🔄 PLAY AGAIN</button>' : '');
}
function hideOverlay() { overlayEl.style.display = 'none'; }

let killFeedTimer = null;
function showKillFeed(killer, victim) {
  const el = document.getElementById('killFeed') || (() => { const e=document.createElement('div'); e.id='killFeed'; e.style.cssText='position:absolute;top:50px;right:10px;color:#ff3d00;font-weight:700;font-size:0.9rem;z-index:50'; document.getElementById('canvasWrap').appendChild(e); return e; })();
  el.textContent = `${killer} 💥 ${victim}`; el.style.display='block';
  clearTimeout(killFeedTimer); killFeedTimer = setTimeout(() => el.style.display='none', 3000);
}

// ── HUD ────────────────────────────────────────────
function updateHUD() {
  const alive = Object.values(cars).filter(c => c.alive).length;
  document.getElementById('gameInfo').textContent = `Time: ${Math.ceil(Math.max(0,timer))}s | Score: ${score} | Kills: ${kills} | Alive: ${alive}`;
}

// ── Game Loop ──────────────────────────────────────
let powerUpTimer = 0;
let lastSendTime = 0;

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime)/1000, 0.05);
  lastTime = timestamp;
  
  if (gameState === 'playing' && myCar) {
    timer -= dt;
    updateCar(myCar, dt);
    
    // Host spawns powerups (first player acts as host)
    const isHost = Object.keys(cars)[0] === playerId;
    if (isHost) {
      powerUpTimer += dt;
      if (powerUpTimer > 5 && powerUps.length < 4) { spawnPowerUp(); powerUpTimer = 0; }
    }
    
    checkCollisions();
    score += Math.floor(dt * 10);
    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; });
    particles = particles.filter(p => p.life > 0);
    
    // Send state to server
    if (timestamp - lastSendTime > 50) {
      sendGameState();
      lastSendTime = timestamp;
      // Also broadcast powerups/timer if host
      if (isHost) {
        ws.send(JSON.stringify({ type:'game_state', host:true, powerUps, timer }));
      }
    }
    
    if (!myCar.alive) {
      gameState = 'gameover';
      updateOverlay('WRECKED!', `Score: ${score} | Kills: ${kills}`, true);
      ws.send(JSON.stringify({ type:'score', score, kills }));
    }
    if (timer <= 0) {
      gameState = 'gameover';
      score += myCar.health * 2;
      updateOverlay('TIME\'S UP!', `Final Score: ${score} | Kills: ${kills}`, true);
      ws.send(JSON.stringify({ type:'score', score, kills }));
    }
    updateHUD();
  }
  
  // Render
  drawArena();
  drawPowerUps();
  const sorted = Object.values(cars).sort((a,b) => a.y - b.y);
  sorted.forEach(c => drawCar(c));
  drawParticles();
  
  requestAnimationFrame(gameLoop);
}

// ── Public API ─────────────────────────────────────
window.startMultiplayer = function(name, carType, room) {
  playerId = name.toLowerCase().replace(/\s/g,'') + '_' + Math.random().toString(36).substr(2,5);
  roomId = room;
  connect(name, carType, room);
};

window.joinRoom = function(name, carType, room) {
  playerId = name.toLowerCase().replace(/\s/g,'') + '_' + Math.random().toString(36).substr(2,5);
  roomId = room;
  connect(name, carType, room);
};

// ── AI Mode (fallback) ─────────────────────────────
window.startSinglePlayer = function(carType) {
  playerId = 'local_' + Math.random().toString(36).substr(2,5);
  gameState = 'countdown';
  cars = {}; powerUps = []; particles = []; score = 0; kills = 0; timer = 90;
  
  const cfg = CAR_TYPES[carType] || CAR_TYPES.brawler;
  myCar = { id:playerId, name:'You', x:W*0.5, y:H*0.8, angle:-Math.PI/2, speed:0, maxSpeed:cfg.speed, accel:0.15, friction:0.96, handling:cfg.handling, maxHealth:cfg.armor, health:cfg.armor, size:cfg.size, color:cfg.color, alive:true, isLocal:true, flash:0, invincible:0 };
  cars[playerId] = myCar;
  
  // AI opponents
  const types = ['brawler','speedster','tank','drifter','lightning'];
  const aiNames = ['CrashBot','Smasher','WreckKing','MetalMan','TurboG','Rusty','IronClad'];
  for (let i = 0; i < 7; i++) {
    const t = types[Math.floor(Math.random()*types.length)];
    const tc = CAR_TYPES[t];
    const ai = { id:'ai_'+i, name:aiNames[i], x:ARENA_MARGIN+30+Math.random()*(W-ARENA_MARGIN*2-60), y:ARENA_MARGIN+70+Math.random()*(H-ARENA_MARGIN*2-110), angle:Math.random()*Math.PI*2, speed:0, maxSpeed:tc.speed, accel:0.12, friction:0.96, handling:tc.handling*0.7, maxHealth:tc.armor, health:tc.armor, size:tc.size, color:tc.color, alive:true, isLocal:false, flash:0, invincible:0 };
    cars[ai.id] = ai;
  }
  
  hideOverlay();
  let cd = 3;
  const iv = setInterval(() => { showToast(cd>0?cd:'GO!',cd===0?'#00ff88':'#ff3d00'); cd--; if(cd<0){clearInterval(iv);gameState='playing';hideToast();} }, 800);
  
  // AI update
  setInterval(() => {
    if (gameState !== 'playing') return;
    Object.values(cars).forEach(c => {
      if (c.isLocal || !c.alive) return;
      const target = myCar.alive ? myCar : Object.values(cars).find(t => t.alive && t.id !== c.id);
      if (target) {
        const dx = target.x - c.x, dy = target.y - c.y;
        const ta = Math.atan2(dy, dx);
        let diff = ta - c.angle;
        while(diff>Math.PI)diff-=Math.PI*2; while(diff<-Math.PI)diff+=Math.PI*2;
        if(Math.abs(diff)>0.1) c.angle += Math.sign(diff)*c.handling;
        const d = Math.hypot(dx,dy);
        if(d>150) c.speed = Math.min(c.speed+0.08, c.maxSpeed*0.7);
        else if(d<60) c.speed = Math.min(c.speed+0.2, c.maxSpeed);
        else c.speed *= 0.96;
      }
      if(c.x<ARENA_MARGIN+80)c.angle+=0.05; if(c.x>W-ARENA_MARGIN-80)c.angle-=0.05;
      if(c.y<ARENA_MARGIN+120)c.angle+=0.05; if(c.y>H-ARENA_MARGIN-80)c.angle-=0.05;
      updateCar(c, dt);
    });
  }, 16);
};

// ── Init ────────────────────────────────────────────
lastTime = performance.now();
requestAnimationFrame(gameLoop);

// Show menu
updateOverlay('SKRT DERBY', `<div style="margin:10px 0">
  <p style="color:#888;margin:5px">Enter your name and choose a room to play with friends!</p>
  <input id="playerName" placeholder="Your Name" style="padding:8px;border:1px solid #333;background:#111;color:#fff;border-radius:4px;width:200px;margin:5px" value="Player">
  <br>
  <input id="roomCode" placeholder="Room Code (e.g. arena1)" style="padding:8px;border:1px solid #333;background:#111;color:#fff;border-radius:4px;width:200px;margin:5px" value="arena1">
  <br>
  <p style="color:#555;font-size:0.8rem;margin:8px 0">Choose your car:</p>
  <button class="btn" onclick="startMP('brawler')" style="margin:3px">🚗 Brawler</button>
  <button class="btn" onclick="startMP('speedster')" style="margin:3px">🏎️ Speedster</button>
  <button class="btn" onclick="startMP('tank')" style="margin:3px">🚛 Tank</button>
  <button class="btn" onclick="startMP('drifter')" style="margin:3px">🚙 Drifter</button>
  <br>
  <p style="color:#555;font-size:0.8rem;margin:12px 0">Or practice solo:</p>
  <button class="btn" onclick="startSP('brawler')" style="background:#333">🤖 Solo (vs AI)</button>
</div>`, false);

function startMP(car) {
  const name = document.getElementById('playerName').value || 'Racer';
  const room = document.getElementById('roomCode').value || 'arena1';
  window.startMultiplayer(name, car, room);
}

function startSP(car) {
  const name = document.getElementById('playerName').value || 'Racer';
  playerId = name;
  window.startSinglePlayer(car);
}
