from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import database
import os
import json
from functools import wraps

app = Flask(__name__, static_folder='../frontend', static_url_path='/')
CORS(app)

# Inicializa la base de datos al iniciar la aplicación Flask
database.init_db()

# Decorador para verificar si el usuario es administrador
# En una aplicación real, esto también debería verificar un token de sesión
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_dni = request.headers.get('X-User-DNI')
        if not user_dni:
            return jsonify({'error': 'DNI de usuario no proporcionado'}), 401

        # Esto es una simplificación. En producción, se debería consultar
        # la base de datos para verificar el rol del usuario por su DNI.
        # Por ahora, asumimos que si el DNI es 'admin', tiene acceso.
        # La función get_user_role_from_db debería ser implementada.
        # user_role = database.get_user_role_by_dni(user_dni)
        # if user_role != 'admin':
        #    return jsonify({'error': 'Acceso denegado: Se requiere rol de administrador'}), 403

        # Para esta implementación, simplemente verificamos si el DNI es 'admin'
        # Esto es INSEGURO para producción y solo para fines de desarrollo/prueba.
        if user_dni != 'admin': # Asumiendo 'admin' es el DNI del admin
            return jsonify({'error': 'Acceso denegado: Se requiere rol de administrador'}), 403

        return f(*args, **kwargs)
    return decorated_function


