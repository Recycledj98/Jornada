import sqlite3
import hashlib

DATABASE_NAME = 'workday.db'

def init_db():
    """Inicializa la base de datos y crea las tablas si no existen."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()

    # Tabla de usuarios
    cursor.execute('''
                   CREATE TABLE IF NOT EXISTS users (
                                                        dni TEXT PRIMARY KEY,
                                                        password TEXT NOT NULL,
                                                        role TEXT DEFAULT 'user'
                   )
                   ''')

    # Tabla de jornadas laborales
    cursor.execute('''
                   CREATE TABLE IF NOT EXISTS workdays (
                                                           user_dni TEXT NOT NULL,
                                                           date TEXT NOT NULL,
                                                           start_time INTEGER,
                                                           end_time INTEGER,
                                                           total_break_duration INTEGER DEFAULT 0,
                                                           events TEXT,
                                                           PRIMARY KEY (user_dni, date),
                       FOREIGN KEY (user_dni) REFERENCES users(dni) ON DELETE CASCADE
                       )
                   ''')

    # Añadir usuarios de ejemplo si no existen
    add_user('12345678A', 'pass', 'user')
    add_user('admin', 'adminpass', 'admin')

    conn.commit()
    conn.close()

def hash_password(password):
    """Hashea una contraseña usando SHA256."""
    return hashlib.sha256(password.encode()).hexdigest()

def add_user(dni, password, role='user'):
    """Añade un nuevo usuario a la base de datos."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    hashed_password = hash_password(password)
    try:
        cursor.execute("INSERT INTO users (dni, password, role) VALUES (?, ?, ?)", (dni, hashed_password, role))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        # El DNI ya existe
        return False
    finally:
        conn.close()

def get_user(dni, password):
    """Obtiene un usuario por DNI y contraseña."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    hashed_password = hash_password(password)
    cursor.execute("SELECT dni, role FROM users WHERE dni = ? AND password = ?", (dni, hashed_password))
    user = cursor.fetchone()
    conn.close()
    if user:
        return {'dni': user[0], 'role': user[1]}
    return None

def get_all_users():
    """Obtiene todos los usuarios (sin contraseñas)."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT dni, role FROM users")
    users = [{'dni': row[0], 'role': row[1]} for row in cursor.fetchall()]
    conn.close()
    return users

def update_user(dni, new_password=None, new_role=None):
    """Actualiza la contraseña o el rol de un usuario."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    updates = []
    params = []

    if new_password:
        updates.append("password = ?")
        params.append(hash_password(new_password))
    if new_role:
        updates.append("role = ?")
        params.append(new_role)

    if not updates:
        conn.close()
        return False # No hay nada que actualizar

    query = f"UPDATE users SET {', '.join(updates)} WHERE dni = ?"
    params.append(dni)

    try:
        cursor.execute(query, tuple(params))
        conn.commit()
        return cursor.rowcount > 0 # Retorna True si se actualizó al menos una fila
    finally:
        conn.close()

def delete_user(dni):
    """Elimina un usuario de la base de datos."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys = ON;") # Asegura que las claves foráneas estén activas
        cursor.execute("DELETE FROM users WHERE dni = ?", (dni,))
        conn.commit()
        return cursor.rowcount > 0 # Retorna True si se eliminó al menos una fila
    finally:
        conn.close()

def save_workday(user_dni, workday_data):
    """Guarda o actualiza los datos de la jornada laboral."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    # Asegúrate de que los datos estén en el formato correcto para la base de datos
    # Las claves del diccionario deben coincidir con las columnas de la tabla
    date = workday_data.get('date')
    start_time = workday_data.get('start_time')
    end_time = workday_data.get('end_time')
    total_break_duration = workday_data.get('total_break_duration', 0)
    events = workday_data.get('events')

    # Convertir la lista de eventos a JSON string para almacenarla
    import json
    events_json = json.dumps(events)

    cursor.execute('''
        INSERT OR REPLACE INTO workdays (user_dni, date, start_time, end_time, total_break_duration, events)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (user_dni, date, start_time, end_time, total_break_duration, events_json))
    conn.commit()
    conn.close()

def get_workday(user_dni, date):
    """Obtiene los datos de la jornada laboral para un usuario y fecha específicos."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT user_dni, date, start_time, end_time, total_break_duration, events FROM workdays WHERE user_dni = ? AND date = ?", (user_dni, date))
    row = cursor.fetchone()
    conn.close()
    if row:
        # Convertir la cadena JSON de eventos de vuelta a una lista
        import json
        events = json.loads(row[5]) if row[5] else []
        return {
            'user_dni': row[0],
            'date': row[1],
            'start_time': row[2],
            'end_time': row[3],
            'total_break_duration': row[4],
            'events': events
        }
    return None

def get_all_workdays_for_user(user_dni):
    """Obtiene todas las jornadas laborales para un usuario específico."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT user_dni, date, start_time, end_time, total_break_duration, events FROM workdays WHERE user_dni = ?", (user_dni,))
    rows = cursor.fetchall()
    conn.close()
    workdays = []
    import json
    for row in rows:
        events = json.loads(row[5]) if row[5] else []
        workdays.append({
            'user_dni': row[0],
            'date': row[1],
            'start_time': row[2],
            'end_time': row[3],
            'total_break_duration': row[4],
            'events': events
        })
    return workdays

def get_all_workdays_all_users():
    """Obtiene todas las jornadas laborales de todos los usuarios."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute("SELECT user_dni, date, start_time, end_time, total_break_duration, events FROM workdays ORDER BY user_dni, date DESC")
    rows = cursor.fetchall()
    conn.close()
    workdays = []
    import json
    for row in rows:
        events = json.loads(row[5]) if row[5] else []
        workdays.append({
            'user_dni': row[0],
            'date': row[1],
            'start_time': row[2],
            'end_time': row[3],
            'total_break_duration': row[4],
            'events': events
        })
    return workdays

def delete_workday(user_dni, date):
    """Elimina una jornada laboral para un usuario y fecha específicos."""
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM workdays WHERE user_dni = ? AND date = ?", (user_dni, date))
    conn.commit()
    conn.close()

