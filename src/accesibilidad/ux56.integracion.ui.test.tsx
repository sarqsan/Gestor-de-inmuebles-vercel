/**
 * BLOQUE 10 · UX-5 + UX-6 — INTEGRACIÓN SOBRE COMPONENTES REALES Y GUARDAS DE ÁRBOL.
 *
 * Tres bloques:
 *  1. `GastoModal` (modal de formulario real): se anuncia como diálogo, el foco entra,
 *     `Escape` cierra y, al fallar la validación, el foco va al campo con error que está
 *     asociado a su mensaje (`aria-describedby`).
 *  2. `MobileNav` (menú móvil real, UX-1 intacto): `Escape` cierra el desplegable y
 *     devuelve el foco al botón que lo abrió; al abrirse el foco entra en el menú.
 *  3. Guardas sobre el árbol real: ninguna tabla sin scroll horizontal controlado,
 *     ningún botón sólo-icono sin nombre accesible y ningún hook de diálogo después de
 *     un `return null` condicional (reglas de hooks).
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../lib/firebase', () => ({
  uploadFacturaGasto: vi.fn(),
  deleteFacturaGastoStorage: vi.fn(async () => undefined),
}));

import type { Gasto, Inmueble, UsuarioApp } from '../types';
import { GastoModal } from '../components/modals/GastoModal';
import { MobileNav } from '../components/MobileNav';

afterEach(() => cleanup());

const INMUEBLE = { id: 'inm-1', direccion: 'Calle ficticia 1', ciudad: 'Alicante' } as Inmueble;
const USUARIO = { id: 'u-1', nombre: 'Gestora ficticia', tipoPerfil: 'ADMINISTRADOR' } as UsuarioApp;

const RAIZ_SRC = resolve(__dirname, '..');

/** Ficheros `.tsx` de producción (sin tests). */
function ficherosFuente(directorio: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(directorio)) {
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...ficherosFuente(ruta));
    else if (entrada.endsWith('.tsx') && !entrada.includes('.test.')) salida.push(ruta);
  }
  return salida;
}

/** Devuelve el interior de cada `<button>…</button>` del fichero. */
function botones(fuente: string): { etiqueta: string; interior: string }[] {
  const salida: { etiqueta: string; interior: string }[] = [];
  let indice = fuente.indexOf('<button');
  while (indice !== -1) {
    let i = indice + 7;
    while (i < fuente.length && fuente[i] !== '>') i += 1;
    const etiqueta = fuente.slice(indice, i + 1);
    const cierre = fuente.indexOf('</button>', i);
    salida.push({ etiqueta, interior: fuente.slice(i + 1, cierre === -1 ? fuente.length : cierre) });
    indice = fuente.indexOf('<button', i);
  }
  return salida;
}

describe('UX-5 + UX-6 · modal de formulario real (GastoModal)', () => {
  const renderModal = (onClose: () => void = () => undefined) =>
    render(<GastoModal inmuebles={[INMUEBLE]} currentUser={USUARIO} onSave={vi.fn()} onClose={onClose} />);

  it('se anuncia como diálogo con su nombre y el foco entra dentro', () => {
    renderModal();
    const dialogo = screen.getByRole('dialog', { name: 'Nuevo gasto' });
    expect(dialogo.getAttribute('aria-modal')).toBe('true');
    expect(dialogo.contains(document.activeElement)).toBe(true);
  });

  it('Escape cancela el gasto con la misma acción de cierre', () => {
    const onClose = vi.fn();
    renderModal(onClose);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('al fallar la validación, el foco va al campo con error y éste está asociado a su mensaje', () => {
    renderModal();

    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /registrar gasto/i }));

    const error = screen.getByTestId('error-campo');
    const campo = screen.getByPlaceholderText('0,00');
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.getAttribute('aria-describedby')).toBe(error.id);
    expect(error.textContent).toContain('Importe total');
    expect(document.activeElement).toBe(campo);
  });
});

