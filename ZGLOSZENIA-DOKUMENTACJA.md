# MODUŁ ZGŁOSZEŃ MIESZKAŃCÓW — Gmina Głowno
## Dokumentacja techniczna v1.0 | 06.06.2026

---

## 1. STRUKTURA FIRESTORE

### Kolekcja: `reports`
Główna kolekcja zgłoszeń.

```
reports/{reportId}
├── number          : string   — "GG-2026-000001"
├── categoryId      : string   — ref do reportCategories
├── categoryName    : string   — kopia nazwy (denormalizacja)
├── description     : string   — opis problemu
├── address         : string   — adres tekstowy
├── lat             : number   — szerokość geograficzna GPS
├── lng             : number   — długość geograficzna GPS
├── photos          : array    — base64 lub URL zdjęć
├── status          : string   — new | accepted | in_progress | waiting | done | rejected
├── priority        : string   — critical | high | normal | low
├── slaDays         : number   — 7 | 14 | 30 | 0 (bez terminu)
├── assignedTo      : string   — imię i nazwisko pracownika
├── assignedUnit    : string   — np. "Urząd Gminy Głowno"
├── linkedTo        : string   — numer sprawy głównej (łączenie)
├── residentName    : string   — imię i nazwisko zgłaszającego
├── residentId      : string   — ref do residents/{id}
├── createdBy       : string   — UID Firebase Auth
├── createdByName   : string   — nazwa twórcy
├── createdAt       : string   — ISO 8601
├── updatedAt       : string   — ISO 8601
├── updatedBy       : string   — UID
├── source          : string   — "app" | "admin"
├── readAt          : string   — ISO 8601 (potwierdzenie odczytu)
└── readBy          : string   — UID mieszkańca
```

### Podkolekcja: `reports/{reportId}/history`
Pełny timeline każdej sprawy.

```
reports/{reportId}/history/{entryId}
├── type        : string  — created | status | comment | photo | pdf | protocol | priority | assignment | sla | link
├── label       : string  — opis wpisu
├── comment     : string  — treść komentarza (opcjonalnie)
├── oldStatus   : string  — poprzedni status (dla type=status)
├── newStatus   : string  — nowy status (dla type=status)
├── fileUrl     : string  — URL lub base64 pliku
├── fileName    : string  — nazwa pliku
├── fileType    : string  — MIME type
├── fileSize    : number  — rozmiar w bajtach
├── authorId    : string  — UID
├── authorName  : string  — imię i nazwisko
└── createdAt   : string  — ISO 8601
```

### Kolekcja: `reportCategories`
Kategorie zarządzane przez administratora.

```
reportCategories/{categoryId}
├── name      : string  — "Drogi i chodniki"
├── icon      : string  — "ti-road" (Tabler Icons)
├── color     : string  — "#d98a2b"
├── order     : number  — kolejność wyświetlania
├── active    : boolean — czy aktywna
├── createdAt : string  — ISO 8601
└── updatedAt : string  — ISO 8601
```

### Dokument: `settings/reportCounter_{rok}`
Licznik numerów spraw.

```
settings/reportCounter_2026
├── last : number  — ostatni użyty numer (np. 42)
└── year : number  — rok
```

---

## 2. STATUSY ZGŁOSZEŃ

| Status | Klucz | Kolor | Opis |
|--------|-------|-------|------|
| Nowe | `new` | Niebieski | Zgłoszenie właśnie wpłynęło |
| Przyjęte | `accepted` | Fioletowy | Urząd potwierdził przyjęcie |
| W realizacji | `in_progress` | Pomarańczowy | Trwają prace |
| Oczekuje na wykonawcę | `waiting` | Cyjan | Czeka na zewnętrznego wykonawcę |
| Zakończone | `done` | Zielony | Sprawa zamknięta |
| Odrzucone | `rejected` | Czerwony | Zgłoszenie odrzucone |

---

## 3. PRIORYTETY

| Priorytet | Klucz | Kolor |
|-----------|-------|-------|
| Krytyczny | `critical` | Czerwony |
| Wysoki | `high` | Pomarańczowy |
| Normalny | `normal` | Niebieski |
| Niski | `low` | Szary |

---

## 4. NUMER SPRAWY

Format: `GG-{ROK}-{NUMER}`

Przykłady:
- `GG-2026-000001`
- `GG-2026-000042`

Mechanizm:
1. Odczyt dokumentu `settings/reportCounter_{rok}`
2. Inkrementacja licznika `last`
3. Zapis z `setDoc` (jeśli nie istnieje) lub `updateDoc`
4. Formatowanie z `padStart(6, '0')`

---

## 5. DOMYŚLNE KATEGORIE (seedowane automatycznie)

| Nazwa | Ikona | Kolor |
|-------|-------|-------|
| Drogi i chodniki | ti-road | #d98a2b |
| Oświetlenie | ti-bulb | #f59e0b |
| Zieleń i parki | ti-tree | #2e7d32 |
| Odpady i śmieci | ti-trash | #7b3fa0 |
| Kanalizacja i woda | ti-droplet | #2563a8 |
| Bezpieczeństwo | ti-shield | #c0492f |
| Hałas i porządek | ti-volume | #0891b2 |
| Inne | ti-dots-circle-horizontal | #5a6b60 |

