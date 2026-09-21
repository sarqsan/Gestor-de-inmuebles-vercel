/**
 * CAPA TRANSVERSAL §6 — FASE 4 · Tests del asistente IA (motor): contrato, seguridad RBAC/host,
 * confirmaciones, adaptador IA (mock/mal formado/no disponible) y fallback local.
 * Sin llamadas a proveedores reales.
 */
import { describe, expect, it } from 'vitest';
import { PERMISOS_SISTEMA, ROLES_PREDEFINIDOS } from '../types';
import {
  CAPACIDADES_ERP,
  MODULO_POR_SECCION,
  PANTALLAS_PORTAL,
  RECORRIDO_INVITAR_INQUILINO,
  RECORRIDO_PORTAL_INQUILINO,
  TUTORIAL_LIQUIDACION,
  capacidadesDisponibles,
  confirmarResolucion,
  construirAIIntentRequest,
  construirPromptAsistente,
  contextoDesdeUsuario,
  crearProveedorGeminiRemoto,
  cuerpoDesdeRequest,
  ejecutarResolucion,
  elegirAlternativa,
  parsearRespuestaModelo,
  proveedorLocal,
  resolverPeticion,
  rutasNavegables,
  tipoDe,
  validarResolucionIA,
  type ProveedorIA,
  type PropuestaIA,
} from './index';

const rol = (id: string) => ROLES_PREDEFINIDOS.find((r) => r.id === id)!;
const admin = { tipoPerfil: 'ADMINISTRADOR' as const, roles: ['SUPERADMIN'], permisos: rol('SUPERADMIN').permisos };
const gestor = { tipoPerfil: 'ADMINISTRADOR' as const, roles: ['GESTOR_INMUEBLES'], permisos: rol('GESTOR_INMUEBLES').permisos };
const propietario = { tipoPerfil: 'PROPIETARIO' as const, roles: ['PROPIETARIO_ESTANDAR'], permisos: rol('PROPIETARIO_ESTANDAR').permisos };
const inquilino = { tipoPerfil: 'INQUILINO' as const, roles: ['INQUILINO_PORTAL'], permisos: rol('INQUILINO_PORTAL').permisos };

const ctxAdmin = contextoDesdeUsuario(admin, 'inicio');
const ctxGestor = contextoDesdeUsuario(gestor, 'inicio');
const ctxProp = contextoDesdeUsuario(propietario, 'inicio', { accessibleSections: ['inicio', 'propietarios', 'inmuebles', 'tesoreria', 'mis_contratos', 'ayuda'] });
const ctxPortal = contextoDesdeUsuario(inquilino, 'inicio', { host: 'PORTAL_INQUILINO', accessibleSections: [...PANTALLAS_PORTAL] });

const mock = (p: PropuestaIA | (() => Promise<PropuestaIA>)): ProveedorIA => ({ nombre: 'mock', interpretar: typeof p === 'function' ? p : async () => p });

