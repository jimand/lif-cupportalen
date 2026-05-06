export interface ParsedCupData {
  name?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  age_classes?: string;
  url?: string;
  description?: string;
}

const SWEDISH_MONTHS: Record<string, string> = {
  januari: '01', februari: '02', mars: '03', april: '04',
  maj: '05', juni: '06', juli: '07', augusti: '08',
  september: '09', oktober: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04',
  jun: '06', jul: '07', aug: '08', sep: '09', okt: '10', nov: '11', dec: '12',
};

function parseSwedishDate(text: string): string | undefined {
  // ISO: 2024-06-15
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  // "15 juni 2024" or "15/6/2024" or "15-6-2024"
  const longMatch = text.match(/\b(\d{1,2})\s+(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december|jan|feb|mar|apr|jun|jul|aug|sep|okt|nov|dec)\s+(\d{4})\b/i);
  if (longMatch) {
    const day = longMatch[1].padStart(2, '0');
    const month = SWEDISH_MONTHS[longMatch[2].toLowerCase()];
    return `${longMatch[3]}-${month}-${day}`;
  }

  const numericMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (numericMatch) {
    const day = numericMatch[1].padStart(2, '0');
    const month = numericMatch[2].padStart(2, '0');
    return `${numericMatch[3]}-${month}-${day}`;
  }

  return undefined;
}

function extractUrl(text: string): string | undefined {
  const urlMatch = text.match(/https?:\/\/[^\s<>"]+/);
  return urlMatch ? urlMatch[0] : undefined;
}

function extractAgeClasses(text: string): string | undefined {
  const ageMatches = text.match(/\b[PFpf]\d{2}(?:\s*[,\/]\s*[PFpf]\d{2})*/g);
  if (ageMatches && ageMatches.length > 0) {
    return ageMatches.join(', ');
  }

  const yearMatch = text.match(/\b(pojkar?|flickor?|ungdom)\s+\d{4}(?:\s*[-–]\s*\d{4})?\b/gi);
  if (yearMatch) return yearMatch.join(', ');

  return undefined;
}

function extractLocation(text: string): string | undefined {
  // Look for "i <Ort>" or "plats: <Ort>" patterns
  const platsMatch = text.match(/(?:plats|ort|arena|spelplats):\s*([^\n,]+)/i);
  if (platsMatch) return platsMatch[1].trim();

  const iMatch = text.match(/\bspelas\s+i\s+([A-ZÅÄÖ][a-zåäö]+(?:\s+[A-ZÅÄÖ][a-zåäö]+)?)\b/);
  if (iMatch) return iMatch[1].trim();

  return undefined;
}

export function parseEmailToCup(subject: string, body: string): ParsedCupData {
  const fullText = `${subject}\n${body}`;

  const name = subject.replace(/^(?:fw:|fwd:|re:)\s*/i, '').trim() || undefined;

  const location = extractLocation(fullText);

  const dates: string[] = [];
  const datePattern = /\d{1,2}[\s\/\-](?:jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec|januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)[\s\/\-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/gi;
  let dateMatch;
  while ((dateMatch = datePattern.exec(fullText)) !== null) {
    const parsed = parseSwedishDate(dateMatch[0]);
    if (parsed && !dates.includes(parsed)) {
      dates.push(parsed);
    }
  }
  dates.sort();

  const start_date = dates[0];
  const end_date = dates.length > 1 ? dates[dates.length - 1] : undefined;

  const age_classes = extractAgeClasses(fullText);
  const url = extractUrl(body);

  const descriptionLines = body
    .split('\n')
    .slice(0, 10)
    .join('\n')
    .trim();
  const description = descriptionLines.length > 20 ? descriptionLines : undefined;

  return { name, location, start_date, end_date, age_classes, url, description };
}
