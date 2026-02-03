// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAjFrmneJ-ifX_jJ7Kir8yssQOLWaEIVKc",
    authDomain: "brico-calendar.firebaseapp.com",
    databaseURL: "https://brico-calendar-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "brico-calendar",
    storageBucket: "brico-calendar.firebasestorage.app",
    messagingSenderId: "782258376222",
    appId: "1:782258376222:web:4dd62c593f157abe68e80f",
    measurementId: "G-DD91PER3MZ"
};

// Initialize Firebase (Compat Mode)
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
// const storage = firebase.storage(); // REMOVED: Saving photos as Base64 in Database
const auth = firebase.auth();

// State
const state = {
    currentDate: new Date(),
    view: 'month', // month, week, day
    events: [], // Will be loaded from Firebase
    selectedEventId: null,
    showHolidays: true,
    loading: true,
    currentStore: null // { id, name }
};

const STORES = [
    { id: '1003', name: 'MONSELICE' },
    { id: '1006', name: 'GROTTAMMARE' },
    { id: '1112', name: 'PORTOGRUARO' },
    { id: '1128', name: 'RICCIONE' },
    { id: '1136', name: 'COMACCHIO' },
    { id: '1161', name: 'PONTEDERA' },
    { id: '1163', name: 'PISTOIA' },
    { id: '1166', name: 'CECINA' },
    { id: '1173', name: 'FOLLONICA' },
    { id: '1179', name: 'CALDERARA' },
    { id: '1180', name: 'CENTO' },
    { id: '1256', name: 'TERAMO' }
];

// Logic to Auto-Login anonymously
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log("Utente autenticato:", user.uid);
    } else {
        console.log("Nessun utente, tentativo login anonimo...");
        auth.signInAnonymously().catch((error) => {
            console.error("Errore login anonimo:", error);
            alert("Attenzione: Impossibile autenticarsi. Il caricamento foto potrebbe non funzionare.");
        });
    }
});

const STATUS = {
    SCHEDULED: 'scheduled',
    UNLOADED: 'unloaded',
    CHECKED: 'checked',
    LOADED: 'loaded',
    HOLIDAY: 'holiday'
};

const STATUS_COLORS = {
    [STATUS.SCHEDULED]: 'var(--status-scheduled)',
    [STATUS.UNLOADED]: 'var(--status-unloaded)',
    [STATUS.CHECKED]: 'var(--status-checked)',
    [STATUS.LOADED]: 'var(--status-loaded)',
    [STATUS.HOLIDAY]: '#ffcc00'
};

const STATUS_LABELS = {
    [STATUS.SCHEDULED]: 'Pianificato (Blu)',
    [STATUS.UNLOADED]: 'Scaricato (Giallo)',
    [STATUS.CHECKED]: 'Spuntato (Rosso)',
    [STATUS.LOADED]: 'Caricato (Verde)'
};

const ITALIAN_HOLIDAYS = [
    { date: '01-01', title: 'Capodanno' },
    { date: '01-06', title: 'Epifania' },
    { date: '04-25', title: 'Liberazione' },
    { date: '05-01', title: 'Festa del Lavoro' },
    { date: '06-02', title: 'Repubblica' },
    { date: '08-15', title: 'Ferragosto' },
    { date: '11-01', title: 'Tutti i Santi' },
    { date: '12-08', title: 'Immacolata' },
    { date: '12-25', title: 'Natale' },
    { date: '12-26', title: 'Santo Stefano' },
    { date: '2025-04-20', title: 'Pasqua', isFullDate: true },
    { date: '2025-04-21', title: 'Pasquetta', isFullDate: true },
    { date: '2026-04-05', title: 'Pasqua', isFullDate: true },
    { date: '2026-04-06', title: 'Pasquetta', isFullDate: true }
];

// DOM Elements
const gridContainer = document.getElementById('calendar-grid');
const currentMonthYear = document.getElementById('current-month-year');
const modal = document.getElementById('event-modal');
const eventForm = document.getElementById('event-form');
const dynamicFields = document.getElementById('dynamic-fields');
const deleteModal = document.getElementById('delete-modal');
const storeModal = document.getElementById('store-modal');