describe('§6 F4 · catálogo y capacidades por RBAC/host/rol', () => {
  it('catálogo coherente: ids únicos, permisos reales, tipos válidos; el portal solo tiene consulta/navegación', () => {
    const codigos = new Set(PERMISOS_SISTEMA.map((p) => p.codigo));
    expect(new Set(CAPACIDADES_ERP.map((c) => c.id)).size).toBe(CAPACIDADES_ERP.length);
    for (const c of CAPACIDADES_ERP) {
      if (c.requiredPermission) expect(codigos.has(c.requiredPermission)).toBe(true);
      expect(['CONSULTA', 'NAVEGACION', 'AYUDA', 'ESCRITURA']).toContain(tipoDe(c));
      if (c.host === 'PORTAL_INQUILINO') {
        expect(tipoDe(c)).not.toBe('ESCRITURA');
        expect(c.roles).toEqual(['INQUILINO']);
        expect(PANTALLAS_PORTAL).toContain(c.route);
      }
    }
  });

  it('admin ve todas las de ERP y ninguna del portal; inquilino en el portal solo las del portal; ERP nunca da portal y viceversa', () => {
    const a = capacidadesDisponibles(ctxAdmin).map((c) => c.id);
    expect(a).toContain('cap.tesoreria.pagar');
    expect(a.some((id) => id.startsWith('cap.portal.'))).toBe(false);
    const p = capacidadesDisponibles(ctxPortal).map((c) => c.id);
    expect(p.length).toBeGreaterThan(0);
    expect(p.every((id) => id.startsWith('cap.portal.') || id.startsWith('cap.ayuda.') || id === 'cap.navegacion.ir')).toBe(true);
    expect(p).not.toContain('cap.ayuda.consultar'); // el Centro de Ayuda es del ERP
    expect(p).not.toContain('cap.tesoreria.consultar');
    // Inquilino en el ERP (host por defecto): nada del portal ni de gestión
    const iErp = capacidadesDisponibles(contextoDesdeUsuario(inquilino, 'inicio')).map((c) => c.id);
    expect(iErp.some((id) => id.startsWith('cap.portal.'))).toBe(false);
    expect(iErp).not.toContain('cap.tesoreria.consultar');
    // Admin en host portal: no es INQUILINO → sin capacidades de portal
    expect(capacidadesDisponibles(contextoDesdeUsuario(admin, 'inicio', { host: 'PORTAL_INQUILINO' })).some((c) => c.id.startsWith('cap.portal.'))).toBe(false);
    // Gestor: sin tesorería ni morosidad (rol ADMINISTRADOR pero sin permiso de tesorería; morosidad requiere contratos.ver)
    const g = capacidadesDisponibles(ctxGestor).map((c) => c.id);
    expect(g).not.toContain('cap.tesoreria.consultar');
    expect(g).toContain('cap.inquilinos.invitar');
  });

  it('la petición IA nunca incluye códigos de permiso y solo lista rutas navegables del host', () => {
    const req = construirAIIntentRequest('hola', ctxProp);
    expect(req.capabilities.every((c) => c.requiredPermission === undefined)).toBe(true);
    expect(JSON.stringify(req.capabilities)).not.toMatch(/tesoreria\.ver|inmuebles\.ver/);
    expect([...req.routes].sort()).toEqual(['ayuda', 'inicio', 'inmuebles', 'mis_contratos', 'propietarios', 'tesoreria']); // exactamente el route guard del host
    expect(rutasNavegables(ctxPortal)).toEqual([...PANTALLAS_PORTAL]);
    // Perfil ADMINISTRADOR (gestor): el host no restringe secciones → navegable; el contenido lo protege el módulo. Un no-admin sin lista del host: solo rutas de sus capacidades.
    expect(rutasNavegables(ctxGestor)).toContain('tesoreria');
    const sinLista = rutasNavegables(contextoDesdeUsuario(propietario, 'inicio'));
    expect(sinLista).not.toContain('morosidad');
    expect(sinLista).not.toContain('administracion');
    expect(sinLista).toEqual(expect.arrayContaining(['inicio', 'inmuebles', 'formalizacion', 'ayuda']));
    expect(sinLista).not.toContain('tesoreria'); // el propietario estándar no tiene tesoreria.ver: sin lista del host, no se asume
    expect(sinLista.every((r) => r in MODULO_POR_SECCION)).toBe(true);
    expect(rutasNavegables(ctxAdmin)).toContain('morosidad');
    expect(construirAIIntentRequest('x'.repeat(900), ctxAdmin).input).toHaveLength(500);
  });
});

