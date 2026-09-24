/**
 * BLOQUE E — Batería automatizada (ORDEN 8) · CAPA DE PORTAL (UI)
 *
 * Renderiza los componentes REALES del Portal del Inquilino (jsdom) sobre el
 * Firestore en memoria. Comprueba comportamiento observable:
 *   entrada → carga por contexto → pantallas → estados vacíos/error →
 *   operaciones del inquilino → aislamiento A/B en lo que se muestra →
 *   registro por invitación (válida / inexistente / usada).
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { authSintetico, resetEntornoE } from './setupE';
import { memoria } from './firestoreMemoria';
import {
  IDS,
  contratoTest,
  enlaceTest,
  incidenciaTest,
  secretosDe,
  sembrarUniverso,
  usuarioInquilinoTest,
} from './fixturesE';

import { InquilinoPortalShell } from '../../components/portal-inquilino/InquilinoPortalShell';
import { RegistroInquilinoView } from '../../components/portal-inquilino/RegistroInquilinoView';

beforeEach(() => {
  resetEntornoE();
  sembrarUniverso();
  window.scrollTo = () => undefined;
  // jsdom no implementa scrollIntoView (usado por el hilo de mensajes)
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => undefined;
});
afterEach(() => cleanup());

const noop = () => undefined;

async function abrirPortal(l: 'A' | 'B', extra: Parameters<typeof usuarioInquilinoTest>[1] = {}) {
  const usuario = usuarioInquilinoTest(l, extra);
  const ui = render(<InquilinoPortalShell usuario={usuario} onLogout={noop} />);
  return { usuario, ui };
}

async function esperarCargado() {
  await waitFor(() => expect(screen.queryByText('Cargando tu portal…')).toBeNull());
}

function tab(nombre: 'Inicio' | 'Recibos' | 'Averías' | 'Luz/Agua' | 'Más') {
  const nav = document.querySelector('nav.fixed') as HTMLElement;
  return within(nav).getByText(nombre).closest('button') as HTMLButtonElement;
}

function titulo() {
  return document.querySelector('header h1')?.textContent;
}

// ===========================================================================
// 1. ENTRADA AL PORTAL Y NAVEGACIÓN
// ===========================================================================
describe('E · Portal · entrada, contexto y navegación', () => {
  it('muestra estado de carga y después el inicio con el contexto del inquilino A', async () => {
    await abrirPortal('A');
    expect(screen.getByText('Cargando tu portal…')).toBeTruthy();
    await esperarCargado();
    expect(titulo()).toBe('Mi hogar');
    expect(document.body.textContent).toContain('Calle Test A, 1');
    expect(document.body.textContent).not.toContain('Calle Test B, 1');
  });

  it('navega por las 5 pestañas y las 5 subvistas de «Más»; «Volver» regresa a «Más»', async () => {
    await abrirPortal('A');
    await esperarCargado();

    fireEvent.click(tab('Recibos'));
    expect(titulo()).toBe('Recibos y pagos');
    fireEvent.click(tab('Averías'));
    expect(titulo()).toBe('Incidencias');
    fireEvent.click(tab('Luz/Agua'));
    expect(titulo()).toBe('Suministros');
    fireEvent.click(tab('Más'));
    expect(titulo()).toBe('Más opciones');

    for (const [op, tit] of [
      ['Mi contrato', 'Mi contrato'],
      ['Mensajes', 'Mensajes'],
      ['Documentos', 'Documentos'],
      ['Historial', 'Historial'],
      ['Mi cuenta', 'Mi cuenta'],
    ] as const) {
      fireEvent.click(tab('Más'));
      const main = document.querySelector('main') as HTMLElement;
      fireEvent.click(within(main).getByText(op).closest('button')!);
      expect(titulo()).toBe(tit);
      fireEvent.click(screen.getByLabelText('Volver'));
      expect(titulo()).toBe('Más opciones');
    }
    fireEvent.click(tab('Inicio'));
    expect(titulo()).toBe('Mi hogar');
  });

  it('el estado inicial tras carga NO deja el portal en error ni vacío para un contexto válido', async () => {
    await abrirPortal('A');
    await esperarCargado();
    expect(screen.queryByText(/No se han podido cargar/)).toBeNull();
    expect(screen.queryByText(/no tiene contratos vinculados/)).toBeNull();
  });

  it('«Actualizar» recarga los datos y refleja cambios hechos por gestión', async () => {
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Más'));
    const main = document.querySelector('main') as HTMLElement;
    fireEvent.click(within(main).getByText('Mensajes').closest('button')!);
    expect(document.body.textContent).toContain('MENSAJE_PRIVADO_TENANT_A');

    // Gestión escribe un mensaje nuevo y lo enlaza en el contrato (simulación del ERP)
    memoria.sembrar('mensajes_portal', 'msg_TEST_A_2', {
      id: 'msg_TEST_A_2', contratoId: IDS.A.contrato, inmuebleId: IDS.A.inmueble,
      remitenteUid: 'uid_TEST_GESTION', remitenteNombre: 'Gestión Test', remitenteRol: 'GESTION',
      texto: 'MENSAJE_NUEVO_DE_GESTION', leidoPorGestion: true, leidoPorInquilino: false, createdAt: '2026-02-02T10:00:00.000Z',
    });
    memoria.update(`contratos_formalizacion/${IDS.A.contrato}`, { mensajeIds: [IDS.A.mensaje, 'msg_TEST_A_2'] });
    fireEvent.click(screen.getByLabelText('Actualizar'));
    await waitFor(() => expect(document.body.textContent).toContain('MENSAJE_NUEVO_DE_GESTION'));
  });
});

// ===========================================================================
// 2. ESTADOS VACÍOS, INVÁLIDOS Y DE ERROR
// ===========================================================================
describe('E · Portal · estados vacíos, inválidos y de error', () => {
  it('inquilino sin contratos vinculados → mensaje controlado, sin datos', async () => {
    await abrirPortal('A', { contratoIds: [] });
    await esperarCargado();
    expect(screen.getByText(/no tiene contratos vinculados/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('Calle Test');
  });

  it('contrato vinculado inexistente → error controlado con botón de reintento', async () => {
    await abrirPortal('A', { contratoIds: ['ct_TEST_INEXISTENTE'] });
    await esperarCargado();
    expect(screen.getByText(/No se han podido cargar tus contratos/)).toBeTruthy();
    expect(screen.getByText('Reintentar')).toBeTruthy();
  });

  it('error de lectura de Firestore (permiso denegado) → estado de error, no pantalla rota ni datos parciales', async () => {
    memoria.fallar('get', `contratos_formalizacion/${IDS.A.contrato}`);
    await abrirPortal('A');
    await esperarCargado();
    expect(screen.getByText(/No se han podido cargar tus contratos/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('Calle Test A');
    // Al restablecerse el acceso, reintentar recupera el portal
    memoria.reset();
    sembrarUniverso();
    fireEvent.click(screen.getByText('Reintentar'));
    await waitFor(() => expect(document.body.textContent).toContain('Calle Test A, 1'));
  });

  it('colecciones vacías → cada pantalla muestra su estado vacío previsto', async () => {
    memoria.sembrar('contratos_formalizacion', IDS.A.contrato, contratoTest('A', { incidenciaIds: [], mensajeIds: [], registroCobros: [] }) as never);
    memoria.sembrar('inmuebles', IDS.A.inmueble, { ...memoria.leer('inmuebles', IDS.A.inmueble)!, suministroIds: [] });
    memoria.delete(`actas/${IDS.A.acta}`);
    await abrirPortal('A');
    await esperarCargado();

    fireEvent.click(tab('Recibos'));
    expect(screen.getByText(/Aún no hay recibos generados/)).toBeTruthy();
    fireEvent.click(tab('Averías'));
    expect(screen.getByText(/No tienes averías registradas/)).toBeTruthy();
    fireEvent.click(tab('Luz/Agua'));
    expect(screen.getByText(/No hay suministros registrados/)).toBeTruthy();
    fireEvent.click(tab('Más'));
    let main = document.querySelector('main') as HTMLElement;
    fireEvent.click(within(main).getByText('Mensajes').closest('button')!);
    expect(screen.getByText(/Aún no hay mensajes/)).toBeTruthy();
    fireEvent.click(tab('Más'));
    main = document.querySelector('main') as HTMLElement;
    fireEvent.click(within(main).getByText('Historial').closest('button')!);
    // Con colecciones vacías el historial conserva únicamente el hito del contrato (inicio/firma)
    expect(document.body.textContent).not.toContain('INCIDENCIA_TENANT');
    expect(document.body.textContent).not.toContain('MENSAJE_PRIVADO');
    fireEvent.click(tab('Más'));
    main = document.querySelector('main') as HTMLElement;
    fireEvent.click(within(main).getByText('Documentos').closest('button')!);
    expect(document.body.textContent).toContain('Actas de entrada/salida (0)');
    expect(screen.getByText('No hay justificantes publicados.')).toBeTruthy();
  });

  it('documentos hijos referenciados pero inexistentes (índice huérfano) → se omiten sin romper', async () => {
    memoria.update(`contratos_formalizacion/${IDS.A.contrato}`, { incidenciaIds: [IDS.A.incidencia, 'inc_TEST_HUERFANA'] });
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Averías'));
    expect(document.body.textContent).toContain('INCIDENCIA_TENANT_A');
    expect(screen.queryByText(/No tienes averías/)).toBeNull();
  });
});

// ===========================================================================
// 3. PANTALLAS: contenido permitido y contenido que NUNCA debe verse
// ===========================================================================
describe('E · Portal · pantallas y saneado de información', () => {
  it('Contrato: muestra renta, IBAN de pago y firmas; oculta DNI/notas privadas del arrendador', async () => {
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Más'));
    const main = document.querySelector('main') as HTMLElement;
    fireEvent.click(within(main).getByText('Mi contrato').closest('button')!);
    const t = document.body.textContent || '';
    expect(t).toContain('700.00');
    expect(t).toContain('ES00TESTA000000000000000');
    expect(t).toContain('Firmado');
    expect(t).not.toContain(secretosDe('A').dniPropietario);
    expect(t).not.toContain(secretosDe('A').notasPrivadas);
    expect(t).not.toContain('Dirección privada propietario');
  });

  it('Incidencias: muestra la avería y el profesional asignado; oculta teléfono, coste y factura', async () => {
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Averías'));
    fireEvent.click(screen.getByText('INCIDENCIA_TENANT_A').closest('button')!);
    const t = document.body.textContent || '';
    expect(t).toContain('Profesional Test A');
    expect(t).not.toContain(secretosDe('A').telefonoProfesional);
    expect(t).not.toContain('123.45');
    expect(t).not.toContain('FACTURA_PRIVADA_A');
  });

  it('Suministros: lista el suministro del inmueble con su última lectura', async () => {
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Luz/Agua'));
    const t = document.body.textContent || '';
    expect(t).toContain('Comercializadora Test A');
    expect(t).toContain('1000 kWh');
    expect(t).not.toContain('Comercializadora Test B');
  });

  it('Documentos: actas D en solo lectura (sin DNI ni notas internas) y sin actas de otros contratos', async () => {
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Más'));
    const main = document.querySelector('main') as HTMLElement;
    fireEvent.click(within(main).getByText('Documentos').closest('button')!);
    const t = document.body.textContent || '';
    expect(t).toContain('Actas de entrada/salida (1)');
    expect(t).toContain('Acta de entrada · v1');
    expect(t).not.toContain(secretosDe('A').dniPropietario);
    expect(t).not.toContain('NOTA_INTERNA_ACTA');
    // Ningún control de edición/firma/versionado del motor D
    expect(screen.queryByText(/Firmar/)).toBeNull();
    expect(screen.queryByText(/Nueva versión/)).toBeNull();
    // Cero escrituras en `actas`
    expect(memoria.rutasEscritas().filter((r) => r.startsWith('actas/'))).toEqual([]);
  });

  it('Recibos: muestra los cobros del contrato (pagado/pendiente) sin datos de terceros', async () => {
    memoria.update(`contratos_formalizacion/${IDS.A.contrato}`, {
      registroCobros: [
        { id: 'cobro_TEST_A_2026_1', contratoId: IDS.A.contrato, inmuebleId: IDS.A.inmueble, inquilinoId: 'x', propietarioId: 'prop_TEST_A', mes: 1, anio: 2026, periodoMesAnio: '2026-01', nombreMes: 'Enero 2026', importePrevisto: 700, importeRecibido: 700, estado: 'PAGADO', fechaVencimiento: '2026-01-05', fechaPago: '2026-01-03', inquilinoDni: 'DNI_INQ_TEST_A' },
        { id: 'cobro_TEST_A_2026_2', contratoId: IDS.A.contrato, inmuebleId: IDS.A.inmueble, inquilinoId: 'x', propietarioId: 'prop_TEST_A', mes: 2, anio: 2026, periodoMesAnio: '2026-02', nombreMes: 'Febrero 2026', importePrevisto: 700, importeRecibido: 0, estado: 'PENDIENTE', fechaVencimiento: '2026-02-05' },
      ],
    });
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Recibos'));
    const t = document.body.textContent || '';
    expect(t).toContain('Enero 2026');
    expect(t).toContain('Febrero 2026');
    expect(screen.queryByText(/Aún no hay recibos/)).toBeNull();
  });

  it('Historial: agrega actividad de incidencias, mensajes y lecturas del contrato', async () => {
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Más'));
    const main = document.querySelector('main') as HTMLElement;
    fireEvent.click(within(main).getByText('Historial').closest('button')!);
    expect(screen.queryByText(/Aún no hay actividad/)).toBeNull();
    const t = document.body.textContent || '';
    expect(t).toContain('INCIDENCIA_TENANT_A');
    expect(t).not.toContain('INCIDENCIA_TENANT_B');
  });

  it('Cuenta: identidad del inquilino y cierre de sesión', async () => {
    let salidas = 0;
    const usuario = usuarioInquilinoTest('A');
    render(<InquilinoPortalShell usuario={usuario} onLogout={() => { salidas++; }} />);
    await esperarCargado();
    fireEvent.click(tab('Más'));
    const main = document.querySelector('main') as HTMLElement;
    fireEvent.click(within(main).getByText('Mi cuenta').closest('button')!);
    expect(document.body.textContent).toContain('inq.test.a@test.invalid');
    const botones = screen.getAllByText('Cerrar sesión');
    fireEvent.click(botones[botones.length - 1].closest('button')!);
    expect(salidas).toBe(1);
  });
});

// ===========================================================================
// 4. AISLAMIENTO A/B EN LO QUE SE MUESTRA
// ===========================================================================
describe('E · Portal · aislamiento TENANT_TEST_A / TENANT_TEST_B (UI + consulta)', () => {
  async function recorrerTodo() {
    const textos: string[] = [];
    const leer = () => textos.push(document.body.textContent || '');
    leer();
    for (const t of ['Recibos', 'Averías', 'Luz/Agua'] as const) { fireEvent.click(tab(t)); leer(); }
    for (const op of ['Mi contrato', 'Mensajes', 'Documentos', 'Historial', 'Mi cuenta']) {
      fireEvent.click(tab('Más'));
      const main = document.querySelector('main') as HTMLElement;
      fireEvent.click(within(main).getByText(op).closest('button')!);
      leer();
    }
    return textos.join('\n');
  }

  it('A recorre todo su portal sin ver ni un identificador, texto o secreto de B', async () => {
    await abrirPortal('A');
    await esperarCargado();
    const todo = await recorrerTodo();
    expect(todo).toContain('Calle Test A, 1');
    for (const id of Object.values(IDS.B)) expect(todo).not.toContain(id);
    expect(todo).not.toContain('MENSAJE_PRIVADO_TENANT_B');
    expect(todo).not.toContain('INCIDENCIA_TENANT_B');
    expect(todo).not.toContain('Comercializadora Test B');
    for (const s of Object.values(secretosDe('B'))) expect(todo).not.toContain(s);
    // Y en la capa de consulta: cero lecturas de rutas de B
    const rutasB = memoria.rutasLeidas().filter((r) => Object.values(IDS.B).some((id) => r.endsWith(`/${id}`)));
    expect(rutasB).toEqual([]);
  });

  it('B recorre todo su portal sin ver nada de A', async () => {
    await abrirPortal('B');
    await esperarCargado();
    const todo = await recorrerTodo();
    expect(todo).toContain('Calle Test B, 1');
    expect(todo).toContain('MENSAJE_PRIVADO_TENANT_B');
    for (const id of Object.values(IDS.A)) expect(todo).not.toContain(id);
    expect(todo).not.toContain('MENSAJE_PRIVADO_TENANT_A');
    const rutasA = memoria.rutasLeidas().filter((r) => Object.values(IDS.A).some((id) => r.endsWith(`/${id}`)));
    expect(rutasA).toEqual([]);
  });

  it('si el índice de A apunta a un documento de B, el shell lo filtra por contratoId (defensa en profundidad de UI)', async () => {
    // Las reglas denegarían el get; aquí probamos la segunda barrera: el filtrado por contrato en el shell.
    memoria.update(`contratos_formalizacion/${IDS.A.contrato}`, { mensajeIds: [IDS.A.mensaje, IDS.B.mensaje] });
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Más'));
    const main = document.querySelector('main') as HTMLElement;
    fireEvent.click(within(main).getByText('Mensajes').closest('button')!);
    expect(document.body.textContent).toContain('MENSAJE_PRIVADO_TENANT_A');
    expect(document.body.textContent).not.toContain('MENSAJE_PRIVADO_TENANT_B');
  });
});

// ===========================================================================
// 5. OPERACIONES DEL INQUILINO DESDE LA UI
// ===========================================================================
describe('E · Portal · operaciones del inquilino desde la interfaz', () => {
  it('enviar un mensaje: se persiste, se enlaza al contrato, se audita y aparece en el hilo', async () => {
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Más'));
    const main = document.querySelector('main') as HTMLElement;
    fireEvent.click(within(main).getByText('Mensajes').closest('button')!);

    // El mensaje de gestión pendiente queda marcado como leído al abrir el hilo
    await waitFor(() => expect(memoria.leer<{ leidoPorInquilino: boolean }>('mensajes_portal', IDS.A.mensaje)!.leidoPorInquilino).toBe(true));

    fireEvent.change(screen.getByPlaceholderText('Escribe tu mensaje…'), { target: { value: 'Mensaje de prueba TEST desde el portal' } });
    fireEvent.click(screen.getByLabelText('Enviar mensaje'));
    await waitFor(() => expect(document.body.textContent).toContain('Mensaje de prueba TEST desde el portal'));

    const nuevos = memoria.idsDe('mensajes_portal').filter((id) => id !== IDS.A.mensaje && id !== IDS.B.mensaje);
    expect(nuevos.length).toBe(1);
    const m = memoria.leer<Record<string, unknown>>('mensajes_portal', nuevos[0])!;
    expect(m.contratoId).toBe(IDS.A.contrato);
    expect(m.remitenteRol).toBe('INQUILINO');
    expect(m.remitenteUid).toBe(IDS.A.uid);
    expect(memoria.leer<{ mensajeIds: string[] }>('contratos_formalizacion', IDS.A.contrato)!.mensajeIds).toContain(nuevos[0]);
    const auditorias = memoria.idsDe('audit_logs').map((id) => memoria.leer<{ accion: string }>('audit_logs', id)!.accion);
    expect(auditorias).toContain('INQUILINO_MENSAJE_ENVIADO');
    // Nada escrito en el contrato/mensajes de B
    expect(memoria.rutasEscritas().some((r) => r.endsWith(`/${IDS.B.contrato}`) || r.endsWith(`/${IDS.B.mensaje}`))).toBe(false);
  });

  it('mensaje vacío → el motor lo rechaza y no se escribe nada', async () => {
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Más'));
    const main = document.querySelector('main') as HTMLElement;
    fireEvent.click(within(main).getByText('Mensajes').closest('button')!);
    const boton = screen.getByLabelText('Enviar mensaje') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('Escribe tu mensaje…'), { target: { value: '   ' } });
    expect(boton.disabled).toBe(true);
    expect(memoria.idsDe('mensajes_portal').length).toBe(2);
  });

  it('notificar avería: crea incidencia ABIERTA/origen INQUILINO acotada al contrato y la enlaza al índice', async () => {
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Averías'));
    fireEvent.click(screen.getByLabelText('Notificar avería'));
    fireEvent.change(screen.getByPlaceholderText('Ej. Fuga bajo el fregadero'), { target: { value: 'AVERIA_TEST_NUEVA' } });
    fireEvent.change(screen.getByPlaceholderText('Describe qué ocurre, dónde y desde cuándo…'), { target: { value: 'Descripción de prueba suficientemente larga.' } });
    fireEvent.click(screen.getByText('Enviar avería'));
    await waitFor(() => expect(document.body.textContent).toContain('AVERIA_TEST_NUEVA'));

    const nuevas = memoria.idsDe('incidencias').filter((id) => id !== IDS.A.incidencia && id !== IDS.B.incidencia);
    expect(nuevas.length).toBe(1);
    const inc = memoria.leer<Record<string, unknown>>('incidencias', nuevas[0])!;
    expect(inc.estado).toBe('ABIERTA');
    expect(inc.origen).toBe('INQUILINO');
    expect(inc.contratoId).toBe(IDS.A.contrato);
    expect(inc.inmuebleId).toBe(IDS.A.inmueble);
    expect(inc.contratoIdsVisibles).toEqual([IDS.A.contrato]);
    expect(memoria.leer<{ incidenciaIds: string[] }>('contratos_formalizacion', IDS.A.contrato)!.incidenciaIds).toContain(nuevas[0]);
  });

  it('avería con título corto → rechazada por el motor antes de escribir', async () => {
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Averías'));
    fireEvent.click(screen.getByLabelText('Notificar avería'));
    fireEvent.change(screen.getByPlaceholderText('Ej. Fuga bajo el fregadero'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByPlaceholderText('Describe qué ocurre, dónde y desde cuándo…'), { target: { value: 'Descripción de prueba suficientemente larga.' } });
    fireEvent.click(screen.getByText('Enviar avería'));
    await waitFor(() => expect(document.querySelector('.text-red-700, .text-red-600, [class*="red"]')?.textContent).toBeTruthy());
    expect(memoria.idsDe('incidencias').length).toBe(2);
  });

  it('registrar lectura de contador: lectura INQUILINO inmutable enlazada al suministro; lectura decreciente rechazada', async () => {
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Luz/Agua'));
    fireEvent.click(screen.getByText('Comercializadora Test A').closest('button')!); // expandir tarjeta
    fireEvent.click(screen.getByText('Dar lectura').closest('button')!);
    await waitFor(() => expect(screen.getByPlaceholderText('Ej. 1234.5')).toBeTruthy());
    const guardar = () => screen.getByText('Registrar lectura').closest('button')!;

    // Decreciente respecto a la última (1000) → rechazada
    fireEvent.change(screen.getByPlaceholderText('Ej. 1234.5'), { target: { value: '900' } });
    fireEvent.click(guardar());
    await waitFor(() => expect(document.body.textContent).toMatch(/inferior|menor|anterior|decrec|última/i));
    expect(memoria.idsDe('lecturas_suministro').length).toBe(2);

    // Válida → persistida como INQUILINO y enlazada
    fireEvent.change(screen.getByPlaceholderText('Ej. 1234.5'), { target: { value: '1100' } });
    fireEvent.click(guardar());
    await waitFor(() => expect(memoria.idsDe('lecturas_suministro').length).toBe(3));
    const nueva = memoria.idsDe('lecturas_suministro').find((id) => id !== IDS.A.lectura && id !== IDS.B.lectura)!;
    const lec = memoria.leer<Record<string, unknown>>('lecturas_suministro', nueva)!;
    expect(lec.origen).toBe('INQUILINO');
    expect(lec.valor).toBe(1100);
    expect(lec.contratoId).toBe(IDS.A.contrato);
    expect(lec.suministroId).toBe(IDS.A.suministro);
    expect(memoria.leer<{ lecturaIds: string[] }>('suministros', IDS.A.suministro)!.lecturaIds).toContain(nueva);
    expect(memoria.leer<{ lecturaIds: string[] }>('suministros', IDS.B.suministro)!.lecturaIds).toEqual([IDS.B.lectura]);
    await waitFor(() => expect(document.body.textContent).toContain('1100 kWh'));
  });

  it('error de escritura al enviar mensaje → mensaje de error visible, hilo intacto, sin estado inconsistente', async () => {
    await abrirPortal('A');
    await esperarCargado();
    fireEvent.click(tab('Más'));
    const main = document.querySelector('main') as HTMLElement;
    fireEvent.click(within(main).getByText('Mensajes').closest('button')!);
    memoria.fallar('set', 'mensajes_portal', 'permission-denied (simulado)');
    fireEvent.change(screen.getByPlaceholderText('Escribe tu mensaje…'), { target: { value: 'esto fallará TEST' } });
    fireEvent.click(screen.getByLabelText('Enviar mensaje'));
    await waitFor(() => expect(document.body.textContent).toMatch(/permission-denied|No se ha podido enviar/));
    expect(memoria.idsDe('mensajes_portal').length).toBe(2);
    expect(memoria.leer<{ mensajeIds: string[] }>('contratos_formalizacion', IDS.A.contrato)!.mensajeIds).toEqual([IDS.A.mensaje]);
  });
});

// ===========================================================================
// 6. REGISTRO POR INVITACIÓN (vista pública ?registroInq=)
// ===========================================================================
describe('E · Registro por invitación (RegistroInquilinoView)', () => {
  it('invitación válida → formulario → cuenta creada → «Entrar en mi portal» entrega el usuario INQUILINO', async () => {
    let usuarioEntregado: { tipoPerfil: string; contratoIds?: string[] } | null = null;
    render(<RegistroInquilinoView enlaceId={IDS.A.enlace} onComplete={(u) => { usuarioEntregado = u; }} onCancel={noop} />);
    expect(screen.getByText('Validando tu invitación…')).toBeTruthy();
    await waitFor(() => expect(screen.getByPlaceholderText('Tu nombre')).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('Tu nombre'), { target: { value: 'Nuevo' } });
    fireEvent.change(screen.getByPlaceholderText('tuemail@ejemplo.com'), { target: { value: 'nuevo.registro@test.invalid' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secreto-test-123' } });
    fireEvent.click(screen.getByText('Crear mi cuenta'));

    await waitFor(() => expect(screen.getByText('¡Cuenta creada!')).toBeTruthy());
    fireEvent.click(screen.getByText(/Entrar en mi portal/));
    expect(usuarioEntregado).not.toBeNull();
    expect(usuarioEntregado!.tipoPerfil).toBe('INQUILINO');
    expect(usuarioEntregado!.contratoIds).toEqual([IDS.A.contrato]);
    expect(authSintetico.creados.length).toBe(1);
    expect(memoria.leer<{ usosActuales: number }>('enlaces_registro', IDS.A.enlace)!.usosActuales).toBe(1);
  });

  it('el usuario recién registrado entra en su portal con el contexto correcto', async () => {
    const enlace = enlaceTest('A');
    const { registerWithInvitationLink } = await import('../../lib/authService');
    const { usuarioApp } = await registerWithInvitationLink({ enlace, email: 'flujo@test.invalid', password: 'secreto-test-123', nombre: 'Flujo' });
    render(<InquilinoPortalShell usuario={usuarioApp} onLogout={noop} />);
    await esperarCargado();
    expect(document.body.textContent).toContain('Calle Test A, 1');
    expect(document.body.textContent).not.toContain('Calle Test B, 1');
  });

  it('contraseña corta / campos vacíos → validación en la vista, sin llamar a Auth', async () => {
    render(<RegistroInquilinoView enlaceId={IDS.A.enlace} onComplete={noop} onCancel={noop} />);
    await waitFor(() => expect(screen.getByPlaceholderText('Tu nombre')).toBeTruthy());
    fireEvent.click(screen.getByText('Crear mi cuenta'));
    expect(screen.getByText('Completa tu nombre y tu email.')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Tu nombre'), { target: { value: 'N' } });
    fireEvent.change(screen.getByPlaceholderText('tuemail@ejemplo.com'), { target: { value: 'n@test.invalid' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: '123' } });
    fireEvent.click(screen.getByText('Crear mi cuenta'));
    expect(screen.getByText(/al menos 6 caracteres/)).toBeTruthy();
    expect(authSintetico.creados.length).toBe(0);
  });

  it('invitación inexistente → «Invitación no válida», sin formulario', async () => {
    render(<RegistroInquilinoView enlaceId="enl_inq_TEST_NO_EXISTE" onComplete={noop} onCancel={noop} />);
    await waitFor(() => expect(screen.getByText('Invitación no válida')).toBeTruthy());
    expect(screen.getByText(/no existe o ha sido desactivado/)).toBeTruthy();
    expect(screen.queryByPlaceholderText('Tu nombre')).toBeNull();
  });

  it('invitación ya utilizada → rechazada; invitación desactivada → rechazada; identificador inválido → rechazado', async () => {
    memoria.sembrar('enlaces_registro', 'enl_inq_TEST_USADA', enlaceTest('A', { id: 'enl_inq_TEST_USADA', usosActuales: 1 }) as never);
    const r1 = render(<RegistroInquilinoView enlaceId="enl_inq_TEST_USADA" onComplete={noop} onCancel={noop} />);
    await waitFor(() => expect(screen.getByText('Invitación no válida')).toBeTruthy());
    r1.unmount();

    memoria.sembrar('enlaces_registro', 'enl_inq_TEST_OFF', enlaceTest('A', { id: 'enl_inq_TEST_OFF', activo: false }) as never);
    const r2 = render(<RegistroInquilinoView enlaceId="enl_inq_TEST_OFF" onComplete={noop} onCancel={noop} />);
    await waitFor(() => expect(screen.getByText('Invitación no válida')).toBeTruthy());
    r2.unmount();

    render(<RegistroInquilinoView enlaceId="../../etc/passwd" onComplete={noop} onCancel={noop} />);
    await waitFor(() => expect(screen.getByText('Invitación no válida')).toBeTruthy());
    expect(authSintetico.creados.length).toBe(0);
  });

  it('una invitación de PROPIETARIO no sirve para el registro de inquilino', async () => {
    memoria.sembrar('enlaces_registro', 'enl_TEST_PROP', enlaceTest('A', { id: 'enl_TEST_PROP', tipoPerfil: 'PROPIETARIO', contratoIdVinculado: undefined }) as never);
    render(<RegistroInquilinoView enlaceId="enl_TEST_PROP" onComplete={noop} onCancel={noop} />);
    await waitFor(() => expect(screen.getByText('Invitación no válida')).toBeTruthy());
  });

  it('error de red al validar → mensaje controlado (sin exponer nada)', async () => {
    memoria.fallar('get', `enlaces_registro/${IDS.A.enlace}`, 'unavailable (simulado)');
    render(<RegistroInquilinoView enlaceId={IDS.A.enlace} onComplete={noop} onCancel={noop} />);
    await waitFor(() => expect(screen.getByText('Invitación no válida')).toBeTruthy());
    expect(screen.queryByPlaceholderText('Tu nombre')).toBeNull();
  });

  it('cancelar vuelve atrás sin crear nada', async () => {
    let cancelado = 0;
    render(<RegistroInquilinoView enlaceId={IDS.A.enlace} onComplete={noop} onCancel={() => { cancelado++; }} />);
    await waitFor(() => expect(screen.getByText('Cancelar y volver')).toBeTruthy());
    fireEvent.click(screen.getByText('Cancelar y volver'));
    expect(cancelado).toBe(1);
    expect(authSintetico.creados.length).toBe(0);
  });
});

// Evita el aviso de import sin uso cuando act no se necesita en algún entorno.
void act;
void incidenciaTest;
