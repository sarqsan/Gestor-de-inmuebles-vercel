# IA · Fase 2 — Gobierno de uso (permisos, cuotas y créditos)

> **Actualizado por la FASE 7** (`docs/IA-FASE-7-GOBIERNO-IA-PERMISOS-COSTES.md`):
> la política ya no admite comodines `'*'`, ni tarifas implícitas, ni cuotas
> `null` (ilimitadas), y la política por defecto **deniega todas las
> operaciones**. Lo que sigue describe las puertas del núcleo, que no cambian;
> los detalles del formato de `IA_POLITICA_JSON` se leen en el documento de la
> Fase 7.

> **Origen de la definición.** Continuación directa de la Fase 1
> (`docs/IA-FASE-1-NUCLEO-CENTRALIZADO.md`): «Los créditos y el saldo, los
> límites por usuario y los paneles quedarían para fases posteriores.» Esta
> fase añade ese **gobierno de uso**, siempre en el servidor y siempre
> **antes** de llamar al proveedor de IA. Nada de lo que decide el gobierno se
> delega al cliente: la autorización y el saldo se calculan en servidor.

## 1. Qué hace

Cuando el núcleo (`server/ia/nucleoIA.ts`) tiene gobierno configurado —esto
es, siempre que exista registro duradero de operaciones (credencial de
servicio)— cada petición pasa por estas puertas, en este orden, antes de
crearse el cliente del proveedor:

0. **Bloqueo preventivo de aprobación comercial.** Si la política vigente
   está PENDIENTE de aprobación (origen `POR_DEFECTO` —sin
   `IA_POLITICA_JSON`— o política declarada pero incompleta), TODA operación
   se rechaza con 503 `APROBACION_COMERCIAL_PENDIENTE` antes de autenticar,
   reservar o crear el cliente del proveedor. Ni coste 0, ni saldo, ni
   cuotas, ni la presencia de `GEMINI_API_KEY` activan el consumo: la
   aprobación sólo llega por una política DECLARADA y COMPLETA (permisos
   explícitos de los cuatro perfiles, tarifa de las 12 operaciones y cuotas
   finitas) configurada en servidor. Las rutas de administración siguen
   operativas durante el bloqueo (consultan y gestionan sin tocar al
   proveedor).
1. **Perfil veraz.** `gobierno.perfilVeraz(uid)` lee el espejo de identidad
   `usuarios_auth/{uid}` y la ficha `usuarios/{usuarioId}` (la misma fuente
   autorizada de la Fase 1). El uid sale del token verificado; el espejo y la
   ficha deben estar ACTIVOS y ser coherentes (`authUid` igual al uid,
   `tipoPerfil` igual en ambos).
2. **Permiso por rol y operación.** `permiteOperacion(politica, tipoPerfil,
   operacion)` decide con la política vigente (ver §3).
3. **Reserva atómica de uso** (bloqueo, cuotas y saldo) sobre la cuenta
   `ia_cuentas/{uid}` con compare-and-swap por `updateTime` (ver §4).

Sin gobierno (modo `NO_CONFIGURADO`: sin credencial de servicio), el
comportamiento es exactamente el de la Fase 1: autenticación, idempotencia y
registro; el endpoint responde con su respaldo heurístico sin tocar el
proveedor.

`/api/health` expone el modo sin secretos:
`ia: { registro, gobierno, autenticacion: 'TOKEN_FIREBASE', operaciones: 11 }`.

## 2. Colecciones Firestore (nuevas, sólo servidor)

| Colección | Documento | Contenido |
| --- | --- | --- |
| `ia_cuentas` | `{uid}` | `version` (1), `saldoCreditos`, `bloqueada`, `motivoBloqueo`, `ventanaDiaClave`/`ventanaDiaUsos` (YYYY-MM-DD UTC), `ventanaMesClave`/`ventanaMesUsos` (YYYY-MM UTC), `totalOperaciones`, `totalCreditosConsumidos`, `ultimoOperacionId`, `actualizadoEn` |
| `ia_ajustes` | `iaadj_<sha256-40>` | `tipo` (`CREDITO`/`BLOQUEO`), `creditos`, `motivo` (≤120), `adminUid`, `uidDestino`, `estado` (`APLICADO`/`PENDIENTE`), `creadoEn` |