describe('§6 F4 · contrato: estados deterministas', () => {
  it('petición válida (navegación) → RESUELTA sin confirmación; ejecución = NAVEGAR', async () => {
    const r = await resolverPeticion('ir a tesorería', ctxAdmin);
    expect(r.estado).toBe('RESUELTA');
    expect(r.capabilityId).toBe('cap.tesoreria.consultar');
    expect(r.requiereConfirmacion).toBe(false);
    expect(r.origen).toBe('LOCAL');
    expect(ejecutarResolucion(r, ctxAdmin)).toEqual({ tipo: 'NAVEGAR', route: 'tesoreria', capabilityId: 'cap.tesoreria.consultar' });
  });

  it('petición de explicación → RESUELTA con helpEntry visible; tutorial → RESUELTA con tutorialId disponible', async () => {
    const r = await resolverPeticion('¿qué es una liquidación?', ctxAdmin);
    expect(r.estado).toBe('RESUELTA');
    expect(r.intencion).toBe('EXPLICAR');
    expect(r.helpEntryId).toBe('ayuda.tesoreria.liquidaciones');
    expect(ejecutarResolucion(r, ctxAdmin).tipo).toBe('EXPLICAR');
    const t = await resolverPeticion('cómo hago para invitar a un inquilino', ctxAdmin);
    expect(t.estado).toBe('RESUELTA');
    expect(t.tutorialId).toBe(RECORRIDO_INVITAR_INQUILINO.id);
    expect(ejecutarResolucion(t, ctxAdmin)).toEqual({ tipo: 'TUTORIAL', tutorialId: RECORRIDO_INVITAR_INQUILINO.id, capabilityId: 'cap.ayuda.tutorial' });
  });

  it('petición ambigua → AMBIGUA con alternativas permitidas; elegir una → resolución concreta', async () => {
    const r = await resolverPeticion('lecturas y recibos', ctxAdmin);
    expect(r.estado).toBe('AMBIGUA');
    const ids = r.alternativas!.map((a) => a.capabilityId);
    expect(ids).toEqual(expect.arrayContaining(['cap.suministros.consultar', 'cap.cobros.consultar']));
    const e = elegirAlternativa(r, 'cap.cobros.consultar', ctxAdmin);
    expect(e.estado).toBe('RESUELTA');
    expect(e.route).toBe('cobros');
    expect(elegirAlternativa(r, 'cap.tesoreria.pagar', ctxAdmin).estado).toBe('ERROR'); // no estaba entre las alternativas
  });

  it('petición no soportada / vacía / demasiado larga → NO_SOPORTADA o ERROR, sin capacidad', async () => {
    expect((await resolverPeticion('xyzqwv plim', ctxAdmin)).estado).toBe('NO_SOPORTADA');
    expect((await resolverPeticion('   ', ctxAdmin)).estado).toBe('NO_SOPORTADA');
    const larga = await resolverPeticion('a'.repeat(501), ctxAdmin);
    expect(larga.estado).toBe('ERROR');
    expect(larga.errores).toEqual(['PETICION_DEMASIADO_LARGA']);
  });

  it('sin permiso → SIN_PERMISO sin exponer contenido; sin capacidad → SIN_CAPACIDAD', async () => {
    const r = await resolverPeticion('quiero ver la tesorería', ctxGestor);
    expect(r.estado).toBe('SIN_PERMISO');
    expect(r.capabilityId).toBeUndefined();
    expect(r.route).toBeUndefined();
    expect(ejecutarResolucion(r, ctxGestor).tipo).toBe('NINGUNA');
    const v = validarResolucionIA({ intencion: 'CONSULTAR', capabilityId: 'cap.inventada' }, ctxAdmin);
    expect(v.estado).toBe('SIN_CAPACIDAD');
    expect(v.errores[0]).toContain('CAPACIDAD_INEXISTENTE');
  });
});

