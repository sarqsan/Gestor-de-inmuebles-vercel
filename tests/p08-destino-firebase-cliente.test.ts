/**
 * DESTINO ÚNICO DEL CLIENTE — la aplicación no puede hablar con otro proyecto.
 *
 * Decisión del titular (2026-10-29): **no hay ni habrá entorno de pruebas**. Las
 * variables `VITE_ENTORNO_FIREBASE` / `VITE_FIREBASE_*` se retiraron. Estas
 * pruebas fijan las dos mitades del contrato:
 *
 *  1. el único destino admitido es el proyecto real;
 *  2. si alguien intenta apuntar a otro sitio, la aplicación **no arranca**.
 *
 * Lo segundo es lo que convierte «no hay staging» en una garantía y no en una
 * intención escrita en un documento.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROYECTO_CLIENTE_PRODUCCION,
  DESTINO_FIREBASE,
  destinoFirebaseRequerido,
  esBaseDatosConNombre,
  resolverDestinoClienteFirebase,
  verificarAppPrecedente,
} from '../src/lib/destinoFirebase';

const RAIZ = resolve(__dirname, '..');
const leer = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');
const CONFIG_REAL = JSON.parse(leer('firebase-applet-config.json'));

/** Solo el código: los comentarios cuentan la historia y pueden nombrar lo retirado. */
const sinComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Todos los ficheros de código de `src/` (rutas relativas a la raíz). */
function ficherosFuente(dir = 'src'): string[] {
  return readdirSync(resolve(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return ficherosFuente(rel);
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
  });
}

describe('destino único · el proyecto real y nada más', () => {
  it('el destino resuelto es el proyecto real, con base con nombre', () => {
    expect(DESTINO_FIREBASE.estado).toBe('OK');
    if (DESTINO_FIREBASE.estado !== 'OK') return;
    expect(DESTINO_FIREBASE.config.projectId).toBe(PROYECTO_CLIENTE_PRODUCCION);
    expect(DESTINO_FIREBASE.config.firestoreDatabaseId).toBe(CONFIG_REAL.firestoreDatabaseId);
    expect(esBaseDatosConNombre(DESTINO_FIREBASE.config.firestoreDatabaseId)).toBe(true);
  });

  it('un fichero de configuración que apunta a OTRO proyecto no arranca', () => {
    const resultado = resolverDestinoClienteFirebase({
      ...CONFIG_REAL,
      projectId: 'gestor-inmuebles-staging',
    });
    expect(resultado.estado).toBe('ERROR');
    if (resultado.estado !== 'ERROR') return;
    expect(resultado.codigo).toBe('DESTINO_PROYECTO_INCOMPATIBLE');
    expect(() => destinoFirebaseRequerido(resultado)).toThrow(/DESTINO_PROYECTO_INCOMPATIBLE/);
  });

  it('cualquier otro proyecto se rechaza igual: no hay segundo destino privilegiado', () => {
    for (const projectId of ['mi-proyecto', 'gestor-inmuebles', 'GESTOR-INMUEBLES-PRODUCCION', '']) {
      const resultado = resolverDestinoClienteFirebase({ ...CONFIG_REAL, projectId });
      expect(resultado.estado, projectId || '(vacío)').toBe('ERROR');
    }
  });

  it('sin `projectId` o sin base con nombre, tampoco arranca', () => {
    const sinProyecto = resolverDestinoClienteFirebase({ ...CONFIG_REAL, projectId: '' });
    expect(sinProyecto.estado === 'ERROR' && sinProyecto.codigo).toBe('DESTINO_JSON_INVALIDO');

    const sinBase = resolverDestinoClienteFirebase({ ...CONFIG_REAL, firestoreDatabaseId: '' });
    expect(sinBase.estado === 'ERROR' && sinBase.codigo).toBe('FIREBASE_BASE_DATOS_AUSENTE');
  });

  it('las variables de entorno retiradas no influyen en nada', () => {
    // Antes bastaba con declarar `VITE_ENTORNO_FIREBASE=staging` para cambiar de
    // destino. Ahora la función ni siquiera recibe variables: no puede leerlas.
    expect(resolverDestinoClienteFirebase.length).toBeLessThanOrEqual(1);
    const codigo = sinComentarios(leer('src/lib/destinoFirebase.ts'));
    expect(codigo).not.toContain('VITE_ENTORNO_FIREBASE');
    expect(codigo).not.toContain('VITE_FIREBASE_');
    expect(codigo).not.toContain('import.meta.env');
  });
});

