# Auditoría funcional real de los cuatro portales — 27 de octubre de 2026

**Repositorio:** `sarqsan/Gestor-de-inmuebles-vercel` · **Rama:** `arena/fb69e0b0-gestor-de-inmuebles-vercel` · **Commit inspeccionado:** `2563831df9b026dec8276c45db40977f72883f9d` (merge PR #61, 21-10-2026).
**Objeto:** determinar, con evidencia de código, ejecución y fuentes externas, **qué está realmente implementado** en los portales de **administrador, propietario, profesional e inquilino**, **qué falta** y **qué mejoras convienen** frente a productos comparables del mercado.
**Carácter:** auditoría de solo lectura. No se ha modificado código de aplicación, reglas, datos ni configuración; no se ha desplegado; no se han enviado correos, consultado IA de pago, escrito en Firebase de producción ni contactado con AEAT/bancos/aseguradoras.

---

## 0. Resumen ejecutivo

### 0.1 Veredicto de una línea

La aplicación es un **ERP patrimonial español muy profundo en modelo de dominio, trazabilidad y cumplimiento internos** (N titulares, carteras L/E, LAU, IRAV, actas, morosidad, VERI*FACTU hash, expediente fiscal, cobros, conciliación, IA gobernada), pero **todavía no es un producto operativo equiparable al mercado en "dinero en movimiento", canales, firma, verificación externa, móvil/API y automatización**: gran parte de lo que parece implementado es **motor + UI + persistencia**, mientras que la **integración externa** (banco, AEAT, portales inmobiliarios, firma cualificada, pasarela de pago, envío real de OTP, IA de proveedor) está **declarada, preparada o bloqueada por configuración**.

Además, la auditoría ha encontrado **código muerto y flujos rotos por cableado**, no por falta de modelo: 4 secciones completas sin montar (~3.000 líneas), un modal de solicitudes inalcanzable, un circuito de firma OTP que no entrega el código, toggles de módulos que no controlan nada y permisos granulares decorativos.

### 0.2 Lo que sí es sólido

1. **Modelo de datos y reglas.** 77 bloques `match` de primer nivel en `firestore.rules` (4.069 líneas), denegación global por defecto, aislamiento por `propietarioId`, carteras `L/E`, delegaciones parciales e índice de identidad `usuarios_auth` no falsificable. `storage.rules` (66 líneas) deniega todo al cliente salvo la foto pública; la custodia documental se autoriza en servidor (`server/documentos/autorizacionDocumental.ts`) contra la base Firestore con nombre. Es una arquitectura de seguridad más cuidada que la media.
2. **Trazabilidad económica.** Los cobros viven en `contratos_formalizacion.registroCobros` y solo se marcan por `registrarPagoPeriodo`; los justificantes del inquilino (P2) son **validación documental**, no contabilización automática (`JustificantesCobroInbox.tsx:253`). Eso es una decisión correcta.
3. **Portales por rol reales.** No son maquetas: el inquilino tiene 10 pantallas con incidencias, lecturas, mensajes, justificantes y asistente; el propietario tiene 10 pestañas; el profesional 5; el administrador 7 áreas de control.
4. **Fallo cerrado.** El servidor no finge éxito: sin credenciales, los portales públicos, la custodia, los justificantes, el cron, la IA y la actualización de renta responden 503/403 con causa. Se comprobó empíricamente (§2.3).
5. **Cobertura de pruebas unitarias.** 4.943 pruebas Vitest y 302 pruebas `node:test`; `tsc` y `build` correctos (§7).

### 0.3 Las diez brechas que más importan

| # | Brecha | Impacto | Prioridad |
|---|---|---|---|
| 1 | **Despliegue por defecto incompleto**: sin `FIREBASE_SERVICE_ACCOUNT`, `CRON_SECRET`, `EMAIL_*` e `IA_POLITICA_JSON` casi toda la capa servidor devuelve 503 y la IA está denegada (§2.3) | Producto "instalado" pero no operativo | P0 |
| 2 | **Solicitudes públicas sin bandeja de revisión**: `SolicitudesSection.tsx` y `SolicitudDetailModal` están muertos; el alta pública se guarda en `solicitudes` pero la gestión muestra `candidatos` (§6 H-02) | Pérdida de leads si falla el registro secundario de candidato | P0 |
| 3 | **Firma de actas por OTP inoperable**: se genera el código con `Math.random()`, se descarta el `codigoPlain` y el canal es `PENDIENTE_PROVEEDOR` (§6 H-03) | Nadie recibe el código; la firma no se puede completar | P0 |
| 4 | **Escrituras anónimas sin antispam**: `solicitudes.create` y `candidatos.create` permiten escritura sin sesión, sin CAPTCHA, sin rate limit y sin validación de token (§6 H-04) | Spam, coste y contaminación de datos | P0 |
| 5 | **VERI*FACTU y factura B2B desconectados** y con comentarios normativos ya obsoletos (§6 H-08) | Riesgo regulatorio: obligaciones desde enero/julio de 2027 y octubre de 2028 ya en curso | P0 |
| 6 | **Faltan pagos online, conexión bancaria automática y envío SEPA al banco** (§5, §8) | Diferencia competitiva central frente a Buildium, DoorLoop, Rentger y Homming | P1 |
| 7 | **Portal del profesional incompleto**: sin presupuestos, facturas, valoraciones, calendario, SLA ni app de campo; `ProfesionalesSection.tsx` (1.240 líneas) no está montado (§4.3, §6 H-01) | El proveedor no puede trabajar de punta a punta | P1 |
| 8 | **Sin API pública, PWA/app móvil, push, WhatsApp ni i18n**; bundle principal de 5,55 MB (1,38 MB gzip) (§6 H-12, §7) | Experiencia y ecosistema por debajo del mercado | P1 |
| 9 | **Gobernanza de un solo inquilino**: correo maestro codificado en reglas y código, datos demo sembrados en el primer login admin, permisos granulares y toggles de módulos sin efecto real (§6 H-05, H-06, H-07) | Difícil venderlo como SaaS multigestora | P1 |
| 10 | **Deuda de verificabilidad**: 9 vulnerabilidades npm (1 crítica, 8 altas), 2 pruebas de guardia A-04 y 3 pruebas de integración fallidas en checkout superficial, sin E2E de navegador (§7) | Riesgo y fricción de CI | P1 |

### 0.4 Estado por portal

| Portal | Superficie real | Veredicto |
|---|---|---|
| **Administrador** | 30 entradas de menú, 7 áreas de centro de control, 12 operaciones IA gobernadas, ≈50 rutas HTTP, 77 bloques de reglas | ✅ El más completo. 🟡 Con código muerto, gobierno "decorativo" en partes y dependencia fuerte de secretos de despliegue. |
| **Propietario** | 24 secciones permitidas + portal de 10 pestañas (viviendas, titularidades, profesionales, contratos, liquidaciones, morosidad, gastos, cobros, incidencias, perfil) | ✅ Muy completo en consulta y patrimonio. ❌ Sin captación/candidatos, sin mensajería con inquilino, sin pago online, casi todo económico es solo lectura. |
| **Profesional** | 5 entradas de menú (7 con `GESTOR_PATRIMONIAL`); guarda permite 6/8; portal de 5 pestañas | 🟡 Perfil, zonas, asignaciones, incidencias y trabajos funcionan. ❌ Falta el ciclo comercial/económico del proveedor (presupuestos, facturas, valoraciones, calendario, SLA, app). |
| **Inquilino** | 10 pantallas móviles, 5 pestañas, P2 de justificantes, asistente de incidencias IA, suministros, mensajes | ✅ Mejor portal de cara al usuario. 🟡 Sin pago online, sin firma, sin notificaciones push, sin alta autónoma; fotos/descargas dependen del servidor documental. |

---

## 1. Método, alcance y límites

### 1.1 Qué se hizo

1. **Inventario estático dirigido** de `src/App.tsx` (4.986 líneas), `src/types.ts` (4.473), `src/lib/firebase.ts` (4.354), `src/navegacion/navegacion.ts`, `server.ts` (2.900+), `server/**`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `package.json`, `vercel.json`, `.github/workflows/*` y los componentes de los cuatro portales.
2. **Rastreo de cada función** por capas: UI → motor puro → persistencia → backend → reglas/permisos → integración externa → prueba.
3. **Ejecución real**: `npm ci`, `tsc --noEmit`, `npm run build`, `npx vitest run` completo, `npm run test:integracion`, `npm audit --omit=dev`, guardia de repositorio A-04 y **servidor Express arrancado sin secretos** con peticiones HTTP reales a `/api/health`, `/api/cron/avisos`, `/api/visita/:token`, `/api/cuestionario/:token`, `/api/documentacion/:token`, `/api/notificaciones/enviar` y `/api/analizar-documento`.
4. **Contraste con fuentes externas primarias y de mercado** (§8 y §10): documentación oficial de Buildium, DoorLoop, AppFolio, Rentger, Homming y Rentila; AEAT, BOE, INE y Ministerio de Vivienda; límites oficiales de Firestore.
5. **Contraste con la documentación interna**: los documentos de `docs/` se trataron como **afirmaciones a verificar**, no como evidencia. Se confirman muchas y se corrigen otras (por ejemplo, el estado normativo de la factura B2B en octubre de 2026).

### 1.2 Límites honestos

- **No se ha verificado el despliegue real**: reglas publicadas en Firebase, datos, variables de Vercel, `CRON_SECRET`, cuenta de servicio, claves Gemini, SMTP, bucket, índices desplegados. El repositorio describe lo que *debería* pasar; la auditoría ejecuta lo que el código hace **sin secretos**.
- **No se han probado productos de la competencia**: sus funciones proceden de documentación pública y comparativas de 2026 (enlazadas).
- **No se ha ejecutado el emulador oficial de reglas** (`npm run test:emulador:reglas`): requiere Java 21 y descargar el emulador; en este entorno `java` no está disponible. El CI sí lo ejecuta en PR.
- **No hay pruebas E2E de navegador** en el repositorio; no se ha simulado un usuario real contra Firebase. Por tanto, los hallazgos de "flujo roto" se basan en cableado estático y pruebas unitarias, no en una sesión de producción.
- Los docs internos citan cifras de cortes anteriores (p. ej. 4.705 pruebas, `storage.rules` de 728 líneas). Esta auditoría usa las cifras **medidas en este commit** (§7).

### 1.3 Leyenda de estado

| Símbolo | Significado |
|---|---|
| ✅ **Real** | UI + motor + persistencia + reglas/servidor + prueba; funciona con la configuración adecuada. |
| 🟡 **Parcial** | Existe motor/UI/persistencia, pero falta la integración externa, el disparador o la contraparte operativa. |
| 🧪 **Preparado/Simulado** | Modelo, adaptador o texto de demo; el propio código declara que no ejecuta la operación real. |
| 🔒 **Bloqueado por config** | Implementado con fallo cerrado; responde 503/403 hasta configurar secretos/política. |
| ❌ **Ausente** | No se encontró implementación en el repositorio. |

---

## 2. Arquitectura y estado operativo real

### 2.1 Stack y despliegue

- **Cliente:** React 19 + TypeScript + Vite 6 + Tailwind 4 + Firebase 12 (Auth, Firestore, Storage). SPA monolítica con `App.tsx` como enrutador por estado.
- **Servidor:** Express 4 en `server.ts`; Vercel concentra `/api/*` en `api/index.ts`. `vercel.json` programa `GET /api/cron/avisos` a las **06:00 UTC** (`0 6 * * *`) y reescribe todo a `index.html` para la SPA.
- **Datos:** Firestore **base con nombre** `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51` (`firebase-applet-config.json`, `src/lib/firebase.ts:137`). Storage solo para imágenes públicas de inmuebles; el resto por sesiones de subida autorizadas en servidor.
- **Rutas:** 19 registros en `server.ts` + 34 en `server/**` (aprox. 50 rutas, algunas generadas en bucle): 12 operaciones IA, Catastro, búsqueda de titulares, documentos, portales públicos, justificantes, actualización de renta, seguimiento de incidencias, notificaciones, SMTP de prueba, cron, gobierno IA y llaves de usuario.
- **Seguridad:** `firestore.rules` con 77 `match` de primer nivel y `match /{document=**} { allow read, write: if false; }` final; `firestore.indexes.json` con **10 índices compuestos** (6 de `actas*`, 2 de `gestiones_cartera`, 2 de `ia_operaciones`).

### 2.2 La configuración es parte del producto

`.env.example` documenta las variables críticas: `FIREBASE_SERVICE_ACCOUNT`/variantes para Firestore de servicio, `IA_POLITICA_JSON`, `IA_LLAVES_CLAVE_MAESTRA`, `EMAIL_PROVEEDOR` + `SMTP_URL`/`RESEND_API_KEY`/`SENDGRID_API_KEY` + `EMAIL_FROM`, `CRON_SECRET`, `APP_URL`. **Sin ellas el código existe pero no opera.**

### 2.3 Prueba empírica: servidor arrancado sin secretos

Se ejecutó `NODE_ENV=development npx tsx server.ts` y se hicieron peticiones locales. Resultados literales:

| Petición | HTTP | Respuesta |
|---|---:|---|
| `GET /api/health` | 200 | `{"status":"ok","geminiKeyConfigured":false,"ia":{"registro":"MEMORIA","gobierno":"MEMORIA","llaves":"NO_CONFIGURADO","titularidad":"BLOQUEADA","autenticacion":"TOKEN_FIREBASE","operaciones":12,"bloqueoComercial":"APROBACION_PENDIENTE"},"notificaciones":{"email":{"modo":"MODO_SEGURO","proveedor":null},"cron":{"configurado":false}}}` |
| `GET /api/cron/avisos` | 503 | `cron_no_configurado` — "Falta CRON_SECRET... fallo cerrado" |
| `GET /api/visita/token-de-prueba` | 503 | `PORTAL_NO_DISPONIBLE` |
| `GET /api/cuestionario/token-de-prueba` | 503 | `PORTAL_NO_DISPONIBLE` |
| `GET /api/documentacion/token-de-prueba` | 503 | `PORTAL_NO_DISPONIBLE` |
| `POST /api/notificaciones/enviar` sin token | 403 | `no_autorizado` — "Se requiere un usuario autenticado con perfil válido" |
| `POST /api/analizar-documento` sin token | 503 | `APROBACION_COMERCIAL_PENDIENTE` |

**Conclusión.** El diseño *fail-closed* es correcto y evita falsos éxitos, pero implica que **la mayoría de las funciones de servidor están 🔒 bloqueadas en un despliegue sin secretos**: portales públicos por token, custodia documental (y por tanto fotos de incidencias/lecturas y descargas), justificantes de cobro P2, actualización de renta, seguimiento de incidencias, avisos por correo, cron del día 5, las 12 operaciones IA y la búsqueda de titulares. El **checklist de puesta en marcha no es opcional**: es parte de la definición de "función implementada".

---

## 3. Inventario exacto de portales y guardas

### 3.1 Perfiles y navegación

`src/types.ts:1973` define `TipoPerfilUsuario = 'ADMINISTRADOR' | 'PROPIETARIO' | 'PROFESIONAL' | 'INQUILINO'`. El inquilino **no entra al ERP**: `App.tsx:3727` devuelve directamente `<InquilinoPortalShell>`. Los otros tres comparten el catálogo único `src/navegacion/navegacion.ts`: **31 secciones** en 6 grupos.

| Perfil | Entradas de menú (medido con `seccionesDePerfil`) | Guarda `seccionesAccesibles` | Destino inicial |
|---|---:|---|---|
| ADMINISTRADOR | 30 (todas salvo `titulares`, que usa `propietarios`) | `undefined` = sin restricción de secciones | `administracion` |
| PROPIETARIO | 24 | `SECCIONES_PROPIETARIO` = 24 secciones (`App.tsx:352-381`), coincide con el menú | `propietarios` → `PropietarioPortalSection` |
| PROFESIONAL | **5** (**7** con `GESTOR_PATRIMONIAL`: +`cobros`, +`formalizacion`) | `SECCIONES_PROFESIONAL` = **6** (**8** con `GESTOR_PATRIMONIAL`) (`App.tsx:383`) | `administracion` → `ProfesionalPortalSection` |
| INQUILINO | 0 (portal separado) | `PANTALLAS_PORTAL` = 10 pantallas | `inicio` |

**Incoherencia detectada (H-18):** el menú del profesional no ofrece `inversion`, pero la guarda sí la permite; por eso nav = 5/7 y guarda = 6/8. Es una sección "permisible pero indescubrible". En propietario y administrador menú y guarda están alineados.

`SECCIONES_PROPIETARIO` = `dashboard, propietarios, titulares, inmuebles, inversion, formalizacion, cobros, avisos, tesoreria, gastos, financiacion, conciliacion, facturacion, fiscal, informes, polizas, actas, incidencias, operaciones, recomercializacion, suministros, datos, configuracion, ayuda`.

`SECCIONES_PROFESIONAL` = `administracion, inmuebles, inversion, configuracion, ayuda, avisos`.

La guarda de ruta (`App.tsx:698-714`) redirige a `propietarios`/`administracion` si la sección no está permitida; la autorización efectiva de datos está en `scoped*` + Firestore Rules. **Es una guarda de cliente**: es correcta como UX, pero no sustituye a las reglas.

### 3.2 Secciones exclusivas de administrador

El catálogo reparte 30 entradas al administrador; de ellas, **`inquilinos`, `morosidad`, `candidatos`, `preseleccionados`, `seguro_impago` y `analisis` son exclusivas suyas**. `suministros`, `datos`, `dashboard`, `tesoreria`, `gastos`, `financiacion`, `conciliacion`, `facturacion`, `fiscal`, `informes`, `inmuebles`, `inversion`, `propietarios`, `cobros`, `formalizacion`, `recomercializacion`, `incidencias`, `operaciones`, `polizas`, `actas`, `configuracion`, `ayuda` y `avisos` se comparten total o parcialmente con propietario/profesional. En la práctica: **captación comercial, morosidad, análisis IA y portal de inquilinos son territorio del administrador**; la tesorería y la fiscalidad también las consume el propietario.

### 3.3 Superficies de portal

| Portal | Componente raíz | Pestañas / pantallas |
|---|---|---|
| Administrador | `AdminControlCenter.tsx` (1.671 líneas) + `PanelGobiernoIA` | `dashboard, usuarios, inmuebles, propietarios, profesionales, configuracion, auditoria` (7) |
| Propietario | `PropietarioPortalSection.tsx` (1.500+ líneas) | `viviendas, titularidades, profesionales, contratos, liquidaciones, morosidad, gastos, cobros, incidencias, perfil` (10) |
| Profesional | `ProfesionalPortalSection.tsx` (1.100+ líneas) | `incidencias, ficha, especialidades, zonas, asignaciones` (5) |
| Inquilino | `InquilinoPortalShell.tsx` (371 líneas) | `inicio, recibos, incidencias, suministros, mas, contrato, mensajes, documentos, historial, cuenta` (10) |
| Públicos | `Portal*Publica*View`, `*Servidor`, `Registro*View`, `InvitacionCarteraView` | solicitud, visita, cuestionario, documentación, registro autónomo, registro propietario/inquilino/cartera (7 flujos) |

---

## 4. Auditoría portal por portal

### 4.1 Portal del administrador

**Superficie y permisos.** Es el único perfil sin restricción de secciones. `App.tsx:4563` monta `PanelGobiernoIA` + `AdminControlCenter` para `administracion`. El centro de control gestiona usuarios (alta, bloqueo, baja auditada `BAJA_USUARIO`), inmuebles, propietarios, profesionales, configuración de módulos y auditoría. Recibe datos ya acotados y llama a handlers que persisten vía `save*Firestore` + `registrarAuditoriaFirestore`.

| Función | Estado | Evidencia | Qué falta / riesgo |
|---|---|---|---|
| Alta, edición, bloqueo y baja de usuarios | ✅ Real | `AdminControlCenter.tsx`, `src/lib/adminUsuarios.ts`, `App.tsx:3389-3408`, reglas `usuarios`/`usuarios_auth` con auditoría vinculada | Baja lógica, no supresión RGPD de datos personales (§6 H-14) |
| Roles predefinidos y permisos granulares | 🟡 Parcial | `ROLES_PREDEFINIDOS` (5) y `PERMISOS_SISTEMA` (`types.ts:2158`) se muestran en `CrearUsuarioModal` y se guardan en `usuario.permisos` | **No hay una sola comprobación de `usuario.permisos` en guards, render ni reglas**; solo se usa para filtrar ayuda/tutoriales (`experiencia/contexto.ts`). La autorización real es `tipoPerfil` + `propietarioId` + carteras. Catálogo decorativo (§6 H-06) |
| Módulos activables (`ModulosConfig`) | 🟡 Parcial | `modulosConfig` se persiste en `system/modulos_config`; toggles en `AdminControlCenter.tsx:1235-1250` | `App.tsx` solo lo usa en 3 líneas; `navegacion.ts` no lo consulta. **Activar/desactivar un módulo no oculta ni bloquea su sección** (§6 H-07) |
| Carteras gestionadas L/E y delegaciones parciales | ✅ Real | `src/lib/gestionesCartera.ts`, `CarterasOnboardingPanel`, reglas `gestiones_cartera`, espejo `usuarios_auth.carterasL/E` solo escrito por master | Interfaz de diagnóstico extensa; requiere proceso operativo claro para no delegar de más |
| Gobierno de IA (cuotas, créditos, bloqueos) | ✅ Real / 🔒 | `server/ia/gobiernoIA.ts`, `adminIA.ts`, `PanelGobiernoIA.tsx`; política `TODO O NADA` deniega por defecto | Sin `IA_POLITICA_JSON` + llave maestra + llave por usuario, **las 12 operaciones IA no se ejecutan** (§2.3, §5) |
| Auditoría | ✅ Real | `audit_logs` inmutable, `auditoriaVinculada()` en reglas, `AdminControlCenter` pestaña Auditoría | Solo lectura para master; sin exportación a SIEM ni retención configurable |
| Gestión de profesionales, presupuestos y valoraciones | 🟡 Parcial | Existen `ProfesionalesSection.tsx` (1.240 líneas), `PresupuestoProfesionalModal`, `ValoracionProfesionalModal`, colecciones `presupuestos_profesionales` y `valoraciones_profesionales` con reglas | **`ProfesionalesSection` no está importada ni montada en ningún sitio**; esos modelos y UI son inalcanzables desde la app (§6 H-01) |
| Panel ejecutivo / informes | ✅ Real | `DashboardEjecutivoSection`, `InformesSection`, motores puros; sin datos ficticios en el dashboard | El propio dashboard declara un "Asistente contextual IA — Preparado... No implementado ahora por especificación" (`DashboardEjecutivoSection.tsx:1147`) |
| Facturación y VERI*FACTU | 🟡 Parcial | Hash SHA-256 encadenado, QR, cola `envios_verifactu`, RRSIF, `FacturacionSection` | Transporte a AEAT **no implementado** (`VerifactuTransportPendiente`); B2B sin plataforma (§6 H-08) |
| Notificaciones y cron | ✅ Real / 🔒 | `DispatcherNotificaciones`, repositorio Firestore, `BandejaAvisosSection`, `relojAvisos.ts`, cron 06:00 UTC | WhatsApp descartado (`canales.ts:14`), sin push/SMS, sin preferencias por usuario; entrega real no verificada en producción |
| Importación/exportación y paquete del asesor | ✅ Real | `ImportExportPanel` (JSON/CSV/XLSX, dry-run), `src/lib/paqueteAsesor/motor.ts` (ZIP con hashes y manifiesto) | El propio motor declara: **"NO es una declaración tributaria, no presenta modelos fiscales ni se remite a la AEAT"** (`motor.ts:1689`) |

**Veredicto administrador:** el portal más potente y el que más valor aporta hoy. Sus problemas no son de falta de funciones, sino de **coherencia**: código muerto, permisos que no gobiernan, módulos que no modulan y un "modo producción" que depende de una configuración no verificada.

### 4.2 Portal del propietario

Se monta en `activeSection === 'propietarios'` (`App.tsx:4124`) y, por redundancia, en la rama `else` de `administracion`. Tiene 10 pestañas y reutiliza **los mismos motores puros** que el ERP (`gastosEngine`, `cobrosEngine`, `incidenciasEngine`), filtrando en cliente por `propietarioId`, `inmuebleIds` y `titularesIds`.

| Función | Estado | Evidencia | Qué falta |
|---|---|---|---|
| Mis viviendas y alta de inmueble | ✅ Real | `PropietarioPortalSection` pestaña `viviendas`; `onCrearInmueble` lleva a `InmueblesSection` con titularidad en contexto | Sin verificación catastral completa (solo coordenadas/dirección), sin mapa, sin detección de duplicados |
| N titulares y titularidades | ✅ Real | `TitularidadesPanel`, `guardarTitularidad`/`cerrarTitularidad` atómicos, índice `titularesIds`, búsqueda segura de titulares por servidor | Búsqueda de titulares 🔒 sin cuenta de servicio |
| Mis profesionales (catálogo + privados) | ✅ Real | Pestaña `profesionales`, `onSaveProfesional`, enlaces de registro | Sin invitación directa al proveedor, sin valoraciones, sin comparador de presupuestos |
| Mis contratos, cobros, gastos, liquidaciones, morosidad, incidencias | 🟡 Solo lectura en el portal | Pestañas `contratos, cobros, gastos, liquidaciones, morosidad, incidencias`; los comentarios del propio componente dicen "solo lectura" | El propietario **no puede** registrar un cobro, aprobar un gasto, verificar un justificante, responder una incidencia ni decidir sobre morosidad desde su portal; debe usar las secciones ERP completas (cuando las tiene) o delegar en administración |
| Ficha de perfil | ✅ Real | Pestaña `perfil`, `onSavePropietario` | Sin preferencias de notificación, sin 2FA, sin gestión de consentimientos |
| Liquidaciones SEPA / PDF | ✅ Real | `src/tesoreria/*`, `imprimirLiquidacionPDF`, PAIN.008/001 con IBAN mod-97 | Los ficheros SEPA **se generan pero no se entregan al banco**; sin devoluciones SEPA automáticas |
| Fiscalidad e informes | ✅ Real (interno) | `FiscalidadSection`, `InformesSection`, expediente fiscal ZIP | Sin modelos 100/115/303/147 oficiales ni presentación telemática; competidores españoles sí los ofrecen (§8) |
| Mensajería con inquilino | ❌ Ausente | `InquilinosSection` (mensajes) es **ADMINISTRADOR** en `navegacion.ts` y en `App.tsx:4413` | El propietario no tiene bandeja de mensajes con su inquilino; el mercado lo considera básico |
| Captación / candidatos / visitas / seguro de impago | ❌ Ausente | Excluidos de `SECCIONES_PROPIETARIO`; `candidatos`, `preseleccionados`, `seguro_impago`, `analisis` son ADMINISTRADOR | El propietario no ve el embudo de alquiler de sus inmuebles ni puede decidir sobre candidatos |

**Veredicto propietario:** excelente como **portal de transparencia patrimonial y consulta económica**, pero no como **portal de acción**. Falta cerrar el círculo: mensajería, verificación de justificantes, aprobación de presupuestos/gastos y visibilidad de captación.

### 4.3 Portal del profesional

Se monta solo en `activeSection === 'administracion'` para `PROFESIONAL` (`App.tsx:4604`). Sus 5 pestañas son `incidencias` (por defecto), `ficha`, `especialidades`, `zonas` y `asignaciones`. Suscribe en tiempo real `trabajos_profesionales` e `incidencias` con `scope.profesionalId` (BLOQUE 12 A-01), de modo que las reglas `list` por `profesionalId` funcionan.

| Función | Estado | Evidencia | Qué falta |
|---|---|---|---|
| Ficha profesional (nombre, CIF, contacto, web) | ✅ Real | `handleGuardarPerfil`, `onSaveProfesional` | Sin documentos profesionales (P5) accesibles desde el portal, sin verificación de identidad/seguro de RC |
| Especialidades y zonas de servicio | ✅ Real | `handleToggleEspecialidad`, `handleAddZona`, catálogo `especialidades` | Valores por defecto de demo (`['Fontanería','Electricidad']`, zona Almería/Vera) si no hay ficha |
| Incidencias asignadas y trabajos | ✅ Real | `subscribeIncidencias`, `subscribeTrabajosProfesionales`, `DetalleTrabajoProfesionalModal`, `TrabajoProfesionalModal`, cambio de estado | Sin SLA, sin priorización automática, sin reparto por disponibilidad, sin calendario |
| Viviendas asignadas | ✅ Real | `profesional.inmuebleIdsAsignados` | Sin vista de calendario/ruta, sin checklists móviles, sin firma del trabajo en campo |
| Presupuestos, valoraciones y facturas del proveedor | ❌ Inalcanzable | `presupuestos_profesionales`, `valoraciones_profesionales`, modales y reglas existen; `ProfesionalesSection.tsx` (1.240 líneas) **no se monta** | El profesional no puede enviar un presupuesto ni una factura desde su portal; la administración tampoco tiene la UI montada |
| Canal con inquilino/propietario | ❌ Ausente | No hay `mensajes_portal` para profesional | Sin chat, sin fotos de campo, sin evidencia de llegada |
| App móvil / offline / push | ❌ Ausente | Sin manifest ni service worker (`index.html` no declara PWA) | El mercado ofrece apps iOS/Android y captura de fotos desde el móvil (§8) |

**Veredicto profesional:** es el **portal más débil**. Funciona como "bandeja de trabajos asignados", no como herramienta de trabajo del proveedor. El dominio ya modela presupuestos, valoraciones y documentos: **falta cablearlos**, no inventarlos.

### 4.4 Portal del inquilino

`InquilinoPortalShell.tsx` es una SPA móvil independiente (`max-w-md`, 5 pestañas). `usePortalInquilino.ts` carga contratos, inmuebles, mensajes, incidencias y suministros por ámbito. Es el portal más cuidado en UX (ayuda contextual, tutoriales, asistente IA, sanitización de contrato).

| Pantalla | Estado | Evidencia | Qué falta |
|---|---|---|---|
| Inicio | ✅ Real | `PortalInicio.tsx` con vivienda, incidencias, mensajes no leídos, suministros | Sin notificaciones push ni resumen de próximo pago en pantalla de bloqueo |
| Recibos y pagos | 🟡 Parcial | `PortalRecibos.tsx` muestra estados `PENDIENTE/RECIBIDO/VERIFICADO/RETRASADO/INCIDENCIA`, descarga justificante y abre `PresentarJustificanteCobro` | **No hay pago online**: solo IBAN para transferencia manual. Sin tarjeta, Bizum, domiciliación ejecutada ni TPV |
| Presentar justificante de cobro (P2) | ✅ Real / 🔒 | `PresentarJustificanteCobro.tsx` → `server/cobros/justificantesCobro.ts` (subida, consulta, decisión, auditoría, descarga) | Requiere cuenta de servicio; **aceptar el justificante NO registra el cobro** (decisión correcta, pero exige paso manual en `CobrosSection`) |
| Incidencias + asistente IA | ✅ Real / 🔒 | `PortalIncidencias.tsx` crea incidencia, fotos, histórico, `AsistenteIncidenciaAsistida.tsx`, `EvolucionIncidenciaPortal.tsx`, `sincronizarSeguimientoIncidencia` | Asistente bloqueado por política IA; fotos requieren `/api/documentos/*`; sin chatbot 24/7 ni voz |
| Suministros | ✅ Real | `PortalSuministros.tsx` (549 líneas): lecturas inmutables con corrección trazada, foto de contador, cambio de titular | Sin importación automática de facturas de suministros ni OCR de lecturas; sin IoT |
| Mi contrato | ✅ Real | `PortalContrato.tsx`: PDF, IBAN, vigencia, arrendador, cláusulas, acta | Sin firma electrónica del contrato; sin aceptación de actualización de renta |
| Mensajes | ✅ Real | `PortalMensajes.tsx` → `mensajes_portal`; `InquilinosSection` (admin) responde y marca leídos | El propietario no participa; sin adjuntos avanzados ni push |
| Documentos / Historial / Cuenta | ✅ Real (lectura) | `PortalDocumentos`, `PortalHistorial`, `PortalCuenta` | Cuenta solo muestra datos y logout: sin cambio de contraseña, 2FA, idioma ni preferencias |
| Alta | 🟡 Parcial | `RegistroInquilinoView.tsx` por invitación vinculada a contrato (`?registroInq=`) | Sin alta autónoma; la recuperación de contraseña existe en `LoginView`/`authService` pero no dentro del shell; sin multiidioma |
| Actas firmadas | ✅ Real (lectura) | `inquilino/actasAdapter.ts` sanea antes de mostrar | Pero el circuito de firma OTP está roto (§6 H-03) |

**Veredicto inquilino:** el mejor portal de cara al usuario y el más alineado con el mercado en incidencias, documentos y justificantes. Su gran ausencia es el **pago dentro de la app** y la **firma**; ambas son exactamente las funciones que más reducen morosidad y fricción en los competidores.

### 4.5 Portales públicos (candidatos y registros)

| Flujo | Estado | Evidencia | Qué falta |
|---|---|---|---|
| Solicitud pública de alquiler | 🟡 Parcial | `PortalSolicitudPublicaView.tsx`, `registrarSolicitudPublica` (alias `nombre/email/telefono` que exigen las reglas), ficha pública mínima | Escritura directa anónima en Firestore; sin CAPTCHA/rate limit; **sin bandeja de revisión** (§6 H-02, H-04) |
| Reserva de visita | ✅ Real / 🔒 | `PortalVisitaPublicaServidor` → `GET/POST /api/visita/:token`, reserva atómica en servidor | Sin iCal/Google Calendar, sin recordatorios automáticos al candidato, sin videovisita |
| Cuestionario público | ✅ Real / 🔒 | `CuestionarioPublicoServidor` → `/api/cuestionario/:token`, lista blanca de campos | Sin verificación de identidad; sin firma de consentimiento versionada |
| Documentación post-visita | ✅ Real / 🔒 | `PortalDocumentacionPublicaServidor` → `/api/documentacion/:token`, subida por sesión autorizada | Sin verificación externa de documentos (ASNEF/FIM/INFORMA/DNI) |
| Registro autónomo/propietario/profesional/inquilino/cartera | ✅ Real | `RegistroAutonomoView`, `PortalRegistroView`, `RegistroInquilinoView`, `InvitacionCarteraView`, `authService` | Sin verificación de email obligatoria, sin 2FA, sin aprobación configurable de altas autónomas |
| Publicación en portales inmobiliarios | 🧪 Preparado | `PublicacionInmueblesPanel.tsx:461` dice "sin publicar automáticamente"; `src/sindicacion/adaptadores.ts` devuelve `PORTAL_NO_CONECTADO`; `publicacionPortales.ts` declara KYERO (feed generable) e IDEALISTA/FOTOCASA/HABITACLIA pendientes de acceso | Faltan credenciales/API de cada portal y un catálogo público propio con SEO |

---

## 5. Inventario transversal de capacidades

| # | Dominio | Estado | Evidencia clave | Integración que falta |
|---|---|---|---|---|
| 1 | Identidad, roles, carteras L/E | ✅ Real | `authService.ts`, `usuarios_auth`, `gestiones_cartera`, reglas 2230+ | Multi-tenancy real, 2FA, master configurable |
| 2 | Inmuebles, titularidades, Catastro | 🟡 Parcial | `InmueblesSection.tsx` (3.951 líneas), `titularidadesEngine`, `POST /api/catastro/consultar` | Catastro solo da coordenadas/dirección; sin superficie/año/valor, sin certificado energético obligatorio, sin nº de registro de alquiler de corta duración |
| 3 | Captación y scoring de candidatos | 🟡 Parcial | `solvenciaEngine`, `CandidatosSection`, cuestionario, 12 análisis IA | Screening externo, verificación documental, bandeja de solicitudes, antispam |
| 4 | Contratos LAU y ciclo | ✅ Real | `contratoEngine`, `CicloContractualPanel`, anexos versionados, prórrogas, rescisión | Firma electrónica cualificada, depósito legal de fianza autonómica |
| 5 | Actualización anual de renta (IRAV) | 🟡 Parcial | `server/actualizacionRenta/*`, `actualizacionRentaEngine.ts` con `FUENTES_IRAV_OFICIALES` | **Snapshot IRAV codificado** con guardia de 45 días; sin feed INE; la UI dice explícitamente "no se envía correo, no se publica en la bandeja, no se firma" (`ActualizacionRentaPreviewPanel.tsx:207`) |
| 6 | Cobros y justificantes | 🟡 Parcial | `cobrosEngine`, `CobrosSection`, P2 | Pasarela de pago, SEPA ejecutado, conciliación automática |
| 7 | Gastos y OCR | 🟡 Parcial | `gastosEngine`, `EscanerFacturaModal` con **Tesseract local** y SHA-256 | OCR/IA de facturas en servidor, captura por email, verificación de proveedor |
| 8 | Tesorería / SEPA | 🟡 Parcial | `src/tesoreria/*`: PAIN.008/001, IBAN mod-97, liquidaciones, PDF | Entrega al banco, devoluciones, saldo real |
| 9 | Conciliación bancaria | 🟡 Parcial | Parsers MT940/OFX/Norma 43/CSV + `matchingEngine` | **Conexión PSD2/open banking**; hoy `FinanciacionSection.tsx:118` dice "Sin credenciales ni conexión bancaria" |
| 10 | Facturación / VERI*FACTU | 🟡 Parcial | `FacturacionSection`, hash encadenado, QR, RRSIF, cola | Transporte AEAT (`VerifactuTransportPendiente`), declaración responsable de SIF, certificado |
| 11 | Factura electrónica B2B | 🧪 Preparado | `facturaElectronicaB2BService`, CII/UBL/Facturae; `AdaptadorSpfeB2B.disponible() = false` | Plataforma SPFE/FACeB2B o privada certificada; el código dice "pendiente de orden ministerial" y eso ya no es cierto (§8.3) |
| 12 | Fiscalidad IRPF / paquete asesor | 🟡 Parcial | `expedienteFiscal/motor.ts`, `paqueteAsesor/motor.ts` (ZIP con índice y hashes) | Modelos oficiales 100/115/303/147 y presentación; el motor declara que no es declaración tributaria |
| 13 | Morosidad y recobro | ✅ Real | Máquina de estados, política D+3/D+10/D+20/D+30, evidencias, MASC LO 1/2025 | Integración con aseguradora, burofax/correo certificado, presentación judicial |
| 14 | Seguro de impago | 🟡 Parcial | Expediente completo, **Gmail API real** (`gmailClient.ts`), borrador IA | Sin API de aseguradora; hay **respuesta simulada** explícita en `DetalleSolicitudSeguroModal.tsx:480-500` y extracción simulada en `DetallePolizaModal.tsx:240-254` |
| 15 | Incidencias, mantenimiento y proveedores | 🟡 Parcial | `IncidenciasSection`, `OperacionesSection`, `trabajos_profesionales`, preventivo, garantías | SLA, dispatch automático, app de campo, portal de proveedor completo |
| 16 | Actas entrada/salida | 🟡 Parcial | Inventario, evidencias, comparación determinista, PDF versionado | **OTP no entregado** y `Math.random()` (§6 H-03); sin firma eIDAS |
| 17 | Suministros | ✅ Real | CUPS, lecturas inmutables, cambios de titular, reparto | Facturas de suministros automáticas, IoT, OCR de contadores |
| 18 | Recomercialización | 🟡 Parcial | Inspección, reformas/ROI, pricing, kit de publicación (IA) | Publicación real en portales, datos de mercado/AVM, tour virtual |
| 19 | Sindicación / publicación | 🧪 Preparado | Modelo normalizado, hash canónico, idempotencia, 4 portales declarados | Adaptadores reales; hoy `PORTAL_NO_CONECTADO` |
| 20 | Notificaciones | 🟡 Parcial | Dispatcher, EMAIL real/safe-mode, INAPP, WEBHOOK, cron día 5 | WhatsApp, SMS, push, preferencias, plantillas editables, verificación de entrega en producción |
| 21 | IA (12 operaciones) | 🔒 Bloqueado por diseño | `server/ia/nucleoIA.ts`: token verificado, idempotencia, cuotas, créditos, llave propia cifrada | Política comercial aprobada, llave maestra, llave por usuario, prueba con proveedor; hoy `/api/health` = `APROBACION_PENDIENTE` |
| 22 | Asistente y ayuda contextual | 🟡 Parcial | `src/experiencia/*`, 3 consultas tipadas, tutoriales, progreso persistido | Agente que **ejecute** flujos (mercado 2026), voz, multilingüe; el dashboard declara el asistente contextual "solo preparado" |
| 23 | Importación/exportación | ✅ Real | `erp-import-export-v1`, dry-run, XLSX, procedencia, paquete asesor | API pública, conectores contables (A3, SAGE, Holded, Xero, QuickBooks) |
| 24 | Custodia documental | ✅ Real / 🔒 | `server/documentos/*`, SHA-256, token rotatorio P3/P5, fail-closed | Configuración de cuenta de servicio y bucket; verificación byte a byte en entorno real |
| 25 | Accesibilidad, i18n, móvil | 🟡 Parcial | `src/accesibilidad/*` (diálogos, foco, aria), 348 atributos `aria-*` | Sin auditoría WCAG/EN 301 549, sin PWA/app, sin service worker, **solo español** (`index.html lang="es"`) |

---

## 6. Hallazgos priorizados

> Severidad: **S0** crítico (pérdida/ exposición activa demostrada) · **S1** alto (flujo central roto o riesgo serio) · **S2** medio (función incompleta o incorrecta acotada) · **S3** bajo (deuda/higiene).

### H-01 · S2 — Cuatro secciones completas están muertas

`CuestionarioSection.tsx` (332), `SolicitudesSection.tsx` (332), `AdministracionSection.tsx` (1.117) y `ProfesionalesSection.tsx` (1.240) **no se renderizan**. Las tres primeras se importan en `App.tsx` pero no se usan como JSX; la cuarta no se importa. `App.tsx:4563` usa `AdminControlCenter` en lugar de `AdministracionSection`, y `App.tsx:4504` usa `CandidatosSection` para `candidatos|solicitudes|nuevo_candidato|cuestionario`. Consecuencias: UI duplicada, etiquetas "Próximamente" en código inalcanzable (`AdministracionSection.tsx:820`), y **la gestión profesional con presupuestos/valoraciones no existe en la app**. **Acción:** decidir una única UI por dominio, montar `ProfesionalesSection` (o migrar sus paneles a `AdminControlCenter`/portal profesional) y eliminar el resto.

### H-02 · S1 — La solicitud pública se guarda pero no se puede revisar

`handleSavePublicSolicitud` persiste en `solicitudes` y crea un `candidato` **secundario best-effort** (`src/lib/solicitudPublica.ts`, `App.tsx:2482-2530`). `SolicitudesSection` está muerta y `SolicitudDetailModal` solo se renderiza con `selectedSolicitudForModal`, que **nunca se asigna desde una lista** (`App.tsx:494, 2565, 2599, 4759`). La sección `solicitudes` del menú muestra `CandidatosSection`; `PreseleccionadosSection` solo usa `solicitudes.find(...)` para rellenar datos por defecto de una invitación, no para revisar la solicitud. **Efecto:** no existe una bandeja donde abrir, valorar y cambiar el estado de una solicitud pública; si la escritura del candidato falla (se registra solo en consola), el lead queda en `solicitudes` sin ninguna pantalla que lo muestre. **Acción:** resucitar `SolicitudesSection` o añadir una bandeja `solicitudes` en `CandidatosSection`, cablear `setSelectedSolicitudForModal`, y mostrar estado de conversión solicitud→candidato.

### H-03 · S1 — Firma de actas por OTP no operativa y criptográficamente débil

`ActasSection.tsx:203-230` llama a `crearOtpActa({ canal: 'PENDIENTE_PROVEEDOR' })`, descarta `codigoPlain` y guarda solo `codigoHash`; `firestore.rules:3630` permite `codigoPlainTemporal` solo en canal `MANUAL`. No hay envío por email/SMS ni adaptador de transporte. Además `generarCodigoOtp()` usa `Math.random()` (`actaOtpEngine.ts:30-36`), no `crypto.getRandomValues`. **Efecto:** el firmante nunca recibe el código; el flujo "Solicitar firma + OTP → Validar OTP y firmar" no puede completarse. **Acción:** generar con CSPRNG, enviar el código por el dispatcher de notificaciones (email/SMS) con expiración/intentos, o integrar firma cualificada (Signaturit/FNMT/eIDAS) como hacen los competidores.

### H-04 · S1 — Escrituras anónimas sin antispam ni rate limit

`firestore.rules:2081-2095` permite `create` de `solicitudes` sin sesión con solo `nombre, email, telefono, inmuebleId, estado`; `firestore.rules:2049-2070` permite `create` anónimo de `candidatos`. `server.ts:2215` (`/api/catastro/consultar`) tampoco exige sesión ni límite. No hay `express-rate-limit`, CAPTCHA, reCAPTCHA (el `recaptchaSiteKey` del config está vacío), `helmet` ni límites de longitud en esas reglas; `express.json({limit:'50mb'})` aplica a todas las rutas. **Efecto:** spam, abuso de funciones serverless y contaminación de la cartera. **Acción:** mover también la solicitud pública a un endpoint de servidor con token de capacidad (como ya se hizo con visita/cuestionario/documentación), añadir rate limiting por IP/token, honeypot/CAPTCHA y límites de tamaño por ruta.

### H-05 · S2 — Un único "master" codificado y datos demo en producción

`firestore.rules:29` define `isMasterAdmin()` comparando con un **correo Gmail literal**; el mismo valor por defecto aparece en `authService.ts:43`, `firebase.ts:3431/3560` y `AdminControlCenter.tsx:247`. Matiz importante para la hoja de ruta: **`server/titularidades/backendTitulares.ts:48` ya lee `process.env.MASTER_ADMIN_EMAIL`** con ese correo como fallback, así que el backend está parcialmente parametrizado, pero **la autoridad real (`firestore.rules`) y el cliente siguen codificados**. `seedInitialDataIfEmpty()` se ejecuta en el primer login de administrador (`App.tsx:1278`) y `seedAuthAndRolesIfEmpty()` (`firebase.ts:3421-3484`) crea usuarios demo, profesional demo, especialidades, aseguradoras y configuración. `App.tsx:391-430` inicializa el estado con `INITIAL_*` de `mockData.ts` y caché `localStorage`. **Efecto:** proyecto atado a una persona, riesgo de datos de demostración en un entorno real y de presentar datos locales como reales. **Acción:** parametrizar el master (claim/rol en `usuarios_auth`), desactivar seeds con flag de entorno, arrancar estados vacíos y borrar caché local al cambiar de usuario.

### H-06 · S2 — Los permisos granulares no autorizan nada

`PERMISOS_SISTEMA` y `ROLES_PREDEFINIDOS` se guardan en `usuario.permisos/roles`, pero no existe `tienePermiso()` en guards, render ni reglas; solo `contextoTienePermiso()` filtra ayuda/tutoriales. **Efecto:** un administrador que asigna `inmuebles.crear` a un rol cree que limita algo; en realidad manda `tipoPerfil` + `propietarioId` + carteras. **Acción:** o implementar comprobación real (UI + reglas), o renombrar la pantalla a "catálogo informativo" para no dar falsa sensación de control.

### H-07 · S2 — Los toggles de módulos son cosméticos

`modulosConfig` solo se usa en `App.tsx:542/3546/4578`, `AdminControlCenter` y `AdministracionSection`; `gruposDePerfil()` en `navegacion.ts` no lo consulta y ninguna sección comprueba su flag. **Acción:** o aplicar los flags en navegación y render, o quitar los switches.

### H-08 · S1 — Cumplimiento fiscal: buen motor, integración ausente y textos desactualizados

`src/utils/verifactuTransport.ts:38-60` declara: *"Conexión real con la AEAT no implementada"*. `AdaptadorSpfeB2B` y `AdaptadorPlataformaPrivadaPendiente` (`adaptadoresB2B.ts:70-140`) devuelven `disponible() = false` y afirman que el calendario/orden ministerial está pendiente. **A 27-10-2026 eso ya no es correcto**: la AEAT publicó la Orden HAC/1028/2026, en vigor el 6-10-2026, con obligación de factura electrónica B2B el **6-10-2027** (>8 M€) y **6-10-2028** (resto) [22](https://sede.agenciatributaria.gob.es/Sede/iva/factura-electronica/calendario-implantacion.html) [2](https://www.boe.es/buscar/act.php?id=BOE-A-2026-7295). Y VERI*FACTU/RRSIF es obligatorio el **1-1-2027** para contribuyentes del Impuesto sobre Sociedades y el **1-7-2027** para el resto [2](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/nota-informativa-ampliacion-plazo-adaptacion-facturacion.html) [3](https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2025/diciembre/3/ampliacion-plazo-adaptacion-sistemas-informaticos-facturacion.html). **Acción:** actualizar comentarios, decidir si el ERP será SIF VERI*FACTU o "no verificable", implementar transporte AEAT con certificado en backend, conectar plataforma B2B y publicar declaración responsable.

### H-09 · S2 — IRAV codificado en el código

`actualizacionRentaEngine.ts:73-85` contiene solo dos observaciones IRAV (2026M08=2,47 %, 2026M09=2,54 %) con `consultadoEn: 2026-10-17` y un guardia `MAX_DIAS_ANTIGUEDAD_FUENTE_IRAV = 45`. El INE publica el IRAV **mensualmente** [1](https://www.ine.es/uc/oC7D0Ncd) [4](https://www.ine.es/prensa/IRAV.pdf). **Efecto:** a partir de ~finales de noviembre de 2026 el motor empezará a rechazar cálculos hasta que se redeploye código. **Acción:** servicio servidor que descargue la serie IRAV1 del INE, la versione y la firme; el motor consume la fuente, no una constante.

### H-10 · S2 — La app "IA" está apagada por defecto (correcto, pero se percibe como implementada)

`server/ia/configuracionIA.ts` y `gobiernoIAContrato.ts` deniegan todo hasta `IA_POLITICA_JSON` válida; `IA_LLAVES_CLAVE_MAESTRA` y llave por usuario son obligatorias. En la UI hay botones "Analizar con Gemini", "Redactar cláusula IA", "Asistente IA" en decenas de pantallas. Empíricamente `/api/analizar-documento` devuelve 503 `APROBACION_COMERCIAL_PENDIENTE`. **Acción:** mostrar en la UI el estado real del proveedor (ya existe `PanelGobiernoIA`), deshabilitar botones con explicación cuando falte política/llave, y decidir comercialmente el modelo de coste antes de activar.

### H-11 · S2 — Integración Gmail comparte instancia Firebase Auth

`src/lib/googleAuth.ts:11-20` hace `getApps().length === 0 ? initializeApp(...) : getApps()[0]` y `getAuth(app)`, igual que `src/lib/firebase.ts:137`. Por tanto el popup de Google para enviar correos a la aseguradora usa **la misma instancia Auth** que la sesión email/contraseña del ERP, con scopes `gmail.send` y `gmail.readonly`. **Riesgo:** `signInWithPopup` puede reemplazar al usuario actual y desincronizar `onAuthStateChanged`/`usuarios_auth`. Es una observación estática: requiere prueba con Firebase real para confirmar el efecto. **Acción:** usar una segunda app Firebase con nombre (`initializeApp(config, 'gmail')`) o, mejor, mover el envío a backend con OAuth de servicio y el dispatcher de notificaciones.

### H-12 · S2 — Sin API, PWA, push ni multiidioma

No hay `manifest`, service worker, `@react-pwa`, i18n ni app móvil. El competidor medio ofrece app iOS/Android, API pública y marketplace (§8). **Acción:** PWA primero (manifest + service worker + push vía Web Push), luego API REST/GraphQL versionada con tokens de organización.

### H-13 · S2 — Bundle y dependencias

`npm run build` genera un chunk principal de **5.545,94 kB (1.380,26 kB gzip)**; solo OCR/PDF están en chunks dinámicos. `npm audit --omit=dev` = **9 vulnerabilidades (1 crítica, 8 altas)**: `dompurify@3.4.15` (crítica, vía `jspdf`), `nodemailer@6.10.1`, `body-parser@1.20.8` (vía Express 4), `source-map-js@1.2.1`, `vite@6.4.3`, `@grpc/grpc-js@1.9.16` (vía `firebase@12.19.0`/`@firebase/firestore@4.17.2`). Hay versiones corregidas: `dompurify@3.4.17`, `nodemailer@10.2.1`, `source-map-js@1.2.2`, `vite@6.4.5`, `@grpc/grpc-js@1.14.6`, `firebase@13.1.0`. **Acción:** `overrides` para `dompurify`, `body-parser`, `source-map-js`, `@grpc/grpc-js`; subir Vite a 6.4.5; planificar migración de `nodemailer` y `firebase` con pruebas; code-splitting por sección.

### H-14 · S2 — RGPD incompleto

Hay consentimiento en `PortalSolicitudPublicaView.tsx:877-891` y un texto genérico de privacidad (`Responsable: El propietario arrendador... sin plazo de retención, sin contacto DPO, sin transferencias internacionales`). Existe borrado administrativo de candidatos, pero **no hay un flujo de ejercicio de derechos del interesado (DSAR)** con supresión/anonimización trazable, ni política de retención de documentos, ni registro de consentimientos versionado, ni configuración por organización. **Acción:** políticas configurables, registro de consentimiento, DSAR (acceso/rectificación/supresión/portabilidad) y caducidad de solicitudes/documentos.

### H-15 · S3 — Pruebas y CI dependientes del historial Git

2 pruebas de `tests/guardia-a04-rama-sesion.test.ts` y 3 de `test:integracion` fallan en este checkout **superficial** porque exigen refs/commits históricos (`f782…`, `46bb…`). El CI excluye la guardia A-04 y usa `fetch-depth: 0`; `test:integracion` **no está en CI**. No hay script `npm test` único. **Acción:** hacer que esas pruebas salten con mensaje claro cuando falten objetos Git, añadir `npm test` que encadene Vitest + node:test + auditoría, e incluir `test:integracion` en CI.

### H-16 · S3 — Datos económicos en arrays embebidos

`ContratoFormalizacion.registroCobros?: CobroPeriodo[]`, `incidenciaIds`, `mensajeIds` y `anexos` viven dentro del documento de contrato (`types.ts:1351-1388`). Firestore limita un documento a **1 MiB (1.048.576 bytes)** [1](https://firebase.google.com/docs/firestore/quotas). **Efecto:** contratos largos con recibos, justificantes y anexos pueden agotar el límite y bloquear escrituras. **Acción:** migrar `registroCobros` a subcolección `contratos/{id}/cobros` con índices, manteniendo una vista derivada para compatibilidad.

### H-17 · S3 — Documentos internos sobredimensionan el estado

`docs/AUDITORIA-GLOBAL-ERP-2026-10-20.md` y `docs/INFORME-AUDITORIA-CRITICA-GESTOR-INMUEBLES-2026-10-16.md` describen hallazgos ya corregidos en este HEAD (AG-01/AG-02/AG-03/AG-04). Esta auditoría los da por **cerrados en código**, con la salvedad de que no se ha verificado el despliegue. **Acción:** marcar su estado y evitar que la documentación prometa integraciones que siguen pendientes.

### H-18 · S3 — Menú y guarda no coinciden en el perfil profesional

Ejecutando `seccionesDePerfil('PROFESIONAL')` se obtienen 5 secciones (7 con `gestorPatrimonial`), mientras `SECCIONES_PROFESIONAL` contiene 6 (8 con gestor). La diferencia es `inversion`: permitida por la guarda pero no ofrecida en `navegacion.ts`. **Efecto:** función indescubrible y ayuda/tutoriales que pueden apuntar a una sección que el usuario no ve. **Acción:** añadir `inversion` al catálogo para PROFESIONAL o quitarla de la guarda; añadir una prueba de paridad menú↔guarda para los tres perfiles.

---

## 7. Validación ejecutada (resultados reproducibles)

| Comando | Resultado en este commit |
|---|---|
| `npm ci --no-audit --no-fund` | ✅ 416 paquetes instalados (Node 22) |
| `npx tsc --noEmit` | ✅ **EXIT 0**, 0 errores |
| `npm run build` | ✅ **EXIT 0** en 14,97 s. `dist/index.html`, CSS 176,29 kB, chunk principal **5.545,94 kB / 1.380,26 kB gzip**, `dist/server.cjs` 649,7 kB. Aviso de Vite: chunks >500 kB |
| `npx vitest run --reporter=dot` | ⚠️ **276 archivos / 4.943 pruebas**: 4.932 pasan, 2 fallan, 2 skipped, 7 todo. Fallos solo en `tests/guardia-a04-rama-sesion.test.ts` (la guardia devuelve `BLOCKED` porque en este clon superficial faltan `refs/remotes/origin/*`; el CI excluye ese archivo) |
| `npm run test:integracion` | ⚠️ **302 pruebas**: 299 pasan, 3 fallan. Los 3 son guardas de custodia que exigen commits históricos `f782…`/`46bb…` no presentes en el clon superficial. No son fallos de negocio |
| `npm audit --omit=dev` | ❌ **9 vulnerabilidades: 1 crítica + 8 altas** (detalle en H-13) |
| Servidor sin secretos | ✅ `/api/health` 200 con `MODO_SEGURO`, `llaves: NO_CONFIGURADO`, `bloqueoComercial: APROBACION_PENDIENTE`; resto 503/403 según lo previsto (§2.3) |
| `seccionesDePerfil()` (paridad menú↔guarda) | ⚠️ ADMIN 30, PROPIETARIO 24, PROFESIONAL 5 (7 con gestor); la guarda profesional permite 6 (8). Detecta H-18 |
| `npm run test:emulador:reglas` | ⏭️ No ejecutado: requiere Java 21 + descarga del emulador. El workflow `.github/workflows/emulador-reglas.yml` sí lo ejecuta en PR (job `reglas-emulador`), además de `tsc`, Vitest y build (job `verificacion`) |

**CI actual:** se dispara en `pull_request`, `workflow_dispatch` y `push` solo a dos ramas Arena antiguas; **no en `push` a `main`**. El job de verificación excluye explícitamente la guardia A-04. No hay E2E de navegador, ni pruebas de carga, ni pruebas de reglas Storage en CI (sí Firestore).

---

## 8. Comparación con el mercado (octubre de 2026)

> Aviso: funciones de competidores tomadas de su documentación pública y comparativas de 2026; no se han probado sus productos. Precios orientativos de planes públicos, no comparables 1:1 con un despliegue propio.

### 8.1 Posicionamiento

Esta app **no compite hoy como SaaS**: es un ERP interno de un único proyecto Firebase, sin precio, sin organización multi-tenant, sin API pública, sin app móvil y con la IA apagada. Su ventaja diferencial es la **profundidad jurídico-económica española** (LAU, IRAV, RDL 29/2026, MASC LO 1/2025, N titulares, carteras L/E, actas, morosidad, VERI*FACTU hash, expediente fiscal). Su desventaja es todo lo que ocurre **fuera del ERP**: dinero, identidad, firma, canales y ecosistema.

### 8.2 Referentes y funciones declaradas

| Producto | Núcleo declarado | Fuente |
|---|---|---|
| **Buildium** | Contabilidad de gestión (libro mayor, conciliación, trust accounting), pagos online ACH/tarjeta, Resident Center + Owner Portal, screening, eSignature, sindicación de anuncios, inspecciones, Marketplace y **Open API** (plan Premium) | [3](https://www.buildium.com/) [4](https://www.buildium.com/blog/buildium-vs-appfolio/) [2](https://www.buildium.com/blog/best-commercial-property-management-software/) |
| **DoorLoop** | Pagos online ACH/tarjeta, screening (crédito/antecedentes/desahucios), mantenimiento con fotos desde el portal, contabilidad y conciliación, owner/tenant portals, autopay, **API completa y Zapier** | [3](https://www.doorloop.com/) [4](https://www.doorloop.com/pricing) [10](https://www.doorloop.com/faq) |
| **AppFolio** | IA agentiva Realm-X (leasing, mantenimiento, mensajería, contabilidad), screening, pagos, inspecciones móviles, portales y API por nivel | [1](https://www.appfolio.com/blog/best-property-management-softwares-compared-2026) [16](https://www.appfolio.com/articles/performers) |
| **Rentger** (España) | Portal inquilino/propietario, publicación en portales, calendario de visitas e **iCal**, screening y scoring, validación documental, firma online, actualización automática de renta, alertas, **SLA de proveedores**, presupuestos/facturas asociados a incidencias, **conexión bancaria (+300 bancos)**, TPV online, SEPA cobros/pagos, conciliación, informes fiscales y exportación a A3/SAGE/Contasol | [7](https://app.rentger.com/software_program_integral_management_rental) [6](https://www.rentger.com/funcionalidad/portal-inquilino-gestion-alquiler) [7](https://www.rentger.com/funcionalidad/programa-de-gestion-integral-alquiler) [9](https://www.rentger.com/integraciones) [13](https://www.rentger.com/precios) |
| **Homming** (España) | Cuatro portales (gestor, propietario, inquilino, **proveedor**), firma digital Signaturit, scoring de inquilinos, pagos con tarjeta/transferencia, conexión bancaria, conciliación, liquidaciones, publicación en Idealista, **API**, **app iOS/Android personalizada**, agente IA, escáner de facturas y Verifactu en planes altos | [1](https://homming.com/en/functionalities/manager-tenant-proprietary-and-provider-portals) [10](https://homming.com/planes-de-precios) [5](https://homming.com/en/proprietaries) [11](https://help.homming.com/es/collections/3557938-portal-inquilino) |
| **Rentila** (España) | Herramienta madura y económica (plan gratis 1 inmueble), contratos, recibos, gastos, contabilidad, documentos, asistente IA, importaciones bancarias | [4](https://www.rentila.es/) [5](https://www.rentila.es/tour) [9](https://www.flatifly.com/blog/flatifly-vs-rentila) |

### 8.3 Marco regulatorio que cambia las prioridades

| Hito | Fecha | Fuente |
|---|---|---|
| VERI*FACTU / RRSIF: adaptación obligatoria para contribuyentes del Impuesto sobre Sociedades | **1-1-2027** | [3](https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2025/diciembre/3/ampliacion-plazo-adaptacion-sistemas-informaticos-facturacion.html) [2](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/nota-informativa-ampliacion-plazo-adaptacion-facturacion.html) |
| VERI*FACTU / RRSIF: resto de obligados | **1-7-2027** | [2](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/nota-informativa-ampliacion-plazo-adaptacion-facturacion.html) |
| Factura electrónica B2B: Orden HAC/1028/2026 en vigor; obligación >8 M€ | **6-10-2027** | [22](https://sede.agenciatributaria.gob.es/Sede/iva/factura-electronica/calendario-implantacion.html) [2](https://www.boe.es/buscar/act.php?id=BOE-A-2026-7295) |
| Factura electrónica B2B: resto de empresas/autónomos | **6-10-2028** | [22](https://sede.agenciatributaria.gob.es/Sede/iva/factura-electronica/calendario-implantacion.html) |
| IRAV del INE, publicación mensual (sep-2026 = 2,54 %, publicado 14-10-2026) | mensual | [1](https://www.ine.es/uc/oC7D0Ncd) [4](https://www.ine.es/prensa/IRAV.pdf) |
| Registro único / Ventanilla Única Digital de alquileres de corta duración: efectos desde 1-7-2025; número de registro obligatorio para anunciarse | vigente | [1](https://www.mivau.gob.es/vivienda/ventanilla-unica/alquiler-de-alojamientos-de-corta-duracion) [6](https://www.mivau.gob.es/vivienda/ventanilla-unica/plataformas-en-ventanilla-unica-digital) |

**Lectura:** la app ya modela IRAV y VERI*FACTU, pero con fuentes codificadas y transporte ausente. El reloj regulatorio convierte H-08 y H-09 en prioridad de negocio, no en deuda técnica.

### 8.4 Matriz de brechas frente al mercado

| Capacidad | Esta app | Buildium / DoorLoop / AppFolio | Rentger / Homming / Rentila | Prioridad |
|---|---|---|---|---|
| Gestión de contratos LAU, anexos, actas, morosidad | ✅ Muy profundo | 🟡 Genérico (no LAU española) | 🟡 Medio | Mantener ventaja |
| Cobro online con tarjeta/ACH/Bizum/TPV | ❌ Solo transferencia + justificante | ✅ Nativo | ✅ Tarjeta/transferencia/TPV | **P1 alta** |
| Conexión bancaria automática (PSD2/open banking) | ❌ Solo importación de extractos | ✅ Conciliación integrada | ✅ +300 bancos / conexión bancaria | **P1 alta** |
| SEPA real entregado al banco + devoluciones | 🟡 Genera PAIN.008/001 | 🟡 ACH/EFT (no SEPA) | ✅ Ficheros y cobro SEPA online | **P1 alta** |
| Screening externo (crédito, morosidad, identidad) | ❌ Scoring propio + aseguradora por correo | ✅ TransUnion/credit/eviction | ✅ Scoring/verificación de inquilinos | **P1** |
| Firma electrónica | 🧪 OTP local roto | ✅ eSignature (Dropbox Sign) | ✅ Signaturit / firma cualificada FNMT | **P0/P1** |
| Publicación real en portales + iCal/visitas | 🧪 Feed generable, `PORTAL_NO_CONECTADO` | ✅ Sindicación (Zillow/Zumper) | ✅ Idealista / portales / iCal | **P1** |
| Portal de proveedor con presupuestos, facturas y SLA | ❌ (modelo existe, UI muerta) | ✅ Vendor/work orders | ✅ Portal proveedor + SLA | **P1** |
| App móvil / PWA / push | ❌ Web responsive | ✅ iOS/Android | ✅ App personalizada | **P1** |
| API pública / marketplace / webhooks | ❌ Solo webhook saliente | ✅ Open API + Marketplace | ✅ API + contabilidad | **P2** |
| IA agentiva (voz, 24/7, triaje y ejecución) | 🧪 12 operaciones gobernadas pero apagadas | ✅ Realm-X/Lumina/AI Assistant | ✅ Agente IA, escáner de facturas | **P2** |
| Fiscalidad española presentada (modelos 100/115/303/147) | 🟡 Cálculo + ZIP para asesor | ❌ No aplica | ✅ Informes/modelos fiscales | **P1** |
| VERI*FACTU / B2B conectado | 🧪 Motor sin transporte | ❌ No aplica | ✅ Homming lo incluye en plan alto | **P0** |
| Multi-tenant, 2FA, RGPD completo, i18n | 🟡 Parcial | ✅ | ✅ | **P1/P2** |

### 8.5 Qué copiar y qué no copiar

- **Copiar ya:** pago online, banco/PSD2, firma digital, screening externo, portal de proveedor, app/PWA, API, sindicación real y fuente oficial de índices.
- **No copiar sin más:** la contabilidad "genérica" anglosajona (trust accounting/1099) no sustituye al IRPF/IVA/VERI*FACTU español; la IA agentiva sin supervisión humana puede tomar decisiones de screening con sesgo (los propios comparadores recomiendan mantener humano en la decisión [1](https://theexpertranking.com/business/best-ai-for-property-management/)).
- **Diferenciador a defender:** trazabilidad, aislamiento por cartera, actas comparadas, morosidad con MASC, expediente fiscal con hashes y fallo cerrado. El mercado rara vez ofrece esa profundidad jurídica española.

---

## 9. Hoja de ruta priorizada

### P0 · 0-4 semanas — "que lo implementado funcione de verdad"

| # | Acción | Criterio de aceptación | Esfuerzo |
|---|---|---|---|
| 1 | **Checklist de despliegue verificable**: `FIREBASE_SERVICE_ACCOUNT`, bucket, `CRON_SECRET`, `EMAIL_*`, `IA_POLITICA_JSON`, `IA_LLAVES_CLAVE_MAESTRA` + script `npm run doctor` que consulte `/api/health` y diga qué capacidades están activas | Un despliegue nuevo sabe en 1 minuto qué falta; `/api/health` ya no muestra `APROBACION_PENDIENTE` sin explicación al usuario | M |
| 2 | **Bandeja de solicitudes públicas** (H-02): montar `SolicitudesSection`/`SolicitudDetailModal` o crear pestaña en `CandidatosSection`; cablear `setSelectedSolicitudForModal` | Una solicitud pública aparece en <5 s, se puede abrir, cambiar de estado y convertir en candidato; si el candidato falla, la solicitud sigue visible | M |
| 3 | **Cerrar firma OTP** (H-03): CSPRNG + entrega por dispatcher + expiración/intentos; o integrar Signaturit/FNMT | Un firmante recibe el código y puede firmar un acta de extremo a extremo; el código nunca se muestra en UI de administración | M |
| 4 | **Antispam de altas públicas** (H-04): mover `solicitudes` a ruta servidor por token, rate limit, honeypot/CAPTCHA, límites de campo | Prueba de carga con N peticiones/min no contamina la colección; reglas ya no aceptan `create` anónimo sin token | M |
| 5 | **Actualizar narrativa y plan fiscal** (H-08): corregir comentarios de B2B, decidir modalidad SIF y presupuestar transporte AEAT + plataforma B2B | Documento de decisión con fechas 1-1-2027 / 1-7-2027 / 6-10-2027 / 6-10-2028 y responsable | S |
| 6 | **Limpiar código muerto** (H-01): una UI por dominio; montar o eliminar `ProfesionalesSection` | `tsc` sin imports sin usar; no quedan secciones huérfanas; `ProfesionalesSection` accesible o su lógica migrada | M |

### P1 · 1-3 meses — "cerrar la brecha de mercado"

| # | Acción | Criterio de aceptación | Esfuerzo |
|---|---|---|---|
| 7 | **Pago online**: pasarela (Stripe/Redsys/Bizum) o, si se mantiene la decisión de solo transferencia, **verificación bancaria del justificante** con humano en el bucle | El inquilino paga o confirma sin salir del portal; el cobro solo se contabiliza por `registrarPagoPeriodo` | L |
| 8 | **Conexión bancaria PSD2** con agregador autorizado (AISP) + conciliación existente | Movimientos se importan automáticamente; idempotencia; consentimiento renovable; sin credenciales en cliente | L |
| 9 | **Portal del proveedor completo**: presupuestos, facturas, valoraciones, calendario, SLA, fotos de campo | Un profesional recibe incidencia → envía presupuesto → es aceptado → sube factura → cobra; todo con su perfil | L |
| 10 | **Mensajería para propietario** y preferencias de notificación por evento/canal | Propietario responde a su inquilino desde su portal; respeta `mensajes_portal` y reglas | M |
| 11 | **Fuente IRAV viva** (H-09) + envío/firma de la comunicación de actualización de renta | Serie INE se actualiza sin redeploy; la UI deja de decir "no se envía correo, no se firma" | M |
| 12 | **VERI*FACTU transport + B2B** (H-08): certificado en backend, envío/acuse, QR y estados reales | Entorno de pruebas AEAT: registro enviado, acuse recibido, reintento idempotente | L |
| 13 | **PWA + push**: manifest, service worker, notificaciones Web Push, caché offline de lectura | Instalable en móvil; aviso de recibo llega sin abrir la web | M |
| 14 | **Gobernanza real**: master parametrizado, 2FA, seeds desactivables, permisos granulares aplicados o retirados, módulos aplicados | Un segundo administrador puede operar sin cambiar código; los toggles cambian el menú | L |
| 15 | **Dependencias y bundle** (H-13): overrides, Vite 6.4.5, code-splitting por sección, migración planificada de nodemailer/firebase | `npm audit --omit=dev` = 0 críticas/altas; chunk principal <1 MB gzip | M |
| 16 | **Registro único de alquiler de corta duración**: campo `numeroRegistro` y validación en publicación | No se puede publicar un alquiler temporal/turístico sin número de registro [1](https://www.mivau.gob.es/vivienda/ventanilla-unica/alquiler-de-alojamientos-de-corta-duracion) | S |

### P2 · 3-9 meses — "producto y ecosistema"

| # | Acción | Criterio de aceptación |
|---|---|---|
| 17 | **API pública versionada** + webhooks + marketplace (contabilidad, seguros, screening) | Terceros pueden leer cartera y recibir eventos con tokens por organización |
| 18 | **IA agentiva supervisada**: triaje 24/7 de incidencias, OCR de facturas en servidor, resúmenes y borradores, con humano en decisiones de screening/cobros | Política `IA_POLITICA_JSON` aprobada, coste medido, auditoría de cada acción |
| 19 | **Sindicación real**: Idealista/Fotocasa/Kyero/Habitaclia + iCal + catálogo público SEO | Un inmueble se publica, actualiza y retira desde el ERP con estado por portal |
| 20 | **Screening externo** (ASNEF/FIM/INFORMA o vía aseguradora) y verificación de identidad | Informe externo enlazado al candidato, con consentimiento y caducidad |
| 21 | **RGPD completo + i18n + accesibilidad auditada** | DSAR funcional, retención configurable, WCAG 2.2 AA, segundo idioma |
| 22 | **Escalabilidad de datos** (H-16): cobros y mensajes a subcolecciones, más índices, pruebas de carga | Contrato de 10 años sin riesgo de 1 MiB; consultas <500 ms p95 |

### 9.1 Métricas para saber si funciona

- % de despliegues con `/api/health` en `REAL` para email, cron y custodia.
- Tiempo desde solicitud pública hasta primera revisión humana (objetivo <1 h).
- % de recibos pagados dentro del portal vs. transferencia manual.
- % de incidencias con presupuesto, factura y SLA cumplido desde el portal del profesional.
- % de actas firmadas electrónicamente sin intervención manual.
- Nº de operaciones IA ejecutadas vs. denegadas por política; coste por operación.
- `npm audit` críticas/altas = 0; chunk principal gzip <1 MB; Vitest + node:test en verde en CI.

---

## 10. Fuentes

> Nota de citas: los identificadores numéricos `[n]` son los de los resultados de búsqueda utilizados; cuando un número se repite entre bloques, la **URL completa es la referencia única**. Todas las páginas se consultaron el 27-10-2026.

**Código y normativa oficial**

- Repositorio auditado, commit `2563831`: todos los paths citados en §§2-7 son fuente primaria.
- AEAT, ampliación de plazos SIF/VERI*FACTU: [2](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/nota-informativa-ampliacion-plazo-adaptacion-facturacion.html) y [3](https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2025/diciembre/3/ampliacion-plazo-adaptacion-sistemas-informaticos-facturacion.html).
- AEAT, calendario de implantación de factura electrónica B2B: [22](https://sede.agenciatributaria.gob.es/Sede/iva/factura-electronica/calendario-implantacion.html).
- BOE, Real Decreto 238/2026: [2](https://www.boe.es/buscar/act.php?id=BOE-A-2026-7295).
- INE, IRAV (últimos datos y metodología): [1](https://www.ine.es/uc/oC7D0Ncd) y [4](https://www.ine.es/prensa/IRAV.pdf).
- Ministerio de Vivienda, Ventanilla Única Digital: [1](https://www.mivau.gob.es/vivienda/ventanilla-unica/alquiler-de-alojamientos-de-corta-duracion) y [6](https://www.mivau.gob.es/vivienda/ventanilla-unica/plataformas-en-ventanilla-unica-digital).
- Firebase, uso y límites (documento 1 MiB): [1](https://firebase.google.com/docs/firestore/quotas).

**Mercado (documentación pública de proveedores y comparativas 2026)**

- AppFolio: [1](https://www.appfolio.com/blog/best-property-management-softwares-compared-2026), [16](https://www.appfolio.com/articles/performers).
- Buildium: [3](https://www.buildium.com/), [4](https://www.buildium.com/blog/buildium-vs-appfolio/), [2](https://www.buildium.com/blog/best-commercial-property-management-software/).
- DoorLoop: [3](https://www.doorloop.com/), [4](https://www.doorloop.com/pricing), [10](https://www.doorloop.com/faq).
- Rentger: [7](https://app.rentger.com/software_program_integral_management_rental), [6](https://www.rentger.com/funcionalidad/portal-inquilino-gestion-alquiler), [7](https://www.rentger.com/funcionalidad/programa-de-gestion-integral-alquiler), [9](https://www.rentger.com/integraciones), [13](https://www.rentger.com/precios).
- Homming: [1](https://homming.com/en/functionalities/manager-tenant-proprietary-and-provider-portals), [10](https://homming.com/planes-de-precios), [5](https://homming.com/en/proprietaries), [11](https://help.homming.com/es/collections/3557938-portal-inquilino).
- Rentila: [4](https://www.rentila.es/), [5](https://www.rentila.es/tour), [9](https://www.flatifly.com/blog/flatifly-vs-rentila).
- Panorama de IA agentiva 2026: [1](https://theexpertranking.com/business/best-ai-for-property-management/) y [12](https://www.appfolio.com/blog/best-property-management-softwares-compared-2026).

---

## 11. Anexo — comandos de verificación

```bash
npm ci --no-audit --no-fund
npx tsc --noEmit                          # EXIT 0
npm run build                            # EXIT 0, chunk principal 5.545,94 kB / 1.380,26 kB gzip
npx vitest run --reporter=dot            # 276 ficheros, 4.943 pruebas, 2 fallos (guardia A-04 local)
npm run test:integracion                 # 302 pruebas, 3 fallos (commits históricos ausentes)
npm audit --omit=dev                     # 9 vulnerabilidades (1 crítica, 8 altas)
npm audit --omit=dev --json              # detalle de versiones y fixes
npx tsx scripts/guardia-a04-repositorio.mts   # A-04: BLOCKED por refs ausentes en clon superficial
NODE_ENV=development npx tsx server.ts   # prueba HTTP sin secretos (§2.3)
```

**No ejecutado:** `npm run test:emulador:reglas` (sin Java/emulador en este entorno), pruebas E2E (no existen), operaciones reales contra Firebase/Gemini/AEAT/SMTP/bancos.

---

*Auditoría de solo lectura. Las recomendaciones no modifican nada por sí mismas: requieren decisión de producto y, en su caso, autorización explícita para cada fase.*
