'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let allFiles = [];
const selectedFiles = new Set();

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('applyFilter').addEventListener('click', loadFiles);
  document.getElementById('clearFilter').addEventListener('click', clearFilter);
  document.getElementById('selectAll').addEventListener('click', selectAll);
  document.getElementById('deselectAll').addEventListener('click', deselectAll);
  document.getElementById('downloadBtn').addEventListener('click', downloadSelected);
  document.getElementById('headerCheckbox').addEventListener('change', toggleAll);

  loadFiles();
  pollStatus();
  setInterval(pollStatus, 5000);
});

// ── API calls ──────────────────────────────────────────────────────────────
async function loadFiles() {
  const start = document.getElementById('startTime').value;
  const end = document.getElementById('endTime').value;

  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);

  try {
    const url = '/api/files' + (params.toString() ? '?' + params : '');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allFiles = await res.json();
    renderFileList();
  } catch (err) {
    console.error('Failed to load files:', err);
  }
}

async function pollStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    const status = await res.json();
    updateStatusBadge(status.connected, status.linesReceived);
  } catch {
    updateStatusBadge(false, null);
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderFileList() {
  const tbody = document.getElementById('fileTableBody');
  const emptyState = document.getElementById('emptyState');
  const fileCount = document.getElementById('fileCount');

  fileCount.textContent = allFiles.length;
  tbody.innerHTML = '';

  if (allFiles.length === 0) {
    emptyState.classList.remove('hidden');
    updateDownloadButton();
    syncHeaderCheckbox();
    return;
  }

  emptyState.classList.add('hidden');

  for (const file of allFiles) {
    const isSelected = selectedFiles.has(file.name);
    const tr = document.createElement('tr');
    if (isSelected) tr.classList.add('selected');

    tr.innerHTML = `
      <td><input type="checkbox" class="file-checkbox" data-name="${esc(file.name)}" ${isSelected ? 'checked' : ''}></td>
      <td class="col-name">${esc(file.name)}</td>
      <td><span class="badge ${file.type === 'compressed' ? 'compressed' : 'active'}">${file.type === 'compressed' ? 'Compressed' : 'Raw'}</span></td>
      <td class="col-size" style="text-align:right">${formatSize(file.size)}</td>
      <td>${formatDate(file.timestamp)}</td>
      <td><span class="badge ${file.isCurrent ? 'active' : 'archived'}">${file.isCurrent ? 'Active' : 'Archived'}</span></td>
    `;

    tr.querySelector('.file-checkbox').addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedFiles.add(file.name);
        tr.classList.add('selected');
      } else {
        selectedFiles.delete(file.name);
        tr.classList.remove('selected');
      }
      updateDownloadButton();
      syncHeaderCheckbox();
    });

    tbody.appendChild(tr);
  }

  updateDownloadButton();
  syncHeaderCheckbox();
}

// ── Selection helpers ──────────────────────────────────────────────────────
function selectAll() {
  for (const file of allFiles) selectedFiles.add(file.name);
  renderFileList();
}

function deselectAll() {
  selectedFiles.clear();
  renderFileList();
}

function toggleAll(e) {
  if (e.target.checked) {
    selectAll();
  } else {
    deselectAll();
  }
}

function syncHeaderCheckbox() {
  const cb = document.getElementById('headerCheckbox');
  if (allFiles.length === 0) {
    cb.indeterminate = false;
    cb.checked = false;
  } else if (selectedFiles.size === allFiles.length) {
    cb.indeterminate = false;
    cb.checked = true;
  } else if (selectedFiles.size === 0) {
    cb.indeterminate = false;
    cb.checked = false;
  } else {
    cb.indeterminate = true;
  }
}

function updateDownloadButton() {
  const btn = document.getElementById('downloadBtn');
  const count = selectedFiles.size;
  btn.disabled = count === 0;
  btn.textContent = count > 0 ? `Download Selected (${count})` : 'Download Selected';
}

// ── Download ───────────────────────────────────────────────────────────────
function downloadSelected() {
  if (selectedFiles.size === 0) return;

  const params = new URLSearchParams();
  for (const name of selectedFiles) {
    params.append('files', name);
  }

  const link = document.createElement('a');
  link.href = `/api/download?${params}`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Filter helpers ─────────────────────────────────────────────────────────
function clearFilter() {
  document.getElementById('startTime').value = '';
  document.getElementById('endTime').value = '';
  loadFiles();
}

// ── Status badge ───────────────────────────────────────────────────────────
function updateStatusBadge(connected, linesReceived) {
  const badge = document.getElementById('statusBadge');
  const text = document.getElementById('statusText');

  badge.className = 'status-badge ' + (connected ? 'connected' : 'disconnected');
  const linesInfo = linesReceived !== null ? ` · ${linesReceived.toLocaleString()} lines` : '';
  text.textContent = connected ? `Connected${linesInfo}` : 'Disconnected';
}

// ── Formatting ─────────────────────────────────────────────────────────────
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
