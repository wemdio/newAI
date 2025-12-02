import React, { useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const LeadFormModal = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(1); // 1: Form, 2: Success
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    contact: '', // Phone or Telegram
    type: 'telegram', // 'telegram' or 'phone'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Send to backend
      const response = await fetch('/api/landing/lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to submit form');
      }

      // Track Yandex Metrika goal
      if (window.ym) {
        window.ym(105579261, 'reachGoal', 'LEAD_FORM_SUBMIT');
      }

      setStep(2);
    } catch (err) {
      console.error(err);
      setError('Произошла ошибка. Пожалуйста, попробуйте позже.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 sm:px-6">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Close Button */}
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"
          >
            <X size={20} />
          </button>

          <div className="p-8">
            {step === 1 ? (
              <>
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-white mb-2">Получить 15 лидов</h3>
                  <p className="text-gray-400 text-sm">
                    Оставьте контакты, и мы свяжемся с вами для настройки тестового периода.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Name Field */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                      Ваше имя
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50 transition-all"
                      placeholder="Иван Иванов"
                    />
                  </div>

                  {/* Contact Field */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                      Telegram или Телефон
                    </label>
                    <div className="relative">
                        <input
                        type="text"
                        required
                        value={formData.contact}
                        onChange={(e) => setFormData({...formData, contact: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50 transition-all"
                        placeholder="@username или +7..."
                        />
                    </div>
                  </div>

                  {error && (
                    <div className="text-red-500 text-xs text-center">{error}</div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 mt-6 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Отправка...
                      </>
                    ) : (
                      <>
                        Отправить заявку
                        <Send size={18} />
                      </>
                    )}
                  </button>

                  <p className="text-xs text-gray-500 text-center mt-4">
                    Нажимая кнопку, вы соглашаетесь с политикой конфиденциальности
                  </p>
                </form>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Send size={32} />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Заявка отправлена!</h3>
                <p className="text-gray-400 text-sm mb-8">
                  Менеджер свяжется с вами в ближайшее время в Telegram или по телефону.
                </p>
                <button
                  onClick={onClose}
                  className="w-full bg-white/10 hover:bg-white/20 text-white font-medium py-3 rounded-xl transition-all"
                >
                  Отлично
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default LeadFormModal;

