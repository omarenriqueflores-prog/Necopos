import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { WindowsModal } from '../components/common/WindowsModal';
import { AlertCircle, HelpCircle, Lock, ShieldAlert } from 'lucide-react';

interface DialogContextType {
  showAlert: (message: string, title?: string) => Promise<void>;
  showConfirm: (message: string, title?: string) => Promise<boolean>;
  showAdminAuth: (actionDescription: string, title?: string) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<'ALERT' | 'CONFIRM' | 'ADMIN_AUTH'>('ALERT');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [resolver, setResolver] = useState<{ resolve: (value: any) => void } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && type === 'ADMIN_AUTH') {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen, type]);

  const showAlert = (msg: string, t = 'ATENCIÓN DEL SISTEMA') => {
    setMessage(msg);
    setTitle(t);
    setType('ALERT');
    setIsOpen(true);
    return new Promise<void>((resolve) => {
      setResolver({ resolve: () => resolve() });
    });
  };

  const showConfirm = (msg: string, t = 'CONFIRMACIÓN REQUERIDA') => {
    setMessage(msg);
    setTitle(t);
    setType('CONFIRM');
    setIsOpen(true);
    return new Promise<boolean>((resolve) => {
      setResolver({ resolve });
    });
  };

  const showAdminAuth = (actionDescription: string, t = 'AUTORIZACIÓN DE ADMINISTRADOR REQUERIDA') => {
    setMessage(actionDescription);
    setTitle(t);
    setType('ADMIN_AUTH');
    setPasswordValue('');
    setPasswordError('');
    setIsOpen(true);
    return new Promise<boolean>((resolve) => {
      setResolver({ resolve });
    });
  };

  const handleClose = (value: boolean) => {
    setIsOpen(false);
    setPasswordValue('');
    setPasswordError('');
    if (resolver) {
      resolver.resolve(value);
      setResolver(null);
    }
  };

  const handleAdminAuthSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPass = passwordValue.trim();
    if (!cleanPass) {
      setPasswordError('Por favor ingrese la clave de administrador.');
      return;
    }
    // Clave de administrador configurada por el usuario
    if (cleanPass === '26635235') {
      handleClose(true);
    } else {
      setPasswordError('Clave de administrador incorrecta. Acceso denegado.');
      setPasswordValue('');
    }
  };

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showAdminAuth }}>
      {children}
      <WindowsModal
        isOpen={isOpen}
        onClose={() => handleClose(false)}
        title={title}
        icon={
          type === 'ADMIN_AUTH' ? (
            <ShieldAlert className="w-4 h-4 text-[#ffdad6]" />
          ) : type === 'ALERT' ? (
            <AlertCircle className="w-4 h-4 text-[#aec7f7]" />
          ) : (
            <HelpCircle className="w-4 h-4 text-[#aec7f7]" />
          )
        }
        maxWidth="max-w-md"
      >
        <div className="flex flex-col gap-4 p-2 text-sm select-none">
          {type === 'ADMIN_AUTH' ? (
            <form onSubmit={handleAdminAuthSubmit} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-[#ffdad6] border border-[#ba1a1a] rounded shrink-0">
                  <Lock className="w-6 h-6 text-[#aa3531]" />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <div className="text-[12px] font-bold text-[#181c1f] leading-snug">
                    {message}
                  </div>
                  <div className="text-[11px] text-[#44474e]">
                    Esta operación es destructiva y requiere la clave de administrador para proceder.
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1 mt-1">
                <label className="text-[11px] font-bold text-[#002046] flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-[#aa3531]" />
                  Clave de Administrador:
                </label>
                <div className="relative flex items-center">
                  <input
                    ref={inputRef}
                    type="password"
                    value={passwordValue}
                    onChange={(e) => {
                      setPasswordValue(e.target.value);
                      if (passwordError) setPasswordError('');
                    }}
                    placeholder="Ingrese clave de administrador..."
                    className="w-full h-[32px] px-2.5 pr-8 bg-white border border-[#74777f] focus:border-[#002046] focus:outline-none text-[12px] font-mono shadow-inner"
                    autoComplete="off"
                  />
                </div>
                {passwordError && (
                  <div className="text-[11px] font-bold text-[#ba1a1a] bg-[#ffdad6] border border-[#ba1a1a] px-2 py-1 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-[#74777f] pt-3 mt-1">
                <button
                  type="button"
                  onClick={() => handleClose(false)}
                  className="h-[28px] px-4 bg-[#e0e3e7] hover:bg-[#c4c6cf] border border-[#74777f] text-[#44474e] text-[12px] font-bold cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-[28px] px-5 bg-[#aa3531] hover:bg-[#8b2926] border border-[#8b2926] text-white text-[12px] font-bold cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Autorizar y Eliminar
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-start gap-3">
                {type === 'ALERT' ? (
                  <AlertCircle className="w-8 h-8 text-[#002046] shrink-0" />
                ) : (
                  <HelpCircle className="w-8 h-8 text-[#1b365d] shrink-0" />
                )}
                <div className="text-[#181c1f] font-semibold pt-1 leading-relaxed whitespace-pre-line">{message}</div>
              </div>
              <div className="flex justify-end gap-2 border-t border-[#74777f] pt-3 mt-1">
                {type === 'CONFIRM' && (
                  <button
                    onClick={() => handleClose(false)}
                    className="h-[28px] px-4 bg-[#e0e3e7] hover:bg-[#c4c6cf] border border-[#74777f] text-[#44474e] text-[12px] font-bold cursor-pointer transition-colors"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  onClick={() => handleClose(true)}
                  className="h-[28px] px-5 bg-[#002046] hover:bg-[#1b365d] border border-[#002046] text-white text-[12px] font-bold cursor-pointer transition-colors"
                >
                  Aceptar
                </button>
              </div>
            </>
          )}
        </div>
      </WindowsModal>
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};
