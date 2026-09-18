import React, { useState } from 'react';
import { Shield, Users, Plus, Edit2, Check, X, Key, Trash2 } from 'lucide-react';
import { UserAccount, RoleType } from '../../types/pos';
import { WindowsModal } from '../common/WindowsModal';
import { useDialog } from '../../context/DialogContext';

interface UsersRolesScreenProps {
  users: UserAccount[];
  onUpdateUser: (u: UserAccount) => void;
  onAddUser: (u: UserAccount) => void;
  onDeleteUser?: (id: string) => void;
}

const ALL_PERMISSIONS = [
  { id: 'canApplyDiscounts', label: 'Aplicar Descuentos manuales' },
  { id: 'canCancelTickets', label: 'Anular Tickets ya impresos' },
  { id: 'canModifyPrices', label: 'Modificar Precios de lista' },
  { id: 'canViewCosts', label: 'Ver Costos y Márgenes' },
  { id: 'canOpenDrawerWithoutSale', label: 'Abrir cajón sin venta' },
  { id: 'canViewReports', label: 'Ver Reportes y Estadísticas' },
  { id: 'canPerformClosureZ', label: 'Realizar Cierres Z fiscales' },
] as const;

export const UsersRolesScreen: React.FC<UsersRolesScreenProps> = ({
  users,
  onUpdateUser,
  onAddUser,
  onDeleteUser,
}) => {
  const { showAlert, showConfirm } = useDialog();
  const [selectedUsername, setSelectedUsername] = useState<string>(users[0]?.username || '');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isNewMode, setIsNewMode] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const selectedUser = users.find((u) => u.username === selectedUsername) || users[0];

  const handleOpenEdit = (user: UserAccount) => {
    setIsNewMode(false);
    setShowPassword(false);
    setEditingUser({ ...user, permissions: { ...user.permissions } });
    setIsModalOpen(true);
  };

  const handleOpenNew = () => {
    setIsNewMode(true);
    setShowPassword(false);
    setEditingUser({
      id: `usr-${Date.now()}`,
      username: '',
      email: '',
      fullName: '',
      password: '',
      role: 'CAJERO',
      branch: 'NECO 1',
      active: true,
      permissions: {
        canApplyDiscounts: false,
        canCancelTickets: false,
        canModifyPrices: false,
        canViewCosts: false,
        canOpenDrawerWithoutSale: false,
        canViewReports: false,
        canPerformClosureZ: true,
      },
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (userToDelete: UserAccount) => {
    if (!onDeleteUser) return;
    const isConfirmed = await showConfirm(
      `¿Está seguro de que desea eliminar el usuario "${userToDelete.fullName}" (${userToDelete.username})?`
    );
    if (isConfirmed) {
      onDeleteUser(userToDelete.id);
      setIsModalOpen(false);
      await showAlert(`El usuario "${userToDelete.fullName}" ha sido eliminado.`);
    }
  };

  const handleSave = async () => {
    if (!editingUser || !editingUser.username.trim() || !editingUser.fullName.trim()) {
      await showAlert('Nombre de usuario y nombre completo son obligatorios.');
      return;
    }

    const finalEmail = editingUser.email?.trim() || 
      (editingUser.username.includes('@') ? editingUser.username : `${editingUser.username.trim()}@necopos.com`);

    const userToSave: UserAccount = {
      ...editingUser,
      username: editingUser.username.trim(),
      email: finalEmail,
    };

    if (isNewMode) {
      onAddUser(userToSave);
    } else {
      onUpdateUser(userToSave);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-80px)] select-none bg-[#ebeef2] text-[#181c1f] font-sans p-1">
      {/* Top Header & Actions */}
      <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#002046]" />
          <span className="font-bold text-[#002046] text-[13px]">
            SEGURIDAD: GESTIÓN DE USUARIOS, OPERADORES Y MATRIZ DE PERMISOS
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenNew}
            className="h-[26px] px-3 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Nuevo Usuario</span>
          </button>
          <button
            disabled={!selectedUser}
            onClick={() => selectedUser && handleOpenEdit(selectedUser)}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Edit2 className="w-3 h-3 text-[#002046]" />
            <span>Editar Permisos</span>
          </button>
          <button
            disabled={!selectedUser}
            onClick={() => selectedUser && handleDelete(selectedUser)}
            className="h-[26px] px-2.5 bg-[#aa3531] hover:bg-[#8b2926] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
            title="Eliminar usuario del sistema"
          >
            <Trash2 className="w-3 h-3 text-white" />
            <span>Eliminar Usuario</span>
          </button>
        </div>
      </div>

      {/* Main Split View: Users Table on Left, Live Permission Matrix on Right */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-1 flex-1 min-h-0">
        {/* Left: Users Table (7 cols) */}
        <div className="md:col-span-7 bg-white border border-[#74777f] shadow-sm flex flex-col overflow-hidden">
          <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-[#aec7f7]" />
              <span>CUENTAS DE ACCESO AL SISTEMA</span>
            </div>
            <span className="font-mono text-[11px] text-[#d4e3ff]">{users.length} USUARIOS</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse select-none text-[12px]">
              <thead className="sticky top-0 bg-[#e5e8ec] text-[#181c1f] font-bold text-[11px] border-b border-[#74777f]">
                <tr className="h-[24px]">
                  <th className="w-[100px] px-2 border-r border-[#c4c6cf]">USUARIO</th>
                  <th className="px-2 border-r border-[#c4c6cf]">NOMBRE Y APELLIDO</th>
                  <th className="w-[110px] px-2 border-r border-[#c4c6cf]">ROL ASIGNADO</th>
                  <th className="w-[85px] px-2 border-r border-[#c4c6cf]">SUCURSAL</th>
                  <th className="w-[70px] px-1 text-center">ESTADO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ebeef2]">
                {users.map((u, idx) => {
                  const isSelected = selectedUser?.username === u.username;

                  return (
                    <tr
                      key={u.username}
                      onClick={() => setSelectedUsername(u.username)}
                      onDoubleClick={() => handleOpenEdit(u)}
                      className={`h-[26px] cursor-pointer ${
                        isSelected
                          ? 'bg-[#002046] text-white font-bold'
                          : idx % 2 === 0
                          ? 'bg-white hover:bg-[#e5e8ec]'
                          : 'bg-[#f1f4f8] hover:bg-[#e5e8ec]'
                      }`}
                    >
                      <td className="px-2 font-mono text-[12px] font-bold border-r border-[#c4c6cf]">
                        {u.username}
                      </td>
                      <td className="px-2 border-r border-[#c4c6cf]">{u.fullName}</td>
                      <td className="px-2 font-bold text-[11px] border-r border-[#c4c6cf]">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] ${
                            isSelected
                              ? 'bg-[#1b365d] text-white'
                              : u.role === 'SUPERADMIN' || u.role === 'ADMIN'
                              ? 'bg-[#ffdad6] text-[#aa3531]'
                              : 'bg-[#d6e3ff] text-[#002046]'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-2 font-mono text-[11px] border-r border-[#c4c6cf]">
                        {u.branch}
                      </td>
                      <td className="text-center px-1">
                        <span
                          className={`text-[9px] px-1 font-bold ${
                            u.active
                              ? isSelected
                                ? 'text-white'
                                : 'text-[#002046]'
                              : 'text-[#aa3531]'
                          }`}
                        >
                          {u.active ? 'ACTIVO' : 'BLOQUEADO'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Selected User's Permissions Matrix (5 cols) */}
        <div className="md:col-span-5 bg-white border border-[#74777f] shadow-sm flex flex-col overflow-hidden">
          <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
            <div className="flex items-center gap-2">
              <Key className="w-3.5 h-3.5 text-[#aec7f7]" />
              <span>PERMISOS ASIGNADOS: {selectedUser?.fullName}</span>
            </div>
          </div>

          <div className="p-3 flex flex-col gap-2 overflow-y-auto">
            <div className="bg-[#f7fafe] p-2 border border-[#c4c6cf] text-[11px] flex justify-between items-center">
              <div>
                <span className="text-[#44474e] block">Rol del perfil:</span>
                <span className="font-bold text-[#002046] text-[13px]">{selectedUser?.role}</span>
              </div>
              <button
                onClick={() => selectedUser && handleOpenEdit(selectedUser)}
                className="h-[22px] px-2 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[10px] font-bold cursor-pointer"
              >
                Modificar Permisos
              </button>
            </div>

            <span className="text-[11px] font-bold text-[#44474e] uppercase mt-1">
              Matriz de Privilegios Operativos:
            </span>

            <div className="flex flex-col divide-y divide-[#ebeef2] border border-[#c4c6cf]">
              {ALL_PERMISSIONS.map((p) => {
                const isGranted = selectedUser?.permissions[p.id as keyof typeof selectedUser.permissions];

                return (
                  <div
                    key={p.id}
                    className="p-2 flex items-center justify-between text-[12px] bg-white hover:bg-[#f7fafe]"
                  >
                    <span className="font-medium text-[#181c1f]">{p.label}</span>
                    {isGranted ? (
                      <span className="flex items-center gap-1 font-bold text-[#002046] text-[11px] bg-[#d6e3ff] px-2 py-0.5">
                        <Check className="w-3 h-3 text-[#002046]" />
                        <span>HABILITADO</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 font-bold text-[#aa3531] text-[11px] bg-[#ffdad6] px-2 py-0.5">
                        <X className="w-3 h-3 text-[#aa3531]" />
                        <span>DENEGADO</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Edit User & Permissions */}
      <WindowsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isNewMode ? 'CREAR NUEVO USUARIO DE SISTEMA' : `CONFIGURAR USUARIO: ${editingUser?.username}`}
        maxWidth="max-w-lg"
      >
        {editingUser && (
          <div className="flex flex-col gap-2 p-1 text-[12px]">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Nombre de Usuario:</label>
                <input
                  type="text"
                  value={editingUser.username}
                  onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                  placeholder="ej: necovilla"
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold"
                />
              </div>
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Nombre y Apellido:</label>
                <input
                  type="text"
                  value={editingUser.fullName}
                  onChange={(e) => setEditingUser({ ...editingUser, fullName: e.target.value })}
                  placeholder="ej: Juan Pérez"
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-[#181c1f] block mb-0.5">
                Correo Electrónico (Email de Acceso):
              </label>
              <input
                type="email"
                value={editingUser.email || ''}
                onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                placeholder="ej: usuario@necopos.com"
                className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold text-[#002046]"
              />
            </div>

            <div>
              <label className="font-bold text-[#181c1f] block mb-0.5">
                Clave de Acceso / Contraseña:
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={editingUser.password || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                  placeholder="Ingrese la contraseña de acceso..."
                  className="w-full h-[26px] pl-2 pr-8 bg-white border border-[#74777f] font-mono font-bold text-[#002046]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1 text-[#74777f] hover:text-[#002046] text-[10px] font-bold"
                  title={showPassword ? 'Ocultar clave' : 'Mostrar clave'}
                >
                  {showPassword ? 'OCULTAR' : 'VER'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Rol:</label>
                <select
                  value={editingUser.role}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, role: e.target.value as RoleType })
                  }
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
                >
                  <option value="CAJERO">Cajero</option>
                  <option value="ENCARGADO">Encargado de Sucursal</option>
                  <option value="ADMIN">Administrador</option>
                  <option value="SUPERADMIN">Superadmin</option>
                  <option value="CONSULTA">Solo Consulta</option>
                </select>
                {editingUser.role === 'CAJERO' && (
                  <span className="text-[10px] text-[#555] block mt-0.5 leading-tight">
                    * Bloqueado: Configuración de usuarios, sucursales, facturación/recibos y ARCA técnica. Solo emite venta y factura manual.
                  </span>
                )}
              </div>
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Sucursal Asignada al Usuario:</label>
                <select
                  value={editingUser.branch}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, branch: e.target.value as any })
                  }
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold text-[#002046]"
                >
                  <option value="NECO 1">NECO 1 (Central)</option>
                  <option value="NECO 2">NECO 2 (Villa Saavedra)</option>
                </select>
                <span className="text-[10px] text-[#74777f] italic block mt-0.5">
                  El usuario operará exclusivamente en esta sucursal.
                </span>
              </div>
            </div>

            <div className="border-t border-[#c4c6cf] pt-2 mt-1">
              <span className="font-bold text-[#002046] block mb-1">
                Permisos Específicos para este Usuario:
              </span>
              <div className="grid grid-cols-2 gap-1.5 max-h-[180px] overflow-y-auto p-1 bg-[#f7fafe] border border-[#c4c6cf]">
                {ALL_PERMISSIONS.map((perm) => (
                  <label
                    key={perm.id}
                    className="flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={!!editingUser.permissions[perm.id as keyof typeof editingUser.permissions]}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          permissions: {
                            ...editingUser.permissions,
                            [perm.id]: e.target.checked,
                          },
                        })
                      }
                      className="cursor-pointer"
                    />
                    <span>{perm.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-[#c4c6cf]">
              <div>
                {!isNewMode && onDeleteUser && (
                  <button
                    type="button"
                    onClick={() => handleDelete(editingUser)}
                    className="h-[26px] px-3 bg-[#ffdad6] hover:bg-[#ffb4ab] border border-[#ba1a1a] text-[#aa3531] font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar Usuario</span>
                  </button>
                )}
              </div>
              <div className="flex gap-2">
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
                  className="h-[26px] px-4 bg-[#002046] text-white font-bold text-[11px] cursor-pointer"
                >
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        )}
      </WindowsModal>
    </div>
  );
};