- **El saldo inicial es 0.** Sólo un administrador lo mueve con importes
  explícitos; no hay precios, tarifas ni saldos de bienvenida inventados: la
  política por defecto es explícitamente **PENDIENTE DE APROBACIÓN COMERCIAL**.
- `firestore.rules` no da `match` propio a `ia_cuentas` ni a `ia_ajustes`: la
  denegación global (`allow read, write: if false`) las cubre. Sólo el
  servidor con su credencial de servicio (REST) puede leerlas y escribirlas.
- Los ajustes **no guardan datos personales**: uids, contadores, códigos
  normalizados y motivos breves escritos por administradores. Nunca prompts,
  documentos, tokens ni correos (verificado por prueba con expresión regular
  sobre el documento serializado).

## 3. Política de uso (`IA_POLITICA_JSON`, opcional)

Sin la variable, rige la política `POR_DEFECTO` (FASE 7): **deniega todas las
operaciones** (los cuatro perfiles quedan declarados con ámbito vacío), declara
las tarifas y cuotas de referencia y el resumen de administración la marca
`pendienteAprobacionComercial: true`. El consumo está **bloqueado**.

Con `IA_POLITICA_JSON` la política es TODO O NADA: se declaran los permisos de
los cuatro perfiles, la tarifa de las 12 operaciones del catálogo y las dos
cuotas finitas. La plantilla aprobada está en
`docs/politica-ia.ejemplo.json`:

```json
{
  "permisos": {
    "PROPIETARIO": ["ANALIZAR_DOCUMENTO", "PROPONER_MEJORAS", "ESTIMAR_PRICING", "GENERAR_KIT_PUBLICACION", "ASISTENTE_INTERPRETAR"],
    "PROFESIONAL": ["ANALIZAR_INSPECCION", "ANALIZAR_INCIDENCIA", "PROPONER_MEJORAS", "ASISTENTE_INTERPRETAR"],
    "INQUILINO":   ["ASISTENTE_INCIDENCIAS_INQUILINO", "ASISTENTE_INTERPRETAR"],
    "ADMINISTRADOR": ["ANALIZAR_DOCUMENTO", "…las 12 del catálogo…"]
  },
  "costeCreditosPorOperacion": { "ANALIZAR_DOCUMENTO": 2, "…": 1 },
  "cuotas": { "operacionesPorDia": 20, "operacionesPorMes": 200 }
}
```

- Roles: `PROPIETARIO`, `PROFESIONAL`, `INQUILINO`, `ADMINISTRADOR`. El ámbito
  es una **lista explícita** de ids del catálogo (el comodín `'*'` ya no
  existe; la lista vacía se admite y significa «este perfil no usa IA»).
- Cuotas: enteros ≥ 1 por ventana natural UTC (día = fecha, mes = YYYY-MM).
  `null` (ilimitado) es INVÁLIDO.
- Créditos por operación: enteros ≥ 0 declarados **para todas** las operaciones
  del catálogo; el saldo vive en `[0, 1.000.000]`.
- **Fallo cerrado:** si la variable existe pero no valida (comodines, perfiles o
  tarifas sin declarar, cuotas ilimitadas), el arranque la rechaza y todas las
  operaciones de IA responden 503 `POLITICA_IA_INVALIDA`. Nunca hay respaldo
  permisivo con una política mal configurada.
- **Bloqueo preventivo:** sin la variable (o con una política declarada
  incompleta) el consumo queda **bloqueado** (503
  `APROBACION_COMERCIAL_PENDIENTE`) hasta que se configure la política
  aprobada. Activar el servicio exige, en este orden: política completa en
  `IA_POLITICA_JSON` (verificada con `npm run ia:verificar-politica`) →
  credencial de servicio en Vercel → redeploy.

