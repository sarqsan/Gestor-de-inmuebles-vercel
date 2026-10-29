/**
 * Guardia del registro de pendientes.
 *
 * El 28-10-2026 el usuario aplazó su parte («lo hago mañana con el ordenador»).
 * El riesgo de un aplazamiento no es olvidarlo: es que **alguien lo dé por hecho**
 * — un documento que dice «índices confirmados» sin haberlos mirado, o un cierre
 * que se apoya en un pendiente que sigue abierto.
 *
 * Esta prueba fija cuatro cosas:
 *  1. la lista de pendientes es única y numerada (no hay dos registros paralelos);
 *  2. cada fila tiene un estado válido y el ID no se repite;
 *  3. los documentos enlazados existen de verdad (un «cómo» roto es un pendiente
 *     perdido);
 *  4. el documento del usuario y el registro se apuntan mutuamente, y las cifras
 *     de las reglas que se citan son las del fichero real.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const REGISTRO = 'docs/PENDIENTES-ABIERTOS.md';
const DOC_USUARIO = 'docs/PENDIENTE-USUARIO-2026-10-28.md';

type Fila = { id: string; que: string; deQuien: string; estado: string; doc: string };

/** Filas del registro: `| **P-01** | qué | quién | estado | desde | doc |`. */
function filas(): Fila[] {
  const texto = readFileSync(REGISTRO, 'utf8');
  const salida: Fila[] = [];
  for (const linea of texto.split('\n')) {
    const m = linea.match(/^\|\s*\*\*(P-\d{2})\*\*\s*\|(.+)\|\s*$/);
    if (!m) continue;
    const celdas = m[2].split('|').map((c) => c.trim());
    salida.push({
      id: m[1],
      que: celdas[0] || '',
      deQuien: celdas[1] || '',
      estado: celdas[2] || '',
      doc: celdas[4] || '',
    });
  }
  return salida;
}

const ESTADOS = ['PENDIENTE', 'EN CURSO', 'BLOQUEADO', 'HECHO'];

