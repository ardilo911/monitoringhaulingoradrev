"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { formatNumberID, formatDateID } from "@/lib/format";
import { isValidChainage, chainageToMeters, segmentLength } from "@/lib/chainage";
import { generateWorkRows, rowPanjang, rowArea } from "@/lib/workGeneration";
import { periodeRangeFromDate, formatPeriodeLabel } from "@/lib/period";
import {
  WORK_ITEMS,
  LINES,
  AREA_OPTIONS,
  KETERANGAN_OPTIONS,
  REKAP_KATEGORI_LABEL,
  type WorkRecord,
  type Mitra,
  type RekapKategori,
  type WorkItem,
  type LineType,
} from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ExportButtons } from "@/components/ExportButtons";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const KATEGORI_TABS: (RekapKategori | "periode")[] = [
  "periode",
  "double_coat",
  "reseal_1_coat",
  "heavy_patches_recycling",
  "heavy_patches_upgrading",
  "tambalan",
];

const emptyForm = {
  work_date: "",
  remark_pekerjaan: "Recycling" as WorkItem,
  km_start: "",
  km_finish: "",
  line: "UL" as LineType,
  lebar: "",
  panjang_tambalan: "",
  volume_kg: "",
  area_nama: AREA_OPTIONS[0] as string,
  keterangan: KETERANGAN_OPTIONS[0] as string,
  opname_catatan: "",
};

