import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Gift, Plus } from 'lucide-react';

const pricingData = [
  {
    title: 'Настройка AI-Radar',
    price: '30 000 ₽',
    period: '/ 1-й месяц',
    description: 'Полная техническая настройка под вашу нишу. Со второго месяца — 10 000 ₽/мес.',
    isBase: true,
  },
  {
    title: 'Автоконтактирование',
    price: '20 000 ₽',
    period: '/ месяц',
    description: 'AI агент сам общается и передает вам готовых к сделке клиентов.',
    isOption: true,
  }
];

const PricingCard = ({ item, index }: { item: typeof pricingData[0], index: number }) => {
    const divRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [opacity, setOpacity] = useState(0);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!divRef.current) return;
        const rect = divRef.current.getBoundingClientRect();
        setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    const handleMouseEnter = () => setOpacity(1);
    const handleMouseLeave = () => setOpacity(0);

    return (
        <motion.div
            ref={divRef}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
            className={`relative overflow-hidden rounded-3xl bg-[#0a0a0a] border group flex flex-col p-10 h-full w-full max-w-md ${item.isOption ? 'border-brand-500/30' : 'border-white/5'}`}
        >
            {/* Spotlight Effect */}
            <div
                className="pointer-events-none absolute -inset-px opacity-0 transition duration-300 group-hover:opacity-100"
                style={{
                    background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(249,115,22,0.06), transparent 40%)`,
                }}
            />
             <div 
                className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100 rounded-3xl"
                style={{
                    border: '1px solid rgba(249,115,22,0.1)',
                    maskImage: `radial-gradient(300px circle at ${position.x}px ${position.y}px, black, transparent)`,
                    WebkitMaskImage: `radial-gradient(300px circle at ${position.x}px ${position.y}px, black, transparent)`,
                }}
            />
            
            {/* Badge moved to be a direct child of the card for absolute positioning relative to the card border */}
            {item.isOption && (
                <div className="absolute top-0 right-0 bg-brand-500/10 border-l border-b border-brand-500/20 px-4 py-2 rounded-bl-2xl z-20">
                   <span className="text-xs font-bold text-brand-500 uppercase tracking-wider">Дополнительная опция</span>
               </div>
           )}

            <div className="relative z-10 flex flex-col h-full">
                <h3 className="text-2xl font-bold text-white mb-3 pr-8 max-w-[80%]">{item.title}</h3>
                <div className="flex items-baseline gap-2 mb-6">
                    <span className="text-5xl font-display font-bold text-white tracking-tight">{item.price}</span>
                    <span className="text-gray-500 text-base">{item.period}</span>
                </div>
                <p className="text-gray-400 text-base leading-relaxed mb-4 flex-grow">
                    {item.description}
                </p>
            </div>
        </motion.div>
    );
};

const Pricing: React.FC = () => {
  return (
    <section id="pricing" className="py-32 bg-dark-950 relative overflow-hidden">
        {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand-900/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-20">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl font-bold text-white mb-6"
          >
            Стоимость
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-xl text-gray-400 max-w-2xl mx-auto"
          >
            Для первых 5 клиентов фиксируем цену навсегда.
          </motion.p>
        </div>

        <div className="flex flex-col md:flex-row justify-center items-center gap-8 mb-16 relative">
          <PricingCard item={pricingData[0]} index={0} />
          
          {/* Connector */}
          <motion.div 
            initial={{ opacity: 0, scale: 0 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="flex-shrink-0 w-12 h-12 rounded-full bg-[#0a0a0a] border border-white/10 flex items-center justify-center z-20 text-gray-500 rotate-90 md:rotate-0"
          >
            <Plus className="w-6 h-6" />
          </motion.div>

          <PricingCard item={pricingData[1]} index={1} />
        </div>

        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="flex justify-center"
        >
            <div className="inline-flex items-center gap-3 bg-brand-500/10 border border-brand-500/20 rounded-full px-6 py-3 backdrop-blur-sm">
                <Gift className="w-5 h-5 text-brand-500" />
                <span className="text-brand-500 font-bold">
                    Подарок: <span className="text-white font-medium">15 бесплатных лидов под вашу нишу</span>
                </span>
            </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Pricing;