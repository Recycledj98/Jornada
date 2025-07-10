// Constantes para los elementos del DOM
const loginContainer = document.getElementById('loginContainer');
const appContainer = document.getElementById('appContainer');
const dniInput = document.getElementById('dni');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('loginButton');
const loginError = document.getElementById('loginError');

const startButton = document.getElementById('startButton');
const startBreakButton = document.getElementById('startBreakButton');
const endBreakButton = document.getElementById('endBreakButton');
const endButton = document.getElementById('endButton');
const resetButton = document.getElementById('resetButton');
const statusMessage = document.getElementById('statusMessage');
const currentTimeDisplay = document.getElementById('currentTime');
const displayStartTime = document.getElementById('displayStartTime');
const displayEndTime = document.getElementById('displayEndTime');
const displayTotalWorkTime = document.getElementById('displayTotalWorkTime');
const displayTotalBreakTime = document.getElementById('displayTotalBreakTime');
const logEntries = document.getElementById('logEntries');
const initialLoadTime = document.getElementById('initialLoadTime');

const tabButtons = document.querySelectorAll('.tab-button');
const trackerTab = document.getElementById('trackerTab');
const recordsTab = document.getElementById('recordsTab');
const adminTabButton = document.getElementById('adminTabButton'); // Nuevo botón de pestaña de admin
const adminTab = document.getElementById('adminTab'); // Nuevo contenido de pestaña de admin

const viewDailyButton = document.getElementById('viewDaily');
const viewWeeklyButton = document.getElementById('viewWeekly');
const viewMonthlyButton = document.getElementById('viewMonthly');
const exportDataButton = document.getElementById('exportData');
const recordDateInput = document.getElementById('recordDate');
const recordsDisplay = document.getElementById('recordsDisplay');

const messageModal = document.getElementById('messageModal');
const messageText = document.getElementById('messageText');
const messageCloseButton = document.getElementById('messageCloseButton');

// Elementos del panel de administración
const newDniInput = document.getElementById('newDni');
const newPasswordInput = document.getElementById('newPassword');
const newRoleSelect = document.getElementById('newRole');
const registerUserButton = document.getElementById('registerUserButton');
const registerUserMessage = document.getElementById('registerUserMessage');
const filterUserDniInput = document.getElementById('filterUserDni');
const viewAllWorkdaysButton = document.getElementById('viewAllWorkdaysButton');
const allWorkdaysDisplay = document.getElementById('allWorkdaysDisplay');

// Elementos para el mensaje de bienvenida y cerrar sesión
const welcomeMessageDisplay = document.getElementById('welcomeMessageDisplay');
const logoutButton = document.getElementById('logoutButton');


// Variables de estado de la jornada
let workStartTime = null;
let workEndTime = null;
let breakStartTime = null;
let totalBreakDuration = 0; // en milisegundos
let currentDayLog = []; // Log para los eventos del día actual
let timerInterval; // Para el reloj en tiempo real
let status = 'idle'; // 'idle', 'working', 'on_break', 'finished'
let currentWorkdayData = null; // Objeto para el día actual en la base de datos

// Variables de autenticación
let loggedInUserDni = null;
let loggedInUserRole = null;

// --- Funciones de Utilidad ---

/**
 * Muestra un modal de mensaje personalizado.
 * @param {string} message - El mensaje a mostrar.
 */
function showMessage(message) {
    messageText.textContent = message;
    messageModal.classList.add('show');
}

// Cierra el modal de mensaje al hacer clic en el botón "Aceptar"
messageCloseButton.addEventListener('click', () => {
    messageModal.classList.remove('show');
});

/**
 * Formatea milisegundos a HH:MM:SS.
 * @param {number} ms - Tiempo en milisegundos.
 * @returns {string} Tiempo formateado.
 */
