import WebSocket from 'ws';

export class SocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private onCommand: (type: string, payload: any) => void;
  private onLog: (level: string, msg: string) => void;

  constructor(serverUrl: string, token: string, onCommand: (type: string, payload: any) => void, onLog: (level: string, msg: string) => void) {
    // Convertir https:// a wss://
    this.url = serverUrl.replace(/^http/, 'ws') + '/ws';
    this.token = token;
    this.onCommand = onCommand;
    this.onLog = onLog;
  }

  connect() {
    if (this.ws) return;

    this.onLog('INFO', `Conectando al canal de control en tiempo real (WSS)...`);
    
    // El servidor espera el token por query param o header
    this.ws = new WebSocket(this.url, {
      headers: { Authorization: `Bearer ${this.token}` }
    });

    this.ws.on('open', () => {
      this.onLog('INFO', 'Conexión WSS establecida. Canal de órdenes activo.');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      // Mantener la conexión viva enviando un ping cada 30s
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }, 30000);
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'command') {
          this.onCommand(msg.commandType, msg.payload);
        }
      } catch (e) {
        this.onLog('WARN', 'Mensaje WSS inválido recibido.');
      }
    });

    this.ws.on('close', () => {
      this.onLog('WARN', 'Conexión WSS perdida. Reintentando en 30 segundos...');
      this.ws = null;
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      this.onLog('WARN', `Error en canal WSS: ${err.message}`);
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 30000);
  }

  send(type: string, payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