// --- DATABASE LOGIC ---

function initApp() {
    console.log("Initializing App...");
    const savedStoreId = localStorage.getItem('brico_store_id');

    if (savedStoreId) {
        const store = STORES.find(s => s.id === savedStoreId);
        if (store) {
            loginStore(store);
            return;
        }
    }

    // If no store, show Modal
    storeModal.classList.remove('hidden');
    storeModal.style.display = 'flex';
}

function loginStore(store) {
    if (!store) return;
    state.currentStore = store;
    localStorage.setItem('brico_store_id', store.id);

    // UI Update
    storeModal.classList.add('hidden');
    storeModal.style.display = 'none';

    const brandLogo = document.querySelector('.brand-logo-container');
    if (brandLogo) {
        let storeLabel = document.getElementById('store-label');
        if (!storeLabel) {
            storeLabel = document.createElement('div');
            storeLabel.id = 'store-label';
            storeLabel.style.fontSize = '12px';
            storeLabel.style.color = '#666';
            storeLabel.style.marginTop = '5px';
            brandLogo.appendChild(storeLabel);
        }
        storeLabel.textContent = `Negozio: ${store.id} - ${store.name}`;

        if (!document.getElementById('btn-change-store')) {
            const changeBtn = document.createElement('button');
            changeBtn.id = 'btn-change-store';
            changeBtn.textContent = '(Cambia)';
            changeBtn.style.border = 'none';
            changeBtn.style.background = 'none';
            changeBtn.style.color = '#0078d4';
            changeBtn.style.cursor = 'pointer';
            changeBtn.style.fontSize = '11px';
            changeBtn.style.marginLeft = '5px';
            changeBtn.onclick = logoutStore;
            storeLabel.appendChild(changeBtn);
        }
    }

    // Database Connection
    const eventsRef = db.ref(`stores/${store.id}/events`);
    eventsRef.on('value', (snapshot) => {
        const data = snapshot.val();
        const events = [];
        if (data) {
            Object.keys(data).forEach(key => {
                events.push({ id: key, ...data[key] });
            });
        }
        state.events = events;
        state.loading = false;
        renderCalendar();
    }, (error) => {
        console.error("Database Error:", error);
        state.loading = false;
        renderCalendar();
    });
}

function logoutStore() {
    localStorage.removeItem('brico_store_id');
    location.reload();
}

function dbAddEvent(eventData) {
    if (!state.currentStore) return;
    return db.ref(`stores/${state.currentStore.id}/events`).push(eventData);
}

function dbUpdateEvent(id, updateData) {
    if (!state.currentStore) return;
    return db.ref(`stores/${state.currentStore.id}/events/${id}`).update(updateData);
}

function dbDeleteEvent(id) {
    if (!state.currentStore) return;
    return db.ref(`stores/${state.currentStore.id}/events/${id}`).remove();
}

// --- PHOTO UPLOAD LOGIC ---

function compressImage(file, maxSize) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height && width > maxSize) {
                    height *= maxSize / width;
                    width = maxSize;
                } else if (height > maxSize) {
                    width *= maxSize / height;
                    height = maxSize;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Canvas to Blob failed'));
                }, 'image/jpeg', 0.6);
            };
            img.onerror = (err) => reject(new Error('Image load failed'));
            img.src = e.target.result;
        };
        reader.onerror = (err) => reject(new Error('FileReader failed'));
        reader.readAsDataURL(file);
    });
}

// MODIFIED: Convert Blob to Base64 String instead of uploading to Storage
async function uploadPhoto(file) {
    try {
        console.log("Inizio compressione...");
        const compressedBlob = await compressImage(file, 600); // Max 600px
        console.log("Compressione completata. Dimensione:", compressedBlob.size);

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result;
                console.log("Foto convertita in Base64 (lunghezza stringa):", base64String.length);
                resolve(base64String);
            };
            reader.onerror = () => reject(new Error("Errore lettura Blob"));
            reader.readAsDataURL(compressedBlob);
        });
    } catch (e) {
        console.error("Errore gestione foto:", e);
        throw e;
    }
}


