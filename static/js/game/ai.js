// SKRT DERBY - AI Driver
class AIDriver {
  constructor(difficulty = 'medium') {
    this.difficulty = difficulty; // 'easy', 'medium', 'hard'
    this.targetTimer = 0;
    this.targetCar = null;
    this.wanderAngle = 0;
    this.state = 'chase'; // 'chase', 'wander', 'flee', 'collect'
  }

  // Difficulty presets
  getParams() {
    switch (this.difficulty) {
      case 'easy':
        return { aggression: 0.3, avoidance: 0.8, skill: 0.4, reactionTime: 0.8 };
      case 'hard':
        return { aggression: 0.9, avoidance: 0.5, skill: 0.9, reactionTime: 0.1 };
      case 'medium':
      default:
        return { aggression: 0.6, avoidance: 0.6, skill: 0.65, reactionTime: 0.3 };
    }
  }

  update(car, allCars, walls, powerUps, arena, dt) {
    if (car.health <= 0) {
      return { throttle: 0, brake: 0, steer: 0, boost: false };
    }

    const p = this.getParams();
    this.targetTimer -= dt;

    // Decide state
    this._updateState(car, allCars, powerUps, p);

    let input = { throttle: 0, brake: 0, steer: 0, boost: false };

    switch (this.state) {
      case 'chase':
        input = this._chase(car, allCars, walls, arena, p);
        break;
      case 'flee':
        input = this._flee(car, allCars, walls, arena, p);
        break;
      case 'wander':
        input = this._wander(car, walls, arena, p, dt);
        break;
      case 'collect':
        input = this._collect(car, powerUps, walls, arena, p);
        break;
    }

    // Boost logic
    if (car.boostCooldown <= 0 && !car.boostActive && car.health > 30) {
      // Boost when lining up a ram
      if (this.state === 'chase' && this.targetCar) {
        const dx = this.targetCar.x - car.x;
        const dy = this.targetCar.y - car.y;
        const distToTarget = Math.sqrt(dx * dx + dy * dy);
        const angleToTarget = Math.atan2(dy, dx);
        const angleDiff = this._angleDiff(car.angle, angleToTarget);
        if (distToTarget < 200 && Math.abs(angleDiff) < 0.3 && car.speed > 50) {
          input.boost = true;
        }
      }
      // Random boost
      if (Math.random() < 0.002 * p.aggression) {
        input.boost = true;
      }
    }

    return input;
  }

  _updateState(car, allCars, powerUps, p) {
    const aliveOpponents = allCars.filter(c => c !== car && c.health > 0);

    // Low health -> flee or collect
    if (car.health < 25 && powerUps.some(pu => pu.type === 'repair')) {
      if (Math.random() < 0.7) {
        this.state = 'collect';
        return;
      }
    }

    if (car.health < 15) {
      this.state = 'flee';
      return;
    }

    // Find nearest opponent
    if (aliveOpponents.length > 0) {
      let nearest = aliveOpponents[0];
      let nearestDist = Infinity;
      for (const opp of aliveOpponents) {
        const dx = car.x - opp.x;
        const dy = car.y - opp.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = opp;
        }
      }

      // Target weak opponents
      const weakOpponents = aliveOpponents.filter(c => c.health < 30);
      if (weakOpponents.length > 0 && Math.random() < p.aggression) {
        nearest = weakOpponents[Math.floor(Math.random() * weakOpponents.length)];
      }

      this.targetCar = nearest;

      // If target is powered up and close, maybe flee
      if (nearest.boostActive && nearestDist < 150 && car.health < 50) {
        this.state = Math.random() < 0.6 ? 'flee' : 'chase';
        return;
      }

      // Near a power-up? Collect it
      if (powerUps.length > 0 && Math.random() < 0.15) {
        let closestPU = powerUps[0];
        let closestDist = Infinity;
        for (const pu of powerUps) {
          const dx = car.x - pu.x;
          const dy = car.y - pu.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < closestDist) {
            closestDist = d;
            closestPU = pu;
          }
        }
        if (closestDist < 250) {
          this.state = 'collect';
          this.targetPowerUp = closestPU;
          return;
        }
      }

