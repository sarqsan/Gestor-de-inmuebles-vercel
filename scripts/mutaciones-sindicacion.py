#!/usr/bin/env python3
"""Detector de mutaciones para el núcleo GAP 5 (`src/sindicacion/**`) y su persistencia
(`src/lib/sindicacionFirestore.ts`), contra los dos suites del módulo.

Cada mutación rompe una regla REAL del contrato; la suite debe ponerse en rojo.
Una mutación superviviente = hay un test decorativo que endurecer.
Uso: python3 scripts/mutaciones-sindicacion.py
"""
import atexit
import os
import re
import shutil
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BAK = '/tmp/sindicacion_bak'
SUITES = [
    'tests/sindicacion-nucleo-fase1.test.ts',
    'tests/sindicacion-estado-persistencia.test.ts',
    'tests/sindicacion-reglas-firestore.test.ts',
    'tests/sindicacion-panel-conexion.test.ts',
    'tests/fase14-espejo-identidad.test.ts',
]
# clave corta usada en las tuplas de mutación -> ruta real en el repositorio
RUTA_DE = {
    'hashContenido.ts': 'src/sindicacion/hashContenido.ts',
    'idempotencia.ts': 'src/sindicacion/idempotencia.ts',
    'validacion.ts': 'src/sindicacion/validacion.ts',
    'adaptadores.ts': 'src/sindicacion/adaptadores.ts',
    'estadoRepositorio.ts': 'src/sindicacion/estadoRepositorio.ts',
    'index.ts': 'src/sindicacion/index.ts',
    'sindicacionFirestore.ts': 'src/lib/sindicacionFirestore.ts',
    'PublicacionInmueblesPanel.tsx': 'src/components/PublicacionInmueblesPanel.tsx',
    'firestore.rules': 'firestore.rules',
    'authService.ts': 'src/lib/authService.ts',
}
FICHEROS = sorted(set(RUTA_DE.values()))
os.makedirs(BAK, exist_ok=True)
for f in FICHEROS:
    shutil.copy(os.path.join(RAIZ, f), os.path.join(BAK, os.path.basename(f)))


def restore():
    for f in FICHEROS:
        shutil.copy(os.path.join(BAK, os.path.basename(f)), os.path.join(RAIZ, f))


H, V = 'hashContenido.ts', 'idempotencia.ts'
VA, AD, ES, FS = 'validacion.ts', 'adaptadores.ts', 'estadoRepositorio.ts', 'sindicacionFirestore.ts'
PN, RL = 'PublicacionInmueblesPanel.tsx', 'firestore.rules'
AU = 'authService.ts'

