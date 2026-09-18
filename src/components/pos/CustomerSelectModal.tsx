import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Wallet, Check, AlertTriangle, UserCheck, Building, Percent, User, Tag } from 'lucide-react';
import { Customer, Employee } from '../../types/pos';
import { WindowsModal } from '../common/WindowsModal';
import { formatCurrency } from '../../utils/scaleParser';

export type PartyType = 'CLIENTE' | 'EMPLEADO';

export interface SelectedPartyData {
  type: PartyType;
  customer?: Customer;
  employee?: Employee;
  code: string;
  name: string;
  dniCuit: string;
  phone: string;
  address?: string;
  vatCondition: 'Resp. Inscripto' | 'Monotributo' | 'Cons. Final' | 'Exento';
  creditLimit: number;
  currentBalance: number;
  status: 'NORMAL' | 'AL_DIA' | 'SUSPENDIDO' | 'EXCEDIDO';
  role?: string;
  legajo?: string;
  branch?: string;
  employeeDiscountPercent: number;
}

export interface UnifiedPartyItem {
  id: string;
  type: PartyType;
  code: string;
  name: string;
  subTitle: string;
  dniCuit: string;
  phone: string;
  address?: string;
  vatCondition: 'Resp. Inscripto' | 'Monotributo' | 'Cons. Final' | 'Exento';
  currentBalance: number;
  creditLimit: number;
  status: 'NORMAL' | 'AL_DIA' | 'SUSPENDIDO' | 'EXCEDIDO';
  role?: string;
  legajo?: string;
  branch?: string;
  employeeDiscountPercent?: number;
  rawCustomer?: Customer;
  rawEmployee?: Employee;
}

interface CustomerSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  employees?: Employee[];
  currentSaleSubtotal?: number;
  initialDiscountPercent?: number;
  onSelectCustomer?: (customer: Customer) => void;
  onSelectParty?: (party: SelectedPartyData) => void;
  onViewStatement?: (customerOrParty: any) => void;
  onOpenCreateCustomer?: () => void;
}

