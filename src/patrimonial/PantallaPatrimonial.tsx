/**
 * INC-06 — Pantalla de producción del módulo patrimonial.
 * ---------------------------------------------------------------------------
 * NO rehace la UI: reutiliza los componentes YA creados por el módulo
 * (`src/features/patrimonial`, API pública de index.ts) y los conecta con la
 * persistencia real (núcleo puro `patrimonialPersistencia.ts` + adaptador
 * Firestore). La demo aislada de C sigue intacta y sin conectar a producción.
 *
 * Garantías visibles:
 *  · El selector de destino es el componente de C: sin autoselección.
 *  · La previsualización es el dry-run puro de C: no escribe nada.
 *  · La ejecución confirmada exige destino explícito y pasa por el núcleo
 *    (re-verificación, ids deterministas, incidencias conservadas, auditoría).
 *  · No se muestran datos que no existan: sin ficha persistida, se dice.
 */
import { useMemo, useState } from 'react';
import type { Propietario, UsuarioApp } from '../types';
import {
  EstadoAccesoBadge,
  EstadoDatosBadge,
  FormularioPropietario,
  ListaPropietarios,
  OnboardingPatrimonial,
  RevisionDatosPropietario,
  RevisionImportacion,
  crearBorrador,
  evaluarCompletitud,
  filtrarPropietarios,
  previsualizarImportacion,
  type BorradorPropietario,
  type ContextoPrevisualizacion,
  type ModalidadUso,
  type PrevisualizacionImportacion,
  type ReferenciaPropietario,
  type ReglasRevisionDatos,
} from '../features/patrimonial';
import { contextoDestinoDesdeAmbito, encajarModalidadEnD1R } from '../lib/patrimonialIntegracion';
import {
  actualizarFichaPatrimonial,
  crearFichaPatrimonial,
  ejecutarImportacionPatrimonial,
  obtenerFichaPatrimonial,
  type ActorPatrimonial,
  type FichaPatrimonialPersistente,
  type ResultadoEjecucionImportacion,
} from '../lib/patrimonialPersistencia';
import { dependenciasPatrimonialesFirestore } from '../lib/patrimonialPersistenciaFirebase';

export interface PantallaPatrimonialProps {
  propietarios: readonly Propietario[];
  usuarioActual: UsuarioApp;
  /** Alta del propietario jurídico por el flujo YA existente de la app (S3). */
  onCrearPropietario: (propietario: Propietario) => Promise<void>;
}

/**
 * Política base EXPLÍCITA de la ficha (v1): presencia de identificación y
 * contacto. Es una decisión declarada, no una lista universal derivada del
 * acceso. Una ficha puede evaluarse con otra política si se suministra.
 */
export const POLITICA_FICHA_BASE_V1: ReglasRevisionDatos = {
  politica: { id: 'ficha-patrimonial-base-v1', camposRequeridos: ['nombre', 'nifCif', 'email'] },
};

type Vista = 'lista' | 'alta' | 'ficha' | 'importacion';

function referenciaDesde(p: Propietario, ficha: FichaPatrimonialPersistente | null): ReferenciaPropietario {
  return {
    id: p.id,
    nombre: p.nombre ?? '',
    nifCif: p.nifCif ?? '',
    email: p.email ?? '',
    telefono: p.telefono ?? '',
    estadoAcceso: ficha?.estadoAcceso ?? 'SIN_CUENTA',
    cuentaId: null, // la pantalla no afirma cuentas que no puede verificar
    inmuebles: [],
  };
}

