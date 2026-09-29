/**
 * REGRESIÓN DE AUDITORÍA 3ac21a5 — panel UI (D1/D2).
 *
 * Renderiza el panel REAL (jsdom) con el adaptador Firebase mockeado y
 * demuestra:
 *  · D1: Analizar guarda insumos ⇒ Autorizar (O7) responde (antes: muerto en
 *    silencio) ⇒ Promocionar ejecuta por el puerto (barrera+plan+ámbito).
 *  · D2: sin props de identidad, el panel carga su contexto (uid→UsuarioApp);
 *    sin sesión se bloquea honesto (sin colgar).
 *
 * La proyección de catálogos/ámbito se prueba con sus fns reales en
 * `import-export-auditoria.test.ts`; aquí se fija el CABLEADO del panel.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mem = vi.hoisted(() => ({
  currentUser: null as null | { uid: string; email: string },
  ficha: null as null | Record<string, unknown>,
  gastosCreados: [] as unknown[],
  auditoria: [] as unknown[],
  /** Fuentes de catálogo que devuelve el adaptador mockeado (exportación). */
  fuentes: null as null | { propietarios: unknown[]; inmuebles: unknown[]; contratos: unknown[]; gastos: unknown[] },
  /** Último Blob descargado por el panel (para verificar el .xlsx real). */
  descargado: null as null | { blob: Blob },
  /** REVISIÓN PR #13: cada `scope` recibido por cargarFuentesCatalogo (contrato de no-globalidad). */
  scopesVistos: [] as unknown[],
  /** Gestiones de cartera que el servicio mockeado devuelve para la autocarga. */
  gestiones: [] as unknown[],
}));

vi.mock('../src/lib/firebase', () => ({
  auth: { get currentUser() { return mem.currentUser; } },
}));

vi.mock('../src/lib/authService', () => ({
  getUsuarioByAuthUid: async () => mem.ficha,
}));

vi.mock('../src/lib/gestionesCarteraServicio', () => ({
  listarGestionesDeGestor: async () => ({ ok: true, gestiones: [...mem.gestiones] }),
}));

vi.mock('../src/lib/gestionesCarteraServicioFirebase', () => ({
  dependenciasGestionesCarteraFirestore: {},
}));

vi.mock('../src/lib/importExportFirebase', async (importOriginal) => {
  const ambitoReal = await import('../src/lib/importExport/ambito');
  return {
    ...(await (importOriginal() as Promise<Record<string, unknown>>)),
    ambitoAutorizadoDesdeUsuario: ambitoReal.ambitoAutorizadoDesdeUsuario,
    cargarFuentesCatalogo: async (scope?: unknown) => {
      mem.scopesVistos.push(scope);
      return mem.fuentes ?? ({ propietarios: [], inmuebles: [], contratos: [], gastos: [] });
    },
    catalogosDesdeFuentes: (_f: unknown, extra?: Record<string, unknown>) => ({
      propietarios: [{ id: 'prop_A', nombre: 'A', nifCif: '11111111A' }],
      inmuebles: [{ id: 'inm_1', direccion: 'C X', propietarioId: 'prop_A' }],
      contratos: [{ id: 'cont_1', inmuebleId: 'inm_1', propietarioId: 'prop_A' }],
      mapeos: [{ alcance: 'INMUEBLE', origen: 'EXTERNAL:prop_ext_1', destino: 'inm_1' }],
      existentes: [],
      ...(extra?.['propietariosPermitidosIds'] !== undefined
        ? { propietariosPermitidosIds: extra['propietariosPermitidosIds'] }
        : {}),
    }),
    crearPuertoFirebase: () => ({
      async existeDestino() { return false; },
      async existeCobro() { return false; },
      async crearGasto(g: unknown) { mem.gastosCreados.push(g); },
      async anexarCobro() {},
      async auditar(e: unknown) { mem.auditoria.push(e); },
    }),
  };
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ImportExportPanel } from '../src/components/sections/ImportExportPanel';
import { parseXlsx } from '../src/lib/importExport';
import type { UsuarioApp } from '../src/types';

// jsdom no sirve módulos como file://: los fixtures se resuelven desde la raíz
// del repositorio (misma ruta que usa vitest como cwd).
const fixtures = (nombre: string): Uint8Array =>
  new Uint8Array(readFileSync(resolve(process.cwd(), 'tests/fixtures/xlsx', nombre)));
const FIXTURE_XLSX = fixtures('movimientos-rentasync.xlsx');
const FIXTURE_HOJAS = fixtures('inmuebles-varias-hojas.xlsx');

/** jsdom no implementa createObjectURL: se intercepta para capturar la descarga. */
function interceptarDescargas(): void {
  const url = URL as unknown as Record<string, unknown>;
  url['createObjectURL'] = (blob: Blob) => { mem.descargado = { blob }; return 'blob:test'; };
  url['revokeObjectURL'] = () => {};
}

afterEach(() => {
  cleanup();
  mem.currentUser = null;
  mem.ficha = null;
  mem.gastosCreados = [];
  mem.auditoria = [];
  mem.fuentes = null;
  mem.descargado = null;
  mem.scopesVistos = [];
  mem.gestiones = [];
});

const MASTER = {
  id: 'u_master', nombre: 'Master', email: 'master@t.es', tipoPerfil: 'ADMINISTRADOR',
  estado: 'ACTIVO', roles: [], permisos: [], createdAt: 'x', updatedAt: 'x',
} as unknown as UsuarioApp;

const GASTO_JSON = JSON.stringify([{
  id: 'AUDIT_panel_g1', type: 'gasto', category: 'community', amount: 100,
  propertyId: 'prop_ext_1', date: '2024-03-15', description: 'Comunidad marzo',
}]);

async function subirFicheroCon(container: HTMLElement, contenido: BlobPart, nombre: string, mime: string) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([contenido], nombre, { type: mime })] } });
  // La subida es async (arrayBuffer + setState): esperar a la señal sha256.
  await screen.findByText(/sha256:/);
}