// Modal Logic
const storeSelector = document.getElementById('store-selector');
const btnConfirmStore = document.getElementById('btn-confirm-store');

if (storeSelector && btnConfirmStore) {
    storeSelector.addEventListener('change', (e) => {
        btnConfirmStore.disabled = !e.target.value;
    });

    btnConfirmStore.addEventListener('click', () => {
        const storeId = storeSelector.value;
        const store = STORES.find(s => s.id === storeId);
        if (store) loginStore(store);
    });
}

// --- RENDER & UI LOGIC ---

function getStatusColor(status) { return STATUS_COLORS[status] || STATUS_COLORS.scheduled; }

function renderCalendar() {
    if (state.loading) {
        gridContainer.innerHTML = '<div style="padding:20px; text-align:center;">Caricamento...</div>';
        return;
    }
    gridContainer.innerHTML = '';
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    currentMonthYear.textContent = new Date(year, month).toLocaleString('it-IT', { month: 'long', year: 'numeric' });

    if (state.view === 'month') renderMonthView(year, month);
    else if (state.view === 'week') renderWeekView(state.currentDate);
    else if (state.view === 'day') renderDayView(state.currentDate);
}

// helper functions
function getMonday(d) {
    d = new Date(d);
    var day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}
function isToday(d) {
    const today = new Date();
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
}

function renderMonthView(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayIndex = (firstDay.getDay() + 6) % 7;
    const totalDays = lastDay.getDate();

    const grid = document.createElement('div');
    grid.className = 'month-grid';
    ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].forEach(day => {
        const h = document.createElement('div'); h.className = 'day-header'; h.textContent = day; grid.appendChild(h);
    });

    for (let i = 0; i < startDayIndex; i++) {
        const cell = document.createElement('div'); cell.className = 'day-cell other-month'; grid.appendChild(cell);
    }

    for (let i = 1; i <= totalDays; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        if (isToday(new Date(year, month, i))) cell.classList.add('today');
        cell.innerHTML = `<span class="day-number">${i}</span>`;
        cell.onclick = (e) => { if (e.target === cell || e.target.className === 'day-number') openModal(null, dateStr); };
        renderEventsRef(cell, dateStr);
        if (state.showHolidays) renderHolidays(cell, dateStr, 'month');
        grid.appendChild(cell);
    }
    gridContainer.appendChild(grid);
}

function renderWeekView(currentDate) {
    const startOfWeek = getMonday(currentDate);
    const grid = document.createElement('div');
    grid.style.display = 'grid'; grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek); d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const cell = document.createElement('div');
        cell.className = 'day-cell'; cell.style.minHeight = '300px';
        cell.innerHTML = `<div class="day-header">${d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })}</div>`;
        cell.onclick = () => openModal(null, dateStr);
        renderEventsRef(cell, dateStr);
        grid.appendChild(cell);
    }
    gridContainer.appendChild(grid);
}

function renderDayView(currentDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const container = document.createElement('div');
    container.style.padding = '20px';
    const title = document.createElement('h3'); title.textContent = currentDate.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    container.appendChild(title);

    // Print Button
    const pBtn = document.createElement('button'); pBtn.textContent = 'Stampa Report'; pBtn.className = 'btn-primary';
    pBtn.onclick = () => openReportPreview(dateStr);
    container.appendChild(pBtn);

    const list = document.createElement('div'); list.style.marginTop = '20px';
    state.events.filter(e => e.date === dateStr).forEach(event => {
        const item = document.createElement('div');
        item.className = 'event-item';
        item.style.backgroundColor = getStatusColor(event.status);
        item.textContent = event.title;
        item.onclick = () => openModal(event.id);
        list.appendChild(item);
    });
    container.appendChild(list);
    gridContainer.appendChild(container);
}

