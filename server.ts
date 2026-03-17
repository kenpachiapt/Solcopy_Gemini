import express from "express";
import { createServer as createViteServer } from "vite";
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, VersionedTransaction, SendTransactionError } from "@solana/web3.js";
import { Telegraf } from "telegraf";
import Database from "better-sqlite3";
import axios from "axios";
import bs58 from "bs58";
import BigNumber from "bignumber.js";
import { format } from "date-fns";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const db = new Database("trading.db");

// API Router Definition (Early)
const apiRouter = express.Router();

// Request Logger for API - Moved to top of router
apiRouter.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] API ROUTER MATCH: ${req.method} ${req.url}`);
  next();
});

// Global Middleware
app.use(express.json());
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] GLOBAL API REQUEST: ${req.method} ${req.url}`);
    // Force JSON content type for all /api requests
    res.setHeader('Content-Type', 'application/json');
  }
  next();
});

// Mount API Router early to ensure it takes precedence
// REMOVED FROM HERE - MOVED TO BOTTOM

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS tracked_wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT UNIQUE NOT NULL,
    label TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    token_mint TEXT NOT NULL,
    token_symbol TEXT,
    side TEXT NOT NULL, -- 'buy' or 'sell'
    amount_sol REAL,
    amount_token REAL,
    price_sol REAL,
    tx_hash TEXT UNIQUE,
    original_tx_hash TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    slippage REAL,
    fee REAL,
    route TEXT,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: Add original_tx_hash if it doesn't exist
try {
  const columns = db.prepare("PRAGMA table_info(trades)").all() as any[];
  const hasOriginalTxHash = columns.some(c => c.name === 'original_tx_hash');
  if (!hasOriginalTxHash) {
    db.prepare("ALTER TABLE trades ADD COLUMN original_tx_hash TEXT").run();
    console.log("✅ Migration: Added original_tx_hash column to trades table");
  }
} catch (e) {
  console.error("Migration error:", e);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_mint TEXT UNIQUE NOT NULL,
    token_symbol TEXT,
    amount REAL DEFAULT 0,
    amount_raw TEXT DEFAULT '0',
    decimals INTEGER DEFAULT 0,
    entry_price REAL,
    highest_price REAL,
    stop_loss_percent REAL DEFAULT 10,
    is_active INTEGER DEFAULT 1,
    last_tx_hash TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS processed_signatures (
    signature TEXT PRIMARY KEY,
    wallet_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet_address);
  CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(token_mint);
`);

// Solana Connection Helper
const getConnection = () => {
  const rpcSetting = db.prepare("SELECT value FROM settings WHERE key = 'solana_rpc'").get() as { value: string } | undefined;
  const rpcUrl = rpcSetting?.value || process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
  return new Connection(rpcUrl, "confirmed");
};

let connection = getConnection();

// Telegram Bot
const getTelegramConfig = () => {
  const settings = db.prepare("SELECT * FROM settings WHERE key IN ('telegram_token', 'telegram_chat_id')").all() as { key: string, value: string }[];
  const config = settings.reduce((acc: any, curr: any) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});
  return {
    token: config.telegram_token || process.env.TELEGRAM_BOT_TOKEN,
    chatId: config.telegram_chat_id || process.env.TELEGRAM_CHAT_ID
  };
};

const sendTelegramMessage = async (message: string) => {
  const { token, chatId } = getTelegramConfig();
  if (!token || !chatId) return;

  try {
    const tempBot = new Telegraf(token);
    await tempBot.telegram.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    console.error("Telegram error:", error);
  }
};

// Utils
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withRpcRetry = async <T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 2000
): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ RPC attempt ${i + 1} failed:`, error instanceof Error ? error.message : String(error));
      if (i < retries - 1) await sleep(delay);
    }
  }
  throw lastError;
};

const getSettingsMap = () => {
  const settings = db.prepare("SELECT * FROM settings").all() as { key: string, value: string }[];
  return settings.reduce((acc: any, curr: any) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});
};

const SOL_MINT = "So11111111111111111111111111111111111111112";
const STABLECOINS = [
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaDCSTMdJZYicmcXhqR3RDfCi7Gjvn8iZp47b", // USDT
  SOL_MINT, // WSOL
];

const getErrorMessage = (error: any) => {
  if (error instanceof SendTransactionError) {
    const logs = error.logs ? error.logs.join("\n") : "No logs available";
    if (logs.includes("0x1771") || logs.includes("6001")) {
      return "Slippage tolerance exceeded (0x1771). The price moved too much during the swap.";
    }
    return `Transaction simulation failed: ${error.message}\nLogs:\n${logs}`;
  }
  
  const msg = error?.response?.data?.error || error?.response?.data?.message || error?.message || "Unknown error";
  if (typeof msg === 'string' && (msg.includes("0x1771") || msg.includes("6001"))) {
    return "Slippage tolerance exceeded (0x1771). The price moved too much during the swap.";
  }
  return msg;
};