describe('pendientes · un solo registro, sin estados inventados', () => {
  it('el registro existe y está enlazado desde la documentación de continuidad', () => {
    expect(existsSync(REGISTRO)).toBe(true);
    const continuidad = readFileSync('docs/CONTINUIDAD-ARENA.md', 'utf8');
    expect(continuidad).toContain('PENDIENTES-ABIERTOS.md');
  });

  it('hay filas y cada una tiene estado de la lista cerrada', () => {
    const f = filas();
    expect(f.length).toBeGreaterThanOrEqual(7);
    for (const fila of f) {
      expect(ESTADOS.some((e) => fila.estado.includes(e))).toBe(true);
    }
  });

  it('no hay IDs repetidos ni huecos en la numeración', () => {
    const ids = filas().map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const numeros = ids.map((id) => Number(id.slice(2))).sort((a, b) => a - b);
    for (let i = 0; i < numeros.length; i += 1) expect(numeros[i]).toBe(i + 1);
  });

  it('cada fila dice de quién es (usuario o agente), nunca queda sin dueño', () => {
    for (const fila of filas()) {
      expect(fila.deQuien).toMatch(/usuario|agente/i);
    }
  });

  it('los documentos enlazados existen: un «cómo» roto es un pendiente perdido', () => {
    const faltan = filas()
      .flatMap((f) => [...f.doc.matchAll(/`([^`]+\.md)`/g)].map((m) => m[1]))
      .filter((ruta) => !existsSync(ruta));
    expect(faltan).toEqual([]);
  });

  it('el registro y el documento del usuario se apuntan mutuamente', () => {
    const registro = readFileSync(REGISTRO, 'utf8');
    const doc = readFileSync(DOC_USUARIO, 'utf8');
    expect(registro).toContain('PENDIENTE-USUARIO-2026-10-28.md');
    expect(doc).toContain('PENDIENTES-ABIERTOS.md');
    expect(doc).toContain('P-01');
  });
});

describe('pendientes · P-01 cerrado con evidencia, no por inercia', () => {
  const fila = () => filas().find((f) => f.id === 'P-01')!;
  const CIERRE = 'docs/P-01-CIERRE-CONSOLA-2026-10-29.md';

  it('está en HECHO y dice de quién era', () => {
    expect(fila().deQuien).toMatch(/usuario/i);
    expect(fila().estado).toContain('HECHO');
  });

  it('el cierre lleva fecha y enlace a la evidencia', () => {
    expect(fila().estado).toContain('2026-10-29');
    const registro = readFileSync(REGISTRO, 'utf8');
    expect(registro).toContain(CIERRE);
    expect(existsSync(CIERRE)).toBe(true);
  });

  it('la evidencia registra lo que se vio, no lo que se esperaba', () => {
    const cierre = readFileSync(CIERRE, 'utf8');
    // Los 10 índices, uno por uno, y el estado real de la consola.
    for (const coleccion of ['actas', 'actas_evidencias', 'actas_incidencias', 'actas_otp', 'gestiones_cartera', 'ia_operaciones']) {
      expect(cierre).toContain(coleccion);
    }
    expect(cierre.match(/Habilitado/g)?.length).toBeGreaterThanOrEqual(10);
    expect(cierre).toContain('4064');
    // Y el límite de la evidencia, explícito: no se comparó byte a byte.
    expect(cierre).toMatch(/no he comparado\s+byte a byte|\*\*no he comparado/i);
  });

  it('el documento del usuario ya no se presenta como pendiente', () => {
    const doc = readFileSync(DOC_USUARIO, 'utf8');
    expect(doc).not.toContain('PENDIENTE — no iniciado');
    expect(doc).toContain('CERRADO el 2026-10-29');
    expect(doc).toContain(CIERRE);
  });

  it('conserva el porqué de los tropiezos, para no repetirlos', () => {
    const doc = readFileSync(DOC_USUARIO, 'utf8');
    expect(doc).toMatch(/ordenador/i); // se aplazó por eso
    expect(doc).toContain('Por qué no vale el móvil');
    expect(doc).toContain('Por qué buscar con Ctrl+F dentro de la consola engaña');
    expect(doc).toContain('Ruta sin teclado: capturas de pantalla');
  });
});

describe('pendientes · las cifras de las reglas citadas son las reales', () => {
  it('firestore.rules mide las 4 064 líneas y tiene el sha256 que se cita', () => {
    const contenido = readFileSync('firestore.rules', 'utf8');
    const lineas = contenido.replace(/\n$/, '').split('\n').length;
    const sha = createHash('sha256').update(contenido).digest('hex');

    expect(lineas).toBe(4064);
    expect(sha.startsWith('81b9ae93')).toBe(true);

    // Y los documentos que el usuario va a mirar dicen lo mismo: el sha, las
    // líneas y la misma cifra. Si las reglas cambian, estas tres citas mienten
    // y el usuario comprobaría "4 064" en una consola que ya no cuadra.
    for (const doc of [REGISTRO, DOC_USUARIO, 'docs/PUBLICACION-REGLAS-INDICES-PRODUCCION.md']) {
      const texto = readFileSync(doc, 'utf8');
      // Sin espacios: los documentos usan el separador de millares tipográfico.
      const compacto = texto.replace(/\s/g, '');
      expect(compacto).toContain(String(lineas));
      expect(texto).toContain(sha.slice(0, 8));
    }
  });
});

describe('pendientes · los marcadores que se le piden al usuario existen de verdad', () => {
  // El 2026-10-29 la guía pedía buscar dos textos dentro del editor de la consola
  // y el usuario no los encontró con el recuento de líneas correcto. La causa era
  // el editor (solo dibuja las líneas visibles), pero el episodio deja una lección:
  // **una instrucción de verificación también se prueba**. Si el marcador no está
  // en el fichero, el usuario busca en vano y acaba creyendo que lo publicado está
  // mal. Aquí se fija cada marcador que la guía manda buscar.
  const REGLAS = readFileSync('firestore.rules', 'utf8');
  const DOC = readFileSync(DOC_USUARIO, 'utf8');

  it('las tres cadenas ASCII de §2.4.2 existen en firestore.rules', () => {
    for (const marcador of ['rules_version = \'2\';', 'actas_otp', 'DENEGACIÓN GLOBAL POR DEFECTO']) {
      expect(REGLAS).toContain(marcador);
      expect(DOC).toContain(marcador);
    }
  });

  it('la guía desaconseja buscar con Ctrl+F dentro de la consola y explica por qué', () => {
    expect(DOC).toContain('Por qué buscar con Ctrl+F dentro de la consola engaña');
    expect(DOC).toMatch(/solo tiene dibujadas|solo dibuja/i);
  });

  it('el final de fichero que se le pide comparar es el final real', () => {
    const real = REGLAS.replace(/\n$/, '').split('\n').slice(-6).map((l) => l.trim()).join('\n');
    // Las seis últimas líneas reales, normalizadas: cierre del match global.
    expect(real).toContain('match /{document=**} {');
    expect(real).toContain('allow read, write: if false;');
    const bloque = DOC.slice(DOC.indexOf('las **últimas líneas**'));
    expect(bloque).toContain('match /{document=**} {');
    expect(bloque).toContain('allow read, write: if false;');
  });

  it('el marcador `actas_otp` sigue siendo único: si deja de serlo, la guía miente', () => {
    const apariciones = REGLAS.split('\n').filter((l) => l.includes('actas_otp')).length;
    expect(apariciones).toBe(1);
    expect(DOC).toContain('**1 vez**');
  });
});

describe('pendientes · la guía no exige herramientas que el usuario no tiene', () => {
  // 2026-10-29: el usuario dijo «yo no sé hacer eso con el ordenador» a una guía
  // que pedía pegar en el Bloc de notas y abrir una terminal. Una instrucción que
  // el usuario no puede ejecutar no es una instrucción: es una pared. La ruta
  // principal tiene que ser clic + captura de pantalla, y las que exigen teclado
  // tienen que estar marcadas como opcionales.
  const DOC = readFileSync(DOC_USUARIO, 'utf8');

  it('existe una ruta sin teclado basada en capturas de pantalla', () => {
    expect(DOC).toContain('Ruta sin teclado: capturas de pantalla');
    expect(DOC).toContain('Impr Pant');
    expect(DOC).toMatch(/Ctrl \+ Fin|Ctrl \+ Fin`/);
  });

  it('las rutas con teclado están marcadas como opcionales, no como el camino', () => {
    const conTerminal = DOC.indexOf('Comprobación definitiva');
    const conEditor = DOC.indexOf('Comparación de marcadores');
    expect(conEditor).toBeGreaterThan(0);
    expect(conTerminal).toBeGreaterThan(0);
    // Ambas llevan «opcional» en su título.
    const tituloEditor = DOC.slice(DOC.lastIndexOf('###', conEditor), conEditor);
    const tituloTerminal = DOC.slice(DOC.lastIndexOf('###', conTerminal), conTerminal);
    expect(tituloEditor).toContain('opcional');
    expect(tituloTerminal).toContain('opcional');
  });

  it('dice qué demuestra cada captura, para que la conclusión no dependa del usuario', () => {
    expect(DOC).toContain('Qué demuestra');
    expect(DOC).toMatch(/Con \*\*A\*\* y \*\*B\*\*|Con \*\*A\*\* y \*\*B\*\*/);
  });
});