function renderEventsRef(container, dateStr) {
    state.events.filter(e => e.date === dateStr).forEach(event => {
        const el = document.createElement('div'); el.className = 'event-item';
        el.style.backgroundColor = getStatusColor(event.status); el.textContent = event.title;
        el.onclick = (e) => { e.stopPropagation(); openModal(event.id); };
        container.appendChild(el);
    });
}

function renderHolidays(container, dateStr, view) {
    ITALIAN_HOLIDAYS.forEach(h => {
        if (dateStr.endsWith(h.date) || (h.isFullDate && h.date === dateStr)) {
            const el = document.createElement('div'); el.className = 'event-item';
            el.style.backgroundColor = '#ffcc00'; el.style.color = 'black'; el.textContent = '🇮🇹 ' + h.title;
            container.appendChild(el);
        }
    });
}

function openModal(id, date) {
    state.selectedEventId = id;
    modal.classList.remove('hidden');
    eventForm.reset();
    dynamicFields.innerHTML = '';
    if (id) {
        const e = state.events.find(ev => ev.id === id);
        document.getElementById('modal-title').textContent = e.title;
        document.getElementById('event-title').value = e.title;
        document.getElementById('event-date').value = e.date;
        renderDynamicFields(e);
        document.getElementById('btn-delete-event').classList.remove('hidden');
    } else {
        document.getElementById('modal-title').textContent = 'Nuovo Arrivo';
        document.getElementById('event-date').value = date;
        document.getElementById('btn-delete-event').classList.add('hidden');
    }
}

function renderDynamicFields(event) {
    const container = document.createElement('div');
    container.style.marginTop = '16px';
    container.style.padding = '10px';
    container.style.backgroundColor = '#f3f2f1';
    container.style.borderRadius = '4px';

    let html = `<p><strong>Stato Corrente:</strong> <span style="color:${getStatusColor(event.status)}">${STATUS_LABELS[event.status]}</span></p>`;

    if (event.details) {
        if (event.details.ddt) html += `<p>DDT: ${event.details.ddt} (Op: ${event.details.op_unloaded})</p>`;
        if (event.details.photo_unload_url) html += `<div class="photo-preview"><img src="${event.details.photo_unload_url}" alt="Foto Scarico" onclick="window.open('${event.details.photo_unload_url}', '_blank')"><div style="text-align: right; margin-top: 4px;"><a href="${event.details.photo_unload_url}" target="_blank" download style="color: #0078d4; text-decoration: none; font-size: 12px;">⬇️ Scarica Foto</a></div></div>`;
        if (event.details.checkNum) html += `<p>Spunta: ${event.details.checkNum} (Op: ${event.details.op_checked})</p>`;
        if (event.details.photo_check_url) html += `<div class="photo-preview"><img src="${event.details.photo_check_url}" alt="Foto Spunta" onclick="window.open('${event.details.photo_check_url}', '_blank')"><div style="text-align: right; margin-top: 4px;"><a href="${event.details.photo_check_url}" target="_blank" download style="color: #0078d4; text-decoration: none; font-size: 12px;">⬇️ Scarica Foto</a></div></div>`;
        if (event.details.docMat) html += `<p>Doc Mat: ${event.details.docMat} (Op: ${event.details.op_loaded})</p>`;
    }
    html += '<hr style="margin: 10px 0; border: 0; border-top: 1px solid #ccc;">';

    const today = new Date().toISOString().split('T')[0];

    if (event.status === STATUS.SCHEDULED) {
        html += `
            <h3>Passa a: Scaricato (Giallo)</h3>
            <div class="form-group"><label>Data Scarico</label><input type="date" name="action_date" required value="${today}"></div>
            <div class="form-group"><label>Numero DDT</label><input type="text" name="ddt" required placeholder="Es. 12345"></div>
            <div class="form-group"><label>Operatore</label><input type="text" name="op_unloaded" required placeholder="Nome Cognome"></div>
            <div class="form-group"><label>Foto DDT/Merce (opzionale)</label><input type="file" name="photo_unload" accept="image/*" capture="environment"><small style="color: #666; font-size: 12px;">Scatta o carica una foto</small></div>
            <input type="hidden" name="next_status" value="${STATUS.UNLOADED}">
        `;
    } else if (event.status === STATUS.UNLOADED) {
        html += `
            <h3>Passa a: Spuntato (Rosso)</h3>
            <div class="form-group"><label>Data Spunta</label><input type="date" name="action_date" required value="${today}"></div>
            <div class="form-group"><label>Numeri Spunta (uno per riga)</label><textarea name="checkNum" required rows="3" placeholder="Es:
123
456
789"></textarea></div>
            <div class="form-group"><label>Operatore</label><input type="text" name="op_checked" required></div>
            <div class="form-group"><label>Foto Spunta (opzionale)</label><input type="file" name="photo_check" accept="image/*" capture="environment"><small style="color: #666; font-size: 12px;">Scatta o carica una foto</small></div>
            <input type="hidden" name="next_status" value="${STATUS.CHECKED}">
        `;
    } else if (event.status === STATUS.CHECKED) {
        // Allow editing checkNum even in CHECKED status
        const currentCheckNum = event.details && event.details.checkNum ? event.details.checkNum : '';
        html += `
            <h3>Modifica Numeri Spunta o Passa a Caricato</h3>
            <div class="form-group"><label>Numeri Spunta (uno per riga)</label><textarea name="checkNum" rows="3" placeholder="Es:
123
456
789">${currentCheckNum}</textarea></div>
            <div class="form-group"><label>Operatore Spunta</label><input type="text" name="op_checked" value="${event.details && event.details.op_checked ? event.details.op_checked : ''}"></div>
            <hr style="margin: 15px 0; border: 0; border-top: 2px solid #0078d4;">
            <h3>Passa a: Caricato (Verde)</h3>
            <div class="form-group"><label>Data Carico</label><input type="date" name="action_date" value="${today}"></div>
            <div class="form-group"><label>Doc. Materiale</label><input type="text" name="docMat"></div>
            <div class="form-group"><label>Operatore Carico</label><input type="text" name="op_loaded"></div>
            <input type="hidden" name="next_status" value="${STATUS.CHECKED}">
            <input type="hidden" name="allow_load" value="true">
        `;
    } else {
        html += `<p>Ciclo completato!</p>`;
    }
    container.innerHTML = html;
    dynamicFields.appendChild(container);
}

