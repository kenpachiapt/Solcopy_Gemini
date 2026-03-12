# Solana Pro Copy Trader 🚀

Solana ağında profesyonel cüzdan takibi ve otomatik kopya işlem (copy trading) botu. Bu uygulama, belirlediğiniz cüzdanları gerçek zamanlı olarak izler ve Jupiter API aracılığıyla aynı işlemleri otomatik olarak gerçekleştirir.

## 🌟 Özellikler

- **Gerçek Zamanlı İzleme:** Solana RPC üzerinden cüzdan hareketlerinin anlık takibi.
- **Dinamik Kopyalama:** Orijinal işlemden kayma (slippage) ve öncelik ücretlerini otomatik kopyalama seçeneği.
- **Profesyonel Panel:** İşlem geçmişi, performans grafikleri ve aktif hedef yönetimi.
- **Güvenli Depolama:** SQLite veritabanı ile cüzdan ve işlem verilerinin yerel olarak saklanması.
- **Esnek Ayarlar:** Özel alım miktarları, zarar durdur (stop loss) ve öncelik ücreti ayarları.

## 🛠 Ubuntu 22.04 Kurulum Rehberi (Adım Adım)

Sistemin sürekli çalışması için aşağıdaki adımları sırasıyla uygulayın.

### 1. Sistemi Güncelleyin
Terminali açın ve şu komutu yapıştırın:
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Node.js Kurulumu
Uygulamanın çalışması için gerekli olan Node.js'i yükleyelim:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Projeyi İndirin
Projeyi sunucunuza çekin:
```bash
git clone <buraya-repo-linkini-yazın>
cd solana-pro-copy-trader
```

### 4. Bağımlılıkları Yükleyin
Gerekli kütüphaneleri yükleyelim:
```bash
npm install
```

### 5. Uygulamayı Derleyin (Build)
Arayüzün hazır hale gelmesi için:
```bash
npm run build
```

### 6. PM2 Kurulumu (Sürekli Çalışması İçin)
Botun siz terminali kapatsanız bile çalışmaya devam etmesi için PM2 kullanalım:
```bash
sudo npm install -g pm2
```

### 7. Botu Başlatın
Botu PM2 ile arka planda başlatın:
```bash
pm2 start "npx tsx server.ts" --name solana-bot
```

### 8. Otomatik Başlatma Ayarı
Sunucu yeniden başlarsa botun otomatik açılması için:
```bash
pm2 startup
# (Ekrana gelen komutu kopyalayıp çalıştırın)
pm2 save
```

## ⚙️ Kullanım ve Ayarlar

1. **Cüzdan Ekle:** Paneldeki "Takip Edilen Cüzdanlar" bölümüne gidin ve takip etmek istediğiniz Solana adreslerini ekleyin.
2. **Bot Ayarları:** "Ayarlar" sekmesinden:
   - **Varsayılan Alım Miktarı:** Her işlemde kaç SOL kullanılacağı.
   - **Maksimum Kayma:** Boş bırakılırsa orijinal işlemin değerini kopyalar.
   - **Öncelik Ücreti:** Boş bırakılırsa ağ ücretini otomatik ayarlar.
3. **İzleme:** Bot çalışmaya başladığında, takip edilen cüzdanların her "Swap" işlemi otomatik kopyalanır ve "İşlem Geçmişi"nde görünür.

## ⚠️ Önemli Uyarı
Bu yazılım eğitim ve araştırma amaçlıdır. Kripto para işlemleri yüksek risk içerir. Gerçek cüzdan ve anahtarlarınızı kullanmadan önce test ağlarında denemeniz önerilir.

## 📄 Lisans
Bu proje MIT Lisansı ile lisanslanmıştır.
