import React from 'react';

const Problem: React.FC = () => {
  return (
    <section className="py-24 bg-[#0a0a0a] border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="order-2 md:order-1">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10 group">
              <div className="absolute inset-0 bg-brand-500/10 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <img 
                src="https://picsum.photos/600/400?grayscale" 
                alt="Уставший человек за компьютером" 
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-500 grayscale group-hover:grayscale-0"
              />
              <div className="absolute bottom-6 left-6 z-20">
                <div className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded mb-2 inline-block tracking-wider">
                  БОЛЬ
                </div>
                <p className="text-white font-medium text-lg drop-shadow-md">Бесконечный скроллинг чатов...</p>
              </div>
            </div>
          </div>
          
          <div className="order-1 md:order-2">
            <div className="inline-block px-3 py-1 bg-white/5 rounded-full border border-white/10 text-gray-400 text-xs font-medium uppercase tracking-wider mb-6">
              Проблема
            </div>
            <h2 className="text-4xl font-bold text-white mb-6 leading-tight">
              90% времени тратится <span className="text-brand-500">впустую?</span>
            </h2>
            <div className="space-y-8">
              <p className="text-lg text-gray-400">
                Предприниматели тратят десятки часов на мониторинг каналов, анализ спама и попытки начать диалог.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center p-4 bg-white/5 rounded-xl border border-white/5">
                    <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mr-4">
                        <span className="text-xl font-bold">×</span>
                    </div>
                    <span className="text-gray-300">Пропущенные сообщения в потоке спама</span>
                </div>
                <div className="flex items-center p-4 bg-white/5 rounded-xl border border-white/5">
                    <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mr-4">
                        <span className="text-xl font-bold">×</span>
                    </div>
                    <span className="text-gray-300">Низкая конверсия холодных обращений</span>
                </div>
              </div>

              <button className="text-white font-bold border-b border-brand-500 hover:text-brand-500 hover:border-b-2 transition-all pb-1">
                Да, я устал тратить время &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Problem;