export default function RekapPage() {
  const params = useParams<{ mitra: string }>();
  const mitra = params.mitra as Mitra;

  const [anchorDate, setAnchorDate] = useState(todayStr());
  const periodeRange = useMemo(() => periodeRangeFromDate(anchorDate), [anchorDate]);
  const [tab, setTab] = useState<(typeof KATEGORI_TABS)[number]>("periode");
  const [rows, setRows] = useState<WorkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("work_records")
      .select("*")
      .eq("mitra", mitra)
      .eq("in_database", false)
      .gte("work_date", periodeRange.start)
      .lte("work_date", periodeRange.end)
      .order("work_date", { ascending: false });
    setRows((data as WorkRecord[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mitra, periodeRange.start, periodeRange.end]);

  const rowsForTab = useMemo(() => (tab === "periode" ? rows : rows.filter((r) => r.kategori === tab)), [rows, tab]);
  const isTambalanForm = form.remark_pekerjaan === "Tambalan";

  const panjangPreview = useMemo(() => {
    if (isTambalanForm) return parseFloat(form.panjang_tambalan) || null;
    if (isValidChainage(form.km_start) && isValidChainage(form.km_finish)) {
      const p = segmentLength(form.km_start, form.km_finish);
      return p > 0 ? p : null;
    }
    return null;
  }, [form.km_start, form.km_finish, form.panjang_tambalan, isTambalanForm]);

  const luasPreview = useMemo(() => {
    const lebar = parseFloat(form.lebar);
    if (panjangPreview && !isNaN(lebar)) return panjangPreview * lebar;
    return null;
  }, [panjangPreview, form.lebar]);

  const summaryPerKategori = useMemo(() => {
    const totals: Record<RekapKategori, number> = {
      double_coat: 0, reseal_1_coat: 0, heavy_patches_recycling: 0, heavy_patches_upgrading: 0, tambalan: 0,
    };
    for (const r of rows) totals[r.kategori] += rowArea(r);
    return totals;
  }, [rows]);

  function openAdd() {
    setEditingId(null);
    setForm({ ...emptyForm, work_date: anchorDate });
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(row: WorkRecord) {
    setEditingId(row.id);
    setForm({
      work_date: row.work_date,
      remark_pekerjaan: row.remark_pekerjaan,
      km_start: row.km_start,
      km_finish: row.kategori === "tambalan" ? "" : row.km_finish,
      line: row.line,
      lebar: String(row.lebar),
      panjang_tambalan: row.kategori === "tambalan" ? String(row.panjang_override ?? 0) : "",
      volume_kg: String(row.volume_kg ?? 0),
      area_nama: row.area_nama ?? AREA_OPTIONS[0],
      keterangan: row.keterangan ?? KETERANGAN_OPTIONS[0],
      opname_catatan: row.opname_catatan ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.work_date) { setFormError("Tanggal wajib diisi."); return; }
    const lebar = parseFloat(form.lebar);
    if (isNaN(lebar) || lebar <= 0) { setFormError("Lebar wajib diisi angka lebih dari 0."); return; }

    if (isTambalanForm) {
      if (!isValidChainage(form.km_start)) { setFormError("Format KM harus XX+XXX, contoh 10+050."); return; }
      const panjang = parseFloat(form.panjang_tambalan);
      if (isNaN(panjang) || panjang <= 0) { setFormError("Panjang tambalan wajib diisi angka lebih dari 0."); return; }
    } else {
      if (!isValidChainage(form.km_start) || !isValidChainage(form.km_finish)) {
        setFormError("Format KM harus XX+XXX, contoh 10+050.");
        return;
      }
      if (chainageToMeters(form.km_finish) <= chainageToMeters(form.km_start)) {
        setFormError("KM Finish harus lebih besar dari KM Start.");
        return;
      }
    }

    if (editingId) {
      const existing = rows.find((r) => r.id === editingId);
      if (!existing) { setModalOpen(false); return; }
      const payload: Partial<WorkRecord> = {
        work_date: form.work_date,
        remark_pekerjaan: form.remark_pekerjaan,
        km_start: form.km_start,
        km_finish: existing.kategori === "tambalan" ? form.km_start : form.km_finish,
        line: form.line,
        lebar,
        panjang_override: existing.kategori === "tambalan" ? parseFloat(form.panjang_tambalan) : null,
        volume_kg: existing.kategori === "tambalan" ? parseFloat(form.volume_kg || "0") : 0,
        area_nama: form.area_nama,
        keterangan: form.keterangan,
        opname_catatan: form.opname_catatan.trim() || null,
      };
      await supabase.from("work_records").update(payload).eq("id", editingId);
    } else {
      const generated = generateWorkRows({
        mitra,
        work_date: form.work_date,
        km_start: form.km_start,
        km_finish: isTambalanForm ? form.km_start : form.km_finish,
        line: form.line,
        lebar,
        area_nama: form.area_nama,
        keterangan: form.keterangan,
        remark_pekerjaan: form.remark_pekerjaan,
        panjang_override: isTambalanForm ? parseFloat(form.panjang_tambalan) : null,
        volume_kg: isTambalanForm ? parseFloat(form.volume_kg || "0") : 0,
        in_database: false,
        opname_catatan: form.opname_catatan,
      });
      if (generated.length === 0) { setFormError("Jenis pekerjaan tidak dikenali."); return; }
      await supabase.from("work_records").insert(generated);
    }

    setModalOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus baris pekerjaan ini? Kalau ini bagian dari pasangan Heavy Patches + Double Coat, baris pasangannya tidak ikut terhapus otomatis.")) return;
    await supabase.from("work_records").delete().eq("id", id);
    load();
  }

  const exportRows = rowsForTab.map((r) => [
    formatDateID(r.work_date),
    r.kategori === "tambalan" ? r.km_start : `${r.km_start} - ${r.km_finish}`,
    formatNumberID(rowPanjang(r), 1), formatNumberID(r.lebar, 1), formatNumberID(rowArea(r), 1),
    r.line, r.area_nama ?? "-", r.keterangan ?? "-", r.remark_pekerjaan,
    r.kategori === "tambalan" ? formatNumberID(r.volume_kg, 1) : "-",
    r.opname_catatan ?? "-",
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-graphite-900">Rekap Pekerjaan</h1>
          <p className="text-sm text-gray-500">
            Periode: <strong>{formatPeriodeLabel(periodeRange)}</strong>. Data di sini khusus Rekap Pekerjaan — tidak otomatis masuk ke Database.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <Field label="Pilih Tanggal (periode)">
            <Input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
          </Field>
          {tab !== "periode" && (
            <ExportButtons
              filename={`rekap-${tab}-${mitra}-${periodeRange.start}`}
              title={`Rekap ${REKAP_KATEGORI_LABEL[tab as RekapKategori]} ${mitra.toUpperCase()} - ${formatPeriodeLabel(periodeRange)}`}
              columns={["Tgl", "KM", "Panjang (m)", "Lebar (m)", "Luas (m2)", "Line", "Area", "Keterangan", "Remark", "Volume (kg)", "Temuan Opname"]}
              rows={exportRows}
            />
          )}
          <Button onClick={openAdd}>+ Tambah Pekerjaan</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        {KATEGORI_TABS.map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === k ? "bg-graphite-900 text-white" : "bg-white text-graphite-700 border border-gray-200 hover:bg-asphalt-100"
            }`}
          >
            {k === "periode" ? "Periode" : REKAP_KATEGORI_LABEL[k]}
          </button>
        ))}
      </div>

      {tab === "periode" ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-graphite-900">Ringkasan Periode {formatPeriodeLabel(periodeRange)}</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {(Object.keys(REKAP_KATEGORI_LABEL) as RekapKategori[]).map((k) => (
              <div key={k} className="rounded-md bg-asphalt-50 p-3">
                <div className="text-xs text-gray-500">{REKAP_KATEGORI_LABEL[k]}</div>
                <div className="mt-1 text-base font-semibold text-graphite-900">{formatNumberID(summaryPerKategori[k], 1)} m²</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-400">Klik salah satu tab kategori di atas untuk melihat detail baris.</p>
        </div>
      ) : (
        <div className="scroll-x rounded-lg border border-gray-200 bg-white">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tgl</th><th>KM</th><th>Panjang (m)</th><th>Lebar (m)</th><th>Luas (m²)</th>
                <th>Line</th><th>Area</th><th>Keterangan</th><th>Remark</th>
                {tab === "tambalan" && <th>Volume (kg)</th>}
                {rows.some((r) => r.opname_catatan) && <th>Temuan Opname</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={12} className="py-6 text-center text-gray-400">Memuat...</td></tr>}
              {!loading && rowsForTab.length === 0 && (
                <tr><td colSpan={12} className="py-8 text-center text-gray-400">Belum ada data pada kategori & periode ini.</td></tr>
              )}
              {rowsForTab.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateID(r.work_date)}</td>
                  <td className="chainage">{r.kategori === "tambalan" ? r.km_start : `${r.km_start} – ${r.km_finish}`}</td>
                  <td>{formatNumberID(rowPanjang(r), 1)}</td>
                  <td>{formatNumberID(r.lebar, 1)}</td>
                  <td className="font-medium">{formatNumberID(rowArea(r), 1)}</td>
                  <td>{r.line}</td>
                  <td>{r.area_nama ?? "-"}</td>
                  <td>{r.keterangan ?? "-"}</td>
                  <td>{r.remark_pekerjaan}</td>
                  {tab === "tambalan" && <td>{formatNumberID(r.volume_kg, 1)}</td>}
                  {rows.some((x) => x.opname_catatan) && <td className="max-w-[200px] truncate">{r.opname_catatan ?? "-"}</td>}
                  <td className="space-x-2">
                    <button className="text-signal-blue hover:underline" onClick={() => openEdit(r)}>Ubah</button>
                    <button className="text-signal-red hover:underline" onClick={() => handleDelete(r.id)}>Hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <Modal title={editingId ? "Ubah Pekerjaan" : "Tambah Pekerjaan"} onClose={() => setModalOpen(false)} width="max-w-2xl">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tanggal">
                <Input required type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} />
              </Field>
              <Field label="Jenis Pekerjaan">
                <Select
                  value={form.remark_pekerjaan}
                  disabled={!!editingId}
                  onChange={(e) => setForm({ ...form, remark_pekerjaan: e.target.value as WorkItem })}
                >
                  {WORK_ITEMS.map((w) => <option key={w} value={w}>{w}</option>)}
                </Select>
              </Field>
            </div>

            {(form.remark_pekerjaan === "Recycling" || form.remark_pekerjaan === "Upgrading") && !editingId && (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                Otomatis membuat 2 baris: Heavy Patches ({form.remark_pekerjaan}) sesuai KM asli, dan Double Coat dengan KM Start -1m & KM Finish +1m (overlap).
              </p>
            )}

            {isTambalanForm ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="KM (titik tunggal)"><Input required placeholder="10+050" value={form.km_start} onChange={(e) => setForm({ ...form, km_start: e.target.value })} /></Field>
                <Field label="Line">
                  <Select value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value as LineType })}>
                    {LINES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Panjang (m)"><Input required type="number" step="0.1" value={form.panjang_tambalan} onChange={(e) => setForm({ ...form, panjang_tambalan: e.target.value })} /></Field>
                <Field label="Lebar (m)"><Input required type="number" step="0.1" value={form.lebar} onChange={(e) => setForm({ ...form, lebar: e.target.value })} /></Field>
                <Field label="Volume (kg)"><Input type="number" step="0.1" value={form.volume_kg} onChange={(e) => setForm({ ...form, volume_kg: e.target.value })} /></Field>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="KM Start"><Input required placeholder="10+050" value={form.km_start} onChange={(e) => setForm({ ...form, km_start: e.target.value })} /></Field>
                <Field label="KM Finish"><Input required placeholder="10+150" value={form.km_finish} onChange={(e) => setForm({ ...form, km_finish: e.target.value })} /></Field>
                <Field label="Line">
                  <Select value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value as LineType })}>
                    {LINES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Lebar (m)"><Input required type="number" step="0.1" value={form.lebar} onChange={(e) => setForm({ ...form, lebar: e.target.value })} /></Field>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 rounded-md bg-asphalt-50 p-3 text-sm">
              <div>Panjang (auto): <span className="chainage font-medium">{panjangPreview ? `${formatNumberID(panjangPreview, 1)} m` : "-"}</span></div>
              <div>Luas (auto): <span className="font-medium">{luasPreview ? `${formatNumberID(luasPreview, 1)} m²` : "-"}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Area">
                <Select value={form.area_nama} onChange={(e) => setForm({ ...form, area_nama: e.target.value })}>
                  {AREA_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </Select>
              </Field>
              <Field label="Keterangan">
                <Select value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })}>
                  {KETERANGAN_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
                </Select>
              </Field>
            </div>

            <Field label="Temuan Opname (opsional - tulis catatan bila ada temuan di lapangan)">
              <textarea
                className="min-h-[70px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-graphite-700 focus:outline-none focus:ring-1 focus:ring-graphite-700"
                placeholder="Contoh: ditemukan retak buaya di KM 10+080, perlu tindak lanjut..."
                value={form.opname_catatan}
                onChange={(e) => setForm({ ...form, opname_catatan: e.target.value })}
              />
            </Field>

            {formError && <p className="text-sm text-signal-red">{formError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
