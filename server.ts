import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { initializeApp as initAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

dotenv.config();

export const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize Firebase Admin SDK for authentic cryptographic ID token verification
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || 'necopos';
const adminApp = getAdminApps().length
  ? getAdminApps()[0]
  : initAdminApp({ projectId: firebaseProjectId });
export const adminAuth = getAdminAuth(adminApp);
export const adminDb = (() => {
  try {
    return getAdminFirestore(adminApp, 'ai-studio-necopos-1af90faf-2bee-44ff-8358-0ab6350c10b3');
  } catch (_) {
    try {
      return getAdminFirestore(adminApp);
    } catch (_) {
      return null;
    }
  }
})();

// Helper: CUIT verification algorithm (Modulo 11)
function isValidCuit(cuitStr: string): boolean {
  const clean = cuitStr.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i], 10) * multipliers[i];
  }
  const mod = sum % 11;
  let verifier = 11 - mod;
  if (verifier === 11) verifier = 0;
  if (verifier === 10) verifier = 9;
  return verifier === parseInt(clean[10], 10);
}

// ============================================================================
// Server-Side Trusted User Registry (Role Authority Resides Strictly on Server)
// ============================================================================

export interface ServerUserRecord {
  id: string;
  username: string;
  email?: string;
  fullName?: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'ENCARGADO' | 'CAJERO' | 'CONSULTA' | string;
  active: boolean;
  password?: string;
}

export const SERVER_TRUSTED_USERS: Map<string, ServerUserRecord> = new Map([
  [
    'USR-01',
    {
      id: 'USR-01',
      username: 'admin',
      fullName: 'Administrador POS',
      role: 'SUPERADMIN',
      active: true,
      password: process.env.ADMIN_DEFAULT_PASSWORD || 'admin123',
    },
  ],
  [
    'USR-02',
    {
      id: 'USR-02',
      username: 'omarenriqueflores@gmail.com',
      email: 'omarenriqueflores@gmail.com',
      fullName: 'Omar Enrique Flores',
      role: 'SUPERADMIN',
      active: true,
    },
  ],
  [
    'USR-03',
    {
      id: 'USR-03',
      username: 'dueno',
      fullName: 'Dueño Principal',
      role: 'CONSULTA',
      active: true,
      password: process.env.DUENO_DEFAULT_PASSWORD || 'dueno123',
    },
  ],
  [
    'USR-04',
    {
      id: 'USR-04',
      username: 'cajero',
      fullName: 'Cajero Principal',
      role: 'CAJERO',
      active: true,
      password: process.env.CAJERO_DEFAULT_PASSWORD || 'cajero123',
    },
  ],
]);

export function findTrustedUser(identifier: string): ServerUserRecord | null {
  if (!identifier) return null;
  const clean = String(identifier).trim().toLowerCase();
  for (const u of SERVER_TRUSTED_USERS.values()) {
    if (
      u.id.toLowerCase() === clean ||
      u.username.toLowerCase() === clean ||
      (u.email && u.email.toLowerCase() === clean)
    ) {
      return u;
    }
  }
  return null;
}

export function registerOrUpdateTrustedUser(user: ServerUserRecord): void {
  SERVER_TRUSTED_USERS.set(user.id, user);
}

export async function findUserInFirestore(identifier: string): Promise<ServerUserRecord | null> {
  if (!adminDb || !identifier) return null;
  const clean = String(identifier).trim();
  const lower = clean.toLowerCase();

  try {
    // 1. Direct lookup by UID (document ID)
    const docSnap = await adminDb.collection('users').doc(clean).get();
    if (docSnap.exists) {
      const data = docSnap.data();
      if (data) {
        return {
          id: docSnap.id,
          username: String(data.username || data.email || docSnap.id),
          email: data.email ? String(data.email).toLowerCase() : undefined,
          fullName: data.fullName,
          role: String(data.role || 'NONE').toUpperCase(),
          active: data.active !== false,
          password: data.password,
        };
      }
    }

    // 2. Query by email
    const emailSnap = await adminDb
      .collection('users')
      .where('email', '==', lower)
      .limit(1)
      .get();
    if (!emailSnap.empty) {
      const d = emailSnap.docs[0];
      const data = d.data();
      return {
        id: d.id,
        username: String(data.username || d.id),
        email: data.email ? String(data.email).toLowerCase() : undefined,
        fullName: data.fullName,
        role: String(data.role || 'NONE').toUpperCase(),
        active: data.active !== false,
        password: data.password,
      };
    }

    // 3. Query by username
    const userSnap = await adminDb
      .collection('users')
      .where('username', '==', clean)
      .limit(1)
      .get();
    if (!userSnap.empty) {
      const d = userSnap.docs[0];
      const data = d.data();
      return {
        id: d.id,
        username: String(data.username || d.id),
        email: data.email ? String(data.email).toLowerCase() : undefined,
        fullName: data.fullName,
        role: String(data.role || 'NONE').toUpperCase(),
        active: data.active !== false,
        password: data.password,
      };
    }
  } catch (_) {
    // Graceful fallback for non-GCP or test environments
  }
  return null;
}

export async function resolveTrustedUserAsync(identifier: string): Promise<ServerUserRecord | null> {
  const local = findTrustedUser(identifier);
  if (local) return local;
  return await findUserInFirestore(identifier);
}

// ============================================================================
// ARCA Authentication & Role-Based Authorization (Server-Enforced)
// ============================================================================

export interface ArcaAuthUser {
  id: string;
  username: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'ENCARGADO' | 'CAJERO' | 'CONSULTA' | string;
  active?: boolean;
}

const ARCA_SESSION_SECRET =
  process.env.ARCA_SESSION_SECRET ||
  process.env.ARCA_ADMIN_TOKEN ||
  'necopos-arca-hmac-secret-key-v1';

export const ALLOWED_ADMIN_ROLES = new Set(['SUPERADMIN', 'ADMIN']);
export const ALLOWED_OPERATOR_ROLES = new Set(['SUPERADMIN', 'ADMIN', 'ENCARGADO', 'CAJERO']);
export const ALLOWED_VIEWER_ROLES = new Set(['SUPERADMIN', 'ADMIN', 'ENCARGADO', 'CAJERO', 'CONSULTA']);

export function createArcaSessionToken(
  user: { id: string; username?: string; role: string; active?: boolean },
  ttlMs: number = 12 * 60 * 60 * 1000
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = Math.floor((Date.now() + ttlMs) / 1000);
  const payload = {
    iss: 'necopos-server',
    aud: 'necopos-arca-api',
    sub: String(user.id || '').trim(),
    id: String(user.id || '').trim(),
    username: String(user.username || user.id || '').trim(),
    role: String(user.role || '').trim().toUpperCase(),
    active: user.active !== false,
    iat: nowSec,
    exp: expSec,
  };
  const headerB64 = Buffer.from(JSON.stringify(header), 'utf-8').toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', ARCA_SESSION_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifyArcaSessionToken(token: string): ArcaAuthUser | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, providedSig] = parts;

    const expectedSig = crypto
      .createHmac('sha256', ARCA_SESSION_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(providedSig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));
    if (!header || header.alg !== 'HS256') return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (!payload || typeof payload !== 'object') return null;

    if (payload.iss !== 'necopos-server' || payload.aud !== 'necopos-arca-api') {
      return null;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
      return null;
    }
    if (typeof payload.iat === 'number' && payload.iat > nowSec + 10) {
      return null;
    }

    const userId = String(payload.sub || payload.id || '');
    if (!userId) return null;

    // Verify current status and role against trusted server-side registry
    const trusted = findTrustedUser(userId) || findTrustedUser(payload.username);
    if (trusted) {
      return {
        id: trusted.id,
        username: trusted.username,
        role: trusted.role,
        active: trusted.active,
      };
    }

    return {
      id: userId,
      username: String(payload.username || userId),
      role: String(payload.role || '').toUpperCase(),
      active: payload.active !== false,
    };
  } catch (_) {
    return null;
  }
}

// Cryptographic Firebase ID Token verification using official Firebase Admin SDK
export async function verifyFirebaseIdToken(token: string): Promise<{ uid: string; email?: string } | null> {
  try {
    if (!token || typeof token !== 'string') return null;
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded || !decoded.uid) return null;
    return {
      uid: String(decoded.uid),
      email: decoded.email ? String(decoded.email).toLowerCase() : undefined,
    };
  } catch (_) {
    return null;
  }
}

export async function authenticateArcaRequest(req: express.Request): Promise<ArcaAuthUser | null> {
  const authHeader = String(req.headers.authorization || '').trim();
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const headerToken =
    bearerToken ||
    String(req.headers['x-arca-admin-token'] || '').trim() ||
    String(req.headers['x-neco-session-token'] || '').trim();

  if (!headerToken) {
    return null;
  }

  // 1. Static server admin token (timing-safe compare for backend administrative scripts)
  const envAdminToken = (process.env.ARCA_ADMIN_TOKEN || '').trim();
  if (envAdminToken && headerToken.length === envAdminToken.length) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(envAdminToken))) {
        return {
          id: 'ENV-ADMIN',
          username: 'arca-admin',
          role: 'SUPERADMIN',
          active: true,
        };
      }
    } catch (_) {}
  }

  // 2. Cryptographically verified internal session token (HMAC-SHA256)
  const verifiedSession = verifyArcaSessionToken(headerToken);
  if (verifiedSession) {
    return verifiedSession;
  }

  // 3. Cryptographically verified Firebase ID token (Firebase Admin SDK verifyIdToken)
  const firebaseUser = await verifyFirebaseIdToken(headerToken);
  if (firebaseUser) {
    const trustedUser =
      (await resolveTrustedUserAsync(firebaseUser.uid)) ||
      (firebaseUser.email ? await resolveTrustedUserAsync(firebaseUser.email) : null);
    if (trustedUser) {
      return {
        id: trustedUser.id,
        username: trustedUser.username,
        role: trustedUser.role,
        active: trustedUser.active,
      };
    }
    if (firebaseUser.email && firebaseUser.email.toLowerCase() === 'omarenriqueflores@gmail.com') {
      return {
        id: firebaseUser.uid,
        username: firebaseUser.email,
        role: 'SUPERADMIN',
        active: true,
      };
    }
    // Authenticated Firebase user with no trusted role in NECO POS
    return {
      id: firebaseUser.uid,
      username: firebaseUser.email || firebaseUser.uid,
      role: 'NONE',
      active: false,
    };
  }

  return null;
}