// Position Management
type PositionRow = {
  id: number;
  token_mint: string;
  token_symbol: string | null;
  amount: number;
  amount_raw: string;
  decimals: number;
  entry_price: number | null;
  highest_price: number | null;
  stop_loss_percent: number;
  is_active: number;
  last_tx_hash: string | null;
};

const getPosition = (tokenMint: string): PositionRow | undefined => {
  return db.prepare("SELECT * FROM positions WHERE token_mint = ?").get(tokenMint) as PositionRow | undefined;
};

const upsertPositionAfterBuy = (params: {
  tokenMint: string;
  tokenSymbol?: string | null;
  decimals: number;
  boughtRaw: string;
  spentSol: number;
  txid: string;
}) => {
  const existing = getPosition(params.tokenMint);
  const boughtRawBN = new BigNumber(params.boughtRaw);
  const boughtUi = boughtRawBN.dividedBy(new BigNumber(10).pow(params.decimals));
  const unitPriceSol = boughtUi.gt(0) ? new BigNumber(params.spentSol).div(boughtUi) : new BigNumber(0);

  if (!existing) {
    db.prepare(`
      INSERT INTO positions (
        token_mint, token_symbol, amount, amount_raw, decimals,
        entry_price, highest_price, stop_loss_percent, is_active, last_tx_hash, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
    `).run(
      params.tokenMint,
      params.tokenSymbol || null,
      boughtUi.toNumber(),
      boughtRawBN.toFixed(0),
      params.decimals,
      unitPriceSol.toNumber(),
      unitPriceSol.toNumber(),
      10,
      params.txid
    );
    return;
  }

  const oldRaw = new BigNumber(existing.amount_raw || "0");
  const newRaw = oldRaw.plus(boughtRawBN);
  const oldUi = new BigNumber(existing.amount || 0);
  const newUi = newRaw.dividedBy(new BigNumber(10).pow(params.decimals));

  let newEntryPrice = unitPriceSol.toNumber();
  if (existing.entry_price && oldUi.gt(0) && newUi.gt(0)) {
    const oldCost = oldUi.times(existing.entry_price);
    const newCost = boughtUi.times(unitPriceSol);
    newEntryPrice = oldCost.plus(newCost).div(newUi).toNumber();
  }

  const highestPrice = Math.max(existing.highest_price || 0, newEntryPrice);

  db.prepare(`
    UPDATE positions
    SET token_symbol = ?,
        amount = ?,
        amount_raw = ?,
        decimals = ?,
        entry_price = ?,
        highest_price = ?,
        is_active = 1,
        last_tx_hash = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE token_mint = ?
  `).run(
    params.tokenSymbol || existing.token_symbol,
    newUi.toNumber(),
    newRaw.toFixed(0),
    params.decimals,
    newEntryPrice,
    highestPrice,
    params.txid,
    params.tokenMint
  );
};

const updatePositionAfterSell = (params: {
  tokenMint: string;
  soldRaw: string;
  txid: string;
}) => {
  const existing = getPosition(params.tokenMint);
  if (!existing) return;

  const decimals = existing.decimals || 0;
  const oldRaw = new BigNumber(existing.amount_raw || "0");
  const soldRaw = new BigNumber(params.soldRaw);
  const newRaw = BigNumber.maximum(oldRaw.minus(soldRaw), 0);
  const newUi = newRaw.dividedBy(new BigNumber(10).pow(decimals));
  const isActive = newRaw.gt(0) ? 1 : 0;

  db.prepare(`
    UPDATE positions
    SET amount = ?,
        amount_raw = ?,
        is_active = ?,
        last_tx_hash = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE token_mint = ?
  `).run(newUi.toNumber(), newRaw.toFixed(0), isActive, params.txid, params.tokenMint);
};

// Wallet Monitoring Logic
const activeSubscriptions: Map<string, number> = new Map();

const stopMonitoring = () => {
  console.log("🛑 Stopping all monitoring...");
  for (const [address, subId] of activeSubscriptions.entries()) {
    try {
      connection.removeOnLogsListener(subId);
    } catch (e) {
      console.error(`Failed to remove listener for ${address}:`, e);
    }
  }
  activeSubscriptions.clear();
};