eventForm.onsubmit = async (e) => {
    e.preventDefault();
    const btnSubmit = eventForm.querySelector('button[type="submit"]');
    const originalText = btnSubmit.textContent;
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Salvataggio...';

    try {
        const formData = new FormData(eventForm);

        if (state.selectedEventId) {
            const event = state.events.find(ev => ev.id === state.selectedEventId);
            if (!event) throw new Error("Evento non trovato");

            const nextStatus = formData.get('next_status');
            const allowLoad = formData.get('allow_load');

            if (nextStatus) {
                const updateData = {};
                if (!event.details) event.details = {};
                const details = { ...event.details };
                const actionDate = formData.get('action_date');

                // MODIFIED: Base64 Upload
                const photoUnload = formData.get('photo_unload');
                if (photoUnload && photoUnload.size > 0) {
                    try {
                        const photoUrl = await uploadPhoto(photoUnload);
                        if (photoUrl) details.photo_unload_url = photoUrl;
                    } catch (err) {
                        console.error("Unload photo failed", err);
                        alert("Errore nel caricamento della foto scarico: " + err.message);
                    }
                }

                const photoCheck = formData.get('photo_check');
                if (photoCheck && photoCheck.size > 0) {
                    try {
                        const photoUrl = await uploadPhoto(photoCheck);
                        if (photoUrl) details.photo_check_url = photoUrl;
                    } catch (err) {
                        console.error("Check photo failed", err);
                        alert("Errore nel caricamento della foto spunta: " + err.message);
                    }
                }

                if (nextStatus === STATUS.UNLOADED) {
                    details.ddt = formData.get('ddt');
                    details.op_unloaded = formData.get('op_unloaded');
                    details.date_unloaded = actionDate;
                    updateData.status = nextStatus;
                } else if (nextStatus === STATUS.CHECKED) {
                    // Update checkNum and op_checked
                    const checkNum = formData.get('checkNum');
                    const opChecked = formData.get('op_checked');

                    if (checkNum) details.checkNum = checkNum;
                    if (opChecked) details.op_checked = opChecked;

                    // If we're transitioning from UNLOADED to CHECKED
                    if (event.status === STATUS.UNLOADED) {
                        details.date_checked = actionDate;
                        updateData.status = nextStatus;
                    }

                    // If we're in CHECKED and want to move to LOADED
                    if (allowLoad && event.status === STATUS.CHECKED) {
                        const docMat = formData.get('docMat');
                        const opLoaded = formData.get('op_loaded');

                        // Only transition to LOADED if docMat is provided
                        if (docMat && docMat.trim() !== '') {
                            details.docMat = docMat;
                            details.op_loaded = opLoaded;
                            details.date_loaded = actionDate;
                            updateData.status = STATUS.LOADED;
                        } else {
                            // Just update the checkNum/op_checked, stay in CHECKED
                            updateData.status = STATUS.CHECKED;
                        }
                    }
                } else if (nextStatus === STATUS.LOADED) {
                    details.docMat = formData.get('docMat');
                    details.op_loaded = formData.get('op_loaded');
                    details.date_loaded = actionDate;
                    updateData.status = nextStatus;
                }

                updateData.details = details;
                await dbUpdateEvent(state.selectedEventId, updateData);
            }
        } else {
            await dbAddEvent({
                title: document.getElementById('event-title').value,
                date: document.getElementById('event-date').value,
                status: STATUS.SCHEDULED,
                details: {}
            });
        }
        modal.classList.add('hidden');
    } catch (error) {
        console.error("Errore salvataggio:", error);
        alert("Errore durante il salvataggio: " + error.message);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = originalText;
    }
};