describe('UX-6 · menú móvil real (MobileNav, UX-1 intacto)', () => {
  const renderNav = () =>
    render(<MobileNav activeSection="inmuebles" onSelectSection={() => undefined} candidatos={[]} currentUser={USUARIO} />);

  it('al abrirse, el foco entra en el menú y el desplegable queda anunciado', () => {
    const r = renderNav();
    const disparador = r.container.querySelector('button') as HTMLButtonElement;

    fireEvent.click(disparador);

    const panel = r.container.querySelector('nav[aria-label="Navegación del ERP"]') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(disparador.getAttribute('aria-expanded')).toBe('true');
    expect(disparador.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it('Escape cierra el menú y devuelve el foco al disparador', () => {
    const r = renderNav();
    const disparador = r.container.querySelector('button') as HTMLButtonElement;
    fireEvent.click(disparador);
    expect(r.container.querySelector('nav[aria-label="Navegación del ERP"]')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(r.container.querySelector('nav[aria-label="Navegación del ERP"]')).toBeNull();
    expect(disparador.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(disparador);
  });

  it('el menú móvil mantiene los destinos de la fuente única de navegación', () => {
    const r = renderNav();
    fireEvent.click(r.container.querySelector('button') as HTMLButtonElement);
    expect(r.container.querySelectorAll('[data-tour^="nav-"]').length).toBeGreaterThan(0);
  });
});

describe('UX-5 · guardas del árbol (responsive y accesibilidad)', () => {
  const ficheros = ficherosFuente(RAIZ_SRC);

  it('ninguna tabla del ERP queda sin contenedor de scroll horizontal', () => {
    const sinScroll: string[] = [];
    for (const fichero of ficheros) {
      const fuente = readFileSync(fichero, 'utf8');
      let indice = fuente.indexOf('<table');
      while (indice !== -1) {
        const antes = fuente.slice(Math.max(0, indice - 600), indice);
        if (!antes.includes('overflow-x-auto') && !antes.includes('scroll-x-controlado')) {
          sinScroll.push(`${fichero}:${fuente.slice(0, indice).split('\n').length}`);
        }
        indice = fuente.indexOf('<table', indice + 1);
      }
    }
    expect(sinScroll).toEqual([]);
  });

  it('ningún botón sólo-icono queda sin nombre accesible', () => {
    const sinNombre: string[] = [];
    for (const fichero of ficheros) {
      const fuente = readFileSync(fichero, 'utf8');
      for (const { etiqueta, interior } of botones(fuente)) {
        const limpio = interior.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/<[^>]*>/g, '').replace(/\s+/g, '');
        if (limpio || interior.includes('{')) continue;          // tiene texto o expresión
        if (etiqueta.includes('aria-label') || etiqueta.includes('aria-labelledby') || etiqueta.includes('title=')) continue;
        sinNombre.push(fichero);
      }
    }
    expect(sinNombre).toEqual([]);
  });

  it('los diálogos accesibles no colocan su hook después de un return null condicional', () => {
    const violaciones: string[] = [];
    for (const fichero of ficheros) {
      const fuente = readFileSync(fichero, 'utf8');
      const hook = fuente.indexOf('useDialogoAccesible(');
      if (hook === -1) continue;
      // Sólo cuenta un `return null` del CUERPO del componente (sangría exacta de dos
      // espacios): los que están dentro de callbacks (más indentados) no afectan a las
      // reglas de hooks.
      const antes = fuente.slice(0, hook);
      if (/\n  if \(![\w.]+\) return null;\n/.test(antes)) violaciones.push(fichero);
    }
    expect(violaciones).toEqual([]);
  });

  it('ningún contenedor pasa una función que devuelve otra función (la acción no se ejecutaría)', () => {
    // Guarda real: `propsInteraccion(() => () => accion())` devolvería una función sin
    // ejecutarla, así que con Enter/Espacio no pasaría nada.
    const malFormados = ficheros.filter((fichero) =>
      readFileSync(fichero, 'utf8').includes('propsInteraccion(() => () =>')
    );
    expect(malFormados).toEqual([]);
  });

  it('el CSS móvil mantiene el 16px de los campos (auto-zoom) y el scroll horizontal contenido', () => {
    const css = readFileSync(resolve(RAIZ_SRC, 'index.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 640px\)/);
    expect(css).toMatch(/font-size: 16px/);
    expect(css).toContain('.scroll-x-controlado');
    expect(css).toContain('overscroll-behavior-x: contain');
  });
});
