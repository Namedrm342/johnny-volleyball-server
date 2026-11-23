import { DurableObject } from "cloudflare:workers";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const room = url.searchParams.get("room") || "default";

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("JohnnyVolleyball Tokyo Server Ready! Room: " + room, { status: 200 });
    }

    const id = env.VOLLEY_ROOM.idFromName(room);
    const stub = env.VOLLEY_ROOM.get(id);
    return stub.fetch(request);
  }
};

export class VolleyRoom extends DurableObject {
  async fetch(request) {
    const existingSockets = this.ctx.getWebSockets();
    if (existingSockets.length >= 2) {
      return new Response("Room is full", { status: 403 });
    }

    let hasP1 = false;
    for (const s of existingSockets) {
      const meta = s.deserializeAttachment();
      if (meta && meta.role === 1) hasP1 = true;
    }
    const role = hasP1 ? 2 : 1;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role });

    server.send("ROLE:" + role);

    if (existingSockets.length === 1) {
      existingSockets[0].send("READY");
      server.send("READY");
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    for (const s of this.ctx.getWebSockets()) {
      if (s !== ws) {
        try {
          s.send(message);
        } catch (e) {}
      }
    }
  }

  async webSocketClose(ws, code, reason, wasClean) {
    for (const s of this.ctx.getWebSockets()) {
      if (s !== ws) {
        try { s.send("OPPONENT_LEFT"); } catch (e) {}
      }
    }
    try { ws.close(code, reason); } catch (e) {}
  }

  async webSocketError(ws, error) {
    for (const s of this.ctx.getWebSockets()) {
      if (s !== ws) {
        try { s.send("OPPONENT_LEFT"); } catch (e) {}
      }
    }
  }
}
