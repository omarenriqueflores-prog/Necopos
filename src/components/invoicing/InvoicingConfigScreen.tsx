import React, { useState } from 'react';
import { Save, Printer, FileText, Settings, ShieldCheck, CreditCard, Eye } from 'lucide-react';
import { BranchConfig, UserAccount } from '../../types/pos';
import { useDialog } from '../../context/DialogContext';
import { useFirebase } from '../../context/FirebaseContext';
import { generateTicketHtml, printTicket } from '../../utils/ticketGenerator';

interface InvoicingConfigScreenProps {
  currentBranch: BranchConfig;
  currentUser: UserAccount;
  onUpdateBranch: (updated: BranchConfig) => Promise<void>;
}

export const InvoicingConfigScreen: React.FC<InvoicingConfigScreenProps> = ({
  currentBranch,
  currentUser,
  onUpdateBranch,
}) => {
  const { showAlert } = useDialog();
  const [branchId, setBranchId] = useState<'NECO 1' | 'NECO 2'>(currentBranch.id);
  const [config, setConfig] = useState<BranchConfig>({ ...currentBranch });
  const [isSaving, setIsSaving] = useState(false);
  const [previewType, setPreviewType] = useState<'RECIBO' | 'FACTURA_A' | 'FACTURA_B' | 'NOTA_CREDITO_A' | 'NOTA_CREDITO_B' | 'TICKET_EMPLEADO'>('RECIBO');
  const [previewFormat, setPreviewFormat] = useState<'TICKET' | 'A4'>('TICKET');

  const { branchConfigs } = useFirebase();

  // Sync state if currentBranch changes from parent
  React.useEffect(() => {
    setBranchId(currentBranch.id);
    setConfig({ ...currentBranch });
  }, [currentBranch]);

  const handleBranchChange = (newId: 'NECO 1' | 'NECO 2') => {
    if (branchConfigs && branchConfigs[newId]) {
      setBranchId(newId);
      setConfig({ ...branchConfigs[newId] });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateBranch(config);
      await showAlert('Configuración de comprobantes guardada exitosamente.');
    } catch (error) {
      console.error('Error saving invoicing config:', error);
      await showAlert('Error al guardar la configuración.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreview = () => {
    // Generate dummy sale data for preview
    const isEmpleado = previewType === 'TICKET_EMPLEADO';

    const dummySale = {
      items: isEmpleado ? [
        { code: '00220', description: 'SOBACO - TERNERA', quantity: 5.07, unitPrice: 10000, subtotal: 50700, weight: 5.07 },
      ] : [
        { code: '001', description: 'CAJA PAPA FRIZADAS', quantity: 1, unitPrice: 54600, subtotal: 54600 },
        { code: '002', description: 'HELLMANNS MAYONESA 2.755', quantity: 1, unitPrice: 18200, subtotal: 18200 },
        { code: '003', description: 'BANDEJA DE HUEVO', quantity: 2, unitPrice: 5000, subtotal: 10000 },
        { code: '004', description: 'JAMON COCIDO', weight: 4.21, unitPrice: 15700, subtotal: 66097 },
        { code: '005', description: 'QUESO TYBO', weight: 4.665, unitPrice: 16000, subtotal: 74640 },
      ],
      total: isEmpleado ? 48165 : 223537,
      subtotal: isEmpleado ? 50700 : 184741.32,
      vatAmount: isEmpleado ? 0 : 38795.68,
      paymentMethod: isEmpleado ? 'CUENTA CORRIENTE' : 'EFECTIVO',
      ticketNumber: isEmpleado ? '1010-00000005' : (previewType === 'RECIBO' ? '1010-00000001' : `${config.pointOfSale?.padStart(4, '0') || '0017'}-00000001`),
      customerName: isEmpleado ? 'Omar Enrique Flores (EMPLEADO Leg. 26635235)' : ((previewType === 'FACTURA_A' || previewType === 'NOTA_CREDITO_A') ? 'JUAN PEREZ S.A.' : 'CONSUMIDOR FINAL'),
      customerDni: isEmpleado ? '26635235' : ((previewType === 'FACTURA_A' || previewType === 'NOTA_CREDITO_A') ? '30-12345678-9' : '--'),
      customerVatCondition: (previewType === 'FACTURA_A' || previewType === 'NOTA_CREDITO_A') ? 'Resp. Inscripto' : 'Consumidor Final',
      invoiceType: isEmpleado || previewType === 'RECIBO' ? 'RECIBO_COMUN' : 
                   (previewType === 'FACTURA_A' ? 'FACTURA_A' : 
                   (previewType === 'FACTURA_B' ? 'FACTURA_B' : 
                   (previewType === 'NOTA_CREDITO_A' ? 'NOTA_CREDITO_A' : 'NOTA_CREDITO_B'))),
      operatorName: currentUser.fullName,
      createdAt: new Date().toISOString(),
      employeeDiscountPercent: isEmpleado ? 5 : 0,
      employeeDiscountAmount: isEmpleado ? 2535 : 0,
      cashGiven: isEmpleado ? 0 : 250000,
      change: isEmpleado ? 0 : 26463,
      cae: '86362320331436',
      caeVto: '2026-09-19'
    };

    const html = generateTicketHtml(dummySale as any, config, previewFormat);
    printTicket(html);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#ebeef2] overflow-hidden p-3 font-sans">
      {/* Header / Toolbar */}
      <div className="h-[42px] bg-white border border-[#c4c6cf] shadow-sm mb-3 flex items-center px-3 justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#002046]" />
          <h2 className="text-[14px] font-bold text-[#002046] uppercase tracking-tight">
            Diseño y Configuración de Comprobantes
          </h2>
          <div className="ml-4 h-[28px] border-l border-[#c4c6cf] pl-4 flex items-center gap-2">
            <span className="text-[11px] font-bold text-[#44474e]">EDITANDO SUCURSAL:</span>
            <select
              value={branchId}
              onChange={(e) => handleBranchChange(e.target.value as any)}
              className="h-[24px] text-[11px] font-bold bg-[#f1f4f8] border border-[#74777f] px-2 outline-none cursor-pointer focus:border-[#002046]"
            >
              <option value="NECO 1">NECO 1 (Central)</option>
              <option value="NECO 2">NECO 2 (Villa Saavedra)</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#f1f4f8] px-2 py-1 rounded-xs border border-[#c4c6cf]">
            <span className="text-[10px] font-bold text-[#44474e] uppercase">Vista Previa:</span>
            <select 
              value={previewType}
              onChange={(e) => setPreviewType(e.target.value as any)}
              className="h-[24px] text-[11px] bg-white border border-[#74777f] px-1 outline-none"
            >
              <option value="RECIBO">Recibo Común</option>
              <option value="FACTURA_A">Factura A</option>
              <option value="FACTURA_B">Factura B</option>
              <option value="NOTA_CREDITO_A">Nota de Crédito A</option>
              <option value="NOTA_CREDITO_B">Nota de Crédito B</option>
              <option value="TICKET_EMPLEADO">Ticket Empleado</option>
            </select>
            <select 
              value={previewFormat}
              onChange={(e) => setPreviewFormat(e.target.value as any)}
              className="h-[24px] text-[11px] bg-white border border-[#74777f] px-1 outline-none"
            >
              <option value="TICKET">Ticket 80mm</option>
              <option value="A4">Hoja A4</option>
            </select>
            <button
              onClick={handlePreview}
              className="h-[24px] px-3 bg-[#002046] hover:bg-[#00152e] text-white font-bold text-[10px] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              VER MODELO
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="h-[30px] px-4 bg-[#00522c] hover:bg-[#003d21] disabled:opacity-50 text-white font-bold text-[12px] flex items-center gap-2 rounded-xs shadow-xs transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Guardando...' : 'Guardar Cambios (F10)'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column: General & Ticket Config */}
        <div className="flex flex-col gap-4">
          <section className="bg-white border border-[#c4c6cf] shadow-xs">
            <div className="h-[32px] bg-[#002046] text-white flex items-center px-3 gap-2">
              <Printer className="w-4 h-4" />
              <span className="text-[12px] font-bold uppercase tracking-wider">Identidad del Negocio en Comprobantes</span>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div>
                <label className="block text-[11px] font-bold text-[#44474e] mb-1 uppercase">Razón Social (Titular):</label>
                <input
                  type="text"
                  value={config.businessName || ''}
                  onChange={(e) => setConfig({ ...config, businessName: e.target.value })}
                  placeholder="Eje: MOYA CARLOS HUGO"
                  className="w-full h-[32px] bg-[#f8f9fc] border border-[#74777f] px-3 text-[13px] font-bold outline-none focus:border-[#002046]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#44474e] mb-1 uppercase">Nombre de Fantasía (Sucursal):</label>
                <input
                  type="text"
                  value={config.fantasyName !== undefined ? config.fantasyName : (config.name || '')}
                  onChange={(e) => setConfig({ ...config, fantasyName: e.target.value, name: e.target.value })}
                  placeholder="Eje: CARNICERÍAS NECO"
                  className="w-full h-[32px] bg-[#f1f4f8] border border-[#74777f] px-3 text-[13px] font-bold outline-none focus:border-[#002046]"
                />
                <p className="text-[9px] text-[#74777f] mt-1 font-medium italic">Este valor se mostrará como nombre principal en el comprobante.</p>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#44474e] mb-1 uppercase">Dirección Legal:</label>
                <input
                  type="text"
                  value={config.address}
                  onChange={(e) => setConfig({ ...config, address: e.target.value })}
                  className="w-full h-[32px] bg-[#f8f9fc] border border-[#74777f] px-3 text-[13px] outline-none focus:border-[#002046]"
                />
              </div>
            </div>
          </section>

          <section className="bg-white border border-[#c4c6cf] shadow-xs">
            <div className="h-[32px] bg-[#002046] text-white flex items-center px-3 gap-2">
              <Printer className="w-4 h-4" />
              <span className="text-[12px] font-bold uppercase tracking-wider">Configuración de Ticket Térmico</span>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-[#44474e] mb-1 uppercase">Modelo de Impresora:</label>
                  <select
                    value={config.printerModel}
                    onChange={(e) => setConfig({ ...config, printerModel: e.target.value })}
                    className="w-full h-[32px] bg-[#f8f9fc] border border-[#74777f] px-2 text-[13px] outline-none focus:border-[#002046]"
                  >
                    <option value="EPSON TM-T20II">EPSON TM-T20II (Térmica)</option>
                    <option value="HASAR 250 HT">HASAR 250 HT (Fiscal)</option>
                    <option value="SAM4S GIANT-100">SAM4S GIANT-100</option>
                    <option value="GENERICA 80MM">Genérica 80mm</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#44474e] mb-1 uppercase">Ancho de Papel:</label>
                  <select
                    value={config.ticketPrinter || '80mm'}
                    onChange={(e) => setConfig({ ...config, ticketPrinter: e.target.value })}
                    className="w-full h-[32px] bg-[#f8f9fc] border border-[#74777f] px-2 text-[13px] outline-none focus:border-[#002046]"
                  >
                    <option value="80mm">80mm (Estándar Térmico)</option>
                    <option value="58mm">58mm (Ticket Mini)</option>
                    <option value="A4">A4 (Hoja Completa)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#44474e] mb-1 uppercase">Prefijo de Comprobantes:</label>
                <input
                  type="text"
                  value={config.ticketPrefix || ''}
                  onChange={(e) => setConfig({ ...config, ticketPrefix: e.target.value })}
                  placeholder="Eje: T0001-"
                  className="w-full h-[32px] bg-[#f8f9fc] border border-[#74777f] px-3 text-[13px] outline-none focus:border-[#002046]"
                />
              </div>

              <div className="p-3 bg-[#fdf8e1] border border-[#f5e28c] rounded-xs flex gap-3">
                <ShieldCheck className="w-5 h-5 text-[#856404] flex-shrink-0" />
                <p className="text-[11px] text-[#856404] leading-relaxed">
                  <strong>Nota:</strong> Al imprimir desde el POS, se respetará el formato (A4 o Ticket) definido en esta configuración.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: ARCA / Fiscal Config */}
        <div className="flex flex-col gap-4">
          <section className="bg-white border border-[#c4c6cf] shadow-xs flex-1">
            <div className="h-[32px] bg-[#aa3531] text-white flex items-center px-3 gap-2">
              <CreditCard className="w-4 h-4" />
              <span className="text-[12px] font-bold uppercase tracking-wider">Facturación Fiscal (ARCA / AFIP)</span>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-[#44474e] mb-1 uppercase">CUIT Empresa:</label>
                  <input
                    type="text"
                    value={config.cuit}
                    onChange={(e) => setConfig({ ...config, cuit: e.target.value })}
                    className="w-full h-[32px] bg-[#f8f9fc] border border-[#74777f] px-3 text-[13px] font-mono outline-none focus:border-[#002046]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#44474e] mb-1 uppercase">Punto de Venta Fiscal:</label>
                  <input
                    type="text"
                    value={config.pointOfSale}
                    onChange={(e) => setConfig({ ...config, pointOfSale: e.target.value })}
                    className="w-full h-[32px] bg-[#f8f9fc] border border-[#74777f] px-3 text-[13px] font-mono outline-none focus:border-[#002046]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-[#44474e] mb-1 uppercase">Ingresos Brutos (IIBB):</label>
                  <input
                    type="text"
                    value={config.iibb || config.grossIncome}
                    onChange={(e) => setConfig({ ...config, iibb: e.target.value, grossIncome: e.target.value })}
                    className="w-full h-[32px] bg-[#f8f9fc] border border-[#74777f] px-3 text-[13px] font-mono outline-none focus:border-[#002046]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#44474e] mb-1 uppercase">Inicio de Actividades:</label>
                  <input
                    type="text"
                    value={config.startActivities || ''}
                    onChange={(e) => setConfig({ ...config, startActivities: e.target.value })}
                    placeholder="DD/MM/AAAA"
                    className="w-full h-[32px] bg-[#f8f9fc] border border-[#74777f] px-3 text-[13px] font-mono outline-none focus:border-[#002046]"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-[11px] font-bold text-[#44474e] mb-1 uppercase">Leyenda al pie de Ticket:</label>
                <textarea
                  value={config.ticketFooter || ''}
                  onChange={(e) => setConfig({ ...config, ticketFooter: e.target.value })}
                  className="w-full h-[60px] bg-[#f8f9fc] border border-[#74777f] p-2 text-[13px] outline-none focus:border-[#002046] resize-none"
                  placeholder="Gracias por su compra..."
                />
              </div>

              <div className="p-4 bg-[#f1f4f8] border border-[#c4c6cf] flex flex-col gap-3 mt-4">
                <h4 className="text-[11px] font-bold text-[#002046] uppercase border-b border-[#c4c6cf] pb-1">Credenciales Web Services</h4>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#44474e]">Certificado Digital (.CRT):</span>
                  <span className="text-[10px] bg-[#00522c] text-white px-2 py-0.5 rounded-full font-bold">VINCULADO</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#44474e]">Entorno de Trabajo:</span>
                  <span className="text-[10px] bg-[#aa3531] text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">Producción</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="h-[36px] mt-3 border-t border-[#c4c6cf] flex items-center justify-end px-1 gap-4 text-[11px] text-[#44474e]">
        <span>Configuración activa para Sucursal: <strong>{branchId} - {config.name}</strong></span>
        <span>Operador: <strong>{currentUser.fullName}</strong></span>
      </div>
    </div>
  );
};