## 4. Concurrencia y reserva (CAS por `updateTime`)

- La cuenta se lee, se decide en servidor y se escribe con la precondición
  `currentDocument.updateTime` de Firestore REST. Si otra escritura gana la
  carrera, se relee y se reintenta, hasta `MAX_INTENTOS_CAS = 5`. Es la
  primitiva que garantiza que dos reservas simultáneas sobre el mismo saldo
  no se pisen (probado con 5 reservas paralelas sobre saldo justo: exactamente
  3 pasan y 2 quedan `SALDO_INSUFICIENTE`).
- Agotados los reintentos, la operación de usuario falla cerrada (503) y las
  rutas de administración responden 503 `CONFLICTO_CONCURRENCIA` sin colgar
  la petición.
- Crear documento con `?documentId=` es atómico (409 si existe): es la
  idempotencia de los ajustes.

## 5. Rechazos y su mapa HTTP

| Código del gobierno | HTTP |
| --- | --- |
| `PERFIL_NO_ENCONTRADO`, `USUARIO_NO_ACTIVO`, `PERFIL_INCOHERENTE`, `OPERACION_NO_PERMITIDA`, `CUENTA_BLOQUEADA` | 403 |
| `SALDO_INSUFICIENTE` | 402 |
| `CUOTA_DIA_EXCEDIDA`, `CUOTA_MES_EXCEDIDA` | 429 |
| `APROBACION_COMERCIAL_PENDIENTE` (bloqueo preventivo) | 503 |
| `GOBIERNO_NO_DISPONIBLE`, `POLITICA_IA_INVALIDA` | 503 |

Un rechazo del gobierno **gasta la clave de idempotencia**: la operación se
cierra en `ia_operaciones` como FALLADA con el código HTTP del rechazo. La
traza queda íntegra y el reintento con la misma clave es 409
`OPERACION_DUPLICADA`.

## 6. Reembolso

Si la operación cierra **sin ninguna llamada exitosa al proveedor** (respaldo
heurístico por falta de `GEMINI_API_KEY`, o error del proveedor), los créditos
reservados se devuelven a la cuenta con el mismo CAS, dentro de la misma
ventana: saldo y contadores quedan como antes del uso. El registro queda
cerrado con `creditosReembolsados`.

## 6bis. Créditos internos y facturación real del proveedor

Los créditos, costes y cuotas de este gobierno son **controles internos de
la aplicación** (quién puede usar la IA y cuántas veces): NO son un límite
automático de la facturación de Gemini. La cuenta de Google Cloud del
proveedor factura por llamadas y tokens con independencia de los créditos
internos; si se necesita un tope económico real, debe aplicarse en el lado
del proveedor (presupuestos/cuotas de la API en Google Cloud), que queda
fuera del control de esta aplicación. El bloqueo preventivo de aprobación
comercial es la salvaguarda mientras no exista política aprobada.

## 7. Rutas de administración (guardia ADMINISTRADOR veraz)

Montadas con `montarRutasAdminIA` (`server/ia/adminIA.ts`) tras `/api/health`;
nunca usan el cliente del proveedor:

| Ruta | Qué hace |
| --- | --- |
| `GET /api/ia/admin/resumen` | modo de gobierno, política (origen y pendiente de aprobación), últimas 25 operaciones |
| `GET /api/ia/admin/cuenta/:uid` | cuenta + últimas 25 operaciones + ajustes del uid |
| `POST /api/ia/admin/cuenta/:uid/bloqueo` | `{ bloqueado: bool, motivo?: 1-120 }` bloquea/desbloquea |
| `POST /api/ia/admin/cuenta/:uid/credito` | `{ creditos: entero ≠ 0, \|n\| ≤ 1.000.000, motivo: 1-120 }` mueve el saldo |

