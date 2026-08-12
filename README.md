# Permissioned Blockchain Network - Docker Kurulum Rehberi

Bu proje, Hyperledger Besu tabanlı bir blokzincir ağı, PostgreSQL veritabanı, Node.js backend ve bir frontend uygulamasından oluşan dağıtık bir mimariye sahiptir. Projenin her bir bileşeni kendi `docker-compose.yml` dosyasına sahip olup ayrı ayrı ayağa kaldırılabilir.

## Ön Koşullar
- Sisteminize [Docker](https://docs.docker.com/get-docker/) ve [Docker Compose](https://docs.docker.com/compose/install/)'un kurulu olduğundan emin olun.

## Adım Adım Çalıştırma Rehberi

Projeyi ayağa kaldırmak için terminalinizden sırasıyla aşağıdaki adımları uygulayın:

### 1. Blokzincir Ağını Başlatma
Hyperledger Besu tabanlı 4 validatör nodunu ayağa kaldırır.
```bash
cd blockchain-network
docker-compose up -d
```

### 2. Veritabanını Başlatma
PostgreSQL veritabanını ayağa kaldırır.
```bash
cd ../db
docker-compose up -d
```
*(Port: `5432`, Veritabanı: `appdb`)*

### 3. Backend (API) Uygulamasını Başlatma
Veritabanı ve blokzincir ile iletişim kuran backend servisini ayağa kaldırır.
```bash
cd ../app
docker-compose up -d
```
*(Port: `3000`)*

### 4. Frontend Uygulamasını Başlatma
Kullanıcı arayüzünü sunan web sunucusunu ayağa kaldırır.
```bash
cd ../frontend
docker-compose up -d
```
*(Uygulamaya tarayıcınızdan `http://localhost:8080` adresinden erişebilirsiniz)*

---

## Konteynerleri Durdurma
Tüm servisleri durdurmak için ilgili dizinlere gidip `docker-compose down` komutunu çalıştırabilirsiniz:
```bash
cd blockchain-network && docker-compose down
cd ../db && docker-compose down
cd ../app && docker-compose down
cd ../frontend && docker-compose down
```

## Frontend Uygulamasına Erişim

Frontend servisi ayağa kalktıktan sonra, uygulamanın kullanıcı arayüzüne ulaşmak için web tarayıcınızı  açın ve aşağıdaki adrese gidin:

**[http://localhost:8080](http://localhost:8080)**

Uygulamanız tarayıcıda bu adres üzerinden sorunsuz olarak çalışmaya başlayacaktır.
