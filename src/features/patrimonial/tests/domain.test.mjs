import assert from 'node:assert/strict';
import test from 'node:test';
import { MODALIDADES_USO, ESTADOS_ACCESO } from '../contracts.ts';
import { crearBorrador, crearReferenciaLocal, editarReferenciaLocal, filtrarPropietarios, validarBorradorDemo } from '../domain.ts';
import { PROPIETARIOS_DEMO, GESTOR_PROFESIONAL_DEMO } from '../demo/fixtures.ts';
import { crearEstadoDemo, reducirDemo } from '../demo/state.ts';

function congelar(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(congelar);
    Object.freeze(value);
  }
  return value;
}

const inicial = () => congelar(crearEstadoDemo());
const borrador = (nombre = 'Borrador de Prueba Ficticio') => ({ ...crearBorrador(), nombre });

function guardarNuevo(estado, nombre) {
  let resultado = reducirDemo(estado, { type: 'crearBorrador' });
  resultado = reducirDemo(resultado, { type: 'cambiarBorrador', borrador: borrador(nombre) });
  return reducirDemo(resultado, { type: 'guardarBorrador' });
}

test('los contratos contienen exactamente las tres modalidades y los tres estados de acceso', () => {
  assert.deepEqual(MODALIDADES_USO, ['PROPIETARIO', 'GESTOR_PROPIETARIO', 'GESTOR_PROFESIONAL']);
  assert.deepEqual(ESTADOS_ACCESO, ['SIN_CUENTA', 'INVITADO', 'ACTIVO']);
});

for (const modalidad of MODALIDADES_USO) {
  test(`seleccionar ${modalidad} solo cambia modalidadSeleccionada`, () => {
    const antes = inicial();
    const despues = reducirDemo(antes, { type: 'seleccionarModalidad', modalidad });
    assert.deepEqual(despues, { ...antes, modalidadSeleccionada: modalidad });
    assert.equal(despues.propietarios, antes.propietarios);
    assert.equal(despues.propietarioSeleccionadoId, null);
    assert.equal(antes.modalidadSeleccionada, null);
  });
}

test('no se continúa sin modalidad; volver conserva elección y fichas', () => {
  const estado = inicial();
  assert.equal(reducirDemo(estado, { type: 'continuar' }), estado);
  const elegido = reducirDemo(estado, { type: 'seleccionarModalidad', modalidad: 'GESTOR_PROFESIONAL' });
  const avanzado = reducirDemo(elegido, { type: 'continuar' });
  assert.equal(avanzado.pantalla, 'propietarios');
  assert.deepEqual(reducirDemo(avanzado, { type: 'volverModalidad' }), elegido);
});

for (const estadoAcceso of ESTADOS_ACCESO) {
  test(`el listado admite propietario ${estadoAcceso} sin exigir una cuenta por ficha`, () => {
    const ficha = PROPIETARIOS_DEMO.find((p) => p.estadoAcceso === estadoAcceso);
    assert.ok(ficha);
    assert.ok(filtrarPropietarios(PROPIETARIOS_DEMO, '').includes(ficha));
    if (estadoAcceso !== 'ACTIVO') assert.equal(ficha.cuentaId, null);
    else assert.equal(typeof ficha.cuentaId, 'string');
  });
}

test('propietario invitado con cero inmuebles es válido y seleccionable', () => {
  const ficha = PROPIETARIOS_DEMO[2];
  assert.equal(ficha.estadoAcceso, 'INVITADO');
  assert.equal(ficha.inmuebles.length, 0);
  const estado = reducirDemo(inicial(), { type: 'seleccionarPropietario', propietarioId: ficha.id });
  assert.equal(estado.propietarioSeleccionadoId, ficha.id);
  assert.equal(estado.propietarios[2].inmuebles.length, 0);
});

test('varios inmuebles son válidos tanto con cuenta activa como sin cuenta', () => {
  for (const ficha of PROPIETARIOS_DEMO.slice(0, 2)) assert.ok(ficha.inmuebles.length > 1);
  assert.equal(PROPIETARIOS_DEMO[1].cuentaId, null);
});

