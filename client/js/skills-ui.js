// ============================================================
// REM System v0.6.0 — Skills & Sleep Cycle UI
// ============================================================

// ── Skills state ──
let currentSkillDetail = null;
let currentWorkspacePath = '';

// ============================================================
// SKILLS LIST
// ============================================================

async function loadSkillsList() {
  const container = document.getElementById('skillsList');
  try {
    const res = await fetch('/api/skills');
    if (!res.ok) throw new Error('Failed to load skills');
    const data = await res.json();
    const skills = data.skills || data || [];
    const entityId = data.entityId || null;
    const pendingCount = data.pendingCount || 0;

    // Show entity context header
    const header = document.getElementById('skillsEntityHeader');
    if (header) {
      header.textContent = entityId ? `Skills for: ${entityId}` : 'No entity loaded';
      header.style.color = entityId ? 'var(--ac)' : 'var(--td)';
    }

    if (!entityId) {
      container.innerHTML = '<div style="color:var(--td);text-align:center;padding:2rem">Load an entity to manage its skills.</div>';
      document.getElementById('pendingSkillsContainer').innerHTML = '';
      const qc = document.getElementById('quarantineContainer');
      if (qc) qc.innerHTML = '';
      return;
    }

    // Load pending proposals and quarantined skills
    await loadPendingSkills();
    await loadQuarantineList();

    if (!skills.length) {
      container.innerHTML = '<div style="color:var(--td);text-align:center;padding:2rem">No skills found. Create one or install from ClawHub.</div>';
      return;
    }

    container.innerHTML = skills.map(s => {
      const toolCount = (s.tools && s.tools.length) || 0;
      const toolBadge = toolCount > 0 ? `<span style="font-size:.6rem;padding:.15rem .4rem;border-radius:4px;background:rgba(96,165,250,.15);color:var(--ac);margin-left:.5rem">${toolCount} tool${toolCount > 1 ? 's' : ''}</span>` : '';
      const versionBadge = s.version ? `<span style="font-size:.6rem;color:var(--td);margin-left:.5rem">v${escapeHtml(s.version)}</span>` : '';
      const originBadge = s.clawhubOrigin ? `<span style="font-size:.55rem;padding:.1rem .35rem;border-radius:3px;background:rgba(251,191,36,.15);color:#fbbf24;margin-left:.5rem">ClawHub</span>` : '';
      const trigger = s.trigger || s.name;
      const triggerBadge = `<span style="font-size:.6rem;padding:.15rem .4rem;border-radius:4px;background:rgba(52,211,153,.1);color:var(--em);margin-left:.5rem;font-family:var(--font-mono,monospace)">/skill ${escapeHtml(trigger)}</span>`;
      return `
      <div class="skill-card" onclick="openSkillDetail('${escapeHtmlAttr(s.name)}')" style="background:var(--sf2);border:1px solid var(--bd);border-radius:10px;padding:1rem;cursor:pointer;transition:.15s ease;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:600;font-size:.9rem;margin-bottom:.25rem">${escapeHtml(s.name)}${versionBadge}${toolBadge}${originBadge}</div>
          <div style="font-size:.75rem;color:var(--td);margin-bottom:.2rem">${escapeHtml(s.description || 'No description')}</div>
          <div>${triggerBadge}</div>
        </div>
        <div style="display:flex;align-items:center;gap:.75rem">
          <div style="font-size:.65rem;padding:.25rem .6rem;border-radius:6px;background:${s.enabled ? 'rgba(52,211,153,.15)' : 'rgba(71,85,105,.2)'};color:${s.enabled ? 'var(--em)' : 'var(--td)'}">${s.enabled ? 'Enabled' : 'Disabled'}</div>
          <button class="btn ${s.enabled ? 'bg' : 'bp'}" style="font-size:.6rem;padding:.25rem .6rem" onclick="event.stopPropagation();toggleSkill('${escapeHtmlAttr(s.name)}',${!s.enabled})">${s.enabled ? 'Disable' : 'Enable'}</button>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="color:var(--dn);text-align:center;padding:1rem">Error: ${escapeHtml(err.message)}</div>`;
  }
}

async function toggleSkill(name, enable) {
  try {
    await fetch('/api/skills/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, enabled: enable })
    });
    loadSkillsList();
    if (currentSkillDetail === name) {
      document.getElementById('skillDetailStatus').textContent = enable ? 'Enabled' : 'Disabled';
      document.getElementById('skillDetailStatus').style.color = enable ? 'var(--em)' : 'var(--td)';
    }
  } catch (err) {
    console.error('Toggle skill error:', err);
  }
}

// ============================================================
// SKILL DETAIL
// ============================================================

async function openSkillDetail(name) {
  currentSkillDetail = name;
  currentWorkspacePath = '';

  try {
    const res = await fetch('/api/skills/detail?name=' + encodeURIComponent(name));
    if (!res.ok) throw new Error('Failed to load skill');
    const data = await res.json();
    const skill = data.skill || data;

    document.getElementById('skillDetailName').textContent = skill.name;
    document.getElementById('skillDetailDesc').textContent = skill.description || 'No description';
    document.getElementById('skillDetailStatus').textContent = skill.enabled ? 'Enabled' : 'Disabled';
    document.getElementById('skillDetailStatus').style.color = skill.enabled ? 'var(--em)' : 'var(--td)';
    document.getElementById('skillDetailVersion').textContent = skill.version || '1.0.0';
    document.getElementById('skillDetailPanel').style.display = 'block';

    // Show trigger/invocation command
    const triggerEl = document.getElementById('skillDetailTrigger');
    if (triggerEl) {
      const t = skill.trigger || skill.name;
      triggerEl.textContent = `/skill ${t}`;
      triggerEl.style.display = 'inline';
    }

    // Show tools list if any
    const toolsContainer = document.getElementById('skillDetailTools');
    if (toolsContainer) {
      if (skill.tools && skill.tools.length > 0) {
        toolsContainer.innerHTML = '<div style="font-size:.75rem;font-weight:600;margin-bottom:.5rem;color:var(--tm)">Tools provided:</div>' +
          skill.tools.map(t => `<div style="font-size:.7rem;padding:.3rem .5rem;margin-bottom:.25rem;background:var(--sf3);border-radius:4px"><strong>${escapeHtml(t.name)}</strong>${t.description ? ' — ' + escapeHtml(t.description) : ''}</div>`).join('');
        toolsContainer.style.display = 'block';
      } else {
        toolsContainer.style.display = 'none';
      }
    }

    // Show requires if any
    const reqContainer = document.getElementById('skillDetailRequires');
    if (reqContainer) {
      const req = skill.requires || {};
      const envs = req.env || [];
      const bins = req.bins || [];
      if (envs.length || bins.length) {
        let html = '<div style="font-size:.75rem;font-weight:600;margin-bottom:.5rem;color:var(--tm)">Requirements:</div>';
        if (envs.length) html += '<div style="font-size:.7rem;color:var(--td)">Env: ' + envs.map(e => '<code>' + escapeHtml(e) + '</code>').join(', ') + '</div>';
        if (bins.length) html += '<div style="font-size:.7rem;color:var(--td)">Bins: ' + bins.map(b => '<code>' + escapeHtml(b) + '</code>').join(', ') + '</div>';
        reqContainer.innerHTML = html;
        reqContainer.style.display = 'block';
      } else {
        reqContainer.style.display = 'none';
      }
    }

    // Show security warnings if any
    const secContainer = document.getElementById('skillDetailSecurity');
    if (secContainer) {
      const warnings = skill.securityWarnings || [];
      if (warnings.length > 0) {
        secContainer.innerHTML = '<div style="font-size:.75rem;font-weight:600;margin-bottom:.5rem;color:#fbbf24">Security Scan:</div>' + renderSecurityWarnings(warnings);
        secContainer.style.display = 'block';
      } else {
        secContainer.innerHTML = '<div style="font-size:.65rem;color:var(--em);padding:.25rem 0">✓ No security concerns</div>';
        secContainer.style.display = 'block';
      }
    }

    // Load workspace files
    refreshWorkspaceFiles();
  } catch (err) {
    console.error('Open skill detail error:', err);
  }
}

function closeSkillDetail() {
  document.getElementById('skillDetailPanel').style.display = 'none';
  document.getElementById('workspaceFileEditor').style.display = 'none';
  currentSkillDetail = null;
}

// ============================================================
// WORKSPACE FILE BROWSER
// ============================================================

async function refreshWorkspaceFiles() {
  if (!currentSkillDetail) return;
  const browser = document.getElementById('workspaceFileBrowser');

  try {
    const res = await fetch('/api/skills/workspace/list?skill=' + encodeURIComponent(currentSkillDetail) + '&path=' + encodeURIComponent(currentWorkspacePath));
    if (!res.ok) throw new Error('Failed to list files');
    const data = await res.json();
    const files = data.files || [];

    if (!files.length) {
      browser.innerHTML = '<div style="color:var(--td);text-align:center;padding:2rem;font-size:.85rem">Empty workspace — create a file to get started</div>';
      return;
    }

    let html = '';
    if (currentWorkspacePath) {
      html += `<div onclick="navigateWorkspace('..')" style="padding:.6rem 1rem;border-bottom:1px solid var(--bd);cursor:pointer;font-size:.8rem;color:var(--ac);display:flex;align-items:center;gap:.5rem" onmouseover="this.style.background='var(--sf3)'" onmouseout="this.style.background='transparent'">
        <span>📁</span> <span>.. (back)</span>
      </div>`;
    }

    for (const f of files) {
      // Handle both object format {name,type,size} and string format
      const fname = typeof f === 'object' ? f.name : String(f);
      const isDir = typeof f === 'object' ? f.type === 'directory' : fname.endsWith('/');
      const display = isDir && fname.endsWith('/') ? fname.slice(0, -1) : fname;
      const icon = isDir ? '📁' : '📄';
      const clickName = isDir ? (fname.endsWith('/') ? fname : fname + '/') : fname;
      html += `<div style="padding:.6rem 1rem;border-bottom:1px solid var(--bd);cursor:pointer;font-size:.8rem;display:flex;align-items:center;justify-content:space-between" onmouseover="this.style.background='var(--sf3)'" onmouseout="this.style.background='transparent'">
        <div onclick="${isDir ? `navigateWorkspace('${escapeHtmlAttr(clickName)}')` : `openWorkspaceFile('${escapeHtmlAttr(fname)}')`}" style="display:flex;align-items:center;gap:.5rem;flex:1">
          <span>${icon}</span> <span>${escapeHtml(display)}</span>
        </div>
        ${!isDir ? `<button class="btn bd" style="font-size:.55rem;padding:.2rem .5rem" onclick="event.stopPropagation();deleteWorkspaceFile('${escapeHtmlAttr(fname)}')">🗑</button>` : ''}
      </div>`;
    }

    browser.innerHTML = html;
  } catch (err) {
    browser.innerHTML = `<div style="color:var(--dn);text-align:center;padding:1rem">${escapeHtml(err.message)}</div>`;
  }
}

function navigateWorkspace(dir) {
  if (dir === '..') {
    const parts = currentWorkspacePath.split('/').filter(Boolean);
    parts.pop();
    currentWorkspacePath = parts.join('/');
  } else {
    currentWorkspacePath = currentWorkspacePath ? currentWorkspacePath + '/' + dir.replace(/\/$/, '') : dir.replace(/\/$/, '');
  }
  refreshWorkspaceFiles();
}

async function openWorkspaceFile(filename) {
  if (!currentSkillDetail) return;
  const filePath = currentWorkspacePath ? currentWorkspacePath + '/' + filename : filename;

  try {
    const res = await fetch('/api/skills/workspace/read?skill=' + encodeURIComponent(currentSkillDetail) + '&path=' + encodeURIComponent(filePath));
    if (!res.ok) throw new Error('Failed to read file');
    const data = await res.json();

    document.getElementById('editorFileName').textContent = filePath;
    document.getElementById('workspaceFileContent').value = data.content || '';
    document.getElementById('workspaceFileEditor').style.display = 'block';
  } catch (err) {
    console.error('Open file error:', err);
  }
}

async function saveWorkspaceFile() {
  if (!currentSkillDetail) return;
  const filePath = document.getElementById('editorFileName').textContent;
  const content = document.getElementById('workspaceFileContent').value;

  try {
    const res = await fetch('/api/skills/workspace/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill: currentSkillDetail, path: filePath, content })
    });
    if (!res.ok) throw new Error('Failed to save file');
    if (typeof lg === 'function') lg('ok', 'Saved: ' + filePath);
  } catch (err) {
    console.error('Save file error:', err);
  }
}