describe('§6 F4 · seguridad: el validador manda aunque la IA se equivoque', () => {
  it('capacidad permitida → aceptada; no permitida → SIN_PERMISO; sin permisos en contexto → nada de gestión', () => {
    expect(validarResolucionIA({ intencion: 'CONSULTAR', capabilityId: 'cap.tesoreria.consultar' }, ctxAdmin).estado).toBe('RESUELTA');
    const g = validarResolucionIA({ intencion: 'CONSULTAR', capabilityId: 'cap.tesoreria.consultar', confianza: 0.99 }, ctxGestor);
    expect(g.estado).toBe('SIN_PERMISO');
    expect(g.errores).toEqual(['PERMISO_INSUFICIENTE']);
    const p = validarResolucionIA({ intencion: 'EJECUTAR', capabilityId: 'cap.tesoreria.pagar' }, ctxProp);
    expect(p.estado).toBe('SIN_PERMISO');
  });

  it('intento de ampliar permisos: parámetros extraños, rutas no accesibles, ayuda/tutorial no visibles → rechazados; el usuario no cambia', () => {
    const antes = JSON.stringify(propietario);
    const r1 = validarResolucionIA({ intencion: 'NAVEGAR', capabilityId: 'cap.navegacion.ir', parametros: { route: 'morosidad' } }, ctxProp);
    expect(r1.estado).toBe('ERROR');
    expect(r1.errores[0]).toContain('no está disponible');
    const r2 = validarResolucionIA({ intencion: 'NAVEGAR', capabilityId: 'cap.navegacion.ir', parametros: { route: 'inmuebles', permisos: ['tesoreria.pagar'], admin: true } }, ctxProp);
    expect(r2.estado).toBe('ERROR');
    expect(r2.errores).toEqual(expect.arrayContaining(['Parámetro no admitido: permisos', 'Parámetro no admitido: admin']));
    expect(validarResolucionIA({ intencion: 'EXPLICAR', helpEntryId: 'ayuda.morosidad.expedientes' }, ctxProp).estado).toBe('ERROR');
    expect(validarResolucionIA({ intencion: 'TUTORIAL', tutorialId: TUTORIAL_LIQUIDACION.id }, ctxProp).estado).toBe('ERROR');
    expect(validarResolucionIA({ intencion: 'TUTORIAL', tutorialId: RECORRIDO_PORTAL_INQUILINO.id }, ctxPortal).estado).toBe('RESUELTA');
    expect(JSON.stringify(propietario)).toBe(antes);
    expect(ctxProp.permissions).toEqual(rol('PROPIETARIO_ESTANDAR').permisos);
  });

  it('host ERP nunca obtiene capacidad del Portal; host Portal nunca obtiene capacidad del ERP (aunque la IA la proponga)', async () => {
    const a = validarResolucionIA({ intencion: 'NAVEGAR', capabilityId: 'cap.portal.recibos' }, ctxAdmin);
    expect(a.estado).toBe('SIN_PERMISO');
    expect(a.errores).toEqual(['HOST_DISTINTO']);
    for (const id of ['cap.tesoreria.consultar', 'cap.morosidad.consultar', 'cap.actas.consultar', 'cap.inmuebles.consultar', 'cap.inquilinos.invitar', 'cap.ayuda.consultar']) {
      const r = validarResolucionIA({ intencion: 'CONSULTAR', capabilityId: id, confianza: 1 }, ctxPortal);
      expect(r.estado).toBe('SIN_PERMISO');
      expect(ejecutarResolucion({ ...r, estado: 'RESUELTA', capabilityId: id }, ctxPortal).tipo).toBe('NINGUNA'); // ni forzando el estado
    }
    // Proveedor IA malicioso: propone tesorería al inquilino → validador la rechaza
    const r = await resolverPeticion('ver la tesorería', ctxPortal, { proveedor: mock({ intencion: 'CONSULTAR', capabilityId: 'cap.tesoreria.consultar', confianza: 1 }) });
    expect(r.estado).toBe('SIN_PERMISO');
    // Peticiones naturales del inquilino se quedan en el portal
    const rec = await resolverPeticion('quiero ver mis recibos', ctxPortal);
    expect(rec.estado).toBe('RESUELTA');
    expect(rec.capabilityId).toBe('cap.portal.recibos');
    expect(ejecutarResolucion(rec, ctxPortal).tipo).toBe('NAVEGAR');
    const mor = await resolverPeticion('expedientes de morosidad', ctxPortal);
    expect(['SIN_PERMISO', 'NO_SOPORTADA']).toContain(mor.estado);
    expect(mor.capabilityId).toBeUndefined();
  });

  it('una resolución manipulada (estado RESUELTA falsificado sobre capacidad no permitida) no se ejecuta', () => {
    const falsa = { ...validarResolucionIA({ intencion: 'CONSULTAR', capabilityId: 'cap.tesoreria.consultar' }, ctxAdmin) };
    expect(ejecutarResolucion(falsa, ctxGestor)).toEqual({ tipo: 'NINGUNA', motivo: 'CAPACIDAD_NO_PERMITIDA' });
    const ruta = { ...validarResolucionIA({ intencion: 'NAVEGAR', capabilityId: 'cap.navegacion.ir', parametros: { route: 'inmuebles' } }, ctxProp), route: 'morosidad' };
    expect(ejecutarResolucion(ruta, ctxProp)).toEqual({ tipo: 'NINGUNA', motivo: 'RUTA_INACCESIBLE' });
  });
});