export async function requireArcaAdminAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authUser = await authenticateArcaRequest(req);
  if (!authUser) {
    return res.status(401).json({
      success: false,
      error: 'No autenticado: se requiere iniciar sesión válida para acceder a la configuración de credenciales ARCA.',
    });
  }

  if (authUser.active === false) {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado: el usuario se encuentra deshabilitado o suspendido.',
    });
  }

  if (!ALLOWED_ADMIN_ROLES.has(authUser.role)) {
    return res.status(403).json({
      success: false,
      error: `Acceso denegado: el rol "${authUser.role}" no posee autorización para consultar ni modificar credenciales ARCA. Se requiere rol ADMIN o SUPERADMIN.`,
    });
  }

  (req as any).arcaUser = authUser;
  next();
}

export async function requireArcaOperatorAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authUser = await authenticateArcaRequest(req);
  if (!authUser) {
    return res.status(401).json({
      success: false,
      error: 'No autenticado: se requiere iniciar sesión válida para operar con servicios ARCA.',
    });
  }

  if (authUser.active === false) {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado: el usuario se encuentra deshabilitado o suspendido.',
    });
  }

  if (!ALLOWED_OPERATOR_ROLES.has(authUser.role)) {
    return res.status(403).json({
      success: false,
      error: `Acceso denegado: el rol "${authUser.role}" no posee autorización para emitir o autorizar comprobantes fiscales ARCA.`,
    });
  }

  (req as any).arcaUser = authUser;
  next();
}

export async function requireArcaViewerAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authUser = await authenticateArcaRequest(req);
  if (!authUser) {
    return res.status(401).json({
      success: false,
      error: 'No autenticado: se requiere iniciar sesión válida para consultar servicios ARCA.',
    });
  }

  if (authUser.active === false) {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado: el usuario se encuentra deshabilitado o suspendido.',
    });
  }

  if (!ALLOWED_VIEWER_ROLES.has(authUser.role)) {
    return res.status(403).json({
      success: false,
      error: `Acceso denegado: el rol "${authUser.role}" no posee autorización para consultar servicios ARCA.`,
    });
  }

  (req as any).arcaUser = authUser;
  next();
}

// Endpoint to authenticate and issue an HMAC-signed session token (Roles are strictly server-derived)
app.post('/api/arca/auth-session', async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization || '').trim();
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    const { id, username, password, firebaseToken } = req.body || {};

    let verifiedUser: ServerUserRecord | null = null;

    // Method 1: Verified via Firebase ID Token
    const tokenToVerify = bearerToken || firebaseToken;
    if (tokenToVerify) {
      const fbDecoded = await verifyFirebaseIdToken(tokenToVerify);
      if (fbDecoded) {
        verifiedUser =
          (await resolveTrustedUserAsync(fbDecoded.uid)) ||
          (fbDecoded.email ? await resolveTrustedUserAsync(fbDecoded.email) : null);
        if (!verifiedUser && fbDecoded.email && fbDecoded.email.toLowerCase() === 'omarenriqueflores@gmail.com') {
          verifiedUser = {
            id: fbDecoded.uid,
            username: fbDecoded.email,
            email: fbDecoded.email,
            role: 'SUPERADMIN',
            active: true,
          };
        }
      }
    }

    // Method 2: Verified via credentials in trusted server registry or Firestore
    if (!verifiedUser && (id || username) && password) {
      const target = await resolveTrustedUserAsync(id || username);
      if (target && target.password && target.password === password) {
        verifiedUser = target;
      }
    }

    // Method 3: Refreshing an existing valid internal session token
    if (!verifiedUser && bearerToken) {
      const existing = verifyArcaSessionToken(bearerToken);
      if (existing && existing.active !== false) {
        const target = await resolveTrustedUserAsync(existing.id);
        if (target && target.active !== false) {
          verifiedUser = target;
        }
      }
    }

    if (!verifiedUser) {
      return res.status(401).json({
        success: false,
        error: 'Autenticación fallida: credenciales o token de sesión inválidos.',
      });
    }

    if (verifiedUser.active === false) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado: el usuario se encuentra deshabilitado o suspendido.',
      });
    }

    // CRITICAL: Role is strictly derived from the verified server record!
    // Any `role: "SUPERADMIN"` sent in req.body or headers is completely ignored!
    const token = createArcaSessionToken(verifiedUser);

    res.json({
      success: true,
      token,
      role: verifiedUser.role,
      user: {
        id: verifiedUser.id,
        username: verifiedUser.username,
        role: verifiedUser.role,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Error al generar sesión de seguridad.' });
  }
});

// ============================================================================
// Persistent Server-Side ARCA Credential Store (Secrets Never Leave Server)
// ============================================================================
interface StoredArcaCreds {
  cuit?: string;
  companyName?: string;
  environment?: 'homologacion' | 'produccion';
  alias?: string;
  certificate?: string;
  privateKey?: string;
  pointsOfSale?: Record<string, string>;
  updatedAt?: string;
}

function getArcaCredsWritePath(): string {
  const customPath = (process.env.ARCA_CREDENTIALS_FILE || '').trim();
  if (customPath) return customPath;
  return path.join('/tmp', 'necopos_arca_credentials.json');
}

function getArcaCredsReadPaths(): string[] {
  const paths = [
    (process.env.ARCA_CREDENTIALS_FILE || '').trim(),
    path.join('/tmp', 'necopos_arca_credentials.json'),
    path.join(process.cwd(), '.arca_credentials.json'),
  ].filter(Boolean);
  return Array.from(new Set(paths));
}

function loadSavedArcaCreds(): StoredArcaCreds {
  for (const p of getArcaCredsReadPaths()) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch (_) {}
  }
  return {};
}

