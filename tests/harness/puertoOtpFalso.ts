/**
 * Puerto Firestore EN MEMORIA para las pruebas del OTP de actas.
 * ---------------------------------------------------------------------------
 * Implementa EXACTAMENTE el contrato que consumen las rutas/servicio de OTP:
 * precondiciones (`NO_EXISTE` / `VERSION`), máscaras de actualización y consultas
 * por igualdades. No simula Firestore entero: si algo no está cubierto, lanza.
 * Sirve para demostrar comportamiento (autorización, destino, intentos,
 * atomicidad) sin red, sin credenciales y sin tocar ningún proyecto real.
 */
import type { DocumentoLeido, EscrituraDocumentoFirestoreAtomica } from '../../server/titularidades/googleBackend';
import type { PuertoOtpActas } from '../../server/actas/servicioOtpActas';

interface DocumentoFalso {
  datos: Record<string, unknown>;
  updateTime: string;
}

export class PuertoOtpFalso implements PuertoOtpActas {
  private readonly docs = new Map<string, DocumentoFalso>();
  private secuencia = 0;
  /** Se incrementa en cada commit para poder simular carreras. */
  commits = 0;
  /** Si es > 0, el siguiente `escribirAtomico` devuelve CONFLICTO sin escribir. */
  conflictosForzados = 0;
  /** Si es true, `escribirAtomico` lanza (fallo de transporte). */
  fallarEscrituras = false;

  private clave(coleccion: string, id: string): string {
    return `${coleccion}/${id}`;
  }

  private version(): string {
    this.secuencia += 1;
    return `2026-10-28T00:00:${String(this.secuencia).padStart(2, '0')}.000Z`;
  }

  sembrar(coleccion: string, id: string, datos: Record<string, unknown>): void {
    this.docs.set(this.clave(coleccion, id), { datos: { ...datos }, updateTime: this.version() });
  }

  datosDe(coleccion: string, id: string): Record<string, unknown> | undefined {
    return this.docs.get(this.clave(coleccion, id))?.datos;
  }

  todos(coleccion: string): Array<{ id: string; datos: Record<string, unknown> }> {
    const prefijo = `${coleccion}/`;
    return Array.from(this.docs.entries())
      .filter(([ruta]) => ruta.startsWith(prefijo))
      .map(([ruta, doc]) => ({ id: ruta.slice(prefijo.length), datos: doc.datos }));
  }

  async leer(coleccion: string, id: string): Promise<DocumentoLeido | null> {
    const doc = this.docs.get(this.clave(coleccion, id));
    return doc ? { id, datos: { ...doc.datos }, updateTime: doc.updateTime } : null;
  }

  async leerDocumento(ruta: string): Promise<DocumentoLeido | null> {
    const [coleccion, ...resto] = ruta.split('/');
    if (!coleccion || resto.length !== 1) throw new Error(`PUERTO_FALSO: ruta no soportada ${ruta}`);
    return this.leer(coleccion, resto[0]);
  }

  async crearDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<'CREADO' | 'YA_EXISTE'> {
    const clave = this.clave(coleccion, id);
    if (this.docs.has(clave)) return 'YA_EXISTE';
    this.docs.set(clave, { datos: { ...datos }, updateTime: this.version() });
    return 'CREADO';
  }

  async actualizarCampos(coleccion: string, id: string, datos: Record<string, unknown>): Promise<void> {
    const clave = this.clave(coleccion, id);
    const doc = this.docs.get(clave);
    if (!doc) throw new Error(`PUERTO_FALSO: no existe ${clave}`);
    doc.datos = { ...doc.datos, ...datos };
    doc.updateTime = this.version();
  }

  async escribirAtomico(escrituras: readonly EscrituraDocumentoFirestoreAtomica[]): Promise<'COMMIT' | 'CONFLICTO'> {
    if (this.fallarEscrituras) throw new Error('PUERTO_FALSO: fallo de escritura');
    if (this.conflictosForzados > 0) {
      this.conflictosForzados -= 1;
      return 'CONFLICTO';
    }
    // Validación COMPLETA antes de aplicar nada: el commit es atómico.
    for (const escritura of escrituras) {
      const clave = this.clave(escritura.coleccion, escritura.id);
      const actual = this.docs.get(clave);
      if (escritura.precondicion.tipo === 'NO_EXISTE' && actual) return 'CONFLICTO';
      if (escritura.precondicion.tipo === 'VERSION' && actual?.updateTime !== escritura.precondicion.updateTime) return 'CONFLICTO';
    }
    for (const escritura of escrituras) {
      const clave = this.clave(escritura.coleccion, escritura.id);
      const actual = this.docs.get(clave);
      const base = escritura.camposActualizar && actual ? { ...actual.datos } : {};
      const datos = escritura.camposActualizar
        ? base
        : { ...escritura.datos };
      if (escritura.camposActualizar) {
        for (const campo of escritura.camposActualizar) {
          if (!(campo in escritura.datos)) throw new Error(`PUERTO_FALSO: campo fuera de máscara ${campo}`);
          datos[campo] = escritura.datos[campo];
        }
      }
      this.docs.set(clave, { datos, updateTime: this.version() });
    }
    this.commits += 1;
    return 'COMMIT';
  }

