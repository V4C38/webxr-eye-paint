import { PainterRoom } from './painterroom';

export { PainterRoom } from './painterroom';

interface Env {
  PAINTER_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/canvas')) {
      const room = url.searchParams.get('room') || 'global';
      const id = env.PAINTER_ROOM.idFromName(room);
      const stub = env.PAINTER_ROOM.get(id);
      return stub.fetch(req);
    }
    return env.ASSETS.fetch(req);
  }
};


