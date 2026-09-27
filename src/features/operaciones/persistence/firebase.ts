import * as sdkNativo from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import type { Candidato, ContratoFormalizacion, Inmueble, Propietario } from '../../../types.ts';
import type { AmbitoOperacion, EntidadOperativa, EventoOperativo } from '../contracts.ts';
import { crearRepositorioOperativo, type CabeceraOperativa, type TransporteOperativo } from './repository.ts';
import { proyectarIdentidad } from './authorization.ts';
import { reconstruirHistorial, versionDe, type FilaOperativa } from './versions.ts';

export const COLECCION_OPERACIONES = 'operaciones';
export const COLECCION_AUDITORIA = 'audit_logs';
// Binding de transporte C del usuario de aplicación canónico; no se crea ni se modifica aquí.
export const COLECCION_USUARIOS_CANONICOS = 'usuarios';
export const COLECCION_BINDING_CANONICO = 'usuarios_auth';
export const claveEntidad = (e: { tipo: string; id: string }) => `${e.tipo}~${e.id}`;
type SDK = Pick<typeof sdkNativo, 'collection'|'doc'|'getDoc'|'getDocs'|'query'|'runTransaction'|'serverTimestamp'|'where'>;
export function crearTransporteFirebase(db: Firestore, auth: Auth, sdk: SDK = sdkNativo): TransporteOperativo {
  const {collection,doc,getDoc,getDocs,query,runTransaction,serverTimestamp,where}=sdk;
  const raiz = (p: string) => doc(db, COLECCION_OPERACIONES, p);
  const entidad = (p: string, e: { tipo: string; id: string }) => doc(collection(raiz(p), 'entidades'), claveEntidad(e));
  async function inmueble(a: AmbitoOperacion) {
    const snapshot = await getDoc(doc(db, 'inmuebles', a.inmuebleId));
    if (!snapshot.exists()) throw new Error('Inmueble no disponible.');
    return { ...snapshot.data(), id: snapshot.id } as Inmueble;
  }
  return {
    async identidad() {
      const user = auth.currentUser;
      if (!user) return null;
      const binding = await getDoc(doc(db, COLECCION_BINDING_CANONICO, user.uid));
      const usuarioId = binding.data()?.usuarioId;
      if (!binding.exists() || typeof usuarioId !== 'string' || !usuarioId || usuarioId.includes('/')) return null;
      const usuario = await getDoc(doc(db, COLECCION_USUARIOS_CANONICOS, usuarioId));
      if (auth.currentUser?.uid !== user.uid) throw new Error('La sesión ha cambiado.');
      return proyectarIdentidad(user.uid, binding.data(), usuario.exists() ? usuario.data() : undefined, user.email ?? '');
    },
    async leer(propietarioId) {
      // Cabecera ANTES de las queries. El CAS transaccional detecta cualquier escritura intermedia.
      const head = await getDoc(raiz(propietarioId));
      const rows = await getDocs(collection(raiz(propietarioId), 'entidades'));
      const despues = await getDoc(raiz(propietarioId));
      if ((head.data()?.revision ?? 0) !== (despues.data()?.revision ?? 0)) throw new Error('CONFLICTO_REVISION: lectura concurrente; vuelve a cargar.');
      const cabecera = head.exists() ? head.data() as CabeceraOperativa : null;
      const historial = reconstruirHistorial(rows.docs.map((d)=>d.data() as FilaOperativa), propietarioId);
      return { cabecera, estado: { revision: cabecera?.revision ?? 0, entidades: rows.docs.map((d) => d.data().registro as EntidadOperativa), historial } };
    },
    async contexto(ambito) {
      const [i, p, c, inq] = await Promise.all([
        inmueble(ambito), getDoc(doc(db, 'propietarios', ambito.propietarioId)),
        getDocs(query(collection(db, 'contratos_formalizacion'), where('inmuebleId', '==', ambito.inmuebleId))),
        getDocs(query(collection(db, 'candidatos'), where('inmuebleId', '==', ambito.inmuebleId))),
      ]);
      if (!p.exists()) throw new Error('Propietario no disponible. No se crea ni infiere titularidad.');
      return { ambito, ambitosPermitidos: [ambito], inmuebles: [i], propietarios: [{ ...p.data(), id: p.id } as Propietario],
        contratos: c.docs.map((d) => ({ ...d.data(), id: d.id } as ContratoFormalizacion)),
        inquilinos: inq.docs.map((d) => ({ ...d.data(), id: d.id } as Candidato)) };
    },
    transaccion(propietarioId, trabajo) {
      return runTransaction(db, async (tx) => {
        // La cabecera CAS permite reutilizar el snapshot leído sin hacer lecturas tras escribir.
        const rows = await getDocs(collection(raiz(propietarioId), 'entidades'));
        const anteriores = new Map(rows.docs.map((d)=>[d.id, d.data() as FilaOperativa]));
        return trabajo({
        async leerCabecera() { const s = await tx.get(raiz(propietarioId)); return s.exists() ? s.data() as CabeceraOperativa : null; },
        async comprobarInmuebleActual(a) {
          const s = await tx.get(doc(db, 'inmuebles', a.inmuebleId));
          if (!s.exists() || ![s.data().propietarioId, s.data().propietarioPrincipalId, s.data().propietarioSecundarioId].includes(a.propietarioId)) throw new Error('Sin titularidad actual: solo acceso histórico cuando esté autorizado.');
        },
        guardarEntidad(evento, auditId) {
          const e = evento.despues;
          if ((e.tipo === 'presupuesto' || e.tipo === 'factura') && e.conceptos.length > 10) throw new Error('Límite de transporte Firestore: máximo 10 conceptos por registro. No se truncan ni reagrupan datos; conserva el documento original.');
          const previa = anteriores.get(claveEntidad(e));
          if ((previa?.registro.version ?? 0) !== (evento.antes?.version ?? 0)) throw new Error('CONFLICTO_REVISION: versión de registro desactualizada.');
          tx.set(entidad(propietarioId, e), { registro: e, auditId, versiones: [...(previa?.versiones ?? []), versionDe(evento)] }); },
        crearAuditoria(id, registro) { tx.set(doc(db, COLECCION_AUDITORIA, id), { ...registro, registradoEn: serverTimestamp() }); },
        guardarCabecera(cabecera) { tx.set(raiz(propietarioId), cabecera); },
      }); });
    },
  };
}
export const crearRepositorioFirebase = (db: Firestore, auth: Auth) => crearRepositorioOperativo(crearTransporteFirebase(db, auth));
