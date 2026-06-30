/**
 * SKRT DERBY - Game Engine
 * Canvas-based 2D demolition derby
 */

// ── Canvas Setup ───────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let W, H;

function resize() {
  W = canvas.width = canvas.clientWidth;
  H = canvas.height = canvas.clientHeight;
}
resize();
window.addEventListener('resize', resize);

// ── Game State ─────────────────────────────────────
const STATE = { MENU:0, PLAYING:1, GAMEOVER:2 };
let gameState = STATE.MENU;
let score = 0, kills = 0, gameTime = 0, timer = 90;
let playerCar = null;
let cars = [], powerUps = [], particles = [];
const ARENA_MARGIN = 60;

// ── Input ──────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => { keys[e.key] = true; e.preventDefault(); });
window.addEventListener('keyup', e => { keys[e.key] = false; e.preventDefault(); });
function pressKey(k) { keys[k] = true; }
function releaseKey(k) { keys[k] = false; }

// ── Car Class ──────────────────────────────────────
const CAR_TYPES = {
  brawler: { speed:4.5, armor:150, handling:0.08, color:'#ff3d00', size:18 },
  speedster: { speed:6.5, armor:80, handling:0.06, color:'#00ff88', size:15 },
  tank: { speed:2.8, armor:250, handling:0.04, color:'#4488ff', size:24 },
  drifter: { speed:5.0, armor:100, handling:0.12, color:'#ff8800', size:17 },
  lightning: { speed:5.8, armor:70, handling:0.09, color:'#ffff00', size:16 },
};

class Car {
  constructor(type, x, y, angle, isPlayer) {
    const cfg = CAR_TYPES[type];
    this.type = type;
    this.x = x; this.y = y;
    this.angle = angle;
    this.speed = 0;
    this.maxSpeed = cfg.speed;
    this.accel = 0.15;
    this.friction = 0.96;
    this.handling = cfg.handling;
    this.maxHealth = cfg.armor;
    this.health = cfg.armor;
    this.size = cfg.size;
    this.color = cfg.color;
    this.isPlayer = isPlayer;
    this.alive = true;
    this.invincible = 0;
    this.damageFlash = 0;
  }

  update() {
    if (!this.alive) return;
    this.invincible = Math.max(0, this.invincible - 1);
    this.damageFlash = Math.max(0, this.damageFlash - 1);
    
    // Steering
    if (this.isPlayer) {
      if (keys['ArrowLeft'] || keys['a'] || keys['A']) this.angle -= this.handling;
      if (keys['ArrowRight'] || keys['d'] || keys['D']) this.angle += this.handling;
      if (keys['ArrowUp'] || keys['w'] || keys['W']) this.speed = Math.min(this.speed + this.accel, this.maxSpeed);
      else if (keys['ArrowDown'] || keys['s'] || keys['S']) this.speed = Math.max(this.speed - this.accel * 1.5, -this.maxSpeed * 0.5);
      else this.speed *= this.friction;
    }
    
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;
    
    // Wall collisions
    if (this.x - this.size < ARENA_MARGIN) { this.x = ARENA_MARGIN + this.size; this.speed *= -0.3; this.damage(5); }
    if (this.x + this.size > W - ARENA_MARGIN) { this.x = W - ARENA_MARGIN - this.size; this.speed *= -0.3; this.damage(5); }
    if (this.y - this.size < ARENA_MARGIN + 40) { this.y = ARENA_MARGIN + 40 + this.size; this.speed *= -0.3; this.damage(5); }
    if (this.y + this.size > H - ARENA_MARGIN) { this.y = H - ARENA_MARGIN - this.size; this.speed *= -0.3; this.damage(5); }
    
    if (this.health <= 0) { this.alive = false; this.explode(); }
  }

  damage(amount) {
    if (this.invincible > 0) return;
    this.health -= amount;
    this.damageFlash = 8;
    this.invincible = 5;
    spawnParticles(this.x, this.y, 5, '#ff3d00');
  }

  explode() {
    spawnParticles(this.x, this.y, 30, '#ff6600');
    spawnParticles(this.x, this.y, 15, '#ffff00');
    if (this.isPlayer) { score += 50; }
    else { kills++; score += 100; }
  }

