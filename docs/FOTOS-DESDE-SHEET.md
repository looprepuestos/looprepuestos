# Fotos de productos desde Google Sheets

La carga usa el mismo token privado de la sincronización. El token nunca se
guarda en el navegador ni en el repositorio.

## 1. Agregar el archivo `fotos.gs`

En Apps Script, crear un archivo de secuencia de comandos llamado `fotos` y
pegar:

```javascript
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('LOOP')
    .addItem('Cargar foto del producto', 'abrirCargadorFotoLoop')
    .addToUi();
}

function abrirCargadorFotoLoop() {
  const html = HtmlService.createHtmlOutputFromFile('cargar_foto')
    .setTitle('Foto del producto');
  SpreadsheetApp.getUi().showSidebar(html);
}

function productoActivoLoop() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName() !== 'Catalogo') {
    throw new Error('Abrí Catalogo y seleccioná la fila del producto.');
  }

  const row = sheet.getActiveRange().getRow();
  if (row < 2) throw new Error('Seleccioná una fila de producto.');

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (value) { return String(value).trim().toLowerCase(); });
  const skuCol = headers.indexOf('sku') + 1;
  const nombreCol = headers.indexOf('nombre') + 1;
  if (!skuCol) throw new Error('No encontré la columna sku.');

  const sku = String(sheet.getRange(row, skuCol).getValue()).trim();
  const nombre = nombreCol
    ? String(sheet.getRange(row, nombreCol).getValue()).trim()
    : sku;
  if (!sku) throw new Error('La fila elegida no tiene SKU.');
  return { row: row, sku: sku, nombre: nombre };
}

function subirFotoLoop(sku, contentType, dataBase64) {
  const token = PropertiesService.getScriptProperties()
    .getProperty('LOOP_SYNC_TOKEN');
  if (!token) throw new Error('Falta LOOP_SYNC_TOKEN.');

  const response = UrlFetchApp.fetch(
    'https://feuwtvajeqkkfnirhibb.supabase.co/functions/v1/photo-upload',
    {
      method: 'post',
      headers: { 'x-loop-sync-token': token },
      contentType: 'application/json',
      payload: JSON.stringify({
        sku: sku,
        content_type: contentType,
        data_base64: dataBase64
      }),
      muteHttpExceptions: true
    }
  );

  const status = response.getResponseCode();
  const result = JSON.parse(response.getContentText());
  if (status !== 200 || !result.ok) {
    throw new Error('No se pudo cargar la foto: ' + (result.error || status));
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Catalogo');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (value) {
    return String(value).trim().toLowerCase();
  });
  const skuCol = headers.indexOf('sku');
  const fotoCol = headers.indexOf('foto');
  if (fotoCol < 0) throw new Error('No encontré la columna foto en Catalogo.');

  for (let index = 1; index < values.length; index++) {
    if (String(values[index][skuCol]).trim() === sku) {
      sheet.getRange(index + 1, fotoCol + 1).setValue(result.imagen_url);
      SpreadsheetApp.flush();
      return { ok: true, nombre: values[index][headers.indexOf('nombre')] || sku };
    }
  }
  throw new Error('No encontré el producto en Catalogo.');
}
```

## 2. Agregar el archivo HTML `cargar_foto`

En Apps Script, crear un archivo HTML llamado `cargar_foto` y pegar:

```html
<!doctype html>
<html>
  <head>
    <base target="_top">
    <style>
      body { font: 14px Arial, sans-serif; padding: 16px; color: #202124; }
      h3 { margin: 0 0 8px; }
      p { line-height: 1.4; }
      input { width: 100%; margin: 12px 0; }
      button { width: 100%; padding: 11px; border: 0; border-radius: 7px;
        background: #111827; color: white; font-weight: 700; cursor: pointer; }
      button:disabled { opacity: .5; }
      #estado { margin-top: 12px; font-weight: 700; }
    </style>
  </head>
  <body>
    <h3>Cargar foto</h3>
    <p id="producto">Leyendo producto…</p>
    <input id="foto" type="file" accept="image/jpeg,image/png,image/webp" capture="environment">
    <button id="boton" disabled onclick="subir()">SUBIR FOTO</button>
    <p id="estado"></p>
    <script>
      let producto;
      const foto = document.getElementById('foto');
      const boton = document.getElementById('boton');
      const estado = document.getElementById('estado');

      google.script.run
        .withSuccessHandler(function (result) {
          producto = result;
          document.getElementById('producto').textContent = result.nombre;
          boton.disabled = false;
        })
        .withFailureHandler(error)
        .productoActivoLoop();

      function error(err) {
        estado.textContent = err.message || String(err);
        boton.disabled = false;
      }

      function subir() {
        const file = foto.files[0];
        if (!file) return error({ message: 'Elegí una foto.' });
        if (file.size > 5 * 1024 * 1024) {
          return error({ message: 'La foto supera los 5 MB.' });
        }
        boton.disabled = true;
        estado.textContent = 'Subiendo…';
        const reader = new FileReader();
        reader.onload = function () {
          const base64 = String(reader.result).split(',')[1];
          google.script.run
            .withSuccessHandler(function () {
              estado.textContent = 'Foto cargada correctamente.';
              boton.disabled = false;
            })
            .withFailureHandler(error)
            .subirFotoLoop(producto.sku, file.type, base64);
        };
        reader.readAsDataURL(file);
      }
    </script>
  </body>
</html>
```

## Uso diario

1. Abrir `Catalogo` y tocar cualquier celda de la fila del producto.
2. Ir a `LOOP` > `Cargar foto del producto`.
3. Elegir o sacar la foto y tocar `SUBIR FOTO`.

La URL queda guardada automáticamente en la columna `foto` de `Catalogo`.