function closeFileEditor() {
  document.getElementById('workspaceFileEditor').style.display = 'none';
}

function showWorkspaceNewFile() {
  const name = prompt('New file name (e.g., notes.txt):');
  if (!name || !name.trim()) return;
  const sanitized = name.trim().replace(/[^a-zA-Z0-9._\-\/]/g, '');
  if (!sanitized) return;

  const filePath = currentWorkspacePath ? currentWorkspacePath + '/' + sanitized : sanitized;
  document.getElementById('editorFileName').textContent = filePath;
  document.getElementById('workspaceFileContent').value = '';
  document.getElementById('workspaceFileEditor').style.display = 'block';
}

async function deleteWorkspaceFile(filename) {
  if (!currentSkillDetail) return;
  const filePath = currentWorkspacePath ? currentWorkspacePath + '/' + filename : filename;
  if (!confirm('Delete ' + filePath + '?')) return;

  try {
    await fetch('/api/skills/workspace/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill: currentSkillDetail, path: filePath })
    });
    refreshWorkspaceFiles();
  } catch (err) {
    console.error('Delete file error:', err);
  }
}

// ============================================================
// PENDING SKILL PROPOSALS (Entity → User Approval)
// ============================================================

async function loadPendingSkills() {
  const container = document.getElementById('pendingSkillsContainer');
  if (!container) return;
  try {
    const res = await fetch('/api/skills/pending');
    if (!res.ok) { container.innerHTML = ''; return; }
    const data = await res.json();
    const pending = data.pending || [];

    if (!pending.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div style="margin-bottom:1rem">
        <div style="font-size:.8rem;font-weight:700;color:#fbbf24;margin-bottom:.5rem;display:flex;align-items:center;gap:.5rem">
          <span>⏳</span> Pending Proposals (${pending.length})
        </div>
        ${pending.map(p => renderPendingCard(p)).join('')}
      </div>`;
  } catch (err) {
    container.innerHTML = '';
  }
}

function renderPendingCard(proposal) {
  const isEdit = proposal.type === 'edit';
  const typeBadge = isEdit
    ? '<span style="font-size:.55rem;padding:.1rem .35rem;border-radius:3px;background:rgba(96,165,250,.15);color:var(--ac)">EDIT</span>'
    : '<span style="font-size:.55rem;padding:.1rem .35rem;border-radius:3px;background:rgba(52,211,153,.15);color:var(--em)">NEW</span>';
  const hasDanger = (proposal.warnings || []).some(w => w.level === 'danger');
  const hasWarn = (proposal.warnings || []).length > 0;
  const borderColor = hasDanger ? '#ef4444' : hasWarn ? '#fbbf24' : 'var(--bd)';

  return `
    <div style="background:var(--sf2);border:2px solid ${borderColor};border-radius:10px;padding:1rem;margin-bottom:.5rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <div>
          <span style="font-weight:600;font-size:.9rem">${escapeHtml(proposal.name)}</span>
          ${typeBadge}
        </div>
        <span style="font-size:.6rem;color:var(--td)">${new Date(proposal.proposedAt).toLocaleString()}</span>
      </div>
      <div style="font-size:.75rem;color:var(--td);margin-bottom:.5rem">${escapeHtml(proposal.description || 'No description')}</div>
      ${renderSecurityWarnings(proposal.warnings)}
      <div style="margin-bottom:.75rem">
        <div style="font-size:.7rem;font-weight:600;color:var(--tm);margin-bottom:.25rem">Proposed Instructions:</div>
        <pre style="font-size:.65rem;background:var(--sf3);border:1px solid var(--bd);border-radius:6px;padding:.75rem;max-height:200px;overflow:auto;white-space:pre-wrap;color:var(--tm);margin:0">${escapeHtml(proposal.instructions || '')}</pre>
      </div>
      ${isEdit && proposal.previousInstructions ? `
        <details style="margin-bottom:.75rem">
          <summary style="font-size:.7rem;color:var(--td);cursor:pointer">Show previous instructions</summary>
          <pre style="font-size:.65rem;background:var(--sf3);border:1px solid var(--bd);border-radius:6px;padding:.75rem;max-height:150px;overflow:auto;white-space:pre-wrap;color:var(--td);margin:.25rem 0 0 0">${escapeHtml(proposal.previousInstructions)}</pre>
        </details>` : ''}
      <div style="display:flex;gap:.5rem;justify-content:flex-end">
        <button class="btn bd" onclick="rejectProposal('${escapeHtmlAttr(proposal.id)}')" style="font-size:.7rem;padding:.3rem .75rem;color:#ef4444">✕ Reject</button>
        <button class="btn bp" onclick="approveProposal('${escapeHtmlAttr(proposal.id)}')" style="font-size:.7rem;padding:.3rem .75rem;${hasDanger ? 'background:#ef4444;' : ''}">${hasDanger ? '⚠ Approve Anyway' : '✓ Approve'}</button>
      </div>
    </div>`;
}

function renderSecurityWarnings(warnings) {
  if (!warnings || !warnings.length) return '<div style="font-size:.65rem;color:var(--em);margin-bottom:.5rem">✓ No security concerns detected</div>';
  return `<div style="margin-bottom:.5rem">${warnings.map(w => {
    const color = w.level === 'danger' ? '#ef4444' : '#fbbf24';
    const icon = w.level === 'danger' ? '🚨' : '⚠';
    return `<div style="font-size:.65rem;color:${color};padding:.2rem 0;display:flex;align-items:flex-start;gap:.3rem"><span>${icon}</span><span>${escapeHtml(w.message)}</span></div>`;
  }).join('')}</div>`;
}

async function approveProposal(proposalId) {
  try {
    const res = await fetch('/api/skills/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Approval failed');
    if (typeof lg === 'function') lg('ok', 'Skill approved: ' + (data.name || ''));
    loadSkillsList();
  } catch (err) {
    alert('Approve error: ' + err.message);
  }
}

async function rejectProposal(proposalId) {
  try {
    const res = await fetch('/api/skills/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Rejection failed');
    if (typeof lg === 'function') lg('ok', 'Proposal rejected: ' + (data.name || ''));
    loadSkillsList();
  } catch (err) {
    alert('Reject error: ' + err.message);
  }
}

// ============================================================
// QUARANTINE — "Foreign DNA" Containment
// ============================================================

async function loadQuarantineList() {
  const container = document.getElementById('quarantineContainer');
  if (!container) return;
  try {
    const res = await fetch('/api/skills/quarantine');
    if (!res.ok) { container.innerHTML = ''; return; }
    const data = await res.json();
    const quarantined = data.quarantined || [];

    if (!quarantined.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div style="margin-bottom:1.5rem">
        <div style="font-size:.85rem;font-weight:700;color:#ef4444;margin-bottom:.75rem;display:flex;align-items:center;gap:.5rem">
          <span>🔒</span> Quarantine (${quarantined.length})
          <span style="font-size:.6rem;font-weight:400;color:var(--td)">— Unvetted foreign skills. Review before approving.</span>
        </div>
        ${quarantined.map(q => renderQuarantineCard(q)).join('')}
      </div>`;
  } catch (err) {
    container.innerHTML = '';
  }
}

function renderQuarantineCard(q) {
  const hasDanger = (q.warnings || []).some(w => w.level === 'danger');
  const warnCount = (q.warnings || []).length;
  const borderColor = hasDanger ? '#ef4444' : warnCount > 0 ? '#fbbf24' : 'var(--bd)';
  const dangerCount = (q.warnings || []).filter(w => w.level === 'danger').length;
  const sourceBadge = q.source ? `<span style="font-size:.55rem;padding:.1rem .35rem;border-radius:3px;background:rgba(148,163,184,.15);color:var(--td)">${escapeHtml(q.source)}</span>` : '';

  return `
    <div style="background:var(--sf2);border:2px solid ${borderColor};border-radius:10px;padding:1rem;margin-bottom:.5rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <div>
          <span style="font-weight:600;font-size:.9rem">${escapeHtml(q.name)}</span>
          ${q.version ? `<span style="font-size:.6rem;color:var(--td);margin-left:.5rem">v${escapeHtml(q.version)}</span>` : ''}
          ${sourceBadge}
        </div>
        <span style="font-size:.6rem;color:var(--td)">${q.quarantinedAt ? new Date(q.quarantinedAt).toLocaleString() : 'Unknown'}</span>
      </div>
      <div style="font-size:.75rem;color:var(--td);margin-bottom:.5rem">${escapeHtml(q.description || 'No description')}</div>
      ${renderSecurityWarnings(q.warnings)}
      <details style="margin-bottom:.75rem">
        <summary style="font-size:.7rem;color:var(--td);cursor:pointer">View SKILL.md instructions</summary>
        <pre style="font-size:.65rem;background:var(--sf3);border:1px solid var(--bd);border-radius:6px;padding:.75rem;max-height:200px;overflow:auto;white-space:pre-wrap;color:var(--tm);margin:.25rem 0 0 0">${escapeHtml(q.instructions || '')}</pre>
      </details>
      ${q.tools && q.tools.length > 0 ? `
        <div style="font-size:.65rem;color:var(--td);margin-bottom:.5rem">
          Tools: ${q.tools.map(t => '<code style="background:var(--sf3);padding:.1rem .3rem;border-radius:3px">' + escapeHtml(t.name) + '</code>').join(' ')}
        </div>` : ''}
      <div style="display:flex;gap:.5rem;justify-content:flex-end;align-items:center">
        <button class="btn bd" onclick="rescanQuarantined('${escapeHtmlAttr(q.name)}')" style="font-size:.65rem;padding:.25rem .6rem;color:var(--ac)">🔍 Re-scan</button>
        <button class="btn bd" onclick="deleteQuarantined('${escapeHtmlAttr(q.name)}')" style="font-size:.65rem;padding:.25rem .6rem;color:#ef4444">🗑 Delete</button>
        <button class="btn bp" onclick="vetQuarantined('${escapeHtmlAttr(q.name)}')" style="font-size:.65rem;padding:.25rem .6rem;${hasDanger ? 'background:#ef4444;' : ''}">${hasDanger ? '⚠ Vet Anyway' : '✓ Vet & Approve'}</button>
      </div>
    </div>`;
}

async function vetQuarantined(name) {
  const hasDanger = document.querySelector(`[onclick*="vetQuarantined('${name}')"]`)?.textContent?.includes('⚠');
  if (hasDanger) {
    if (!confirm(`"${name}" has security warnings. Are you sure you want to move it to active skills?`)) return;
  }
  try {
    const res = await fetch('/api/skills/quarantine/vet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Vet failed');
    if (typeof lg === 'function') lg('ok', `Skill "${name}" vetted — now in active skills (disabled)`);
    loadSkillsList();
  } catch (err) {
    alert('Vet error: ' + err.message);
  }
}

async function deleteQuarantined(name) {
  if (!confirm(`Permanently delete quarantined skill "${name}"?`)) return;
  try {
    const res = await fetch('/api/skills/quarantine/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Delete failed');
    if (typeof lg === 'function') lg('ok', `Quarantined skill "${name}" deleted`);
    loadQuarantineList();
  } catch (err) {
    alert('Delete error: ' + err.message);
  }
}

async function rescanQuarantined(name) {
  try {
    const res = await fetch('/api/skills/quarantine/rescan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Re-scan failed');
    if (typeof lg === 'function') lg('ok', `Re-scanned "${name}": ${data.warnings.length} warning(s)`);
    loadQuarantineList();
  } catch (err) {
    alert('Re-scan error: ' + err.message);
  }
}

// ============================================================
// CREATE / DELETE SKILLS
// ============================================================

function showCreateSkillDialog() {
  document.getElementById('createSkillModal').style.display = 'flex';
}

function closeCreateSkillDialog() {
  document.getElementById('createSkillModal').style.display = 'none';
}

function fillSkillTemplate() {
  const ta = document.getElementById('newSkillInstructions');
  if (!ta) return;
  ta.value = `# My Skill Name

A brief description of what this skill enables the entity to do.

## Behavior Guidelines

- When should the entity use this skill?
- What are the rules or best practices?
- Any limitations or safety notes?

## Tools

### my_tool
Does something useful. The entity calls this with:
\`\`\`
[TOOL:my_tool param1="value" param2="value"]
\`\`\`

Parameters:
- param1 (string): What this parameter controls
- param2 (string): Optional — defaults to "default"

### another_tool
Another capability this skill provides.
\`\`\`
[TOOL:another_tool input="some data"]
\`\`\`

Parameters:
- input (string): The data to process
`;
}

async function executeCreateSkill() {
  const name = document.getElementById('newSkillName').value.trim();
  const description = document.getElementById('newSkillDesc').value.trim();
  const instructions = document.getElementById('newSkillInstructions').value.trim();
  const version = (document.getElementById('newSkillVersion')?.value || '').trim() || '1.0.0';
  const trigger = (document.getElementById('newSkillTrigger')?.value || '').trim() || null;

  if (!name) { alert('Skill name is required'); return; }

  try {
    const res = await fetch('/api/skills/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, instructions, version, trigger })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create skill');
    }
    closeCreateSkillDialog();
    document.getElementById('newSkillName').value = '';
    document.getElementById('newSkillDesc').value = '';
    document.getElementById('newSkillInstructions').value = '';
    if (document.getElementById('newSkillVersion')) document.getElementById('newSkillVersion').value = '';
    if (document.getElementById('newSkillTrigger')) document.getElementById('newSkillTrigger').value = '';
    loadSkillsList();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ============================================================
// WEB SEARCH
// ============================================================

async function executeWebSearch() {
  const query = document.getElementById('webSearchQuery').value.trim();
  if (!query) return;
  const resultsEl = document.getElementById('webSearchResults');
  resultsEl.style.display = 'block';
  resultsEl.innerHTML = '<div style="color:var(--td);text-align:center;padding:1rem">Searching...</div>';

  try {
    const res = await fetch('/api/skills/web-search/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    const results = data.results || [];

    if (!results.length) {
      resultsEl.innerHTML = '<div style="color:var(--td);text-align:center;padding:1rem">No results found</div>';
      return;
    }

    resultsEl.innerHTML = results.map(r => `
      <div style="padding:.75rem;border-bottom:1px solid var(--bd)">
        <div style="font-size:.85rem;font-weight:600;color:var(--ac);cursor:pointer;margin-bottom:.25rem" onclick="document.getElementById('webFetchUrl').value='${escapeHtmlAttr(r.url)}'">${escapeHtml(r.title)}</div>
        <div style="font-size:.7rem;color:var(--td);margin-bottom:.25rem;word-break:break-all">${escapeHtml(r.url)}</div>
        <div style="font-size:.75rem;color:var(--tm)">${escapeHtml(r.snippet || '')}</div>
      </div>
    `).join('');
  } catch (err) {
    resultsEl.innerHTML = `<div style="color:var(--dn);padding:1rem">${escapeHtml(err.message)}</div>`;
  }
}

async function executeWebFetch() {
  const url = document.getElementById('webFetchUrl').value.trim();
  if (!url) return;
  const resultEl = document.getElementById('webFetchResult');
  resultEl.style.display = 'block';
  resultEl.textContent = 'Fetching...';

  try {
    const res = await fetch('/api/skills/web-search/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!res.ok) throw new Error('Fetch failed');
    const data = await res.json();
    resultEl.textContent = data.text || data.content || '(empty response)';
  } catch (err) {
    resultEl.textContent = 'Error: ' + err.message;
    resultEl.style.color = 'var(--dn)';
  }
}

// ============================================================
// SLEEP CYCLE CONFIGURATION
// ============================================================

async function loadSleepConfig() {
  try {
    const res = await fetch('/api/sleep/config');
    if (!res.ok) return;
    const config = await res.json();

    if (config.autoSleep !== undefined) {
      const toggle = document.getElementById('sleepAutoToggle');
      const label = document.getElementById('sleepAutoLabel');
      if (config.autoSleep) {
        toggle.classList.add('on');
        label.textContent = 'Enabled';
      } else {
        toggle.classList.remove('on');
        label.textContent = 'Disabled';
      }
    }
    if (config.intervalMinutes) document.getElementById('sleepInterval').value = config.intervalMinutes;
    if (config.dreamDepth) document.getElementById('sleepDreamDepth').value = config.dreamDepth;
    if (config.maxDreamCycles) document.getElementById('sleepMaxDreams').value = config.maxDreamCycles;
    if (config.compressChat) document.getElementById('sleepCompressChat').value = config.compressChat;
    if (config.personaUpdate) document.getElementById('sleepPersonaUpdate').value = config.personaUpdate;
    if (config.wakeTime) document.getElementById('sleepWakeTime').value = config.wakeTime;
    if (config.bedTime) document.getElementById('sleepBedTime').value = config.bedTime;
  } catch (err) {
    console.error('Load sleep config error:', err);
  }
}

async function saveSleepConfig() {
  const statusEl = document.getElementById('sleepConfigStatus');
  const config = {
    autoSleep: document.getElementById('sleepAutoToggle').classList.contains('on'),
    intervalMinutes: parseInt(document.getElementById('sleepInterval').value) || 60,
    dreamDepth: document.getElementById('sleepDreamDepth').value,
    maxDreamCycles: parseInt(document.getElementById('sleepMaxDreams').value) || 3,
    compressChat: document.getElementById('sleepCompressChat').value,
    personaUpdate: document.getElementById('sleepPersonaUpdate').value,
    wakeTime: document.getElementById('sleepWakeTime').value,
    bedTime: document.getElementById('sleepBedTime').value
  };

  try {
    const res = await fetch('/api/sleep/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    if (!res.ok) throw new Error('Failed to save');
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(52,211,153,.12)';
    statusEl.style.color = 'var(--em)';
    statusEl.textContent = '✓ Sleep configuration saved';
    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
  } catch (err) {
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(248,113,113,.12)';
    statusEl.style.color = 'var(--dn)';
    statusEl.textContent = '✗ ' + err.message;
  }
}

function toggleSleepAuto() {
  const toggle = document.getElementById('sleepAutoToggle');
  const label = document.getElementById('sleepAutoLabel');
  toggle.classList.toggle('on');
  label.textContent = toggle.classList.contains('on') ? 'Enabled' : 'Disabled';
}

// ============================================================
// MAX TOKENS CONFIG
// ============================================================

async function loadMaxTokensConfig() {
  try {
    const res = await fetch('/api/config/max-tokens');
    if (!res.ok) return;
    const data = await res.json();
    const val = data.maxTokens || 16000;
    document.getElementById('maxTokensSlider').value = Math.min(Math.max(val, 1024), 65536);
    document.getElementById('maxTokensInput').value = val;
    document.getElementById('maxTokensValue').textContent = val;
  } catch (err) {
    console.error('Load maxTokens config error:', err);
  }
}

async function saveMaxTokensConfig() {
  const statusEl = document.getElementById('maxTokensStatus');
  const val = parseInt(document.getElementById('maxTokensInput').value, 10);
  if (!val || val < 256 || val > 128000) {
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(248,113,113,.12)';
    statusEl.style.color = 'var(--dn)';
    statusEl.textContent = '✗ Value must be between 256 and 128,000';
    return;
  }
  try {
    const res = await fetch('/api/config/max-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxTokens: val })
    });
    if (!res.ok) throw new Error('Failed to save');
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(52,211,153,.12)';
    statusEl.style.color = 'var(--em)';
    statusEl.textContent = '✓ Max tokens set to ' + val;
    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
  } catch (err) {
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(248,113,113,.12)';
    statusEl.style.color = 'var(--dn)';
    statusEl.textContent = '✗ ' + err.message;
  }
}

// ============================================================
// PER-FUNCTION TOKEN LIMITS
// ============================================================

async function loadTokenLimits() {
  const container = document.getElementById('tokenLimitsContainer');
  if (!container) return;
  try {
    const res = await fetch('/api/config/token-limits');
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    container.innerHTML = '';
    for (const [key, info] of Object.entries(data)) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:var(--space-3);padding:var(--space-2) 0;border-bottom:1px solid var(--border-subtle)';
      const isModified = info.value !== info.defaultValue;
      row.innerHTML = `
        <div style="flex:1;min-width:0">
          <div class="text-sm-c font-medium">${escapeHtml(info.label)}${isModified ? ' <span style="color:var(--accent);font-size:0.7em">●</span>' : ''}</div>
          <div class="text-xs-c text-tertiary-c" style="margin-top:2px">${escapeHtml(info.desc)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-2);flex-shrink:0">
          <input type="number" data-token-key="${escapeHtmlAttr(key)}" min="64" max="128000" value="${info.value}"
            class="w-full" style="width:5.5rem;text-align:right;padding:4px 8px;font-size:0.85rem">
          <span class="text-xs-c text-tertiary-c" style="min-width:3.5rem;text-align:right" title="Default: ${info.defaultValue}">(${info.defaultValue})</span>
        </div>`;
      container.appendChild(row);
    }
  } catch (err) {
    container.innerHTML = '<p class="text-xs-c text-tertiary-c">Failed to load token limits</p>';
    console.error('Load token limits error:', err);
  }
}

async function saveTokenLimits() {
  const statusEl = document.getElementById('tokenLimitsStatus');
  const inputs = document.querySelectorAll('[data-token-key]');
  const overrides = {};
  for (const input of inputs) {
    const key = input.getAttribute('data-token-key');
    const val = parseInt(input.value, 10);
    if (key && Number.isFinite(val) && val >= 64 && val <= 128000) {
      overrides[key] = val;
    }
  }
  try {
    const res = await fetch('/api/config/token-limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenLimits: overrides })
    });
    if (!res.ok) throw new Error('Failed to save');
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(52,211,153,.12)';
    statusEl.style.color = 'var(--em)';
    statusEl.textContent = '✓ Token limits saved';
    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
    loadTokenLimits(); // refresh to show modified indicators
  } catch (err) {
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(248,113,113,.12)';
    statusEl.style.color = 'var(--dn)';
    statusEl.textContent = '✗ ' + err.message;
  }
}

async function resetTokenLimits() {
  const statusEl = document.getElementById('tokenLimitsStatus');
  try {
    const res = await fetch('/api/config/token-limits/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('Failed to reset');
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(52,211,153,.12)';
    statusEl.style.color = 'var(--em)';
    statusEl.textContent = '✓ Token limits reset to defaults';
    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
    loadTokenLimits(); // refresh UI
  } catch (err) {
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(248,113,113,.12)';
    statusEl.style.color = 'var(--dn)';
    statusEl.textContent = '✗ ' + err.message;
  }
}

// ============================================================
// HTML ESCAPE HELPERS
// ============================================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeHtmlAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
// ENTITY WORKSPACE
// ============================================================

let entityWsCurrentPath = '';

async function loadEntityWorkspaceConfig() {
  try {
    const res = await fetch('/api/workspace/config');
    if (!res.ok) return;
    const data = await res.json();
    if (data.workspacePath) {
      document.getElementById('entityWorkspacePath').value = data.workspacePath;
      refreshEntityWorkspace();
    }
  } catch (err) {
    console.error('Load workspace config error:', err);
  }
}

async function saveEntityWorkspacePath() {
  const statusEl = document.getElementById('entityWorkspaceStatus');
  const pathVal = document.getElementById('entityWorkspacePath').value.trim();
  if (!pathVal) {
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(248,113,113,.12)';
    statusEl.style.color = 'var(--dn)';
    statusEl.textContent = '✗ Please enter a workspace path';
    return;
  }
  try {
    const res = await fetch('/api/workspace/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspacePath: pathVal })
    });
    if (!res.ok) throw new Error('Failed to save');
    const data = await res.json();
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(52,211,153,.12)';
    statusEl.style.color = 'var(--em)';
    statusEl.textContent = '✓ Workspace path saved';
    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
    entityWsCurrentPath = '';
    refreshEntityWorkspace();
  } catch (err) {
    statusEl.style.display = 'block';
    statusEl.style.background = 'rgba(248,113,113,.12)';
    statusEl.style.color = 'var(--dn)';
    statusEl.textContent = '✗ ' + err.message;
  }
}

async function refreshEntityWorkspace() {
  const browser = document.getElementById('entityWorkspaceBrowser');
  const pathDisplay = document.getElementById('entityWsPathDisplay');
  pathDisplay.textContent = '/' + (entityWsCurrentPath || '');

  try {
    const qs = entityWsCurrentPath ? '?path=' + encodeURIComponent(entityWsCurrentPath) : '';
    const res = await fetch('/api/workspace/list' + qs);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to list');
    }
    const data = await res.json();
    const files = data.files || data;
    if (!files || files.length === 0) {
      browser.innerHTML = '<div style="color:var(--td);text-align:center;padding:2rem;font-size:.85rem">Empty directory</div>';
      return;
    }
    let html = '<div style="padding:.5rem">';
    // Back button if we're in a subdirectory
    if (entityWsCurrentPath) {
      html += '<div style="display:flex;align-items:center;padding:.4rem .6rem;cursor:pointer;border-radius:6px;margin-bottom:2px" onmouseover="this.style.background=\'var(--sf3)\'" onmouseout="this.style.background=\'transparent\'" onclick="entityWsNavigateUp()">';
      html += '<span style="margin-right:.5rem">📁</span><span style="font-size:.8rem;color:var(--ac)">..</span></div>';
    }
    for (const f of files) {
      const name = typeof f === 'string' ? f : f.name;
      const isDir = typeof f === 'string' ? f.endsWith('/') : f.type === 'directory';
      const size = (typeof f === 'object' && f.size) ? f.size : '';
      const icon = isDir ? '📁' : '📄';
      const sizeStr = (!isDir && size) ? '<span style="font-size:.7rem;color:var(--td);margin-left:auto">' + escapeHtml(String(size)) + '</span>' : '';
      const clickAction = isDir
        ? 'entityWsNavigate(\'' + escapeHtmlAttr(name.replace(/\/$/, '')) + '\')'
        : 'openEntityWsFile(\'' + escapeHtmlAttr(name) + '\')';
      html += '<div style="display:flex;align-items:center;padding:.4rem .6rem;cursor:pointer;border-radius:6px;margin-bottom:2px" onmouseover="this.style.background=\'var(--sf3)\'" onmouseout="this.style.background=\'transparent\'" onclick="' + clickAction + '">';
      html += '<span style="margin-right:.5rem">' + icon + '</span><span style="font-size:.8rem;color:var(--tx)">' + escapeHtml(name.replace(/\/$/, '')) + '</span>' + sizeStr;
      html += '</div>';
    }
    html += '</div>';
    browser.innerHTML = html;
  } catch (err) {
    browser.innerHTML = '<div style="color:var(--dn);text-align:center;padding:2rem;font-size:.85rem">' + escapeHtml(err.message) + '</div>';
  }
}

function entityWsNavigate(dirName) {
  entityWsCurrentPath = entityWsCurrentPath ? entityWsCurrentPath + '/' + dirName : dirName;
  refreshEntityWorkspace();
}

function entityWsNavigateUp() {
  const parts = entityWsCurrentPath.split('/');
  parts.pop();
  entityWsCurrentPath = parts.join('/');
  refreshEntityWorkspace();
}

async function openEntityWsFile(fileName) {
  const filePath = entityWsCurrentPath ? entityWsCurrentPath + '/' + fileName : fileName;
  try {
    const res = await fetch('/api/workspace/read?path=' + encodeURIComponent(filePath));
    if (!res.ok) throw new Error('Failed to read file');
    const data = await res.json();
    document.getElementById('entityWsEditorFileName').textContent = filePath;
    document.getElementById('entityWsFileContent').value = data.content || '';
    document.getElementById('entityWsFileEditor').style.display = 'block';
    document.getElementById('entityWsFileEditor').dataset.filePath = filePath;
  } catch (err) {
    alert('Error reading file: ' + err.message);
  }
}

async function saveEntityWsFile() {
  const editor = document.getElementById('entityWsFileEditor');
  const filePath = editor.dataset.filePath;
  const content = document.getElementById('entityWsFileContent').value;
  try {
    const res = await fetch('/api/workspace/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content: content })
    });
    if (!res.ok) throw new Error('Failed to save file');
    const nameEl = document.getElementById('entityWsEditorFileName');
    const orig = nameEl.textContent;
    nameEl.textContent = orig + '  ✓ saved';
    setTimeout(() => { nameEl.textContent = orig; }, 2000);
  } catch (err) {
    alert('Error saving file: ' + err.message);
  }
}

