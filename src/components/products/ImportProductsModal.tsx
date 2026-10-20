import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
} from 'lucide-react';
import { Product } from '../../types/pos';
import { WindowsModal } from '../common/WindowsModal';
import { formatCurrency, isStoreUnitProduct } from '../../utils/scaleParser';

interface ImportProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (products: Product[], replaceAll: boolean) => Promise<void>;
  existingCount: number;
}

export const ImportProductsModal: React.FC<ImportProductsModalProps> = ({
  isOpen,
  onClose,
  onImport,
  existingCount,
}) => {
  const [parsedProducts, setParsedProducts] = useState<Product[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [replaceAll, setReplaceAll] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        PLU: '101',
        CODIGO: '101',
        DESCRIPCION: 'ASADO DE TIRA',
        RUBRO: 'Carnes Vacunas',
        CATEGORIA: 'Novillito',
        UNIDAD: 'Kg',
        PRECIO: 11500,
      },
      {
        PLU: '102',
        CODIGO: '102',
        DESCRIPCION: 'VACIO ESPECIAL',
        RUBRO: 'Carnes Vacunas',
        CATEGORIA: 'Ternera',
        UNIDAD: 'Kg',
        PRECIO: 12900,
      },
      {
        PLU: '10112',
        CODIGO: '10112',
        DESCRIPCION: 'COCA COLA X 2.250ML',
        RUBRO: 'Bebidas',
        CATEGORIA: 'Bebidas',
        UNIDAD: 'Unid',
        PRECIO: 4500,
      },
      {
        PLU: '10113',
        CODIGO: '10113',
        DESCRIPCION: 'MAYONESA NATURA X 500G',
        RUBRO: 'Almacén',
        CATEGORIA: 'Almacén',
        UNIDAD: 'Unid',
        PRECIO: 2800,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 12 }, // PLU
      { wch: 12 }, // CODIGO
      { wch: 32 }, // DESCRIPCION
      { wch: 20 }, // RUBRO
      { wch: 18 }, // CATEGORIA
      { wch: 10 }, // UNIDAD
      { wch: 14 }, // PRECIO
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla_Articulos');
    XLSX.writeFile(wb, 'plantilla_articulos_necopos.xlsx');
  };

  const normalizeKey = (s: string): string =>
    String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  const processFile = async (file: File) => {
    setErrorMsg('');
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      if (!wb.SheetNames.length) {
        throw new Error('El archivo Excel no contiene hojas de cálculo legibles.');
      }
      const firstSheet = wb.Sheets[wb.SheetNames[0]];

      // Read as 2D array first to locate the actual header row even if there are title/empty rows above
      const aoa = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1, defval: '' });
      if (!aoa || aoa.length === 0) {
        throw new Error('No se detectaron filas de datos en la primera hoja del archivo.');
      }

      const headerKeywords = [
        'plu',
        'plubalanza',
        'nroplu',
        'codplu',
        'codigoplu',
        'codigo',
        'cod',
        'code',
        'id',
        'articulo',
        'item',
        'descripcion',
        'desc',
        'nombre',
        'detalle',
        'producto',
        'corte',
        'denominacion',
        'rubro',
        'departamento',
        'seccion',
        'familia',
        'categoria',
        'especie',
        'category',
        'unidad',
        'unidaddemedida',
        'um',
        'medida',
        'unit',
        'tipo',
        'precio',
        'precioventa',
        'price',
        'pvp',
        'venta',
        'importe',
        'valor',
        'costo',
        'preciocosto',
        'stock',
        'existencia',
      ];

      let headerRowIndex = 0;
      let maxMatches = 0;
      const scanLimit = Math.min(15, aoa.length);
      for (let r = 0; r < scanLimit; r++) {
        const rowCells = Array.isArray(aoa[r]) ? aoa[r] : [];
        let matches = 0;
        for (const cell of rowCells) {
          const normCell = normalizeKey(String(cell ?? ''));
          if (normCell && headerKeywords.some((hk) => normCell === hk || (hk.length >= 4 && normCell.includes(hk)))) {
            matches++;
          }
        }
        if (matches > maxMatches) {
          maxMatches = matches;
          headerRowIndex = r;
        }
        if (matches >= 2) {
          headerRowIndex = r;
          break;
        }
      }

      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, {
        defval: '',
        range: headerRowIndex,
      });

      if (!rawRows || rawRows.length === 0) {
        throw new Error('No se detectaron filas de datos en la primera hoja del archivo.');
      }

      const productsMapped: Product[] = [];

      rawRows.forEach((row, idx) => {
        const normKeys = Object.keys(row).map((k) => ({
          original: k,
          norm: normalizeKey(k),
        }));

        const getVal = (
          possibleKeys: string[],
          excludeSubstrings: string[] = []
        ): any => {
          // 1. Exact match on normalized key
          for (const pk of possibleKeys) {
            const cleanPk = normalizeKey(pk);
            const found = normKeys.find((k) => k.norm === cleanPk);
            if (
              found &&
              row[found.original] !== undefined &&
              row[found.original] !== null &&
              String(row[found.original]).trim() !== ''
            ) {
              return row[found.original];
            }
          }

          // 2. Column header contains keyword (k.norm.includes(cleanPk) ONLY — never cleanPk.includes(k.norm))
          for (const pk of possibleKeys) {
            const cleanPk = normalizeKey(pk);
            if (cleanPk.length < 3) continue;

            const found = normKeys.find(
              (k) =>
                k.norm.includes(cleanPk) &&
                !excludeSubstrings.some((ex) => k.norm.includes(ex))
            );
            if (
              found &&
              row[found.original] !== undefined &&
              row[found.original] !== null &&
              String(row[found.original]).trim() !== ''
            ) {
              return row[found.original];
            }
          }

          return undefined;
        };

        const rawPlu = getVal([
          'plu',
          'plubalanza',
          'nroplu',
          'numeroplu',
          'codplu',
          'codigoplu',
          'balanza',
        ]);
        const rawCode = getVal(
          ['codigo', 'cod', 'code', 'codinterno', 'codigointerno', 'id', 'articulo', 'item'],
          ['barra', 'ean', 'gtin', 'plu']
        );
        const rawBarcode = getVal([
          'codigobarras',
          'codigodebarras',
          'codbarras',
          'codbarra',
          'barras',
          'barcode',
          'ean13',
          'gtin',
        ]);
        const rawDesc = getVal([
          'descripcion',
          'desc',
          'nombre',
          'detalle',
          'producto',
          'corte',
          'denominacion',
          'articulodescripcion',
        ]);
        const rawRubro = getVal(['rubro', 'departamento', 'seccion', 'familia']);
        const rawCategory = getVal(['categoria', 'especie', 'category', 'subrubro', 'grupo']);
        const rawUnit = getVal(['unidad', 'unidaddemedida', 'um', 'medida', 'unit', 'tipo', 'tipoventa']);
        const rawPrice = getVal(['precio', 'precioventa', 'price', 'pvp', 'venta', 'importe', 'valor']);
        const rawCost = getVal(['costo', 'preciocosto', 'cost', 'costprice', 'pcosto']);
        const rawStockNeco1 = getVal(['stockneco1', 'neco1', 'camaraneco1', 'almacenneco1']);
        const rawStockNeco2 = getVal(['stockneco2', 'neco2', 'camaraneco2', 'almacenneco2']);
        const rawStock = getVal(['stock', 'stocktotal', 'existencia', 'existencias', 'cantidad']);
        const rawVat = getVal(['iva', 'alicuota', 'vat', 'tasaiva']);
        const rawActive = getVal(['activo', 'active', 'estado', 'habilitado']);

        const description = String(rawDesc || '').trim().toUpperCase();
        if (!description) return; // Skip empty or header-repeat rows

        const pluClean =
          rawPlu !== undefined && rawPlu !== null && String(rawPlu).trim() !== ''
            ? String(rawPlu).trim()
            : null;
        const codeClean =
          rawCode !== undefined && rawCode !== null && String(rawCode).trim() !== ''
            ? String(rawCode).trim()
            : null;

        // If Excel has PLU and no separate CODIGO, use PLU as code; if it has CODIGO and no PLU, use CODIGO as PLU
        const code = codeClean || pluClean || String(idx + 1);
        const scalePlu = pluClean || codeClean || String(idx + 1);

        // Only set barcode if the Excel explicitly has a barcode column with a value
        const barcode =
          rawBarcode !== undefined && rawBarcode !== null && String(rawBarcode).trim() !== ''
            ? String(rawBarcode).trim()
            : null;

        const parseNum = (val: any, fallback = 0): number => {
          if (val === undefined || val === null || val === '') return fallback;
          if (typeof val === 'number') return isNaN(val) ? fallback : val;
          let str = String(val).replace('$', '').replace(/\s/g, '').trim();
          if (str.includes(',') && str.includes('.')) {
            if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
              str = str.replace(/\./g, '').replace(',', '.');
            } else {
              str = str.replace(/,/g, '');
            }
          } else if (str.includes(',')) {
            str = str.replace(',', '.');
          }
          const n = parseFloat(str);
          return isNaN(n) ? fallback : n;
        };

        const price = parseNum(rawPrice, 0);
        const costPrice = rawCost !== undefined && rawCost !== '' ? parseNum(rawCost, 0) : undefined;
        const stockNeco1 = rawStockNeco1 !== undefined && rawStockNeco1 !== '' ? parseNum(rawStockNeco1, 0) : undefined;
        const stockNeco2 = rawStockNeco2 !== undefined && rawStockNeco2 !== '' ? parseNum(rawStockNeco2, 0) : undefined;
        const stock = rawStock !== undefined && rawStock !== '' ? parseNum(rawStock, 0) : undefined;
        const vatRate = rawVat !== undefined && rawVat !== '' ? parseNum(rawVat, 21) : undefined;

        let rubro = String(rawRubro || '').trim();
        let category = String(rawCategory || '').trim();

        const isStoreItem = isStoreUnitProduct({
          description,
          rubro,
          category,
        });

        // Preserve exact rubro and category from the Excel if provided
        if (rubro && !category) {
          category = rubro;
        } else if (category && !rubro) {
          rubro = category;
        } else if (!rubro && !category) {
          if (isStoreItem) {
            rubro = 'Almacén';
            category = 'Almacén';
          } else {
            rubro = 'Carnes Vacunas';
            if (description.includes(' VACA') || description.endsWith('VACA') || description.includes(' - VACA')) {
              category = 'Vaca';
            } else if (description.includes(' TERNERA') || description.endsWith('TERNERA')) {
              category = 'Ternera';
            } else if (description.includes(' NOVILLITO') || description.endsWith('NOVILLITO')) {
              category = 'Novillito';
            } else if (description.includes(' NOVILLO') || description.endsWith('NOVILLO')) {
              category = 'Novillo Pesado';
            } else if (description.includes(' VAQUILLONA') || description.endsWith('VAQUILLONA')) {
              category = 'Vaquillona';
            } else if (description.includes(' CERDO') || description.includes('PORCINO')) {
              category = 'Cerdo';
              rubro = 'Cerdo';
            } else {
              category = 'Novillito';
            }
          }
        }

        // Respect explicit UNIDAD from Excel first; only infer if missing in Excel
        const unitValStr = String(rawUnit || '')
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');

        let unitType: 'Kg' | 'Unid' = 'Kg';
        if (unitValStr) {
          if (
            unitValStr.includes('unid') ||
            unitValStr.includes('uni') ||
            unitValStr === 'u' ||
            unitValStr === 'un' ||
            unitValStr.includes('pieza') ||
            unitValStr.includes('pza') ||
            unitValStr.includes('pack') ||
            unitValStr.includes('lata') ||
            unitValStr.includes('botella') ||
            unitValStr.includes('bolsa') ||
            unitValStr.includes('caja')
          ) {
            unitType = 'Unid';
          } else {
            unitType = 'Kg';
          }
        } else {
          unitType = isStoreItem ? 'Unid' : 'Kg';
        }

        const active =
          rawActive === undefined || rawActive === ''
            ? true
            : !['no', 'false', '0', 'inactivo', 'baja'].includes(String(rawActive).toLowerCase().trim());

        const productObj: Product = {
          code,
          barcode,
          description,
          rubro,
          category,
          unitType,
          price,
          scalePlu,
          active,
        };

        if (costPrice !== undefined) {
          productObj.costPrice = costPrice;
          productObj.costo = costPrice;
        }
        if (stockNeco1 !== undefined) productObj.stockNeco1 = stockNeco1;
        if (stockNeco2 !== undefined) productObj.stockNeco2 = stockNeco2;
        if (stock !== undefined) productObj.stock = stock;
        if (vatRate !== undefined) productObj.vatRate = vatRate;

        productsMapped.push(productObj);
      });

      if (productsMapped.length === 0) {
        throw new Error('No se encontraron columnas reconocibles (ej. PLU, Código, Descripción, Precio). Asegúrese de incluir encabezados.');
      }

      setParsedProducts(productsMapped);
    } catch (err: any) {
      console.error('Error leyendo Excel:', err);
      setErrorMsg(err.message || 'Error al procesar el archivo Excel. Verifique el formato.');
      setParsedProducts([]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleExecuteImport = async () => {
    if (!parsedProducts.length) return;
    setIsProcessing(true);
    try {
      await onImport(parsedProducts, replaceAll);
      onClose();
    } catch (err: any) {
      console.error('Error al guardar en base de datos:', err);
      setErrorMsg('Error al guardar en la base de datos Firestore: ' + (err.message || 'Intente nuevamente'));
    } finally {
      setIsProcessing(false);
    }
  };

  const setAllUnits = (unit: 'Kg' | 'Unid') => {
    setParsedProducts((prev) => prev.map((p) => ({ ...p, unitType: unit })));
  };

  const toggleProductUnit = (index: number) => {
    setParsedProducts((prev) =>
      prev.map((p, idx) => (idx === index ? { ...p, unitType: p.unitType === 'Kg' ? 'Unid' : 'Kg' } : p))
    );
  };

  return (
    <WindowsModal
      title="CARGA MASIVA E IMPORTACIÓN DE ARTÍCULOS DESDE EXCEL (.XLSX / .XLS)"
      isOpen={isOpen}
      onClose={onClose}
      width="max-w-4xl"
    >
      <div className="p-4 flex flex-col gap-4 text-[#181c1f] text-[12px]">
        {/* Top Explanation & Download Template */}
        <div className="bg-[#f1f4f8] p-3 border border-[#c4c6cf] flex items-center justify-between gap-4">
          <div className="flex items-start gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#002046] shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-[13px] text-[#002046]">
                Importador Masivo de Catálogo, PLU y Precios
              </div>
              <div className="text-[#44474e] text-[11px]">
                Sube tu listado de artículos en formato Excel (.xlsx, .xls) o CSV para cargar PLU, códigos, descripciones, rubros, precios, costos o stock tal cual están en tu planilla.
              </div>
            </div>
          </div>
          <button
            onClick={handleDownloadTemplate}
            className="h-[30px] px-3 bg-white hover:bg-[#e5e8ec] border border-[#74777f] text-[#002046] font-bold text-[11px] flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer"
            title="Descargar archivo Excel de ejemplo con las columnas recomendadas"
          >
            <Download className="w-3.5 h-3.5 text-[#002046]" />
            <span>Descargar Plantilla Modelo</span>
          </button>
        </div>

        {/* Drag & Drop File Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed p-6 text-center rounded cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 ${
            isDragging
              ? 'border-[#002046] bg-[#d4e3ff]/30'
              : fileName
              ? 'border-[#00875a] bg-[#e3fcef]/30'
              : 'border-[#74777f] hover:border-[#002046] bg-white'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <FileUp className={`w-8 h-8 ${fileName ? 'text-[#00875a]' : 'text-[#002046]'}`} />
          {fileName ? (
            <div className="flex flex-col items-center">
              <span className="font-bold text-[13px] text-[#002046]">{fileName}</span>
              <span className="text-[11px] text-[#44474e]">
                {parsedProducts.length} artículos detectados. Haz clic si deseas seleccionar otro archivo.
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <span className="font-bold text-[13px] text-[#002046]">
                Arrastra tu archivo Excel aquí o haz clic para seleccionarlo
              </span>
              <span className="text-[11px] text-[#74777f]">
                Formatos compatibles: .xlsx, .xls, .csv
              </span>
            </div>
          )}
        </div>

        {/* Error message if any */}
        {errorMsg && (
          <div className="p-2.5 bg-[#ffdad6] text-[#ba1a1a] border border-[#ba1a1a] flex items-center gap-2 text-[11px] font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Preview of Parsed Products */}
        {parsedProducts.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
              <span className="text-[#002046] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#00875a]" />
                Vista Previa de Carga ({parsedProducts.length} artículos listos para ingresar)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#74777f] font-normal">Ajustar Unidades:</span>
                <button
                  type="button"
                  onClick={() => setAllUnits('Kg')}
                  className="h-[22px] px-2 bg-[#002046] hover:bg-[#1b365d] text-white text-[10px] font-bold cursor-pointer"
                  title="Asignar KG a todos los artículos detectados"
                >
                  Todos a KG
                </button>
                <button
                  type="button"
                  onClick={() => setAllUnits('Unid')}
                  className="h-[22px] px-2 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#002046] text-[10px] font-bold cursor-pointer"
                  title="Asignar UNID a todos los artículos detectados"
                >
                  Todos a UNID
                </button>
              </div>
            </div>

            <div className="max-h-[240px] overflow-y-auto border border-[#74777f] bg-white">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="bg-[#e5e8ec] font-bold text-[#181c1f] sticky top-0 border-b border-[#c4c6cf]">
                  <tr className="h-6">
                    <th className="px-2 text-center border-r border-[#c4c6cf] bg-[#dce5f5] text-[#002046]">PLU</th>
                    <th className="px-2 border-r border-[#c4c6cf]">CÓDIGO</th>
                    <th className="px-2 border-r border-[#c4c6cf]">DESCRIPCIÓN</th>
                    <th className="px-2 border-r border-[#c4c6cf]">RUBRO / CATEGORÍA</th>
                    <th className="px-2 text-center border-r border-[#c4c6cf]">UNIDAD (CLIC CAMBIAR)</th>
                    <th className="px-2 text-right border-r border-[#c4c6cf]">PRECIO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebeef2]">
                  {parsedProducts.map((p, i) => (
                    <tr key={`imp-${p.code || i}-${i}`} className="h-6 hover:bg-[#f1f4f8]">
                      <td className="px-2 text-center font-mono font-bold text-[#002046] bg-[#f5f8ff] border-r border-[#c4c6cf]">
                        {p.scalePlu || p.code}
                      </td>
                      <td className="px-2 font-mono font-bold text-[#002046] border-r border-[#c4c6cf]">
                        {p.code}
                      </td>
                      <td className="px-2 font-bold border-r border-[#c4c6cf] truncate max-w-[260px]">
                        {p.description}
                      </td>
                      <td className="px-2 border-r border-[#c4c6cf] text-[#44474e]">
                        {p.rubro && p.category && p.rubro !== p.category
                          ? `${p.rubro} / ${p.category}`
                          : p.rubro || p.category}
                      </td>
                      <td className="px-2 text-center border-r border-[#c4c6cf]">
                        <button
                          type="button"
                          onClick={() => toggleProductUnit(i)}
                          className={`px-2 py-0.5 text-[10px] font-bold cursor-pointer transition-colors ${
                            p.unitType === 'Kg'
                              ? 'bg-[#002046] text-white'
                              : 'bg-[#ffdad6] text-[#ba1a1a] border border-[#ba1a1a]'
                          }`}
                          title="Clic para alternar entre Kg y Unid"
                        >
                          {p.unitType}
                        </button>
                      </td>
                      <td className="px-2 text-right font-mono font-bold text-[#002046] border-r border-[#c4c6cf]">
                        {formatCurrency(p.price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Options: Replace vs Merge */}
            <div className="bg-[#f8f9fc] p-3 border border-[#c4c6cf] flex flex-col gap-2 mt-1">
              <span className="font-bold text-[#002046] text-[11px]">Modo de Carga en Base de Datos:</span>
              <div className="flex flex-col sm:flex-row gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="importMode"
                    checked={!replaceAll}
                    onChange={() => setReplaceAll(false)}
                    className="accent-[#002046]"
                  />
                  <span>
                    <strong>Agregar y Actualizar:</strong> Mantiene los artículos que ya tienes ({existingCount}) y añade o actualiza los del Excel.
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none text-[#ba1a1a]">
                  <input
                    type="radio"
                    name="importMode"
                    checked={replaceAll}
                    onChange={() => setReplaceAll(true)}
                    className="accent-[#ba1a1a]"
                  />
                  <span>
                    <strong>Reemplazar Catálogo:</strong> Vacía los artículos actuales y deja únicamente los que subas en este archivo.
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#c4c6cf]">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="h-[30px] px-4 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] font-bold text-[11px] cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!parsedProducts.length || isProcessing}
            onClick={handleExecuteImport}
            className="h-[30px] px-5 bg-[#002046] hover:bg-[#1b365d] disabled:opacity-40 text-white font-bold text-[11px] flex items-center gap-2 cursor-pointer shadow-sm"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Guardando en Firestore...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>Confirmar e Importar {parsedProducts.length} Artículos</span>
              </>
            )}
          </button>
        </div>
      </div>
    </WindowsModal>
  );
};
