import express from 'express';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { crearServicioJustificantesCobro } from '../../server/cobros/justificantesCobro';
import { montarRutasJustificantesCobro } from '../../server/cobros/rutasJustificantesCobro';
import {
  crearFirestoreP2,
  crearStorageP2,
  validarEntornoP2,
  verificarTokenAuthEmulador,
} from './justificantes-cobro.emulador-util';

async function main(): Promise<void> {
  validarEntornoP2();
  const [token, justificanteId] = process.argv.slice(2);
  if (!token || !/^jc_[a-f0-9]{48}$/.test(justificanteId || '')) throw new Error('P2_ARGUMENTOS_RECUPERACION_INVALIDOS');

  const servicio = crearServicioJustificantesCobro({ puerto: crearFirestoreP2(), almacen: crearStorageP2() });
  const app = express();
  app.use(express.json());
  montarRutasJustificantesCobro(app, { verificarToken: verificarTokenAuthEmulador, servicio });
  const servidor = createServer(app);
  await new Promise<void>((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = servidor.address();
    if (!address || typeof address === 'string') throw new Error('P2_HTTP_RECUPERACION_SIN_PUERTO');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/cobros/justificantes/${justificanteId}/archivo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    process.stdout.write(JSON.stringify({
      status: response.status,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.byteLength,
      contentType: response.headers.get('content-type'),
    }));
    if (!response.ok) process.exitCode = 2;
  } finally {
    await new Promise<void>((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.message : 'P2_RECUPERACION_FALLIDA');
  process.exitCode = 1;
});
