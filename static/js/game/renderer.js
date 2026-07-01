// SKRT DERBY - Canvas Renderer
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.cameraX = 0;
    this.cameraY = 0;
    this.cameraShakeX = 0;
    this.cameraShakeY = 0;
    this.shakeIntensity = 0;
    this.shakeDuration = 0;

    // Particle system
    this.particles = [];
    this.sparks = [];

    // Screen flash
    this.flashAlpha = 0;
    this.flashColor = '#ffffff';

    // Skid marks
    this.skidMarks = [];
    this.skidMarkTimer = 0;

    // Floating damage numbers
    this.damageNumbers = [];
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  addScreenShake(intensity, duration = 0.3) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDuration = Math.max(this.shakeDuration, duration);
  }

  addFlash(color = '#ffffff', alpha = 0.3) {
    this.flashAlpha = alpha;
    this.flashColor = color;
  }

  spawnParticles(x, y, count, color, spread = 3, life = 0.5) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * spread * 100,
        vy: (Math.random() - 0.5) * spread * 100,
        life: life * (0.5 + Math.random() * 0.5),
        maxLife: life,
        color,
        size: 1 + Math.random() * 3,
      });
    }
  }

  spawnSparks(x, y, count, color = '#ffaa00') {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 300;
      this.sparks.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.2 + Math.random() * 0.5,
        maxLife: 0.7,
        color,
        size: 1 + Math.random() * 2,
      });
    }
  }

  update(dt) {
    // Update shake
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
      this.cameraShakeX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.cameraShakeY = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeIntensity *= 0.9;
    } else {
      this.cameraShakeX = 0;
      this.cameraShakeY = 0;
      this.shakeIntensity = 0;
    }

    // Flash fade
    if (this.flashAlpha > 0) {
      this.flashAlpha -= dt * 2;
    }

    // Update particles
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    // Update sparks
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.95;
      s.vy *= 0.95;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter(s => s.life > 0);

    // Update skid marks
    for (const skid of this.skidMarks) {
      skid.life -= dt;
    }
    this.skidMarks = this.skidMarks.filter(s => s.life > 0);

    // Update damage numbers
    for (const dn of this.damageNumbers) {
      dn.y -= 40 * dt;
      dn.life -= dt;
    }
    this.damageNumbers = this.damageNumbers.filter(d => d.life > 0);
  }

  addSkidMark(x, y, angle) {
    this.skidMarks.push({ x, y, angle, life: 3 });
    if (this.skidMarks.length > 200) this.skidMarks.shift();
  }

  addDamageNumber(x, y, amount, color = '#ff3d00') {
    this.damageNumbers.push({ x, y, text: Math.round(amount).toString(), color, life: 1.2 });
  }

  updateCamera(targetX, targetY) {
    this.cameraX += (targetX - this.width / 2 - this.cameraX) * 0.1;
    this.cameraY += (targetY - this.height / 2 - this.cameraY) * 0.1;
  }

  clear() {
    this.ctx.fillStyle = '#0a0a0f';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  render(gameState) {
    const ctx = this.ctx;
    this.clear();

    ctx.save();
    ctx.translate(
      -this.cameraX + this.cameraShakeX,
      -this.cameraY + this.cameraShakeY
    );

    // --- Arena Background ---
    this._drawArena(gameState.arena);

    // --- Walls ---
    this._drawWalls(gameState.arena.walls);

    // --- Checkpoints (race mode) ---
    if (gameState.checkpoints && gameState.checkpoints.length > 0) {
      this._drawCheckpoints(gameState.checkpoints, gameState.carCheckpoint);
    }

    // --- Power-ups ---
    this._drawPowerUps(gameState.powerUps);

    // --- Cars ---
    for (const car of gameState.cars) {
      if (car.health <= 0) {
        this._drawWreck(car);
      } else {
        this._drawCar(car);
      }
    }

    // --- Particles & Sparks ---
    this._drawParticles();
    this._drawSparks();
    this._drawSkidMarks();
    this._drawDamageNumbers();

    ctx.restore();

    // --- HUD (screen space, no camera transform) ---
    this._drawHUD(gameState);

    // --- Screen Flash ---
    if (this.flashAlpha > 0) {
      ctx.fillStyle = this.flashColor;
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalAlpha = 1;
    }
  }

  _drawArena(arena) {
    const ctx = this.ctx;

    // Arena floor
    ctx.fillStyle = '#111122';
    ctx.fillRect(arena.x, arena.y, arena.width, arena.height);

    // Grid pattern
    ctx.strokeStyle = '#1a1a33';
    ctx.lineWidth = 1;
    const gridSize = 50;
    for (let x = arena.x; x <= arena.x + arena.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, arena.y);
      ctx.lineTo(x, arena.y + arena.height);
      ctx.stroke();
    }
    for (let y = arena.y; y <= arena.y + arena.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(arena.x, y);
      ctx.lineTo(arena.x + arena.width, y);
      ctx.stroke();
    }

    // Arena border - neon glow
    ctx.strokeStyle = '#ff3d00';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ff3d00';
    ctx.shadowBlur = 15;
    ctx.strokeRect(arena.x, arena.y, arena.width, arena.height);
    ctx.shadowBlur = 0;

    // Inner border
    ctx.strokeStyle = '#ff3d0044';
    ctx.lineWidth = 1;
    ctx.strokeRect(arena.x + 5, arena.y + 5, arena.width - 10, arena.height - 10);
  }

  _drawWalls(walls) {
    const ctx = this.ctx;
    for (const wall of walls) {
      // Wall body
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(wall.x, wall.y, wall.width, wall.height);

      // Neon outline
      ctx.strokeStyle = '#ff3d00';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ff3d00';
      ctx.shadowBlur = 8;
      ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
      ctx.shadowBlur = 0;

      // Hazard stripes on walls
      ctx.fillStyle = '#ff3d0033';
      const stripeW = 8;
      for (let i = 0; i < wall.width; i += stripeW * 2) {
        if (wall.width > wall.height) {
          ctx.fillRect(wall.x + i, wall.y, stripeW, 4);
          ctx.fillRect(wall.x + i, wall.y + wall.height - 4, stripeW, 4);
        } else {
          ctx.fillRect(wall.x, wall.y + i, 4, stripeW);
          ctx.fillRect(wall.x + wall.width - 4, wall.y + i, 4, stripeW);
        }
      }
    }
  }

  _drawCheckpoints(checkpoints, carCheckpoint) {
    const ctx = this.ctx;
    for (const cp of checkpoints) {
      ctx.save();
      ctx.translate(cp.x, cp.y);
      ctx.rotate(cp.angle);

      // Gate posts
      const halfW = cp.width / 2;
      const postH = 30;
      
      // Post glow
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 12;
      
      // Left post
      ctx.fillStyle = '#00ff8866';
      ctx.fillRect(-halfW - 4, -postH / 2, 6, postH);
      // Right post
      ctx.fillRect(halfW - 2, -postH / 2, 6, postH);
      
      // Top bar
      ctx.fillStyle = '#00ff8844';
      ctx.fillRect(-halfW - 2, -postH / 2 - 4, cp.width, 4);
      
      ctx.shadowBlur = 0;

      // Checkpoint number
      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`CP${cp.index + 1}`, 0, -postH / 2 - 10);

      ctx.restore();
    }
  }

  _drawCar(car) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);

    const w = car.width;
    const h = car.height;

    // Shield glow
    if (car.shieldActive) {
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 20 + Math.sin(Date.now() * 0.01) * 5;
    }

    // Car body shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-w / 2 + 3, -h / 2 + 3, w, h);

    // Car body
    const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    const baseColor = car.color;
    grad.addColorStop(0, this._lightenColor(baseColor, 30));
    grad.addColorStop(0.5, baseColor);
    grad.addColorStop(1, this._darkenColor(baseColor, 30));
    ctx.fillStyle = grad;
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Windshield / cockpit
    ctx.fillStyle = '#111133';
    ctx.fillRect(-w / 4, -h / 3, w / 2, h / 2.5);
    ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
    ctx.fillRect(-w / 4 + 2, -h / 3 + 2, w / 2 - 4, h / 2.5 - 4);

    // Neon trim
    ctx.strokeStyle = this._lightenColor(baseColor, 40);
    ctx.lineWidth = 2;
    ctx.shadowColor = baseColor;
    ctx.shadowBlur = car.boostActive ? 15 : 5;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.shadowBlur = 0;

    // Direction indicator (front of car)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 5, -4);
    ctx.lineTo(w / 2 + 5, 0);
    ctx.lineTo(w / 2 - 5, 4);
    ctx.fill();

    // Boost flame
    if (car.boostActive) {
      const flameLength = 15 + Math.random() * 10;
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.moveTo(-w / 2, -6);
      ctx.lineTo(-w / 2 - flameLength, 0);
      ctx.lineTo(-w / 2, 6);
      ctx.fill();
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath();
      ctx.moveTo(-w / 2, -3);
      ctx.lineTo(-w / 2 - flameLength * 0.6, 0);
      ctx.lineTo(-w / 2, 3);
      ctx.fill();
    }

    // Ram bonus indicator
    if (car.ramBonus) {
      ctx.strokeStyle = '#ff3d00';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ff3d00';
      ctx.shadowBlur = 20;
      ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
      ctx.shadowBlur = 0;
    }

    // EMP disabled visual
    if (car.empDisabled > 0) {
      ctx.strokeStyle = '#00ccff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00ccff';
      ctx.shadowBlur = 15;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    // Health bar (above car, screen-aligned)
    this._drawHealthBar(car);

    // Player indicator
    if (car.isPlayer) {
      ctx.save();
      ctx.translate(car.x, car.y - h / 2 - 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('YOU', 0, 0);
      ctx.restore();
    }
  }

  _drawWreck(car) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);

    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#333333';
    ctx.fillRect(-car.width / 2, -car.height / 2, car.width, car.height);
    ctx.strokeStyle = '#ff3d00';
    ctx.lineWidth = 1;
    ctx.strokeRect(-car.width / 2, -car.height / 2, car.width, car.height);

    // Smoke puffs
    if (Math.random() < 0.5) {
      this.spawnParticles(car.x, car.y, 2, '#555555', 1, 1);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawHealthBar(car) {
    const ctx = this.ctx;
    const barWidth = 40;
    const barHeight = 5;
    const x = car.x - barWidth / 2;
    const y = car.y - car.height / 2 - 14;

    // Background
    ctx.fillStyle = '#00000088';
    ctx.fillRect(x - 1, y - 1, barWidth + 2, barHeight + 2);

    // Health fill
    const healthPct = Math.max(0, car.health) / 100;
    let color;
    if (healthPct > 0.6) color = '#00ff88';
    else if (healthPct > 0.3) color = '#ffaa00';
    else color = '#ff3d00';

    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth * healthPct, barHeight);

    // Border
    ctx.strokeStyle = '#ffffff44';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, barWidth, barHeight);
  }

  _drawPowerUps(powerUps) {
    const ctx = this.ctx;
    for (const pu of powerUps) {
      const pulse = 1 + Math.sin(Date.now() * 0.005) * 0.15;
      ctx.save();
      ctx.translate(pu.x, pu.y);
      ctx.scale(pulse, pulse);

      // Glow
      let glowColor;
      switch (pu.type) {
        case 'repair': glowColor = '#00ff88'; break;
        case 'speed': glowColor = '#00aaff'; break;
        case 'shield': glowColor = '#ffcc00'; break;
        case 'ram': glowColor = '#ff3d00'; break;
        case 'emp': glowColor = '#00ccff'; break;
        case 'shockwave': glowColor = '#ff8800'; break;
        default: glowColor = '#ffffff';
      }

      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 20;

      // Background circle
      ctx.fillStyle = glowColor + '33';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();

      // Icon border
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke();

      // Icon
      ctx.fillStyle = glowColor;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let icon = '?';
      switch (pu.type) {
        case 'repair': icon = '+'; break;
        case 'speed': icon = '»'; break;
        case 'shield': icon = '◈'; break;
        case 'ram': icon = '◆'; break;
        case 'emp': icon = '⚡'; break;
        case 'shockwave': icon = '◎'; break;
      }
      ctx.fillText(icon, 0, 0);

      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  _drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  _drawSparks() {
    const ctx = this.ctx;
    for (const s of this.sparks) {
      const alpha = s.life / s.maxLife;
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.02, s.y - s.vy * 0.02);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _drawSkidMarks() {
    const ctx = this.ctx;
    for (const skid of this.skidMarks) {
      const alpha = Math.min(0.4, skid.life / 3) * 0.5;
      ctx.strokeStyle = `rgba(30, 30, 30, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(skid.x - Math.cos(skid.angle) * 4, skid.y - Math.sin(skid.angle) * 4);
      ctx.lineTo(skid.x + Math.cos(skid.angle) * 4, skid.y + Math.sin(skid.angle) * 4);
      ctx.stroke();
    }
  }

  _drawDamageNumbers() {
    const ctx = this.ctx;
    for (const dn of this.damageNumbers) {
      const alpha = Math.min(1, dn.life / 0.3);
      ctx.fillStyle = dn.color;
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`-${dn.text}`, dn.x, dn.y);
    }
    ctx.globalAlpha = 1;
  }

  _drawHUD(gs) {
    const ctx = this.ctx;
    const player = gs.cars.find(c => c.isPlayer);
    if (!player) return;

    // Top bar background
    const barH = 50;
    ctx.fillStyle = '#000000aa';
    ctx.fillRect(0, 0, this.width, barH);

    // Health bar
    const healthBarX = 20;
    const healthBarY = 10;
    const healthBarW = 200;
    const healthBarH = 14;

    ctx.fillStyle = '#222222';
    ctx.fillRect(healthBarX, healthBarY, healthBarW, healthBarH);

    const hp = Math.max(0, player.health) / 100;
    const hpGrad = ctx.createLinearGradient(healthBarX, 0, healthBarX + healthBarW, 0);
    hpGrad.addColorStop(0, '#ff3d00');
    hpGrad.addColorStop(0.5, '#ff6600');
    hpGrad.addColorStop(1, '#00ff88');
    ctx.fillStyle = hpGrad;
    ctx.fillRect(healthBarX, healthBarY, healthBarW * hp, healthBarH);

    ctx.strokeStyle = '#ff3d00';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff3d00';
    ctx.shadowBlur = 5;
    ctx.strokeRect(healthBarX, healthBarY, healthBarW, healthBarH);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`HP: ${Math.ceil(Math.max(0, player.health))}%`, healthBarX + 4, healthBarY + 11);

    // Score
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#00ff88';
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 10;
    ctx.fillText(`SCORE: ${gs.score}`, this.width / 2, 20);
    ctx.shadowBlur = 0;

    // Timer
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#ffffff';
    if (gs.gameMode === 'race') {
      // Race mode: show lap counter instead of timer
      const pCar = gs.cars.find(c => c.isPlayer);
      const pInfo = pCar ? gs.carCheckpoint?.[pCar.id] : null;
      const lap = pInfo ? pInfo.lap + 1 : 1;
      const cp = pInfo ? pInfo.checkpoint + 1 : 1;
      const totalCP = gs.checkpoints ? gs.checkpoints.length : 6;
      ctx.fillText(`LAP ${lap}/${gs.totalLaps || 3} · CP ${cp}/${totalCP}`, this.width / 2, 40);
    } else {
      ctx.fillText(`TIME: ${gs.timeRemaining}s`, this.width / 2, 40);
    }

    // Alive count
    ctx.textAlign = 'right';
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#ff3d00';
    ctx.fillText(`CARS: ${gs.cars.filter(c => c.health > 0).length}/${gs.cars.length}`, this.width - 20, 20);

    // Boost indicator
    ctx.textAlign = 'right';
    ctx.font = '12px monospace';
    if (player.boostActive) {
      ctx.fillStyle = '#ffaa00';
      ctx.fillText(`BOOST: ${player.boostTimer.toFixed(1)}s`, this.width - 20, 40);
    } else if (player.boostCooldown > 0) {
      ctx.fillStyle = '#666666';
      ctx.fillText(`BOOST: ${player.boostCooldown.toFixed(1)}s`, this.width - 20, 40);
    } else {
      ctx.fillStyle = '#00ff88';
      ctx.fillText('BOOST: READY', this.width - 20, 40);
    }

    // Power-up indicators
    let puY = barH + 10;
    if (player.shieldActive) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#ffcc00';
      ctx.fillText(`🛡 SHIELD ${player.shieldTimer.toFixed(1)}s`, 10, puY);
      puY += 18;
    }
    if (player.ramBonus) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#ff3d00';
      ctx.fillText(`💥 RAM ${player.ramTimer.toFixed(1)}s`, 10, puY);
      puY += 18;
    }

    // Rankings (top right)
    ctx.textAlign = 'right';
    ctx.font = '10px monospace';
    const alive = gs.cars.filter(c => c.health > 0).sort((a, b) => b.health - a.health);
    for (let i = 0; i < Math.min(alive.length, 5); i++) {
      const c = alive[i];
      ctx.fillStyle = c.isPlayer ? '#00ff88' : '#888888';
      const name = c.isPlayer ? 'YOU' : c.name || `AI-${i}`;
      ctx.fillText(`${i + 1}. ${name} ${Math.ceil(c.health)}%`, this.width - 10, barH + 10 + i * 16);
    }
  }

  // --- Color Helpers ---

  _lightenColor(hex, amount) {
    let r, g, b;
    if (hex.startsWith('#')) {
      const num = parseInt(hex.slice(1), 16);
      r = (num >> 16) & 255;
      g = (num >> 8) & 255;
      b = num & 255;
    } else {
      return hex;
    }
    r = Math.min(255, r + amount);
    g = Math.min(255, g + amount);
    b = Math.min(255, b + amount);
    return `rgb(${r},${g},${b})`;
  }

  _darkenColor(hex, amount) {
    let r, g, b;
    if (hex.startsWith('#')) {
      const num = parseInt(hex.slice(1), 16);
      r = (num >> 16) & 255;
      g = (num >> 8) & 255;
      b = num & 255;
    } else {
      return hex;
    }
    r = Math.max(0, r - amount);
    g = Math.max(0, g - amount);
    b = Math.max(0, b - amount);
    return `rgb(${r},${g},${b})`;
  }

  renderMenu() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, this.width, this.height);

    // Animated background grid
    ctx.strokeStyle = '#ff3d0011';
    ctx.lineWidth = 1;
    for (let i = 0; i < this.width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, this.height);
      ctx.stroke();
    }
    for (let i = 0; i < this.height; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(this.width, i);
      ctx.stroke();
    }

    // Title
    ctx.fillStyle = '#ff3d00';
    ctx.font = `bold ${Math.min(72, this.width / 10)}px monospace`;
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff3d00';
    ctx.shadowBlur = 30;
    ctx.fillText('SKRT', this.width / 2, this.height / 2 - 60);
    ctx.fillText('DERBY', this.width / 2, this.height / 2 + 10);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.fillStyle = '#00ff88';
    ctx.font = '16px monospace';
    ctx.fillText('DEMOLITION ARENA', this.width / 2, this.height / 2 + 40);

    // Instructions
    ctx.fillStyle = '#ffffff88';
    ctx.font = '14px monospace';
    const instructions = [
      'WASD / Arrow Keys - Move',
      'SPACE - Boost',
      'Crash into opponents to destroy them!',
      'Collect power-ups for advantages',
    ];

    ctx.textAlign = 'left';
    const startY = this.height / 2 + 80;
    instructions.forEach((text, i) => {
      ctx.fillText(`▸ ${text}`, this.width / 2 - 150, startY + i * 25);
    });

    // Start prompt
    const alpha = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
    ctx.fillStyle = `rgba(255, 61, 0, ${alpha})`;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PRESS ENTER OR TAP TO START', this.width / 2, this.height / 2 + 200);

    // Controls hint
    ctx.fillStyle = '#ffffff44';
    ctx.font = '11px monospace';
    ctx.fillText('Player 2: IJKL keys', this.width / 2, this.height / 2 + 225);
  }

  renderGameOver(gs) {
    const ctx = this.ctx;
    ctx.fillStyle = '#000000cc';
    ctx.fillRect(0, 0, this.width, this.height);

    const player = gs.cars.find(c => c.isPlayer);
    const won = player && player.health > 0 && gs.cars.filter(c => c.health > 0).length <= 1;

    // Title
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.min(60, this.width / 12)}px monospace`;
    if (won) {
      ctx.fillStyle = '#00ff88';
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 30;
      ctx.fillText('VICTORY!', this.width / 2, this.height / 2 - 80);
    } else {
      ctx.fillStyle = '#ff3d00';
      ctx.shadowColor = '#ff3d00';
      ctx.shadowBlur = 30;
      ctx.fillText('WRECKED!', this.width / 2, this.height / 2 - 80);
    }
    ctx.shadowBlur = 0;

    // Stats
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px monospace';
    ctx.fillText(`Final Score: ${gs.score}`, this.width / 2, this.height / 2 - 20);
    ctx.fillText(`Kills: ${gs.kills}`, this.width / 2, this.height / 2 + 10);

    // Leaderboard
    ctx.font = '14px monospace';
    ctx.fillText('--- RANKINGS ---', this.width / 2, this.height / 2 + 50);
    const sorted = [...gs.cars].sort((a, b) => b.health - a.health);
    sorted.forEach((car, i) => {
      const name = car.isPlayer ? 'YOU' : (car.name || `AI ${i + 1}`);
      const alive = car.health > 0 ? 'ALIVE' : 'DEAD';
      ctx.fillStyle = car.isPlayer ? '#00ff88' : '#888888';
      ctx.fillText(`${i + 1}. ${name} - ${alive} (${Math.ceil(Math.max(0, car.health))}%)`,
        this.width / 2, this.height / 2 + 75 + i * 22);
    });

    // Restart prompt
    const alpha = 0.5 + Math.sin(Date.now() * 0.003) * 0.5;
    ctx.fillStyle = `rgba(255, 61, 0, ${alpha})`;
    ctx.font = 'bold 20px monospace';
    ctx.fillText('PRESS ENTER TO PLAY AGAIN', this.width / 2, this.height / 2 + 75 + sorted.length * 22 + 30);
  }
}

export default Renderer;
