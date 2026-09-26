import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverDestinoImportacion, previsualizarImportacion } from '../importPreview.ts';
import { crearEstadoDemo, reducirDemo } from '../demo/state.ts';
import { ORIGEN_IMPORTACION_DEMO, CONTEXTO_IMPORTACION_DEMO } from '../demo/revisionFixtures.ts';
import { PROPIETARIOS_DEMO } from '../demo/fixtures.ts';
import { congelarProfundo, sinEfectosExternos } from './revision-support.mjs';

const contexto = () => structuredClone(CONTEXTO_IMPORTACION_DEMO);
const solicitud = (propietarioDestinoId = 'demo-propietario-b') => ({ propietarioDestinoId, datosOrigen: structuredClone(ORIGEN_IMPORTACION_DEMO) });

for (const id of [null, undefined, '', '   ']) {
  test(`destino ${JSON.stringify(id)} es AUSENTE y bloquea todas las propuestas`, () => {
    const entrada = solicitud();
    entrada.propietarioDestinoId = id;
    const preview = previsualizarImportacion(entrada, contexto());
    assert.equal(preview.destino.estado, 'AUSENTE');
    assert.equal(preview.destino.propietario, null);
    assert.equal(preview.registrosQueSeCrearian.length, 0);
    assert.equal(preview.registrosBloqueados.length, entrada.datosOrigen.length);
  });
}

test('propietarioDestinoId omitido en entrada JS no recibe un valor por defecto', () => {
  assert.equal(previsualizarImportacion({ datosOrigen: ORIGEN_IMPORTACION_DEMO }, contexto()).destino.estado, 'AUSENTE');
});

test('destino existente y permitido es válido aunque no tenga cuenta', () => {
  const resultado = resolverDestinoImportacion('demo-propietario-b', contexto());
  assert.equal(resultado.estado, 'VALIDO');
  assert.equal(resultado.propietario.id, 'demo-propietario-b');
  assert.equal(PROPIETARIOS_DEMO[1].cuentaId, null);
});

test('destino activo y permitido también es válido', () => {
  assert.equal(resolverDestinoImportacion('demo-propietario-a', contexto()).estado, 'VALIDO');
});

test('destino INVITADO puede ser válido si el contexto lo permite: acceso no decide permiso', () => {
  const ctx = contexto();
  ctx.propietariosPermitidosIds.push('demo-propietario-c');
  assert.equal(resolverDestinoImportacion('demo-propietario-c', ctx).estado, 'VALIDO');
});

test('destino no encontrado no se sustituye por otro', () => {
  const preview = previsualizarImportacion(solicitud('demo-no-existe'), contexto());
  assert.equal(preview.destino.estado, 'NO_ENCONTRADO');
  assert.equal(preview.destino.propietarioDestinoId, 'demo-no-existe');
  assert.equal(preview.destino.propietario, null);
  assert.equal(preview.registrosQueSeCrearian.length, 0);
});

test('destino fuera de la lista externa resulta NO_PERMITIDO, sin inferir cuentas ni roles', () => {
  const preview = previsualizarImportacion(solicitud('demo-propietario-c'), contexto());
  assert.equal(preview.destino.estado, 'NO_PERMITIDO');
  assert.equal(preview.registrosBloqueados.length, 4);
  const ctx = contexto();
  ctx.propietariosPermitidosIds = [];
  assert.equal(resolverDestinoImportacion('demo-propietario-a', ctx).estado, 'NO_PERMITIDO');
});

test('si falta la lista de permitidos en entrada JS no se concede permiso implícito', () => {
  const ctx = contexto();
  delete ctx.propietariosPermitidosIds;
  assert.equal(resolverDestinoImportacion('demo-propietario-a', ctx).estado, 'NO_PERMITIDO');
});

test('un ID permitido que no existe sigue siendo NO_ENCONTRADO', () => {
  const ctx = contexto();
  ctx.propietariosPermitidosIds.push('no-existe');
  assert.equal(resolverDestinoImportacion('no-existe', ctx).estado, 'NO_ENCONTRADO');
});

test('referencias duplicadas bloquean como AMBIGUO en vez de elegir la primera', () => {
  const ctx = contexto();
  ctx.propietarios.push({ id: 'demo-propietario-a', nombre: 'Duplicado ficticio' });
  assert.equal(resolverDestinoImportacion('demo-propietario-a', ctx).estado, 'AMBIGUO');
});