function formatTime(ms) {
    if (ms === null || isNaN(ms) || ms < 0) return '00:00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds]
        .map(unit => unit < 10 ? '0' + unit : unit)
        .join(':');
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD.
 * @returns {string} Fecha actual.
 */
function getTodayDateString() {
    return new Date().toISOString().slice(0, 10);
}

// --- Funciones de Comunicación con el Backend (API) ---

/**
 * Realiza una petición GET a la API con el encabezado X-User-DNI.
 * @param {string} url - URL del endpoint.
 * @returns {Promise<Object>} Respuesta JSON de la API.
 */
async function apiGet(url) {
    try {
        const headers = {};
        if (loggedInUserDni) {
            headers['X-User-DNI'] = loggedInUserDni;
        }
        const response = await fetch(url, { headers: headers });
        let responseData = {};
        try {
            responseData = await response.json(); // Intentar parsear siempre
        } catch (jsonError) {
            console.warn("No se pudo parsear la respuesta JSON:", jsonError);
            // Si no es JSON, crear una respuesta genérica
            responseData = { success: false, message: response.statusText || `Error HTTP ${response.status}` };
        }

        if (!response.ok) {
            throw new Error(responseData.message || `Error HTTP: ${response.status}`);
        }
        return responseData;
    } catch (error) {
        console.error("Error en petición GET:", error);
        showMessage(`Error al cargar datos: ${error.message}`);
        return null;
    }
}

/**
 * Realiza una petición POST a la API con el encabezado X-User-DNI.
 * @param {string} url - URL del endpoint.
 * @param {Object} data - Datos a enviar en el cuerpo de la petición.
 * @returns {Promise<Object>} Respuesta JSON de la API.
 */
async function apiPost(url, data) {
    try {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (loggedInUserDni) {
            headers['X-User-DNI'] = loggedInUserDni;
        }
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data),
        });
        let responseData = {};
        try {
            responseData = await response.json(); // Intentar parsear siempre
        } catch (jsonError) {
            console.warn("No se pudo parsear la respuesta JSON:", jsonError);
            responseData = { success: false, message: response.statusText || `Error HTTP ${response.status}` };
        }

        if (!response.ok) {
            throw new Error(responseData.message || `Error HTTP: ${response.status}`);
        }
        return responseData;
    } catch (error) {
        console.error("Error en petición POST:", error);
        showMessage(`Error al guardar datos: ${error.message}`);
        return null;
    }
}

// --- Lógica de la Aplicación ---

/**
 * Añade una entrada al log en la UI y actualiza el log interno.
 * Luego, guarda los datos de la jornada en el backend.
 * @param {string} event - Descripción del evento.
 * @param {number} timestamp_ms - Marca de tiempo en milisegundos.
 * @param {number|null} duration_ms - Duración del evento en milisegundos (opcional).
 */
async function addLogEntry(event, timestamp_ms, duration_ms = null) {
    const entryDiv = document.createElement('div');
    entryDiv.className = 'log-entry';
    let durationText = duration_ms !== null ? ` (${formatTime(duration_ms)})` : '';
    entryDiv.innerHTML = `
        <span>${event}${durationText}</span>
        <span>${new Date(timestamp_ms).toLocaleTimeString()}</span>
    `;
    logEntries.appendChild(entryDiv);
    logEntries.scrollTop = logEntries.scrollHeight; // Desplazar al final

    currentDayLog.push({ event, time: timestamp_ms, duration: duration_ms });

    // Actualizar y guardar los datos de la jornada actual
    if (currentWorkdayData) {
        // Asegurarse de que el DNI del usuario logueado esté en currentWorkdayData
        currentWorkdayData.user_dni = loggedInUserDni; // Añadir user_dni aquí
        currentWorkdayData.events = currentDayLog;
        if (event === 'Jornada Iniciada') currentWorkdayData.start_time = timestamp_ms; // Cambiado a snake_case
        if (event === 'Jornada Finalizada') currentWorkdayData.end_time = timestamp_ms; // Cambiado a snake_case
        await saveCurrentWorkdayData();
    }
}

/**
 * Actualiza el reloj en tiempo real en la UI.
 */
function updateCurrentTime() {
    currentTimeDisplay.textContent = new Date().toLocaleTimeString();
}

/**
 * Actualiza el estado de la UI (botones, mensajes, tiempos).
 */
