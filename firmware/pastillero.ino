/*
 * Pastillero inteligente IoT - Particle Photon
 * ------------------------------------------------------------
 * - 7 LEDs (uno por compartimento) en D0..D6, cada uno con 220 ohm a GND.
 * - Boton en A0 a GND (usa INPUT_PULLUP, sin resistencia externa).
 * - Sin buzzer: el aviso es solo el LED parpadeando.
 *
 * Funciones en la nube (las llama la pagina web):
 *   horario  "3,08:00,8"  -> compartimento 3, primera toma 08:00, cada 8 horas
 *   horario  "3,p,08:00,14:00,21:30" -> compartimento 3, horas personalizadas (hasta 6)
 *   horario  "3,off"      -> desactiva el compartimento 3
 *   probar   "3"          -> enciende el LED 3 durante 5 segundos
 *
 * Evento que publica (lo recibe el webhook y lo guarda en Supabase):
 *   toma  {"comp":3,"estado":"tomada"}   o   {"comp":3,"estado":"omitida"}
 */

#include "Particle.h"

// ---------- Pines ----------
const int LEDS[7] = {D0, D1, D2, D3, D4, D5, D6};
const int BOTON = A0;

// ---------- Tiempos ----------
const unsigned long LIMITE_AVISO_MS = 30UL * 60UL * 1000UL;  // 30 minutos para tomarla
const unsigned long PARPADEO_MS     = 400;                    // velocidad del parpadeo
const unsigned long PRUEBA_MS       = 5000;                   // "Probar LED"
const unsigned long ANTIRREBOTE_MS  = 50;
const unsigned long ENTRE_EVENTOS_MS = 1100;                  // Particle: max 1 evento/seg

// ---------- Horarios guardados en EEPROM ----------
const int MAX_HORAS = 6;   // horas personalizadas por compartimento

struct Horario {
  int16_t inicioMin;   // minutos desde 00:00 (08:00 = 480)
  int16_t cadaHoras;   // 4, 6, 8, 12 o 24.  0 = horario personalizado
  uint8_t activo;      // 1 = activo, 0 = apagado
  uint8_t numHoras;    // cuantas horas personalizadas hay
  int16_t horas[MAX_HORAS];   // minutos desde 00:00 de cada hora personalizada
};

// Se cambio de 0xA51C a 0xA51D porque cambio el formato: al cargar el codigo nuevo
// los horarios viejos se borran y hay que volver a "Guardar" cada compartimento en la web.
const uint16_t MARCA_EEPROM = 0xA51D;  // indica que la EEPROM ya tiene datos validos
const int DIR_MARCA = 0;
const int DIR_HORARIOS = 4;

Horario horarios[7];

// ---------- Estado del aviso ----------
bool          avisoActivo[7];
unsigned long avisoInicio[7];
bool          probando[7];
unsigned long pruebaInicio[7];
int           ultimoMinutoRevisado = -1;

// ---------- Boton ----------
int           botonAnterior = HIGH;
unsigned long botonUltimoCambio = 0;

// ---------- Cola de eventos (por si no hay Wi-Fi en ese momento) ----------
struct Evento { uint8_t comp; bool tomada; };
const int MAX_COLA = 14;
Evento cola[MAX_COLA];
int enCola = 0;
unsigned long ultimoEnvio = 0;

// ============================================================
// EEPROM
// ============================================================
void guardarHorarios() {
  EEPROM.put(DIR_HORARIOS, horarios);
}

void cargarHorarios() {
  uint16_t marca;
  EEPROM.get(DIR_MARCA, marca);
  if (marca != MARCA_EEPROM) {           // primera vez: todo apagado
    for (int i = 0; i < 7; i++) {
      horarios[i].inicioMin = 0;
      horarios[i].cadaHoras = 24;
      horarios[i].activo = 0;
      horarios[i].numHoras = 0;
    }
    EEPROM.put(DIR_MARCA, MARCA_EEPROM);
    guardarHorarios();
  } else {
    EEPROM.get(DIR_HORARIOS, horarios);
  }
}

// ============================================================
// Funciones de la nube
// ============================================================
// "3,08:00,8" o "3,off". Regresa el numero de compartimento, o -1 si hay error.
int fnHorario(String cmd) {
  cmd.trim();
  int coma1 = cmd.indexOf(',');
  if (coma1 < 1) return -1;

  int c = cmd.substring(0, coma1).toInt() - 1;
  if (c < 0 || c > 6) return -1;

  String resto = cmd.substring(coma1 + 1);
  resto.trim();

  if (resto.equalsIgnoreCase("off")) {
    horarios[c].activo = 0;
    avisoActivo[c] = false;
    guardarHorarios();
    return c + 1;
  }

  // Horario personalizado: "p,08:00,14:00,21:30"
  if (resto.startsWith("p,") || resto.startsWith("P,")) {
    String lista = resto.substring(2);
    int cuantas = 0;
    int16_t nuevas[MAX_HORAS];
    while (lista.length() > 0) {
      int coma = lista.indexOf(',');
      String h = (coma < 0) ? lista : lista.substring(0, coma);
      lista = (coma < 0) ? "" : lista.substring(coma + 1);
      h.trim();
      int dp = h.indexOf(':');
      if (dp < 1) return -1;
      int hh = h.substring(0, dp).toInt();
      int mm = h.substring(dp + 1).toInt();
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return -1;
      if (cuantas >= MAX_HORAS) return -1;
      nuevas[cuantas++] = hh * 60 + mm;
    }
    if (cuantas == 0) return -1;

    horarios[c].cadaHoras = 0;
    horarios[c].numHoras = cuantas;
    for (int i = 0; i < cuantas; i++) horarios[c].horas[i] = nuevas[i];
    horarios[c].inicioMin = nuevas[0];
    horarios[c].activo = 1;
    guardarHorarios();
    return c + 1;
  }

  int coma2 = resto.indexOf(',');
  if (coma2 < 0) return -1;
  String hora = resto.substring(0, coma2);
  int dosPuntos = hora.indexOf(':');
  if (dosPuntos < 1) return -1;

  int hh   = hora.substring(0, dosPuntos).toInt();
  int mm   = hora.substring(dosPuntos + 1).toInt();
  int cada = resto.substring(coma2 + 1).toInt();

  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return -1;
  if (!(cada == 4 || cada == 6 || cada == 8 || cada == 12 || cada == 24)) return -1;

  horarios[c].inicioMin = hh * 60 + mm;
  horarios[c].cadaHoras = cada;
  horarios[c].numHoras = 0;
  horarios[c].activo = 1;
  guardarHorarios();
  return c + 1;
}

