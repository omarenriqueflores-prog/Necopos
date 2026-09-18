import { CashClosure, CashMovement, BranchConfig } from '../types/pos';

export interface ShiftSchedule {
  name: 'MAÑANA' | 'TARDE';
  label: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  timeRangeText: string;
}

export interface DaySchedule {
  dayOfWeek: number; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  dayName: string;
  shifts: ShiftSchedule[];
}

export const COMMERCIAL_SCHEDULE: Record<number, DaySchedule> = {
  // 0: Domingo (8:00 a 13:30)
  0: {
    dayOfWeek: 0,
    dayName: 'Domingo',
    shifts: [
      {
        name: 'MAÑANA',
        label: 'Turno Mañana (Único)',
        startHour: 8,
        startMinute: 0,
        endHour: 13,
        endMinute: 30,
        timeRangeText: '08:00 a 13:30',
      },
    ],
  },
  // 1: Lunes (8:00 a 13:30 y 18:00 a 22:00)
  1: {
    dayOfWeek: 1,
    dayName: 'Lunes',
    shifts: [
      {
        name: 'MAÑANA',
        label: 'Turno Mañana',
        startHour: 8,
        startMinute: 0,
        endHour: 13,
        endMinute: 30,
        timeRangeText: '08:00 a 13:30',
      },
      {
        name: 'TARDE',
        label: 'Turno Tarde / Noche',
        startHour: 18,
        startMinute: 0,
        endHour: 22,
        endMinute: 0,
        timeRangeText: '18:00 a 22:00',
      },
    ],
  },
  // 2: Martes
  2: {
    dayOfWeek: 2,
    dayName: 'Martes',
    shifts: [
      {
        name: 'MAÑANA',
        label: 'Turno Mañana',
        startHour: 8,
        startMinute: 0,
        endHour: 13,
        endMinute: 30,
        timeRangeText: '08:00 a 13:30',
      },
      {
        name: 'TARDE',
        label: 'Turno Tarde / Noche',
        startHour: 18,
        startMinute: 0,
        endHour: 22,
        endMinute: 0,
        timeRangeText: '18:00 a 22:00',
      },
    ],
  },
  // 3: Miércoles
  3: {
    dayOfWeek: 3,
    dayName: 'Miércoles',
    shifts: [
      {
        name: 'MAÑANA',
        label: 'Turno Mañana',
        startHour: 8,
        startMinute: 0,
        endHour: 13,
        endMinute: 30,
        timeRangeText: '08:00 a 13:30',
      },
      {
        name: 'TARDE',
        label: 'Turno Tarde / Noche',
        startHour: 18,
        startMinute: 0,
        endHour: 22,
        endMinute: 0,
        timeRangeText: '18:00 a 22:00',
      },
    ],
  },
  // 4: Jueves
  4: {
    dayOfWeek: 4,
    dayName: 'Jueves',
    shifts: [
      {
        name: 'MAÑANA',
        label: 'Turno Mañana',
        startHour: 8,
        startMinute: 0,
        endHour: 13,
        endMinute: 30,
        timeRangeText: '08:00 a 13:30',
      },
      {
        name: 'TARDE',
        label: 'Turno Tarde / Noche',
        startHour: 18,
        startMinute: 0,
        endHour: 22,
        endMinute: 0,
        timeRangeText: '18:00 a 22:00',
      },
    ],
  },
  // 5: Viernes
  5: {
    dayOfWeek: 5,
    dayName: 'Viernes',
    shifts: [
      {
        name: 'MAÑANA',
        label: 'Turno Mañana',
        startHour: 8,
        startMinute: 0,
        endHour: 13,
        endMinute: 30,
        timeRangeText: '08:00 a 13:30',
      },
      {
        name: 'TARDE',
        label: 'Turno Tarde / Noche',
        startHour: 18,
        startMinute: 0,
        endHour: 22,
        endMinute: 0,
        timeRangeText: '18:00 a 22:00',
      },
    ],
  },
  // 6: Sábado
  6: {
    dayOfWeek: 6,
    dayName: 'Sábado',
    shifts: [
      {
        name: 'MAÑANA',
        label: 'Turno Mañana',
        startHour: 8,
        startMinute: 0,
        endHour: 13,
        endMinute: 30,
        timeRangeText: '08:00 a 13:30',
      },
      {
        name: 'TARDE',
        label: 'Turno Tarde / Noche',
        startHour: 18,
        startMinute: 0,
        endHour: 22,
        endMinute: 0,
        timeRangeText: '18:00 a 22:00',
      },
    ],
  },
};

export interface CurrentShiftStatus {
  dayName: string;
  isSunday: boolean;
  isOpenNow: boolean;
  activeShiftName: 'MAÑANA' | 'TARDE' | 'FUERA_DE_HORARIO';
  shiftLabel: string;
  scheduleText: string;
  nextShiftText: string;
  recommendedShift: 'MAÑANA' | 'TARDE';
}

/**
 * Calculates current commercial schedule status based on current time
 */
