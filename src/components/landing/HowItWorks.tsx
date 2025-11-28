import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CheckCircle, Radio, BarChart3, Send, FileText, Bot, Loader2, Bell, ArrowRight, Zap } from 'lucide-react';

const steps = [
  {
    id: 1,
    title: 'Мониторинг 24/7',
    subtitle: 'STEP 01',
    desc: 'Мониторит 1000+ Telegram-сообществ в реальном времени (в т.ч. закрытые клубы и платные комьюнити).',
    icon: <Radio className="w-6 h-6" />,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    id: 2,
    title: 'Поиск лидов',
    subtitle: 'STEP 02',
    desc: 'Находит любые релевантные лиды под вашу нишу на основе заданных критериев.',
    icon: <Search className="w-6 h-6" />,
    color: 'from-violet-500 to-purple-500',
  },
  {
    id: 3,
    title: 'AI Скоринг',
    subtitle: 'STEP 03',
    desc: 'Присваивает каждому лиду скор от 0 до 100%, чтобы вы не тратили время на нецелевых клиентов.',
    icon: <BarChart3 className="w-6 h-6" />,
    color: 'from-orange-500 to-amber-500',
  },
  {
    id: 4,
    title: 'Анализ',
    subtitle: 'STEP 04',
    desc: 'Объясняет, почему именно этот человек подходит, анализируя контекст его сообщений.',
    icon: <Zap className="w-6 h-6" />,
    color: 'from-pink-500 to-rose-500',
  },
  {
    id: 5,
    title: 'Генерация',
    subtitle: 'STEP 05',
    desc: 'Генерирует идеальное сообщение в ЛС, адаптированное под конкретного человека.',
    icon: <FileText className="w-6 h-6" />,
    color: 'from-indigo-500 to-blue-500',
  },
  {
    id: 6,
    title: 'Авто-аутрич',
    subtitle: 'STEP 06',
    desc: 'Сама пишет лиду от вашего имени (вежливое, персонализированное первое касание).',
    icon: <Send className="w-6 h-6" />,
    color: 'from-green-500 to-emerald-500',
  },
  {
    id: 7,
    title: 'Передача',
    subtitle: 'STEP 07',
    desc: 'Передаёт вам только тех, кто вышел на диалог и готов к обсуждению.',
    icon: <CheckCircle className="w-6 h-6" />,
    color: 'from-teal-500 to-cyan-500',
  }
];

// Demo Lead Data
const demoLead = {
    name: "Карина",
    avatar: "K",
    channel: "Бизнес и Партнерства",
    time: "15:04",
    message: "Ребята, всем привет 👋 Есть кто занимается лидогенерацией на юридические услуги? Нужно срочно.",
    confidence: 95,
    reason: "Пользователь прямо запрашивает услуги лидогенерации для юридической ниши (B2B услуги).",
    reply: "Карина, привет! 👋 Увидел твой запрос по лидгену для юристов. Мы как раз специализируемся на поиске B2B-клиентов под ключ. Есть кейсы с юр. фирмами. Рассказать подробнее?",
};

