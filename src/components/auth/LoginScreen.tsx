import React, { useState } from 'react';
import { useFirebase } from '../../context/FirebaseContext';
import { Mail, Key, LogIn, Store, ShieldCheck, AlertCircle } from 'lucide-react';

interface LoginScreenProps {
  onLocalLoginSuccess?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLocalLoginSuccess }) => {
  const { loginWithEmail } = useFirebase();
  const [emailOrUsername, setEmailOrUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOrUsername.trim() || !password) {
      setError('Por favor ingrese su usuario o correo electrónico y contraseña.');
      return;
    }

    try {
      setError(null);
      setLoading(true);
      await loginWithEmail(emailOrUsername, password);
      if (onLocalLoginSuccess) onLocalLoginSuccess();
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Error al iniciar sesión. Verifique sus credenciales.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#002046] flex items-center justify-center p-4 font-sans select-none relative overflow-hidden">
      {/* Background Subtle Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#1b365d_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-[#f1f4f8] border-2 border-[#1b365d] shadow-2xl rounded-sm overflow-hidden z-10">
        {/* Title Bar */}
        <div className="bg-[#002046] text-white px-4 py-3 flex items-center justify-between border-b border-[#1b365d]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-sm bg-[#aa3531] flex items-center justify-center text-xs font-black shadow-inner text-white">
              N
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight text-white">NECO POS v4.8 Enterprise</h1>
              <p className="text-[10px] text-[#87a0cd]">Sistema de Gestión y Punto de Venta</p>
            </div>
          </div>
          <span className="bg-[#1b365d] text-[#53a1ff] px-2 py-0.5 text-[10px] font-mono font-bold rounded-xs border border-[#87a0cd]/30 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> SECURE AUTH
          </span>
        </div>

        {/* Subheader / Direct Mode */}
        <div className="bg-[#e0e3e7] border-b border-[#c4c6cf] px-4 py-2.5 flex items-center gap-2 text-xs font-bold text-[#002046]">
          <Mail className="w-3.5 h-3.5 text-[#002046]" />
          <span>Ingreso con Usuario y Contraseña</span>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-[#ffdad6] border border-[#ba1a1a] text-[#410002] text-xs rounded-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#ba1a1a] shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#181c1f] mb-1">
                Correo Electrónico o Nombre de Usuario
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-[#74777f]" />
                </div>
                <input
                  type="text"
                  required
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  placeholder="ej: omar@gmail.com o necovilla"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#74777f] rounded-xs focus:outline-none focus:border-[#002046] focus:ring-1 focus:ring-[#002046] font-sans"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#181c1f] mb-1">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Key className="h-4 w-4 text-[#74777f]" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#74777f] rounded-xs focus:outline-none focus:border-[#002046] focus:ring-1 focus:ring-[#002046] font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 bg-[#002046] hover:bg-[#1b365d] text-white font-bold text-xs rounded-xs shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              <span>{loading ? 'Iniciando Sesión...' : 'Iniciar Sesión'}</span>
            </button>
          </form>

          {/* Footer note */}
          <div className="mt-6 pt-4 border-t border-[#c4c6cf] text-[10px] text-[#44474e] flex items-center justify-between">
            <span className="flex items-center gap-1 font-mono">
              <Store className="w-3 h-3 text-[#002046]" /> NECO POS v4.8
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
