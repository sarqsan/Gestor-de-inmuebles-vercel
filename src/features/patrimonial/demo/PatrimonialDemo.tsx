import { useReducer, useState } from 'react';
import { EstadoAccesoBadge } from '../components/EstadoAccesoBadge.tsx';
import { FormularioPropietario } from '../components/FormularioPropietario.tsx';
import { ListaPropietarios } from '../components/ListaPropietarios.tsx';
import { OnboardingPatrimonial } from '../components/OnboardingPatrimonial.tsx';
import { OPCIONES_MODALIDAD } from '../components/SelectorModalidadUso.tsx';
import { GESTOR_PROFESIONAL_DEMO } from './fixtures.ts';
import { crearEstadoDemo, reducirDemo } from './state.ts';
import type { EstadoDemo } from './state.ts';
import { evaluarCompletitud } from '../completeness.ts';
import { previsualizarImportacion } from '../importPreview.ts';
import { crearBorrador } from '../domain.ts';
import { RevisionDatosPropietario } from '../components/RevisionDatosPropietario.tsx';
import { RevisionImportacion } from '../components/RevisionImportacion.tsx';
import { CONTEXTO_IMPORTACION_DEMO, ORIGEN_IMPORTACION_DEMO, REGLAS_PROPIETARIOS_DEMO } from './revisionFixtures.ts';
import './demo.css';

export interface PatrimonialDemoProps {
  estadoInicial?: EstadoDemo;
}