function updateUI() {
    // Limpiar clases de estado anteriores del mensaje de estado
    statusMessage.classList.remove('status-idle', 'status-working', 'status-break', 'status-finished');

    // Actualizar botones y mensaje de estado según el estado actual
    switch (status) {
        case 'idle':
            startButton.disabled = false;
            startBreakButton.disabled = true;
            endBreakButton.disabled = true;
            endButton.disabled = true;
            resetButton.disabled = true; // No se puede reiniciar si no hay jornada activa
            statusMessage.textContent = 'Listo para empezar el día.';
            statusMessage.classList.add('status-idle');
            break;
        case 'working':
            startButton.disabled = true;
            startBreakButton.disabled = false;
            endBreakButton.disabled = true;
            endButton.disabled = false;
            resetButton.disabled = false;
            statusMessage.textContent = '¡Jornada en curso!';
            statusMessage.classList.add('status-working');
            break;
        case 'on_break':
            startButton.disabled = true;
            startBreakButton.disabled = true;
            endBreakButton.disabled = false;
            endButton.disabled = true; // No se puede finalizar jornada mientras se está en pausa
            resetButton.disabled = false;
            statusMessage.textContent = 'Estás en pausa.';
            statusMessage.classList.add('status-break');
            break;
        case 'finished':
            startButton.disabled = true;
            startBreakButton.disabled = true;
            endBreakButton.disabled = true;
            endButton.disabled = true;
            resetButton.disabled = false;
            statusMessage.textContent = 'Jornada finalizada. ¡Buen trabajo!';
            statusMessage.classList.add('status-finished');
            break;
    }

    // Actualizar tiempos de resumen en la UI
    displayStartTime.textContent = workStartTime ? new Date(workStartTime).toLocaleTimeString() : '--:--:--';
    displayEndTime.textContent = workEndTime ? new Date(workEndTime).toLocaleTimeString() : '--:--:--';
    displayTotalBreakTime.textContent = formatTime(totalBreakDuration);

    // Calcular y mostrar tiempo total de trabajo efectivo
    let effectiveWorkDuration = 0;
    if (workStartTime) {
        const now = workEndTime || Date.now(); // Si la jornada no ha terminado, usa la hora actual
        effectiveWorkDuration = now - workStartTime - totalBreakDuration;
        if (effectiveWorkDuration < 0) effectiveWorkDuration = 0; // Evitar tiempos negativos
    }
    displayTotalWorkTime.textContent = formatTime(effectiveWorkDuration);
}

/**
 * Guarda los datos de la jornada actual en el backend.
 */
async function saveCurrentWorkdayData() {
    if (currentWorkdayData && loggedInUserDni) {
        // Asegurarse de que las claves coincidan con el backend (snake_case)
        const dataToSend = {
            date: currentWorkdayData.date,
            start_time: workStartTime, // Cambiado a snake_case
            end_time: workEndTime,     // Cambiado a snake_case
            total_break_duration: totalBreakDuration, // Cambiado a snake_case
            events: currentDayLog
        };

        const response = await apiPost('/workday', dataToSend); // Enviar dataToSend
        if (response && response.success) {
            console.log("Jornada guardada en el backend.");
        }
    }
}

/**
 * Carga el estado de la jornada actual desde el backend al inicio de la aplicación.
 */
async function loadCurrentWorkday() {
    const todayDateString = getTodayDateString();
    const response = await apiGet(`/workday?date=${todayDateString}`);

    if (response && response.success && response.workday) {
        currentWorkdayData = response.workday;
        workStartTime = currentWorkdayData.start_time || null; // Cambiado a snake_case
        workEndTime = currentWorkdayData.end_time || null;     // Cambiado a snake_case
        totalBreakDuration = currentWorkdayData.total_break_duration || 0; // Cambiado a snake_case
        currentDayLog = currentWorkdayData.events || [];

        // Reconstruir el log en la UI
        logEntries.innerHTML = `
            <div class="log-entry">
                <span>Aplicación cargada</span>
                <span id="initialLoadTime">${new Date().toLocaleTimeString()}</span>
            </div>
        `;
        currentDayLog.forEach(entry => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'log-entry';
            let durationText = entry.duration !== null ? ` (${formatTime(entry.duration)})` : '';
            entryDiv.innerHTML = `
                <span>${entry.event}${durationText}</span>
                <span>${new Date(entry.time).toLocaleTimeString()}</span>
            `;
            logEntries.appendChild(entryDiv);
        });

        // Determinar el estado actual de la jornada
        if (workEndTime) {
            status = 'finished';
        } else if (currentDayLog.some(e => e.event === 'Pausa Iniciada' && !currentDayLog.some(f => f.event.startsWith('Pausa Finalizada') && f.time > e.time))) {
            const lastBreakStart = currentDayLog.filter(e => e.event === 'Pausa Iniciada').pop();
            if (lastBreakStart) {
                breakStartTime = lastBreakStart.time;
                status = 'on_break';
            }
        } else if (workStartTime) {
            status = 'working';
        } else {
            status = 'idle';
        }
    } else {
        // Si no hay datos para hoy, inicializar un nuevo objeto de jornada
        currentWorkdayData = {
            date: todayDateString,
            start_time: null, // Cambiado a snake_case
            end_time: null,     // Cambiado a snake_case
            total_break_duration: 0, // Cambiado a snake_case
            events: []
        };
        status = 'idle';
    }
    updateUI(); // Actualizar la UI con el estado cargado
    updateWelcomeMessage(); // Actualizar el mensaje de bienvenida al cargar la jornada
}

/**
 * Actualiza el mensaje de bienvenida en la UI.
 */
