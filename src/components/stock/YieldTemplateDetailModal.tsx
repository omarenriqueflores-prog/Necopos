import React, { useState } from 'react';
import {
  FileText,
  Printer,
  Download,
  CheckCircle2,
  XCircle,
  History,
  Scale,
  Beef,
  Layers,
  Info,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { WindowsModal } from '../common/WindowsModal';
import { DeboningYieldTemplate } from '../../types/pos';
import { formatKg, formatCurrency } from '../../utils/stockHelper';

interface YieldTemplateDetailModalProps {
  template: DeboningYieldTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  onApplyToNewDeboning?: (template: DeboningYieldTemplate) => void;
}

export const YieldTemplateDetailModal: React.FC<YieldTemplateDetailModalProps> = ({
  template,
  isOpen,
  onClose,
  onApplyToNewDeboning,
}) => {
  const [activeTab, setActiveTab] = useState<'CORTES' | 'HISTORIAL'>('CORTES');

  if (!template) return null;

  // Imprimir ficha técnica
  const handlePrint = () => {
    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Ficha Técnica — Planilla de Rendimiento ${template.name}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; font-size: 12px; color: #000; }
          .header { border-bottom: 2px solid #002046; padding-bottom: 10px; margin-bottom: 15px; }
          .title { font-size: 18px; font-weight: bold; color: #002046; }
          .subtitle { font-size: 13px; color: #444; }
          .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px; font-size: 11px; }
          .meta-item { border: 1px solid #ccc; padding: 6px; background: #f9f9f9; }
          .meta-item strong { display: block; color: #002046; font-size: 10px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
          th { background: #002046; color: #fff; padding: 6px; text-align: left; font-size: 10px; }
          td { border-bottom: 1px solid #ddd; padding: 5px; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .footer { margin-top: 20px; font-size: 10px; color: #666; border-top: 1px solid #ccc; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">NECO POS — FICHA TÉCNICA DE RENDIMIENTO DE CARNES</div>
          <div class="subtitle">${template.name} — Versión ${template.version} (${template.isActive ? 'ACTIVA' : 'INACTIVA'})</div>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><strong>Especie / Categoría:</strong> ${template.species} — ${template.animalCategory}</div>
          <div class="meta-item"><strong>Tipo Materia Prima:</strong> ${template.carcassType.replace('_', ' ')}</div>
          <div class="meta-item"><strong>Lote / Tropa Ref:</strong> ${template.tropaNumber || 'S/N'}</div>
          <div class="meta-item"><strong>Peso Inicial de Referencia:</strong> ${formatKg(template.referenceInitialWeightKg)}</div>
          <div class="meta-item"><strong>Merma Técnica Esperada:</strong> ${formatKg(template.shrinkageWeightKg)} (${template.shrinkagePercent}%)</div>
          <div class="meta-item"><strong>Rendimiento Total:</strong> ${template.totalYieldPercent}%</div>
          <div class="meta-item"><strong>Creador / Operador:</strong> ${template.operator}</div>
          <div class="meta-item"><strong>Fecha de Alta:</strong> ${new Date(template.createdAt).toLocaleDateString('es-AR')}</div>
          <div class="meta-item"><strong>ID Permanente:</strong> ${template.id}</div>
        </div>

        ${template.notes ? `<p><strong>Observaciones:</strong> ${template.notes}</p>` : ''}

        <table>
          <thead>
            <tr>
              <th class="text-center">#</th>
              <th>CÓD</th>
              <th>DESCRIPCIÓN DEL CORTE</th>
              <th>TIPO</th>
              <th class="text-right">PESO REF (KG)</th>
              <th class="text-right">REND %</th>
              <th class="text-right">COEFICIENTE</th>
            </tr>
          </thead>
          <tbody>
            ${template.items.map((it, idx) => `
              <tr>
                <td class="text-center">${idx + 1}</td>
                <td>${it.productCode}</td>
                <td><strong>${it.description}</strong></td>
                <td>${it.cutType}</td>
                <td class="text-right">${formatKg(it.weightKg)}</td>
                <td class="text-right">${it.yieldPercent}%</td>
                <td class="text-right">${it.coefficient.toFixed(6)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          Documento generado por Sistema Frigorífico NECO POS. Válido para proyecciones de desposte y control de mermas.
        </div>
      </body>
      </html>
    `;

    const win = window.open('', '_blank', 'width=850,height=700');
    if (win) {
      win.document.write(printHtml);
      win.document.close();
      win.focus();
      setTimeout(() => {
        win.print();
      }, 350);
    }
  };

  // Exportar a Excel
  const handleExportExcel = () => {
    const data = template.items.map((it, idx) => ({
      Nro: idx + 1,
      Codigo: it.productCode,
      Descripcion: it.description,
      Rubro: it.category,
      Tipo_Corte: it.cutType,
      Peso_Ref_Kg: it.weightKg,
      Rendimiento_Porcentaje: it.yieldPercent,
      Coeficiente_Multiplicador: it.coefficient,
      Precio_Sugerido_Kg: it.suggestedPrice || 0,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Coeficientes_Rendimiento');
    XLSX.writeFile(
      wb,
      `Planilla_Rendimiento_${template.name.replace(/[^a-zA-Z0-9]/g, '_')}_v${template.version}.xlsx`
    );
  };

  return (
    <WindowsModal
      isOpen={isOpen}
      onClose={onClose}
      title={`DETALLE DE PLANILLA DE RENDIMIENTO — ${template.name} (v${template.version})`}
      icon={<FileText className="w-4 h-4 text-amber-300" />}
      maxWidth="max-w-4xl"
      zIndex="z-[10000]"
    >
      <div className="p-3 text-black space-y-3 select-none">
        {/* TARJETA CABECERA DE LA PLANILLA */}
        <div className="bg-white border border-gray-400 p-2.5 rounded shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-300 pb-2 mb-2">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-sm text-[#002046]">{template.name}</span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-900 border border-blue-300 font-bold text-[10px] rounded">
                  v{template.version}
                </span>
                <span
                  className={`px-2 py-0.5 font-bold text-[10px] rounded border ${
                    template.isActive
                      ? 'bg-green-100 text-green-800 border-green-300'
                      : 'bg-gray-100 text-gray-600 border-gray-300'
                  }`}
                >
                  {template.isActive ? 'ACTIVA PARA DESPOSTE' : 'INACTIVA'}
                </span>
              </div>
              <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                ID Permanente: {template.id} | Creada:{' '}
                {new Date(template.createdAt).toLocaleDateString('es-AR')} por {template.operator}
              </div>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={handlePrint}
                className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-400 text-xs font-semibold rounded shadow-sm flex items-center space-x-1"
              >
                <Printer className="w-3.5 h-3.5 text-gray-700" />
                <span>Imprimir Ficha</span>
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-400 text-xs font-semibold rounded shadow-sm flex items-center space-x-1"
              >
                <Download className="w-3.5 h-3.5 text-green-700" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          {/* DATOS DE ORIGEN Y TRAZABILIDAD */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="bg-[#f8f9fa] p-1.5 rounded border border-gray-200">
              <div className="text-[10px] text-gray-500 font-bold uppercase">Especie / Categoría</div>
              <div className="font-bold text-[#002046]">{template.species} — {template.animalCategory}</div>
            </div>

            <div className="bg-[#f8f9fa] p-1.5 rounded border border-gray-200">
              <div className="text-[10px] text-gray-500 font-bold uppercase">Materia Prima</div>
              <div className="font-bold text-gray-800">{template.carcassType.replace('_', ' ')}</div>
            </div>

            <div className="bg-[#f8f9fa] p-1.5 rounded border border-gray-200">
              <div className="text-[10px] text-gray-500 font-bold uppercase">Tropa / Lote Ref</div>
              <div className="font-bold text-gray-800">{template.tropaNumber || 'S/N'}</div>
            </div>

            <div className="bg-yellow-50 p-1.5 rounded border border-amber-200">
              <div className="text-[10px] text-amber-800 font-bold uppercase">Peso Gancho Ref</div>
              <div className="font-extrabold text-blue-900">{formatKg(template.referenceInitialWeightKg)}</div>
            </div>
          </div>

          {template.notes && (
            <div className="mt-2 text-[11px] text-gray-700 bg-gray-50 p-1.5 rounded border border-gray-200">
              <strong>Observaciones:</strong> {template.notes}
            </div>
          )}
        </div>

        {/* PESTAÑAS DE VISTA: CORTES vs HISTORIAL DE VERSIONES */}
        <div className="flex space-x-2 border-b border-gray-300 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('CORTES')}
            className={`px-3 py-1 border-b-2 flex items-center space-x-1 ${
              activeTab === 'CORTES'
                ? 'border-[#002046] text-[#002046] bg-white'
                : 'border-transparent text-gray-500 hover:text-black'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Cortes y Coeficientes ({template.items.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('HISTORIAL')}
            className={`px-3 py-1 border-b-2 flex items-center space-x-1 ${
              activeTab === 'HISTORIAL'
                ? 'border-[#002046] text-[#002046] bg-white'
                : 'border-transparent text-gray-500 hover:text-black'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>
              Historial de Versiones ({template.versionHistory?.length || 0})
            </span>
          </button>
        </div>

        {activeTab === 'CORTES' ? (
          <div className="bg-white border border-gray-400 rounded overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-[#002046] text-white text-[10px] sticky top-0">
                  <tr>
                    <th className="p-1.5 w-8 text-center">#</th>
                    <th className="p-1.5 w-16 text-left">Código</th>
                    <th className="p-1.5 text-left">Descripción del Corte</th>
                    <th className="p-1.5 w-24 text-left">Clasificación</th>
                    <th className="p-1.5 w-24 text-right bg-blue-900">Peso Ref (Kg)</th>
                    <th className="p-1.5 w-20 text-right">Rend %</th>
                    <th className="p-1.5 w-28 text-right bg-amber-900">Coeficiente</th>
                    <th className="p-1.5 w-24 text-right">Precio $/Kg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-[11px]">
                  {template.items.map((it, idx) => (
                    <tr key={`${it.productCode}-${idx}`} className="hover:bg-blue-50">
                      <td className="p-1.5 text-center text-gray-500 font-mono text-[10px]">
                        {idx + 1}
                      </td>
                      <td className="p-1.5 font-mono font-bold text-gray-700">{it.productCode}</td>
                      <td className="p-1.5 font-semibold text-black">
                        {it.description}
                        <span className="text-[9px] text-gray-500 block">{it.category}</span>
                      </td>
                      <td className="p-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            it.cutType === 'HUESO'
                              ? 'bg-gray-100 text-gray-700'
                              : it.cutType === 'GRASA'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {it.cutType}
                        </span>
                      </td>
                      <td className="p-1.5 text-right font-extrabold text-blue-950 bg-blue-50/40">
                        {formatKg(it.weightKg)}
                      </td>
                      <td className="p-1.5 text-right font-bold text-blue-800">{it.yieldPercent}%</td>
                      <td className="p-1.5 text-right font-mono font-bold text-amber-900 bg-amber-50/40">
                        {it.coefficient.toFixed(6)}
                      </td>
                      <td className="p-1.5 text-right text-gray-700 font-semibold">
                        {it.suggestedPrice ? formatCurrency(it.suggestedPrice) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* BALANCE TOTAL AL PIE */}
            <div className="bg-[#f0f2f5] border-t border-gray-300 p-2 flex flex-wrap items-center justify-between text-xs font-bold">
              <div className="flex items-center space-x-3 text-gray-700">
                <span>Rendimiento Total: <strong className="text-blue-900">{template.totalYieldPercent}%</strong></span>
                <span>Merma Técnica: <strong className="text-red-700">{formatKg(template.shrinkageWeightKg)} ({template.shrinkagePercent}%)</strong></span>
              </div>
              <div className="text-[11px] text-gray-500">
                Fórmula de estimación: <span className="font-mono text-black">Kilos = Coeficiente × Peso Res Pendiente</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-400 rounded p-3 shadow-sm space-y-2">
            <div className="font-bold text-xs text-[#002046]">
              Registro Histórico de Versiones Anteriores
            </div>

            {!template.versionHistory || template.versionHistory.length === 0 ? (
              <div className="text-center p-6 text-gray-500 text-xs bg-gray-50 rounded">
                <History className="w-6 h-6 mx-auto text-gray-400 mb-1" />
                <span>Esta planilla se encuentra en su primera versión (v1). No tiene versiones archivadas previas.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {template.versionHistory.map((vh) => (
                  <div
                    key={vh.version}
                    className="p-2 border border-gray-300 rounded bg-[#f9fafb] text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-blue-900 flex items-center space-x-1.5">
                        <span>Versión v{vh.version}</span>
                        <span className="text-[10px] text-gray-500 font-normal">
                          — Actualizada el {new Date(vh.updatedAt).toLocaleDateString('es-AR')} por {vh.operator}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-600 mt-0.5">
                        Cortes: <strong>{vh.items.length}</strong> | Ref:{' '}
                        <strong>{formatKg(vh.referenceInitialWeightKg)}</strong> | Rend:{' '}
                        <strong>{vh.totalYieldPercent}%</strong> | Merma:{' '}
                        <strong>{vh.shrinkagePercent}%</strong>
                      </div>
                      {vh.notes && <div className="text-[10px] text-gray-500 mt-0.5">{vh.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PIE DE ACCIONES */}
        <div className="flex justify-between items-center pt-2 border-t border-gray-300">
          <div>
            {onApplyToNewDeboning && (
              <button
                type="button"
                onClick={() => {
                  onApplyToNewDeboning(template);
                  onClose();
                }}
                className="px-3 py-1.5 bg-[#002046] hover:bg-blue-900 text-white font-bold text-xs rounded shadow-sm flex items-center space-x-1.5"
              >
                <Beef className="w-3.5 h-3.5 text-amber-300" />
                <span>Aplicar a Nuevo Desposte</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1 bg-gray-200 hover:bg-gray-300 border border-gray-400 text-black font-semibold text-xs shadow-sm rounded-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </WindowsModal>
  );
};