// "3" -> enciende el LED 3 por 5 segundos
int fnProbar(String cmd) {
  int c = cmd.toInt() - 1;
  if (c < 0 || c > 6) return -1;
  probando[c] = true;
  pruebaInicio[c] = millis();
  return c + 1;
}

// ============================================================
// Logica
// ============================================================
// Verdadero si el minuto actual del dia es una hora de toma del compartimento c
bool tocaAhora(int c, int minutoDelDia) {
  if (!horarios[c].activo) return false;
  if (horarios[c].cadaHoras == 0) {                 // horario personalizado
    for (int i = 0; i < horarios[c].numHoras; i++) {
      if (horarios[c].horas[i] == minutoDelDia) return true;
    }
    return false;
  }
  int dif = ((minutoDelDia - horarios[c].inicioMin) % 1440 + 1440) % 1440;
  return dif % (horarios[c].cadaHoras * 60) == 0;
}

void encolarEvento(int c, bool tomada) {
  if (enCola >= MAX_COLA) {               // cola llena: se descarta el mas viejo
    for (int i = 1; i < MAX_COLA; i++) cola[i - 1] = cola[i];
    enCola--;
  }
  cola[enCola].comp = c + 1;
  cola[enCola].tomada = tomada;
  enCola++;
}

void enviarPendientes(unsigned long ahora) {
  if (enCola == 0 || !Particle.connected()) return;
  if (ahora - ultimoEnvio < ENTRE_EVENTOS_MS) return;

  char datos[48];
  snprintf(datos, sizeof(datos), "{\"comp\":%d,\"estado\":\"%s\"}",
           cola[0].comp, cola[0].tomada ? "tomada" : "omitida");

  if (Particle.publish("toma", datos, PRIVATE)) {
    for (int i = 1; i < enCola; i++) cola[i - 1] = cola[i];
    enCola--;
  }
  ultimoEnvio = ahora;
}

// El boton confirma TODOS los compartimentos que estan avisando
void confirmarToma() {
  for (int c = 0; c < 7; c++) {
    if (avisoActivo[c]) {
      avisoActivo[c] = false;
      encolarEvento(c, true);
    }
  }
}

// ============================================================
void setup() {
  for (int i = 0; i < 7; i++) {
    pinMode(LEDS[i], OUTPUT);
    digitalWrite(LEDS[i], LOW);
    avisoActivo[i] = false;
    probando[i] = false;
  }
  pinMode(BOTON, INPUT_PULLUP);

  cargarHorarios();
  Time.zone(-6);   // Hora del centro de Mexico (sin horario de verano)

  Particle.function("horario", fnHorario);
  Particle.function("probar", fnProbar);
}

void loop() {
  unsigned long ahora = millis();

  // 1. Una vez por minuto: revisar si a algun compartimento le toca
  if (Time.isValid()) {
    int minutoDelDia = Time.hour() * 60 + Time.minute();
    if (minutoDelDia != ultimoMinutoRevisado) {
      ultimoMinutoRevisado = minutoDelDia;
      for (int c = 0; c < 7; c++) {
        if (!avisoActivo[c] && tocaAhora(c, minutoDelDia)) {
          avisoActivo[c] = true;
          avisoInicio[c] = ahora;
        }
      }
    }
  }

  // 2. Boton con antirrebote (se activa al presionar)
  int lectura = digitalRead(BOTON);
  if (lectura != botonAnterior && ahora - botonUltimoCambio > ANTIRREBOTE_MS) {
    botonUltimoCambio = ahora;
    botonAnterior = lectura;
    if (lectura == LOW) confirmarToma();
  }

  // 3. Si pasaron 30 minutos sin confirmar, se marca como omitida
  for (int c = 0; c < 7; c++) {
    if (avisoActivo[c] && ahora - avisoInicio[c] >= LIMITE_AVISO_MS) {
      avisoActivo[c] = false;
      encolarEvento(c, false);
    }
  }

  // 4. LEDs: parpadean los que avisan, se quedan fijos los que se estan probando
  bool fase = (ahora / PARPADEO_MS) % 2 == 0;
  for (int c = 0; c < 7; c++) {
    if (probando[c] && ahora - pruebaInicio[c] >= PRUEBA_MS) probando[c] = false;
    bool encender = probando[c] || (avisoActivo[c] && fase);
    digitalWrite(LEDS[c], encender ? HIGH : LOW);
  }

  // 5. Mandar a la nube los eventos pendientes
  enviarPendientes(ahora);
}