export const CustomerSelectModal: React.FC<CustomerSelectModalProps> = ({
  isOpen,
  onClose,
  customers,
  employees = [],
  currentSaleSubtotal = 0,
  initialDiscountPercent = 0,
  onSelectCustomer,
  onSelectParty,
  onViewStatement,
  onOpenCreateCustomer,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<'TODOS' | 'CLIENTES' | 'EMPLEADOS' | 'DEUDORES'>('TODOS');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [employeeDiscountPercent, setEmployeeDiscountPercent] = useState<number>(initialDiscountPercent || 0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Combine Customers and Employees into unified items
  const unifiedItems: UnifiedPartyItem[] = useMemo(() => {
    const custItems: UnifiedPartyItem[] = (customers || [])
      .filter((c) => {
        // Prevent listing employee accounts under the CLIENTE role if they are already in the EMPLEADO list
        const isEmployeeCode = c.code?.startsWith('EMP-');
        const hasMatchingEmployee = (employees || []).some(
          (e) => e.code === c.code || (e.dni && c.dniCuit && e.dni === c.dniCuit)
        );
        return !isEmployeeCode && !hasMatchingEmployee;
      })
      .map((c) => ({
      id: `CUST-${c.code}`,
      type: 'CLIENTE',
      code: c.code,
      name: c.name,
      subTitle: c.address ? `Cliente • ${c.address}` : 'Cliente Cuenta Corriente',
      dniCuit: c.dniCuit || '--',
      phone: c.phone || '--',
      address: c.address || '',
      vatCondition: c.vatCondition || 'Cons. Final',
      currentBalance: Number(c.currentBalance) || 0,
      creditLimit: Number(c.creditLimit) || 0,
      status: c.status || 'NORMAL',
      rawCustomer: c,
    }));

    const empItems: UnifiedPartyItem[] = (employees || []).map((e) => ({
      id: `EMP-${e.code}`,
      type: 'EMPLEADO',
      code: e.code,
      name: e.name,
      subTitle: `Legajo ${e.legajo || e.code} • ${e.role || 'Personal'} (${e.branch || 'Sucursal'})${e.discountPercent ? ` • Beneficio ${e.discountPercent}%` : ''}`,
      dniCuit: e.dni || '--',
      phone: e.phone || '--',
      address: `Sucursal ${e.branch || 'Principal'}`,
      vatCondition: 'Cons. Final',
      currentBalance: Number(e.currentBalance) || 0,
      creditLimit: Number(e.creditLimit) || 0,
      status: (Number(e.currentBalance) || 0) > (Number(e.creditLimit) || 0) && (Number(e.creditLimit) || 0) > 0 ? 'EXCEDIDO' : 'NORMAL',
      role: e.role,
      legajo: e.legajo,
      branch: e.branch,
      employeeDiscountPercent: e.discountPercent || 0,
      rawEmployee: e,
    }));

    return [...custItems, ...empItems];
  }, [customers, employees]);

  // Filter in real time as the user types
  const filteredItems = useMemo(() => {
    return unifiedItems.filter((item) => {
      // Tab / Radio filter
      if (filterType === 'CLIENTES' && item.type !== 'CLIENTE') return false;
      if (filterType === 'EMPLEADOS' && item.type !== 'EMPLEADO') return false;
      if (filterType === 'DEUDORES' && item.currentBalance <= 0) return false;

      // Search query match
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();
      return (
        item.code.toLowerCase().includes(term) ||
        item.name.toLowerCase().includes(term) ||
        item.dniCuit.toLowerCase().replace(/[-.]/g, '').includes(term.replace(/[-.]/g, '')) ||
        item.phone.toLowerCase().includes(term) ||
        item.subTitle.toLowerCase().includes(term) ||
        (item.legajo && item.legajo.toLowerCase().includes(term))
      );
    });
  }, [unifiedItems, filterType, searchTerm]);

  const selectedItem: UnifiedPartyItem | undefined = filteredItems[selectedIndex] || filteredItems[0];

  // Auto focus input when opened & reset discount to default or initial
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedIndex(0);
      setEmployeeDiscountPercent(initialDiscountPercent || 0);
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
    }
  }, [isOpen, initialDiscountPercent]);

  // Adjust selection if results change
  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems.length, selectedIndex]);

  // Update discount percent when selected employee changes
  useEffect(() => {
    if (selectedItem?.type === 'EMPLEADO') {
      setEmployeeDiscountPercent(selectedItem.employeeDiscountPercent || 0);
    } else {
      setEmployeeDiscountPercent(0);
    }
  }, [selectedItem]);

  const handleConfirmSelection = (itemToSelect?: UnifiedPartyItem) => {
    const target = itemToSelect || selectedItem;
    if (!target) return;

    const discountToApply = target.type === 'EMPLEADO' ? employeeDiscountPercent : 0;

    const partyData: SelectedPartyData = {
      type: target.type,
      customer: target.rawCustomer,
      employee: target.rawEmployee,
      code: target.code,
      name: target.name,
      dniCuit: target.dniCuit,
      phone: target.phone,
      address: target.address,
      vatCondition: target.vatCondition,
      creditLimit: target.creditLimit,
      currentBalance: target.currentBalance,
      status: target.status,
      role: target.role,
      legajo: target.legajo,
      branch: target.branch,
      employeeDiscountPercent: discountToApply,
    };

    if (onSelectParty) {
      onSelectParty(partyData);
    } else if (onSelectCustomer) {
      // Backwards compatible customer object
      if (target.rawCustomer) {
        onSelectCustomer(target.rawCustomer);
      } else if (target.rawEmployee) {
        const virtualCust: Customer = {
          code: target.rawEmployee.code,
          name: target.rawEmployee.name,
          dniCuit: target.rawEmployee.dni || '',
          phone: target.rawEmployee.phone || '',
          address: `Personal - Legajo ${target.rawEmployee.legajo} (${target.rawEmployee.branch})`,
          vatCondition: 'Cons. Final',
          creditLimit: target.rawEmployee.creditLimit || 0,
          currentBalance: target.rawEmployee.currentBalance || 0,
          status: 'NORMAL',
          notes: `Empleado: ${target.rawEmployee.role} - Descuento: ${discountToApply}%`,
        };
        onSelectCustomer(virtualCust);
      }
    }

    onClose();
  };

  // Keyboard navigation: arrow up/down, enter to select, escape to close
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && selectedItem) {
      e.preventDefault();
      handleConfirmSelection(selectedItem);
    } else if (e.key === 'F5' && selectedItem && onViewStatement) {
      e.preventDefault();
      onViewStatement(selectedItem.rawCustomer || selectedItem.rawEmployee || selectedItem);
    }
  };

  // Calculations for employee discount preview
  const rawSubtotal = currentSaleSubtotal > 0 ? currentSaleSubtotal : 0;
  const discountAmount =
    selectedItem?.type === 'EMPLEADO' && employeeDiscountPercent > 0
      ? Math.round(rawSubtotal * (employeeDiscountPercent / 100))
      : 0;
  const totalWithDiscount = Math.max(0, rawSubtotal - discountAmount);

  return (
    <WindowsModal
      isOpen={isOpen}
      onClose={onClose}
      title="SELECCIONAR CUENTA CORRIENTE (CLIENTES Y EMPLEADOS) - [F8]"
      icon={<Wallet className="w-4 h-4 text-[#aec7f7]" />}
      maxWidth="max-w-5xl"
    >
      <div className="flex flex-col gap-2" onKeyDown={handleKeyDown}>
        {/* Search & Filter Bar */}
        <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label
              htmlFor="clientSearchInput"
              className="text-[11px] font-bold uppercase text-[#002046] whitespace-nowrap"
            >
              Buscar Titular:
            </label>
            <div className="relative flex-1">
              <input
                ref={searchInputRef}
                id="clientSearchInput"
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIndex((prev) => Math.max(prev - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const itemToSelect = selectedItem || filteredItems[0];
                    if (itemToSelect) {
                      handleConfirmSelection(itemToSelect);
                    }
                  } else if (e.key === 'F5' && onViewStatement) {
                    const itemToSelect = selectedItem || filteredItems[0];
                    if (itemToSelect) {
                      e.preventDefault();
                      onViewStatement(itemToSelect.rawCustomer || itemToSelect.rawEmployee || itemToSelect);
                    }
                  }
                }}
                placeholder="Nombre, CUIT/DNI, teléfono, legajo o código... (Búsqueda instantánea - [Enter] Seleccionar)"
                className="w-full h-[26px] px-2 bg-[#f7fafe] text-[#181c1f] text-[12px] font-semibold border border-[#74777f] focus:outline-none focus:bg-white focus:border-[#002046]"
                autoFocus
              />
              <Search className="w-4 h-4 text-[#74777f] absolute right-2 top-1 pointer-events-none" />
            </div>
            <span className="text-[11px] italic text-[#44474e] hidden md:inline">
              (Búsqueda en tiempo real)
            </span>
          </div>

          {/* Quick Filter Tabs / Radios */}
          <div className="flex flex-wrap items-center justify-between text-[11px] pt-1 gap-2 border-t border-[#ebeef2]">
            <div className="flex items-center gap-2 bg-[#f1f4f8] p-0.5 border border-[#c4c6cf]">
              <button
                type="button"
                onClick={() => {
                  setFilterType('TODOS');
                  setSelectedIndex(0);
                }}
                className={`px-2.5 py-0.5 font-bold cursor-pointer transition-colors ${
                  filterType === 'TODOS'
                    ? 'bg-[#002046] text-white shadow-2xs'
                    : 'text-[#44474e] hover:bg-[#e0e3e7]'
                }`}
              >
                Todos ({unifiedItems.length})
              </button>

              <button
                type="button"
                onClick={() => {
                  setFilterType('CLIENTES');
                  setSelectedIndex(0);
                }}
                className={`px-2.5 py-0.5 font-bold cursor-pointer flex items-center gap-1 transition-colors ${
                  filterType === 'CLIENTES'
                    ? 'bg-[#002046] text-white shadow-2xs'
                    : 'text-[#44474e] hover:bg-[#e0e3e7]'
                }`}
              >
                <Building className="w-3 h-3" />
                <span>Clientes ({customers.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFilterType('EMPLEADOS');
                  setSelectedIndex(0);
                }}
                className={`px-2.5 py-0.5 font-bold cursor-pointer flex items-center gap-1 transition-colors ${
                  filterType === 'EMPLEADOS'
                    ? 'bg-[#00522c] text-white shadow-2xs'
                    : 'text-[#00522c] hover:bg-[#e0e3e7]'
                }`}
              >
                <UserCheck className="w-3 h-3" />
                <span>Empleados / Personal ({employees.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFilterType('DEUDORES');
                  setSelectedIndex(0);
                }}
                className={`px-2.5 py-0.5 font-bold cursor-pointer transition-colors ${
                  filterType === 'DEUDORES'
                    ? 'bg-[#aa3531] text-white shadow-2xs'
                    : 'text-[#aa3531] hover:bg-[#e0e3e7]'
                }`}
              >
                Con Saldo Deudor
              </button>
            </div>

            <div className="font-mono text-[11px] text-[#44474e] flex items-center gap-2">
              <span>Coincidencias:</span>
              <strong className="bg-[#002046] text-white px-1.5 py-0.5 font-bold">
                {filteredItems.length} ENCONTRADOS
              </strong>
            </div>
          </div>
        </div>

        {/* Dense Win32 DataGrid */}
        <div className="bg-white border border-[#74777f] shadow-sm overflow-hidden flex flex-col">
          {/* Header */}
          <div className="grid grid-cols-12 bg-[#1b365d] text-white font-bold text-[11px] py-1 px-2 border-b border-[#002046]">
            <div className="col-span-2">TIPO / CÓDIGO</div>
            <div className="col-span-4">TITULAR / RAZÓN SOCIAL / PUESTO</div>
            <div className="col-span-2">CUIT / DNI</div>
            <div className="col-span-1">TELÉFONO</div>
            <div className="col-span-2 text-right">SALDO ACTUAL</div>
            <div className="col-span-1 text-right">LÍMITE</div>
          </div>

          {/* Body */}
          <div className="min-h-[170px] max-h-[190px] overflow-y-auto divide-y divide-[#ebeef2]">
            {filteredItems.length === 0 ? (
              <div className="p-4 text-center text-[12px] text-[#74777f] italic">
                No se encontraron cuentas corrientes coincidentes con "{searchTerm}".
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const isEmployee = item.type === 'EMPLEADO';

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedIndex(idx)}
                    onDoubleClick={() => handleConfirmSelection(item)}
                    className={`grid grid-cols-12 px-2 py-1 items-center text-[12px] cursor-pointer ${
                      isSelected
                        ? isEmployee
                          ? 'bg-[#003822] text-white font-bold'
                          : 'bg-[#002046] text-white font-bold'
                        : idx % 2 === 0
                        ? 'bg-white hover:bg-[#e5e8ec]'
                        : 'bg-[#f1f4f8] hover:bg-[#e5e8ec]'
                    }`}
                  >
                    {/* Col 1: Tipo & Codigo */}
                    <div className="col-span-2 flex items-center gap-1.5 font-mono text-[11px]">
                      {isEmployee ? (
                        <span
                          className={`text-[9px] px-1 py-0.2 font-sans font-bold flex items-center gap-0.5 border ${
                            isSelected
                              ? 'bg-[#74dc9e] text-[#003822] border-white'
                              : 'bg-[#e6f4ea] text-[#00522c] border-[#a8dab5]'
                          }`}
                        >
                          <UserCheck className="w-2.5 h-2.5" />
                          EMPLEADO
                        </span>
                      ) : (
                        <span
                          className={`text-[9px] px-1 py-0.2 font-sans font-bold flex items-center gap-0.5 border ${
                            isSelected
                              ? 'bg-[#d6e3ff] text-[#002046] border-white'
                              : 'bg-[#ebeef2] text-[#002046] border-[#c4c6cf]'
                          }`}
                        >
                          <Building className="w-2.5 h-2.5" />
                          CLIENTE
                        </span>
                      )}
                      <span className="font-bold">{item.code}</span>
                    </div>

                    {/* Col 2: Name & Subtitle */}
                    <div className="col-span-4 truncate flex items-center gap-1">
                      {isSelected && <span className="text-[#d6e3ff]">►</span>}
                      <div className="flex flex-col truncate leading-tight">
                        <div className="flex items-center gap-1">
                          <span className="truncate">{item.name}</span>
                          {item.currentBalance > 0 && (
                            <span
                              className={`text-[9px] px-1 py-0.2 font-mono ${
                                isSelected
                                  ? 'bg-[#aa3531] text-white'
                                  : 'bg-[#ffdad6] text-[#aa3531]'
                              }`}
                            >
                              DEUDA
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[10px] truncate ${
                            isSelected ? 'text-white/80' : 'text-[#74777f]'
                          }`}
                        >
                          {item.subTitle}
                        </span>
                      </div>
                    </div>

                    {/* Col 3: DNI / CUIT */}
                    <div className="col-span-2 font-mono text-[11px]">
                      <span className={isSelected ? 'text-white' : 'text-[#44474e]'}>
                        {item.dniCuit}
                      </span>
                    </div>

                    {/* Col 4: Phone */}
                    <div className="col-span-1 font-mono text-[11px]">
                      <span className={isSelected ? 'text-white' : ''}>{item.phone}</span>
                    </div>

                    {/* Col 5: Current Balance */}
                    <div
                      className={`col-span-2 text-right font-mono font-bold text-[12px] ${
                        item.currentBalance > 0
                          ? isSelected
                            ? 'text-[#ffdad6]'
                            : 'text-[#aa3531]'
                          : isSelected
                          ? 'text-[#d6e3ff]'
                          : 'text-[#002046]'
                      }`}
                    >
                      {formatCurrency(item.currentBalance)}
                    </div>

                    {/* Col 6: Credit Limit */}
                    <div className="col-span-1 text-right font-mono text-[11px]">
                      <span className={isSelected ? 'text-white' : 'text-[#44474e]'}>
                        {formatCurrency(item.creditLimit)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Selected Item Telemetry & Employee Discount Panel */}
        {selectedItem && (
          <div className="flex flex-col gap-1.5">
            {/* Telemetry Summary Strip */}
            <div className="bg-[#e0e3e7] border border-[#c4c6cf] p-2 flex flex-col gap-1 text-[#181c1f]">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-[#44474e] uppercase font-bold">
                    {selectedItem.type === 'EMPLEADO' ? 'Personal / Empleado:' : 'Cliente:'}
                  </span>
                  <span className="font-bold text-[#002046] text-[12px] flex items-center gap-1">
                    {selectedItem.type === 'EMPLEADO' ? (
                      <span className="bg-[#00522c] text-white px-1 py-0.2 text-[10px]">
                        LEGAJO {selectedItem.legajo || selectedItem.code}
                      </span>
                    ) : null}
                    {selectedItem.name} ({selectedItem.code})
                  </span>
                  <span className="text-[#74777f]">|</span>
                  <span className="text-[#44474e] uppercase font-bold">Detalle:</span>
                  <span className="truncate">{selectedItem.subTitle}</span>
                </div>
                <span className="font-mono text-[10px] font-bold text-[#002046] bg-[#d6e3ff] px-1.5 py-0.5">
                  COND. IVA: {selectedItem.vatCondition}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5 mt-1">
                <div className="bg-white p-1.5 border border-[#c4c6cf] flex flex-col">
                  <span className="text-[10px] font-bold uppercase text-[#44474e]">Límite Cta Cte</span>
                  <span className="font-mono text-[12px] font-bold text-[#181c1f]">
                    {formatCurrency(selectedItem.creditLimit)}
                  </span>
                </div>
                <div className="bg-white p-1.5 border border-[#c4c6cf] flex flex-col">
                  <span className="text-[10px] font-bold uppercase text-[#44474e]">Saldo Acumulado</span>
                  <span className="font-mono text-[12px] font-bold text-[#aa3531]">
                    {formatCurrency(selectedItem.currentBalance)}
                  </span>
                </div>
                <div className="bg-white p-1.5 border border-[#c4c6cf] flex flex-col">
                  <span className="text-[10px] font-bold uppercase text-[#44474e]">Disponible</span>
                  <span className="font-mono text-[12px] font-bold text-[#002046]">
                    {formatCurrency(Math.max(0, selectedItem.creditLimit - selectedItem.currentBalance))}
                  </span>
                </div>
                <div className="bg-white p-1.5 border border-[#c4c6cf] flex flex-col">
                  <span className="text-[10px] font-bold uppercase text-[#44474e]">Tipo de Titular</span>
                  <span className="text-[11px] font-bold text-[#002046] flex items-center gap-1">
                    {selectedItem.type === 'EMPLEADO' ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5 text-[#00522c]" />
                        <span>PERSONAL INTERNO</span>
                      </>
                    ) : (
                      <>
                        <Building className="w-3.5 h-3.5 text-[#002046]" />
                        <span>CLIENTE EXTERNO</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* DEDICATED EMPLOYEE DISCOUNT CONFIGURATION */}
            {selectedItem.type === 'EMPLEADO' && (
              <div className="bg-[#e6f4ea] border-2 border-[#00522c] p-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[#00522c] font-bold text-[12px]">
                    <Percent className="w-4 h-4 text-[#00522c]" />
                    <span className="uppercase">Beneficio Personal / Descuento de Empleado:</span>
                  </div>
                  <span className="text-[10px] text-[#00522c] font-semibold italic">
                    * Se aplica en porcentaje sobre la venta en Cuenta Corriente
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-white p-2 border border-[#a8dab5]">
                  {/* Quick percentage buttons */}
                  <div className="md:col-span-6 flex flex-wrap items-center gap-1">
                    <span className="text-[11px] font-bold text-[#002046] mr-1">Seleccionar:</span>
                    {[0, 5, 10, 15, 20, 25, 30].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setEmployeeDiscountPercent(pct)}
                        className={`px-2 py-0.5 text-[11px] font-mono font-bold border cursor-pointer transition-all ${
                          employeeDiscountPercent === pct
                            ? 'bg-[#00522c] text-white border-[#003822] shadow-sm'
                            : 'bg-[#f1f4f8] text-[#181c1f] border-[#c4c6cf] hover:bg-[#e0e3e7]'
                        }`}
                      >
                        {pct === 0 ? '0% (Sin desc.)' : `${pct}%`}
                      </button>
                    ))}
                  </div>

                  {/* Custom percentage input */}
                  <div className="md:col-span-3 flex items-center gap-1.5">
                    <label className="text-[11px] font-bold text-[#002046] whitespace-nowrap">
                      % Personalizado:
                    </label>
                    <div className="flex items-center border border-[#74777f] bg-white px-1.5 h-[26px]">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={employeeDiscountPercent === 0 ? '' : employeeDiscountPercent}
                        onChange={(e) => {
                          const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                          setEmployeeDiscountPercent(val);
                        }}
                        placeholder="0"
                        className="w-12 text-right font-mono font-bold text-[13px] text-[#00522c] focus:outline-none"
                      />
                      <span className="font-bold text-[12px] text-[#44474e] ml-0.5">%</span>
                    </div>
                  </div>

                  {/* Dynamic calculation preview */}
                  <div className="md:col-span-3 bg-[#f7fafe] p-1.5 border border-[#c4c6cf] flex flex-col text-[11px] font-mono">
                    <div className="flex justify-between text-[#44474e]">
                      <span>Subtotal venta:</span>
                      <span>{formatCurrency(rawSubtotal)}</span>
                    </div>
                    {employeeDiscountPercent > 0 && (
                      <div className="flex justify-between text-[#00522c] font-bold">
                        <span>Desc. ({employeeDiscountPercent}%):</span>
                        <span>-{formatCurrency(discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[#002046] font-extrabold border-t border-[#c4c6cf] pt-0.5 mt-0.5">
                      <span>A cobrar en Cta Cte:</span>
                      <span className="text-[12px]">{formatCurrency(totalWithDiscount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dialog Actions Buttons */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-[11px] text-[#44474e] flex items-center gap-1">
            <span>Navegar con flechas <kbd className="font-mono font-bold">↑ ↓</kbd></span>
            <span>• Doble clic o <kbd className="font-mono font-bold">Enter</kbd> para seleccionar</span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenCreateCustomer && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCreateCustomer();
                }}
                className="h-[26px] px-3 bg-[#002046] hover:bg-[#1b365d] text-white border border-[#002046] text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                title="Registrar nuevo cliente y consultar CUIT en ARCA"
              >
                <span>+ Nuevo Cliente / ARCA</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="h-[26px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span className="bg-[#c4c6cf] px-1 font-mono text-[10px] font-bold">Esc</span>
              <span>Cancelar</span>
            </button>

            {selectedItem && onViewStatement && (
              <button
                onClick={() => {
                  onViewStatement(selectedItem.rawCustomer || selectedItem.rawEmployee || selectedItem);
                  onClose();
                }}
                className="h-[26px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span className="bg-[#1b365d] text-white px-1 font-mono text-[10px] font-bold">F5</span>
                <span>Ver Estado de Cuenta</span>
              </button>
            )}

            <button
              disabled={!selectedItem}
              onClick={() => handleConfirmSelection(selectedItem)}
              className="h-[28px] px-4 bg-[#00522c] hover:bg-[#003822] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
            >
              <span className="bg-white text-[#00522c] px-1 font-mono text-[10px] font-bold">Enter</span>
              <Check className="w-3.5 h-3.5" />
              <span>
                {selectedItem?.type === 'EMPLEADO'
                  ? `Confirmar Cuenta Empleado ${employeeDiscountPercent > 0 ? `(${employeeDiscountPercent}% Desc.)` : ''}`
                  : 'Seleccionar Cuenta Corriente'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </WindowsModal>
  );
};