function updateWelcomeMessage() {
    if (loggedInUserDni) {
        // Por ahora, usamos el DNI como "nombre"
        welcomeMessageDisplay.textContent = `¡Bienvenido ${loggedInUserDni}!`;
    } else {
        welcomeMessageDisplay.textContent = ''; // Limpiar si no hay usuario logueado
    }
}

/**
 * Cierra la sesión del usuario.
 */
function logout() {
    // Limpiar variables de autenticación
    loggedInUserDni = null;
    loggedInUserRole = null;

    // Ocultar la aplicación y mostrar la pantalla de login
    appContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');

    // Resetear el mensaje de bienvenida
    updateWelcomeMessage();

    // Resetear el estado de la jornada actual para una nueva sesión
    workStartTime = null;
    workEndTime = null;
    breakStartTime = null;
    totalBreakDuration = 0;
    currentDayLog = [];
    status = 'idle';
    currentWorkdayData = null; // Asegurarse de que no haya datos de jornada residuales

    // Limpiar el log en la UI
    logEntries.innerHTML = `
        <div class="log-entry">
            <span>Aplicación cargada</span>
            <span id="initialLoadTime">${new Date().toLocaleTimeString()}</span>
        </div>
    `;
    initialLoadTime.textContent = new Date().toLocaleTimeString();

    // Detener el reloj si está corriendo
    clearInterval(timerInterval);
    timerInterval = setInterval(updateCurrentTime, 1000); // Reiniciar el reloj

    updateUI(); // Actualizar la UI a su estado inicial
    loginError.classList.add('hidden'); // Ocultar cualquier error de login anterior
    dniInput.value = ''; // Limpiar campos de login
    passwordInput.value = '';
}


// --- Event Listeners para la Pestaña "Mi Jornada" ---

startButton.addEventListener('click', async () => {
    if (status === 'idle') {
        workStartTime = Date.now();
        await addLogEntry('Jornada Iniciada', workStartTime);
        status = 'working';
        updateUI();
    }
});

startBreakButton.addEventListener('click', async () => {
    if (status === 'working') {
        breakStartTime = Date.now();
        await addLogEntry('Pausa Iniciada', breakStartTime);
        status = 'on_break';
        updateUI();
    }
});

endBreakButton.addEventListener('click', async () => {
    if (status === 'on_break' && breakStartTime) {
        const breakDuration = Date.now() - breakStartTime;
        totalBreakDuration += breakDuration;
        await addLogEntry(`Pausa Finalizada`, Date.now(), breakDuration);
        breakStartTime = null; // Resetear el inicio de la pausa
        status = 'working';
        updateUI();
    }
});

endButton.addEventListener('click', async () => {
    if (status === 'working') {
        workEndTime = Date.now();
        await addLogEntry('Jornada Finalizada', workEndTime);
        status = 'finished';
        clearInterval(timerInterval); // Detener el reloj
        updateUI();
    }
});

resetButton.addEventListener('click', () => {
    // Solo permitir reiniciar si la jornada ha sido iniciada alguna vez
    if (status === 'idle' && !workStartTime) {
        showMessage("No hay una jornada activa para reiniciar.");
        return;
    }

    // Mostrar un modal de confirmación personalizado
    const confirmResetModal = document.createElement('div');
    confirmResetModal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50';
    confirmResetModal.innerHTML = `
        <div class="bg-white p-8 rounded-lg shadow-xl text-center">
            <p class="text-lg font-semibold mb-4">¿Estás seguro de que quieres reiniciar la jornada?</p>
            <p class="text-sm text-gray-600 mb-6">Se borrarán todos los datos del día actual de la base de datos.</p>
            <button id="confirmResetBtn" class="button button-secondary mr-4">Sí, Reiniciar</button>
            <button id="cancelResetBtn" class="button button-primary">Cancelar</button>
        </div>
    `;
    document.body.appendChild(confirmResetModal);

    document.getElementById('confirmResetBtn').addEventListener('click', async () => {
        const todayDateString = getTodayDateString();
        const response = await apiPost('/workday/delete', { date: todayDateString });

        if (response && response.success) {
            // Reiniciar todas las variables de estado
            workStartTime = null;
            workEndTime = null;
            breakStartTime = null;
            totalBreakDuration = 0;
            currentDayLog = [];
            status = 'idle';

            // Reinicializar el objeto de la jornada actual para la base de datos
            currentWorkdayData = {
                date: todayDateString,
                start_time: null, // Cambiado a snake_case
                end_time: null,     // Cambiado a snake_case
                total_break_duration: 0, // Cambiado a snake_case
                events: []
            };

            // Limpiar el log en la UI, excepto la entrada inicial
            logEntries.innerHTML = `
                <div class="log-entry">
                    <span>Aplicación cargada</span>
                    <span id="initialLoadTime">${new Date().toLocaleTimeString()}</span>
                </div>
            `;

            // Reiniciar el reloj si se había detenido
            clearInterval(timerInterval);
            timerInterval = setInterval(updateCurrentTime, 1000);

            updateUI(); // Actualizar la UI a su estado inicial
            document.body.removeChild(confirmResetModal); // Cerrar el modal
            addLogEntry('Jornada Reiniciada', Date.now()); // Añadir al log (y se guardará en el nuevo currentWorkdayData)
        } else {
            showMessage("No se pudo reiniciar la jornada. Inténtalo de nuevo.");
            document.body.removeChild(confirmResetModal);
        }
    });

    document.getElementById('cancelResetBtn').addEventListener('click', () => {
        document.body.removeChild(confirmResetModal); // Cerrar el modal
    });
});

