import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, addDoc, setDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "../../firebase/firebase-config.js";

// Walidacja telefonu
function validatePhone(phone) {
    const phoneRegex = /^\+?[0-9]{9,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-]/g, ''));
}

// Walidacja email
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.([^\s@]{2,})+$/;
    return emailRegex.test(email);
}

// Wyświetlanie błędów
function showError(message) {
    const errorAlert = document.getElementById('error-alert');
    const errorMsg = document.getElementById('error-msg');
    errorMsg.textContent = message;
    errorAlert.classList.add('show');
    
    // Ukryj alert po 5 sekundach
    setTimeout(() => {
        errorAlert.classList.remove('show');
    }, 5000);
}

// Wyświetlanie sukcesu
function showSuccess(message) {
    const successAlert = document.createElement('div');
    successAlert.className = 'alert';
    successAlert.style.backgroundColor = 'rgba(67,160,71,0.08)';
    successAlert.style.border = '1px solid rgba(67,160,71,0.2)';
    successAlert.style.color = 'var(--green)';
    successAlert.innerHTML = `<i class="ti ti-check"></i><span>${message}</span>`;
    
    const form = document.getElementById('register-form');
    form.insertBefore(successAlert, form.firstChild);
    
    // Ukryj alert po 3 sekundach
    setTimeout(() => {
        successAlert.remove();
    }, 3000);
}

// Reset błędów w formularzu
function resetErrors() {
    document.getElementById('error-alert').classList.remove('show');
    document.querySelectorAll('.field-input').forEach(input => {
        input.classList.remove('err');
    });
}

// Walidacja hasła
function validatePassword(password) {
    return password.length >= 6;
}

// Obsługa rejestracji
document.getElementById('register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    
    // Reset błędów
    resetErrors();
    
    // Pobierz wartości
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const settlement = document.getElementById('settlement').value.trim();
    const street = document.getElementById('street').value.trim();
    const houseNumber = document.getElementById('houseNumber').value.trim();
    const apartmentNumber = document.getElementById('apartmentNumber').value.trim();
    
    // Walidacja podstawowa
    if (!firstName || !lastName || !phone || !email || !password || !confirmPassword || !settlement || !street || !houseNumber) {
        showError('Wszystkie wymagane pola muszą być wypełnione.');
        return;
    }
    
    // Walidacja telefonu
    if (!validatePhone(phone)) {
        document.getElementById('phone').classList.add('err');
        showError('Numer telefonu musi mieć 9-15 cyfr (np. +48 123 456 789).');
        return;
    }
    
    // Walidacja email
    if (!validateEmail(email)) {
        document.getElementById('email').classList.add('err');
        showError('Podaj poprawny adres email.');
        return;
    }
    
    // Walidacja hasła
    if (!validatePassword(password)) {
        document.getElementById('password').classList.add('err');
        showError('Hasło musi mieć minimum 6 znaków.');
        return;
    }
    
    // Walidacja powtórzenia hasła
    if (password !== confirmPassword) {
        document.getElementById('confirmPassword').classList.add('err');
        showError('Hasła nie są identyczne.');
        return;
    }
    
    // Przygotuj dane dla Firestore
    const residentData = {
        firstName,
        lastName,
        phone,
        email,
        settlement,
        street,
        houseNumber,
        apartmentNumber,
        status: 'pending',
        submissionDate: new Date().toISOString(),
        isActive: true
    };
    
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Rejestracja...';
    
    try {
        // 1. Utwórz użytkownika Firebase Auth (prawidłowe hasło)
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        try {
            // 2. Utwórz dokument residents w Firestore
            const residentRef = await addDoc(collection(db, 'residents'), {
                ...residentData,
                userId: user.uid
            });
            
            // 3. Utwórz dokument users w Firestore
            await setDoc(doc(db, 'users', user.uid), {
                uid: user.uid,
                email: email,
                status: 'pending',
                role: 'pending_resident',
                residentId: residentRef.id,
                createdAt: new Date().toISOString()
            });
            
            console.log('Rejestracja zakończona:', user.uid, residentRef.id);
            
            // 4. Komunikat sukcesu
            showSuccess('Rejestracja zakończona pomyślnie! Przekierowanie...');
            
            // 5. Przekierowanie do ekranu oczekiwania
            setTimeout(() => {
                window.location.href = 'pending.html';
            }, 1500);
            
        } catch (firestoreError) {
            // Rollback - jeśli Firestore fails, usuń użytkownika Firebase Auth
            console.error('Error zapisu do Firestore:', firestoreError);
            
            try {
                await user.delete();
                console.log('Rollback: użytkownik usunięty z Firebase Auth');
            } catch (deleteError) {
                console.error('Error rollbacku:', deleteError);
            }
            
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Zarejestruj się</span>';
            showError('Nie można zapisać danych. Spróbuj ponownie później.');
            return;
        }
        
    } catch (authError) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Zarejestruj się</span>';
        
        console.error('Error Firebase Auth:', authError.code, authError.message);
        
        // Obsługa błędów Firebase Auth
        let errorMessage = 'Wystąpił błąd podczas rejestracji. Spróbuj ponownie później.';
        
        if (authError.code === 'auth/email-already-in-use') {
            errorMessage = 'Ten adres email jest już zarejestrowany.';
            document.getElementById('email').classList.add('err');
        } else if (authError.code === 'auth/invalid-email') {
            errorMessage = 'Podano nieprawidłowy adres email.';
            document.getElementById('email').classList.add('err');
        } else if (authError.code === 'auth/weak-password') {
            errorMessage = 'Hasło jest za słabe (minimum 6 znaków).';
            document.getElementById('password').classList.add('err');
        } else if (authError.code === 'auth/network-request-failed') {
            errorMessage = 'Brak połączenia z internetem. Sprawdź swoje połączenie.';
        }
        
        showError(errorMessage);
    }
});

// Sprawdź czy user jest już zalogowany
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    if (user) {
        // User już zalogowany - sprawdź status
        console.log('User zalogowany:', user.email);
        // Możemy przekierować do pending.html lub home.html w zależności od statusu
        // Ale dla rejestracji pozwalamy na ponowną rejestrację
    }
});