test('gestor profesional ficticio con cero inmuebles propios y varios propietarios de contexto', () => {
  assert.equal(GESTOR_PROFESIONAL_DEMO.modalidad, 'GESTOR_PROFESIONAL');
  assert.equal(GESTOR_PROFESIONAL_DEMO.inmueblesPropios.length, 0);
  assert.ok(GESTOR_PROFESIONAL_DEMO.propietariosContextoIds.length > 1);
  assert.deepEqual(GESTOR_PROFESIONAL_DEMO.propietariosContextoIds, PROPIETARIOS_DEMO.map((p) => p.id));
});

test('buscar ignora acentos, mayúsculas y espacios y no filtra por cuenta', () => {
  assert.equal(filtrarPropietarios(PROPIETARIOS_DEMO, ' CARTON ')[0].id, 'demo-propietario-b');
  assert.equal(filtrarPropietarios(PROPIETARIOS_DEMO, 'aurora@example.invalid')[0].id, 'demo-propietario-a');
  assert.equal(filtrarPropietarios(PROPIETARIOS_DEMO, '').length, 3);
  assert.deepEqual(filtrarPropietarios(PROPIETARIOS_DEMO, 'no-existe'), []);
  assert.deepEqual(filtrarPropietarios([], ''), []);
});

test('crear borrador con solo nombre no inventa otros campos obligatorios', () => {
  const ficha = crearReferenciaLocal('demo-nueva', borrador('  Ejemplo Nuevo  '));
  assert.equal(ficha.nombre, 'Ejemplo Nuevo');
  assert.equal(ficha.nifCif, '');
  assert.equal(ficha.email, '');
  assert.equal(ficha.estadoAcceso, 'SIN_CUENTA');
  assert.equal(ficha.cuentaId, null);
  assert.deepEqual(ficha.inmuebles, []);
  assert.equal('estadoDatos' in ficha, false);
  assert.equal('estadoGestion' in ficha, false);
});

test('nombre vacío produce un error local, no una clasificación de completitud', () => {
  assert.equal(typeof validarBorradorDemo(borrador('  ')), 'string');
  assert.throws(() => crearReferenciaLocal('demo-nueva', borrador('  ')));
  assert.throws(() => crearReferenciaLocal('', borrador()));
  let estado = reducirDemo(inicial(), { type: 'crearBorrador' });
  estado = reducirDemo(estado, { type: 'guardarBorrador' });
  assert.ok(estado.editor.error);
  assert.equal(estado.propietarios, PROPIETARIOS_DEMO);
});

test('editar solo los campos de ficha preserva acceso, cuenta e inmuebles', () => {
  for (const ficha of PROPIETARIOS_DEMO) {
    const editada = editarReferenciaLocal(congelar(ficha), {
      ...borrador(' Nombre Nuevo '),
      // Incluso si un consumidor JS envía campos ajenos, no se copian al contrato.
      estadoAcceso: 'ACTIVO', cuentaId: 'otra', inmuebles: [], id: 'otro',
    });
    assert.equal(editada.nombre, 'Nombre Nuevo');
    assert.equal(editada.id, ficha.id);
    assert.equal(editada.estadoAcceso, ficha.estadoAcceso);
    assert.equal(editada.cuentaId, ficha.cuentaId);
    assert.equal(editada.inmuebles, ficha.inmuebles);
    assert.notEqual(editada, ficha);
  }
});

test('cancelar alta o edición no cambia fichas', () => {
  for (const accion of [{ type: 'crearBorrador' }, { type: 'editarBorrador', propietarioId: PROPIETARIOS_DEMO[0].id }]) {
    let estado = reducirDemo(inicial(), accion);
    estado = reducirDemo(estado, { type: 'cambiarBorrador', borrador: borrador('Descartado') });
    estado = reducirDemo(estado, { type: 'cancelarBorrador' });
    assert.equal(estado.editor, null);
    assert.equal(estado.propietarios, PROPIETARIOS_DEMO);
  }
});

test('guardar altas sucesivas permanece en memoria y usa identificadores locales distintos', () => {
  const antes = inicial();
  let estado = guardarNuevo(antes, 'Primera ficha ficticia');
  estado = guardarNuevo(estado, 'Segunda ficha ficticia');
  assert.equal(estado.propietarios.length, 5);
  assert.equal(new Set(estado.propietarios.map((p) => p.id)).size, 5);
  assert.equal(estado.propietarios.at(-1).id, estado.propietarioSeleccionadoId);
  assert.equal(estado.editor, null);
  assert.equal(antes.propietarios.length, 3);
  assert.equal(crearEstadoDemo().propietarios.length, 3);
});