      this.state = 'chase';
    } else {
      this.state = 'wander';
    }
  }

  _chase(car, allCars, walls, arena, p) {
    if (!this.targetCar || this.targetCar.health <= 0) {
      return this._wander(car, walls, arena, p, 0.016);
    }

    let targetX = this.targetCar.x;
    let targetY = this.targetCar.y;

    // Lead the target slightly
    const leadDist = 30 * p.skill;
    targetX += Math.cos(this.targetCar.angle) * this.targetCar.speed * 0.3 * leadDist;
    targetY += Math.sin(this.targetCar.angle) * this.targetCar.speed * 0.3 * leadDist;

    // Ram from behind
    if (p.aggression > 0.6 && this.targetCar.speed > 0) {
      const behindAngle = this.targetCar.angle + Math.PI;
      targetX += Math.cos(behindAngle) * 40;
      targetY += Math.sin(behindAngle) * 40;
    }

    return this._steerTowards(car, targetX, targetY, walls, arena, p);
  }

  _flee(car, allCars, walls, arena, p) {
    if (!this.targetCar) return this._wander(car, walls, arena, p, 0.016);

    // Run away from target
    const dx = car.x - this.targetCar.x;
    const dy = car.y - this.targetCar.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      const fleeX = car.x + (dx / dist) * 300;
      const fleeY = car.y + (dy / dist) * 300;
      return this._steerTowards(car, fleeX, fleeY, walls, arena, p);
    }
    return this._wander(car, walls, arena, p, 0.016);
  }

  _wander(car, walls, arena, p, dt) {
    if (this.targetTimer <= 0 || Math.random() < 0.01) {
      this.wanderAngle = Math.random() * Math.PI * 2;
      this.targetTimer = 1 + Math.random() * 2;
    }

    // Wander towards a point
    const wanderX = car.x + Math.cos(this.wanderAngle) * 200;
    const wanderY = car.y + Math.sin(this.wanderAngle) * 200;
    return this._steerTowards(car, wanderX, wanderY, walls, arena, p);
  }

  _collect(car, powerUps, walls, arena, p) {
    if (powerUps.length === 0) {
      this.state = 'chase';
      return { throttle: 0.8, brake: 0, steer: 0, boost: false };
    }

    let target = powerUps[0];
    let minDist = Infinity;
    for (const pu of powerUps) {
      const dx = car.x - pu.x;
      const dy = car.y - pu.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) {
        minDist = d;
        target = pu;
      }
    }

    return this._steerTowards(car, target.x, target.y, walls, arena, p, true);
  }

  _steerTowards(car, tx, ty, walls, arena, p, fullThrottle = false) {
    let dx = tx - car.x;
    let dy = ty - car.y;

    // Wall avoidance
    const avoidanceForce = this._avoidWalls(car, walls, arena, p);
    dx += avoidanceForce.x * 150;
    dy += avoidanceForce.y * 150;

    const targetAngle = Math.atan2(dy, dx);
    let angleDiff = this._angleDiff(car.angle, targetAngle);

    // Add some noise based on difficulty
    angleDiff += (Math.random() - 0.5) * (1 - p.skill) * 0.5;

    const steer = Math.max(-1, Math.min(1, angleDiff * 3));

    // Throttle: slow down if we need to turn hard
    const absAngleDiff = Math.abs(angleDiff);
    let throttle = fullThrottle ? 1 : 1 - absAngleDiff * 0.3;

    // Don't go full speed if near walls
    if (avoidanceForce.magnitude > 0.3) {
      throttle *= 0.7;
    }

    return { throttle, brake: 0, steer, boost: false };
  }

  _avoidWalls(car, walls, arena, p) {
    const lookAhead = 120 * (1 + (1 - p.skill));
    let fx = 0, fy = 0;
    let totalWeight = 0;

    // Check rays in several directions
    const rays = 8;
    for (let i = 0; i < rays; i++) {
      const rayAngle = car.angle + (i / rays) * Math.PI * 2;
      const rx = car.x + Math.cos(rayAngle) * lookAhead;
      const ry = car.y + Math.sin(rayAngle) * lookAhead;

      // Check arena bounds
      const margin = 30;
      if (rx < arena.x + margin || rx > arena.x + arena.width - margin ||
          ry < arena.y + margin || ry > arena.y + arena.height - margin) {
        const weight = 1;
        fx -= Math.cos(rayAngle) * weight;
        fy -= Math.sin(rayAngle) * weight;
        totalWeight += weight;
      }

      // Check walls
      for (const wall of walls) {
        if (rx >= wall.x - 5 && rx <= wall.x + wall.width + 5 &&
            ry >= wall.y - 5 && ry <= wall.y + wall.height + 5) {
          const weight = 1.5;
          fx -= Math.cos(rayAngle) * weight;
          fy -= Math.sin(rayAngle) * weight;
          totalWeight += weight;
        }
      }
    }

    const magnitude = Math.sqrt(fx * fx + fy * fy);
    return {
      x: totalWeight > 0 ? fx / totalWeight : 0,
      y: totalWeight > 0 ? fy / totalWeight : 0,
      magnitude: totalWeight > 0 ? magnitude / totalWeight : 0,
    };
  }

  _angleDiff(a, b) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
  }

  reset() {
    this.targetTimer = 0;
    this.targetCar = null;
    this.state = 'chase';
    this.wanderAngle = Math.random() * Math.PI * 2;
  }
}

export default AIDriver;