// --- Lógica de Pestañas ---

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Desactivar todas las pestañas y ocultar todos los contenidos
        tabButtons.forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));

        // Activar la pestaña clicada y mostrar su contenido
        button.classList.add('active');
        const targetTabId = button.dataset.tab + 'Tab';
        document.getElementById(targetTabId).classList.remove('hidden'); // Corregido: targetTabId en lugar de targetTabTabId

        // Si se cambia a la pestaña de registros, actualizar la vista diaria por defecto
        if (button.dataset.tab === 'records') {
            const today = getTodayDateString();
            recordDateInput.value = today; // Establecer la fecha actual en el input
            viewDailyRecords(); // Cargar los registros del día actual
        } else if (button.dataset.tab === 'admin') {
            // Si se cambia a la pestaña de admin, limpiar y cargar los datos de todos los usuarios
            allWorkdaysDisplay.innerHTML = '<p class="text-gray-600">Haz clic en "Cargar Todas las Jornadas" para ver los registros.</p>';
            filterUserDniInput.value = ''; // Limpiar filtro de DNI
        }
    });
});

// --- Lógica de la Pestaña "Registros" ---

/**
 * Muestra los registros diarios para una fecha específica del usuario logueado.
 */
async function viewDailyRecords() {
    const dateString = recordDateInput.value;
    if (!dateString) {
        recordsDisplay.innerHTML = '<p class="text-red-600">Por favor, selecciona una fecha.</p>';
        return;
    }

    recordsDisplay.innerHTML = '<p class="text-gray-600">Cargando registros...</p>';
    const response = await apiGet(`/workday?date=${dateString}`);

    if (response && response.success && response.workday) {
        const workday = response.workday;
        let html = `<h3 class="text-xl font-semibold mb-4">Registros del día: ${dateString}</h3>`;
        html += `<table class="records-table">
                    <thead>
                        <tr>
                            <th>Evento</th>
                            <th>Hora</th>
                            <th>Duración</th>
                        </tr>
                    </thead>
                    <tbody>`;

        // Asegurarse de que workday.events sea un array
        const events = Array.isArray(workday.events) ? workday.events : [];

        events.forEach(event => {
            const eventTime = new Date(event.time).toLocaleTimeString();
            const duration = event.duration ? formatTime(event.duration) : '--';
            html += `<tr>
                        <td>${event.event}</td>
                        <td>${eventTime}</td>
                        <td>${duration}</td>
                    </tr>`;
        });

        // Calcular y añadir resumen del día
        let totalWorkMs = 0;
        // Usar las claves correctas del backend (snake_case)
        if (workday.start_time && workday.end_time) {
            totalWorkMs = workday.end_time - workday.start_time - (workday.total_break_duration || 0);
            if (totalWorkMs < 0) totalWorkMs = 0;
        }

        html += `</tbody></table>
                 <div class="mt-6 p-4 bg-blue-50 rounded-lg text-left border border-blue-200">
                    <p class="font-bold text-blue-800 mb-2">Resumen del Día:</p>
                    <p><span class="font-semibold">Inicio de Jornada:</span> ${workday.start_time ? new Date(workday.start_time).toLocaleTimeString() : 'N/A'}</p>
                    <p><span class="font-semibold">Fin de Jornada:</span> ${workday.end_time ? new Date(workday.end_time).toLocaleTimeString() : 'N/A'}</p>
                    <p><span class="font-semibold">Tiempo Total de Trabajo Efectivo:</span> ${formatTime(totalWorkMs)}</p>
                    <p><span class="font-semibold">Tiempo Total de Pausa:</span> ${formatTime(workday.total_break_duration || 0)}</p>
                 </div>`;
        recordsDisplay.innerHTML = html;
    } else if (response && !response.success && response.message) {
        recordsDisplay.innerHTML = `<p class="text-gray-600">${response.message}</p>`;
    } else {
        recordsDisplay.innerHTML = '<p class="text-gray-600">No hay registros para esta fecha.</p>';
    }
}

