# Solana Pro Copy Trader 🚀

Professional wallet tracking and automated copy trading bot on the Solana network. This application monitors specified wallets in real-time and automatically executes the same trades via the Jupiter API.

## 🌟 Features

- **Real-time Monitoring:** Instant tracking of wallet movements via Solana RPC.
- **Dynamic Copying:** Option to automatically copy slippage and priority fees from the original transaction.
- **Professional Dashboard:** Trade history, performance charts, and active target management.
- **Secure Storage:** Local storage of wallet and trade data using SQLite database.
- **Flexible Settings:** Custom buy amounts, stop loss, and priority fee settings.

## 🛠 Installation Steps

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or later)
- A Solana RPC URL (Helius, QuickNode, or Alchemy recommended)
- A Solana Wallet (Private Key) for transactions

### 2. Clone the Project
```bash
git clone <repository-url>
cd solana-pro-copy-trader
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
Copy the `.env.example` file to `.env` and fill in the required fields:
```env
SOLANA_RPC=https://api.mainnet-beta.solana.com
PRIVATE_KEY=your_wallet_private_key_here
TELEGRAM_BOT_TOKEN=optional_for_notifications
```

### 5. Start the Application
```bash
npm run dev
```
The application will run at `http://localhost:3000` by default.

## ⚙️ Configuration and Usage

1. **Add Wallet:** Go to the "Tracked Wallets" section on the dashboard and add the Solana addresses you want to follow.
2. **Bot Settings:** From the "Settings" tab:
   - **Default Buy Amount:** The amount of SOL to be used in each copy trade.
   - **Max Slippage:** If left empty, it copies the slippage value of the original transaction.
   - **Priority Fee:** If left empty, it copies the network fee of the original transaction.
3. **Monitoring:** Once the bot starts running, every "Swap" transaction from the tracked wallets will be automatically copied and appear in the "Trade History" section.

## ⚠️ Important Warning
This software is for educational and research purposes. Cryptocurrency transactions involve high risk. It is recommended to try on test networks before using real wallets and keys.

## 📄 License
This project is licensed under the MIT License.
