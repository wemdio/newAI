import React, { useState, type FormEvent } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LeadFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialInterest?: string;
}

interface FormData {
  name: string;
  contact: string;
  type: 'telegram' | 'phone';
  contactMethod: 'telegram' | 'whatsapp' | 'call';
  interest?: string;
  utm?: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    term: string | null;
    content: string | null;
  };
}

const LeadFormModal: React.FC<LeadFormModalProps> = ({ isOpen, onClose, initialInterest }) => {
  const [step, setStep] = useState(1); // 1: Form, 2: Success
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<FormData>({
    name: '',
    contact: '',
    type: 'telegram',
    contactMethod: 'telegram',
    interest: '',
    utm: {
      source: null,
      medium: null,
      campaign: null,
      term: null,
      content: null
    }
  });

  // Update interest when prop changes
  React.useEffect(() => {
    if (initialInterest) {
      setFormData(prev => ({ ...prev, interest: initialInterest }));
    }
  }, [initialInterest]);

  // Capture UTM parameters on component mount
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFormData(prev => ({
      ...prev,
      utm: {
        source: params.get('utm_source') || null,
        medium: params.get('utm_medium') || null,
        campaign: params.get('utm_campaign') || null,
        term: params.get('utm_term') || null,
        content: params.get('utm_content') || null
      }
    }));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
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
        body: JSON.stringify({
          ...formData,
          type: formData.contactMethod === 'telegram' ? 'telegram' : 'phone' // Map for backend compatibility logic
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit form');
      }

      // Track Yandex Metrika goal
      if ((window as any).ym) {
        [105579261, 106370874].forEach((id) => {
          (window as any).ym(id, 'reachGoal', 'LEAD_FORM_SUBMIT');
        });
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

  const contactMethods = [
    { id: 'telegram', label: 'Telegram' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'call', label: 'Позвоните мне' },
  ] as const;

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
                  <h3 className="text-2xl font-bold text-white mb-2">Связаться</h3>
                  <p className="text-gray-400 text-sm">
                    Оставьте контакты, и мы свяжемся с вами для настройки тестового периода.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
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

                  {/* Contact Method Selection */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                      Как с вами связаться?
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {contactMethods.map((method) => (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => setFormData({...formData, contactMethod: method.id})}
                          className={`py-2 px-1 rounded-lg text-sm font-medium transition-all border ${
                            formData.contactMethod === method.id
                              ? 'bg-brand-500/10 border-brand-500 text-brand-400'
                              : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                          }`}
                        >
                          {method.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Contact Field */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                      {formData.contactMethod === 'telegram' ? 'Telegram username' : 'Номер телефона'}
                    </label>
                    <div className="relative">
                        <input
                        type="text"
                        required
                        value={formData.contact}
                        onChange={(e) => setFormData({...formData, contact: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50 transition-all"
                        placeholder={
                          formData.contactMethod === 'telegram' ? '@username' : '+7 (999) 000-00-00'
                        }
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