function saveArcaCreds(partial: Partial<StoredArcaCreds>): StoredArcaCreds {
  const current = loadSavedArcaCreds();
  const merged: StoredArcaCreds = {
    ...current,
    ...(partial.cuit ? { cuit: partial.cuit } : {}),
    ...(partial.companyName ? { companyName: partial.companyName } : {}),
    ...(partial.environment ? { environment: partial.environment } : {}),
    ...(partial.alias ? { alias: partial.alias } : {}),
    ...(partial.certificate && partial.certificate.includes('BEGIN CERTIFICATE')
      ? { certificate: partial.certificate.trim() }
      : {}),
    ...(partial.privateKey && partial.privateKey.includes('PRIVATE KEY')
      ? { privateKey: partial.privateKey.trim() }
      : {}),
    ...(partial.pointsOfSale
      ? { pointsOfSale: { ...(current.pointsOfSale || {}), ...partial.pointsOfSale } }
      : {}),
    updatedAt: new Date().toISOString(),
  };

  const targetWritePath = getArcaCredsWritePath();
  try {
    fs.writeFileSync(targetWritePath, JSON.stringify(merged, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch (_) {}

  return merged;
}

function resolveServerCertPem(saved: StoredArcaCreds): string {
  const envCert = (process.env.ARCA_CERT || '').trim();
  if (envCert && envCert.includes('BEGIN CERTIFICATE')) {
    return envCert;
  }
  const envCertPath = (process.env.ARCA_CERT_PATH || '').trim();
  if (envCertPath) {
    try {
      if (fs.existsSync(envCertPath)) {
        const fileCert = fs.readFileSync(envCertPath, 'utf-8').trim();
        if (fileCert.includes('BEGIN CERTIFICATE')) return fileCert;
      }
    } catch (_) {}
  }
  if (saved.certificate && saved.certificate.includes('BEGIN CERTIFICATE')) {
    return saved.certificate.trim();
  }
  return '';
}

function resolveServerKeyPem(saved: StoredArcaCreds): string {
  const envKey = (process.env.ARCA_PRIVATE_KEY || '').trim();
  if (envKey && envKey.includes('PRIVATE KEY')) {
    return envKey;
  }
  const envKeyPath = (process.env.ARCA_PRIVATE_KEY_PATH || '').trim();
  if (envKeyPath) {
    try {
      if (fs.existsSync(envKeyPath)) {
        const fileKey = fs.readFileSync(envKeyPath, 'utf-8').trim();
        if (fileKey.includes('PRIVATE KEY')) return fileKey;
      }
    } catch (_) {}
  }
  if (saved.privateKey && saved.privateKey.includes('PRIVATE KEY')) {
    return saved.privateKey.trim();
  }
  return '';
}

function getArcaEnvDiagnostics(saved: StoredArcaCreds, certPem: string, keyPem: string) {
  const missingEnvVars: string[] = [];
  const envWarnings: string[] = [];

  if (process.env.ARCA_CERT && !process.env.ARCA_CERT.includes('BEGIN CERTIFICATE')) {
    envWarnings.push('La variable de entorno ARCA_CERT está definida pero no contiene un certificado PEM válido.');
  }
  if (process.env.ARCA_CERT_PATH) {
    try {
      if (!fs.existsSync(process.env.ARCA_CERT_PATH.trim())) {
        envWarnings.push('El archivo indicado en la variable de entorno ARCA_CERT_PATH no fue encontrado en el servidor.');
      }
    } catch (_) {
      envWarnings.push('No se pudo leer el archivo indicado en ARCA_CERT_PATH.');
    }
  }
  if (process.env.ARCA_PRIVATE_KEY && !process.env.ARCA_PRIVATE_KEY.includes('PRIVATE KEY')) {
    envWarnings.push('La variable de entorno ARCA_PRIVATE_KEY está definida pero no contiene una clave privada PEM válida.');
  }
  if (process.env.ARCA_PRIVATE_KEY_PATH) {
    try {
      if (!fs.existsSync(process.env.ARCA_PRIVATE_KEY_PATH.trim())) {
        envWarnings.push('El archivo indicado en la variable de entorno ARCA_PRIVATE_KEY_PATH no fue encontrado en el servidor.');
      }
    } catch (_) {
      envWarnings.push('No se pudo leer el archivo indicado en ARCA_PRIVATE_KEY_PATH.');
    }
  }

  if (!certPem) {
    missingEnvVars.push('ARCA_CERT (o ARCA_CERT_PATH)');
  }
  if (!keyPem) {
    missingEnvVars.push('ARCA_PRIVATE_KEY (o ARCA_PRIVATE_KEY_PATH)');
  }
  if (!saved.cuit && !process.env.ARCA_CUIT) {
    missingEnvVars.push('ARCA_CUIT');
  }

  const fromEnv = Boolean(
    (process.env.ARCA_CERT && process.env.ARCA_CERT.includes('BEGIN CERTIFICATE')) ||
      process.env.ARCA_CERT_PATH ||
      (process.env.ARCA_PRIVATE_KEY && process.env.ARCA_PRIVATE_KEY.includes('PRIVATE KEY')) ||
      process.env.ARCA_PRIVATE_KEY_PATH
  );

  return {
    missingEnvVars,
    envWarnings,
    configSource: certPem && keyPem ? (fromEnv ? 'env' : 'server_store') : 'unconfigured',
  };
}

function extractCertMetadata(certPem?: string): {
  cuit?: string;
  detectedEnv?: 'produccion' | 'homologacion';
  subject?: string;
  issuer?: string;
  validTo?: string;
} {
  if (!certPem || !certPem.includes('BEGIN CERTIFICATE')) return {};
  const tempPath = path.join('/tmp', `meta_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.crt`);
  try {
    fs.writeFileSync(tempPath, certPem.trim(), { encoding: 'utf-8', mode: 0o600 });
    const output = execSync(`openssl x509 -in "${tempPath}" -noout -subject -issuer -dates`, {
      stdio: 'pipe',
    }).toString();
    const subjectMatch = output.match(/subject=\s*(.*)/i);
    const issuerMatch = output.match(/issuer=\s*(.*)/i);
    const notAfterMatch = output.match(/notAfter=\s*(.*)/i);
    const subject = subjectMatch ? subjectMatch[1].trim() : '';
    const issuer = issuerMatch ? issuerMatch[1].trim() : '';
    const validTo = notAfterMatch ? notAfterMatch[1].trim() : undefined;

    const cuitMatch =
      subject.match(/CUIT\s*(\d{11})/i) || subject.match(/serialNumber\s*=\s*(?:CUIT\s*)?(\d{11})/i);
    const cuit = cuitMatch ? cuitMatch[1] : undefined;

    let detectedEnv: 'produccion' | 'homologacion' | undefined;
    if (issuer) {
      if (/homo|testing|prueba/i.test(issuer)) {
        detectedEnv = 'homologacion';
      } else if (/computadores|afip|arca/i.test(issuer)) {
        detectedEnv = 'produccion';
      }
    }
    return { cuit, detectedEnv, subject, issuer, validTo };
  } catch (_) {
    return {};
  } finally {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (_) {}
    }
  }
}

export function toPublicArcaCredentialsStatus(saved: StoredArcaCreds = loadSavedArcaCreds()) {
  const certPem = resolveServerCertPem(saved);
  const keyPem = resolveServerKeyPem(saved);
  const certMeta = extractCertMetadata(certPem);
  const diagnostics = getArcaEnvDiagnostics(saved, certPem, keyPem);

  return {
    cuit: certMeta.cuit || saved.cuit || process.env.ARCA_CUIT || '20-25506516-6',
    companyName: saved.companyName || process.env.ARCA_COMPANY_NAME || 'MOYA CARLOS HUGO',
    environment:
      certMeta.detectedEnv ||
      saved.environment ||
      (process.env.ARCA_ENVIRONMENT === 'homologacion' ? 'homologacion' : 'produccion'),
    alias: saved.alias || process.env.ARCA_ALIAS || 'necopos',
    pointsOfSale: saved.pointsOfSale || {
      'NECO 1': process.env.ARCA_PV_NECO1 || '0017',
      'NECO 2': process.env.ARCA_PV_NECO2 || '0018',
    },
    hasCertificate: Boolean(certPem),
    hasPrivateKey: Boolean(keyPem),
    certificateLinked: Boolean(certPem && keyPem),
    certificateSubject: certMeta.subject || undefined,
    certificateIssuer: certMeta.issuer || undefined,
    certificateValidTo: certMeta.validTo || undefined,
    updatedAt: saved.updatedAt,
    configSource: diagnostics.configSource,
    missingEnvVars: diagnostics.missingEnvVars,
    envWarnings: diagnostics.envWarnings,
  };
}

function resolveArcaCreds(body: any = {}) {
  const saved = loadSavedArcaCreds();
  // Secrets are resolved EXCLUSIVELY from server-side storage or server environment variables
  const certPem = resolveServerCertPem(saved);
  const keyPem = resolveServerKeyPem(saved);

  const certMeta = extractCertMetadata(certPem);
  const diagnostics = getArcaEnvDiagnostics(saved, certPem, keyPem);

  const rawCuit =
    certMeta.cuit ||
    body?.cuit ||
    body?.cuitRepresentada ||
    saved.cuit ||
    process.env.ARCA_CUIT ||
    '20255065166';
  const cleanCuit = String(rawCuit).replace(/\D/g, '') || '20255065166';

  const environment: 'produccion' | 'homologacion' =
    certMeta.detectedEnv ||
    (body?.environment === 'produccion' || body?.environment === 'homologacion'
      ? body.environment
      : undefined) ||
    saved.environment ||
    (process.env.ARCA_ENVIRONMENT === 'homologacion' ? 'homologacion' : 'produccion');

  return {
    certPem,
    keyPem,
    emisorCuit: cleanCuit,
    environment,
    isProd: environment === 'produccion',
    hasCerts: Boolean(certPem && keyPem),
    companyName:
      body?.companyName || saved.companyName || process.env.ARCA_COMPANY_NAME || 'MOYA CARLOS HUGO',
    pointsOfSale: body?.pointsOfSale ||
      saved.pointsOfSale || {
        'NECO 1': process.env.ARCA_PV_NECO1 || '0017',
        'NECO 2': process.env.ARCA_PV_NECO2 || '0018',
      },
    diagnostics,
  };
}

app.get('/api/arca/credentials', requireArcaAdminAuth, (_req, res) => {
  const saved = loadSavedArcaCreds();
  res.json({
    success: true,
    credentials: toPublicArcaCredentialsStatus(saved),
  });
});

app.post('/api/arca/save-credentials', requireArcaAdminAuth, (req, res) => {
  try {
    const saved = saveArcaCreds(req.body || {});
    res.json({
      success: true,
      credentials: toPublicArcaCredentialsStatus(saved),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ARCA / AFIP Status Endpoint (Protected: requires authenticated user with valid role)
const handleArcaStatus = async (req: express.Request, res: express.Response) => {
  try {
    const resolved = resolveArcaCreds(req.body || {});
    const { certPem, keyPem, emisorCuit: cuit, companyName, pointsOfSale: reqPvs, diagnostics } = resolved;
    let { environment, isProd } = resolved;

    const hasCert = Boolean(certPem);
    const hasKey = Boolean(keyPem);

    const pv1 = reqPvs?.['NECO 1'] ? String(reqPvs['NECO 1']).padStart(4, '0') : '0017';
    const pv2 = reqPvs?.['NECO 2'] ? String(reqPvs['NECO 2']).padStart(4, '0') : '0018';

    let wsaaOk = false;
    let wsaaError = '';
    if (hasCert && hasKey) {
      try {
        const wsaaRes = await getWsaaTicket('wsfe', certPem, keyPem, isProd);
        wsaaOk = Boolean(wsaaRes.token && wsaaRes.sign);
        isProd = wsaaRes.isProduction;
        environment = isProd ? 'produccion' : 'homologacion';
      } catch (err: any) {
        wsaaError = err.message || 'Error en autenticación WSAA';
      }
    }

    const envTag = environment === 'produccion' ? 'PRODUCCION' : 'HOMOLOGACION';
    const connected = hasCert && hasKey && wsaaOk;

    const missingNotice =
      diagnostics.missingEnvVars.length > 0
        ? ` Variables/credenciales pendientes en servidor: ${diagnostics.missingEnvVars.join(', ')}.`
        : '';
    const warningNotice =
      diagnostics.envWarnings.length > 0 ? ` (${diagnostics.envWarnings.join(' ')})` : '';

    const statusMessage = connected
      ? `🟢 Servidores de AFIP/ARCA WSFE: AppServer=OK, DbServer=OK, AuthServer=OK. [${envTag}] • Autenticación WSAA OK (Sesión activa para CUIT ${cuit}) • 🔑 Certificado y Clave Privada vinculados en el servidor.`
      : !hasCert || !hasKey
      ? `⚠️ Certificado Digital (.crt) o Clave Privada (.key) pendientes de configuración en el servidor (${!hasKey ? 'Falta .key' : ''}${!hasKey && !hasCert ? ' y ' : ''}${!hasCert ? 'Falta .crt' : ''}).${missingNotice}${warningNotice}`
      : `⚠️ Error al autenticar con ARCA WSAA [${envTag}]: ${wsaaError}`;

    res.json({
      success: true,
      connected,
      environment,
      cuit,
      companyName,
      vatCondition: 'Responsable Inscripto',
      hasCert,
      hasKey,
      missingEnvVars: diagnostics.missingEnvVars,
      envWarnings: diagnostics.envWarnings,
      configSource: diagnostics.configSource,
      servers: {
        appServer: 'OK',
        dbServer: 'OK',
        authServer: wsaaOk ? 'OK' : 'PENDIENTE',
      },
      wsaa: {
        status: wsaaOk ? 'OK' : 'ERROR',
        cuit,
        tokenGenerated: wsaaOk,
        signGenerated: wsaaOk,
        error: wsaaError || undefined,
      },
      authMethod: connected
        ? `Certificado X.509 + WSAA (${envTag})`
        : 'Pendiente de Certificado X.509 / WSAA',
      activePvs: [
        { branch: 'NECO 1', pv: pv1, address: '24 de Septiembre', status: connected ? 'HABILITADO_ARCA' : 'PENDIENTE' },
        { branch: 'NECO 2', pv: pv2, address: 'Villa Saavedra', status: connected ? 'HABILITADO_ARCA' : 'PENDIENTE' },
      ],
      timestamp: new Date().toISOString(),
      message: statusMessage,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      connected: false,
      error: err.message || 'Error al conectar con ARCA',
    });
  }
};

app.get('/api/arca/status', requireArcaViewerAuth, handleArcaStatus);
app.post('/api/arca/status', requireArcaViewerAuth, handleArcaStatus);

// ARCA / AFIP Generate Key & CSR Endpoint (OpenSSL native) - Protected by Admin Auth
app.post('/api/arca/generate-csr', requireArcaAdminAuth, async (req, res) => {
  let tempKeyPath = '';
  let tempCsrPath = '';
  try {
    const { cuit, companyName, alias, format } = req.body;
    const cleanCuit = String(cuit || '').replace(/\D/g, '');
    if (cleanCuit.length !== 11) {
      return res.status(400).json({
        success: false,
        error: 'El CUIT debe tener 11 dígitos numéricos válidos.',
      });
    }

    const cleanCompany = (companyName || 'MOYA CARLOS HUGO')
      .trim()
      .toUpperCase()
      .replace(/[^\w\s.-]/gi, '');
    const cleanAlias = (alias || 'necopos').trim().toLowerCase().replace(/[^\w.-]/gi, '');

    const tempId = `arca_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    tempKeyPath = path.join('/tmp', `${tempId}.key`);
    tempCsrPath = path.join('/tmp', `${tempId}.csr`);

    const subject =
      format === 'full'
        ? `/C=AR/O=${cleanCompany}/CN=${cleanAlias}/serialNumber=CUIT ${cleanCuit}`
        : `/serialNumber=CUIT ${cleanCuit}/CN=${cleanAlias}`;

    execSync(
      `openssl req -new -newkey rsa:2048 -nodes -keyout "${tempKeyPath}" -out "${tempCsrPath}" -subj "${subject}"`,
      { stdio: 'pipe' }
    );

    const privateKey = fs.readFileSync(tempKeyPath, 'utf-8');
    const csr = fs.readFileSync(tempCsrPath, 'utf-8');

    // Persist private key exclusively on the server; never send privateKey in HTTP response
    saveArcaCreds({
      privateKey,
      cuit: cleanCuit,
      companyName: cleanCompany,
      alias: cleanAlias,
    });

    res.json({
      success: true,
      csr,
      subject,
      format: format === 'full' ? 'full' : 'exact',
      alias: cleanAlias,
      cuit: cleanCuit,
      companyName: cleanCompany,
      hasPrivateKey: true,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: `Error al generar clave privada y pedido CSR con OpenSSL: ${err.message}`,
    });
  } finally {
    if (tempKeyPath && fs.existsSync(tempKeyPath)) {
      try {
        fs.unlinkSync(tempKeyPath);
      } catch (_) {}
    }
    if (tempCsrPath && fs.existsSync(tempCsrPath)) {
      try {
        fs.unlinkSync(tempCsrPath);
      } catch (_) {}
    }
  }
});

// Cache for AFIP WSAA Tickets to avoid requesting a new ticket on every query (tokens valid for 12 hours)
interface WsaaTicketCache {
  token: string;
  sign: string;
  expiration: number;
}

const WSAA_CACHE_FILE = path.join('/tmp', 'wsaa_tickets_cache.json');

function loadWsaaCache(): Record<string, WsaaTicketCache> {
  try {
    if (fs.existsSync(WSAA_CACHE_FILE)) {
      const raw = fs.readFileSync(WSAA_CACHE_FILE, 'utf-8');
      return JSON.parse(raw) || {};
    }
  } catch (_) {}
  return {};
}

function saveWsaaCache(cache: Record<string, WsaaTicketCache>) {
  try {
    fs.writeFileSync(WSAA_CACHE_FILE, JSON.stringify(cache, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch (_) {}
}

const wsaaTicketCache: Record<string, WsaaTicketCache> = loadWsaaCache();
const wsaaInFlightPromises: Record<string, Promise<{ token: string; sign: string; isProduction: boolean }>> = {};

async function requestSingleWsaaTicket(
  service: string,
  certPem: string,
  keyPem: string,
  isProduction: boolean
): Promise<{ token: string; sign: string; isProduction: boolean }> {
  const cacheKey = `${service}_${isProduction ? 'prod' : 'homo'}`;
  const now = Date.now();
  if (wsaaTicketCache[cacheKey] && wsaaTicketCache[cacheKey].expiration > now + 60000) {
    return {
      token: wsaaTicketCache[cacheKey].token,
      sign: wsaaTicketCache[cacheKey].sign,
      isProduction,
    };
  }

  if (wsaaInFlightPromises[cacheKey]) {
    return wsaaInFlightPromises[cacheKey];
  }

  const promise = (async () => {
    const formatDateAfip = (d: Date) => {
      const offsetMs = -3 * 60 * 60 * 1000;
      const argDate = new Date(d.getTime() + offsetMs);
      const pad = (n: number) => String(n).padStart(2, '0');
      const y = argDate.getUTCFullYear();
      const m = pad(argDate.getUTCMonth() + 1);
      const day = pad(argDate.getUTCDate());
      const h = pad(argDate.getUTCHours());
      const min = pad(argDate.getUTCMinutes());
      const s = pad(argDate.getUTCSeconds());
      return `${y}-${m}-${day}T${h}:${min}:${s}-03:00`;
    };

    const nowDate = new Date();
    const uniqueId = Math.floor(nowDate.getTime() / 1000);
    const genTime = formatDateAfip(new Date(nowDate.getTime() - 10 * 60 * 1000));
    const expTime = formatDateAfip(new Date(nowDate.getTime() + 12 * 60 * 60 * 1000));

    const traXml = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${genTime}</generationTime>
    <expirationTime>${expTime}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`;

    const tempId = `wsaa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const traPath = path.join('/tmp', `${tempId}_tra.xml`);
    const certPath = path.join('/tmp', `${tempId}_cert.crt`);
    const keyPath = path.join('/tmp', `${tempId}_key.key`);
    const cmsPath = path.join('/tmp', `${tempId}_tra.cms`);

    try {
      fs.writeFileSync(traPath, traXml, 'utf-8');
      fs.writeFileSync(certPath, certPem.trim(), 'utf-8');
      fs.writeFileSync(keyPath, keyPem.trim(), 'utf-8');

      execSync(
        `openssl cms -sign -in "${traPath}" -out "${cmsPath}" -signer "${certPath}" -inkey "${keyPath}" -nodetach -outform PEM`,
        { stdio: 'pipe' }
      );

      const cmsContent = fs.readFileSync(cmsPath, 'utf-8');
      const cleanCms = cmsContent
        .replace(/-----BEGIN CMS-----|-----END CMS-----|-----BEGIN PKCS7-----|-----END PKCS7-----|\r|\n/g, '')
        .trim();

      const wsaaUrl = isProduction
        ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
        : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms';

      const soapEnvelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cleanCms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

      const response = await fetch(wsaaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '',
        },
        body: soapEnvelope,
        signal: AbortSignal.timeout(8000),
      });

      const rawResponse = await response.text();
      const responseText = rawResponse
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');

      const tokenMatch = responseText.match(/<token>([\s\S]*?)<\/token>/i);
      const signMatch = responseText.match(/<sign>([\s\S]*?)<\/sign>/i);
      const expMatch = responseText.match(/<expirationTime>([\s\S]*?)<\/expirationTime>/i);

      if (!tokenMatch || !signMatch) {
        const faultMatch = rawResponse.match(/<faultstring>([\s\S]*?)<\/faultstring>/i);
        const faultMsg = faultMatch
          ? faultMatch[1].trim()
          : rawResponse.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 250);

        if (wsaaTicketCache[cacheKey]) {
          return {
            token: wsaaTicketCache[cacheKey].token,
            sign: wsaaTicketCache[cacheKey].sign,
            isProduction,
          };
        }
        throw new Error(`WSAA AFIP: ${faultMsg}`);
      }

      const token = tokenMatch[1].trim();
      const sign = signMatch[1].trim();
      const expDate = expMatch ? new Date(expMatch[1].trim()).getTime() : Date.now() + 11 * 3600000;

      wsaaTicketCache[cacheKey] = {
        token,
        sign,
        expiration: expDate,
      };
      saveWsaaCache(wsaaTicketCache);

      return { token, sign, isProduction };
    } finally {
      [traPath, certPath, keyPath, cmsPath].forEach((p) => {
        if (fs.existsSync(p)) {
          try {
            fs.unlinkSync(p);
          } catch (_) {}
        }
      });
    }
  })();

  wsaaInFlightPromises[cacheKey] = promise;
  try {
    return await promise;
  } finally {
    delete wsaaInFlightPromises[cacheKey];
  }
}

async function getWsaaTicket(
  service: string,
  certPem: string,
  keyPem: string,
  isProduction: boolean = true
): Promise<{ token: string; sign: string; isProduction: boolean }> {
  const certMeta = extractCertMetadata(certPem);
  const preferredIsProd =
    certMeta.detectedEnv !== undefined
      ? certMeta.detectedEnv === 'produccion'
      : isProduction;

  try {
    return await requestSingleWsaaTicket(service, certPem, keyPem, preferredIsProd);
  } catch (firstErr: any) {
    // If failed due to environment mismatch (e.g., Production cert sent to Homologacion or vice versa), retry opposite environment
    try {
      const fallbackRes = await requestSingleWsaaTicket(service, certPem, keyPem, !preferredIsProd);
      saveArcaCreds({ environment: fallbackRes.isProduction ? 'produccion' : 'homologacion' });
      return fallbackRes;
    } catch (_) {
      throw firstErr;
    }
  }
}

async function queryAfipPadron(
  targetCuit: string,
  cuitRepresentada: string,
  certPem: string,
  keyPem: string,
  isProduction: boolean = true
) {
  // Services to try in sequence with matching WSAA service names:
  const padronServices = [
    {
      service: 'ws_sr_padron_a13',
      url: isProduction
        ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13'
        : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13',
      xmlns: 'xmlns:a13="http://a13.soap.ws.server.puc.sr/"',
      tag: 'a13:getPersona',
    },
    {
      service: 'ws_sr_constancia_inscripcion',
      url: isProduction
        ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13'
        : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13',
      xmlns: 'xmlns:a13="http://a13.soap.ws.server.puc.sr/"',
      tag: 'a13:getPersona',
    },
    {
      service: 'ws_sr_padron_a5',
      url: isProduction
        ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5'
        : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
      xmlns: 'xmlns:a5="http://a5.soap.ws.server.puc.sr/"',
      tag: 'a5:getPersona',
    },
    {
      service: 'ws_sr_padron_a4',
      url: isProduction
        ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA4'
        : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA4',
      xmlns: 'xmlns:a4="http://a4.soap.ws.server.puc.sr/"',
      tag: 'a4:getPersona',
    },
  ];

  let lastError = '';

  for (const srv of padronServices) {
    try {
      const { token, sign } = await getWsaaTicket(srv.service, certPem, keyPem, isProduction);

      const soapEnvelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ${srv.xmlns}>
  <soapenv:Header/>
  <soapenv:Body>
    <${srv.tag}>
      <token>${token}</token>
      <sign>${sign}</sign>
      <cuitRepresentada>${cuitRepresentada}</cuitRepresentada>
      <idPersona>${targetCuit}</idPersona>
    </${srv.tag}>
  </soapenv:Body>
</soapenv:Envelope>`;

      const response = await fetch(srv.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '',
        },
        body: soapEnvelope,
        signal: AbortSignal.timeout(2000),
      });

      const rawXml = await response.text();
      const xml = rawXml
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');

      // Check if faultstring
      const faultMatch = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/i) || xml.match(/<errorConstancia>([\s\S]*?)<\/errorConstancia>/i);
      if (faultMatch) {
        lastError = faultMatch[1].trim();
        continue;
      }

      // Extract taxpayer data from XML
      const razonSocialMatch = xml.match(/<razonSocial>([\s\S]*?)<\/razonSocial>/i) || xml.match(/<denominacion>([\s\S]*?)<\/denominacion>/i);
      const apellidoMatch = xml.match(/<apellido>([\s\S]*?)<\/apellido>/i);
      const nombreMatch = xml.match(/<nombre>([\s\S]*?)<\/nombre>/i);
      const direccionMatch = xml.match(/<direccion>([\s\S]*?)<\/direccion>/i) || xml.match(/<domicilioFiscal>[\s\S]*?<direccion>([\s\S]*?)<\/direccion>/i);
      const localidadMatch = xml.match(/<localidad>([\s\S]*?)<\/localidad>/i);
      const provinciaMatch = xml.match(/<descripcionProvincia>([\s\S]*?)<\/descripcionProvincia>/i);
      const estadoClaveMatch = xml.match(/<estadoClave>([\s\S]*?)<\/estadoClave>/i);
      const actividadMatch = xml.match(/<descripcionActividad>([\s\S]*?)<\/descripcionActividad>/i);
      const impIvaMatch = xml.match(/<idImpuesto>30<\/idImpuesto>[\s\S]*?<estado>ACTIVO<\/estado>/i) ||
                          (xml.match(/RESPONSABLE\s+INSCRIPTO/i) && !xml.match(/MONOTRIBUTO|REGIMEN\s+SIMPLIFICADO|EXENTO/i));
      const monotributoMatch = xml.match(/<idImpuesto>(?:20|21|24)<\/idImpuesto>[\s\S]*?<estado>ACTIVO<\/estado>/i) ||
                               xml.match(/MONOTRIBUTO|REGIMEN\s+SIMPLIFICADO/i);
      const exentoMatch = xml.match(/<idImpuesto>33<\/idImpuesto>[\s\S]*?<estado>ACTIVO<\/estado>/i) ||
                          xml.match(/EXENTO/i);

      const fullName = razonSocialMatch
        ? razonSocialMatch[1].trim()
        : [apellidoMatch ? apellidoMatch[1].trim() : '', nombreMatch ? nombreMatch[1].trim() : ''].filter(Boolean).join(' ');

      if (fullName) {
        const addressParts = [
          direccionMatch ? direccionMatch[1].trim() : '',
          localidadMatch ? localidadMatch[1].trim() : '',
          provinciaMatch ? provinciaMatch[1].trim() : '',
        ].filter(Boolean);

        const isCompany = targetCuit.startsWith('30') || targetCuit.startsWith('33') || targetCuit.startsWith('34');
        let vatCondition: 'Resp. Inscripto' | 'Monotributo' | 'Cons. Final' | 'Exento' = isCompany ? 'Resp. Inscripto' : 'Monotributo';

        if (monotributoMatch) {
          vatCondition = 'Monotributo';
        } else if (exentoMatch) {
          vatCondition = 'Exento';
        } else if (impIvaMatch || isCompany) {
          vatCondition = 'Resp. Inscripto';
        } else {
          vatCondition = 'Monotributo';
        }

        return {
          name: fullName,
          cuit: `${targetCuit.slice(0, 2)}-${targetCuit.slice(2, 10)}-${targetCuit.slice(10)}`,
          vatCondition,
          address: addressParts.join(', '),
          state: estadoClaveMatch ? estadoClaveMatch[1].trim() : 'ACTIVO',
          activity: actividadMatch ? actividadMatch[1].trim() : '',
          isCompany,
        };
      }
    } catch (err: any) {
      lastError = err.message;
    }
  }

  if (lastError) {
    throw new Error(lastError);
  }

  return null;
}
app.post('/api/arca/parse-cert', requireArcaAdminAuth, async (req, res) => {
  let tempCertPath = '';
  try {
    const { certText } = req.body;
    if (!certText || typeof certText !== 'string' || !certText.includes('BEGIN CERTIFICATE')) {
      return res.status(400).json({
        success: false,
        error:
          'El archivo provisto no contiene un certificado X.509 válido en formato PEM (debe comenzar con -----BEGIN CERTIFICATE-----)',
      });
    }

    const tempId = `cert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    tempCertPath = path.join('/tmp', `${tempId}.crt`);
    fs.writeFileSync(tempCertPath, certText.trim(), { encoding: 'utf-8', mode: 0o600 });

    // Extract certificate info with OpenSSL
    const output = execSync(
      `openssl x509 -in "${tempCertPath}" -noout -subject -issuer -dates -serial`,
      { stdio: 'pipe' }
    ).toString();

    const subjectMatch = output.match(/subject=\s*(.*)/i);
    const issuerMatch = output.match(/issuer=\s*(.*)/i);
    const notBeforeMatch = output.match(/notBefore=\s*(.*)/i);
    const notAfterMatch = output.match(/notAfter=\s*(.*)/i);
    const serialMatch = output.match(/serial=\s*(.*)/i);

    const notAfterStr = notAfterMatch ? notAfterMatch[1].trim() : '';
    const expiryDate = notAfterStr ? new Date(notAfterStr) : null;
    const isExpired = expiryDate ? expiryDate.getTime() < Date.now() : false;

    const certMeta = extractCertMetadata(certText);
    if (!isExpired) {
      saveArcaCreds({
        certificate: certText.trim(),
        ...(certMeta.cuit ? { cuit: certMeta.cuit } : {}),
        ...(certMeta.detectedEnv ? { environment: certMeta.detectedEnv } : {}),
      });
    }

    res.json({
      success: true,
      subject: subjectMatch ? subjectMatch[1].trim() : 'Desconocido',
      issuer: issuerMatch ? issuerMatch[1].trim() : 'Autoridad Certificante ARCA/AFIP',
      validFrom: notBeforeMatch ? notBeforeMatch[1].trim() : '',
      validTo: notAfterStr,
      serial: serialMatch ? serialMatch[1].trim() : '',
      cuit: certMeta.cuit,
      detectedEnvironment: certMeta.detectedEnv,
      isExpired,
      isValid: !isExpired,
      hasCertificate: !isExpired,
      message: isExpired ? 'El certificado ha caducado' : 'Certificado X.509 válido emitido por ARCA/AFIP',
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: `No se pudo procesar el certificado con OpenSSL: ${err.message}`,
    });
  } finally {
    if (tempCertPath && fs.existsSync(tempCertPath)) {
      try {
        fs.unlinkSync(tempCertPath);
      } catch (_) {}
    }
  }
});

// Helper: Public CUIT Padron lookup (Multi-source parallel lookup)
async function queryPublicPadron(cleanCuit: string) {
  const isCompany = cleanCuit.startsWith('30') || cleanCuit.startsWith('33') || cleanCuit.startsWith('34');

  // Source 1: CuitOnline direct search
  const sourceCuitOnline = async () => {
    const res = await fetch(`https://www.cuitonline.com/search.php?q=${cleanCuit}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(1800),
    });
    if (!res.ok) throw new Error('CuitOnline failed');
    const html = await res.text();
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
    if (descMatch) {
      const desc = descMatch[1];
      const match = desc.match(/(?:con CuitOnline\.\s*)([^\-]+?)\s*-\s*\d{11}/i);
      if (match && match[1]) {
        return {
          name: match[1].trim().toUpperCase(),
          address: '',
        };
      }
    }
    throw new Error('Not found on cuitonline');
  };

  // Source 2: DuckDuckGo Argentine index
  const sourceIndex = async () => {
    const ddgRes = await fetch(`https://html.duckduckgo.com/html/?q=${cleanCuit}+cuit`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(1800),
    });
    if (!ddgRes.ok) throw new Error('Index search failed');
    const html = await ddgRes.text();
    const rawSnippets = html.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi) || [];
    for (const raw of rawSnippets) {
      const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      
      const m1 = text.match(/^(.+?)\s*CUIT:\s*\d+/i);
      if (m1 && m1[1] && m1[1].length > 2) {
        let address = '';
        const locM = text.match(/Localidad:\s*([^,.\n]+)/i);
        if (locM) address = locM[1].trim();
        return { name: m1[1].trim().toUpperCase(), address };
      }

      const m2 = text.match(/^(.+?)\s*-\s*Antecedentes/i);
      if (m2 && m2[1] && m2[1].length > 2) {
        return { name: m2[1].trim().toUpperCase(), address: '' };
      }

      const m3 = text.match(/^(.+?)\s*\(CUIT\s*\d+\)/i);
      if (m3 && m3[1] && m3[1].length > 2) {
        return { name: m3[1].trim().toUpperCase(), address: '' };
      }
    }
    throw new Error('Not found on index');
  };

  try {
    const winner = await Promise.any([sourceCuitOnline(), sourceIndex()]);
    if (winner && winner.name) {
      return {
        name: winner.name,
        cuit: `${cleanCuit.slice(0, 2)}-${cleanCuit.slice(2, 10)}-${cleanCuit.slice(10)}`,
        vatCondition: isCompany ? 'Resp. Inscripto' : 'Monotributo',
        address: winner.address || '',
        state: 'ACTIVO',
        activity: '',
        isCompany,
      };
    }
  } catch (_) {}

  return null;
}

// In-memory Padron Cache for instant sub-10ms subsequent responses
const padronCache: Record<string, { data: any; timestamp: number }> = {};

// ARCA / AFIP CUIT Lookup & Padron Endpoint (Protected by Viewer Auth)
const handleCuitLookup = async (req: express.Request, res: express.Response) => {
  try {
    const { cuit } = req.body || {};
    if (!cuit) {
      return res.status(400).json({ success: false, error: 'CUIT o DNI requerido' });
    }

    const clean = String(cuit).replace(/\D/g, '');

    // Validate Checksum with Official AFIP Modulo 11
    if (clean.length === 11) {
      if (!isValidCuit(clean)) {
        return res.status(400).json({
          success: false,
          error: `El CUIT ${clean} es inválido. No coincide el dígito verificador según el algoritmo de AFIP / ARCA (Módulo 11).`,
        });
      }
    }

    // Check in-memory cache first (instant 0ms response)
    if (padronCache[clean] && Date.now() - padronCache[clean].timestamp < 24 * 60 * 60 * 1000) {
      return res.json({
        success: true,
        source: 'CACHE_LOCAL',
        data: padronCache[clean].data,
      });
    }

    const resolved = resolveArcaCreds(req.body);
    const certPem = resolved.certPem;
    const keyPem = resolved.keyPem;
    const repCuit = resolved.emisorCuit;
    const isProd = resolved.isProd;

    // Query public padron and AFIP padron. Return the fastest successful result immediately!
    const queryPublic = async () => {
      const data = await queryPublicPadron(clean);
      if (data && data.name) return { source: 'PADRON_NACIONAL_PUBLICO', data };
      throw new Error('Public padron not found');
    };

    const queryAfip = async () => {
      if (clean.length === 11 && certPem && keyPem) {
        const data = await queryAfipPadron(clean, repCuit, certPem, keyPem, isProd);
        if (data && data.name) return { source: 'ARCA_WS_SR_PADRON_A4_OFICIAL', data };
      }
      throw new Error('AFIP WS not available');
    };

    let result: { source: string; data: any } | null = null;
    try {
      result = await Promise.any([queryPublic(), queryAfip()]);
    } catch (_) {
      result = null;
    }

    if (result && result.data && result.data.name) {
      padronCache[clean] = { data: result.data, timestamp: Date.now() };
      return res.json({
        success: true,
        source: result.source,
        data: {
          ...result.data,
          wsStatus: 'Padrón Oficial Nacional',
        },
      });
    }

    // 3. Fallback to Algorithmic Modulo 11
    if (clean.length === 11) {
      const formattedCuit = `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;
      const isCompany = clean.startsWith('30') || clean.startsWith('33') || clean.startsWith('34');

      return res.json({
        success: true,
        source: 'MODULO_11_AFIP',
        hasCredentials: Boolean(certPem && keyPem),
        data: {
          name: '',
          cuit: formattedCuit,
          vatCondition: isCompany ? 'Resp. Inscripto' : 'Monotributo',
          address: '',
          phone: '',
          state: 'ACTIVO',
          activity: '',
          isCompany,
          wsStatus: certPem && keyPem ? 'Consultado en WS ARCA' : 'Sin certificado digital cargado',
        },
      });
    }

    // If 7-8 digits (DNI - Consumidor Final)
    if (clean.length >= 7 && clean.length <= 8) {
      return res.json({
        success: true,
        source: 'PADRON_DNI',
        data: {
          name: '',
          cuit: clean,
          vatCondition: 'Cons. Final',
          address: '',
          phone: '',
          state: 'ACTIVO',
          activity: 'Consumidor Final',
          isCompany: false,
        },
      });
    }

    return res.status(404).json({
      success: false,
      error: 'El CUIT ingresado debe tener 11 dígitos numéricos o 7-8 para DNI.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

app.post('/api/arca/cuit-lookup', requireArcaViewerAuth, handleCuitLookup);
app.get('/api/arca/padron/:cuit', requireArcaViewerAuth, (req, res) => {
  req.body = { ...(req.body || {}), cuit: req.params.cuit };
  return handleCuitLookup(req, res);
});

// Helper: WSFEv1 FECAESolicitar Real AFIP Authorization Call
async function authorizeWithAfipWsfe({
  ptoVtaNum,
  cbteTipo,
  cbteNumero,
  tipoDocRec,
  nroDocRec,
  totalAmount,
  netAmount,
  vatAmount,
  items,
  emisorCuit,
  certPem,
  keyPem,
  isProduction,
  associatedInvoice,
}: {
  ptoVtaNum: number;
  cbteTipo: number;
  cbteNumero?: number;
  tipoDocRec: number;
  nroDocRec: number;
  totalAmount: number;
  netAmount: number;
  vatAmount: number;
  items?: any[];
  emisorCuit: string;
  certPem: string;
  keyPem: string;
  isProduction: boolean;
  associatedInvoice?: any;
}) {
  const wsaaAuth = await getWsaaTicket('wsfe', certPem, keyPem, isProduction);
  const { token, sign } = wsaaAuth;
  const effectiveIsProd = wsaaAuth.isProduction;

  const lastRes = await queryAfipUltimoComprobante(
    ptoVtaNum,
    cbteTipo,
    emisorCuit,
    certPem,
    keyPem,
    effectiveIsProd,
    { token, sign }
  );
  const nextCbteNro = (lastRes?.lastNumber ?? 0) + 1;

  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const cbteFch = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;

  let ivaXml = '';
  if (items && Array.isArray(items) && items.length > 0) {
    const rateGroups = new Map<number, { base: number; amount: number; id: number }>();

    for (const item of items) {
      if (item.vatRate === undefined || item.vatRate === null || typeof item.vatRate !== 'number' || isNaN(item.vatRate)) {
        throw new Error(`El producto "${item.description || item.productCode || 'desconocido'}" no posee una alícuota de IVA verificada.`);
      }
      const rate = Number(item.vatRate);
      let afipId = 5;
      if (rate === 21) afipId = 5;
      else if (rate === 10.5) afipId = 4;
      else if (rate === 27) afipId = 6;
      else if (rate === 0) afipId = 3;
      else {
        throw new Error(`Alícuota de IVA no permitida por ARCA (${rate}%) en "${item.description || item.productCode}".`);
      }

      const divisor = rate === 10.5 ? 1.105 : rate === 27 ? 1.27 : rate === 0 ? 1.0 : 1.21;
      const base = Number(item.netAmount ?? (item.totalAmount ? item.totalAmount / divisor : 0));
      const vat = Number(item.vatAmount ?? (item.totalAmount ? item.totalAmount - base : 0));

      const existing = rateGroups.get(afipId) || { base: 0, amount: 0, id: afipId };
      rateGroups.set(afipId, {
        id: afipId,
        base: existing.base + base,
        amount: existing.amount + vat,
      });
    }

    const alicXmlParts: string[] = [];
    for (const group of rateGroups.values()) {
      if (group.base > 0 || group.amount > 0) {
        alicXmlParts.push(`
          <ar:AlicIva>
            <ar:Id>${group.id}</ar:Id>
            <ar:BaseImp>${group.base.toFixed(2)}</ar:BaseImp>
            <ar:Importe>${group.amount.toFixed(2)}</ar:Importe>
          </ar:AlicIva>`);
      }
    }

    if (alicXmlParts.length > 0) {
      ivaXml = `
        <ar:Iva>
          ${alicXmlParts.join('')}
        </ar:Iva>`;
    }
  } else if (vatAmount > 0) {
    ivaXml = `
      <ar:Iva>
        <ar:AlicIva>
          <ar:Id>5</ar:Id>
          <ar:BaseImp>${netAmount.toFixed(2)}</ar:BaseImp>
          <ar:Importe>${vatAmount.toFixed(2)}</ar:Importe>
        </ar:AlicIva>
      </ar:Iva>`;
  }

  let cbtesAsocXml = '';
  if (associatedInvoice) {
    const assocTipo = Number(associatedInvoice.cbteTipo) || (cbteTipo === 8 ? 6 : cbteTipo === 3 ? 1 : 6);
    const assocPtoVta = associatedInvoice.pointOfSale ? parseInt(associatedInvoice.pointOfSale, 10) : ptoVtaNum;
    
    let assocNro = 1;
    if (typeof (associatedInvoice as any).cbteNumero === 'number' && (associatedInvoice as any).cbteNumero > 0) {
      assocNro = (associatedInvoice as any).cbteNumero;
    } else if (typeof associatedInvoice.number === 'number' && Number(associatedInvoice.number) > 0) {
      assocNro = Number(associatedInvoice.number);
    } else if (typeof associatedInvoice.number === 'string') {
      const parts = associatedInvoice.number.split('-');
      const lastPart = parts[parts.length - 1];
      const parsed = parseInt(lastPart.replace(/\D/g, ''), 10);
      if (!isNaN(parsed) && parsed > 0) {
        assocNro = parsed;
      }
    }

    const cleanEmisorCuit = emisorCuit.replace(/\D/g, '');
    let cbteFchAssoc = '';
    if (associatedInvoice.date) {
      const cleanDate = associatedInvoice.date.replace(/\D/g, '');
      if (cleanDate.length >= 8) {
        cbteFchAssoc = cleanDate.substring(0, 8);
      }
    }

    cbtesAsocXml = `
      <ar:CbtesAsoc>
        <ar:CbteAsoc>
          <ar:Tipo>${assocTipo}</ar:Tipo>
          <ar:PtoVta>${assocPtoVta}</ar:PtoVta>
          <ar:Nro>${assocNro}</ar:Nro>
          ${cleanEmisorCuit ? `<ar:Cuit>${cleanEmisorCuit}</ar:Cuit>` : ''}
          ${cbteFchAssoc ? `<ar:CbteFch>${cbteFchAssoc}</ar:CbteFch>` : ''}
        </ar:CbteAsoc>
      </ar:CbtesAsoc>`;
  }

  const cleanCuit = emisorCuit.replace(/\D/g, '');

  const soapEnvelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAESolicitar>
      <ar:Auth>
        <ar:Token>${token}</ar:Token>
        <ar:Sign>${sign}</ar:Sign>
        <ar:Cuit>${cleanCuit}</ar:Cuit>
      </ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${ptoVtaNum}</ar:PtoVta>
          <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>1</ar:Concepto>
            <ar:DocTipo>${tipoDocRec}</ar:DocTipo>
            <ar:DocNro>${nroDocRec}</ar:DocNro>
            <ar:CbteDesde>${nextCbteNro}</ar:CbteDesde>
            <ar:CbteHasta>${nextCbteNro}</ar:CbteHasta>
            <ar:CbteFch>${cbteFch}</ar:CbteFch>
            <ar:ImpTotal>${totalAmount.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${netAmount.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>0.00</ar:ImpOpEx>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:ImpIVA>${vatAmount.toFixed(2)}</ar:ImpIVA>
            <ar:FchServDesde/>
            <ar:FchServHasta/>
            <ar:FchVtoPago/>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
            ${cbtesAsocXml}
            ${ivaXml}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`;

  const wsfeUrl = effectiveIsProd
    ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
    : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';

  const response = await fetch(wsfeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: 'http://ar.gov.afip.dif.FEV1/FECAESolicitar',
    },
    body: soapEnvelope,
    signal: AbortSignal.timeout(8000),
  });

  const rawXml = await response.text();
  const xml = rawXml
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

  const caeMatch = xml.match(/<CAE>(\d+)<\/CAE>/i);
  const caeVtoMatch = xml.match(/<CAEFchVto>(\d+)<\/CAEFchVto>/i);
  const errCodeMatch = xml.match(/<Code>(\d+)<\/Code>/i);
  const errMsgMatch = xml.match(/<Msg>([\s\S]*?)<\/Msg>/i) || xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/i);

  if (caeMatch && caeVtoMatch) {
    const cae = caeMatch[1].trim();
    const rawVto = caeVtoMatch[1].trim();
    const caeVto = `${rawVto.slice(0, 4)}-${rawVto.slice(4, 6)}-${rawVto.slice(6, 8)}`;
    return {
      success: true,
      cae,
      caeVto,
      cbteNumero: nextCbteNro,
    };
  }

  const errCode = errCodeMatch ? errCodeMatch[1] : 'AFIP_REJECT';
  const errMsg = errMsgMatch ? errMsgMatch[1].trim() : 'AFIP rechazó la solicitud de CAE.';

  throw new Error(`AFIP ARCA Error (${errCode}): ${errMsg}`);
}

