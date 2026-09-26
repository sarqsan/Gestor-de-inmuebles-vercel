import test from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS_DATOS, ESTADOS_ACCESO } from '../contracts.ts';
import { evaluarCompletitud } from '../completeness.ts';
import { PROPIETARIOS_DEMO } from '../demo/fixtures.ts';
import { congelarProfundo, sinEfectosExternos } from './revision-support.mjs';

const regla = (camposRequeridos) => ({ politica: { id: 'politica-tecnica-de-prueba', camposRequeridos } });

test('contrato exacto de los tres estados de datos', () => {
  assert.deepEqual(ESTADOS_DATOS, ['COMPLETO', 'INCOMPLETO', 'BLOQUEADO']);
});

test('COMPLETO solo según la política explícita, con camposFaltantes vacío', () => {
  const resultado = evaluarCompletitud({ etiqueta: 'Ejemplo' }, regla(['etiqueta']));
  assert.equal(resultado.estadoDatos, 'COMPLETO');
  assert.deepEqual(resultado.camposFaltantes, []);
  assert.equal(resultado.politicaId, 'politica-tecnica-de-prueba');
});

test('INCOMPLETO conserva el orden de campos faltantes y elimina duplicados', () => {
  const resultado = evaluarCompletitud({ etiqueta: '', datoA: null, datoB: undefined }, regla(['etiqueta', 'datoA', 'datoB', 'datoC', 'etiqueta']));
  assert.equal(resultado.estadoDatos, 'INCOMPLETO');
  assert.deepEqual(resultado.camposFaltantes, ['etiqueta', 'datoA', 'datoB', 'datoC']);
  assert.equal(resultado.incidencias.length, 4);
  assert.ok(resultado.incidencias.every((i) => i.codigo === 'CAMPO_FALTANTE' && i.nivel === 'REVISION'));
});

test('BLOQUEADO por motivo explícito conserva los campos faltantes', () => {
  const resultado = evaluarCompletitud({}, {
    ...regla(['etiqueta']), bloqueos: [{ codigo: 'EXTERNO', mensaje: 'Motivo suministrado', nivel: 'REVISION' }],
  });
  assert.equal(resultado.estadoDatos, 'BLOQUEADO');
  assert.deepEqual(resultado.camposFaltantes, ['etiqueta']);
  assert.equal(resultado.incidencias.at(-1).nivel, 'BLOQUEO');
});

test('una revisión manual no convierte datos presentes en incompletos', () => {
  const resultado = evaluarCompletitud({ etiqueta: 'Presente' }, {
    ...regla(['etiqueta']), revisiones: [{ codigo: 'VERIFICAR', mensaje: 'Revisión externa' }],
  });
  assert.equal(resultado.estadoDatos, 'COMPLETO');
  assert.equal(resultado.incidencias[0].nivel, 'REVISION');
});

test('ausencia de política bloquea la evaluación sin inventar campos fiscales', () => {
  for (const reglas of [null, undefined, { politica: null }]) {
    const resultado = evaluarCompletitud({ nombre: 'Ficticio', nifCif: '', email: '' }, reglas);
    assert.equal(resultado.estadoDatos, 'BLOQUEADO');
    assert.deepEqual(resultado.camposFaltantes, []);
    assert.equal(resultado.politicaId, null);
    assert.equal(resultado.incidencias[0].codigo, 'POLITICA_NO_DISPONIBLE');
  }
});

test('política explícita sin requisitos no exige datos fiscales ni una cuenta', () => {
  const resultado = evaluarCompletitud({}, regla([]));
  assert.equal(resultado.estadoDatos, 'COMPLETO');
  assert.deepEqual(resultado.camposFaltantes, []);
});

test('diferentes políticas para los mismos datos producen evaluaciones independientes', () => {
  const datos = { etiqueta: 'Muestra', referencia: '' };
  assert.equal(evaluarCompletitud(datos, regla(['etiqueta'])).estadoDatos, 'COMPLETO');
  assert.equal(evaluarCompletitud(datos, regla(['referencia'])).estadoDatos, 'INCOMPLETO');
  assert.equal(evaluarCompletitud(datos, null).estadoDatos, 'BLOQUEADO');
});