const startMonitoring = async () => {
  // Check global bot status
  const botStatus = db.prepare("SELECT value FROM settings WHERE key = 'bot_enabled'").get() as { value: string } | undefined;
  const isBotEnabled = botStatus ? botStatus.value === "true" : true; // Default to true

  if (!isBotEnabled) {
    console.log("ℹ️ Bot is globally disabled. Stopping all monitoring.");
    stopMonitoring();
    return;
  }

  const wallets = db.prepare("SELECT address FROM tracked_wallets WHERE is_active = 1").all() as { address: string }[];
  const activeAddresses = new Set(wallets.map(w => w.address));

  // Stop monitoring for wallets that are no longer active or removed
  for (const [address, subId] of activeSubscriptions.entries()) {
    if (!activeAddresses.has(address)) {
      try {
        connection.removeOnLogsListener(subId);
        activeSubscriptions.delete(address);
        console.log(`🛑 Stopped monitoring for: ${address}`);
      } catch (e) {
        console.error(`Failed to remove listener for ${address}:`, e);
      }
    }
  }

  // Start monitoring for new active wallets
  for (const wallet of wallets) {
    if (!activeSubscriptions.has(wallet.address)) {
      try {
        const pubkey = new PublicKey(wallet.address);
        const subId = connection.onLogs(pubkey, async (logs, ctx) => {
          console.log(`⚡ Activity detected on wallet: ${wallet.address} | Sig: ${logs.signature}`);
          await processTransaction(logs.signature, wallet.address);
        }, "confirmed");
        activeSubscriptions.set(wallet.address, subId);
        console.log(`✅ Monitoring started for: ${wallet.address}`);
      } catch (error) {
        console.error(`❌ Failed to monitor ${wallet.address}:`, error);
      }
    }
  }
};

