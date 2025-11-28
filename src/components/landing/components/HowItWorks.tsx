import React, { useState, useEffect } from 'react';
// Force HMR update
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Search, MessageSquare, CheckCircle, Radio, Users, Zap, BarChart3 } from 'lucide-react';

const steps = [
  {
    id: 1,
    title: 'Настройка таргетинга',
    subtitle: 'STEP 01',
    desc: 'Вы задаете ключевые слова, интересы и критерии идеального клиента. Наша система создает уникальный цифровой профиль поиска.',
    icon: <Settings className="w-6 h-6" />,
    color: 'from-blue-500 to-cyan-500',
    techVisual: (isActive: boolean) => (
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-xl bg-black/40 border border-white/5">
        <div className="absolute inset-0 grid grid-cols-6 grid-rows-6 gap-1 p-2 opacity-30">
           {Array.from({ length: 36 }).map((_, i) => (
             <motion.div 
                key={i}
                initial={{ opacity: 0.1 }}
                animate={isActive ? { 
                  opacity: [0.1, 0.5, 0.1],
                  backgroundColor: Math.random() > 0.7 ? '#3b82f6' : 'transparent'
                } : {}}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.05 }}
                className="rounded-sm border border-white/10"
             />
           ))}
        </div>
        <div className="relative z-10 flex flex-col gap-2 w-3/4">
             <motion.div 
               animate={isActive ? { width: ['0%', '100%'] } : { width: '0%' }}
               className="h-1 bg-blue-500 rounded-full"
               transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
             />
             <motion.div 
               animate={isActive ? { width: ['0%', '70%'] } : { width: '0%' }}
               className="h-1 bg-cyan-500 rounded-full"
               transition={{ duration: 2, delay: 0.2, repeat: Infinity, repeatDelay: 1 }}
             />
             <motion.div 
               animate={isActive ? { width: ['0%', '40%'] } : { width: '0%' }}
               className="h-1 bg-indigo-500 rounded-full"
               transition={{ duration: 2, delay: 0.4, repeat: Infinity, repeatDelay: 1 }}
             />
        </div>
      </div>
    )
  },
  {
    id: 2,
    title: 'AI Сканирование',
    subtitle: 'STEP 02',
    desc: 'Нейросеть мониторит тысячи чатов и каналов в реальном времени, выявляя релевантные обсуждения и потребности.',
    icon: <Search className="w-6 h-6" />,
    color: 'from-violet-500 to-purple-500',
    techVisual: (isActive: boolean) => (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-xl bg-black/40 border border-white/5">
            <motion.div 
                animate={isActive ? { rotate: 360 } : {}}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-500/20 to-transparent opacity-30"
                style={{ clipPath: 'polygon(50% 50%, 100% 0, 100% 100%)' }}
            />
            <div className="absolute inset-2 border border-white/10 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-violet-500 rounded-full shadow-[0_0_10px_#8b5cf6]"></div>
            </div>
            <div className="absolute inset-8 border border-white/5 rounded-full"></div>
            {isActive && (
                <>
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.5, x: -20, y: -20 }}
                        animate={{ opacity: [0, 1, 0], scale: 1 }}
                        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                        className="absolute top-1/3 left-1/3 w-1 h-1 bg-white rounded-full"
                    />
                     <motion.div 
                        initial={{ opacity: 0, scale: 0.5, x: 30, y: 20 }}
                        animate={{ opacity: [0, 1, 0], scale: 1 }}
                        transition={{ duration: 2, repeat: Infinity, delay: 1.2 }}
                        className="absolute bottom-1/3 right-1/3 w-1 h-1 bg-white rounded-full"
                    />
                </>
            )}
        </div>
    )
  },
  {
    id: 3,
    title: 'Умный Прогрев',
    subtitle: 'STEP 03',
    desc: 'Бот вступает в нативный диалог, используя контекст беседы. Никакого спама — только ценные комментарии.',
    icon: <MessageSquare className="w-6 h-6" />,
    color: 'from-orange-500 to-amber-500',
    techVisual: (isActive: boolean) => (
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-xl bg-black/40 border border-white/5 p-4">
         <div className="flex flex-col gap-2 w-full">
            <motion.div 
                initial={{ x: -50, opacity: 0 }}
                animate={isActive ? { x: 0, opacity: 1 } : {}}
                transition={{ duration: 0.5 }}
                className="bg-white/5 p-2 rounded-lg rounded-tl-none self-start w-3/4"
            >
                <div className="h-1.5 bg-white/20 rounded w-full mb-1"></div>
                <div className="h-1.5 bg-white/20 rounded w-1/2"></div>
            </motion.div>
            <motion.div 
                initial={{ x: 50, opacity: 0 }}
                animate={isActive ? { x: 0, opacity: 1 } : {}}
                transition={{ duration: 0.5, delay: 0.8 }}
                className="bg-brand-500/20 border border-brand-500/20 p-2 rounded-lg rounded-tr-none self-end w-3/4"
            >
                <div className="h-1.5 bg-brand-500/40 rounded w-full mb-1"></div>
                <div className="h-1.5 bg-brand-500/40 rounded w-3/4"></div>
            </motion.div>
         </div>
      </div>
    )
  },
  {
    id: 4,
    title: 'Готовый Лид',
    subtitle: 'STEP 04',
    desc: 'Вы получаете уведомление о заинтересованном клиенте, готовом к обсуждению вашего предложения.',
    icon: <CheckCircle className="w-6 h-6" />,
    color: 'from-emerald-500 to-green-500',
    techVisual: (isActive: boolean) => (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-xl bg-black/40 border border-white/5">
            <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={isActive ? { scale: 1, opacity: 1 } : {}}
                className="relative z-10"
            >
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                </div>
            </motion.div>
            {isActive && (
                <motion.div 
                    initial={{ scale: 0.8, opacity: 1 }}
                    animate={{ scale: 2, opacity: 0 }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="absolute w-16 h-16 rounded-full border border-emerald-500/30"
                />
            )}
        </div>
    )
  },
];