function showEntityWsNewFile() {
  const fileName = prompt('Enter file name:');
  if (!fileName || !fileName.trim()) return;
  const filePath = entityWsCurrentPath ? entityWsCurrentPath + '/' + fileName.trim() : fileName.trim();
  document.getElementById('entityWsEditorFileName').textContent = filePath;
  document.getElementById('entityWsFileContent').value = '';
  document.getElementById('entityWsFileEditor').style.display = 'block';
  document.getElementById('entityWsFileEditor').dataset.filePath = filePath;
}

// ============================================================
// SIDEBAR WORKSPACE BROWSER (Chat tab right panel)
// ============================================================

let sidebarWsPath = '';

function toggleSidebarSection(id) {
  const body = document.getElementById(id);
  const arrow = document.getElementById(id + 'Arrow');
  if (!body) return;
  if (body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  } else {
    body.classList.add('collapsed');
    if (arrow) arrow.style.transform = 'rotate(-90deg)';
  }
}

async function refreshSidebarWorkspace() {
  const browser = document.getElementById('sidebarWsBrowser');
  const pathDisplay = document.getElementById('sidebarWsPath');
  if (!browser) return;
  if (pathDisplay) pathDisplay.textContent = '/' + (sidebarWsPath || '');

  try {
    const qs = sidebarWsPath ? '?path=' + encodeURIComponent(sidebarWsPath) : '';
    const res = await fetch('/api/workspace/list' + qs);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'No workspace configured');
    }
    const data = await res.json();
    const files = data.files || data;
    if (!files || files.length === 0) {
      browser.innerHTML = '<div style="color:var(--td);text-align:center;padding:.75rem;font-size:.72rem">Empty directory</div>';
      return;
    }
    let html = '';
    if (sidebarWsPath) {
      html += '<div onclick="sidebarWsUp()" style="display:flex;align-items:center;gap:.4rem;padding:.3rem .4rem;cursor:pointer;border-radius:4px;font-size:.72rem;color:var(--ac)" onmouseover="this.style.background=\'var(--sf3)\'" onmouseout="this.style.background=\'transparent\'">📁 ..</div>';
    }
    for (const f of files) {
      const name = typeof f === 'string' ? f : f.name;
      const isDir = typeof f === 'string' ? name.endsWith('/') : f.type === 'directory';
      const display = name.replace(/\/$/, '');
      const icon = isDir ? '📁' : '📄';
      const action = isDir
        ? 'sidebarWsNav(\'' + escapeHtmlAttr(display) + '\')'
        : 'sidebarWsOpen(\'' + escapeHtmlAttr(name) + '\')';
      html += '<div onclick="' + action + '" style="display:flex;align-items:center;gap:.4rem;padding:.3rem .4rem;cursor:pointer;border-radius:4px;font-size:.72rem" onmouseover="this.style.background=\'var(--sf3)\'" onmouseout="this.style.background=\'transparent\'">' + icon + ' <span style="color:var(--tx)">' + escapeHtml(display) + '</span></div>';
    }
    browser.innerHTML = html;
  } catch (err) {
    browser.innerHTML = '<div style="color:var(--td);text-align:center;padding:.75rem;font-size:.72rem">' + escapeHtml(err.message) + '</div>';
  }
}

