// SKRT DERBY - Physics Engine
class PhysicsEngine {
  constructor(arena) {
    this.arena = arena; // { x, y, width, height }
    this.cars = [];
    this.walls = [];
    this.obstacles = [];
  }

  setBounds(x, y, width, height) {
    this.arena = { x, y, width, height };
  }

  setWalls(walls) {
    this.walls = walls;
  }

  setObstacles(obstacles) {
    this.obstacles = obstacles;
  }

  // --- Car Physics ---

  updateCar(car, dt) {
    if (car.health <= 0) {
      car.speed *= 0.9;
      car.angularVel *= 0.9;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      car.angle += car.angularVel * dt;
      return;
    }

    const input = car.input || { throttle: 0, brake: 0, steer: 0, boost: false };

    // Acceleration
    const maxSpeed = car.boostActive ? car.maxSpeed * 1.4 : car.maxSpeed;
    const acceleration = car.acceleration;

    if (input.throttle > 0) {
      car.speed += acceleration * input.throttle * dt;
    }
    if (input.brake > 0) {
      if (car.speed > 0) {
        car.speed -= acceleration * 2 * input.brake * dt;
        car.speed = Math.max(0, car.speed);
      } else {
        car.speed -= acceleration * input.brake * dt;
      }
    }

    // Natural friction / drag
    car.speed *= Math.pow(car.friction, dt * 60);

    // Clamp speed
    car.speed = Math.max(-maxSpeed * 0.4, Math.min(maxSpeed, car.speed));

    // Steering (scales with speed)
    const steerFactor = Math.abs(car.speed) > 10 ? 1 : Math.abs(car.speed) / 10;
    car.angularVel = input.steer * car.turnSpeed * steerFactor * dt * 60;

    // Apply angular damping
    car.angularVel *= Math.pow(0.85, dt * 60);

    // Boost
    if (input.boost && !car.boostActive && car.boostCooldown <= 0) {
      car.boostActive = true;
      car.boostTimer = 1.5; // 1.5 seconds
      car.boostCooldown = 5; // 5 second cooldown
      car.speed = Math.max(car.speed, car.maxSpeed * 1.2);
    }

    if (car.boostActive) {
      car.boostTimer -= dt;
      if (car.boostTimer <= 0) {
        car.boostActive = false;
        car.boostTimer = 0;
      }
    }
    if (car.boostCooldown > 0 && !car.boostActive) {
      car.boostCooldown -= dt;
    }

    // Update position
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.angle += car.angularVel * dt;
  }

  // --- Collision Detection ---

  checkWallCollisions(car) {
    const halfW = car.width / 2;
    const halfH = car.height / 2;
    let collided = false;

    // Corners of car (approximate as AABB for walls)
    const corners = [
      { x: car.x - halfW, y: car.y - halfH },
      { x: car.x + halfW, y: car.y - halfH },
      { x: car.x + halfW, y: car.y + halfH },
      { x: car.x - halfW, y: car.y + halfH },
    ];

    // Arena boundaries
    const ax = this.arena.x;
    const ay = this.arena.y;
    const aw = this.arena.width;
    const ah = this.arena.height;

    let pushX = 0, pushY = 0;

    for (const corner of corners) {
      if (corner.x < ax) { pushX = Math.max(pushX, ax - corner.x); collided = true; }
      if (corner.x > ax + aw) { pushX = Math.min(pushX, (ax + aw) - corner.x); collided = true; }
      if (corner.y < ay) { pushY = Math.max(pushY, ay - corner.y); collided = true; }
      if (corner.y > ay + ah) { pushY = Math.min(pushY, (ay + ah) - corner.y); collided = true; }
    }

    // Wall obstacles
    for (const wall of this.walls) {
      for (const corner of corners) {
        if (corner.x >= wall.x && corner.x <= wall.x + wall.width &&
            corner.y >= wall.y && corner.y <= wall.y + wall.height) {
          // Find closest edge to push out
          const distLeft = corner.x - wall.x;
          const distRight = (wall.x + wall.width) - corner.x;
          const distTop = corner.y - wall.y;
          const distBottom = (wall.y + wall.height) - corner.y;

          const minDist = Math.min(distLeft, distRight, distTop, distBottom);
          if (minDist === distLeft) pushX = Math.max(pushX, wall.x - corner.x);
          else if (minDist === distRight) pushX = Math.min(pushX, (wall.x + wall.width) - corner.x);
          else if (minDist === distTop) pushY = Math.max(pushY, wall.y - corner.y);
          else pushY = Math.min(pushY, (wall.y + wall.height) - corner.y);

          collided = true;
        }
      }
    }

    // Apply push
    if (collided) {
      car.x += pushX;
      car.y += pushY;

      // Bounce / reduce speed
      const impactSpeed = Math.abs(car.speed);
      if (impactSpeed > 30) {
        const bounceFactor = 0.5;
        car.speed *= -bounceFactor;
        car.health -= impactSpeed * 0.15;
        car.lastWallHit = 0.3;
        return {
          collided: true,
          impactForce: impactSpeed * 0.15,
          point: { x: car.x, y: car.y },
        };
      }
    }

    return { collided: false, impactForce: 0 };
  }