describe('§6 F4 · confirmación explícita', () => {
  it('lectura y navegación no requieren confirmación; escritura y sensibles sí', async () => {
    expect((await resolverPeticion('ver contratos', ctxAdmin)).requiereConfirmacion).toBe(false);
    expect((await resolverPeticion('abre inmuebles', ctxAdmin)).requiereConfirmacion).toBe(false);
    const pago = await resolverPeticion('quiero registrar este pago', ctxAdmin);
    expect(pago.estado).toBe('REQUIERE_CONFIRMACION');
    expect(pago.capabilityId).toBe('cap.tesoreria.pagar');
    expect(pago.explicacion).toMatch(/Registrar pagos.*¿Quieres continuar\?/);
    const inv = await resolverPeticion('invitar inquilino', ctxAdmin);
    expect(inv.estado).toBe('REQUIERE_CONFIRMACION');
    const sepa = await resolverPeticion('preparar remesa sepa', ctxAdmin);
    expect(sepa.estado).toBe('REQUIERE_CONFIRMACION');
  });

  it('sin confirmación → no ejecución; confirmación explícita → ejecución (solo abrir la pantalla real); contexto degradado → no procede', async () => {
    const pago = await resolverPeticion('registrar pago', ctxAdmin);
    expect(ejecutarResolucion(pago, ctxAdmin)).toEqual({ tipo: 'NINGUNA', motivo: 'CONFIRMACION_PENDIENTE' });
    expect(ejecutarResolucion({ ...pago, estado: 'RESUELTA' }, ctxAdmin)).toEqual({ tipo: 'NINGUNA', motivo: 'CONFIRMACION_PENDIENTE' }); // forzar el estado no basta
    const ok = confirmarResolucion(pago, ctxAdmin);
    expect(ok.confirmada).toBe(true);
    expect(ejecutarResolucion(ok, ctxAdmin)).toEqual({ tipo: 'NAVEGAR', route: 'tesoreria', capabilityId: 'cap.tesoreria.pagar' });
    // Confirmar con un contexto que ya no tiene el permiso → SIN_PERMISO, sin ejecución
    const degradada = confirmarResolucion(pago, ctxGestor);
    expect(degradada.estado).toBe('SIN_PERMISO');
    expect(degradada.confirmada).toBeUndefined();
    expect(ejecutarResolucion(degradada, ctxGestor).tipo).toBe('NINGUNA');
    // Confirmar algo que no lo requiere → ERROR
    expect(confirmarResolucion(await resolverPeticion('ir a inmuebles', ctxAdmin), ctxAdmin).estado).toBe('ERROR');
  });
});

