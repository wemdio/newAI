import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Menu, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Hero from '../components/landing/Hero';
import LazySection from '../components/LazySection';
import LeadFormModal from '../components/landing/LeadFormModal';

// Lazy load below-the-fold components
const HowItWorks = React.lazy(() => import('../components/landing/HowItWorks'));
const Features = React.lazy(() => import('../components/landing/Features'));
const Proof = React.lazy(() => import('../components/landing/Proof'));
const UseCases = React.lazy(() => import('../components/landing/UseCases'));
const Pricing = React.lazy(() => import('../components/landing/Pricing'));
const Safety = React.lazy(() => import('../components/landing/Safety'));

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const lastScrollY = useRef(0);
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      const isScrollingDown = currentScrollY > lastScrollY.current;
      
      if (currentScrollY < 50) {
        setIsScrolled(false);
      } else if (isScrollingDown) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }

      lastScrollY.current = currentScrollY;
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const showFullMenu = !isScrolled || isHovered;

  const handleLogin = () => {
    // Track Yandex Metrika goal
    if (window.ym) {
      window.ym(105579261, 'reachGoal', 'CLICK_LOGIN');
    }
    navigate('/login');
  };

  return (
    <nav className="fixed w-full z-50 top-4 px-4 pointer-events-none flex justify-center">
      <div 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
          flex items-center pointer-events-auto
          ${showFullMenu 
            ? 'bg-[#0a0a0a]/90 backdrop-blur-md border border-white/5 shadow-lg shadow-black/50 px-3 py-1.5 max-w-4xl w-full justify-between rounded-full' 
            : 'bg-transparent border-transparent shadow-none px-0 py-0 max-w-[40px] w-full justify-center rounded-full delay-0 overflow-visible'
          }
        `}
      >
        {/* Logo Section */}
        <a href="#" className="flex items-center flex-shrink-0" aria-label="Telegram Scanner Home">
          <div className="flex items-center group">
             {/* Icon Container */}
            <div className="relative w-8 h-8 flex items-center justify-center flex-shrink-0">
              <div className={`absolute inset-0 bg-brand-500/30 blur-md rounded-full group-hover:bg-brand-500/50 transition-all duration-500 ${!showFullMenu ? 'opacity-100 scale-110' : 'opacity-100'}`}></div>
              <svg width="100%" height="100%" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative z-10">
                <circle cx="20" cy="20" r="18" stroke="#F97316" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="8 12" className="opacity-60 animate-[spin_10s_linear_infinite] origin-center" />
                <circle cx="20" cy="20" r="13" stroke="white" strokeWidth="1" strokeOpacity="0.1" />
                <path d="M20 6L23.5 16.5L34 20L23.5 23.5L20 34L16.5 23.5L6 20L16.5 16.5L20 6Z" fill="#F97316" stroke="white" strokeWidth="1.5" className="drop-shadow-[0_0_8px_rgba(249,115,22,0.8)] group-hover:scale-110 transition-transform duration-300 origin-center"/>
              </svg>
            </div>
            
            {/* Text: Collapses width and margin when menu is hidden */}
            <div className={`
                flex items-center overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
                ${showFullMenu ? 'max-w-[200px] opacity-100 ml-0' : 'max-w-0 opacity-0 ml-0'}
            `}>
            </div>
          </div>
        </a>

        {/* Center Menu (Desktop) */}
        <div className={`
            hidden md:flex items-center space-x-1 bg-white/5 rounded-full px-1 py-0.5 border border-white/5 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
            ${showFullMenu ? 'opacity-100 max-w-[500px] ml-4 scale-100' : 'opacity-0 max-w-0 overflow-hidden border-0 p-0 ml-0 scale-95'}
        `}>
          <a href="#proof" className="px-3 py-1 text-[11px] font-medium text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-all duration-300 whitespace-nowrap uppercase tracking-wide">Результаты</a>
          <a href="#how-it-works" className="px-3 py-1 text-[11px] font-medium text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-all duration-300 whitespace-nowrap uppercase tracking-wide">Как это работает</a>
          <a href="#pricing" className="px-3 py-1 text-[11px] font-medium text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-all duration-300 whitespace-nowrap uppercase tracking-wide">Стоимость</a>
        </div>

        {/* Right Actions */}
        <div className={`
            flex items-center space-x-3 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
            ${showFullMenu ? 'opacity-100 max-w-[300px] translate-x-0' : 'opacity-0 max-w-0 overflow-hidden translate-x-4'}
        `}>
          <button 
            type="button" 
            onClick={handleLogin}
            className="text-gray-300 hover:text-white font-medium text-xs transition-colors hidden md:block whitespace-nowrap"
          >
            Войти
          </button>
          
          <button 
            onClick={() => setIsOpen(!isOpen)}
            type="button" 
            className="inline-flex items-center p-2 w-10 h-10 justify-center text-sm text-gray-400 rounded-lg md:hidden hover:bg-white/10 focus:outline-none" 
          >
            <span className="sr-only">Open main menu</span>
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="absolute top-24 left-4 right-4 p-6 rounded-3xl bg-[#0f0f0f] border border-white/10 shadow-2xl md:hidden z-50 pointer-events-auto">
          <ul className="flex flex-col space-y-4">
            <li>
              <a href="#features" onClick={() => setIsOpen(false)} className="block text-lg font-medium text-gray-300 hover:text-white">Возможности</a>
            </li>
            <li>
              <a href="#how-it-works" onClick={() => setIsOpen(false)} className="block text-lg font-medium text-gray-300 hover:text-white">Как это работает</a>
            </li>
            <li>
              <a href="#pricing" onClick={() => setIsOpen(false)} className="block text-lg font-medium text-gray-300 hover:text-white">Тарифы</a>
            </li>
            <li>
              <div className="h-px bg-white/10 my-4"></div>
              <button onClick={handleLogin} className="w-full py-3 bg-white/5 rounded-xl text-brand-500 font-bold">Войти</button>
            </li>
          </ul>
        </div>
      )}
    </nav>
  );
};

export default function LandingPage() {
  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
  const [selectedInterest, setSelectedInterest] = useState('');

  const handleOpenLeadForm = (interest = '') => {
    setSelectedInterest(interest);
    setIsLeadFormOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-slate-50 selection:bg-brand-500/30 font-sans overflow-x-hidden">
      <Navbar />
      <main className="relative z-10">
        <Hero onOpenLeadForm={() => handleOpenLeadForm('Hero CTA')} />
        <LazySection><HowItWorks /></LazySection>
        <LazySection><Features onOpenLeadForm={() => handleOpenLeadForm('Features CTA')} /></LazySection>
        <LazySection><Proof /></LazySection>
        <LazySection><Pricing onOpenLeadForm={handleOpenLeadForm} /></LazySection>
        <LazySection><UseCases /></LazySection>
        <LazySection><Safety /></LazySection>
      </main>
      
      <footer className="relative z-10 py-8 bg-[#050505] border-t border-white/5 text-center">
         <div className="max-w-7xl mx-auto px-4">
           <p className="text-gray-600 text-sm">
             © 2025 Telegram Lead Scanner. All rights reserved.
           </p>
         </div>
      </footer>

      <LeadFormModal 
        isOpen={isLeadFormOpen} 
        onClose={() => setIsLeadFormOpen(false)}
        initialInterest={selectedInterest}
      />
    </div>
  );
}


