import React, { useState, useRef, useEffect } from 'react';
import { LogOut, Lock } from 'lucide-react';
import { ActiveScreen, UserAccount } from '../../types/pos';
import { useDialog } from '../../context/DialogContext';

interface WindowsMenuBarProps {
  activeScreen: ActiveScreen;
  currentUser?: UserAccount;
  onNavigate: (screen: ActiveScreen) => void;
  onOpenCustomerSearchModal?: () => void;
  onLockApp: () => void;
  onShowHelp: () => void;
  onShowAbout?: () => void;
  onLogout?: () => void;
}

interface MenuItem {
  label: string;
  accessKey: string;
  action?: () => void;
  screen?: ActiveScreen;
  hotkey?: string;
  divider?: boolean;
}

export const WindowsMenuBar: React.FC<WindowsMenuBarProps> = ({
  activeScreen,
  currentUser,
  onNavigate,
  onOpenCustomerSearchModal,
  onLockApp,
  onShowHelp,
  onShowAbout,
  onLogout,
}) => {
  const { showAlert } = useDialog();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menus: Record<string, { label: string; accessChar: string; items: MenuItem[] }> = {
    archivo: {
      label: 'Archivo',
      accessChar: 'A',
      items: [
        { label: 'Nueva Venta (POS)', accessKey: 'N', screen: 'POS', hotkey: 'F1' },
        { label: '', accessKey: '', divider: true },
        {
          label: 'Cerrar Sesión',
          accessKey: 'S',
          action: () => {
            if (onLogout) onLogout();
          },
        },
      ],
    },
    ventas: {
      label: 'Ventas',
      accessChar: 'V',
      items: [
        { label: 'Punto de Venta Mostrador', accessKey: 'P', screen: 'POS', hotkey: 'F1' },
        { label: 'Seleccionar Cliente Cuenta Corriente', accessKey: 'C', action: onOpenCustomerSearchModal, hotkey: 'F3' },
      ],
    },
    productos: {
      label: 'Productos',
      accessChar: 'P',
      items: [
        { label: 'Maestro de Artículos (Planilla Excel)', accessKey: 'M', screen: 'PRODUCTOS', hotkey: 'F2' },
        { label: 'Ranking de Productos Más Vendidos (Kg/Un)', accessKey: 'R', screen: 'RANKING_PRODUCTOS' },
      ],
    },
    stock: {
      label: 'Stock & Cámaras',
      accessChar: 'S',
      items: [
        { label: 'Cámaras Frigoríficas & Existencias', accessKey: 'C', screen: 'STOCK', hotkey: 'F5' },
        { label: 'Recepción & Ingreso de Medias Reses', accessKey: 'R', screen: 'STOCK' },
        { label: 'Desposte & Rendimientos de Medias Reses', accessKey: 'D', screen: 'STOCK' },
        { label: 'Conciliación Cárnica (Producción vs Ventas)', accessKey: 'P', screen: 'STOCK' },
        { label: 'Kardex de Movimientos Inmutable', accessKey: 'K', screen: 'STOCK' },
        { label: 'Traslados Inter-Sucursal (NECO 1 ⇄ NECO 2)', accessKey: 'T', screen: 'STOCK' },
        { label: 'Registro de Mermas y Ajustes', accessKey: 'M', screen: 'STOCK' },
        { label: 'Arqueo Físico de Cámara & Conciliación', accessKey: 'A', screen: 'STOCK' },
        { label: 'Valorización Comercial Cárnica Vigente', accessKey: 'V', screen: 'STOCK' },
      ],
    },
    clientes: {
      label: 'Clientes',
      accessChar: 'C',
      items: [
        { label: 'Padrón de Clientes (Excel)', accessKey: 'P', screen: 'CLIENTES', hotkey: 'F3' },
        { label: 'Buscar Cliente (Modal Rápido)', accessKey: 'B', action: onOpenCustomerSearchModal },
      ],
    },
    empleados: {
      label: 'Empleados',
      accessChar: 'E',
      items: [
        { label: 'Padrón de Personal y Legajos', accessKey: 'P', screen: 'EMPLEADOS' },
        { label: 'Cuentas Corrientes Empleados / Vales', accessKey: 'C', screen: 'CUENTAS_CORRIENTES' },
      ],
    },
    cuentasCorrientes: {
      label: 'Cuentas Corrientes',
      accessChar: 'u',
      items: [
        { label: 'Cuentas Corrientes Generales (Clientes/Empleados)', accessKey: 'C', screen: 'CUENTAS_CORRIENTES' },
        { label: 'Registrar Pago / Cobranza', accessKey: 'R', screen: 'CUENTAS_CORRIENTES' },
      ],
    },
    cajas: {
      label: 'Cajas',
      accessChar: 'j',
      items: [
        { label: 'Caja Actual / Arqueo en Vivo', accessKey: 'A', screen: 'CAJA_ACTUAL', hotkey: 'F7' },
        { label: 'Apertura de Caja', accessKey: 'p', screen: 'APERTURA_CAJA' },
        { label: 'Cierre Z Definitivo', accessKey: 'C', screen: 'CIERRE_CAJA' },
        { label: 'Historial de Cierres de Caja', accessKey: 'H', screen: 'HISTORIAL_CIERRES' },
      ],
    },
    facturacion: {
      label: 'Facturación',
      accessChar: 'F',
      items: [
        { label: 'Facturación ARCA (Factura A / B)', accessKey: 'F', screen: 'FACTURACION', hotkey: 'F6' },
        { label: '', accessKey: '', divider: true },
        { label: 'Configuración Recibo/Facturas', accessKey: 'C', screen: 'CONFIGURACION_FACTURACION' },
      ],
    },
    reportes: {
      label: 'Reportes',
      accessChar: 'R',
      items: [
        { label: 'Módulo de Reportes & Auditoría', accessKey: 'M', screen: 'REPORTES', hotkey: 'F8' },
        { label: 'Ranking Kilos Carnicería Vendidos', accessKey: 'K', screen: 'RANKING_PRODUCTOS' },
        { label: 'Comparativa NECO 1 vs NECO 2', accessKey: 'C', screen: 'REPORTES' },
      ],
    },
    configuracion: {
      label: 'Configuración',
      accessChar: 'o',
      items: [
        { label: 'Sucursales & Balanzas (NECO 1 / NECO 2)', accessKey: 'S', screen: 'CONFIGURACION' },
        { label: 'Usuarios y Control de Roles', accessKey: 'U', screen: 'USUARIOS_ROLES' },
      ],
    },
    ayuda: {
      label: 'Ayuda',
      accessChar: 'y',
      items: [
        { label: 'Atajos de Teclado (F1 - F12)', accessKey: 'T', action: onShowHelp },
        {
          label: 'Acerca de NECO POS v4.8',
          accessKey: 'A',
          action: onShowAbout,
        },
      ],
    },
  };

  const isItemRestricted = (item: MenuItem): boolean => {
    if (!currentUser) return false;
    const isSuperOrAdmin = currentUser.role === 'SUPERADMIN' || currentUser.role === 'ADMIN';

    if (item.screen === 'REPORTES' || item.screen === 'RANKING_PRODUCTOS') {
      return !isSuperOrAdmin && currentUser.permissions?.canViewReports === false;
    }
    if (item.screen === 'CIERRE_CAJA') {
      return !isSuperOrAdmin && currentUser.permissions?.canPerformClosureZ === false;
    }
    if (
      item.screen === 'USUARIOS_ROLES' ||
      item.screen === 'CONFIGURACION' ||
      item.screen === 'CONFIGURACION_FACTURACION'
    ) {
      if (currentUser.role === 'CAJERO') return true;
      return !isSuperOrAdmin && currentUser.role !== 'ENCARGADO';
    }
    return false;
  };

  const handleItemClick = (item: MenuItem) => {
    setOpenMenu(null);
    if (isItemRestricted(item)) {
      showAlert(
        `Acceso Denegado: Su perfil de usuario (${currentUser?.role}) no tiene permisos para acceder a "${item.label}".`
      );
      return;
    }
    if (item.action) {
      item.action();
    } else if (item.screen) {
      onNavigate(item.screen);
    }
  };

  return (
    <div
      ref={menuBarRef}
      className="h-[38px] min-h-[38px] bg-[#f1f4f8] border-b border-[#c4c6cf] flex items-center px-2 text-[13px] text-[#181c1f] select-none relative z-50 font-sans shadow-xs"
    >
      {Object.entries(menus).map(([key, menu]) => {
        const isOpen = openMenu === key;
        return (
          <div key={key} className="relative">
            <button
              onClick={() => setOpenMenu(isOpen ? null : key)}
              onMouseEnter={() => {
                if (openMenu !== null) setOpenMenu(key);
              }}
              className={`h-[30px] px-3 flex items-center justify-center cursor-pointer hover:bg-[#e0e3e7] text-[13px] font-medium leading-none rounded-xs transition-colors ${
                isOpen ? 'bg-[#002046] text-white hover:bg-[#002046]' : 'text-[#181c1f]'
              }`}
            >
              {menu.label}
            </button>

            {isOpen && (
              <div className="absolute top-full left-0 min-w-[260px] bg-[#f7fafe] border border-[#74777f] shadow-lg py-1.5 z-50 text-[13px] mt-0.5">
                {menu.items.map((item, idx) => {
                  if (item.divider) {
                    return <div key={idx} className="h-[1px] bg-[#c4c6cf] my-1.5" />;
                  }
                  const restricted = isItemRestricted(item);
                  return (
                    <button
                      key={idx}
                      onClick={() => handleItemClick(item)}
                      className={`w-full text-left px-3.5 py-2 flex items-center justify-between group text-[13px] leading-tight ${
                        restricted
                          ? 'opacity-60 bg-[#ebeef2] text-[#74777f] hover:bg-[#e0e3e8] hover:text-[#44474e] cursor-not-allowed'
                          : 'hover:bg-[#002046] hover:text-white cursor-pointer text-[#181c1f]'
                      }`}
                      title={restricted ? `Bloqueado para perfil ${currentUser?.role || ''}` : undefined}
                    >
                      <span className="font-normal flex items-center gap-1.5">
                        {item.label}
                        {restricted && <Lock className="w-3.5 h-3.5 text-amber-700 inline" />}
                      </span>
                      {item.hotkey && (
                        <span
                          className={`text-[11px] font-mono ml-4 font-semibold ${
                            restricted
                              ? 'text-[#8e9199]'
                              : 'text-[#74777f] group-hover:text-[#aec7f7]'
                          }`}
                        >
                          {item.hotkey}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Right side Logout button */}
      {onLogout && (
        <button
          onClick={onLogout}
          title="Cerrar Sesión de Usuario"
          className="ml-auto h-[26px] px-2.5 bg-[#aa3531] hover:bg-[#8c2a26] text-white text-[12px] font-bold rounded-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
        >
          <LogOut className="w-3.5 h-3.5 text-white" />
          <span>Cerrar Sesión</span>
        </button>
      )}
    </div>
  );
};
