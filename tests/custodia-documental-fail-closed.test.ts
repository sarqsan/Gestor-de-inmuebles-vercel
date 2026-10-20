/**
 * ORDEN 1 · AG-04 — CUSTODIA DOCUMENTAL FAIL-CLOSED (sin almacén efímero)
 * =========================================================================
 * Qué demuestra (sin red, sin Firebase real, con dobles explícitos):
 *  A. `subirBinarioDuradero`: sólo devuelve éxito cuando el objeto queda en
 *     Storage y se obtiene su URL; denegación, sesión caducada, red o plazo
 *     agotado producen `ErrorCustodiaDocumento` con código estable y mensaje
 *     apto para la persona usuaria; el plazo CANCELA la tarea.
 *  B. Los tres `upload*` legados de `src/lib/firebase.ts` (facturas de gasto,
 *     justificantes de cobro, documentos aportados) ya no llaman a
 *     `/api/upload-document`, no devuelven `server_*`/`local_*` ni base64 y
 *     fallan de forma explícita sin titular o cuando Storage deniega.
 *  C. La parte pura del adjunto de póliza (`evaluarAdjuntoInlinePoliza`).
 *  D. Invariantes de código: ningún cliente vuelve a usar el almacén retirado.
 *
 * Qué NO demuestra: el comportamiento de las reglas en el proyecto real
 * (AG-03) — eso queda como V (pendiente de verificación autorizada).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Dobles de Firebase para poder importar `src/lib/firebase.ts` sin red.
// ---------------------------------------------------------------------------
const estado = vi.hoisted(() => ({
  /** Comportamiento de la próxima subida: 'ok' | 'denegada' | 'sin-sesion' | 'colgada' | 'red'. */
  modo: 'ok' as 'ok' | 'denegada' | 'sin-sesion' | 'colgada' | 'red',
  subidas: [] as Array<{ path: string; contentType?: string; bytes: number }>,
  cancelaciones: 0,
  urlsPedidas: [] as string[],
}));

class ErrorStorageFalso extends Error {
  constructor(readonly code: string) {
    super(`Firebase Storage: ${code}`);
  }
}

function crearTareaFalsa(path: string) {
  let rechazar: (e: unknown) => void = () => undefined;
  let resolver: () => void = () => undefined;
  let terminada = false;
  const promesa = new Promise<void>((res, rej) => {
    resolver = () => { terminada = true; res(); };
    rechazar = (e) => { terminada = true; rej(e); };
  });
  switch (estado.modo) {
    case 'ok':
      resolver();
      break;
    case 'denegada':
      rechazar(new ErrorStorageFalso('storage/unauthorized'));
      break;
    case 'sin-sesion':
      rechazar(new ErrorStorageFalso('storage/unauthenticated'));
      break;
    case 'red':
      rechazar(new ErrorStorageFalso('storage/retry-limit-exceeded'));
      break;
    case 'colgada':
      // nunca termina por sí sola: sólo `cancel()` la cierra
      break;
  }
  return {
    snapshot: { ref: { fullPath: path } },
    then: (ok?: (v: void) => unknown, ko?: (e: unknown) => unknown) => promesa.then(ok, ko),
    cancel: () => {
      estado.cancelaciones += 1;
      if (terminada) return false;
      rechazar(new ErrorStorageFalso('storage/canceled'));
      return true;
    },
    on: () => () => undefined,
  };
}

