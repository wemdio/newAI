import React from 'react';
import { Plus } from 'lucide-react';

const faqs = [
  {
    q: "Безопасно ли использовать систему?",
    a: "Да, Telegram Scanner использует алгоритмы имитации человеческого поведения и индивидуальные прокси для каждого клиента, сводя риск блокировки к нулю."
  },
  {
    q: "Нужны ли технические знания?",
    a: "Нет. Интерфейс интуитивно понятен. Настройка занимает 5-10 минут: вы просто указываете ключевые слова и ссылки на каналы (или используете нашу базу)."
  },
  {
    q: "Как быстро я увижу результаты?",
    a: "Сканер начинает работать мгновенно после запуска. Первые лиды обычно появляются в течение первого часа работы."
  },
  {
    q: "Можно ли интегрировать с моей CRM?",
    a: "Да, мы поддерживаем вебхуки и прямые интеграции с популярными CRM (AmoCRM, Bitrix24, HubSpot) на тарифах Pro и выше."
  }
];

const FAQ: React.FC = () => {
  return (
    <section id="faq" className="py-24 bg-dark-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-white text-center mb-12">
          Ответы на вопросы
        </h2>
        <div className="space-y-4">
          {faqs.map((item, index) => (
            <div key={index} className="bg-[#0f0f0f] rounded-xl p-6 border border-white/5 hover:border-white/10 transition-colors cursor-pointer group">
              <div className="flex justify-between items-start">
                  <h3 className="text-lg font-bold text-white mb-2 group-hover:text-brand-500 transition-colors">{item.q}</h3>
                  <Plus className="text-gray-500 group-hover:text-white" size={20} />
              </div>
              <p className="text-gray-500 text-sm mt-2 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;