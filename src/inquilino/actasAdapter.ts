/**
 * BLOQUE E (reconciliado) — Adaptador de solo lectura a las actas canónicas (BLOQUE D).
 *
 * El portal del inquilino NUNCA importa el motor D ni sus escrituras: consume las
 * actas de SUS contratos (query acotada por `contractId`, probada por reglas) y las
 * sanea antes de mostrarlas (sin notas internas, DNI, contactos, IP/userAgent ni OTP).
 * Firmas, versionado y PDF los genera gestión; el portal solo visualiza.
 */
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  Acta,
  ElementoActaInventario,
  EstadoActa,
  EstadoFirma,
  LecturaContador,
  MetodoFirma,
  RolParticipanteActa,
  TipoActa,
} from '../types/actas';

export interface ActaInquilinoVM {
  id: string;
  contratoId: string;
  tipo: TipoActa;
  estado: EstadoActa;
  version: number;
  fechaActo: string;
  participantes: { nombre: string; rol: RolParticipanteActa; haFirmado: boolean; fechaFirma?: string }[];
  inventario: ElementoActaInventario[];
  lecturasContadores: LecturaContador[];
  observacionesGenerales?: string;
  estadoFirma: Acta['estadoFirma'];
  firmas: {
    firmanteNombre: string;
    firmanteRol: RolParticipanteActa;
    estado: EstadoFirma;
    metodo: MetodoFirma;
    fechaFirma?: string;
  }[];
  pdfUrl?: string;
  motivoVersionado?: string;
}

/** Sanea un acta canónica para el inquilino (elimina PII y datos internos). */
export function sanearActaParaInquilino(a: Acta): ActaInquilinoVM {
  return {
    id: a.id,
    contratoId: a.contractId || '',
    tipo: a.tipo,
    estado: a.estado,
    version: a.version,
    fechaActo: a.fechaActo,
    participantes: (a.participantes || []).map((p) => ({
      nombre: p.nombre,
      rol: p.rol,
      haFirmado: p.haFirmado,
      fechaFirma: p.fechaFirma,
    })),
    inventario: a.inventario || [],
    lecturasContadores: a.lecturasContadores || [],
    observacionesGenerales: a.observacionesGenerales,
    estadoFirma: a.estadoFirma,
    firmas: (a.firmas || []).map((f) => ({
      firmanteNombre: f.firmanteNombre,
      firmanteRol: f.firmanteRol,
      estado: f.estado,
      metodo: f.metodo,
      fechaFirma: f.fechaFirma,
    })),
    pdfUrl: a.pdfUrl,
    motivoVersionado: a.motivoVersionado,
  };
}

/**
 * Lee las actas D de UN contrato vinculado (query acotada por igualdad en
 * `contractId`; la regla de lista exige pertenencia a los contratos del
 * inquilino, por lo que no es posible enumerar actas ajenas).
 */
export async function getActasByContrato(contratoId: string): Promise<ActaInquilinoVM[]> {
  if (!contratoId) return [];
  const snap = await getDocs(query(collection(db, 'actas'), where('contractId', '==', contratoId)));
  return snap.docs
    .map((d) => sanearActaParaInquilino({ id: d.id, ...(d.data() as object) } as Acta))
    .sort((a, b) => (a.fechaActo < b.fechaActo ? 1 : -1));
}
