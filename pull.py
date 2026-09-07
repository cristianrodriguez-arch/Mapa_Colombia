import gspread
import json

# 1. Usamos tu archivo JSON exactamente donde lo guardaste (usamos 'r' para rutas en Windows)
ruta_json = r"C:\Users\crrodriguez\Desktop\Universdad\Credentials_Sheets.json"
gc = gspread.service_account(filename=ruta_json)

# 2. Conectamos directamente usando el ID único de la hoja para evitar el error de Google Drive API.
# Referencia - Nombre de la hoja: "CO_Puntos_Maestro clientes"
id_hoja = "1fILFlz4cO4mmW-oOnhTuewCicoWJ8bzFUUAN30GaewI"

try:
    sh = gc.open_by_key(id_hoja)
    worksheet = sh.get_worksheet(0) # 0 significa la primera pestaña (índice 0)
    
    # 3. Descargamos los datos (incluyendo fórmulas para que Claude pueda ver la lógica)
    data = worksheet.get_all_values(value_render_option='FORMULA')

    # 4. Lo guardamos en tu carpeta Bricks CO
    with open('datos_hoja.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

    print("¡Éxito! Los datos de 'CO_Puntos_Maestro clientes' se han descargado en 'datos_hoja.json'.")
    print("Ya puedes trabajar con Claude.")

except Exception as e:
    print(f"Ocurrió un error: {e}")
    print("Recuerda verificar que compartiste la hoja con el correo de la cuenta de servicio.")