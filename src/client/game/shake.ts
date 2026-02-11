export class ScreenShake {
  private trauma = 0;
  private seed = 0;
  offsetX = 0;
  offsetY = 0;

  add(amount: number): void {
    this.trauma = Math.min(this.trauma + amount, 1);
  }

  update(dt: number): void {
    if (this.trauma <= 0) {
      this.offsetX = 0;
      this.offsetY = 0;
      return;
    }

    this.seed += dt * 50;
    const shake = this.trauma * this.trauma;
    const maxOffset = shake * 8;

    this.offsetX = (Math.sin(this.seed * 7.3) + Math.sin(this.seed * 13.7)) * maxOffset;
    this.offsetY = (Math.cos(this.seed * 9.1) + Math.cos(this.seed * 11.3)) * maxOffset;

    this.trauma = Math.max(0, this.trauma - dt * 2.5);
  }
}