vi.mock('firebase/storage', () => ({
  getStorage: () => ({ __storage: true }),
  ref: (_s: unknown, path: string) => ({ fullPath: path }),
  uploadBytes: async () => { throw new Error('uploadBytes no debe usarse en los flujos AG-04'); },
  uploadBytesResumable: (r: { fullPath: string }, datos: Blob, md?: { contentType?: string }) => {
    estado.subidas.push({ path: r.fullPath, contentType: md?.contentType, bytes: datos.size });
    return crearTareaFalsa(r.fullPath);
  },
  getDownloadURL: async (r: { fullPath: string }) => {
    estado.urlsPedidas.push(r.fullPath);
    return `https://firebasestorage.googleapis.com/v0/b/bucket/o/${encodeURIComponent(r.fullPath)}?alt=media&token=t`;
  },
  deleteObject: async () => undefined,
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, col: string) => ({ __col: col }),
  doc: (_db: unknown, col: string, id: string) => ({ __col: col, __id: id }),
  getDoc: async () => ({ exists: () => false, data: () => undefined }),
  setDoc: async () => undefined,
  updateDoc: async () => undefined,
  deleteDoc: async () => undefined,
  deleteField: () => ({}),
  onSnapshot: () => () => undefined,
  query: (...args: unknown[]) => ({ __q: args }),
  where: () => ({}),
  getDocs: async () => ({ empty: true, docs: [] }),
  writeBatch: () => ({ set: () => undefined, update: () => undefined, delete: () => undefined, commit: async () => undefined }),
  runTransaction: async () => { throw new Error('runTransaction sin mock'); },
}));

vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('../src/lib/authService', () => ({ ADMIN_MASTER_EMAIL: 'master@test.local' }));

import {
  ErrorCustodiaDocumento,
  LIMITES_PREFIJO,
  MENSAJES_CUSTODIA,
  PLAZO_SUBIDA_MS,
  clasificarErrorStorage,
  esReferenciaSinCustodia,
  exigirTitular,
  subirBinarioDuradero,
  validarPrevio,
  type MotorStorage,
} from '../src/lib/custodiaDocumental/subidaDirecta';
import {
  TAMANO_MAX_ADJUNTO_POLIZA_BYTES,
  bytesDataUrlEstimados,
  evaluarAdjuntoInlinePoliza,
} from '../src/lib/custodiaDocumental/adjuntoInlinePoliza';
import { esMensajeTecnico, mensajeDeErrorUsuario } from '../src/feedback/mensajes';
import {
  uploadDocumentoAportadoFile,
  uploadFacturaGasto,
  uploadJustificanteCobro,
} from '../src/lib/firebase';

const RAIZ = resolve(__dirname, '..');
const leer = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');

const pdf = (bytes = 1200, nombre = 'factura.pdf') => new File([new Uint8Array(bytes)], nombre, { type: 'application/pdf' });

let fetchEspia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  estado.modo = 'ok';
  estado.subidas.length = 0;
  estado.urlsPedidas.length = 0;
  estado.cancelaciones = 0;
  fetchEspia = vi.fn(async () => { throw new Error('fetch no debe usarse: el almacén temporal está retirado'); });
  vi.stubGlobal('fetch', fetchEspia);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function capturar(promesa: Promise<unknown>): Promise<ErrorCustodiaDocumento> {
  try {
    await promesa;
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorCustodiaDocumento);
    return e as ErrorCustodiaDocumento;
  }
  throw new Error('se esperaba un ErrorCustodiaDocumento y la promesa resolvió');
}