document.querySelector('.close-modal').onclick = () => modal.classList.add('hidden');
document.getElementById('btn-delete-event').onclick = () => { if (confirm('Elimina?')) { dbDeleteEvent(state.selectedEventId); modal.classList.add('hidden'); } };

// Toolbar
document.getElementById('btn-prev').onclick = () => {
    if (state.view === 'month') state.currentDate.setMonth(state.currentDate.getMonth() - 1);
    else if (state.view === 'week') state.currentDate.setDate(state.currentDate.getDate() - 7);
    else if (state.view === 'day') state.currentDate.setDate(state.currentDate.getDate() - 1);
    renderCalendar();
};

document.getElementById('btn-next').onclick = () => {
    if (state.view === 'month') state.currentDate.setMonth(state.currentDate.getMonth() + 1);
    else if (state.view === 'week') state.currentDate.setDate(state.currentDate.getDate() + 7);
    else if (state.view === 'day') state.currentDate.setDate(state.currentDate.getDate() + 1);
    renderCalendar();
};
document.getElementById('btn-today').onclick = () => { state.currentDate = new Date(); renderCalendar(); };
document.querySelectorAll('.view-switcher button').forEach(b => b.onclick = (e) => {
    state.view = e.target.dataset.view;
    document.querySelectorAll('.view-switcher button').forEach(x => x.classList.remove('active'));
    e.target.classList.add('active');
    renderCalendar();
});

