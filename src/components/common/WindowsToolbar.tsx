import React from 'react';
import {
  ShoppingCart,
  Package,
  Users,
  Receipt,
  Landmark,
  BarChart3,
  Boxes,
  Printer,
  Search,
  Lock,
  LogOut,
  FileText,
  UserCheck,
  Settings,
  History,
  Scale,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Beef,
} from 'lucide-react';
import { ActiveScreen } from '../../types/pos';

interface WindowsToolbarProps {
  activeScreen: ActiveScreen;
  onNavigate: (screen: ActiveScreen) => void;
  onQuickAction?: (action: 'NUEVO' | 'EDITAR' | 'ELIMINAR' | 'BUSCAR' | 'ACTUALIZAR' | 'IMPRIMIR') => void;
  onLockApp: () => void;
  onLogout?: () => void;
}

export const WindowsToolbar: React.FC<WindowsToolbarProps> = ({
  activeScreen,
  onNavigate,
  onQuickAction,
  onLockApp,
  onLogout,
}) => {
  const mainTabs: { screen: ActiveScreen; label: string; fKey: string; icon: React.ReactNode }[] = [
    { screen: 'POS', label: 'Nueva Venta', fKey: 'F1', icon: <ShoppingCart className="w-3.5 h-3.5" /> },
    { screen: 'PRODUCTOS', label: 'Productos', fKey: 'F2', icon: <Package className="w-3.5 h-3.5" /> },
    { screen: 'CLIENTES', label: 'Clientes', fKey: 'F3', icon: <Users className="w-3.5 h-3.5" /> },
    { screen: 'STOCK', label: 'Stock & Cámaras', fKey: 'F5', icon: <Boxes className="w-3.5 h-3.5" /> },
    { screen: 'FACTURACION', label: 'Facturación ARCA', fKey: 'F6', icon: <Receipt className="w-3.5 h-3.5" /> },
    { screen: 'CAJA_ACTUAL', label: 'Cajas & Cierres', fKey: 'F7', icon: <Landmark className="w-3.5 h-3.5" /> },
    { screen: 'REPORTES', label: 'Reportes', fKey: 'F8', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  ];

  const secondaryTabs: { screen: ActiveScreen; label: string; icon: React.ReactNode }[] = [
    { screen: 'STOCK', label: 'Desposte & Faena', icon: <Beef className="w-3 h-3 text-red-700" /> },
    { screen: 'CUENTAS_CORRIENTES', label: 'Cta Cte', icon: <FileText className="w-3 h-3" /> },
    { screen: 'EMPLEADOS', label: 'Personal', icon: <UserCheck className="w-3 h-3" /> },
    { screen: 'HISTORIAL_CIERRES', label: 'Hist. Cierres', icon: <History className="w-3 h-3" /> },
    { screen: 'RANKING_PRODUCTOS', label: 'Top Carnes Kg', icon: <Scale className="w-3 h-3" /> },
    { screen: 'CONFIGURACION', label: 'Sucursales / Balanzas', icon: <Settings className="w-3 h-3" /> },
  ];

  return (
    <div className="h-[32px] bg-[#f1f4f8] border-b border-[#c4c6cf] flex items-center px-1.5 gap-1 overflow-x-auto select-none font-sans">
      {/* Function Key Primary Tabs */}
      <div className="flex items-center gap-1">
        {mainTabs.map((tab) => {
          const isActive =
            activeScreen === tab.screen ||
            (tab.screen === 'CAJA_ACTUAL' &&
              (activeScreen === 'APERTURA_CAJA' ||
                activeScreen === 'CIERRE_CAJA' ||
                activeScreen === 'HISTORIAL_CIERRES'));

          return (
            <button
              key={tab.screen}
              onClick={() => onNavigate(tab.screen)}
              className={`h-[25px] px-2 flex items-center gap-1.5 text-[11px] font-semibold border cursor-pointer transition-all ${
                isActive
                  ? 'bg-[#002046] text-white border-[#002046] shadow-inner'
                  : 'bg-[#ebeef2] text-[#181c1f] border-[#c4c6cf] hover:bg-[#e0e3e7] hover:border-[#74777f]'
              }`}
            >
              <span
                className={`px-1 text-[10px] font-bold font-mono ${
                  tab.fKey === 'F1'
                    ? 'bg-[#aa3531] text-white'
                    : isActive
                    ? 'bg-[#1b365d] text-white'
                    : 'bg-[#d0d4dc] text-[#181c1f]'
                }`}
              >
                {tab.fKey}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="h-[18px] w-[1px] bg-[#c4c6cf] mx-1" />

      {/* Secondary Screens Navigation Buttons */}
      <div className="flex items-center gap-0.5">
        {secondaryTabs.map((tab) => {
          const isActive = activeScreen === tab.screen;
          return (
            <button
              key={tab.screen}
              onClick={() => onNavigate(tab.screen)}
              className={`h-[23px] px-2 flex items-center gap-1 text-[11px] border cursor-pointer ${
                isActive
                  ? 'bg-[#1b365d] text-white border-[#1b365d] font-bold'
                  : 'bg-[#ebeef2] text-[#44474e] border-[#c4c6cf] hover:bg-[#e0e3e7] hover:text-[#181c1f]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="h-[18px] w-[1px] bg-[#c4c6cf] mx-1" />

      {/* Classic Action Buttons: Nuevo, Editar, Eliminar, Buscar, Actualizar, Imprimir */}
      <div className="flex items-center gap-0.5 ml-auto">
        <button
          onClick={() => onQuickAction?.('NUEVO')}
          title="Nuevo Registro [Ins]"
          className="h-[23px] px-1.5 flex items-center gap-1 text-[11px] bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#c4c6cf] text-[#181c1f] cursor-pointer"
        >
          <Plus className="w-3 h-3 text-[#002046]" />
          <span className="hidden xl:inline">Nuevo</span>
        </button>
        <button
          onClick={() => onQuickAction?.('EDITAR')}
          title="Editar Fila Seleccionada [F2]"
          className="h-[23px] px-1.5 flex items-center gap-1 text-[11px] bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#c4c6cf] text-[#181c1f] cursor-pointer"
        >
          <Edit2 className="w-3 h-3 text-[#002046]" />
          <span className="hidden xl:inline">Editar</span>
        </button>
        <button
          onClick={() => onQuickAction?.('ELIMINAR')}
          title="Eliminar Registro [Supr]"
          className="h-[23px] px-1.5 flex items-center gap-1 text-[11px] bg-[#ebeef2] hover:bg-[#ffdad6] border border-[#c4c6cf] text-[#aa3531] cursor-pointer"
        >
          <Trash2 className="w-3 h-3 text-[#aa3531]" />
          <span className="hidden xl:inline">Eliminar</span>
        </button>
        <button
          onClick={() => onQuickAction?.('BUSCAR')}
          title="Buscar [F10]"
          className="h-[23px] px-2 flex items-center gap-1 text-[11px] bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#c4c6cf] text-[#181c1f] cursor-pointer"
        >
          <span className="bg-[#e0e3e7] px-1 font-mono text-[9px] font-bold">F10</span>
          <Search className="w-3 h-3 text-[#44474e]" />
          <span>Buscar</span>
        </button>
        <button
          onClick={() => onQuickAction?.('IMPRIMIR')}
          title="Imprimir [F9]"
          className="h-[23px] px-2 flex items-center gap-1 text-[11px] bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#c4c6cf] text-[#181c1f] cursor-pointer"
        >
          <span className="bg-[#e0e3e7] px-1 font-mono text-[9px] font-bold">F9</span>
          <Printer className="w-3 h-3 text-[#44474e]" />
          <span>Imprimir</span>
        </button>
        <button
          onClick={() => onQuickAction?.('ACTUALIZAR')}
          title="Actualizar / Refrescar Datos [F5]"
          className="h-[23px] px-1.5 flex items-center gap-1 text-[11px] bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#c4c6cf] text-[#181c1f] cursor-pointer"
        >
          <RefreshCw className="w-3 h-3 text-[#002046]" />
        </button>
        {onLogout && (
          <button
            onClick={onLogout}
            title="Cerrar Sesión de Usuario"
            className="h-[23px] px-2 flex items-center gap-1 text-[11px] bg-[#aa3531] hover:bg-[#8c2a26] border border-[#aa3531] text-white font-bold cursor-pointer transition-colors"
          >
            <LogOut className="w-3 h-3" />
            <span>Cerrar Sesión</span>
          </button>
        )}
      </div>
    </div>
  );
};