test('IDs no se corrigen o normalizan de forma implícita', () => {
  assert.equal(resolverDestinoImportacion(' demo-propietario-a ', contexto()).estado, 'NO_ENCONTRADO');
});

test('ni usuario autenticado ni propietario de la cuenta pueden suplir el destino', () => {
  const ctx = { ...contexto(), usuarioAutenticadoId: 'demo-usuario', propietarioCuentaId: 'demo-propietario-a', propietarioDestinoId: 'demo-propietario-a' };
  const resultado = previsualizarImportacion(solicitud(null), ctx);
  assert.equal(resultado.destino.estado, 'AUSENTE');
  assert.equal(resultado.registrosQueSeCrearian.length, 0);
});

test('no se elige automáticamente primer propietario ni único propietario', () => {
  for (const propietarios of [PROPIETARIOS_DEMO, [PROPIETARIOS_DEMO[0]], [...PROPIETARIOS_DEMO].reverse(), []]) {
    const ctx = { ...contexto(), propietarios };
    assert.equal(resolverDestinoImportacion(null, ctx).estado, 'AUSENTE');
  }
});

test('preview identifica propuestas, incompletos, bloqueados e incidencias de revisión', () => {
  const preview = previsualizarImportacion(solicitud(), contexto());
  assert.equal(preview.soloLectura, true);
  assert.deepEqual(preview.registros.map((r) => r.decision), ['CREARIA', 'REVISAR', 'BLOQUEADO', 'REVISAR']);
  assert.deepEqual(preview.registros.map((r) => r.evaluacionDatos.estadoDatos), ['COMPLETO', 'INCOMPLETO', 'BLOQUEADO', 'COMPLETO']);
  assert.deepEqual(preview.registrosQueSeCrearian.map((r) => r.indiceOrigen), [0]);
  assert.deepEqual(preview.registrosIncompletos.map((r) => r.indiceOrigen), [1]);
  assert.deepEqual(preview.registrosBloqueados.map((r) => r.indiceOrigen), [2]);
  assert.deepEqual(preview.datosQueRequierenRevision.map((r) => r.indiceOrigen), [1, 2, 3]);
  assert.deepEqual(preview.registros[1].evaluacionDatos.camposFaltantes, ['nombre']);
  assert.ok(preview.incidencias.some((i) => i.codigo === 'DEMO_REVISAR' && i.indiceOrigen === 3));
});

test('falta de destino bloquea propuesta sin cambiar estadoDatos de registros completos', () => {
  const a = previsualizarImportacion(solicitud(), contexto());
  const b = previsualizarImportacion(solicitud(null), contexto());
  assert.deepEqual(a.registros.map((r) => r.evaluacionDatos), b.registros.map((r) => r.evaluacionDatos));
  assert.equal(b.registros[0].evaluacionDatos.estadoDatos, 'COMPLETO');
  assert.equal(b.registros[0].decision, 'BLOQUEADO');
});

test('la política se selecciona por registro desde el contexto, sin asumir una universal', () => {
  const ctx = contexto();
  ctx.reglasPorRegistro = [{ politica: { id: 'sin-requisitos', camposRequeridos: [] } }, null];
  const preview = previsualizarImportacion(solicitud(), ctx);
  assert.equal(preview.registros[0].decision, 'CREARIA');
  assert.ok(preview.registros.slice(1).every((r) => r.decision === 'BLOQUEADO'));
  delete ctx.reglasPorRegistro;
  assert.ok(previsualizarImportacion(solicitud(), ctx).registros.every((r) => r.decision === 'BLOQUEADO'));
});

test('el origen no puede inyectar política, acceso, destino o decisión en el resultado', () => {
  const entrada = solicitud();
  entrada.datosOrigen[0] = {
    nombre: 'Fuente ficticia', propietarioDestinoId: 'demo-propietario-a', decision: 'CREARIA', estadoAcceso: 'ACTIVO',
    politica: { camposRequeridos: [] }, id: 'id-de-origen-no-definitivo',
  };
  const ctx = contexto();
  ctx.reglasPorRegistro[0] = null;
  const preview = previsualizarImportacion(entrada, ctx);
  assert.equal(preview.destino.propietarioDestinoId, 'demo-propietario-b');
  assert.equal(preview.registros[0].decision, 'BLOQUEADO');
  assert.deepEqual(preview.registros[0].datosOrigen, entrada.datosOrigen[0]);
});

