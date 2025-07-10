import sqlite3
import datetime
import json # Necesario para serializar/deserializar los eventos del log

DATABASE_NAME = 'workday.db'

def connect_db():
    """Establece conexión con la base de datos SQLite."""
    conn = sqlite3.connect(DATABASE_NAME)
    conn.row_factory = sqlite3.Row # Permite acceder a las columnas por nombre
    return conn

def init_db():
    """Inicializa la base de datos, creando las tablas si no existen."""
    conn = connect_db()
    cursor = conn.cursor()

    # --- Actualización de la Tabla de Usuarios ---
    # Añadir columna 'role' si no existe
    cursor.execute("PRAGMA table_info(users)")
    columns = [col[1] for col in cursor.fetchall()]
    if 'role' not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")
        conn.commit()
        print("Columna 'role' añadida a la tabla 'users'.")

    # Crear la tabla de Usuarios si no existe (con la columna 'role')
    cursor.execute('''
                   CREATE TABLE IF NOT EXISTS users (
                                                        dni TEXT PRIMARY KEY,
                                                        password TEXT NOT NULL,
                                                        role TEXT NOT NULL DEFAULT 'user' -- 'user' o 'admin'
                   )
                   ''')

    # Insertar un usuario de ejemplo si no existe (DNI: 12345678A, Contraseña: pass, Rol: user)
    cursor.execute("SELECT * FROM users WHERE dni = '12345678A'")
    if cursor.fetchone() is None:
        cursor.execute("INSERT INTO users (dni, password, role) VALUES (?, ?, ?)", ('12345678A', 'pass', 'user'))
        print("Usuario de ejemplo '12345678A' (user) con contraseña 'pass' creado.")

    # Insertar un usuario administrador de ejemplo si no existe (DNI: admin, Contraseña: adminpass, Rol: admin)
    cursor.execute("SELECT * FROM users WHERE dni = 'admin'")
    if cursor.fetchone() is None:
        cursor.execute("INSERT INTO users (dni, password, role) VALUES (?, ?, ?)", ('admin', 'adminpass', 'admin'))
        print("Usuario de ejemplo 'admin' (admin) con contraseña 'adminpass' creado.")

    # --- Actualización de la Tabla de Jornadas Laborales ---
    # La tabla 'workdays' ahora debe tener 'user_dni' y una clave primaria compuesta
    # Si la tabla ya existe sin user_dni, es más complejo migrar datos existentes
    # Para simplificar, si la tabla existe con la clave primaria antigua, la eliminamos y recreamos.
    # En un entorno de producción, se haría una migración de datos más cuidadosa.
    cursor.execute("PRAGMA table_info(workdays)")
    workdays_columns = [col[1] for col in cursor.fetchall()]
    if 'user_dni' not in workdays_columns:
        # Si 'user_dni' no existe, asumimos que la tabla es la versión antigua y la recreamos.
        # ADVERTENCIA: Esto borrará los datos de jornadas existentes si no fueron creados con user_dni.
        cursor.execute("DROP TABLE IF EXISTS workdays")
        conn.commit()
        print("Tabla 'workdays' recreada para incluir 'user_dni'.")

    cursor.execute('''
                   CREATE TABLE IF NOT EXISTS workdays (
                                                           user_dni TEXT NOT NULL,
                                                           date TEXT NOT NULL, -- Formato YYYY-MM-DD
                                                           start_time INTEGER,       -- Timestamp de inicio (ms)
                                                           end_time INTEGER,         -- Timestamp de fin (ms)
                                                           total_break_duration INTEGER, -- Duración total de pausas (ms)
                                                           events TEXT,              -- JSON string de los eventos del log
                                                           PRIMARY KEY (user_dni, date), -- Clave primaria compuesta
                       FOREIGN KEY (user_dni) REFERENCES users(dni) ON DELETE CASCADE
                       )
                   ''')

    conn.commit()
    conn.close()

def get_user(dni, password):
    """Verifica las credenciales del usuario y devuelve su rol."""
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute("SELECT dni, role FROM users WHERE dni = ? AND password = ?", (dni, password))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None

def add_user(dni, password, role='user'):
    """Añade un nuevo usuario a la base de datos."""
    conn = connect_db()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO users (dni, password, role) VALUES (?, ?, ?)", (dni, password, role))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        # DNI ya existe
        return False
    finally:
        conn.close()

def get_all_users():
    """Obtiene todos los usuarios (DNI y rol)."""
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute("SELECT dni, role FROM users")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return users

def save_workday(user_dni, workday_data):
    """Guarda o actualiza los datos de una jornada laboral para un usuario específico."""
    conn = connect_db()
    cursor = conn.cursor()

    # Intenta actualizar si la jornada ya existe para esa fecha y usuario
    cursor.execute('''
                   UPDATE workdays
                   SET start_time = ?, end_time = ?, total_break_duration = ?, events = ?
                   WHERE user_dni = ? AND date = ?
                   ''', (
                       workday_data['start_time'],
                       workday_data['end_time'],
                       workday_data['total_break_duration'],
                       json.dumps(workday_data['events']), # Guardar como string JSON
                       user_dni,
                       workday_data['date']
                   ))

    # Si no se actualizó ninguna fila, significa que no existía, entonces inserta
    if cursor.rowcount == 0:
        cursor.execute('''
                       INSERT INTO workdays (user_dni, date, start_time, end_time, total_break_duration, events)
                       VALUES (?, ?, ?, ?, ?, ?)
                       ''', (
                           user_dni,
                           workday_data['date'],
                           workday_data['start_time'],
                           workday_data['end_time'],
                           workday_data['total_break_duration'],
                           json.dumps(workday_data['events']) # Guardar como string JSON
                       ))

    conn.commit()
    conn.close()

def get_workday(user_dni, date):
    """Obtiene los datos de una jornada por fecha para un usuario específico."""
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM workdays WHERE user_dni = ? AND date = ?", (user_dni, date))
    workday = cursor.fetchone()
    conn.close()
    if workday:
        workday_dict = dict(workday)
        workday_dict['events'] = json.loads(workday_dict['events']) if workday_dict['events'] else []
        return workday_dict
    return None

def get_all_workdays_for_user(user_dni):
    """Obtiene todas las jornadas registradas para un usuario específico."""
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM workdays WHERE user_dni = ? ORDER BY date DESC", (user_dni,))
    workdays = []
    for row in cursor.fetchall():
        workday_dict = dict(row)
        workday_dict['events'] = json.loads(workday_dict['events']) if workday_dict['events'] else []
        workdays.append(workday_dict)
    conn.close()
    return workdays

def get_all_workdays_all_users():
    """Obtiene todas las jornadas registradas para todos los usuarios."""
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM workdays ORDER BY user_dni, date DESC")
    workdays = []
    for row in cursor.fetchall():
        workday_dict = dict(row)
        workday_dict['events'] = json.loads(workday_dict['events']) if workday_dict['events'] else []
        workdays.append(workday_dict)
    conn.close()
    return workdays

def delete_workday(user_dni, date):
    """Elimina una jornada por fecha para un usuario específico."""
    conn = connect_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM workdays WHERE user_dni = ? AND date = ?", (user_dni, date))
    conn.commit()
    conn.close()

if __name__ == '__main__':
    # Este bloque se ejecuta solo si llamas a database.py directamente
    init_db()
    print("Base de datos inicializada y usuarios de ejemplo creados si no existían.")
