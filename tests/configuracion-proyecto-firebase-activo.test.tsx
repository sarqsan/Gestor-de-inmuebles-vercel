// @vitest-environment jsdom
/**
 * Pantalla de Configuración — «ID del proyecto Firebase activo».
 * ---------------------------------------------------------------------------
 * La etiqueta estaba escrita a mano (`startup-sanctuary-sln7n`) y NO coincidía con el
 * proyecto al que habla la aplicación (`firebase-applet-config.json`). Quien lee esa
 * pantalla decide dónde publicar `firestore.rules`: si miente, las reglas van a otro
 * proyecto y la aplicación sigue con las que tuviera publicadas allí (diagnóstico
 * «Lectura · Carteras»). Ahora sale de la MISMA configuración que inicializa el SDK.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/components/sections/ImportExportPanel', () => ({ ImportExportPanel: () => null }));

import { ConfiguracionSection } from '../src/components/sections/ConfiguracionSection';

const RAIZ = resolve(__dirname, '..');
const CONFIG = JSON.parse(readFileSync(resolve(RAIZ, 'firebase-applet-config.json'), 'utf8'));

describe('Configuración · proyecto Firebase activo', () => {
  it('muestra el projectId REAL de la configuración de la aplicación', () => {
    render(
      <ConfiguracionSection
        userProfile={{ nombre: 'Admin', email: 'admin@test.local' } as any}
        onUpdateProfile={() => {}}
      />
    );
    expect(screen.getByTestId('proyecto-firebase-activo').textContent).toBe(CONFIG.projectId);
  });

  it('el código fuente ya no lleva el identificador de proyecto escrito a mano', () => {
    const fuente = readFileSync(resolve(RAIZ, 'src/components/sections/ConfiguracionSection.tsx'), 'utf8');
    expect(fuente).not.toContain('startup-sanctuary-sln7n');
    expect(fuente).toContain('{FIREBASE_PROYECTO_ID}');
  });
});
