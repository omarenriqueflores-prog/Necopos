import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Package,
  Search,
  Filter,
  Plus,
  Edit2,
  Trash2,
  Scale,
  Download,
  Upload,
  CheckCircle,
  Save,
  RefreshCw,
  Barcode,
} from 'lucide-react';
import { Product, BranchConfig, UserAccount, ANIMAL_CATEGORIES } from '../../types/pos';
import { formatCurrency, formatWeight } from '../../utils/scaleParser';
import { isMeatProduct } from '../../utils/stockHelper';
import { WindowsModal } from '../common/WindowsModal';
import { useDialog } from '../../context/DialogContext';
import { ImportProductsModal } from './ImportProductsModal';

interface ProductsScreenProps {
  products: Product[];
  onUpdateProduct: (product: Product) => void;
  onAddProduct: (product: Product) => void;
  onDeleteProduct: (code: string) => void;
  onPurgeProducts?: () => void;
  onBatchImportProducts?: (products: Product[], replaceAll: boolean) => Promise<void>;
  currentBranch: BranchConfig;
  currentUser?: UserAccount;
}

export const ProductsScreen: React.FC<ProductsScreenProps> = ({
  products,
  onUpdateProduct,
  onAddProduct,
  onDeleteProduct,
  onPurgeProducts,
  onBatchImportProducts,
  currentBranch,
  currentUser,
}) => {
  const { showAlert } = useDialog();

  const canModifyPrices =
    currentUser?.role === 'SUPERADMIN' ||
    currentUser?.role === 'ADMIN' ||
    currentUser?.permissions?.canModifyPrices !== false;

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('TODAS');
  const [selectedProductCode, setSelectedProductCode] = useState<string>(products[0]?.code || '');
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isScaleExportOpen, setIsScaleExportOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isNewMode, setIsNewMode] = useState<boolean>(false);
  const [barcodeCaptured, setBarcodeCaptured] = useState<boolean>(false);
  const barcodeFieldRef = useRef<HTMLInputElement>(null);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStatus, setExportStatus] = useState<'IDLE' | 'SENDING' | 'DONE'>('IDLE');

  const categories = useMemo(() => {
    const existingCats = products.map((p) => p?.category).filter(Boolean);
    const combined = Array.from(new Set([...ANIMAL_CATEGORIES, ...existingCats]));
    return ['TODAS', ...combined];
  }, [products]);

  const filteredProducts = products.filter((p) => {
    if (!p) return false;
    if (categoryFilter !== 'TODAS' && p.category !== categoryFilter) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    const codeStr = String(p.code || '').toLowerCase();
    const barcodeStr = String(p.barcode || '').toLowerCase();
    const descStr = String(p.description || '').toLowerCase();
    const pluStr = String(p.scalePlu || '').toLowerCase();

    return (
      codeStr.includes(term) ||
      barcodeStr.includes(term) ||
      descStr.includes(term) ||
      pluStr.includes(term)
    );
  });

  const selectedProduct =
    filteredProducts.find((p) => p.code === selectedProductCode) || filteredProducts[0];

  const handleOpenEdit = (prod: Product) => {
    setIsNewMode(false);
    setBarcodeCaptured(false);
    setEditingProduct({ ...prod, barcode: prod.barcode || '' });
    setIsEditModalOpen(true);
  };

  const handleOpenNew = () => {
    setIsNewMode(true);
    setBarcodeCaptured(false);
    setEditingProduct({
      code: `00${products.length + 120}`,
      barcode: '',
      description: '',
      rubro: 'Almacén',
      category: 'Almacén',
      unitType: 'Unid',
      price: 10000,
      scalePlu: null,
      active: true,
    });
    setIsEditModalOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!editingProduct || !editingProduct.description.trim()) {
      await showAlert('La descripción del artículo es obligatoria.');
      return;
    }
    const cleanBarcode = editingProduct.barcode ? editingProduct.barcode.trim() : null;
    if (cleanBarcode) {
      const duplicateBarcodeProd = products.find(
        (p) =>
          p.code !== editingProduct.code &&
          p.barcode &&
          p.barcode.trim().toLowerCase() === cleanBarcode.toLowerCase()
      );
      if (duplicateBarcodeProd) {
        await showAlert(
          `El código de barras "${cleanBarcode}" ya está asignado al artículo "${duplicateBarcodeProd.description}" (Cód: ${duplicateBarcodeProd.code}).`
        );
        return;
      }
    }

    const originalProduct = products.find((p) => p.code === editingProduct.code);
    if (!canModifyPrices && originalProduct && originalProduct.price !== editingProduct.price) {
      await showAlert('Acceso Denegado: Su perfil de usuario no posee permisos para modificar precios de lista.');
      return;
    }
    const productToSave: Product = {
      ...editingProduct,
      barcode: cleanBarcode,
    };
    if (isNewMode) {
      onAddProduct(productToSave);
    } else {
      onUpdateProduct(productToSave);
    }
    setIsEditModalOpen(false);
  };

  const handleExportExcel = () => {
    if (!products.length) {
      showAlert('No hay artículos cargados para exportar.');
      return;
    }

    const rows = products.map((p) => ({
      CODIGO: p.code,
      CODIGO_BARRAS: p.barcode || '',
      DESCRIPCION: p.description,
      RUBRO: p.rubro || 'Carnes Vacunas',
      CATEGORIA_ESPECIE: p.category || 'Novillito',
      UNIDAD: p.unitType,
      PRECIO: p.price,
      PLU_BALANZA: p.scalePlu || '',
      ESTADO: p.active ? 'ACTIVO' : 'INACTIVO',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, // CODIGO
      { wch: 18 }, // CODIGO_BARRAS
      { wch: 35 }, // DESCRIPCION
      { wch: 20 }, // RUBRO
      { wch: 20 }, // CATEGORIA_ESPECIE
      { wch: 10 }, // UNIDAD
      { wch: 14 }, // PRECIO
      { wch: 14 }, // PLU_BALANZA
      { wch: 12 }, // ESTADO
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Articulos');
    XLSX.writeFile(wb, 'articulos_necopos.xlsx');
  };

  const handleBatchImport = async (importedList: Product[], replaceAll: boolean) => {
    if (onBatchImportProducts) {
      await onBatchImportProducts(importedList, replaceAll);
    }
    await showAlert(`¡Carga masiva completada! Se procesaron e ingresaron ${importedList.length} artículos.`);
  };

  const handleStartScaleExport = () => {
    setIsScaleExportOpen(true);
    setExportStatus('SENDING');
    setExportProgress(10);

    const interval = setInterval(() => {
      setExportProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setExportStatus('DONE');
          return 100;
        }
        return prev + 25;
      });
    }, 400);
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-80px)] select-none bg-[#ebeef2] text-[#181c1f] font-sans p-1">
      {/* Top Filter and Command Bar */}
      <div className="bg-white p-2 border border-[#c4c6cf] shadow-sm mb-1 flex flex-wrap items-center justify-between gap-2">
        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <label className="text-[11px] font-bold text-[#002046] uppercase whitespace-nowrap">
            Buscar artículo:
          </label>
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchTerm.trim()) {
                  const q = searchTerm.trim().toLowerCase();
                  const exact = products.find(
                    (p) =>
                      (p.barcode && p.barcode.trim().toLowerCase() === q) ||
                      p.code.trim().toLowerCase() === q
                  );
                  if (exact) {
                    setSelectedProductCode(exact.code);
                  }
                }
              }}
              placeholder="Escanee código de barras con la pistola o busque por código, PLU o descripción..."
              className="w-full h-[26px] px-2 bg-[#f7fafe] border border-[#74777f] text-[12px] font-semibold text-[#002046] focus:bg-white focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-[#74777f] absolute right-2 top-1.5" />
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-bold text-[#44474e] uppercase">Rubro / Categoría:</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-[26px] px-2 bg-white border border-[#74777f] text-[12px] font-semibold text-[#181c1f] focus:outline-none cursor-pointer"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenNew}
            className="h-[26px] px-2.5 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>Nuevo Artículo</span>
          </button>
          <button
            disabled={!selectedProduct}
            onClick={() => selectedProduct && handleOpenEdit(selectedProduct)}
            className="h-[26px] px-2.5 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#181c1f] text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <Edit2 className="w-3 h-3 text-[#002046]" />
            <span>Editar</span>
          </button>
          <button
            disabled={!selectedProduct}
            onClick={() => selectedProduct && onDeleteProduct(selectedProduct.code)}
            className="h-[26px] px-2.5 bg-[#aa3531] hover:bg-[#8b2926] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
            title="Eliminar artículo seleccionado de la base de datos"
          >
            <Trash2 className="w-3 h-3 text-white" />
            <span>Eliminar</span>
          </button>
          {onPurgeProducts && (
            <button
              onClick={onPurgeProducts}
              className="h-[26px] px-2 bg-[#ffdad6] hover:bg-[#ffb4ab] border border-[#ba1a1a] text-[#410002] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              title="Eliminar todos los artículos de la base de datos para comenzar desde cero"
            >
              <Trash2 className="w-3 h-3 text-[#ba1a1a]" />
              <span>Vaciar Catálogo</span>
            </button>
          )}
          <button
            onClick={handleExportExcel}
            className="h-[26px] px-2 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[#002046] text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-xs"
            title="Exportar catálogo completo a archivo Excel (.xlsx)"
          >
            <Download className="w-3 h-3 text-[#002046]" />
            <span>Exportar Excel</span>
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="h-[26px] px-2.5 bg-[#00875a] hover:bg-[#006644] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-xs"
            title="Importar y cargar masivamente artículos desde archivo Excel (.xlsx, .xls o .csv)"
          >
            <Upload className="w-3 h-3 text-white" />
            <span>Importar Excel</span>
          </button>
        </div>
      </div>

      {/* Main Excel-like Technical Table */}
      <div className="bg-white border border-[#74777f] shadow-sm flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Table title strip */}
        <div className="h-[26px] bg-[#002046] text-white px-2 flex items-center justify-between text-[12px] font-bold">
          <div className="flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-[#aec7f7]" />
            <span>PLANILLA MAESTRA DE ARTÍCULOS, PRECIOS Y PLU BALANZAS</span>
          </div>
          <div className="font-mono text-[11px] text-[#d4e3ff]">
            {filteredProducts.length} ARTÍCULOS REGISTRADOS | SUCURSAL ACTIVA: {currentBranch.id}
          </div>
        </div>

        {/* Dense Table */}
        <div className="flex-1 overflow-y-auto overflow-x-auto">
          <table className="w-full text-left border-collapse select-none text-[12px]">
            <thead className="sticky top-0 bg-[#e5e8ec] text-[#181c1f] font-bold text-[11px] border-b border-[#74777f]">
              <tr className="h-[24px]">
                <th className="w-[70px] px-2 border-r border-[#c4c6cf]">CÓDIGO</th>
                <th className="w-[140px] px-2 border-r border-[#c4c6cf] bg-[#dce5f5] text-[#002046]">
                  CÓD. DE BARRAS (EAN)
                </th>
                <th className="px-2 border-r border-[#c4c6cf]">DESCRIPCIÓN DEL PRODUCTO</th>
                <th className="w-[120px] px-2 border-r border-[#c4c6cf]">RUBRO</th>
                <th className="w-[120px] px-2 border-r border-[#c4c6cf]">CATEGORÍA / ESPECIE</th>
                <th className="w-[60px] px-1 text-center border-r border-[#c4c6cf]">UNIDAD</th>
                <th className="w-[110px] px-2 text-right border-r border-[#c4c6cf]">PRECIO ($)</th>
                <th className="w-[100px] px-1 text-center border-r border-[#c4c6cf] bg-[#e0e3e7]">
                  PLU BALANZA
                </th>
                <th className="w-[80px] px-1 text-center">ESTADO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ebeef2]">
              {filteredProducts.map((prod, idx) => {
                const isSelected = prod.code === selectedProductCode;

                return (
                  <tr
                    key={prod.code}
                    onClick={() => setSelectedProductCode(prod.code)}
                    onDoubleClick={() => handleOpenEdit(prod)}
                    className={`h-[22px] cursor-pointer ${
                      isSelected
                        ? 'bg-[#002046] text-white font-bold'
                        : idx % 2 === 0
                        ? 'bg-white hover:bg-[#e5e8ec]'
                        : 'bg-[#f1f4f8] hover:bg-[#e5e8ec]'
                    }`}
                  >
                    <td className="px-2 font-mono text-[11px] border-r border-[#c4c6cf]">
                      {prod.code}
                    </td>
                    <td
                      className={`px-2 font-mono text-[11px] border-r border-[#c4c6cf] ${
                        isSelected
                          ? 'text-[#aec7f7] font-bold'
                          : prod.barcode
                          ? 'text-[#002046] font-bold bg-[#f5f8ff]'
                          : 'text-[#74777f]'
                      }`}
                    >
                      {prod.barcode ? prod.barcode : '-'}
                    </td>
                    <td className="px-2 border-r border-[#c4c6cf] truncate max-w-[280px]">
                      {prod.description}
                    </td>
                    <td className="px-2 border-r border-[#c4c6cf] text-[11px] truncate max-w-[120px]">
                      {prod.rubro || 'Carnes Vacunas'}
                    </td>
                    <td className="px-2 border-r border-[#c4c6cf] text-[11px] truncate max-w-[120px]">
                      <span className="font-bold">{prod.category || 'Novillito'}</span>
                    </td>
                    <td className="text-center font-bold text-[10px] border-r border-[#c4c6cf]">
                      <span
                        className={`px-1 ${
                          isSelected
                            ? 'bg-[#1b365d]'
                            : prod.unitType === 'Kg'
                            ? 'bg-[#ffdad6] text-[#aa3531]'
                            : 'bg-[#e0e3e7] text-[#002046]'
                        }`}
                      >
                        {prod.unitType}
                      </span>
                    </td>
                    <td
                      className={`text-right font-mono font-bold text-[12px] px-2 border-r border-[#c4c6cf] ${
                        isSelected ? 'text-[#ffdad6]' : 'text-[#002046]'
                      }`}
                    >
                      {formatCurrency(prod.price)}
                    </td>
                    <td
                      className={`text-center font-mono font-bold text-[11px] border-r border-[#c4c6cf] ${
                        isSelected ? 'bg-[#1b365d] text-white' : 'bg-[#e0e3e7] text-[#002046]'
                      }`}
                    >
                      {prod.scalePlu ? `PLU ${prod.scalePlu}` : '-'}
                    </td>
                    <td className="text-center px-1">
                      <span
                        className={`text-[9px] px-1 font-bold ${
                          prod.active
                            ? isSelected
                              ? 'bg-[#1b365d] text-white'
                              : 'bg-[#d6e3ff] text-[#002046]'
                            : 'bg-[#ffdad6] text-[#aa3531]'
                        }`}
                      >
                        {prod.active ? 'ACTIVO' : 'BAJA'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Selected Product Quick Info Footer Strip */}
        {selectedProduct && (
          <div className="h-[28px] bg-[#e0e3e7] border-t border-[#74777f] px-2 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#002046]">{selectedProduct.description}</span>
              <span className="text-[#44474e]">
                (Cód: {selectedProduct.code} | Cód. Barras:{' '}
                <strong className="font-mono text-[#002046]">
                  {selectedProduct.barcode || 'Sin asignar'}
                </strong>{' '}
                | PLU Balanza: {selectedProduct.scalePlu || 'Sin PLU'})
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handleOpenEdit(selectedProduct)}
                className="h-[22px] px-2 bg-[#ebeef2] hover:bg-white border border-[#74777f] text-[#002046] font-bold text-[10px] cursor-pointer"
              >
                Modificar Precio / Datos [F2]
              </button>
              <button
                onClick={() => onDeleteProduct(selectedProduct.code)}
                className="h-[22px] px-2 bg-[#ffdad6] hover:bg-[#ffb4ab] border border-[#ba1a1a] text-[#aa3531] font-bold text-[10px] flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Eliminar Artículo</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Edit or Create Product */}
      <WindowsModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={isNewMode ? 'NUEVO ARTÍCULO / CORTE DE CARNE' : `EDITAR ARTÍCULO: ${editingProduct?.code}`}
        maxWidth="max-w-xl"
      >
        {editingProduct && (
          <div className="flex flex-col gap-2 p-1 text-[12px]">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Código Interno:</label>
                <input
                  type="text"
                  value={editingProduct.code}
                  onChange={(e) => setEditingProduct({ ...editingProduct, code: e.target.value })}
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono text-[13px] font-bold"
                />
              </div>
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">PLU Balanza Electrónica:</label>
                <input
                  type="text"
                  value={editingProduct.scalePlu || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, scalePlu: e.target.value || null })
                  }
                  placeholder={
                    editingProduct.unitType === 'Unid'
                      ? 'No requiere (Venta por Unidad)'
                      : 'Ej: 125 (para código 2000125...)'
                  }
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-mono text-[13px] font-bold text-[#002046]"
                />
              </div>
            </div>

            {/* Barcode Scanner Input Box (Pistola Lectora) */}
            <div className="bg-[#f0f4fa] border border-[#002046] p-2">
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-[#002046] flex items-center gap-1.5 text-[12px]">
                  <Barcode className="w-4 h-4 text-[#002046]" />
                  <span>Código de Barras del Producto (Pistola Lectora / EAN):</span>
                </label>
                <span className="text-[10px] bg-[#002046] text-white px-1.5 py-0.5 font-mono font-bold">
                  LECTORA DE CÓDIGO ACTIVA
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  ref={barcodeFieldRef}
                  type="text"
                  value={editingProduct.barcode || ''}
                  onChange={(e) => {
                    setBarcodeCaptured(false);
                    setEditingProduct({
                      ...editingProduct,
                      barcode: e.target.value,
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      if (editingProduct.barcode && editingProduct.barcode.trim()) {
                        setEditingProduct({
                          ...editingProduct,
                          barcode: editingProduct.barcode.trim(),
                        });
                        setBarcodeCaptured(true);
                      }
                    }
                  }}
                  placeholder="Haga clic aquí y dispare con la pistola lectora o digite el código (Ej: 7790895000997)..."
                  className="flex-1 h-[28px] px-2.5 bg-white border-2 border-[#002046] font-mono text-[14px] font-bold text-[#002046] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeCaptured(false);
                    barcodeFieldRef.current?.focus();
                    barcodeFieldRef.current?.select();
                  }}
                  className="h-[28px] px-2.5 bg-[#002046] hover:bg-[#1b365d] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  title="Posicionar cursor para leer con la pistola lectora de código de barras"
                >
                  <Barcode className="w-3.5 h-3.5 text-[#aec7f7]" />
                  <span>Leer con Pistola</span>
                </button>
                {editingProduct.barcode && (
                  <button
                    type="button"
                    onClick={() => {
                      setBarcodeCaptured(false);
                      setEditingProduct({ ...editingProduct, barcode: '' });
                      barcodeFieldRef.current?.focus();
                    }}
                    className="h-[28px] px-2 bg-[#ebeef2] hover:bg-[#ffdad6] border border-[#74777f] text-[#aa3531] text-[11px] font-bold cursor-pointer"
                    title="Borrar código de barras"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              {barcodeCaptured && editingProduct.barcode && (
                <div className="mt-1 text-[11px] font-bold text-[#00522c] flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>
                    Código {editingProduct.barcode} capturado correctamente. Presione &quot;Guardar Registro&quot; para confirmar.
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="font-bold text-[#181c1f] block mb-0.5">
                Descripción / Nombre del Artículo o Corte:
              </label>
              <input
                type="text"
                value={editingProduct.description}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, description: e.target.value.toUpperCase() })
                }
                className="w-full h-[26px] px-2 bg-white border border-[#74777f] text-[13px] font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Rubro:</label>
                <select
                  value={editingProduct.rubro || 'Almacén'}
                  onChange={(e) => {
                    const nextRubro = e.target.value;
                    const isUnitRubro = [
                      'Almacén',
                      'Bebidas',
                      'Limpieza',
                      'Carbón / Leña',
                      'Huevos',
                      'Fideos / Despensa',
                      'Lácteos',
                      'Panadería',
                      'Fiambrería',
                      'Artículos Varios',
                    ].includes(nextRubro);
                    setEditingProduct({
                      ...editingProduct,
                      rubro: nextRubro,
                      unitType: isUnitRubro ? 'Unid' : 'Kg',
                      category: isUnitRubro ? nextRubro : editingProduct.category === 'Almacén' ? 'Novillito' : editingProduct.category,
                      scalePlu: isUnitRubro ? null : editingProduct.scalePlu || editingProduct.code,
                    });
                  }}
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-semibold text-[#002046]"
                >
                  <optgroup label="🏪 Almacén y Artículos Varios (Fuera de Cámara)">
                    <option value="Almacén">Almacén</option>
                    <option value="Bebidas">Bebidas</option>
                    <option value="Limpieza">Limpieza</option>
                    <option value="Carbón / Leña">Carbón / Leña</option>
                    <option value="Huevos">Huevos</option>
                    <option value="Fideos / Despensa">Fideos / Despensa</option>
                    <option value="Lácteos">Lácteos</option>
                    <option value="Panadería">Panadería</option>
                    <option value="Fiambrería">Fiambrería</option>
                    <option value="Artículos Varios">Artículos Varios</option>
                  </optgroup>
                  <optgroup label="❄️ Carnes (Cámara Frigorífica)">
                    <option value="Carnes Vacunas">Carnes Vacunas</option>
                    <option value="Cerdo">Cerdo</option>
                    <option value="Granja / Pollo">Granja / Pollo</option>
                    <option value="Embutidos Frescos">Embutidos Frescos</option>
                    <option value="Achuras / Menudencias">Achuras / Menudencias</option>
                    <option value="Elaborados">Elaborados</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Categoría / Sector:</label>
                <select
                  value={editingProduct.category || 'Almacén'}
                  onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                  className="w-full h-[26px] px-2 bg-white border border-[#74777f] font-semibold text-[#002046]"
                >
                  <optgroup label="🏪 Almacén y Artículos Varios">
                    <option value="Almacén">Almacén</option>
                    <option value="Bebidas">Bebidas</option>
                    <option value="Limpieza">Limpieza</option>
                    <option value="Carbón / Leña">Carbón / Leña</option>
                    <option value="Huevos">Huevos</option>
                    <option value="Fideos / Despensa">Fideos / Despensa</option>
                    <option value="Lácteos">Lácteos</option>
                    <option value="Panadería">Panadería</option>
                    <option value="Fiambrería">Fiambrería</option>
                    <option value="Artículos Varios">Artículos Varios</option>
                  </optgroup>
                  <optgroup label="❄️ Categorías Cárnicas (Cámara)">
                    {ANIMAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="font-bold text-[#181c1f] block mb-0.5">Tipo de Venta y Destino de Stock:</label>
                <div className="flex gap-4 items-center h-[26px]">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      checked={editingProduct.unitType === 'Unid'}
                      onChange={() => setEditingProduct({ ...editingProduct, unitType: 'Unid', scalePlu: null })}
                    />
                    <span>Por Unidad (Stock Almacén / Varios)</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      checked={editingProduct.unitType === 'Kg'}
                      onChange={() => setEditingProduct({ ...editingProduct, unitType: 'Kg' })}
                    />
                    <span>Por Kilogramo (Kg - Ticket Balanza / Cámara)</span>
                  </label>
                </div>
                <div
                  className={`mt-1 px-2 py-1 rounded border text-[11px] font-bold flex items-center justify-between ${
                    isMeatProduct(editingProduct)
                      ? 'bg-blue-50 border-blue-300 text-blue-900'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  }`}
                >
                  <span>
                    {isMeatProduct(editingProduct)
                      ? '❄️ Este artículo se gestionará en: Stock de Cámara Frigorífica (Carnes)'
                      : '🏪 Este artículo se gestionará en: Stock de Almacén y Artículos Varios (Separado de Cámara)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="font-bold text-[#002046] block mb-0.5 flex items-center justify-between">
                  <span>Precio de Venta ($):</span>
                  {!canModifyPrices && (
                    <span className="text-[10px] text-amber-700 font-normal">(Solo lectura)</span>
                  )}
                </label>
                <input
                  type="number"
                  disabled={!canModifyPrices}
                  value={editingProduct.price}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })
                  }
                  className={`w-full h-[26px] px-2 border font-mono text-[14px] font-bold ${
                    !canModifyPrices
                      ? 'bg-[#f1f4f8] text-[#74777f] border-[#c4c6cf] cursor-not-allowed'
                      : 'bg-white border-[#74777f] text-[#002046]'
                  }`}
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-[#c4c6cf] mt-1">
              <div>
                {!isNewMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditModalOpen(false);
                      onDeleteProduct(editingProduct.code);
                    }}
                    className="h-[26px] px-3 bg-[#ffdad6] hover:bg-[#ffb4ab] border border-[#ba1a1a] text-[#aa3531] font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar Artículo</span>
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="h-[26px] px-3 bg-[#ebeef2] hover:bg-[#e0e3e7] border border-[#74777f] text-[11px] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveProduct}
                  className="h-[26px] px-4 bg-[#002046] hover:bg-[#1b365d] text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Guardar Registro</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </WindowsModal>

      {/* MODAL: Scale Export Simulator */}
      <WindowsModal
        isOpen={isScaleExportOpen}
        onClose={() => setIsScaleExportOpen(false)}
        title="TRANSMISIÓN DE TABLA PLU A BALANZAS COMERCIALES"
        maxWidth="max-w-md"
      >
        <div className="flex flex-col gap-3 p-2 text-[12px]">
          <div className="bg-white p-2 border border-[#c4c6cf] flex flex-col gap-1">
            <span className="font-bold text-[#002046]">
              Destino: {currentBranch.scaleModel} ({currentBranch.scalePort})
            </span>
            <span className="text-[11px] text-[#44474e]">
              Velocidad: {currentBranch.scaleBaud} bps | Formato: EAN-13 Carnicería (Prefijo{' '}
              {currentBranch.scaleEanPrefix})
            </span>
            <span className="text-[11px] text-[#44474e]">
              Total de artículos pesables a transmitir:{' '}
              <strong className="text-[#181c1f]">
                {products.filter((p) => p.unitType === 'Kg' && p.scalePlu).length} PLUs
              </strong>
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px]">
              <span>Progreso de transmisión:</span>
              <span className="font-mono font-bold text-[#002046]">{exportProgress}%</span>
            </div>
            {/* Windows classic Progress Bar */}
            <div className="h-[18px] bg-[#e0e3e7] border border-[#74777f] p-0.5">
              <div
                className="h-full bg-[#002046] transition-all duration-300"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
          </div>

          {exportStatus === 'DONE' && (
            <div className="bg-[#d6e3ff] text-[#002046] p-2 border border-[#002046] flex items-center gap-2 font-bold text-[11px]">
              <CheckCircle className="w-4 h-4 text-[#002046]" />
              <span>Transmisión finalizada con éxito. Balanzas sincronizadas.</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[#c4c6cf]">
            <button
              onClick={() => setIsScaleExportOpen(false)}
              className="h-[26px] px-4 bg-[#002046] text-white font-bold text-[11px] cursor-pointer"
            >
              Cerrar Ventana
            </button>
          </div>
        </div>
      </WindowsModal>

      {/* Import Products Modal */}
      <ImportProductsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleBatchImport}
        existingCount={products.length}
      />
    </div>
  );
};
