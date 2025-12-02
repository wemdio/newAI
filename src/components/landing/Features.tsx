import React, { useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

const steps = [
  {
    id: '01',
    title: 'Подключаем ваши ниши',
    desc: 'Мы вступаем в закрытые и платные чаты, подключаем открытые источники, добавляем ваши чаты по желанию.',
  },
  {
    id: '02',
    title: 'AI ловит релевантные запросы',
    desc: 'Любой запрос из серии «Ищу подрядчика / сервис / специалиста» попадает в систему за 1–2 секунды.',
  },
  {
    id: '03',
    title: 'Система квалифицирует лида',
    desc: 'Каждому контакту присваивается relevance score + объяснение.',
  },
  {
    id: '04',
    title: 'Автоконтактирование',
    subtitle: '(ваш менеджер 24/7)',
    desc: (
        <ul className="list-none space-y-2 mt-4 text-gray-500">
            <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-2"></span>
                <span>Мы отправляем лидy персонализированное сообщение:</span>
            </li>
            <li className="pl-4 text-sm transition-colors hover:text-brand-400 cursor-default">От вашего имени</li>
            <li className="pl-4 text-sm transition-colors hover:text-brand-400 cursor-default">В вашем стиле</li>
            <li className="pl-4 text-sm transition-colors hover:text-brand-400 cursor-default">На основе контекста их сообщения</li>
            <li className="pl-4 text-sm transition-colors hover:text-brand-400 cursor-default">Без спама</li>
            <li className="pl-4 text-sm transition-colors hover:text-brand-400 cursor-default">Передаём диалог вам, когда человек отвечает.</li>
        </ul>
    ),
    fullWidth: true,
  },
];

const SpotlightCard = ({ children, className = "", fullWidth = false }: { children: React.ReactNode, className?: string, fullWidth?: boolean }) => {
    const divRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!divRef.current) return;
        const rect = divRef.current.getBoundingClientRect();
        setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    const handleMouseEnter = () => {}; // Removed unused opacity state
    const handleMouseLeave = () => {};

    return (
        <motion.div
            ref={divRef}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            className={`relative overflow-hidden rounded-3xl bg-[#0f0f0f] border border-white/5 group ${className} ${fullWidth ? 'md:col-span-2 lg:col-span-2' : ''}`}
        >
            {/* Spotlight Effect */}
            <div
                className="pointer-events-none absolute -inset-px opacity-0 transition duration-300 group-hover:opacity-100"
                style={{
                    background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(249,115,22,0.1), transparent 40%)`,
                }}
            />
            {/* Border Glow */}
            <div 
                className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100 rounded-3xl"
                style={{
                    border: '1px solid rgba(249,115,22,0.2)',
                    maskImage: `radial-gradient(300px circle at ${position.x}px ${position.y}px, black, transparent)`,
                    WebkitMaskImage: `radial-gradient(300px circle at ${position.x}px ${position.y}px, black, transparent)`,
                }}
            />
            
            <div className="relative z-10 h-full">{children}</div>
        </motion.div>
    );
};

const Features: React.FC<{ onOpenLeadForm?: () => void }> = ({ onOpenLeadForm }) => {
  const handleCtaClick = () => {
    // Track Yandex Metrika goal
    if ((window as any).ym) {
      (window as any).ym(105579261, 'reachGoal', 'CLICK_FEATURES_CTA');
    }
    
    if (onOpenLeadForm) {
      onOpenLeadForm();
    } else {
      window.location.href = '/login';
    }
  };

  return (
    <section id="features" className="py-32 bg-[#050505] relative overflow-hidden">
      {/* Top Gradient for smooth transition */}
      <div className="absolute top-0 w-full h-32 bg-gradient-to-b from-[#050505] to-transparent z-10 pointer-events-none" />
      
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-900/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-end mb-20 gap-6 text-center md:text-left">
            <div className="max-w-2xl mx-auto md:mx-0">
                <motion.div  
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    className="inline-block px-3 py-1 bg-brand-500/10 rounded-full border border-brand-500/20 text-brand-500 text-xs font-bold uppercase tracking-wider mb-6"
                >
                    Процесс
                </motion.div>
                <motion.h2 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 }}
                    className="text-4xl md:text-5xl font-bold text-white mb-6"
                >
                    Как это работает
                </motion.h2>
                <motion.p 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                    className="text-gray-400 text-lg"
                >
                    Полный цикл автоматизации: от поиска до первого контакта.
                </motion.p>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {steps.slice(0, 3).map((step, index) => (
            <SpotlightCard key={index} className="p-8 flex flex-col h-full">
              <div className="flex items-baseline gap-4 mb-6">
                  <span className="text-5xl font-display font-bold text-white/10 group-hover:text-brand-500/20 transition-colors duration-500">{step.id}</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-brand-500 transition-colors duration-300">{step.title}</h3>
              <p className="text-gray-500 leading-relaxed group-hover:text-gray-400 transition-colors mt-auto text-base">
                {step.desc}
              </p>
            </SpotlightCard>
          ))}
          
          {/* Step 4 - Large Card */}
          <SpotlightCard fullWidth className="p-8 md:p-10">
             <div className="flex flex-col h-full">
                <div className="flex items-center gap-4 mb-6">
                    <span className="text-5xl font-display font-bold text-white/10 group-hover:text-brand-500/20 transition-colors duration-500">{steps[3].id}</span>
                    <div>
                        <h3 className="text-2xl font-bold text-white group-hover:text-brand-500 transition-colors duration-300">{steps[3].title}</h3>
                        <span className="text-gray-500 text-sm">{steps[3].subtitle}</span>
                    </div>
                </div>
                <div className="text-gray-500 leading-relaxed group-hover:text-gray-400 transition-colors text-base">
                    {steps[3].desc}
                </div>
             </div>
          </SpotlightCard>

          {/* CTA Card */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            whileHover={{ scale: 1.02 }}
            onClick={handleCtaClick}
            className="p-8 rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 flex flex-col justify-center items-center text-center shadow-2xl relative overflow-hidden group cursor-pointer border border-brand-500/50"
          >
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-soft-light"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
            
            <h3 className="text-3xl font-bold text-white mb-6 relative z-10 drop-shadow-lg">15 лидов бесплатно</h3>
            <button className="relative z-10 px-8 py-4 bg-white text-brand-600 rounded-full font-bold text-base transition-transform shadow-xl flex items-center gap-2 group/btn hover:bg-gray-50">
                Получить сейчас
                <ArrowRight size={18} className="group-hover/btn:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Features;