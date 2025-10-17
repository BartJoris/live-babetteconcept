import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('odoo_uid');
    localStorage.removeItem('odoo_user');
    localStorage.removeItem('odoo_pass');
    router.push('/');
  };

  const isActive = (path: string) => router.pathname === path;

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
          <div className="hidden md:flex items-center space-x-8">
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
              href="/sales-yearly-compare" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/sales-yearly-compare') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              Jaarlijkse Vergelijking
            </Link>
            <Link 
              href="/sales-monthly-compare" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/sales-monthly-compare') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              Maandelijkse Vergelijking
            </Link>
            <Link 
              href="/sales-insights" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/sales-insights') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              Verkoop Inzichten
            </Link>
            <Link 
              href="/sales-products" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/sales-products') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              Solden
            </Link>
            <Link 
              href="/brand-performance" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/brand-performance') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              Merkprestaties
            </Link>
            <Link 
              href="/brand-inventory" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/brand-inventory') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              Voorraad
            </Link>
            <Link 
              href="/brand-diagnostics" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/brand-diagnostics') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              🔍 Diagnostiek
            </Link>
            <Link 
              href="/product-import" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/product-import') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              📦 Import
            </Link>
            <Link 
              href="/product-cleanup" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/product-cleanup') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              🗑️ Opschonen
            </Link>
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
            href="/sales-yearly-compare"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/sales-yearly-compare')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            Jaarlijkse Vergelijking
          </Link>
          <Link
            href="/sales-monthly-compare"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/sales-monthly-compare')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            Maandelijkse Vergelijking
          </Link>
          <Link
            href="/sales-insights"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/sales-insights')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            Verkoop Inzichten
          </Link>
          <Link
            href="/sales-products"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/sales-products')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            Solden
          </Link>
          <Link
            href="/brand-performance"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/brand-performance')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            Merkprestaties
          </Link>
          <Link
            href="/brand-inventory"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/brand-inventory')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            Voorraad
          </Link>
          <Link
            href="/brand-diagnostics"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/brand-diagnostics')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            🔍 Diagnostiek
          </Link>
          <Link
            href="/product-import"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/product-import')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            📦 Import
          </Link>
          <Link 
            href="/product-cleanup" 
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/product-cleanup') 
                ? 'bg-blue-100 text-blue-700' 
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            🗑️ Opschonen
          </Link>
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
    </nav>
  );
} 