const HowItWorks: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="how-it-works" className="py-32 bg-black relative overflow-hidden">
      
      {/* Background Elements */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-brand-900/20 via-black to-black pointer-events-none" />
      <div className="absolute top-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header */}
        <div className="text-center mb-20">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-6"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
            </span>
            <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">Workflow System</span>
          </motion.div>
          
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-bold text-white mb-6"
          >
            Как работает <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-orange-600">Scanner</span>
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-gray-400 max-w-2xl mx-auto text-lg"
          >
            Мы автоматизировали каждый шаг поиска клиентов, чтобы вы могли сосредоточиться на закрытии сделок.
          </motion.p>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            
            {/* Left Column: Interactive Steps List */}
            <div className="space-y-4">
                {steps.map((step, index) => {
                    const isActive = activeStep === index;
                    return (
                        <motion.div
                            key={step.id}
                            initial={{ opacity: 0, x: -50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            onClick={() => setActiveStep(index)}
                            className={`
                                group relative p-6 rounded-2xl border transition-all duration-500 cursor-pointer overflow-hidden
                                ${isActive 
                                    ? 'bg-white/5 border-brand-500/50 shadow-[0_0_30px_-10px_rgba(249,115,22,0.3)]' 
                                    : 'bg-transparent border-white/5 hover:bg-white/[0.02] hover:border-white/10'}
                            `}
                        >
                            {/* Active Progress Bar Background */}
                            {isActive && (
                                <motion.div 
                                    layoutId="activeGlow"
                                    className="absolute inset-0 bg-gradient-to-r from-brand-500/10 to-transparent opacity-100"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                />
                            )}

                            <div className="relative z-10 flex gap-6 items-start">
                                {/* Icon Box */}
                                <div className={`
                                    flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500
                                    ${isActive ? 'bg-brand-500 text-white shadow-lg scale-110' : 'bg-white/5 text-gray-500'}
                                `}>
                                    {step.icon}
                                </div>

                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <h3 className={`text-xl font-bold transition-colors duration-300 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>
                                            {step.title}
                                        </h3>
                                        <span className={`text-xs font-mono font-bold tracking-widest transition-colors ${isActive ? 'text-brand-500' : 'text-gray-700'}`}>
                                            {step.subtitle}
                                        </span>
                                    </div>
                                    <p className={`text-sm leading-relaxed transition-colors duration-300 ${isActive ? 'text-gray-300' : 'text-gray-600'}`}>
                                        {step.desc}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Right Column: Visual Simulation Area */}
            <div className="relative h-[600px] lg:h-[500px] w-full">
                <div className="sticky top-32">
                    <div className="relative w-full aspect-square md:aspect-video lg:aspect-square max-w-md mx-auto">
                        
                        {/* Central Visualization Container */}
                        <div className="absolute inset-0 bg-[#0A0A0A] rounded-3xl border border-white/10 shadow-2xl overflow-hidden ring-1 ring-white/5">
                            
                            {/* Decor Header */}
                            <div className="h-8 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2">
                                <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                                <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                                <div className="w-2 h-2 rounded-full bg-green-500/50"></div>
                                <div className="ml-auto text-[10px] text-gray-600 font-mono">PROCESS_VISUALIZER.EXE</div>
                            </div>

                            {/* Main Viewport */}
                            <div className="relative w-full h-[calc(100%-2rem)] p-6 flex items-center justify-center">
                                
                                {/* Background Grid */}
                                <div className="absolute inset-0 opacity-20" 
                                     style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '20px 20px'}}>
                                </div>

                                <AnimatePresence mode="wait">
                                    <motion.div 
                                        key={activeStep}
                                        initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                        exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
                                        transition={{ duration: 0.4 }}
                                        className="w-full h-full"
                                    >
                                        {steps[activeStep].techVisual(true)}
                                    </motion.div>
                                </AnimatePresence>

                                {/* Overlay Info */}
                                <div className="absolute bottom-6 left-6 right-6">
                                    <div className="flex justify-between items-end">
                                        <div className="space-y-1">
                                            <div className="text-[10px] text-gray-500 uppercase font-mono">Current Process</div>
                                            <div className="text-sm text-white font-bold">{steps[activeStep].title}</div>
                                        </div>
                                        <div className="flex gap-1">
                                            {[0,1,2,3].map(i => (
                                                <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${i === activeStep ? 'bg-brand-500' : 'bg-white/10'}`} />
                                            ))}
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* Decorative Elements behind box */}
                        <div className={`absolute -inset-4 bg-gradient-to-r ${steps[activeStep].color} rounded-[2.5rem] opacity-20 blur-3xl -z-10 transition-all duration-700`}></div>
                    </div>
                </div>
            </div>

        </div>
      </div>
    </section>
  );
};

export default HowItWorks;

