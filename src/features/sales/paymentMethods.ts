import { Banknote, FileClock, Smartphone, type LucideIcon } from 'lucide-react';

export type PaymentMethodId = 'especes' | 'moncash' | 'natcash' | 'credit';

export const PAYMENT_METHODS: Array<{ id: PaymentMethodId; label: string; icon: LucideIcon }> = [
  { id: 'especes', label: 'Espèces', icon: Banknote },
  { id: 'moncash', label: 'MonCash', icon: Smartphone },
  { id: 'natcash', label: 'NatCash', icon: Smartphone },
  { id: 'credit', label: 'Crédit Client', icon: FileClock },
];
