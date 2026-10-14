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
  cbteNumero?: number;
  qrUrl?: string;
  qrPayload?: Record<string, any>;
  environment?: 'homologacion' | 'produccion';
  authorizedAt?: string;
  error?: string;
  message?: string;
}

export const arcaService = {
  // Get stored ARCA config from localStorage (merging dedicated cert/key backups) or defaults
  getStoredConfig(): ArcaConfig {
    let parsed: Partial<ArcaConfig> = {};
    try {
      const saved = localStorage.getItem('necopos_arca_config');
      if (saved) parsed = JSON.parse(saved) || {};
    } catch (_) {}

    let savedCert = '';
    let savedKey = '';
    try {
      savedCert =
        localStorage.getItem('necopos_arca_certificate') ||
        (parsed.certificate && parsed.certificate.includes('BEGIN CERTIFICATE') ? parsed.certificate : '') ||
        '';
      savedKey =
        localStorage.getItem('necopos_arca_private_key') ||
        localStorage.getItem('necopos_arca_generated_key') ||
        (parsed.privateKey && parsed.privateKey.includes('PRIVATE KEY') ? parsed.privateKey : '') ||
        '';
    } catch (_) {}

    const cert = (parsed.certificate && parsed.certificate.includes('BEGIN CERTIFICATE'))
      ? parsed.certificate
      : savedCert;
    const key = (parsed.privateKey && parsed.privateKey.includes('PRIVATE KEY'))
      ? parsed.privateKey
      : savedKey;

    return {
      cuit: parsed.cuit || '20-25506516-6',
      companyName: parsed.companyName || 'MOYA CARLOS HUGO',
      vatCondition: parsed.vatCondition || 'Responsable Inscripto',
      environment: parsed.environment || 'produccion',
      pointsOfSale: parsed.pointsOfSale || { 'NECO 1': '0017', 'NECO 2': '0018' },
      connected: parsed.connected ?? true,
      certificateLinked: Boolean(cert && key) || Boolean(parsed.certificateLinked),
      hasCertificate: Boolean(cert) || Boolean(parsed.hasCertificate),
      hasPrivateKey: Boolean(key) || Boolean(parsed.hasPrivateKey),
      certificate: cert || undefined,
      privateKey: key || undefined,
      alias: parsed.alias || 'necopos',
      csr: parsed.csr,
      certificateSubject: parsed.certificateSubject,
      certificateIssuer: parsed.certificateIssuer,
      certificateValidTo: parsed.certificateValidTo,
      lastChecked: parsed.lastChecked,
    };
  },

  // Persist credentials across all localStorage keys and backend storage
  persistCredentials(partial: Partial<ArcaConfig>): ArcaConfig {
    const current = this.getStoredConfig();
    const nextCert =
      partial.certificate && partial.certificate.includes('BEGIN CERTIFICATE')
        ? partial.certificate.trim()
        : current.certificate;
    const nextKey =
      partial.privateKey && partial.privateKey.includes('PRIVATE KEY')
        ? partial.privateKey.trim()
        : current.privateKey;

    const merged: ArcaConfig = {
      ...current,
      ...partial,
      certificate: nextCert,
      privateKey: nextKey,
      hasCertificate: Boolean(nextCert),
      hasPrivateKey: Boolean(nextKey),
      certificateLinked: Boolean(nextCert && nextKey),
    };

    try {
      if (nextCert) {
        localStorage.setItem('necopos_arca_certificate', nextCert);
      }
      if (nextKey) {
        localStorage.setItem('necopos_arca_private_key', nextKey);
        localStorage.setItem('necopos_arca_generated_key', nextKey);
      }
      localStorage.setItem('necopos_arca_config', JSON.stringify(merged));
    } catch (_) {}

    // Fire-and-forget sync to backend disk storage
    fetch('/api/arca/save-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cuit: merged.cuit,
        companyName: merged.companyName,
        environment: merged.environment,
        alias: merged.alias,
        certificate: merged.certificate,
        privateKey: merged.privateKey,
        pointsOfSale: merged.pointsOfSale,
      }),
    }).catch(() => {});

    return merged;
  },

  // Fetch server-stored ARCA credentials (if any) to recover after browser/DB resets
  async fetchServerCredentials(): Promise<Partial<ArcaConfig> | null> {
    try {
      const res = await fetch('/api/arca/credentials');
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.success && data.credentials) {
        return data.credentials;
      }
    } catch (_) {}
    return null;
  },

  // Check connection status with ARCA backend
  async checkStatus(cfg?: Partial<ArcaConfig>): Promise<ArcaStatusResponse> {
    const stored = this.getStoredConfig();
    const mergedCfg = {
      ...stored,
      ...(cfg || {}),
      certificate: cfg?.certificate || stored.certificate,
      privateKey: cfg?.privateKey || stored.privateKey,
    };
    try {
      const res = await fetch('/api/arca/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mergedCfg),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        connected: false,
        environment: mergedCfg.environment || 'produccion',
        cuit: mergedCfg.cuit || '20-25506516-6',
        companyName: mergedCfg.companyName || 'MOYA CARLOS HUGO',
        vatCondition: mergedCfg.vatCondition || 'Responsable Inscripto',
        hasCert: Boolean(mergedCfg.certificate || mergedCfg.hasCertificate),
        hasKey: Boolean(mergedCfg.privateKey || mergedCfg.hasPrivateKey),
        authMethod: 'Offline / En espera',
        activePvs: [
          { branch: 'NECO 1', pv: mergedCfg.pointsOfSale?.['NECO 1'] || '0017', address: '24 de Septiembre', status: 'PENDIENTE' },
          { branch: 'NECO 2', pv: mergedCfg.pointsOfSale?.['NECO 2'] || '0018', address: 'Villa Saavedra', status: 'PENDIENTE' },
        ],
        timestamp: new Date().toISOString(),
        message: err.message || 'Servidor ARCA no disponible',
      };
    }
  },

  // Query CUIT or DNI from ARCA / AFIP Padrón
  async lookupCuit(cuitOrDni: string, config?: ArcaConfig): Promise<CuitLookupResponse> {
    const stored = this.getStoredConfig();
    const extraParams = {
      certificate: config?.certificate || stored.certificate,
      privateKey: config?.privateKey || stored.privateKey,
      cuitRepresentada: config?.cuit || stored.cuit,
      environment: config?.environment || stored.environment,
    };

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
      const stored = this.getStoredConfig();

      const fullPayload: AuthorizeInvoicePayload = {
        ...payload,
        certificate: payload.certificate || stored.certificate || '',
        privateKey: payload.privateKey || stored.privateKey || '',
        cuit: payload.cuit || stored.cuit || '20-25506516-6',
        environment: payload.environment || stored.environment || 'produccion',
      };

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
        status: 'RECHAZADO',
        error: `Fallo de conexión con el servidor ARCA: ${err.message}`,
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
    const data = await res.json();
    if (data?.privateKey) {
      this.persistCredentials({ privateKey: data.privateKey, cuit, companyName, alias });
    }
    return data;
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
    pointOfSale: string = '0017',
    environment: string = 'produccion',
    cuit?: string,
    certificate?: string,
    privateKey?: string
  ): Promise<{
    success: boolean;
    pointOfSale: string;
    environment: string;
    cuit: string;
    hasCredentials: boolean;
    hasUploadedFiles?: boolean;
    wsaaError?: string;
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
      afipError?: string;
      lastChecked: string;
    }>;
    checkedAt: string;
    message?: string;
  }> {
    const stored = this.getStoredConfig();
    const ptoVtaNum = parseInt(String(pointOfSale).replace(/\D/g, ''), 10) || 17;
    const pvFormatted = ptoVtaNum.toString().padStart(4, '0');
    const effCert = certificate || stored.certificate;
    const effKey = privateKey || stored.privateKey;
    const effCuit = cuit || stored.cuit || '20-25506516-6';
    const effEnv = environment || stored.environment || 'produccion';

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
          pointOfSale: pvFormatted,
          environment: effEnv,
          cuit: effCuit,
          certificate: effCert,
          privateKey: effKey,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err: any) {
      console.warn('arcaService.getLastVouchers error:', err.message);
      return {
        success: false,
        pointOfSale: pvFormatted,
        environment: effEnv,
        cuit: effCuit,
        hasCredentials: false,
        hasUploadedFiles: Boolean(effCert && effKey),
        wsaaError: err.message,
        vouchers: typesToQuery.map((t) => ({
          cbteTipo: t.cbteTipo,
          cbteNombre: t.cbteNombre,
          cbteLetra: t.cbteLetra,
          lastNumber: 0,
          nextNumber: 1,
          formattedLast: `${pvFormatted}-00000000`,
          formattedNext: `${pvFormatted}-00000001`,
          source: 'SIN_CONEXION_ARCA',
          status: 'SIN_CERTIFICADO_ACTIVO',
          afipError: err.message,
          lastChecked: new Date().toISOString(),
        })),
        checkedAt: new Date().toISOString(),
        message: `Error al conectar con ARCA: ${err.message}`,
      };
    }
  },
};

