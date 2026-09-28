/**
 * GESTIONES-CARTERA — Adaptador Firestore de los puertos del servicio.
 * ---------------------------------------------------------------------------
 * ÚNICO fichero del bloque que importa Firebase. El núcleo
 * (`gestionesCarteraServicio.ts`) permanece sin Firebase y testeable con dobles
 * locales; este adaptador es la capa delgada donde:
 *  · la creación estricta usa transacción (get → set) para que "crear" falle
 *    de verdad si el documento ya existe: nunca sobrescritura silenciosa;
 *  · las transiciones usan transacción (get → aplicar → set) para que el
 *    histórico `eventos[]` append-only jamás pierda eventos por concurrencia;
 *  · la auditoría canónica `audit_logs` se crea en el mismo commit de cada
 *    mutación; el puerto legado secundario no duplica el evento;
 *  · el espejo `usuarios_auth/{uid}` se escribe con merge de SOLO
 *    `carterasL/carterasE` (único escritor legítimo: sesión master, reglas D3).
 *
 * No hay aquí lógica de negocio: solo traducción de puertos. `firebase.ts` NO
 * se modifica: se reutilizan sus exports (`db`, `registrarAuditoriaFirestore`,
 * `sanitizeObjectForFirestore`).
 *
 * CONTEXTO: todas las escrituras exigen sesión master (reglas). Las lecturas
 * siguen las reglas vigentes (titular/gestor/admin según colección).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { auth, db, sanitizeObjectForFirestore } from './firebase';
import {
  COLECCION_ESPEJOS_AUTH,
  COLECCION_GESTIONES_CARTERA,
  COLECCION_PROPIETARIOS,
  COLECCION_USUARIOS,
  type DependenciasGestionesCartera,
  type ProyeccionEspejo,
  type PuertoAuditoriaGestiones,
  type PuertoEspejoCarteras,
  type PuertoGestionesCartera,
  type PuertoPropietariosGestiones,
  type PuertoUsuariosGestiones,
  type UsuarioGestionable,
} from './gestionesCarteraServicio';
import type { GestionCartera } from './gestionesCartera';
import { proyectarCarterasGestionadas } from './carterasGestion';

function eventoObligatorioGestion(ref: {id:string}, gestion: GestionCartera, auditId: string) {
  const actor = auth.currentUser;
  if (!actor || actor.email?.toLowerCase() !== 'sarqsan2@gmail.com')
    throw new Error('Gestión administrativa sin master autenticado');
  const ultimo = gestion.eventos?.[gestion.eventos.length - 1];
  return {id:auditId,usuarioId:actor.uid,usuarioEmail:actor.email,usuarioNombre:actor.email,
    accion:'GESTION_TRANSACCION',descripcion:ultimo?.tipo || 'Alta de gestión',fechaHora:new Date().toISOString(),
    entidadAfectada:'gestion_cartera',idAfectado:ref.id,resultado:'EXITO',
    detalles:{actorUid:actor.uid,rutas:[`gestiones_cartera/${ref.id}`],eventoTipo:ultimo?.tipo || ''}};
}
function gestionDesdeSnap(id: string, data: Record<string, unknown>): GestionCartera {
  return { ...(data as unknown as GestionCartera), id };
}

export const puertoGestionesCarteraFirestore: PuertoGestionesCartera = {
  async obtenerGestion(id) {
    const snap = await getDoc(doc(db, COLECCION_GESTIONES_CARTERA, id));
    return snap.exists() ? gestionDesdeSnap(snap.id, snap.data()) : null;
  },
  async crearGestion(gestion) {
    const datos = sanitizeObjectForFirestore({ ...gestion, id: gestion.id });
    await runTransaction(db, async (tx) => {
      const ref = doc(db, COLECCION_GESTIONES_CARTERA, gestion.id);
      const snap = await tx.get(ref);
      if (snap.exists()) {
        throw new Error(
          `El documento ${COLECCION_GESTIONES_CARTERA}/${gestion.id} ya existe; no se sobrescribe en silencio.`
        );
      }
      const auditRef = doc(collection(db,'audit_logs'));
      tx.set(ref, { ...datos, roadmap01AuditId:auditRef.id });
      tx.set(auditRef, eventoObligatorioGestion(ref,gestion,auditRef.id));
    });
  },
  async aplicarTransicion(id, aplicar) {
    return runTransaction(db, async (tx) => {
      const ref = doc(db, COLECCION_GESTIONES_CARTERA, id);
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new Error(`La gestión ${id} no existe.`);
      }
      // La transición pura se re-ejecuta sobre el documento FRESCO dentro de
      // la transacción: si otro escritor la cambió bajo nuestros pies y el
      // evento ya no aplica, `aplicar` lanza y NO se escribe nada.
      const confirmada = aplicar(gestionDesdeSnap(snap.id, snap.data()));
      // Una transición que RETIRA L/E debe revocar el espejo en este mismo
      // commit. Si la sincronización posterior falla, nunca queda acceso
      // heredado de una gestión revocada/suspendida/reducida a parcial.
      const proy = proyectarCarterasGestionadas([confirmada], confirmada.gestorUsuarioId);
      const quitarL = !proy.carterasL.includes(confirmada.propietarioId);
      const quitarE = !proy.carterasE.includes(confirmada.propietarioId);
      const usuarioSnap = (quitarL || quitarE)
        ? await tx.get(doc(db,COLECCION_USUARIOS,confirmada.gestorUsuarioId)) : null;
      const authUid = usuarioSnap?.exists() ? usuarioSnap.data().authUid as string | undefined : undefined;
      const mirrorRef = authUid ? doc(db,COLECCION_ESPEJOS_AUTH,authUid) : null;
      const mirrorSnap = mirrorRef ? await tx.get(mirrorRef) : null;
      const mirror = mirrorSnap?.exists() ? mirrorSnap.data() : null;
      const oldIndex: Record<string,string> = mirror?.gestionesPorPropietario || {};
      const newIndex = { ...oldIndex };
      if (confirmada.estado === 'ACTIVA' && confirmada.inmuebleIds.length === 0) newIndex[confirmada.propietarioId] = confirmada.id;
      else if (newIndex[confirmada.propietarioId] === confirmada.id) delete newIndex[confirmada.propietarioId];
      const oldL = Array.isArray(mirror?.carterasL) ? mirror.carterasL as string[] : [];
      const oldE = Array.isArray(mirror?.carterasE) ? mirror.carterasE as string[] : [];
      const newL = quitarL ? oldL.filter(x=>x!==confirmada.propietarioId) : oldL;
      const newE = quitarE ? oldE.filter(x=>x!==confirmada.propietarioId) : oldE;
      const reduce = !!mirrorRef && !!mirror && (newL.length!==oldL.length || newE.length!==oldE.length || JSON.stringify(oldIndex)!==JSON.stringify(newIndex));
      const auditRef = doc(collection(db,'audit_logs'));
      tx.set(ref, sanitizeObjectForFirestore({ ...confirmada, id, roadmap01AuditId:auditRef.id }));
      if (reduce && mirrorRef) tx.set(mirrorRef,
        {carterasL:newL,carterasE:newE,gestionesPorPropietario:newIndex,roadmap01AuditId:auditRef.id},{merge:true});
      const log = eventoObligatorioGestion(ref,confirmada,auditRef.id);
      if (reduce && mirrorRef) log.detalles.rutas.push(`usuarios_auth/${authUid}`);
      tx.set(auditRef, log);
      return confirmada;
    });
  },
  async listarPorPropietario(propietarioId, estado) {
    const filtros = [where('propietarioId', '==', propietarioId)];
    if (estado !== undefined) filtros.push(where('estado', '==', estado));
    const snap = await getDocs(
      query(collection(db, COLECCION_GESTIONES_CARTERA), ...filtros)
    );
    return snap.docs.map((d) => gestionDesdeSnap(d.id, d.data()));
  },
  async listarPorGestor(gestorUsuarioId, estado) {
    const filtros = [where('gestorUsuarioId', '==', gestorUsuarioId)];
    if (estado !== undefined) filtros.push(where('estado', '==', estado));
    const snap = await getDocs(
      query(collection(db, COLECCION_GESTIONES_CARTERA), ...filtros)
    );
    return snap.docs.map((d) => gestionDesdeSnap(d.id, d.data()));
  },
};

export const puertoPropietariosGestionesFirestore: PuertoPropietariosGestiones = {
  async existePropietario(id) {
    if (!id) return false;
    return (await getDoc(doc(db, COLECCION_PROPIETARIOS, id))).exists();
  },
};

function usuarioGestionableDesdeSnap(
  id: string,
  data: Record<string, unknown>
): UsuarioGestionable {
  return {
    id,
    estado: data['estado'] as UsuarioGestionable['estado'],
    propietarioId: data['propietarioId'] as string | undefined,
    authUid: data['authUid'] as string | undefined,
  };
}

export const puertoUsuariosGestionesFirestore: PuertoUsuariosGestiones = {
  async obtenerUsuario(id) {
    if (!id) return null;
    const snap = await getDoc(doc(db, COLECCION_USUARIOS, id));
    return snap.exists() ? usuarioGestionableDesdeSnap(snap.id, snap.data()) : null;
  },
  async buscarUsuarioPorPropietario(propietarioId) {
    if (!propietarioId) return null;
    // Sesión master (único contexto de escritura del servicio): `list` de
    // `usuarios` permitido solo al master por reglas.
    const snap = await getDocs(
      query(
        collection(db, COLECCION_USUARIOS),
        where('propietarioId', '==', propietarioId),
        limit(1)
      )
    );
    const primero = snap.docs[0];
    return primero ? usuarioGestionableDesdeSnap(primero.id, primero.data()) : null;
  },
};

export const puertoEspejoCarterasFirestore: PuertoEspejoCarteras = {
  async leerProyeccion(uid) {
    const snap = await getDoc(doc(db, COLECCION_ESPEJOS_AUTH, uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      carterasL: Array.isArray(data['carterasL']) ? (data['carterasL'] as string[]) : [],
      carterasE: Array.isArray(data['carterasE']) ? (data['carterasE'] as string[]) : [],
    };
  },
  async escribirProyeccion(uid, proyeccion: ProyeccionEspejo) {
    // R02: nunca publicar el snapshot recibido antes de una revocación.
    // La query solo descubre rutas: cada relación y propietario se relee EN
    // la transacción junto al espejo. Altas nuevas ausentes fallan cerrado.
    const actor = auth.currentUser;
    if (!actor || actor.email !== 'sarqsan2@gmail.com') throw new Error('Solo master proyecta carteras');
    const mirrorRef = doc(db, COLECCION_ESPEJOS_AUTH, uid);
    const mirror = await getDoc(mirrorRef);
    if (!mirror.exists() || !mirror.data().usuarioId) throw new Error('Espejo de identidad pendiente');
    const userId = mirror.data().usuarioId as string;
    const candidatos = await getDocs(query(collection(db, COLECCION_GESTIONES_CARTERA), where('gestorUsuarioId', '==', userId)));
    await runTransaction(db, async tx => {
      const [user, actual, ...gestiones] = await Promise.all([
        tx.get(doc(db, COLECCION_USUARIOS, userId)), tx.get(mirrorRef),
        ...candidatos.docs.map(g => tx.get(doc(db, COLECCION_GESTIONES_CARTERA, g.id))),
      ]);
      if (!user.exists() || user.data().authUid !== uid || !actual.exists() || actual.data().usuarioId !== userId)
        throw new Error('Identidad del espejo ha cambiado');
      const frescas = gestiones.filter(g => g.exists()).map(g => gestionDesdeSnap(g.id, g.data()));
      const owners = await Promise.all([...new Set(frescas.map(g => g.propietarioId))]
        .map(id => tx.get(doc(db, COLECCION_PROPIETARIOS, id))));
      const existentes = new Set(owners.filter(o => o.exists()).map(o => o.id));
      const derivada = proyectarCarterasGestionadas(frescas.filter(g => existentes.has(g.propietarioId)), userId);
      // El caller puede solicitar una reducción, jamás ampliar la derivación.
      const indexadas: Record<string,string> = actual.data().gestionesPorPropietario || {};
      const carterasL = derivada.carterasL.filter(id => proyeccion.carterasL.includes(id));
      const carterasE = derivada.carterasE.filter(id => proyeccion.carterasE.includes(id));
      const gestionesPorPropietario = { ...indexadas };
      for (const pid of Object.keys(gestionesPorPropietario)) if (!derivada.carterasL.includes(pid) && !derivada.carterasE.includes(pid)) delete gestionesPorPropietario[pid];
      for (const pid of new Set([...carterasL, ...carterasE])) {
        const vigente = frescas.find(g => g.propietarioId === pid && g.estado === 'ACTIVA');
        if (vigente) gestionesPorPropietario[pid] = vigente.id;
      }
      const audit = doc(collection(db, 'audit_logs'));
      tx.set(mirrorRef, { carterasL, carterasE, gestionesPorPropietario, roadmap01AuditId: audit.id }, { merge: true });
      tx.set(audit, { id: audit.id, usuarioId: actor.uid, usuarioEmail: actor.email, usuarioNombre: actor.email,
        accion: 'PROYECCION_GESTION_CARTERA', descripcion: 'Proyección verificada en transacción',
        fechaHora: new Date().toISOString(), entidadAfectada: 'usuario', idAfectado: userId, resultado: 'EXITO',
        detalles: { actorUid: actor.uid, rutas: [`usuarios_auth/${uid}`] } });
    });
  },
};

// El puerto del núcleo es informativo para dobles/consumidores legacy.
// En Firestore la evidencia obligatoria YA se escribió en la misma transacción
// de crearGestion/aplicarTransicion; volver a registrar aquí duplicaría el log.
export const puertoAuditoriaGestionesFirestore: PuertoAuditoriaGestiones = {
  async registrar() { /* evento canónico persistido por el puerto de gestiones */ },
};

export const dependenciasGestionesCarteraFirestore: DependenciasGestionesCartera = {
  gestiones: puertoGestionesCarteraFirestore,
  propietarios: puertoPropietariosGestionesFirestore,
  usuarios: puertoUsuariosGestionesFirestore,
  espejo: puertoEspejoCarterasFirestore,
  auditoria: puertoAuditoriaGestionesFirestore,
};