  draw(ctx) {
    if (!this.alive) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    
    const flashColor = this.damageFlash > 0 ? '#fff' : this.color;
    
    // Car body
    ctx.fillStyle = flashColor;
    ctx.fillRect(-this.size, -this.size * 0.65, this.size * 2, this.size * 1.3);
    
    // Windshield
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(this.size * 0.3, -this.size * 0.4, this.size * 0.8, this.size * 0.8);
    
    // Wheels
    ctx.fillStyle = '#111';
    ctx.fillRect(-this.size - 3, -this.size * 0.7, 6, this.size * 0.35);
    ctx.fillRect(-this.size - 3, this.size * 0.35, 6, this.size * 0.35);
    ctx.fillRect(this.size - 3, -this.size * 0.7, 6, this.size * 0.35);
    ctx.fillRect(this.size - 3, this.size * 0.35, 6, this.size * 0.35);
    
    // Player indicator
    if (this.isPlayer) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(this.size + 5, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Health bar (above car)
    const barW = this.size * 2.5;
    const healthPct = this.health / this.maxHealth;
    ctx.fillStyle = '#333';
    ctx.fillRect(-barW/2, -this.size - 12, barW, 4);
    ctx.fillStyle = healthPct > 0.5 ? '#0f0' : healthPct > 0.25 ? '#ff0' : '#f00';
    ctx.fillRect(-barW/2, -this.size - 12, barW * healthPct, 4);
    
    ctx.restore();
  }
}

// ── PowerUps ────────────────────────────────────────
class PowerUp {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type; // 'repair', 'speed', 'shield'
    this.radius = 10;
    this.life = 600;
    this.pulse = 0;
  }
  update() { this.life--; this.pulse += 0.1; return this.life > 0; }
  draw(ctx) {
    const colors = { repair:'#00ff88', speed:'#ffdd00', shield:'#00d4ff' };
    ctx.fillStyle = colors[this.type] || '#fff';
    ctx.globalAlpha = 0.6 + Math.sin(this.pulse) * 0.4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Label
    ctx.fillStyle = '#000';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.type[0].toUpperCase(), this.x, this.y + 3);
  }
}

// ── Particles ───────────────────────────────────────
function spawnParticles(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 30 + Math.random() * 20,
      maxLife: 50,
      color,
      size: 1 + Math.random() * 3,
    });
  }
}

function updateParticles() {
  particles = particles.filter(p => {
    p.x += p.vx; p.y += p.vy;
    p.life--;
    return p.life > 0;
  });
}

function drawParticles(ctx) {
  particles.forEach(p => {
    const alpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    ctx.globalAlpha = 1;
  });
}

// ── AI ──────────────────────────────────────────────
function updateAI(car) {
  if (!car.alive || car.isPlayer) return;
  
  // Find nearest target
  let target = playerCar;
  let minDist = Infinity;
  cars.forEach(c => {
    if (c !== car && c.alive) {
      const d = Math.hypot(c.x - car.x, c.y - car.y);
      if (d < minDist && Math.random() > 0.3) { minDist = d; target = c; }
    }
  });
  
  if (target && target.alive) {
    const dx = target.x - car.x;
    const dy = target.y - car.y;
    const targetAngle = Math.atan2(dy, dx);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    
    if (Math.abs(diff) > 0.1) car.angle += Math.sign(diff) * car.handling * 0.7;
    
    // Speed control
    if (minDist > 150) car.speed = Math.min(car.speed + car.accel, car.maxSpeed * 0.8);
    else if (minDist < 60) car.speed = Math.min(car.speed + car.accel * 1.5, car.maxSpeed);
    else car.speed *= car.friction;
    
    // Avoid walls
    if (car.x < ARENA_MARGIN + 80) car.angle += 0.05;
    if (car.x > W - ARENA_MARGIN - 80) car.angle -= 0.05;
    if (car.y < ARENA_MARGIN + 120) car.angle += 0.05;
    if (car.y > H - ARENA_MARGIN - 80) car.angle -= 0.05;
  } else {
    car.speed *= car.friction;
    car.angle += (Math.random() - 0.5) * 0.05;
  }
}

