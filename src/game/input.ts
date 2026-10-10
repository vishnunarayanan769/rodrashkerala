export class Input {
  private keyL = false;
  private keyR = false;
  private keyUp = false;
  private keyDown = false;
  private keyNitro = false;
  steerAnalog = 0;
  touchNitro = false;
  touchBrake = false;
  autoThrottle = false;
  usedTouch = false;
  private punchSide: -1 | 0 | 1 = 0;
  private punchAt = 0;
  private attached = false;
  onAnyKey: (() => void) | null = null;

  get steer(): number {
    const k = (this.keyR ? 1 : 0) - (this.keyL ? 1 : 0);
    return k !== 0 ? k : this.steerAnalog;
  }
  get throttle(): boolean {
    return this.keyUp || this.autoThrottle;
  }
  get brake(): boolean {
    return this.keyDown || this.touchBrake;
  }
  get nitro(): boolean {
    return this.keyNitro || this.touchNitro;
  }

  pressPunch(side: -1 | 1) {
    this.punchSide = side;
    this.punchAt = performance.now();
  }
  consumePunch(): -1 | 0 | 1 {
    if (this.punchSide !== 0 && performance.now() - this.punchAt < 180) {
      const s = this.punchSide;
      this.punchSide = 0;
      return s;
    }
    this.punchSide = 0;
    return 0;
  }

  reset() {
    this.keyL = this.keyR = this.keyUp = this.keyDown = this.keyNitro = false;
    this.steerAnalog = 0;
    this.touchNitro = false;
    this.touchBrake = false;
    this.punchSide = 0;
  }

  private isTyping(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  }

  private down = (e: KeyboardEvent) => {
    if (this.isTyping(e)) return;
    const k = e.code;
    let handled = true;
    switch (k) {
      case 'ArrowLeft':
      case 'KeyA':
        this.keyL = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.keyR = true;
        break;
      case 'ArrowUp':
      case 'KeyW':
        this.keyUp = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.keyDown = true;
        break;
      case 'Space':
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keyNitro = true;
        break;
      case 'KeyZ':
      case 'KeyJ':
      case 'KeyQ':
        if (!e.repeat) this.pressPunch(-1);
        break;
      case 'KeyX':
      case 'KeyK':
      case 'KeyE':
        if (!e.repeat) this.pressPunch(1);
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
    if (this.onAnyKey && !e.repeat) this.onAnyKey();
  };

  private up = (e: KeyboardEvent) => {
    const k = e.code;
    switch (k) {
      case 'ArrowLeft':
      case 'KeyA':
        this.keyL = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.keyR = false;
        break;
      case 'ArrowUp':
      case 'KeyW':
        this.keyUp = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.keyDown = false;
        break;
      case 'Space':
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keyNitro = false;
        break;
    }
  };

  private blur = () => this.reset();

  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.blur);
  }
  detach() {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.blur);
  }
}
