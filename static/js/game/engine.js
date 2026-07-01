// SKRT DERBY - GameEngine (ties all modules together)
import AudioEngine from './audio.js';
import InputHandler from './input.js';
import PhysicsEngine from './physics.js';
import Renderer from './renderer.js';
import AIDriver from './ai.js';

const CAR_TYPES = {
  brawler:  { speed: 160, armor: 150, turnSpeed: 3.5,  width: 36, height: 22, color: '#ff3d00', name: 'Brawler' },
  speedster:{ speed: 220, armor: 80,  turnSpeed: 3.0,  width: 30, height: 18, color: '#00ff88', name: 'Speedster' },
  tank:     { speed: 110, armor: 250, turnSpeed: 2.2,  width: 48, height: 28, color: '#4488ff', name: 'Tank' },
  drifter:  { speed: 170, armor: 110, turnSpeed: 4.5,  width: 34, height: 20, color: '#ff8800', name: 'Drifter' },
  lightning:{ speed: 200, armor: 75,  turnSpeed: 3.8,  width: 32, height: 18, color: '#ffff00', name: 'Lightning' },
};

const POWERUP_TYPES = ['repair', 'speed', 'shield', 'ram', 'mine', 'missile', 'oil', 'emp', 'shockwave'];
const AI_NAMES = ['CrashBot', 'Smasher', 'WreckKing', 'MetalMan', 'TurboG', 'Rusty', 'IronClad',
                   'Venom', 'Blaze', 'Phantom', 'Crusher', 'Razor', 'Thunder', 'Inferno', 'Glitch'];

const ARENA_LAYOUTS = ['classic', 'circular', 'figure8', 'cross', 'gauntlet', 'open'];

function generateArena(layout, width, height, random) {
  const margin = 40;
  const arena = {
    x: margin,
    y: margin,
    width: width - margin * 2,
    height: height - margin * 2,
    walls: [],
    layout,
  };

  const aw = arena.width, ah = arena.height;
  const ax = arena.x, ay = arena.y;

  switch (layout) {
    case 'circular':
      // Central circular pillar
      const cx = ax + aw / 2, cy = ay + ah / 2;
      const r = Math.min(aw, ah) * 0.15;
      // Approximate circle with small walls
      const segments = 16;
      for (let i = 0; i < segments; i++) {
        const a1 = (i / segments) * Math.PI * 2;
        const a2 = ((i + 1) / segments) * Math.PI * 2;
        const x1 = cx + Math.cos(a1) * r;
        const y1 = cy + Math.sin(a1) * r;
        arena.walls.push({ x: x1, y: y1, width: 12, height: 12 });
      }
      // Corner obstacles
      arena.walls.push({ x: ax + 20, y: ay + 20, width: 60, height: 20 });
      arena.walls.push({ x: ax + aw - 80, y: ay + 20, width: 60, height: 20 });
      arena.walls.push({ x: ax + 20, y: ay + ah - 40, width: 60, height: 20 });
      arena.walls.push({ x: ax + aw - 80, y: ay + ah - 40, width: 60, height: 20 });
      break;

    case 'figure8':
      // Two central obstacles creating figure-8 path
      arena.walls.push({ x: ax + aw * 0.3 - 30, y: ay + ah * 0.35 - 30, width: 60, height: 60 });
      arena.walls.push({ x: ax + aw * 0.7 - 30, y: ay + ah * 0.65 - 30, width: 60, height: 60 });
      // Connecting walls
      arena.walls.push({ x: ax + aw * 0.25, y: ay + ah * 0.5 - 10, width: aw * 0.5, height: 20 });
      // Corner blockers
      arena.walls.push({ x: ax, y: ay, width: 80, height: 20 });
      arena.walls.push({ x: ax + aw - 80, y: ay, width: 80, height: 20 });
      arena.walls.push({ x: ax, y: ay + ah - 20, width: 80, height: 20 });
      arena.walls.push({ x: ax + aw - 80, y: ay + ah - 20, width: 80, height: 20 });
      break;

    case 'cross':
      // Cross-shaped barriers
      const cx2 = ax + aw / 2, cy2 = ay + ah / 2;
      arena.walls.push({ x: cx2 - 15, y: ay + 50, width: 30, height: ah * 0.35 });
      arena.walls.push({ x: cx2 - 15, y: ay + ah * 0.55, width: 30, height: ah * 0.35 });
      arena.walls.push({ x: ax + 50, y: cy2 - 15, width: aw * 0.35, height: 30 });
      arena.walls.push({ x: ax + aw * 0.55, y: cy2 - 15, width: aw * 0.35, height: 30 });
      break;

    case 'gauntlet':
      // Zig-zag barriers
      for (let i = 0; i < 6; i++) {
        const gx = ax + (aw / 7) * (i + 1);
        const gy = ay + (i % 2 === 0 ? ah * 0.25 : ah * 0.65);
        arena.walls.push({ x: gx - 15, y: gy - 20, width: 30, height: 40 });
      }
      break;

    case 'open':
      // Minimal obstacles - just a few small pillars
      const pw = Math.min(aw, ah);
      arena.walls.push({ x: ax + aw * 0.3, y: ay + ah * 0.4, width: 20, height: 20 });
      arena.walls.push({ x: ax + aw * 0.7, y: ay + ah * 0.6, width: 20, height: 20 });
      arena.walls.push({ x: ax + aw * 0.5, y: ay + ah * 0.2, width: 20, height: 20 });
      arena.walls.push({ x: ax + aw * 0.2, y: ay + ah * 0.7, width: 20, height: 20 });
      break;

    case 'classic':
    default:
      // Original random walls
      const numWalls = 2 + Math.floor(random() * 4);
      for (let i = 0; i < numWalls; i++) {
        const isHorizontal = random() > 0.5;
        const w = isHorizontal ? 80 + random() * 120 : 20 + random() * 30;
        const h = isHorizontal ? 20 + random() * 30 : 80 + random() * 120;
        const wx = ax + 100 + random() * (aw - 200 - w);
        const wy = ay + 100 + random() * (ah - 200 - h);
        arena.walls.push({ x: wx, y: wy, width: w, height: h });
      }
      break;
  }

  return arena;
}