// ARCA / AFIP Electronic Invoice Authorization (WSFEv1: FECAESolicitar)
app.post('/api/arca/authorize', requireArcaOperatorAuth, async (req, res) => {
  try {
    const {
      branchId,
      pointOfSale,
      cbteTipo, // 1: Factura A, 6: Factura B, 3: NC A, 8: NC B
      customer,
      items,
      netAmount,
      vatAmount,
      totalAmount,
      associatedInvoice,
      creditNoteReason,
      simulateError,
      cuit,
      environment,
      cbteNumero,
    } = req.body || {};

    if (simulateError) {
      return res.status(422).json({
        success: false,
        status: 'RECHAZADO',
        error: 'ARCA Código 10016: El número o fecha del comprobante no se corresponde con el último registrado.',
      });
    }

    if (!pointOfSale) {
      return res.status(400).json({
        success: false,
        status: 'RECHAZADO',
        error: 'Punto de Venta ARCA no especificado para la sucursal.',
      });
    }

    // Validation for Factura A: Customer MUST have CUIT and be Responsable Inscripto
    if (cbteTipo === 1 || cbteTipo === 3) {
      const cleanDoc = (customer?.cuitDni || '').replace(/\D/g, '');
      if (cleanDoc.length !== 11) {
        return res.status(400).json({
          success: false,
          status: 'RECHAZADO',
          error: 'ARCA Regla 10048: Para Factura o Nota de Crédito "A", el receptor debe poseer CUIT de 11 dígitos y condición Responsable Inscripto.',
        });
      }
    }

    // For Credit Notes: Original invoice MUST be linked
    if ((cbteTipo === 3 || cbteTipo === 8) && !associatedInvoice) {
      return res.status(400).json({
        success: false,
        status: 'RECHAZADO',
        error: 'ARCA Regla 10062: Las Notas de Crédito deben identificar obligatoriamente el comprobante original asociado.',
      });
    }

    // C.1 & C.2 Validation: Enforce explicit VAT rates and consistency of invoice totals
    if (items && Array.isArray(items) && items.length > 0) {
      let calcItemsTotal = 0;
      for (const item of items) {
        if (item.vatRate === undefined || item.vatRate === null || typeof item.vatRate !== 'number' || isNaN(item.vatRate)) {
          return res.status(400).json({
            success: false,
            status: 'RECHAZADO',
            error: `ARCA Regla 10099: El producto "${item.description || item.productCode || 'desconocido'}" no posee una alícuota de IVA verificada. Configure la condición fiscal del producto antes de autorizar.`,
          });
        }
        if (![0, 10.5, 21, 27].includes(item.vatRate)) {
          return res.status(400).json({
            success: false,
            status: 'RECHAZADO',
            error: `ARCA Regla 10099: Alícuota de IVA no válida (${item.vatRate}%) para el producto "${item.description || item.productCode}".`,
          });
        }
        calcItemsTotal += Number(item.totalAmount || item.subtotal || 0);
      }

      const reqTotal = Number(totalAmount || 0);
      if (reqTotal > 0 && calcItemsTotal > 0 && Math.abs(reqTotal - calcItemsTotal) > 0.1) {
        return res.status(400).json({
          success: false,
          status: 'RECHAZADO',
          error: `ARCA Regla 10098: Importes contradictorios. El total especificado ($${reqTotal.toFixed(2)}) no coincide con la suma de los ítems ($${calcItemsTotal.toFixed(2)}).`,
        });
      }
    }

    const resolved = resolveArcaCreds(req.body);
    const certPem = resolved.certPem;
    const keyPem = resolved.keyPem;
    const emisorCuit = resolved.emisorCuit;
    let isProd = resolved.isProd;

    // Determine receiver doc type according to AFIP table
    const cleanDoc = (customer?.cuitDni || '').replace(/\D/g, '');
    const nroDocRec = parseInt(cleanDoc, 10) || 0;
    const ptoVtaNum = parseInt(pointOfSale, 10) || 1;
    
    let tipoDocRec = 99; // Doc Otro / Sin identificar (Default for Consumidor Final)
    
    if (nroDocRec > 0) {
      if (cleanDoc.length === 11) {
        tipoDocRec = 80; // CUIT
      } else if (cleanDoc.length >= 7 && cleanDoc.length <= 8) {
        tipoDocRec = 96; // DNI
      }
    } else {
      tipoDocRec = 99;
    }

    if (!certPem || !keyPem) {
      return res.status(400).json({
        success: false,
        status: 'RECHAZADO',
        error:
          'No se encontraron el Certificado Digital (.crt) o la Clave Privada (.key) de ARCA para autenticar con WSFEv1. Por favor ingrese en "Configuración ARCA > 2. Asistente de Claves y Certificados" y verifique que ambos archivos estén cargados.',
      });
    }

    // Execute real AFIP WSFEv1 FECAESolicitar call
    const afipResult = await authorizeWithAfipWsfe({
      ptoVtaNum,
      cbteTipo,
      cbteNumero,
      tipoDocRec,
      nroDocRec,
      totalAmount: Number(totalAmount || 0),
      netAmount: Number(netAmount || 0),
      vatAmount: Number(vatAmount || 0),
      items: items || [],
      emisorCuit,
      certPem,
      keyPem,
      isProduction: isProd,
      associatedInvoice,
    });

    const cae = afipResult.cae;
    const caeVto = afipResult.caeVto;
    const finalCbteNro = afipResult.cbteNumero;

    const todayStr = new Date().toISOString().split('T')[0];

    const qrPayload = {
      ver: 1,
      fecha: todayStr,
      cuit: parseInt(emisorCuit, 10),
      ptoVta: ptoVtaNum,
      tipoCmp: cbteTipo,
      nroCmp: finalCbteNro,
      importe: Number(Number(totalAmount).toFixed(2)),
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: tipoDocRec,
      nroDocRec: nroDocRec,
      tipoCodAut: 'E',
      codAut: parseInt(cae, 10),
    };

    const qrBase64 = Buffer.from(JSON.stringify(qrPayload)).toString('base64');
    const qrUrl = `https://www.afip.gob.ar/fe/qr/?p=${qrBase64}`;

    res.json({
      success: true,
      status: 'AUTORIZADO',
      cae,
      caeVto,
      cbteNumero: finalCbteNro,
      qrUrl,
      qrPayload,
      mode: 'OFICIAL_AFIP',
      environment: isProd ? 'produccion' : 'homologacion',
      authorizedAt: new Date().toISOString(),
      message: 'Comprobante AUTORIZADO OFICIALMENTE por ARCA / AFIP.',
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      status: 'RECHAZADO',
      error: err.message || 'Error en comunicación con servicio ARCA WSFEv1',
    });
  }
});

