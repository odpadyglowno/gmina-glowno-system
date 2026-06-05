// =====================================================
// MODUŁ POWIADOMIEŃ — Gmina Głowno
// Plik: admin/js/notifications.js  v4
// =====================================================

export function initNotifications({ db, auth, addDoc, collection, getDocs, getDoc, doc, query, orderBy, limit, deleteDoc, updateDoc, toast }) {

  // ---- Stan formularza ----
  let _notifyType     = 'info';
  let _notifyAudience = 'all';
  let _notifySendMode = 'now';
  let _attachmentFile = null;
  let _selectedResidents = [];
  let _residentSearchTimeout = null;

  const NOTIFY_TYPE_LABELS = {
    info:     'Informacyjne',
    reminder: 'Przypomnienie',
    warning:  'Ostrzeżenie',
    crisis:   'Kryzysowe'
  };
  const NOTIFY_TYPE_ICONS = {
    info:     'ti-info-circle',
    reminder: 'ti-clock',
    warning:  'ti-alert-triangle',
    crisis:   'ti-alert-octagon'
  };
  const NOTIFY_AUD_LABELS = {
    all:        'Wszyscy mieszkańcy',
    rejon1:     'Rejon 1',
    rejon2:     'Rejon 2',
    rejon3:     'Rejon 3',
    settlement: 'Wybrana miejscowość',
    residents:  'Wybrani mieszkańcy'
  };

  // =====================================================
  // DOMYŚLNE SZABLONY — wstawiane do Firestore jeśli brak
  // =====================================================

  const DEFAULT_TEMPLATES = [
    {
      label: 'Awaria wodociągu',
      icon: 'ti-droplet',
      type: 'crisis',
      active: true,
      title: 'Awaria sieci wodociągowej',
      body: 'Informujemy o awarii sieci wodociągowej na terenie gminy. Przerwa w dostawie wody może potrwać do odwołania. Przepraszamy za utrudnienia i prosimy o cierpliwość. O przywróceniu dostawy wody poinformujemy niezwłocznie.'
    },
    {
      label: 'Przerwa w dostawie wody',
      icon: 'ti-droplet-off',
      type: 'warning',
      active: true,
      title: 'Planowana przerwa w dostawie wody',
      body: 'Informujemy o planowanej przerwie w dostawie wody w dniu [DATA] w godzinach [GODZINY]. Przerwa jest związana z pracami konserwacyjnymi sieci wodociągowej. Prosimy o wcześniejsze zaopatrzenie się w wodę.'
    },
    {
      label: 'Harmonogram odpadów',
      icon: 'ti-recycle',
      type: 'reminder',
      active: true,
      title: 'Zmiana harmonogramu odbioru odpadów',
      body: 'Informujemy o zmianie harmonogramu odbioru odpadów komunalnych. Prosimy o wystawienie pojemników zgodnie z nowym harmonogramem dostępnym na stronie gminy oraz w aplikacji mobilnej.'
    },
    {
      label: 'Ostrzeżenie pogodowe',
      icon: 'ti-cloud-storm',
      type: 'warning',
      active: true,
      title: 'Ostrzeżenie meteorologiczne',
      body: 'IMGW wydał ostrzeżenie meteorologiczne dla naszego regionu. Prosimy o zachowanie ostrożności, zabezpieczenie mienia i ograniczenie do minimum wychodzenia z domu. Śledźcie komunikaty służb ratowniczych.'
    },
    {
      label: 'Zebranie mieszkańców',
      icon: 'ti-users',
      type: 'info',
      active: true,
      title: 'Zaproszenie na zebranie mieszkańców',
      body: 'Zapraszamy wszystkich mieszkańców na zebranie, które odbędzie się w Urzędzie Gminy Głowno. Na spotkaniu omówione zostaną bieżące sprawy gminy oraz plany inwestycyjne. Prosimy o liczne przybycie.'
    },
    {
      label: 'Dożynki Gminne',
      icon: 'ti-leaf',
      type: 'info',
      active: true,
      title: 'Zaproszenie na Dożynki Gminne',
      body: 'Serdecznie zapraszamy wszystkich mieszkańców na Dożynki Gminne! Tegoroczne święto plonów odbędzie się [DATA] na terenie [MIEJSCE]. W programie: korowód dożynkowy, koncerty, stoiska wystawców oraz atrakcje dla dzieci.'
    },
    {
      label: 'Termin płatności podatku',
      icon: 'ti-coins',
      type: 'reminder',
      active: true,
      title: 'Przypomnienie o terminie płatności podatku',
      body: 'Przypominamy o zbliżającym się terminie płatności podatku od nieruchomości oraz podatku rolnego. Prosimy o terminowe regulowanie należności. Wpłat można dokonać w kasie Urzędu Gminy lub przelewem na wskazany rachunek bankowy.'
    },
    {
      label: 'Utrudnienia drogowe',
      icon: 'ti-road',
      type: 'warning',
      active: true,
      title: 'Utrudnienia w ruchu drogowym',
      body: 'Informujemy o planowanych utrudnieniach w ruchu drogowym związanych z pracami remontowymi. Prosimy o korzystanie z wyznaczonych objazdów i stosowanie się do poleceń osób kierujących ruchem. Przepraszamy za niedogodności.'
    }
  ];

  // =====================================================
  // SZABLONY Z FIRESTORE — ładowanie + seed domyślnych
  // =====================================================

  let _templates = [];

  async function _loadTemplates() {
    const container = document.getElementById('n-templates-grid');
    if (!container) return;
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--ink-faint);font-size:13px;"><i class="ti ti-loader"></i> Ładowanie szablonów...</div>`;
    try {
      const snap = await getDocs(query(collection(db, 'messageTemplates'), orderBy('label', 'asc')));
      _templates = [];
      snap.forEach(d => { const t = d.data(); if (t.active !== false) _templates.push({ id: d.id, ...t }); });

      // Jeśli brak szablonów — wstaw domyślne
      if (snap.empty) {
        await _seedDefaultTemplates();
        return; // _seedDefaultTemplates wywoła _loadTemplates ponownie
      }

      _renderTemplates();
    } catch (e) {
      console.error('Błąd ładowania szablonów:', e);
      container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--ink-faint);font-size:13px;">Brak szablonów. Dodaj pierwszy w <strong>Ustawieniach → Szablony komunikatów</strong>.</div>`;
    }
  }

  async function _seedDefaultTemplates() {
    try {
      const now = new Date().toISOString();
      for (const tpl of DEFAULT_TEMPLATES) {
        await addDoc(collection(db, 'messageTemplates'), {
          ...tpl,
          createdAt: now,
          createdBy: 'system',
          updatedAt: now
        });
      }
      // Przeładuj po wstawieniu
      const snap = await getDocs(query(collection(db, 'messageTemplates'), orderBy('label', 'asc')));
      _templates = [];
      snap.forEach(d => { const t = d.data(); if (t.active !== false) _templates.push({ id: d.id, ...t }); });
      _renderTemplates();
    } catch (e) {
      console.error('Błąd wstawiania domyślnych szablonów:', e);
    }
  }

  function _renderTemplates() {
    const container = document.getElementById('n-templates-grid');
    if (!container) return;
    if (!_templates.length) {
      container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--ink-faint);font-size:13px;">Brak aktywnych szablonów. Dodaj pierwszy w <strong>Ustawieniach → Szablony komunikatów</strong>.</div>`;
      return;
    }
    container.innerHTML = _templates.map((tpl, idx) => `
      <button class="ntpl-btn" onclick="applyTemplate(${idx})" title="${tpl.title || ''}">
        <i class="ti ${tpl.icon || 'ti-file-text'}" style="font-size:18px;color:var(--green);margin-bottom:5px;display:block;"></i>
        <span style="font-size:12px;font-weight:600;color:var(--ink);line-height:1.3;">${tpl.label || '—'}</span>
      </button>
    `).join('');
  }

  window.applyTemplate = function(idx) {
    const tpl = _templates[idx];
    if (!tpl) return;
    const titleEl = document.getElementById('n-title');
    const bodyEl  = document.getElementById('n-body');
    if (titleEl) titleEl.value = tpl.title || '';
    if (bodyEl)  bodyEl.value  = tpl.body  || '';
    const typeBtn = document.querySelector(`.ntype-btn[data-type="${tpl.type}"]`);
    if (typeBtn) window.setNotifyType(typeBtn, tpl.type);
    window.notifyPreview();
    toast('📋 Szablon wczytany');
    const titleInput = document.getElementById('n-title');
    if (titleInput) titleInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // =====================================================
  // PANEL ZARZĄDZANIA SZABLONAMI (Ustawienia)
  // =====================================================

  window.loadTemplatesSettings = async function() {
    const wrap = document.getElementById('tpl-settings-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<div style="text-align:center;padding:20px;color:var(--ink-faint);"><i class="ti ti-loader" style="font-size:22px;"></i></div>`;
    try {
      const snap = await getDocs(query(collection(db, 'messageTemplates'), orderBy('label', 'asc')));
      const tpls = [];
      snap.forEach(d => tpls.push({ id: d.id, ...d.data() }));

      // Jeśli brak — wstaw domyślne i przeładuj
      if (!tpls.length) {
        await _seedDefaultTemplates();
        window.loadTemplatesSettings();
        return;
      }

      wrap.innerHTML = `
        <div style="margin-bottom:16px;display:flex;justify-content:flex-end;">
          <button class="btn btn-green" style="padding:8px 16px;font-size:13px;" onclick="openAddTemplateModal()">
            <i class="ti ti-plus"></i> Dodaj szablon
          </button>
        </div>
        <div id="tpl-list">
          ${tpls.map(t => `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;background:#fff;opacity:${t.active === false ? '0.55' : '1'};">
              <div style="width:38px;height:38px;border-radius:9px;background:var(--mint);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="ti ${t.icon || 'ti-file-text'}" style="font-size:20px;color:var(--green);"></i>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:14px;">${t.label || '—'} ${t.active === false ? '<span style="font-size:11px;color:var(--ink-faint);font-weight:400;">(nieaktywny)</span>' : ''}</div>
                <div style="font-size:12px;color:var(--ink-faint);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.title || '—'} · <span class="tag ntag-${t.type || 'info'}" style="font-size:11px;padding:2px 8px;">${NOTIFY_TYPE_LABELS[t.type] || t.type}</span></div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="toggleTemplateActive('${t.id}',${t.active !== false})" title="${t.active === false ? 'Aktywuj' : 'Dezaktywuj'}">
                  <i class="ti ${t.active === false ? 'ti-eye' : 'ti-eye-off'}"></i>
                </button>
                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="openEditTemplateModal('${t.id}')"><i class="ti ti-pencil"></i> Edytuj</button>
                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;border-color:var(--danger);color:var(--danger);" onclick="deleteTemplate('${t.id}','${(t.label||'').replace(/'/g,"\\'")}')"><i class="ti ti-trash"></i></button>
              </div>
            </div>`).join('')}
        </div>
      `;
    } catch (e) {
      wrap.innerHTML = `<div style="color:var(--danger);padding:14px;">Błąd: ${e.message}</div>`;
    }
  };

  // Aktywacja / dezaktywacja szablonu
  window.toggleTemplateActive = async function(id, currentlyActive) {
    try {
      await updateDoc(doc(db, 'messageTemplates', id), {
        active: !currentlyActive,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser.uid
      });
      toast(currentlyActive ? 'Szablon dezaktywowany' : '✓ Szablon aktywowany');
      window.loadTemplatesSettings();
      _loadTemplates();
    } catch (e) { toast('Błąd: ' + e.message); }
  };

  // Modal dodawania/edycji szablonu
  function _openTemplateModal(tpl = null) {
    const isEdit = !!tpl;
    const typeOpts = Object.entries(NOTIFY_TYPE_LABELS).map(([v, l]) =>
      `<option value="${v}" ${tpl && tpl.type === v ? 'selected' : ''}>${l}</option>`).join('');
    const iconList = [
      'ti-file-text','ti-droplet','ti-droplet-off','ti-recycle','ti-cloud-storm','ti-users',
      'ti-coins','ti-road','ti-bell','ti-alert-triangle','ti-info-circle',
      'ti-calendar','ti-home','ti-leaf','ti-building','ti-heart','ti-star'
    ];
    const iconOpts = iconList.map(i =>
      `<option value="${i}" ${tpl && tpl.icon === i ? 'selected' : ''}>${i.replace('ti-','')}</option>`).join('');

    let modal = document.getElementById('tpl-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'tpl-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:var(--radius);width:100%;max-width:540px;max-height:90vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);overflow:hidden;">
        <div style="background:linear-gradient(135deg,var(--forest),var(--forest-2));padding:20px 24px;color:#fff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <div style="font-family:'Fraunces',serif;font-size:17px;font-weight:600;">${isEdit ? 'Edytuj szablon' : 'Nowy szablon'}</div>
          <button onclick="document.getElementById('tpl-modal').style.display='none'" style="background:rgba(255,255,255,0.15);border:none;cursor:pointer;color:#fff;width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:15px;"><i class="ti ti-x"></i></button>
        </div>
        <div style="padding:22px 24px;overflow-y:auto;flex:1;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
            <div>
              <label class="nf-label">Nazwa szablonu *</label>
              <input id="tpl-label" class="nf-input" value="${tpl ? (tpl.label||'') : ''}" placeholder="np. Awaria wodociągu">
            </div>
            <div>
              <label class="nf-label">Ikona</label>
              <select id="tpl-icon" class="nf-input">${iconOpts}</select>
            </div>
          </div>
          <div style="margin-bottom:14px;">
            <label class="nf-label">Typ powiadomienia</label>
            <select id="tpl-type" class="nf-input">${typeOpts}</select>
          </div>
          <div style="margin-bottom:14px;">
            <label class="nf-label">Tytuł komunikatu *</label>
            <input id="tpl-title" class="nf-input" value="${tpl ? (tpl.title||'') : ''}" placeholder="np. Awaria sieci wodociągowej">
          </div>
          <div style="margin-bottom:14px;">
            <label class="nf-label">Opis szablonu</label>
            <input id="tpl-desc" class="nf-input" value="${tpl ? (tpl.desc||'') : ''}" placeholder="Krótki opis (opcjonalnie)">
          </div>
          <div style="margin-bottom:18px;">
            <label class="nf-label">Treść komunikatu *</label>
            <textarea id="tpl-body" class="nf-input" rows="5" style="resize:vertical;">${tpl ? (tpl.body||'') : ''}</textarea>
          </div>
          <div id="tpl-modal-error" style="display:none;color:var(--danger);font-size:13px;padding:10px;background:var(--danger-bg);border-radius:8px;margin-bottom:12px;"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button class="btn btn-ghost" onclick="document.getElementById('tpl-modal').style.display='none'">Anuluj</button>
            <button class="btn btn-green" onclick="saveTemplate('${isEdit ? tpl.id : ''}')">
              <i class="ti ti-device-floppy"></i> ${isEdit ? 'Zapisz zmiany' : 'Dodaj szablon'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  window.openAddTemplateModal = function() { _openTemplateModal(null); };

  window.openEditTemplateModal = async function(id) {
    try {
      const snap = await getDoc(doc(db, 'messageTemplates', id));
      if (!snap.exists()) { toast('Nie znaleziono szablonu.'); return; }
      _openTemplateModal({ id, ...snap.data() });
    } catch (e) { toast('Błąd: ' + e.message); }
  };

  window.saveTemplate = async function(id) {
    const label = (document.getElementById('tpl-label') || {}).value?.trim();
    const icon  = (document.getElementById('tpl-icon')  || {}).value;
    const type  = (document.getElementById('tpl-type')  || {}).value;
    const title = (document.getElementById('tpl-title') || {}).value?.trim();
    const desc  = (document.getElementById('tpl-desc')  || {}).value?.trim();
    const body  = (document.getElementById('tpl-body')  || {}).value?.trim();
    const errEl = document.getElementById('tpl-modal-error');
    if (errEl) errEl.style.display = 'none';

    if (!label || !title || !body) {
      if (errEl) { errEl.textContent = 'Wypełnij wszystkie wymagane pola (nazwa, tytuł, treść).'; errEl.style.display = 'block'; }
      return;
    }
    try {
      const data = {
        label, icon: icon || 'ti-file-text', type: type || 'info',
        title, desc: desc || '', body, active: true,
        updatedAt: new Date().toISOString(), updatedBy: auth.currentUser.uid
      };
      if (id) {
        await updateDoc(doc(db, 'messageTemplates', id), data);
        toast('✓ Szablon zaktualizowany');
      } else {
        await addDoc(collection(db, 'messageTemplates'), { ...data, createdAt: new Date().toISOString(), createdBy: auth.currentUser.uid });
        toast('✓ Szablon dodany');
      }
      document.getElementById('tpl-modal').style.display = 'none';
      window.loadTemplatesSettings();
      _loadTemplates();
    } catch (e) {
      if (errEl) { errEl.textContent = 'Błąd zapisu: ' + e.message; errEl.style.display = 'block'; }
    }
  };

  window.deleteTemplate = async function(id, label) {
    if (!confirm(`Czy na pewno chcesz usunąć szablon "${label}"?\n\nTej operacji nie można cofnąć.`)) return;
    try {
      await deleteDoc(doc(db, 'messageTemplates', id));
      toast('Szablon usunięty');
      window.loadTemplatesSettings();
      _loadTemplates();
    } catch (e) { toast('Błąd: ' + e.message); }
  };

  // =====================================================
  // DYNAMICZNY LICZNIK BADGE
  // =====================================================

  async function _updateBadges() {
    try {
      const allResSnap = await getDocs(collection(db, 'residents'));
      let pendingCount = 0;
      allResSnap.forEach(d => { if (d.data().status === 'pending') pendingCount++; });

      const schedSnap = await getDocs(collection(db, 'scheduledNotifications'));
      let schedCount = 0;
      schedSnap.forEach(d => { if (d.data().status === 'scheduled') schedCount++; });

      document.querySelectorAll('.nav-item').forEach(item => {
        const text = item.textContent || '';
        const badge = item.querySelector('.nav-badge');
        if (!badge) return;
        if (text.includes('Mieszkańcy')) {
          badge.textContent = pendingCount > 0 ? pendingCount : '';
          badge.style.display = pendingCount > 0 ? '' : 'none';
        }
        if (text.includes('Powiadomienia')) {
          badge.textContent = schedCount > 0 ? schedCount : '';
          badge.style.display = schedCount > 0 ? '' : 'none';
        }
      });

      const sentSnap = await getDocs(collection(db, 'notifications'));
      let sentCount = 0, deliveredCount = 0, readCount = 0;
      sentSnap.forEach(d => {
        const n = d.data();
        if (n.status === 'sent') sentCount++;
        if (n.stats) { deliveredCount += (n.stats.delivered || 0); readCount += (n.stats.read || 0); }
      });
      const elSent      = document.getElementById('nstat-sent');
      const elDelivered = document.getElementById('nstat-delivered');
      const elRead      = document.getElementById('nstat-read');
      if (elSent)      elSent.textContent      = sentCount;
      if (elDelivered) elDelivered.textContent  = deliveredCount;
      if (elRead)      elRead.textContent       = readCount;
    } catch (e) { console.error('Błąd aktualizacji badge:', e); }
  }

  // =====================================================
  // PODGLĄD TELEFONU
  // =====================================================

  window.notifyPreview = function() {
    const title = (document.getElementById('n-title') || {}).value?.trim() || 'Tytuł komunikatu';
    const body  = (document.getElementById('n-body')  || {}).value?.trim() || 'Treść powiadomienia pojawi się tutaj...';
    const phoneTitle = document.getElementById('phone-title');
    const phoneBody  = document.getElementById('phone-body');
    const phoneTime  = document.getElementById('phone-time');
    if (phoneTitle) phoneTitle.textContent = title;
    if (phoneBody)  phoneBody.textContent  = body;
    if (phoneTime)  phoneTime.textContent  = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  };

  // =====================================================
  // TYP POWIADOMIENIA
  // =====================================================

  window.setNotifyType = function(btn, type) {
    _notifyType = type;
    document.querySelectorAll('.ntype-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const badge = document.getElementById('phone-type-badge');
    if (badge) {
      badge.className = 'phone-type-badge phone-type-' + type;
      badge.innerHTML = `<i class="ti ${NOTIFY_TYPE_ICONS[type]}"></i>`;
    }
    const card = document.getElementById('phone-card');
    if (card) card.className = 'phone-notification-card type-' + type;
  };

  // =====================================================
  // ODBIORCY
  // =====================================================

  window.setAudience = function(btn, aud) {
    _notifyAudience = aud;
    document.querySelectorAll('.naud-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const sw = document.getElementById('n-settlement-wrap');
    const rw = document.getElementById('n-residents-wrap');
    if (sw) sw.style.display = 'none';
    if (rw) rw.style.display = 'none';
    if (aud === 'settlement') { if (sw) sw.style.display = 'block'; _loadSettlements(); }
    if (aud === 'residents')  { if (rw) rw.style.display = 'block'; }
    if (aud !== 'residents')  { _selectedResidents = []; _renderResidentTags(); }
  };

  // =====================================================
  // TOGGLE PLANOWANIA (ZADANIE 1)
  // =====================================================

  window.toggleSchedule = function() {
    const wrap    = document.getElementById('n-schedule-wrap');
    const schedBtn = document.getElementById('n-schedule-btn');
    const sendBtn  = document.getElementById('n-send-btn');
    if (!wrap) return;

    const isVisible = wrap.style.display === 'block';

    if (!isVisible) {
      // Pokaż panel planowania
      wrap.style.display = 'block';
      _notifySendMode = 'scheduled';
      if (schedBtn) {
        schedBtn.style.background = 'var(--mint)';
        schedBtn.style.borderColor = 'var(--green-bright)';
        schedBtn.style.color = 'var(--green)';
      }
      if (sendBtn) sendBtn.innerHTML = '<i class="ti ti-calendar-event"></i> Zaplanuj wysyłkę';

      // Ustaw domyślną datę/godzinę (jutro 08:00)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      const dateEl = document.getElementById('n-sched-date');
      const timeEl = document.getElementById('n-sched-time');
      if (dateEl) dateEl.value = tomorrow.toISOString().split('T')[0];
      if (timeEl) timeEl.value = '08:00';
    } else {
      // Ukryj panel planowania
      wrap.style.display = 'none';
      _notifySendMode = 'now';
      if (schedBtn) {
        schedBtn.style.background = '';
        schedBtn.style.borderColor = '';
        schedBtn.style.color = '';
      }
      if (sendBtn) sendBtn.innerHTML = '<i class="ti ti-send"></i> Wyślij powiadomienie';
    }
  };

  // =====================================================
  // MIEJSCOWOŚCI — scrollowalna lista
  // =====================================================

  async function _loadSettlements() {
    const listEl = document.getElementById('n-settlement-list');
    if (!listEl) return;
    if (listEl.dataset.loaded === '1') return;
    listEl.innerHTML = `<div style="padding:10px;color:var(--ink-faint);font-size:13px;"><i class="ti ti-loader"></i> Ładowanie...</div>`;
    try {
      const regionsDoc = await getDoc(doc(db, 'settings', 'regions'));
      if (regionsDoc.exists()) {
        const settlements = Object.keys(regionsDoc.data().settlements || {}).sort((a, b) => a.localeCompare(b, 'pl'));
        listEl.innerHTML = settlements.map(s => `
          <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-radius:8px;transition:background 0.15s;" onmouseover="this.style.background='var(--mint-2)'" onmouseout="this.style.background=''">
            <input type="radio" name="n-settlement-radio" value="${s}" style="accent-color:var(--green);width:15px;height:15px;flex-shrink:0;">
            <span style="font-size:13px;font-weight:500;">${s}</span>
          </label>`).join('');
        listEl.dataset.loaded = '1';
      } else {
        listEl.innerHTML = `<div style="padding:10px;color:var(--ink-faint);font-size:13px;">Brak miejscowości w bazie.</div>`;
      }
    } catch (e) {
      listEl.innerHTML = `<div style="padding:10px;color:var(--danger);font-size:13px;">Błąd: ${e.message}</div>`;
    }
  }

  // =====================================================
  // WIELOKROTNY WYBÓR MIESZKAŃCÓW
  // =====================================================

  function _renderResidentTags() {
    const tagsEl = document.getElementById('n-residents-tags');
    if (!tagsEl) return;
    if (!_selectedResidents.length) { tagsEl.innerHTML = ''; tagsEl.style.display = 'none'; return; }
    tagsEl.style.display = 'flex';
    tagsEl.innerHTML = _selectedResidents.map(r => `
      <span style="display:inline-flex;align-items:center;gap:5px;background:var(--forest);color:#fff;padding:5px 10px 5px 12px;border-radius:99px;font-size:12px;font-weight:500;">
        ${r.name}
        <button onclick="removeSelectedResident('${r.id}')" style="background:rgba(255,255,255,0.2);border:none;cursor:pointer;color:#fff;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;padding:0;flex-shrink:0;" title="Usuń">×</button>
      </span>`).join('');
  }

  window.removeSelectedResident = function(id) {
    _selectedResidents = _selectedResidents.filter(r => r.id !== id);
    _renderResidentTags();
  };

  window.searchResidents = function(queryStr) {
    clearTimeout(_residentSearchTimeout);
    const dropdown = document.getElementById('n-residents-dropdown');
    if (!dropdown) return;
    if (!queryStr.trim()) { dropdown.style.display = 'none'; return; }
    _residentSearchTimeout = setTimeout(async () => {
      try {
        const snap = await getDocs(collection(db, 'residents'));
        const q = queryStr.toLowerCase();
        const results = [];
        snap.forEach(d => {
          const r = d.data();
          if (r.status !== 'approved') return;
          const fullName = `${r.firstName || ''} ${r.lastName || ''}`.toLowerCase();
          if (fullName.includes(q)) results.push({ id: d.id, ...r });
        });
        const selectedIds = new Set(_selectedResidents.map(r => r.id));
        const filtered = results.filter(r => !selectedIds.has(r.id));
        if (!filtered.length) {
          dropdown.innerHTML = '<div style="padding:12px 14px;font-size:13px;color:var(--ink-faint);">Brak wyników</div>';
        } else {
          dropdown.innerHTML = filtered.slice(0, 8).map(r => {
            const name = `${r.firstName || ''} ${r.lastName || ''}`.trim();
            const safeName  = name.replace(/'/g, "\\'");
            const safeRejon = (r.rejon || '').replace(/'/g, "\\'");
            return `<div onclick="addSelectedResident('${r.id}','${safeName}','${safeRejon}')"
              style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--line-soft);transition:background 0.15s;"
              onmouseover="this.style.background='var(--mint-2)'" onmouseout="this.style.background=''">
              <div style="font-weight:600;color:var(--ink);">${name}</div>
              <div style="font-size:11px;color:var(--ink-faint);">${r.rejon || '—'} · ${r.settlement || r.address || '—'}</div>
            </div>`;
          }).join('');
        }
        dropdown.style.display = 'block';
      } catch (e) { console.error(e); }
    }, 300);
  };

  window.addSelectedResident = function(id, name, rejon) {
    if (_selectedResidents.find(r => r.id === id)) return;
    _selectedResidents.push({ id, name, rejon });
    _renderResidentTags();
    const searchEl = document.getElementById('n-residents-search');
    const dropdown = document.getElementById('n-residents-dropdown');
    if (searchEl) searchEl.value = '';
    if (dropdown) dropdown.style.display = 'none';
  };

  // =====================================================
  // ZAŁĄCZNIK
  // =====================================================

  window.handleAttachment = function(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('⚠ Plik jest za duży (max 5 MB)'); input.value = ''; return; }
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) { toast('⚠ Dozwolone formaty: JPG, PNG, GIF, WEBP, PDF'); input.value = ''; return; }
    _attachmentFile = file;
    _showAttachmentPreview(file);
  };

  function _showAttachmentPreview(file) {
    const preview = document.getElementById('n-attachment-preview');
    if (!preview) return;
    const isImage = file.type.startsWith('image/');
    const isPdf   = file.type === 'application/pdf';
    const sizeKB  = (file.size / 1024).toFixed(0);
    const icon    = isPdf ? 'ti-file-type-pdf' : 'ti-photo';
    const color   = isPdf ? 'var(--danger)' : 'var(--blue)';
    const bg      = isPdf ? 'var(--danger-bg)' : 'var(--blue-bg)';
    const imgHtml = isImage ? `<img src="${URL.createObjectURL(file)}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid var(--line);flex-shrink:0;" alt="podgląd">` : '';
    preview.style.display = 'flex';
    preview.innerHTML = `
      ${imgHtml || `<div style="width:48px;height:48px;border-radius:8px;background:${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti ${icon}" style="font-size:22px;color:${color};"></i></div>`}
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${file.name}</div>
        <div style="font-size:11px;color:var(--ink-faint);margin-top:2px;">${sizeKB} KB · ${isPdf ? 'PDF' : 'Zdjęcie'}</div>
      </div>
      <button onclick="removeAttachment()" style="background:none;border:none;cursor:pointer;color:var(--ink-soft);font-size:18px;padding:4px;border-radius:6px;flex-shrink:0;"><i class="ti ti-x"></i></button>
    `;
  }

  window.removeAttachment = function() {
    _attachmentFile = null;
    const input   = document.getElementById('n-attachment-input');
    const preview = document.getElementById('n-attachment-preview');
    if (input)   input.value = '';
    if (preview) preview.style.display = 'none';
  };

  // =====================================================
  // WYCZYŚĆ FORMULARZ
  // =====================================================

  window.resetNotifyForm = function() {
    const titleEl = document.getElementById('n-title');
    const bodyEl  = document.getElementById('n-body');
    const errEl   = document.getElementById('n-error');
    if (titleEl) titleEl.value = '';
    if (bodyEl)  bodyEl.value  = '';
    if (errEl)   errEl.style.display = 'none';

    document.querySelectorAll('.ntype-btn').forEach(b => b.classList.remove('active'));
    const infoBtn = document.querySelector('.ntype-btn[data-type="info"]');
    if (infoBtn) infoBtn.classList.add('active');
    _notifyType = 'info';

    document.querySelectorAll('.naud-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('.naud-btn[data-aud="all"]');
    if (allBtn) allBtn.classList.add('active');
    _notifyAudience = 'all';
    const sw = document.getElementById('n-settlement-wrap');
    const rw = document.getElementById('n-residents-wrap');
    if (sw) sw.style.display = 'none';
    if (rw) rw.style.display = 'none';
    _selectedResidents = [];
    _renderResidentTags();

    // Reset planowania
    _notifySendMode = 'now';
    const schedWrap = document.getElementById('n-schedule-wrap');
    const schedBtn  = document.getElementById('n-schedule-btn');
    const sendBtn   = document.getElementById('n-send-btn');
    if (schedWrap) schedWrap.style.display = 'none';
    if (schedBtn)  { schedBtn.style.background = ''; schedBtn.style.borderColor = ''; schedBtn.style.color = ''; }
    if (sendBtn)   sendBtn.innerHTML = '<i class="ti ti-send"></i> Wyślij powiadomienie';

    // Reset podgląd
    const phoneTitle = document.getElementById('phone-title');
    const phoneBody  = document.getElementById('phone-body');
    const phoneBadge = document.getElementById('phone-type-badge');
    const phoneCard  = document.getElementById('phone-card');
    if (phoneTitle) phoneTitle.textContent = 'Tytuł komunikatu';
    if (phoneBody)  phoneBody.textContent  = 'Treść powiadomienia pojawi się tutaj...';
    if (phoneBadge) { phoneBadge.className = 'phone-type-badge phone-type-info'; phoneBadge.innerHTML = '<i class="ti ti-info-circle"></i>'; }
    if (phoneCard)  phoneCard.className = 'phone-notification-card type-info';

    window.removeAttachment();
  };

  // =====================================================
  // WYŚLIJ / ZAPLANUJ
  // =====================================================

  window.sendNotification = async function() {
    const titleEl = document.getElementById('n-title');
    const bodyEl  = document.getElementById('n-body');
    const errEl   = document.getElementById('n-error');
    const title = titleEl ? titleEl.value.trim() : '';
    const body  = bodyEl  ? bodyEl.value.trim()  : '';
    if (errEl) errEl.style.display = 'none';

    if (!title) { if (errEl) { errEl.textContent = 'Tytuł komunikatu jest wymagany.'; errEl.style.display = 'block'; } return; }
    if (!body)  { if (errEl) { errEl.textContent = 'Treść komunikatu jest wymagana.';  errEl.style.display = 'block'; } return; }
    if (_notifyAudience === 'settlement') {
      const checked = document.querySelector('input[name="n-settlement-radio"]:checked');
      if (!checked) { if (errEl) { errEl.textContent = 'Wybierz miejscowość.'; errEl.style.display = 'block'; } return; }
    }
    if (_notifyAudience === 'residents' && !_selectedResidents.length) {
      if (errEl) { errEl.textContent = 'Wybierz co najmniej jednego mieszkańca.'; errEl.style.display = 'block'; } return;
    }
    if (_notifySendMode === 'scheduled') {
      const d = (document.getElementById('n-sched-date') || {}).value;
      const t = (document.getElementById('n-sched-time') || {}).value;
      if (!d || !t) { if (errEl) { errEl.textContent = 'Podaj datę i godzinę wysyłki.'; errEl.style.display = 'block'; } return; }
      if (new Date(d + 'T' + t) <= new Date()) { if (errEl) { errEl.textContent = 'Data wysyłki musi być w przyszłości.'; errEl.style.display = 'block'; } return; }
    }

    const btn = document.getElementById('n-send-btn');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Wysyłanie...'; }

    try {
      const adminName = auth.currentUser.displayName || auth.currentUser.email || auth.currentUser.uid;
      const now = new Date().toISOString();

      let audienceLabel = NOTIFY_AUD_LABELS[_notifyAudience] || _notifyAudience;
      let audienceData  = { type: _notifyAudience };
      if (_notifyAudience === 'settlement') {
        const settlement = document.querySelector('input[name="n-settlement-radio"]:checked').value;
        audienceLabel = settlement;
        audienceData.settlement = settlement;
      }
      if (_notifyAudience === 'residents') {
        audienceLabel = _selectedResidents.map(r => r.name).join(', ');
        audienceData.residentIds   = _selectedResidents.map(r => r.id);
        audienceData.residentNames = _selectedResidents.map(r => r.name);
      }

      let attachmentData = null;
      if (_attachmentFile) {
        attachmentData = {
          name: _attachmentFile.name,
          type: _attachmentFile.type,
          size: _attachmentFile.size,
          data: (_attachmentFile.type.startsWith('image/') && _attachmentFile.size <= 500 * 1024)
            ? await _fileToBase64(_attachmentFile) : null
        };
      }

      const docData = {
        title, body,
        type: _notifyType,
        typeLabel: NOTIFY_TYPE_LABELS[_notifyType],
        audience: audienceData,
        audienceLabel,
        createdAt: now,
        createdBy: auth.currentUser.uid,
        createdByName: adminName,
        ...(attachmentData ? { attachment: attachmentData } : {}),
        stats: { sent: 0, delivered: 0, read: 0 }
      };

      if (_notifySendMode === 'now') {
        await addDoc(collection(db, 'notifications'), { ...docData, status: 'sent', sentAt: now, stats: { sent: 1, delivered: 0, read: 0 } });
        toast('✓ Powiadomienie wysłane!');
      } else {
        const schedDate = document.getElementById('n-sched-date').value;
        const schedTime = document.getElementById('n-sched-time').value;
        const scheduledFor = new Date(schedDate + 'T' + schedTime).toISOString();
        await addDoc(collection(db, 'scheduledNotifications'), { ...docData, status: 'scheduled', scheduledFor });
        const schedDt = new Date(schedDate + 'T' + schedTime);
        toast(`📅 Zaplanowano na ${schedDt.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
      }

      window.resetNotifyForm();
      window.loadNotifyHistory();
      _updateBadges();

    } catch (err) {
      console.error('Błąd wysyłania:', err);
      if (errEl) { errEl.textContent = 'Błąd: ' + err.message; errEl.style.display = 'block'; }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
    }
  };

  function _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // =====================================================
  // HISTORIA POWIADOMIEŃ
  // =====================================================

  window.loadNotifyHistory = async function() {
    const tbody = document.getElementById('notify-history-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--ink-faint);">
      <i class="ti ti-loader" style="font-size:24px;display:block;margin-bottom:8px;"></i>Ładowanie...
    </td></tr>`;
    try {
      const sentSnap  = await getDocs(query(collection(db, 'notifications'),          orderBy('createdAt', 'desc'), limit(50)));
      const schedSnap = await getDocs(query(collection(db, 'scheduledNotifications'), orderBy('createdAt', 'desc'), limit(20)));
      const rows = [];
      sentSnap.forEach(d  => rows.push({ id: d.id, col: 'notifications',          ...d.data() }));
      schedSnap.forEach(d => rows.push({ id: d.id, col: 'scheduledNotifications', ...d.data() }));
      rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--ink-faint);">
          <i class="ti ti-bell-off" style="font-size:28px;display:block;margin-bottom:10px;"></i>Brak powiadomień w historii
        </td></tr>`;
        return;
      }
      tbody.innerHTML = '';
      rows.forEach(n => {
        const dt    = n.sentAt || n.scheduledFor || n.createdAt || '';
        const dtFmt = dt ? new Date(dt).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
        const typeClass = 'ntag-' + (n.type || 'info');
        const typeLabel = n.typeLabel || NOTIFY_TYPE_LABELS[n.type] || n.type || '—';
        const typeIcon  = NOTIFY_TYPE_ICONS[n.type] || 'ti-bell';
        const statusTag = n.status === 'sent'
          ? `<span class="tag tag-sent"><i class="ti ti-check" style="font-size:12px;"></i> Wysłano</span>`
          : `<span class="tag tag-sched"><i class="ti ti-clock" style="font-size:12px;"></i> Zaplanowane</span>`;
        const stats = n.stats || {};
        const statsHtml = n.status === 'sent'
          ? `<div style="display:flex;gap:8px;margin-top:3px;">
              <span style="font-size:10px;color:var(--green);"><i class="ti ti-send" style="font-size:10px;"></i> ${stats.sent || 1}</span>
              <span style="font-size:10px;color:var(--blue);"><i class="ti ti-check" style="font-size:10px;"></i> ${stats.delivered || 0}</span>
              <span style="font-size:10px;color:var(--amber);"><i class="ti ti-eye" style="font-size:10px;"></i> ${stats.read || 0}</span>
            </div>` : '';
        const attachIcon = n.attachment
          ? `<i class="ti ${n.attachment.type === 'application/pdf' ? 'ti-file-type-pdf' : 'ti-photo'}" style="font-size:13px;color:var(--ink-faint);margin-left:5px;" title="Załącznik: ${n.attachment.name}"></i>` : '';
        const row = document.createElement('tr');
        row.innerHTML = `
          <td class="cell-date">${dtFmt}</td>
          <td class="cell-title">${n.title || '—'}${attachIcon}${statsHtml}</td>
          <td><span class="tag ${typeClass}"><i class="ti ${typeIcon}" style="font-size:12px;"></i> ${typeLabel}</span></td>
          <td style="font-size:13px;color:var(--ink-soft);">${n.audienceLabel || '—'}</td>
          <td>${statusTag}</td>
          <td><button class="btn btn-ghost" style="padding:5px 10px;font-size:12px;" onclick="openNotifyDetail('${n.id}','${n.col}')"><i class="ti ti-eye"></i> Szczegóły</button></td>
        `;
        tbody.appendChild(row);
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--danger);">
        <i class="ti ti-alert-circle" style="font-size:24px;display:block;margin-bottom:8px;"></i>Błąd: ${err.message}
      </td></tr>`;
    }
  };

  // =====================================================
  // SZCZEGÓŁY POWIADOMIENIA — ZADANIE 2
  // Modal 2-kolumnowy, max-width ~1000px, max-height 85vh
  // =====================================================

  window.openNotifyDetail = async function(id, col) {
    // Usuń stary modal jeśli istnieje
    const oldModal = document.getElementById('notify-detail-modal');
    if (oldModal) oldModal.style.display = 'none';

    // Stwórz nowy modal lub użyj istniejącego
    let modal = document.getElementById('notify-detail-modal-v2');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'notify-detail-modal-v2';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;';
      modal.addEventListener('click', function(e) { if (e.target === modal) modal.style.display = 'none'; });
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:var(--radius);width:100%;max-width:1000px;max-height:85vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);overflow:hidden;">
        <div style="background:linear-gradient(135deg,var(--forest),var(--forest-2));padding:20px 26px;color:#fff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <div style="font-family:'Fraunces',serif;font-size:19px;font-weight:600;"><i class="ti ti-bell" style="margin-right:8px;opacity:0.8;"></i>Szczegóły powiadomienia</div>
          <button onclick="document.getElementById('notify-detail-modal-v2').style.display='none'" style="background:rgba(255,255,255,0.15);border:none;cursor:pointer;color:#fff;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:17px;"><i class="ti ti-x"></i></button>
        </div>
        <div id="notify-detail-body-v2" style="overflow-y:auto;flex:1;padding:24px 26px;">
          <div style="text-align:center;padding:30px;color:var(--ink-faint);"><i class="ti ti-loader" style="font-size:28px;display:block;margin-bottom:10px;"></i>Ładowanie danych...</div>
        </div>
        <div style="padding:14px 26px;border-top:1px solid var(--line);text-align:right;flex-shrink:0;background:#fff;">
          <button class="btn btn-ghost" onclick="document.getElementById('notify-detail-modal-v2').style.display='none'">Zamknij</button>
        </div>
      </div>
    `;

    const bodyEl = document.getElementById('notify-detail-body-v2');

    try {
      const snap = await getDoc(doc(db, col, id));
      if (!snap.exists()) { bodyEl.innerHTML = '<p style="color:var(--danger);padding:20px;">Nie znaleziono danych.</p>'; return; }
      const n = snap.data();
      const dt    = n.sentAt || n.scheduledFor || n.createdAt || '';
      const dtFmt = dt ? new Date(dt).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      const typeClass = 'ntag-' + (n.type || 'info');
      const typeLabel = n.typeLabel || NOTIFY_TYPE_LABELS[n.type] || n.type || '—';
      const typeIcon  = NOTIFY_TYPE_ICONS[n.type] || 'ti-bell';
      const stats = n.stats || {};

      // Sekcja załącznika
      let attachSection = '';
      if (n.attachment) {
        const att = n.attachment;
        const isPdf = att.type === 'application/pdf';
        const attIcon  = isPdf ? 'ti-file-type-pdf' : 'ti-photo';
        const attColor = isPdf ? 'var(--danger)' : 'var(--blue)';
        const attBg    = isPdf ? 'var(--danger-bg)' : 'var(--blue-bg)';
        const sizeKB   = att.size ? (att.size / 1024).toFixed(0) + ' KB' : '';
        const imgPreview = (att.data && att.type.startsWith('image/'))
          ? `<img src="${att.data}" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin-top:10px;border:1px solid var(--line);" alt="załącznik">` : '';
        attachSection = `
          <div style="background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:14px;">
            <div style="font-size:11px;color:var(--ink-faint);margin-bottom:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;"><i class="ti ti-paperclip" style="font-size:12px;"></i> Załącznik</div>
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:40px;height:40px;border-radius:9px;background:${attBg};display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti ${attIcon}" style="font-size:22px;color:${attColor};"></i></div>
              <div><div style="font-size:13px;font-weight:600;">${att.name || '—'}</div><div style="font-size:11px;color:var(--ink-faint);">${sizeKB} · ${isPdf ? 'PDF' : 'Zdjęcie'}</div></div>
            </div>${imgPreview}
          </div>`;
      }

      // Sekcja statystyk
      const statsSection = n.status === 'sent' ? `
        <div style="background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:16px;margin-top:14px;">
          <div style="font-size:11px;color:var(--ink-faint);margin-bottom:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;"><i class="ti ti-chart-bar" style="font-size:12px;"></i> Statystyki dostarczenia</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
            <div style="text-align:center;background:#fff;border-radius:9px;padding:12px;border:1px solid var(--line);">
              <div style="font-family:'Fraunces',serif;font-size:26px;font-weight:600;color:var(--green);">${stats.sent || 1}</div>
              <div style="font-size:12px;color:var(--ink-faint);margin-top:3px;"><i class="ti ti-send" style="font-size:12px;"></i> Wysłano</div>
            </div>
            <div style="text-align:center;background:#fff;border-radius:9px;padding:12px;border:1px solid var(--line);">
              <div style="font-family:'Fraunces',serif;font-size:26px;font-weight:600;color:var(--blue);">${stats.delivered || 0}</div>
              <div style="font-size:12px;color:var(--ink-faint);margin-top:3px;"><i class="ti ti-check" style="font-size:12px;"></i> Dostarczono</div>
            </div>
            <div style="text-align:center;background:#fff;border-radius:9px;padding:12px;border:1px solid var(--line);">
              <div style="font-family:'Fraunces',serif;font-size:26px;font-weight:600;color:var(--amber);">${stats.read || 0}</div>
              <div style="font-size:12px;color:var(--ink-faint);margin-top:3px;"><i class="ti ti-eye" style="font-size:12px;"></i> Odczytano</div>
            </div>
          </div>
        </div>` : '';

      // Układ 2-kolumnowy
      bodyEl.innerHTML = `
        <!-- Nagłówek z tagami -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap;">
          <span class="tag ${typeClass}" style="font-size:13px;padding:6px 16px;"><i class="ti ${typeIcon}" style="font-size:14px;"></i> ${typeLabel}</span>
          ${n.status === 'sent'
            ? '<span class="tag tag-sent" style="font-size:13px;padding:6px 16px;"><i class="ti ti-check" style="font-size:13px;"></i> Wysłano</span>'
            : '<span class="tag tag-sched" style="font-size:13px;padding:6px 16px;"><i class="ti ti-clock" style="font-size:13px;"></i> Zaplanowane</span>'}
        </div>

        <!-- Siatka 2-kolumnowa -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;">

          <!-- LEWA KOLUMNA: treść -->
          <div>
            <div style="margin-bottom:16px;">
              <div style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;font-weight:600;">Tytuł</div>
              <div style="font-size:18px;font-weight:700;color:var(--ink);line-height:1.3;">${n.title || '—'}</div>
            </div>
            <div style="margin-bottom:16px;">
              <div style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;font-weight:600;">Treść</div>
              <div style="font-size:14px;color:var(--ink-soft);line-height:1.7;background:var(--paper);padding:14px;border-radius:10px;border:1px solid var(--line);white-space:pre-wrap;">${n.body || '—'}</div>
            </div>
            ${attachSection}
          </div>

          <!-- PRAWA KOLUMNA: metadane -->
          <div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
              <div style="background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:14px;">
                <div style="font-size:11px;color:var(--ink-faint);margin-bottom:5px;font-weight:600;"><i class="ti ti-users" style="font-size:12px;"></i> Odbiorcy</div>
                <div style="font-size:13px;font-weight:600;word-break:break-word;">${n.audienceLabel || '—'}</div>
              </div>
              <div style="background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:14px;">
                <div style="font-size:11px;color:var(--ink-faint);margin-bottom:5px;font-weight:600;"><i class="ti ti-calendar" style="font-size:12px;"></i> ${n.status === 'scheduled' ? 'Zaplanowano na' : 'Wysłano'}</div>
                <div style="font-size:13px;font-weight:600;">${dtFmt}</div>
              </div>
            </div>
            <div style="background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:14px;">
              <div style="font-size:11px;color:var(--ink-faint);margin-bottom:5px;font-weight:600;"><i class="ti ti-user" style="font-size:12px;"></i> Wysłane przez</div>
              <div style="font-size:13px;font-weight:600;">${n.createdByName || n.createdBy || '—'}</div>
            </div>
            <div style="background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:14px;">
              <div style="font-size:11px;color:var(--ink-faint);margin-bottom:5px;font-weight:600;"><i class="ti ti-clock" style="font-size:12px;"></i> Utworzono</div>
              <div style="font-size:13px;font-weight:600;">${n.createdAt ? new Date(n.createdAt).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</div>
            </div>
            ${statsSection}
          </div>
        </div>
      `;
    } catch (err) {
      bodyEl.innerHTML = `<p style="color:var(--danger);padding:20px;">Błąd: ${err.message}</p>`;
    }
  };

  // =====================================================
  // ZAMKNIJ DROPDOWN PO KLIKNIĘCIU POZA
  // =====================================================

  document.addEventListener('click', function(e) {
    const rw = document.getElementById('n-residents-wrap');
    if (rw && !rw.contains(e.target)) {
      const dd = document.getElementById('n-residents-dropdown');
      if (dd) dd.style.display = 'none';
    }
  });

  // =====================================================
  // INICJALIZACJA
  // =====================================================

  _loadTemplates();
  window.notifyPreview();
  _updateBadges();
  window.updateNotifyBadges = _updateBadges;
}
