'use strict';
const $ = (s) => document.querySelector(s);
let staffSessionExpired = false;
function handleSessionExpiry() {
  if (staffSessionExpired) return;
  staffSessionExpired = true;
  const dashboard = document.querySelector('main.dashboard');
  if (!dashboard) return;
  const panel = document.createElement('section'); panel.className = 'card session-expired';
  panel.setAttribute('role','alert'); panel.setAttribute('tabindex','-1');
  const title = document.createElement('h1'); title.textContent = 'Please sign in again';
  const message = document.createElement('p'); message.textContent = 'Your staff session has ended. Saved referrals are safe. Sign in to continue; an unsaved change may need to be retried.';
  const link = document.createElement('a'); link.className = 'session-sign-in'; link.textContent = 'Sign in again';
  link.href = '/.auth/logout?post_logout_redirect_uri=' + encodeURIComponent(location.origin + '/staff/login');
  panel.append(title,message,link);
  // Clear patient details and controls when authentication is lost.
  dashboard.replaceChildren(panel); panel.focus();
}
async function api(path, options = {}) {
  if (staffSessionExpired && path.startsWith('/api/staff/')) throw new Error('Your sign-in has expired. Please sign in again.');
  const response = await fetch(path, {credentials: 'same-origin', referrerPolicy: 'same-origin', ...options, headers: {'Content-Type': 'application/json', ...options.headers}});
  if (response.status === 401 || response.redirected) {
    if (path.startsWith('/api/staff/')) handleSessionExpiry();
    throw new Error('Your sign-in has expired. Please sign in again.');
  }
  if (staffSessionExpired && path.startsWith('/api/staff/')) throw new Error('Your sign-in has expired. Please sign in again.');
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    // Azure can reject a request before Flask sees it. Do not parse HTML or
    // display raw response bodies, which could contain sensitive information.
    throw new Error(`The server returned an unexpected response (HTTP ${response.status}). Refresh the page and try again. If it continues, report this status to your administrator.`);
  }
  let body;
  try { body = await response.json(); }
  catch { throw new Error(`The server returned an unreadable response (HTTP ${response.status}). Please refresh and try again.`); }
  if (!response.ok) throw new Error(body?.error || `Could not complete the request (HTTP ${response.status}).`);
  return body;
}
function node(tag, text, className) {const n = document.createElement(tag); if(text !== undefined) n.textContent = text; if(className) n.className = className; return n;}
const form = $('#referral-form');
if (form) {
  let submissionId = crypto.randomUUID();
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('button'); button.disabled = true; $('#form-error').textContent = '';
    const data = Object.fromEntries(new FormData(form)); data.code = form.dataset.code; data.consent = form.elements.consent.checked; data.submissionId = submissionId;
    try {await api('/api/referrals', {method:'POST', body:JSON.stringify(data)}); form.reset(); $('#form-panel').classList.add('hidden'); $('#success').classList.remove('hidden'); $('#success').focus();}
    catch(error) {$('#form-error').textContent = error.message; button.disabled = false;}
  });
}
if ($('#referrals')) {
  let referrals = [], selectedStatus = '';
  const statuses = ['New','Contacted','Scheduled','Completed','Closed'];
  function render(focusStatus = null) {
    if (staffSessionExpired) return;
    $('#metrics').replaceChildren(...['',...statuses].map(status => {
      const label = status || 'All referrals';
      const count = status ? referrals.filter(r=>r.status===status).length : referrals.length;
      const button = node('button',label,'metric');
      button.type = 'button'; button.dataset.status = status;
      button.setAttribute('aria-pressed',String(selectedStatus===status));
      button.setAttribute('aria-controls','referrals');
      button.setAttribute('aria-label',label+': '+count+' referrals');
      button.append(node('b',String(count)));
      button.addEventListener('click',()=>{selectedStatus=status;render(status);});
      return button;
    }));
    const filtered = referrals.filter(r=>!selectedStatus || r.status===selectedStatus);
    $('#inbox-view').textContent = (selectedStatus || 'All referrals')+' · '+filtered.length+' shown';
    if (focusStatus !== null) $('#metrics').querySelector('[data-status="'+focusStatus+'"]').focus();
    $('#referrals').replaceChildren(...filtered.map(r=>{
      const card=node('article',undefined,'referral'), top=node('div',undefined,'title-row'); top.append(node('h2',r.name));
      const label=node('label','Status'), select=node('select',undefined,'status');
      statuses.forEach(s=>{const o=node('option',s);o.value=s;o.selected=s===r.status;select.append(o);});
      select.addEventListener('change',async()=>{select.disabled=true;try{await api('/api/staff/referrals/'+encodeURIComponent(r.RowKey),{method:'PATCH',body:JSON.stringify({status:select.value})});r.status=select.value;render();}catch(e){if(staffSessionExpired)return;$('#staff-error').textContent=e.message;select.value=r.status;select.disabled=false;}});
      label.append(select);top.append(label);card.append(top,node('p',r.doctorName+' · '+new Date(r.createdAt).toLocaleString(), 'muted'));
      const details=node('div',undefined,'details');
      // Values are text, never HTML. Use validated protocols for links.
      const email=node('a',r.email);email.href='mailto:'+encodeURIComponent(r.email);
      const phone=node('a',r.phone);phone.href='tel:'+r.phone.replace(/[^+\d]/g,'');details.append(email,phone);card.append(details);
      if(r.notes)card.append(node('p',r.notes,'notes'));return card;
    }));
    if(!filtered.length) $('#referrals').append(node('div','No referrals in this view.','empty'));
  }
  async function refresh(){try{const result=await api('/api/staff/referrals');if(staffSessionExpired)return;referrals=result.referrals;render();$('#updated').textContent='Updated '+new Date().toLocaleTimeString();$('#staff-error').textContent=result.limited?'Showing a limited set. Archive/export support is needed as volume grows.':'';}catch(e){if(staffSessionExpired)return;referrals=[];render();$('#staff-error').textContent=e.message;}}
  async function loadDoctors(){const result=await api('/api/staff/doctors');if(staffSessionExpired)return;$('#doctors').replaceChildren(...result.doctors.map(d=>{
    const row=node('div',undefined,'doctor');row.append(node('b',d.name+(d.active?'':' · Inactive')));
    const input=node('input');input.readOnly=true;input.value=location.origin+'/r/'+d.RowKey;input.setAttribute('aria-label','Referral link for '+d.name);input.addEventListener('click',()=>input.select());row.append(input);
    const copy=node('button','Copy link','secondary');copy.type='button';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(input.value);copy.textContent='Copied';}catch{input.select();}});
    const toggle=node('button',d.active?'Deactivate card':'Reactivate card','secondary');toggle.type='button';toggle.addEventListener('click',async()=>{try{await api('/api/staff/doctors/'+d.RowKey,{method:'PATCH',body:JSON.stringify({active:!d.active})});await loadDoctors();}catch(e){if(staffSessionExpired)return;$('#staff-error').textContent=e.message;}});row.append(copy,document.createTextNode(' '),toggle);return row;
  }));}
  $('#refresh').addEventListener('click',()=>{refresh();document.dispatchEvent(new Event('referrals-refresh'));});
  $('#doctor-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await api('/api/staff/doctors',{method:'POST',body:JSON.stringify({name:$('#doctor-name').value})});e.target.reset();await loadDoctors();document.dispatchEvent(new Event('referrals-refresh'));}catch(error){if(staffSessionExpired)return;$('#staff-error').textContent=error.message;}finally{button.disabled=false;}});
  async function loadAlertSettings() {
    const panel = $('#alert-status');
    if (!panel) return;
    try {
      const settings = await api('/api/staff/alerts');
      if(staffSessionExpired)return;
      panel.textContent = settings.enabled ? 'Alerts enabled for ' + settings.recipient + (settings.retrying ? '. Some alerts are waiting for another delivery attempt.' : '.') : 'Email alerts are not configured yet.';
      $('#test-alert').disabled = !settings.enabled;
    } catch { panel.textContent = 'Could not check email settings. Refresh or sign in again.'; }
  }
  const testAlert = $('#test-alert');
  if (testAlert) testAlert.addEventListener('click', async () => {
    testAlert.disabled = true;
    try { await api('/api/staff/alerts/test', {method:'POST',body:'{}'}); $('#alert-status').textContent = 'Test alert queued. Check your inbox and spam folder in about one minute.'; }
    catch(e) { if(staffSessionExpired)return;$('#alert-status').textContent = e.message; }
    finally { testAlert.disabled = false; }
  });
  refresh();loadDoctors().catch(e=>{if(!staffSessionExpired)$('#staff-error').textContent=e.message;});loadAlertSettings();
  setInterval(()=>{if(!document.hidden)refresh();},60000);
}


if (document.querySelector('main.dashboard')) {
  let checkingSession = false;
  async function checkStaffSession() {
    if (staffSessionExpired || document.hidden || checkingSession) return;
    checkingSession = true;
    try { await api('/api/staff/session'); } catch (_) { /* API handler displays expired session; temporary network failures do not sign out. */ }
    finally { checkingSession = false; }
  }
  window.addEventListener('focus', checkStaffSession);
  window.addEventListener('pageshow', checkStaffSession);
  document.addEventListener('visibilitychange', checkStaffSession);
  setInterval(checkStaffSession, 60000);
}