// Copy trade logic
const executeCopyTrade = async (originalTx: any, walletAddress: string, currentConnection: Connection, originalSignature: string) => {
  const settingsMap = getSettingsMap();

  const tradingKey = settingsMap.trading_keypair || process.env.PRIVATE_KEY || process.env.TRADING_KEYPAIR;
  if (!tradingKey) {
    console.log("⚠️ Trading keypair not set. Skipping copy trade.");
    return;
  }

  let tokenMint = 'Unknown';
  let isBuy = true;

  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(tradingKey));
    const traderPubkey = keypair.publicKey;
    
    // 1. Extract Token and Amount from original transaction
    const postTokenBalances = originalTx.meta.postTokenBalances || [];
    const preTokenBalances = originalTx.meta.preTokenBalances || [];
    
    console.log(`🔍 Analyzing token balances for ${walletAddress}...`);

    const tokenChanges = postTokenBalances.filter((post: any) => {
      const pre = preTokenBalances.find((p: any) => p.accountIndex === post.accountIndex);
      return post.owner === walletAddress && (!pre || post.uiTokenAmount.amount !== pre.uiTokenAmount.amount);
    });

    if (tokenChanges.length === 0) {
      console.log("⚠️ No token balance changes found for this wallet. Skipping.");
      return;
    }

    let tokenChange = tokenChanges.find((tc: any) => !STABLECOINS.includes(tc.mint)) || tokenChanges[0];
    tokenMint = tokenChange.mint;
    
    const preEntry = preTokenBalances.find((p: any) => p.accountIndex === tokenChange.accountIndex);
    const preAmountRaw = new BigNumber(preEntry?.uiTokenAmount?.amount || "0");
    const postAmountRaw = new BigNumber(tokenChange.uiTokenAmount.amount);
    const decimals = tokenChange.uiTokenAmount.decimals;
    
    isBuy = postAmountRaw.gt(preAmountRaw);
    console.log(`ℹ️ Detected ${isBuy ? "BUY" : "SELL"} for token: ${tokenMint}`);

    // Calculate Buy Amount
    let buyAmountSol = 0.1; 
    if (settingsMap.buy_amount && settingsMap.buy_amount.trim() !== "") {
      buyAmountSol = parseFloat(settingsMap.buy_amount);
      console.log(`ℹ️ Using custom buy amount: ${buyAmountSol} SOL`);
    } else {
      const accountKeys = originalTx.transaction.message.accountKeys;
      const walletIndex = accountKeys.findIndex((k: any) => {
        const pk = k.pubkey ? k.pubkey.toString() : k.toString();
        return pk === walletAddress;
      });

      if (walletIndex !== -1) {
        const preBal = originalTx.meta.preBalances[walletIndex];
        const postBal = originalTx.meta.postBalances[walletIndex];
        buyAmountSol = Math.abs(preBal - postBal) / LAMPORTS_PER_SOL;
        if (isBuy) buyAmountSol -= (originalTx.meta.fee / LAMPORTS_PER_SOL);
      }
      console.log(`ℹ️ Buy amount empty, copying original transaction amount: ${buyAmountSol.toFixed(4)} SOL`);
    }

    // Balance check and adjustment
    const balance = await currentConnection.getBalance(traderPubkey);
    const minSolReserve = parseFloat(settingsMap.min_sol_reserve || "0.02");
    const availableSol = (balance / LAMPORTS_PER_SOL) - minSolReserve;

    if (isBuy) {
      if (buyAmountSol > availableSol) {
        console.log(`⚠️ Insufficient balance for buy. Available: ${availableSol.toFixed(4)} SOL, Needed: ${buyAmountSol.toFixed(4)} SOL. Adjusting to available.`);
        buyAmountSol = availableSol;
      }
      
      const minTradeSol = parseFloat(settingsMap.min_trade_sol || "0.01");
      if (buyAmountSol < minTradeSol) {
        console.log(`⚠️ Adjusted buy amount (${buyAmountSol.toFixed(4)} SOL) is below min_trade_sol (${minTradeSol} SOL). Skipping.`);
        return;
      }
    } else {
      // For sells, ensure we have at least enough for fees
      if (availableSol < 0.005) {
        console.log(`⚠️ Extremely low SOL balance (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL). Sell might fail due to fees.`);
      }
    }

    let slippageBps = 100; // Default 1%
    if (settingsMap.max_slippage && settingsMap.max_slippage.trim() !== "") {
      slippageBps = Math.floor(parseFloat(settingsMap.max_slippage) * 100);
    }

    // Increase slippage for sells to ensure execution as requested
    if (!isBuy) {
      const sellSlippageIncrease = 1000; // Add 10% extra slippage for sells
      slippageBps += sellSlippageIncrease;
      console.log(`ℹ️ Sell detected: Increased slippage to ${slippageBps / 100}% to ensure execution.`);
    }

    let prioritizationFeeLamports: number | "auto" = "auto";
    if (settingsMap.priority_fee && settingsMap.priority_fee.trim() !== "") {
      prioritizationFeeLamports = Math.floor(parseFloat(settingsMap.priority_fee) * LAMPORTS_PER_SOL);
    }

    const inputMint = isBuy ? SOL_MINT : tokenMint;
    const outputMint = isBuy ? tokenMint : SOL_MINT;

    let amountRawBN = new BigNumber(0);

    if (isBuy) {
      amountRawBN = new BigNumber(Math.floor(buyAmountSol * LAMPORTS_PER_SOL).toString());
    } else {
      // SELL logic: Check our own position
      const position = getPosition(tokenMint);
      if (!position || !position.is_active) {
        console.log(`⚠️ No active position for ${tokenMint}, skipping sell.`);
        return;
      }

      const positionRaw = new BigNumber(position.amount_raw || "0");
      const sellPercent = parseFloat(settingsMap.sell_percent || "100");
      amountRawBN = positionRaw.times(sellPercent).div(100).integerValue(BigNumber.ROUND_FLOOR);

      if (amountRawBN.lte(0)) {
        console.log("⚠️ Calculated sell amount is zero. Skipping.");
        return;
      }

      // Double check actual wallet balance
      const traderTokenAccounts = await currentConnection.getParsedTokenAccountsByOwner(
        traderPubkey,
        { mint: new PublicKey(tokenMint) },
        "confirmed"
      );

      const actualWalletRaw = traderTokenAccounts.value.reduce((sum, acc) => {
        const raw = new BigNumber(acc.account.data.parsed.info.tokenAmount.amount || "0");
        return sum.plus(raw);
      }, new BigNumber(0));

      if (actualWalletRaw.lt(amountRawBN)) {
        console.log(`⚠️ Actual balance (${actualWalletRaw.toFixed()}) is less than intended sell (${amountRawBN.toFixed()}). Adjusting.`);
        amountRawBN = actualWalletRaw;
      }
    }

    if (amountRawBN.lte(0)) {
      throw new Error("Calculated swap amount is zero");
    }

    console.log(`🎯 Executing ${isBuy ? "BUY" : "SELL"} | Token: ${tokenMint} | Amount: ${amountRawBN.toFixed(0)} raw units`);

    const jupApiKey = settingsMap.jupiter_api_key || process.env.JUPITER_API_KEY;
    const jupBaseUrl = "https://api.jup.ag";

    const headers: any = { 'Accept': 'application/json' };
    if (jupApiKey) headers['x-api-key'] = jupApiKey;

    const quoteUrl = `${jupBaseUrl}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRawBN.toFixed(0)}&slippageBps=${slippageBps}`;
    console.log(`📡 Fetching quote: ${quoteUrl}`);

    const quoteResponse = await axios.get(quoteUrl, { timeout: 10000, headers });

    if (!quoteResponse.data || !quoteResponse.data.outAmount) {
      throw new Error("Invalid quote response from Jupiter");
    }

    const swapResponse = await axios.post(`${jupBaseUrl}/swap/v1/swap`, {
      quoteResponse: quoteResponse.data,
      userPublicKey: traderPubkey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports
    }, { timeout: 15000, headers });

    if (!swapResponse.data?.swapTransaction) {
      throw new Error("Failed to get swap transaction from Jupiter");
    }

    const transaction = VersionedTransaction.deserialize(Buffer.from(swapResponse.data.swapTransaction, 'base64'));
    const latestBlockhash = await currentConnection.getLatestBlockhash("confirmed");
    transaction.message.recentBlockhash = latestBlockhash.blockhash;
    transaction.sign([keypair]);
    
    console.log(`🚀 Sending transaction with ${slippageBps / 100}% slippage...`);
    const txid = await currentConnection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3
    });
    
    console.log(`⏳ Confirming: ${txid}`);
    const confirmation = await currentConnection.confirmTransaction({
      signature: txid,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    }, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`✅ Confirmed: ${txid}`);

    // Fetch final tx to get actual delta
    const finalTx = await currentConnection.getTransaction(txid, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0
    });

    const traderPostBal = finalTx?.meta?.postTokenBalances?.find(b => b.owner === traderPubkey.toBase58() && b.mint === tokenMint);
    const traderPreBal = finalTx?.meta?.preTokenBalances?.find(b => b.owner === traderPubkey.toBase58() && b.mint === tokenMint);
    const traderDeltaRaw = new BigNumber(traderPostBal?.uiTokenAmount?.amount || "0").minus(new BigNumber(traderPreBal?.uiTokenAmount?.amount || "0")).abs();

    // Record trade
    db.prepare(`
      INSERT INTO trades (
        wallet_address, token_mint, side, amount_sol, amount_token, status, tx_hash, original_tx_hash, fee, slippage
      ) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
    `).run(
      walletAddress,
      tokenMint,
      isBuy ? "buy" : "sell",
      isBuy ? amountRawBN.toNumber() / LAMPORTS_PER_SOL : null,
      traderDeltaRaw.dividedBy(new BigNumber(10).pow(decimals)).toNumber(),
      txid,
      originalSignature,
      (finalTx?.meta?.fee || 0) / LAMPORTS_PER_SOL,
      slippageBps / 100
    );

    // Update position
    if (isBuy) {
      upsertPositionAfterBuy({
        tokenMint,
        decimals,
        boughtRaw: traderDeltaRaw.toFixed(0),
        spentSol: amountRawBN.toNumber() / LAMPORTS_PER_SOL,
        txid
      });
    } else {
      updatePositionAfterSell({
        tokenMint,
        soldRaw: amountRawBN.toFixed(0),
        txid
      });
    }

    await sendTelegramMessage(`✅ *Trade Executed!*\nSide: ${isBuy ? "BUY" : "SELL"}\nToken: \`${tokenMint}\`\nTX: [Solscan](https://solscan.io/tx/${txid})`);

  } catch (error) {
    console.error("Copy trade failed:", error);
    const errMsg = getErrorMessage(error);
    
    // Record failed trade
    try {
      db.prepare(`
        INSERT INTO trades (
          wallet_address, token_mint, side, status, error_message, original_tx_hash
        ) VALUES (?, ?, ?, 'failed', ?, ?)
      `).run(
        walletAddress,
        tokenMint,
        isBuy ? 'buy' : 'sell',
        errMsg,
        originalSignature
      );
    } catch (dbErr) {
      console.error("Failed to record failed trade in DB:", dbErr);
    }

    await sendTelegramMessage(`❌ *Copy Trade Failed*\nError: ${errMsg}`);
  }
};