/** Composición de demostración; nunca importa App ni servicios productivos. */
export function PatrimonialDemo({ estadoInicial }: PatrimonialDemoProps) {
  const [estado, dispatch] = useReducer(reducirDemo, estadoInicial, (inicial) => inicial ?? crearEstadoDemo());
  const [mostrarPortada, setMostrarPortada] = useState(false);
  const seleccionado = estado.propietarios.find((p) => p.id === estado.propietarioSeleccionadoId);
  const modalidad = OPCIONES_MODALIDAD.find((opcion) => opcion.valor === estado.modalidadSeleccionada);
  const editor = estado.editor;
  const preview = previsualizarImportacion(
    { datosOrigen: ORIGEN_IMPORTACION_DEMO, propietarioDestinoId: estado.propietarioDestinoId },
    { ...CONTEXTO_IMPORTACION_DEMO, propietarios: estado.propietarios },
  );

  return (
    <div className="pat-demo">
      <header className="pat-header">
        <a href="#contenido-patrimonial" className="pat-brand"><span aria-hidden="true">P.</span> Patrimonial <small>LAB</small></a>
        <span className="pat-demo-label">DEMO AISLADA · PATRIMONIAL</span>
      </header>
      <main id="contenido-patrimonial" className="pat-main">
        <div className="pat-safety-banner"><span aria-hidden="true">◈</span> Entorno ficticio · solo memoria · sin conexión a servicios. Al recargar, se pierden los cambios.</div>
        {mostrarPortada ? (
          <section className="pat-welcome">
            <p className="pat-eyebrow">Un espacio para probar</p>
            <h1>Primero, las personas propietarias.<br /><span>Las cuentas, por separado.</span></h1>
            <p className="pat-lead">Explora formas de uso y fichas ficticias. Esta demo no activa cuentas, no asigna permisos y no registra inmuebles.</p>
            <button className="pat-button pat-primary" type="button" onClick={() => setMostrarPortada(false)}>Elegir forma de uso →</button>
          </section>
        ) : estado.pantalla === 'onboarding' ? (
          <OnboardingPatrimonial
            modalidadSeleccionada={estado.modalidadSeleccionada}
            onChange={(valor) => dispatch({ type: 'seleccionarModalidad', modalidad: valor })}
            onVolver={() => setMostrarPortada(true)}
            onContinuar={() => dispatch({ type: 'continuar' })}
          />
        ) : (
          <>
            <div className="pat-workspace-heading">
              <div>
                <p className="pat-eyebrow">02 / Tu contexto de trabajo</p>
                <h1>Un lugar para cada propietario.</h1>
                <p className="pat-lead">Organiza fichas, no permisos. Todos los datos de este espacio son ficticios.</p>
              </div>
              <button type="button" className="pat-button" onClick={() => dispatch({ type: 'volverModalidad' })}>← Cambiar modalidad</button>
            </div>
            <div className="pat-context">
              <div><span className="pat-eyebrow">Elección local</span><strong>{modalidad?.titulo ?? 'Sin seleccionar'}</strong></div>
              <p>La elección no cambia las fichas, sus cuentas ni sus referencias de inmuebles.</p>
            </div>
            {estado.modalidadSeleccionada === 'GESTOR_PROFESIONAL' && (
              <aside className="pat-professional" aria-label="Contexto ficticio de gestor profesional">
                <div><strong>{GESTOR_PROFESIONAL_DEMO.nombre}</strong><p>Ejemplo precargado, no un gestor creado por la elección de modalidad. No representa autorización.</p></div>
                <div><strong>{GESTOR_PROFESIONAL_DEMO.inmueblesPropios.length}</strong><span>inmuebles propios</span></div>
                <div><strong>{GESTOR_PROFESIONAL_DEMO.propietariosContextoIds.length}</strong><span>propietarios en el contexto ficticio</span></div>
              </aside>
            )}
            <div className="pat-toolbar">
              <p>Crear propietario ≠ crear cuenta ≠ conceder acceso</p>
              <button type="button" className="pat-button pat-primary" disabled={editor !== null} onClick={() => dispatch({ type: 'crearBorrador' })}>＋ Nuevo borrador</button>
            </div>
            <p className="pat-feedback" role="status">{estado.aviso}</p>
            <div className="pat-workspace">
              <ListaPropietarios
                propietarios={estado.propietarios}
                busqueda={estado.busqueda}
                onBusquedaChange={(busqueda) => dispatch({ type: 'buscar', busqueda })}
                propietarioSeleccionadoId={estado.propietarioSeleccionadoId}
                onSeleccionar={(propietarioId) => dispatch({ type: 'seleccionarPropietario', propietarioId })}
              />
              <div>
                {editor ? (
                  <FormularioPropietario
                    borrador={editor.borrador}
                    modo={editor.propietarioId === null ? 'crear' : 'editar'}
                    error={editor.error}
                    evaluacionDatos={evaluarCompletitud(editor.borrador, editor.propietarioId === null
                      ? null : REGLAS_PROPIETARIOS_DEMO.get(editor.propietarioId) ?? null)}
                    onChange={(borrador) => dispatch({ type: 'cambiarBorrador', borrador })}
                    onGuardar={(borrador) => {
                      dispatch({ type: 'cambiarBorrador', borrador });
                      dispatch({ type: 'guardarBorrador' });
                    }}
                    onCancelar={() => dispatch({ type: 'cancelarBorrador' })}
                  />
                ) : seleccionado ? (
                  <section className="pat-panel pat-detail" aria-label="Detalle del propietario seleccionado">
                    <p className="pat-eyebrow">Ficha de ejemplo</p>
                    <h2>{seleccionado.nombre}</h2>
                    <EstadoAccesoBadge estado={seleccionado.estadoAcceso} />
                    <RevisionDatosPropietario
                      evaluacion={evaluarCompletitud(crearBorrador(seleccionado), REGLAS_PROPIETARIOS_DEMO.get(seleccionado.id) ?? null)}
                      onRevisar={() => dispatch({ type: 'editarBorrador', propietarioId: seleccionado.id })}
                    />
                    <dl>
                      <div><dt>Cuenta de acceso</dt><dd>{seleccionado.cuentaId === null ? 'Sin cuenta vinculada' : 'Cuenta vinculada ficticia'}</dd></div>
                      <div><dt>NIF/CIF</dt><dd>{seleccionado.nifCif || 'No indicado'}</dd></div>
                      <div><dt>Email</dt><dd>{seleccionado.email || 'No indicado'}</dd></div>
                      <div><dt>Teléfono</dt><dd>{seleccionado.telefono || 'No indicado'}</dd></div>
                    </dl>
                    <h3>{seleccionado.inmuebles.length} {seleccionado.inmuebles.length === 1 ? 'inmueble' : 'inmuebles'} de ejemplo</h3>
                    {seleccionado.inmuebles.length === 0 ? (
                      <p className="pat-note">Esta ficha es válida con 0 inmuebles. No necesitas crear ninguno.</p>
                    ) : (
                      <ul className="pat-property-list">{seleccionado.inmuebles.map((inmueble) => <li key={inmueble.id}>{inmueble.nombre}</li>)}</ul>
                    )}
                    <p className="pat-note">Referencias informativas. No se modifica ni se infiere titularidad. El acceso no implica gestión activa.</p>
                    <button type="button" className="pat-button" onClick={() => dispatch({ type: 'editarBorrador', propietarioId: seleccionado.id })}>Editar borrador</button>
                  </section>
                ) : (
                  <section className="pat-panel pat-detail pat-empty" aria-label="Selecciona una ficha">
                    <span className="pat-empty-icon" aria-hidden="true">↗</span>
                    <h2>Una ficha, su propio contexto.</h2>
                    <p>Selecciona un propietario para ver sus datos, su estado de acceso y sus inmuebles ficticios. O crea un borrador, sin cuenta.</p>
                    <span className="pat-note">Invitaciones, activación e importación real permanecen desconectadas.</span>
                  </section>
                )}
              </div>
            </div>
            <p className="pat-note">Completitud de ejemplo: A usa solo nombre identificativo; B no tiene requisitos configurados; C no tiene política disponible. Ninguna regla es una obligación fiscal. Las fichas nuevas tampoco reciben una política implícita.</p>
            <RevisionImportacion
              propietarios={estado.propietarios}
              preview={preview}
              onDestinoChange={(propietarioDestinoId) => dispatch({ type: 'seleccionarDestinoImportacion', propietarioDestinoId })}
              indiceRevision={estado.indiceRevisionImportacion}
              onRevisarRegistro={(indiceOrigen) => dispatch({ type: 'revisarRegistroImportacion', indiceOrigen })}
            />
          </>
        )}
      </main>
      <footer className="pat-footer"><span>Patrimonial / Laboratorio de UX</span><span>Basado en D1 · sin persistencia ni permisos efectivos</span></footer>
    </div>
  );
}