@app.route('/')
def index():
    """Sirve el archivo HTML principal."""
    return send_from_directory('../frontend', 'index.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    """Sirve archivos estáticos (CSS, JS)."""
    return send_from_directory('../frontend/static', filename)

@app.route('/login', methods=['POST'])
def login():
    """Endpoint para el login de usuario."""
    data = request.get_json()
    dni = data.get('dni')
    password = data.get('password')

    user = database.get_user(dni, password)
    if user:
        return jsonify({'success': True, 'message': 'Login exitoso', 'user_dni': user['dni'], 'role': user['role']}), 200
    else:
        return jsonify({'success': False, 'message': 'DNI o contraseña incorrectos'}), 401

@app.route('/workday', methods=['GET', 'POST'])
def workday():
    """
    GET: Obtiene los datos de la jornada para una fecha específica y usuario.
    POST: Guarda o actualiza los datos de la jornada.
    """
    user_dni = request.headers.get('X-User-DNI')

    if not user_dni:
        app.logger.error("Error 401: DNI de usuario no proporcionado en los encabezados.")
        return jsonify({'error': 'DNI de usuario no proporcionado en los encabezados'}), 401

    if request.method == 'GET':
        date = request.args.get('date')
        if not date:
            app.logger.error("Error 400: Falta el parámetro de fecha en la petición GET /workday.")
            return jsonify({'error': 'Falta el parámetro de fecha'}), 400

        workday_data = database.get_workday(user_dni, date)
        if workday_data:
            return jsonify({'success': True, 'workday': workday_data}), 200
        else:
            return jsonify({'success': False, 'message': 'Jornada no encontrada para la fecha y usuario'}), 404

    elif request.method == 'POST':
        try:
            data = request.get_json()
            required_fields = ['date', 'start_time', 'end_time', 'total_break_duration', 'events']
            if not all(field in data for field in required_fields):
                missing_fields = [field for field in required_fields if field not in data]
                app.logger.error(f"Error 400: Faltan campos requeridos en la petición POST /workday: {', '.join(missing_fields)}. Datos recibidos: {data}")
                return jsonify({'error': f'Faltan campos requeridos: {", ".join(missing_fields)}'}), 400

            database.save_workday(user_dni, data)
            return jsonify({'success': True, 'message': 'Jornada guardada exitosamente'}), 200
        except Exception as e:
            app.logger.error(f"Error al guardar jornada para {user_dni}: {e}", exc_info=True)
            return jsonify({'success': False, 'message': f'Error interno del servidor al guardar jornada: {str(e)}'}), 500

@app.route('/workdays/user', methods=['GET'])
def get_workdays_for_user():
    """Obtiene todas las jornadas registradas para el usuario logueado."""
    user_dni = request.headers.get('X-User-DNI')
    if not user_dni:
        app.logger.error("Error 401: DNI de usuario no proporcionado en los encabezados para /workdays/user.")
        return jsonify({'error': 'DNI de usuario no proporcionado en los encabezados'}), 401

    all_workdays = database.get_all_workdays_for_user(user_dni)
    return jsonify({'success': True, 'workdays': all_workdays}), 200

@app.route('/workday/delete', methods=['POST'])
def delete_workday_route():
    """Elimina una jornada por fecha para un usuario específico."""
    user_dni = request.headers.get('X-User-DNI')
    if not user_dni:
        app.logger.error("Error 401: DNI de usuario no proporcionado en los encabezados para /workday/delete.")
        return jsonify({'error': 'DNI de usuario no proporcionado en los encabezados'}), 401

    data = request.get_json()
    date = data.get('date')
    if not date:
        app.logger.error("Error 400: Falta el parámetro 'date' en la petición POST /workday/delete.")
        return jsonify({'error': 'Falta el parámetro de fecha'}), 400

    try:
        database.delete_workday(user_dni, date)
        return jsonify({'success': True, 'message': f'Jornada del {date} eliminada exitosamente para {user_dni}'}), 200
    except Exception as e:
        app.logger.error(f"Error al eliminar jornada para {user_dni} en fecha {date}: {e}", exc_info=True)
        return jsonify({'success': False, 'message': f'Error interno del servidor al eliminar jornada: {str(e)}'}), 500

# --- Rutas de Administración ---

@app.route('/admin/users', methods=['GET'])
# @admin_required # Descomentar para habilitar la seguridad de roles
def admin_get_users():
    """Endpoint para que el administrador vea todos los usuarios."""
    try:
        all_users = database.get_all_users()
        return jsonify({'success': True, 'users': all_users}), 200
    except Exception as e:
        app.logger.error(f"Error al obtener todos los usuarios: {e}", exc_info=True)
        return jsonify({'success': False, 'message': f'Error interno del servidor al obtener usuarios: {str(e)}'}), 500

@app.route('/admin/register_user', methods=['POST'])
# @admin_required # Descomentar para habilitar la seguridad de roles
def admin_register_user():
    """Endpoint para que el administrador registre nuevos usuarios."""
    try:
        data = request.get_json()
        dni = data.get('dni')
        password = data.get('password')
        role = data.get('role', 'user') # Por defecto 'user'

        if not dni or not password:
            app.logger.error("Error 400: DNI o contraseña faltan en el registro de usuario.")
            return jsonify({'error': 'DNI y contraseña son requeridos'}), 400

        if database.add_user(dni, password, role):
            return jsonify({'success': True, 'message': 'Usuario registrado exitosamente'}), 201
        else:
            app.logger.warning(f"Error 409: Intento de registrar DNI existente: {dni}")
            return jsonify({'success': False, 'message': 'El DNI ya existe'}), 409
    except Exception as e:
        app.logger.error(f"Error al registrar nuevo usuario: {e}", exc_info=True)
        return jsonify({'success': False, 'message': f'Error interno del servidor al registrar usuario: {str(e)}'}), 500

@app.route('/admin/user/<dni>', methods=['PUT'])
# @admin_required # Descomentar para habilitar la seguridad de roles
def admin_update_user(dni):
    """Endpoint para que el administrador actualice un usuario."""
    try:
        data = request.get_json()
        new_password = data.get('password')
        new_role = data.get('role')

        if not new_password and not new_role:
            app.logger.error(f"Error 400: No se proporcionaron datos para actualizar el usuario {dni}.")
            return jsonify({'error': 'No se proporcionaron datos para actualizar (contraseña o rol)'}), 400

        if database.update_user(dni, new_password, new_role):
            return jsonify({'success': True, 'message': f'Usuario {dni} actualizado exitosamente'}), 200
        else:
            app.logger.warning(f"Error 404: Usuario {dni} no encontrado para actualizar.")
            return jsonify({'success': False, 'message': 'Usuario no encontrado o no se pudo actualizar'}), 404
    except Exception as e:
        app.logger.error(f"Error al actualizar usuario {dni}: {e}", exc_info=True)
        return jsonify({'success': False, 'message': f'Error interno del servidor al actualizar usuario: {str(e)}'}), 500

@app.route('/admin/user/<dni>', methods=['DELETE'])
@admin_required # Descomentar para habilitar la seguridad de roles
def admin_delete_user(dni):
    """Endpoint para que el administrador elimine un usuario."""
    try:
        if database.delete_user(dni):
            return jsonify({'success': True, 'message': f'Usuario {dni} eliminado exitosamente'}), 200
        else:
            app.logger.warning(f"Error 404: Usuario {dni} no encontrado para eliminar.")
            return jsonify({'success': False, 'message': 'Usuario no encontrado o no se pudo eliminar'}), 404
    except Exception as e:
        app.logger.error(f"Error al eliminar usuario {dni}: {e}", exc_info=True)
        return jsonify({'success': False, 'message': f'Error interno del servidor al eliminar usuario: {str(e)}'}), 500


@app.route('/admin/all_workdays', methods=['GET'])
@admin_required # Descomentar para habilitar la seguridad de roles
def admin_get_all_workdays():
    """Endpoint para que el administrador vea las jornadas de todos los usuarios."""
    all_workdays = database.get_all_workdays_all_users()
    return jsonify({'success': True, 'workdays': all_workdays}), 200


if __name__ == '__main__':
    app.run(debug=True)
