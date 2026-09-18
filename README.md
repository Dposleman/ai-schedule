# AI Schedule

Planificación de turnos, fichaje por GPS, ausencias, traslados y cobertura automática
para equipos con varios locales. Aplicación web real: cada dato que ves (empleados,
locales, turnos, ausencias, fichajes...) se guarda en una base de datos, no son datos
de ejemplo.

Next.js 16 (App Router) + SQLite (via Drizzle ORM) + autenticación propia por
email/contraseña. No depende de ningún servicio externo de OpenAI/Cloudflare: es un
proyecto Next.js estándar que puedes ejecutar en tu propio equipo o desplegar donde
quieras (Vercel, Railway, Render, un VPS con Docker, etc.).

## Empezar en local

```bash
npm install
cp .env.example .env.local   # y cambia AUTH_SECRET por algo propio
npm run dev
```

Abre http://localhost:3000, pulsa "Crea tu negocio" y sigue el asistente: eso crea tu
organización, tu primer local y tu cuenta de propietario/a. Desde **Cuentas** puedes
crear cuentas para managers y empleados (se genera una contraseña temporal que debes
compartir con ellos).

La base de datos SQLite se crea automáticamente en `data/ai-schedule.db` la primera
vez que arranca el servidor. Es un único archivo: haz copia de seguridad de esa
carpeta si te importan los datos.

## Desplegar en producción

```bash
npm run build
npm start
```

Necesitas un entorno con disco persistente para `data/ai-schedule.db` (por eso no es
apto para plataformas 100% "serverless" sin disco, como el runtime edge de Vercel —
sí funciona en Vercel con funciones Node tradicionales, Railway, Render, Fly.io, un
VPS, etc.). Define `AUTH_SECRET` como variable de entorno con un valor propio y
secreto — si no lo defines, se usa una clave insegura de desarrollo.

## Qué es real ahora mismo

- **Cuentas y sesiones**: email + contraseña con hash (bcrypt), cookies de sesión
  firmadas. Roles: propietario/a, manager, empleado — cada uno ve y puede hacer solo
  lo que le corresponde (comprobado también en el servidor, no solo escondiendo
  botones).
- **Locales y equipo**: CRUD real, guardado en base de datos.
- **Planificador**: el botón "Generar semana con IA" ejecuta un algoritmo real
  (`lib/scheduler.ts`) que reparte turnos respetando vacaciones aprobadas,
  indisponibilidades marcadas por cada empleado y el objetivo de horas semanales de
  cada persona, balanceando quién lleva menos horas asignadas. El resultado es un
  borrador; "Publicar semana" lo hace visible para el equipo.
- **Ausencias**: solicitar, aprobar y rechazar, con efecto real sobre el planificador.
- **Traslados**: mover a alguien de un local a otro, temporal o definitivo.
- **Cobertura automática**: si un turno se queda sin nadie, se abre una solicitud de
  cobertura y se invita a las personas compatibles (mismo local, disponibles); la
  primera persona en aceptar se queda con el turno.
- **Registro horario (fichaje GPS)**: usa la ubicación del dispositivo para comprobar
  que estás dentro del radio del local antes de dejarte fichar; el fichaje se guarda
  en la base de datos.
- **Costes**: calculados de verdad a partir de horas de turno × tarifa/hora de cada
  persona, comparado con el presupuesto que definas por local.

## Qué queda simplificado (siguiente fase)

- No hay envío de emails (la contraseña temporal de una cuenta nueva se muestra una
  vez en pantalla; queda pendiente conectar un proveedor de email si lo quieres).
- La exportación de nómina/horario es un botón preparado para conectarse a un CSV o
  PDF real más adelante.
- La app móvil (carpeta `mobile/`, empaquetada con Capacitor) todavía apunta al
  componente antiguo de una sola pantalla sin sesión; para que la app de Android
  hable con este backend hace falta adaptar `mobile/src.tsx` para iniciar sesión
  contra la API — no estaba incluido en esta primera entrega centrada en la web.

## Estructura

```
app/                  páginas y rutas de la interfaz (App Router)
app/api/               endpoints REST (auth, locales, empleados, turnos, ausencias...)
app/app-shell.tsx      contenedor principal de la app ya autenticada
app/app-shell-views.tsx  las distintas pantallas (Resumen, Planificador, Equipo...)
db/schema.ts           esquema de la base de datos (Drizzle ORM)
db/index.ts             conexión SQLite + creación de tablas
lib/auth.ts             sesiones, hash de contraseñas
lib/scheduler.ts        algoritmo de generación de turnos
```
