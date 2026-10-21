import React from 'react';
import { useFirebase } from '../../context/FirebaseContext';
import { MeatSupplierModal } from './MeatSupplierModal';

export const MeatSuppliersTab: React.FC = () => {
  const { meatSuppliers, meatReceptions, saveMeatSupplier } = useFirebase();

  return (
    <MeatSupplierModal
      suppliers={meatSuppliers}
      receptions={meatReceptions}
      initialName=""
      onSave={saveMeatSupplier}
      onClose={() => undefined}
      standalone
    />
  );
};
