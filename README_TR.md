# Solana Pro Copy Trader 🚀

Solana ağında profesyonel cüzdan takibi ve otomatik kopyalama (copy trading) botu. Bu uygulama, belirlediğiniz cüzdanların işlemlerini gerçek zamanlı olarak izler ve aynı işlemleri Jupiter API üzerinden otomatik olarak gerçekleştirir.

## 🌟 Özellikler

- **Gerçek Zamanlı İzleme:** Solana RPC üzerinden cüzdan hareketlerini anlık takip.
- **Dinamik Kopyalama:** Orijinal işlemdeki slippage ve öncelik ücretini (priority fee) otomatik kopyalama seçeneği.
- **Profesyonel Dashboard:** İşlem geçmişi, performans grafikleri ve aktif hedef yönetimi.
- **Güvenli Depolama:** SQLite veritabanı ile cüzdan ve işlem verilerinin yerel saklanması.
- **Esnek Ayarlar:** Alım miktarı, stop loss ve özel fee ayarları.

## 🛠 Kurulum Adımları

### 1. Gereksinimler
- [Node.js](https://nodejs.org/) (v18 veya üzeri)
- Bir Solana RPC URL'si (Helius, QuickNode veya Alchemy önerilir)
- İşlemler için bir Solana Cüzdanı (Private Key)

### 2. Projeyi Klonlayın
```bash
git clone <repository-url>
cd solana-pro-copy-trader
```

### 3. Bağımlılıkları Yükleyin
```bash
npm install
```

### 4. Çevresel Değişkenleri Yapılandırın
`.env.example` dosyasını `.env` olarak kopyalayın ve gerekli alanları doldurun:
```env
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PRIVATE_KEY=cüzdan_private_keyiniz_buraya
TELEGRAM_BOT_TOKEN=isteğe_bağlı_bildirimler_için
```

### 5. Uygulamayı Başlatın
```bash
npm run dev
```
Uygulama varsayılan olarak `http://localhost:3000` adresinde çalışacaktır.

## ⚙️ Yapılandırma ve Kullanım

1. **Cüzdan Ekleme:** Dashboard üzerinden "Tracked Wallets" kısmına giderek takip etmek istediğiniz Solana adreslerini ekleyin.
2. **Bot Ayarları:** "Settings" sekmesinden:
   - **Default Buy Amount:** Her kopyalama işleminde kullanılacak SOL miktarı.
   - **Max Slippage:** Boş bırakırsanız orijinal işlemin slippage değerini kopyalar.
   - **Priority Fee:** Boş bırakırsanız orijinal işlemin ağ ücretini kopyalar.
3. **İzleme:** Bot çalışmaya başladığında, takip edilen cüzdanlardan gelen her "Swap" işlemi otomatik olarak kopyalanacak ve "Trade History" kısmında görünecektir.

## ⚠️ Önemli Uyarı
Bu yazılım eğitim ve araştırma amaçlıdır. Kripto para işlemleri yüksek risk içerir. Gerçek cüzdan ve anahtarlarınızı kullanmadan önce test ağlarında deneme yapmanız önerilir.

## 📄 Lisans
Bu proje MIT lisansı ile lisanslanmıştır.
