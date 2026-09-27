export type Mitra = "wasco" | "khs";
export type UserRole = "admin" | "user";
export type WroStatus = "Approve" | "Process";
export type WorkItem =
  | "Recycling"
  | "Reseal 1 Coat"
  | "Reseal 2 Coat"
  | "Reseal Selected"
  | "Upgrading"
  | "Tambalan";
export type LineType = "UL" | "LL" | "LL1" | "LL2";
export type RekapKategori =
  | "double_coat"
  | "reseal_1_coat"
  | "heavy_patches_recycling"
  | "heavy_patches_upgrading"
  | "tambalan";
export type BastStatus = "Draft" | "Final";

// Work Item yang bisa dipilih saat menambah pekerjaan di Rekap Pekerjaan / Database.
// Setiap pilihan otomatis menghasilkan 1 atau 2 baris kategori (lihat lib/workGeneration.ts).
export const WORK_ITEMS: WorkItem[] = [
  "Recycling",
  "Reseal 1 Coat",
  "Reseal 2 Coat",
  "Reseal Selected",
  "Upgrading",
  "Tambalan",
];

// Work Item khusus untuk Work Request Order (WRO) - Tambalan tidak diajukan lewat WRO.
export const WRO_WORK_ITEMS: WorkItem[] = ["Recycling", "Reseal 1 Coat", "Reseal 2 Coat", "Reseal Selected", "Upgrading"];

export const LINES: LineType[] = ["UL", "LL", "LL1", "LL2"];

export const AREA_OPTIONS = ["LW", "HW", "PL", "WCC", "North"] as const;
export type AreaOption = (typeof AREA_OPTIONS)[number];

export const KETERANGAN_OPTIONS = ["Area 1", "Area 2"] as const;
export type KeteranganOption = (typeof KETERANGAN_OPTIONS)[number];

export const REKAP_KATEGORI_LABEL: Record<RekapKategori, string> = {
  double_coat: "Double Coat",
  reseal_1_coat: "Reseal 1 Coat",
  heavy_patches_recycling: "Heavy Patches Recycling",
  heavy_patches_upgrading: "Heavy Patches Upgrading",
  tambalan: "Tambalan",
};

export interface Profile {
  id: string;
  email: string | null;
  username: string;
  nama: string;
  role: UserRole;
  akses_mitra: Mitra[];
  is_active: boolean;
}

export interface Wro {
  id: string;
  mitra: Mitra;
  periode: string; // YYYY-MM
  nomer_wro: string;
  tgl_submit: string | null;
  tgl_approve: string | null;
  status: WroStatus;
  km_start: string;
  km_finish: string;
  line: LineType;
  panjang: number;
  lebar: number;
  luasan: number;
  work_item: WorkItem;
  created_at?: string;
}

export interface WorkRecord {
  id: string;
  mitra: Mitra;
  work_date: string; // YYYY-MM-DD
  kategori: RekapKategori;
  km_start: string;
  km_finish: string;
  area_nama: string | null; // salah satu AREA_OPTIONS
  line: LineType;
  lebar: number; // meter - lebar pekerjaan pada baris ini
  panjang_override: number | null; // hanya dipakai untuk kategori 'tambalan' (bukan rentang KM)
  volume_kg: number; // hanya relevan untuk kategori 'tambalan'
  // Kolom lama (P/L per jenis) - dipertahankan untuk kompatibilitas data lama, tidak dipakai form baru.
  capex_p: number; capex_l: number;
  opex_p: number; opex_l: number;
  reseal2_p: number; reseal2_l: number;
  repair_p: number; repair_l: number;
  opname_p: number; opname_l: number; // "Temuan Opname"
  keterangan: string | null; // salah satu KETERANGAN_OPTIONS
  remark_pekerjaan: WorkItem;
  created_at?: string;
}

export interface Bast {
  id: string;
  mitra: Mitra;
  periode: string;
  total_per_work_item: Record<string, number>;
  status: BastStatus;
  locked_at: string | null;
}

export interface Settings {
  retention_months: number;
}
