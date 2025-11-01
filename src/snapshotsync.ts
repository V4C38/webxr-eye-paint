import { Painter, Eye } from './painter';

export class SnapshotSync {
  private baseUrl: string;
  private painter: Painter;
  private etag: Record<Eye, string | null> = { left: null, right: null };
  private timers: Record<Eye, number | null> = { left: null, right: null };

  constructor(baseUrl: string, painter: Painter) {
    this.baseUrl = baseUrl;
    this.painter = painter;
  }

  start(): void {
    // Poll each eye for updates
    setInterval(() => { this.check('left').catch(() => void 0); }, 1000);
    setInterval(() => { this.check('right').catch(() => void 0); }, 1000);
    // Initial pull
    this.pull('left').catch(() => void 0);
    this.pull('right').catch(() => void 0);
  }

  scheduleSave(eye: Eye): void {
    if (this.timers[eye] !== null) window.clearTimeout(this.timers[eye] as number);
    this.timers[eye] = window.setTimeout(async () => {
      if (!this.painter.isDirty(eye)) return;
      const blob = await this.painter.exportPNG(eye);
      const etag = await this.hashBlob(blob);
      if (etag === this.etag[eye]) { this.painter.markSaved(eye); return; }
      const res = await fetch(this.url(eye), { method: 'PUT', body: blob });
      if (res.ok) {
        const newTag = res.headers.get('ETag');
        this.etag[eye] = newTag ?? etag;
        this.painter.markSaved(eye);
      }
    }, 900);
  }

  async clearRemote(eye: Eye): Promise<void> {
    await fetch(this.url(eye), { method: 'DELETE' });
    this.etag[eye] = null;
  }

  private async check(eye: Eye): Promise<void> {
    const res = await fetch(this.url(eye), { method: 'HEAD', cache: 'no-store' });
    if (!res.ok) return;
    const remote = res.headers.get('ETag');
    if (remote && remote !== this.etag[eye]) {
      this.etag[eye] = remote;
      await this.pull(eye);
    }
  }

  private async pull(eye: Eye): Promise<void> {
    const res = await fetch(this.url(eye), { cache: 'no-store' });
    if (res.status === 200) {
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      this.painter.drawBitmapToEye(eye, bmp, false);
      this.etag[eye] = res.headers.get('ETag');
    } else if (res.status === 204) {
      this.painter.clearEye(eye, false);
      this.etag[eye] = null;
    }
  }

  private url(eye: Eye): string { return `${this.baseUrl}/api/canvas?eye=${eye}`; }

  private async hashBlob(blob: Blob): Promise<string> {
    const buf = await blob.arrayBuffer();
    const d = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}


