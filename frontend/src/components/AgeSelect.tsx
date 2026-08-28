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
          aria-pressed={selected.has(age)}
          onClick={() => toggle(age)}
          className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
            selected.has(age)
              ? 'bg-[#AB2328] text-white border-[#AB2328]'
              : 'bg-white text-foreground border-input hover:border-[#AB2328]'
          }`}
        >
          {age} år
        </button>
      ))}
    </div>
  );
}
