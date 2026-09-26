import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire, register } from 'node:module';

const require = createRequire(import.meta.url);
const faltan = ['typescript', 'react', 'react-dom/server'].filter((nombre) => {
  try { require.resolve(nombre); return false; } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    return true;
  }
});

if (faltan.length) {
  test('componentes React: renderizado y callbacks (bloqueado por herramientas ausentes)', {
    skip: `No instaladas: ${faltan.join(', ')}. No se instalan dependencias. Esta suite NO está validada.`,
  }, () => {});
} else {
  register('./tsx-loader.mjs', import.meta.url);
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { SelectorModalidadUso } = await import('../components/SelectorModalidadUso.tsx');
  const { OnboardingPatrimonial } = await import('../components/OnboardingPatrimonial.tsx');
  const { ListaPropietarios } = await import('../components/ListaPropietarios.tsx');
  const { FormularioPropietario } = await import('../components/FormularioPropietario.tsx');
  const { SelectorPropietarioDestino } = await import('../components/SelectorPropietarioDestino.tsx');
  const { RevisionDatosPropietario } = await import('../components/RevisionDatosPropietario.tsx');
  const { RevisionImportacion } = await import('../components/RevisionImportacion.tsx');
  const { evaluarCompletitud } = await import('../completeness.ts');
  const { previsualizarImportacion } = await import('../importPreview.ts');
  const { ORIGEN_IMPORTACION_DEMO, CONTEXTO_IMPORTACION_DEMO } = await import('../demo/revisionFixtures.ts');
  const { PatrimonialDemo } = await import('../demo/PatrimonialDemo.tsx');
  const { PROPIETARIOS_DEMO } = await import('../demo/fixtures.ts');
  const { crearBorrador } = await import('../domain.ts');
  const { crearEstadoDemo, reducirDemo } = await import('../demo/state.ts');

  function nodos(elemento) {
    if (Array.isArray(elemento)) return elemento.flatMap(nodos);
    if (!elemento || typeof elemento !== 'object' || !elemento.props) return [];
    return [elemento, ...nodos(elemento.props.children)];
  }
  const render = (componente, props) => renderToStaticMarkup(createElement(componente, props));
  const noop = () => {};

  test('selector renderiza las tres modalidades; cada radio emite solo su valor y volver emite callback', () => {
    const cambios = [];
    let vueltas = 0;
    const props = { modalidadActual: null, onChange: (valor) => cambios.push(valor), onVolver: () => vueltas++ };
    const elementos = nodos(SelectorModalidadUso(props));
    const radios = elementos.filter((n) => n.type === 'input' && n.props.type === 'radio');
    assert.equal(radios.length, 3);
    radios.forEach((radio) => radio.props.onChange());
    assert.deepEqual(cambios, ['PROPIETARIO', 'GESTOR_PROPIETARIO', 'GESTOR_PROFESIONAL']);
    elementos.find((n) => n.type === 'button').props.onClick();
    assert.equal(vueltas, 1);
    assert.equal(props.modalidadActual, null);
    const html = render(SelectorModalidadUso, { ...props, modalidadActual: 'GESTOR_PROFESIONAL' });
    assert.match(html, /<fieldset>/);
    assert.match(html, /checked=""[^>]*value="GESTOR_PROFESIONAL"|value="GESTOR_PROFESIONAL"[^>]*checked=""/);
  });

  test('onboarding no permite continuar sin elección y avisa de que no concede permisos', () => {
    let continuaciones = 0;
    const props = { modalidadSeleccionada: null, onChange: noop, onVolver: noop, onContinuar: () => continuaciones++ };
    const boton = nodos(OnboardingPatrimonial(props)).find((n) => n.type === 'button');
    assert.equal(boton.props.disabled, true);
    boton.props.onClick();
    assert.equal(continuaciones, 0);
    const elegido = nodos(OnboardingPatrimonial({ ...props, modalidadSeleccionada: 'PROPIETARIO' })).find((n) => n.type === 'button');
    elegido.props.onClick();
    assert.equal(continuaciones, 1);
    assert.match(render(OnboardingPatrimonial, props), /no un permiso/);
  });

  test('listado renderiza tres accesos, varios inmuebles y cero inmuebles sin exigir cuentas', () => {
    let seleccionado;
    let busqueda;
    const props = {
      propietarios: PROPIETARIOS_DEMO,
      busqueda: '', propietarioSeleccionadoId: null,
      onSeleccionar: (id) => { seleccionado = id; },
      onBusquedaChange: (valor) => { busqueda = valor; },
    };
    const html = render(ListaPropietarios, props);
    for (const estado of ['SIN_CUENTA', 'INVITADO', 'ACTIVO']) assert.ok(html.includes(estado));
    assert.match(html, /0 inmuebles/);
    assert.match(html, /3 inmuebles/);
    assert.match(html, /2 inmuebles/);
    assert.match(html, /Sin cuenta vinculada/);
    const elementos = nodos(ListaPropietarios(props));
    const botones = elementos.filter((n) => n.type === 'button');
    botones[1].props.onClick();
    assert.equal(seleccionado, 'demo-propietario-b');
    elementos.find((n) => n.type === 'input').props.onChange({ target: { value: 'Bosque' } });
    assert.equal(busqueda, 'Bosque');
    assert.equal(nodos(ListaPropietarios({ ...props, busqueda })).filter((n) => n.type === 'button').length, 1);
    assert.match(render(ListaPropietarios, { ...props, propietarios: [] }), /Todavía no hay fichas/);
    assert.match(render(ListaPropietarios, { ...props, busqueda: 'sin-coincidencias' }), /No encontramos coincidencias/);
  });

  test('formulario emite cambios, guarda el borrador y permite cancelar sin persistencia propia', () => {
    let cambiado;
    let guardado;
    let cancelaciones = 0;
    let prevenido = false;
    const props = {
      modo: 'crear', borrador: crearBorrador(),
      onChange: (value) => { cambiado = value; },
      onGuardar: (value) => { guardado = value; },
      onCancelar: () => cancelaciones++,
    };
    nodos(FormularioPropietario(props)).find((n) => n.type === 'input' && n.props.name === 'nombre')
      .props.onChange({ target: { value: 'Borrador de Componente Ficticio' } });
    assert.equal(cambiado.nombre, 'Borrador de Componente Ficticio');
    assert.equal(props.borrador.nombre, '');
    const elementos = nodos(FormularioPropietario({ ...props, borrador: cambiado }));
    elementos.find((n) => n.type === 'form').props.onSubmit({ preventDefault() { prevenido = true; } });
    assert.equal(prevenido, true);
    assert.deepEqual(guardado, cambiado);
    elementos.find((n) => n.type === 'button' && n.props.type === 'button').props.onClick();
    assert.equal(cancelaciones, 1);
    assert.match(render(FormularioPropietario, { ...props, error: 'Error local' }), /role="alert"/);
    assert.match(render(FormularioPropietario, { ...props, modo: 'editar' }), /Editar ficha de ejemplo/);
  });

  test('selector de destino no autoselecciona ni emite callbacks durante el renderizado', () => {
    const cambios = [];
    const props = { propietarios: [PROPIETARIOS_DEMO[0]], propietarioDestinoId: null, onChange: (id) => cambios.push(id) };
    const html = render(SelectorPropietarioDestino, props);
    assert.match(html, /<option value="" selected="">/);
    assert.deepEqual(cambios, []);
    const select = nodos(SelectorPropietarioDestino(props)).find((n) => n.type === 'select');
    assert.equal(select.props.value, '');
    select.props.onChange({ target: { value: 'demo-propietario-a' } });
    select.props.onChange({ target: { value: '' } });
    assert.deepEqual(cambios, ['demo-propietario-a', null]);
    const desconocido = render(SelectorPropietarioDestino, { ...props, propietarioDestinoId: 'id-ausente' });
    assert.match(desconocido, /Destino no encontrado: id-ausente/);
    assert.match(desconocido, /<option value="id-ausente" selected="">/);
  });

  test('revisión de datos muestra campos faltantes y emite revisión sin cambiar acceso', () => {
    let revisiones = 0;
    const evaluacion = evaluarCompletitud({}, { politica: { id: 'ejemplo', camposRequeridos: ['etiqueta'] } });
    const props = { evaluacion, onRevisar: () => revisiones++ };
    const html = render(RevisionDatosPropietario, props);
    assert.match(html, /INCOMPLETO/);
    assert.match(html, /Campos pendientes: etiqueta/);
    nodos(RevisionDatosPropietario(props)).find((n) => n.type === 'button').props.onClick();
    assert.equal(revisiones, 1);
    const formulario = render(FormularioPropietario, {
      borrador: crearBorrador(), modo: 'crear', onChange: noop, onGuardar: noop, onCancelar: noop,
      evaluacionDatos: evaluarCompletitud({}, null),
    });
    assert.match(formulario, /No disponible/);
    assert.match(formulario, /BLOQUEADO/);
  });

  test('preview renderiza decisiones y permite inspeccionar el origen, nunca ejecutar la importación', () => {
    let indice;
    const props = {
      propietarios: PROPIETARIOS_DEMO,
      preview: previsualizarImportacion({ datosOrigen: ORIGEN_IMPORTACION_DEMO, propietarioDestinoId: 'demo-propietario-b' }, CONTEXTO_IMPORTACION_DEMO),
      onDestinoChange: noop, indiceRevision: null, onRevisarRegistro: (i) => { indice = i; },
    };
    const html = render(RevisionImportacion, props);
    assert.match(html, /CREARIA/);
    assert.match(html, /REVISAR/);
    assert.match(html, /BLOQUEADO/);
    const botones = nodos(RevisionImportacion(props)).filter((n) => n.type === 'button');
    assert.equal(botones.length, 4);
    botones[1].props.onClick();
    assert.equal(indice, 1);
    assert.match(render(RevisionImportacion, { ...props, indiceRevision: indice }), /Origen en revisión/);
    const sinDestino = render(RevisionImportacion, { ...props, preview: previsualizarImportacion({ datosOrigen: ORIGEN_IMPORTACION_DEMO, propietarioDestinoId: null }, CONTEXTO_IMPORTACION_DEMO) });
    assert.match(sinDestino, /AUSENTE/);
    assert.match(sinDestino, /Selecciona explícitamente/);
  });

  test('demo independiente renderiza inicio y contexto profesional sin invocar APIs externas', () => {
    const apis = ['localStorage', 'sessionStorage', 'indexedDB', 'fetch'];
    const originales = new Map(apis.map((nombre) => [nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)]));
    let accesos = 0;
    try {
      for (const nombre of apis) Object.defineProperty(globalThis, nombre, {
        configurable: true,
        get() { accesos++; throw new Error(`API externa prohibida: ${nombre}`); },
      });
      assert.match(render(PatrimonialDemo, {}), /Tu patrimonio/);
      let estado = reducirDemo(crearEstadoDemo(), { type: 'seleccionarModalidad', modalidad: 'GESTOR_PROFESIONAL' });
      estado = reducirDemo(estado, { type: 'continuar' });
      const html = render(PatrimonialDemo, { estadoInicial: estado });
      assert.match(html, /inmuebles propios/);
      assert.match(html, /Estudio Órbita de Papel/);
      assert.equal(accesos, 0);
    } finally {
      for (const [nombre, descriptor] of originales) {
        if (descriptor) Object.defineProperty(globalThis, nombre, descriptor);
        else delete globalThis[nombre];
      }
    }
  });
}