/**
 * Muestra los registros semanales del usuario logueado.
 */
async function viewWeeklyRecords() {
    recordsDisplay.innerHTML = '<p class="text-gray-600">Cargando registros semanales...</p>';
    const response = await apiGet('/workdays/user'); // Obtener solo las jornadas del usuario logueado

    if (response && response.success && response.workdays) {
        const allWorkdays = response.workdays;
        const today = new Date();
        // Calcular el inicio y fin de la semana actual (domingo a sábado)
        const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0); // Establecer a inicio del día
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999); // Establecer a fin del día

        let weeklyWorkdays = allWorkdays.filter(wd => {
            const wdDate = new Date(wd.date);
            return wdDate >= startOfWeek && wdDate <= endOfWeek;
        });

        if (weeklyWorkdays.length === 0) {
            recordsDisplay.innerHTML = '<p class="text-gray-600">No hay registros para esta semana.</p>';
            return;
        }

        let totalWeeklyWorkMs = 0;
        let totalWeeklyBreakMs = 0;

        let html = `<h3 class="text-xl font-semibold mb-4">Registros Semanales (Semana del ${startOfWeek.toLocaleDateString()} al ${endOfWeek.toLocaleDateString()})</h3>`;
        html += `<table class="records-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Inicio</th>
                            <th>Fin</th>
                            <th>Trabajo Efectivo</th>
                            <th>Pausa Total</th>
                        </tr>
                    </thead>
                    <tbody>`;

        weeklyWorkdays.forEach(wd => {
            // Usar las claves correctas del backend (snake_case)
            const startTime = wd.start_time ? new Date(wd.start_time).toLocaleTimeString() : 'N/A';
            const endTime = wd.end_time ? new Date(wd.end_time).toLocaleTimeString() : 'N/A';
            const breakDuration = wd.total_break_duration || 0;

            let workDuration = 0;
            if (wd.start_time && wd.end_time) {
                workDuration = wd.end_time - wd.start_time - breakDuration;
                if (workDuration < 0) workDuration = 0;
            }

            totalWeeklyWorkMs += workDuration;
            totalWeeklyBreakMs += breakDuration;

            html += `<tr>
                        <td>${wd.date}</td>
                        <td>${startTime}</td>
                        <td>${endTime}</td>
                        <td>${formatTime(workDuration)}</td>
                        <td>${formatTime(breakDuration)}</td>
                    </tr>`;
        });

        html += `</tbody></table>
                 <div class="mt-6 p-4 bg-blue-50 rounded-lg text-left border border-blue-200">
                    <p class="font-bold text-blue-800 mb-2">Resumen Semanal:</p>
                    <p><span class="font-semibold">Tiempo Total de Trabajo Efectivo:</span> ${formatTime(totalWeeklyWorkMs)}</p>
                    <p><span class="font-semibold">Tiempo Total de Pausa:</span> ${formatTime(totalWeeklyBreakMs)}</p>
                 </div>`;
        recordsDisplay.innerHTML = html;
    } else {
        recordsDisplay.innerHTML = '<p class="text-gray-600">Error al cargar registros semanales o no hay datos.</p>';
    }
}

/**
 * Muestra los registros mensuales del usuario logueado.
 */
