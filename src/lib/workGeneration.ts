import { chainageToMeters, shiftChainage } from "./chainage";
import type { WorkItem, LineType, RekapKategori, Mitra } from "./types";

/** Overlap tambahan (meter) pada Double Coat yang dihasilkan dari pekerjaan Recycling/Upgrading. */
export const DOUBLE_COAT_OVERLAP_M = 2;

export interface JobInput {
  mitra: Mitra;
  work_date: string;
  km_start: string; // untuk Tambalan: titik tunggal, isi sama dengan km_finish
  km_finish: string;
  line: LineType;
  lebar: number;
  area_nama: string | null;
  keterangan: string | null;
  remark_pekerjaan: WorkItem;
  panjang_override?: number | null; // hanya untuk Tambalan
  volume_kg?: number; // hanya untuk Tambalan
  opname_p?: number;
  opname_l?: number;
}

export interface GeneratedRow {
  mitra: Mitra;
  work_date: string;
  kategori: RekapKategori;
  km_start: string;
  km_finish: string;
  line: LineType;
  lebar: number;
  panjang_override: number | null;
  volume_kg: number;
  area_nama: string | null;
  keterangan: string | null;
  remark_pekerjaan: WorkItem;
  opname_p: number;
  opname_l: number;
}

/**
 * Dari satu input pekerjaan (form Rekap Pekerjaan / Database), hasilkan baris
 * work_records yang perlu disimpan. Recycling & Upgrading menghasilkan 2 baris
 * sekaligus (Heavy Patches + Double Coat, dengan Double Coat diperpanjang
 * DOUBLE_COAT_OVERLAP_M meter). Jenis lain menghasilkan 1 baris.
 */
export function generateWorkRows(input: JobInput): GeneratedRow[] {
  const base = {
    mitra: input.mitra,
    work_date: input.work_date,
    line: input.line,
    area_nama: input.area_nama,
    keterangan: input.keterangan,
    remark_pekerjaan: input.remark_pekerjaan,
  };

  function row(kategori: RekapKategori, kmStart: string, kmFinish: string, extra?: Partial<GeneratedRow>): GeneratedRow {
    return {
      ...base,
      kategori,
      km_start: kmStart,
      km_finish: kmFinish,
      lebar: input.lebar,
      panjang_override: null,
      volume_kg: 0,
      opname_p: 0,
      opname_l: 0,
      ...extra,
    };
  }

  let rows: GeneratedRow[];

  switch (input.remark_pekerjaan) {
    case "Recycling":
      rows = [
        row("heavy_patches_recycling", input.km_start, input.km_finish),
        row("double_coat", input.km_start, shiftChainage(input.km_finish, DOUBLE_COAT_OVERLAP_M)),
      ];
      break;
    case "Upgrading":
      rows = [
        row("heavy_patches_upgrading", input.km_start, input.km_finish),
        row("double_coat", input.km_start, shiftChainage(input.km_finish, DOUBLE_COAT_OVERLAP_M)),
      ];
      break;
    case "Reseal 2 Coat":
    case "Reseal Selected":
      rows = [row("double_coat", input.km_start, input.km_finish)];
      break;
    case "Reseal 1 Coat":
      rows = [row("reseal_1_coat", input.km_start, input.km_finish)];
      break;
    case "Tambalan":
      rows = [
        row("tambalan", input.km_start, input.km_start, {
          panjang_override: input.panjang_override ?? 0,
          volume_kg: input.volume_kg ?? 0,
        }),
      ];
      break;
    default:
      rows = [];
  }

  // Temuan Opname (opsional) ditempel hanya di baris pertama supaya tidak terhitung dobel.
  if (rows.length > 0 && ((input.opname_p ?? 0) > 0 || (input.opname_l ?? 0) > 0)) {
    rows[0] = { ...rows[0], opname_p: input.opname_p ?? 0, opname_l: input.opname_l ?? 0 };
  }

  return rows;
}

/** Panjang efektif satu baris work_records (meter), menangani kasus khusus Tambalan. */
export function rowPanjang(r: { kategori: RekapKategori; km_start: string; km_finish: string; panjang_override: number | null }): number {
  if (r.kategori === "tambalan") return r.panjang_override ?? 0;
  return chainageToMeters(r.km_finish) - chainageToMeters(r.km_start);
}

/** Luas efektif satu baris work_records (m²). */
export function rowArea(r: { kategori: RekapKategori; km_start: string; km_finish: string; panjang_override: number | null; lebar: number }): number {
  return rowPanjang(r) * r.lebar;
}
