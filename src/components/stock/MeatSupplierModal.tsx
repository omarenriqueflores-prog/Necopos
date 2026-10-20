import React, { useMemo, useState } from 'react';
import { Building2, X, Save, ChevronDown, ChevronRight } from 'lucide-react';
import { MeatReception, MeatSupplier } from '../../types/pos';
import { formatCurrency, formatKg } from '../../utils/stockHelper';
import { carcassLabel } from '../../utils/receptionHelper';

interface MeatSupplierModalProps {
  suppliers: MeatSupplier[];
  receptions: MeatReception[];
  initialName: string;
  onSave: (supplier: MeatSupplier) => Promise<void>;
  onUseSupplier: (supplier: MeatSupplier) => void;
  onClose: () => void;
}

const makeSupplierId = (name: string) =>
  name.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `frigorifico-${Date.now()}`;

export const MeatSupplierModal: React.FC<MeatSupplierModalProps> = ({
  suppliers,
  receptions,
  initialName,
  onSave,
  onUseSupplier,
  onClose,
}) => {
  const initialSupplier = suppliers.find((supplier) =>
    supplier.name.toLocaleLowerCase('es') === initialName.trim().toLocaleLowerCase('es')
  );
  const [selectedId, setSelectedId] = useState(initialSupplier?.id || '');
  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedId);
  const [name, setName] = useState(initialSupplier?.name || initialName);
  const [cuit, setCuit] = useState(initialSupplier?.cuit || '');
  const [address, setAddress] = useState(initialSupplier?.address || '');
  const [phone, setPhone] = useState(initialSupplier?.phone || '');
  const [email, setEmail] = useState(initialSupplier?.email || '');
  const [contact, setContact] = useState(initialSupplier?.contact || '');
  const [notes, setNotes] = useState(initialSupplier?.notes || '');
  const [expandedReceptionId, setExpandedReceptionId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const supplierHistory = useMemo(() => {
    if (!selectedSupplier && !name.trim()) return [];
    const identity = (selectedSupplier?.name || name).trim().toLocaleLowerCase('es');
    return receptions
      .filter((reception) =>
        (selectedSupplier && reception.supplierId === selectedSupplier.id) ||
        reception.supplier.trim().toLocaleLowerCase('es') === identity
      )
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [receptions, selectedSupplier, name]);

  const historyTotals = useMemo(() => ({
    receptions: supplierHistory.length,
    invoices: new Set(supplierHistory.map((reception) => reception.invoiceNumber).filter(Boolean)).size,
    kilos: supplierHistory.reduce((sum, reception) => sum + (Number(reception.totalWeightKg) || 0), 0),
    amount: supplierHistory.reduce((sum, reception) => sum + (Number(reception.totalCost) || 0), 0),
  }), [supplierHistory]);

  const selectSupplier = (id: string) => {
    setSelectedId(id);
    const supplier = suppliers.find((item) => item.id === id);
    if (!supplier) {
      setName('');
      setCuit('');
      setAddress('');
      setPhone('');
      setEmail('');
      setContact('');
      setNotes('');
      return;
    }
    setName(supplier.name);
    setCuit(supplier.cuit || '');
    setAddress(supplier.address || '');
    setPhone(supplier.phone || '');
    setEmail(supplier.email || '');
    setContact(supplier.contact || '');
    setNotes(supplier.notes || '');
    onUseSupplier(supplier);
  };

  const saveSupplier = async () => {
    if (!name.trim()) {
      setError('Ingrese el nombre del frigorífico.');
      return;
    }
    const existing = suppliers.find((supplier) =>
      supplier.id === selectedId || supplier.name.trim().toLocaleLowerCase('es') === name.trim().toLocaleLowerCase('es')
    );
    const supplier: MeatSupplier = {
      id: existing?.id || makeSupplierId(name),
      name: name.trim(),
      cuit: cuit.trim() || undefined,
      address: address.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      contact: contact.trim() || undefined,
      notes: notes.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    try {
      setSaving(true);
      setError('');
      await onSave(supplier);
      onUseSupplier(supplier);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el frigorífico.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-3">
      <div className="win-panel bg-[#d4d0c8] max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border-2 border-white">
        <div className="win-titlebar flex items-center justify-between p-1 bg-[#002046] text-white">
          <div className="flex items-center space-x-2 text-xs font-bold">
            <Building2 className="w-4 h-4 text-amber-300" />
            <span>FRIGORÍFICO — DATOS E HISTORIAL DE RECEPCIONES</span>
          </div>
          <button onClick={onClose} className="px-1.5 py-0.5 bg-[#c0c0c0] text-black border border-gray-400"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-3 overflow-y-auto space-y-3 text-xs">
          {error && <div className="p-2 bg-red-100 border border-red-300 text-red-800">{error}</div>}
          <section className="p-3 bg-white border border-gray-400 space-y-2">
            <div className="font-bold text-[#002046] border-b pb-1">FICHA DEL FRIGORÍFICO</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="md:col-span-2">
                <label className="block font-bold mb-1">Frigorífico guardado</label>
                <select className="w-full border border-gray-400 px-2 py-1.5" value={selectedId} onChange={(event) => selectSupplier(event.target.value)}>
                  <option value="">Nuevo frigorífico / completar datos</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">Razón social / nombre *</label>
                <input className="w-full border border-gray-400 px-2 py-1.5" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              {[
                ['CUIT', cuit, setCuit],
                ['Domicilio', address, setAddress],
                ['Teléfono', phone, setPhone],
                ['Correo electrónico', email, setEmail],
                ['Contacto comercial', contact, setContact],
              ].map(([label, value, setter]) => (
                <div key={label as string}>
                  <label className="block font-bold mb-1">{label as string}</label>
                  <input className="w-full border border-gray-400 px-2 py-1.5" value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} />
                </div>
              ))}
              <div className="md:col-span-3">
                <label className="block font-bold mb-1">Observaciones</label>
                <input className="w-full border border-gray-400 px-2 py-1.5" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={saveSupplier} disabled={saving} className="h-9 min-w-40 px-4 bg-[#002046] hover:bg-blue-900 disabled:opacity-50 text-white font-bold inline-flex items-center justify-center gap-2">
                <Save className="w-4 h-4" />{saving ? 'Guardando...' : 'Guardar datos'}
              </button>
            </div>
          </section>

          <section className="bg-white border border-gray-400">
            <div className="p-2 bg-[#002046] text-white font-bold flex flex-wrap justify-between gap-2">
              <span>HISTORIAL DE INGRESOS {selectedSupplier ? `— ${selectedSupplier.name}` : name ? `— ${name}` : ''}</span>
              <span>{historyTotals.receptions} recepciones · {historyTotals.invoices} facturas · {formatKg(historyTotals.kilos)} · {formatCurrency(historyTotals.amount)}</span>
            </div>
            {supplierHistory.length === 0 ? (
              <div className="p-5 text-center text-gray-500">Todavía no hay ingresos registrados para este frigorífico.</div>
            ) : (
              <div className="max-h-[38vh] overflow-auto">
                <table className="w-full border-collapse text-left text-[11px]">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-2">Fecha / hora</th><th className="p-2">Factura</th><th className="p-2">Remito / DTE</th>
                      <th className="p-2">Sucursal</th><th className="p-2 text-right">Unidades</th><th className="p-2 text-right">Kilos</th>
                      <th className="p-2 text-right">Importe</th><th className="p-2">Estado</th><th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {supplierHistory.map((reception) => (
                      <React.Fragment key={reception.id}>
                        <tr>
                          <td className="p-2">{reception.date} {reception.time}</td>
                          <td className="p-2 font-mono font-bold">{reception.invoiceNumber || 'S/F'}</td>
                          <td className="p-2">{reception.deliveryNoteNumber || reception.dteGuideNumber || '-'}</td>
                          <td className="p-2">{reception.branchId}</td>
                          <td className="p-2 text-right">{reception.totalQuantity}</td>
                          <td className="p-2 text-right">{formatKg(reception.totalWeightKg)}</td>
                          <td className="p-2 text-right font-bold">{formatCurrency(reception.totalCost)}</td>
                          <td className="p-2">{reception.status}</td>
                          <td className="p-2">
                            <button type="button" onClick={() => setExpandedReceptionId(expandedReceptionId === reception.id ? '' : reception.id)} className="text-blue-900">
                              {expandedReceptionId === reception.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          </td>
                        </tr>
                        {expandedReceptionId === reception.id && (
                          <tr>
                            <td colSpan={9} className="p-2 bg-gray-50">
                              <div className="mb-1">Proveedor: {reception.supplier} · CUIT: {reception.supplierCuit || selectedSupplier?.cuit || '-'}</div>
                              <table className="w-full border-collapse bg-white">
                                <thead><tr className="bg-gray-100"><th className="p-1">Media res</th><th className="p-1">Tropa</th><th className="p-1">Especie</th><th className="p-1">Categoría</th><th className="p-1">Precinto</th><th className="p-1 text-right">Kg</th><th className="p-1 text-right">$/Kg</th><th className="p-1 text-right">Subtotal</th></tr></thead>
                                <tbody>{(reception.carcasses || []).map((carcass, index) => (
                                  <tr key={carcass.id} className="border-t">
                                    <td className="p-1">{carcassLabel(carcass, index)}</td>
                                    <td className="p-1">{carcass.tropaNumber || reception.tropaNumber}</td>
                                    <td className="p-1">{carcass.species || reception.species}</td>
                                    <td className="p-1">{carcass.category || reception.category}</td>
                                    <td className="p-1">{carcass.tagNumber || '-'}</td>
                                    <td className="p-1 text-right">{formatKg(carcass.weightKg)}</td>
                                    <td className="p-1 text-right">{formatCurrency(carcass.pricePerKg ?? reception.pricePerKg)}</td>
                                    <td className="p-1 text-right">{formatCurrency(carcass.cost ?? carcass.weightKg * (carcass.pricePerKg ?? reception.pricePerKg))}</td>
                                  </tr>
                                ))}</tbody>
                              </table>
                              {reception.notes && <div className="mt-1">Observaciones: {reception.notes}</div>}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
