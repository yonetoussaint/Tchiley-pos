type ProductFieldTone = 'green' | 'ink' | 'steel' | 'yellow';

export type ProductDraft = {
  nom: string;
  categorie: string;
  prix: number;
  prixAchat: number;
  stockFermeture: number;
  seuil: number;
  unite: string;
};

const PRODUCT_FIELD_TONES: Record<ProductFieldTone, { text: string }> = {
  green: { text: 'text-[var(--m3-primary)]' },
  steel: { text: 'text-[var(--m3-on-surface-variant)]' },
  ink: { text: 'text-[var(--m3-on-surface)]' },
  yellow: { text: 'text-[var(--m3-tertiary,#7A5900)]' },
};

type M3TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function M3TextField({ label, value, onChange, placeholder }: M3TextFieldProps) {
  return (
    <label className="block min-w-0 rounded-xl bg-[var(--m3-surface)] px-4 pb-1.5 pt-2 ring-1 ring-[var(--m3-outline)] transition-shadow focus-within:ring-2 focus-within:ring-[var(--m3-primary)] motion-reduce:transition-none">
      <span className="block text-xs leading-4 text-[var(--m3-on-surface-variant)]">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full min-w-0 bg-transparent p-0 text-base text-[var(--m3-on-surface)] outline-none placeholder:text-[var(--m3-on-surface-variant)]"
      />
    </label>
  );
}

type ProductNumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  editing: boolean;
  tone?: ProductFieldTone;
  placeholder?: string;
  decimal?: boolean;
  autoFocus?: boolean;
};

export function ProductNumberField({
  label,
  value,
  onChange,
  editing,
  tone = 'ink',
  placeholder,
  decimal = false,
  autoFocus = false,
}: ProductNumberFieldProps) {
  const fieldTone = PRODUCT_FIELD_TONES[tone];
  return (
    <label
      className={`block min-w-0 rounded-xl bg-[var(--m3-surface)] px-3 pb-1 pt-2 transition-shadow motion-reduce:transition-none ${
        editing ? 'ring-1 ring-[var(--m3-outline)] focus-within:ring-2 focus-within:ring-[var(--m3-primary)]' : ''
      }`}
    >
      <span className="block truncate text-xs leading-4 text-[var(--m3-on-surface-variant)]">{label}</span>
      <input
        type="number"
        min="0"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={value}
        placeholder={placeholder}
        readOnly={!editing}
        autoFocus={autoFocus}
        tabIndex={editing ? 0 : -1}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className={`h-8 w-full min-w-0 bg-transparent p-0 text-base font-medium tabular-nums outline-none ${fieldTone.text}`}
      />
    </label>
  );
}