export default class GameEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.audio = new AudioEngine();
    this.input = new InputHandler();
    this.renderer = new Renderer(canvas);
    this.physics = null;

    this.state = 'menu'; // menu, countdown, playing, gameover
    this.cars = [];
    this.powerUps = [];
    this.arena = null;
    this.walls = [];
    this.obstacles = [];

    this.score = 0;
    this.kills = 0;
    this.timeRemaining = 120;
    this.countdownTimer = 0;
    this.lastTime = 0;
    this.animFrame = null;

    // Config
    this.config = {
      playerCount: 1,
      totalCars: 8,
      aiDifficulty: 'medium',
      gameTime: 120,
      volume: 0.5,
      carType: 'brawler',
      playerName: 'Racer',
      arenaLayout: 'classic',
      gameMode: 'deathmatch', // deathmatch, team, battleroyale
    };

    // AI drivers
    this.aiDrivers = [];

    // Multiplayer
    this.ws = null;
    this.playerId = null;
    this.roomId = null;
    this.multiplayer = false;
    this.remotePlayers = {};

    // Power-up spawn timer
    this.powerUpTimer = 0;
    this.maxPowerUps = 4;

    // Environmental hazards
    this.mines = [];
    this.missiles = [];
    this.oilSlicks = [];

    // Game mode state
    this.shrinkZone = null;
    this.shrinkTarget = null;
    this.killFeed = [];
    
    // Chat system
    this.chatMessages = [];
    this.chatOpen = false;
    this.chatInput = '';
    
    // Spectator mode
    this.spectating = null;  // car id being spectated
    this.skidMarks = [];
  }

  setConfig(cfg) {
    Object.assign(this.config, cfg);
  }

  init() {
    this.audio.init();
    this.renderer.resize(this.canvas.clientWidth, this.canvas.clientHeight);

    window.addEventListener('resize', () => {
      this.renderer.resize(this.canvas.clientWidth, this.canvas.clientHeight);
    });

    // Chat keyboard listener
    this._chatKeyHandler = (e) => {
      if (this.chatOpen && this.state === 'playing') {
        if (this.handleChatKey(e.key)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    document.addEventListener('keydown', this._chatKeyHandler);

    // Start game loop
    this.lastTime = performance.now();
    this._loop(this.lastTime);
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.input.destroy();
    this.audio.stopMusic();
    if (this.ws) this.ws.close();
    if (this._chatKeyHandler) document.removeEventListener('keydown', this._chatKeyHandler);
  }

  // ── Multiplayer ────────────────────────────────────

  connectMultiplayer(room, playerName, carType) {
    this.multiplayer = true;
    this.config.playerName = playerName;
    this.config.carType = carType;
    this.roomId = room;
    this.playerId = playerName.toLowerCase().replace(/\s/g, '') + '_' + Math.random().toString(36).substr(2, 5);

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}/ws/game`);

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({ type: 'join', room, name: playerName, car: carType }));
      this.state = 'lobby';
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this._handleWSMessage(msg);
    };

    this.ws.onclose = () => {
      if (this.state === 'playing') {
        this.state = 'gameover';
      }
    };

    this.ws.onerror = () => {
      // Fallback to single player
      console.warn('WebSocket failed, falling back to single player');
      this.multiplayer = false;
      this.startSinglePlayer();
    };
  }

  _handleWSMessage(msg) {
    switch (msg.type) {
      case 'player_joined':
        this._onPlayerJoined(msg);
        break;
      case 'player_left':
        this._onPlayerLeft(msg);
        break;
      case 'game_start':
        this._onMultiplayerStart(msg);
        break;
      case 'game_update':
        this._onGameUpdate(msg);
        break;
      case 'kill_feed':
        this._onKillFeed(msg);
        break;
      case 'game_over':
        this._onGameOver(msg);
        break;
      case 'chat':
        if (msg.from && msg.msg) {
          this.addChatMessage(msg.from, msg.msg);
        }
        break;
    }
  }

  _onPlayerJoined(msg) {
    // Update lobby UI
  }

  _onPlayerLeft(msg) {
    if (this.cars[msg.id]) {
      this.renderer.spawnParticles(this.cars[msg.id].x, this.cars[msg.id].y, 20, '#ffffff');
      this.cars[msg.id].health = 0;
    }
  }

  _onMultiplayerStart(msg) {
    this._startGame(msg.players, msg.seed);
  }

  _onGameUpdate(msg) {
    if (msg.players) {
      msg.players.forEach(p => {
        if (p.id !== this.playerId && this.cars[p.id]) {
          const car = this.cars[p.id];
          car.x = p.x;
          car.y = p.y;
          car.angle = p.angle;
          car.health = p.health;
          car.speed = p.speed || 0;
        }
      });
    }
    if (msg.powerUps) this.powerUps = msg.powerUps;
    if (msg.timer !== undefined) this.timeRemaining = msg.timer;
  }

  _onKillFeed(msg) {
    // Flash kill message
    this.renderer.addFlash('#ff3d00', 0.15);
  }

  _onGameOver(msg) {
    this.state = 'gameover';
    if (this.ws) this.ws.close();
  }

  _sendWS(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // ── Single Player Start ────────────────────────────

  startSinglePlayer() {
    this.multiplayer = false;
    const players = {};

    // Player
    this.playerId = 'local_' + Math.random().toString(36).substr(2, 5);
    players[this.playerId] = { id: this.playerId, name: this.config.playerName, car: this.config.carType, isPlayer: true };

    // AI opponents
    const aiCount = this.config.totalCars - this.config.playerCount;
    const types = Object.keys(CAR_TYPES);
    for (let i = 0; i < aiCount; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const id = 'ai_' + i;
      players[id] = { id, name: AI_NAMES[i % AI_NAMES.length], car: type, isPlayer: false };
    }

    this._startGame(players, Math.floor(Math.random() * 99999));
  }

  // ── Game Start ──────────────────────────────────────

  _startGame(players, seed) {
    // Seed RNG (simple)
    let rng = seed;
    const random = () => { rng = (rng * 16807) % 2147483647; return (rng - 1) / 2147483646; };

    // Create arena
    this.arena = generateArena(
      this.config.arenaLayout || 'classic',
      this.renderer.width,
      this.renderer.height,
      random
    );

    // Init physics
    this.physics = new PhysicsEngine({
      x: this.arena.x,
      y: this.arena.y,
      width: this.arena.width,
      height: this.arena.height,
    });
    this.physics.setWalls(this.arena.walls);

    // Reset state
    this.cars = [];
    this.powerUps = [];
    this.mines = [];
    this.missiles = [];
    this.oilSlicks = [];
    this.score = 0;
    this.kills = 0;
    this.timeRemaining = this.config.gameTime;
    this.countdownTimer = 3;
    this.aiDrivers = [];
    this.powerUpTimer = 0;
    this.killFeed = [];

    // Battle royale: start with large zone
    if (this.config.gameMode === 'battleroyale') {
      this.shrinkZone = {
        x: this.arena.x + this.arena.width / 2,
        y: this.arena.y + this.arena.height / 2,
        radius: Math.max(this.arena.width, this.arena.height) * 0.7,
      };
      this.shrinkTarget = {
        x: this.arena.x + this.arena.width / 2 + (random() - 0.5) * this.arena.width * 0.3,
        y: this.arena.y + this.arena.height / 2 + (random() - 0.5) * this.arena.height * 0.3,
        radius: 120,
      };
    }

    // Team assignments for team deathmatch
    const numTeams = this.config.gameMode === 'team' ? 2 : 0;
    const playerEntries = Object.entries(players);
    const numAI = playerEntries.filter(([id, p]) => !p.isPlayer).length;
    const teamAI = Math.ceil(numAI / numTeams);

    // Spawn positions (around edges)
    const spawns = this._generateSpawns(Object.keys(players).length, random);
    let idx = 0;

    for (const [id, p] of Object.entries(players)) {
      const cfg = CAR_TYPES[p.car] || CAR_TYPES.brawler;
      const [sx, sy] = spawns[idx++] || [this.renderer.width / 2, this.renderer.height / 2];
      const angle = Math.atan2(this.renderer.height / 2 - sy, this.renderer.width / 2 - sx);

      const car = {
        id,
        name: p.name,
        x: sx,
        y: sy,
        angle,
        speed: 0,
        angularVel: 0,
        maxSpeed: cfg.speed,
        acceleration: cfg.speed * 0.015,
        friction: 0.97,
        turnSpeed: cfg.turnSpeed,
        width: cfg.width,
        height: cfg.height,
        color: cfg.color,
        health: cfg.armor,
        maxHealth: cfg.armor,
        isPlayer: p.isPlayer || false,
        playerIndex: p.isPlayer ? 0 : -1,
        team: numTeams > 0 ? (p.isPlayer ? 0 : Math.floor(idx / teamAI) % numTeams) : -1,
        boostActive: false,
        boostTimer: 0,
        boostCooldown: 0,
        shieldActive: false,
        shieldTimer: 0,
        ramBonus: false,
        ramTimer: 0,
        empDisabled: 0,
        lastWallHit: 0,
        input: { throttle: 0, brake: 0, steer: 0, boost: false },
      };

      this.cars.push(car);

      // Create AI driver for non-player cars
      if (!p.isPlayer) {
        this.aiDrivers.push({
          carId: id,
          driver: new AIDriver(this.config.aiDifficulty),
        });
      }

      // Start engine sound for player
      if (p.isPlayer) {
        this.audio.startEngine(id);
      }
    }

    // Start music
    this.audio.startMusic();
    this.audio.setMasterVolume(this.config.volume);

    this.state = 'countdown';
  }

  _generateSpawns(count, random) {
    const spawns = [];
    const margin = 60;
    const w = this.renderer.width;
    const h = this.renderer.height;

    for (let i = 0; i < count; i++) {
      const side = Math.floor(random() * 4);
      let x, y;
      switch (side) {
        case 0: x = margin + random() * (w - margin * 2); y = margin; break; // top
        case 1: x = w - margin; y = margin + random() * (h - margin * 2); break; // right
        case 2: x = margin + random() * (w - margin * 2); y = h - margin; break; // bottom
        case 3: x = margin; y = margin + random() * (h - margin * 2); break; // left
      }
      spawns.push([x, y]);
    }
    return spawns;
  }

  // ── Game Loop ───────────────────────────────────────

  _loop(timestamp) {
    this.animFrame = requestAnimationFrame((t) => this._loop(t));
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    if (this.state === 'menu') {
      this._updateMenu(dt);
    } else if (this.state === 'lobby') {
      this._updateLobby(dt);
    } else if (this.state === 'countdown') {
      this._updateCountdown(dt);
    } else if (this.state === 'playing') {
      this._updatePlaying(dt);
    } else if (this.state === 'gameover') {
      this._updateGameOver(dt);
    }
  }

  _updateMenu(dt) {
    this.renderer.renderMenu();

    // Check for start input
    if (this.input.wasJustPressed('Enter') || this.input.wasJustPressed('Space')) {
      this.startSinglePlayer();
    }
    // Touch/click to start
    if (this.input.onAnyInput) {
      // Will be triggered on first interaction
    }
  }

  _updateLobby(dt) {
    this.renderer.clear();
    const ctx = this.renderer.ctx;
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WAITING FOR PLAYERS...', this.renderer.width / 2, this.renderer.height / 2);
    ctx.fillText(`Room: ${this.roomId}`, this.renderer.width / 2, this.renderer.height / 2 + 40);
  }

  _updateCountdown(dt) {
    this.countdownTimer -= dt;

    // Render arena with cars in starting positions
    this.renderer.clear();
    const ctx = this.renderer.ctx;

    // Draw arena
    ctx.fillStyle = '#111122';
    ctx.fillRect(this.arena.x, this.arena.y, this.arena.width, this.arena.height);
    ctx.strokeStyle = '#ff3d00';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ff3d00';
    ctx.shadowBlur = 15;
    ctx.strokeRect(this.arena.x, this.arena.y, this.arena.width, this.arena.height);
    ctx.shadowBlur = 0;

    this.renderer.update(dt);

    // Countdown number
    const num = Math.ceil(this.countdownTimer);
    const alpha = this.countdownTimer % 1;
    ctx.fillStyle = num > 0 ? `rgba(255, 61, 0, ${alpha < 0.5 ? alpha * 2 : 1})` : '#00ff88';
    ctx.font = `bold ${Math.min(120, this.renderer.width / 6)}px monospace`;
    ctx.textAlign = 'center';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 40;
    ctx.fillText(num > 0 ? num : 'GO!', this.renderer.width / 2, this.renderer.height / 2);
    ctx.shadowBlur = 0;

    // Draw cars at spawn
    for (const car of this.cars) {
      this.renderer._drawCar(car);
    }

    if (this.countdownTimer <= -0.5) {
      this.state = 'playing';
      this.audio.countdownGo();
    } else if (num > 0 && Math.abs(this.countdownTimer - Math.round(this.countdownTimer)) < dt) {
      this.audio.countdown();
    }
  }

  _updatePlaying(dt) {
    this.timeRemaining -= dt;

    // Update renderer (camera shake, particles, etc)
    this.renderer.update(dt);

    // Spawn power-ups
    this.powerUpTimer += dt;
    if (this.powerUpTimer > 4 && this.powerUps.length < this.maxPowerUps) {
      this.powerUpTimer = 0;
      this._spawnPowerUp();
    }

    // Process player inputs
    const players = this.cars.filter(c => c.isPlayer);
    for (const car of players) {
      car.empDisabled = Math.max(0, car.empDisabled - dt);
      if (car.empDisabled > 0) {
        car.input = { throttle: 0, brake: 0, steer: 0, boost: false };
      } else {
        car.input = this.input.getPlayerInput(car.playerIndex);
      }
    }

    // Process AI
    for (const ai of this.aiDrivers) {
      const car = this.cars.find(c => c.id === ai.carId);
      if (car && car.health > 0) {
        car.empDisabled = Math.max(0, car.empDisabled - dt);
        if (car.empDisabled > 0) {
          car.input = { throttle: 0, brake: 0.5, steer: 0, boost: false };
        } else {
          car.input = ai.driver.update(car, this.cars, this.arena.walls, this.powerUps, this.arena, dt);
        }
      }
    }

    // Update physics
    let totalKills = 0;
    for (const car of this.cars) {
      if (car.health <= 0) continue;

      this.physics.updateCar(car, dt);

      // Wall collisions
      const wallHit = this.physics.checkWallCollisions(car);
      if (wallHit.collided && wallHit.impactForce > 5) {
        if (car.isPlayer) {
          this.renderer.addScreenShake(wallHit.impactForce * 0.03, 0.15);
          this.renderer.spawnSparks(wallHit.point.x, wallHit.point.y, 5, '#ff6600');
          this.audio.crash(wallHit.impactForce * 0.02);
        }
        this.renderer.addDamageNumber(car.x, car.y - car.height/2, wallHit.impactForce * 0.15, '#ff6600');
      }

      // Car collisions
      const carHit = this.physics.checkCarCollisions(car, this.cars);
      if (carHit.collided) {
        if (car.isPlayer || (carHit.otherCar && carHit.otherCar.isPlayer)) {
          this.renderer.addScreenShake(carHit.impactForce * 0.02, 0.2);
          this.renderer.spawnSparks(carHit.point.x, carHit.point.y, 10, '#ffaa00');
          this.renderer.spawnParticles(carHit.point.x, carHit.point.y, 6, '#ff6600', 2, 0.4);
          this.audio.crash(carHit.impactForce * 0.03);
        }
        this.renderer.addDamageNumber(carHit.point.x, carHit.point.y - 10, carHit.impactForce * 0.25, '#ff3d00');
      }

      // Skid marks when turning at speed
      if (car.health > 0 && Math.abs(car.speed) > 40 && Math.abs(car.angularVel) > 0.5) {
        this.renderer.addSkidMark(car.x, car.y, car.angle);
      }

      // Power-up timers
      this.physics.updateCarTimers(car, dt);

      // Check for car death
      if (car.health <= 0) {
        this._onCarDeath(car);
      }
    }

    // Power-up collection
    const collected = this.physics.updatePowerUps(this.powerUps, this.cars, dt);
    for (const pu of collected) {
      const collector = this.cars.find(c => {
        const dx = c.x - pu.x, dy = c.y - pu.y;
        return Math.sqrt(dx * dx + dy * dy) < 30;
      });
      if (collector && collector.isPlayer) {
        this.audio.powerUp();
        this.score += 25;
      }
    }

    // ── New power-up effects ──────────────────────────
    // Mines — place behind car, damage anyone who drives over them
    for (const car of this.cars) {
      if (car.health <= 0) continue;
      if (car.dropMine) {
        car.dropMine = false;
        const bx = car.x - Math.cos(car.angle) * car.width;
        const by = car.y - Math.sin(car.angle) * car.width;
        this.mines.push({ x: bx, y: by, life: 15, ownerId: car.id });
        if (car.isPlayer) this.score += 10;
      }
      if (car.fireMissile) {
        car.fireMissile = false;
        this.missiles.push({
          x: car.x, y: car.y,
          vx: Math.cos(car.angle) * 400,
          vy: Math.sin(car.angle) * 400,
          life: 2, ownerId: car.id
        });
        if (car.isPlayer) this.score += 10;
      }
      if (car.dropOil) {
        car.dropOil = false;
        const ox = car.x - Math.cos(car.angle) * car.width;
        const oy = car.y - Math.sin(car.angle) * car.width;
        this.oilSlicks.push({ x: ox, y: oy, life: 10, radius: 30 + Math.random() * 20 });
        if (car.isPlayer) this.score += 5;
      }
      // EMP blast
      if (car.doEMP) {
        car.doEMP = false;
        const empRadius = 180;
        for (const other of this.cars) {
          if (other.id === car.id || other.health <= 0) continue;
          const dx = other.x - car.x, dy = other.y - car.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < empRadius) {
            other.speed *= 0.2;
            other.empDisabled = 2.0; // seconds of no control
            this.renderer.spawnParticles(other.x, other.y, 8, '#00ccff', 2, 0.5);
          }
        }
        this.renderer.spawnParticles(car.x, car.y, 20, '#00ccff', 6, 0.8);
        this.renderer.addFlash('#0088ff', 0.2);
        this.audio.empBlast();
        if (car.isPlayer) this.score += 30;
      }
      // Shockwave
      if (car.doShockwave) {
        car.doShockwave = false;
        const waveRadius = 200;
        for (const other of this.cars) {
          if (other.id === car.id || other.health <= 0) continue;
          const dx = other.x - car.x, dy = other.y - car.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < waveRadius && dist > 1) {
            const force = (1 - dist / waveRadius) * 300;
            other.x += (dx / dist) * force * dt;
            other.y += (dy / dist) * force * dt;
            other.speed *= -0.5;
            other.health -= 10;
            this.renderer.spawnSparks(other.x, other.y, 4, '#ff8800');
          }
        }
        this.renderer.spawnParticles(car.x, car.y, 30, '#ff8800', 8, 0.7);
        this.renderer.addScreenShake(20, 0.5);
        this.renderer.addFlash('#ff8800', 0.3);
        this.audio.shockwaveSound();
        if (car.isPlayer) this.score += 40;
      }
    }

    // Update mines — check car collisions
    for (let mi = this.mines.length - 1; mi >= 0; mi--) {
      const mine = this.mines[mi];
      mine.life -= dt;
      if (mine.life <= 0) { this.mines.splice(mi, 1); continue; }
      for (const car of this.cars) {
        if (car.health <= 0 || car.id === mine.ownerId) continue;
        const dx = car.x - mine.x, dy = car.y - mine.y;
        if (Math.sqrt(dx*dx + dy*dy) < car.width/2 + 12) {
          car.health -= 40;
          car.speed *= 0.3;
          this.renderer.spawnParticles(mine.x, mine.y, 15, '#ff3d00', 3, 0.5);
          this.renderer.addScreenShake(8, 0.3);
          this.audio.explosion();
          if (car.isPlayer) this.score += 50;
          this.mines.splice(mi, 1);
          break;
        }
      }
    }

    // Update missiles
    for (let mi = this.missiles.length - 1; mi >= 0; mi--) {
      const missile = this.missiles[mi];
      missile.x += missile.vx * dt;
      missile.y += missile.vy * dt;
      missile.life -= dt;
      if (missile.life <= 0) { this.missiles.splice(mi, 1); continue; }
      // Wall bounce
      if (missile.x < this.arena.x || missile.x > this.arena.x + this.arena.width ||
          missile.y < this.arena.y || missile.y > this.arena.y + this.arena.height) {
        this.renderer.spawnParticles(missile.x, missile.y, 8, '#ff8800', 2, 0.3);
        this.missiles.splice(mi, 1); continue;
      }
      for (const wall of this.arena.walls) {
        if (missile.x >= wall.x && missile.x <= wall.x + wall.width &&
            missile.y >= wall.y && missile.y <= wall.y + wall.height) {
          this.renderer.spawnParticles(missile.x, missile.y, 8, '#ff8800', 2, 0.3);
          this.missiles.splice(mi, 1); break;
        }
      }
      if (mi < 0 || mi >= this.missiles.length) continue;
      // Hit cars
      for (const car of this.cars) {
        if (car.health <= 0 || car.id === missile.ownerId) continue;
        const dx = car.x - missile.x, dy = car.y - missile.y;
        if (Math.sqrt(dx*dx + dy*dy) < car.width/2 + 6) {
          car.health -= 30;
          car.speed *= 0.5;
          this.renderer.spawnParticles(missile.x, missile.y, 10, '#ff8800', 2, 0.4);
          this.renderer.addScreenShake(5, 0.2);
          if (car.isPlayer) this.score += 75;
          this.missiles.splice(mi, 1);
          break;
        }
      }
    }

    // Update oil slicks — slow cars
    for (let oi = this.oilSlicks.length - 1; oi >= 0; oi--) {
      const oil = this.oilSlicks[oi];
      oil.life -= dt;
      if (oil.life <= 0) { this.oilSlicks.splice(oi, 1); continue; }
      for (const car of this.cars) {
        if (car.health <= 0) continue;
        const dx = car.x - oil.x, dy = car.y - oil.y;
        if (Math.sqrt(dx*dx + dy*dy) < oil.radius) {
          car.speed *= 0.85;
          // Skid effect
          if (Math.random() < 0.1 && car.isPlayer) {
            car.angularVel += (Math.random() - 0.5) * 2;
          }
        }
      }
    }

    // Update engine sounds
    for (const car of this.cars) {
      if (car.isPlayer && car.health > 0) {
        this.audio.updateEngine(car.id, car.speed, car.health);
      }
    }

    // Score over time
    this.score += Math.floor(dt * 10);

    // Send multiplayer state
    if (this.multiplayer) {
      this._sendWS({
        type: 'game_state',
        x: this.cars.find(c => c.isPlayer)?.x || 0,
        y: this.cars.find(c => c.isPlayer)?.y || 0,
        angle: this.cars.find(c => c.isPlayer)?.angle || 0,
        health: this.cars.find(c => c.isPlayer)?.health || 0,
      });
    }

    // ── Battle Royale shrink zone ─────────────────────
    if (this.config.gameMode === 'battleroyale' && this.shrinkZone && this.shrinkTarget) {
      // Shrink zone toward target
      this.shrinkZone.radius += (this.shrinkTarget.radius - this.shrinkZone.radius) * 0.003;
      this.shrinkZone.x += (this.shrinkTarget.x - this.shrinkZone.x) * 0.003;
      this.shrinkZone.y += (this.shrinkTarget.y - this.shrinkZone.y) * 0.003;

      // Damage cars outside zone
      for (const car of this.cars) {
        if (car.health <= 0) continue;
        const dx = car.x - this.shrinkZone.x;
        const dy = car.y - this.shrinkZone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > this.shrinkZone.radius) {
          car.health -= 15 * dt;
          if (car.isPlayer) {
            this.renderer.addFlash('#ff3d0044', 0.1);
          }
        }
      }
    }

    // ── Team deathmatch check ─────────────────────────
    if (this.config.gameMode === 'team') {
      const team0Alive = this.cars.some(c => c.team === 0 && c.health > 0);
      const team1Alive = this.cars.some(c => c.team === 1 && c.health > 0);
      if (!team0Alive || !team1Alive) {
        this._endGame();
        return;
      }
    }

    // ── Update kill feed ──────────────────────────────
    for (let i = this.killFeed.length - 1; i >= 0; i--) {
      this.killFeed[i].timer -= dt;
      if (this.killFeed[i].timer <= 0) this.killFeed.splice(i, 1);
    }

    // Game over check
    const alivePlayers = this.cars.filter(c => c.health > 0);
    const playerAlive = alivePlayers.some(c => c.isPlayer);

    if (this.timeRemaining <= 0 || !playerAlive || (alivePlayers.length <= 1 && this.cars.length > 1 && this.config.gameMode !== 'team')) {
      this._endGame();
      return;
    }

    // Render
    const gs = {
      arena: this.arena,
      cars: this.cars,
      powerUps: this.powerUps,
      score: this.score,
      kills: this.kills,
      timeRemaining: Math.ceil(this.timeRemaining),
    };
    this.renderer.render(gs);

    // Draw environmental hazards
    this._drawHazards();

    // Draw shrink zone for battle royale
    if (this.config.gameMode === 'battleroyale' && this.shrinkZone) {
      this._drawShrinkZone();
    }

    // Draw kill feed
    this._drawKillFeed();

    // Draw chat messages
    this._drawChat();

    // Draw spectator overlay if spectating
    if (this.spectating) {
      this._drawSpectatorOverlay();
    }

    // Update input state
    this.input.update();

    // Handle chat toggle
    if (this.input.wasJustPressed('KeyT') && this.multiplayer) {
      this.chatOpen = !this.chatOpen;
    }
    // Tab to cycle spectator
    if (this.input.wasJustPressed('Tab') && this.spectating) {
      this._cycleSpectator();
    }
  }

  _updateGameOver(dt) {
    this.renderer.update(dt);

    // Keep rendering the last frame for a moment
    const gs = {
      arena: this.arena,
      cars: this.cars,
      powerUps: this.powerUps,
      score: this.score,
      kills: this.kills,
      timeRemaining: 0,
    };

    this.renderer.clear();
    const ctx = this.renderer.ctx;
    ctx.fillStyle = '#111122';
    ctx.fillRect(this.arena.x, this.arena.y, this.arena.width, this.arena.height);
    ctx.strokeStyle = '#ff3d00';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.arena.x, this.arena.y, this.arena.width, this.arena.height);

    // Draw dead cars
    for (const car of this.cars) {
      if (car.health > 0) {
        this.renderer._drawCar(car);
      } else {
        this.renderer._drawWreck(car);
      }
    }

    this.renderer._drawParticles();
    this.renderer._drawSparks();

    // Game over overlay
    const player = this.cars.find(c => c.isPlayer);
    const won = player && player.health > 0 && this.cars.filter(c => c.health > 0).length <= 1;

    ctx.fillStyle = '#000000cc';
    ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);

    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.min(60, this.renderer.width / 12)}px monospace`;
    if (won) {
      ctx.fillStyle = '#00ff88';
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 30;
      ctx.fillText('VICTORY!', this.renderer.width / 2, this.renderer.height / 2 - 80);
    } else {
      ctx.fillStyle = '#ff3d00';
      ctx.shadowColor = '#ff3d00';
      ctx.shadowBlur = 30;
      ctx.fillText('WRECKED!', this.renderer.width / 2, this.renderer.height / 2 - 80);
    }
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = '18px monospace';
    ctx.fillText(`Score: ${this.score} | Kills: ${this.kills}`, this.renderer.width / 2, this.renderer.height / 2 - 20);

    // Rankings
    ctx.font = '13px monospace';
    ctx.fillText('--- RANKINGS ---', this.renderer.width / 2, this.renderer.height / 2 + 15);
    const sorted = [...this.cars].sort((a, b) => b.health - a.health);
    sorted.forEach((car, i) => {
      const name = car.isPlayer ? 'YOU' : (car.name || `Car ${i + 1}`);
      const status = car.health > 0 ? 'ALIVE' : 'WRECKED';
      ctx.fillStyle = car.isPlayer ? '#00ff88' : '#888888';
      ctx.fillText(`${i + 1}. ${name} - ${status}`, this.renderer.width / 2, this.renderer.height / 2 + 40 + i * 20);
    });

    // Restart prompt
    const alpha = 0.5 + Math.sin(performance.now() * 0.003) * 0.5;
    ctx.fillStyle = `rgba(255, 61, 0, ${alpha})`;
    ctx.font = 'bold 18px monospace';
    ctx.fillText('PRESS ENTER TO PLAY AGAIN', this.renderer.width / 2,
      this.renderer.height / 2 + 40 + sorted.length * 20 + 20);

    // Check for restart
    if (this.input.wasJustPressed('Enter') || this.input.wasJustPressed('Space')) {
      this.startSinglePlayer();
    }
  }

  // ── Hazard Drawing ─────────────────────────────────

  _drawHazards() {
    const ctx = this.renderer.ctx;

    // Draw mines
    for (const mine of this.mines) {
      const pulse = 1 + Math.sin(Date.now() * 0.01) * 0.2;
      ctx.fillStyle = '#ff3d00';
      ctx.shadowColor = '#ff3d00';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, 8 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(mine.x, mine.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Draw missiles
    for (const missile of this.missiles) {
      ctx.fillStyle = '#ff8800';
      ctx.shadowColor = '#ff8800';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(missile.x, missile.y, 4, 0, Math.PI * 2);
      ctx.fill();
      // Trail
      ctx.strokeStyle = '#ff880088';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(missile.x, missile.y);
      ctx.lineTo(missile.x - missile.vx * 0.03, missile.y - missile.vy * 0.03);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw oil slicks
    for (const oil of this.oilSlicks) {
      const alpha = Math.min(1, oil.life / 3);
      ctx.fillStyle = `rgba(40, 30, 50, ${alpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(oil.x, oil.y, oil.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(100, 80, 120, ${alpha * 0.4})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // ── Shrink Zone Drawing ───────────────────────────

  _drawShrinkZone() {
    if (!this.shrinkZone) return;
    const ctx = this.renderer.ctx;
    const z = this.shrinkZone;

    // Outer danger zone
    const outerRadius = z.radius + 60;
    ctx.fillStyle = 'rgba(255, 30, 0, 0.08)';
    ctx.beginPath();
    ctx.arc(z.x, z.y, outerRadius, 0, Math.PI * 2);
    ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2, true);
    ctx.fill();

    // Zone border
    ctx.strokeStyle = '#ff3d00';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff3d00';
    ctx.shadowBlur = 15;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Safe zone center
    ctx.strokeStyle = '#00ff8844';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(z.x, z.y, this.shrinkTarget.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── Chat Drawing ─────────────────────────────────

  _drawChat() {
    const ctx = this.renderer.ctx;
    const startY = this.renderer.height - 160;
    for (let i = this.chatMessages.length - 1; i >= 0; i--) {
      if (this.chatMessages.length - 1 - i > 4) break;
      const msg = this.chatMessages[i];
      ctx.fillStyle = msg.color || '#888';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${msg.from}: ${msg.text}`, 10, startY + (this.chatMessages.length - 1 - i) * 16);
    }

    // Chat input box
    if (this.chatOpen) {
      ctx.fillStyle = '#000000cc';
      ctx.fillRect(10, this.renderer.height - 42, 300, 30);
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1;
      ctx.strokeRect(10, this.renderer.height - 42, 300, 30);
      ctx.fillStyle = '#fff';
      ctx.font = '13px monospace';
      ctx.fillText(`> ${this.chatInput}_`, 16, this.renderer.height - 22);
    }
  }

  // ── Spectator ────────────────────────────────────

  _enterSpectator() {
    const alive = this.cars.filter(c => c.health > 0 && !c.isPlayer);
    if (alive.length > 0) {
      this.spectating = alive[0].id;
    } else {
      this._endGame();
    }
  }

  _cycleSpectator() {
    const alive = this.cars.filter(c => c.health > 0 && !c.isPlayer);
    if (alive.length === 0) return;
    const idx = alive.findIndex(c => c.id === this.spectating);
    this.spectating = alive[(idx + 1) % alive.length].id;
  }

  _drawSpectatorOverlay() {
    const ctx = this.renderer.ctx;
    const car = this.cars.find(c => c.id === this.spectating);
    if (!car || car.health <= 0) {
      this._cycleSpectator();
      return;
    }

    // Follow the spectated car
    this.renderer.updateCamera(car.x, car.y);

    // Overlay text
    ctx.fillStyle = '#00000099';
    ctx.fillRect(0, this.renderer.height - 30, this.renderer.width, 30);
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      `SPECTATING: ${car.name} | [TAB] next car | [ENTER] quit`,
      this.renderer.width / 2,
      this.renderer.height - 12
    );
  }

  // ── Chat Input Handling ──────────────────────────

  handleChatKey(key) {
    if (!this.chatOpen) return false;
    if (key === 'Enter') {
      if (this.chatInput.trim()) {
        this.chatMessages.push({ from: this.config.playerName, text: this.chatInput.trim(), color: '#00ff88' });
        this._sendWS({ type: 'chat', msg: this.chatInput.trim() });
      }
      this.chatInput = '';
      this.chatOpen = false;
      return true;
    }
    if (key === 'Escape') {
      this.chatInput = '';
      this.chatOpen = false;
      return true;
    }
    if (key === 'Backspace') {
      this.chatInput = this.chatInput.slice(0, -1);
      return true;
    }
    if (key.length === 1) {
      this.chatInput += key;
      return true;
    }
    return false;
  }

  addChatMessage(from, text, color = '#888') {
    this.chatMessages.push({ from, text, color });
    // Keep only last 20
    if (this.chatMessages.length > 20) this.chatMessages.shift();
  }

  // ── Kill Feed Drawing ─────────────────────────────

  _drawKillFeed() {
    const ctx = this.renderer.ctx;
    const startY = 70;
    for (let i = 0; i < this.killFeed.length; i++) {
      const kf = this.killFeed[i];
      const alpha = Math.min(1, kf.timer / 0.5);
      ctx.fillStyle = kf.color;
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(kf.text, this.renderer.width / 2, startY + i * 22);
    }
    ctx.globalAlpha = 1;
  }

  // ── Power-ups ──────────────────────────────────────

  _spawnPowerUp() {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const ax = this.arena.x + 50 + Math.random() * (this.arena.width - 100);
    const ay = this.arena.y + 50 + Math.random() * (this.arena.height - 100);

    // Don't spawn inside walls
    for (const wall of this.arena.walls) {
      if (ax >= wall.x - 20 && ax <= wall.x + wall.width + 20 &&
          ay >= wall.y - 20 && ay <= wall.y + wall.height + 20) {
        return; // Skip this spawn
      }
    }

    this.powerUps.push({
      type,
      x: ax,
      y: ay,
      life: 12,
    });
  }

  // ── Car Death ──────────────────────────────────────

  _onCarDeath(car) {
    this.renderer.spawnParticles(car.x, car.y, 25, car.color, 4, 0.8);
    this.renderer.spawnSparks(car.x, car.y, 15, '#ffff00');
    this.renderer.addScreenShake(15, 0.4);
    this.renderer.addFlash('#ff6600', 0.3);
    this.audio.explosion();

    // Find who might have killed this car (nearest alive car)
    let killer = null;
    let nearestDist = 120;
    for (const other of this.cars) {
      if (other.id === car.id || other.health <= 0) continue;
      const dx = car.x - other.x, dy = car.y - other.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < nearestDist) { nearestDist = dist; killer = other; }
    }

    if (car.isPlayer) {
      this.kills++;
      this.audio.stopEngine(car.id);
      this.killFeed.push({ text: `YOU WERE WRECKED!`, timer: 3, color: '#ff3d00' });
      // Enter spectator mode
      this._enterSpectator();
    } else {
      this.kills++;
      this.score += 100;
      if (killer && killer.isPlayer) {
        this.killFeed.push({ text: `YOU 💥 ${car.name}`, timer: 2.5, color: '#00ff88' });
      } else if (killer) {
        this.killFeed.push({ text: `${killer.name} 💥 ${car.name}`, timer: 2, color: '#ff8800' });
      } else {
        this.killFeed.push({ text: `${car.name} WRECKED`, timer: 2, color: '#888' });
      }
    }
  }

  _endGame() {
    this.state = 'gameover';
    this.audio.stopMusic();

    const player = this.cars.find(c => c.isPlayer);
    const won = player && player.health > 0 && this.cars.filter(c => c.health > 0).length <= 1;

    if (won) {
      this.score += Math.ceil(this.timeRemaining) * 5 + player.health * 2;
      this.audio.gameOverWin();
    } else {
      this.audio.gameOverLose();
    }

    // Submit score
    if (this.multiplayer) {
      this._sendWS({ type: 'score', score: this.score, kills: this.kills });
    } else {
      fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 1,
          score: this.score,
          kills: this.kills,
          survival_time: this.config.gameTime - this.timeRemaining,
          car_type: this.config.carType,
          arena: 'default',
        }),
      }).catch(() => {});
    }

    // Stop engines
    for (const car of this.cars) {
      if (car.isPlayer) this.audio.stopEngine(car.id);
    }
  }
}
