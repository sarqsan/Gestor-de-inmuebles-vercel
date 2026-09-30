# N TITULARES · F3 OPERATIVO + PANEL DE TITULARIDADES

Fecha: 2026-09-30 · Base: `origin/main` = `604e15096858e38b420a3640088d52ab1169668f`

## 1. Qué se entrega

1. **F3 operativo** (`POST /api/titulares/buscar`): autenticado, autorizado sobre
   el inmueble solicitado, mínimo 3 caracteres, máximo 10 resultados, respuesta
   exclusiva `{ id, nombre }`, sin NIF / email / IBAN / datos fiscales, sin
   enumeración global, sin segundo sistema de identidad y sin credenciales en el
   cliente.
2. **Panel de titularidades montado** en el Portal del Propietario (pestaña
   *Titulares / Titularidades*), con alta, cierre con fecha y motivo, histórico y
   confirmación visual **sólo** tras persistencia confirmada.

## 2. F3 — decisión técnica: sin `firebase-admin`

`main` incluye una prueba guardarraíl explícita
(`tests/baja-usuarios.test.ts` → «sin Firebase Admin SDK (ni dependencia ni
import)») que prohíbe el SDK de administración en las dependencias del proyecto:
su presencia abriría una vía de borrado de identidades (`deleteUser`)
incompatible con la arquitectura de espejo de identidad. Esa prueba **no se ha
tocado** (y no debe tocarse).

Por tanto la integración de servidor se construye con la biblioteca estándar de
Node y las API REST públicas de Google:

| Necesidad | Implementación |
|---|---|
| Autorización de servicio | JWT RS256 firmado con `node:crypto` → OAuth2 (`urn:ietf:params:oauth:grant-type:jwt-bearer`) |
| Verificación del ID token | Certificados x509 de Google; comprueba `alg`, `kid`, firma, `aud`, `iss` y `exp` |
| Lectura de Firestore | REST v1 (`get` y `runQuery`), con códec de documentos propio |

No es funcionalidad «opcional»: **es la implementación completa**. El único
requisito de despliegue es la credencial de servicio (variable de entorno),
igual que `GEMINI_API_KEY` para el resto de endpoints. Sin credencial la
respuesta es **503 con instrucciones** (nunca una degradación silenciosa a «sin
autenticar»).

Variables admitidas: `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_SERVICE_ACCOUNT_B64`,
`FIREBASE_SERVICE_ACCOUNT_PATH`, `GOOGLE_APPLICATION_CREDENTIALS`.
Verificador incluido: `npx tsx scripts/verificar-config-titulares.mts`.

### Códigos de respuesta

| Código | Motivo |
|---|---|
| 200 | `{ ok: true, resultados: [{ id, nombre }] }` (máx. 10) |
| 400 | `termino_corto` (< 3 caracteres) o `peticion_invalida` |
| 401 | `no_autenticado` (sin token, token inválido o perfil no verificable) |
| 403 | `sin_autorizacion` (el llamador no gestiona ese inmueble; misma respuesta si el inmueble no existe) |
| 503 | `servidor_sin_configurar` |
| 500 | `error_interno` (sin detalle técnico al cliente) |

### Autorización

El servidor **deriva** el derecho del llamador (nunca lo acepta del cliente) y
replica `perfilActualVeraz()` de las reglas: lee `usuarios_auth/{uid}`, exige
`estado: 'ACTIVO'` y que la ficha autoritativa `usuarios/{usuarioId}` concuerde
en `authUid`, `estado` y `tipoPerfil`. Después comprueba el inmueble:

* master o `ADMINISTRADOR` activo;
* titular canónico (`propietarioId` / `propietarioPrincipalId`);
* cotitular (el `propietarioId` del llamador aparece en `titularidadesIds`).

## 3. Dónde se monta el panel

`src/components/sections/PropietarioPortalSection.tsx`:

* nueva pestaña **«Titulares / Titularidades»** (icono `Users`) junto a «Mis
  Viviendas»;
* selector de vivienda + `TitularidadesPanel` (`src/components/titularidades/TitularidadesPanel.tsx`);
* las viviendas en las que el usuario es **cotitular** entran en su cartera
  (`inm.titularidadesIds`);
* suscripción en vivo a las titularidades por clave determinista (F2);
* alta y cierre a través de `ejecutarMutacion` (BLOQUE 10 · UX-3): el aviso de
  éxito se emite **sólo** si la persistencia lo confirmó.

Flujo: ver titulares → «Añadir titular» → buscar (servidor) → seleccionar →
porcentaje **si se conoce** (si no, queda `PENDIENTE`) → confirmar → persistir →
refresco. El cierre registra fecha, motivo y detalle: **nunca borra**.

## 4. Pruebas

11 ficheros nuevos, 162 casos:

| Fichero | Casos |
|---|---|
| `src/utils/titularidadesEngine.test.ts` | 17 |
| `src/utils/repartoTitularidades.test.ts` | 10 |
| `src/lib/migracionTitularidades.test.ts` | 10 |
| `tests/ciclo-patrimonial.test.ts` | 13 |
| `tests/f2-acceso-titularidades.test.ts` | 17 |
| `tests/f3-busqueda-titulares.test.ts` | 12 |
| `tests/f3-endpoint-http.test.ts` | 19 |
| `tests/f3-google-backend.test.ts` | 26 |
| `tests/f4-reparto-liquidacion.test.ts` | 12 |
| `tests/mutacion-persistencia.test.ts` | 13 |
| `tests/portal-titularidades.integracion.test.tsx` | 13 |

Batería completa: **165 ficheros · 3000 pruebas · 0 fallos · 2 omitidas**.

## 5. GAPs restantes

* Las reglas no se han validado contra el emulador de Firestore (no hay
  `firebase-tools` ni Java en el entorno): se validan por análisis estático y
  réplica lógica de `perfilActualVeraz()`.
* Sin credenciales reales no se puede probar el circuito en producción; el 503
  documentado es el comportamiento correcto ante falta de configuración.
* La búsqueda usa una consulta por prefijo sobre `nombre` (limitada a 25
  lecturas y 10 resultados) y filtra después en memoria sin acentos: con
  nombres acentuados puede devolver menos de 10 coincidencias.
* Nombres de cotitulares ajenos a la cartera del usuario se muestran por su id
  mientras no exista una fuente autorizada de nombres.
* El índice `inmuebles.titularesIds[]` se mantiene en el alta (escritura
  atómica). El **backfill** de inmuebles anteriores NO se ha ejecutado:
  `src/lib/migracionTitularidades.ts` es un planificador en seco (dry-run).
