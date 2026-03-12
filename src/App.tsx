import React, { useState, useEffect, useMemo } from "react";
import { 
  Activity, 
  Wallet, 
  History, 
  Settings, 
  Plus, 
  Trash2, 
  TrendingUp, 
  Shield, 
  Bell,
  ExternalLink,
  RefreshCw,
  Search,
  Zap,
  LayoutDashboard,
  Target,
  BarChart3,
  Cpu,
  Lock,
  ChevronRight,
  MoreVertical,
  ArrowUpRight,
  ArrowDownRight,
  Globe,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

interface TrackedWallet {
  id: number;
  address: string;
  label: string;
  is_active: number;
  created_at: string;
}

interface Trade {
  id: number;
  wallet_address: string;
  token_mint: string;
  token_symbol: string;
  side: string;
  amount_sol: number;
  amount_token: number;
  price_sol: number;
  tx_hash: string;
  status: string;
  created_at: string;
}

// Mock chart data
const chartData = [
  { time: '00:00', price: 142.5 },
  { time: '04:00', price: 145.2 },
  { time: '08:00', price: 141.8 },
  { time: '12:00', price: 148.5 },
  { time: '16:00', price: 152.1 },
  { time: '20:00', price: 149.8 },
  { time: '23:59', price: 154.2 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [wallets, setWallets] = useState<TrackedWallet[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState({ totalTrades: 0, activePositions: 0 });
  const [walletBalance, setWalletBalance] = useState({ balance: 0, address: "" });
  const [newWallet, setNewWallet] = useState({ address: "", label: "" });
  const [loading, setLoading] = useState(false);
  const [solPrice, setSolPrice] = useState(154.24);
  const [settings, setSettings] = useState({
    buy_amount: "0.1",
    max_slippage: "",
    stop_loss: "15",
    priority_fee: "0.001",
    trading_keypair: "",
    telegram_token: "",
    telegram_chat_id: "",
    solana_rpc: ""
  });

  const fetchData = async () => {
    try {
      const [wRes, tRes, sRes, setRes, bRes] = await Promise.all([
        fetch("/api/wallets"),
        fetch("/api/trades"),
        fetch("/api/stats"),
        fetch("/api/settings"),
        fetch("/api/balance")
      ]);
      setWallets(await wRes.json());
      setTrades(await tRes.json());
      setStats(await sRes.json());
      setWalletBalance(await bRes.json());
      const savedSettings = await setRes.json();
      if (Object.keys(savedSettings).length > 0) {
        setSettings(prev => ({ ...prev, ...savedSettings }));
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        alert("Settings saved successfully!");
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const addWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWallet.address) return;
    setLoading(true);
    try {
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newWallet)
      });
      if (res.ok) {
        setNewWallet({ address: "", label: "" });
        fetchData();
      }
    } catch (error) {
      console.error("Failed to add wallet:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteWallet = async (id: number) => {
    try {
      await fetch(`/api/wallets/${id}`, { method: "DELETE" });
      fetchData();
    } catch (error) {
      console.error("Failed to delete wallet:", error);
    }
  };

  return (
    <div className="flex h-screen bg-[#0A0A0B] text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0D0D0F] border-r border-white/5 flex flex-col z-50">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg solana-gradient flex items-center justify-center glow-primary">
            <Zap className="w-5 h-5 text-black fill-black" />
          </div>
          <span className="font-bold tracking-tight text-sm">SOLANA PRO</span>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          {[
            { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
            { id: "wallets", label: "Tracked Wallets", icon: Wallet },
            { id: "trades", label: "Trade History", icon: History },
            { id: "targets", label: "Copy Targets", icon: Target },
            { id: "analytics", label: "Analytics", icon: BarChart3 },
            { id: "settings", label: "Settings", icon: Settings },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === item.id 
                  ? "bg-[#14F195]/10 text-[#14F195] border-r-2 border-[#14F195]" 
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 mt-auto">
          <div className="glass-card p-4 rounded-2xl bg-gradient-to-br from-[#9945FF]/10 to-transparent border border-[#9945FF]/20">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-[#9945FF]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#9945FF]">Node Status</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Mainnet-Beta</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#14F195] animate-pulse" />
                <span className="text-[10px] text-[#14F195] font-mono">14ms</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-black/20 backdrop-blur-md">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-mono text-gray-400">SOL/USD:</span>
              <span className="text-xs font-mono font-bold text-[#14F195]">${solPrice.toFixed(2)}</span>
              <span className="text-[10px] text-[#14F195] flex items-center">
                <ArrowUpRight className="w-3 h-3" /> 2.4%
              </span>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-mono text-gray-400">Epoch:</span>
              <span className="text-xs font-mono font-bold text-gray-200">742</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Trading Wallet</span>
              <span className="text-[10px] font-mono text-[#14F195]">{walletBalance.address ? `${walletBalance.address.slice(0, 4)}...${walletBalance.address.slice(-4)}` : "Not Set"}</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-1.5 bg-white/5 rounded-full border border-white/10">
              <div className="w-2 h-2 rounded-full bg-[#9945FF]" />
              <span className="text-xs font-mono text-gray-300">{walletBalance.balance.toFixed(4)} SOL</span>
            </div>
            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors relative">
              <Bell className="w-5 h-5 text-gray-400" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#9945FF] rounded-full border-2 border-[#0A0A0B]" />
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10" />
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Hero Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  {[
                    { label: "Total Volume", value: "$1.2M", change: "+12%", icon: TrendingUp, color: "text-[#14F195]" },
                    { label: "Copy Trades", value: stats.totalTrades, change: "+5", icon: Activity, color: "text-[#9945FF]" },
                    { label: "Active Bots", value: wallets.length, change: "Live", icon: Cpu, color: "text-blue-400" },
                    { label: "Net Profit", value: "+14.2 SOL", change: "+2.1%", icon: BarChart3, color: "text-[#14F195]" },
                  ].map((stat, i) => (
                    <div key={i} className="glass-card p-6 rounded-2xl stat-card-gradient">
                      <div className="flex items-center justify-between mb-4">
                        <div className={`p-2 rounded-lg bg-white/5 ${stat.color}`}>
                          <stat.icon className="w-4 h-4" />
                        </div>
                        <span className={`text-[10px] font-bold ${stat.change.startsWith('+') ? 'text-[#14F195]' : 'text-gray-500'}`}>
                          {stat.change}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">{stat.label}</p>
                      <h3 className="text-2xl font-bold font-mono">{stat.value}</h3>
                    </div>
                  ))}
                </div>

                {/* Main Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Chart Section */}
                  <div className="lg:col-span-2 glass-card p-6 rounded-2xl min-h-[400px] flex flex-col">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h2 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-[#14F195]" />
                          Performance Overview
                        </h2>
                        <p className="text-[10px] text-gray-500 mt-1">Real-time tracking of copy trade performance</p>
                      </div>
                      <div className="flex gap-2">
                        {['1H', '4H', '1D', '1W'].map(t => (
                          <button key={t} className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-colors ${t === '1D' ? 'bg-[#14F195] text-black' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#14F195" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#14F195" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis 
                            dataKey="time" 
                            stroke="rgba(255,255,255,0.3)" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false}
                          />
                          <YAxis 
                            stroke="rgba(255,255,255,0.3)" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false}
                            domain={['dataMin - 5', 'dataMax + 5']}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#151518', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                            itemStyle={{ color: '#14F195', fontSize: '12px' }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="price" 
                            stroke="#14F195" 
                            strokeWidth={2}
                            fillOpacity={1} 
                            fill="url(#colorPrice)" 
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Quick Actions / Wallets */}
                  <div className="lg:col-span-1 space-y-6">
                    <div className="glass-card p-6 rounded-2xl border-l-4 border-l-[#14F195]">
                      <h3 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-[#14F195]" />
                        Quick Add
                      </h3>
                      <form onSubmit={addWallet} className="space-y-4">
                        <input 
                          type="text" 
                          placeholder="Wallet Address..." 
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono focus:outline-none focus:border-[#14F195]/50 transition-colors"
                          value={newWallet.address}
                          onChange={(e) => setNewWallet({ ...newWallet, address: e.target.value })}
                        />
                        <button className="w-full solana-gradient text-black font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                          <Plus className="w-4 h-4" />
                          START TRACKING
                        </button>
                      </form>
                    </div>

                    <div className="glass-card p-6 rounded-2xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                          <Target className="w-4 h-4 text-[#9945FF]" />
                          Active Targets
                        </h3>
                        <span className="text-[10px] font-mono text-gray-500">{wallets.length}</span>
                      </div>
                      <div className="space-y-3 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                        {wallets.map(w => (
                          <div key={w.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 group">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold text-gray-400">
                                {w.label?.[0] || "W"}
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-gray-300">{w.label || "Unnamed"}</p>
                                <p className="text-[8px] font-mono text-gray-600">{w.address.slice(0, 4)}...{w.address.slice(-4)}</p>
                              </div>
                            </div>
                            <button onClick={() => deleteWallet(w.id)} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Activity Table */}
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                      <History className="w-4 h-4 text-[#9945FF]" />
                      Recent Activity
                    </h2>
                    <button className="text-[10px] font-bold text-[#14F195] hover:underline uppercase tracking-widest">View All</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/2">
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Time</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Action</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Token</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Amount</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Status</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">TX</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {trades.slice(0, 5).map((trade) => (
                          <tr key={trade.id} className="hover:bg-white/2 transition-colors">
                            <td className="px-6 py-4">
                              <span className="text-[10px] text-gray-400 font-mono">
                                {new Date(trade.created_at).toLocaleTimeString()}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                                trade.side === 'buy' ? 'bg-[#14F195]/10 text-[#14F195]' : 'bg-red-400/10 text-red-400'
                              }`}>
                                {trade.side}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">
                                  {trade.token_symbol?.[0] || "?"}
                                </div>
                                <span className="text-xs font-bold">{trade.token_symbol || "Unknown"}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold font-mono">{trade.amount_sol} SOL</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#14F195]" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Success</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <a href={`https://solscan.io/tx/${trade.tx_hash}`} target="_blank" className="text-gray-500 hover:text-[#14F195]">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "wallets" && (
              <motion.div
                key="wallets"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold">Tracked Wallets</h2>
                  <button className="solana-gradient text-black font-bold px-6 py-2 rounded-xl text-xs flex items-center gap-2">
                    <Plus className="w-4 h-4" /> ADD NEW WALLET
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {wallets.map(w => (
                    <div key={w.id} className="glass-card p-6 rounded-2xl relative group">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-xl font-bold text-gray-400">
                          {w.label?.[0] || "W"}
                        </div>
                        <div className="flex gap-2">
                          <button className="p-2 hover:bg-white/5 rounded-lg text-gray-500"><Settings className="w-4 h-4" /></button>
                          <button onClick={() => deleteWallet(w.id)} className="p-2 hover:bg-red-400/10 rounded-lg text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                      <h3 className="font-bold text-lg mb-1">{w.label || "Unnamed Wallet"}</h3>
                      <code className="text-[10px] text-gray-500 font-mono block mb-6">{w.address}</code>
                      
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Win Rate</p>
                          <p className="text-sm font-mono text-[#14F195]">68.4%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Total PnL</p>
                          <p className="text-sm font-mono text-[#14F195]">+42.5 SOL</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === "settings" && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-2xl space-y-8"
              >
                <h2 className="text-2xl font-bold">Bot Settings</h2>
                
                <div className="space-y-6">
                  <div className="glass-card p-6 rounded-2xl space-y-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                      <Lock className="w-4 h-4 text-[#9945FF]" />
                      Security & Access
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                        <div>
                          <p className="text-sm font-bold">Trading Keypair</p>
                          <p className="text-[10px] text-gray-500">Your private key is encrypted and stored locally</p>
                        </div>
                        <button className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold transition-colors">UPDATE</button>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                        <div>
                          <p className="text-sm font-bold">Telegram Notifications</p>
                          <p className="text-[10px] text-gray-500">Connected to @SolanaProBot</p>
                        </div>
                        <div className="w-10 h-5 bg-[#14F195] rounded-full relative">
                          <div className="absolute right-1 top-1 w-3 h-3 bg-black rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card p-6 rounded-2xl space-y-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-[#14F195]" />
                      Trading Parameters
                    </h3>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Default Buy Amount (SOL)</label>
                        <input 
                          type="text" 
                          placeholder="Empty = Copy from Target"
                          value={settings.buy_amount} 
                          onChange={(e) => setSettings({...settings, buy_amount: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Max Slippage (%)</label>
                        <input 
                          type="text" 
                          placeholder="Empty = Copy from Wallet"
                          value={settings.max_slippage} 
                          onChange={(e) => setSettings({...settings, max_slippage: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Trailing Stop Loss (%)</label>
                        <input 
                          type="number" 
                          value={settings.stop_loss} 
                          onChange={(e) => setSettings({...settings, stop_loss: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Priority Fee (SOL)</label>
                        <input 
                          type="text" 
                          placeholder="Empty = Copy from Wallet"
                          value={settings.priority_fee} 
                          onChange={(e) => setSettings({...settings, priority_fee: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                        />
                      </div>
                    </div>

                    <div className="h-[1px] bg-white/10 my-2"></div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Solana RPC URL</label>
                        <input 
                          type="text" 
                          placeholder="https://api.mainnet-beta.solana.com"
                          value={settings.solana_rpc} 
                          onChange={(e) => setSettings({...settings, solana_rpc: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Trading Keypair (Private Key)</label>
                        <input 
                          type="password" 
                          placeholder="Base58 Private Key"
                          value={settings.trading_keypair} 
                          onChange={(e) => setSettings({...settings, trading_keypair: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50 font-mono" 
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] text-gray-500 uppercase font-bold">Telegram Bot Token</label>
                          <input 
                            type="password" 
                            placeholder="Bot Token"
                            value={settings.telegram_token} 
                            onChange={(e) => setSettings({...settings, telegram_token: e.target.value})}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] text-gray-500 uppercase font-bold">Telegram Chat ID</label>
                          <input 
                            type="text" 
                            placeholder="Chat ID"
                            value={settings.telegram_chat_id} 
                            onChange={(e) => setSettings({...settings, telegram_chat_id: e.target.value})}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                          />
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={saveSettings}
                      disabled={loading}
                      className="w-full solana-gradient text-black font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {loading ? "SAVING..." : "SAVE SETTINGS"}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Floating Live Feed (Desktop Only) */}
        <div className="hidden xl:block absolute right-8 top-24 w-64 space-y-4">
          <div className="glass-card p-4 rounded-2xl">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-4 flex items-center gap-2">
              <Activity className="w-3 h-3 text-[#14F195]" />
              Live Network Feed
            </h3>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3 text-[10px]">
                  <div className="w-1 h-8 bg-white/5 rounded-full" />
                  <div>
                    <p className="text-gray-300 font-bold">New Token Detected</p>
                    <p className="text-gray-500 font-mono">Pump.fun • 2s ago</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
