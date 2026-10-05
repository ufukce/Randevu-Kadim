const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Yerel geliştirmede .env değerlerini yükle; barındırma ortamı değişkenleri korunur.
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !match[1].startsWith('#') && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }

const app = express();
// Express 4'te asenkron rotaların reddedilen Promise'lerini hata katmanına ilet.
for (const method of ['get', 'post', 'put', 'delete']) {
  const register = app[method].bind(app);
  app[method] = (route, ...handlers) => register(route, ...handlers.map(handler => handler.constructor.name === 'AsyncFunction' ? (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next) : handler));
}
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const schemaOpts = { timestamps: true };
const Room = mongoose.model('Room', new mongoose.Schema({ name: { type: String, required: true }, capacity: Number, description: String, image: String, defaultPrice: { type: Number, default: 0 }, pricing: [{ from: Number, to: Number, price: Number }] }, schemaOpts));
const Booking = mongoose.model('Booking', new mongoose.Schema({ room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true }, roomName: String, date: String, startHour: Number, endHour: Number, name: String, phone: String, email: String, note: String, total: Number, status: { type: String, enum: ['bekliyor', 'onaylı', 'iptal'], default: 'bekliyor' } }, schemaOpts));
const Event = mongoose.model('Event', new mongoose.Schema({ title: { type: String, required: true }, description: String, date: String, time: String, capacity: { type: Number, default: 0 }, image: String }, schemaOpts));
const Registration = mongoose.model('Registration', new mongoose.Schema({ event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' }, eventTitle: String, name: String, phone: String, count: { type: Number, default: 1 } }, schemaOpts));
const Campaign = mongoose.model('Campaign', new mongoose.Schema({ title: String, description: String, startDate: String, endDate: String }, schemaOpts));
const Photo = mongoose.model('Photo', new mongoose.Schema({ url: String, caption: String }, schemaOpts));
const Settings = mongoose.model('Settings', new mongoose.Schema({ address: String, phone: String, email: String, hours: String, instagram: String, mapEmbed: String, openHour: { type: Number, default: 9 }, closeHour: { type: Number, default: 22 } }, schemaOpts));

const collections = { rooms: Room, bookings: Booking, events: Event, campaigns: Campaign, photos: Photo, registrations: Registration };
const today = () => new Date().toISOString().slice(0, 10);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const mailReady = () => process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.NOTIFY_EMAIL;
async function sendMail(subject, text, to = process.env.NOTIFY_EMAIL) {
  if (!mailReady() || !to) return;
  try {
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT), secure: Number(process.env.SMTP_PORT) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    await transport.sendMail({ from: process.env.SMTP_USER, to, subject, text });
  } catch (error) { console.error('E-posta gönderilemedi:', error.message); }
}
function adminOnly(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try { req.admin = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Oturumunuz sona erdi. Lütfen yeniden giriş yapın.' }); }
}

app.get('/api/settings', async (req, res) => res.json(await Settings.findOne().lean() || { openHour: 9, closeHour: 22 }));
app.get('/api/rooms', async (req, res) => res.json(await Room.find().sort({ createdAt: -1 }).lean()));
app.get('/api/photos', async (req, res) => res.json(await Photo.find().sort({ createdAt: -1 }).lean()));
app.get('/api/campaigns', async (req, res) => { const d = today(); res.json(await Campaign.find({ startDate: { $lte: d }, endDate: { $gte: d } }).sort({ startDate: 1 }).lean()); });
app.get('/api/events', async (req, res) => {
  const events = await Event.find({ date: { $gte: today() } }).sort({ date: 1, time: 1 }).lean();
  const ids = events.map(event => event._id);
  const counts = await Registration.aggregate([{ $match: { event: { $in: ids } } }, { $group: { _id: '$event', taken: { $sum: '$count' } } }]);
  const byId = new Map(counts.map(row => [String(row._id), row.taken]));
  res.json(events.map(event => ({ ...event, taken: byId.get(String(event._id)) || 0 })));
});
app.get('/api/availability', async (req, res) => {
  const { room, date } = req.query;
  if (!mongoose.isValidObjectId(room) || !validDate(date)) return res.status(400).json({ error: 'Oda veya tarih bilgisi geçersiz.' });
  const rows = await Booking.find({ room, date, status: { $ne: 'iptal' } }).select('startHour endHour').lean();
  res.json({ booked: rows.flatMap(row => Array.from({ length: row.endHour - row.startHour }, (_, i) => row.startHour + i)) });
});
app.post('/api/bookings', async (req, res) => {
  const { room: roomId, date, startHour, endHour, name, phone, email = '', note = '' } = req.body || {};
  const room = mongoose.isValidObjectId(roomId) ? await Room.findById(roomId) : null;
  if (!room) return res.status(400).json({ error: 'Seçilen oda bulunamadı.' });
  if (!String(name || '').trim() || !String(phone || '').trim()) return res.status(400).json({ error: 'Ad soyad ve telefon zorunludur.' });
  if (!validDate(date) || date < today()) return res.status(400).json({ error: 'Geçerli ve bugünden önce olmayan bir tarih seçin.' });
  const settings = await Settings.findOne().lean() || {};
  const open = Number(settings.openHour ?? 9), close = Number(settings.closeHour ?? 22);
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < open || endHour > close || endHour <= startHour) return res.status(400).json({ error: `Saat aralığı ${open}:00–${close}:00 arasında olmalıdır.` });
  const collision = await Booking.findOne({ room: room._id, date, status: { $ne: 'iptal' }, startHour: { $lt: endHour }, endHour: { $gt: startHour } });
  if (collision) return res.status(409).json({ error: 'Seçtiğiniz saatlerden biri artık müsait değil. Lütfen saatleri yenileyip tekrar deneyin.' });
  let total = 0;
  for (let hour = startHour; hour < endHour; hour++) {
    const tier = (room.pricing || []).find(item => hour >= item.from && hour < item.to);
    total += Number(tier ? tier.price : room.defaultPrice || 0);
  }
  const booking = await Booking.create({ room: room._id, roomName: room.name, date, startHour, endHour, name: String(name).trim(), phone: String(phone).trim(), email: String(email).trim(), note: String(note).trim(), total });
  await sendMail('Yeni atölye randevusu', `Oda: ${room.name}\nTarih: ${date}\nSaat: ${startHour}:00–${endHour}:00\nAd: ${booking.name}\nTelefon: ${booking.phone}\nToplam: ${total} ₺`);
  res.status(201).json({ ok: true, total });
});
app.post('/api/events/:id/register', async (req, res) => {
  const event = mongoose.isValidObjectId(req.params.id) ? await Event.findById(req.params.id) : null;
  if (!event) return res.status(404).json({ error: 'Etkinlik bulunamadı.' });
  const { name, phone, count = 1 } = req.body || {};
  if (!String(name || '').trim() || !String(phone || '').trim()) return res.status(400).json({ error: 'Ad soyad ve telefon zorunludur.' });
  if (!Number.isInteger(count) || count < 1 || count > 10) return res.status(400).json({ error: 'Kişi sayısı 1 ile 10 arasında olmalıdır.' });
  if (event.capacity > 0) {
    const taken = await Registration.aggregate([{ $match: { event: event._id } }, { $group: { _id: null, total: { $sum: '$count' } } }]);
    const remaining = Math.max(0, event.capacity - (taken[0]?.total || 0));
    if (remaining < count) return res.status(409).json({ error: remaining ? `Sadece ${remaining} kişilik yer kaldı.` : 'Kontenjan doldu.' });
  }
  await Registration.create({ event: event._id, eventTitle: event.title, name: String(name).trim(), phone: String(phone).trim(), count });
  await sendMail('Yeni etkinlik kaydı', `Etkinlik: ${event.title}\nAd: ${String(name).trim()}\nTelefon: ${String(phone).trim()}\nKişi: ${count}`);
  res.status(201).json({ ok: true });
});

app.post('/api/login', (req, res) => {
  if (!process.env.ADMIN_PASSWORD || !process.env.JWT_SECRET) return res.status(500).json({ error: 'Yönetim girişi sunucuda yapılandırılmamış.' });
  if (typeof req.body?.password !== 'string' || req.body.password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Şifre yanlış.' });
  res.json({ token: jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' }) });
});
app.get('/api/admin/sign', adminOnly, (req, res) => {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: secret } = process.env;
  if (!cloudName || !apiKey || !secret) return res.status(503).json({ error: 'Fotoğraf yükleme sunucuda yapılandırılmamış.' });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash('sha1').update(`folder=kafe&timestamp=${timestamp}${secret}`).digest('hex');
  res.json({ timestamp, folder: 'kafe', signature, apiKey, cloudName });
});
app.put('/api/admin/settings', adminOnly, async (req, res) => {
  const body = { ...req.body };
  delete body._id; delete body.__v; delete body.createdAt; delete body.updatedAt;
  if (body.openHour !== undefined) body.openHour = Number(body.openHour);
  if (body.closeHour !== undefined) body.closeHour = Number(body.closeHour);
  res.json(await Settings.findOneAndUpdate({}, body, { upsert: true, new: true, runValidators: true }));
});
app.get('/api/admin/:collection', adminOnly, async (req, res) => {
  const Model = collections[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Bu kayıt türü bulunamadı.' });
  res.json(await Model.find().sort({ createdAt: -1 }).lean());
});
app.post('/api/admin/:collection', adminOnly, async (req, res) => {
  const Model = collections[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Bu kayıt türü bulunamadı.' });
  const body = { ...req.body }; delete body._id; delete body.__v;
  res.status(201).json(await Model.create(body));
});
app.put('/api/admin/:collection/:id', adminOnly, async (req, res) => {
  const Model = collections[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Bu kayıt türü bulunamadı.' });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Kayıt numarası geçersiz.' });
  const body = { ...req.body }; delete body._id; delete body.__v; delete body.createdAt; delete body.updatedAt;
  const before = req.params.collection === 'bookings' ? await Booking.findById(req.params.id) : null;
  const updated = await Model.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!updated) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
  if (before && before.status !== updated.status && updated.email && ['onaylı', 'iptal'].includes(updated.status)) await sendMail('Randevu durumunuz güncellendi', `Merhaba ${updated.name}, ${updated.date} tarihli ${updated.roomName} randevunuz ${updated.status}.`, updated.email);
  res.json(updated);
});
app.delete('/api/admin/:collection/:id', adminOnly, async (req, res) => {
  const Model = collections[req.params.collection];
  if (!Model) return res.status(404).json({ error: 'Bu kayıt türü bulunamadı.' });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Kayıt numarası geçersiz.' });
  const deleted = await Model.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
  res.json({ ok: true });
});

app.use((req, res) => res.status(404).json({ error: 'İstenen adres bulunamadı.' }));
app.use((error, req, res, next) => {
  console.error('Sunucu hatası:', error);
  if (res.headersSent) return next(error);
  res.status(error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500).json({ error: error.name === 'ValidationError' ? 'Girilen bilgiler geçersiz.' : error.name === 'CastError' ? 'Kayıt bilgisi geçersiz.' : 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.' });
});

async function start() {
  if (!process.env.MONGODB_URI) { console.error('MONGODB_URI tanımlı değil. Sunucu başlatılmadı.'); process.exit(1); }
  try { await mongoose.connect(process.env.MONGODB_URI); }
  catch (error) { console.error('MongoDB bağlantısı kurulamadı:', error.message); process.exit(1); }
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Sunucu ${port} portunda çalışıyor.`));
}
start();