export function getCurrentShiftStatus(now = new Date()): CurrentShiftStatus {
  const dayOfWeek = now.getDay();
  const dayConfig = COMMERCIAL_SCHEDULE[dayOfWeek];
  const isSunday = dayOfWeek === 0;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const morningStart = 8 * 60; // 08:00
  const morningEnd = 13 * 60 + 30; // 13:30
  const eveningStart = 18 * 60; // 18:00
  const eveningEnd = 22 * 60; // 22:00

  if (currentMinutes >= morningStart && currentMinutes <= morningEnd) {
    return {
      dayName: dayConfig.dayName,
      isSunday,
      isOpenNow: true,
      activeShiftName: 'MAÑANA',
      shiftLabel: 'Turno Mañana',
      scheduleText: '08:00 a 13:30',
      nextShiftText: isSunday ? 'Cierre dominical a las 13:30' : 'Cierre de turno a las 13:30 (Reanuda 18:00)',
      recommendedShift: 'MAÑANA',
    };
  }

  if (!isSunday && currentMinutes >= eveningStart && currentMinutes <= eveningEnd) {
    return {
      dayName: dayConfig.dayName,
      isSunday: false,
      isOpenNow: true,
      activeShiftName: 'TARDE',
      shiftLabel: 'Turno Tarde / Noche',
      scheduleText: '18:00 a 22:00',
      nextShiftText: 'Cierre Z definitivo de jornada a las 22:00',
      recommendedShift: 'TARDE',
    };
  }

  // Outside business hours (Recess or closed)
  if (!isSunday && currentMinutes > morningEnd && currentMinutes < eveningStart) {
    return {
      dayName: dayConfig.dayName,
      isSunday: false,
      isOpenNow: false,
      activeShiftName: 'FUERA_DE_HORARIO',
      shiftLabel: 'Receso Comercial Intermedio',
      scheduleText: 'Próxima apertura: Turno Tarde 18:00 a 22:00',
      nextShiftText: 'Apertura comercial a las 18:00 hs',
      recommendedShift: 'TARDE',
    };
  }

  return {
    dayName: dayConfig.dayName,
    isSunday,
    isOpenNow: false,
    activeShiftName: 'FUERA_DE_HORARIO',
    shiftLabel: 'Local Comercial Cerrado',
    scheduleText: isSunday ? 'Horario: Domingo 08:00 a 13:30' : 'Horario: 08:00 a 13:30 y 18:00 a 22:00',
    nextShiftText: 'Próxima apertura comercial: 08:00 hs',
    recommendedShift: currentMinutes < morningStart ? 'MAÑANA' : 'MAÑANA',
  };
}

/**
 * Extracts a normalized date string (YYYY-MM-DD) from a date or date string
 */
export function normalizeDateKey(dateStr?: string | null): string {
  if (!dateStr) {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }
  // Remove commas and extra whitespace
  const clean = dateStr.replace(/,/g, '').trim();

  if (clean.includes('T')) {
    return clean.split('T')[0];
  }
  if (clean.includes('/')) {
    // Format DD/MM/YYYY or DD/MM/YYYY HH:mm
    const parts = clean.split(' ')[0].split('/');
    if (parts.length === 3) {
      const day = parts[0].replace(/\D/g, '').padStart(2, '0');
      const month = parts[1].replace(/\D/g, '').padStart(2, '0');
      const year = parts[2].replace(/\D/g, '');
      if (year.length === 4 && day.length === 2 && month.length === 2) {
        return `${year}-${month}-${day}`;
      }
    }
  }
  if (clean.includes('-')) {
    const parts = clean.split(' ')[0].split('-');
    if (parts.length >= 3 && parts[0].replace(/\D/g, '').length === 4) {
      const year = parts[0].replace(/\D/g, '');
      const month = parts[1].replace(/\D/g, '').padStart(2, '0');
      const day = parts[2].replace(/\D/g, '').padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  // Fallback: try parsing Date
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }

  // If it is already a valid YYYY-MM-DD string, return it
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (regex.test(dateStr)) {
    return dateStr;
  }
  return '';
}

/**
 * Ensures any closure date is displayed formatted cleanly as DD/MM/YYYY HH:mm:ss
 */
export function formatSafeClosureDate(dateStr?: string | null): string {
  if (!dateStr || dateStr.includes('undefined')) {
    return new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR');
  }
  // If it already looks like a valid date time
  if (dateStr.includes('/') && !dateStr.includes('undefined')) {
    return dateStr;
  }
  // If it is ISO format
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('es-AR') + ' ' + parsed.toLocaleTimeString('es-AR');
  }
  return dateStr;
}

/**
 * Safely extracts the date key (YYYY-MM-DD) from a movement using m.date,
 * the timestamp encoded in its ID (e.g., CM-1726582828300), or fallback to m.time parsing.
 */
export function getMovementDateString(m: any): string {
  if (m.date) {
    return normalizeDateKey(m.date);
  }
  if (m.id && m.id.startsWith('CM-')) {
    const ts = parseInt(m.id.split('-')[1], 10);
    if (!isNaN(ts) && ts > 0) {
      const mDate = new Date(ts);
      return `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, '0')}-${String(mDate.getDate()).padStart(2, '0')}`;
    }
  }
  return normalizeDateKey(m.time);
}

export interface AutoClosureResult {
  executed: boolean;
  closuresCreated: CashClosure[];
  message?: string;
}

/**
 * DESACTIVADO SEGÚN REQUERIMIENTO DE OPERACIÓN:
 * Los cierres automáticos han sido desactivados por completo. El operador es el único autorizado para realizar Cierres Z.
 */
export function evaluateAutoClosures(_params?: {
  sales?: any[];
  cashMovements?: CashMovement[];
  cashClosures?: CashClosure[];
  branchConfigs?: Record<'NECO 1' | 'NECO 2', BranchConfig>;
  currentDate?: Date;
}): CashClosure[] {
  // Siempre retornar arreglo vacío. No generar cierres automáticos del sistema.
  return [];
}
