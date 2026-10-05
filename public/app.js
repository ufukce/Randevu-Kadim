const $ = (s, root = document) => root.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = esc;
const money = value => `${Number(value || 0).toLocaleString('tr-TR')} ₺`;
const longDate = value => { const d = new Date(`${value}T12:00:00`); return Number.isNaN(d.getTime()) ? esc(value) : new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d); };
const api = async (url, options = {}) => { const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'İşlem tamamlanamadı.'); return data; };
let rooms = [], settings = { openHour: 9, closeHour: 22 }, selected = [], unavailable = [];

async function loadCampaigns() {
  const rows = await api('/api/campaigns');
  $('#campaign-list').innerHTML = rows.length ? rows.map((x, i) => `<article class="campaign-card"><span class="card-index">0${i + 1}</span><p class="eyebrow">${esc(x.startDate)} — ${esc(x.endDate)}</p><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p><span class="campaign-arrow">✳</span></article>`).join('') : '<p class="empty">Şu an aktif kampanya yok.</p>';
}
async function loadEvents() {
  const rows = await api('/api/events');
  $('#event-list').innerHTML = rows.length ? rows.map(event => {
    const remaining = event.capacity > 0 ? Math.max(0, event.capacity - event.taken) : null;
    const full = remaining === 0;
    return `<article class="event-card">${event.image ? `<img class="event-image" src="${attr(event.image)}" alt="${attr(event.title)}" loading="lazy">` : '<div class="event-image event-placeholder">ARALIKTA<br>BULUŞALIM</div>'}<div class="event-body"><p class="eyebrow">${longDate(event.date)} · ${esc(event.time || '')}</p><h3>${esc(event.title)}</h3><p>${esc(event.description)}</p><p class="availability ${full ? 'full' : ''}">${full ? 'Kontenjan doldu' : remaining === null ? 'Kayıtlar açık' : `${remaining} kişi yer kaldı`}</p>${full ? '' : `<details class="register-details"><summary>Kayıt ol <span>＋</span></summary><form class="register-form" data-id="${attr(event._id)}"><label>Ad soyad<input name="name" required></label><label>Telefon<input name="phone" type="tel" required></label><label>Kişi sayısı<input name="count" type="number" min="1" max="10" value="1" required></label><button class="button" type="submit">Kaydımı oluştur</button><p class="form-message" aria-live="polite"></p></form></details>`}</div></article>`;
  }).join('') : '<p class="empty">Yakında yeni etkinlikler eklenecek.</p>';
  document.querySelectorAll('.register-form').forEach(form => form.addEventListener('submit', async e => {
    e.preventDefault(); const msg = $('.form-message', form); msg.textContent = 'Gönderiliyor…';
    const data = Object.fromEntries(new FormData(form)); data.count = Number(data.count);
    try { await api(`/api/events/${encodeURIComponent(form.dataset.id)}/register`, { method: 'POST', body: JSON.stringify(data) }); msg.textContent = 'Kaydınız alındı. Görüşmek üzere!'; form.reset(); await loadEvents(); }
    catch (error) { msg.textContent = error.message; }
  }));
}
function renderRooms() {
  $('#room-list').innerHTML = rooms.length ? rooms.map(room => `<article class="room-card">${room.image ? `<img src="${attr(room.image)}" alt="${attr(room.name)}" loading="lazy">` : '<div class="room-placeholder">BİRLİKTE<br>ÜRETELİM</div>'}<div class="room-content"><p class="eyebrow">${room.capacity ? `EN FAZLA ${esc(room.capacity)} KİŞİ` : 'KENDİNE GÖRE DÜZENLE'}</p><h3>${esc(room.name)}</h3><p>${esc(room.description)}</p><p class="room-price">Varsayılan · ${money(room.defaultPrice)}/saat</p>${room.pricing?.length ? `<ul class="pricing-list">${room.pricing.map(p => `<li><span>${esc(p.from)}:00–${esc(p.to)}:00</span><strong>${money(p.price)}/saat</strong></li>`).join('')}</ul>` : ''}</div></article>`).join('') : '<p class="empty">Atölye odaları yakında burada.</p>';
  $('#booking-room').innerHTML = '<option value="">Oda seçin</option>' + rooms.map(room => `<option value="${attr(room._id)}">${esc(room.name)}</option>`).join('');
}
function priceAt(room, hour) { const item = room?.pricing?.find(p => hour >= p.from && hour < p.to); return Number(item ? item.price : room?.defaultPrice || 0); }
function updateSummary() {
  const summary = $('#booking-summary');
  if (!selected.length) { summary.textContent = 'Saat seçilmedi'; return; }
  const start = selected[0], end = selected[selected.length - 1] + 1, total = selected.reduce((sum, hour) => sum + priceAt(rooms.find(r => r._id === $('#booking-room').value), hour), 0);
  summary.textContent = `${String(start).padStart(2, '0')}:00 – ${String(end).padStart(2, '0')}:00 · ${selected.length} saat · Toplam ${money(total)}`;
}
async function loadHours() {
  const roomId = $('#booking-room').value, date = $('#booking-date').value;
  selected = []; updateSummary();
  if (!roomId || !date) { $('#hour-grid').innerHTML = '<p class="muted">Oda ve tarih seçerek saatleri görün.</p>'; return; }
  const room = rooms.find(r => r._id === roomId);
  try {
    const result = await api(`/api/availability?room=${encodeURIComponent(roomId)}&date=${encodeURIComponent(date)}`); unavailable = result.booked;
    const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hours = [];
    for (let h = Number(settings.openHour ?? 9); h < Number(settings.closeHour ?? 22); h++) {
      const past = date < today || (date === today && h <= now.getHours());
      const busy = unavailable.includes(h) || past;
      hours.push(`<button type="button" class="hour-button ${busy ? 'disabled' : ''}" data-hour="${h}" ${busy ? 'disabled aria-label="${h}:00 dolu veya geçmiş"' : ''}><span>${String(h).padStart(2, '0')}:00</span><small>${money(priceAt(room, h))}</small></button>`);
    }
    $('#hour-grid').innerHTML = hours.length ? hours.join('') : '<p class="muted">Bu tarihte kiralama saati bulunmuyor.</p>';
    document.querySelectorAll('.hour-button:not(.disabled)').forEach(button => button.addEventListener('click', () => {
      const hour = Number(button.dataset.hour);
      if (selected.length && hour === selected[selected.length - 1]) selected.pop();
      else if (selected.length && hour === selected[0]) selected.shift();
      else if (!selected.length || (hour !== selected[selected.length - 1] + 1 && hour !== selected[0] - 1)) selected = [hour];
      else if (hour === selected[selected.length - 1] + 1) selected.push(hour);
      else if (hour === selected[0] - 1) selected.unshift(hour);
      document.querySelectorAll('.hour-button').forEach(b => b.classList.toggle('selected', selected.includes(Number(b.dataset.hour)))); updateSummary();
    }));
  } catch (error) { $('#hour-grid').innerHTML = `<p class="form-message">${esc(error.message)}</p>`; }
}
async function loadPhotos() {
  const rows = await api('/api/photos');
  $('#photo-list').innerHTML = rows.length ? rows.map(photo => `<figure><img src="${attr(photo.url)}" alt="${attr(photo.caption || 'Aralık Kafe & Sahaf') }" loading="lazy"><figcaption>${esc(photo.caption || '')}</figcaption></figure>`).join('') : '<p class="empty">Mekândan fotoğraflar yakında burada.</p>';
}
function showContact(s) {
  const phone = String(s.phone || '');
  $('#contact-details').innerHTML = `${s.address ? `<p><span>ADRES</span>${esc(s.address)}</p>` : ''}${s.hours ? `<p><span>ÇALIŞMA SAATLERİ</span>${esc(s.hours)}</p>` : ''}${phone ? `<p><span>TELEFON</span><a href="tel:${attr(phone.replace(/[^+\d]/g, ''))}">${esc(phone)}</a></p>` : ''}${s.email ? `<p><span>E-POSTA</span><a href="mailto:${attr(s.email)}">${esc(s.email)}</a></p>` : ''}${s.instagram ? `<p><span>INSTAGRAM</span><a href="${attr(s.instagram)}" target="_blank" rel="noopener noreferrer">Bizi takip et ↗</a></p>` : ''}` || '<p>İletişim bilgileri yakında burada.</p>';
  if (s.mapEmbed && /^https:\/\//i.test(s.mapEmbed)) $('#map-wrap').innerHTML = `<iframe title="Aralık Kafe & Sahaf haritası" src="${attr(s.mapEmbed)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`;
}
async function init() {
  $('#year').textContent = new Date().getFullYear();
  const date = $('#booking-date'); date.min = new Date().toISOString().slice(0, 10); date.value = date.min;
  try { [rooms, settings] = await Promise.all([api('/api/rooms'), api('/api/settings')]); renderRooms(); showContact(settings); }
  catch (e) { console.error(e); }
  $('#booking-room').addEventListener('change', loadHours); date.addEventListener('change', loadHours);
  $('#booking-form').addEventListener('submit', async e => {
    e.preventDefault(); const message = $('#booking-message');
    if (!selected.length) { message.textContent = 'Lütfen arka arkaya en az bir saat seçin.'; return; }
    const data = Object.fromEntries(new FormData(e.currentTarget)); data.room = $('#booking-room').value; data.date = date.value; data.startHour = selected[0]; data.endHour = selected[selected.length - 1] + 1;
    message.textContent = 'Gönderiliyor…';
    try { await api('/api/bookings', { method: 'POST', body: JSON.stringify(data) }); message.textContent = 'Talebiniz alındı, onay için sizi arayacağız.'; e.currentTarget.reset(); date.value = date.min; selected = []; await loadHours(); }
    catch (error) { message.textContent = error.message; if (error.message.includes('müsait')) await loadHours(); }
  });
  for (const fn of [loadCampaigns, loadEvents, loadPhotos]) try { await fn(); } catch (error) { console.error(error); }
}
init();