  checkCarCollisions(car, allCars) {
    const result = { collided: false, impactForce: 0, otherCar: null, point: null };

    for (const other of allCars) {
      if (other === car || other.health <= 0) continue;

      const dx = car.x - other.x;
      const dy = car.y - other.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = (car.width + other.width) / 2.5;

      if (dist < minDist && dist > 0) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        // Separate cars
        const pushRatio = 0.5;
        car.x += nx * overlap * pushRatio;
        car.y += ny * overlap * pushRatio;
        other.x -= nx * overlap * pushRatio;
        other.y -= ny * overlap * pushRatio;

        // Calculate relative velocity along collision normal
        const rvx = Math.cos(car.angle) * car.speed - Math.cos(other.angle) * other.speed;
        const rvy = Math.sin(car.angle) * car.speed - Math.sin(other.angle) * other.speed;
        const rvDot = rvx * nx + rvy * ny;

        if (rvDot > 0) {
          const impactForce = Math.abs(rvDot) * 0.8;

          // Transfer momentum
          const impulse = rvDot * 0.5;
          car.speed -= impulse * 0.3;
          other.speed += impulse * 0.3;

          // Damage
          const damage = impactForce * 0.25;
          car.health -= damage;
          other.health -= damage;

          // Spin on collision
          car.angularVel += (Math.random() - 0.5) * impactForce * 0.02;
          other.angularVel += (Math.random() - 0.5) * impactForce * 0.02;

          result.collided = true;
          result.impactForce = Math.max(result.impactForce, impactForce);
          result.otherCar = other;
          result.point = {
            x: (car.x + other.x) / 2,
            y: (car.y + other.y) / 2,
          };
        }
      }
    }

    return result;
  }

  // --- Power-ups ---

  updatePowerUps(powerUps, cars, dt) {
    const toRemove = [];
    for (const powerUp of powerUps) {
      powerUp.life -= dt;
      if (powerUp.life <= 0) {
        toRemove.push(powerUp);
        continue;
      }

      for (const car of cars) {
        if (car.health <= 0) continue;
        const dx = car.x - powerUp.x;
        const dy = car.y - powerUp.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 30) {
          this.applyPowerUp(car, powerUp.type);
          toRemove.push(powerUp);
          break;
        }
      }
    }

    // Remove expired/collected
    for (const r of toRemove) {
      const idx = powerUps.indexOf(r);
      if (idx !== -1) powerUps.splice(idx, 1);
    }

    return toRemove.length > 0 ? toRemove : [];
  }

  applyPowerUp(car, type) {
    switch (type) {
      case 'repair':
        car.health = Math.min(100, car.health + 30);
        break;
      case 'speed':
        car.boostActive = true;
        car.boostTimer = 2;
        car.boostCooldown = 0;
        car.speed = Math.max(car.speed, car.maxSpeed * 1.3);
        break;
      case 'shield':
        car.shieldActive = true;
        car.shieldTimer = 5;
        break;
      case 'ram':
        car.ramBonus = true;
        car.ramTimer = 8;
        break;
    }
  }

  updateCarTimers(car, dt) {
    if (car.shieldActive) {
      car.shieldTimer -= dt;
      if (car.shieldTimer <= 0) car.shieldActive = false;
    }
    if (car.ramBonus) {
      car.ramTimer -= dt;
      if (car.ramTimer <= 0) car.ramBonus = false;
    }
    if (car.lastWallHit > 0) {
      car.lastWallHit -= dt;
    }
  }

  // --- Collision Response Effects ---

  getCollisionEffects(collision) {
    if (!collision || !collision.collided) return [];
    return [{
      x: collision.point ? collision.point.x : 0,
      y: collision.point ? collision.point.y : 0,
      force: collision.impactForce,
    }];
  }
}

export default PhysicsEngine;