async function viewMonthlyRecords() {
    recordsDisplay.innerHTML = '<p class="text-gray-600">Cargando registros mensuales...</p>';
    const response = await apiGet('/workdays/user'); // Obtener solo las jornadas del usuario logueado

    if (response && response.success && response.workdays) {
        const allWorkdays = response.workdays;
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        let monthlyWorkdays = allWorkdays.filter(wd => {
            const wdDate = new Date(wd.date);
            return wdDate.getMonth() === currentMonth && wdDate.getFullYear() === currentYear;
        });

        if (monthlyWorkdays.length === 0) {
            recordsDisplay.innerHTML = '<p class="text-gray-600">No hay registros para este mes.</p>';
            return;
        }

        let totalMonthlyWorkMs = 0;
        let totalMonthlyBreakMs = 0;

        let html = `<h3 class="text-xl font-semibold mb-4">Registros Mensuales (${new Date(currentYear, currentMonth).toLocaleString('es-ES', { month: 'long', year: 'numeric' })})</h3>`;
        html += `<table class="records-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Inicio</th>
                            <th>Fin</th>
                            <th>Trabajo Efectivo</th>
                            <th>Pausa Total</th>
                        </tr>
                    </thead>
                    <tbody>`;

        monthlyWorkdays.forEach(wd => {
            // Usar las claves correctas del backend (snake_case)
            const startTime = wd.start_time ? new Date(wd.start_time).toLocaleTimeString() : 'N/A';
            const endTime = wd.end_time ? new Date(wd.end_time).toLocaleTimeString() : 'N/A';
            const breakDuration = wd.total_break_duration || 0;

            let workDuration = 0;
            if (wd.start_time && wd.end_time) {
                workDuration = wd.end_time - wd.start_time - breakDuration;
                if (workDuration < 0) workDuration = 0;
            }

            totalMonthlyWorkMs += workDuration;
            totalMonthlyBreakMs += breakDuration;

            html += `<tr>
                        <td>${wd.date}</td>
                        <td>${startTime}</td>
                        <td>${endTime}</td>
                        <td>${formatTime(workDuration)}</td>
                        <td>${formatTime(breakDuration)}</td>
                    </tr>`;
        });

        html += `</tbody></table>
                 <div class="mt-6 p-4 bg-blue-50 rounded-lg text-left border border-blue-200">
                    <p class="font-bold text-blue-800 mb-2">Resumen Mensual:</p>
                    <p><span class="font-semibold">Tiempo Total de Trabajo Efectivo:</span> ${formatTime(totalMonthlyWorkMs)}</p>
                    <p><span class="font-semibold">Tiempo Total de Pausa:</span> ${formatTime(totalMonthlyBreakMs)}</p>
                 </div>`;
        recordsDisplay.innerHTML = html;
    } else {
        recordsDisplay.innerHTML = '<p class="text-gray-600">Error al cargar registros mensuales o no hay datos.</p>';
    }
}

/**
 * Exporta los datos de todas las jornadas del usuario logueado a un archivo CSV.
 */
