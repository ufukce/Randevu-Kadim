const $ = (s, root = document) => root.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tokenKey = 'aralik-admin-token';
const tabs = [
  { key: 'bookings', label: 'Randevular', fields: [['date','Tarih','date'],['startHour','Başlangıç saati','number'],['endHour','Bitiş saati','number'],['name','Ad soyad','text'],['phone','Telefon','text'],['email','E-posta','email'],['total','Toplam (₺)','number'],['status','Durum','select:bekliyor|onaylı|iptal'],['note','Not','textarea']] },
  { key: 'registrations', label: 'Etkinlik kayıtları', fields: [['eventTitle','Etkinlik','text'],['name','Ad soyad','text'],['phone','Telefon','text'],['count','Kişi sayısı','number']] },
  { key: 'rooms', label: 'Odalar', fields: [['name','Oda adı','text'],['capacity','Kapasite','number'],['description','Açıklama','textarea'],['image','Görsel URL’si','image'],['defaultPrice','Varsayılan fiyat/saat','number'],['pricingText','Saat aralığı fiyatları','text'],['pricingHelp','Biçim: 9-17:300, 17-22:400','help']] },
  { key: 'events', label: 'Etkinlikler', fields: [['title','Başlık','text'],['description','Açıklama','textarea'],['date','Tarih','date'],['time','Saat','text'],['capacity','Kontenjan (0 sınırsız)','number'],['image','Görsel URL’si','image']] },
  { key: 'campaigns', label: 'Kampanyalar', fields: [['title','Başlık','text'],['description','Açıklama','textarea'],['startDate','Başlangıç tarihi','date'],['endDate','Bitiş tarihi','date']] },
  { key: 'photos', label: 'Fotoğraflar', fields: [['url','Fotoğraf URL’si','image'],['caption','Açıklama','text']] },
  { key: 'settings', label: 'Dükkan bilgileri', fields: [['address','Adres','textarea'],['phone','Telefon','text'],['email','E-posta','email'],['hours','Çalışma saatleri','textarea'],['instagram','Instagram adresi','url'],['mapEmbed','Google Maps iframe src','url'],['openHour','Kiralama başlangıç saati','number'],['closeHour','Kiralama bitiş saati','number']] }
];
let active = 'bookings', editing = null, records = [];
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem(tokenKey) || ''}`, ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !url.endsWith('/api/login')) { logout(); throw new Error(data.error || 'Oturumunuz sona erdi.'); }
  if (!response.ok) throw new Error(data.error || 'İşlem tamamlanamadı.'); return data;
}
function logout() { sessionStorage.removeItem(tokenKey); $('#admin-view').hidden = true; $('#login-view').hidden = false; }
function renderTabs() { $('#admin-tabs').innerHTML = tabs.map(t => `<button type="button" class="${t.key === active ? 'active' : ''}" data-tab="${t.key}">${esc(t.label)}</button>`).join(''); document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { active = b.dataset.tab; editing = null; showTab(); }); }
function inputMarkup([name, label, type]) {
  if (type === 'help') return `<p class="wide muted">${esc(label)}</p>`;
  const value = editing ? editing[name] ?? '' : '';
  if (type.startsWith('select:')) return `<label>${esc(label)}<select name="${name}">${type.slice(7).split('|').map(v => `<option ${value === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
  const control = type === 'textarea' ? `<textarea name="${name}" rows="3">${esc(value)}</textarea>` : `<input name="${name}" type="${type === 'image' ? 'url' : type}" value="${esc(type === 'image' ? value : value)}" ${name === 'name' || name === 'title' ? 'required' : ''}>`;
  if (type === 'image') return `<label class="upload-label">${esc(label)}${control}<input class="file-upload" type="file" accept="image/*" aria-label="${esc(label)} yükle"></label>`;
  return `<label class="${type === 'textarea' ? 'wide' : ''}">${esc(label)}${control}</label>`;
}
function readable(row) { return row.title || row.name || row.eventTitle || row.roomName || row.date || row.caption || row.address || 'Kayıt'; }
function displayDetails(row) {
  if (active === 'bookings') return `${row.date || ''} · ${row.startHour}:00–${row.endHour}:00 · ${row.name || ''} · ${row.phone || ''} · ${Number(row.total || 0).toLocaleString('tr-TR')} ₺ · ${row.status || ''}${row.note ? ` · Not: ${row.note}` : ''}`;
  if (active === 'registrations') return `${row.eventTitle || ''} · ${row.name || ''} · ${row.phone || ''} · ${row.count || 1} kişi`;
  return readable(row);
}
function showTab() {
  renderTabs();
  const tab = tabs.find(t => t.key === active);
  if (active === 'settings') { editing = records[0] || {}; }
  $('#admin-content').innerHTML = `<form id="record-form" class="admin-form">${tab.fields.map(inputMarkup).join('')}<button class="button">${active === 'settings' ? 'Bilgileri kaydet' : editing ? 'Güncelle' : 'Ekle'}</button><button type="button" id="cancel-edit" class="admin-actions" ${editing ? '' : 'hidden'}>Düzenlemeyi iptal et</button><p id="form-message" class="form-message wide" aria-live="polite"></p></form>${active === 'settings' ? '' : `<div class="admin-list">${records.map(row => `<article class="admin-item"><span>${esc(displayDetails(row))}</span><div class="admin-actions">${active === 'bookings' ? `<button data-status="onaylı" data-id="${esc(row._id)}">Onayla</button><button data-status="iptal" data-id="${esc(row._id)}">İptal et</button>` : `<button data-edit="${esc(row._id)}">Düzenle</button>`}<button class="danger" data-delete="${esc(row._id)}">Sil</button></div></article>`).join('') || '<p class="empty">Henüz kayıt yok.</p>'}</div>`}`;
  $('#record-form').addEventListener('submit', saveRecord);
  $('#cancel-edit').onclick = () => { editing = null; showTab(); };
  document.querySelectorAll('.file-upload').forEach(input => input.addEventListener('change', uploadImage));
  document.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => { editing = records.find(r => r._id === button.dataset.edit); if (active === 'rooms') editing.pricingText = (editing.pricing || []).map(p => `${p.from}-${p.to}:${p.price}`).join(', '); showTab(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  document.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => { if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return; try { await request(`/api/admin/${active}/${button.dataset.delete}`, { method: 'DELETE' }); await loadTab(); } catch (e) { alert(e.message); } });
  document.querySelectorAll('[data-status]').forEach(button => button.onclick = async () => { try { await request(`/api/admin/bookings/${button.dataset.id}`, { method: 'PUT', body: JSON.stringify({ status: button.dataset.status }) }); await loadTab(); } catch (e) { alert(e.message); } });
}
async function saveRecord(event) {
  event.preventDefault(); const form = event.currentTarget, data = Object.fromEntries(new FormData(form)); const message = $('#form-message'); message.textContent = 'Kaydediliyor…';
  if (active === 'rooms') {
    try { data.pricing = (data.pricingText || '').split(',').map(x => x.trim()).filter(Boolean).map(part => { const match = part.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/); if (!match) throw new Error('Fiyat biçimi 9-17:300, 17-22:400 şeklinde olmalıdır.'); return { from: Number(match[1]), to: Number(match[2]), price: Number(match[3]) }; }); }
    catch (e) { message.textContent = e.message; return; }
    delete data.pricingText;
  }
  for (const field of tabs.find(t => t.key === active).fields) { if (field[2] === 'number' && data[field[0]] !== '') data[field[0]] = Number(data[field[0]]); }
  try {
    if (active === 'settings') await request('/api/admin/settings', { method: 'PUT', body: JSON.stringify(data) });
    else await request(`/api/admin/${active}${editing ? `/${editing._id}` : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(data) });
    editing = null; message.textContent = 'Kaydedildi.'; await loadTab();
  } catch (e) { message.textContent = e.message; }
}
async function uploadImage(event) {
  const file = event.currentTarget.files[0]; if (!file) return;
  const label = event.currentTarget.closest('label'), urlField = $('input[type="url"]', label); const message = $('#form-message'); message.textContent = 'Fotoğraf yükleniyor…';
  try {
    const sign = await request('/api/admin/sign'); const form = new FormData();
    form.append('file', file); form.append('api_key', sign.apiKey); form.append('timestamp', sign.timestamp); form.append('folder', sign.folder); form.append('signature', sign.signature);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(sign.cloudName)}/image/upload`, { method: 'POST', body: form }); const result = await response.json();
    if (!response.ok || !result.secure_url) throw new Error(result.error?.message || 'Fotoğraf yüklenemedi.');
    urlField.value = result.secure_url; message.textContent = 'Fotoğraf yüklendi.';
  } catch (e) { message.textContent = e.message; }
}
async function loadTab() {
  if (active === 'settings') { const response = await fetch('/api/settings'); records = [await response.json()]; showTab(); return; }
  records = await request(`/api/admin/${active}`); showTab();
}
async function login(event) {
  event.preventDefault(); const message = $('#login-message'); message.textContent = 'Giriş yapılıyor…';
  try { const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: new FormData(event.currentTarget).get('password') }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Giriş yapılamadı.'); sessionStorage.setItem(tokenKey, data.token); $('#login-view').hidden = true; $('#admin-view').hidden = false; await loadTab(); }
  catch (e) { message.textContent = e.message; }
}
$('#login-form').addEventListener('submit', login);
if (sessionStorage.getItem(tokenKey)) { $('#login-view').hidden = true; $('#admin-view').hidden = false; loadTab().catch(error => { $('#login-view').hidden = false; $('#admin-view').hidden = true; $('#login-message').textContent = error.message; }); }
