import React, { useState, useRef } from 'react';
import {
  UserPlus,
  Search,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Building,
  ShieldCheck,
  Save,
  X,
  Info,
} from 'lucide-react';
import { Customer } from '../../types/pos';
import { WindowsModal } from '../common/WindowsModal';
import { arcaService } from '../../services/arcaService';
import { useDialog } from '../../context/DialogContext';

interface CustomerArcaQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCustomer: (customer: Customer) => Promise<void>;
  onCustomerCreatedAndSelected: (customer: Customer) => void;
  existingCount?: number;
  customers?: Customer[];
  arcaConfig?: any;
}

export const CustomerArcaQuickModal: React.FC<CustomerArcaQuickModalProps> = ({
  isOpen,
  onClose,
  onSaveCustomer,
  onCustomerCreatedAndSelected,
  existingCount = 0,
  customers = [],
  arcaConfig,
}) => {
  const { showAlert } = useDialog();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [queryDoc, setQueryDoc] = useState<string>('');
  const [isSearchingArca, setIsSearchingArca] = useState<boolean>(false);
  const [arcaSuccessMsg, setArcaSuccessMsg] = useState<string | null>(null);
  const [arcaErrorMsg, setArcaErrorMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState<Customer>(() => ({
    code: `CLI-${(existingCount + 101).toString().padStart(4, '0')}`,
    name: '',
    dniCuit: '',
    phone: '',
    address: '',
    vatCondition: 'Cons. Final',
    creditLimit: 0,
    currentBalance: 0,
    status: 'AL_DIA',
    notes: '',
  }));
  const [isSaving, setIsSaving] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleLookupArca = async () => {
    const clean = queryDoc.trim().replace(/\D/g, '');
    if (!clean) {
      setArcaErrorMsg('Por favor ingrese un CUIT (11 dígitos) o DNI (7-8 dígitos).');
      return;
    }
    if (clean.length < 7 || clean.length > 11) {
      setArcaErrorMsg('El documento debe tener entre 7 y 11 dígitos.');
      return;
    }

    // 1. Check if customer already exists in local database
    const existing = customers.find(
      (c) => c.dniCuit.replace(/\D/g, '') === clean || c.code.toLowerCase() === clean.toLowerCase()
    );
    if (existing) {
      setFormData({
        ...existing,
      });
      setArcaSuccessMsg(
        `✅ Cliente existente en base de datos: ${existing.name} — Domicilio: ${existing.address || 'No registrado'} — Condición: ${existing.vatCondition}`
      );
      setArcaErrorMsg(null);
      return;
    }

    setIsSearchingArca(true);
    setArcaErrorMsg(null);
    setArcaSuccessMsg(null);

    try {
      const res = await arcaService.lookupCuit(clean, arcaConfig);
      if (res.success && res.data) {
        const d = res.data;
        const isCompany = clean.startsWith('30') || clean.startsWith('33') || clean.startsWith('34');
        let mappedVat: Customer['vatCondition'] = isCompany ? 'Resp. Inscripto' : 'Monotributo';
        const raw = (d.vatCondition || '').toLowerCase();

        if (raw.includes('mono')) {
          mappedVat = 'Monotributo';
        } else if (raw.includes('exent')) {
          mappedVat = 'Exento';
        } else if ((raw.includes('inscript') || raw.includes('ri')) && isCompany) {
          mappedVat = 'Resp. Inscripto';
        } else if (raw.includes('final')) {
          mappedVat = 'Cons. Final';
        } else {
          mappedVat = isCompany ? 'Resp. Inscripto' : 'Monotributo';
        }

        setFormData((prev) => ({
          ...prev,
          name: d.name || '',
          dniCuit: d.cuit || clean,
          address: d.address || '',
          phone: d.phone || prev.phone,
          vatCondition: mappedVat,
          notes: d.activity
            ? `Actividad: ${d.activity} | Estado: ${d.state || 'ACTIVO'}`
            : d.state
            ? `Estado ARCA: ${d.state}`
            : '',
        }));

        if (d.name) {
          setArcaSuccessMsg(
            `✅ Padrón ARCA Oficial: ${d.name} — Domicilio: ${d.address || 'No informado'} — Condición: ${mappedVat} (${mappedVat === 'Resp. Inscripto' ? 'Habilitado para Factura A' : 'Factura B'})`
          );
        } else if (res.wsError) {
          const cleanErr = res.wsError
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (_: string, dec: string) => String.fromCharCode(parseInt(dec, 10)));
          setArcaSuccessMsg(
            `CUIT ${d.cuit} válido según Módulo 11. WS ARCA reportó: "${cleanErr}". Ingrese la Razón Social y Domicilio:`
          );
          setTimeout(() => {
            nameInputRef.current?.focus();
          }, 100);
        } else if (res.hasCredentials === false) {
          setArcaSuccessMsg(
            `CUIT ${d.cuit} válido según Módulo 11 AFIP (${mappedVat}). ⚠️ Para autocompletar directo desde ARCA sin escribir, guarde su Certificado (.crt) y Clave en Configuración ARCA. Ingrese la Razón Social y Domicilio:`
          );
          setTimeout(() => {
            nameInputRef.current?.focus();
          }, 100);
        } else {
          setArcaSuccessMsg(
            `CUIT ${d.cuit} válido según Módulo 11 AFIP. Condición asignada: ${mappedVat}. Complete la Razón Social y Domicilio para registrar el cliente.`
          );
          setTimeout(() => {
            nameInputRef.current?.focus();
          }, 100);
        }
      } else {
        setArcaErrorMsg(res.error || 'No se obtuvieron datos fiscales para el documento ingresado.');
      }
    } catch (err: any) {
      setArcaErrorMsg(err.message || 'Error al conectar con el servicio de padrón fiscal.');
    } finally {
      setIsSearchingArca(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      await showAlert('Debe ingresar el Nombre o Razón Social del cliente.');
      return;
    }
    if (!formData.dniCuit.trim()) {
      await showAlert('Debe ingresar el CUIT o DNI del cliente.');
      return;
    }

    if (formData.vatCondition === 'Resp. Inscripto') {
      const clean = formData.dniCuit.replace(/\D/g, '');
      if (clean.length !== 11) {
        await showAlert(
          'Para Responsable Inscripto (Factura A) se requiere un CUIT válido de 11 dígitos.'
        );
        return;
      }
    }

    setIsSaving(true);
    try {
      await onSaveCustomer(formData);
      onCustomerCreatedAndSelected(formData);
      await showAlert(
        `Cliente "${formData.name}" guardado exitosamente y asignado al comprobante.`
      );
      onClose();
    } catch (err: any) {
      await showAlert(`Error al registrar cliente: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <WindowsModal
      isOpen={isOpen}
      onClose={onClose}
      title="ALTA RÁPIDA DE CLIENTE & CONSULTA PADRÓN FISCAL ARCA"
      icon={<ShieldCheck className="w-4 h-4 text-[#aec7f7]" />}
      maxWidth="max-w-2xl"
    >
      <div className="flex flex-col gap-3 p-1 text-[11.5px] select-none text-[#181c1f]">
        {/* ARCA Live Lookup Section */}
        <div className="bg-[#e8f0fe] p-3 border border-[#74777f] flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-[#aec7f7] pb-1.5">
            <div className="flex items-center gap-1.5 font-bold text-[#002046] text-xs">
              <Building className="w-4 h-4 text-[#002046]" />
              <span>CONSULTA OFICIAL EN PADRÓN ARCA / AFIP:</span>
            </div>
            <span className="text-[10px] text-[#44474e] font-semibold">
              Completa automáticamente razón social y condición IVA
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center border border-[#74777f] bg-white">
              <span className="bg-[#f0f2f5] px-2.5 py-1 text-[11px] font-mono font-bold text-[#44474e] border-r border-[#74777f]">
                CUIT / CUIL / DNI:
              </span>
              <input
                type="text"
                value={queryDoc}
                onChange={(e) => setQueryDoc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLookupArca();
                  }
                }}
                placeholder="Ej. 20255065166 o 30714892019"
                className="w-full px-2 py-1 font-mono font-bold text-[#002046] text-[12px] outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleLookupArca}
              disabled={isSearchingArca || !queryDoc.trim()}
              className="h-[28px] px-3.5 bg-[#002046] hover:bg-[#1b365d] text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSearchingArca ? 'animate-spin' : ''}`} />
              <span>{isSearchingArca ? 'Consultando...' : 'Consultar ARCA'}</span>
            </button>
          </div>

          {arcaSuccessMsg && (
            <div className="bg-[#e6f4ea] text-[#137333] border border-[#ceead6] p-2 flex items-center gap-2 text-[11px] font-medium">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{arcaSuccessMsg}</span>
            </div>
          )}

          {arcaErrorMsg && (
            <div className="bg-[#fce8e6] text-[#c5221f] border border-[#fad2cf] p-2 flex items-center gap-2 text-[11px]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{arcaErrorMsg}</span>
            </div>
          )}
        </div>

        {/* Customer Form */}
        <form onSubmit={handleSave} className="flex flex-col gap-2.5">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-bold text-[#002046] block mb-0.5">Código Asignado:</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full h-[26px] px-2 bg-[#f0f2f5] border border-[#74777f] font-mono font-bold text-[#002046]"
                required
              />
            </div>

            <div className="col-span-2">
              <label className="font-bold text-[#002046] block mb-0.5">
                CUIT / DNI Fiscal:
              </label>
              <input
                type="text"
                value={formData.dniCuit}
                onChange={(e) => setFormData({ ...formData, dniCuit: e.target.value })}
                placeholder="20-xxxxxxxx-x"
                className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold text-[#002046]"
                required
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-[#002046] block mb-0.5">
              Razón Social o Nombre Completo:
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej. Razón Social o Nombre y Apellido"
              className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold text-[#002046]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-[#002046] block mb-0.5">
                Condición frente al IVA:
              </label>
              <select
                value={formData.vatCondition}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    vatCondition: e.target.value as any,
                  })
                }
                className="w-full h-[26px] px-2 bg-white border border-[#002046] font-bold text-[#002046]"
              >
                <option value="Cons. Final">Consumidor Final (Factura B)</option>
                <option value="Resp. Inscripto">Responsable Inscripto (Factura A)</option>
                <option value="Monotributo">Monotributo (Factura B)</option>
                <option value="Exento">Exento de IVA (Factura B)</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-[#002046] block mb-0.5">
                Teléfono de Contacto: <span className="text-[#74777f] font-normal text-[10px]">(Opcional)</span>
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Ej. 3873 123456 (Opcional)"
                className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-[#002046] block mb-0.5">
              Domicilio Fiscal / Localidad:
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Ej. Av. 24 de Septiembre 1420, Tartagal, Salta"
              className="w-full h-[26px] px-2 bg-white border border-[#74777f]"
            />
          </div>

          {/* Condition hint */}
          <div className="p-2 border border-[#aec7f7] bg-[#f7fafe] flex items-center justify-between text-[11px]">
            <span>
              Tipo de comprobante que se habilitará:{' '}
              <strong className="text-[#002046]">
                {formData.vatCondition === 'Resp. Inscripto'
                  ? 'FACTURA A (Discrimina IVA 21%)'
                  : 'FACTURA B (Consumidor Final / Monotributo)'}
              </strong>
            </span>
            <span
              className={`font-bold px-2 py-0.5 text-[10px] ${
                formData.vatCondition === 'Resp. Inscripto'
                  ? 'bg-[#002046] text-white'
                  : 'bg-[#e2e7ef] text-[#002046]'
              }`}
            >
              {formData.vatCondition === 'Resp. Inscripto' ? 'AUTORIZA FACTURA A' : 'FACTURA B'}
            </span>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#c4c6cf]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="h-[28px] px-4 bg-[#e5e8ec] hover:bg-[#d0d3d8] text-[#181c1f] font-bold border border-[#74777f] flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancelar</span>
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="h-[28px] px-5 bg-[#002046] hover:bg-[#1b365d] text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {isSaving ? 'Guardando en base de datos...' : 'Guardar Cliente & Asignar a Factura'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </WindowsModal>
  );
};
