import React from 'react';
import { motion } from 'framer-motion';

const cases = [
  "Маркетинговые агентства",
  "Продажи / SDR / B2B outbound",
  "SaaS и IT-продукты",
  "HR и рекрутинг",
  "Эксперты / школы / консалтинг",
  "Инфобизнес",
  "Площадки и сервисы"
];

const UseCases: React.FC = () => {
  return (
    <section className="py-32 bg-[#050505] relative overflow-hidden">
      {/* Background subtle grid pattern */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-soft-light pointer-events-none"></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <div className="text-center mb-20">
            <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-4xl md:text-6xl font-bold text-white tracking-tight"
            >
               Кому подходит
            </motion.h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[1px] bg-white/10 border border-white/10 rounded-3xl overflow-hidden max-w-6xl mx-auto">
            {cases.map((item, index) => {
                const isLast = index === cases.length - 1;
                return (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.05 }}
                        className={`
                            group relative bg-[#050505] p-12 flex flex-col items-center justify-center text-center gap-6 hover:bg-[#0a0a0a] transition-colors duration-500
                            ${isLast ? 'md:col-span-2 lg:col-span-3' : ''}
                        `}
                    >
                        {/* Hover Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-b from-brand-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        
                        <span className="relative z-10 text-xs font-mono text-brand-500/50 uppercase tracking-widest group-hover:text-brand-500 transition-colors duration-300 border border-brand-500/10 px-3 py-1 rounded-full">
                            {String(index + 1).padStart(2, '0')}
                        </span>
                        
                        <h3 className="relative z-10 text-xl md:text-2xl font-medium text-gray-400 group-hover:text-white transition-colors duration-300">
                            {item}
                        </h3>
                    </motion.div>
                );
            })}
        </div>
      </div>
    </section>
  );
};

export default UseCases;