MUT = [
    # ---------------- hueco 1: huella y versión ----------------
    ('M01 metadato `generadoEn` entra en la huella', H,
     "readonly string[] = ['generadoEn']", "readonly string[] = []"),
    ('M02 representación canónica sin normalizar', H,
     'return jsonDeterminista(formaCanonicaPublicable(pub));', 'return JSON.stringify(pub);'),
    ('M03 características sin ordenar', H, "c !== undefined))].sort()", "c !== undefined))]"),
    ('M04 versión siempre incrementa', H,
     'const cambio = !anterior || anterior.hashContenido !== hashContenido;', 'const cambio = true;'),
    ('M05 habitaciones sin orden canónico', H,
     ".sort((a, b) => String(a.habitacionId).localeCompare(String(b.habitacionId)))", ""),
    ('M06 imágenes sin orden canónico', H,
     "        .sort((a, b) => {\n          if (a.portada !== b.portada) return a.portada === true ? -1 : 1;\n          if (a.orden !== b.orden) return Number(a.orden) - Number(b.orden);\n          return String(a.url).localeCompare(String(b.url));\n        })",
     "        // MUT"),
    # ---------------- hueco 2: decisor ----------------
    ('M07 SIN_CAMBIOS desaparece (republica siempre)', V, 'if (!cambioDetectado) {', 'if (false) {'),
    ('M08 BLOQUEADO también se envía', V,
     "return decision.accion === 'NUEVO' || decision.accion === 'ACTUALIZAR' || decision.accion === 'RETIRAR';",
     'return true;'),
    ('M09 la payload publicada no cuenta como precedente', V,
     'publicada.version || publicada.externalId || publicada.publicacion',
     'publicada.version || publicada.externalId'),
    ('M10 retirar exige contenido publicable', V,
     'if (intencion?.retirar === true) {', 'if (intencion?.retirar === true && validacion.estado === "VALIDO") {'),
    ('M11 externalId derivado del contenido (identidad inestable)', V,
     'const externalId = publicada?.externalId || identidad.externalId;',
     "const externalId = publicada?.externalId || identidad.externalId + version.hashCorto;"),
    # ---------------- hueco 3: validación ----------------
    ('M12 la tabla de códigos pierde una regla del motor', VA,
     "  'Precio inválido: debe ser un número positivo.': { codigo: 'PRECIO_NO_POSITIVO', campo: 'precioMensual', categoria: 'VALOR_INVALIDO' },",
     ""),
    ('M13 data-URL admitida como imagen publicable', VA,
     "} else if (url.startsWith('data:')) {", "} else if (url.startsWith('blob:')) {"),
    ('M14 orden de imagen inválido pasa a advertencia', VA,
     "        codigo: 'IMAGEN_ORDEN_INVALIDO',\n        campo: 'imagenes',\n        indice,\n        severidad: 'BLOQUEANTE',",
     "        codigo: 'IMAGEN_ORDEN_INVALIDO',\n        campo: 'imagenes',\n        indice,\n        severidad: 'ADVERTENCIA',"),
    ('M15 la URL no se comprueba contra http(s)', VA, '} else if (!URL_ABSOLUTA.test(url)) {', '} else if (false) {'),
    ('M16 aValidacionLegado pierde las advertencias', VA,
     'advertencias: validacion.advertencias.map((e) => e.mensaje),', 'advertencias: [],'),
    ('M17 la capa de imágenes se salta', VA,
     '  const deImagenes = sinModelo ? [] : validarImagenesPublicables(pub);',
     '  const deImagenes: ErrorValidacionEstructurado[] = [];'),
    ('M18 las advertencias se tragan como bloqueantes', VA,
     "const errores = todos.filter((e) => e.severidad === 'BLOQUEANTE');",
     "const errores = todos.filter((e) => e.severidad === 'BLOQUEANTE' || e.severidad === 'ADVERTENCIA');"),
    # ---------------- hueco 4: adaptadores ----------------
    ('M19 publicar del no-conectado finge éxito', AD,
     "publicar: (ctx) => rechazoNoConectado(portal, 'publicar'),",
     "publicar: (ctx) => ({ ok: true, operacion: 'publicar' as const, portal }),"),
    ('M20 crearAdaptador no exige el contrato', AD, 'if (faltan.length > 0) {', 'if (false) {'),
    ('M21 sanearContexto deja pasar credenciales', AD,
     "    if ((CLAVES_CREDENCIAL_PROHIBIDAS as readonly string[]).includes(clave)) {\n      eliminadas.push(clave);\n      continue;\n    }\n    extras[clave] = valor;",
     '    extras[clave] = valor;'),
    ('M22 el puerto corre aunque la decisión sea SIN_CAMBIOS', AD,
     "if (operacion !== 'validar' && decision && decision.accion === 'SIN_CAMBIOS') {", 'if (false) {'),
    ('M23 exportarFeed duplica el generador', AD, '  const salida = adaptador.generar(publicaciones);',
     "  const salida = { ok: false, motivo: 'duplicado' } as never;"),
    ('M24 el adaptador de la Fase 1 finge conexión', AD,
     "    conectado: false,\n    operacionesSoportadas: ['validar'],",
     '    conectado: true,\n    operacionesSoportadas: [...OPERACIONES_ADAPTADOR],'),
    ('M25 el caso «ya retirado» deja de ir primero', V,
     'if (publicada?.retirado === true) {', 'if (false) {'),
    # ---------------- persistencia: capa de dominio ----------------
    ('M26 guarda la versión PROSPECTIVA aunque la operación fallara/bloqueara', ES,
     '...(objetivo.envia && ok ? { version: decision.version } : {}),',
     '{ version: decision.version } as never,'),
    ('M27 SIN_CAMBIOS escribe (reescribe el estado con otro timestamp)', ES,
     '  // SIN_CAMBIOS no es una operación: es la ausencia de ella.',
     "  await ctx.puerto.escribirEstado(anterior || construirRegistroEstado({ portal, inmuebleId: decision.inmuebleId, estado: estadoBase, operacion: 'sin_envio', resultado: 'SIN_CAMBIOS', fecha }));\n  // MUT M27"),
    ('M28 la huella del estado incluye el reloj ⇒ escrituras infinitas', ES,
     "export const CLAVES_DE_ESTADO: readonly string[] = [\n  'estado',",
     "export const CLAVES_DE_ESTADO: readonly string[] = [\n  'actualizadoEn',\n  'estado',"),
    ('M29 bloqueo altera el estado publicado', ES,
     "    estadoObjetivo = estadoBase;\n    motivo = `Contenido no publicable",
     "    estadoObjetivo = 'ERROR';\n    motivo = `Contenido no publicable"),
    ('M30 el inicializador pisa el estado existente', ES,
     '    if (anterior) {\n      preexistentes.push(inicial.portal);\n      continue;\n    }',
     '    if (anterior) {\n      preexistentes.push(inicial.portal);\n    }'),
    ('M31 sin histórico cuando cambia el estado', ES,
     '  if (cambia) await ctx.puerto.registrarEvento?.(evento, trazabilidad);', '  void cambia;'),
    ('M32 el id del evento ignora la versión (colisiona en audit_logs)', ES,
     "    version: e.version ?? null,\n    hashContenido: e.hashContenido ?? null,", "    hashContenido: e.hashContenido ?? null,"),
    ('M33 la trazabilidad usa códigos en vez de la validación del motor', ES,
     'validacion: decision.validacion.origen,', "validacion: { valido: true, erroresBloqueantes: [], advertencias: [] },"),
    ('M34 el BFS de estados inventa transiciones (paso directo)', ES,
     'if (previo.has(siguiente) || !transicionEstadoPublicacionPermitida(actual, siguiente)) continue;',
     'if (previo.has(siguiente)) continue;'),
    ('M35 los invariantes del registro no se comprueban', ES,
     '  if (!invariantes.ok) {\n    return {\n      inmuebleId: decision.inmuebleId,\n      portal,\n      clave: registro.clave,',
     '  if (false) {\n    return {\n      inmuebleId: decision.inmuebleId,\n      portal,\n      clave: registro.clave,'),
    ('M36 los bloqueos no se derivan de la validación', ES,
     "const bloqueos = params.bloqueos ?? (validacion ? codigosDeValidacion(validacion, 'BLOQUEANTE') : params.decision?.bloqueos ?? []);",
     'const bloqueos = params.bloqueos ?? [];'),
    ('M37 la retirada pierde la versión publicada (no conserva anterior)', ES,
     '  } else if (params.anterior?.version !== undefined) {', '  } else if (false) {'),
    # ---------------- persistencia: adaptador Firestore ----------------
    ('M38 el adaptador escribe aunque la huella no cambie', FS,
     'if (previo.esquema === ESQUEMA_ESTADO_SINDICACION && huellaDeEstado(previo) === huella) {', 'if (false) {'),
    ('M39 el adaptador no verifica invariantes de identidad', FS,
     '  if (!invariantes.ok) {\n    throw new Error(`Estado de sindicación rechazado: ${invariantes.errores.join(\' | \')}`);\n  }', '  void invariantes;'),
    ('M40 el adaptador permite credenciales en el documento', FS,
     '  if (!credenciales.ok) {\n    throw new Error(`El estado de sindicación no puede contener credenciales (${credenciales.claves.join(\', \')}).`);\n  }', '  void credenciales;'),
    ('M41 el adaptador no exige propietarioId (aislamiento)', FS,
     "  if (!registro.propietarioId) {\n    throw new Error('El estado de sindicación requiere propietarioId (campo de aislamiento).');\n  }", '  void registro.propietarioId;'),
    ('M42 el evento de auditoría pierde el id determinista', FS,
     '    id: evento.id,\n    fechaHora: evento.fecha,', '    fechaHora: evento.fecha,'),
    ('M43 `auditoria:false` igualmente escribe en audit_logs', FS,
     '      if (!auditoria) return;', '      void auditoria;'),
    ('M44 el filtro de inmueble en la lectura desaparece', FS,
     "    .filter((r) => r.inmuebleId === inmuebleId)", '    .filter(() => true)'),
    # ---------------- fase 2B: conexión del panel + reglas (§38) ----------------
    ('M45 el hito local se ignora y manda siempre la tabla de acciones', ES,
     "const objetivo = params.hito === 'validar' ? OBJETIVO_HITO_LOCAL : OBJETIVO_POR_ACCION[decision.accion];",
     'const objetivo = OBJETIVO_POR_ACCION[decision.accion];'),
    ('M46 validar revierte un estado ya publicado', ES,
     'if (!objetivo.envia && publicadoVivo) {', 'if (false) {'),
    ('M47 el hito local estampa la versión como si estuviera publicada', ES,
     '...(objetivo.envia && ok ? { version: decision.version } : {}),',
     '...(ok ? { version: decision.version } : {}),'),
    ('M48 el objetivo del hito local sí declara envío al portal', ES,
     'envia: false,\n};', 'envia: true,\n};'),
    ('M49 el alcance por propietario desaparece de la consulta', FS,
     "  if (alcance?.propietarioId) filtros.push(where('propietarioId', '==', alcance.propietarioId));",
     '  // MUT: alcance ignorado'),
    ('M50 la suscripción sigue emitiendo tras el unsubscribe', FS,
     '      if (cerrado) return;\n      callback(mapaSnap<RegistroEstadoSindicacion>(snap));',
     '      callback(mapaSnap<RegistroEstadoSindicacion>(snap));'),
    ('M51 la suscripción no cierra el listener real', FS,
     '    cerrado = true;\n    unsub && unsub();', '    cerrado = true;'),
    ('M52 el repositorio no expone listener (la suscripción se cae a lectura única)', FS,
     '...(opts.suscripcion === false', '...(true === true'),
    ('M53 el estado inicial pisa un documento preexistente', ES,
     'if (anterior) {\n      preexistentes.push(inicial.portal);', 'if (false) {\n      preexistentes.push(inicial.portal);'),
    ('M54 el circuito repinta tras el desmontaje (todas sus guardas fuera)', PN,
     ['  const emitir = () => {\n    if (cerrado) return;',
      '    if (cerrado) return null;\n    const publicacion = params.publicacion();',
      '    if (cerrado) return null;\n    // La acción la decide'],
     ['  const emitir = () => {\n    if (false) return;',
      '    if (false) return null;\n    const publicacion = params.publicacion();',
      '    if (false) return null;\n    // La acción la decide']),
    ('M55 el listener del panel no se cierra al desmontar', PN,
     '    if (unsub) unsub();', '    // MUT: listener huérfano'),
    ('M56 el snapshot publicado siempre trae precedente (nunca decide NUEVO)', PN,
     '  if (!publicado) return { retirado };', '  if (false) return { retirado };'),
    ('M57 el fallo de escritura del estado rompe el panel', PN,
     '    } catch (e) {\n      // La E/S puede estar denegada', '    } catch (e) {\n      throw e;\n      // La E/S puede estar denegada'),
    ('M58 reglas: el create no comprueba que id/externalId sean el docId', RL,
     '§38>        && incoming().id == docId\n        && incoming().externalId == docId', '        && true'),
    ('M59 reglas: la coherencia del documento deja de exigir el portal', RL,
     "&& (incoming().portal in ['IDEALISTA', 'FOTOCASA', 'HABITACLIA', 'KYERO'])", '&& true'),
    ('M60 reglas: se olvida el predicado de secretos', RL,
     '§38>          && incoming().esquema == 1\n          && sinSecretosSindicacion();',
     '          && incoming().esquema == 1;'),
    ('M61 reglas: update permite reasignar el inmueble', RL,
     '§38>&& request.resource.data.inmuebleId == existing().inmuebleId', '&& true'),
    ('M62 reglas: update permite reasignar el propietario', RL,
     '§38>&& request.resource.data.propietarioId == existing().propietarioId', '&& true'),
    ('M63 reglas: update permite cambiar de portal', RL,
     '§38>&& request.resource.data.portal == existing().portal', '&& true'),
    ('M64 reglas: el list del propietario deja de exigir propietarioId', RL,
     '§38>allow list: if isMasterAdmin()\n        || (isPropietarioRole() && resource.data.propietarioId == myPropId());',
     'allow list: if isSignedIn();'),
    ('M65 reglas: el get se abre a cualquier usuario autenticado', RL,
     '§38>allow get: if isMasterAdmin()\n        || (isPropietarioRole() && (resource.data.propietarioId == myPropId() || canReachInmuebleId(resource.data.inmuebleId)));',
     'allow get: if isSignedIn();'),
    # Ancla reubicada a la posición canónica de A: el bloque de sindicación es §44 y va
    # inmediatamente antes de la DENEGACIÓN GLOBAL (catch-all). La mutación comprueba lo
    # mismo que siempre: que `delete` deje de ser exclusivo de la administración.
    ('M66 reglas: delete pasa a ser del propietario', RL,
     "      allow delete: if isMasterAdmin();\n    }\n\n    // =========================================================================\n    // DENEGACIÓN GLOBAL POR DEFECTO",
     "      allow delete: if isPropietarioRole();\n    }\n\n    // =========================================================================\n    // DENEGACIÓN GLOBAL POR DEFECTO"),
    ('M67 reglas: la forma de la clave deja de comprobarse', RL,
     '§38>&& incoming().clave.size() == incoming().portal.size() + incoming().inmuebleId.size() + 1', '&& true'),
    # --- helpers de identidad/ownership que §38 reutiliza (corte commiteable) ---
    ('M69 canReachInmuebleId ignora la cartera del espejo', RL,
     'function canReachInmuebleId(inmId) {\n      return isPropietarioRole() && myInmuebleIds().hasAny([inmId]);\n    }',
     'function canReachInmuebleId(inmId) {\n      return isPropietarioRole();\n    }'),
    ('M70 activeUser no mira el estado del espejo (una cuenta suspendida sigue valiendo)', RL,
     'function activeUser() {\n      return isSignedIn() && me().estado == \'ACTIVO\';\n    }',
     'function activeUser() {\n      return isSignedIn();\n    }'),
    ('M71 myPropId devuelve el uid en vez del propietario', RL,
     'function myPropId() {\n      return me().propietarioId;\n    }',
     'function myPropId() {\n      return request.auth.uid;\n    }'),
    ('M72 sinSecretosSindicacion se vuelve permisivo', RL,
     'function sinSecretosSindicacion() {\n      return !(',
     'function sinSecretosSindicacion() {\n      return true || !('),
    ('M68 reglas: el esquema deja de validarse', RL,
     '§38>&& incoming().esquema == 1', '&& true'),
]


