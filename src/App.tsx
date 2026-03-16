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
  Power,
  Lock,
  ChevronRight,
  MoreVertical,
  ArrowUpRight,
  ArrowDownRight,
  Globe,
  Clock,
  Menu,
  X
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [wallets, setWallets] = useState<TrackedWallet[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState({ totalTrades: 0, activePositions: 0, totalVolumeSol: 0, netProfitSol: 0, solPrice: 150 });
  const [walletBalance, setWalletBalance] = useState({ balance: 0, address: "" });
  const [newWallet, setNewWallet] = useState({ address: "", label: "" });
  const [editingWallet, setEditingWallet] = useState<{ id: number, label: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [solPrice, setSolPrice] = useState(150);
  const [botEnabled, setBotEnabled] = useState(true);
  const [settings, setSettings] = useState({
    buy_amount: "0.1",
    max_slippage: "",
    stop_loss: "15",
    priority_fee: "0.001",
    trading_keypair: "",
    telegram_token: "",
    telegram_chat_id: "",
    solana_rpc: "",
    jupiter_api_url: "https://quote-api.jup.ag/v6/quote",
    jupiter_api_key: ""
  });

  const fetchData = async () => {
    try {
      const endpoints = [
        { name: "wallets", url: "/api/wallets", setter: setWallets },
        { name: "trades", url: "/api/trades", setter: setTrades },
        { name: "stats", url: "/api/stats", setter: (data: any) => {
          setStats(data);
          if (data.solPrice) setSolPrice(data.solPrice);
        }},
        { name: "settings", url: "/api/settings", setter: (data: any) => {
          if (Object.keys(data).length > 0) {
            setSettings(prev => ({ ...prev, ...data }));
            if (data.bot_enabled !== undefined) setBotEnabled(data.bot_enabled === "true");
          }
        }},
        { name: "balance", url: "/api/balance", setter: setWalletBalance }
      ];

      await Promise.all(endpoints.map(async (ep) => {
        try {
          const res = await fetch(ep.url);
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          const contentType = res.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
            const text = await res.text();
            console.error(`Expected JSON from ${ep.url} but got ${contentType}:`, text.slice(0, 100));
            throw new Error(`Received non-JSON response from ${ep.name}`);
          }
          const data = await res.json();
          ep.setter(data);
        } catch (err) {
          console.error(`Failed to fetch ${ep.name}:`, err);
        }
      }));
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
        alert("Ayarlar başarıyla kaydedildi!");
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
    if (!confirm("Bu cüzdanı takipten çıkarmak istediğinize emin misiniz?")) return;
    try {
      await fetch(`/api/wallets/${id}`, { method: "DELETE" });
      fetchData();
    } catch (error) {
      console.error("Failed to delete wallet:", error);
    }
  };

  const updateWallet = async (id: number, label: string) => {
    try {
      await fetch(`/api/wallets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label })
      });
      setEditingWallet(null);
      fetchData();
    } catch (error) {
      console.error("Failed to update wallet:", error);
    }
  };

  const toggleWallet = async (id: number) => {
    try {
      await fetch(`/api/wallets/${id}/toggle`, { method: "PUT" });
      fetchData();
    } catch (error) {
      console.error("Failed to toggle wallet:", error);
    }
  };

  const toggleBot = async () => {
    try {
      const res = await fetch("/api/settings/toggle-bot", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBotEnabled(data.enabled);
      }
    } catch (error) {
      console.error("Failed to toggle bot:", error);
    }
  };

  return (
    <div className="flex h-screen bg-[#0A0A0B] text-white overflow-hidden relative">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-[#0D0D0F] border-r border-white/5 flex flex-col z-[70] transition-transform duration-300 lg:relative lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg solana-gradient flex items-center justify-center glow-primary">
              <Zap className="w-5 h-5 text-black fill-black" />
            </div>
            <span className="font-bold tracking-tight text-sm">SOLANA PRO</span>
          </div>
          <button 
            className="lg:hidden p-2 hover:bg-white/5 rounded-lg"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          {[
            { id: "dashboard", label: "Panel", icon: LayoutDashboard },
            { id: "wallets", label: "Takip Edilen Cüzdanlar", icon: Wallet },
            { id: "trades", label: "İşlem Geçmişi", icon: History },
            { id: "targets", label: "Kopyalama Hedefleri", icon: Target },
            { id: "analytics", label: "Analizler", icon: BarChart3 },
            { id: "settings", label: "Ayarlar", icon: Settings },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
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
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#9945FF]">Düğüm Durumu</span>
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
      <main className="flex-1 flex flex-col overflow-hidden relative w-full">
        {/* Top Header */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-4 lg:px-8 bg-black/20 backdrop-blur-md sticky top-0 z-40">
          <div className="flex items-center gap-4 lg:gap-8">
            <button 
              className="lg:hidden p-2 hover:bg-white/5 rounded-lg"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="w-5 h-5 text-gray-400" />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <Globe className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-mono text-gray-400">SOL/USD:</span>
              <span className="text-xs font-mono font-bold text-[#14F195]">${solPrice.toFixed(2)}</span>
            </div>
            <div className="hidden sm:block h-4 w-px bg-white/10" />
            <div className="hidden md:flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-mono text-gray-400">Epoch:</span>
              <span className="text-xs font-mono font-bold text-gray-200">742</span>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">İşlem Cüzdanı</span>
              <span className="text-[10px] font-mono text-[#14F195]">{walletBalance.address ? `${walletBalance.address.slice(0, 4)}...${walletBalance.address.slice(-4)}` : "Ayarlanmadı"}</span>
            </div>
            <div className="flex items-center gap-2 lg:gap-3 px-3 lg:px-4 py-1.5 bg-white/5 rounded-full border border-white/10">
              <div className="w-2 h-2 rounded-full bg-[#9945FF]" />
              <span className="text-[10px] lg:text-xs font-mono text-gray-300">{walletBalance.balance.toFixed(2)} SOL</span>
            </div>
            <button 
              onClick={toggleBot}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                botEnabled 
                  ? "bg-[#14F195]/20 text-[#14F195] border border-[#14F195]/30" 
                  : "bg-red-400/20 text-red-400 border border-red-400/30"
              }`}
            >
              <Power className="w-3 h-3" />
              {botEnabled ? "BOT AKTİF" : "BOT DURDURULDU"}
            </button>
            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors relative">
              <Bell className="w-5 h-5 text-gray-400" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#9945FF] rounded-full border-2 border-[#0A0A0B]" />
            </button>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar">
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
                  {[
                    { label: "Toplam Hacim", value: `${stats.totalVolumeSol.toFixed(2)} SOL`, change: `$${(stats.totalVolumeSol * solPrice).toLocaleString()}`, icon: TrendingUp, color: "text-[#14F195]" },
                    { label: "Kopya İşlemler", value: stats.totalTrades, change: "+5", icon: Activity, color: "text-[#9945FF]" },
                    { label: "Takip Edilenler", value: wallets.length, change: "Canlı", icon: Cpu, color: "text-blue-400" },
                    { label: "Net Kar", value: `${stats.netProfitSol >= 0 ? '+' : ''}${stats.netProfitSol.toFixed(2)} SOL`, change: `$${(stats.netProfitSol * solPrice).toLocaleString()}`, icon: BarChart3, color: stats.netProfitSol >= 0 ? "text-[#14F195]" : "text-red-400" },
                  ].map((stat, i) => (
                    <div key={i} className="glass-card p-4 lg:p-6 rounded-2xl stat-card-gradient">
                      <div className="flex items-center justify-between mb-4">
                        <div className={`p-2 rounded-lg bg-white/5 ${stat.color}`}>
                          <stat.icon className="w-4 h-4" />
                        </div>
                        <span className={`text-[10px] font-bold ${typeof stat.change === 'string' && stat.change.startsWith('+') ? 'text-[#14F195]' : 'text-gray-500'}`}>
                          {stat.change}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">{stat.label}</p>
                      <h3 className="text-lg lg:text-2xl font-bold font-mono">{stat.value}</h3>
                    </div>
                  ))}
                </div>

                {/* Main Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Chart Section */}
                  <div className="lg:col-span-2 glass-card p-4 lg:p-6 rounded-2xl min-h-[300px] lg:min-h-[400px] flex flex-col">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h2 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-[#14F195]" />
                          Performans Genel Bakış
                        </h2>
                        <p className="text-[10px] text-gray-500 mt-1">Kopya işlem performansının gerçek zamanlı takibi</p>
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
                        Hızlı Ekle
                      </h3>
                      <form onSubmit={addWallet} className="space-y-4">
                        <input 
                          type="text" 
                          placeholder="Cüzdan Adresi..." 
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono focus:outline-none focus:border-[#14F195]/50 transition-colors"
                          value={newWallet.address}
                          onChange={(e) => setNewWallet({ ...newWallet, address: e.target.value })}
                        />
                        <input 
                          type="text" 
                          placeholder="Cüzdan İsmi (Örn: Balina 1)" 
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[#14F195]/50 transition-colors"
                          value={newWallet.label}
                          onChange={(e) => setNewWallet({ ...newWallet, label: e.target.value })}
                        />
                        <button className="w-full solana-gradient text-black font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
                          <Plus className="w-4 h-4" />
                          TAKİBİ BAŞLAT
                        </button>
                      </form>
                    </div>

                    <div className="glass-card p-6 rounded-2xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                          <Target className="w-4 h-4 text-[#9945FF]" />
                          Aktif Hedefler
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
                                <p className="text-[10px] font-bold text-gray-300">{w.label || "İsimsiz"}</p>
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
                      Son Etkinlikler
                    </h2>
                    <button className="text-[10px] font-bold text-[#14F195] hover:underline uppercase tracking-widest">Hepsini Gör</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/2">
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Zaman</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">İşlem</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Token</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Miktar</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Durum</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">İşlem (TX)</th>
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
                                {trade.side === 'buy' ? 'AL' : 'SAT'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">
                                  {trade.token_symbol?.[0] || "?"}
                                </div>
                                <span className="text-xs font-bold">{trade.token_symbol || "Bilinmiyor"}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold font-mono">{trade.amount_sol} SOL</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#14F195]" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Başarılı</span>
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
                  <h2 className="text-2xl font-bold">Takip Edilen Cüzdanlar</h2>
                  <button className="solana-gradient text-black font-bold px-6 py-2 rounded-xl text-xs flex items-center gap-2">
                    <Plus className="w-4 h-4" /> YENİ CÜZDAN EKLE
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
                          <button 
                            onClick={() => toggleWallet(w.id)}
                            className={`p-2 rounded-lg transition-colors ${w.is_active ? 'text-[#14F195] hover:bg-[#14F195]/10' : 'text-gray-500 hover:bg-white/5'}`}
                            title={w.is_active ? "Durdur" : "Başlat"}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setEditingWallet({ id: w.id, label: w.label || "" })}
                            className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-[#14F195] transition-colors"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button onClick={() => deleteWallet(w.id)} className="p-2 hover:bg-red-400/10 rounded-lg text-gray-500 hover:text-red-400 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {editingWallet?.id === w.id ? (
                        <div className="space-y-3 mb-6">
                          <input 
                            type="text" 
                            className="w-full bg-black/40 border border-[#14F195]/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#14F195]"
                            value={editingWallet.label}
                            onChange={(e) => setEditingWallet({ ...editingWallet, label: e.target.value })}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button 
                              onClick={() => updateWallet(w.id, editingWallet.label)}
                              className="flex-1 bg-[#14F195] text-black font-bold py-1.5 rounded-lg text-[10px]"
                            >
                              KAYDET
                            </button>
                            <button 
                              onClick={() => setEditingWallet(null)}
                              className="flex-1 bg-white/5 text-gray-400 font-bold py-1.5 rounded-lg text-[10px]"
                            >
                              İPTAL
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="font-bold text-lg mb-1">{w.label || "İsimsiz Cüzdan"}</h3>
                          <code className="text-[10px] text-gray-500 font-mono block mb-6">{w.address}</code>
                        </>
                      )}
                      
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Kazanma Oranı</p>
                          <p className="text-sm font-mono text-[#14F195]">68.4%</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Toplam PnL</p>
                          <p className="text-sm font-mono text-[#14F195]">+42.5 SOL</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === "trades" && (
              <motion.div
                key="trades"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold">İşlem Geçmişi</h2>
                  <div className="flex gap-4">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input type="text" placeholder="Token ara..." className="bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs focus:outline-none focus:border-[#14F195]/50" />
                    </div>
                    <button className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                      <RefreshCw className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </div>
                <div className="glass-card rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/2">
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Zaman</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Cüzdan</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">İşlem</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Token</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Miktar</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Durum</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">TX</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {trades.map((trade) => (
                          <tr key={trade.id} className="hover:bg-white/2 transition-colors">
                            <td className="px-6 py-4">
                              <span className="text-[10px] text-gray-400 font-mono">
                                {new Date(trade.created_at).toLocaleString()}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-[10px] text-gray-400 font-mono">{trade.wallet_address.slice(0, 4)}...{trade.wallet_address.slice(-4)}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                                trade.side === 'buy' ? 'bg-[#14F195]/10 text-[#14F195]' : 'bg-red-400/10 text-red-400'
                              }`}>
                                {trade.side === 'buy' ? 'AL' : 'SAT'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold font-mono">{trade.token_mint.slice(0, 4)}...{trade.token_mint.slice(-4)}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold font-mono">{trade.amount_sol} SOL</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-[10px] font-bold uppercase text-gray-400">{trade.status}</span>
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

            {activeTab === "targets" && (
              <motion.div
                key="targets"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold">Kopyalama Hedefleri</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {wallets.map(w => (
                    <div key={w.id} className="glass-card p-6 rounded-2xl">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center font-bold text-[#14F195]">
                          {w.label?.[0] || "W"}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-[#14F195] animate-pulse" />
                          <span className="text-[10px] font-bold text-[#14F195]">AKTİF</span>
                        </div>
                      </div>
                      <h3 className="font-bold mb-1">{w.label || "İsimsiz"}</h3>
                      <p className="text-[10px] font-mono text-gray-500 mb-4">{w.address}</p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-gray-500">Kopyalama Oranı</span>
                          <span className="text-gray-300">100%</span>
                        </div>
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="w-full h-full bg-[#14F195]" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === "analytics" && (
              <motion.div
                key="analytics"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <h2 className="text-2xl font-bold mb-8">Analizler</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="glass-card p-6 rounded-2xl">
                    <h3 className="text-xs font-bold uppercase tracking-widest mb-6">Kar/Zarar Dağılımı</h3>
                    <div className="h-64 flex items-center justify-center text-gray-500 italic text-sm">
                      Veri toplanıyor...
                    </div>
                  </div>
                  <div className="glass-card p-6 rounded-2xl">
                    <h3 className="text-xs font-bold uppercase tracking-widest mb-6">En Çok İşlem Yapılan Tokenlar</h3>
                    <div className="space-y-4">
                      {trades.slice(0, 5).map((t, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                          <span className="text-xs font-mono">{t.token_mint.slice(0, 8)}...</span>
                          <span className="text-xs font-bold text-[#14F195]">{t.amount_sol.toFixed(2)} SOL</span>
                        </div>
                      ))}
                    </div>
                  </div>
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
                <h2 className="text-2xl font-bold">Bot Ayarları</h2>
                
                <div className="space-y-6">
                  <div className="glass-card p-6 rounded-2xl space-y-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                      <Lock className="w-4 h-4 text-[#9945FF]" />
                      Güvenlik ve Erişim
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                        <div>
                          <p className="text-sm font-bold">İşlem Anahtarı</p>
                          <p className="text-[10px] text-gray-500">Özel anahtarınız şifrelenir ve yerel olarak saklanır</p>
                        </div>
                        <button className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold transition-colors">GÜNCELLE</button>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                        <div>
                          <p className="text-sm font-bold">Telegram Bildirimleri</p>
                          <p className="text-[10px] text-gray-500">@SolanaProBot adresine bağlı</p>
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
                      İşlem Parametreleri
                    </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Varsayılan Alım Miktarı (SOL)</label>
                        <input 
                          type="text" 
                          placeholder="Boş = Hedefden Kopyala"
                          value={settings.buy_amount} 
                          onChange={(e) => setSettings({...settings, buy_amount: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Maksimum Kayma (%)</label>
                        <input 
                          type="text" 
                          placeholder="Boş = Cüzdandan Kopyala"
                          value={settings.max_slippage} 
                          onChange={(e) => setSettings({...settings, max_slippage: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Takip Eden Zarar Durdur (%)</label>
                        <input 
                          type="number" 
                          value={settings.stop_loss} 
                          onChange={(e) => setSettings({...settings, stop_loss: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Öncelik Ücreti (SOL)</label>
                        <input 
                          type="text" 
                          placeholder="Boş = Cüzdandan Kopyala"
                          value={settings.priority_fee} 
                          onChange={(e) => setSettings({...settings, priority_fee: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                        />
                      </div>
                    </div>

                    <div className="h-[1px] bg-white/10 my-2"></div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Solana RPC URL'si</label>
                        <input 
                          type="text" 
                          placeholder="https://api.mainnet-beta.solana.com"
                          value={settings.solana_rpc} 
                          onChange={(e) => setSettings({...settings, solana_rpc: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Jupiter API URL'si</label>
                        <input 
                          type="text" 
                          placeholder="https://quote-api.jup.ag/v6/quote"
                          value={settings.jupiter_api_url} 
                          onChange={(e) => setSettings({...settings, jupiter_api_url: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Jupiter API Anahtarı (Opsiyonel)</label>
                        <input 
                          type="password" 
                          placeholder="API Anahtarınız (401 hatası alıyorsanız gereklidir)"
                          value={settings.jupiter_api_key} 
                          onChange={(e) => setSettings({...settings, jupiter_api_key: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold">İşlem Anahtarı (Özel Anahtar)</label>
                        <input 
                          type="password" 
                          placeholder="Base58 Özel Anahtar"
                          value={settings.trading_keypair} 
                          onChange={(e) => setSettings({...settings, trading_keypair: e.target.value})}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50 font-mono" 
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] text-gray-500 uppercase font-bold">Telegram Bot Jetonu</label>
                          <input 
                            type="password" 
                            placeholder="Bot Jetonu"
                            value={settings.telegram_token} 
                            onChange={(e) => setSettings({...settings, telegram_token: e.target.value})}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#14F195]/50" 
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] text-gray-500 uppercase font-bold">Telegram Sohbet Kimliği</label>
                          <input 
                            type="text" 
                            placeholder="Sohbet Kimliği"
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
                      {loading ? "KAYDEDİLİYOR..." : "AYARLARI KAYDET"}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Floating Live Feed (Desktop Only) */}
        <div className="hidden 2xl:block absolute right-8 top-24 w-64 space-y-4">
          <div className="glass-card p-4 rounded-2xl">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-4 flex items-center gap-2">
              <Activity className="w-3 h-3 text-[#14F195]" />
              Canlı Ağ Akışı
            </h3>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3 text-[10px]">
                  <div className="w-1 h-8 bg-white/5 rounded-full" />
                  <div>
                    <p className="text-gray-300 font-bold">Yeni Token Algılandı</p>
                    <p className="text-gray-500 font-mono">Pump.fun • 2s önce</p>
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