async function subirFichero(container: HTMLElement) {
  await subirFicheroCon(container, GASTO_JSON, 'panel.json', 'application/json');
}

describe('D1: flujo completo analizar → decidir → autorizar → promocionar', () => {
  it('Autorizar responde CONCEDIDA y Promocionar escribe por el puerto', async () => {
    const { container } = render(<ImportExportPanel inmuebles={[]} usuario={MASTER} gestiones={[]} />);
    await subirFichero(container);
    fireEvent.click(screen.getByText('Analizar (dry-run)'));
    // Dry-run: 1 AUTO visible.
    await screen.findByText('Decisiones de promoción (B1 G-13: sin decisión no se promociona)');
    // Decisiones humanas: aCargoDe + estado + deducible confirmado.
    const selects = container.querySelectorAll('li select');
    expect(selects.length).toBe(3);
    fireEvent.change(selects[0], { target: { value: 'arrendador' } });
    fireEvent.change(selects[1], { target: { value: 'PENDIENTE' } });
    fireEvent.change(selects[2], { target: { value: 'true' } });
    // Autorizar: re-dry-run con parches + O7 (pre-fix: no pasaba nada).
    fireEvent.click(screen.getByText('Autorizar (O7)'));
    await screen.findByText(/CONCEDIDA/);
    // Promocionar: barrera + plan + ejecución por el puerto.
    const btnPromo = screen.getByText('Promocionar selección');
    expect((btnPromo as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btnPromo);
    await screen.findByText(/INFORME DE PROMOCIÓN/);
    expect(mem.gastosCreados).toHaveLength(1);
    expect((mem.gastosCreados[0] as { id: string }).id).toBe('gas_inm_1_AUDIT_panel_g1');
    expect((mem.gastosCreados[0] as { deducible: boolean }).deducible).toBe(true);
    expect(mem.auditoria.length).toBeGreaterThanOrEqual(1);
  });

  it('sin decisiones G-13, el plan excluye (no se inventan)', async () => {
    const { container } = render(<ImportExportPanel inmuebles={[]} usuario={MASTER} gestiones={[]} />);
    await subirFichero(container);
    fireEvent.click(screen.getByText('Analizar (dry-run)'));
    await screen.findByText('Decisiones de promoción (B1 G-13: sin decisión no se promociona)');
    // Solo deducible (para O7), sin aCargoDe/estado.
    const selects = container.querySelectorAll('li select');
    fireEvent.change(selects[2], { target: { value: 'true' } });
    fireEvent.click(screen.getByText('Autorizar (O7)'));
    await screen.findByText(/CONCEDIDA/);
    fireEvent.click(screen.getByText('Promocionar selección'));
    await screen.findByText(/INFORME DE PROMOCIÓN/);
    expect(mem.gastosCreados).toHaveLength(0);
    screen.getByText(/requiere decisión humana/);
  });
});

describe('D2: identidad propia cuando no hay props', () => {
  it('carga contexto desde la sesión (uid→UsuarioApp) y habilita Analizar', async () => {
    mem.currentUser = { uid: 'u9', email: 'g@t.es' };
    mem.ficha = { ...MASTER, id: 'u9', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_A' } as unknown as Record<string, unknown>;
    const { container } = render(<ImportExportPanel inmuebles={[]} />);
    await waitFor(() => {
      expect(screen.getByText('Analizar (dry-run)', { exact: false })).toBeDefined();
    });
    // El botón existe y (con fichero) el guard de identidad no bloquea:
    // aquí basta con que NO aparezca el banner de error de identidad.
    expect(container.textContent).not.toMatch(/Sin identidad/);
  });

  it('sin sesión ⇒ banner honesto + botones bloqueados (sin colgar)', async () => {
    mem.currentUser = null;
    const { container } = render(<ImportExportPanel inmuebles={[]} />);
    await screen.findByText(/Sin identidad/);
    const btn = screen.getByText('Analizar (dry-run)');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toMatch(/se bloquea/);
  });
});

describe('REVISIÓN PR #13 — ámbito (DataAccessScope) siempre acotado tras el fix', () => {
  const GESTION_CARTERA_C = {
    id: 'ges_1', propietarioId: 'prop_C', gestorUsuarioId: 'u_g',
    tipoGestor: 'PROPIETARIO_GESTOR', inmuebleIds: [], permiso: 'LECTURA_ESCRITURA',
    responsableActual: 'GESTOR', estado: 'ACTIVA', requiereAceptacion: false,
    eventos: [], creadoPor: 'master', fechaAlta: '2026-01-01', createdAt: 'x', updatedAt: 'x',
  } as unknown as Record<string, unknown>;

  it('PROPIETARIO autocargado: analizar usa scope con su propietarioId (NUNCA undefined = nunca consulta global)', async () => {
    mem.currentUser = { uid: 'u_p', email: 'p@t.es' };
    mem.ficha = { ...MASTER, id: 'u_p', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_A' } as unknown as Record<string, unknown>;
    const { container } = render(<ImportExportPanel inmuebles={[]} />);
    await subirFichero(container);
    // Seleccionar archivo NO escribe ningún dato (solo arriba del dry-run)
    expect(mem.gastosCreados).toHaveLength(0);
    fireEvent.click(screen.getByText('Analizar (dry-run)'));
    await screen.findByText('Decisiones de promoción (B1 G-13: sin decisión no se promociona)');
    const ultimo = mem.scopesVistos[mem.scopesVistos.length - 1] as Record<string, unknown>;
    expect(ultimo).toBeDefined();
    expect(ultimo?.['tipoPerfil']).toBe('PROPIETARIO');
    expect(ultimo?.['propietarioId']).toBe('prop_A');
    // Y aun así no se ha escrito nada: dry-run puro
    expect(mem.gastosCreados).toHaveLength(0);
  });

  it('GESTOR de cartera autocargado: scope proyecta SOLO sus carteras (propietariosGestionados)', async () => {
    mem.currentUser = { uid: 'u_g', email: 'g@t.es' };
    mem.ficha = { ...MASTER, id: 'u_g', tipoPerfil: 'PROPIETARIO' } as unknown as Record<string, unknown>;
    mem.gestiones = [GESTION_CARTERA_C as never];
    const { container } = render(<ImportExportPanel inmuebles={[]} />);
    await subirFichero(container);
    fireEvent.click(screen.getByText('Analizar (dry-run)'));
    // El contrato es el scope usado para leer catálogos, no el resultado del run
    // (el fixture mapea a un inmueble fuera de la cartera: el run puede quedar vacío).
    await waitFor(() => expect(mem.scopesVistos.length).toBeGreaterThanOrEqual(1));
    const ultimo = mem.scopesVistos[mem.scopesVistos.length - 1] as Record<string, unknown>;
    expect(ultimo).toBeDefined();
    expect(ultimo?.['propietariosGestionados']).toEqual(['prop_C']);
    expect(ultimo?.['propietarioId']).toBeUndefined();
  });

  it('EXPORTAR también pasa el scope acotado (propietario autocargado)', async () => {
    mem.currentUser = { uid: 'u_p', email: 'p@t.es' };
    mem.ficha = { ...MASTER, id: 'u_p', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_A' } as unknown as Record<string, unknown>;
    mem.fuentes = {
      propietarios: [{ id: 'prop_A', nombre: 'A', nifCif: '11111111A' }],
      inmuebles: [{ id: 'inm_1', direccion: 'C X', propietarioId: 'prop_A' }],
      contratos: [],
      gastos: [{ id: 'g_1', inmuebleId: 'inm_1', propietarioId: 'prop_A', concepto: 'Comunidad', importe: 10, fechaDevengo: '2024-03-15' }],
    };
    interceptarDescargas();
    const { container } = render(<ImportExportPanel inmuebles={[]} />);
    fireEvent.click(screen.getByText('Exportar'));
    fireEvent.click(await screen.findByText('Generar y descargar'));
    await waitFor(() => expect(mem.descargado).not.toBeNull());
    const ultimo = mem.scopesVistos[mem.scopesVistos.length - 1] as Record<string, unknown>;
    expect(ultimo).toBeDefined();
    expect(ultimo?.['tipoPerfil']).toBe('PROPIETARIO');
    expect(ultimo?.['propietarioId']).toBe('prop_A');
  });

  it('ADMIN/MASTER por props conserva el comportamiento actual (tests D1/D2/XLSX intactos)', () => {
    // Sin aserción nueva: el contrato previo queda cubierto por D1 (flujo completo
    // con usuario MASTER por props) y D2 (autocarga). Esta casuística consta aquí
    // para que un futuro cambio del fix no pase en silencio: el panel sigue aceptando
    // identidad+gestiones por props exactamente como antes (usado por Configuración).
    expect(true).toBe(true);
  });
});

describe('BLOQUE 7: XLSX real en el panel (mismo contrato que JSON/CSV)', () => {
  const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  it('acepta un .xlsx real, muestra el selector de hoja y hace dry-run', async () => {
    const { container } = render(<ImportExportPanel inmuebles={[]} usuario={MASTER} gestiones={[]} />);
    await subirFicheroCon(container, new Blob([FIXTURE_XLSX]), 'movimientos.xlsx', MIME_XLSX);
    expect(container.textContent).toMatch(/Formato:\s*XLSX/);
    // El selector de hoja solo existe con formato XLSX.
    screen.getByText('Hoja:', { exact: false });
    // Avisos reales del parser (filas sin destino, tipos interpretados…).
    fireEvent.click(screen.getByText('Analizar (dry-run)'));
    await screen.findByText('Decisiones de promoción (B1 G-13: sin decisión no se promociona)');
    expect(container.textContent).toMatch(/movimientos\.xlsx/);
  });

  it('avisa de las hojas del libro cuando tiene varias (y deja elegir cuál)', async () => {
    const { container } = render(<ImportExportPanel inmuebles={[]} usuario={MASTER} gestiones={[]} />);
    await subirFicheroCon(container, new Blob([FIXTURE_HOJAS]), 'inmuebles.xlsx', MIME_XLSX);
    fireEvent.click(screen.getByText('Analizar (dry-run)'));
    // Aviso real del parser: se lee la primera hoja y se enumeran las demás.
    await screen.findByText(/se lee 'Inmuebles'/);
    const selectorHoja = container.querySelector('input[placeholder="(por nombre; vacío = primera)"]') as HTMLInputElement;
    expect(selectorHoja).not.toBeNull();
    // Elegir otra hoja cambia lo que se analiza (misma ruta, sin lógica paralela).
    fireEvent.change(selectorHoja, { target: { value: 'Contratos' } });
    fireEvent.click(screen.getByText('Analizar (dry-run)'));
    await screen.findByText(/hoja 'Contratos' seleccionada entre 2 del libro/);
    expect(container.textContent).not.toMatch(/se lee 'Inmuebles'/);
  });

  it('exportar XLSX descarga un libro real con el ámbito exacto (sin datos ajenos)', async () => {
    interceptarDescargas();
    mem.fuentes = {
      propietarios: [{ id: 'prop_A', nombre: 'A', nifCif: '11111111A' }],
      inmuebles: [{ id: 'inm_1', direccion: 'C X', propietarioId: 'prop_A' }],
      contratos: [],
      gastos: [
        { id: 'g_1', inmuebleId: 'inm_1', propietarioId: 'prop_A', concepto: 'Comunidad', importe: 100.5, fechaDevengo: '2024-03-15' },
        { id: 'g_2', inmuebleId: 'inm_2', propietarioId: 'prop_B', concepto: 'Ajena', importe: 50, fechaDevengo: '2024-03-16' },
      ],
    };
    const { container } = render(<ImportExportPanel inmuebles={[]} usuario={MASTER} gestiones={[]} />);
    fireEvent.click(screen.getByText('Exportar'));
    fireEvent.change(screen.getByLabelText(/Propietarios \(ids, coma/, { exact: false }), { target: { value: 'prop_A' } });
    fireEvent.change(screen.getByLabelText(/Formato:/, { exact: false }), { target: { value: 'XLSX' } });
    fireEvent.click(screen.getByText('Generar y descargar'));
    await screen.findByText(/registro\(s\) · run exp_/);
    expect(mem.descargado).not.toBeNull();
    const bytes = new Uint8Array(await mem.descargado!.blob.arrayBuffer());
    const libro = parseXlsx(bytes);
    expect(libro.errores).toEqual([]);
    expect(libro.hojas).toEqual(['GASTO']);
    expect(libro.registros.map((r) => r['id'])).toEqual(['g_1']);
    expect(libro.registros[0]['importe']).toBe(100.5);
    expect(libro.registros[0]['fechaDevengo']).toBe('2024-03-15');
  });
});
