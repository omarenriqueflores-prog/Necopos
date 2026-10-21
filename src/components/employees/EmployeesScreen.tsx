import React, { useState } from 'react';
import {
  UserCheck,
  Plus,
  Edit2,
  DollarSign,
  FileText,
  Search,
  Save,
  Trash2,
} from 'lucide-react';
import { Employee } from '../../types/pos';
import { formatCurrency } from '../../utils/scaleParser';
import { WindowsModal } from '../common/WindowsModal';
import { useDialog } from '../../context/DialogContext';

interface EmployeesScreenProps {
  employees: Employee[];
  onUpdateEmployee: (emp: Employee) => void;
  onAddEmployee: (emp: Employee) => void;
  onDeleteEmployee: (code: string) => Promise<void>;
  onViewAccount: (emp: Employee) => void;
}

export const EmployeesScreen: React.FC<EmployeesScreenProps> = ({
  employees,
  onUpdateEmployee,
  onAddEmployee,
  onDeleteEmployee,
  onViewAccount,
}) => {
  const { showAlert, showConfirm, showAdminAuth } = useDialog();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('TODAS');
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState<string>(
    employees[0]?.code || ''
  );
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState<boolean>(false);
  const [advanceAmount, setAdvanceAmount] = useState<string>('20000');
  const [isNewMode, setIsNewMode] = useState<boolean>(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const filteredEmployees = employees.filter((e) => {
    if (branchFilter !== 'TODAS' && e.branch !== branchFilter) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      e.name.toLowerCase().includes(term) ||
      e.legajo.includes(term) ||
      e.dni.includes(term) ||
      e.code.toLowerCase().includes(term)
    );
  });

  const selectedEmployee =
    filteredEmployees.find((e) => e.code === selectedEmployeeCode) || filteredEmployees[0];

  const handleOpenEdit = (emp: Employee) => {
    setIsNewMode(false);
    setEditingEmployee({ ...emp });
    setIsModalOpen(true);
  };

  const handleOpenNew = () => {
    setIsNewMode(true);
    setEditingEmployee({
      code: `EMP-0${employees.length + 1}`,
      name: '',
      legajo: `10${employees.length + 50}`,
      dni: '',
      phone: '',
      branch: 'NECO 1',
      role: 'CAJERO',
      shift: 'MAÑANA',
      creditLimit: 0,
      currentBalance: 0,
      active: true,
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!editingEmployee || !editingEmployee.name.trim()) {
      await showAlert('El nombre del empleado es obligatorio.');
      return;
    }
    if (isNewMode) {
      onAddEmployee(editingEmployee);
    } else {
      onUpdateEmployee(editingEmployee);
    }
    setIsModalOpen(false);
  };

  const handleDeleteEmployee = async (employee: Employee) => {
    const confirmed = await showConfirm(
      `¿Desea eliminar al empleado "${employee.name}" (${employee.code})?`,
      'CONFIRMAR ELIMINACIÓN DE EMPLEADO'
    );
    if (!confirmed) return;

    const authorized = await showAdminAuth(
      `Para eliminar al empleado "${employee.name}" se requiere autorización de administrador.`,
      'AUTORIZACIÓN - ELIMINAR EMPLEADO'
    );
    if (!authorized) return;

    try {
      await onDeleteEmployee(employee.code);
      await showAlert(`El empleado "${employee.name}" fue eliminado.`);
    } catch (error) {
      console.error('Error al eliminar empleado:', error);
      const detail = error instanceof Error ? error.message : String(error);
      await showAlert(`No se pudo eliminar al empleado "${employee.name}": ${detail}`);
    }
  };

  const handleConfirmAdvance = async () => {
    const amt = parseFloat(advanceAmount) || 0;
    if (amt <= 0 || !selectedEmployee) return;

    selectedEmployee.currentBalance += amt;
    onUpdateEmployee({ ...selectedEmployee });
    setIsAdvanceModalOpen(false);
    await showAlert(`Vale de anticipo registrado para ${selectedEmployee.name}: ${formatCurrency(amt)}.`);
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-80px)] select-none bg-[#ebeef2] text-[#181c1f] font-sans p-1">
      {/* Top Controls */}
      <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <label className="text-[11px] font-bold text-[#002046] uppercase whitespace-nowrap">
            Buscar personal:
          </label>
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nombre, legajo, DNI o código..."
              className="w-full h-[26px] px-2 bg-[#f7fafe] border border-[#74777f] text-[12px] font-semibold text-[#002046] focus:bg-white focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-[#74777f] absolute right-2 top-1.5" />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-[#44474e] uppercase">Sucursal:</label>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="h-[26px] px-2 bg-white border border-[#74777f] text-[12px] font-semibold cursor-pointer"
          >
            <option value="TODAS">Todas las Sucursales</option>
            <option value="NECO 1">NECO 1 (Central)</option>
            <option value="NECO 2">NECO 2 (Villa Saavedra)</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenNew}
            className="h-[26px] px-2.5 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Nuevo Empleado</span>
          </button>
          <button
            disabled={!selectedEmployee}
            onClick={() => selectedEmployee && handleOpenEdit(selectedEmployee)}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <Edit2 className="w-3 h-3 text-[#002046]" />
            <span>Editar</span>
          </button>
          <button
            disabled={!selectedEmployee}
            onClick={() => selectedEmployee && handleDeleteEmployee(selectedEmployee)}
            className="h-[26px] px-2.5 bg-[#aa3531] hover:bg-[#891c1d] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
            title="Eliminar empleado (requiere clave de administrador)"
          >
            <Trash2 className="w-3 h-3" />
            <span>Eliminar</span>
          </button>
          <button
            disabled={!selectedEmployee}
            onClick={() => setIsAdvanceModalOpen(true)}
            className="h-[26px] px-2.5 bg-[#aa3531] hover:bg-[#891c1d] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Registrar Anticipo / Vale</span>
          </button>
          <button
            disabled={!selectedEmployee}
            onClick={() => selectedEmployee && onViewAccount(selectedEmployee)}
            className="h-[26px] px-2.5 bg-[#1b365d] hover:bg-[#284877] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <FileText className="w-3.5 h-3.5 text-[#aec7f7]" />
            <span>Ver Cuenta / Consumos</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-[#74777f] shadow-sm flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
          <div className="flex items-center gap-2">
            <UserCheck className="w-3.5 h-3.5 text-[#aec7f7]" />
            <span>PADRÓN DE PERSONAL, LEGAJOS Y VALES DE ANTICIPO</span>
          </div>
          <div className="font-mono text-[11px] text-[#d4e3ff]">
            {filteredEmployees.length} EMPLEADOS REGISTRADOS
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-auto">
          <table className="w-full text-left border-collapse select-none text-[12px]">
            <thead className="sticky top-0 bg-[#e5e8ec] text-[#181c1f] font-bold text-[11px] border-b border-[#74777f]">
              <tr className="h-[24px]">
                <th className="w-[60px] px-2 border-r border-[#c4c6cf]">CÓDIGO</th>
                <th className="px-2 border-r border-[#c4c6cf]">NOMBRE COMPLETO</th>
                <th className="w-[80px] px-2 border-r border-[#c4c6cf]">LEGAJO</th>
                <th className="w-[110px] px-2 border-r border-[#c4c6cf]">DNI</th>
                <th className="w-[100px] px-2 border-r border-[#c4c6cf]">SUCURSAL</th>
                <th className="w-[110px] px-2 border-r border-[#c4c6cf]">ROL / PUESTO</th>
                <th className="w-[90px] px-2 border-r border-[#c4c6cf]">TURNO</th>
                <th className="w-[110px] px-2 text-right border-r border-[#c4c6cf]">LÍMITE VALES</th>
                <th className="w-[80px] px-2 text-center border-r border-[#c4c6cf]">DESC. %</th>
                <th className="w-[120px] px-2 text-right border-r border-[#c4c6cf] bg-[#e0e3e7]">
                  SALDO ADEUDADO
                </th>
                <th className="w-[70px] px-1 text-center">ESTADO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ebeef2]">
              {filteredEmployees.map((emp, idx) => {
                const isSelected = emp.code === selectedEmployeeCode;

                return (
                  <tr
                    key={emp.code}
                    onClick={() => setSelectedEmployeeCode(emp.code)}
                    onDoubleClick={() => onViewAccount(emp)}
                    className={`h-[23px] cursor-pointer ${
                      isSelected
                        ? 'bg-[#002046] text-white font-bold'
                        : idx % 2 === 0
                        ? 'bg-white hover:bg-[#e5e8ec]'
                        : 'bg-[#f1f4f8] hover:bg-[#e5e8ec]'
                    }`}
                  >
                    <td className="px-2 font-mono text-[11px] border-r border-[#c4c6cf]">
                      {emp.code}
                    </td>
                    <td className="px-2 border-r border-[#c4c6cf] truncate max-w-[240px]">
                      {emp.name}
                    </td>
                    <td className="px-2 font-mono font-bold text-[11px] border-r border-[#c4c6cf]">
                      {emp.legajo}
                    </td>
                    <td className="px-2 font-mono text-[11px] border-r border-[#c4c6cf]">
                      <span className={isSelected ? 'text-white' : 'text-[#44474e]'}>{emp.dni}</span>
                    </td>
                    <td className="px-2 font-bold text-[11px] border-r border-[#c4c6cf]">
                      <span
                        className={`px-1 text-[10px] ${
                          isSelected
                            ? 'bg-[#1b365d]'
                            : emp.branch === 'NECO 1'
                            ? 'bg-[#d6e3ff] text-[#002046]'
                            : 'bg-[#ebeef2] text-[#44474e]'
                        }`}
                      >
                        {emp.branch}
                      </span>
                    </td>
                    <td className="px-2 text-[11px] border-r border-[#c4c6cf]">{emp.role}</td>
                    <td className="px-2 text-[11px] border-r border-[#c4c6cf]">{emp.shift}</td>
                    <td className="text-right font-mono text-[11px] px-2 border-r border-[#c4c6cf]">
                      {formatCurrency(emp.creditLimit)}
                    </td>
                    <td className="text-center font-mono text-[11px] px-2 border-r border-[#c4c6cf]">
                      {emp.discountPercent ? `${emp.discountPercent}%` : '-'}
                    </td>
                    <td
                      className={`text-right font-mono font-bold text-[12px] px-2 border-r border-[#c4c6cf] ${
                        emp.currentBalance > 0
                          ? isSelected
                            ? 'text-[#ffdad6]'
                            : 'text-[#aa3531]'
                          : isSelected
                          ? 'text-[#d6e3ff]'
                          : 'text-[#002046]'
                      }`}
                    >
                      {formatCurrency(emp.currentBalance)}
                    </td>
                    <td className="text-center px-1">
                      <span
                        className={`text-[9px] px-1 font-bold ${
                          emp.active
                            ? isSelected
                              ? 'bg-[#1b365d] text-white'
                              : 'bg-[#d6e3ff] text-[#002046]'
                            : 'bg-[#ffdad6] text-[#aa3531]'
                        }`}
                      >
                        {emp.active ? 'ACTIVO' : 'BAJA'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Edit or Create Employee */}
      <WindowsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isNewMode ? 'NUEVO EMPLEADO' : `EDITAR EMPLEADO: ${editingEmployee?.name}`}
        maxWidth="max-w-lg"
      >
        {editingEmployee && (
          <div className="flex flex-col gap-2 p-1 text-[12px]">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Código:</label>
                <input
                  type="text"
                  value={editingEmployee.code}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, code: e.target.value })}
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold"
                />
              </div>
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Legajo:</label>
                <input
                  type="text"
                  value={editingEmployee.legajo}
                  onChange={(e) =>
                    setEditingEmployee({ ...editingEmployee, legajo: e.target.value })
                  }
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-[#181c1f] block mb-0.5">Nombre Completo:</label>
              <input
                type="text"
                value={editingEmployee.name}
                onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">DNI:</label>
                <input
                  type="text"
                  value={editingEmployee.dni}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, dni: e.target.value })}
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Teléfono:</label>
                <input
                  type="text"
                  value={editingEmployee.phone}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Sucursal:</label>
                <select
                  value={editingEmployee.branch}
                  onChange={(e) =>
                    setEditingEmployee({ ...editingEmployee, branch: e.target.value as any })
                  }
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
                >
                  <option value="NECO 1">NECO 1</option>
                  <option value="NECO 2">NECO 2</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Rol:</label>
                <select
                  value={editingEmployee.role}
                  onChange={(e) =>
                    setEditingEmployee({ ...editingEmployee, role: e.target.value as any })
                  }
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
                >
                  <option value="CAJERO">CAJERO</option>
                  <option value="ENCARGADO">ENCARGADO</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SUPERADMIN">SUPERADMIN</option>
                  <option value="CONSULTA">CONSULTA</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Turno:</label>
                <select
                  value={editingEmployee.shift}
                  onChange={(e) =>
                    setEditingEmployee({ ...editingEmployee, shift: e.target.value as any })
                  }
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
                >
                  <option value="MAÑANA">MAÑANA</option>
                  <option value="TARDE">TARDE</option>
                  <option value="COMPLETO">COMPLETO</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-[#002046] block mb-0.5">Límite para Vales ($):</label>
                <input
                  type="number"
                  value={editingEmployee.creditLimit}
                  onChange={(e) =>
                    setEditingEmployee({
                      ...editingEmployee,
                      creditLimit: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold text-[#002046]"
                />
              </div>
              <div>
                <label className="font-bold text-[#00522c] block mb-0.5">Descuento (%) :</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editingEmployee.discountPercent || ''}
                  onChange={(e) =>
                    setEditingEmployee({
                      ...editingEmployee,
                      discountPercent: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold text-[#00522c]"
                  placeholder="Ej: 10"
                />
              </div>
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
                <span>Guardar Empleado</span>
              </button>
            </div>
          </div>
        )}
      </WindowsModal>

      {/* Modal: Advance / Vale */}
      <WindowsModal
        isOpen={isAdvanceModalOpen}
        onClose={() => setIsAdvanceModalOpen(false)}
        title={`EMISIÓN DE VALE DE ANTICIPO POR CAJA - ${selectedEmployee?.name}`}
        maxWidth="max-w-md"
      >
        <div className="flex flex-col gap-2 p-1 text-[12px]">
          <div className="bg-white p-2 border border-[#c4c6cf]">
            <span className="font-bold text-[#002046]">{selectedEmployee?.name}</span>
            <div className="text-[11px] text-[#44474e]">
              Legajo: {selectedEmployee?.legajo} | Saldo Vales actual:{' '}
              <strong className="text-[#aa3531] font-mono">
                {formatCurrency(selectedEmployee?.currentBalance || 0)}
              </strong>
            </div>
          </div>

          <div>
            <label className="font-bold text-[#002046] block mb-0.5">Importe del Vale ($):</label>
            <input
              type="number"
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(e.target.value)}
              className="w-full h-[28px] px-2 bg-white border border-[#74777f] font-mono text-[15px] font-black text-[#002046]"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#c4c6cf]">
            <button
              onClick={() => setIsAdvanceModalOpen(false)}
              className="h-[26px] px-3 bg-[#ebeef2] border border-[#74777f] text-[11px] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmAdvance}
              className="h-[26px] px-4 bg-[#aa3531] hover:bg-[#891c1d] text-white font-bold text-[11px] cursor-pointer"
            >
              Emitir Vale & Abrir Gaveta
            </button>
          </div>
        </div>
      </WindowsModal>
    </div>
  );
};
