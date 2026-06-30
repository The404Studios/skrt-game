// SKRT DERBY - Input Handler
class InputHandler {
  constructor() {
    this.keys = {};
    this.justPressed = {};
    this.prevKeys = {};

    // Touch joystick state
    this.touchActive = false;
    this.touchId = null;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchCurrentX = 0;
    this.touchCurrentY = 0;
    this.touchVector = { x: 0, y: 0 };
    this.joystickMaxRadius = 50;

    // Bind methods
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
    this._onClick = this._onClick.bind(this);

    // Button click callback
    this.onAnyInput = null;

    this._attachListeners();
  }

  _attachListeners() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('touchstart', this._onTouchStart, { passive: false });
    window.addEventListener('touchmove', this._onTouchMove, { passive: false });
    window.addEventListener('touchend', this._onTouchEnd);
    window.addEventListener('touchcancel', this._onTouchEnd);
    window.addEventListener('click', this._onClick);
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('touchstart', this._onTouchStart);
    window.removeEventListener('touchmove', this._onTouchMove);
    window.removeEventListener('touchend', this._onTouchEnd);
    window.removeEventListener('touchcancel', this._onTouchEnd);
    window.removeEventListener('click', this._onClick);
  }

  _onKeyDown(e) {
    if (this.onAnyInput) this.onAnyInput();
    // Prevent default for game keys
    const gameKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'Space', 'Enter', 'Escape'];
    if (gameKeys.includes(e.code)) {
      e.preventDefault();
    }
    this.keys[e.code] = true;
  }

  _onKeyUp(e) {
    this.keys[e.code] = false;
  }

  _onTouchStart(e) {
    if (this.onAnyInput) this.onAnyInput();
    e.preventDefault();
    if (e.touches.length === 0) return;

    const touch = e.touches[0];
    // Use left half of screen for joystick
    const halfW = window.innerWidth / 2;
    if (touch.clientX < halfW) {
      this.touchActive = true;
      this.touchId = touch.identifier;
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      this.touchCurrentX = touch.clientX;
      this.touchCurrentY = touch.clientY;
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      if (touch.identifier === this.touchId) {
        this.touchCurrentX = touch.clientX;
        this.touchCurrentY = touch.clientY;

        let dx = this.touchCurrentX - this.touchStartX;
        let dy = this.touchCurrentY - this.touchStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > this.joystickMaxRadius) {
          dx = (dx / dist) * this.joystickMaxRadius;
          dy = (dy / dist) * this.joystickMaxRadius;
        }
        this.touchVector.x = dx / this.joystickMaxRadius;
        this.touchVector.y = dy / this.joystickMaxRadius;
        break;
      }
    }
  }

  _onTouchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.touchId) {
        this.touchActive = false;
        this.touchId = null;
        this.touchVector.x = 0;
        this.touchVector.y = 0;
        break;
      }
    }
  }

  _onClick() {
    if (this.onAnyInput) this.onAnyInput();
  }

  // --- Player Input Query ---

  getPlayerInput(playerIndex = 0) {
    const input = {
      throttle: 0,   // forward: 0-1
      brake: 0,      // reverse: 0-1
      steer: 0,      // -1 (left) to 1 (right)
      boost: false,
    };

    if (playerIndex === 0) {
      // WASD / Arrow keys
      if (this.keys['KeyW'] || this.keys['ArrowUp']) input.throttle = 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) input.brake = 1;
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) input.steer = -1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) input.steer = 1;
      if (this.keys['Space']) input.boost = true;

      // Touch joystick (overrides keyboard for movement)
      if (this.touchActive) {
        input.throttle = Math.max(0, -this.touchVector.y);
        input.brake = Math.max(0, this.touchVector.y);
        input.steer = this.touchVector.x;
      }
    } else if (playerIndex === 1) {
      // IJKL for player 2
      if (this.keys['KeyI']) input.throttle = 1;
      if (this.keys['KeyK']) input.brake = 1;
      if (this.keys['KeyJ']) input.steer = -1;
      if (this.keys['KeyL']) input.steer = 1;
    }

    return input;
  }

  isPressed(code) {
    return !!this.keys[code];
  }

  wasJustPressed(code) {
    const pressed = !!this.keys[code] && !this.prevKeys[code];
    this.prevKeys[code] = !!this.keys[code];
    return pressed;
  }

  update() {
    // Sync prevKeys
    this.prevKeys = { ...this.keys };
  }
}

export default InputHandler;
