# Pastillero inteligente IoT

Pastillero de 7 compartimentos con un LED por compartimento (Particle Photon) y una página web
para que el responsable programe cada cuántas horas se toma cada medicamento.
Sin buzzer: el aviso es solo el LED parpadeando.

```
pastillero-iot/
├── backend/
│   ├── schema.sql              ← tablas, seguridad y función para el webhook (Supabase)
│   └── webhook-particle.json   ← configuración del webhook en Particle
├── firmware/
│   └── pastillero.ino          ← código del Photon
└── web/
    ├── index.html              ← 1. Iniciar sesión / crear cuenta
    ├── panel.html              ← 2. Panel (y registro del pastillero la primera vez)
    ├── configurar.html         ← 3. Configurar compartimento
    ├── historial.html          ← 4. Historial
    ├── paciente.html           ← 5. Editar datos del paciente (nombre y Device ID)
    ├── css/styles.css
    └── js/
        ├── config.js           ← AQUÍ van sus claves
        ├── common.js           ← funciones compartidas (Supabase, Particle, horas)
        ├── login.js  panel.js  configurar.js  historial.js  paciente.js
```

---

## Paso 1. Supabase (base de datos)

1. Crear un proyecto en https://supabase.com.
2. Ir a **SQL Editor → New query**, pegar todo `backend/schema.sql` y presionar **Run**.
3. En **Authentication → Sign In / Providers → Email**, desactivar **Confirm email**
   (así pueden crear cuenta y entrar sin confirmar el correo; es solo para el prototipo).
4. En **Project Settings → API** copiar:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** (o **publishable**) key → `SUPABASE_KEY`

## Paso 2. Photon

1. Registrar el Photon en https://setup.particle.io y conectarlo al Wi-Fi.
2. Abrir https://build.particle.io, crear una app nueva, pegar `firmware/pastillero.ino` y presionar **Flash**.
3. Copiar el **Device ID** del Photon (en https://console.particle.io → Devices). Se pide en la web la primera vez.
4. Probar desde la consola de Particle → Devices → tu Photon → Functions:
   - `probar` con `3` → el LED 3 se enciende 5 segundos.
   - `horario` con `3,08:00,8` → regresa `3` (si regresa `-1`, el formato está mal).

Conexiones: LEDs del compartimento 1 a 7 en **D0–D6** (cada uno con resistencia de 220 Ω a GND),
botón entre **A0** y **GND**.

## Paso 3. Webhook (Photon → Supabase)

En https://console.particle.io → **Integrations → Add new integration → Webhook → Custom template**,
pegar `backend/webhook-particle.json` cambiando:

- `TU-PROYECTO` por el de su Project URL.
- `TU_CLAVE_PUBLICA_DE_SUPABASE` por su clave (en los dos lugares).

> Si su clave empieza con `sb_publishable_`, borren la línea `"Authorization"` y dejen solo `"apikey"`.

Prueba: en la consola de Particle, la pestaña **Events** debe mostrar el evento `toma` y la
integración debe responder `200` o `204`. En Supabase, **Table Editor → tomas** muestra la fila nueva.

## Paso 4. Token de Particle (web → Photon)

La web necesita un token para llamar las funciones del Photon.
En https://console.particle.io → (su usuario, abajo a la izquierda) → **Access tokens**, o con la CLI:
`particle token create --never-expires`.

## Paso 5. Página web

1. Abrir `web/js/config.js` y poner `SUPABASE_URL`, `SUPABASE_KEY` y `PARTICLE_TOKEN`.
2. Probar en su computadora con un servidor local (no abrir el .html con doble clic):
   - VS Code: extensión **Live Server** → clic derecho en `index.html` → *Open with Live Server*, o
   - Terminal en la carpeta `web`: `python -m http.server 8000` y abrir http://localhost:8000
3. Crear cuenta → registrar el pastillero (nombre y Device ID) → configurar un compartimento → **Guardar**.
4. Para publicarla: subir la carpeta `web` a GitHub Pages o arrastrarla a https://app.netlify.com/drop.

---

## Cambios recientes (perfil del encargado y horario personalizado)

1. **Supabase:** volver a ejecutar completo `backend/schema.sql` (SQL Editor → Run). Agrega la tabla
   `responsables` (nombre y foto del encargado) y la columna `horas_personalizadas`. Se puede ejecutar
   aunque la base ya tenga datos.
2. **Photon:** volver a cargar `firmware/pastillero.ino` con **Flash**. Al cargarlo se borran los horarios
   viejos del Photon: entra a cada compartimento en la web y presiona **Guardar** otra vez.
3. **Horario personalizado:** en «Repetir cada» elige **Horario personalizado** y escribe hasta 6 horas
   (ej. 08:00, 14:30 y 21:00). La web le manda al Photon `3,p,08:00,14:30,21:00`.
4. **Encargado:** al crear cuenta se puede poner nombre y foto (opcionales). En el panel, al tocar la foto
   o el nombre se abre «Mi perfil» para cambiarlos (Cancelar / Guardar). **Cerrar sesión** está arriba.

## Cómo se comunican

| De → a | Cómo | Ejemplo |
| --- | --- | --- |
| Web → Supabase | supabase-js (`update` en `compartimentos`) | guarda medicamento, hora y cada cuántas horas |
| Web → Photon | `POST api.particle.io/v1/devices/{id}/horario` | `arg=3,08:00,8`, `arg=3,p,08:00,14:30` o `arg=3,off` |
| Web → Photon | `POST .../probar` | `arg=3` |
| Photon → Particle | `Particle.publish("toma", ...)` | `{"comp":3,"estado":"tomada"}` |
| Particle → Supabase | webhook → `rpc/registrar_toma` | inserta la fila en `tomas` |

## Reglas del pastillero

- Cada compartimento = un medicamento. Intervalos permitidos: 4, 6, 8, 12 o 24 horas, o hasta 6 horas personalizadas.
- A la hora, el LED parpadea hasta 30 minutos.
- Presionar el botón → `tomada`. Si pasan 30 minutos → `omitida`.
- Si coinciden dos compartimentos, parpadean los dos y un solo botón confirma ambos.
- Si no hay Wi-Fi, el Photon guarda hasta 14 eventos y los manda al reconectar.
- La hora se sincroniza desde Particle Cloud con zona `-6` (centro de México).
- Los horarios se guardan en la EEPROM: si se va la luz, no se pierden.

## Problemas comunes

| Síntoma | Revisar |
| --- | --- |
| «El pastillero no respondió» al guardar | Photon desconectado (LED de estado no está «respirando» cian) o `PARTICLE_TOKEN` mal |
| El historial no se llena | Pestaña Integrations en Particle: ver el error del webhook; que el Device ID registrado en la web sea el mismo |
| «new row violates row-level security» | No inició sesión, o se ejecutó solo parte de `schema.sql` |
| Un LED no enciende | Patita larga del LED (ánodo) hacia la resistencia/pin; usar `probar` |
| La hora está corrida | `Time.zone(-6)` en el firmware; el Photon necesita Wi-Fi una vez para tomar la hora |
