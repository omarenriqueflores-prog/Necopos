import { BranchConfig } from '../types/pos';
import { INITIAL_BRANCH_CONFIGS } from '../data/mockData';

export interface InvoiceBranchReference {
  branchId?: 'NECO 1' | 'NECO 2' | string;
  pointOfSale?: string;
  formattedNumber?: string;
  ticketNumber?: string;
}

/**
 * Resuelve de forma estricta y certera la sucursal de emisión de un comprobante
 * según su Punto de Venta fiscal o branchId registrado.
 * 
 * - Punto de Venta 17 (0017 / 00017) -> Siempre NECO 1 (Central)
 * - Punto de Venta 18 (0018 / 00018) -> Siempre NECO 2 (Villa Saavedra)
 * 
 * Esto asegura que al visualizar o reimprimir facturas o notas de crédito,
 * la información de fantasía, razón social y domicilio corresponda inequívocamente
 * al establecimiento donde se emitió el documento, independientemente del usuario
 * o sucursal activa en la sesión actual.
 */
export function resolveBranchForInvoice(
  invoice: InvoiceBranchReference | null | undefined,
  availableBranches?: BranchConfig[],
  fallbackBranch?: BranchConfig
): BranchConfig {
  const allBranches: BranchConfig[] = [
    ...(availableBranches || []),
    INITIAL_BRANCH_CONFIGS['NECO 1'],
    INITIAL_BRANCH_CONFIGS['NECO 2'],
  ];

  if (!invoice) {
    return fallbackBranch || allBranches[0];
  }

  // 1. Extraer punto de venta numérico desde pointOfSale o número formateado (ej. "00017-00000001")
  let posRaw = invoice.pointOfSale || '';
  if (!posRaw) {
    const fullNum = invoice.formattedNumber || invoice.ticketNumber || '';
    if (fullNum.includes('-')) {
      posRaw = fullNum.split('-')[0];
    }
  }
  const cleanPos = posRaw.replace(/\D/g, '');
  const posNumber = parseInt(cleanPos, 10);

  // Regla fiscal de puntos de venta de Carnicerías NECO
  if (posNumber === 17 || cleanPos === '0017' || cleanPos === '00017') {
    const b1 = allBranches.find((b) => b?.id === 'NECO 1');
    if (b1) return b1;
  }

  if (posNumber === 18 || cleanPos === '0018' || cleanPos === '00018') {
    const b2 = allBranches.find((b) => b?.id === 'NECO 2');
    if (b2) return b2;
  }

  // 2. Si no se identificó por PV, buscar por branchId explícito del documento
  if (invoice.branchId === 'NECO 1') {
    const b1 = allBranches.find((b) => b?.id === 'NECO 1');
    if (b1) return b1;
  }
  if (invoice.branchId === 'NECO 2') {
    const b2 = allBranches.find((b) => b?.id === 'NECO 2');
    if (b2) return b2;
  }

  // 3. Buscar si alguna sucursal configurada coincide con el punto de venta
  if (posNumber) {
    const matched = allBranches.find((b) => {
      const bPosClean = b?.pointOfSale?.replace(/\D/g, '') || '';
      return parseInt(bPosClean, 10) === posNumber;
    });
    if (matched) return matched;
  }

  return fallbackBranch || allBranches[0];
}
