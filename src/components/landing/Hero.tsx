import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Terminal, Activity, Search, User, Edit3, Loader2 } from 'lucide-react';

// Mock data for the simulation
const LOG_MESSAGES = [
  "Сканирование канала #marketing_pros...",
  "Анализ содержимого сообщения...",
  "Определение намерения: ПОКУПКА",
  "Фильтрация спам-паттернов...",
  "Квалификация пользователя...",
  "Проверка черного списка...",
  "Анализ тональности: ПОЗИТИВНЫЙ",
  "Подготовка персонализированного ответа...",
  "Скоринг лида: 92/100",
  "Подключение к CRM...",
];

const FOUND_LEADS = [
  { name: "Алексей М.", role: "CMO", company: "TechCorp", avatar: "АМ" },
  { name: "Ольга К.", role: "Основатель", company: "StartUp Inc", avatar: "ОК" },
  { name: "Михаил Р.", role: "РОП", company: "GlobalSales", avatar: "МР" },
  { name: "Елена В.", role: "Маркетолог", company: "Creative A.", avatar: "ЕВ" },
];

const Hero: React.FC<{ onOpenLeadForm?: () => void }> = ({ onOpenLeadForm }) => {
  const navigate = useNavigate();
  
  // Animation State
  const [logs, setLogs] = useState<string[]>(["Система инициализирована..."]);
  const [leads, setLeads] = useState<typeof FOUND_LEADS>([]);
  const [activeChannel, setActiveChannel] = useState("Дизайн Чат");

  // Simulation Loop
  useEffect(() => {
    const logInterval = window.setInterval(() => {
      const randomLog = LOG_MESSAGES[Math.floor(Math.random() * LOG_MESSAGES.length)];
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setLogs(prev => [`[${timestamp}] ${randomLog}`, ...prev].slice(0, 8));
    }, 800);

    const leadInterval = window.setInterval(() => {
      const randomLead = FOUND_LEADS[Math.floor(Math.random() * FOUND_LEADS.length)];
      setLeads(prev => {
        const newLeads = [randomLead, ...prev].slice(0, 3);
        return newLeads;
      });
    }, 2500);

    const channelInterval = window.setInterval(() => {
        const channels = ["Крипто Трейдеры", "SaaS Основатели", "Маркетинг Чаты", "Биржа Фриланса"];
        setActiveChannel(channels[Math.floor(Math.random() * channels.length)]);
    }, 3000);

    return () => {
      clearInterval(logInterval);
      clearInterval(leadInterval);
      clearInterval(channelInterval);
    };
  }, []);

  const handleCtaClick = () => {
    // Track Yandex Metrika goal
    if ((window as any).ym) {
      (window as any).ym(105579261, 'reachGoal', 'CLICK_HERO_CTA');
    }
    
    if (onOpenLeadForm) {
      onOpenLeadForm();
    } else {
      navigate('/login');
    }
  };

  return (
    <section className="relative pt-24 pb-24 overflow-hidden min-h-[100vh] flex flex-col items-center bg-[#050505]">
      
      {/* Static Background Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-brand-500/5 rounded-full blur-[120px] z-0 pointer-events-none"></div>
      
      {/* Background Text "TELEGRAM SCANNER" - Huge, behind content */}
      <div className="absolute top-0 inset-x-0 w-full flex justify-center z-0 pointer-events-none opacity-[0.03] select-none overflow-hidden">
        <h1 className="text-[12vw] font-display font-bold text-white leading-none whitespace-nowrap tracking-widest">
          TELEGRAM SCANNER
        </h1>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center mt-16 mb-12 px-4 w-full max-w-5xl mx-auto">
          
          {/* Headline */}
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-display font-bold tracking-tight text-white leading-[1.1] mb-6 drop-shadow-2xl">
            Получайте 20–60 тёплых лидов <br className="hidden md:block"/> из закрытых чатов каждый месяц
          </h2>
          
          {/* Subheadline */}
          <div className="max-w-xl mx-auto mb-8">
             <p className="text-base md:text-lg text-gray-300 leading-relaxed font-medium antialiased">
                Сканируем Telegram, квалифицируем лидов и автоматически, пишем от вашего имени.
                <br />
                <span className="text-brand-500 font-bold block mt-2 text-lg">15 первых лидов — бесплатно.</span>
            </p>
          </div>

           {/* Buttons */}
            <div className="flex flex-col items-center justify-center mt-6">
                <button 
                  onClick={handleCtaClick}
                  className="group relative px-8 py-3 bg-white text-black hover:bg-brand-500 hover:text-white rounded-full font-bold text-base shadow-[0_0_30px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_50px_-10px_rgba(249,115,22,0.6)] transition-all duration-300 hover:scale-105 active:scale-95 overflow-hidden min-w-[260px]"
                >
                    <span className="relative flex items-center justify-center gap-3 z-20">
                        Получить 15 лидов бесплатно
                        <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                    </span>
                </button>
                <p className="mt-4 text-xs text-gray-500 font-medium">
                    Никаких обязательств. <br className="md:hidden" />
                    <span className="text-gray-400 ml-1">Настроим ваш AI-Radar за 24 часа.</span>
                </p>
            </div>
      </div>

      {/* DASHBOARD SIMULATION - Wide */}
      <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-20 mt-auto mb-[-20px]">
         {/* Main Container - Fully rounded now */}
            <div className="bg-[#050505] border border-white/10 rounded-2xl p-1 relative overflow-hidden group shadow-[0_0_60px_-15px_rgba(0,0,0,0.8)]">
                
                {/* Window Controls */}
                <div className="h-8 bg-[#080808] border-b border-white/5 rounded-t-xl flex items-center px-4 space-x-2">
                    <div className="w-3 h-3 rounded-full bg-[#FF5F56]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#FFBD2E]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#27C93F]"></div>
                    <div className="ml-auto text-[10px] font-mono text-gray-600 flex items-center gap-2 uppercase tracking-widest">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></span>
                        Scanner.AI
                    </div>
                </div>

                {/* Dashboard Grid - Height */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-px bg-white/5 h-auto md:h-[450px] relative">
                    {/* Subtle scan line overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-brand-500/0 via-brand-500/[0.02] to-brand-500/0 pointer-events-none animate-scan z-20 hidden md:block"></div>
                    
                    {/* LEFT: Terminal (Logs) */}
                    <div className="md:col-span-4 bg-[#050505] p-5 flex flex-col relative overflow-hidden h-[200px] md:h-auto border-b md:border-b-0 border-white/5">
                         <div className="flex items-center gap-2 text-gray-500 mb-4 pb-3 border-b border-white/5">
                            <Terminal size={14} className="text-brand-500" />
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Логи</span>
                        </div>
                        <div className="font-mono text-[10px] space-y-2.5 overflow-hidden relative flex-1">
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#050505] z-10 pointer-events-none"></div>
                            {logs.map((log, i) => (
                                <div key={i} className="text-gray-400 animate-fade-in-up border-l border-brand-500/30 pl-3 py-0.5 truncate flex items-center gap-2">
                                    <span className="text-brand-500/50 text-[8px]">{new Date().toLocaleTimeString().split(' ')[0]}</span>
                                    <span>{log}</span>
                                </div>
                            ))}
                        </div>
                        {/* Status Footer */}
                        <div className="mt-auto pt-4 border-t border-white/5 flex justify-between items-center text-[9px] text-gray-500 font-mono uppercase tracking-wider">
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-1 bg-green-500 rounded-full"></div>
                                Система активна
                            </div>
                            <span>v2.4.0</span>
                        </div>
                    </div>

                    {/* MIDDLE: Visual Map/Scanner */}
                    <div className="md:col-span-5 bg-[#080808] p-0 relative overflow-hidden flex flex-col h-[250px] md:h-auto border-b md:border-b-0 border-white/5">
                        {/* Top Bar */}
                        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10">
                            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                                <Activity size={12} className="text-brand-500" />
                                <span className="text-[10px] font-mono text-white font-bold truncate max-w-[150px]">Цель: {activeChannel}</span>
                            </div>
                            <div className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 rounded text-[9px] text-green-500 font-bold animate-pulse uppercase tracking-wider">
                                Мониторинг
                            </div>
                        </div>

                        {/* Radar Graphic */}
                        <div className="flex-1 flex items-center justify-center relative">
                            {/* Grid */}
                            <div className="absolute inset-0 opacity-20" 
                                style={{backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '30px 30px'}}>
                            </div>
                            
                            {/* Radar Circles */}
                            <div className="relative w-64 h-64 flex items-center justify-center">
                                <div className="absolute inset-0 rounded-full border border-brand-500/20 animate-[ping_3s_linear_infinite]"></div>
                                <div className="absolute w-48 h-48 rounded-full border border-white/10"></div>
                                <div className="absolute w-32 h-32 rounded-full border border-white/10 bg-brand-500/5 backdrop-blur-sm"></div>
                                
                                {/* Scanning Beam */}
                                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-brand-500/20 to-transparent animate-[spin_4s_linear_infinite]"
                                     style={{ clipPath: 'polygon(50% 50%, 100% 0, 100% 50%)' }}>
                                </div>

                                {/* Center Icon */}
                                <div className="w-14 h-14 bg-[#0a0a0a] rounded-full border border-brand-500 flex items-center justify-center z-20 shadow-[0_0_30px_rgba(249,115,22,0.4)] relative">
                                    <div className="absolute inset-0 bg-brand-500/20 blur-md rounded-full animate-pulse"></div>
                                    <Search className="text-brand-500 w-6 h-6 relative z-10" />
                                </div>
                            </div>
                        </div>

                        {/* Bottom Metrics */}
                        <div className="h-20 bg-[#050505] border-t border-white/5 p-0 grid grid-cols-3 divide-x divide-white/5">
                            <div className="flex flex-col items-center justify-center">
                                <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Обработано</div>
                                <div className="text-xl font-bold text-white font-display">12,403</div>
                            </div>
                             <div className="flex flex-col items-center justify-center bg-brand-500/5">
                                <div className="text-[9px] text-brand-500 uppercase tracking-wider mb-1">Лиды</div>
                                <div className="text-xl font-bold text-brand-500 font-display">842</div>
                            </div>
                             <div className="flex flex-col items-center justify-center">
                                <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Отфильтровано</div>
                                <div className="text-xl font-bold text-gray-400 font-display">11.2k</div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Leads Feed */}
                    <div className="md:col-span-3 bg-[#050505] p-4 flex flex-col border-l border-white/5">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                            <div className="flex items-center gap-2 text-gray-500">
                                <User size={14} />
                                <span className="text-[10px] font-mono font-bold uppercase tracking-wider">Новые лиды</span>
                            </div>
                            <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse"></span>
                        </div>
                        
                        <div className="space-y-3 flex-1 overflow-hidden">
                            {leads.map((lead, i) => (
                                <div key={i + lead.name} className="bg-[#0A0A0A] p-3 rounded-lg border border-white/5 hover:border-brand-500/40 transition-all animate-fade-in-up shadow-lg flex items-center gap-3 group cursor-pointer hover:bg-white/5">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500/20 to-brand-500/5 flex items-center justify-center text-brand-500 text-[10px] font-bold border border-brand-500/20 group-hover:scale-110 transition-transform">
                                        {lead.avatar}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[11px] font-bold text-white truncate group-hover:text-brand-500 transition-colors">{lead.name}</div>
                                        <div className="text-[9px] text-gray-500 truncate">{lead.role}</div>
                                    </div>
                                    <div className="text-[9px] text-gray-600 font-mono">2m</div>
                                </div>
                            ))}
                        </div>

                        {/* STATUS: Creating Post */}
                         <div className="w-full mt-4 bg-white/5 border border-white/5 rounded px-3 py-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-brand-500 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                                <Edit3 size={12} />
                                <span>Создаю пост...</span>
                            </div>
                            <Loader2 size={12} className="text-brand-500 animate-spin" />
                        </div>
                    </div>
                </div>
            </div>
        </div>

      {/* Fade Gradient at Bottom for smooth transition */}
      <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-[#050505] to-transparent z-30 pointer-events-none"></div>
    </section>
  );
};

export default Hero;
