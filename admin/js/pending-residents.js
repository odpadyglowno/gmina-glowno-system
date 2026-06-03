import { collection, getDocs, doc, updateDoc, addDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "../../firebase/firebase-config.js";

let residents = [];
let pendingResidents = [];
let currentRejectResidentId = null;

// Pobierz zgłoszenia mieszkańców
async function fetchResidents() {
    try {
        const residentsRef = collection(db, 'residents');
        const residentsSnapshot = await getDocs(residentsRef);
        
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
    
    pendingResidents.forEach((resident) => {
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
        approveBtn.onclick = () => approveResident(resident.id);
        
        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'btn btn-reject';
        rejectBtn.innerHTML = '<i class="ti ti-x"></i> Odrzuć';
        rejectBtn.onclick = () => openRejectModal(resident.id);
        
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
            <td>${actionsDiv.outerHTML}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Zatwierdź mieszkańca
async function approveResident(residentId) {
    try {
        const residentRef = doc(db, 'residents', residentId);
        const residentDoc = await getDoc(residentRef);
        
        if (!residentDoc.exists()) {
            showError('Nie znaleziono zgłoszenia mieszkańca.');
            return;
        }
        
        const residentData = residentDoc.data();
        const userId = residentData.userId;
        
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
        
        // 4. Odśwież tabelę
        fetchResidents();
        
        showSuccess(`Zgłoszenie mieszkańca ${residentData.firstName} ${residentData.lastName} zostało zatwierdzone.`);
        
    } catch (error) {
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
        
        // 4. Odśwież tabelę
        fetchResidents();
        
        closeRejectModal();
        showSuccess(`Zgłoszenie mieszkańca ${residentData.firstName} ${residentData.lastName} zostało odrzucone.`);
        
    } catch (error) {
        console.error('Error odrzucania:', error);
        showError('Nie można odrzucić zgłoszenia. Spróbuj ponownie później.');
    }
}

// Wyświetl komunikat sukcesu
function showSuccess(message) {
    // Można użyć toast lub alert
    console.log('Success:', message);
    // TODO: Implementacja toast message
    alert(`✅ ${message}`);
}

// Wyświetl komunikat błęd
function showError(message) {
    console.error('Error:', message);
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
        approveBtn.onclick = () => approveResident(resident.id);
        
        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'btn btn-reject';
        rejectBtn.innerHTML = '<i class="ti ti-x"></i> Odrzuć';
        rejectBtn.onclick = () => openRejectModal(resident.id);
        
        actionsDiv.appendChild(approveBtn);
        actionsDiv.appendChild(rejectBtn);
        
        row.innerHTML = `
            <td>${resident.firstName}</td>
            <td>${resident.lastName}</td>
            <td>${resident.email}</td>
            <td>${resident.phone}</td>
            <td>${resident.settlement}</td>
            <td>${address}</td>
            <td>${resident.submissionDate}</td>
            <td>${statusBadge.outerHTML}</td>
            <td>${actionsDiv.outerHTML}</td>
        `;
        
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
    if (!user) {
        window.location.href = 'login.html';
    } else {
        // Startujemy pobieranie danych
        fetchResidents();
    }
});