type ChangeHandler = (h: number, s: number) => void;

export class ColorWheel {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onChangeCb: ChangeHandler | null = null;
  private current: { h: number; s: number } = { h: 0, s: 1 };
  private baseImage: ImageData | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');
    this.ctx = ctx;
    this.draw();
    this.drawMarker();
    this.attach();
  }

  onChange(cb: ChangeHandler): void { this.onChangeCb = cb; }

  private attach(): void {
    let dragging = false;
    const pick = (e: PointerEvent): void => {
      const { x, y } = this.canvasSpace(e);
      const r = Math.min(this.canvas.width, this.canvas.height) * 0.5;
      const cx = this.canvas.width / 2; const cy = this.canvas.height / 2;
      const dx = x - cx; const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const s = Math.min(1, dist / r);
      let angle = Math.atan2(dy, dx); if (angle < 0) angle += Math.PI * 2;
      const h = angle / (Math.PI * 2);
      this.current = { h, s };
      this.drawMarker();
      if (this.onChangeCb) this.onChangeCb(h, s);
    };
    this.canvas.addEventListener('pointerdown', (e) => { dragging = true; this.canvas.setPointerCapture(e.pointerId); pick(e); });
    this.canvas.addEventListener('pointermove', (e) => { if (dragging) pick(e); });
    this.canvas.addEventListener('pointerup', (e) => { dragging = false; this.canvas.releasePointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointercancel', (e) => { dragging = false; this.canvas.releasePointerCapture(e.pointerId); });
  }

  private canvasSpace(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / rect.width;
    const sy = this.canvas.height / rect.height;
    return { x: (e.offsetX) * sx, y: (e.offsetY) * sy };
  }

  private draw(): void {
    const { width, height } = this.canvas;
    const cx = width / 2; const cy = height / 2; const r = Math.min(width, height) / 2;
    const image = this.ctx.createImageData(width, height);
    const data = image.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - cx; const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > r) { const off = (y * width + x) * 4; data[off+3] = 0; continue; }
        let angle = Math.atan2(dy, dx); if (angle < 0) angle += Math.PI * 2;
        const h = angle / (Math.PI * 2);
        const s = Math.min(1, dist / r);
        const { r: rr, g, b } = hsvToRgb(h, s, 1);
        const off = (y * width + x) * 4;
        data[off] = rr; data[off+1] = g; data[off+2] = b; data[off+3] = 255;
      }
    }
    this.baseImage = image;
    this.ctx.putImageData(image, 0, 0);
  }

  private drawMarker(): void {
    if (this.baseImage) this.ctx.putImageData(this.baseImage, 0, 0);
    const { width, height } = this.canvas;
    const cx = width / 2; const cy = height / 2; const r = Math.min(width, height) / 2;
    const angle = this.current.h * Math.PI * 2;
    const dist = this.current.s * r;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    this.ctx.save();
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 5, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}


