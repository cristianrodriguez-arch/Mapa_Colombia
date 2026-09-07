/**
 * Crea un único menú personalizado en la hoja de cálculo de Google al abrir el documento.
 * Este archivo centraliza la llamada a las funciones que están en los otros archivos (.gs).
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  
  ui.createMenu('🛠️ Herramientas Datos')
      .addItem('📍 Procesar Direcciones + Bricks', 'obtenerDatosCompletos')
      .addItem('🧱 Asignar solo Bricks', 'asignarBricksSolo')
      .addItem('🏷️ Completar solo Código Postal', 'completarCodigosPostales')
      .addItem('🔎 Diagnosticar Código Postal (1 dirección)', 'diagnosticarCodigoPostal')
      .addSeparator()
      .addItem('🔄 Ejecutar Cruce de Puntos de Venta (CRM vs Sell Out)', 'cruzarPuntosDeVenta')
      .addSeparator()
      .addItem('🏥 Buscar Centros Médicos (por País + Dirección)', 'buscarCentrosMedicos')
      .addToUi();
}