def lanzar():
    p = subprocess.run(['./node_modules/.bin/vitest', 'run', *SUITES], cwd=RAIZ, capture_output=True, text=True)
    return p, re.sub(r'\x1b\[[0-9;]*m', '', p.stdout + p.stderr)


restore_flag = True
atexit.register(restore)
detectadas, supervivientes, rotas = [], [], []
MARCA_38 = 'match /sindicacion_inmuebles/{docId}'



# ---- FASE 1.4 · espejo de identidad `usuarios_auth/{uid}` + `syncAuthIndex` ----
MUT += [
    ('M73 el espejo se lee desde cualquier sesion', RL,
     'allow read: if isMasterAdmin() || (isSignedIn() && request.auth.uid == uid);',
     'allow read: if isMasterAdmin() || isSignedIn();'),
    ('M74 create del espejo sin contrastar veracidad', RL,
     '&& indexIsTruthful()\n      );\n      allow update',
     '&& true\n      );\n      allow update'),
    ('M75 veracidad sin comprobar el UID del perfil', RL,
     '&& src.authUid == request.auth.uid',
     '&& true'),
    ('M76 el dueño puede borrar su propio espejo', RL,
     '&& indexIsTruthful()\n      );\n      allow delete: if isMasterAdmin();',
     '&& indexIsTruthful()\n      );\n      allow delete: if isMasterAdmin() || isSignedIn();'),
    ('M77 `usuarios` permite moverse el propietarioId', RL,
     "          'permisos',\n          'propietarioId',",
     "          'permisos',"),
    ('M78 auto-registro con roles elevados (sólo bloquea SUPERADMIN)', RL,
     "'SUPERADMIN', 'ADMINISTRADOR', 'GESTOR_INMUEBLES'",
     "'SUPERADMIN'"),
    ('M79 syncAuthIndex escribe el espejo en la ruta del perfil', AU,
     "await setDoc(doc(db, 'usuarios_auth', fb.uid), payload, { merge: true });",
     "await setDoc(doc(db, 'usuarios_auth', usuario.id), payload, { merge: true });"),
    ('M80 syncAuthIndex no normaliza roles', AU,
     'roles: Array.isArray(usuario.roles) ? usuario.roles : [],',
     'roles: usuario.roles,'),
    ('M81 syncAuthIndex propaga el fallo y corta el acceso', AU,
     "console.warn('No se pudo sincronizar el espejo de identidad usuarios_auth:', err);",
     'throw err;'),
    ('M82 el login ya no sincroniza el espejo', AU,
     '  if (firebaseUser) {\n    await syncAuthIndex(usuario, firebaseUser);\n  }',
     '  // (sin sincronizacion del espejo)'),
]
def aplica(fich, viejo, nuevo):
    """Aplica la mutación y devuelve (ok, motivo).

    Un prefijo '§38>' en el ancla restringe la búsqueda al bloque de `sindicacion_inmuebles`
    de las reglas: sin él, varias de estas cadenas aparecen también en colecciones vecinas
    y la mutación se aplicaría al bloque equivocado (el test quedaría en verde y la
    mutación pasaría por 'superviviente' cuando en realidad no se ha tocado nada).
    Además se exige unicidad del ancla: un ancla ambigua es un error del script, no un
    superviviente.
    """
    ruta = os.path.join(RAIZ, RUTA_DE[fich])
    codigo = open(ruta).read()
    viejo, nuevo = (viejo if isinstance(viejo, list) else [viejo]), (nuevo if isinstance(nuevo, list) else [nuevo])
    if len(viejo) != len(nuevo):
        return False, 'anclas y reemplazos no emparejan'
    marca = False
    if viejo[0].startswith('§38>'):
        marca, viejo = True, [v[4:] for v in viejo]
        nuevo = [n[5:] if n.startswith('§38>') else n for n in nuevo]
        i = codigo.index(MARCA_38)
        # hasta el final de ese match: la siguiente línea `match /` o `}` a nivel 2
        j = codigo.find('\n    }', codigo.find(MARCA_38, i))
        zona = codigo[i:j]
    else:
        zona = codigo
    zona0 = zona
    mutado = codigo
    for v, nn in zip(viejo, nuevo):
        n = zona.count(v)
        if n != 1:
            return False, f'ancla {"no encontrada" if n == 0 else f"ambigua ({n} coincidencias)"}: {v[:40]!r}'
        k = zona.index(v)
        zona = zona[:k] + nn + zona[k + len(v):]
    i0 = codigo.index(zona0)
    mutado = codigo[:i0] + zona + codigo[i0 + len(zona0):]
    if mutado == codigo:
        return False, 'mutación sin efecto (viejo == nuevo)'
    open(ruta, 'w').write(mutado)
    return True, ''


