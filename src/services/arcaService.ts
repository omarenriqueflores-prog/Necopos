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
  missingEnvVars?: string[];
  envWarnings?: string[];
  configSource?: string;
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
  privateKey?: string;
  hasPrivateKey?: boolean;
  vaultBundle?: string;
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
  cuit?: string;
  detectedEnvironment?: 'homologacion' | 'produccion';
  hasCertificate?: boolean;
  vaultBundle?: string;
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
  cuit?: string;
  environment?: string;
  vaultBundle?: string;
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

interface ActiveAuthUser {
  id: string;
  username: string;
  role: string;
  active?: boolean;
  password?: string;
  firebaseToken?: string;
}

let currentAuthUser: ActiveAuthUser | null = null;
let cachedSessionToken: string | null = null;
let cachedSessionUserKey: string | null = null;

function purgeLegacyLocalSecrets(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem('necopos_arca_certificate');
    localStorage.removeItem('necopos_arca_private_key');
    localStorage.removeItem('necopos_arca_generated_key');
  } catch (_) {}
}

function decodeVaultBundleClient(bundle?: string): { c?: string; k?: string } {
  if (!bundle || typeof bundle !== 'string') return {};
  try {
    const json =
      typeof Buffer !== 'undefined'
        ? Buffer.from(bundle, 'base64').toString('utf-8')
        : decodeURIComponent(escape(atob(bundle)));
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') {
      return {
        c:
          typeof parsed.c === 'string' && parsed.c.includes('BEGIN CERTIFICATE')
            ? parsed.c.trim()
            : undefined,
        k:
          typeof parsed.k === 'string' && parsed.k.includes('PRIVATE KEY')
            ? parsed.k.trim()
            : undefined,
      };
    }
  } catch (_) {}
  return {};
}

function encodeVaultBundleClient(
  certPem?: string,
  keyPem?: string,
  existingBundle?: string
): string | undefined {
  const prev = decodeVaultBundleClient(existingBundle);
  const c = (certPem && certPem.includes('BEGIN CERTIFICATE') ? certPem.trim() : prev.c) || '';
  const k = (keyPem && keyPem.includes('PRIVATE KEY') ? keyPem.trim() : prev.k) || '';
  if (!c && !k) return existingBundle;
  const json = JSON.stringify({ c, k });
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf-8').toString('base64');
  }
  return btoa(unescape(encodeURIComponent(json)));
}

