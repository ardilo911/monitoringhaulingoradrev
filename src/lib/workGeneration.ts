import { chainageToMeters, shiftChainage } from "./chainage";
import type { WorkItem, LineType, RekapKategori, Mitra } from "./types";

/** Overlap Double Coat: diperpanjang 1m di KM Start (mundur) dan 1m di KM Finish (maju). */
export const DOUBLE_COAT_OVERLAP_START_M = 1;
export const DOUBLE_COAT_OVERLAP_FINISH_M = 1;

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
  in_database?: boolean; // true kalau diinput lewat halaman Database (admin), false/tidak diisi kalau lewat Rekap Pekerjaan
  opname_catatan?: string | null; // Temuan Opname - catatan manual
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
  in_database: boolean;
  opname_catatan: string | null;
}

/**
 * Dari satu input pekerjaan (form Rekap Pekerjaan / Database), hasilkan baris
 * work_records yang perlu disimpan. Recycling & Upgrading menghasilkan 2 baris
 * sekaligus (Heavy Patches + Double Coat, dengan Double Coat diperpanjang 1m di
 * KM Start dan 1m di KM Finish). Jenis lain menghasilkan 1 baris.
 */
export function generateWorkRows(input: JobInput): GeneratedRow[] {
  const base = {
    mitra: input.mitra,
    work_date: input.work_date,
    line: input.line,
    area_nama: input.area_nama,
    keterangan: input.keterangan,
    remark_pekerjaan: input.remark_pekerjaan,
    in_database: input.in_database ?? false,
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
      opname_catatan: null,
      ...extra,
    };
  }

  let rows: GeneratedRow[];

  switch (input.remark_pekerjaan) {
    case "Recycling":
      rows = [
        row("heavy_patches_recycling", input.km_start, input.km_finish),
        row(
          "double_coat",
          shiftChainage(input.km_start, -DOUBLE_COAT_OVERLAP_START_M),
          shiftChainage(input.km_finish, DOUBLE_COAT_OVERLAP_FINISH_M)
        ),
      ];
      break;
    case "Upgrading":
      rows = [
        row("heavy_patches_upgrading", input.km_start, input.km_finish),
        row(
          "double_coat",
          shiftChainage(input.km_start, -DOUBLE_COAT_OVERLAP_START_M),
          shiftChainage(input.km_finish, DOUBLE_COAT_OVERLAP_FINISH_M)
        ),
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

  // Temuan Opname (opsional) ditempel hanya di baris pertama supaya tidak dobel.
  if (rows.length > 0 && input.opname_catatan && input.opname_catatan.trim() !== "") {
    rows[0] = { ...rows[0], opname_catatan: input.opname_catatan.trim() };
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

/** Kategori tunggal untuk satu Work Item - dipakai di halaman Database (TIDAK dipecah 2 baris). */
export function singleKategoriForRemark(remark: WorkItem): RekapKategori {
  switch (remark) {
    case "Recycling":
      return "heavy_patches_recycling";
    case "Upgrading":
      return "heavy_patches_upgrading";
    case "Reseal 2 Coat":
    case "Reseal Selected":
      return "double_coat";
    case "Reseal 1 Coat":
      return "reseal_1_coat";
    case "Tambalan":
    default:
      return "tambalan";
  }
}

/**
 * Untuk halaman Database: 1 input = 1 baris saja (TIDAK auto-split Heavy Patches + Double Coat).
 * Database adalah data pembanding retensi berdiri sendiri, dicocokkan ke Rekap Pekerjaan lewat
 * Keterangan + Area + Line + overlap KM + tanggal (lihat lib/retention.ts) - bukan lewat kategori.
 */
export function generateDatabaseRow(input: JobInput): GeneratedRow {
  const kmFinish = input.remark_pekerjaan === "Tambalan" ? input.km_start : input.km_finish;
  return {
    mitra: input.mitra,
    work_date: input.work_date,
    kategori: singleKategoriForRemark(input.remark_pekerjaan),
    km_start: input.km_start,
    km_finish: kmFinish,
    line: input.line,
    lebar: input.lebar,
    panjang_override: input.remark_pekerjaan === "Tambalan" ? (input.panjang_override ?? 0) : null,
    volume_kg: input.remark_pekerjaan === "Tambalan" ? (input.volume_kg ?? 0) : 0,
    area_nama: input.area_nama,
    keterangan: input.keterangan,
    remark_pekerjaan: input.remark_pekerjaan,
    in_database: true,
    opname_catatan: null,
  };
}
