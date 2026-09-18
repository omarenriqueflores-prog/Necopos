import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Building,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Server,
  Key,
  FileCheck,
  Save,
  Download,
  Copy,
  FileText,
  Upload,
  Check,
  HelpCircle,
  Clock,
  Cpu,
} from 'lucide-react';
import { ArcaConfig, BranchConfig } from '../../types/pos';
import { WindowsModal } from '../common/WindowsModal';
import {
  arcaService,
  ArcaStatusResponse,
  GenerateCsrResponse,
  ParseCertResponse,
} from '../../services/arcaService';
import { useDialog } from '../../context/DialogContext';
import { LastVouchersModal } from '../invoicing/LastVouchersModal';

interface ArcaConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ArcaConfig;
  branches: BranchConfig[];
  onSaveConfig: (cfg: ArcaConfig) => Promise<void>;
}

export const ArcaConfigModal: React.FC<ArcaConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  branches,
  onSaveConfig,
}) => {
  const { showAlert } = useDialog();

  const [activeTab, setActiveTab] = useState<'PARAMETROS' | 'ETAPA_2_CERTIFICADOS'>('PARAMETROS');
  const [formConfig, setFormConfig] = useState<ArcaConfig>(() => ({
    ...config,
    pointsOfSale: {
      'NECO 1':
        config.pointsOfSale?.['NECO 1'] ||
        branches.find((b) => b.id === 'NECO 1')?.pointOfSale ||
        '0017',
      'NECO 2':
        config.pointsOfSale?.['NECO 2'] ||
        branches.find((b) => b.id === 'NECO 2')?.pointOfSale ||
        '0018',
      ...(config.pointsOfSale || {}),
    },
  }));
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<ArcaStatusResponse | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isLastVouchersOpen, setIsLastVouchersOpen] = useState<boolean>(false);

  // Sync state when modal opens or config changes
  useEffect(() => {
    if (isOpen) {
      setFormConfig({
        ...config,
        pointsOfSale: {
          'NECO 1':
            config.pointsOfSale?.['NECO 1'] ||
            branches.find((b) => b.id === 'NECO 1')?.pointOfSale ||
            '0017',
          'NECO 2':
            config.pointsOfSale?.['NECO 2'] ||
            branches.find((b) => b.id === 'NECO 2')?.pointOfSale ||
            '0018',
        },
      });
      setCertInput(config.certificate || '');
      setAlias(config.alias || 'necopos');
    }
  }, [isOpen, config, branches]);

  // Etapa 2 Generator State
  const [alias, setAlias] = useState<string>(config.alias || 'necopos');
  const [csrFormat, setCsrFormat] = useState<'exact' | 'full'>('exact');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedData, setGeneratedData] = useState<GenerateCsrResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedCsr, setCopiedCsr] = useState<boolean>(false);

  // Etapa 2.3 Certificate & Key Upload State
  const savedLocalKey = typeof window !== 'undefined' ? localStorage.getItem('necopos_arca_private_key') || '' : '';
  const initialKey = config.privateKey || savedLocalKey;
  const [certInput, setCertInput] = useState<string>(config.certificate || '');
  const [keyInput, setKeyInput] = useState<string>(initialKey);
  const [isParsingCert, setIsParsingCert] = useState<boolean>(false);
  const [parsedCert, setParsedCert] = useState<ParseCertResponse | null>(null);

  useEffect(() => {
    if (initialKey && (!formConfig.privateKey || !formConfig.hasPrivateKey)) {
      setFormConfig((prev) => ({
        ...prev,
        privateKey: initialKey,
        hasPrivateKey: true,
      }));
    }
  }, [initialKey]);

  if (!isOpen) return null;

  // Handle .key file selection via file input
  const handleKeyFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      if (text.trim()) {
        const cleanText = text.trim();
        setKeyInput(cleanText);
        try {
          localStorage.setItem('necopos_arca_private_key', cleanText);
        } catch (_) {}

        setFormConfig((prev) => ({
          ...prev,
          privateKey: cleanText,
          hasPrivateKey: true,
        }));
        showAlert('✅ Clave Privada (.key) cargada y guardada correctamente en el sistema.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Utility to download text file in browser with Windows CRLF line-endings for AFIP IIS compatibility
  const handleDownloadFile = (filename: string, content: string) => {
    try {
      const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
      const blob = new Blob([normalizedContent], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showAlert(`No se pudo descargar el archivo: ${err.message}`);
    }
  };

  const handleCopy = async (text: string, type: 'key' | 'csr') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'key') {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopiedCsr(true);
        setTimeout(() => setCopiedCsr(false), 2000);
      }
    } catch (_) {
      showAlert('Contenido copiado al portapapeles.');
    }
  };

  // Generate Key and CSR directly via OpenSSL on backend
  const handleGenerateKeyAndCsr = async (overrideFormat?: 'exact' | 'full') => {
    setIsGenerating(true);
    const fmt = overrideFormat || csrFormat;
    try {
      const res = await arcaService.generateKeyAndCsr(
        formConfig.cuit,
        formConfig.companyName || 'MOYA CARLOS HUGO',
        alias,
        fmt
      );
      setGeneratedData(res);

      // Automatically store the generated private key in form state
      setFormConfig((prev) => ({
        ...prev,
        alias: res.alias,
        privateKey: res.privateKey,
        hasPrivateKey: true,
      }));

      await showAlert(
        `¡Clave Privada y Pedido CSR generados con éxito!\n\nFormato: ${fmt === 'exact' ? 'Exacto ARCA (Recomendado)' : 'Completo con Organización'}\nAlias: ${res.alias}\nSujeto: ${res.subject}\n\nDescargue "${res.alias}_pedido.csr" para subirlo al portal de ARCA.`
      );
    } catch (err: any) {
      await showAlert(`Error al generar con OpenSSL: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle .crt file selection via file input
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCertInput(text);
        handleValidateCert(text);
      }
    };
    reader.readAsText(file);
  };

  // Validate uploaded certificate with OpenSSL
  const handleValidateCert = async (textToValidate?: string) => {
    const text = textToValidate || certInput;
    if (!text.trim()) {
      showAlert('Por favor ingrese o suba el contenido de su archivo .crt emitido por ARCA.');
      return;
    }
    setIsParsingCert(true);
    setParsedCert(null);
    try {
      const res = await arcaService.parseCertificate(text);
      setParsedCert(res);
      if (res.isValid) {
        setFormConfig((prev) => ({
          ...prev,
          certificate: text.trim(),
          hasCertificate: true,
          certExpiration: res.validTo,
          certIssuer: res.issuer,
          certSubject: res.subject,
        }));
      }
    } catch (err: any) {
      await showAlert(`Error al validar certificado: ${err.message}`);
    } finally {
      setIsParsingCert(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await arcaService.checkStatus(formConfig);
      setTestResult(res);
      if (res.connected) {
        setFormConfig((prev) => ({ ...prev, connected: true, lastChecked: new Date().toISOString() }));
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        connected: false,
        environment: formConfig.environment,
        cuit: formConfig.cuit,
        companyName: formConfig.companyName,
        vatCondition: formConfig.vatCondition,
        hasCert: false,
        hasKey: false,
        authMethod: 'Error',
        activePvs: [],
        timestamp: new Date().toISOString(),
        message: err.message || 'Error de conexión',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const pv1 = (formConfig.pointsOfSale?.['NECO 1'] || '0017').padStart(4, '0');
      const pv2 = (formConfig.pointsOfSale?.['NECO 2'] || '0018').padStart(4, '0');

      const finalCert = certInput.trim() || formConfig.certificate || '';
      const finalKey = keyInput.trim() || formConfig.privateKey || savedLocalKey || '';

      const cleanedConfig: ArcaConfig = {
        ...formConfig,
        certificate: finalCert,
        privateKey: finalKey,
        hasCertificate: Boolean(finalCert),
        hasPrivateKey: Boolean(finalKey),
        pointsOfSale: {
          'NECO 1': pv1,
          'NECO 2': pv2,
        },
      };

      try {
        localStorage.setItem('necopos_arca_config', JSON.stringify(cleanedConfig));
        if (finalKey) {
          localStorage.setItem('necopos_arca_private_key', finalKey);
        }
      } catch (_) {}

      await onSaveConfig(cleanedConfig);
      await showAlert('✅ Configuración ARCA, Certificados Digitales y Puntos de Venta guardados exitosamente.');
      onClose();
    } catch (err: any) {
      await showAlert(`Error al guardar configuración: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <WindowsModal
      isOpen={isOpen}
      onClose={onClose}
      title="PARÁMETROS DEL SISTEMA - FACTURACIÓN ELECTRÓNICA ARCA (EX AFIP)"
      maxWidth="max-w-3xl"
    >
      <div className="flex flex-col gap-2 p-1 text-[12px] select-none font-sans max-h-[85vh] overflow-y-auto">
        {/* Connection status banner */}
        <div className="bg-[#002046] text-white p-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#aec7f7]" />
            <div>
              <div className="font-bold text-[13px]">SERVICIO WEB DE FACTURACIÓN ELECTRÓNICA (WSFEv1)</div>
              <div className="text-[10px] text-[#c4c6cf]">
                Homologación y Producción bajo normativa RG 4291 / AFIP-ARCA
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-white text-[#002046] px-2.5 py-1 font-bold text-[11px]">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                formConfig.connected ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'
              }`}
            />
            <span>{formConfig.connected ? 'CONECTADO Y EN LÍNEA' : 'DESCONECTADO'}</span>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center bg-[#e5e8ec] border border-[#74777f] border-b-0 px-1 pt-1 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('PARAMETROS')}
            className={`h-[28px] px-4 text-[11px] font-bold border-t border-x border-[#74777f] flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'PARAMETROS'
                ? 'bg-white text-[#002046] border-b-white -mb-px'
                : 'bg-[#d6d9de] text-[#44474e] hover:bg-[#e0e3e7]'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>1. Parámetros y Puntos de Venta</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ETAPA_2_CERTIFICADOS')}
            className={`h-[28px] px-4 text-[11px] font-bold border-t border-x border-[#74777f] flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'ETAPA_2_CERTIFICADOS'
                ? 'bg-white text-[#002046] border-b-white -mb-px'
                : 'bg-[#d6d9de] text-[#44474e] hover:bg-[#e0e3e7]'
            }`}
          >
            <Key className="w-3.5 h-3.5 text-amber-700" />
            <span>2. Asistente de Claves y Certificados (Etapa 2)</span>
            {formConfig.hasCertificate && formConfig.hasPrivateKey && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 ml-1" />
            )}
          </button>
        </div>

        {/* Tab 1: Parámetros y Puntos de Venta */}
        {activeTab === 'PARAMETROS' && (
          <div className="bg-white p-3 border border-[#74777f] flex flex-col gap-3 shadow-sm">
            {/* Company Fiscal Data */}
            <div>
              <span className="font-bold text-[#002046] text-[11px] uppercase block mb-1.5 border-b border-[#c4c6cf] pb-1">
                1. Datos Fiscales del Emisor (Carnicerías Neco):
              </span>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">CUIT de la Empresa:</label>
                  <input
                    type="text"
                    value={formConfig.cuit}
                    onChange={(e) => setFormConfig({ ...formConfig, cuit: e.target.value })}
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold text-[#002046]"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">Razón Social:</label>
                  <input
                    type="text"
                    value={formConfig.companyName}
                    onChange={(e) => setFormConfig({ ...formConfig, companyName: e.target.value })}
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">Condición frente al IVA:</label>
                  <input
                    type="text"
                    readOnly
                    value="Responsable Inscripto"
                    className="w-full h-[26px] px-2 bg-[#f0f2f5] border border-[#c4c6cf] font-bold text-[#002046]"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">Ambiente ARCA Activo:</label>
                  <select
                    value={formConfig.environment}
                    onChange={(e) =>
                      setFormConfig({ ...formConfig, environment: e.target.value as any })
                    }
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold text-[#002046]"
                  >
                    <option value="homologacion">Homologación (Testing / Pruebas ARCA)</option>
                    <option value="produccion">Producción (Real Fiscal ARCA)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Points of Sale Multi-Branch Mapping */}
            <div className="bg-[#f7fafe] p-2.5 border border-[#c4c6cf]">
              <div className="flex items-center justify-between mb-2 border-b border-[#c4c6cf] pb-1">
                <span className="font-bold text-[#002046] text-[11px] uppercase">
                  2. Asignación de Puntos de Venta ARCA por Sucursal (Habilitados en Etapa 1):
                </span>
                <span className="text-[10px] text-[#002046] font-bold bg-[#d7e3ff] px-1.5 py-0.5 border border-[#aec7f7]">
                  ✏️ Editables según lo creado en ARCA
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Neco 1 */}
                <div className="bg-white p-2.5 border border-[#74777f] shadow-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <strong className="block text-[#002046] text-[12px]">Neco 1 (24 de Septiembre)</strong>
                      <span className="text-[10px] text-[#555]">Sucursal Central</span>
                    </div>
                    <span className="text-[10px] font-bold bg-[#e8f0fe] text-[#002046] px-1.5 py-0.5 border border-[#aec7f7]">
                      Principal
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-bold text-[#002046] whitespace-nowrap">
                      Punto de Venta Fiscal:
                    </label>
                    <div className="flex items-center border border-[#74777f] bg-white flex-1 focus-within:border-[#002046] focus-within:ring-1 focus-within:ring-[#002046]">
                      <span className="bg-[#f0f2f5] px-2 py-1 text-[11px] font-mono font-bold text-[#44474e] border-r border-[#74777f] select-none">
                        PV
                      </span>
                      <input
                        type="text"
                        maxLength={5}
                        value={formConfig.pointsOfSale?.['NECO 1'] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setFormConfig((prev) => ({
                            ...prev,
                            pointsOfSale: {
                              ...prev.pointsOfSale,
                              'NECO 1': val,
                              'NECO 2': prev.pointsOfSale?.['NECO 2'] || '0018',
                            },
                          }));
                        }}
                        onBlur={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          if (val) {
                            const padded = val.padStart(4, '0');
                            setFormConfig((prev) => ({
                              ...prev,
                              pointsOfSale: {
                                ...prev.pointsOfSale,
                                'NECO 1': padded,
                                'NECO 2': prev.pointsOfSale?.['NECO 2'] || '0018',
                              },
                            }));
                          }
                        }}
                        placeholder="0017"
                        className="w-full px-2 py-1 text-sm font-mono font-bold text-[#002046] outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Neco 2 */}
                <div className="bg-white p-2.5 border border-[#74777f] shadow-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <strong className="block text-[#002046] text-[12px]">Neco 2 (Villa Saavedra)</strong>
                      <span className="text-[10px] text-[#555]">Sucursal 2</span>
                    </div>
                    <span className="text-[10px] font-bold bg-[#e8f0fe] text-[#002046] px-1.5 py-0.5 border border-[#aec7f7]">
                      Secundaria
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-bold text-[#002046] whitespace-nowrap">
                      Punto de Venta Fiscal:
                    </label>
                    <div className="flex items-center border border-[#74777f] bg-white flex-1 focus-within:border-[#002046] focus-within:ring-1 focus-within:ring-[#002046]">
                      <span className="bg-[#f0f2f5] px-2 py-1 text-[11px] font-mono font-bold text-[#44474e] border-r border-[#74777f] select-none">
                        PV
                      </span>
                      <input
                        type="text"
                        maxLength={5}
                        value={formConfig.pointsOfSale?.['NECO 2'] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setFormConfig((prev) => ({
                            ...prev,
                            pointsOfSale: {
                              ...prev.pointsOfSale,
                              'NECO 1': prev.pointsOfSale?.['NECO 1'] || '0017',
                              'NECO 2': val,
                            },
                          }));
                        }}
                        onBlur={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          if (val) {
                            const padded = val.padStart(4, '0');
                            setFormConfig((prev) => ({
                              ...prev,
                              pointsOfSale: {
                                ...prev.pointsOfSale,
                                'NECO 1': prev.pointsOfSale?.['NECO 1'] || '0017',
                                'NECO 2': padded,
                              },
                            }));
                          }
                        }}
                        placeholder="0018"
                        className="w-full px-2 py-1 text-sm font-mono font-bold text-[#002046] outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2 text-[10.5px] text-[#44474e] bg-[#eef2f8] p-2 border border-[#c4c6cf]">
                💡 <strong>¿Qué número ingresar aquí?</strong> Escribe el número del Punto de Venta (por ejemplo <strong>0003</strong>, <strong>0004</strong>, <strong>0005</strong>, etc.) que diste de alta en la web de ARCA en <em>&quot;Administración de Puntos de Venta y Domicilios&quot;</em> bajo la opción <em>&quot;Factura electrónica - Web Service&quot;</em>. Al hacer clic en <strong>Guardar Parámetros</strong>, el sistema emitirá tus comprobantes oficiales con ese número.
              </div>
            </div>

            {/* Credentials Status summary */}
            <div className="bg-[#f0f2f5] p-2.5 border border-[#c4c6cf] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-[#74777f]" />
                <div className="text-[11px]">
                  <strong className="text-[#002046]">Estado de Certificados Digitales:</strong>
                  <div className="text-[#44474e] text-[10px]">
                    Clave Privada: {formConfig.hasPrivateKey || formConfig.privateKey ? '✅ Cargada' : '⚠️ Pendiente'} |{' '}
                    Certificado X.509 (.crt): {formConfig.hasCertificate || formConfig.certificate ? '✅ Cargado' : '⚠️ Pendiente'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('ETAPA_2_CERTIFICADOS')}
                className="h-[24px] px-2.5 bg-[#002046] hover:bg-[#1b365d] text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>Abrir Asistente Etapa 2</span>
              </button>
            </div>

            {/* Test Connection Button & Result */}
            <div className="flex flex-col gap-2 pt-1 border-t border-[#c4c6cf]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#44474e]">
                  Última verificación de enlace:{' '}
                  <strong>
                    {formConfig.lastChecked
                      ? new Date(formConfig.lastChecked).toLocaleString('es-AR')
                      : 'No registrado'}
                  </strong>
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsLastVouchersOpen(true)}
                    className="h-[26px] px-3 bg-amber-100 hover:bg-amber-200 border border-amber-600 text-[#002046] text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <FileCheck className="w-3.5 h-3.5 text-amber-800" />
                    <span>VER ÚLTIMO COMPROBANTE ARCA</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="h-[26px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#002046] text-[11px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Comprobando...' : 'PROBAR CONEXIÓN ARCA'}</span>
                  </button>
                </div>
              </div>

              {testResult && (
                <div
                  className={`p-2 border text-[11px] flex items-start gap-2 ${
                    testResult.connected
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                      : 'bg-rose-50 border-rose-400 text-rose-900'
                  }`}
                >
                  {testResult.connected ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <strong className="block">{testResult.message}</strong>
                    <div className="text-[10px] mt-0.5">
                      Ambiente: <strong>{testResult.environment.toUpperCase()}</strong> | Método:{' '}
                      {testResult.authMethod} | CUIT: {testResult.cuit}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Asistente de Claves y Certificados (Etapa 2) */}
        {activeTab === 'ETAPA_2_CERTIFICADOS' && (
          <div className="bg-white p-3 border border-[#74777f] flex flex-col gap-3 shadow-sm">
            {/* Guide Header */}
            <div className="bg-[#f7fafe] p-2 border border-[#c4c6cf] flex flex-col gap-1">
              <div className="flex items-center gap-1.5 font-bold text-[#002046] text-[12px]">
                <Cpu className="w-4 h-4" />
                <span>GENERADOR NATIVO OPENSSL — ETAPA 2</span>
              </div>
              <p className="text-[11px] text-[#44474e]">
                Genera tu par criptográfico oficial para ARCA directamente desde <strong>NECO POS</strong> con un solo clic. Luego descarga el pedido <code>.csr</code>, súbelo a la web de ARCA y carga aquí el certificado emitido <code>.crt</code>.
              </p>
            </div>

            {/* PASO 2.1: Generar Clave Privada y Pedido CSR */}
            <div className="border border-[#c4c6cf] p-2.5 flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-[#c4c6cf] pb-1">
                <span className="font-bold text-[#002046] text-[11px] uppercase">
                  Paso 2.1: Generar Clave Privada (.key) y Pedido CSR con OpenSSL
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFormConfig((prev) => ({
                      ...prev,
                      cuit: '20-25506516-6',
                      companyName: 'MOYA CARLOS HUGO',
                    }));
                  }}
                  className="text-[10px] bg-[#f0f4f9] hover:bg-[#dce3ec] text-[#002046] font-bold px-2 py-0.5 border border-[#74777f] rounded-none cursor-pointer"
                >
                  ⚡ Usar datos de sesión ARCA (MOYA CARLOS HUGO - 20-25506516-6)
                </button>
              </div>

              {/* Informative notice on CUIT matching */}
              <div className="bg-[#eef4fc] border-l-4 border-[#002046] p-2 text-[11px] text-[#002046]">
                <strong>Atención:</strong> En la web de ARCA estás autenticado como{' '}
                <strong>MOYA CARLOS HUGO [20-25506516-6]</strong>. El CUIT dentro del CSR debe
                coincidir de forma exacta con el de tu sesión activa para que ARCA lo acepte sin
                error de <em>"El Request enviado es inválido"</em>.
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">CUIT del Titular en ARCA:</label>
                  <input
                    type="text"
                    value={formConfig.cuit}
                    onChange={(e) => setFormConfig({ ...formConfig, cuit: e.target.value })}
                    placeholder="20-25506516-6"
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold text-[#002046]"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">Razón Social / Organización:</label>
                  <input
                    type="text"
                    value={formConfig.companyName}
                    onChange={(e) => setFormConfig({ ...formConfig, companyName: e.target.value })}
                    placeholder="MOYA CARLOS HUGO"
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#181c1f] block mb-0.5">Nombre de Alias ARCA:</label>
                  <input
                    type="text"
                    value={alias}
                    onChange={(e) => setAlias(e.target.value.toLowerCase().replace(/[^\w.-]/g, ''))}
                    placeholder="necopos"
                    className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono font-bold text-[#002046]"
                  />
                </div>
              </div>

              {/* Format selection matching AFIP prompt */}
              <div className="bg-[#f0f4f9] border border-[#c4c6cf] p-2 flex flex-col gap-1.5 text-[11px]">
                <span className="font-bold text-[#002046] uppercase text-[10px]">Formato del Sujeto (Distinguished Name - DN):</span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-[#002046]">
                    <input
                      type="radio"
                      name="csrFormat"
                      value="exact"
                      checked={csrFormat === 'exact'}
                      onChange={() => setCsrFormat('exact')}
                      className="cursor-pointer"
                    />
                    <span>⭐ Formato Exacto ARCA: <code className="bg-white px-1 font-mono text-[10px]">serialNumber=CUIT {formConfig.cuit.replace(/\D/g, '')}, CN={alias || 'necopos'}</code></span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[#44474e]">
                    <input
                      type="radio"
                      name="csrFormat"
                      value="full"
                      checked={csrFormat === 'full'}
                      onChange={() => setCsrFormat('full')}
                      className="cursor-pointer"
                    />
                    <span>Completo (con C=AR y O={formConfig.companyName || 'MOYA CARLOS HUGO'})</span>
                  </label>
                </div>
                <div className="text-[10px] text-[#555] italic">
                  ℹ️ Tu pantalla de ARCA exige expresamente: <span className="font-mono font-bold text-[#002046]">DN SERIALNUMBER=CUIT {formConfig.cuit.replace(/\D/g, '')}, CN={alias || 'necopos'}</span>. Utiliza el formato exacto para evitar el error interno de ARCA.
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-[10px] text-gray-500 font-mono">
                  Sujeto configurado: {csrFormat === 'exact' ? `/serialNumber=CUIT ${formConfig.cuit.replace(/\D/g, '')}/CN=${alias || 'necopos'}` : `/C=AR/O=${formConfig.companyName || 'MOYA CARLOS HUGO'}/CN=${alias || 'necopos'}/serialNumber=CUIT ${formConfig.cuit.replace(/\D/g, '')}`}
                </div>

                <button
                  type="button"
                  onClick={() => handleGenerateKeyAndCsr()}
                  disabled={isGenerating}
                  className="h-[28px] px-4 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Key className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>{isGenerating ? 'Generando con OpenSSL...' : '🔑 GENERAR CLAVE Y PEDIDO CSR'}</span>
                </button>
              </div>

              {/* Display Result of Generation */}
              {(generatedData || formConfig.privateKey) && (
                <div className="bg-emerald-50 border border-emerald-300 p-2 text-[11px] text-emerald-950 flex flex-col gap-2 mt-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold">
                      <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>Clave Privada RSA 2048-bit y Pedido CSR generados y protegidos en el sistema.</span>
                    </div>
                    {generatedData?.subject && (
                      <span className="font-mono text-[10px] bg-emerald-100 text-emerald-900 px-1.5 py-0.5 border border-emerald-400">
                        Sujeto: {generatedData.subject}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadFile(
                          `${alias || 'necopos'}_pedido.csr`,
                          generatedData?.csr || ''
                        )
                      }
                      disabled={!generatedData?.csr}
                      className="h-[26px] px-3 bg-white hover:bg-emerald-100 border border-emerald-500 text-emerald-900 font-bold text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar {alias || 'necopos'}_pedido.csr</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadFile(
                          `${alias || 'necopos'}_privada.key`,
                          generatedData?.privateKey || formConfig.privateKey || ''
                        )
                      }
                      className="h-[26px] px-3 bg-white hover:bg-emerald-100 border border-emerald-500 text-emerald-900 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar {alias || 'necopos'}_privada.key (Copia de Respaldo)</span>
                    </button>

                    {generatedData?.csr && (
                      <button
                        type="button"
                        onClick={() => handleCopy(generatedData.csr, 'csr')}
                        className="h-[26px] px-2.5 bg-white hover:bg-emerald-100 border border-emerald-500 text-emerald-900 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        {copiedCsr ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCsr ? 'Copiado' : 'Copiar CSR'}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* PASO 2.2: Instrucciones para subir a ARCA */}
            <div className="border border-[#c4c6cf] p-2.5 bg-[#fbfcfe] flex flex-col gap-1.5">
              <span className="font-bold text-[#002046] text-[11px] uppercase block border-b border-[#c4c6cf] pb-1">
                Paso 2.2: Subir el archivo .csr en la web de ARCA con Clave Fiscal
              </span>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-[#181c1f]">
                <li>
                  Ingresa a <strong>ARCA / AFIP con CUIT y Clave Fiscal</strong> del titular.
                </li>
                <li>
                  Abre el servicio <strong>"Administración de Certificados Digitales"</strong>.
                </li>
                <li>
                  Presiona el botón <strong>"Agregar Alias"</strong>.
                </li>
                <li>
                  En <em>Nombre de Alias</em> coloca exactamente: <strong className="font-mono bg-white px-1 border">{alias || 'necopos'}</strong>.
                </li>
                <li>
                  En <em>Archivo CSR</em>, haz clic en <em>Examinar</em> y selecciona el archivo <strong className="font-mono bg-white px-1 border">{alias || 'necopos'}_pedido.csr</strong> que descargaste arriba.
                </li>
                <li>
                  Haz clic en <strong>"Agregar Alias"</strong>. ARCA validará el pedido y creará tu certificado oficial.
                </li>
                <li>
                  Haz clic en <strong>"Ver / Descargar"</strong> para guardar en tu equipo el archivo <strong>.crt</strong> (ej. <em>{alias || 'necopos'}_certificado.crt</em>).
                </li>
              </ol>
            </div>

            {/* PASO 2.3: Cargar Clave Privada (.key) y Certificado Digital (.crt) */}
            <div className="border border-[#c4c6cf] p-2.5 flex flex-col gap-3">
              <span className="font-bold text-[#002046] text-[11px] uppercase block border-b border-[#c4c6cf] pb-1">
                Paso 2.3: Cargar Archivos de Seguridad (.key y .crt) en NECO POS
              </span>

              {/* SECTION A: Clave Privada (.key) */}
              <div className="bg-[#f7fafe] p-2 border border-[#c4c6cf] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-[#002046] text-[11px]">
                    <Key className="w-3.5 h-3.5 text-amber-700" />
                    <span>A) Clave Privada de Seguridad (.key):</span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 border ${
                      formConfig.hasPrivateKey || formConfig.privateKey || keyInput
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
                        : 'bg-amber-100 text-amber-900 border-amber-400'
                    }`}
                  >
                    {formConfig.hasPrivateKey || formConfig.privateKey || keyInput
                      ? '✅ Clave Privada Cargada en el Sistema'
                      : '⚠️ Clave Privada Pendiente'}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <label className="h-[28px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] font-bold text-[11px] flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-[#002046]" />
                    <span>Subir archivo necopos_privada.key</span>
                    <input
                      type="file"
                      accept=".key,.pem,.txt"
                      onChange={handleKeyFileSelect}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[10.5px] text-[#555]">
                    o pega el texto de tu clave privada (.key) abajo:
                  </span>
                </div>

                <textarea
                  value={keyInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setKeyInput(val);
                    if (val.trim()) {
                      try {
                        localStorage.setItem('necopos_arca_private_key', val.trim());
                      } catch (_) {}
                      setFormConfig((prev) => ({
                        ...prev,
                        privateKey: val.trim(),
                        hasPrivateKey: true,
                      }));
                    } else {
                      try {
                        localStorage.removeItem('necopos_arca_private_key');
                      } catch (_) {}
                      setFormConfig((prev) => ({
                        ...prev,
                        privateKey: '',
                        hasPrivateKey: false,
                      }));
                    }
                  }}
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;MIIEowIBAAKCAQEA...&#10;-----END RSA PRIVATE KEY-----"
                  rows={2}
                  className="w-full p-2 bg-white border border-[#74777f] font-mono text-[10px] text-[#002046] resize-none"
                />
              </div>

              {/* SECTION B: Certificado Oficial (.crt) */}
              <div className="bg-white p-2 border border-[#c4c6cf] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-[#002046] text-[11px]">
                    <FileCheck className="w-3.5 h-3.5 text-blue-700" />
                    <span>B) Certificado Digital Oficial (.crt) emitido por ARCA:</span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 border ${
                      formConfig.hasCertificate || formConfig.certificate || parsedCert?.isValid
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
                        : 'bg-rose-100 text-rose-900 border-rose-400'
                    }`}
                  >
                    {formConfig.hasCertificate || formConfig.certificate || parsedCert?.isValid
                      ? '✅ Certificado Cargado'
                      : '⚠️ Certificado Pendiente'}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <label className="h-[28px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] font-bold text-[11px] flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-[#002046]" />
                    <span>Seleccionar archivo .crt descargado de ARCA</span>
                    <input
                      type="file"
                      accept=".crt,.pem,.cer,.txt"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>

                  <span className="text-[11px] text-gray-500">o pega el texto del certificado abajo:</span>
                </div>

                <textarea
                  value={certInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCertInput(val);
                    if (val.trim()) {
                      setFormConfig((prev) => ({
                        ...prev,
                        certificate: val.trim(),
                        hasCertificate: true,
                      }));
                    } else {
                      setFormConfig((prev) => ({
                        ...prev,
                        certificate: '',
                        hasCertificate: false,
                      }));
                    }
                  }}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;MIID...&#10;-----END CERTIFICATE-----"
                  rows={3}
                  className="w-full p-2 bg-white border border-[#74777f] font-mono text-[10px] text-[#002046] resize-none"
                />

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleValidateCert()}
                    disabled={isParsingCert || !certInput.trim()}
                    className="h-[26px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] font-bold text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <FileCheck className={`w-3.5 h-3.5 ${isParsingCert ? 'animate-spin' : ''}`} />
                    <span>{isParsingCert ? 'Analizando...' : 'Validar Certificado con OpenSSL'}</span>
                  </button>

                  {parsedCert && (
                    <div
                      className={`px-2.5 py-1 text-[11px] font-bold border flex items-center gap-1.5 ${
                        parsedCert.isValid
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                          : 'bg-rose-50 border-rose-400 text-rose-800'
                      }`}
                    >
                      {parsedCert.isValid ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      )}
                      <span>
                        {parsedCert.isValid
                          ? `Certificado X.509 Válido (Vence: ${parsedCert.validTo})`
                          : parsedCert.message}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ETAPA 3: Recordatorio Final */}
            <div className="bg-[#fff9e6] border border-[#e6b800] p-2 text-[11px] text-[#664d03] flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-[#b38600] shrink-0 mt-0.5" />
              <div>
                <strong className="block text-[#4d3a00]">
                  Siguiente paso una vez cargado el certificado (Etapa 3 en ARCA):
                </strong>
                <p className="mt-0.5">
                  Ingresa en ARCA a <strong>"Administrador de Relaciones de Clave Fiscal"</strong> &gt; <strong>"Nueva Relación"</strong> &gt; <strong>"Buscar Servicio"</strong> &gt; <strong>"ARCA - Servicios Web"</strong> &gt; <strong>"Facturación Electrónica" (wsfe)</strong> y asigna como representante el alias <strong className="font-mono">{alias || 'necopos'}</strong>. Luego presiona Guardar Parámetros ARCA abajo.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Modal footer */}
        <div className="flex items-center justify-between pt-1 border-t border-[#c4c6cf]">
          <button
            type="button"
            onClick={onClose}
            className="h-[28px] px-4 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[11px] font-semibold cursor-pointer"
          >
            Cerrar
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="h-[28px] px-5 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Guardar Parámetros y Credenciales ARCA</span>
          </button>
        </div>
      </div>

      <LastVouchersModal
        isOpen={isLastVouchersOpen}
        onClose={() => setIsLastVouchersOpen(false)}
        initialPointOfSale={formConfig.pointsOfSale?.['NECO 1'] || '0017'}
      />
    </WindowsModal>
  );
};

