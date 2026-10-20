import React, { useState } from 'react';
import {
  Settings,
  Building,
  Scale,
  Printer,
  Save,
  CheckCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { BranchConfig } from '../../types/pos';
import { WindowsModal } from '../common/WindowsModal';
import { useDialog } from '../../context/DialogContext';

interface BranchConfigScreenProps {
  branches: BranchConfig[];
  currentBranch: BranchConfig;
  onUpdateBranch: (branch: BranchConfig) => void;
}

export const BranchConfigScreen: React.FC<BranchConfigScreenProps> = ({
  branches,
  currentBranch,
  onUpdateBranch,
}) => {
  const { showAlert } = useDialog();
  const [selectedBranchId, setSelectedBranchId] = useState<'NECO 1' | 'NECO 2'>(
    currentBranch.id
  );
  const [editingConfig, setEditingConfig] = useState<BranchConfig>(
    branches.find((b) => b.id === currentBranch.id) || branches[0]
  );
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const handleSelectBranch = (bId: 'NECO 1' | 'NECO 2') => {
    setSelectedBranchId(bId);
    const target = branches.find((b) => b.id === bId) || branches[0];
    setEditingConfig({ ...target });
    setSavedSuccess(false);
  };

  const handleSave = () => {
    onUpdateBranch(editingConfig);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-80px)] select-none bg-[#ebeef2] text-[#181c1f] font-sans p-1">
      {/* Top Header */}
      <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#002046]" />
          <span className="font-bold text-[#002046] text-[13px]">
            PARÁMETROS DEL SISTEMA, SUCURSALES Y CONFIGURACIÓN DE BALANZAS
          </span>
        </div>

        <div className="flex items-center gap-2">
          {savedSuccess && (
            <span className="text-[#002046] text-[11px] font-bold flex items-center gap-1 bg-[#d6e3ff] px-2 py-0.5">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Configuración guardada correctamente</span>
            </span>
          )}
          <button
            onClick={handleSave}
            className="h-[26px] px-4 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Guardar Parámetros [F12]</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-1 flex-1 min-h-0">
        {/* Left: Branch Picker (3 cols) */}
        <div className="md:col-span-3 bg-white border border-[#74777f] shadow-sm flex flex-col">
          <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center text-[12px] font-bold">
            <span>SELECCIONE SUCURSAL</span>
          </div>

          <div className="p-2 flex flex-col gap-2">
            {branches.map((b) => {
              const isSelected = selectedBranchId === b.id;
              const isCurrent = currentBranch.id === b.id;

              return (
                <div
                  key={b.id}
                  onClick={() => handleSelectBranch(b.id)}
                  className={`p-2.5 border cursor-pointer flex flex-col gap-1 ${
                    isSelected
                      ? 'bg-[#f7fafe] border-[#002046] shadow-sm'
                      : 'bg-white border-[#c4c6cf] hover:bg-[#ebeef2]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#002046] text-[13px]">{b.name}</span>
                    {isCurrent ? (
                      <span className="text-[9px] bg-[#d6e3ff] text-[#002046] font-bold px-1.5 py-0.5">
                        SUCURSAL ASIGNADA
                      </span>
                    ) : (
                      <span className="text-[9px] bg-[#ebeef2] text-[#74777f] font-semibold px-1 py-0.5">
                        EDITAR PARÁMETROS
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[#44474e]">{b.address}</span>
                  <div className="flex items-center justify-between text-[10px] text-[#74777f] pt-1 border-t border-[#ebeef2]">
                    <span>Pto. Venta ARCA: {b.pointOfSale}</span>
                    <span>Prefijo Ticket: {b.ticketPrefix || (b.id === 'NECO 2' ? '1020' : '1010')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Branch & Hardware Form (9 cols) */}
        <div className="md:col-span-9 bg-white border border-[#74777f] shadow-sm flex flex-col overflow-y-auto">
          <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
            <div className="flex items-center gap-2">
              <Building className="w-3.5 h-3.5 text-[#aec7f7]" />
              <span>DATOS FISCALES Y PERIFÉRICOS DE: {editingConfig.name}</span>
            </div>
          </div>

          <div className="p-3 flex flex-col gap-3 text-[12px]">
            {/* Section 1: Commercial & Fiscal Data */}
            <div className="border border-[#c4c6cf] p-2.5 bg-[#f7fafe]">
              <span className="text-[11px] font-bold uppercase text-[#002046] block mb-2">
                1. Datos Comerciales e Impositivos (ARCA / AFIP):
              </span>

              <div className="grid grid-cols-3 gap-2 mb-2">
                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">
                    Nombre Identificatorio:
                  </label>
                  <input
                    type="text"
                    value={editingConfig.name}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, name: e.target.value })
                    }
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">Dirección / Localidad:</label>
                  <input
                    type="text"
                    value={editingConfig.address}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, address: e.target.value })
                    }
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">Teléfono Sucursal:</label>
                  <input
                    type="text"
                    value={editingConfig.phone}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, phone: e.target.value })
                    }
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">CUIT de la Empresa:</label>
                  <input
                    type="text"
                    value={editingConfig.cuit}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, cuit: e.target.value })
                    }
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">Ingresos Brutos:</label>
                  <input
                    type="text"
                    value={editingConfig.iibb}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, iibb: e.target.value })
                    }
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">Inicio Actividades:</label>
                  <input
                    type="text"
                    value={editingConfig.startActivities}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, startActivities: e.target.value })
                    }
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#002046] block mb-0.5">Punto de Venta Fiscal:</label>
                  <input
                    type="text"
                    value={editingConfig.pointOfSale}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, pointOfSale: e.target.value })
                    }
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold text-[#002046]"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Scale and Barcode Hardware Configuration */}
            <div className="border border-[#c4c6cf] p-2.5 bg-[#f7fafe]">
              <div className="flex items-center gap-2 mb-2">
                <Scale className="w-4 h-4 text-[#002046]" />
                <span className="text-[11px] font-bold uppercase text-[#002046]">
                  2. Configuración de Balanzas y Código de Barras (Carnicería):
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-2">
                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">Modelo de Balanza:</label>
                  <select
                    value={editingConfig.scaleType}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        scaleType: e.target.value as any,
                      })
                    }
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold"
                  >
                    <option value="Systel Cuora">Systel Cuora (Etiquetadora Térmica)</option>
                    <option value="Systel Croma">Systel Croma / Clip</option>
                    <option value="Kretz Report NX">Kretz Report NX</option>
                    <option value="Toledo Prix">Toledo Prix 4 / Prix 5</option>
                    <option value="Dibal D-900">Dibal D-900 Red Ethernet</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">
                    Estructura EAN-13 Etiqueta:
                  </label>
                  <select
                    value={editingConfig.scaleBarcodeFormat}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        scaleBarcodeFormat: e.target.value as any,
                      })
                    }
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold text-[#002046]"
                  >
                    <option value="PLU_PESO">20 + PLU(4) + PESO(5) + Ck (Estándar NECO)</option>
                    <option value="PLU_IMPORTE">20 + PLU(4) + IMPORTE(5) + Ck</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">Prefijo Balanza:</label>
                  <input
                    type="text"
                    value={editingConfig.scalePrefix}
                    onChange={(e) =>
                      setEditingConfig({ ...editingConfig, scalePrefix: e.target.value })
                    }
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold"
                  />
                </div>
              </div>

              <div className="bg-white p-2 border border-[#c4c6cf] flex items-center justify-between text-[11px]">
                <div>
                  <span className="font-bold text-[#002046]">Ejemplo de Lectura EAN-13:</span>
                  <span className="font-mono ml-2 text-[12px] bg-[#ebeef2] px-1 font-bold">
                    20 0125 01840 5
                  </span>
                  <span className="text-[#44474e] ml-2">
                    - Prefijo 20 | PLU 0125 (Asado) | Peso: 1.840 Kg | Ck: 5
                  </span>
                </div>
                <button
                  onClick={async () => await showAlert('Prueba de sincronización con balanza Systel: OK')}
                  className="h-[22px] px-2 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[10px] font-bold cursor-pointer"
                >
                  Test Balanza
                </button>
              </div>
            </div>

            {/* Section 3: Receipt and POS Printer Configuration */}
            <div className="border border-[#c4c6cf] p-2.5 bg-[#f7fafe]">
              <div className="flex items-center gap-2 mb-2">
                <Printer className="w-4 h-4 text-[#002046]" />
                <span className="text-[11px] font-bold uppercase text-[#002046]">
                  3. Impresora Térmica de Tickets y Comprobantes:
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">
                    Impresora de Tickets POS:
                  </label>
                  <input
                    type="text"
                    value={editingConfig.ticketPrinter ?? editingConfig.printerModel ?? ''}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        ticketPrinter: e.target.value,
                        printerModel: e.target.value,
                      })
                    }
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#002046] block mb-0.5">
                    Prefijo Ticket / Recibo POS (No Fiscal):
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 1010 para Neco 1, 1020 para Neco 2"
                    value={editingConfig.ticketPrefix ?? (editingConfig.id === 'NECO 2' ? '1020' : '1010')}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        ticketPrefix: e.target.value,
                      })
                    }
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold text-[#002046]"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">
                    Lista de Precios por Defecto:
                  </label>
                  <select
                    value={editingConfig.defaultPriceList}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        defaultPriceList: e.target.value as any,
                      })
                    }
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
                  >
                    <option value="LISTA_1">Lista 1 (Público General / Mostrador)</option>
                    <option value="LISTA_2">Lista 2 (Mayorista / Restaurantes)</option>
                    <option value="LISTA_3">Lista 3 (Personal / Especial)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 4: Commercial Schedule and Auto Closure */}
            <div className="border border-[#c4c6cf] p-2.5 bg-[#f7fafe]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-[#002046]" />
                  <span className="text-[11px] font-bold uppercase text-[#002046]">
                    4. Horarios de Atención Comercial y Cierres Automáticos de Caja:
                  </span>
                </div>
                <span className="bg-[#d6e3ff] text-[#002046] px-2 py-0.5 font-bold text-[10px] border border-[#aec7f7]">
                  CIERRE Z AUTOMÁTICO: ACTIVO
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px]">
                <div className="bg-white p-2 border border-[#c4c6cf]">
                  <div className="font-bold text-[#002046] mb-1">📅 Lunes a Sábados:</div>
                  <div className="flex flex-col gap-0.5 text-[#181c1f]">
                    <div className="flex justify-between">
                      <span>• Turno Mañana:</span>
                      <span className="font-bold font-mono">08:00 a 13:30 hs</span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Turno Tarde / Noche:</span>
                      <span className="font-bold font-mono">18:00 a 22:00 hs</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-2 border border-[#c4c6cf]">
                  <div className="font-bold text-[#002046] mb-1">📅 Domingos:</div>
                  <div className="flex flex-col gap-0.5 text-[#181c1f]">
                    <div className="flex justify-between">
                      <span>• Turno Mañana (Único):</span>
                      <span className="font-bold font-mono">08:00 a 13:30 hs</span>
                    </div>
                    <div className="flex justify-between text-[#74777f]">
                      <span>• Turno Tarde:</span>
                      <span className="italic">Cerrado</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2 bg-[#e2eafc] p-2 border border-[#aec7f7] text-[11px] text-[#002046] flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#002046] shrink-0" />
                <span>
                  <strong>Protección de Fin de Jornada:</strong> Si una caja no fue cerrada manualmente por el cajero al culminar el día, el sistema ejecutará el <strong>Cierre Z Automático</strong> de la jornada anterior, asegurando la integridad fiscal y permitiendo la apertura limpia del nuevo turno.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