describe('destino único · punto único de resolución y arranque', () => {
  it('solo el resolvedor importa el JSON versionado; el único resto está congelado por custodia', () => {
    const importadores = ficherosFuente().filter((f) => /from '[^']*firebase-applet-config\.json'/.test(leer(f)));
    expect(importadores).toEqual(['src/lib/destinoFirebase.ts', 'src/lib/googleAuth.ts']);
    // `googleAuth.ts` no se puede tocar: la guardia de custodia
    // (`integration-boundaries.test.mjs`) lo exige byte a byte igual a `main`.
    expect(leer('src/features/operaciones/tests/integration-boundaries.test.mjs')).toContain("'src/lib/googleAuth.ts'");
  });

  it('un módulo que arrancase primero con el proyecto equivocado NO se reutiliza: se lanza', () => {
    const config = destinoFirebaseRequerido();
    const enOtroProyecto = { name: '[DEFAULT]', options: { projectId: 'otro-proyecto' } };
    expect(() => verificarAppPrecedente([enOtroProyecto], config)).toThrow(/DESTINO_APP_PRECEDENTE_INCOMPATIBLE/);
    // Y el caso coherente no molesta a nadie.
    expect(() => verificarAppPrecedente([{ name: '[DEFAULT]', options: { projectId: config.projectId } }], config)).not.toThrow();
    expect(() => verificarAppPrecedente([], config)).not.toThrow();
    // Un doble del SDK sin `options` no puede decidirse: no se inventa un fallo.
    expect(() => verificarAppPrecedente([{}], config)).not.toThrow();

    // La guardia está de verdad en el arranque, no solo exportada.
    const arranque = leer('src/lib/firebase.ts');
    expect(arranque).toContain('verificarAppPrecedente(getApps(), configuracionFirebase)');
    expect(arranque.indexOf('verificarAppPrecedente(getApps()')).toBeLessThan(
      arranque.indexOf('initializeApp(configuracionFirebase)')
    );
  });

  it('los consumidores del cliente piden el destino al módulo único', () => {
    for (const f of ['src/lib/firebase.ts', 'src/lib/entornoFirebase.ts']) {
      expect(leer(f), f).toContain('destinoFirebase');
    }
    // `entornoFirebase.ts` no puede leer el JSON por su cuenta: si lo hiciera, la
    // pantalla podría decir una cosa distinta de la que usa el SDK.
    expect(leer('src/lib/entornoFirebase.ts')).not.toMatch(/firebase-applet-config\.json'/);
  });

  it('el resolvedor no guarda secretos: solo la configuración pública del cliente', () => {
    const fuente = leer('src/lib/destinoFirebase.ts');
    expect(fuente).not.toMatch(/private_key|client_email|service_account/i);
    expect(fuente).not.toMatch(/process\.env/);
  });

  it('esBaseDatosConNombre acepta bases con nombre y rechaza el resto', () => {
    expect(esBaseDatosConNombre('ai-studio-gestordeinmueble-c6444afd')).toBe(true);
    for (const malo of ['', '(default)', 'AI-Studio', 'ab', 'con espacio', null, 7]) {
      expect(esBaseDatosConNombre(malo), String(malo)).toBe(false);
    }
  });
});

describe('decisión del titular · no hay entorno de pruebas en el código', () => {
  it('no queda ninguna variable de entorno que seleccione destino', () => {
    // Se mira el CÓDIGO, no los comentarios: el histórico de la decisión sí puede
    // nombrar las variables retiradas (y debe, para que se entienda qué se quitó).
    const conVariables = ficherosFuente()
      .concat(['server/titularidades/configuracionFirebase.ts'])
      .filter((f) => /VITE_ENTORNO_FIREBASE|VITE_FIREBASE_|ENTORNO_DESPLIEGUE/.test(sinComentarios(leer(f))));
    expect(conVariables).toEqual([]);
  });

  it('el arranque del cliente no lee `import.meta.env`', () => {
    expect(leer('src/lib/firebase.ts')).not.toContain('import.meta.env');
    expect(leer('src/lib/destinoFirebase.ts')).not.toContain('import.meta.env');
  });

  it('el servidor solo admite el proyecto real', async () => {
    const { PROYECTOS_PERMITIDOS, PROYECTO_PRODUCCION, resolverDestinoFirebase } = await import(
      '../server/titularidades/configuracionFirebase'
    );
    expect(PROYECTOS_PERMITIDOS).toEqual([PROYECTO_PRODUCCION]);
    const destino = resolverDestinoFirebase({});
    expect(destino.proyectoId).toBe(PROYECTO_PRODUCCION);
    expect(destino.errorConfiguracion).toBeUndefined();
  });

  it('la pantalla de Configuración no anuncia ningún entorno alternativo', () => {
    const pantalla = leer('src/components/sections/ConfiguracionSection.tsx');
    expect(pantalla).not.toContain('STAGING');
    expect(pantalla).not.toContain('avisoEntornoDespliegue');
    expect(leer('src/lib/entornoFirebase.ts')).not.toContain('ES_DESTINO_STAGING');
  });
});
