export class GameTimer {
  constructor(onTick, onExpire) {
    this.onTick = onTick;
    this.onExpire = onExpire;
    this.remaining = 0;
    this.interval = null;
    this.running = false;
  }
  start(seconds) {
    this.stop();
    this.remaining = Math.max(0, Number(seconds) || 0);
    this.running = true;
    this.onTick(this.remaining);
    this.interval = setInterval(() => {
      if (!this.running) return;
      this.remaining = Math.max(0, this.remaining - 1);
      this.onTick(this.remaining);
      if (this.remaining <= 0) {
        this.stop();
        this.onExpire();
      }
    }, 1000);
  }
  pause() {
    if (!this.running) return this.remaining;
    this.running = false;
    clearInterval(this.interval);
    this.interval = null;
    return this.remaining;
  }
  resume() {
    if (this.running || this.remaining <= 0) return;
    this.running = true;
    this.interval = setInterval(() => {
      if (!this.running) return;
      this.remaining = Math.max(0, this.remaining - 1);
      this.onTick(this.remaining);
      if (this.remaining <= 0) { this.stop(); this.onExpire(); }
    }, 1000);
  }
  stop() { clearInterval(this.interval); this.interval = null; this.running = false; }
  getRemaining() { return this.remaining; }
}