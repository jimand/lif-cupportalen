interface AgeSelectProps {
  value: string; // kommaseparerade siffror t.ex. "10,12,14"
  onChange: (value: string) => void;
}

const AGES = Array.from({ length: 12 }, (_, i) => i + 7); // 7–18

export function parseAges(value: string): Set<number> {
  return new Set(
    value.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n) && n >= 7 && n <= 18)
  );
}

export function serializeAges(ages: Set<number>): string {
  return Array.from(ages).sort((a, b) => a - b).join(',');
}

export function AgeSelect({ value, onChange }: AgeSelectProps) {
  const selected = parseAges(value);

  function toggle(age: number) {
    const next = new Set(selected);
    if (next.has(age)) next.delete(age);
    else next.add(age);
    onChange(serializeAges(next));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {AGES.map((age) => (
        <button
          key={age}
          type="button"
          onClick={() => toggle(age)}
          className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
            selected.has(age)
              ? 'bg-[#CC0000] text-white border-[#CC0000]'
              : 'bg-white text-foreground border-input hover:border-[#CC0000]'
          }`}
        >
          {age} år
        </button>
      ))}
    </div>
  );
}
