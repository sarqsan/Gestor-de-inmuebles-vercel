/**
 * Guardia de la verificación de producción.
 *
 * El 28-10-2026 el run `40756373910` (merge de H-06, `8a1e84b`) se declaró verde
 * contra producción habiendo verificado en realidad el despliegue anterior
 * (`0622e5a`): cogía «el último despliegue en éxito» en el instante de arrancar,
 * y Vercel todavía no había construido el commit nuevo. La evidencia parecía
 * buena y hablaba de otro código, que es la peor clase de verde.
 *
 * Estas pruebas fijan las dos propiedades que impiden repetirlo sin que nadie lo
 * note: el workflow selecciona el despliegue por `sha` del run y, si acaba
 * verificando otro commit, lo dice en voz alta.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const WORKFLOW = readFileSync('.github/workflows/verificacion-produccion.yml', 'utf8');
const SCRIPT = readFileSync('scripts/verificar-produccion.mjs', 'utf8');

describe('verificación de producción · el workflow verifica SU commit', () => {
  it('selecciona el despliegue por el sha del run, no por «el último»', () => {
    expect(WORKFLOW).toContain('select(.sha == env.SHA)');
    expect(WORKFLOW).toContain('SHA: ${{ github.sha }}');
  });

  it('espera al despliegue en lugar de rendirse al primer intento', () => {
    expect(WORKFLOW).toMatch(/for intento in \$\(seq 1 \d+\)/);
    expect(WORKFLOW).toMatch(/sleep 15/);
    // La espera no puede agotar el job: 24 × 15 s = 6 min, con 20 de margen.
    const minutos = Number((WORKFLOW.match(/timeout-minutes: (\d+)/) || [])[1]);
    expect(minutos).toBeGreaterThanOrEqual(15);
  });

  it('avisa cuando el commit verificado no es el del run', () => {
    expect(WORKFLOW).toContain('::warning title=Sin despliegue de este commit');
    expect(WORKFLOW).toContain('**Commit verificado:**');
    expect(WORKFLOW).toContain('no** es el commit de este run');
  });

  it('deja constancia del sha en la salida del paso', () => {
    expect(WORKFLOW).toContain('sha_verificado=');
  });

  it('solo escribe en las tres sondas que DEBEN ser rechazadas', () => {
    // El script hace tres POST a propósito: son sondas de rechazo (410, 401,
    // 413). Ninguna puede crear ni modificar nada. Cualquier otro verbo sí
    // sería una escritura y no debe existir.
    const rutas = [...SCRIPT.matchAll(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/g)].map((m) => m[1]);
    expect(rutas).toEqual(['POST', 'POST', 'POST']);
    // Y los tres destinos son rutas de sondeo, no de negocio con efecto.
    const destinos = [...SCRIPT.matchAll(/\$\{raiz\}(\/api\/[a-z\/]+)/g)].map((m) => m[1]).sort();
    expect(destinos).toEqual([
      '/api/actas/otp/entregar',
      '/api/actas/otp/solicitar',
      '/api/health',
      '/api/solicitud',
    ]);
    // El único token que usa el workflow es el del propio GitHub para leer la API.
    expect(WORKFLOW).toContain('secrets.GITHUB_TOKEN');
    expect(WORKFLOW).not.toMatch(/secrets\.(?!GITHUB_TOKEN)\w+/);
  });
});
