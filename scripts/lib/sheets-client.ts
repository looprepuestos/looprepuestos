/**
 * LOOP REPUESTOS — Lector READ-ONLY de Google Sheets.
 *
 * Contrato mínimo y desacoplado: un `SheetReader` sólo sabe devolver filas
 * (objetos { columna: valor } con los MISMOS encabezados que el CSV maestro,
 * ver CSV_COLUMNS en catalog-mapper). Así el orquestador (sync-sheets.ts) no
 * depende de Google: en tests se inyecta un lector en memoria; en producción
 * se inyecta `GoogleSheetsReader`.
 *
 * IMPORTANTE (estado actual): este archivo NO conecta credenciales ni toca el
 * Sheet real. `GoogleSheetsReader` construye el cliente de Google SÓLO al
 * llamar `read()`, leyendo la config desde variables de entorno server-only.
 * Si falta config, lanza un error claro en vez de "adivinar". El scope pedido
 * es de SÓLO LECTURA (spreadsheets.readonly): la web nunca escribe al Sheet.
 */
import type { CsvRow } from "./catalog-mapper";

export interface SheetReader {
  /** Devuelve TODAS las filas de datos como objetos keyed por encabezado. */
  read(): Promise<CsvRow[]>;
}

/**
 * Convierte una matriz cruda (values de la API: filas de celdas, la PRIMERA
 * fila son los encabezados) en CsvRow[]. Es pura y reutilizable por tests.
 *   - Recorta espacios de encabezados y celdas.
 *   - Rellena celdas faltantes al final de una fila como "".
 *   - Ignora filas totalmente vacías.
 */
export function rowsFromValues(values: string[][]): CsvRow[] {
  if (!values || values.length === 0) return [];
  const header = (values[0] ?? []).map((h) => (h ?? "").toString().trim());
  const out: CsvRow[] = [];
  for (let i = 1; i < values.length; i++) {
    const cells = values[i] ?? [];
    const allEmpty = cells.every((c) => (c ?? "").toString().trim() === "");
    if (cells.length === 0 || allEmpty) continue;
    const row: CsvRow = {};
    header.forEach((key, c) => {
      if (key === "") return;
      row[key] = (cells[c] ?? "").toString().trim();
    });
    out.push(row);
  }
  return out;
}

/** Lector en memoria (para tests / dry-runs). No toca la red. */
export class InMemorySheetReader implements SheetReader {
  constructor(private readonly values: string[][]) {}
  async read(): Promise<CsvRow[]> {
    return rowsFromValues(this.values);
  }
}

export interface GoogleSheetsConfig {
  /** ID del spreadsheet (de la URL de Google Sheets). */
  spreadsheetId: string;
  /** Rango A1, ej. "Catalogo!A:V" (incluye la fila de encabezados). */
  range: string;
  /** Email de la service account. */
  clientEmail: string;
  /** Clave privada de la service account (PEM). */
  privateKey: string;
}

/**
 * Lee la config desde variables de entorno server-only. Devuelve null si NO
 * está configurado (permite dry-runs y tests sin credenciales).
 *   GOOGLE_SHEETS_SPREADSHEET_ID
 *   GOOGLE_SHEETS_RANGE                 (default "Catalogo!A:Z")
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  (los "\n" escapados se normalizan)
 */
export function sheetsConfigFromEnv(): GoogleSheetsConfig | null {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!spreadsheetId || !clientEmail || !privateKeyRaw) return null;
  return {
    spreadsheetId,
    range: process.env.GOOGLE_SHEETS_RANGE ?? "Catalogo!A:Z",
    clientEmail,
    privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
  };
}

/**
 * Lector real de Google Sheets (SÓLO LECTURA). El cliente `googleapis` se
 * importa de forma dinámica dentro de `read()` para que este módulo se pueda
 * cargar (y testear) aunque la dependencia no esté instalada ni haya
 * credenciales. NO escribe nunca al Sheet.
 */
export class GoogleSheetsReader implements SheetReader {
  constructor(private readonly config: GoogleSheetsConfig) {}

  async read(): Promise<CsvRow[]> {
    // Import dinámico: la dependencia sólo se resuelve al leer de verdad.
    const { JWT } = await import("google-auth-library");
    const client = new JWT({
      email: this.config.clientEmail,
      key: this.config.privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("No se obtuvo access token de Google (service account).");

    // Endpoint de SÓLO LECTURA. Valores tal cual se ven en la planilla.
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}` +
      `/values/${encodeURIComponent(this.config.range)}` +
      `?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Google Sheets API ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { values?: string[][] };
    return rowsFromValues(data.values ?? []);
  }
}
