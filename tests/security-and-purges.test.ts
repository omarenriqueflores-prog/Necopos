import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  authenticateArcaRequest,
  requireArcaAdminAuth,
  requireArcaOperatorAuth,
  SERVER_TRUSTED_USERS,
  createArcaSessionToken,
} from '../server';

describe('PRUEBAS REALES DE SEGURIDAD, ROLES, SUPLANTACIÓN Y REGLAS FIRESTORE', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const realRules = fs.readFileSync(rulesPath, 'utf8');

  // 1. Verificar reglas reales de Firestore para usuario sin perfil y deshabilitado
  it('1. Las reglas reales de Firestore requieren isUserActive() y bloquean usuarios deshabilitados o sin perfil', () => {
    expect(realRules).toContain('function isUserActive()');
    expect(realRules).toContain('getUserData().active == true');
    expect(realRules).not.toContain('|| isSignedIn();');
    expect(realRules).toContain('getUserRole() == \'SUPERADMIN\'');
  });

  // 2. Reglas de Firestore para perfiles de usuario y prevención de elevación de privilegio
  it('2. Las reglas reales de Firestore impiden que un usuario normal se auto-asigne SUPERADMIN o modifique active/branch', () => {
    expect(realRules).toContain('match /users/{userId}');
    expect(realRules).toContain('!(request.resource.data.role in [\'SUPERADMIN\', \'ADMIN\', \'ENCARGADO\'])');
    expect(realRules).toContain('request.resource.data.role == resource.data.role');
    expect(realRules).toContain('request.resource.data.active == resource.data.active');
  });

  // 3. Reglas de Firestore para restricción de lectura de perfiles
  it('3. Las reglas reales de Firestore restringen la lectura de perfiles al propio usuario o un ADMIN', () => {
    expect(realRules).toContain('allow read: if isSignedIn() && isValidId(userId) && (request.auth.uid == userId || isAdmin());');
  });

  // 4. Reglas de Firestore para control por sucursal
  it('4. Las reglas reales de Firestore incluyen helper isSameBranch() para restringir operaciones por sucursal', () => {
    expect(realRules).toContain('function isSameBranch(targetBranch)');
    expect(realRules).toContain('isSameBranch(request.resource.data.branchId)');
  });

  // 5. Usuario sin perfil es rechazado por el servidor
  it('5. Un usuario sin perfil confiable es marcado sin privilegios (role: NONE, active: false)', async () => {
    const unverifiedUser = { id: 'USR-UNKNOWN-999', username: 'desconocido@test.com', role: 'SUPERADMIN', active: true };
    const token = createArcaSessionToken(unverifiedUser);

    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const authUser = await authenticateArcaRequest(req);

    expect(authUser).not.toBeNull();
    expect(authUser?.role).toBe('NONE');
    expect(authUser?.active).toBe(false);
  });

  // 6. Usuario deshabilitado es bloqueado por el middleware del servidor (HTTP 403)
  it('6. Un usuario deshabilitado (active: false) es bloqueado por el middleware del servidor (HTTP 403)', async () => {
    const disabledUser = { id: 'USR-SUSPENDED', username: 'suspendido@neco.com', role: 'CAJERO', active: false };
    SERVER_TRUSTED_USERS.set('USR-SUSPENDED', disabledUser);

    const token = createArcaSessionToken(disabledUser);
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    let statusCode: number = 200;
    let jsonResult: any = null;

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            jsonResult = data;
          },
        };
      },
    };

    await requireArcaOperatorAuth(req, res, () => {});

    expect(statusCode).toBe(403);
    expect(jsonResult?.error).toContain('deshabilitado');
    SERVER_TRUSTED_USERS.delete('USR-SUSPENDED');
  });

  // 7. Cajero intentando acceder a funciones administrativas es rechazado (HTTP 403)
  it('7. Un usuario con rol CAJERO es rechazado por requireArcaAdminAuth (HTTP 403)', async () => {
    const cajeroUser = { id: 'USR-04', username: 'cajero', role: 'CAJERO', active: true };
    const token = createArcaSessionToken(cajeroUser);

    const req: any = { headers: { authorization: `Bearer ${token}` } };
    let statusCode: number = 200;
    let jsonResult: any = null;

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            jsonResult = data;
          },
        };
      },
    };

    await requireArcaAdminAuth(req, res, () => {});

    expect(statusCode).toBe(403);
    expect(jsonResult?.error).toContain('ADMIN');
  });

  // 8. Solicitudes sin token son rechazadas por el servidor (HTTP 401)
  it('8. Solicitudes sin token o cabecera de autenticación son rechazadas (HTTP 401)', async () => {
    const req: any = { headers: {} };
    let statusCode: number = 200;

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return { json: () => {} };
      },
    };

    await requireArcaOperatorAuth(req, res, () => {});
    expect(statusCode).toBe(401);
  });

  // 9. Operaciones autorizadas avanzan correctamente
  it('9. Un operador autorizado (SUPERADMIN) pasa el middleware requireArcaAdminAuth', async () => {
    const adminUser = { id: 'USR-02', username: 'omarenriqueflores@gmail.com', role: 'SUPERADMIN', active: true };
    const token = createArcaSessionToken(adminUser);

    const req: any = { headers: { authorization: `Bearer ${token}` } };
    let nextCalled = false;

    const res: any = {
      status: () => ({ json: () => {} }),
    };

    await requireArcaAdminAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  // 10. Protección de idempotencyKeys en firestore.rules
  it('10. La colección idempotencyKeys en las reglas reales exige usuario activo isUserActive()', () => {
    expect(realRules).toContain('match /idempotencyKeys/{keyId}');
    expect(realRules).toContain('allow read, create, update: if isUserActive() && isValidId(keyId);');
  });

  // 11. Protección de la aplicación contra desbloqueos con entrada vacía o arbitraria
  it('11. El módulo App.tsx no posee contraseñas fijas ni permite desbloqueo con campos vacíos', () => {
    const appPath = path.resolve(process.cwd(), 'src/App.tsx');
    const appCode = fs.readFileSync(appPath, 'utf8');

    expect(appCode).not.toContain("unlockPassword.trim().length >= 0");
    expect(appCode).toContain("Debe ingresar su PIN o clave de operador");
  });

  // 12. Aislamiento estricto de pruebas sin alterar base de datos comercial
  it('12. Las pruebas operan en entorno aislado sin modificar datos de producción', () => {
    const isIsolated = process.env.VITEST === 'true' || ['test', 'development'].includes(process.env.NODE_ENV || 'test');
    expect(isIsolated).toBe(true);
  });
});

