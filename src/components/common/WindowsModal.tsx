import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface WindowsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
  zIndex?: string;
}

export const WindowsModal: React.FC<WindowsModalProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  children,
  maxWidth = 'max-w-4xl',
  zIndex = 'z-[9999]',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 top-[26px] bottom-[22px] bg-black/50 ${zIndex} flex items-center justify-center p-3 select-none`}>
      <div
        className={`w-full ${maxWidth} bg-[#ebeef2] border-2 border-[#002046] shadow-2xl flex flex-col overflow-hidden text-[#181c1f] font-sans`}
      >
        {/* Modal Window Header */}
        <div className="h-[28px] bg-[#002046] text-white flex items-center justify-between px-2.5 select-none">
          <div className="flex items-center gap-1.5 text-[12px] font-bold tracking-wide">
            {icon}
            <span className="truncate uppercase">{title}</span>
          </div>
          <button
            onClick={onClose}
            className="w-[24px] h-[20px] bg-[#1b365d] hover:bg-[#aa3531] text-white flex items-center justify-center text-[12px] font-bold cursor-pointer transition-colors"
            title="Cerrar [Esc]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Modal Window Content */}
        <div className="p-2.5 overflow-y-auto max-h-[calc(100vh-120px)]">{children}</div>
      </div>
    </div>
  );
};