const processTransaction = async (signature: string, walletAddress: string) => {
  console.log(`🔍 Processing transaction: ${signature} for wallet: ${walletAddress}`);
  
  // Check if already processed
  const alreadyProcessed = db.prepare("SELECT signature FROM processed_signatures WHERE signature = ?").get(signature);
  if (alreadyProcessed) {
    console.log(`ℹ️ Signature ${signature} already processed. Skipping.`);
    return;
  }

  // Initial delay to allow for indexing
  await sleep(1200);

  let tx = null;
  const currentConnection = getConnection();

  try {
    // Increased retries and delay for indexing
    tx = await withRpcRetry(async () => {
      const result = await currentConnection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed"
      });
      if (!result) {
        throw new Error("Transaction not yet indexed");
      }
      return result;
    }, 10, 2500); // 10 retries, 2.5s delay = 25s total

    // Mark as processed
    db.prepare("INSERT OR IGNORE INTO processed_signatures (signature, wallet_address) VALUES (?, ?)").run(signature, walletAddress);

    if (tx.meta?.err) {
      console.log(`⚠️ Original transaction ${signature} failed on-chain. Skipping copy.`);
      return;
    }
  } catch (error) {
    console.error(`❌ Failed to fetch transaction details for ${signature} after retries:`, error);
    return;
  }

  const logs = tx.meta.logMessages || [];
  const programIds = tx.transaction.message.accountKeys.map((k: any) => k.pubkey ? k.pubkey.toString() : k.toString());
  
  // Known DEX Program IDs
  const DEX_PROGRAMS = [
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", // Raydium
    "JUP6LkbZbjS1jKKccR4gc2YEDXAD99D4399e2HBaDbi", // Jupiter V6
    "JUP4b99eR96sS7XmS9y4f2A9T6v48WqTLv7BBPEu38", // Jupiter V4
    "6EF8rrecthR5DkZJvE6zW669X9h2u7536t292L37", // Pump.fun
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc", // Orca
    "CAMMCzoZ7NrM3qGgU2dHnwwRTVYmGSC1nvhvNc9vM7h", // Meteora
    "L33p969p4X3Yp5Gf7f7H7f7H7f7H7f7H7f7H7f7H7f7", // Lifinity
    "FLUXubRmk97VqcyP95f59K73p7c9p9p9p9p9p9p9p", // Fluxbeam
    "PHOENicpXpXpXpXpXpXpXpXpXpXpXpXpXpXpXpXpXpX", // Phoenix
    "srmqPvS2o3Y955vLnWxS4D9S1WpGk9p9p9p9p9p9p9p"  // OpenBook
  ];

  const isDexInteraction = programIds.some(id => DEX_PROGRAMS.includes(id));
  
  // Check inner instructions as well
  const innerInstructions = tx.meta.innerInstructions || [];
  const hasSwapInnerInstruction = innerInstructions.some((ii: any) => 
    ii.instructions.some((i: any) => {
      const pIdx = i.programIdIndex;
      const pId = tx.transaction.message.accountKeys[pIdx]?.pubkey?.toString() || tx.transaction.message.accountKeys[pIdx]?.toString();
      return DEX_PROGRAMS.includes(pId);
    })
  );

  const isSwap = isDexInteraction || hasSwapInnerInstruction || logs.some(log => {
    const l = log.toLowerCase();
    return l.includes("swap") || 
           l.includes("raydium") || 
           l.includes("pump") ||
           l.includes("jupiter") ||
           l.includes("whirlpool") ||
           l.includes("meteora") ||
           l.includes("orca") ||
           l.includes("lifinity") ||
           l.includes("fluxbeam") ||
           l.includes("phoenix") ||
           l.includes("openbook");
  });

  // Fallback: Check if there are token balance changes for the wallet
  const hasTokenChange = (tx.meta.postTokenBalances || []).some((b: any) => b.owner === walletAddress);

  if (isSwap || hasTokenChange) {
    console.log(`✅ Swap/Activity detected in ${signature}`);
    const fee = tx.meta.fee / LAMPORTS_PER_SOL;
    await sendTelegramMessage(`🚀 *New Swap Detected!*\nWallet: \`${walletAddress}\`\nTX: [View on Solscan](https://solscan.io/tx/${signature})\nFee: ${fee} SOL`);
    
    // Execute the copy trade
    await executeCopyTrade(tx, walletAddress, currentConnection, signature);
  } else {
    console.log(`ℹ️ Transaction ${signature} is not a recognized swap.`);
  }
};

