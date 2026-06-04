import { collection, getDocs, doc, updateDoc, addDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "../../firebase/firebase-config.js";

console.log("pending-residents.js loaded");

let residents = [];
let pendingResidents = [];
let currentRejectResidentId = null;

// Pobierz zgłoszenia mieszkańców
async function fetchResidents() {
    console.log("fetchResidents called");
    
    try {
        const residentsRef = collection(db, 'residents');
        console.log("Fetching residents from Firestore...");
        
        const residentsSnapshot = await getDocs(residentsRef);
        console.log("Got", residentsSnapshot.size, "residents from Firestore");
        
        residents = [];
        pendingResidents = [];
        
        residentsSnapshot.forEach((doc) => {
            const data = doc.data();
            residents.push({
                id: doc.id,
                ...data,
                submissionDate: new Date(data.submissionDate).toLocaleDateString('pl-PL')
            });
            
            if (data.status === 'pending') {
                pendingResidents.push({
                    id: doc.id,
                    ...data,
                    submissionDate: new Date(data.submissionDate).toLocaleDateString('pl-PL')
                });
            }
        });
        
        console.log("Total residents:", residents.length, "Pending residents:", pendingResidents.length);
        
        updateStatistics();
        renderTable();
        
    } catch (error) {
        console.error('Error pobierania mieszkańców:', error);
        showError('Nie można pobrać zgłoszeń mieszkańców. Spróbuj ponownie później.');
    }
}

// Aktualizuj statystyki
function updateStatistics() {
    const pendingCount = pendingResidents.length;
    const approvedCount = residents.filter(r => r.status === 'approved').length;
    const rejectedCount = residents.filter(r => r.status === 'rejected').length;
    
    document.getElementById('pending-count').textContent = pendingCount;
    document.getElementById('approved-count').textContent = approvedCount;
    document.getElementById('rejected-count').textContent = rejectedCount;
}

// Renderuj tabelę
function renderTable() {
    console.log("renderTable called, pendingResidents:", pendingResidents.length);
    
    const loading = document.getElementById('loading');
    const emptyState = document.getElementById('empty-state');
    const table = document.getElementById('residents-table');
    const tableBody = document.getElementById('residents-body');
    
    loading.style.display = 'none';
    
    if (pendingResidents.length === 0) {
        emptyState.style.display = 'block';
        table.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    table.style.display = 'table';
    
    tableBody.innerHTML = '';
    
    pendingResidents.forEach((resident, index) => {
        console.log(`Creating row for resident ${index}: ${resident.firstName} ${resident.lastName}`);
        
        const row = document.createElement('tr');
        
        // Adres
        const address = `${resident.street} ${resident.houseNumber}${resident.apartmentNumber ? '/' + resident.apartmentNumber : ''}`;
        
        // Status badge
        const statusBadge = document.createElement('span');
        statusBadge.className = 'status-badge status-pending';
        statusBadge.innerHTML = `<i class="ti ti-clock"></i> Oczekujący`;
        
        // Przyciski akcji
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'actions';
        
        const approveBtn = document.createElement('button');
        approveBtn.className = 'btn btn-approve';
        approveBtn.innerHTML = '<i class="ti ti-check"></i> Zatwierdź';
        
        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'btn btn-reject';
        rejectBtn.innerHTML = '<i class="ti ti-x"></i> Odrzuć';
        
        actionsDiv.appendChild(approveBtn);
        actionsDiv.appendChild(rejectBtn);
        
        // Kolumny
        row.innerHTML = `
            <td>${resident.firstName}</td>
            <td>${resident.lastName}</td>
            <td>${resident.email}</td>
            <td>${resident.phone}</td>
            <td>${resident.settlement}</td>
            <td>${address}</td>
            <td>${resident.submissionDate}</td>
            <td>${statusBadge.outerHTML}</td>
            <td></td>
        `;
        
        // Wstaw actionsDiv do ostatniej komórki
        const lastCell = row.cells[8];
        lastCell.appendChild(actionsDiv);
        
        // Dodaj event listeners PO wstawieniu do DOM
        approveBtn.addEventListener('click', () => {
            console.log("APPROVE CLICK", resident.id);
            console.log("approveResident START", resident.id);
            approveResident(resident.id);
        });
        
        rejectBtn.addEventListener('click', () => {
            console.log("REJECT CLICK", resident.id);
            openRejectModal(resident.id);
        });
        
        tableBody.appendChild(row);
    });
    
    console.log("Table rendered with", pendingResidents.length, "rows");
}

// Zatwierdź mieszkańca
async function approveResident(residentId) {
    console.log("approveResident START", residentId);
    
    try {
        const residentRef = doc(db, 'residents', residentId);
        const residentDoc = await getDoc(residentRef);
        
        if (!residentDoc.exists()) {
            showError('Nie znaleziono zgłoszenia mieszkańca.');
            return;
        }
        
        const residentData = residentDoc.data();
        const userId = residentData.userId;
        
        console.log("Updating Firestore...");
        
        // 1. Zaktualizuj dokument residents
        await updateDoc(residentRef, {
            status: 'approved',
            approvedAt: new Date().toISOString()
        });
        
        // 2. Zaktualizuj dokument users
        if (userId) {
            const userRef = doc(db, 'users', userId);
            await updateDoc(userRef, {
                status: 'approved',
                role: 'resident',
                approvedAt: new Date().toISOString(),
                approvedBy: auth.currentUser.uid
            });
        }
        
        // 3. Utwórz log w adminActions
        await addDoc(collection(db, 'adminActions'), {
            action: 'approve',
            residentId,
            residentEmail: residentData.email,
            adminId: auth.currentUser.uid,
            timestamp: new Date().toISOString(),
            reason: null,
            previousStatus: 'pending',
            newStatus: 'approved'
        });
        
        // 4. Odśwież tabelę i statystyki (najpierw)
        await fetchResidents();
        
        // 5. Pokaz modal sukcesu (potem)
        showSuccessModal(`Zgłoszenie mieszkańca ${residentData.firstName} ${residentData.lastName} zostało zatwierdzone.`);
        
    } catch (error) {
        console.error('FULL ERROR:', error);
        console.error('Error zatwierdzania:', error);
        showError('Nie można zatwierdzić zgłoszenia. Spróbuj ponownie później.');
    }
}

// Otwórz modal odrzucenia
function openRejectModal(residentId) {
    currentRejectResidentId = residentId;
    document.getElementById('reject-modal').classList.add('show');
    document.getElementById('reject-reason').value = '';
}

// Zamknij modal odrzucenia
function closeRejectModal() {
    document.getElementById('reject-modal').classList.remove('show');
    currentRejectResidentId = null;
}

// Odrzuć mieszkańca
async function rejectResident(reason) {
    if (!currentRejectResidentId) return;
    
    try {
        const residentRef = doc(db, 'residents', currentRejectResidentId);
        const residentDoc = await getDoc(residentRef);
        
        if (!residentDoc.exists()) {
            showError('Nie znaleziono zgłoszenia mieszkańca.');
            return;
        }
        
        const residentData = residentDoc.data();
        const userId = residentData.userId;
        
        console.log("Updating Firestore...");
        
        // 1. Zaktualizuj dokument residents
        await updateDoc(residentRef, {
            status: 'rejected',
            rejectionReason: reason || 'Nie podano przyczyny'
        });
        
        // 2. Zaktualizuj dokument users
        if (userId) {
            const userRef = doc(db, 'users', userId);
            await updateDoc(userRef, {
                status: 'rejected',
                rejectionReason: reason || 'Nie podano przyczyny'
            });
        }
        
        // 3. Utwórz log w adminActions
        await addDoc(collection(db, 'adminActions'), {
            action: 'reject',
            residentId: currentRejectResidentId,
            residentEmail: residentData.email,
            adminId: auth.currentUser.uid,
            timestamp: new Date().toISOString(),
            reason: reason || 'Nie podano przyczyny',
            previousStatus: 'pending',
            newStatus: 'rejected'
        });
        
        // 4. Odśwież tabelę i statystyki (najpierw)
        await fetchResidents();
        
        // 5. Zamknij modal odrzucenia
        closeRejectModal();
        
        // 6. Pokaz modal sukcesu odrzucenia (potem)
        showRejectSuccessModal();
        
    } catch (error) {
        console.error('FULL ERROR:', error);
        console.error('Error odrzucania:', error);
        showError('Nie można odrzucić zgłoszenia. Spróbuj ponownie później.');
    }
}

// Wyświetl komunikat sukcesu (używając modalów)
function showSuccess(message) {
    console.log('Success:', message);
    showSuccessModal(message);
}

// Wyświetl komunikat błęd (używając modalów)
function showError(message) {
    console.error('Error:', message);
    // Używamy tymczasowo alert dla błędów, ale można dodać modal błędów
    alert(`❌ ${message}`);
}

// Event listeners
document.getElementById('modal-cancel').addEventListener('click', closeRejectModal);
document.getElementById('modal-confirm').addEventListener('click', () => {
    const reason = document.getElementById('reject-reason').value.trim();
    rejectResident(reason);
});

// Wyszukiwanie
document.getElementById('table-search').addEventListener('input', function() {
    const searchTerm = this.value.toLowerCase();
    
    const filteredResidents = pendingResidents.filter(resident => {
        const searchString = `
            ${resident.firstName.toLowerCase()} 
            ${resident.lastName.toLowerCase()} 
            ${resident.email.toLowerCase()} 
            ${resident.settlement.toLowerCase()} 
            ${resident.street.toLowerCase()} 
            ${resident.phone.toLowerCase()}
        `;
        
        return searchString.includes(searchTerm);
    });
    
    // Renderuj filtrowaną tabelę
    const tableBody = document.getElementById('residents-body');
    tableBody.innerHTML = '';
    
    filteredResidents.forEach((resident) => {
        const row = document.createElement('tr');
        
        const address = `${resident.street} ${resident.houseNumber}${resident.apartmentNumber ? '/' + resident.apartmentNumber : ''}`;
        
        const statusBadge = document.createElement('span');
        statusBadge.className = 'status-badge status-pending';
        statusBadge.innerHTML = `<i class="ti ti-clock"></i> Oczekujący`;
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'actions';
        
        const approveBtn = document.createElement('button');
        approveBtn.className = 'btn btn-approve';
        approveBtn.innerHTML = '<i class="ti ti-check"></i> Zatwierdź';
        
        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'btn btn-reject';
        rejectBtn.innerHTML = '<i class="ti ti-x"></i> Odrzuć';
        
        actionsDiv.appendChild(approveBtn);
        actionsDiv.appendChild(rejectBtn);
        
        // Kolumny
        row.innerHTML = `
            <td>${resident.firstName}</td>
            <td>${resident.lastName}</td>
            <td>${resident.email}</td>
            <td>${resident.phone}</td>
            <td>${resident.settlement}</td>
            <td>${address}</td>
            <td>${resident.submissionDate}</td>
            <td>${statusBadge.outerHTML}</td>
            <td></td>
        `;
        
        // Wstaw actionsDiv do ostatniej komórki
        const lastCell = row.cells[8];
        lastCell.appendChild(actionsDiv);
        
        // Dodaj event listeners PO wstawieniu do DOM
        approveBtn.addEventListener('click', () => {
            console.log("APPROVE CLICK", resident.id);
            console.log("approveResident START", resident.id);
            approveResident(resident.id);
        });
        
        rejectBtn.addEventListener('click', () => {
            console.log("REJECT CLICK", resident.id);
            openRejectModal(resident.id);
        });
        
        tableBody.appendChild(row);
    });
});

// Wyszukiwanie globalne
document.getElementById('search-input').addEventListener('input', function() {
    document.getElementById('table-search').value = this.value;
    document.getElementById('table-search').dispatchEvent(new Event('input'));
});

// Sprawdź czy admin jest zalogowany
auth.onAuthStateChanged((user) => {
    console.log("auth.onAuthStateChanged called, user:", user ? user.email : "no user");
    
    if (!user) {
        console.log("No user, redirecting to login.html");
        window.location.href = 'login.html';
    } else {
        console.log("User logged in:", user.email, "UID:", user.uid);
        // Startujemy pobieranie danych
        fetchResidents();
    }
});

// Pokaz modal sukcesu zatwierdzenia
function showSuccessModal(message) {
    document.getElementById('success-message').textContent = message;
    document.getElementById('success-modal').classList.add('show');
    
    // Automatyczne zamknięcie po 3 sekundach
    setTimeout(() => {
        closeSuccessModal();
    }, 3000);
}

// Zamknij modal sukcesu zatwierdzenia
function closeSuccessModal() {
    document.getElementById('success-modal').classList.remove('show');
}

// Pokaz modal sukcesu odrzucenia
function showRejectSuccessModal() {
    document.getElementById('reject-success-modal').classList.add('show');
    
    // Automatyczne zamknięcie po 3 sekundach
    setTimeout(() => {
        closeRejectSuccessModal();
    }, 3000);
}

// Zamknij modal sukcesu odrzucenia
function closeRejectSuccessModal() {
    document.getElementById('reject-success-modal').classList.remove('show');
}

// Event listeners dla przycisków zamknięcia modalów sukcesu
document.getElementById('success-close').addEventListener('click', closeSuccessModal);
document.getElementById('reject-success-close').addEventListener('click', closeRejectSuccessModal);

// Eksport funkcji do globalnego zakresu window (dla onclick w HTML)
window.approveResident = approveResident;
window.openRejectModal = openRejectModal;
