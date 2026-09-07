/**
 * Cruce de Puntos de Venta (CRM vs Sell Out)
 * Desarrollado para automatizar la depuración y actualización de PDVs.
 */
function cruzarPuntosDeVenta() {
  var urlCRM = "https://docs.google.com/spreadsheets/d/1fILFlz4cO4mmW-oOnhTuewCicoWJ8bzFUUAN30GaewI/edit";
  var urlSellOut = "https://docs.google.com/spreadsheets/d/1bETxj1EIp3Ya_yCPcAqWWNtVHuKT5PM9/edit";
  
  try {
    // 1. Abrir las hojas de cálculo
    var ssCRM = SpreadsheetApp.openByUrl(urlCRM);
    var ssSellOut = SpreadsheetApp.openByUrl(urlSellOut);
    
    // 2. Obtener hojas específicas
    var sheetCRM = getSheetByGid(ssCRM, 892597272) || ssCRM.getSheetByName("CO_Puntos_Maestro clientes") || ssCRM.getSheets()[0];
    var sheetSellOut = ssSellOut.getSheetByName("Final") || ssSellOut.getSheets()[0];
    
    // 3. Obtener los valores de datos de ambas hojas
    var dataCRM = sheetCRM.getDataRange().getValues();
    var dataSellOut = sheetSellOut.getDataRange().getValues();
    
    if (dataCRM.length < 2) throw new Error("La hoja de CRM no contiene datos suficientes.");
    if (dataSellOut.length < 2) throw new Error("La hoja de Sell Out ('Final') no contiene datos suficientes.");
    
    // 4. Mapear dinámicamente las cabeceras de CRM
    var headersCRM = dataCRM[0].map(function(h) { return h.toString().trim().toLowerCase(); });
    var idxCrmId18 = headersCRM.indexOf("id cuenta 18");
    var idxCrmNoOficina = headersCRM.indexOf("nº oficina farmacia");
    var idxCrmNombre = headersCRM.indexOf("nombre de la cuenta");
    var idxCrmChain = headersCRM.indexOf("chain: grupo de compras name");
    
    // Fallbacks parciales
    if (idxCrmNoOficina === -1) idxCrmNoOficina = findColumnBySubstring(headersCRM, "oficina");
    if (idxCrmNombre === -1) idxCrmNombre = findColumnBySubstring(headersCRM, "nombre");
    if (idxCrmId18 === -1) idxCrmId18 = findColumnBySubstring(headersCRM, "id cuenta");
    if (idxCrmChain === -1) idxCrmChain = findColumnBySubstring(headersCRM, "grupo de compras");

    if (idxCrmNoOficina === -1) throw new Error("No se pudo identificar la columna 'Nº Oficina Farmacia' en el CRM.");

    // 5. Mapear dinámicamente las cabeceras de Sell Out
    var headersSellOut = dataSellOut[0].map(function(h) { return h.toString().trim().toLowerCase(); });
    var idxSoPosId = headersSellOut.indexOf("pos_id");
    var idxSoDesc = headersSellOut.indexOf("isdin_pdv_desc");
    var idxSoOrigin = headersSellOut.indexOf("origin");
    var idxSoCiudad = headersSellOut.indexOf("ciudad_cliente");
    var idxSoDepto = headersSellOut.indexOf("departamento_cliente");
    
    if (idxSoPosId === -1) idxSoPosId = findColumnBySubstring(headersSellOut, "pos");
    if (idxSoDesc === -1) idxSoDesc = findColumnBySubstring(headersSellOut, "desc");
    if (idxSoOrigin === -1) idxSoOrigin = findColumnBySubstring(headersSellOut, "origin");

    if (idxSoPosId === -1) throw new Error("No se pudo identificar la columna 'POS_ID' en la hoja de Sell Out.");

    // 6. Procesar CRM
    var crmMap = {}; 
    var crmSet = new Set();
    
    for (var i = 1; i < dataCRM.length; i++) {
      var row = dataCRM[i];
      var noOficina = cleanId(row[idxCrmNoOficina]);
      if (noOficina !== "") {
        crmSet.add(noOficina);
        crmMap[noOficina] = {
          id18: idxCrmId18 !== -1 ? row[idxCrmId18] : "",
          nombre: idxCrmNombre !== -1 ? row[idxCrmNombre] : "",
          chain: idxCrmChain !== -1 ? row[idxCrmChain] : ""
        };
      }
    }

    // 7. Procesar Sell Out
    var sellOutMap = {}; 
    var sellOutSet = new Set();
    
    for (var j = 1; j < dataSellOut.length; j++) {
      var rowSO = dataSellOut[j];
      var posId = cleanId(rowSO[idxSoPosId]);
      if (posId !== "") {
        sellOutSet.add(posId);
        if (!sellOutMap[posId]) {
          sellOutMap[posId] = {
            desc: idxSoDesc !== -1 ? rowSO[idxSoDesc] : "",
            origin: idxSoOrigin !== -1 ? rowSO[idxSoOrigin] : "",
            ciudad: idxSoCiudad !== -1 ? rowSO[idxSoCiudad] : "",
            depto: idxSoDepto !== -1 ? rowSO[idxSoDepto] : ""
          };
        }
      }
    }

    // 8. Comparar: Faltantes en CRM
    var faltantes = [];
    sellOutSet.forEach(function(posId) {
      if (!crmSet.has(posId)) {
        var details = sellOutMap[posId];
        faltantes.push([ posId, details.desc, details.origin, details.ciudad, details.depto ]);
      }
    });

    // 9. Comparar: Sobrantes en CRM
    var sobrantes = [];
    crmSet.forEach(function(noOficina) {
      if (!sellOutSet.has(noOficina)) {
        var details = crmMap[noOficina];
        sobrantes.push([ details.id18, noOficina, details.nombre, details.chain ]);
      }
    });

    // 10. Escribir resultados
    writeResults(ssCRM, "Faltantes en CRM (Por crear)", ["POS_ID", "Nombre PDV (Sell Out)", "Origen / Distribuidor", "Ciudad", "Departamento"], faltantes);
    writeResults(ssCRM, "Eliminar de CRM (Sin Sell Out)", ["Id cuenta 18", "Nº Oficina Farmacia", "Nombre en CRM", "Chain: Grupo de compras Name"], sobrantes);
    
    // Notificación en la interfaz (usamos toast para no bloquear la UI)
    var mensajeFinal = "Se detectaron " + faltantes.length + " faltantes y " + sobrantes.length + " sobrantes. Pestañas actualizadas.";
    SpreadsheetApp.getActiveSpreadsheet().toast(mensajeFinal, "¡Cruce Completado!", 10);

  } catch (error) {
    SpreadsheetApp.getActiveSpreadsheet().toast(error.message, "Error en Cruce", 10);
  }
}

// =========================================================================
// FUNCIONES AUXILIARES GLOBALES
// =========================================================================

function getSheetByGid(spreadsheet, gid) {
  var sheets = spreadsheet.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() == gid) {
      return sheets[i];
    }
  }
  return null;
}

function findColumnBySubstring(headers, term) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].indexOf(term.toLowerCase()) !== -1) {
      return i;
    }
  }
  return -1;
}

function cleanId(val) {
  if (val === null || val === undefined) return "";
  var str = val.toString().trim();
  if (str.endsWith(".0")) {
    str = str.substring(0, str.length - 2);
  }
  return str;
}

function writeResults(spreadsheet, sheetName, headers, data) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (sheet) {
    sheet.clear();
  } else {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
       .setFontWeight("bold")
       .setBackground("#d9ead3")
       .setHorizontalAlignment("center");
       
  if (data.length > 0) {
    sheet.getRange(2, 1, data.length, headers.length).setValues(data);
  }
  
  sheet.autoResizeColumns(1, headers.length);
}