async function exportData() {
    const response = await apiGet('/workdays/user'); // Obtener solo las jornadas del usuario logueado
    if (response && response.success && response.workdays) {
        const allWorkdays = response.workdays;
        if (allWorkdays.length === 0) {
            showMessage("No hay datos para exportar.");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Fecha,Inicio Jornada,Fin Jornada,Tiempo Trabajo Efectivo (HH:MM:SS),Tiempo Pausa Total (HH:MM:SS),Eventos\n";

        allWorkdays.forEach(wd => {
            // Usar las claves correctas del backend (snake_case)
            const startTime = wd.start_time ? new Date(wd.start_time).toLocaleString() : 'N/A';
            const endTime = wd.end_time ? new Date(wd.end_time).toLocaleString() : 'N/A';
            const totalBreak = formatTime(wd.total_break_duration || 0);

            let workDuration = 0;
            if (wd.start_time && wd.end_time) {
                workDuration = wd.end_time - wd.start_time - (wd.total_break_duration || 0);
                if (workDuration < 0) workDuration = 0;
            }
            const effectiveWork = formatTime(workDuration);

            // Formatear eventos para CSV (ej. "Evento1 @ Hora1; Evento2 @ Hora2")
            const eventsFormatted = (wd.events || []).map(e => {
                const time = new Date(e.time).toLocaleTimeString();
                const duration = e.duration ? ` (${formatTime(e.duration)})` : '';
                return `${e.event}${duration} @ ${time}`;
            }).join('; ');

            csvContent += `${wd.date},"${startTime}","${endTime}","${effectiveWork}","${totalBreak}","${eventsFormatted}"\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `registro_jornadas_${loggedInUserDni}.csv`); // Nombre de archivo con DNI
        document.body.appendChild(link); // Required for Firefox
        link.click();
        document.body.removeChild(link); // Clean up
        showMessage("Datos exportados a registro_jornadas.csv");

    } else {
        showMessage("Error al obtener datos para exportar.");
    }
}

// --- Lógica de Login ---

loginButton.addEventListener('click', async () => {
    const dni = dniInput.value;
    const password = passwordInput.value;

    const response = await apiPost('/login', { dni, password });

    if (response && response.success) {
        loggedInUserDni = response.user_dni;
        loggedInUserRole = response.role;

        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');

        // Mostrar u ocultar la pestaña de administración
        if (loggedInUserRole === 'admin') {
            adminTabButton.classList.remove('hidden');
        } else {
            adminTabButton.classList.add('hidden');
        }

        loadCurrentWorkday(); // Cargar datos de la jornada al loguearse
        updateWelcomeMessage(); // Actualizar el mensaje de bienvenida
    } else {
        loginError.textContent = response ? response.message : "Error de conexión";
        loginError.classList.remove('hidden');
    }
});

// --- Lógica del Panel de Administración ---

registerUserButton.addEventListener('click', async () => {
    const newDni = newDniInput.value.trim();
    const newPassword = newPasswordInput.value.trim();
    const newRole = newRoleSelect.value;

    if (!newDni || !newPassword) {
        registerUserMessage.textContent = "DNI y contraseña son obligatorios.";
        registerUserMessage.classList.remove('hidden', 'text-green-600');
        registerUserMessage.classList.add('text-red-600');
        return;
    }

    const response = await apiPost('/admin/register_user', { dni: newDni, password: newPassword, role: newRole });

    if (response && response.success) {
        registerUserMessage.textContent = response.message;
        registerUserMessage.classList.remove('hidden', 'text-red-600');
        registerUserMessage.classList.add('text-green-600');
        newDniInput.value = '';
        newPasswordInput.value = '';
        newRoleSelect.value = 'user'; // Resetear a user por defecto
    } else {
        registerUserMessage.textContent = response ? response.message : "Error al registrar usuario.";
        registerUserMessage.classList.remove('hidden', 'text-green-600');
        registerUserMessage.classList.add('text-red-600');
    }
});

viewAllWorkdaysButton.addEventListener('click', async () => {
    allWorkdaysDisplay.innerHTML = '<p class="text-gray-600">Cargando todas las jornadas...</p>';
    const filterDni = filterUserDniInput.value.trim();

    const response = await apiGet('/admin/all_workdays');

    if (response && response.success && response.workdays) {
        let allWorkdays = response.workdays;

        // Aplicar filtro por DNI si se proporciona
        if (filterDni) {
            allWorkdays = allWorkdays.filter(wd => wd.user_dni === filterDni);
            if (allWorkdays.length === 0) {
                allWorkdaysDisplay.innerHTML = `<p class="text-gray-600">No hay jornadas para el DNI: ${filterDni}</p>`;
                return;
            }
        }

        if (allWorkdays.length === 0) {
            allWorkdaysDisplay.innerHTML = '<p class="text-gray-600">No hay jornadas registradas.</p>';
            return;
        }

        let html = `<h3 class="text-xl font-semibold mb-4">Todas las Jornadas Registradas</h3>`;
        html += `<table class="records-table">
                    <thead>
                        <tr>
                            <th>Usuario (DNI)</th>
                            <th>Fecha</th>
                            <th>Inicio</th>
                            <th>Fin</th>
                            <th>Trabajo Efectivo</th>
                            <th>Pausa Total</th>
                        </tr>
                    </thead>
                    <tbody>`;

        allWorkdays.forEach(wd => {
            // Usar las claves correctas del backend (snake_case)
            const startTime = wd.start_time ? new Date(wd.start_time).toLocaleTimeString() : 'N/A';
            const endTime = wd.end_time ? new Date(wd.end_time).toLocaleTimeString() : 'N/A';
            const breakDuration = wd.total_break_duration || 0;

            let workDuration = 0;
            if (wd.start_time && wd.end_time) {
                workDuration = wd.end_time - wd.start_time - breakDuration;
                if (workDuration < 0) workDuration = 0;
            }

            html += `<tr>
                        <td>${wd.user_dni}</td>
                        <td>${wd.date}</td>
                        <td>${startTime}</td>
                        <td>${endTime}</td>
                        <td>${formatTime(workDuration)}</td>
                        <td>${formatTime(breakDuration)}</td>
                    </tr>`;
        });

        html += `</tbody></table>`;
        allWorkdaysDisplay.innerHTML = html;

    } else {
        allWorkdaysDisplay.innerHTML = '<p class="text-gray-600">Error al cargar todas las jornadas o no hay datos.</p>';
    }
});


// --- Inicialización ---

document.addEventListener('DOMContentLoaded', () => {
    initialLoadTime.textContent = new Date().toLocaleTimeString();
    timerInterval = setInterval(updateCurrentTime, 1000); // Iniciar el reloj

    // Establecer la fecha actual en el input de fecha de registros
    recordDateInput.value = getTodayDateString();

    // Event listeners para los botones de registros
    viewDailyButton.addEventListener('click', viewDailyRecords);
    viewWeeklyButton.addEventListener('click', viewWeeklyRecords);
    viewMonthlyButton.addEventListener('click', viewMonthlyRecords);
    exportDataButton.addEventListener('click', exportData);
    recordDateInput.addEventListener('change', viewDailyRecords); // Actualizar al cambiar la fecha

    // Event listener para el botón de cerrar sesión
    logoutButton.addEventListener('click', logout);

    // Event listeners para el panel de administración
    registerUserButton.addEventListener('click', registerUserButton.click);
    viewAllWorkdaysButton.addEventListener('click', viewAllWorkdaysButton.click);
});