// ---------------------------------------------------------------------------
// A · Núcleo: subirBinarioDuradero
// ---------------------------------------------------------------------------
describe('A · subirBinarioDuradero — éxito sólo con objeto + URL; fallos explícitos', () => {
  const storage = { __storage: true } as never;

  function motor(opciones: { modo?: typeof estado.modo; urlFalla?: boolean } = {}): MotorStorage & { tareas: ReturnType<typeof crearTareaFalsa>[] } {
    const tareas: ReturnType<typeof crearTareaFalsa>[] = [];
    return {
      tareas,
      ref: (_s, path) => ({ fullPath: path }) as never,
      uploadBytesResumable: (r) => {
        const previo = estado.modo;
        if (opciones.modo) estado.modo = opciones.modo;
        const t = crearTareaFalsa((r as unknown as { fullPath: string }).fullPath);
        estado.modo = previo;
        tareas.push(t);
        return t as never;
      },
      getDownloadURL: async (r) => {
        if (opciones.urlFalla) throw new ErrorStorageFalso('storage/unauthorized');
        return `https://firebasestorage.googleapis.com/v0/b/b/o/${encodeURIComponent((r as unknown as { fullPath: string }).fullPath)}?alt=media`;
      },
    };
  }

  it('A1 · éxito: devuelve la URL y la ruta real; nunca toca el servidor', async () => {
    const m = motor();
    const r = await subirBinarioDuradero(storage, {
      storagePath: 'gastos_facturas/prop_A/g1/1_f.pdf',
      datos: pdf(),
      contentType: 'application/pdf',
      limite: LIMITES_PREFIJO.gastos_facturas,
    }, m);
    expect(r.storagePath).toBe('gastos_facturas/prop_A/g1/1_f.pdf');
    expect(r.url).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\//);
    expect(r.bytes).toBe(1200);
    expect(fetchEspia).not.toHaveBeenCalled();
  });

  it('A2 · denegación de las reglas → SIN_PERMISO con mensaje de negocio (sin «storage/», sin «Firebase»)', async () => {
    const e = await capturar(subirBinarioDuradero(storage, {
      storagePath: 'gastos_facturas/prop_A/g1/1_f.pdf', datos: pdf(), contentType: 'application/pdf',
    }, motor({ modo: 'denegada' })));
    expect(e.codigo).toBe('SIN_PERMISO');
    expect(e.storagePath).toBe('gastos_facturas/prop_A/g1/1_f.pdf');
    expect(esMensajeTecnico(e.message)).toBe(false);
    expect(mensajeDeErrorUsuario(e, 'contexto')).toBe(MENSAJES_CUSTODIA.SIN_PERMISO);
    expect((e.causa as ErrorStorageFalso).code).toBe('storage/unauthorized');
  });

  it('A3 · sesión caducada → NO_AUTENTICADO; red agotada → RED', async () => {
    const sinSesion = await capturar(subirBinarioDuradero(storage, {
      storagePath: 'p/x.pdf', datos: pdf(), contentType: 'application/pdf',
    }, motor({ modo: 'sin-sesion' })));
    expect(sinSesion.codigo).toBe('NO_AUTENTICADO');
    const red = await capturar(subirBinarioDuradero(storage, {
      storagePath: 'p/x.pdf', datos: pdf(), contentType: 'application/pdf',
    }, motor({ modo: 'red' })));
    expect(red.codigo).toBe('RED');
  });

  it('A4 · plazo agotado: la tarea se CANCELA (no queda subida huérfana) y el error es TIEMPO_AGOTADO', async () => {
    vi.useFakeTimers();
    const m = motor({ modo: 'colgada' });
    const promesa = subirBinarioDuradero(storage, {
      storagePath: 'p/colgada.pdf', datos: pdf(), contentType: 'application/pdf', plazoMs: 5_000,
    }, m);
    const captura = capturar(promesa);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(estado.cancelaciones).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    const e = await captura;
    expect(e.codigo).toBe('TIEMPO_AGOTADO');
    expect(estado.cancelaciones).toBe(1);
    expect(fetchEspia).not.toHaveBeenCalled();
  });

  it('A5 · el plazo por defecto es generoso (facturas de varios MB en móvil) pero finito', () => {
    expect(PLAZO_SUBIDA_MS).toBeGreaterThanOrEqual(60_000);
    expect(PLAZO_SUBIDA_MS).toBeLessThanOrEqual(180_000);
  });

  it('A6 · si el objeto se subió pero no se obtiene URL, NO se declara éxito', async () => {
    const e = await capturar(subirBinarioDuradero(storage, {
      storagePath: 'p/x.pdf', datos: pdf(), contentType: 'application/pdf',
    }, motor({ urlFalla: true })));
    expect(e.codigo).toBe('SIN_PERMISO');
  });

  it('A7 · validación previa con los límites de la regla: tamaño/tipo fuera de rango no toca la red', async () => {
    const m = motor();
    const grande = await capturar(subirBinarioDuradero(storage, {
      storagePath: 'gastos_facturas/prop_A/g1/1_f.pdf',
      datos: new File([new Uint8Array(12 * 1024 * 1024)], 'f.pdf', { type: 'application/pdf' }),
      contentType: 'application/pdf',
      limite: LIMITES_PREFIJO.gastos_facturas,
    }, m));
    expect(grande.codigo).toBe('TIPO_O_TAMANO');
    const texto = await capturar(subirBinarioDuradero(storage, {
      storagePath: 'gastos_facturas/prop_A/g1/1_f.txt',
      datos: new File(['hola'], 'f.txt', { type: 'text/plain' }),
      contentType: 'text/plain',
      limite: LIMITES_PREFIJO.gastos_facturas,
    }, m));
    expect(texto.codigo).toBe('TIPO_O_TAMANO');
    expect(m.tareas).toHaveLength(0);
    expect(() => validarPrevio(new File([new Uint8Array(1)], 'a.pdf'), 'application/pdf', LIMITES_PREFIJO.documentos_solicitados, 'x')).not.toThrow();
  });

  it('A8 · sin titular no hay carpeta de custodia: SIN_TITULAR antes de intentar nada', () => {
    for (const malo of [undefined, null, '', '   ', 'sin_asignar']) {
      expect(() => exigirTitular(malo as string | undefined)).toThrowError(ErrorCustodiaDocumento);
      try { exigirTitular(malo as string | undefined); } catch (e) { expect((e as ErrorCustodiaDocumento).codigo).toBe('SIN_TITULAR'); }
    }
    expect(exigirTitular(' prop_A ')).toBe('prop_A');
  });

  it('A9 · clasificación de errores y mensajes: todos pasan el filtro UX-3', () => {
    expect(clasificarErrorStorage(new ErrorStorageFalso('storage/canceled')).codigo).toBe('CANCELADO');
    expect(clasificarErrorStorage(new ErrorStorageFalso('storage/invalid-argument')).codigo).toBe('TIPO_O_TAMANO');
    expect(clasificarErrorStorage(new Error('cualquier cosa')).codigo).toBe('DESCONOCIDO');
    expect(clasificarErrorStorage(null).codigo).toBe('DESCONOCIDO');
    const propio = new ErrorCustodiaDocumento('SIN_TITULAR');
    expect(clasificarErrorStorage(propio)).toBe(propio);
    for (const [codigo, mensaje] of Object.entries(MENSAJES_CUSTODIA)) {
      expect(esMensajeTecnico(mensaje), codigo).toBe(false);
      expect(mensaje.length, codigo).toBeLessThanOrEqual(240);
      expect(mensaje).toMatch(/no se ha guardado|no se ha adjuntado/);
    }
    expect(esReferenciaSinCustodia('server_abc')).toBe(true);
    expect(esReferenciaSinCustodia('local_1')).toBe(true);
    expect(esReferenciaSinCustodia('gastos_facturas/p/g/f.pdf')).toBe(false);
    expect(esReferenciaSinCustodia(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B · Los tres upload* legados de src/lib/firebase.ts
// ---------------------------------------------------------------------------
describe('B · upload* legados — Storage o error; nunca servidor efímero, server_*, local_* ni base64', () => {
  it('B1 · uploadFacturaGasto: éxito sólo con la ruta real por titular; sin fetch', async () => {
    const r = await uploadFacturaGasto('g1', pdf(), 'Factura luz.pdf', 'prop_A');
    expect(r.storagePath).toMatch(/^gastos_facturas\/prop_A\/g1\/\d+_Factura_luz\.pdf$/);
    expect(r.url).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\//);
    expect(estado.subidas).toHaveLength(1);
    expect(estado.subidas[0].contentType).toBe('application/pdf');
    expect(fetchEspia).not.toHaveBeenCalled();
  });

  it('B2 · uploadFacturaGasto sin propietarioId: SIN_TITULAR, sin tocar Storage ni servidor', async () => {
    const e = await capturar(uploadFacturaGasto('g1', pdf(), 'f.pdf', undefined));
    expect(e.codigo).toBe('SIN_TITULAR');
    expect(estado.subidas).toHaveLength(0);
    expect(fetchEspia).not.toHaveBeenCalled();
  });

  it('B3 · uploadFacturaGasto denegado por las reglas (p. ej. AG-03): error explícito, sin respaldo', async () => {
    estado.modo = 'denegada';
    const e = await capturar(uploadFacturaGasto('g1', pdf(), 'f.pdf', 'prop_A'));
    expect(e.codigo).toBe('SIN_PERMISO');
    expect(fetchEspia).not.toHaveBeenCalled();
    expect(estado.urlsPedidas).toHaveLength(0);
  });

  it('B4 · uploadJustificanteCobro: por contrato → recibos/…; por titular → cobros_justificantes/…; sin ninguno → SIN_TITULAR', async () => {
    const porContrato = await uploadJustificanteCobro('cob1', pdf(), 'just.pdf', 'prop_A', 'ct_A');
    expect(porContrato.storagePath).toMatch(/^recibos\/ct_A\/cob1\/\d+_just\.pdf$/);
    const porTitular = await uploadJustificanteCobro('cob1', pdf(), 'just.pdf', 'prop_A');
    expect(porTitular.storagePath).toMatch(/^cobros_justificantes\/prop_A\/cob1\/\d+_just\.pdf$/);
    const e = await capturar(uploadJustificanteCobro('cob1', pdf(), 'just.pdf'));
    expect(e.codigo).toBe('SIN_TITULAR');
    expect(estado.subidas.some((s) => s.path.includes('sin_asignar'))).toBe(false);
    expect(estado.subidas).toHaveLength(2);
    expect(fetchEspia).not.toHaveBeenCalled();
  });

  it('B5 · uploadJustificanteCobro con Storage colgado: TIEMPO_AGOTADO y tarea cancelada (antes: respaldo efímero a los 8 s)', async () => {
    vi.useFakeTimers();
    estado.modo = 'colgada';
    const captura = capturar(uploadJustificanteCobro('cob1', pdf(), 'just.pdf', 'prop_A'));
    await vi.advanceTimersByTimeAsync(PLAZO_SUBIDA_MS + 1);
    const e = await captura;
    expect(e.codigo).toBe('TIEMPO_AGOTADO');
    expect(estado.cancelaciones).toBe(1);
    expect(fetchEspia).not.toHaveBeenCalled();
  });

  it('B6 · uploadDocumentoAportadoFile (portal anónimo): ruta PLANA admitida por la regla, sin base64 ni local_', async () => {
    const r = await uploadDocumentoAportadoFile('sol-1', 'item-dni', pdf(2000, 'DNI frontal.pdf'), 'DNI frontal.pdf');
    expect(r.storagePath).toMatch(/^documentos_solicitados\/sol-1\/item-dni_\d+_DNI_frontal\.pdf$/);
    expect(r.storagePath.split('/')).toHaveLength(3);
    expect(r.downloadURL).toMatch(/^https:\/\//);
    expect((r as Record<string, unknown>).base64Data).toBeUndefined();
    expect(fetchEspia).not.toHaveBeenCalled();
  });

  it('B7 · uploadDocumentoAportadoFile con Storage denegado: error explícito (antes: data-URL con éxito aparente)', async () => {
    estado.modo = 'denegada';
    const e = await capturar(uploadDocumentoAportadoFile('sol-1', 'item-dni', pdf(), 'dni.pdf'));
    expect(e.codigo).toBe('SIN_PERMISO');
    expect(esMensajeTecnico(e.message)).toBe(false);
    expect(fetchEspia).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C · Adjuntos de póliza en la ficha (parte pura)
// ---------------------------------------------------------------------------
describe('C · evaluarAdjuntoInlinePoliza — cabe o se rechaza con motivo claro', () => {
  const poliza = { id: 'pol1', numeroPoliza: 'X', documentosRenovacion: [] as unknown[] };
  it('C1 · PDF pequeño cabe; tipo no admitido y archivo grande se rechazan antes de leer', () => {
    expect(evaluarAdjuntoInlinePoliza(poliza, { size: 100_000, type: 'application/pdf', name: 'p.pdf' }).ok).toBe(true);
    const tipo = evaluarAdjuntoInlinePoliza(poliza, { size: 1000, type: 'text/html', name: 'p.html' });
    expect(tipo.ok).toBe(false);
    if (tipo.ok === false) { expect(tipo.motivo).toBe('TIPO_NO_ADMITIDO'); expect(esMensajeTecnico(tipo.mensaje)).toBe(false); }
    const grande = evaluarAdjuntoInlinePoliza(poliza, { size: TAMANO_MAX_ADJUNTO_POLIZA_BYTES + 1, type: 'application/pdf' });
    expect(grande.ok).toBe(false);
    if (grande.ok === false) { expect(grande.motivo).toBe('ARCHIVO_DEMASIADO_GRANDE'); expect(esMensajeTecnico(grande.mensaje)).toBe(false); }
  });
  it('C2 · si la ficha ya está casi llena, se rechaza aunque el archivo sea válido (límite de 1 MiB por documento)', () => {
    const llena = { ...poliza, documentosRenovacion: [{ url: `data:application/pdf;base64,${'A'.repeat(700_000)}` }] };
    const r = evaluarAdjuntoInlinePoliza(llena, { size: 300_000, type: 'application/pdf' });
    expect(r.ok).toBe(false);
    if (r.ok === false) { expect(r.motivo).toBe('FICHA_SIN_ESPACIO'); expect(esMensajeTecnico(r.mensaje)).toBe(false); }
    expect(bytesDataUrlEstimados(300_000, 'application/pdf')).toBe(400_000 + 'data:application/pdf;base64,'.length);
  });
});

// ---------------------------------------------------------------------------
// D · Invariantes de código: ningún consumidor vuelve al almacén retirado
// ---------------------------------------------------------------------------
describe('D · ningún flujo cliente usa ya el almacén temporal ni fabrica referencias sin custodia', () => {
  const FICHEROS = [
    'src/lib/firebase.ts',
    'src/components/modals/GastoModal.tsx',
    'src/components/sections/CobrosSection.tsx',
    'src/components/PortalDocumentacionPublicaView.tsx',
    'src/components/modals/DetallePolizaModal.tsx',
  ];
  it('D1 · ninguna llamada a /api/upload-document fuera de comentarios; sin `server_${` ni `local_${itemId}`', () => {
    for (const f of FICHEROS) {
      const codigo = leer(f)
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      expect(codigo, f).not.toMatch(/fetch\((['"`])\/api\/upload-document/);
      expect(codigo, f).not.toContain('server_${');
      expect(codigo, f).not.toContain('local_${itemId}');
    }
  });
  it('D2 · src/lib/documentosServidor.ts ya no existe y server.ts no lo importa', () => {
    expect(() => readFileSync(resolve(RAIZ, 'src/lib/documentosServidor.ts'))).toThrow();
    expect(leer('server.ts')).not.toContain('documentosServidor');
  });
  it('D3 · CobrosSection avisa con tipo error (no «éxito») cuando el justificante no se custodia', () => {
    const src = leer('src/components/sections/CobrosSection.tsx');
    expect(src).not.toMatch(/tipo:\s*'exito',\s*mensaje:\s*mensajeDeErrorUsuario\(upErr/);
    expect(src).toMatch(/tipo:\s*'error',\s*\n?\s*mensaje:\s*`\$\{mensajeDeErrorUsuario\(upErr/);
  });
});