function sidebarWsNav(dir) {
  sidebarWsPath = sidebarWsPath ? sidebarWsPath + '/' + dir : dir;
  refreshSidebarWorkspace();
}

function sidebarWsUp() {
  const parts = sidebarWsPath.split('/');
  parts.pop();
  sidebarWsPath = parts.join('/');
  refreshSidebarWorkspace();
}

async function sidebarWsOpen(fileName) {
  const filePath = sidebarWsPath ? sidebarWsPath + '/' + fileName : fileName;
  try {
    const res = await fetch('/api/workspace/read?path=' + encodeURIComponent(filePath));
    if (!res.ok) throw new Error('Failed to read file');
    const data = await res.json();
    const viewer = document.getElementById('sidebarWsViewer');
    document.getElementById('sidebarWsViewerName').textContent = fileName;
    document.getElementById('sidebarWsViewerContent').textContent = data.content || '(empty)';
    viewer.style.display = 'block';
  } catch (err) {
    console.error('Sidebar file read error:', err);
  }
}

function closeSidebarWsViewer() {
  document.getElementById('sidebarWsViewer').style.display = 'none';
}

// ============================================================
// ENTITY ACTIVITY FEED (Chat tab right panel)
// ============================================================

function addActivityItem(type, text) {
  const feed = document.getElementById('activityFeed');
  if (!feed) return;
  // Clear placeholder
  if (feed.querySelector('[style*="text-align:center"]')) {
    feed.innerHTML = '';
  }
  const icons = {
    'ws_write': '📝',
    'ws_list': '📁',
    'ws_read': '👁',
    'ws_delete': '🗑',
    'web_search': '🔍',
    'web_fetch': '🌐'
  };
  const cssClass = type.startsWith('web') ? type.replace('_', '-') : (type === 'ws_write' || type === 'ws_delete' ? 'ws-write' : 'ws-read');
  const icon = icons[type] || '⚡';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const item = document.createElement('div');
  item.className = 'activity-item ' + cssClass;
  item.innerHTML = '<span class="activity-icon">' + icon + '</span><span class="activity-text">' + escapeHtml(text) + '</span><span class="activity-time">' + time + '</span>';
  feed.insertBefore(item, feed.firstChild);

  // Keep max 50 items
  while (feed.children.length > 50) feed.removeChild(feed.lastChild);
}

