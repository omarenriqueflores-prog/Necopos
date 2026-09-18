import {
  ElectronicInvoice,
  ElectronicInvoiceItem,
  ArcaCbteTipo,
  ArcaCbteLetra,
  ArcaCbteNombre,
  Customer,
  ArcaConfig,
} from '../types/pos';

export interface ArcaStatusResponse {
  success: boolean;
  connected: boolean;
  environment: 'homologacion' | 'produccion';
  cuit: string;
  companyName: string;
  vatCondition: string;
  hasCert: boolean;
  hasKey: boolean;
  authMethod: string;
  activePvs: Array<{ branch: string; pv: string; address: string; status: string }>;
  timestamp: string;
  message: string;
}

export interface CuitLookupResponse {
  success: boolean;
  source: string;
  data: {
    name: string;
    cuit: string;
    vatCondition: 'Resp. Inscripto' | 'Monotributo' | 'Cons. Final' | 'Exento';
    address: string;
    state: string;
    phone?: string;
    activity?: string;
    wsStatus?: string;
  };
  error?: string;
  wsError?: string;
  hasCredentials?: boolean;
}

export interface GenerateCsrResponse {
  success: boolean;
  privateKey: string;
  csr: string;
  subject: string;
  alias: string;
  cuit: string;
  companyName: string;
  generatedAt: string;
  error?: string;
}

export interface ParseCertResponse {
  success: boolean;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  serial: string;
  isExpired: boolean;
  isValid: boolean;
  message: string;
  error?: string;
}

export interface AuthorizeInvoicePayload {
  branchId: 'NECO 1' | 'NECO 2';
  pointOfSale: string;
  cbteTipo: ArcaCbteTipo;
  cbteNumero?: number;
  customer: {
    name: string;
    cuitDni: string;
    vatCondition: string;
    address?: string;
  };
  items: ElectronicInvoiceItem[];
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  associatedInvoice?: {
    id: string;
    number: string;
    cbteNumero?: number;
    cbteTipo: number;
    pointOfSale: string;
    date: string;
  };
  creditNoteReason?: string;
  creditNoteType?: 'TOTAL' | 'PARCIAL';
  simulateError?: boolean;
  certificate?: string;
  privateKey?: string;
  cuit?: string;
  environment?: string;
}

export interface AuthorizeInvoiceResponse {
  success: boolean;
  status: 'AUTORIZADO' | 'RECHAZADO' | 'PENDIENTE';
  cae?: string;
  caeVto?: string;
  qrUrl?: string;
  qrPayload?: Record<string, any>;
  environment?: 'homologacion' | 'produccion';
  authorizedAt?: string;
  error?: string;
  message?: string;
}

