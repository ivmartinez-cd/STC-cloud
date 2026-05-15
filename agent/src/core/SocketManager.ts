import WebSocket from 'ws';
import http from 'http';
import https from 'https';
import tls from 'tls';
import net from 'net';

// Crea un HTTPS agent que tuneliza WSS a traves de un proxy HTTP CONNECT.
// Soporta autenticacion Basic embebida en la URL: http://user:pass@proxy:8080
function createProxyAgent(proxyUrl: string): https.Agent {
  const proxy = new URL(proxyUrl);
  const agent = new https.Agent();

  (agent as any).createConnection = (
    options: { host: string; port: number; servername?: string },
    callback: (err: Error | null, socket?: tls.TLSSocket) => void,
  ) => {
    const headers: Record<string, string> = {};
    if (proxy.username) {
      const creds = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
      headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(creds).toString('base64');
    }

    const req = http.request({
      host: proxy.hostname,
      port: parseInt(proxy.port, 10) || 80,
      method: 'CONNECT',
      path: `${options.host}:${options.port || 443}`,
      headers,
    });

    req.once('connect', (_res: http.IncomingMessage, socket: net.Socket) => {
      const tlsSock = tls.connect(
        { socket, servername: options.servername ?? options.host },
        () => callback(null, tlsSock),
      );
      tlsSock.once('error', callback as (err: Error) => void);
    });
    req.once('error', callback as (err: Error) => void);
    req.end();
  };

  return agent;
}

export class SocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private proxyUrl: string | undefined;
  private reconnectDelay = 5_000;            // Empieza en 5s
  private readonly maxReconnectDelay = 300_000; // Techo: 5 minutos
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private onCommand: (type: string, payload: any, id?: string) => void;
  private onLog: (level: string, msg: string) => void;

  constructor(
    serverUrl: string,
    token: string,
    onCommand: (type: string, payload: any, id?: string) => void,
    onLog: (level: string, msg: string) => void,
    proxyUrl?: string,
  ) {
    this.url = serverUrl.replace(/^http/, 'ws') + '/ws';
    this.token = token;
    this.proxyUrl = proxyUrl;
    this.onCommand = onCommand;
    this.onLog = onLog;
  }

  connect() {
    if (this.ws) return;

    this.onLog('INFO', `Conectando al canal de control WSS...`);

    const wsOptions: WebSocket.ClientOptions = {
      headers: { Authorization: `Bearer ${this.token}` },
    };

    if (this.proxyUrl) {
      wsOptions.agent = createProxyAgent(this.proxyUrl);
    }

    this.ws = new WebSocket(this.url, wsOptions);

    this.ws.on('open', () => {
      this.onLog('INFO', 'Canal WSS activo.');
      this.reconnectDelay = 5_000; // Reset backoff al conectar exitosamente
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.ping();
      }, 30_000);
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'command') {
          this.onCommand(msg.commandType, msg.payload, msg.id);
        }
      } catch {
        this.onLog('WARN', 'Mensaje WSS invalido recibido.');
      }
    });

    this.ws.on('close', () => {
      this.onLog('WARN', `WSS desconectado. Reintento en ${this.reconnectDelay / 1000}s (Exponential Backoff).`);
      this.ws = null;
      if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      this.onLog('WARN', `Error WSS: ${err.message}`);
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  send(event: string, data: any) {
    if (this.isConnected()) {
      this.ws?.send(JSON.stringify({ event, data }));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