/**
 * Process tool results from the chat API response.
 * Adds activity feed items and chat notifications.
 */
function processToolResults(toolResults) {
  if (!toolResults || !toolResults.length) return;

  for (const t of toolResults) {
    const cmd = t.command;
    const params = t.params || {};

    switch (cmd) {
      case 'ws_write':
        addActivityItem('ws_write', 'Wrote: ' + (params.path || 'unknown file'));
        addChatBubble('system', '📝 Entity wrote to workspace: ' + (params.path || 'file'));
        refreshSidebarWorkspace();
        break;
      case 'ws_read':
        addActivityItem('ws_read', 'Read: ' + (params.path || 'unknown file'));
        break;
      case 'ws_list':
        addActivityItem('ws_list', 'Listed: /' + (params.path || ''));
        break;
      case 'ws_delete':
        addActivityItem('ws_delete', 'Deleted: ' + (params.path || 'unknown file'));
        addChatBubble('system', '🗑 Entity deleted from workspace: ' + (params.path || 'file'));
        refreshSidebarWorkspace();
        break;
      case 'web_search':
        addActivityItem('web_search', 'Searched: "' + (params.query || '') + '"');
        addChatBubble('system', '🔍 Entity searched the web: "' + (params.query || '') + '"');
        break;
      case 'web_fetch':
        addActivityItem('web_fetch', 'Fetched: ' + (params.url || '').slice(0, 60));
        addChatBubble('system', '🌐 Entity fetched a web page');
        break;
      default:
        addActivityItem(cmd, cmd + ': ' + JSON.stringify(params).slice(0, 80));
    }
  }
}

/**
 * Display task plan progress in the chat and activity feed.
 */
function displayTaskPlan(taskPlan) {
  if (!taskPlan || !taskPlan.steps) return;

  const steps = taskPlan.steps;
  const outputs = taskPlan.stepOutputs || [];

  // Add a task plan summary bubble in chat
  let planHtml = '📋 Task Plan (' + steps.length + ' steps';
  if (taskPlan.llmCalls) planHtml += ', ' + taskPlan.llmCalls + ' LLM calls';
  planHtml += '):\n';
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    planHtml += (s.done ? '  ✓ ' : '  ○ ') + (i + 1) + '. ' + s.description + '\n';
  }
  addChatBubble('system', planHtml.trim());

  // Add each step to the activity feed
  for (const s of outputs) {
    const brief = s.output ? s.output.replace(/\n/g, ' ').slice(0, 80) : 'done';
    addActivityItem('ws_read', 'Step ' + s.step + ': ' + s.description + ' — ' + brief);
  }
}

// ============================================================
// INIT — Load skills and sleep config on page load
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadSkillsList();
  loadSleepConfig();
  loadMaxTokensConfig();
  loadTokenLimits();
  loadEntityWorkspaceConfig();
  refreshSidebarWorkspace();
});