SOLO = [x.strip() for x in os.environ.get('SOLO', '').split(',') if x.strip()]

for nombre, fich, viejo, nuevo in MUT:
    if SOLO and not any(nombre.startswith(pref) for pref in SOLO):
        continue
    restore()
    ok, motivo = aplica(fich, viejo, nuevo)
    if not ok:
        rotas.append(f'{nombre} :: {motivo} en {RUTA_DE[fich]}')
        continue
    p, salida = lanzar()
    if p.returncode != 0:
        fallan = sorted(set(re.findall(r'× ([A-Z]+\.[0-9]+[a-z]?)', salida)))
        detectadas.append((nombre, fich, fallan))
    else:
        m = re.search(r'Tests\s+(\d+) passed', salida)
        supervivientes.append((nombre, fich, m.group(0) if m else '?'))
restore()

print('\n===== DETECCIÓN DE MUTACIONES · GAP 5 (núcleo + persistencia) =====')
for n, f, fallan in detectadas:
    print(f'  ✓ {n}  [{f}]  → rojos: {", ".join(fallan) if fallan else "(otro test)"}')
for n, f, res in supervivientes:
    print(f'  ✗ SUPERVIVIENTE  {n}  [{f}]  → {res}')
for e in rotas:
    print(f'  ! ANCLA ROTA  {e}')
print(f'\n  total {len(MUT)} · detectadas {len(detectadas)} · supervivientes {len(supervivientes)} · anclas rotas {len(rotas)}')
sys.exit(0 if not supervivientes and not rotas else 1)
