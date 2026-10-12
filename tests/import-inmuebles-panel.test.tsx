/**
 * INCIDENCIA — IMPORTACIÓN DE INMUEBLES: cableado del PANEL (UI real, jsdom).
 *
 * Complementa `import-inmuebles-json-excel.test.ts` (núcleo puro) verificando
 * lo que la persona ve y puede hacer:
 *  · el selector de archivos admite JSON por MIME (Android);
 *  · un JSON sin registros da un error concreto y NO abre un run vacío;
 *  · un .xlsx sin extensión se analiza igual (detección por firma);
 *  · la importación de inmuebles se DETIENE y pide titular destino, y al
 *    elegirlo reanaliza sin asignar nada por defecto.
 *
 * Todo es sintético y de solo lectura: el puerto de escritura es un doble que
 * no persiste nada.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mem = vi.hoisted(() => ({
  fuentes: null as null | { propietarios: unknown[]; inmuebles: unknown[]; contratos: unknown[]; gastos: unknown[] },
}));

vi.mock('../src/lib/firebase', () => ({
  auth: { get currentUser() { return { uid: 'uid_sintetico', email: 'sintetico@test.local' }; } },
}));

vi.mock('../src/lib/authService', () => ({
  getUsuarioByAuthUid: async () => ({
    id: 'u_sintetico', nombre: 'Sintético', email: 'sintetico@test.local',
    tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A',
    inmuebleIds: [], carterasL: ['prop_A'], carterasE: ['prop_A'],
  }),
}));

vi.mock('../src/lib/gestionesCarteraServicio', () => ({
  listarGestionesDeGestor: async () => ({ ok: true, gestiones: [] }),
}));

vi.mock('../src/lib/gestionesCarteraServicioFirebase', () => ({
  dependenciasGestionesCarteraFirestore: {},
}));

vi.mock('../src/lib/importExportFirebase', () => ({
  ambitoAutorizadoDesdeUsuario: () => ({
    propietarioIdsLegibles: ['prop_A'], propietarioIdsEscribibles: ['prop_A'], esMaster: false,
  }),
  cargarFuentesCatalogo: async () => mem.fuentes ?? { propietarios: [], inmuebles: [], contratos: [], gastos: [] },
  catalogosDesdeFuentes: (_f: unknown, extra?: Record<string, unknown>) => ({
    propietarios: [
      { id: 'prop_A', nombre: 'Titular principal (sintético)', nifCif: '11111111A' },
      { id: 'prop_B', nombre: 'Segundo titular (sintético)', nifCif: '22222222B' },
    ],
    inmuebles: [{ id: 'inm_1', direccion: 'Calle Sintética Uno 1', ciudad: 'Alicante', referenciaCatastral: 'CAT-001', propietarioId: 'prop_A' }],
    contratos: [],
    mapeos: [],
    existentes: [],
    ...(extra?.['propietariosPermitidosIds'] !== undefined ? { propietariosPermitidosIds: extra['propietariosPermitidosIds'] } : {}),
  }),
  crearPuertoFirebase: () => ({
    async existeDestino() { return false; },
    async existeCobro() { return false; },
    async crearGasto() {},
    async anexarCobro() {},
    async auditar() {},
  }),
}));

import { ImportExportPanel } from '../src/components/sections/ImportExportPanel';
import { generarXlsx, type ColumnaXlsx } from '../src/lib/importExport';

afterEach(() => {
  cleanup();
  mem.fuentes = null;
});

const CABECERAS = [
  'ID Inmueble', 'Dirección Completa', 'Referencia Catastral', 'Titularidad',
  '% Propietario 1', '% Propietario 2', 'Precio Adquisición (€)', 'Amortización Anual (€)',
  'Renta Mensual (€)', 'Gastos Comunidad (€)', 'Gastos IBI (€)', 'Gastos Reparaciones (€)',
  'Gastos Seguro (€)', '% Suelo Catastral', 'Inquilino', 'DNI Inquilino', 'Fecha Registro',
];

function libroSintetico(filas: number): Uint8Array {
  const columnas: ColumnaXlsx[] = CABECERAS.map((nombre) => ({ nombre, tipo: 'texto' }));
  const filasDatos = Array.from({ length: filas }, (_, i) => ({
    'ID Inmueble': `INM-EXT-${i + 1}`,
    'Dirección Completa': `Calle Sintética ${i + 1}, 03001 Alicante`,
    'Referencia Catastral': `CAT-EXT-${i + 1}`,
    'Titularidad': 'Cotitularidad',
    '% Propietario 1': '60',
    '% Propietario 2': '40',
    'Precio Adquisición (€)': '120000',
    'Amortización Anual (€)': '3000',
    'Renta Mensual (€)': '650',
    'Gastos Comunidad (€)': '45',
    'Gastos IBI (€)': '320',
    'Gastos Reparaciones (€)': '0',
    'Gastos Seguro (€)': '180',
    '% Suelo Catastral': '20',
    'Inquilino': '',
    'DNI Inquilino': '',
    'Fecha Registro': '2019-05-01',
  }));
  return generarXlsx([{ nombre: 'Inmuebles', columnas, filas: filasDatos }]);
}

async function subir(container: HTMLElement, contenido: BlobPart, nombre: string, mime: string): Promise<void> {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([contenido], nombre, { type: mime })] } });
  await screen.findByText(/sha256:/);
}

describe('panel: admisión del archivo (Android, MIME y firma)', () => {
  it('el selector declara MIME y extensión (Android)', () => {
    const { container } = render(<ImportExportPanel inmuebles={[]} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.getAttribute('accept')).toContain('application/json');
    expect(input.getAttribute('accept')).toContain('.json');
    expect(input.getAttribute('accept')).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(input.getAttribute('accept')).toContain('.xlsx');
  });

  it('un .xlsx SIN extensión (Android/Drive) se reconoce por firma', async () => {
    const { container } = render(<ImportExportPanel inmuebles={[]} />);
    await subir(container, libroSintetico(1), 'documento', '');
    expect(screen.getByText(/Formato:/).textContent).toContain('XLSX');
  });
});

describe('panel: JSON sin registros no se convierte en importación vacía', () => {
  it('sobre propio con «records» vacío: error concreto y sin cuadrícula de resultados', async () => {
    const { container } = render(<ImportExportPanel inmuebles={[]} />);
    const json = JSON.stringify({
      __erpExport: { schemaVersion: 'erp-import-export-v1', exportRunId: 'exp_x', exportedAt: '2026-10-12T00:00:00.000Z', entityType: 'INMUEBLE' },
      entityType: 'INMUEBLE', recordCount: 0, records: [],
    });
    await subir(container, json, 'export_inmueble_vacio.json', 'application/json');
    await waitFor(() => { expect(screen.getByText('Analizar (dry-run)')).toBeDefined(); });
    fireEvent.click(screen.getByText('Analizar (dry-run)'));
    await screen.findByText(/no aporta ningún registro/, undefined, { timeout: 3000 });
    // No se ha abierto ningún run: la cuadrícula de resultados no existe.
    expect(screen.queryByText('Total')).toBeNull();
    expect(screen.queryByText('Decisiones de promoción (B1 G-13: sin decisión no se promociona)')).toBeNull();
  });
});

describe('panel: titular destino en perfil PROPIETARIO', () => {
  it('detiene la importación, pide destino y reanaliza al elegirlo', async () => {
    mem.fuentes = {
      propietarios: [
        { id: 'prop_A', nombre: 'Titular principal (sintético)' },
        { id: 'prop_B', nombre: 'Segundo titular (sintético)' },
      ],
      inmuebles: [], contratos: [], gastos: [],
    };
    const { container } = render(<ImportExportPanel inmuebles={[]} />);
    await subir(container, libroSintetico(7), 'inmuebles.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await waitFor(() => { expect(screen.getByText('Analizar (dry-run)')).toBeDefined(); });
    fireEvent.click(screen.getByText('Analizar (dry-run)'));

    // Sin destino: la importación se detiene y lo dice.
    await screen.findByText(/7 registro\(s\) sin titular destino determinado/, undefined, { timeout: 3000 });
    expect(screen.getByText(/Titular destino de la importación/)).toBeDefined();
    // Ninguna cabecera desconocida: las 17 están reconocidas (mapeadas o sin destino).
    expect(screen.queryByText(/Campos desconocidos/)).toBeNull();
    expect(screen.getByText(/Columnas reconocidas SIN destino/)).toBeDefined();

    // Elegir destino + reanalizar: el bloqueo desaparece y el titular se resuelve.
    const selector = screen.getByLabelText(/Titular destino de la importación/) as HTMLSelectElement;
    fireEvent.change(selector, { target: { value: 'prop_A' } });
    fireEvent.click(screen.getByText('Aplicar destino y reanalizar (dry-run)'));
    await waitFor(() => {
      expect(screen.queryByText(/sin titular destino determinado/)).toBeNull();
    }, { timeout: 3000 });
    expect(screen.getByText('Ver registros (7)')).toBeDefined();
  });
});
