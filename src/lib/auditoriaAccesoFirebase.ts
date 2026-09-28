/** Única primitiva de escritura administrativa ROADMAP-01 sobre audit_logs canónico.
 * La operación y el evento nuevo comparten transacción; Rules validan ambos
 * por roadmap01AuditId + detalles.actorUid/rutas. Nunca devuelve éxito parcial.
 */
import { collection, doc, runTransaction } from 'firebase/firestore';
import { auth, db, sanitizeObjectForFirestore } from './firebase';
import type { AuditLog } from '../types';

const COLECCIONES = ['usuarios','propietarios','usuarios_auth','gestiones_cartera','enlaces_registro'] as const;
export type ColeccionAcceso = typeof COLECCIONES[number];
export async function guardarAccesoAuditado(coleccion: ColeccionAcceso, id: string,
  datos: Record<string, unknown>, accion: string): Promise<void> {
  return guardarAccesosAuditados([{coleccion,id,datos}],accion);
}

export async function guardarAccesosAuditados(entradas: Array<{coleccion:ColeccionAcceso;id:string;datos:Record<string,unknown>}>,
  accion:string): Promise<void> {
  const actor = auth.currentUser;
  // Rules deciden si el actor es master o staff y si puede escribir la ruta.
  // El helper no concede autorización: solo impide escrituras sin sesión/audit.
  if (!actor) throw new Error('Escritura administrativa sin Firebase Auth');
  if (!entradas.length || entradas.length > 5 || entradas.some(({coleccion,id}) =>
    !id || id.length > 128 || /[\\/]/.test(id) || !COLECCIONES.includes(coleccion))) throw new Error('Ruta inválida');
  const rutas = entradas.map(({coleccion,id})=>`${coleccion}/${id}`);
  if (new Set(rutas).size !== rutas.length) throw new Error('Ruta duplicada');
  const destinos = entradas.map(({coleccion,id})=>doc(db,coleccion,id));
  const auditRef = doc(collection(db,'audit_logs'));
  const {coleccion,id} = entradas[0];
  const ruta = rutas[0];
  const log: AuditLog = {
    id:auditRef.id,usuarioId:actor.uid,usuarioEmail:actor.email!,usuarioNombre:actor.email!,
    accion,descripcion:`Escritura administrativa ${ruta}`,fechaHora:new Date().toISOString(),
    entidadAfectada:({usuarios:'usuario',propietarios:'propietario',usuarios_auth:'usuario',
      gestiones_cartera:'gestion_cartera',enlaces_registro:'enlace'} as const)[coleccion],
    idAfectado:id,resultado:'EXITO',detalles:{actorUid:actor.uid,rutas},
  };
  await runTransaction(db, async tx => {
    const previos = await Promise.all(destinos.map(ref=>tx.get(ref)));
    if (previos.some(previo=>previo.exists() && previo.data().roadmap01AuditId === auditRef.id))
      throw new Error('Evento ya aplicado');
    // Solo nombres de campos: jamás incluir contraseñas, PII ni valores de
    // cuentas bancarias en el log. Las rutas + operación son inmutables.
    log.detalles = { ...log.detalles, campos:entradas.map((e,i)=>({ruta:rutas[i],
      claves:Object.keys(e.datos).filter(k => !previos[i].exists() ||
        JSON.stringify(previos[i].data()[k]) !== JSON.stringify(e.datos[k]))})) };
    entradas.forEach((e,i)=>tx.set(destinos[i],sanitizeObjectForFirestore({ ...e.datos, roadmap01AuditId:auditRef.id }),{merge:true}));
    tx.set(auditRef, log);
  });
}
