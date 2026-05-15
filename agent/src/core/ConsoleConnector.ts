import net from 'net';

/**
 * Conector para el motor de diagnostico local de STC Cloud.
 * Se comunica con el proceso de gestion local para ejecutar comandos tecnicos.
 */
export class ConsoleConnector {
  private host: string;
  private port: number;

  constructor(host = '127.0.0.1', port = 8000) {
    this.host = host;
    this.port = port;
  }

  async execute(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let output = '';
      let resolved = false;
      let idleTimeout: NodeJS.Timeout;

      // Timeout de seguridad: si el DCA no responde en 15s, cancelamos
      const timeout = setTimeout(() => {
        if (!resolved) {
          client.destroy();
          reject(new Error('Timeout esperando respuesta del servicio local (IMIL)'));
        }
      }, 15000);

      client.connect(this.port, this.host, () => {
        client.write(command + '\n');
      });

      client.on('data', (data) => {
        output += data.toString();
      });

      // Pequeno retardo para capturar rafagas de datos
      client.on('end', () => {
        clearTimeout(timeout);
        if (idleTimeout) clearTimeout(idleTimeout);
        resolved = true;
        resolve(output.trim());
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        if (idleTimeout) clearTimeout(idleTimeout);
        resolved = true;
        reject(new Error(`Error de conexion con servicio local: ${err.message}`));
      });

      // Si despues de 2 segundos de recibir el ultimo dato no llega nada mas, cerramos
      client.on('data', () => {
        if (idleTimeout) clearTimeout(idleTimeout);
        idleTimeout = setTimeout(() => {
          if (!resolved) {
            client.end();
          }
        }, 1500);
      });
    });
  }
}
