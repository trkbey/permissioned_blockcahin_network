# Permissioned Blockchain Network — Kurulum Rehberi

Hyperledger Besu (QBFT) tabanlı bir blokzincir ağı, PostgreSQL veritabanı, Node.js backend ve React frontend'den oluşan dağıtık bir mimari. Veritabanına yazılan kritik kayıtların SHA-256 özeti zincire mühürlenir; `/api/verify` ile kaydın sonradan değiştirilip değiştirilmediği kanıtlanabilir.

## Güvenlik uyarısı

**Bu depoda hiçbir private key, parola veya API anahtarı bulunmaz.** Tüm sırlar kurulum sırasında yerel olarak üretilir ve `.gitignore` kapsamındadır. Deponun daha eski sürümlerinde anahtarlar açıkta kaldığı için o anahtarlar geçersiz sayılmalıdır — aşağıdaki adımlar yeni anahtar üretir.

## Ön koşullar

- [Docker](https://docs.docker.com/get-docker/) ve Docker Compose (Docker Desktop çalışır durumda olmalı)
- Node.js 20 veya üzeri

---

## Kurulum

### Hızlı yol (önerilen)

Depoyu klonlayın ve tek komut çalıştırın:

```bash
node bootstrap.js --start
```

`bootstrap.js` şunları yapar:

1. Validatör node anahtarlarını, QBFT genesis dosyasını ve bootnode listesini üretir
2. Tüm sırları üretir — veritabanı parolası, deployer anahtarı, iki API anahtarı, JWT gizli anahtarı ve iki kullanıcı parolası
3. Dört `.env` dosyasını **tutarlı biçimde** yazar (aşağıdaki senkron noktalarına bakın)
4. `--start` verildiyse yığını doğru sırada ayağa kaldırır, zincirin ve veritabanının hazır olmasını bekler, sözleşmeyi dağıtır
5. Giriş bilgilerini `LOGIN_BILGILERI.txt` dosyasına yazar

Sadece yapılandırma üretip servisleri kendiniz başlatmak isterseniz `--start` olmadan çalıştırın. Mevcut bir kurulumun üzerine yazmak için `--force` gerekir; betik varsayılan olarak mevcut `.env` dosyalarını korur.

Bittiğinde: **http://localhost:8080** — kullanıcı adı `admin`, parola `LOGIN_BILGILERI.txt` içinde.

### Elle kurulum

`bootstrap.js`'in ne yaptığını görmek veya adımları ayrı ayrı çalıştırmak isterseniz:

**1. Ağ kimliğini üret ve zinciri başlat.** `besu-net` ağını bu adım oluşturur; `db`, `app` ve `contract` ona `external` olarak bağlanır, bu yüzden **ilk bu çalışmalıdır**.

```bash
cd blockchain-network && npm install && node generate-network.js && docker compose up -d
```

**2. Veritabanı parolasını üret ve başlat.**

```bash
cd ../db && cp .env.example .env
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Çıkan değeri `db/.env` içindeki `POSTGRES_PASSWORD=` satırına yazın, sonra:

```bash
docker compose up -d --build
```

**3. Deployer anahtarını üret.**

```bash
cd ../contract && npm install && cp .env.example .env && npm run genkey
```

Ekrana basılan private key'i `contract/.env` içine `DEPLOYER_PRIVATE_KEY=` olarak yapıştırın. (`genkey` anahtarı yazdırır, dosyaya yazmaz.)

**4. `app/.env` dosyasını doldurun.** Bu adım sözleşme dağıtımından **önce** gelmelidir; dağıtım `CONTRACT_ADDRESS` satırını bu dosyaya yazar.

```bash
cd ../app && cp .env.example .env
node -e "const c=require('crypto');console.log('API_KEYS=dashboard:writer:'+c.randomBytes(32).toString('hex')+',audit:reader:'+c.randomBytes(32).toString('hex'))"
node -e "console.log('JWT_SECRET='+require('crypto').randomBytes(48).toString('base64url'))"
node -e "const c=require('crypto');console.log('SEED_ADMIN_PASSWORD='+c.randomBytes(15).toString('base64url'));console.log('SEED_VIEWER_PASSWORD='+c.randomBytes(15).toString('base64url'))"
```

Doldurulacaklar:

| Değişken | Değer |
|---|---|
| `DATABASE_URL` | `postgresql://appuser:PAROLA@postgres_db:5432/appdb` — **parola 2. adımdakiyle aynı olmalı** |
| `PRIVATE_KEY` | **3. adımdaki anahtarın aynısı** |
| `API_KEYS`, `JWT_SECRET`, `SEED_ADMIN_PASSWORD`, `SEED_VIEWER_PASSWORD` | Yukarıdaki komutların çıktıları |
| `CONTRACT_ADDRESS` | Boş bırakın; 5. adım dolduracak |

> **Bu iki senkron noktası kurulumun en kırılgan yeridir.** Veritabanı parolası `db/.env` ile `app/.env`'de, deployer anahtarı `contract/.env` ile `app/.env`'de birebir aynı olmalıdır. `bootstrap.js` tam olarak bu yüzden var.

**5. Sözleşmeyi dağıt.**

```bash
cd ../contract && docker compose up --build
```

`app/.env` içindeki `CONTRACT_ADDRESS` otomatik güncellenir (yedek: `.env.bak`).

**6. Backend ve frontend'i başlat.**

```bash
cd ../app && docker compose up -d --build
cd ../frontend && docker compose up -d --build
```

`frontend/.env` isteğe bağlıdır; `VITE_API_URL` hem compose hem Dockerfile içinde `/api` varsayılanına sahiptir.

**7. Giriş yapın.** http://localhost:8080 adresine gidin ve `admin` + `SEED_ADMIN_PASSWORD` ile oturum açın.

---

## Giriş ve oturum

Uygulama bir giriş ekranının arkasındadır. İlk açılışta, `users` tablosu boşsa backend `app/.env` içindeki `SEED_*` değişkenlerinden iki hesap oluşturur:

| Kullanıcı | Rol | Yapabildikleri |
|---|---|---|
| `admin` | `writer` | Kayıt ekler + doğrular |
| `viewer` | `reader` | Yalnızca doğrular; "Add" sekmesi hiç görünmez |

Parolalar bcrypt (cost 12) ile hash'lenir; düz metin hiçbir yerde saklanmaz. Tabloda tek bir kullanıcı bile varsa seed çalışmaz — mevcut parolalar asla ezilmez.

Yeni kullanıcı eklemek için (parola ekrana yazılmadan sorulur):

```bash
docker exec -it backend-api node scripts/create-user.js muhasebe reader
```

**Oturum nasıl taşınır:** giriş başarılı olunca backend, JWT'yi `httpOnly` + `SameSite=Strict` bir cookie'ye yazar. JavaScript bu token'a erişemez, dolayısıyla bir XSS açığı onu çalamaz. Arayüz ve API aynı origin'dedir (nginx `/api` isteklerini backend'e proxy'ler), bu yüzden CORS devrede değildir.

Cookie tarayıcı tarafından otomatik gönderildiği için CSRF riski doğar; iki katmanla engellenir: `SameSite=Strict` ve çift gönderim. Token'ın içinde rastgele bir `csrf` değeri vardır, aynı değer okunabilir bir `csrf_token` cookie'sine yazılır; yazma istekleri bunu `X-CSRF-Token` başlığında geri göndermek zorundadır.

HTTPS arkasına alırken `app/.env` içinde `COOKIE_SECURE=true` yapın. Düz HTTP'de `true` olursa tarayıcı cookie'yi hiç saklamaz ve giriş çalışmaz.

Giriş ucu 15 dakikada 10 denemeyle sınırlıdır ve başarılı girişler sayaca dahil edilmez. Yanlış parola ile olmayan kullanıcı **aynı** mesajı ve benzer yanıt süresini üretir, böylece kullanıcı adı numaralandırılamaz.

## Makine istemcileri için API anahtarları

Tarayıcı dışı istemciler (script, entegrasyon) giriş yapmak yerine `X-API-Key` başlığı kullanır. `/health` her iki yöntemden de muaftır.

Anahtarlar `app/.env` içindeki `API_KEYS` değişkeninde `isim:rol:anahtar` üçlüleri olarak tanımlanır:

```env
API_KEYS=dashboard:writer:<64-hane-hex>,audit:reader:<64-hane-hex>
```

| Rol | Okuma (`GET /api/records`, `/api/verify`) | Yazma (`POST /api/records`) |
|---|---|---|
| `reader` | ✅ | ❌ 403 |
| `writer` | ✅ | ✅ |

En az bir `writer` tanımlı olmalıdır, yoksa servis başlamaz. Anahtar üretmek için:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Denetim izi (kaynak takibi)

`hash_anchors.created_by`, kaydı kimin eklediğini gösterir:

| Değer | Kaynak |
|---|---|
| `user:admin` | Arayüzden giriş yapmış kullanıcı |
| `api:dashboard` | API anahtarı kullanan makine istemcisi |
| `direct-sql` | Doğrudan veritabanına yazılmış (API atlanmış) |
| `system-sync` | Başlangıç senkronizasyonunda mühürlenmiş |

Bu bilgi, INSERT'i saran işlemde bir oturum değişkenine yazılır; trigger onu bildirim yüküne koyar. Mühür hash'ini **etkilemez** — `content` alanına dokunulmaz.

```bash
curl -H "X-API-Key: $WRITER_KEY" http://localhost:8080/api/records/product
```

Arayüz açılışta `/api/auth/me` çağırarak kimliğini ve rolünü öğrenir.

## API yanıt biçimi

Başarılı yanıtlar:

```json
{ "success": true, "data": { ... } }
```

Hatalı yanıtlar — ham veritabanı/zincir hataları asla dışarı sızmaz, sunucu logunda `ref` ile bulunur:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "ref": "a1b2c3d4", "details": [ ... ] } }
```

| Durum | Kod | Anlamı |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Alan eksik/yanlış tipte; `details` alan bazlı hataları taşır |
| 401 | `AUTHENTICATION_ERROR` | Anahtar yok veya geçersiz |
| 403 | `AUTHORIZATION_ERROR` | Rol yetersiz |
| 404 | `NOT_FOUND` | Tablo, kayıt veya rota yok |
| 409 | `CONFLICT` | Aynı değerlerle kayıt zaten var |
| 429 | `RATE_LIMITED` | Dakikalık limit aşıldı (okuma 60, yazma 10) |
| 503 | `DATABASE_UNAVAILABLE` / `BLOCKCHAIN_UNAVAILABLE` / `CONTRACT_NOT_DEPLOYED` | Bağımlı servis geçici olarak erişilemez |
| 500 | `INTERNAL_ERROR` | Beklenmeyen hata |

**Doğrulama sonucu bir hata değil, bir bulgudur.** `/api/verify` istek işlendiği sürece 200 döner; sonuç `data.status` alanındadır:

| `status` | Anlamı |
|---|---|
| `SECURE` | İçerik zincirdeki mühürle birebir aynı |
| `TAMPERED` | İçerik değiştirilmiş |
| `FORGED_TX` | `tx_hash` bu zincirde geçerli bir mühür değil |
| `ANCHOR_MISSING` | Mühür kaydı var ama zincirde karşılığı yok |
| `PENDING` | Kayıt henüz mühürlenmemiş (işlem sürüyor olabilir) |

## Servisleri durdurma

```bash
cd frontend && docker compose down
cd ../app && docker compose down
cd ../db && docker compose down
cd ../blockchain-network && docker compose down
```

Zincir verisini de silmek için son komuta `-v` ekleyin. Bu, tüm mühürleri kalıcı olarak siler.

## Ortam değişkenleri

Her bileşenin `.env.example` dosyası, doldurulması gereken alanları açıklar:

| Dosya | İçerik |
|---|---|
| `blockchain-network/.env` | Bootnode enode listesi (otomatik üretilir) |
| `db/.env` | Postgres kullanıcı adı / parola |
| `contract/.env` | Deployer private key, RPC adresi |
| `app/.env` | DB bağlantısı, RPC, imzalama anahtarı, API anahtarları/rolleri, CORS origin |
| `frontend/.env` | Yalnızca API yolu (`/api`). Hiçbir sır içermez. |

## Veritabanı şeması değişiklikleri

`db/init.sql` yalnızca **boş** bir veri dizininde çalışır. Zaten ayakta olan bir veritabanına şema değişikliği uygulamak için `db/migrations/` altındaki dosyaları sırayla elle çalıştırın:

```bash
docker exec -i postgres_db psql -U appuser -d appdb < db/migrations/001_notify_client_name.sql
```