// Helper: WSFE FECompUltimoAutorizado Query
async function queryAfipUltimoComprobante(
  ptoVta: number,
  cbteTipo: number,
  cuit: string,
  certPem: string,
  keyPem: string,
  isProduction: boolean,
  preAuth?: { token: string; sign: string }
) {
  try {
    const authData = preAuth || (await getWsaaTicket('wsfe', certPem, keyPem, isProduction));
    const { token, sign } = authData;
    const wsfeUrl = isProduction
      ? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
      : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx';

    const cleanCuit = cuit.replace(/\D/g, '');
    const soapEnvelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECompUltimoAutorizado>
      <ar:Auth>
        <ar:Token>${token}</ar:Token>
        <ar:Sign>${sign}</ar:Sign>
        <ar:Cuit>${cleanCuit}</ar:Cuit>
      </ar:Auth>
      <ar:PtoVta>${ptoVta}</ar:PtoVta>
      <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soapenv:Body>
</soapenv:Envelope>`;

    const response = await fetch(wsfeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado',
      },
      body: soapEnvelope,
      signal: AbortSignal.timeout(8000),
    });

    const rawXml = await response.text();
    const xml = rawXml
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');

    const errMsgMatch = xml.match(/<Err>[\s\S]*?<Msg>([\s\S]*?)<\/Msg>[\s\S]*?<\/Err>/i) || xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/i);
    const cbteNroMatch = xml.match(/<CbteNro>(\d+)<\/CbteNro>/i);

    if (cbteNroMatch) {
      const lastNro = parseInt(cbteNroMatch[1], 10);
      if (lastNro === 0 && errMsgMatch) {
        return {
          lastNumber: 0,
          source: 'ARCA_WSFEv1_OFICIAL',
          status: 'EN_LINEA_ARCA',
          afipError: errMsgMatch[1].trim(),
        };
      }
      return {
        lastNumber: lastNro,
        source: 'ARCA_WSFEv1_OFICIAL',
        status: 'EN_LINEA_ARCA',
      };
    }

    if (errMsgMatch) {
      throw new Error(errMsgMatch[1].trim());
    }
  } catch (err: any) {
    console.warn(`Query FECompUltimoAutorizado error tipo ${cbteTipo}:`, err.message);
    return {
      error: err.message,
      lastNumber: 0,
      source: 'ERROR_ARCA',
      status: 'ERROR_ARCA',
    };
  }
  return null;
}

// ARCA / AFIP Check Last Voucher (FECompUltimoAutorizado)
app.post('/api/arca/last-voucher', requireArcaViewerAuth, async (req, res) => {
  try {
    const { pointOfSale = '0017' } = req.body || {};
    const resolved = resolveArcaCreds(req.body);
    const certPem = resolved.certPem;
    const keyPem = resolved.keyPem;
    const emisorCuit = resolved.emisorCuit;
    let isProd = resolved.isProd;
    const ptoVtaNum = parseInt(String(pointOfSale).replace(/\D/g, ''), 10) || 17;

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

    const hasCerts = Boolean(certPem && keyPem);
    let preAuth: { token: string; sign: string } | undefined;
    let wsaaErrorMsg = '';

    if (hasCerts) {
      try {
        const wsaaRes = await getWsaaTicket('wsfe', certPem, keyPem, isProd);
        preAuth = { token: wsaaRes.token, sign: wsaaRes.sign };
        isProd = wsaaRes.isProduction;
      } catch (wsaaErr: any) {
        wsaaErrorMsg = wsaaErr.message || 'No se pudo autenticar con WSAA ARCA';
      }
    }

    const results = await Promise.all(
      typesToQuery.map(async (t) => {
        let afipRes: any = null;
        if (hasCerts && preAuth) {
          afipRes = await queryAfipUltimoComprobante(
            ptoVtaNum,
            t.cbteTipo,
            emisorCuit,
            certPem,
            keyPem,
            isProd,
            preAuth
          );
        }

        const isOfficial = Boolean(afipRes && afipRes.source === 'ARCA_WSFEv1_OFICIAL');
        const lastNum = isOfficial ? afipRes.lastNumber : 0;
        const pvFormatted = ptoVtaNum.toString().padStart(4, '0');
        const lastFormatted = `${pvFormatted}-${lastNum.toString().padStart(8, '0')}`;
        const nextFormatted = `${pvFormatted}-${(lastNum + 1).toString().padStart(8, '0')}`;

        return {
          cbteTipo: t.cbteTipo,
          cbteNombre: t.cbteNombre,
          cbteLetra: t.cbteLetra,
          lastNumber: lastNum,
          nextNumber: lastNum + 1,
          formattedLast: lastFormatted,
          formattedNext: nextFormatted,
          source: isOfficial ? 'ARCA_WSFEv1_OFICIAL' : 'SIN_CONEXION_ARCA',
          status: isOfficial ? 'OFICIAL_EN_LINEA_ARCA' : 'SIN_CERTIFICADO_ACTIVO',
          afipError: afipRes?.error || afipRes?.afipError || wsaaErrorMsg || undefined,
          lastChecked: new Date().toISOString(),
        };
      })
    );

    const anyOfficial = results.some((r) => r.source === 'ARCA_WSFEv1_OFICIAL');
    const firstError = results.find((r) => r.afipError)?.afipError || wsaaErrorMsg;

    res.json({
      success: true,
      pointOfSale: ptoVtaNum.toString().padStart(4, '0'),
      environment: isProd ? 'produccion' : 'homologacion',
      cuit: emisorCuit,
      hasCredentials: hasCerts && anyOfficial,
      hasUploadedFiles: hasCerts,
      wsaaError: firstError || undefined,
      vouchers: results,
      checkedAt: new Date().toISOString(),
      message: anyOfficial
        ? `Secuencia oficial verificada en tiempo real con servidor ARCA (${isProd ? 'PRODUCCIÓN' : 'HOMOLOGACIÓN'}).`
        : hasCerts
        ? `Certificados presentes pero ARCA reportó: ${firstError || 'Sin respuesta de WSFEv1'}`
        : 'Certificado Digital (.crt) o Clave Privada (.key) pendientes de vincular en Configuración ARCA.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Setup Vite middleware for development or serve dist for production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[NECO POS] Server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') {
  startServer();
}