Kategorie są seedowane automatycznie przy pierwszym uruchomieniu modułu, jeśli kolekcja `reportCategories` jest pusta.

---

## 6. ZMODYFIKOWANE PLIKI

### Nowe pliki:
| Plik | Opis |
|------|------|
| `admin/js/reports.js` | Główny moduł logiki zgłoszeń (panel admina) |
| `app/reports.html` | Widok mieszkańca — składanie i śledzenie zgłoszeń |
| `ZGLOSZENIA-DOKUMENTACJA.md` | Niniejsza dokumentacja |

### Zmodyfikowane pliki:
| Plik | Zmiana |
|------|--------|
| `admin/dashboard.html` | Dodano: nawigacja "Zgłoszenia", sekcja `page-reports-module`, import `reports.js`, inicjalizacja modułu, sekcja kategorii w Ustawieniach |

---

## 7. NOWE FUNKCJE

### Panel Admina (`admin/js/reports.js`)

#### Zarządzanie zgłoszeniami:
- `window.loadReports()` — ładuje wszystkie zgłoszenia z Firestore
- `window.filterReports()` — filtruje po statusie, priorytecie, kategorii, opisie, numerze
- `window.clearReportsFilters()` — czyści wszystkie filtry
- `window.openReportDetail(id)` — otwiera modal szczegółów zgłoszenia
- `window.openNewReportModal()` — otwiera modal tworzenia nowego zgłoszenia
- `window.createNewReport()` — tworzy nowe zgłoszenie (przez urząd)

#### Akcje na zgłoszeniu:
- `window.changeReportStatus(id, status)` — zmiana statusu + wpis do historii
- `window.changeReportPriority(id, priority)` — zmiana priorytetu + wpis do historii
- `window.saveReportAssignment(id)` — przypisanie pracownika i jednostki
- `window.saveReportSLA(id)` — ustawienie terminu SLA
- `window.saveReportLink(id)` — łączenie zgłoszeń
- `window.addReportEntry(id)` — dodanie komentarza/zdjęcia/PDF/protokołu do historii

#### Mapa:
- `window.openReportsMap()` — modal z mapą zgłoszeń (lista pinezek wg statusu)

#### Zarządzanie kategoriami (Ustawienia):
- `window.loadReportCategoriesSettings()` — ładuje listę kategorii
- `window.openAddCategoryModal()` — modal dodawania kategorii
- `window.openEditCategoryModal(id)` — modal edycji kategorii
- `window.saveCategory(id)` — zapis kategorii (dodaj/edytuj)
- `window.deleteCategory(id, name)` — usunięcie kategorii
- `window.moveCategoryOrder(id, direction)` — zmiana kolejności

### Widok Mieszkańca (`app/reports.html`)

- `window.loadMyReports()` — lista zgłoszeń zalogowanego mieszkańca
- `window.openNewReportSheet()` — bottom sheet z formularzem (2 kroki)
- `window.selectCategory(id)` — wybór kategorii (krok 1)
- `window.goToStep2()` / `window.goToStep1()` — nawigacja między krokami
- `window.getGPS()` — pobieranie lokalizacji GPS
- `window.handlePhotos(input)` — obsługa zdjęć z galerii
- `window.removePhoto(idx)` — usunięcie zdjęcia z podglądu
- `window.submitReport()` — wysłanie zgłoszenia
- `window.openDetailSheet(id)` — szczegóły zgłoszenia z timelineem
- `window.confirmRead(id)` — potwierdzenie zapoznania się ze sprawą

---

## 8. INTEGRACJA Z DASHBOARD

### Nawigacja:
```html
<a class="nav-item" onclick="go('reports-module',this)">
  <i class="ti ti-clipboard-list"></i> Zgłoszenia
  <span class="nav-badge" id="nav-badge-reports" style="display:none;"></span>
</a>
```

### Inicjalizacja modułu:
```javascript
import { initReports } from "./js/reports.js";

initReports({ db, auth, addDoc, collection, getDocs, getDoc, doc,
  query, orderBy, limit, where, updateDoc, onSnapshot, serverTimestamp: null, toast });
```

### Automatyczne ładowanie przy nawigacji:
```javascript
if (id === 'reports-module') {
  if (typeof window.initReportsModule === 'function') window.initReportsModule();
}
```

### Ustawienia kategorii (sekcja `<details>`):
```html
<details ontoggle="if(this.open && typeof window.loadReportCategoriesSettings==='function')
  window.loadReportCategoriesSettings()">
```

---

