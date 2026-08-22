/**
 * Simulador SNMPv3 in-process — validación MANUAL del cableado real con
 * `net-snmp` (localización de claves, engine discovery, report PDUs) que
 * ningún test con sesiones falsas puede probar. Fuera de `npm test`: bindea
 * un puerto UDP local y no es apto para CI.
 *
 * Uso: npm run snmp:sim   (agent/package.json → "snmp:sim")
 *
 * Levanta un agente SNMP local en 127.0.0.1:16161 con:
 *  - una community v2c ("public", sólo lectura)
 *  - un usuario v3 authPriv ("stcmon", SHA + AES)
 * y corre 4 sondas reales contra `sysObjectID` (el mismo OID de prueba que usa
 * `SnmpClient.negotiate()`): v2c OK, v3 OK, v3 con username inexistente
 * (rechazo RÁPIDO vía Report PDU — `EAuthFailure` inmediato, sin timeout) y
 * v3 con auth_key incorrecta para un username SÍ válido.
 *
 * Hallazgo real de esta corrida (documentado acá porque contradice la
 * intuición inicial del plan): net-snmp SÓLO genera un Report PDU inmediato
 * cuando el rechazo es "de header" — username desconocido, falta el flag de
 * auth/priv que el usuario requiere, engine ID desconocido. Cuando el
 * username SÍ existe pero el digest no coincide (auth_key incorrecta),
 * `Listener.processIncoming` (net-snmp/index.js:3207) llama
 * `checkAuthentication` → falla → invoca el callback de error del propio
 * agente y NO manda ningún paquete de vuelta: el pedido se descarta en
 * silencio y el cliente ve un timeout común, indistinguible de un host
 * muerto. Por eso `SnmpClient.negotiate()` NO depende de que "auth_key mala"
 * sea siempre gratis — ese caso cae en la rama genérica de `no-response`
 * (fail-fast + timeout reducido + presupuesto duro), y sólo el caso de
 * username desconocido (o los otros rechazos de header) usan la vía rápida
 * de `auth-rejected`. Las 2 sondas de rechazo de abajo verifican ambos casos
 * por separado.
 *
 * Nota de alcance: usa `snmp.createSession`/`createV3Session` DIRECTAMENTE
 * (no la clase `SnmpClient` de este repo) porque `SnmpClient` no expone un
 * `port` configurable — es una decisión deliberada para no ensuciar la firma
 * de la clase productiva sólo por este diagnóstico manual. Lo que este
 * script valida (el handshake v3 real de `net-snmp`) es independiente de esa
 * capa.
 */
import snmp from 'net-snmp';

const PORT = 16161;
const HOST = '127.0.0.1';
const SYS_OBJECT_ID = '1.3.6.1.2.1.1.2.0';

function probe(label: string, buildSession: () => snmp.Session): Promise<void> {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const elapsedMs = () => Number(process.hrtime.bigint() - start) / 1e6;
    const session = buildSession();
    const timer = setTimeout(() => {
      console.log(`  [${label}] ✗ timeout (sin respuesta en 3s, ${elapsedMs().toFixed(0)}ms)`);
      try { session.close(); } catch { /* ignore */ }
      resolve();
    }, 3000);
    try {
      session.get([SYS_OBJECT_ID], (err, varbinds) => {
        clearTimeout(timer);
        if (err) {
          const code = (err as unknown as { code?: number }).code;
          const via = code === snmp.ResponseInvalidCode.EAuthFailure ? 'rechazo rápido (Report PDU, EAuthFailure)' : 'error de sesión';
          console.log(`  [${label}] ${via} (${elapsedMs().toFixed(0)}ms): ${err.message}`);
        } else {
          const vb = varbinds?.[0];
          console.log(`  [${label}] ✓ respondió (${elapsedMs().toFixed(0)}ms): ${vb ? JSON.stringify(vb.value) : '(vacío)'}`);
        }
        try { session.close(); } catch { /* ignore */ }
        resolve();
      });
    } catch (e) {
      clearTimeout(timer);
      console.log(`  [${label}] ✗ excepción: ${e instanceof Error ? e.message : String(e)}`);
      resolve();
    }
  });
}

async function main() {
  console.log(`Levantando agente SNMP simulado en ${HOST}:${PORT}...`);

  const agent = snmp.createAgent(
    { port: PORT, accessControlModelType: snmp.AccessControlModelType.Simple },
    () => { /* callback de error de transporte, no usado acá */ }
  );

  const authorizer = agent.getAuthorizer();
  authorizer.addCommunity('public');
  authorizer.addUser({
    name: 'stcmon',
    level: snmp.SecurityLevel.authPriv,
    authProtocol: snmp.AuthProtocols.sha,
    authKey: 'passphrase-auth-correcta',
    privProtocol: snmp.PrivProtocols.aes,
    privKey: 'passphrase-priv-correcta',
  });
  // Mismo username que "stcmon" registrado arriba — el cliente probará con
  // una auth_key incorrecta para simular el caso "contraseña mala, usuario
  // real" (ver nota de cabecera: éste NO recibe Report PDU, cae en timeout).

  const mib = agent.getMib();
  mib.registerProvider({
    name: 'sysObjectID',
    type: snmp.MibProviderType.Scalar,
    oid: '1.3.6.1.2.1.1.2',
    scalarType: snmp.ObjectType.OID,
    maxAccess: snmp.MaxAccess['read-only'],
  });
  mib.setScalarValue('sysObjectID', '1.3.6.1.4.1.11.2.3.9.1'); // HP, arbitrario para la prueba

  console.log('Agente listo. Corriendo sondas...\n');

  await probe('v2c "public" (correcta)', () =>
    snmp.createSession(HOST, 'public', { port: PORT, timeout: 2000, retries: 0 })
  );
  await probe('v3 "stcmon" authPriv (correcta)', () =>
    snmp.createV3Session(HOST, {
      name: 'stcmon', level: snmp.SecurityLevel.authPriv,
      authProtocol: snmp.AuthProtocols.sha, authKey: 'passphrase-auth-correcta',
      privProtocol: snmp.PrivProtocols.aes, privKey: 'passphrase-priv-correcta',
    }, { port: PORT, timeout: 2000, retries: 0 })
  );
  await probe('v3 "stcmon" con auth_key INCORRECTA (username real, password mala → debe caer en timeout, NO en EAuthFailure)', () =>
    snmp.createV3Session(HOST, {
      name: 'stcmon', level: snmp.SecurityLevel.authPriv,
      authProtocol: snmp.AuthProtocols.sha, authKey: 'esta-clave-esta-mal-a-proposito',
      privProtocol: snmp.PrivProtocols.aes, privKey: 'passphrase-priv-correcta',
    }, { port: PORT, timeout: 2000, retries: 0 })
  );
  await probe('v3 "no-existe" username DESCONOCIDO (debe rechazarse RÁPIDO vía Report PDU)', () =>
    snmp.createV3Session(HOST, {
      name: 'no-existe', level: snmp.SecurityLevel.authPriv,
      authProtocol: snmp.AuthProtocols.sha, authKey: 'cualquier-cosa-8-caracteres',
      privProtocol: snmp.PrivProtocols.aes, privKey: 'cualquier-cosa-8-caracteres',
    }, { port: PORT, timeout: 2000, retries: 0 })
  );

  console.log('\nListo. Ctrl+C para salir.');
  process.exit(0);
}

main().catch((e) => {
  console.error('Error en el simulador:', e);
  process.exit(1);
});