export function PantallaPatrimonial({ propietarios, usuarioActual, onCrearPropietario }: PantallaPatrimonialProps) {
  const [vista, setVista] = useState<Vista>('lista');
  const [busqueda, setBusqueda] = useState('');
  const [modalidad, setModalidad] = useState<ModalidadUso | null>(null);
  const [borrador, setBorrador] = useState<BorradorPropietario>(crearBorrador());
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [borradorEdicion, setBorradorEdicion] = useState<BorradorPropietario | null>(null);
  const [ficha, setFicha] = useState<FichaPatrimonialPersistente | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [jsonOrigen, setJsonOrigen] = useState('');
  const [destinoId, setDestinoId] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoEjecucionImportacion | null>(null);
  const [ejecutando, setEjecutando] = useState(false);

  const actor: ActorPatrimonial = {
    usuarioId: usuarioActual.uid ?? usuarioActual.authUid ?? usuarioActual.id,
    email: usuarioActual.email,
    nombre: `${usuarioActual.nombre}${usuarioActual.apellidos ? ` ${usuarioActual.apellidos}` : ''}`,
  };

  // Contexto de planificación: titularidad propia ∪ ámbito recibido. Para el
  // ámbito administrativo se listan las fichas visibles; la autorización
  // efectiva sigue en las reglas (esto es solo el snapshot del dry-run).
  const contexto = useMemo(
    () => contextoDestinoDesdeAmbito(
      propietarios.map((p) => ({ id: p.id, nombre: p.nombre ?? '' })),
      usuarioActual.tipoPerfil === 'ADMINISTRADOR'
        ? { propietariosGestionados: propietarios.map((p) => p.id) }
        : { propietarioId: usuarioActual.propietarioId },
    ),
    [propietarios, usuarioActual.tipoPerfil, usuarioActual.propietarioId],
  );

  const referencias = useMemo(
    () => propietarios.map((p) => referenciaDesde(p, null)),
    [propietarios],
  );
  const visibles = filtrarPropietarios(referencias, busqueda);

  const datosOrigen = useMemo(() => {
    const texto = jsonOrigen.trim();
    if (!texto) return null;
    try {
      const parseado: unknown = JSON.parse(texto);
      if (!Array.isArray(parseado)) return { error: 'Se espera un array JSON de registros.' as const };
      const invalido = parseado.some((r) => r === null || typeof r !== 'object' || Array.isArray(r));
      if (invalido) return { error: 'Cada registro debe ser un objeto JSON.' as const };
      return { registros: parseado as Record<string, unknown>[] };
    } catch {
      return { error: 'JSON no válido.' as const };
    }
  }, [jsonOrigen]);

  const preview: PrevisualizacionImportacion | null = useMemo(() => {
    if (!datosOrigen || 'error' in datosOrigen) return null;
    const contextoPreview: ContextoPrevisualizacion = {
      ...contexto,
      reglasPorRegistro: datosOrigen.registros.map(() => POLITICA_FICHA_BASE_V1),
    };
    // Dry-run puro del módulo C: clona el origen, no escribe, no concede nada.
    return previsualizarImportacion(
      { datosOrigen: datosOrigen.registros, propietarioDestinoId: destinoId },
      contextoPreview,
    );
  }, [datosOrigen, contexto, destinoId]);

  async function abrirFicha(propietarioId: string) {
    setSeleccionadoId(propietarioId);
    setMensaje(null);
    const prop = propietarios.find((p) => p.id === propietarioId);
    setBorradorEdicion(prop ? crearBorrador({
      nombre: prop.nombre ?? '', nifCif: prop.nifCif ?? '',
      email: prop.email ?? '', telefono: prop.telefono ?? '',
    }) : null);
    const lectura = await obtenerFichaPatrimonial(dependenciasPatrimonialesFirestore, propietarioId);
    if (lectura.estado === 'OK') {
      setFicha(lectura.ficha);
      setVista('ficha');
    } else {
      setFicha(null);
      setMensaje(lectura.mensaje);
      setVista('ficha');
    }
  }

  async function guardarAlta(datos: BorradorPropietario) {
    if (!modalidad) { setMensaje('Selecciona primero la modalidad de uso.'); return; }
    const hoy = new Date().toISOString().slice(0, 10);
    const nuevo: Propietario = {
      id: `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nombre: datos.nombre,
      nifCif: datos.nifCif,
      email: datos.email,
      telefono: datos.telefono,
      tipoPropietario: 'persona_fisica',
      direccion: '',
      ciudad: '',
      codigoPostal: '',
      cuentasBancarias: [],
      fechaCreacion: hoy,
      fechaActualizacion: hoy,
    };
    await onCrearPropietario(nuevo);
    // S3: el propietario existe; la cuenta NO (SIN_CUENTA hasta vínculo explícito).
    const creado = await crearFichaPatrimonial(dependenciasPatrimonialesFirestore, {
      propietarioId: nuevo.id,
      modalidad,
      vinculo: { cuentaId: null, cuentaActiva: false, invitacionPendiente: false },
      datos,
      reglas: POLITICA_FICHA_BASE_V1,
      procedencia: { sistema: 'ERP', origenId: null, fuente: 'alta_manual_pantalla', loteId: null },
      actor,
      ahora: new Date().toISOString(),
    });
    if (creado.estado === 'OK') {
      setMensaje(`Propietario y ficha creados. Acceso: ${creado.ficha.estadoAcceso} (crear propietario no concede acceso).`);
      setBorrador(crearBorrador());
      setVista('lista');
    } else {
      setMensaje(`No se pudo crear la ficha: ${creado.mensaje}`);
    }
  }

  async function guardarCambiosFicha(datos: BorradorPropietario) {
    if (!seleccionadoId) return;
    const actualizada = await actualizarFichaPatrimonial(dependenciasPatrimonialesFirestore, {
      propietarioId: seleccionadoId,
      cambios: datos,
      reglas: POLITICA_FICHA_BASE_V1,
      actor,
      ahora: new Date().toISOString(),
    });
    if (actualizada.estado === 'OK') {
      setFicha(actualizada.ficha);
      setMensaje(`Ficha actualizada (datos: ${actualizada.ficha.estadoDatos}).`);
    } else {
      setMensaje(`No se pudo actualizar: ${actualizada.mensaje}`);
    }
  }

  async function confirmarImportacion() {
    if (!preview || preview.destino.estado !== 'VALIDO') {
      setMensaje('Selecciona un destino válido antes de confirmar.');
      return;
    }
    setEjecutando(true);
    setMensaje(null);
    try {
      const ejecucion = await ejecutarImportacionPatrimonial(dependenciasPatrimonialesFirestore, {
        contexto,
        previsualizacion: preview,
        propietarioDestinoId: preview.destino.propietarioDestinoId,
        origen: { sistema: 'PEGADO_MANUAL', fuente: 'pantalla_patrimonial' },
        actor,
        ahora: new Date().toISOString(),
      });
      setResultado(ejecucion);
    } finally {
      setEjecutando(false);
    }
  }

  const propietarioSeleccionado = propietarios.find((p) => p.id === seleccionadoId) ?? null;
  const evaluacionFichaActual = ficha && propietarioSeleccionado
    ? evaluarCompletitud(
      {
        nombre: propietarioSeleccionado.nombre ?? '',
        nifCif: propietarioSeleccionado.nifCif ?? '',
        email: propietarioSeleccionado.email ?? '',
        telefono: propietarioSeleccionado.telefono ?? '',
      },
      POLITICA_FICHA_BASE_V1,
    )
    : null;
  const encaje = modalidad ? encajarModalidadEnD1R(modalidad) : null;

  return (
    <section className="patrimonial-inc06" aria-label="Patrimonial: fichas e importación controlada" style={{ margin: '24px 0', padding: 16, border: '1px solid #d7dbe3', borderRadius: 8 }}>
      <h2>Patrimonial (INC-06)</h2>
      <p style={{ opacity: 0.75 }}>
        Fichas patrimoniales persistentes e importación controlada con destino explícito.
        La previsualización no escribe; la ejecución confirmada audita cada operación.
      </p>
      <nav style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        {(['lista', 'alta', 'importacion'] as const).map((v) => (
          <button key={v} type="button" onClick={() => setVista(v)} aria-pressed={vista === v}>
            {v === 'lista' ? 'Propietarios' : v === 'alta' ? 'Nuevo propietario' : 'Importación'}
          </button>
        ))}
      </nav>
      {mensaje && <p role="status" style={{ fontWeight: 600 }}>{mensaje}</p>}

      {vista === 'lista' && (
        <>
          <ListaPropietarios
            propietarios={visibles}
            busqueda={busqueda}
            onBusquedaChange={setBusqueda}
            propietarioSeleccionadoId={seleccionadoId}
            onSeleccionar={(id) => void abrirFicha(id)}
          />
        </>
      )}

      {vista === 'alta' && (
        <>
          <OnboardingPatrimonial
            modalidadSeleccionada={modalidad}
            onChange={setModalidad}
            onVolver={() => setVista('lista')}
            onContinuar={() => setMensaje(null)}
          />
          {encaje && (
            <p style={{ opacity: 0.75 }}>
              Encaje D1R: tipoGestor {encaje.tipoGestor ?? '— (titular)'} · rol {encaje.rolGestor ?? '—'} ·
              la modalidad nunca concede acceso por sí misma.
            </p>
          )}
          {modalidad && (
            <FormularioPropietario
              borrador={borrador}
              modo="crear"
              onChange={setBorrador}
              onGuardar={(b) => void guardarAlta(b)}
              onCancelar={() => setVista('lista')}
              evaluacionDatos={evaluarCompletitud(borrador, POLITICA_FICHA_BASE_V1)}
            />
          )}
        </>
      )}

      {vista === 'ficha' && propietarioSeleccionado && (
        <>
          <h3>{propietarioSeleccionado.nombre}</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <EstadoAccesoBadge estado={ficha?.estadoAcceso ?? 'SIN_CUENTA'} />
            {ficha ? <EstadoDatosBadge estado={ficha.estadoDatos} /> : <span>Sin ficha patrimonial persistida.</span>}
          </div>
          {ficha ? (
            <div style={{ margin: '8px 0' }}>
              <p>
                Modalidad: <strong>{ficha.modalidad}</strong> · Política: {ficha.politicaId ?? '—'} ·
                Procedencia: {ficha.procedencia.sistema}/{ficha.procedencia.fuente ?? '—'} ·
                Actualizada: {ficha.actualizadaEn} por {ficha.actualizadaPor}
              </p>
              {ficha.camposFaltantes.length > 0 && <p>Campos pendientes: {ficha.camposFaltantes.join(', ')}</p>}
              <RevisionDatosPropietario evaluacion={evaluacionFichaActual ?? {
                estadoDatos: ficha.estadoDatos, camposFaltantes: [...ficha.camposFaltantes],
                politicaId: ficha.politicaId, incidencias: [],
              }} />
            </div>
          ) : (
            <p>
              Este propietario no tiene ficha patrimonial. La lectura histórica de sus datos no
              concede gestión activa ni escritura (S7).
            </p>
          )}
          <FormularioPropietario
            borrador={borradorEdicion ?? crearBorrador({
              nombre: propietarioSeleccionado.nombre ?? '',
              nifCif: propietarioSeleccionado.nifCif ?? '',
              email: propietarioSeleccionado.email ?? '',
              telefono: propietarioSeleccionado.telefono ?? '',
            })}
            modo="editar"
            onChange={setBorradorEdicion}
            onGuardar={(b) => void guardarCambiosFicha(b)}
            onCancelar={() => setVista('lista')}
            {...(evaluacionFichaActual ? { evaluacionDatos: evaluacionFichaActual } : {})}
          />
        </>
      )}

      {vista === 'importacion' && (
        <>
          <label>
            Registros de origen (array JSON de objetos):
            <textarea
              value={jsonOrigen}
              onChange={(e) => setJsonOrigen(e.target.value)}
              rows={6}
              style={{ width: '100%' }}
              placeholder='[{"nombre":"Piso Centro","direccion":"..."}]'
            />
          </label>
          {datosOrigen && 'error' in datosOrigen && <p role="alert">{datosOrigen.error}</p>}
          {preview && (
            <>
              <RevisionImportacion
                propietarios={contexto.propietarios}
                preview={preview}
                onDestinoChange={setDestinoId}
                indiceRevision={null}
                onRevisarRegistro={() => { /* revisión por registro disponible en la demo; aquí basta el resumen */ }}
              />
              <button
                type="button"
                disabled={ejecutando || preview.destino.estado !== 'VALIDO'}
                onClick={() => void confirmarImportacion()}
              >
                {ejecutando ? 'Ejecutando…' : 'Confirmar importación (escritura real + auditoría)'}
              </button>
            </>
          )}
          {resultado && (
            <div style={{ marginTop: 12 }}>
              <h4>Resultado: {resultado.estado}</h4>
              <p>
                Lote: {resultado.loteId ?? '—'} · Destino: {resultado.propietarioDestinoId ?? '—'} ·
                Analizados {resultado.analizados} · Creados {resultado.creados} · Sin cambios {resultado.sinCambios} ·
                Bloqueados {resultado.bloqueados} · Colisiones {resultado.colisiones} · Errores {resultado.errores} ·
                Auditoría: {resultado.auditoriaRegistrada ? 'registrada' : 'FALLIDA'}
              </p>
              {resultado.incidencias.length > 0 && (
                <ul>
                  {resultado.incidencias.map((i, idx) => (
                    <li key={idx}>[{i.nivel}] {i.codigo}: {i.mensaje}{i.indiceOrigen !== undefined ? ` (origen ${i.indiceOrigen + 1})` : ''}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
