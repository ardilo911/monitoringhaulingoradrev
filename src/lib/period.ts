// Periode kustom perusahaan: 1 "bulan" = tanggal 26 s/d tanggal 25 bulan berikutnya.
// Semua filter tanggal di WRO/Rekap Pekerjaan/Database/BAST memakai periode ini,
// bukan bulan kalender biasa.

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface PeriodeRange {
  start: string; // YYYY-MM-DD, tanggal 26
  end: string; // YYYY-MM-DD, tanggal 25
}

/** Dari tanggal manapun yang dipilih user, hitung rentang periode 26-25 yang memuatnya. */
export function periodeRangeFromDate(dateStr: string): PeriodeRange {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDate();
  let start: Date, end: Date;
  if (day >= 26) {
    start = new Date(d.getFullYear(), d.getMonth(), 26);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 25);
  } else {
    start = new Date(d.getFullYear(), d.getMonth() - 1, 26);
    end = new Date(d.getFullYear(), d.getMonth(), 25);
  }
  return { start: toDateStr(start), end: toDateStr(end) };
}

/** Geser satu periode maju/mundur N kali (N boleh negatif). */
export function shiftPeriode(range: PeriodeRange, n: number): PeriodeRange {
  const anchor = new Date(range.start + "T00:00:00");
  anchor.setMonth(anchor.getMonth() + n);
  return periodeRangeFromDate(toDateStr(anchor));
}

/** N periode berturut-turut yang berakhir di periode yang memuat `anchorDateStr`, urut lama->baru. */
export function lastNPeriodeRanges(anchorDateStr: string, n: number): PeriodeRange[] {
  const current = periodeRangeFromDate(anchorDateStr);
  const result: PeriodeRange[] = [];
  for (let i = n - 1; i >= 0; i--) result.push(shiftPeriode(current, -i));
  return result;
}

export function formatPeriodeLabel(range: PeriodeRange): string {
  const fmt = (s: string) =>
    new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(s + "T00:00:00"));
  return `${fmt(range.start)} – ${fmt(range.end)}`;
}