test('no hay IDs definitivos, timestamps, sustitución de titularidad ni deduplicación implícita', () => {
  const entrada = solicitud();
  entrada.datosOrigen = [{ nombre: 'Repetido', id: 'origen-1' }, { nombre: 'Repetido', id: 'origen-1' }];
  const preview = previsualizarImportacion(entrada, contexto());
  assert.equal(preview.registros.length, 2);
  for (const r of preview.registros) {
    assert.deepEqual(Object.keys(r).sort(), ['datosOrigen', 'decision', 'evaluacionDatos', 'incidencias', 'indiceOrigen']);
    assert.equal(r.datosOrigen.id, 'origen-1');
  }
});

test('origen vacío tiene incidencia de revisión sin crear nada', () => {
  const resultado = previsualizarImportacion({ propietarioDestinoId: 'demo-propietario-a', datosOrigen: [] }, contexto());
  assert.deepEqual(resultado.registrosQueSeCrearian, []);
  assert.ok(resultado.incidencias.some((i) => i.codigo === 'ORIGEN_VACIO'));
});

test('fila null o array desde origen JS no se acepta como registro completo', () => {
  const entrada = solicitud();
  entrada.datosOrigen = [null, [], 'texto'];
  const resultado = previsualizarImportacion(entrada, contexto());
  assert.equal(resultado.registrosBloqueados.length, 3);
  assert.deepEqual(resultado.registros.map((r) => r.datosOrigen), entrada.datosOrigen);
});

test('determinismo, conservación profunda de origen/contexto y ausencia de escrituras/red', () => {
  const entrada = solicitud();
  entrada.datosOrigen[0].datosExtra = { lista: [1, false, null, { texto: 'Original' }] };
  const ctx = contexto();
  const copia = structuredClone({ entrada, ctx });
  congelarProfundo(entrada);
  congelarProfundo(ctx);
  sinEfectosExternos(() => {
    const a = previsualizarImportacion(entrada, ctx);
    const b = previsualizarImportacion(entrada, ctx);
    assert.deepEqual(a, b);
    assert.deepEqual(a.registros.map((r) => r.datosOrigen), entrada.datosOrigen);
    a.registros[0].datosOrigen.datosExtra.lista[3].texto = 'Solo preview';
    a.destino.propietario.nombre = 'Solo preview';
    a.registros[1].evaluacionDatos.camposFaltantes.push('Solo preview');
    assert.deepEqual({ entrada, ctx }, copia);
    assert.deepEqual(previsualizarImportacion(entrada, ctx), b);
  });
});

test('recalcular con permiso retirado o contexto cambiado bloquea la propuesta anterior', () => {
  const ctx = contexto();
  assert.equal(previsualizarImportacion(solicitud(), ctx).registrosQueSeCrearian.length, 1);
  ctx.propietariosPermitidosIds = [];
  assert.equal(previsualizarImportacion(solicitud(), ctx).registrosQueSeCrearian.length, 0);
  ctx.propietarios = [];
  assert.equal(previsualizarImportacion(solicitud(), ctx).destino.estado, 'NO_ENCONTRADO');
});

test('demo: abrir ficha, elegir modalidad o crear borrador no selecciona destino de importación', () => {
  let estado = crearEstadoDemo();
  for (const accion of [
    { type: 'seleccionarPropietario', propietarioId: 'demo-propietario-a' },
    { type: 'seleccionarModalidad', modalidad: 'PROPIETARIO' },
    { type: 'crearBorrador' },
  ]) {
    estado = reducirDemo(estado, accion);
    assert.equal(estado.propietarioDestinoId, null);
  }
});

test('demo: seleccionar destino solo es local; cambiarlo cierra la revisión anterior', () => {
  const antes = congelarProfundo(crearEstadoDemo());
  sinEfectosExternos(() => {
    let estado = reducirDemo(antes, { type: 'seleccionarDestinoImportacion', propietarioDestinoId: 'demo-propietario-b' });
    assert.deepEqual(estado, { ...antes, propietarioDestinoId: 'demo-propietario-b' });
    estado = reducirDemo(estado, { type: 'revisarRegistroImportacion', indiceOrigen: 2 });
    assert.equal(estado.indiceRevisionImportacion, 2);
    estado = reducirDemo(estado, { type: 'seleccionarDestinoImportacion', propietarioDestinoId: null });
    assert.deepEqual(estado, antes);
  });
});
