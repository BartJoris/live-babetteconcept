import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isInzichtenOpen, setIsInzichtenOpen] = useState(false);
  const [isImporterenOpen, setIsImporterenOpen] = useState(false);
  const [mobileInzichtenOpen, setMobileInzichtenOpen] = useState(false);
  const [mobileImporterenOpen, setMobileImporterenOpen] = useState(false);
  const router = useRouter();
  
  const inzichtenRef = useRef<HTMLDivElement>(null);
  const importerenRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inzichtenRef.current && !inzichtenRef.current.contains(event.target as Node)) {
        setIsInzichtenOpen(false);
      }
      if (importerenRef.current && !importerenRef.current.contains(event.target as Node)) {
        setIsImporterenOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
    setMobileInzichtenOpen(false);
    setMobileImporterenOpen(false);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      // Clear credentials from localStorage
      localStorage.removeItem('odoo_uid');
      localStorage.removeItem('odoo_pass');
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
      // Still redirect to login page and clear localStorage
      localStorage.removeItem('odoo_uid');
      localStorage.removeItem('odoo_pass');
      router.push('/');
    }
  };

  const isActive = (path: string) => router.pathname === path;
  
  const isInzichtenActive = () => {
    return ['/sales-yearly-compare', '/sales-monthly-compare', '/sales-insights', 
            '/sales-products', '/brand-performance', '/brand-inventory', '/brand-diagnostics', '/ecommerce-insights'].includes(router.pathname);
  };
  
  const isImporterenActive = () => {
    return ['/product-import', '/product-cleanup', '/playup-image-matcher', '/playup-images-import', '/hvid-levering', '/armedangels-images-import', '/armedangels-image-matcher'].includes(router.pathname);
  };

  return (
    <nav className="bg-white shadow-lg border-b">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <div className="flex items-center">
            <Link href="/dashboard" className="text-xl font-bold text-gray-800 hover:text-blue-600 transition-colors">
              📊 Babette POS
            </Link>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-4">
            <Link 
              href="/dashboard" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/dashboard') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              Dashboard
            </Link>

            <Link 
              href="/audit-monitor" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/audit-monitor') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              🔍 Security Monitor
            </Link>

            <Link 
              href="/webshoporders-beheren" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/webshoporders-beheren') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              📦 Webshoporders
            </Link>
            
            {/* Inzichten Dropdown */}
            <div className="relative" ref={inzichtenRef}>
              <button
                onClick={() => setIsInzichtenOpen(!isInzichtenOpen)}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${
                  isInzichtenActive() 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                }`}
              >
                Inzichten
                <svg className={`ml-1 h-4 w-4 transform transition-transform ${isInzichtenOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
              {isInzichtenOpen && (
                <div className="absolute left-0 mt-1 w-56 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                  <div className="py-1">
                    <Link href="/ecommerce-insights" onClick={() => setIsInzichtenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/ecommerce-insights') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      🛍️ E-commerce Inzichten
                    </Link>
                    <Link href="/sales-yearly-compare" onClick={() => setIsInzichtenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/sales-yearly-compare') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      Jaarlijkse Vergelijking
                    </Link>
                    <Link href="/sales-monthly-compare" onClick={() => setIsInzichtenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/sales-monthly-compare') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      Maandelijkse Vergelijking
                    </Link>
                    <Link href="/sales-insights" onClick={() => setIsInzichtenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/sales-insights') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      Verkoop Inzichten
                    </Link>
                    <Link href="/sales-products" onClick={() => setIsInzichtenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/sales-products') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      Solden
                    </Link>
                    <Link href="/brand-performance" onClick={() => setIsInzichtenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/brand-performance') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      Merkprestaties
                    </Link>
                    <Link href="/brand-inventory" onClick={() => setIsInzichtenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/brand-inventory') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      Voorraad
                    </Link>
                    <Link href="/brand-diagnostics" onClick={() => setIsInzichtenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/brand-diagnostics') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      Diagnostiek
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Importeren producten Dropdown */}
            <div className="relative" ref={importerenRef}>
              <button
                onClick={() => setIsImporterenOpen(!isImporterenOpen)}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${
                  isImporterenActive() 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                }`}
              >
                Importeren producten
                <svg className={`ml-1 h-4 w-4 transform transition-transform ${isImporterenOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
              {isImporterenOpen && (
                <div className="absolute left-0 mt-1 w-56 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                  <div className="py-1">
                    <Link href="/product-import" onClick={() => setIsImporterenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/product-import') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      Import
                    </Link>
                    <Link href="/product-cleanup" onClick={() => setIsImporterenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/product-cleanup') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      Opschonen
                    </Link>
                    <Link href="/hvid-levering" onClick={() => setIsImporterenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/hvid-levering') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      Hvid Levering
                    </Link>
                    <Link href="/playup-image-matcher" onClick={() => setIsImporterenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/playup-image-matcher') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      Match
                    </Link>
                    <Link href="/playup-images-import" onClick={() => setIsImporterenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/playup-images-import') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      Playup Images
                    </Link>
                    <Link href="/armedangels-images-import" onClick={() => setIsImporterenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/armedangels-images-import') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      Armedangels Images
                    </Link>
                    <Link href="/armedangels-image-matcher" onClick={() => setIsImporterenOpen(false)} className={`block px-4 py-2 text-sm ${isActive('/armedangels-image-matcher') ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      Armedangels Image Matcher
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
            >
              Uitloggen
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={toggleMenu}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-600 hover:text-blue-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-expanded="false"
            >
              <span className="sr-only">Open main menu</span>
              {/* Hamburger icon */}
              <svg
                className={`${isMenuOpen ? 'hidden' : 'block'} h-6 w-6`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              {/* Close icon */}
              <svg
                className={`${isMenuOpen ? 'block' : 'hidden'} h-6 w-6`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`${isMenuOpen ? 'block' : 'hidden'} md:hidden`}>
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t">
          <Link
            href="/dashboard"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/dashboard')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            Dashboard
          </Link>

          <Link
            href="/audit-monitor"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/audit-monitor')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            🔍 Security Monitor
          </Link>

          <Link
            href="/webshoporders-beheren"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/webshoporders-beheren')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            📦 Webshoporders
          </Link>
          
          {/* Inzichten Section */}
          <div className="pt-2">
            <button
              onClick={() => setMobileInzichtenOpen(!mobileInzichtenOpen)}
              className={`w-full flex justify-between items-center px-3 py-2 rounded-md text-base font-medium transition-colors ${
                isInzichtenActive()
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              <span>Inzichten</span>
              <svg 
                className={`h-5 w-5 transform transition-transform ${mobileInzichtenOpen ? 'rotate-180' : ''}`}
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            {mobileInzichtenOpen && (
              <div className="pl-4 space-y-1 mt-1">
                <Link
                  href="/ecommerce-insights"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/ecommerce-insights')
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  🛍️ E-commerce Inzichten
                </Link>
                <Link
                  href="/sales-yearly-compare"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/sales-yearly-compare')
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Jaarlijkse Vergelijking
                </Link>
                <Link
                  href="/sales-monthly-compare"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/sales-monthly-compare')
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Maandelijkse Vergelijking
                </Link>
                <Link
                  href="/sales-insights"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/sales-insights')
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Verkoop Inzichten
                </Link>
                <Link
                  href="/sales-products"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/sales-products')
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Solden
                </Link>
                <Link
                  href="/brand-performance"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/brand-performance')
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Merkprestaties
                </Link>
                <Link
                  href="/brand-inventory"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/brand-inventory')
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Voorraad
                </Link>
                <Link
                  href="/brand-diagnostics"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/brand-diagnostics')
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Diagnostiek
                </Link>
              </div>
            )}
          </div>

          {/* Importeren producten Section */}
          <div className="pt-2">
            <button
              onClick={() => setMobileImporterenOpen(!mobileImporterenOpen)}
              className={`w-full flex justify-between items-center px-3 py-2 rounded-md text-base font-medium transition-colors ${
                isImporterenActive()
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              <span>Importeren producten</span>
              <svg 
                className={`h-5 w-5 transform transition-transform ${mobileImporterenOpen ? 'rotate-180' : ''}`}
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            {mobileImporterenOpen && (
              <div className="pl-4 space-y-1 mt-1">
                <Link
                  href="/product-import"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/product-import')
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Import
                </Link>
                <Link 
                  href="/product-cleanup" 
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/product-cleanup') 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Opschonen
                </Link>
                <Link
                  href="/hvid-levering"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/hvid-levering') 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Hvid Levering
                </Link>
                <Link
                  href="/playup-image-matcher"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/playup-image-matcher') 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Match
                </Link>
                <Link
                  href="/playup-images-import"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/playup-images-import') 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Playup Images
                </Link>
                <Link
                  href="/armedangels-images-import"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/armedangels-images-import') 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Armedangels Images
                </Link>
                <Link
                  href="/armedangels-image-matcher"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/armedangels-image-matcher') 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Armedangels Image Matcher
                </Link>
                <Link
                  href="/armedangels-images-import"
                  onClick={closeMenu}
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/armedangels-images-import') 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                  }`}
                >
                  Armedangels Images Import
                </Link>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                closeMenu();
                handleLogout();
              }}
              className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
            >
              Uitloggen
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
} 