const Visualizer = ({ activeStep }: { activeStep: number }) => {
    // Step 0: Monitoring
    const isMonitoring = activeStep === 0;
    // Step 1+: Card Visible
    const showCard = activeStep >= 1;
    // Step 2+: Score Visible
    const showScore = activeStep >= 2;
    // Step 3+: Analysis Visible
    const showAnalysis = activeStep >= 3;
    // Step 4+: Draft Visible
    const showDraft = activeStep >= 4;
    
    // Step 5: Sending (Auto-Outreach)
    // We want the "Sending" button AND the "Success Overlay" here
    // const showSending = activeStep === 5; // Removed unused variable

    // Step 6: Transfer (Lead replied)
    const showTransfer = activeStep === 6;

    return (
        <div className="relative w-full h-full flex items-center justify-center">
            
            {/* STAGE 1: MONITORING ANIMATION (Background) */}
            <AnimatePresence>
                {isMonitoring && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center"
                    >
                        <div className="relative w-64 h-64">
                             <div className="absolute inset-0 border border-brand-500/30 rounded-full"></div>
                             <div className="absolute inset-12 border border-brand-500/10 rounded-full"></div>
                             <div className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-500/10 to-transparent animate-spin-slow rounded-full" style={{ clipPath: 'polygon(50% 50%, 100% 0, 100% 50%)' }}></div>
                             
                             {/* Floating Chat Bubbles simulating scanning */}
                             {[1,2,3,4].map(i => (
                                 <motion.div
                                    key={i}
                                    initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
                                    animate={{ 
                                        scale: [0, 1, 0], 
                                        opacity: [0, 1, 0],
                                        x: Math.random() * 200 - 100,
                                        y: Math.random() * 200 - 100
                                    }}
                                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
                                    className="absolute top-1/2 left-1/2 w-2 h-2 bg-brand-500 rounded-full shadow-[0_0_10px_#f97316]"
                                 />
                             ))}
                             
                             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-500 font-mono text-xs animate-pulse">
                                SCANNING...
                             </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* STAGE 2+: THE CARD EVOLUTION */}
            <AnimatePresence>
                {showCard && (
                    <motion.div 
                        initial={{ scale: 0.8, opacity: 0, y: 50 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        transition={{ type: "spring", bounce: 0.4 }}
                        className="w-full max-w-sm bg-[#0A0A0A] border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative z-10"
                    >
                        {/* Progress Bar Top */}
                        <div className="h-1 w-full bg-white/5">
                            <motion.div 
                                className="h-full bg-brand-500 shadow-[0_0_10px_#f97316]"
                                initial={{ width: "0%" }}
                                animate={{ width: `${((activeStep + 1) / 7) * 100}%` }}
                                transition={{ duration: 0.5 }}
                            />
                        </div>

                        <div className="p-6 space-y-6 relative">
                            {/* Header: User Info */}
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-800 to-black border border-white/10 flex items-center justify-center text-white font-bold text-lg">
                                        {demoLead.avatar}
                                    </div>
                                    <div>
                                        <div className="text-white font-bold text-base">{demoLead.name}</div>
                                        <div className="text-[10px] text-gray-500">@{demoLead.channel}</div>
                                    </div>
                                </div>
                                {showScore && (
                                    <motion.div 
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="flex flex-col items-end"
                                    >
                                        <div className="text-2xl font-display font-bold text-brand-500">{demoLead.confidence}%</div>
                                        <div className="text-[9px] text-gray-500 uppercase tracking-wider">Match Score</div>
                                    </motion.div>
                                )}
                            </div>

                            {/* Message Content */}
                            <div className="bg-[#151515] rounded-2xl p-4 border border-white/5">
                                <p className="text-gray-300 text-sm leading-relaxed font-medium">
                                    "{demoLead.message}"
                                </p>
                            </div>

                            {/* AI Analysis Section */}
                            {showAnalysis && !showTransfer && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="space-y-2 overflow-hidden"
                                >
                                    <div className="flex items-center gap-2 text-brand-500">
                                        <Zap size={14} />
                                        <span className="text-xs font-bold uppercase tracking-wide">Почему это целевой лид?</span>
                                    </div>
                                    <p className="text-xs text-gray-400 leading-relaxed pl-6 border-l-2 border-brand-500/20">
                                        {demoLead.reason}
                                    </p>
                                </motion.div>
                            )}

                            {/* AI Draft / Generation */}
                            {showDraft && !showTransfer && (
                                <motion.div 
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="space-y-2"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-indigo-400">
                                            <Bot size={14} />
                                            <span className="text-xs font-bold uppercase tracking-wide">Черновик ответа</span>
                                        </div>
                                        {activeStep === 4 && <Loader2 size={12} className="animate-spin text-indigo-400" />}
                                    </div>
                                    <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3">
                                        <p className="text-xs text-indigo-200 font-mono">
                                            {activeStep === 4 ? (
                                                <span className="animate-pulse">Генерация ответа...</span>
                                            ) : (
                                                demoLead.reply
                                            )}
                                        </p>
                                    </div>
                                </motion.div>
                            )}

                            {/* Action Button - Appears at Step 5 */}
                            {activeStep === 5 && (
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="pt-2"
                                >
                                    <button className="w-full bg-brand-600 text-white rounded-xl p-3 flex items-center justify-center gap-2 font-bold text-sm shadow-lg shadow-brand-500/20">
                                        <Send size={16} className="animate-pulse" />
                                        Отправка сообщения...
                                    </button>
                                </motion.div>
                            )}

                            {/* Step 6: Transfer / Lead Reply Animation */}
                            {showTransfer && (
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="space-y-4 pt-2"
                                >
                                    {/* Lead Reply Bubble */}
                                    <motion.div 
                                        initial={{ scale: 0.9, opacity: 0, y: 10 }}
                                        animate={{ scale: 1, opacity: 1, y: 0 }}
                                        transition={{ delay: 0.2 }}
                                        className="flex items-end gap-3"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center text-white font-bold text-xs">
                                            {demoLead.avatar}
                                        </div>
                                        <div className="bg-[#2A2A2A] rounded-2xl rounded-bl-none p-3 border border-white/5 shadow-lg">
                                            <p className="text-white text-sm">Да, интересно! Давайте созвонимся.</p>
                                        </div>
                                    </motion.div>

                                    {/* Forwarding Notification */}
                                    <motion.div 
                                        initial={{ x: 50, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        transition={{ delay: 0.8, type: "spring" }}
                                        className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex items-center gap-3 relative overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-blue-500/5 animate-pulse"></div>
                                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 relative z-10">
                                            <Bell size={14} />
                                        </div>
                                        <div className="flex-1 relative z-10">
                                            <div className="text-blue-400 text-[10px] font-bold uppercase tracking-wide mb-0.5">Telegram Notification</div>
                                            <div className="text-gray-300 text-xs font-medium flex items-center gap-1">
                                                Лид ответил <ArrowRight size={10} /> Переслано вам
                                            </div>
                                        </div>
                                    </motion.div>
                                </motion.div>
                            )}

                            {/* Success Overlay for Step 5 (Auto Outreach) */}
                            {activeStep === 5 && (
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1.5 }}
                                    className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-20 rounded-3xl m-0"
                                >
                                    <motion.div 
                                        initial={{ scale: 0.5, y: 20 }}
                                        animate={{ scale: 1, y: 0 }}
                                        className="flex flex-col items-center text-center p-6"
                                    >
                                        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                                            <CheckCircle size={32} className="text-green-500" />
                                        </div>
                                        <h4 className="text-white font-bold text-lg mb-1">Сообщение отправлено</h4>
                                        <p className="text-gray-400 text-xs">Ожидаем ответа от лида...</p>
                                    </motion.div>
                                </motion.div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const HowItWorks: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);

  useEffect(() => {
    if (!isAutoPlay) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => {
          if (prev === steps.length - 1) return 0; 
          return prev + 1;
      });
    }, 3500); 
    return () => clearInterval(interval);
  }, [isAutoPlay]);

  return (
    <section id="how-it-works" className="py-32 bg-[#050505] relative overflow-hidden">
      
      {/* Background Elements */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-brand-900/20 via-[#050505] to-[#050505] pointer-events-none" />
      {/* Removed harsh top line, added subtle gradient blend */}
      <div className="absolute top-0 w-full h-32 bg-gradient-to-b from-[#050505] to-transparent z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header */}
        <div className="text-center mb-12">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-display font-bold text-white mb-6 tracking-tight"
          >
            Что такое <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-orange-600">AI-Radar</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-gray-400 max-w-2xl mx-auto text-lg"
          >
            Пошаговый процесс автоматизации поиска клиентов
          </motion.p>
        </div>

        {/* Main Content Grid */}
        <div className="flex flex-col-reverse lg:grid lg:grid-cols-2 gap-12 lg:gap-16 items-start relative">
            
            {/* Left Column: Steps List */}
            <div className="space-y-2 relative w-full lg:pt-0">
                {/* Connecting Line */}
                <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-white/5 z-0"></div>

                {steps.map((step, index) => {
                    const isActive = activeStep === index;
                    const isPast = activeStep > index;
                    
                    return (
                        <motion.div
                            key={step.id}
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.05 }}
                            onClick={() => { setActiveStep(index); setIsAutoPlay(false); }}
                            className={`
                                group relative z-10 pl-12 py-4 cursor-pointer transition-all duration-300
                                ${isActive ? 'opacity-100' : 'opacity-40 hover:opacity-70'}
                            `}
                        >
                            {/* Dot Indicator */}
                            <div className={`
                                absolute left-2.5 top-6 w-5 h-5 rounded-full border-2 flex items-center justify-center bg-black transition-all duration-300
                                ${isActive ? 'border-brand-500 scale-110 shadow-[0_0_10px_#f97316]' : isPast ? 'border-brand-500/50 bg-brand-500/20' : 'border-white/10'}
                            `}>
                                {isActive && <div className="w-2 h-2 rounded-full bg-brand-500" />}
                                {isPast && <CheckCircle size={10} className="text-brand-500" />}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 mb-1">
                                <h3 className={`text-lg font-bold transition-colors ${isActive ? 'text-white' : 'text-gray-400'}`}>
                                    {step.title}
                                </h3>
                                {isActive && (
                                    <span className="text-[10px] font-mono text-brand-500 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20 animate-pulse">
                                        ACTIVE
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-gray-400 max-w-md leading-relaxed">
                                {step.desc}
                            </p>
                        </motion.div>
                    );
                })}
            </div>

            {/* Right Column: Dynamic Visualizer */}
            <div className="w-full lg:sticky lg:top-32 lg:h-[600px] flex items-start lg:items-center justify-center perspective-1000 mb-8 lg:mb-0">
                <div className="relative w-full max-w-md aspect-square lg:aspect-[3/4] bg-[#080808]/50 backdrop-blur-sm rounded-3xl border border-white/5 p-4 lg:p-0 lg:border-none lg:bg-transparent lg:backdrop-filter-none">
                    {/* Decorative Glows - Hidden on mobile to save performance/visual noise */}
                    <div className={`hidden lg:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-brand-500/5 blur-[100px] rounded-full transition-opacity duration-1000 ${activeStep === 0 ? 'opacity-0' : 'opacity-100'}`}></div>
                    
                    <Visualizer activeStep={activeStep} />
                </div>
            </div>

        </div>
      </div>
    </section>
  );
};

export default HowItWorks;