/**
 * BLOQUE 10 · UX-7 — CIERRE: DIÁLOGOS REALES, CONTADOR DEL MENÚ Y GUARDAS DE ÁRBOL.
 *
 * Cuatro bloques, uno por corrección de la fase:
 *  1. `ConfirmDeleteModal` (capa convertida en UX-7): se anuncia como diálogo, el foco
 *     entra, `Escape` cancela y **no** ejecuta la operación, y el foco vuelve al origen.
 *  2. Contador real de incidencias en los dos menús (lateral y móvil): el valor que se
 *     pasa es el que se ve, y con 0 no aparece badge.
 *  3. Guarda de feedback: no queda ningún `window.prompt(` en el árbol de producción
 *     (sí el fallback documentado del canal de confirmación).
 *  4. Guarda de cobertura: los diálogos convertidos en UX-7 mantienen el hook, y las
 *     capas clasificadas como visor/pantalla completa no lo reciben.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { UsuarioApp } from '../types';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { MobileNav } from '../components/MobileNav';
import { Sidebar } from '../components/Sidebar';

afterEach(() => cleanup());

const USUARIO = { id: 'u-1', nombre: 'Gestora ficticia', tipoPerfil: 'ADMINISTRADOR' } as UsuarioApp;
const RAIZ_SRC = resolve(__dirname, '..');

function ficherosFuente(directorio: string, extensiones = ['.tsx']): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(directorio)) {
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...ficherosFuente(ruta, extensiones));
    else if (extensiones.some((ext) => entrada.endsWith(ext)) && !entrada.includes('.test.')) salida.push(ruta);
  }
  return salida;
}

function finDeEtiqueta(fuente: string, desde: number): number {
  let i = desde;
  let llaves = 0;
  let comilla: string | null = null;
  while (i < fuente.length) {
    const ch = fuente[i];
    if (comilla) {
      if (ch === comilla) comilla = null;
    } else if (ch === '"' || ch === "'" || ch === '`') comilla = ch;
    else if (ch === '{') llaves += 1;
    else if (ch === '}') llaves -= 1;
    else if (ch === '>' && llaves === 0 && fuente[i - 1] !== '=') return i;
    i += 1;
  }
  return fuente.length;
}

describe('UX-7 · diálogo real convertido (ConfirmDeleteModal)', () => {
  it('se anuncia como diálogo, recibe el foco y Escape cancela sin ejecutar', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const disparador = document.createElement('button');
    document.body.appendChild(disparador);
    disparador.focus();

    const { unmount } = render(
      <ConfirmDeleteModal
        isOpen
        title="Eliminar documento"
        description="El documento ficticio se eliminará."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const dialogo = screen.getByRole('dialog');
    expect(dialogo.getAttribute('aria-modal')).toBe('true');
    expect(dialogo.getAttribute('aria-label')).toBe('Confirmar eliminación');
    expect(dialogo.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    unmount();
    expect(document.activeElement).toBe(disparador);
    document.body.removeChild(disparador);
  });
});

describe('UX-7 · contador de incidencias en los menús', () => {
  it('el menú móvil muestra el contador que recibe y ninguno cuando es 0', () => {
    const { unmount } = render(
      <MobileNav
        activeSection="incidencias"
        onSelectSection={() => undefined}
        candidatos={[]}
        incidenciasAbiertasCount={3}
        currentUser={USUARIO}
      />
    );
    expect(screen.getByRole('button', { name: /incidencias/i }).textContent).toContain('3');
    unmount();

    render(
      <MobileNav
        activeSection="incidencias"
        onSelectSection={() => undefined}
        candidatos={[]}
        incidenciasAbiertasCount={0}
        currentUser={USUARIO}
      />
    );
    expect(screen.getByRole('button', { name: /incidencias/i }).textContent).not.toContain('3');
  });

  it('el menú lateral pinta el badge de incidencias con el mismo contador', () => {
    render(
      <Sidebar
        activeSection="incidencias"
        onSelectSection={() => undefined}
        candidatos={[]}
        inmueblesCount={0}
        incidenciasAbiertasCount={2}
        currentUser={USUARIO}
      />
    );
    const item = screen.getByRole('button', { name: /incidencias/i });
    expect(item.textContent).toContain('2');
  });
});

describe('UX-7 · guardas sobre el árbol real', () => {
  it('no queda ningún `window.prompt(` fuera del fallback documentado', () => {
    const infractores = ficherosFuente(RAIZ_SRC, ['.tsx', '.ts'])
      .filter((ruta) => !ruta.endsWith(join('feedback', 'confirmacion.ts')))
      .filter((ruta) => /window\.prompt\s*\(/.test(readFileSync(ruta, 'utf8')));
    expect(infractores).toEqual([]);
  });

  it('los diálogos convertidos en UX-7 conservan su hook', () => {
    const esperado: [string, number][] = [
      ['components/ConfirmDeleteModal.tsx', 1],
      ['components/GestionImagenesModal.tsx', 2],
      ['components/PortalVisitaPublicaView.tsx', 1],
      ['components/SolicitudDetailModal.tsx', 1],
      ['components/DetalleSolicitudDocModal.tsx', 1],
      ['components/modals/DetalleProyectoReformaModal.tsx', 5],
      ['components/modals/DetalleTrabajoProfesionalModal.tsx', 4],
      ['components/sections/CobrosSection.tsx', 4],
      ['components/sections/TesoreriaSection.tsx', 6],
      ['components/sections/ActasSection.tsx', 1],
      ['components/admin/AdminControlCenter.tsx', 3],
    ];
    for (const [relativa, minimo] of esperado) {
      const fuente = readFileSync(join(RAIZ_SRC, relativa), 'utf8');
      const usos = fuente.match(/useDialogoAccesible\(/g) ?? [];
      expect(usos.length, relativa).toBeGreaterThanOrEqual(minimo);
    }
  });

  it('el inventario de capas queda en grupo A y C vacíos: sólo visores y el host de confirmación', () => {
    // Fuente del inventario: docs/BLOQUE-10-UX7-INSPECCION-CIERRE.md (§6). Si aparece una
    // capa nueva sin clasificar, esta guarda lo detecta.
    const pendientes: string[] = [];
    let total = 0;
    for (const ruta of ficherosFuente(RAIZ_SRC)) {
      const fuente = readFileSync(ruta, 'utf8');
      const relativa = ruta.slice(RAIZ_SRC.length + 1);
      let indice = fuente.indexOf('className="fixed inset-0');
      while (indice !== -1) {
        total += 1;
        const linea = fuente.slice(0, indice).split('\n').length;
        // ¿la capa o su contenedor interior usan el hook?
        const capa = fuente.slice(fuente.lastIndexOf('<div', indice), finDeEtiqueta(fuente, indice));
        const contenedor = fuente.indexOf('<div', finDeEtiqueta(fuente, indice));
        const ventana = fuente.slice(contenedor, contenedor + 1200);
        const cubierta = capa.includes('propsDialogo') || ventana.includes('propsDialogo');
        if (!cubierta) pendientes.push(`${relativa}:${linea}`);
        indice = fuente.indexOf('className="fixed inset-0', indice + 10);
      }
    }

    expect(total).toBe(104);
    expect(pendientes.sort()).toEqual([
      'components/DetalleSolicitudDocModal.tsx:920',
      'components/PublicPropertyGallery.tsx:150',
      'components/feedback/DialogoConfirmacion.tsx:46',
      'components/modals/DetalleIncidenciaModal.tsx:2099',
      'components/modals/InspeccionFotograficaModal.tsx:601',
      'components/sections/ProfesionalPortalSection.tsx:1088',
    ]);
  });
});
