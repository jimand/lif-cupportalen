export const CUP_TYPES = ['3-mot-3', '5-mot-5', '7-mot-7', '9-mot-9', '11-mot-11', 'Futsal'];

interface CupTypeSelectProps {
  value: string; // kommaseparerade typer, t.ex. "5v5,7v7"
  onChange: (value: string) => void;
}

export function parseCupTypes(value: string): Set<string> {
  return new Set(value.split(',').map((s) => s.trim()).filter((s) => CUP_TYPES.includes(s)));
}

export function serializeCupTypes(types: Set<string>): string {
  return CUP_TYPES.filter((t) => types.has(t)).join(',');
}

export function CupTypeSelect({ value, onChange }: CupTypeSelectProps) {
  const selected = parseCupTypes(value);

  function toggle(type: string) {
    const next = new Set(selected);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    onChange(serializeCupTypes(next));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {CUP_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => toggle(type)}
          className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
            selected.has(type)
              ? 'bg-[#CC0000] text-white border-[#CC0000]'
              : 'bg-white text-foreground border-input hover:border-[#CC0000]'
          }`}
        >
          {type}
        </button>
      ))}
    </div>
  );
}
