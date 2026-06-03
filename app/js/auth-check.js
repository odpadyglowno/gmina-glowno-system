import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "../../firebase/firebase-config.js";

// Sprawdź status użytkownika i przekieruj odpowiednio
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log('User zalogowany:', user.email);
        
        try {
            // Pobierz dokument users/{uid}
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            
            if (!userDoc.exists()) {
                console.error('Nie znaleziono dokumentu users dla:', user.uid);
                // Jeśli nie ma dokumentu users, przekieruj do rejestracji
                window.location.href = 'register.html';
                return;
            }
            
            const userData = userDoc.data();
            const status = userData.status;
            
            console.log('Status użytkownika:', status);
            
            // Routing na podstawie statusu
            switch(status) {
                case 'pending':
                    // Jeśli już jesteśmy na pending.html, nic nie rób
                    if (!window.location.pathname.includes('pending.html')) {
                        window.location.href = 'pending.html';
                    }
                    break;
                    
                case 'approved':
                    // TODO: Po zatwierdzeniu przekieruj do home.html (placeholder)
                    // window.location.href = 'home.html';
                    // Na razie pozostawiamy na pending.html, bo nie ma jeszcze home.html
                    console.log('Konto zatwierdzone, można przejść do aplikacji');
                    break;
                    
                case 'rejected':
                    // TODO: Po odrzuceniu przekieruj do rejected.html (placeholder)
                    // window.location.href = 'rejected.html';
                    console.log('Konto odrzucone');
                    break;
                    
                default:
                    console.log('Nieznany status:', status);
            }
            
        } catch (error) {
            console.error('Error podczas sprawdzania statusu:', error);
            // Jeśli nie możemy sprawdzić statusu, przekieruj do rejestracji
            window.location.href = 'register.html';
        }
    } else {
        // Niezalogowany - przekieruj do login.html
        console.log('User niezalogowany');
        
        // Jeśli nie jesteśmy na login.html lub register.html, przekieruj
        const currentPage = window.location.pathname;
        if (!currentPage.includes('login.html') && !currentPage.includes('register.html')) {
            window.location.href = 'login.html';
        }
    }
});

// Funkcja pomocnicza - sprawdź status i zwróć
export async function checkUserStatus() {
    const user = auth.currentUser;
    if (!user) return null;
    
    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            return userDoc.data();
        }
        return null;
    } catch (error) {
        console.error('Error sprawdzania statusu:', error);
        return null;
    }
}

// Funkcja do pobierania danych mieszkańca
export async function getResidentData() {
    const user = auth.currentUser;
    if (!user) return null;
    
    try {
        // Pobierz dokument users/{uid}
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) return null;
        
        const userData = userDoc.data();
        const residentId = userData.residentId;
        
        if (!residentId) return null;
        
        // Pobierz dokument residents/{residentId}
        const residentDocRef = doc(db, 'residents', residentId);
        const residentDoc = await getDoc(residentDocRef);
        
        if (residentDoc.exists()) {
            return residentDoc.data();
        }
        return null;
        
    } catch (error) {
        console.error('Error pobierania danych mieszkańca:', error);
        return null;
    }
}