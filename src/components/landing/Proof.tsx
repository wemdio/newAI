import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

const Proof: React.FC = () => {
  const stats = [
    {
      label: "Лидов в месяц",
      value: "20-60",
      subtext: "ИЗ ЖИВЫХ ДИАЛОГОВ"
    },
    {
      label: "Активных переписок",
      value: "8-15",
      subtext: "В НЕДЕЛЮ"
    },
    {
      label: "Готовых к покупке",
      value: "100%",
      subtext: "ТЁПЛЫЕ КЛИЕНТЫ"
    },
    {
      label: "Менеджеров в штате",
      value: "+0",
      subtext: "AI ДЕЛАЕТ РУТИНУ"
    }
  ];

  return (
    <section id="proof" className="py-32 bg-dark-950 relative overflow-hidden scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <div className="grid lg:grid-cols-2 gap-20 items-start">
          
          {/* Left Content */}
          <div className="text-center lg:text-left">
            <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-4xl md:text-6xl font-bold text-white mb-8 leading-tight"
            >
               Реальные результаты, <br/> подтвержденные данными
            </motion.h2>
            
            <motion.p 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="text-gray-400 text-lg max-w-md leading-relaxed mx-auto lg:mx-0"
            >
                Наша система не просто ищет, она экспоненциально увеличивает вашу воронку продаж. Каждый лид — это результат точного алгоритмического поиска.
            </motion.p>
          </div>

          {/* Right Content - Clean Stats Grid (Reference Style) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-12 sm:gap-y-16">
            {stats.map((stat, index) => (
                <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 + 0.2 }}
                    className="flex flex-col items-center sm:items-start"
                >
                    <span className="text-gray-400 text-sm font-medium mb-3 block">
                        {stat.label}
                    </span>
                    
                    <div className="flex items-start mb-3">
                        <span className="text-5xl md:text-6xl lg:text-7xl font-display font-bold text-white tracking-tighter leading-none">
                            {stat.value}
                        </span>
                        <div className="ml-2 mt-1 p-1 rounded-full bg-brand-500/10 border border-brand-500/20">
                            <ArrowUpRight className="w-4 h-4 text-brand-500" />
                        </div>
                    </div>
                    
                    <span className="text-gray-500 text-[10px] font-mono uppercase tracking-widest">
                        {stat.subtext}
                    </span>
                </motion.div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
};

export default Proof;