test('presencia técnica: cero y false son presentes; no se valida un documento o colección vacía', () => {
  const datos = { cero: 0, no: false, texto: ' \n ', lista: [], objeto: {} };
  const resultado = evaluarCompletitud(datos, regla(Object.keys(datos)));
  assert.deepEqual(resultado.camposFaltantes, ['texto']);
});

test('solo cuenta la propiedad propia y la clave literal; no se recorre una ruta implícita', () => {
  const datos = { domicilio: { ciudad: 'Ejemplo' } };
  const resultado = evaluarCompletitud(datos, regla(['domicilio.ciudad', 'constructor', 'toString']));
  assert.deepEqual(resultado.camposFaltantes, ['domicilio.ciudad', 'constructor', 'toString']);
  assert.equal(evaluarCompletitud({ 'domicilio.ciudad': 'Ejemplo' }, regla(['domicilio.ciudad'])).estadoDatos, 'COMPLETO');
});

test('políticas malformadas no convierten el registro en completo', () => {
  for (const politica of [{}, { id: '', camposRequeridos: [] }, { id: 'p', camposRequeridos: 'nombre' },
    { id: 'p', camposRequeridos: [null] }, { id: 'p', camposRequeridos: ['  '] }, { id: 'p', camposRequeridos: Array(1) }]) {
    const resultado = evaluarCompletitud({}, { politica });
    assert.equal(resultado.estadoDatos, 'BLOQUEADO');
    assert.equal(resultado.incidencias[0].codigo, 'POLITICA_INVALIDA');
  }
});

test('forma inválida de datos no se evalúa como completa', () => {
  for (const datos of [null, undefined, [], 'texto', 3, new Date('2020-01-01')]) {
    const resultado = evaluarCompletitud(datos, regla([]));
    assert.equal(resultado.estadoDatos, 'BLOQUEADO');
    assert.ok(resultado.incidencias.some((i) => i.codigo === 'FORMATO_DATOS_INVALIDO'));
  }
});

for (const estadoAcceso of ESTADOS_ACCESO) {
  for (const [reglas, esperado] of [[regla([]), 'COMPLETO'], [regla(['datoDePrueba']), 'INCOMPLETO'], [null, 'BLOQUEADO']]) {
    test(`${estadoAcceso} es independiente de estadoDatos ${esperado}`, () => {
      const datos = congelarProfundo({ nombre: 'Ficticio', estadoAcceso, cuentaId: estadoAcceso === 'ACTIVO' ? 'demo-cuenta' : null });
      const resultado = evaluarCompletitud(datos, reglas);
      assert.equal(resultado.estadoDatos, esperado);
      assert.equal(datos.estadoAcceso, estadoAcceso);
      assert.equal('estadoAcceso' in resultado, false);
      assert.equal('cuentaId' in resultado, false);
    });
  }
}

test('fichas con cuenta y sin cuenta reciben el mismo resultado ante la misma política', () => {
  assert.deepEqual(evaluarCompletitud(PROPIETARIOS_DEMO[0], regla(['nombre'])), evaluarCompletitud(PROPIETARIOS_DEMO[1], regla(['nombre'])));
});

test('evaluación determinista sin mutaciones, escritura ni acceso a red', () => {
  const datos = congelarProfundo({ etiqueta: 'Ficticia', desconocido: { anidado: [1, false] } });
  const reglas = congelarProfundo({ ...regla(['etiqueta', 'pendiente']), bloqueos: [{ codigo: 'EXTERNO', mensaje: 'Motivo' }] });
  const antes = structuredClone({ datos, reglas });
  sinEfectosExternos(() => {
    const a = evaluarCompletitud(datos, reglas);
    const b = evaluarCompletitud(datos, reglas);
    assert.deepEqual(a, b);
    a.camposFaltantes.push('solo-en-resultado');
    a.incidencias[0].mensaje = 'solo-en-resultado';
    assert.deepEqual({ datos, reglas }, antes);
    assert.deepEqual(evaluarCompletitud(datos, reglas), b);
  });
});
