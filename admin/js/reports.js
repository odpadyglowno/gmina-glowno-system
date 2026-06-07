// =====================================================
// MODUŁ ZGŁOSZEŃ MIESZKAŃCÓW — Gmina Głowno
// Plik: admin/js/reports.js  v2.1
// Poprawki: parent-child, sync statusów, drzewo, autocomplete, archiwizacja
// =====================================================

export function initReports({ db, auth, addDoc, collection, getDocs, getDoc, doc,
  query, orderBy, limit, where, updateDoc, onSnapshot, serverTimestamp, toast }) {

  // =====================================================
  // STAŁE I KONFIGURACJA
  // =====================================================

  const STATUS_CONFIG = {
    new:        { label: 'Nowe',                  color: '#2563a8', bg: '#e7f0f9',  icon: 'ti-circle-dot' },
    accepted:   { label: 'Przyjęte',              color: '#7b3fa0', bg: '#f3e8ff',  icon: 'ti-circle-check' },
    in_progress:{ label: 'W realizacji',          color: '#d98a2b', bg: '#fbf0e2',  icon: 'ti-loader' },
    waiting:    { label: 'Oczekuje na wykonawcę', color: '#0891b2', bg: '#e0f2fe',  icon: 'ti-clock-pause' },
    done:       { label: 'Zakończone',            color: '#2e7d32', bg: '#e8f3ec',  icon: 'ti-circle-check-filled' },
    rejected:   { label: 'Odrzucone',             color: '#c0492f', bg: '#f9e8e4',  icon: 'ti-circle-x' }
  };

  const PRIORITY_CONFIG = {
    critical: { label: 'Krytyczny', color: '#c0492f', bg: '#f9e8e4', icon: 'ti-flame' },
    high:     { label: 'Wysoki',    color: '#d98a2b', bg: '#fbf0e2', icon: 'ti-arrow-up' },
    normal:   { label: 'Normalny',  color: '#2563a8', bg: '#e7f0f9', icon: 'ti-minus' },
    low:      { label: 'Niski',     color: '#5a6b60', bg: '#eef1ec', icon: 'ti-arrow-down' }
  };

  const SLA_OPTIONS = [
    { value: 7,  label: '7 dni' },
    { value: 14, label: '14 dni' },
    { value: 30, label: '30 dni' },
    { value: 0,  label: 'Bez terminu' }
  ];

  // Statusy które powodują synchronizację dzieci (Poprawka 2)
  const SYNC_STATUSES = ['accepted', 'in_progress', 'done', 'rejected'];

  // =====================================================
  // STAN MODUŁU
  // =====================================================

  let _categories = [];
  let _allReports = [];
  let _currentReportId = null;
  let _showArchived = false; // Poprawka 6

  // =====================================================
  // GENEROWANIE NUMERU SPRAWY
  // =====================================================

  async function _generateReportNumber() {
    const year = new Date().getFullYear();
    const counterRef = doc(db, 'settings', `reportCounter_${year}`);
    try {
      const counterDoc = await getDoc(counterRef);
      let next = 1;
      if (counterDoc.exists()) {
        next = (counterDoc.data().last || 0) + 1;
      }
      await updateDoc(counterRef, { last: next }).catch(async () => {
        const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        await setDoc(counterRef, { last: next, year });
      });
      return `GG-${year}-${String(next).padStart(6, '0')}`;
    } catch (e) {
      return `GG-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    }
  }

  // =====================================================
  // ŁADOWANIE KATEGORII
  // =====================================================

  async function _loadCategories() {
    try {
      const snap = await getDocs(query(collection(db, 'reportCategories'), orderBy('order', 'asc')));
      _categories = [];
      snap.forEach(d => _categories.push({ id: d.id, ...d.data() }));
      if (!_categories.length) await _seedDefaultCategories();
    } catch (e) { console.error('Błąd kategorii:', e); }
  }

  async function _seedDefaultCategories() {
    const defaults = [
      { name: 'Drogi i chodniki',   icon: 'ti-road',    color: '#d98a2b', order: 1 },
      { name: 'Oświetlenie',        icon: 'ti-bulb',    color: '#f59e0b', order: 2 },
      { name: 'Zieleń i parki',     icon: 'ti-tree',    color: '#2e7d32', order: 3 },
      { name: 'Odpady i śmieci',    icon: 'ti-trash',   color: '#7b3fa0', order: 4 },
      { name: 'Kanalizacja i woda', icon: 'ti-droplet', color: '#2563a8', order: 5 },
      { name: 'Bezpieczeństwo',     icon: 'ti-shield',  color: '#c0492f', order: 6 },
      { name: 'Hałas i porządek',   icon: 'ti-volume',  color: '#0891b2', order: 7 },
      { name: 'Inne',               icon: 'ti-dots-circle-horizontal', color: '#5a6b60', order: 8 }
    ];
    const now = new Date().toISOString();
    for (const cat of defaults) {
      await addDoc(collection(db, 'reportCategories'), { ...cat, createdAt: now, active: true });
    }
    const snap = await getDocs(query(collection(db, 'reportCategories'), orderBy('order', 'asc')));
    _categories = [];
    snap.forEach(d => _categories.push({ id: d.id, ...d.data() }));
  }

  // =====================================================
  // HELPERS
  // =====================================================

  function _statusBadge(status) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new;
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:99px;font-size:12px;font-weight:600;background:${cfg.bg};color:${cfg.color};white-space:nowrap;">
      <i class="ti ${cfg.icon}" style="font-size:12px;"></i>${cfg.label}
    </span>`;
  }

  function _priorityBadge(priority) {
    const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal;
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:99px;font-size:12px;font-weight:600;background:${cfg.bg};color:${cfg.color};white-space:nowrap;">
      <i class="ti ${cfg.icon}" style="font-size:12px;"></i>${cfg.label}
    </span>`;
  }

  function _fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function _fmtDateShort(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function _slaStatus(report) {
    if (!report.slaDays || report.slaDays === 0 || !report.createdAt) return null;
    if (report.status === 'done' || report.status === 'rejected') return null;
    const deadline = new Date(new Date(report.createdAt).getTime() + report.slaDays * 86400000);
    const diff = Math.ceil((deadline - new Date()) / 86400000);
    if (diff < 0) return { label: `Przekroczono o ${Math.abs(diff)} dni`, color: '#c0492f', bg: '#f9e8e4' };
    if (diff <= 2) return { label: `Zostało ${diff} dni`, color: '#d98a2b', bg: '#fbf0e2' };
    return { label: `Termin: ${_fmtDateShort(deadline.toISOString())}`, color: '#2e7d32', bg: '#e8f3ec' };
  }

  // =====================================================
  // RENDEROWANIE STRONY GŁÓWNEJ
  // =====================================================

  function _renderReportsPage() {
    const page = document.getElementById('page-reports-module');
    if (!page) return;
    page.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-family:'Fraunces',serif;font-size:22px;font-weight:600;color:var(--ink);">Zgłoszenia mieszkańców</div>
          <div style="font-size:13px;color:var(--ink-faint);margin-top:2px;">Zarządzaj sprawami i śledź postęp realizacji</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-ghost" onclick="window.openReportsMap()" style="padding:9px 16px;font-size:13px;">
            <i class="ti ti-map-2"></i> Mapa zgłoszeń
          </button>
          <button class="btn btn-green" onclick="window.openNewReportModal()" style="padding:9px 16px;font-size:13px;">
            <i class="ti ti-plus"></i> Nowe zgłoszenie
          </button>
        </div>
      </div>

      <!-- STATYSTYKI -->
      <div id="reports-stats-row" style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:22px;"></div>

      <!-- FILTRY -->
      <div class="panel" style="margin-bottom:18px;">
        <div class="panel-body" style="padding:16px 20px;">
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            <div class="search" style="width:220px;">
              <i class="ti ti-search"></i>
              <input id="reports-search" placeholder="Szukaj opisu, adresu..." oninput="window.filterReports()">
            </div>
            <div class="search" style="width:200px;">
              <i class="ti ti-hash"></i>
              <input id="reports-search-number" placeholder="Nr sprawy GG-2026-..." oninput="window.filterReports()">
            </div>
            <select id="reports-filter-status" onchange="window.filterReports()" style="border:1px solid var(--line);border-radius:10px;padding:9px 14px;font-family:inherit;font-size:13px;color:var(--ink-soft);background:#fff;outline:none;cursor:pointer;">
              <option value="">Wszystkie statusy</option>
              ${Object.entries(STATUS_CONFIG).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
            </select>
            <select id="reports-filter-priority" onchange="window.filterReports()" style="border:1px solid var(--line);border-radius:10px;padding:9px 14px;font-family:inherit;font-size:13px;color:var(--ink-soft);background:#fff;outline:none;cursor:pointer;">
              <option value="">Wszystkie priorytety</option>
              ${Object.entries(PRIORITY_CONFIG).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
            </select>
            <select id="reports-filter-category" onchange="window.filterReports()" style="border:1px solid var(--line);border-radius:10px;padding:9px 14px;font-family:inherit;font-size:13px;color:var(--ink-soft);background:#fff;outline:none;cursor:pointer;">
              <option value="">Wszystkie kategorie</option>
              ${_categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
            <!-- Poprawka 6: filtr archiwalnych -->
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--ink-soft);cursor:pointer;white-space:nowrap;">
              <input type="checkbox" id="reports-show-archived" onchange="window.toggleArchivedFilter(this.checked)" style="cursor:pointer;">
              Pokaż archiwalne
            </label>
            <button class="btn btn-ghost" onclick="window.clearReportsFilters()" style="padding:9px 14px;font-size:13px;">
              <i class="ti ti-x"></i> Wyczyść
            </button>
          </div>
        </div>
      </div>

      <!-- TABELA -->
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title"><i class="ti ti-clipboard-list"></i> Lista zgłoszeń</div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span id="reports-count" style="font-size:13px;color:var(--ink-faint);"></span>
            <button class="btn btn-ghost" style="padding:5px 10px;font-size:12px;" onclick="window.loadReports()">
              <i class="ti ti-refresh"></i>
            </button>
          </div>
        </div>
        <div class="panel-body" style="padding:0 0 4px;">
          <div style="overflow-x:auto;">
            <table id="reports-table" style="min-width:900px;">
              <thead>
                <tr>
                  <th style="width:150px;">Nr sprawy</th>
                  <th style="width:130px;">Data</th>
                  <th>Opis</th>
                  <th style="width:140px;">Kategoria</th>
                  <th style="width:120px;">Status</th>
                  <th style="width:110px;">Priorytet</th>
                  <th style="width:130px;">SLA</th>
                  <th style="width:80px;"></th>
                </tr>
              </thead>
              <tbody id="reports-tbody">
                <tr><td colspan="8" style="text-align:center;padding:40px;color:var(--ink-faint);">
                  <i class="ti ti-loader" style="font-size:28px;display:block;margin-bottom:10px;"></i>Ładowanie zgłoszeń...
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    _loadReportsStats();
    window.loadReports();
  }

  // =====================================================
  // STATYSTYKI
  // =====================================================

  async function _loadReportsStats() {
    const row = document.getElementById('reports-stats-row');
    if (!row) return;
    try {
      const snap = await getDocs(collection(db, 'reports'));
      const counts = {};
      Object.keys(STATUS_CONFIG).forEach(k => counts[k] = 0);
      snap.forEach(d => {
        const s = d.data().status || 'new';
        if (counts[s] !== undefined) counts[s]++;
      });
      row.innerHTML = Object.entries(STATUS_CONFIG).map(([k, cfg]) => `
        <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:14px 16px;cursor:pointer;transition:all 0.2s;"
          onclick="document.getElementById('reports-filter-status').value='${k}';window.filterReports()"
          onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='var(--shadow)'"
          onmouseout="this.style.transform='';this.style.boxShadow=''">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <div style="width:32px;height:32px;border-radius:9px;background:${cfg.bg};display:flex;align-items:center;justify-content:center;">
              <i class="ti ${cfg.icon}" style="font-size:16px;color:${cfg.color};"></i>
            </div>
          </div>
          <div style="font-family:'Fraunces',serif;font-size:26px;font-weight:600;color:${cfg.color};line-height:1;">${counts[k]}</div>
          <div style="font-size:11px;color:var(--ink-faint);margin-top:4px;line-height:1.3;">${cfg.label}</div>
        </div>
      `).join('');
    } catch (e) { console.error('Błąd statystyk:', e); }
  }

  // =====================================================
  // ŁADOWANIE I FILTROWANIE
  // =====================================================

  window.loadReports = async function() {
    const tbody = document.getElementById('reports-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--ink-faint);">
      <i class="ti ti-loader" style="font-size:28px;display:block;margin-bottom:10px;"></i>Ładowanie...
    </td></tr>`;
    try {
      const snap = await getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc')));
      _allReports = [];
      snap.forEach(d => _allReports.push({ id: d.id, ...d.data() }));
      window.filterReports();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--danger);">Błąd: ${e.message}</td></tr>`;
    }
  };

  window.filterReports = function() {
    const search   = (document.getElementById('reports-search')?.value || '').toLowerCase().trim();
    const number   = (document.getElementById('reports-search-number')?.value || '').toLowerCase().trim();
    const status   = document.getElementById('reports-filter-status')?.value || '';
    const priority = document.getElementById('reports-filter-priority')?.value || '';
    const category = document.getElementById('reports-filter-category')?.value || '';

    let filtered = _allReports.filter(r => {
      // Poprawka 6: ukryj archiwalne jeśli filtr wyłączony
      if (!_showArchived && r.archived === true) return false;
      if (status   && r.status   !== status)   return false;
      if (priority && r.priority !== priority) return false;
      if (category && r.categoryId !== category) return false;
      if (number   && !(r.number || '').toLowerCase().includes(number)) return false;
      if (search) {
        const hay = `${r.description || ''} ${r.address || ''} ${r.residentName || ''} ${r.number || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const countEl = document.getElementById('reports-count');
    if (countEl) countEl.textContent = `${filtered.length} zgłoszeń`;
    _renderReportsTable(filtered);
  };

  window.toggleArchivedFilter = function(checked) {
    _showArchived = checked;
    window.filterReports();
  };

  window.clearReportsFilters = function() {
    ['reports-search','reports-search-number'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['reports-filter-status','reports-filter-priority','reports-filter-category'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const archEl = document.getElementById('reports-show-archived');
    if (archEl) { archEl.checked = false; _showArchived = false; }
    window.filterReports();
  };

  // =====================================================
  // POPRAWKA 3: DRZEWO SPRAW — renderowanie tabeli z rozwijaniem
  // =====================================================

  function _renderReportsTable(reports) {
    const tbody = document.getElementById('reports-tbody');
    if (!tbody) return;
    if (!reports.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--ink-faint);">
        <i class="ti ti-clipboard-off" style="font-size:28px;display:block;margin-bottom:10px;"></i>Brak zgłoszeń
      </td></tr>`;
      return;
    }

    // Buduj drzewo parent-child
    // Sprawy główne: parentId == null lub brak
    // Sprawy powiązane: mają parentId
    const parents = reports.filter(r => !r.parentId);
    const childrenMap = {};
    reports.forEach(r => {
      if (r.parentId) {
        if (!childrenMap[r.parentId]) childrenMap[r.parentId] = [];
        childrenMap[r.parentId].push(r);
      }
    });

    tbody.innerHTML = '';
    parents.forEach(r => {
      const children = childrenMap[r.id] || [];
      const childCount = children.length;
      const cat = _categories.find(c => c.id === r.categoryId);
      const sla = _slaStatus(r);
      const hasChildren = childCount > 0;

      // Wiersz główny
      const row = document.createElement('tr');
      row.style.cursor = 'pointer';
      row.style.background = r.archived ? '#fafafa' : '#fff';
      row.innerHTML = `
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            ${hasChildren ? `<button onclick="event.stopPropagation();window.toggleReportChildren('${r.id}')"
              id="toggle-btn-${r.id}"
              style="background:none;border:none;cursor:pointer;color:var(--forest);padding:2px;font-size:14px;display:flex;align-items:center;"
              title="Rozwiń powiązane zgłoszenia">
              <i class="ti ti-chevron-right" id="toggle-icon-${r.id}"></i>
            </button>` : '<span style="width:20px;display:inline-block;"></span>'}
            <div>
              <div style="font-family:monospace;font-size:12px;font-weight:700;color:var(--forest);background:var(--mint-2);padding:4px 8px;border-radius:6px;display:inline-block;">${r.number || '—'}</div>
              ${hasChildren ? `<div style="font-size:10px;color:var(--blue);margin-top:3px;font-weight:600;">
                <i class="ti ti-git-branch" style="font-size:10px;"></i> ${childCount} powiązane
              </div>` : ''}
              ${r.archived ? '<div style="font-size:10px;color:var(--ink-faint);margin-top:2px;"><i class="ti ti-archive" style="font-size:10px;"></i> Archiwalne</div>' : ''}
            </div>
          </div>
        </td>
        <td class="cell-date">${_fmtDateShort(r.createdAt)}</td>
        <td>
          <div style="font-weight:500;font-size:13px;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.description || '—'}</div>
          ${r.residentName ? `<div style="font-size:11px;color:var(--ink-faint);margin-top:2px;"><i class="ti ti-user" style="font-size:11px;"></i> ${r.residentName}</div>` : ''}
        </td>
        <td>
          ${cat ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:500;color:${cat.color || 'var(--ink-soft)'};">
            <i class="ti ${cat.icon || 'ti-tag'}" style="font-size:13px;"></i>${cat.name}
          </span>` : '<span style="color:var(--ink-faint);font-size:12px;">—</span>'}
        </td>
        <td>${_statusBadge(r.status || 'new')}</td>
        <td>${_priorityBadge(r.priority || 'normal')}</td>
        <td>
          ${sla ? `<span style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:99px;background:${sla.bg};color:${sla.color};">${sla.label}</span>` : '<span style="color:var(--ink-faint);font-size:12px;">—</span>'}
        </td>
        <td onclick="event.stopPropagation()">
          <button class="btn btn-ghost" style="padding:5px 10px;font-size:12px;" onclick="window.openReportDetail('${r.id}')">
            <i class="ti ti-eye"></i>
          </button>
        </td>
      `;
      row.onclick = () => window.openReportDetail(r.id);
      tbody.appendChild(row);

      // Wiersze dzieci (ukryte domyślnie)
      if (hasChildren) {
        const childGroup = document.createElement('tbody');
        childGroup.id = `children-group-${r.id}`;
        childGroup.style.display = 'none';
        children.forEach(child => {
          const childCat = _categories.find(c => c.id === child.categoryId);
          const childRow = document.createElement('tr');
          childRow.style.cursor = 'pointer';
          childRow.style.background = '#f8fbf8';
          childRow.innerHTML = `
            <td>
              <div style="display:flex;align-items:center;gap:6px;padding-left:26px;">
                <i class="ti ti-corner-down-right" style="font-size:13px;color:var(--ink-faint);flex-shrink:0;"></i>
                <div style="font-family:monospace;font-size:11px;font-weight:600;color:var(--blue);background:var(--blue-bg);padding:3px 7px;border-radius:5px;display:inline-block;">${child.number || '—'}</div>
              </div>
            </td>
            <td class="cell-date" style="font-size:12px;">${_fmtDateShort(child.createdAt)}</td>
            <td>
              <div style="font-size:12px;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink-soft);">${child.description || '—'}</div>
              ${child.residentName ? `<div style="font-size:11px;color:var(--ink-faint);margin-top:1px;"><i class="ti ti-user" style="font-size:10px;"></i> ${child.residentName}</div>` : ''}
            </td>
            <td>
              ${childCat ? `<span style="font-size:11px;color:${childCat.color || 'var(--ink-soft)'};">
                <i class="ti ${childCat.icon || 'ti-tag'}" style="font-size:11px;"></i> ${childCat.name}
              </span>` : '—'}
            </td>
            <td>${_statusBadge(child.status || 'new')}</td>
            <td>${_priorityBadge(child.priority || 'normal')}</td>
            <td><span style="font-size:11px;color:var(--ink-faint);">—</span></td>
            <td onclick="event.stopPropagation()">
              <button class="btn btn-ghost" style="padding:4px 8px;font-size:11px;" onclick="window.openReportDetail('${child.id}')">
                <i class="ti ti-eye"></i>
              </button>
            </td>
          `;
          childRow.onclick = () => window.openReportDetail(child.id);
          childGroup.appendChild(childRow);
        });
        tbody.appendChild(childGroup);
      }
    });

    // Sprawy powiązane które nie mają rodzica w widocznych (orphans)
    const visibleParentIds = new Set(parents.map(r => r.id));
    reports.filter(r => r.parentId && !visibleParentIds.has(r.parentId)).forEach(r => {
      const cat = _categories.find(c => c.id === r.categoryId);
      const row = document.createElement('tr');
      row.style.cursor = 'pointer';
      row.innerHTML = `
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="width:20px;display:inline-block;"></span>
            <div>
              <div style="font-family:monospace;font-size:12px;font-weight:700;color:var(--blue);background:var(--blue-bg);padding:4px 8px;border-radius:6px;display:inline-block;">${r.number || '—'}</div>
              <div style="font-size:10px;color:var(--ink-faint);margin-top:2px;"><i class="ti ti-link" style="font-size:10px;"></i> Powiązana z ${r.parentNumber || r.parentId}</div>
            </div>
          </div>
        </td>
        <td class="cell-date">${_fmtDateShort(r.createdAt)}</td>
        <td><div style="font-size:13px;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.description || '—'}</div></td>
        <td>${cat ? `<span style="font-size:12px;color:${cat.color};">${cat.name}</span>` : '—'}</td>
        <td>${_statusBadge(r.status || 'new')}</td>
        <td>${_priorityBadge(r.priority || 'normal')}</td>
        <td>—</td>
        <td onclick="event.stopPropagation()">
          <button class="btn btn-ghost" style="padding:5px 10px;font-size:12px;" onclick="window.openReportDetail('${r.id}')">
            <i class="ti ti-eye"></i>
          </button>
        </td>
      `;
      row.onclick = () => window.openReportDetail(r.id);
      tbody.appendChild(row);
    });
  }

  // Poprawka 3: rozwijanie/zwijanie dzieci
  window.toggleReportChildren = function(parentId) {
    const group = document.getElementById(`children-group-${parentId}`);
    const icon  = document.getElementById(`toggle-icon-${parentId}`);
    if (!group) return;
    const isHidden = group.style.display === 'none';
    group.style.display = isHidden ? '' : 'none';
    if (icon) {
      icon.className = isHidden ? 'ti ti-chevron-down' : 'ti ti-chevron-right';
    }
  };

  // =====================================================
  // MODAL SZCZEGÓŁÓW ZGŁOSZENIA
  // =====================================================

  window.openReportDetail = async function(reportId) {
    _currentReportId = reportId;
    let modal = document.getElementById('report-detail-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'report-detail-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;';
      modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:var(--radius);width:100%;max-width:1100px;max-height:92vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);overflow:hidden;">
        <div style="background:linear-gradient(135deg,var(--forest),var(--forest-2));padding:20px 26px;color:#fff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <div style="font-family:'Fraunces',serif;font-size:19px;font-weight:600;display:flex;align-items:center;gap:10px;">
            <i class="ti ti-clipboard-list" style="opacity:0.8;"></i>
            <span id="report-modal-number">Ładowanie...</span>
          </div>
          <button onclick="document.getElementById('report-detail-modal').style.display='none'" style="background:rgba(255,255,255,0.15);border:none;cursor:pointer;color:#fff;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:17px;"><i class="ti ti-x"></i></button>
        </div>
        <div id="report-modal-body" style="overflow-y:auto;flex:1;padding:24px 26px;background:var(--paper);">
          <div style="text-align:center;padding:40px;color:var(--ink-faint);">
            <i class="ti ti-loader" style="font-size:28px;display:block;margin-bottom:10px;"></i>Ładowanie danych...
          </div>
        </div>
        <div style="padding:14px 26px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;background:#fff;">
          <div id="report-modal-read-status" style="font-size:12px;color:var(--ink-faint);"></div>
          <button class="btn btn-ghost" onclick="document.getElementById('report-detail-modal').style.display='none'">Zamknij</button>
        </div>
      </div>
    `;
    try {
      const snap = await getDoc(doc(db, 'reports', reportId));
      if (!snap.exists()) { toast('Nie znaleziono zgłoszenia.'); return; }
      const r = { id: snap.id, ...snap.data() };
      await _renderReportDetail(r);
    } catch (e) {
      document.getElementById('report-modal-body').innerHTML = `<div style="color:var(--danger);padding:20px;">Błąd: ${e.message}</div>`;
    }
  };

  async function _renderReportDetail(r) {
    const numEl = document.getElementById('report-modal-number');
    if (numEl) numEl.textContent = r.number || 'Zgłoszenie';

    const readEl = document.getElementById('report-modal-read-status');
    if (readEl && r.readAt) {
      readEl.innerHTML = `<i class="ti ti-eye-check" style="color:var(--green);"></i> Odczytano przez mieszkańca: ${_fmtDate(r.readAt)}`;
    }

    const cat = _categories.find(c => c.id === r.categoryId);
    const sla = _slaStatus(r);

    // Historia
    let history = [];
    try {
      const histSnap = await getDocs(query(collection(db, 'reports', r.id, 'history'), orderBy('createdAt', 'asc')));
      histSnap.forEach(d => history.push({ id: d.id, ...d.data() }));
    } catch (e) { console.error('Historia:', e); }

    // Poprawka 4: Pobierz powiązane zgłoszenia (dzieci)
    let linkedChildren = [];
    try {
      const childSnap = await getDocs(query(collection(db, 'reports'), where('parentId', '==', r.id)));
      childSnap.forEach(d => linkedChildren.push({ id: d.id, ...d.data() }));
    } catch (e) { console.error('Dzieci:', e); }

    // Pobierz sprawę główną jeśli to dziecko
    let parentReport = null;
    if (r.parentId) {
      try {
        const pSnap = await getDoc(doc(db, 'reports', r.parentId));
        if (pSnap.exists()) parentReport = { id: pSnap.id, ...pSnap.data() };
      } catch (e) {}
    }

    const body = document.getElementById('report-modal-body');
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 380px;gap:22px;align-items:start;">

        <!-- LEWA -->
        <div>
          <!-- Nagłówek -->
          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:18px;margin-bottom:16px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
              <div style="flex:1;">
                <div style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Opis zgłoszenia</div>
                <div style="font-size:15px;font-weight:500;color:var(--ink);line-height:1.5;">${r.description || '—'}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
                ${_statusBadge(r.status || 'new')}
                ${_priorityBadge(r.priority || 'normal')}
                ${r.archived ? '<span style="font-size:11px;padding:3px 9px;border-radius:99px;background:#f0f0f0;color:#888;"><i class="ti ti-archive" style="font-size:11px;"></i> Archiwalne</span>' : ''}
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
              <div style="background:var(--paper);border-radius:8px;padding:10px 12px;">
                <div style="font-size:10px;color:var(--ink-faint);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Kategoria</div>
                <div style="font-size:13px;font-weight:500;display:flex;align-items:center;gap:6px;">
                  ${cat ? `<i class="ti ${cat.icon}" style="color:${cat.color};font-size:14px;"></i>${cat.name}` : '—'}
                </div>
              </div>
              <div style="background:var(--paper);border-radius:8px;padding:10px 12px;">
                <div style="font-size:10px;color:var(--ink-faint);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Data zgłoszenia</div>
                <div style="font-size:13px;font-weight:500;">${_fmtDate(r.createdAt)}</div>
              </div>
              <div style="background:var(--paper);border-radius:8px;padding:10px 12px;">
                <div style="font-size:10px;color:var(--ink-faint);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Zgłaszający</div>
                <div style="font-size:13px;font-weight:500;">${r.residentName || '—'}</div>
              </div>
              <div style="background:var(--paper);border-radius:8px;padding:10px 12px;">
                <div style="font-size:10px;color:var(--ink-faint);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Adres</div>
                <div style="font-size:13px;font-weight:500;">${r.address || '—'}</div>
              </div>
              ${sla ? `<div style="background:${sla.bg};border-radius:8px;padding:10px 12px;">
                <div style="font-size:10px;color:${sla.color};margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">SLA</div>
                <div style="font-size:13px;font-weight:600;color:${sla.color};">${sla.label}</div>
              </div>` : ''}
              ${r.assignedTo ? `<div style="background:var(--paper);border-radius:8px;padding:10px 12px;">
                <div style="font-size:10px;color:var(--ink-faint);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Przypisano do</div>
                <div style="font-size:13px;font-weight:500;">${r.assignedTo}</div>
              </div>` : ''}
              ${parentReport ? `<div style="background:var(--blue-bg);border-radius:8px;padding:10px 12px;">
                <div style="font-size:10px;color:var(--blue);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Sprawa główna</div>
                <div style="font-size:13px;font-weight:500;color:var(--blue);cursor:pointer;" onclick="window.openReportDetail('${parentReport.id}')">${parentReport.number || parentReport.id}</div>
              </div>` : ''}
            </div>
          </div>

          <!-- Poprawka 4: POWIĄZANE ZGŁOSZENIA -->
          ${linkedChildren.length > 0 ? `
          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:16px;margin-bottom:16px;">
            <div style="font-size:12px;font-weight:600;color:var(--ink-soft);margin-bottom:14px;display:flex;align-items:center;gap:6px;">
              <i class="ti ti-git-branch" style="color:var(--blue);"></i> Powiązane zgłoszenia (${linkedChildren.length})
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${linkedChildren.map(child => {
                const childCfg = STATUS_CONFIG[child.status] || STATUS_CONFIG.new;
                return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);cursor:pointer;"
                  onclick="window.openReportDetail('${child.id}')">
                  <i class="ti ti-corner-down-right" style="font-size:14px;color:var(--ink-faint);flex-shrink:0;"></i>
                  <div style="font-family:monospace;font-size:12px;font-weight:700;color:var(--blue);background:var(--blue-bg);padding:3px 8px;border-radius:5px;flex-shrink:0;">${child.number || '—'}</div>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${child.residentName || '—'}</div>
                    <div style="font-size:11px;color:var(--ink-faint);">${child.address || '—'} · ${_fmtDateShort(child.createdAt)}</div>
                  </div>
                  <div style="flex-shrink:0;">${_statusBadge(child.status || 'new')}</div>
                </div>`;
              }).join('')}
            </div>
          </div>` : ''}

          <!-- Zdjęcia -->
          ${r.photos && r.photos.length ? `
          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:16px;margin-bottom:16px;">
            <div style="font-size:12px;font-weight:600;color:var(--ink-soft);margin-bottom:12px;display:flex;align-items:center;gap:6px;">
              <i class="ti ti-photo"></i> Zdjęcia zgłoszenia (${r.photos.length})
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${r.photos.map(p => `<img src="${p}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--line);cursor:pointer;" onclick="window.open('${p}','_blank')">`).join('')}
            </div>
          </div>` : ''}

          <!-- GPS -->
          ${r.lat && r.lng ? `
          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:16px;margin-bottom:16px;">
            <div style="font-size:12px;font-weight:600;color:var(--ink-soft);margin-bottom:10px;display:flex;align-items:center;gap:6px;">
              <i class="ti ti-map-pin" style="color:var(--danger);"></i> Lokalizacja GPS
            </div>
            <div style="height:120px;border-radius:8px;background:#e8f3ec;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);">
              <div style="text-align:center;color:var(--ink-faint);">
                <div style="font-size:12px;">Lat: ${r.lat.toFixed(6)}, Lng: ${r.lng.toFixed(6)}</div>
                <a href="https://www.google.com/maps?q=${r.lat},${r.lng}" target="_blank" style="font-size:12px;color:var(--blue);margin-top:4px;display:inline-block;">
                  <i class="ti ti-external-link"></i> Otwórz w Google Maps
                </a>
              </div>
            </div>
          </div>` : ''}

          <!-- HISTORIA -->
          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:16px;margin-bottom:16px;">
            <div style="font-size:12px;font-weight:600;color:var(--ink-soft);margin-bottom:16px;display:flex;align-items:center;gap:6px;">
              <i class="ti ti-history"></i> Historia sprawy
            </div>
            <div id="report-history-timeline">${_renderTimeline(history, r)}</div>
          </div>

          <!-- DODAJ WPIS -->
          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:16px;">
            <div style="font-size:12px;font-weight:600;color:var(--ink-soft);margin-bottom:14px;display:flex;align-items:center;gap:6px;">
              <i class="ti ti-message-plus"></i> Dodaj wpis do historii
            </div>
            <div style="margin-bottom:12px;">
              <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                <button class="report-entry-type-btn active" data-type="comment" onclick="window.setReportEntryType(this,'comment')" style="display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:var(--forest);color:#fff;font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;">
                  <i class="ti ti-message"></i> Komentarz
                </button>
                <button class="report-entry-type-btn" data-type="photo" onclick="window.setReportEntryType(this,'photo')" style="display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--ink-soft);font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;">
                  <i class="ti ti-photo"></i> Zdjęcie
                </button>
                <button class="report-entry-type-btn" data-type="pdf" onclick="window.setReportEntryType(this,'pdf')" style="display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--ink-soft);font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;">
                  <i class="ti ti-file-type-pdf"></i> PDF
                </button>
                <button class="report-entry-type-btn" data-type="protocol" onclick="window.setReportEntryType(this,'protocol')" style="display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--ink-soft);font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;">
                  <i class="ti ti-file-certificate"></i> Protokół
                </button>
              </div>
              <textarea id="report-comment-text" placeholder="Wpisz komentarz lub opis..." style="width:100%;min-height:80px;border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-family:inherit;font-size:13px;resize:vertical;outline:none;"></textarea>
              <div id="report-file-wrap" style="display:none;margin-top:8px;">
                <input type="file" id="report-file-input" accept="image/*,.pdf" style="display:none;" onchange="window.handleReportFile(this)">
                <label for="report-file-input" style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1.5px dashed var(--line);border-radius:8px;cursor:pointer;font-size:13px;color:var(--ink-soft);background:#fff;">
                  <i class="ti ti-upload" style="font-size:16px;color:var(--green);"></i> Wybierz plik
                </label>
                <span id="report-file-name" style="font-size:12px;color:var(--ink-faint);margin-left:8px;"></span>
              </div>
            </div>
            <div style="display:flex;justify-content:flex-end;">
              <button class="btn btn-green" onclick="window.addReportEntry('${r.id}')" style="padding:8px 16px;font-size:13px;">
                <i class="ti ti-send"></i> Dodaj wpis
              </button>
            </div>
          </div>
        </div>

        <!-- PRAWA: panel zarządzania -->
        <div style="position:sticky;top:0;">

          <!-- Status -->
          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:16px;margin-bottom:14px;">
            <div style="font-size:12px;font-weight:600;color:var(--ink-soft);margin-bottom:12px;display:flex;align-items:center;gap:6px;">
              <i class="ti ti-circle-dot"></i> Status sprawy
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${Object.entries(STATUS_CONFIG).map(([k, cfg]) => `
                <button onclick="window.changeReportStatus('${r.id}','${k}')"
                  style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;border:1.5px solid ${r.status === k ? cfg.color : 'var(--line)'};background:${r.status === k ? cfg.bg : '#fff'};color:${r.status === k ? cfg.color : 'var(--ink-soft)'};font-family:inherit;font-size:13px;font-weight:${r.status === k ? '600' : '400'};cursor:pointer;transition:all 0.15s;text-align:left;"
                  onmouseover="if('${r.status}' !== '${k}'){this.style.borderColor='${cfg.color}';this.style.background='${cfg.bg}';this.style.color='${cfg.color}';}"
                  onmouseout="if('${r.status}' !== '${k}'){this.style.borderColor='var(--line)';this.style.background='#fff';this.style.color='var(--ink-soft)';}">
                  <i class="ti ${cfg.icon}" style="font-size:15px;"></i>
                  ${cfg.label}
                  ${r.status === k ? '<i class="ti ti-check" style="margin-left:auto;font-size:14px;"></i>' : ''}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Priorytet -->
          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:16px;margin-bottom:14px;">
            <div style="font-size:12px;font-weight:600;color:var(--ink-soft);margin-bottom:12px;display:flex;align-items:center;gap:6px;">
              <i class="ti ti-flag"></i> Priorytet
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              ${Object.entries(PRIORITY_CONFIG).map(([k, cfg]) => `
                <button onclick="window.changeReportPriority('${r.id}','${k}')"
                  style="display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:8px;border:1.5px solid ${r.priority === k ? cfg.color : 'var(--line)'};background:${r.priority === k ? cfg.bg : '#fff'};color:${r.priority === k ? cfg.color : 'var(--ink-soft)'};font-family:inherit;font-size:12px;font-weight:${r.priority === k ? '600' : '400'};cursor:pointer;transition:all 0.15s;"
                  onmouseover="if('${r.priority}' !== '${k}'){this.style.borderColor='${cfg.color}';this.style.background='${cfg.bg}';this.style.color='${cfg.color}';}"
                  onmouseout="if('${r.priority}' !== '${k}'){this.style.borderColor='var(--line)';this.style.background='#fff';this.style.color='var(--ink-soft)';}">
                  <i class="ti ${cfg.icon}" style="font-size:13px;"></i>${cfg.label}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Przypisanie -->
          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:16px;margin-bottom:14px;">
            <div style="font-size:12px;font-weight:600;color:var(--ink-soft);margin-bottom:12px;display:flex;align-items:center;gap:6px;">
              <i class="ti ti-user-check"></i> Przypisanie
            </div>
            <div style="margin-bottom:10px;">
              <label style="font-size:11px;color:var(--ink-faint);display:block;margin-bottom:5px;">Pracownik</label>
              <input id="report-assign-worker" value="${r.assignedTo || ''}" placeholder="Imię i nazwisko pracownika" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-family:inherit;font-size:13px;outline:none;">
            </div>
            <div style="margin-bottom:10px;">
              <label style="font-size:11px;color:var(--ink-faint);display:block;margin-bottom:5px;">Jednostka</label>
              <input id="report-assign-unit" value="${r.assignedUnit || ''}" placeholder="np. Urząd Gminy Głowno" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-family:inherit;font-size:13px;outline:none;">
            </div>
            <button class="btn btn-ghost" onclick="window.saveReportAssignment('${r.id}')" style="width:100%;padding:8px;font-size:13px;">
              <i class="ti ti-device-floppy"></i> Zapisz przypisanie
            </button>
          </div>

          <!-- SLA -->
          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:16px;margin-bottom:14px;">
            <div style="font-size:12px;font-weight:600;color:var(--ink-soft);margin-bottom:12px;display:flex;align-items:center;gap:6px;">
              <i class="ti ti-clock"></i> Termin realizacji (SLA)
            </div>
            <select id="report-sla-select" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-family:inherit;font-size:13px;outline:none;background:#fff;margin-bottom:10px;">
              ${SLA_OPTIONS.map(o => `<option value="${o.value}" ${r.slaDays === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
            <button class="btn btn-ghost" onclick="window.saveReportSLA('${r.id}')" style="width:100%;padding:8px;font-size:13px;">
              <i class="ti ti-device-floppy"></i> Zapisz termin
            </button>
          </div>

          <!-- Poprawka 1+5: Łączenie zgłoszeń z autocomplete -->
          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:16px;margin-bottom:14px;">
            <div style="font-size:12px;font-weight:600;color:var(--ink-soft);margin-bottom:12px;display:flex;align-items:center;gap:6px;">
              <i class="ti ti-git-branch"></i> Połącz ze sprawą główną
            </div>
            ${r.parentId ? `
            <div style="background:var(--blue-bg);border-radius:8px;padding:10px 12px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
              <div>
                <div style="font-size:11px;color:var(--blue);font-weight:600;margin-bottom:2px;">Aktualna sprawa główna:</div>
                <div style="font-family:monospace;font-size:13px;font-weight:700;color:var(--blue);">${r.parentNumber || r.parentId}</div>
              </div>
              <button class="btn btn-ghost" style="padding:5px 10px;font-size:12px;border-color:var(--danger);color:var(--danger);" onclick="window.unlinkReport('${r.id}')">
                <i class="ti ti-unlink"></i> Odłącz
              </button>
            </div>` : ''}
            <div style="position:relative;">
              <input id="report-link-autocomplete" placeholder="Wpisz nr sprawy GG-2026-..." autocomplete="off"
                style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-family:inherit;font-size:13px;outline:none;margin-bottom:6px;"
                oninput="window.reportLinkAutocomplete(this.value,'${r.id}')">
              <div id="report-link-suggestions" style="position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);z-index:100;display:none;max-height:200px;overflow-y:auto;"></div>
            </div>
            <button class="btn btn-ghost" onclick="window.saveReportLink('${r.id}')" style="width:100%;padding:8px;font-size:13px;">
              <i class="ti ti-link"></i> Połącz zgłoszenia
            </button>
          </div>

          <!-- Poprawka 6: Archiwizacja -->
          <div style="background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:16px;margin-bottom:14px;">
            <div style="font-size:12px;font-weight:600;color:var(--ink-soft);margin-bottom:10px;display:flex;align-items:center;gap:6px;">
              <i class="ti ti-archive"></i> Archiwizacja
            </div>
            ${r.archived ? `
            <div style="font-size:12px;color:var(--ink-faint);margin-bottom:10px;">Sprawa jest zarchiwizowana. Dane nie zostały usunięte.</div>
            <button class="btn btn-ghost" onclick="window.archiveReport('${r.id}', false)" style="width:100%;padding:8px;font-size:13px;">
              <i class="ti ti-archive-off"></i> Przywróć z archiwum
            </button>` : `
            <div style="font-size:12px;color:var(--ink-faint);margin-bottom:10px;">Archiwizacja ukrywa sprawę z domyślnego widoku. Dane pozostają w systemie.</div>
            <button class="btn btn-ghost" onclick="window.archiveReport('${r.id}', true)" style="width:100%;padding:8px;font-size:13px;border-color:var(--amber);color:var(--amber);">
              <i class="ti ti-archive"></i> Archiwizuj sprawę
            </button>`}
          </div>

          <!-- Potwierdzenie odczytu -->
          ${r.readAt ? `
          <div style="background:var(--mint);border:1px solid rgba(46,125,50,0.2);border-radius:var(--radius-sm);padding:14px;">
            <div style="font-size:12px;font-weight:600;color:var(--green);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
              <i class="ti ti-eye-check"></i> Potwierdzenie odczytu
            </div>
            <div style="font-size:12px;color:var(--green);">Mieszkaniec potwierdził zapoznanie się ze sprawą</div>
            <div style="font-size:11px;color:var(--green);opacity:0.8;margin-top:4px;">${_fmtDate(r.readAt)}</div>
          </div>` : `
          <div style="background:var(--paper);border:1px dashed var(--line);border-radius:var(--radius-sm);padding:14px;">
            <div style="font-size:12px;color:var(--ink-faint);display:flex;align-items:center;gap:6px;">
              <i class="ti ti-eye-off"></i> Mieszkaniec nie potwierdził odczytu
            </div>
          </div>`}
        </div>
      </div>
    `;

    window._currentEntryType = 'comment';
    window._selectedParentId = null;
    window._selectedParentNumber = null;
  }

  // =====================================================
  // TIMELINE HISTORII
  // =====================================================

  function _renderTimeline(history, r) {
    if (!history.length) {
      return `<div style="color:var(--ink-faint);font-size:13px;text-align:center;padding:16px;">
        <i class="ti ti-history" style="font-size:22px;display:block;margin-bottom:6px;"></i>Brak wpisów w historii
      </div>`;
    }
    const ENTRY_ICONS = {
      created:    { icon: 'ti-plus-circle',     color: 'var(--green)',  bg: 'var(--mint)' },
      status:     { icon: 'ti-circle-dot',       color: 'var(--blue)',   bg: 'var(--blue-bg)' },
      comment:    { icon: 'ti-message',          color: 'var(--forest)', bg: 'var(--mint-2)' },
      photo:      { icon: 'ti-photo',            color: 'var(--blue)',   bg: 'var(--blue-bg)' },
      pdf:        { icon: 'ti-file-type-pdf',    color: 'var(--danger)', bg: 'var(--danger-bg)' },
      protocol:   { icon: 'ti-file-certificate', color: 'var(--amber)',  bg: 'var(--amber-bg)' },
      priority:   { icon: 'ti-flag',             color: 'var(--amber)',  bg: 'var(--amber-bg)' },
      assignment: { icon: 'ti-user-check',       color: 'var(--green)',  bg: 'var(--mint)' },
      sla:        { icon: 'ti-clock',            color: 'var(--blue)',   bg: 'var(--blue-bg)' },
      link:       { icon: 'ti-git-branch',       color: 'var(--blue)',   bg: 'var(--blue-bg)' },
      archive:    { icon: 'ti-archive',          color: '#888',          bg: '#f0f0f0' }
    };
    return history.map((h, idx) => {
      const cfg = ENTRY_ICONS[h.type] || ENTRY_ICONS.comment;
      const isLast = idx === history.length - 1;
      let content = '';
      if (h.type === 'status') {
        const oldCfg = STATUS_CONFIG[h.oldStatus] || {};
        const newCfg = STATUS_CONFIG[h.newStatus] || {};
        content = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:12px;padding:3px 9px;border-radius:99px;background:${oldCfg.bg || '#eee'};color:${oldCfg.color || '#666'};">${oldCfg.label || h.oldStatus}</span>
          <i class="ti ti-arrow-right" style="font-size:13px;color:var(--ink-faint);"></i>
          <span style="font-size:12px;padding:3px 9px;border-radius:99px;background:${newCfg.bg || '#eee'};color:${newCfg.color || '#666'};">${newCfg.label || h.newStatus}</span>
        </div>`;
      } else if (h.type === 'photo' && h.fileUrl) {
        content = `<img src="${h.fileUrl}" style="max-width:200px;max-height:120px;object-fit:cover;border-radius:6px;border:1px solid var(--line);cursor:pointer;margin-top:6px;" onclick="window.open('${h.fileUrl}','_blank')">`;
      } else if ((h.type === 'pdf' || h.type === 'protocol') && h.fileUrl) {
        content = `<a href="${h.fileUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--blue);text-decoration:none;margin-top:4px;">
          <i class="ti ti-external-link"></i> ${h.fileName || 'Otwórz plik'}
        </a>`;
      } else if (h.comment) {
        content = `<div style="font-size:13px;color:var(--ink-soft);line-height:1.5;margin-top:4px;">${h.comment}</div>`;
      }
      return `<div style="display:flex;gap:12px;position:relative;padding-bottom:${isLast ? '0' : '16px'};">
        ${!isLast ? '<div style="position:absolute;left:17px;top:36px;bottom:0;width:2px;background:var(--line);"></div>' : ''}
        <div style="width:36px;height:36px;border-radius:10px;background:${cfg.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;z-index:1;">
          <i class="ti ${cfg.icon}" style="font-size:17px;color:${cfg.color};"></i>
        </div>
        <div style="flex:1;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
            <div style="font-weight:600;font-size:12px;color:var(--forest);">${h.authorName || 'System'}</div>
            <div style="font-size:11px;color:var(--ink-faint);">${_fmtDate(h.createdAt)}</div>
          </div>
          <div style="font-size:12px;color:var(--ink-soft);">${h.label || ''}</div>
          ${content}
        </div>
      </div>`;
    }).join('');
  }

  // =====================================================
  // AKCJE NA ZGŁOSZENIU
  // =====================================================

  window.changeReportStatus = async function(reportId, newStatus) {
    try {
      const snap = await getDoc(doc(db, 'reports', reportId));
      if (!snap.exists()) return;
      const r = snap.data();
      const oldStatus = r.status || 'new';
      if (oldStatus === newStatus) return;

      const adminName = auth.currentUser.displayName || auth.currentUser.email || 'Admin';
      const now = new Date().toISOString();

      await updateDoc(doc(db, 'reports', reportId), { status: newStatus, updatedAt: now, updatedBy: auth.currentUser.uid });

      await addDoc(collection(db, 'reports', reportId, 'history'), {
        type: 'status', label: 'Zmiana statusu', oldStatus, newStatus,
        authorId: auth.currentUser.uid, authorName: adminName, createdAt: now
      });

      await addDoc(collection(db, 'adminActions'), {
        action: 'report_status_change', reportId, reportNumber: r.number,
        oldStatus, newStatus, adminId: auth.currentUser.uid, timestamp: now
      });

      // Poprawka 2: Synchronizacja statusów dzieci
      if (SYNC_STATUSES.includes(newStatus)) {
        await _syncChildrenStatus(reportId, r.number, newStatus, oldStatus, adminName, now);
      }

      toast(`Status zmieniony: ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
      await window.openReportDetail(reportId);
      window.loadReports();
      _loadReportsStats();
    } catch (e) { toast('Błąd: ' + e.message); }
  };

  // Poprawka 2: synchronizacja statusów dzieci
  async function _syncChildrenStatus(parentId, parentNumber, newStatus, oldStatus, adminName, now) {
    try {
      const childSnap = await getDocs(query(collection(db, 'reports'), where('parentId', '==', parentId)));
      const updates = [];
      childSnap.forEach(d => {
        const child = d.data();
        if (child.status !== newStatus) {
          updates.push({ id: d.id, number: child.number, oldStatus: child.status });
        }
      });
      for (const child of updates) {
        await updateDoc(doc(db, 'reports', child.id), {
          status: newStatus, updatedAt: now, updatedBy: 'system_sync'
        });
        // Poprawka 7: wpis do historii dziecka
        await addDoc(collection(db, 'reports', child.id, 'history'), {
          type: 'status',
          label: `Status zsynchronizowany ze sprawą główną ${parentNumber}`,
          oldStatus: child.oldStatus,
          newStatus,
          authorId: 'system',
          authorName: `System (sync z ${parentNumber})`,
          createdAt: now
        });
      }
      if (updates.length > 0) {
        toast(`Zsynchronizowano status ${updates.length} powiązanych zgłoszeń`);
      }
    } catch (e) { console.error('Błąd synchronizacji dzieci:', e); }
  }

  window.changeReportPriority = async function(reportId, newPriority) {
    try {
      const snap = await getDoc(doc(db, 'reports', reportId));
      if (!snap.exists()) return;
      const adminName = auth.currentUser.displayName || auth.currentUser.email || 'Admin';
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'reports', reportId), { priority: newPriority, updatedAt: now, updatedBy: auth.currentUser.uid });
      await addDoc(collection(db, 'reports', reportId, 'history'), {
        type: 'priority', label: `Zmiana priorytetu na: ${PRIORITY_CONFIG[newPriority]?.label || newPriority}`,
        authorId: auth.currentUser.uid, authorName: adminName, createdAt: now
      });
      toast(`Priorytet: ${PRIORITY_CONFIG[newPriority]?.label || newPriority}`);
      await window.openReportDetail(reportId);
      window.loadReports();
    } catch (e) { toast('Błąd: ' + e.message); }
  };

  window.saveReportAssignment = async function(reportId) {
    const worker = document.getElementById('report-assign-worker')?.value.trim() || '';
    const unit   = document.getElementById('report-assign-unit')?.value.trim() || '';
    try {
      const adminName = auth.currentUser.displayName || auth.currentUser.email || 'Admin';
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'reports', reportId), { assignedTo: worker, assignedUnit: unit, updatedAt: now, updatedBy: auth.currentUser.uid });
      await addDoc(collection(db, 'reports', reportId, 'history'), {
        type: 'assignment', label: `Przypisano do: ${worker || '—'}${unit ? ` (${unit})` : ''}`,
        authorId: auth.currentUser.uid, authorName: adminName, createdAt: now
      });
      toast('Przypisanie zapisane');
      window.loadReports();
    } catch (e) { toast('Błąd: ' + e.message); }
  };

  window.saveReportSLA = async function(reportId) {
    const slaDays = parseInt(document.getElementById('report-sla-select')?.value || '0');
    try {
      const adminName = auth.currentUser.displayName || auth.currentUser.email || 'Admin';
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'reports', reportId), { slaDays, updatedAt: now, updatedBy: auth.currentUser.uid });
      await addDoc(collection(db, 'reports', reportId, 'history'), {
        type: 'sla', label: `Ustawiono termin SLA: ${SLA_OPTIONS.find(o => o.value === slaDays)?.label || slaDays + ' dni'}`,
        authorId: auth.currentUser.uid, authorName: adminName, createdAt: now
      });
      toast('Termin SLA zapisany');
      window.loadReports();
    } catch (e) { toast('Błąd: ' + e.message); }
  };

  // =====================================================
  // POPRAWKA 1+5+7: ŁĄCZENIE SPRAW — parent-child z autocomplete
  // =====================================================

  // Autocomplete przy wpisywaniu numeru sprawy
  window.reportLinkAutocomplete = function(value, currentReportId) {
    const suggestionsEl = document.getElementById('report-link-suggestions');
    if (!suggestionsEl) return;
    const q = value.trim().toLowerCase();
    if (q.length < 3) { suggestionsEl.style.display = 'none'; return; }

    const matches = _allReports.filter(r =>
      r.id !== currentReportId &&
      !r.parentId && // tylko sprawy główne mogą być rodzicem
      (r.number || '').toLowerCase().includes(q)
    ).slice(0, 8);

    if (!matches.length) { suggestionsEl.style.display = 'none'; return; }

    suggestionsEl.style.display = 'block';
    suggestionsEl.innerHTML = matches.map(r => {
      const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.new;
      return `<div onclick="window.selectReportLink('${r.id}','${r.number}')"
        style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--line-soft);display:flex;align-items:center;gap:10px;"
        onmouseover="this.style.background='var(--paper)'" onmouseout="this.style.background='#fff'">
        <div style="font-family:monospace;font-size:12px;font-weight:700;color:var(--forest);background:var(--mint-2);padding:3px 7px;border-radius:5px;flex-shrink:0;">${r.number}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.description || '—'}</div>
          <div style="font-size:11px;color:var(--ink-faint);">${r.residentName || ''}</div>
        </div>
        <span style="font-size:11px;padding:2px 7px;border-radius:99px;background:${cfg.bg};color:${cfg.color};flex-shrink:0;">${cfg.label}</span>
      </div>`;
    }).join('');
  };

  window.selectReportLink = function(parentId, parentNumber) {
    window._selectedParentId = parentId;
    window._selectedParentNumber = parentNumber;
    const input = document.getElementById('report-link-autocomplete');
    if (input) input.value = parentNumber;
    const suggestionsEl = document.getElementById('report-link-suggestions');
    if (suggestionsEl) suggestionsEl.style.display = 'none';
  };

  window.saveReportLink = async function(reportId) {
    const parentId     = window._selectedParentId;
    const parentNumber = window._selectedParentNumber || document.getElementById('report-link-autocomplete')?.value.trim();

    if (!parentId && !parentNumber) {
      toast('Wybierz sprawę z listy podpowiedzi');
      return;
    }

    try {
      const adminName = auth.currentUser.displayName || auth.currentUser.email || 'Admin';
      const now = new Date().toISOString();

      // Pobierz aktualną sprawę
      const snap = await getDoc(doc(db, 'reports', reportId));
      if (!snap.exists()) return;
      const r = snap.data();

      // Znajdź parentId jeśli podano tylko numer
      let resolvedParentId = parentId;
      let resolvedParentNumber = parentNumber;
      if (!resolvedParentId && parentNumber) {
        const found = _allReports.find(x => x.number === parentNumber);
        if (!found) { toast('Nie znaleziono sprawy o podanym numerze'); return; }
        resolvedParentId = found.id;
        resolvedParentNumber = found.number;
      }

      // Nie można połączyć sprawy z samą sobą
      if (resolvedParentId === reportId) { toast('Nie można połączyć sprawy z samą sobą'); return; }

      // Aktualizuj dziecko: ustaw parentId i parentNumber
      await updateDoc(doc(db, 'reports', reportId), {
        parentId: resolvedParentId,
        parentNumber: resolvedParentNumber,
        updatedAt: now,
        updatedBy: auth.currentUser.uid
      });

      // Poprawka 7: wpis do historii dziecka
      await addDoc(collection(db, 'reports', reportId, 'history'), {
        type: 'link',
        label: `Połączono ze sprawą główną ${resolvedParentNumber}`,
        authorId: auth.currentUser.uid,
        authorName: adminName,
        createdAt: now
      });

      // Poprawka 7: wpis do historii rodzica
      await addDoc(collection(db, 'reports', resolvedParentId, 'history'), {
        type: 'link',
        label: `Dołączono zgłoszenie ${r.number || reportId} jako powiązane`,
        authorId: auth.currentUser.uid,
        authorName: adminName,
        createdAt: now
      });

      window._selectedParentId = null;
      window._selectedParentNumber = null;

      toast(`✓ Połączono ${r.number || reportId} ze sprawą ${resolvedParentNumber}`);
      await window.openReportDetail(reportId);
      window.loadReports();
    } catch (e) { toast('Błąd: ' + e.message); }
  };

  // Odłączanie sprawy od rodzica
  window.unlinkReport = async function(reportId) {
    if (!confirm('Czy na pewno chcesz odłączyć tę sprawę od sprawy głównej?')) return;
    try {
      const snap = await getDoc(doc(db, 'reports', reportId));
      if (!snap.exists()) return;
      const r = snap.data();
      const adminName = auth.currentUser.displayName || auth.currentUser.email || 'Admin';
      const now = new Date().toISOString();
      const oldParentNumber = r.parentNumber || r.parentId;

      await updateDoc(doc(db, 'reports', reportId), {
        parentId: null, parentNumber: null, updatedAt: now, updatedBy: auth.currentUser.uid
      });

      await addDoc(collection(db, 'reports', reportId, 'history'), {
        type: 'link',
        label: `Odłączono od sprawy głównej ${oldParentNumber}`,
        authorId: auth.currentUser.uid, authorName: adminName, createdAt: now
      });

      toast('Sprawa odłączona od sprawy głównej');
      await window.openReportDetail(reportId);
      window.loadReports();
    } catch (e) { toast('Błąd: ' + e.message); }
  };

  // =====================================================
  // POPRAWKA 6: ARCHIWIZACJA
  // =====================================================

  window.archiveReport = async function(reportId, archive) {
    const msg = archive
      ? 'Czy na pewno chcesz zarchiwizować tę sprawę? Dane nie zostaną usunięte.'
      : 'Czy chcesz przywrócić sprawę z archiwum?';
    if (!confirm(msg)) return;
    try {
      const adminName = auth.currentUser.displayName || auth.currentUser.email || 'Admin';
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'reports', reportId), {
        archived: archive, updatedAt: now, updatedBy: auth.currentUser.uid
      });
      await addDoc(collection(db, 'reports', reportId, 'history'), {
        type: 'archive',
        label: archive ? 'Sprawa zarchiwizowana' : 'Sprawa przywrócona z archiwum',
        authorId: auth.currentUser.uid, authorName: adminName, createdAt: now
      });
      toast(archive ? 'Sprawa zarchiwizowana' : 'Sprawa przywrócona z archiwum');
      document.getElementById('report-detail-modal').style.display = 'none';
      window.loadReports();
      _loadReportsStats();
    } catch (e) { toast('Błąd: ' + e.message); }
  };

  // =====================================================
  // WPISY DO HISTORII
  // =====================================================

  window._currentEntryType = 'comment';
  window._currentEntryFile = null;

  window.setReportEntryType = function(btn, type) {
    window._currentEntryType = type;
    document.querySelectorAll('.report-entry-type-btn').forEach(b => {
      b.style.background = '#fff'; b.style.color = 'var(--ink-soft)'; b.style.borderColor = 'var(--line)';
    });
    btn.style.background = 'var(--forest)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--forest)';
    const fileWrap = document.getElementById('report-file-wrap');
    if (fileWrap) fileWrap.style.display = (type !== 'comment') ? 'block' : 'none';
  };

  window.handleReportFile = function(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast('Plik za duży (max 10 MB)'); input.value = ''; return; }
    window._currentEntryFile = file;
    const nameEl = document.getElementById('report-file-name');
    if (nameEl) nameEl.textContent = file.name;
  };

  window.addReportEntry = async function(reportId) {
    const comment = document.getElementById('report-comment-text')?.value.trim() || '';
    const type = window._currentEntryType || 'comment';
    const file = window._currentEntryFile;
    if (!comment && !file) { toast('Wpisz komentarz lub wybierz plik'); return; }
    try {
      const adminName = auth.currentUser.displayName || auth.currentUser.email || 'Admin';
      const now = new Date().toISOString();
      const entryData = {
        type, comment, authorId: auth.currentUser.uid, authorName: adminName, createdAt: now,
        label: type === 'comment' ? 'Komentarz' : type === 'photo' ? 'Dodano zdjęcie' : type === 'pdf' ? 'Dodano dokument PDF' : 'Dodano protokół'
      };
      if (file) {
        entryData.fileName = file.name; entryData.fileType = file.type; entryData.fileSize = file.size;
        if (file.type.startsWith('image/') && file.size <= 500 * 1024) {
          entryData.fileUrl = await _fileToBase64(file);
        }
      }
      await addDoc(collection(db, 'reports', reportId, 'history'), entryData);
      await updateDoc(doc(db, 'reports', reportId), { updatedAt: now, updatedBy: auth.currentUser.uid });
      const textEl = document.getElementById('report-comment-text');
      if (textEl) textEl.value = '';
      window._currentEntryFile = null;
      const fi = document.getElementById('report-file-input'); if (fi) fi.value = '';
      const fn = document.getElementById('report-file-name'); if (fn) fn.textContent = '';
      toast('Wpis dodany do historii');
      await window.openReportDetail(reportId);
    } catch (e) { toast('Błąd: ' + e.message); }
  };

  function _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // =====================================================
  // NOWE ZGŁOSZENIE (przez urząd)
  // =====================================================

  window.openNewReportModal = function() {
    let modal = document.getElementById('new-report-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'new-report-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;';
      modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:var(--radius);width:100%;max-width:600px;max-height:90vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);overflow:hidden;">
        <div style="background:linear-gradient(135deg,var(--forest),var(--forest-2));padding:20px 24px;color:#fff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <div style="font-family:'Fraunces',serif;font-size:18px;font-weight:600;"><i class="ti ti-plus" style="margin-right:8px;opacity:0.8;"></i>Nowe zgłoszenie</div>
          <button onclick="document.getElementById('new-report-modal').style.display='none'" style="background:rgba(255,255,255,0.15);border:none;cursor:pointer;color:#fff;width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:16px;"><i class="ti ti-x"></i></button>
        </div>
        <div style="overflow-y:auto;flex:1;padding:22px 24px;">
          <div style="margin-bottom:14px;">
            <label style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:5px;">Kategoria *</label>
            <select id="new-report-category" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 12px;font-family:inherit;font-size:14px;outline:none;background:#fff;">
              <option value="">— Wybierz kategorię —</option>
              ${_categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:14px;">
            <label style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:5px;">Opis zgłoszenia *</label>
            <textarea id="new-report-desc" placeholder="Opisz problem..." style="width:100%;min-height:100px;border:1px solid var(--line);border-radius:8px;padding:9px 12px;font-family:inherit;font-size:14px;resize:vertical;outline:none;"></textarea>
          </div>
          <div style="margin-bottom:14px;">
            <label style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:5px;">Adres / lokalizacja</label>
            <input id="new-report-address" placeholder="np. ul. Główna 5, Głowno" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 12px;font-family:inherit;font-size:14px;outline:none;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
            <div>
              <label style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:5px;">Priorytet</label>
              <select id="new-report-priority" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 12px;font-family:inherit;font-size:14px;outline:none;background:#fff;">
                ${Object.entries(PRIORITY_CONFIG).map(([k,v]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${v.label}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:5px;">Termin SLA</label>
              <select id="new-report-sla" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 12px;font-family:inherit;font-size:14px;outline:none;background:#fff;">
                ${SLA_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="margin-bottom:14px;">
            <label style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:5px;">Zgłaszający (opcjonalnie)</label>
            <input id="new-report-resident" placeholder="Imię i nazwisko mieszkańca" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 12px;font-family:inherit;font-size:14px;outline:none;">
          </div>
          <div id="new-report-error" style="display:none;color:var(--danger);font-size:13px;padding:10px;background:var(--danger-bg);border-radius:8px;margin-bottom:12px;"></div>
        </div>
        <div style="padding:14px 24px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end;flex-shrink:0;background:#fff;">
          <button class="btn btn-ghost" onclick="document.getElementById('new-report-modal').style.display='none'">Anuluj</button>
          <button class="btn btn-green" onclick="window.createNewReport()" style="padding:10px 20px;">
            <i class="ti ti-plus"></i> Utwórz zgłoszenie
          </button>
        </div>
      </div>
    `;
  };

  window.createNewReport = async function() {
    const categoryId   = document.getElementById('new-report-category')?.value || '';
    const description  = document.getElementById('new-report-desc')?.value.trim() || '';
    const address      = document.getElementById('new-report-address')?.value.trim() || '';
    const priority     = document.getElementById('new-report-priority')?.value || 'normal';
    const slaDays      = parseInt(document.getElementById('new-report-sla')?.value || '0');
    const residentName = document.getElementById('new-report-resident')?.value.trim() || '';
    const errEl        = document.getElementById('new-report-error');
    if (errEl) errEl.style.display = 'none';
    if (!categoryId) { if (errEl) { errEl.textContent = 'Wybierz kategorię.'; errEl.style.display = 'block'; } return; }
    if (!description) { if (errEl) { errEl.textContent = 'Opis jest wymagany.'; errEl.style.display = 'block'; } return; }
    try {
      const adminName = auth.currentUser.displayName || auth.currentUser.email || 'Admin';
      const now = new Date().toISOString();
      const number = await _generateReportNumber();
      const cat = _categories.find(c => c.id === categoryId);
      const reportRef = await addDoc(collection(db, 'reports'), {
        number, categoryId, categoryName: cat?.name || '', description, address,
        priority, slaDays, residentName, status: 'new', archived: false,
        createdAt: now, createdBy: auth.currentUser.uid, createdByName: adminName,
        updatedAt: now, source: 'admin'
      });
      await addDoc(collection(db, 'reports', reportRef.id, 'history'), {
        type: 'created', label: 'Zgłoszenie utworzone przez urząd',
        authorId: auth.currentUser.uid, authorName: adminName, createdAt: now
      });
      await addDoc(collection(db, 'adminActions'), {
        action: 'report_created', reportId: reportRef.id, reportNumber: number,
        adminId: auth.currentUser.uid, timestamp: now
      });
      document.getElementById('new-report-modal').style.display = 'none';
      toast(`✓ Zgłoszenie ${number} utworzone`);
      window.loadReports();
      _loadReportsStats();
    } catch (e) {
      const errEl = document.getElementById('new-report-error');
      if (errEl) { errEl.textContent = 'Błąd: ' + e.message; errEl.style.display = 'block'; }
    }
  };

  // =====================================================
  // MAPA ZGŁOSZEŃ
  // =====================================================

  window.openReportsMap = function() {
    let modal = document.getElementById('reports-map-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'reports-map-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;';
      modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:var(--radius);width:100%;max-width:1100px;max-height:92vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);overflow:hidden;">
        <div style="background:linear-gradient(135deg,var(--forest),var(--forest-2));padding:18px 24px;color:#fff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <div style="font-family:'Fraunces',serif;font-size:18px;font-weight:600;"><i class="ti ti-map-2" style="margin-right:8px;opacity:0.8;"></i>Mapa zgłoszeń</div>
          <button onclick="document.getElementById('reports-map-modal').style.display='none'" style="background:rgba(255,255,255,0.15);border:none;cursor:pointer;color:#fff;width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:16px;"><i class="ti ti-x"></i></button>
        </div>
        <div style="padding:12px 20px;border-bottom:1px solid var(--line);display:flex;gap:12px;flex-wrap:wrap;background:#fff;flex-shrink:0;">
          ${Object.entries(STATUS_CONFIG).map(([k,v]) => `
            <div style="display:flex;align-items:center;gap:5px;font-size:12px;color:${v.color};">
              <div style="width:12px;height:12px;border-radius:50%;background:${v.color};"></div>${v.label}
            </div>`).join('')}
        </div>
        <div style="flex:1;min-height:500px;background:#e8f3ec;display:flex;align-items:center;justify-content:center;padding:20px;">
          <div style="text-align:center;color:var(--ink-faint);">
            <i class="ti ti-map-2" style="font-size:48px;display:block;margin-bottom:12px;color:var(--green);"></i>
            <div style="font-size:15px;font-weight:500;margin-bottom:8px;">Mapa zgłoszeń</div>
            <div style="font-size:13px;max-width:400px;line-height:1.5;margin-bottom:16px;">
              Mapa wymaga integracji z Leaflet.js lub Google Maps API.<br>
              Zgłoszenia z lokalizacją GPS będą wyświetlane jako kolorowe pinezki wg statusu.
            </div>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
              ${_allReports.filter(r => r.lat && r.lng && !r.archived).map(r => {
                const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.new;
                return `<button onclick="document.getElementById('reports-map-modal').style.display='none';window.openReportDetail('${r.id}')"
                  style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;border:1px solid ${cfg.color};background:${cfg.bg};color:${cfg.color};font-family:inherit;font-size:12px;cursor:pointer;">
                  <i class="ti ti-map-pin"></i>${r.number || r.id.slice(0,8)}
                </button>`;
              }).join('') || '<div style="font-size:13px;color:var(--ink-faint);">Brak zgłoszeń z lokalizacją GPS</div>'}
            </div>
          </div>
        </div>
      </div>
    `;
  };

  // =====================================================
  // ZARZĄDZANIE KATEGORIAMI (Ustawienia)
  // =====================================================

  window.loadReportCategoriesSettings = async function() {
    const wrap = document.getElementById('report-categories-settings-wrap');
    if (!wrap) return;
    wrap.innerHTML = `<div style="text-align:center;padding:20px;color:var(--ink-faint);"><i class="ti ti-loader" style="font-size:22px;"></i></div>`;
    try {
      await _loadCategories();
      wrap.innerHTML = `
        <div style="margin-bottom:14px;display:flex;justify-content:flex-end;">
          <button class="btn btn-green" style="padding:8px 16px;font-size:13px;" onclick="window.openAddCategoryModal()">
            <i class="ti ti-plus"></i> Dodaj kategorię
          </button>
        </div>
        <div id="categories-list">
          ${_categories.map((c, idx) => `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;background:#fff;opacity:${c.active === false ? '0.55' : '1'};">
              <div style="width:36px;height:36px;border-radius:9px;background:${c.color || 'var(--mint)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;opacity:0.2;position:relative;">
                <i class="ti ${c.icon || 'ti-tag'}" style="font-size:18px;color:${c.color || 'var(--green)'};position:absolute;opacity:1;"></i>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:14px;">${c.name} ${c.active === false ? '<span style="font-size:11px;color:var(--ink-faint);font-weight:400;">(nieaktywna)</span>' : ''}</div>
                <div style="font-size:12px;color:var(--ink-faint);margin-top:2px;">Kolejność: ${c.order || idx + 1}</div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="window.moveCategoryOrder('${c.id}','up')" title="W górę"><i class="ti ti-arrow-up"></i></button>
                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="window.moveCategoryOrder('${c.id}','down')" title="W dół"><i class="ti ti-arrow-down"></i></button>
                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;" onclick="window.openEditCategoryModal('${c.id}')"><i class="ti ti-pencil"></i> Edytuj</button>
                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;border-color:var(--danger);color:var(--danger);" onclick="window.deleteCategory('${c.id}','${c.name.replace(/'/g,"\\'")}')"><i class="ti ti-trash"></i></button>
              </div>
            </div>`).join('')}
        </div>
      `;
    } catch (e) {
      wrap.innerHTML = `<div style="color:var(--danger);padding:14px;">Błąd: ${e.message}</div>`;
    }
  };

  function _openCategoryModal(cat = null) {
    const isEdit = !!cat;
    const ICON_LIST = ['ti-road','ti-bulb','ti-tree','ti-trash','ti-droplet','ti-shield','ti-volume','ti-dots-circle-horizontal','ti-home','ti-car','ti-building','ti-leaf','ti-flame','ti-alert-triangle','ti-tool','ti-fence'];
    let modal = document.getElementById('category-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'category-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:20px;';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:var(--radius);width:100%;max-width:480px;box-shadow:var(--shadow-lg);overflow:hidden;">
        <div style="background:linear-gradient(135deg,var(--forest),var(--forest-2));padding:18px 22px;color:#fff;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-family:'Fraunces',serif;font-size:17px;font-weight:600;">${isEdit ? 'Edytuj kategorię' : 'Nowa kategoria'}</div>
          <button onclick="document.getElementById('category-modal').style.display='none'" style="background:rgba(255,255,255,0.15);border:none;cursor:pointer;color:#fff;width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:15px;"><i class="ti ti-x"></i></button>
        </div>
        <div style="padding:20px 22px;">
          <div style="margin-bottom:14px;">
            <label style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:5px;">Nazwa kategorii *</label>
            <input id="cat-name" value="${cat ? cat.name : ''}" placeholder="np. Drogi i chodniki" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 12px;font-family:inherit;font-size:14px;outline:none;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
            <div>
              <label style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:5px;">Ikona</label>
              <select id="cat-icon" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 12px;font-family:inherit;font-size:14px;outline:none;background:#fff;">
                ${ICON_LIST.map(i => `<option value="${i}" ${cat && cat.icon === i ? 'selected' : ''}>${i.replace('ti-','')}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:5px;">Kolor</label>
              <input id="cat-color" type="color" value="${cat ? (cat.color || '#2e7d32') : '#2e7d32'}" style="width:100%;height:42px;border:1px solid var(--line);border-radius:8px;padding:4px;cursor:pointer;outline:none;">
            </div>
          </div>
          <div id="cat-modal-error" style="display:none;color:var(--danger);font-size:13px;padding:10px;background:var(--danger-bg);border-radius:8px;margin-bottom:12px;"></div>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button class="btn btn-ghost" onclick="document.getElementById('category-modal').style.display='none'">Anuluj</button>
            <button class="btn btn-green" onclick="window.saveCategory('${isEdit ? cat.id : ''}')">
              <i class="ti ti-device-floppy"></i> ${isEdit ? 'Zapisz' : 'Dodaj'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  window.openAddCategoryModal = function() { _openCategoryModal(null); };
  window.openEditCategoryModal = function(id) { const cat = _categories.find(c => c.id === id); if (cat) _openCategoryModal(cat); };

  window.saveCategory = async function(id) {
    const name  = document.getElementById('cat-name')?.value.trim() || '';
    const icon  = document.getElementById('cat-icon')?.value || 'ti-tag';
    const color = document.getElementById('cat-color')?.value || '#2e7d32';
    const errEl = document.getElementById('cat-modal-error');
    if (errEl) errEl.style.display = 'none';
    if (!name) { if (errEl) { errEl.textContent = 'Nazwa jest wymagana.'; errEl.style.display = 'block'; } return; }
    try {
      const now = new Date().toISOString();
      if (id) {
        await updateDoc(doc(db, 'reportCategories', id), { name, icon, color, updatedAt: now, updatedBy: auth.currentUser.uid });
        toast('✓ Kategoria zaktualizowana');
      } else {
        const maxOrder = _categories.reduce((m, c) => Math.max(m, c.order || 0), 0);
        await addDoc(collection(db, 'reportCategories'), { name, icon, color, order: maxOrder + 1, active: true, createdAt: now, createdBy: auth.currentUser.uid });
        toast('✓ Kategoria dodana');
      }
      document.getElementById('category-modal').style.display = 'none';
      window.loadReportCategoriesSettings();
      await _loadCategories();
    } catch (e) {
      if (errEl) { errEl.textContent = 'Błąd: ' + e.message; errEl.style.display = 'block'; }
    }
  };

  window.deleteCategory = async function(id, name) {
    if (!confirm(`Czy na pewno chcesz usunąć kategorię "${name}"?`)) return;
    try {
      const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      await deleteDoc(doc(db, 'reportCategories', id));
      toast('Kategoria usunięta');
      window.loadReportCategoriesSettings();
      await _loadCategories();
    } catch (e) { toast('Błąd: ' + e.message); }
  };

  window.moveCategoryOrder = async function(id, direction) {
    const idx = _categories.findIndex(c => c.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= _categories.length) return;
    try {
      const a = _categories[idx], b = _categories[swapIdx];
      await updateDoc(doc(db, 'reportCategories', a.id), { order: b.order || swapIdx + 1 });
      await updateDoc(doc(db, 'reportCategories', b.id), { order: a.order || idx + 1 });
      toast('Kolejność zmieniona');
      window.loadReportCategoriesSettings();
      await _loadCategories();
    } catch (e) { toast('Błąd: ' + e.message); }
  };

  // =====================================================
  // INICJALIZACJA
  // =====================================================

  async function _init() {
    await _loadCategories();
    _renderReportsPage();
  }

  window.initReportsModule = _init;
  window.reloadReportCategories = _loadCategories;
}