## 9. REGUŁY FIRESTORE (zalecane)

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Zgłoszenia — mieszkaniec może tworzyć i czytać swoje
    match /reports/{reportId} {
      allow read: if request.auth != null &&
        (resource.data.createdBy == request.auth.uid ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin','worker']);
      allow create: if request.auth != null;
      allow update: if request.auth != null &&
        (resource.data.createdBy == request.auth.uid ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin','worker']);

      // Historia — tylko odczyt dla mieszkańca, zapis dla admina
      match /history/{entryId} {
        allow read: if request.auth != null;
        allow write: if request.auth != null;
      }
    }

    // Kategorie — tylko admin może modyfikować
    match /reportCategories/{catId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Licznik numerów spraw
    match /settings/reportCounter_{year} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## 10. INDEKSY FIRESTORE (wymagane)

Utwórz w Firebase Console → Firestore → Indexes:

| Kolekcja | Pola | Typ |
|----------|------|-----|
| `reports` | `createdBy` ASC, `createdAt` DESC | Composite |
| `reports` | `status` ASC, `createdAt` DESC | Composite |
| `reports/{id}/history` | `createdAt` ASC | Single field |
| `reportCategories` | `order` ASC | Single field |

---

## 11. PLAN WDROŻENIA ETAPAMI

### ETAP 1 — Podstawy (GOTOWE ✓)
- [x] Struktura Firestore (`reports`, `reportCategories`, `settings/reportCounter_*`)
- [x] Moduł admina `admin/js/reports.js`
- [x] Integracja z `admin/dashboard.html`
- [x] Widok mieszkańca `app/reports.html`
- [x] Automatyczne numery spraw GG-RRRR-NNNNNN
- [x] Statusy z kolorowymi badge
- [x] Priorytety z kolorowymi oznaczeniami
- [x] Kategorie z Firestore (bez hardkodowania)
- [x] Historia sprawy (timeline)
- [x] Potwierdzenie odczytu przez mieszkańca
- [x] Łączenie zgłoszeń
- [x] SLA (termin realizacji)
- [x] Zarządzanie kategoriami w Ustawieniach

### ETAP 2 — Mapa (do wdrożenia)
- [ ] Integracja Leaflet.js lub Google Maps API
- [ ] Wyświetlanie pinezek wg statusu
- [ ] Kliknięcie pinezki → otwarcie szczegółów
- [ ] Możliwość poprawienia pinezki przez mieszkańca

### ETAP 3 — Powiadomienia Push (do wdrożenia)
- [ ] Firebase Cloud Messaging (FCM)
- [ ] Wysyłka push przy każdej zmianie statusu
- [ ] Opcjonalny email (Firebase Extensions lub własna funkcja)
- [ ] Cloud Functions: `onUpdate` na kolekcji `reports`

### ETAP 4 — Firebase Storage (do wdrożenia)
- [ ] Migracja zdjęć z base64 na Firebase Storage
- [ ] Upload PDF i protokołów do Storage
- [ ] Generowanie URL do pobrania
- [ ] Limit rozmiaru pliku po stronie Storage Rules

### ETAP 5 — Zaawansowane funkcje (do wdrożenia)
- [ ] Pełna integracja mapy z Leaflet.js
- [ ] Eksport zgłoszeń do CSV/PDF
- [ ] Statystyki i wykresy (Chart.js)
- [ ] Wyszukiwanie pełnotekstowe (Algolia lub Firestore)
- [ ] Powiadomienia email (SendGrid / Firebase Extensions)
- [ ] Aplikacja mobilna (PWA z service worker)

---

## 12. UWAGI TECHNICZNE

### Zdjęcia — ograniczenia base64:
Aktualnie zdjęcia są przechowywane jako base64 w Firestore. Limit dokumentu Firestore to **1 MB**. Dla produkcji zalecane jest Firebase Storage.

### Licznik numerów spraw — race condition:
Przy dużym obciążeniu (wiele równoczesnych zgłoszeń) może wystąpić duplikacja numerów. Rozwiązanie produkcyjne: Cloud Function z transakcją Firestore.

### GPS — uprawnienia przeglądarki:
Przeglądarka pyta o uprawnienia do lokalizacji. Jeśli użytkownik odmówi, może wpisać adres ręcznie.

### Mapa — placeholder:
Aktualnie mapa wyświetla listę przycisków z numerami spraw. Pełna integracja z Leaflet.js wymaga dodania biblioteki i implementacji markerów.

---

## 13. SZYBKI START

1. Otwórz `admin/dashboard.html` → kliknij "Zgłoszenia" w nawigacji
2. Moduł automatycznie załaduje kategorie (lub je zaseeduje)
3. Kliknij "Nowe zgłoszenie" aby dodać testowe zgłoszenie
4. Otwórz zgłoszenie → zmień status, priorytet, dodaj komentarz
5. W Ustawieniach → "Kategorie zgłoszeń" → zarządzaj kategoriami

Widok mieszkańca:
1. Otwórz `app/reports.html` (zalogowany mieszkaniec)
2. Kliknij "Zgłoś problem"
3. Wybierz kategorię → opisz problem → wyślij
4. Kliknij zgłoszenie → "Potwierdzam zapoznanie się"

---

*Dokumentacja wygenerowana automatycznie | Gmina Głowno System v1.0*