// ── Collisions ──────────────────────────────────────
function checkCollisions() {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (!a.alive || !b.alive) continue;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const minDist = a.size + b.size;
      if (dist < minDist) {
        // Push apart
        const nx = (b.x - a.x) / dist;
        const ny = (b.y - a.y) / dist;
        const overlap = minDist - dist;
        a.x -= nx * overlap / 2;
        a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2;
        b.y += ny * overlap / 2;
        
        // Damage based on relative speed
        const relSpeed = Math.abs(a.speed - b.speed) + Math.abs((a.speed + b.speed) / 2) * 0.5;
        const damage = Math.min(relSpeed * 4, 40);
        a.damage(damage);
        b.damage(damage);
        
        // Bounce
        a.speed *= -0.5;
        b.speed *= -0.5;
      }
    }
  }
  
  // Car-powerup collisions
  cars.forEach(car => {
    if (!car.alive) return;
    powerUps.forEach((p, idx) => {
      const dist = Math.hypot(car.x - p.x, car.y - p.y);
      if (dist < car.size + p.radius) {
        if (p.type === 'repair') car.health = Math.min(car.health + 40, car.maxHealth);
        if (p.type === 'speed') { car.maxSpeed *= 1.5; setTimeout(() => { if(car.alive) car.maxSpeed = CAR_TYPES[car.type].speed; }, 5000); }
        if (p.type === 'shield') car.invincible = 180;
        powerUps.splice(idx, 1);
        if (car.isPlayer) score += 25;
      }
    });
  });
}

// ── Spawning ────────────────────────────────────────
function spawnPowerUp() {
  const types = ['repair', 'repair', 'speed', 'speed', 'shield'];
  const x = ARENA_MARGIN + 30 + Math.random() * (W - ARENA_MARGIN * 2 - 60);
  const y = ARENA_MARGIN + 70 + Math.random() * (H - ARENA_MARGIN * 2 - 70);
  powerUps.push(new PowerUp(x, y, types[Math.floor(Math.random() * types.length)]));
}

// ── Arena Drawing ───────────────────────────────────
function drawArena() {
  // Ground
  ctx.fillStyle = '#1a1a0a';
  ctx.fillRect(0, 0, W, H);
  
  // Grid pattern
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = ARENA_MARGIN; x < W - ARENA_MARGIN; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, ARENA_MARGIN + 40); ctx.lineTo(x, H - ARENA_MARGIN); ctx.stroke();
  }
  for (let y = ARENA_MARGIN + 40; y < H - ARENA_MARGIN; y += 40) {
    ctx.beginPath(); ctx.moveTo(ARENA_MARGIN, y); ctx.lineTo(W - ARENA_MARGIN, y); ctx.stroke();
  }
  
  // Walls
  ctx.strokeStyle = '#ff3d00';
  ctx.lineWidth = 4;
  ctx.strokeRect(ARENA_MARGIN, ARENA_MARGIN + 40, W - ARENA_MARGIN * 2, H - ARENA_MARGIN * 2 - 40);
  
  // Corner markers
  ctx.fillStyle = '#ff3d00';
  const corners = [[ARENA_MARGIN, ARENA_MARGIN+40], [W-ARENA_MARGIN, ARENA_MARGIN+40], [ARENA_MARGIN, H-ARENA_MARGIN], [W-ARENA_MARGIN, H-ARENA_MARGIN]];
  corners.forEach(([cx, cy]) => {
    ctx.fillRect(cx-8, cy-8, 16, 16);
  });
  
  // Obstacles
  ctx.fillStyle = '#222';
  // Center obstacle
  ctx.fillRect(W/2 - 40, H/2 - 40, 80, 80);
  ctx.fillStyle = '#333';
  ctx.fillRect(W/2 - 30, H/2 - 30, 60, 60);
}

// ── HUD ─────────────────────────────────────────────
function drawHUD() {
  document.getElementById('gameInfo').textContent = 
    `Time: ${Math.ceil(Math.max(0, timer))}s | Score: ${score.toLocaleString()} | Kills: ${kills} | Alive: ${cars.filter(c=>c.alive).length}`;
}

