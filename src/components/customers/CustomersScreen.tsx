import React, { useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Edit2,
  FileText,
  DollarSign,
  Download,
  AlertTriangle,
  Save,
  CheckCircle,
} from 'lucide-react';
import { Customer } from '../../types/pos';
import { formatCurrency } from '../../utils/scaleParser';
import { WindowsModal } from '../common/WindowsModal';
import { useDialog } from '../../context/DialogContext';

interface CustomersScreenProps {
  customers: Customer[];
  onUpdateCustomer: (customer: Customer) => void;
  onAddCustomer: (customer: Customer) => void;
  onViewAccount: (customer: Customer) => void;
  onRegisterPayment: (customer: Customer) => void;
}

export const CustomersScreen: React.FC<CustomersScreenProps> = ({
  customers,
  onUpdateCustomer,
  onAddCustomer,
  onViewAccount,
  onRegisterPayment,
}) => {
  const { showAlert } = useDialog();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [selectedCustomerCode, setSelectedCustomerCode] = useState<string>(customers[0]?.code || '');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isNewMode, setIsNewMode] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const filteredCustomers = customers.filter((c) => {
    if (statusFilter !== 'TODOS' && c.status !== statusFilter) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.code.toLowerCase().includes(term) ||
      c.name.toLowerCase().includes(term) ||
      c.dniCuit.toLowerCase().includes(term) ||
      c.phone.toLowerCase().includes(term)
    );
  });

  const selectedCustomer =
    filteredCustomers.find((c) => c.code === selectedCustomerCode) || filteredCustomers[0];

  const handleOpenEdit = (c: Customer) => {
    setIsNewMode(false);
    setEditingCustomer({ ...c });
    setIsModalOpen(true);
  };

  const handleOpenNew = () => {
    setIsNewMode(true);
    setEditingCustomer({
      code: `00${customers.length + 200}`,
      name: '',
      dniCuit: '',
      phone: '',
      address: '',
      vatCondition: 'Cons. Final',
      creditLimit: 0,
      currentBalance: 0,
      status: 'AL_DIA',
      notes: '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!editingCustomer || !editingCustomer.name.trim()) {
      await showAlert('El nombre del cliente es obligatorio.');
      return;
    }
    if (isNewMode) {
      onAddCustomer(editingCustomer);
    } else {
      onUpdateCustomer(editingCustomer);
    }
    setIsModalOpen(false);
  };

  const totalDebt = customers.reduce((sum, c) => sum + Math.max(0, c.currentBalance), 0);

  return (
    <div className="flex flex-col w-full h-[calc(100vh-80px)] select-none bg-[#ebeef2] text-[#181c1f] font-sans p-1">
      {/* Top Filter and Actions Bar */}
      <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm mb-1 flex flex-wrap items-center justify-between gap-2">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <label className="text-[11px] font-bold text-[#002046] uppercase whitespace-nowrap">
            Buscar cliente:
          </label>
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nombre, CUIT/DNI, teléfono o código..."
              className="w-full h-[26px] px-2 bg-[#f7fafe] border border-[#74777f] text-[12px] font-semibold text-[#002046] focus:bg-white focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-[#74777f] absolute right-2 top-1.5" />
          </div>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-[#44474e] uppercase">Estado de Cuenta:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-[26px] px-2 bg-white border border-[#74777f] text-[12px] font-semibold cursor-pointer"
          >
            <option value="TODOS">Todos los Estados</option>
            <option value="NORMAL">Normal / Regular</option>
            <option value="AL_DIA">Al Día (Sin saldo)</option>
            <option value="EXCEDIDO">Excedido de Límite</option>
            <option value="SUSPENDIDO">Suspendido</option>
          </select>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenNew}
            className="h-[26px] px-2.5 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Nuevo Cliente</span>
          </button>
          <button
            disabled={!selectedCustomer}
            onClick={() => selectedCustomer && handleOpenEdit(selectedCustomer)}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <Edit2 className="w-3 h-3 text-[#002046]" />
            <span>Editar</span>
          </button>
          <button
            disabled={!selectedCustomer}
            onClick={() => selectedCustomer && onViewAccount(selectedCustomer)}
            className="h-[26px] px-2.5 bg-[#1b365d] hover:bg-[#284877] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <FileText className="w-3.5 h-3.5 text-[#aec7f7]" />
            <span>Ver Cuenta Corriente</span>
          </button>
          <button
            disabled={!selectedCustomer}
            onClick={() => selectedCustomer && onRegisterPayment(selectedCustomer)}
            className="h-[26px] px-2.5 bg-[#aa3531] hover:bg-[#891c1d] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Registrar Cobranza</span>
          </button>
        </div>
      </div>

      {/* Main Customers Table */}
      <div className="bg-white border border-[#74777f] shadow-sm flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-[#aec7f7]" />
            <span>PADRÓN GENERAL DE CLIENTES Y CUENTAS CORRIENTES</span>
          </div>
          <div className="font-mono text-[11px] text-[#d4e3ff]">
            DEUDA TOTAL EN CALLE:{' '}
            <strong className="text-white font-bold">{formatCurrency(totalDebt)}</strong> |{' '}
            {filteredCustomers.length} CLIENTES
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-auto">
          <table className="w-full text-left border-collapse select-none text-[12px]">
            <thead className="sticky top-0 bg-[#e5e8ec] text-[#181c1f] font-bold text-[11px] border-b border-[#74777f]">
              <tr className="h-[24px]">
                <th className="w-[60px] px-2 border-r border-[#c4c6cf]">CÓD.</th>
                <th className="px-2 border-r border-[#c4c6cf]">NOMBRE / RAZÓN SOCIAL</th>
                <th className="w-[120px] px-2 border-r border-[#c4c6cf]">DNI / CUIT</th>
                <th className="w-[100px] px-2 border-r border-[#c4c6cf]">TELÉFONO</th>
                <th className="px-2 border-r border-[#c4c6cf]">DIRECCIÓN</th>
                <th className="w-[120px] px-2 border-r border-[#c4c6cf]">CONDICIÓN IVA</th>
                <th className="w-[110px] px-2 text-right border-r border-[#c4c6cf]">LÍMITE CRÉD.</th>
                <th className="w-[115px] px-2 text-right border-r border-[#c4c6cf] bg-[#e0e3e7]">
                  SALDO ACTUAL
                </th>
                <th className="w-[90px] px-1 text-center">ESTADO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ebeef2]">
              {filteredCustomers.map((cust, idx) => {
                const isSelected = cust.code === selectedCustomerCode;

                return (
                  <tr
                    key={cust.code}
                    onClick={() => setSelectedCustomerCode(cust.code)}
                    onDoubleClick={() => onViewAccount(cust)}
                    className={`h-[23px] cursor-pointer ${
                      isSelected
                        ? 'bg-[#002046] text-white font-bold'
                        : idx % 2 === 0
                        ? 'bg-white hover:bg-[#e5e8ec]'
                        : 'bg-[#f1f4f8] hover:bg-[#e5e8ec]'
                    }`}
                  >
                    <td className="px-2 font-mono text-[11px] border-r border-[#c4c6cf]">
                      {cust.code}
                    </td>
                    <td className="px-2 border-r border-[#c4c6cf] truncate max-w-[240px]">
                      {cust.name}
                    </td>
                    <td className="px-2 font-mono text-[11px] border-r border-[#c4c6cf]">
                      <span className={isSelected ? 'text-white' : 'text-[#44474e]'}>
                        {cust.dniCuit}
                      </span>
                    </td>
                    <td className="px-2 font-mono text-[11px] border-r border-[#c4c6cf]">
                      {cust.phone}
                    </td>
                    <td className="px-2 border-r border-[#c4c6cf] truncate max-w-[200px] text-[11px]">
                      {cust.address}
                    </td>
                    <td className="px-2 text-[11px] border-r border-[#c4c6cf]">
                      {cust.vatCondition}
                    </td>
                    <td className="text-right font-mono text-[11px] px-2 border-r border-[#c4c6cf]">
                      {formatCurrency(cust.creditLimit)}
                    </td>
                    <td
                      className={`text-right font-mono font-bold text-[12px] px-2 border-r border-[#c4c6cf] ${
                        cust.currentBalance > 0
                          ? isSelected
                            ? 'text-[#ffdad6]'
                            : 'text-[#aa3531]'
                          : isSelected
                          ? 'text-[#d6e3ff]'
                          : 'text-[#002046]'
                      }`}
                    >
                      {formatCurrency(cust.currentBalance)}
                    </td>
                    <td className="text-center px-1">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 font-bold ${
                          cust.status === 'AL_DIA'
                            ? isSelected
                              ? 'bg-[#1b365d] text-white'
                              : 'bg-[#d6e3ff] text-[#002046]'
                            : cust.status === 'EXCEDIDO' || cust.status === 'SUSPENDIDO'
                            ? 'bg-[#ffdad6] text-[#aa3531]'
                            : isSelected
                            ? 'bg-[#1b365d] text-white'
                            : 'bg-[#e0e3e7] text-[#181c1f]'
                        }`}
                      >
                        {cust.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Selected Customer Bottom Bar */}
        {selectedCustomer && (
          <div className="h-[30px] bg-[#e0e3e7] border-t border-[#74777f] px-2 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-3">
              <span className="font-bold text-[#002046]">{selectedCustomer.name}</span>
              <span>Domicilio: {selectedCustomer.address}</span>
              <span className="text-[#c4c6cf]">|</span>
              <span>
                Crédito Disponible:{' '}
                <strong className="font-mono text-[#002046]">
                  {formatCurrency(
                    Math.max(0, selectedCustomer.creditLimit - selectedCustomer.currentBalance)
                  )}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onViewAccount(selectedCustomer)}
                className="h-[22px] px-2 bg-[#ebeef2] hover:bg-white border border-[#74777f] text-[#002046] font-bold text-[10px] cursor-pointer"
              >
                Ver Historial de Movimientos
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Edit or Create Customer */}
      <WindowsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isNewMode ? 'NUEVO CLIENTE EN PADRÓN' : `EDITAR CLIENTE: ${editingCustomer?.name}`}
        maxWidth="max-w-lg"
      >
        {editingCustomer && (
          <div className="flex flex-col gap-2 p-1 text-[12px]">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Código Cliente:</label>
                <input
                  type="text"
                  value={editingCustomer.code}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, code: e.target.value })}
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono text-[13px] font-bold"
                />
              </div>
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">DNI o CUIT:</label>
                <input
                  type="text"
                  value={editingCustomer.dniCuit}
                  onChange={(e) =>
                    setEditingCustomer({ ...editingCustomer, dniCuit: e.target.value })
                  }
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono text-[13px]"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-[#181c1f] block mb-0.5">
                Nombre Completo / Razón Social:
              </label>
              <input
                type="text"
                value={editingCustomer.name}
                onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                className="w-full h-[26px] px-2 bg-white border border-[#74777f] text-[13px] font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Teléfono de Contacto:</label>
                <input
                  type="text"
                  value={editingCustomer.phone}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
                />
              </div>
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Condición de IVA:</label>
                <select
                  value={editingCustomer.vatCondition}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      vatCondition: e.target.value as any,
                    })
                  }
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
                >
                  <option value="Cons. Final">Consumidor Final</option>
                  <option value="Resp. Inscripto">Responsable Inscripto (Factura A)</option>
                  <option value="Monotributo">Monotributo</option>
                  <option value="Exento">Exento</option>
                </select>
              </div>
            </div>

            <div>
              <label className="font-bold text-[#181c1f] block mb-0.5">Dirección / Localidad:</label>
              <input
                type="text"
                value={editingCustomer.address}
                onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-[#002046] block mb-0.5">Límite de Crédito ($):</label>
                <input
                  type="number"
                  value={editingCustomer.creditLimit}
                  onChange={(e) =>
                    setEditingCustomer({
                      ...editingCustomer,
                      creditLimit: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono text-[13px] font-bold"
                />
              </div>
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Estado de Cuenta:</label>
                <select
                  value={editingCustomer.status}
                  onChange={(e) =>
                    setEditingCustomer({ ...editingCustomer, status: e.target.value as any })
                  }
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
                >
                  <option value="NORMAL">NORMAL</option>
                  <option value="AL_DIA">AL DÍA</option>
                  <option value="EXCEDIDO">EXCEDIDO DE LÍMITE</option>
                  <option value="SUSPENDIDO">SUSPENDIDO</option>
                </select>
              </div>
            </div>

            <div>
              <label className="font-bold text-[#181c1f] block mb-0.5">Observaciones Internas:</label>
              <textarea
                value={editingCustomer.notes || ''}
                onChange={(e) => setEditingCustomer({ ...editingCustomer, notes: e.target.value })}
                rows={2}
                className="w-full p-2 bg-white border border-[#74777f] text-[12px]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#c4c6cf]">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="h-[26px] px-3 bg-[#ebeef2] border border-[#74777f] text-[11px] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="h-[26px] px-4 bg-[#002046] text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Guardar Cliente</span>
              </button>
            </div>
          </div>
        )}
      </WindowsModal>
    </div>
  );
};
