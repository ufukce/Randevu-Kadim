# Aralık — Kafe & Sahaf

Türkçe tanıtım sitesi, atölye randevusu, etkinlik kaydı ve şifre korumalı yönetim paneli. Node.js, Express, MongoDB Atlas, Mongoose ve düz HTML/CSS/JavaScript kullanır; derleme adımı yoktur.

## Dosya yapısı

```text
package.json
server.js
.env.example
.gitignore
README.md
public/
  index.html
  app.js
  style.css
  admin.html
  admin.js
```

## Yerelde çalıştırma

1. Node.js 18 veya üzeri kurun.
2. Bu klasörde `npm install` çalıştırın.
3. `.env.example` dosyasını `.env` adıyla kopyalayın ve değerleri doldurun.
4. `npm start` komutunu çalıştırın ve `http://localhost:3000` adresini açın.
5. Yönetim paneli `http://localhost:3000/admin.html` adresindedir. İlk içerikleri bu panelden oluşturun.

`MONGODB_URI`, `JWT_SECRET` ve `ADMIN_PASSWORD` zorunludur. SMTP değişkenleri boşsa e-posta gönderimi sessizce devre dışı kalır. `PORT` belirtilmezse 3000 kullanılır.

## MongoDB Atlas

1. MongoDB Atlas'ta ücretsiz bir küme oluşturun.
2. Database Access bölümünden kullanıcı ve güçlü parola oluşturun.
3. Network Access bölümünde `0.0.0.0/0` adresini ekleyin. Bu, Render'ın değişken çıkış IP'lerinden bağlantıya izin verir; veritabanı kullanıcınız için güçlü ve ayrı bir parola belirleyin.
4. Connect → Drivers bölümündeki bağlantı dizesini `MONGODB_URI` olarak girin. `kullanici`, `sifre` ve veritabanı adını kendi bilgilerinizle değiştirin; paroladaki özel karakterleri URL kodlayın.

## GitHub ve Render dağıtımı

1. Proje klasörünü bir Git deposuna ekleyip GitHub'a gönderin. `.env` dosyası `.gitignore` içindedir; gizli değerleri depoya eklemeyin.
2. Render'da **New → Web Service** ile GitHub deposunu bağlayın.
3. Build Command değerini `npm install`, Start Command değerini `npm start` yapın.
4. Render servisinin Environment bölümüne `.env.example` içindeki değişkenleri ekleyin. `PORT` Render tarafından sağlanabilir; girilmesi şart değildir. `MONGODB_URI`, `JWT_SECRET`, `ADMIN_PASSWORD` zorunludur.
5. Deploy tamamlandığında verilen `onrender.com` adresini açın. Kalıcı disk gerekmez; fotoğraflar Cloudinary'de tutulur.

## Cloudinary fotoğraf yükleme

1. Cloudinary hesabı oluşturun ve Dashboard'dan Cloud Name, API Key ve API Secret değerlerini alın.
2. Üç değeri Render'da `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` değişkenleri olarak kaydedin.
3. Yönetim panelinde Fotoğraflar, Odalar veya Etkinlikler bölümünün dosya seçicisinden görsel yükleyin. Tarayıcı imzayı sunucudan alır ve görseli doğrudan Cloudinary'ye gönderir.

## Gmail bildirimleri

1. Google hesabında iki adımlı doğrulamayı açın ve Google Hesabı → Güvenlik → Uygulama şifreleri bölümünden uygulama şifresi üretin.
2. `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER` (Gmail adresi), `SMTP_PASS` (uygulama şifresi) ve `NOTIFY_EMAIL` (bildirimin ulaşacağı adres) değerlerini Render'a ekleyin.
3. Bu değişkenlerden biri eksikse sistem e-posta göndermeyi denemez. E-posta gönderim hataları uygulamanın çalışmasını durdurmaz.

## Sınırlamalar

- Etkinlik kontenjanı kontrolü ile kayıt oluşturma tek bir atomik işlem değildir. Aynı anda gelen son kayıtlar kapasiteyi aşabilir; yoğun kullanımda işlem kilidi veya atomik kapasite modeli eklenmelidir.
- Randevu kontrolü ile kayıt oluşturma da tek bir atomik işlem değildir; aynı oda ve saate eşzamanlı iki talep yarışabilir. Üretim ölçeğinde kilitleme/rezervasyon stratejisi gerekir.
- Randevu saatini değiştirmek yerine mevcut kaydı iptal edip yeni talep oluşturun.
- Yönetim girişi tek parola ile çalışır; kullanıcı yönetimi, parola sıfırlama ve hız sınırlama bu sade sürümde yoktur. `ADMIN_PASSWORD` ve `JWT_SECRET` güçlü tutulmalıdır.
- Harita alanına Google Maps paylaşımındaki gömülü haritanın `src` adresi girilmelidir; tam iframe HTML'si girilmemelidir.
- Saatler yerel işletme saati varsayımıyla değerlendirilir; tarih alanı biçimi `YYYY-MM-DD`'dir.