  async consultarIgualdadesOrden(
    coleccion: string,
    consulta: {
      igualdades?: Array<[campo: string, valor: string]>;
      orden?: { campo: string; direccion: 'ASCENDING' | 'DESCENDING' };
      limite: number;
    },
  ): Promise<DocumentoLeido[]> {
    const prefijo = `${coleccion}/`;
    let filas = Array.from(this.docs.entries())
      .filter(([ruta]) => ruta.startsWith(prefijo))
      .map(([ruta, doc]) => ({ id: ruta.slice(prefijo.length), datos: doc.datos, updateTime: doc.updateTime }))
      .filter(({ datos }) => (consulta.igualdades || []).every(([campo, valor]) => datos[campo] === valor));
    if (consulta.orden) {
      const { campo, direccion } = consulta.orden;
      filas = filas.sort((a, b) => {
        const va = String(a.datos[campo] ?? '');
        const vb = String(b.datos[campo] ?? '');
        return direccion === 'DESCENDING' ? vb.localeCompare(va) : va.localeCompare(vb);
      });
    }
    return filas.slice(0, Math.max(1, Math.min(100, consulta.limite)));
  }
}

/** Proveedor de correo doble: registra los mensajes y permite forzar el fallo. */
export class ProveedorCorreoFalso {
  readonly enviados: Array<{ to: string; subject: string; body: string }> = [];
  ok = true;
  lanzar = false;

  async enviar(mensaje: { to: string; subject: string; body: string }): Promise<{ ok: boolean; externalId?: string; error?: string }> {
    if (this.lanzar) throw new Error('PROVEEDOR_CAIDO');
    this.enviados.push({ ...mensaje });
    if (!this.ok) return { ok: false, error: 'RECHAZADO' };
    return { ok: true, externalId: `msg_${this.enviados.length}` };
  }

  get codigos(): string[] {
    return this.enviados
      .map((m) => /(\d{6})/.exec(m.body)?.[1] || '')
      .filter(Boolean);
  }
}

/** Acta mínima coherente con el motor real. */
export function actaDePrueba(sobrescribir: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'acta-1',
    ownerId: 'prop_A',
    propertyId: 'inm-1',
    tipo: 'ENTRADA',
    estado: 'BORRADOR',
    version: 1,
    fechaCreacion: '2026-10-01T10:00:00.000Z',
    fechaActualizacion: '2026-10-01T10:00:00.000Z',
    fechaActo: '2026-10-01',
    participantes: [
      { id: 'part-inquilino', nombre: 'Inquilino Sintético', rol: 'ARRENDATARIO', email: 'inquilino@example.test', firmaRequerida: true, haFirmado: false },
      { id: 'part-propietario', nombre: 'Propietario Sintético', rol: 'ARRENDADOR', email: 'propietario@example.test', firmaRequerida: true, haFirmado: false },
    ],
    inventario: [],
    lecturasContadores: [],
    evidenciaIds: [],
    incidenciaIds: [],
    firmas: [],
    estadoFirma: 'PENDIENTE',
    historial: [{ id: 'hist-1', fecha: '2026-10-01T10:00:00.000Z', usuario: 'Propietario', accion: 'CREADA', version: 1 }],
    creadoPor: 'Propietario',
    ...sobrescribir,
  };
}

/** Espejo de identidad mínimo (`usuarios_auth` + `usuarios`) para el propietario. */
export function sembrarPropietario(puerto: PuertoOtpFalso): void {
  puerto.sembrar('usuarios_auth', 'uid-prop', {
    tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', usuarioId: 'u-prop', authUid: 'uid-prop', propietarioId: 'prop_A',
  });
  puerto.sembrar('usuarios', 'u-prop', { authUid: 'uid-prop', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_A', email: 'prop@example.test' });
}

export const IDENTIDAD_PROPIETARIO = { uid: 'uid-prop', email: 'prop@example.test', emailVerificado: true };
export const IDENTIDAD_AJENO = { uid: 'uid-otro', email: 'otro@example.test', emailVerificado: true };
export const IDENTIDAD_INQUILINO = { uid: 'uid-inq', email: 'inquilino@example.test', emailVerificado: true };