// ── Game Loop ───────────────────────────────────────
let lastTime = 0;
let powerUpTimer = 0;

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;
  
  if (gameState === STATE.PLAYING) {
    timer -= dt;
    gameTime += dt;
    
    // Update cars
    cars.forEach(c => c.update());
    cars.forEach(c => { if (!c.isPlayer) updateAI(c); });
    
    // Spawn powerups
    powerUpTimer += dt;
    if (powerUpTimer > 5 && powerUps.length < 3) { spawnPowerUp(); powerUpTimer = 0; }
    
    // Update powerups
    powerUps = powerUps.filter(p => p.update());
    
    // Collisions
    checkCollisions();
    
    // Score
    score += Math.floor(dt * 10);
    
    // Update particles
    updateParticles();
    
    // Check player alive
    if (!playerCar.alive) {
      gameState = STATE.GAMEOVER;
      showOverlay('WRECKED!', `Final Score: ${score.toLocaleString()} | Kills: ${kills}`, true);
      submitScore();
    }
    
    // Check timer
    if (timer <= 0) {
      gameState = STATE.GAMEOVER;
      score += playerCar.health * 2;
      showOverlay('TIME\'S UP!', `Final Score: ${score.toLocaleString()} | Kills: ${kills}`, true);
      submitScore();
    }
    
    // Check if player is last alive
    const aliveCount = cars.filter(c => c.alive && !c.isPlayer).length;
    if (aliveCount === 0 && playerCar.alive && gameState === STATE.PLAYING) {
      timer = Math.max(timer, 2);
    }
  }
  
  // Render
  drawArena();
  
  // Draw powerups
  powerUps.forEach(p => p.draw(ctx));
  
  // Draw cars (sorted by Y for depth)
  const sorted = [...cars].sort((a,b) => a.y - b.y);
  sorted.forEach(c => c.draw(ctx));
  
  // Draw particles
  drawParticles(ctx);
  
  // Draw HUD
  drawHUD();
  
  requestAnimationFrame(gameLoop);
}

// ── Overlay ─────────────────────────────────────────
function showOverlay(title, msg, showRestart) {
  document.getElementById('overlay').style.display = 'flex';
  document.getElementById('overlayTitle').textContent = title;
  document.getElementById('overlayMsg').innerHTML = msg + (showRestart ? '<br><br><button class="btn" onclick="startGame(\'brawler\')">🔄 PLAY AGAIN</button>' : '');
}

function hideOverlay() {
  document.getElementById('overlay').style.display = 'none';
}

// ── Game Start ──────────────────────────────────────
function startGame(carType) {
  score = 0; kills = 0; gameTime = 0; timer = 90;
  cars = []; powerUps = []; particles = [];
  
  const types = ['brawler','speedster','tank','drifter','lightning'];
  const spawnPoints = [
    [W*0.2, H*0.3], [W*0.8, H*0.3], [W*0.2, H*0.7], [W*0.8, H*0.7],
    [W*0.5, H*0.2], [W*0.5, H*0.8], [W*0.15, H*0.5], [W*0.85, H*0.5],
  ];
  
  // Player
  playerCar = new Car(carType, W * 0.5, H * 0.8, -Math.PI/2, true);
  cars.push(playerCar);
  
  // AI opponents
  for (let i = 0; i < 7; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const [sx, sy] = spawnPoints[i];
    cars.push(new Car(type, sx, sy, Math.random() * Math.PI * 2, false));
  }
  
  gameState = STATE.PLAYING;
  hideOverlay();
}

async function submitScore() {
  try {
    await fetch('/api/scores', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ user_id: 1, score, kills, survival_time: gameTime, car_type: playerCar.type, arena: 'scrapyard' })
    });
  } catch(e) {}
}

// ── Init ────────────────────────────────────────────
// Start loop
lastTime = performance.now();
requestAnimationFrame(gameLoop);

// Show menu on load
window.startGame = startGame;
showOverlay('SKRT DERBY', 'Choose your car and enter the arena!', false);