export const arcaService = {
  // Get stored ARCA config from localStorage or defaults
  getStoredConfig(): ArcaConfig {
    try {
      const saved = localStorage.getItem('necopos_arca_config');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return {
      cuit: '30714892019',
      companyName: 'Carnicerías Neco S.R.L.',
      vatCondition: 'Responsable Inscripto',
      environment: 'homologacion',
      pointsOfSale: { 'NECO 1': '0017', 'NECO 2': '0018' },
      connected: true,
    };
  },

  // Check connection status with ARCA backend
  async checkStatus(cfg?: Partial<ArcaConfig>): Promise<ArcaStatusResponse> {
    try {
      const res = await fetch('/api/arca/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg || {}),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        connected: false,
        environment: cfg?.environment || 'homologacion',
        cuit: cfg?.cuit || '20-25506516-6',
        companyName: cfg?.companyName || 'Carlos Hugo Moya',
        vatCondition: cfg?.vatCondition || 'Responsable Inscripto',
        hasCert: Boolean(cfg?.certificate || cfg?.hasCertificate),
        hasKey: Boolean(cfg?.privateKey || cfg?.hasPrivateKey),
        authMethod: 'Offline / En espera',
        activePvs: [
          { branch: 'NECO 1', pv: cfg?.pointsOfSale?.['NECO 1'] || '0017', address: '24 de Septiembre', status: 'PENDIENTE' },
          { branch: 'NECO 2', pv: cfg?.pointsOfSale?.['NECO 2'] || '0018', address: 'Villa Saavedra', status: 'PENDIENTE' },
        ],
        timestamp: new Date().toISOString(),
        message: err.message || 'Servidor ARCA no disponible',
      };
    }
  },

  // Query CUIT or DNI from ARCA / AFIP Padrón
  async lookupCuit(cuitOrDni: string, config?: ArcaConfig): Promise<CuitLookupResponse> {
    let extraParams: Record<string, any> = {};
    if (config) {
      extraParams = {
        certificate: config.certificate,
        privateKey: config.privateKey,
        cuitRepresentada: config.cuit,
        environment: config.environment,
      };
    } else {
      try {
        const saved = localStorage.getItem('necopos_arca_config');
        if (saved) {
          const parsed = JSON.parse(saved);
          extraParams = {
            certificate: parsed.certificate,
            privateKey: parsed.privateKey,
            cuitRepresentada: parsed.cuit,
            environment: parsed.environment,
          };
        }
      } catch (_) {}
    }

    try {
      const res = await fetch('/api/arca/cuit-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuit: cuitOrDni, ...extraParams }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo consultar el CUIT en ARCA');
      }
      return data;
    } catch (err: any) {
      console.warn('arcaService.lookupCuit error:', err.message);
      throw new Error(err.message === 'Failed to fetch' ? 'Servidor de Padrón ARCA/AFIP fuera de línea. Ingrese los datos manualmente.' : err.message);
    }
  },

  // Authorize invoice or credit note via ARCA WSFEv1
  async authorize(payload: AuthorizeInvoicePayload): Promise<AuthorizeInvoiceResponse> {
    try {
      let extraParams: Record<string, any> = {};
      try {
        const saved = localStorage.getItem('necopos_arca_config');
        const savedKey = localStorage.getItem('necopos_arca_private_key');
        if (saved) {
          const parsed = JSON.parse(saved);
          extraParams = {
            certificate: parsed.certificate,
            privateKey: parsed.privateKey || savedKey || '',
            cuit: parsed.cuit,
            environment: parsed.environment,
          };
        } else if (savedKey) {
          extraParams.privateKey = savedKey;
        }
      } catch (_) {}

      const fullPayload = { ...extraParams, ...payload };
      if (!fullPayload.privateKey) {
        try {
          const savedKey = localStorage.getItem('necopos_arca_private_key');
          if (savedKey) fullPayload.privateKey = savedKey;
        } catch (_) {}
      }

      const res = await fetch('/api/arca/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullPayload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          status: 'RECHAZADO',
          error: data.error || 'Rechazado por ARCA',
        };
      }
      return data;
    } catch (err: any) {
      return {
        success: false,
        status: 'PENDIENTE',
        error: `Fallo de conexión: ${err.message}. La venta fue preservada localmente.`,
      };
    }
  },

  // Determine next sequential number for given Point of Sale and CbteTipo
  getNextNumber(
    existingInvoices: ElectronicInvoice[],
    pointOfSale: string,
    cbteTipo: ArcaCbteTipo
  ): number {
    const relevant = existingInvoices.filter(
      (inv) => inv.pointOfSale === pointOfSale && inv.cbteTipo === cbteTipo
    );
    if (relevant.length === 0) {
      return 1;
    }
    const maxNumber = Math.max(...relevant.map((i) => i.cbteNumero));
    return maxNumber + 1;
  },

  // Suggest official comprobante type based on customer vat condition
  suggestInvoiceType(customerVatCondition?: string): {
    cbteTipo: ArcaCbteTipo;
    cbteLetra: ArcaCbteLetra;
    cbteNombre: ArcaCbteNombre;
    description: string;
  } {
    if (customerVatCondition === 'Resp. Inscripto') {
      return {
        cbteTipo: 1,
        cbteLetra: 'A',
        cbteNombre: 'Factura A',
        description: 'Receptor Responsable Inscripto con CUIT (Discrimina IVA 21% / 10.5%)',
      };
    }
    return {
      cbteTipo: 6,
      cbteLetra: 'B',
      cbteNombre: 'Factura B',
      description: 'Consumidor Final, Monotributista o Exento (IVA incluido / alícuota general)',
    };
  },

  // Format PV and Number: e.g. "0001-00000125"
  formatCbteNumber(pointOfSale: string, number: number): string {
    const pvPadded = pointOfSale.padStart(4, '0').slice(-4);
    const numPadded = number.toString().padStart(8, '0');
    return `${pvPadded}-${numPadded}`;
  },

  // Official ARCA QR URL generator fallback
  buildArcaQrUrl(
    emisorCuit: string,
    pointOfSale: string,
    cbteTipo: number,
    cbteNumero: number,
    total: number,
    docTipo: number,
    docNumero: string,
    cae: string,
    fechaIso: string
  ): string {
    const cleanEmisor = parseInt(emisorCuit.replace(/\D/g, ''), 10) || 20255065166;
    const cleanPtoVta = parseInt(pointOfSale, 10) || 1;
    const cleanDoc = parseInt(docNumero.replace(/\D/g, ''), 10) || 0;
    const cleanCae = parseInt(cae.replace(/\D/g, ''), 10) || 0;

    const payload = {
      ver: 1,
      fecha: fechaIso,
      cuit: cleanEmisor,
      ptoVta: cleanPtoVta,
      tipoCmp: cbteTipo,
      nroCmp: cbteNumero,
      importe: Number(total.toFixed(2)),
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: docTipo,
      nroDocRec: cleanDoc,
      tipoCodAut: 'E',
      codAut: cleanCae,
    };

    const b64 = btoa(JSON.stringify(payload));
    return `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
  },

  // Generates 2048-bit RSA Private Key & Certificate Signing Request (CSR) via OpenSSL on backend
  async generateKeyAndCsr(
    cuit: string,
    companyName: string,
    alias: string,
    format: 'exact' | 'full' = 'exact'
  ): Promise<GenerateCsrResponse> {
    const res = await fetch('/api/arca/generate-csr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cuit, companyName, alias, format }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error ${res.status} al generar clave y CSR`);
    }
    return res.json();
  },

  // Parses and verifies an X.509 certificate PEM via OpenSSL on backend
  async parseCertificate(certText: string): Promise<ParseCertResponse> {
    const res = await fetch('/api/arca/parse-cert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certText }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error ${res.status} al procesar el certificado`);
    }
    return res.json();
  },

  // Queries ARCA WSFEv1 FECompUltimoAutorizado for all voucher types (Factura A/B/C, NC A/B/C)
  async getLastVouchers(
    pointOfSale: string = '0001',
    environment: string = 'homologacion',
    cuit?: string,
    certificate?: string,
    privateKey?: string
  ): Promise<{
    success: boolean;
    pointOfSale: string;
    environment: string;
    cuit: string;
    hasCredentials: boolean;
    vouchers: Array<{
      cbteTipo: number;
      cbteNombre: string;
      cbteLetra: string;
      lastNumber: number;
      nextNumber: number;
      formattedLast: string;
      formattedNext: string;
      source: string;
      status: string;
      lastChecked: string;
    }>;
    checkedAt: string;
    message?: string;
  }> {
    const ptoVtaNum = parseInt(String(pointOfSale).replace(/\D/g, ''), 10) || 1;
    const pvFormatted = ptoVtaNum.toString().padStart(4, '0');
    const typesToQuery = [
      { cbteTipo: 1, cbteNombre: 'Factura A', cbteLetra: 'A' },
      { cbteTipo: 6, cbteNombre: 'Factura B', cbteLetra: 'B' },
      { cbteTipo: 3, cbteNombre: 'Nota de Crédito A', cbteLetra: 'A' },
      { cbteTipo: 8, cbteNombre: 'Nota de Crédito B', cbteLetra: 'B' },
      { cbteTipo: 2, cbteNombre: 'Nota de Débito A', cbteLetra: 'A' },
      { cbteTipo: 7, cbteNombre: 'Nota de Débito B', cbteLetra: 'B' },
      { cbteTipo: 11, cbteNombre: 'Factura C', cbteLetra: 'C' },
      { cbteTipo: 13, cbteNombre: 'Nota de Crédito C', cbteLetra: 'C' },
    ];

    try {
      const res = await fetch('/api/arca/last-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pointOfSale,
          environment,
          cuit,
          certificate,
          privateKey,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err: any) {
      console.warn('arcaService.getLastVouchers fallback engaged:', err.message);
      return {
        success: true,
        pointOfSale: pvFormatted,
        environment: environment || 'homologacion',
        cuit: cuit || '30714892019',
        hasCredentials: Boolean(certificate && privateKey),
        vouchers: typesToQuery.map((t) => ({
          cbteTipo: t.cbteTipo,
          cbteNombre: t.cbteNombre,
          cbteLetra: t.cbteLetra,
          lastNumber: 0,
          nextNumber: 1,
          formattedLast: `${pvFormatted}-00000000`,
          formattedNext: `${pvFormatted}-00000001`,
          source: 'REGISTRO_LOCAL_CONTINGENCIA',
          status: 'SECUENCIA_POS_LOCAL',
          lastChecked: new Date().toISOString(),
        })),
        checkedAt: new Date().toISOString(),
        message: 'Modo contingencia local activo (Servidor AFIP/ARCA no disponible).',
      };
    }
  },
};