describe('§6 F4 · adaptador IA (mock) y fallback local', () => {
  it('respuesta IA válida → se usa (origen IA, confianza acotada)', async () => {
    const r = await resolverPeticion('llévame a los inmuebles', ctxAdmin, { proveedor: mock({ intencion: 'NAVEGAR', capabilityId: 'cap.inmuebles.consultar', confianza: 7, explicacion: 'Vamos a inmuebles.' }) });
    expect(r.estado).toBe('RESUELTA');
    expect(r.origen).toBe('IA');
    expect(r.proveedor).toBe('mock');
    expect(r.confianza).toBe(1);
    expect(r.explicacion).toBe('Vamos a inmuebles.');
  });

  it('respuesta mal formada, capacidad inexistente o parámetros inválidos → nunca se ejecuta; mal formada cae al local', async () => {
    const mal = await resolverPeticion('ir a tesorería', ctxAdmin, { proveedor: mock('no soy json' as unknown as PropuestaIA) });
    expect(mal.origen).toBe('LOCAL');
    expect(mal.estado).toBe('RESUELTA');
    expect(mal.avisos?.[0]).toMatch(/no era válida/);
    const inex = await resolverPeticion('haz magia', ctxAdmin, { proveedor: mock({ intencion: 'EJECUTAR', capabilityId: 'cap.magia' }) });
    expect(inex.estado).toBe('SIN_CAPACIDAD');
    expect(inex.origen).toBe('IA');
    const params = await resolverPeticion('ve a la luna', ctxAdmin, { proveedor: mock({ intencion: 'NAVEGAR', capabilityId: 'cap.navegacion.ir', parametros: { route: 'luna' } }) });
    expect(params.origen).toBe('LOCAL'); // ERROR del proveedor → fallback local
    expect(validarResolucionIA({ intencion: 'VOLAR', capabilityId: 'cap.inmuebles.consultar' }, ctxAdmin).estado).toBe('NO_SOPORTADA');
    expect(validarResolucionIA(null, ctxAdmin).estado).toBe('ERROR');
    expect(validarResolucionIA([1, 2], ctxAdmin).estado).toBe('ERROR');
  });

  it('proveedor no disponible (lanza) o lento (timeout) → fallback local con aviso; ambigüedad del proveedor se respeta solo con ids permitidos', async () => {
    const caido = await resolverPeticion('ir a tesorería', ctxAdmin, { proveedor: mock(async () => { throw new Error('ECONNREFUSED'); }) });
    expect(caido.estado).toBe('RESUELTA');
    expect(caido.origen).toBe('LOCAL');
    expect(caido.avisos?.[0]).toContain('ECONNREFUSED');
    const lento = await resolverPeticion('ir a tesorería', ctxAdmin, { proveedor: mock(() => new Promise(() => undefined)), timeoutMs: 20 });
    expect(lento.origen).toBe('LOCAL');
    expect(lento.avisos?.[0]).toContain('TIMEOUT');
    const amb = await resolverPeticion('cosas', ctxGestor, { proveedor: mock({ alternativas: ['cap.inmuebles.consultar', 'cap.tesoreria.consultar', 'cap.contratos.consultar'] }) });
    expect(amb.estado).toBe('AMBIGUA');
    expect(amb.alternativas!.map((a) => a.capabilityId)).toEqual(['cap.inmuebles.consultar', 'cap.contratos.consultar']); // tesorería filtrada
  });

  it('proveedor Gemini remoto: cuerpo sin permisos, prompt cerrado, parseo tolerante; sin clave/HTTP error → lanza (→ fallback)', async () => {
    const req = construirAIIntentRequest('ver recibos', ctxPortal);
    const cuerpo = cuerpoDesdeRequest(req);
    expect(JSON.stringify(cuerpo)).not.toMatch(/requiredPermission|permisos|contratos\.ver/);
    const prompt = construirPromptAsistente(cuerpo);
    expect(prompt).toContain('cap.portal.recibos');
    expect(prompt).not.toContain('cap.tesoreria');
    expect(prompt).toContain('Portal del Inquilino');
    expect(parsearRespuestaModelo('```json\n{"intencion":"NAVEGAR","capabilityId":"cap.portal.recibos","confianza":0.9,"parametros":{}}\n```')).toMatchObject({ intencion: 'NAVEGAR', capabilityId: 'cap.portal.recibos' });
    expect(parsearRespuestaModelo('Claro: {"intencion":"NINGUNA","capabilityId":null} fin')).toEqual({ intencion: 'NINGUNA' });
    expect(parsearRespuestaModelo('sin json')).toBeNull();
    expect(parsearRespuestaModelo(undefined)).toBeNull();

    const llamadas: Array<{ url: string; body: string }> = [];
    const fetchMock = (async (url: string, init?: RequestInit) => {
      llamadas.push({ url, body: String(init?.body) });
      return { ok: true, status: 200, json: async () => ({ disponible: true, proveedor: 'gemini', propuesta: { intencion: 'NAVEGAR', capabilityId: 'cap.portal.recibos', confianza: 0.9 } }) };
    }) as unknown as typeof fetch;
    const prov = crearProveedorGeminiRemoto(fetchMock);
    const r = await resolverPeticion('ver recibos', ctxPortal, { proveedor: prov });
    expect(r.origen).toBe('IA');
    expect(r.proveedor).toBe('gemini');
    expect(llamadas[0].url).toBe('/api/asistente/interpretar');
    expect(llamadas[0].body).not.toMatch(/requiredPermission/);
    const sinClave = crearProveedorGeminiRemoto((async () => ({ ok: true, status: 200, json: async () => ({ disponible: false }) })) as unknown as typeof fetch);
    expect((await resolverPeticion('ver recibos', ctxPortal, { proveedor: sinClave })).origen).toBe('LOCAL');
    const http502 = crearProveedorGeminiRemoto((async () => ({ ok: false, status: 502, json: async () => ({}) })) as unknown as typeof fetch);
    const r502 = await resolverPeticion('ver recibos', ctxPortal, { proveedor: http502 });
    expect(r502.origen).toBe('LOCAL');
    expect(r502.avisos?.[0]).toContain('HTTP 502');
  });

  it('el proveedor local sigue siendo referencia: resolverIntencionLocal (F1) intacto y usado como último recurso', async () => {
    const p = await proveedorLocal.interpretar(construirAIIntentRequest('mis liquidaciones', ctxProp));
    expect(p.capabilityId).toBe('cap.tesoreria.consultar');
    const r = await resolverPeticion('estados de un expediente', ctxAdmin);
    expect(r.estado).toBe('RESUELTA');
    expect(['ayuda.morosidad.estados', 'ayuda.morosidad.expedientes']).toContain(r.helpEntryId);
  });
});
