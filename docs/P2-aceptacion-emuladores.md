# Aceptación P2 con Firebase Emulators

Ejecución reproducible: `npm run test:emulador:reglas`. El workflow de emuladores usa explícitamente `--project demo-gestor-reglas` y ejecuta Auth, Firestore y Storage oficiales. La prueba P2 se niega a arrancar si `NODE_ENV`, `GCLOUD_PROJECT`, los tres hosts loopback/puertos esperados o el proyecto demo no coinciden, si hay un entorno Vercel o si aparece alguna fuente de credenciales Google. No lee `.firebaserc` como destino: su proyecto predeterminado es productivo.

Los fixtures son ficticios y usan correos `sintetico.invalid`. La prueba crea cuentas Auth, perfiles y contratos con IDs únicos; limpia sólo sus cuentas, documentos, auditorías y objetos. No ejecuta reset/export/delete global de los emuladores ni hace llamadas de red a servicios externos. Firestore y Storage se acceden a través de los clientes REST P2 reales con una opción de transporte explícita; las rutas HTTP, el servicio P2, validación, autorización, hash, CAS, auditoría y descarga son el código real de la aplicación. El token de cada request se contrasta con Auth Emulator `accounts:lookup`.

## Compatibilidad y alcance de Storage

El cliente productivo usa Cloud Storage JSON API (`POST /upload/storage/v1/...` y `GET /storage/v1/...`). Firebase documenta que el Storage Emulator soporta el subconjunto de métodos GCS Objects `insert`, `get`, `delete`, etc.; por eso la aceptación apunta a la superficie Cloud del emulador, no a `/v0`. El modo emulador entrega `Bearer owner` únicamente tras validar el guardarraíl local/demo/test y no participa en la configuración de producción.

La aceptación comprueba bytes reales en Storage Emulator, hash SHA-256, metadatos en Firestore, descarga desde una instancia nueva y recuperación HTTP en un proceso Node separado mientras los emuladores siguen ejecutándose. También inyecta un 503 sólo en el transporte de una solicitud de upload para comprobar la transición durable `ERROR_SUBIDA` y el reintento. Esa inyección no sustituye la persistencia emulada de los casos aceptados.

## Lo que no demuestra

- El proceso separado es el de la aplicación; no se reinicia Storage Emulator. El estado de Storage Emulator no se usa aquí para afirmar supervivencia de sus propios reinicios.
- La aceptación no demuestra IAM, OAuth de cuenta de servicio, autenticación/verificación JWT productiva, despliegue, retención, redundancia ni durabilidad de Cloud Storage/Firestore de producción.
- Las rutas GCS del emulador usan su capa administrativa. La documentación oficial advierte que Storage Emulator sólo implementa un subconjunto de GCS; este test no acredita reglas Firebase Storage para esas llamadas de servidor.
- Aunque el adaptador productivo envía `ifGenerationMatch=0`, el endpoint Cloud de emulador consultado no aplica esa precondición al upload `media`. Por tanto, la prueba no acredita en el emulador la semántica de creación inmutable/condicional de producción ni las carreras GCS. El test unitario del adaptador conserva la comprobación del contrato HTTP enviado; la garantía de concurrencia debe contrastarse en un proyecto no productivo dedicado antes de atribuirla al servicio administrado.
- Las reglas de Firestore/Storage se siguen verificando por las suites existentes del mismo workflow; el REST de servidor con `Bearer owner` evita reglas intencionadamente y no reemplaza esas pruebas.

Fuentes oficiales: [conectar con Storage Emulator](https://firebase.google.com/docs/emulator-suite/connect_storage), [Cloud Storage Objects API](https://cloud.google.com/storage/docs/json_api/v1/objects), y la implementación de Cloud endpoints de [Firebase CLI Storage Emulator](https://github.com/firebase/firebase-tools/blob/main/src/emulator/storage/apis/gcloud.ts).