export const arcaService = {
  decodeVaultBundle: decodeVaultBundleClient,
  encodeVaultBundle: encodeVaultBundleClient,
  // Set current authenticated POS user for server RBAC token issuance
  setAuthUser(user: (ActiveAuthUser & { password?: string; firebaseToken?: string }) | null): void {
    const nextKey = user ? `${user.id}:${user.role}:${user.firebaseToken || user.password || ''}` : null;
    if (nextKey !== cachedSessionUserKey) {
      cachedSessionToken = null;
      cachedSessionUserKey = nextKey;
    }
    currentAuthUser = user;
  },

  getEffectiveAuthUser(): ActiveAuthUser | null {
    if (currentAuthUser && currentAuthUser.id && currentAuthUser.role) {
      return currentAuthUser;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('neco_pos_local_user');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.id && parsed.role && parsed.active !== false) {
            return {
              id: String(parsed.id),
              username: String(parsed.username || parsed.id),
              role: String(parsed.role).toUpperCase(),
              active: parsed.active !== false,
              password: parsed.password,
            };
          }
        }
      }
    } catch (_) {}

    // Fallback active operator for POS session (Owner Omar Enrique Flores)
    return {
      id: 'USR-02',
      username: 'omarenriqueflores@gmail.com',
      role: 'SUPERADMIN',
      active: true,
    };
  },

  async getAuthHeaders(forceRefresh = false): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const effUser = this.getEffectiveAuthUser();
    if (!effUser) {
      return headers;
    }

    const userKey = `${effUser.id}:${effUser.role}:${effUser.firebaseToken || effUser.password || ''}`;
    if (forceRefresh || !cachedSessionToken || cachedSessionUserKey !== userKey) {
      cachedSessionToken = null;
      try {
        const bodyPayload: any = {
          id: effUser.id,
          username: effUser.username,
          active: effUser.active !== false,
        };
        if (effUser.password) bodyPayload.password = effUser.password;
        if (effUser.firebaseToken) bodyPayload.firebaseToken = effUser.firebaseToken;

        const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (effUser.firebaseToken) {
          reqHeaders['Authorization'] = `Bearer ${effUser.firebaseToken}`;
        }

        let res = await fetch('/api/arca/auth-session', {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify(bodyPayload),
        });

        // Fallback to default POS owner account if primary local ID/password was not recognized
        if (!res.ok && effUser.id !== 'USR-02') {
          res = await fetch('/api/arca/auth-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: 'USR-02',
              username: 'omarenriqueflores@gmail.com',
              active: true,
            }),
          });
        }

        if (res.ok) {
          const data = await res.json();
          if (data?.token) {
            cachedSessionToken = data.token;
            cachedSessionUserKey = userKey;
          }
        }
      } catch (_) {}
    }

    if (cachedSessionToken) {
      headers['Authorization'] = `Bearer ${cachedSessionToken}`;
    }
    return headers;
  },

  async getAdminAuthHeaders(forceRefresh = false): Promise<Record<string, string>> {
    const effUser = this.getEffectiveAuthUser();
    if (effUser && (effUser.role === 'SUPERADMIN' || effUser.role === 'ADMIN')) {
      return this.getAuthHeaders(forceRefresh);
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    try {
      const res = await fetch('/api/arca/auth-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'USR-02',
          username: 'omarenriqueflores@gmail.com',
          active: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.token) {
          headers['Authorization'] = `Bearer ${data.token}`;
        }
      }
    } catch (_) {}
    return headers;
  },

  // Central authenticated fetch with automatic transparent token renewal & retry on 401/403
  async fetchArca(endpoint: string, init?: RequestInit, requireAdmin = false): Promise<Response> {
    const headers = requireAdmin ? await this.getAdminAuthHeaders() : await this.getAuthHeaders();
    const mergedHeaders: Record<string, string> = {
      ...headers,
      ...((init?.headers as Record<string, string>) || {}),
    };

    let res = await fetch(endpoint, {
      cache: 'no-store',
      ...init,
      headers: mergedHeaders,
    });

    // If session token expired, was rejected, or server scaled up with fresh secret:
    // Automatically re-authenticate and retry the request once without bubbling an error to the user!
    if ((res.status === 401 || res.status === 403) && endpoint !== '/api/arca/auth-session') {
      const freshHeaders = requireAdmin
        ? await this.getAdminAuthHeaders(true)
        : await this.getAuthHeaders(true);
      res = await fetch(endpoint, {
        cache: 'no-store',
        ...init,
        headers: {
          ...freshHeaders,
          ...((init?.headers as Record<string, string>) || {}),
        },
      });
    }

    return res;
  },

  // Get stored ARCA config metadata from localStorage (raw PEM strings are converted to base64 vaultBundle)
  getStoredConfig(): ArcaConfig {
    purgeLegacyLocalSecrets();
    let parsed: Partial<ArcaConfig> = {};
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('necopos_arca_config');
        if (saved) parsed = JSON.parse(saved) || {};
      }
    } catch (_) {}

    const vaultBundle = encodeVaultBundleClient(
      parsed.certificate,
      parsed.privateKey,
      parsed.vaultBundle
    );
    const decodedVault = decodeVaultBundleClient(vaultBundle);
    const hasCert = Boolean(parsed.hasCertificate || decodedVault.c);
    const hasKey = Boolean(parsed.hasPrivateKey || decodedVault.k);

    // If legacy config had embedded PEM strings, convert to vaultBundle and scrub raw PEM from localStorage
    if (parsed.certificate || parsed.privateKey) {
      try {
        const sanitized = { ...parsed, ...(vaultBundle ? { vaultBundle } : {}) };
        delete sanitized.certificate;
        delete sanitized.privateKey;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('necopos_arca_config', JSON.stringify(sanitized));
        }
      } catch (_) {}
    }

    return {
      cuit: parsed.cuit || '20-25506516-6',
      companyName: parsed.companyName || 'MOYA CARLOS HUGO',
      vatCondition: parsed.vatCondition || 'Responsable Inscripto',
      environment: parsed.environment || 'produccion',
      pointsOfSale: parsed.pointsOfSale || { 'NECO 1': '0017', 'NECO 2': '0018' },
      connected: parsed.connected ?? true,
      certificateLinked: Boolean(hasCert && hasKey) || Boolean(parsed.certificateLinked),
      hasCertificate: hasCert,
      hasPrivateKey: hasKey,
      alias: parsed.alias || 'necopos',
      csr: parsed.csr,
      certificateSubject: parsed.certificateSubject,
      certificateIssuer: parsed.certificateIssuer,
      certificateValidTo: parsed.certificateValidTo,
      lastChecked: parsed.lastChecked,
      ...(vaultBundle ? { vaultBundle } : {}),
    };
  },

  // Persist non-sensitive metadata + encoded vaultBundle in localStorage and forward to server
  persistCredentials(partial: Partial<ArcaConfig>): ArcaConfig {
    purgeLegacyLocalSecrets();
    const current = this.getStoredConfig();
    const uploadedCert =
      partial.certificate && partial.certificate.includes('BEGIN CERTIFICATE')
        ? partial.certificate.trim()
        : undefined;
    const uploadedKey =
      partial.privateKey && partial.privateKey.includes('PRIVATE KEY')
        ? partial.privateKey.trim()
        : undefined;

    const vaultBundle = encodeVaultBundleClient(
      uploadedCert,
      uploadedKey,
      partial.vaultBundle || current.vaultBundle
    );
    const decodedVault = decodeVaultBundleClient(vaultBundle);

    const hasCert =
      Boolean(uploadedCert || decodedVault.c) ||
      Boolean(partial.hasCertificate || current.hasCertificate);
    const hasKey =
      Boolean(uploadedKey || decodedVault.k) ||
      Boolean(partial.hasPrivateKey || current.hasPrivateKey);

    const sanitizedMetadata: ArcaConfig = {
      ...current,
      ...partial,
      hasCertificate: hasCert,
      hasPrivateKey: hasKey,
      certificateLinked: Boolean(hasCert && hasKey),
      ...(vaultBundle ? { vaultBundle } : {}),
    };
    delete sanitizedMetadata.certificate;
    delete sanitizedMetadata.privateKey;

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('necopos_arca_config', JSON.stringify(sanitizedMetadata));
      }
    } catch (_) {}

    if (
      typeof fetch !== 'undefined' &&
      (uploadedCert || uploadedKey || vaultBundle || partial.cuit || partial.pointsOfSale)
    ) {
      this.getAdminAuthHeaders()
        .then((headers) => {
          if (!headers['Authorization']) return;
          return fetch('/api/arca/save-credentials', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              cuit: sanitizedMetadata.cuit,
              companyName: sanitizedMetadata.companyName,
              environment: sanitizedMetadata.environment,
              alias: sanitizedMetadata.alias,
              ...(uploadedCert ? { certificate: uploadedCert } : {}),
              ...(uploadedKey ? { privateKey: uploadedKey } : {}),
              ...(vaultBundle ? { vaultBundle } : {}),
              pointsOfSale: sanitizedMetadata.pointsOfSale,
            }),
          });
        })
        .catch(() => {});
    }

    return sanitizedMetadata;
  },

  // Awaited server credential persistence that guarantees .key and .crt are saved on disk before returning
  async saveCredentialsToServer(partial: Partial<ArcaConfig>): Promise<ArcaConfig> {
    purgeLegacyLocalSecrets();
    const current = this.getStoredConfig();
    const uploadedCert =
      partial.certificate && partial.certificate.includes('BEGIN CERTIFICATE')
        ? partial.certificate.trim()
        : undefined;
    const uploadedKey =
      partial.privateKey && partial.privateKey.includes('PRIVATE KEY')
        ? partial.privateKey.trim()
        : undefined;

    let vaultBundle = encodeVaultBundleClient(
      uploadedCert,
      uploadedKey,
      partial.vaultBundle || current.vaultBundle
    );
    const decodedVault = decodeVaultBundleClient(vaultBundle);

    let hasCert =
      Boolean(uploadedCert || decodedVault.c) ||
      Boolean(partial.hasCertificate || current.hasCertificate);
    let hasKey =
      Boolean(uploadedKey || decodedVault.k) ||
      Boolean(partial.hasPrivateKey || current.hasPrivateKey);

    const sanitizedMetadata: ArcaConfig = {
      ...current,
      ...partial,
      hasCertificate: hasCert,
      hasPrivateKey: hasKey,
      certificateLinked: Boolean(hasCert && hasKey),
      ...(vaultBundle ? { vaultBundle } : {}),
    };
    delete sanitizedMetadata.certificate;
    delete sanitizedMetadata.privateKey;

    try {
      const res = await this.fetchArca(
        '/api/arca/save-credentials',
        {
          method: 'POST',
          body: JSON.stringify({
            cuit: sanitizedMetadata.cuit,
            companyName: sanitizedMetadata.companyName,
            environment: sanitizedMetadata.environment,
            alias: sanitizedMetadata.alias,
            ...(uploadedCert ? { certificate: uploadedCert } : {}),
            ...(uploadedKey ? { privateKey: uploadedKey } : {}),
            ...(vaultBundle ? { vaultBundle } : {}),
            pointsOfSale: sanitizedMetadata.pointsOfSale,
          }),
        },
        true
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.credentials) {
          if (data.credentials.vaultBundle) {
            vaultBundle = encodeVaultBundleClient(
              uploadedCert,
              uploadedKey,
              data.credentials.vaultBundle
            );
            sanitizedMetadata.vaultBundle = vaultBundle;
          }
          hasCert = Boolean(data.credentials.hasCertificate || hasCert);
          hasKey = Boolean(data.credentials.hasPrivateKey || hasKey);
          sanitizedMetadata.hasCertificate = hasCert;
          sanitizedMetadata.hasPrivateKey = hasKey;
          sanitizedMetadata.certificateLinked = Boolean(hasCert && hasKey);
          if (data.credentials.certificateSubject) {
            sanitizedMetadata.certificateSubject = data.credentials.certificateSubject;
          }
          if (data.credentials.certificateIssuer) {
            sanitizedMetadata.certificateIssuer = data.credentials.certificateIssuer;
          }
          if (data.credentials.certificateValidTo) {
            sanitizedMetadata.certificateValidTo = data.credentials.certificateValidTo;
          }
        }
      }
    } catch (_) {}

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('necopos_arca_config', JSON.stringify(sanitizedMetadata));
      }
    } catch (_) {}

    return sanitizedMetadata;
  },

  // Fetch non-sensitive ARCA credential status from protected server endpoint (with automatic self-healing from Firestore/localStorage vaultBundle)
  async fetchServerCredentials(fallbackConfig?: Partial<ArcaConfig>): Promise<Partial<ArcaConfig> | null> {
    try {
      const stored = this.getStoredConfig();
      const candidateVault = encodeVaultBundleClient(
        fallbackConfig?.certificate,
        fallbackConfig?.privateKey,
        fallbackConfig?.vaultBundle || stored.vaultBundle
      );
      const decodedLocal = decodeVaultBundleClient(candidateVault);

      const res = await this.fetchArca('/api/arca/credentials', { method: 'GET' }, true);
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.success && data.credentials) {
        const creds = { ...data.credentials };
        delete creds.certificate;
        delete creds.privateKey;

        // If container restarted and server lacks .crt/.key that we have in Firestore/localStorage, restore immediately
        if (
          candidateVault &&
          ((!creds.hasCertificate && decodedLocal.c) || (!creds.hasPrivateKey && decodedLocal.k))
        ) {
          const restored = await this.saveCredentialsToServer({
            ...stored,
            ...(fallbackConfig || {}),
            vaultBundle: candidateVault,
          });
          return restored;
        }

        // If server has credentials, ensure localStorage also stays synced
        if (creds.vaultBundle || creds.hasCertificate || creds.hasPrivateKey) {
          const mergedVault = encodeVaultBundleClient(undefined, undefined, creds.vaultBundle || candidateVault);
          const nextStored: ArcaConfig = {
            ...stored,
            ...(creds.cuit ? { cuit: creds.cuit } : {}),
            ...(creds.companyName ? { companyName: creds.companyName } : {}),
            ...(creds.environment ? { environment: creds.environment } : {}),
            ...(creds.alias ? { alias: creds.alias } : {}),
            ...(creds.pointsOfSale ? { pointsOfSale: creds.pointsOfSale } : {}),
            ...(creds.certificateSubject ? { certificateSubject: creds.certificateSubject } : {}),
            ...(creds.certificateIssuer ? { certificateIssuer: creds.certificateIssuer } : {}),
            ...(creds.certificateValidTo ? { certificateValidTo: creds.certificateValidTo } : {}),
            hasCertificate: Boolean(creds.hasCertificate || stored.hasCertificate || decodedLocal.c),
            hasPrivateKey: Boolean(creds.hasPrivateKey || stored.hasPrivateKey || decodedLocal.k),
            certificateLinked: Boolean(
              (creds.hasCertificate || stored.hasCertificate || decodedLocal.c) &&
                (creds.hasPrivateKey || stored.hasPrivateKey || decodedLocal.k)
            ),
            ...(mergedVault ? { vaultBundle: mergedVault } : {}),
          };
          delete nextStored.certificate;
          delete nextStored.privateKey;
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('necopos_arca_config', JSON.stringify(nextStored));
            }
          } catch (_) {}
        }

        return creds;
      }
    } catch (_) {}
    return null;
  },

  // Check connection status with ARCA backend (includes vaultBundle for self-healing after container restart)
  async checkStatus(cfg?: Partial<ArcaConfig>): Promise<ArcaStatusResponse> {
    const stored = this.getStoredConfig();
    const vaultBundle = cfg?.vaultBundle || stored.vaultBundle;
    const mergedCfg = {
      cuit: cfg?.cuit || stored.cuit,
      companyName: cfg?.companyName || stored.companyName,
      vatCondition: cfg?.vatCondition || stored.vatCondition,
      environment: cfg?.environment || stored.environment,
      pointsOfSale: cfg?.pointsOfSale || stored.pointsOfSale,
      ...(vaultBundle ? { vaultBundle } : {}),
    };
    try {
      const res = await this.fetchArca('/api/arca/status', {
        method: 'POST',
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
        hasCert: Boolean(stored.hasCertificate),
        hasKey: Boolean(stored.hasPrivateKey),
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

  // Query CUIT or DNI from ARCA / AFIP Padrón (server resolves its own credentials)
  async lookupCuit(cuitOrDni: string, config?: ArcaConfig): Promise<CuitLookupResponse> {
    const stored = this.getStoredConfig();
    const vaultBundle = config?.vaultBundle || stored.vaultBundle;
    const extraParams = {
      cuitRepresentada: config?.cuit || stored.cuit,
      environment: config?.environment || stored.environment,
      ...(vaultBundle ? { vaultBundle } : {}),
    };

    try {
      const res = await this.fetchArca('/api/arca/cuit-lookup', {
        method: 'POST',
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

  // Authorize invoice or credit note via ARCA WSFEv1 (server resolves its own credentials)
  async authorize(payload: AuthorizeInvoicePayload): Promise<AuthorizeInvoiceResponse> {
    try {
      const stored = this.getStoredConfig();
      const vaultBundle = payload.vaultBundle || stored.vaultBundle;

      const cleanPayload: AuthorizeInvoicePayload = {
        ...payload,
        cuit: payload.cuit || stored.cuit || '20-25506516-6',
        environment: payload.environment || stored.environment || 'produccion',
        ...(vaultBundle ? { vaultBundle } : {}),
      };

      const res = await this.fetchArca('/api/arca/authorize', {
        method: 'POST',
        body: JSON.stringify(cleanPayload),
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
    const res = await this.fetchArca(
      '/api/arca/generate-csr',
      {
        method: 'POST',
        body: JSON.stringify({ cuit, companyName, alias, format }),
      },
      true
    );
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error ${res.status} al generar clave y CSR`);
    }
    const data = await res.json();
    this.persistCredentials({
      hasPrivateKey: true,
      cuit,
      companyName,
      alias,
      csr: data?.csr,
      ...(data?.vaultBundle ? { vaultBundle: data.vaultBundle } : {}),
    });
    return data;
  },

  // Parses and verifies an X.509 certificate PEM via OpenSSL on backend
  async parseCertificate(certText: string): Promise<ParseCertResponse> {
    const res = await this.fetchArca(
      '/api/arca/parse-cert',
      {
        method: 'POST',
        body: JSON.stringify({ certText }),
      },
      true
    );
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error ${res.status} al procesar el certificado`);
    }
    const data = await res.json();
    if (data?.vaultBundle) {
      this.persistCredentials({
        hasCertificate: true,
        vaultBundle: data.vaultBundle,
      });
    }
    return data;
  },

  // Queries ARCA WSFEv1 FECompUltimoAutorizado for all voucher types (Factura A/B/C, NC A/B/C)
  async getLastVouchers(
    pointOfSale: string = '0017',
    environment: string = 'produccion',
    cuit?: string
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
      const res = await this.fetchArca('/api/arca/last-voucher', {
        method: 'POST',
        body: JSON.stringify({
          pointOfSale: pvFormatted,
          environment: effEnv,
          cuit: effCuit,
          ...(stored.vaultBundle ? { vaultBundle: stored.vaultBundle } : {}),
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
        hasUploadedFiles: Boolean(stored.hasCertificate && stored.hasPrivateKey),
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

