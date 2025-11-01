export type Eye = 'left' | 'right';
export type Tool = 'brush' | 'eraser';

interface EyeCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

interface PainterOptions {
  left: HTMLCanvasElement;
  right: HTMLCanvasElement;
}

export class Painter {
  private eyes: Record<Eye, EyeCanvas>;
  private size: number;
  private tool: Tool = 'brush';
  private brushWidth = 40;
  private feather = 0.5; // 0..1 fraction of radius that is fully opaque center
  private color: { r: number; g: number; b: number; a: number } = { r: 255, g: 255, b: 255, a: 1 };
  private stampCache: Map<string, HTMLCanvasElement> = new Map();
  private lastPos: Partial<Record<Eye, { x: number; y: number }>> = {};
  private dirty: Record<Eye, boolean> = { left: false, right: false };

  constructor(opts: PainterOptions, size: number) {
    this.size = size;
    const leftCtx = opts.left.getContext('2d', { willReadFrequently: false });
    const rightCtx = opts.right.getContext('2d', { willReadFrequently: false });
    if (!leftCtx || !rightCtx) throw new Error('2D context not available');
    opts.left.width = opts.right.width = size;
    opts.left.height = opts.right.height = size;
    this.eyes = {
      left: { canvas: opts.left, ctx: leftCtx },
      right: { canvas: opts.right, ctx: rightCtx },
    };
    this.clearEye('left', false);
    this.clearEye('right', false);
  }

  setTool(tool: Tool): void { this.tool = tool; }
  setWidth(width: number): void { this.brushWidth = Math.max(1, Math.min(width, this.size)); }
  setFeather(feather: number): void { this.feather = Math.max(0, Math.min(feather, 1)); }
  setColorRGBA(r: number, g: number, b: number, a: number): void { this.color = { r, g, b, a }; }
  setColorHSV(h: number, s: number, v: number): void { const { r, g, b } = hsvToRgb(h, s, v); this.color = { r, g, b, a: 1 }; }

  isDirty(eye: Eye): boolean { return this.dirty[eye]; }
  markSaved(eye: Eye): void { this.dirty[eye] = false; }

  pointerDown(eye: Eye, x: number, y: number, el: HTMLCanvasElement): void {
    const pos = this.toCanvasSpace(el, x, y);
    this.lastPos[eye] = pos;
    this.stamp(eye, pos.x, pos.y);
  }
  pointerMove(eye: Eye, x: number, y: number, el: HTMLCanvasElement): void {
    const prev = this.lastPos[eye];
    const pos = this.toCanvasSpace(el, x, y);
    if (!prev) { this.lastPos[eye] = pos; return; }
    const dx = pos.x - prev.x; const dy = pos.y - prev.y;
    const dist = Math.hypot(dx, dy);
    const spacing = Math.max(1, this.brushWidth * 0.5);
    const steps = Math.ceil(dist / spacing);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.stamp(eye, prev.x + dx * t, prev.y + dy * t);
    }
    this.lastPos[eye] = pos;
  }
  pointerUp(eye: Eye): void { delete this.lastPos[eye]; }

  clearEye(eye: Eye, markDirty: boolean = true): void {
    const { ctx, canvas } = this.eyes[eye];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    if (markDirty) this.dirty[eye] = true;
  }

  drawBitmapToEye(eye: Eye, bmp: ImageBitmap, markDirty: boolean = false): void {
    const { ctx, canvas } = this.eyes[eye];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    if (markDirty) this.dirty[eye] = true; else this.dirty[eye] = false;
  }

  async exportPNG(eye: Eye): Promise<Blob> {
    const { canvas } = this.eyes[eye];
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/png'));
    return blob;
  }

  private stamp(eye: Eye, cx: number, cy: number): void {
    const { ctx } = this.eyes[eye];
    const size = Math.max(1, Math.floor(this.brushWidth));
    const feather = this.feather;
    const key = `${size}:${feather}`;
    let stampCanvas = this.stampCache.get(key);
    if (!stampCanvas) {
      stampCanvas = createBrushStamp(size, feather);
      this.stampCache.set(key, stampCanvas);
    }
    ctx.save();
    if (this.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(${this.color.r},${this.color.g},${this.color.b},${this.color.a})`;
    }
    const x = Math.round(cx - size / 2);
    const y = Math.round(cy - size / 2);
    if (this.tool === 'eraser') {
      ctx.drawImage(stampCanvas, x, y);
    } else {
      // tint the white stamp by drawing it into an offscreen and multiply with color
      // simpler: use globalCompositeOperation 'source-in' with color-filled rect
      const off = document.createElement('canvas');
      off.width = size; off.height = size;
      const octx = off.getContext('2d');
      if (!octx) throw new Error('2D context not available');
      octx.drawImage(stampCanvas, 0, 0);
      octx.globalCompositeOperation = 'source-in';
      octx.fillStyle = `rgba(${this.color.r},${this.color.g},${this.color.b},${this.color.a})`;
      octx.fillRect(0, 0, size, size);
      ctx.drawImage(off, x, y);
    }
    ctx.restore();
    this.dirty[eye] = true;
  }

  private toCanvasSpace(el: HTMLCanvasElement, x: number, y: number): { x: number; y: number } {
    const rect = el.getBoundingClientRect();
    const sx = el.width / rect.width;
    const sy = el.height / rect.height;
    return { x: (x) * sx, y: (y) * sy };
  }
}

  function createBrushStamp(size: number, feather: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D context not available');
  const r = size / 2;
  // Invert feather so that higher value = softer edge, lower = harder cut
  const g = ctx.createRadialGradient(r, r, r * (1 - feather), r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  return c;
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


