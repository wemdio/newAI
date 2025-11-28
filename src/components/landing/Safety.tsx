import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';

const Safety: React.FC = () => {
  const items = [
    "Мы оплачиваем доступ к чатам, вступаем вручную.",
    "Никаких ботов, спама, парсеров, серых схем.",
    "Мы соблюдаем закон о рекламе.",
    "Все сообщения — персонализированные и человеческие."
  ];

  return (
    <section className="py-32 bg-[#050505] relative overflow-hidden">
       {/* Top Gradient for smooth transition */}
       <div className="absolute top-0 w-full h-32 bg-gradient-to-b from-[#050505] to-transparent z-10 pointer-events-none" />
       
       <div className="max-w-3xl mx-auto px-4 relative z-10">
           <div className="flex flex-col items-center text-center">
               
               <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  className="mb-12 p-4 bg-brand-500/5 rounded-full border border-brand-500/10"
               >
                   <ShieldCheck className="w-8 h-8 text-brand-500" />
               </motion.div>

               <motion.h2 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="text-3xl md:text-5xl font-bold text-white mb-16 tracking-tight"
               >
                  Безопасно и бело
               </motion.h2>
               
               <div className="grid gap-8 w-full">
                   {items.map((text, idx) => (
                       <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 20 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: idx * 0.1 }}
                          className="group relative"
                       >
                           <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:via-brand-500/20 transition-colors duration-500" />
                           <p className="relative z-10 text-lg md:text-xl text-gray-400 group-hover:text-white transition-colors duration-300 py-4 bg-[#050505] inline-block px-6">
                               {text}
                           </p>
                       </motion.div>
                   ))}
               </div>
           </div>
       </div>
    </section>
  )
}
export default Safety;