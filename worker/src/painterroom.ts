interface EyeState { bytes: Uint8Array | null; etag: string | null; updatedAt: number; }

export class PainterRoom {
  private state: DurableObjectState;
  private eyes: Record<'left' | 'right', EyeState> = {
    left: { bytes: null, etag: null, updatedAt: 0 },
    right: { bytes: null, etag: null, updatedAt: 0 },
  };

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const eyeParam = url.searchParams.get('eye');
    const eye = (eyeParam === 'left' || eyeParam === 'right') ? eyeParam : 'left';
    if (!this.eyes.left.bytes && !this.eyes.right.bytes) await this.load();

    if (req.method === 'GET' || req.method === 'HEAD') {
      const s = this.eyes[eye];
      const headers = new Headers({ 'Cache-Control': 'no-store' });
      if (s.etag) headers.set('ETag', s.etag);
      if (s.updatedAt) headers.set('Last-Modified', new Date(s.updatedAt).toUTCString());
      const inm = req.headers.get('If-None-Match');
      if (inm && s.etag && inm === s.etag) return new Response(null, { status: 304, headers });
      if (req.method === 'HEAD') return new Response(null, { status: 200, headers });
      if (!s.bytes) return new Response(null, { status: 204, headers });
      headers.set('Content-Type', 'image/png');
      return new Response(s.bytes, { status: 200, headers });
    }

    if (req.method === 'PUT') {
      const buf = new Uint8Array(await req.arrayBuffer());
      const etag = await this.hash(buf);
      this.eyes[eye] = { bytes: buf, etag, updatedAt: Date.now() };
      await this.persist();
      return new Response(null, { status: 204, headers: new Headers({ ETag: etag }) });
    }

    if (req.method === 'DELETE') {
      this.eyes[eye] = { bytes: null, etag: null, updatedAt: Date.now() };
      await this.persist();
      return new Response(null, { status: 204 });
    }

    return new Response('Method not allowed', { status: 405 });
  }

  private async load(): Promise<void> {
    const saved = await this.state.storage.get<Record<'left'|'right', EyeState>>('eyes');
    if (saved) this.eyes = saved;
  }
  private async persist(): Promise<void> { await this.state.storage.put('eyes', this.eyes); }

  private async hash(data: Uint8Array): Promise<string> {
    const d = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(d);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}