// Trailing Stop Loss Logic
const checkStopLoss = async () => {
  const positions = db.prepare("SELECT * FROM positions WHERE is_active = 1").all() as any[];
  
  for (const pos of positions) {
    try {
      // Get current price (e.g., from Jupiter or Birdeye API)
      const currentPrice = await getTokenPrice(pos.token_mint);
      
      if (currentPrice > pos.highest_price) {
        db.prepare("UPDATE positions SET highest_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(currentPrice, pos.id);
      } else {
        const dropPercent = ((pos.highest_price - currentPrice) / pos.highest_price) * 100;
        if (dropPercent >= pos.stop_loss_percent) {
          console.log(`Stop loss triggered for ${pos.token_symbol} at ${currentPrice}`);
          await sendTelegramMessage(`⚠️ *Stop Loss Triggered!*\nToken: ${pos.token_symbol}\nPrice: ${currentPrice}\nDrop: ${dropPercent.toFixed(2)}%`);
          // Execute sell logic here
          // await executeSell(pos.token_mint, pos.amount);
          db.prepare("UPDATE positions SET is_active = 0 WHERE id = ?").run(pos.id);
        }
      }
    } catch (error) {
      console.error(`Error checking stop loss for ${pos.token_mint}:`, error);
    }
  }
};

const getTokenPrice = async (mint: string): Promise<number> => {
  if (STABLECOINS.includes(mint)) return 1.0;
  
  try {
    // Try Jupiter Price API
    const response = await axios.get(`https://api.jup.ag/price/v2?ids=${mint}`, { timeout: 5000 });
    const price = response.data?.data?.[mint]?.price;
    if (price) return parseFloat(price);
  } catch (err) {
    // Fallback to cached SOL price if mint is SOL
    if (mint === SOL_MINT) return cachedSolPrice;
  }
  
  return 0; 
};

// API Router
apiRouter.get("/pnl", async (req, res) => {
  try {
    const positions = db.prepare("SELECT * FROM positions WHERE is_active = 1").all() as PositionRow[];
    const solPrice = await getSolPrice();
    
    const pnlData = await Promise.all(positions.map(async (pos) => {
      const currentPrice = await getTokenPrice(pos.token_mint);
      const entryPrice = pos.entry_price || 0;
      const amount = pos.amount || 0;
      
      const profitSol = amount * (currentPrice - entryPrice);
      const profitUsd = profitSol * solPrice;
      const profitPercent = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
      
      return {
        ...pos,
        current_price: currentPrice,
        profit_sol: profitSol,
        profit_usd: profitUsd,
        profit_percent: profitPercent
      };
    }));
    
    res.json(pnlData);
  } catch (error) {
    console.error(">>> Error in GET /api/pnl:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
apiRouter.get("/positions", (req, res) => {
  try {
    const positions = db.prepare("SELECT * FROM positions ORDER BY updated_at DESC").all();
    res.json(positions);
  } catch (error) {
    console.error(">>> Error in GET /api/positions:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

apiRouter.get("/wallets", (req, res) => {
  console.log(">>> Handling GET /api/wallets");
  try {
    const wallets = db.prepare("SELECT * FROM tracked_wallets").all();
    res.json(wallets);
  } catch (error) {
    console.error(">>> Error in GET /api/wallets:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

apiRouter.post("/wallets", (req, res) => {
  console.log(">>> Handling POST /api/wallets", req.body);
  const { address, label } = req.body;
  try {
    db.prepare("INSERT INTO tracked_wallets (address, label) VALUES (?, ?)").run(address, label);
    startMonitoring();
    res.json({ success: true });
  } catch (error) {
    console.error(">>> Error in POST /api/wallets:", error);
    res.status(400).json({ error: "Wallet already exists or invalid data" });
  }
});

apiRouter.put("/wallets/:id", (req, res) => {
  const { id } = req.params;
  const { label } = req.body;
  try {
    db.prepare("UPDATE tracked_wallets SET label = ? WHERE id = ?").run(label, id);
    res.json({ success: true });
  } catch (error) {
    console.error(">>> Error in PUT /api/wallets:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

apiRouter.put("/wallets/:id/toggle", (req, res) => {
  const { id } = req.params;
  try {
    db.prepare("UPDATE tracked_wallets SET is_active = 1 - is_active WHERE id = ?").run(id);
    startMonitoring();
    res.json({ success: true });
  } catch (error) {
    console.error(">>> Error in PUT /api/wallets/toggle:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

apiRouter.delete("/wallets/:id", (req, res) => {
  console.log(">>> Handling DELETE /api/wallets", req.params.id);
  const { id } = req.params;
  try {
    const wallet = db.prepare("SELECT address FROM tracked_wallets WHERE id = ?").get(id) as { address: string };
    if (wallet && activeSubscriptions.has(wallet.address)) {
      const connection = getConnection();
      connection.removeOnLogsListener(activeSubscriptions.get(wallet.address)!);
      activeSubscriptions.delete(wallet.address);
    }
    db.prepare("DELETE FROM tracked_wallets WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error) {
    console.error(">>> Error in DELETE /api/wallets:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

apiRouter.get("/trades", (req, res) => {
  console.log(">>> Handling GET /api/trades");
  try {
    const trades = db.prepare("SELECT * FROM trades ORDER BY created_at DESC LIMIT 50").all();
    res.json(trades);
  } catch (error) {
    console.error(">>> Error in GET /api/trades:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

apiRouter.get("/balance", async (req, res) => {
  console.log(">>> GET /api/balance");
  try {
    const currentConnection = getConnection();
    const settings = db.prepare("SELECT * FROM settings").all() as { key: string, value: string }[];
    const settingsMap = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    const tradingKey = settingsMap.trading_keypair || process.env.PRIVATE_KEY || process.env.TRADING_KEYPAIR;
    if (!tradingKey) {
      console.log(">>> Balance: Trading key not set");
      return res.json({ balance: 0, address: "Not Set" });
    }

    const keypair = Keypair.fromSecretKey(bs58.decode(tradingKey));
    console.log(">>> Fetching balance for:", keypair.publicKey.toBase58());
    
    const balance = await withRpcRetry(async () => {
      return await currentConnection.getBalance(keypair.publicKey);
    }, 3, 2000);

    console.log(">>> Balance fetched:", balance);
    res.json({ 
      balance: balance / LAMPORTS_PER_SOL, 
      address: keypair.publicKey.toBase58() 
    });
  } catch (error) {
    console.error(">>> Failed to fetch balance:", error);
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

let cachedSolPrice = 150;
let lastPriceFetch = 0;
const PRICE_CACHE_TTL = 30000; // 30 seconds

const getSolPrice = async (): Promise<number> => {
  const now = Date.now();
  if (now - lastPriceFetch < PRICE_CACHE_TTL) {
    return cachedSolPrice;
  }

  const sources = [
    {
      name: "Binance",
      url: "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
      parser: (data: any) => data?.price
    },
    {
      name: "Jupiter",
      url: "https://price.jup.ag/v4/price?ids=SOL",
      parser: (data: any) => data?.data?.SOL?.price
    },
    {
      name: "CoinGecko",
      url: "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      parser: (data: any) => data?.solana?.usd
    },
    {
      name: "Kraken",
      url: "https://api.kraken.com/0/public/Ticker?pair=SOLUSD",
      parser: (data: any) => data?.result?.SOLUSD?.c?.[0]
    }
  ];

  for (const source of sources) {
    try {
      const price = await withRpcRetry(async () => {
        const response = await axios.get(source.url, { timeout: 4000 });
        const p = source.parser(response.data);
        if (p) return parseFloat(p);
        throw new Error("Invalid format");
      }, 0, 0); 
      
      cachedSolPrice = price;
      lastPriceFetch = now;
      console.log(`💰 SOL Price updated from ${source.name}: $${price}`);
      return price;
    } catch (err) {
      // Silent fail for individual sources
    }
  }

  if (cachedSolPrice === 0) {
    console.error("❌ ERROR: All price sources failed and no cache available!");
    return 200; // Hardcoded fallback to prevent division by zero or UI break
  }

  console.warn("⚠️ All live price sources unreachable, using cached value.");
  return cachedSolPrice;
};

apiRouter.get("/stats", async (req, res) => {
  console.log(">>> Handling GET /api/stats");
  try {
    const totalTrades = db.prepare("SELECT COUNT(*) as count FROM trades").get() as { count: number };
    const activePositions = db.prepare("SELECT COUNT(*) as count FROM positions WHERE is_active = 1").get() as { count: number };
    
    const volumeData = db.prepare("SELECT SUM(amount_sol) as volume FROM trades").get() as { volume: number | null };
    const buyVolume = db.prepare("SELECT SUM(amount_sol) as volume FROM trades WHERE side = 'buy'").get() as { volume: number | null };
    const sellVolume = db.prepare("SELECT SUM(amount_sol) as volume FROM trades WHERE side = 'sell'").get() as { volume: number | null };
    
    const netProfit = (sellVolume.volume || 0) - (buyVolume.volume || 0);
    const solPrice = await getSolPrice();

    res.json({ 
      totalTrades: totalTrades.count, 
      activePositions: activePositions.count,
      totalVolumeSol: volumeData.volume || 0,
      netProfitSol: netProfit,
      solPrice
    });
  } catch (error) {
    console.error(">>> Error in GET /api/stats:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

apiRouter.post("/settings/toggle-bot", (req, res) => {
  try {
    const current = db.prepare("SELECT value FROM settings WHERE key = 'bot_enabled'").get() as { value: string } | undefined;
    const newValue = current ? (current.value === "true" ? "false" : "true") : "false";
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('bot_enabled', ?)").run(newValue);
    startMonitoring();
    res.json({ success: true, enabled: newValue === "true" });
  } catch (error) {
    console.error(">>> Error in POST /api/settings/toggle-bot:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

apiRouter.get("/settings", (req, res) => {
  console.log(">>> Handling GET /api/settings");
  try {
    const settings = db.prepare("SELECT * FROM settings").all();
    const settingsMap = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsMap);
  } catch (error) {
    console.error(">>> Error in GET /api/settings:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

apiRouter.post("/settings", (req, res) => {
  console.log(">>> Handling POST /api/settings", req.body);
  const settings = req.body;
  try {
    const upsert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    const transaction = db.transaction((data) => {
      for (const [key, value] of Object.entries(data)) {
        upsert.run(key, String(value));
      }
    });
    transaction(settings);

    // If RPC changed, update connection and restart monitoring
    if (settings.solana_rpc) {
      console.log("🔄 RPC URL updated, restarting connection...");
      stopMonitoring();
      connection = getConnection();
      startMonitoring();
    }

    res.json({ success: true });
  } catch (error) {
    console.error(">>> Error in POST /api/settings:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API 404 Handler
apiRouter.all("*", (req, res) => {
  console.log(`>>> API 404: ${req.method} ${req.url}`);
  res.status(404).json({ error: "API Route Not Found", path: req.url });
});

// Final mounting of API router
app.use("/api", apiRouter);

// Vite Integration
async function startServer() {
  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Initialize default settings if they don't exist
    const defaultSettings = {
      buy_amount: "0.1",
      sell_percent: "100",
      max_slippage: "1",
      priority_fee: "0.0005",
      min_sol_reserve: "0.02",
      min_trade_sol: "0.01",
      bot_enabled: "true"
    };
    
    const upsert = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
    for (const [key, value] of Object.entries(defaultSettings)) {
      upsert.run(key, value);
    }

    try {
      startMonitoring();
    } catch (err) {
      console.error("Failed to start monitoring:", err);
    }
    setInterval(checkStopLoss, 60000); // Check stop loss every minute
  });
}

startServer();