- Guardia: token verificado en servidor, perfil veraz del espejo y rol
  `ADMINISTRADOR`. Sin token → 401; sin gobierno → 503; otro rol → 403
  `NO_ADMINISTRADOR`; admin no veraz → 403 `PERFIL_NO_VALIDO`.
- Todas las acciones **exigen `Idempotency-Key`** (8–128 caracteres
  `[A-Za-z0-9_\-:.]`). El id del ajuste es determinista
  (`iaadj_` + sha256(adminUid + clave)); el reintento con la misma clave es
  409 `AJUSTE_DUPLICADO` sin doble efecto.
- Un ajuste que sacara el saldo del rango `[0, 1.000.000]` no se aplica:
  queda `PENDIENTE` en `ia_ajustes` (visible en la consulta de cuenta) y la
  ruta responde 422 `SALDO_FUERA_DE_LIMITES`.
- Un administrador no puede bloquearse a sí mismo (422 `AUTOBLOQUEO`).
- Cada acción deja evento de auditoría `ADMIN_ACCION` con `uid` (admin) y
  `uidDestino`, sin datos personales.

## 8. Panel de administración

`src/components/ia/PanelGobiernoIA.tsx`, montado en la sección
Administración para el rol `ADMINISTRADOR` (`src/App.tsx`). Permite consultar
la cuenta de un uid (saldo, uso del día/mes, total, bloqueo y últimos
ajustes) y aplicar bloqueos y créditos. El cliente (`src/lib/adminGobiernoIA.ts`)
genera una `Idempotency-Key` nueva por acción; los errores se muestran como
`role="alert"` y los éxitos como `role="status"`.

## 9. Verificación

Sin red, sin Firebase real, sin consumir el proveedor (todo con dobles de
Firestore REST y tokens firmados localmente):

| Suite | Pruebas | Qué cubre |
| --- | --- | --- |
| `tests/ia-fase2-politica.test.ts` | 11 | contrato y validación de la política (permisos, costes, cuotas, límites) |
| `tests/ia-fase2-gobierno.test.ts` | 21 | gobierno en memoria: perfil veraz, reserva, reembolso, ajustes, auditoría (fixture con política aprobada) |
| `tests/ia-fase2-bloqueo-consumo.test.ts` | 9 | bloqueo preventivo: pendiente ⇒ 503 sin proveedor; manipulaciones; Gemini solo no activa; admin operativa sin consumo; estado refleja el bloqueo |
| `tests/ia-fase2-aislamiento-usuarios.test.ts` | 10 | aislamiento por usuario: saldos A/B independientes, suplantación, reembolso al propietario, cuotas por usuario, concurrencia sin sobregiro |
| `tests/ia-fase2-gobierno-firestore.test.ts` | 19 | gobierno sobre Firestore REST falso: CAS, carreras, ventanas, reglas, privacidad de ajustes |
| `tests/ia-fase2-admin.test.ts` | 11 | rutas de administración HTTP reales: guardia, resumen, cuenta, bloqueo/crédito, idempotencia, concurrencia, cableado |
| `src/components/ia/PanelGobiernoIA.test.tsx` | 6 | panel: consulta, presentación accesible de errores/éxitos, envío con cabeceras correctas |
| Fase 1 (5 suites) | 106 | se re-ejecutan íntegras: el núcleo, el registro y el arranque seguro siguen verdes (la matriz ESM usa política aprobada y siembra cuentas) |

Los tests de Fase 1 se actualizaron sólo de forma aditiva: `/api/health`
incluye ahora el campo `gobierno` y el mini-Firestore de la matriz funcional
soporta las nuevas colecciones (con CAS). El caso «Firestore caído» ahora
falla primero en el gobierno (503 `GOBIERNO_NO_DISPONIBLE`) porque
`perfilVeraz` precede al registro: sigue siendo fallo cerrado y sin ejecutar
la operación.
