/**
 * LOOP REPUESTOS — Tokens de marca (fuente de verdad en TS).
 *
 * Dirección visual: tech / electrónica / industrial / premium.
 * Estética oscura grafito–titanio–plata inspirada en el logo, con acento
 * acero frío MUY sutil (no neón). Los mismos valores están en
 * `app/globals.css` (@theme) para generar utilidades de Tailwind.
 *
 * Nota: la paleta es la sugerida por la dirección de arte; se ajustará
 * finamente contra el logo oficial cuando esté incorporado.
 */
export const palette = {
  fondo: "#12161C",
  fondo2: "#1A2027",
  superficie: "#222A32",
  superficie2: "#262F38",
  grafito: "#26323B",
  plata: "#BFC3C5",
  titanio: "#8D9499",
  texto: "#F2F4F5",
  textoSuave: "#A9B0B5",
  borde: "#343D45",
  bordeFuerte: "#3F4A53",
  acero: "#6F9EAD",
  aceroFuerte: "#7FB0BF",
  aceroTenue: "#2A3A41",
  stockOn: "#57B98B",
  stockOff: "#6A7278",
} as const;

/** Color de tema del navegador (barra superior mobile). */
export const themeColor = palette.fondo;

export type PaletteToken = keyof typeof palette;