// Report Logic
window.openReportPreview = function (dateStr) {
    const dayEvents = state.events.filter(e => e.date === dateStr);
    const reportModal = document.createElement('div');
    reportModal.className = 'modal';
    reportModal.id = 'report-modal';

    const formattedDate = new Date(dateStr).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    let tableHtml = `
        <div class="report-header">
            <h2>Report Scarichi - ${formattedDate}</h2>
            <p>Generato il: ${new Date().toLocaleString('it-IT')}</p>
        </div>
        <table class="report-table">
            <thead>
                <tr>
                    <th>Fornitore</th>
                    <th>Scarico (DDT)</th>
                    <th>Spunta (Colli)</th>
                    <th>Carico (Doc. Mat)</th>
                </tr>
            </thead>
            <tbody>
    `;

    if (dayEvents.length === 0) {
        tableHtml += `<tr><td colspan="4" style="text-align:center; padding: 20px;">Nessun evento registrato.</td></tr>`;
    } else {
        dayEvents.forEach(e => {
            const d = e.details || {};
            let scarico = '';
            if (d.ddt) scarico += `<div><strong>DDT:</strong> ${d.ddt}</div>`;
            if (d.op_unloaded) scarico += `<div>Op: ${d.op_unloaded}</div>`;
            if (d.date_unloaded) scarico += `<div style="font-size:12px; color:#666">Data: ${new Date(d.date_unloaded).toLocaleDateString('it-IT')}</div>`;

            let spunta = '';
            if (d.checkNum) spunta += `<div><strong>Spunta:</strong> ${d.checkNum}</div>`;
            if (d.op_checked) spunta += `<div>Op: ${d.op_checked}</div>`;
            if (d.date_checked) spunta += `<div style="font-size:12px; color:#666">Data: ${new Date(d.date_checked).toLocaleDateString('it-IT')}</div>`;

            let carico = '';
            if (d.docMat) carico += `<div><strong>Doc:</strong> ${d.docMat}</div>`;
            if (d.op_loaded) carico += `<div>Op: ${d.op_loaded}</div>`;
            if (d.date_loaded) carico += `<div style="font-size:12px; color:#666">Data: ${new Date(d.date_loaded).toLocaleDateString('it-IT')}</div>`;

            tableHtml += `
                <tr>
                    <td><strong>${e.title}</strong></td>
                    <td>${scarico || '-'}</td>
                    <td>${spunta || '-'}</td>
                    <td>${carico || '-'}</td>
                </tr>
            `;
        });
    }

    tableHtml += `</tbody></table>`;

    reportModal.innerHTML = `
        <div class="modal-content" style="width: 800px; max-width: 95%; max-height: 90vh; overflow-y: auto;">
            <span class="close-modal" onclick="document.getElementById('report-modal').remove()">&times;</span>
            <div id="printable-area">
                ${tableHtml}
            </div>
            <div class="modal-actions">
                <button class="btn-primary" onclick="window.print()">Stampa / PDF</button>
            </div>
        </div>
    `;

    document.body.appendChild(reportModal);
}

// Backup and Restore Logic
const btnExportBackup = document.getElementById('btn-export-backup');
const btnImportBackup = document.getElementById('btn-import-backup');
const fileImportBackup = document.getElementById('file-import-backup');

if (btnExportBackup) {
    btnExportBackup.addEventListener('click', () => {
        if (!state.currentStore) {
            alert('Seleziona prima un negozio!');
            return;
        }

        db.ref(`stores/${state.currentStore.id}`).once('value', (snapshot) => {
            const data = snapshot.val();
            if (!data) {
                alert('Nessun dato da esportare!');
                return;
            }

            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const date = new Date().toISOString().split('T')[0];
            a.href = url;
            a.download = `backup-calendario-${state.currentStore.name}-${date}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    });
}

if (btnImportBackup && fileImportBackup) {
    btnImportBackup.addEventListener('click', () => {
        if (!state.currentStore) {
            alert('Seleziona prima un negozio!');
            return;
        }
        if (confirm('ATTENZIONE: L\'importazione sovrascriverà tutti i dati attuali del negozio selezionato. Proseguire?')) {
            fileImportBackup.click();
        }
    });

    fileImportBackup.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                // Simple validation
                if (data && (data.events || typeof data === 'object')) {
                    await db.ref(`stores/${state.currentStore.id}`).set(data);
                    alert('Backup ripristinato con successo! La pagina verrà ricaricata.');
                    location.reload();
                } else {
                    alert('File di backup non valido!');
                }
            } catch (err) {
                console.error('Errore durante l\'importazione:', err);
                alert('Si è verificato un errore durante l\'importazione del file.');
            }
            // Reset input
            fileImportBackup.value = '';
        };
        reader.readAsText(file);
    });
}

// Init
initApp();