test('el generador local evita colisiones con un estado inicial personalizado', () => {
  const existente = crearReferenciaLocal('demo-borrador-1', borrador('Existente ficticio'));
  const estado = guardarNuevo(crearEstadoDemo([existente]), 'Otra ficha ficticia');
  assert.equal(estado.propietarios[1].id, 'demo-borrador-2');
});

test('guardar una edición conserva el resto de fichas y todas las referencias', () => {
  let estado = reducirDemo(inicial(), { type: 'editarBorrador', propietarioId: 'demo-propietario-b' });
  estado = reducirDemo(estado, { type: 'cambiarBorrador', borrador: borrador('Bosque editado ficticio') });
  estado = reducirDemo(estado, { type: 'guardarBorrador' });
  assert.equal(estado.propietarios[1].nombre, 'Bosque editado ficticio');
  assert.equal(estado.propietarios[1].estadoAcceso, 'SIN_CUENTA');
  assert.equal(estado.propietarios[1].inmuebles, PROPIETARIOS_DEMO[1].inmuebles);
  assert.equal(estado.propietarios[0], PROPIETARIOS_DEMO[0]);
  assert.equal(estado.propietarios[2], PROPIETARIOS_DEMO[2]);
});

test('seleccionar o editar un ID desconocido no crea fichas ni acceso', () => {
  const estado = inicial();
  assert.equal(reducirDemo(estado, { type: 'seleccionarPropietario', propietarioId: 'ausente' }), estado);
  assert.equal(reducirDemo(estado, { type: 'editarBorrador', propietarioId: 'ausente' }), estado);
  assert.equal(reducirDemo(estado, { type: 'guardarBorrador' }), estado);
});

test('cambiar de modalidad con un borrador abierto no altera ficha, cuenta ni borrador', () => {
  const estado = reducirDemo(inicial(), { type: 'editarBorrador', propietarioId: 'demo-propietario-a' });
  for (const modalidad of MODALIDADES_USO) {
    assert.deepEqual(reducirDemo(estado, { type: 'seleccionarModalidad', modalidad }), { ...estado, modalidadSeleccionada: modalidad });
  }
});

test('todas las operaciones funcionan con APIs externas prohibidas y cero accesos a ellas', () => {
  const apis = ['localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest', 'WebSocket'];
  const originales = new Map(apis.map((nombre) => [nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)]));
  let accesosExternos = 0;
  try {
    for (const nombre of apis) Object.defineProperty(globalThis, nombre, {
      configurable: true,
      get() { accesosExternos++; throw new Error(`Acceso externo prohibido: ${nombre}`); },
    });
    let estado = inicial();
    for (const modalidad of MODALIDADES_USO) estado = reducirDemo(estado, { type: 'seleccionarModalidad', modalidad });
    estado = reducirDemo(estado, { type: 'continuar' });
    estado = reducirDemo(estado, { type: 'buscar', busqueda: 'Bosque' });
    filtrarPropietarios(estado.propietarios, estado.busqueda);
    estado = reducirDemo(estado, { type: 'seleccionarPropietario', propietarioId: 'demo-propietario-b' });
    estado = guardarNuevo(estado, 'Alta enteramente ficticia');
    estado = reducirDemo(estado, { type: 'editarBorrador', propietarioId: 'demo-propietario-a' });
    estado = reducirDemo(estado, { type: 'cambiarBorrador', borrador: borrador('Edición ficticia') });
    estado = reducirDemo(estado, { type: 'guardarBorrador' });
    estado = reducirDemo(estado, { type: 'crearBorrador' });
    estado = reducirDemo(estado, { type: 'cancelarBorrador' });
    reducirDemo(estado, { type: 'volverModalidad' });
    assert.equal(accesosExternos, 0);
  } finally {
    for (const [nombre, descriptor] of originales) {
      if (descriptor) Object.defineProperty(globalThis, nombre, descriptor);
      else delete globalThis[nombre];
    }
  }
});
