import React from 'react';

const FinalCTA: React.FC = () => {
  return (
    <section className="py-24 relative overflow-hidden">
       {/* Gradient Background */}
       <div className="absolute inset-0 bg-black z-0"></div>
       <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-brand-600/20 rounded-full blur-[150px] z-0"></div>
       
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="bg-[#0f0f0f]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-16 text-center shadow-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-500 text-xs font-bold uppercase mb-6">
                Ограниченное предложение
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
               Получите первых <span className="text-brand-500">10 лидов бесплатно</span>
            </h2>
            <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
               Оставьте заявку, и мы настроим тестовую кампанию для вашей ниши в течение 24 часов.
            </p>

            <form className="space-y-4 max-w-sm mx-auto">
                <div>
                    <input 
                        type="email" 
                        className="w-full bg-black/50 border border-white/10 rounded-full px-6 py-4 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all text-center placeholder-gray-600"
                        placeholder="Ваш Email"
                    />
                </div>
                <button type="submit" className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-4 rounded-full text-lg shadow-[0_0_30px_-5px_rgba(249,115,22,0.5)] transition-all transform hover:-translate-y-1">
                    Записаться на звонок
                </button>
                <p className="text-xs text-gray-600 mt-4">
                    No credit card required. 14-day free trial.
                </p>
            </form>
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;