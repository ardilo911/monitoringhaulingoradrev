"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { formatNumberID, formatDateID } from "@/lib/format";
import { periodeRangeFromDate, formatPeriodeLabel, shiftPeriode } from "@/lib/period";
import { rowArea } from "@/lib/workGeneration";
import { calculateRetentionCorrection, type CorrectionResult } from "@/lib/retention";
import { REKAP_KATEGORI_LABEL, type WorkRecord, type Mitra, type Bast } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { ExportButtons } from "@/components/ExportButtons";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// 6 baris ringkasan BAST sesuai revisi terakhir.
const BAST_BUCKETS = [
  "Double Coat",
  "Reseal 1 Coat",
  "Reseal 2 Coat",
  "Reseal Selected",
  "Heavy Patches Upgrading",
  "Heavy Patches Recycling",
] as const;
type BastBucket = (typeof BAST_BUCKETS)[number];

function bucketFor(r: WorkRecord): BastBucket | null {
  if (r.kategori === "reseal_1_coat") return "Reseal 1 Coat";
  if (r.kategori === "heavy_patches_upgrading") return "Heavy Patches Upgrading";
  if (r.kategori === "heavy_patches_recycling") return "Heavy Patches Recycling";
  if (r.kategori === "double_coat") {
    if (r.remark_pekerjaan === "Reseal 2 Coat") return "Reseal 2 Coat";
    if (r.remark_pekerjaan === "Reseal Selected") return "Reseal Selected";
    return "Double Coat"; // dari Recycling / Upgrading
  }
  return null; // tambalan tidak masuk Summary BAST
}

interface RowResult {
  record: WorkRecord;
  totalAreaM2: number;
  correction: CorrectionResult;
  bucket: BastBucket | null;
}

export default function BastPage() {
  const params = useParams<{ mitra: string }>();
  const mitra = params.mitra as Mitra;

  const [anchorDate, setAnchorDate] = useState(todayStr());
  const periodeRange = useMemo(() => periodeRangeFromDate(anchorDate), [anchorDate]);
  const [retentionMonths, setRetentionMonths] = useState(6);
  const [newRecords, setNewRecords] = useState<WorkRecord[]>([]);
  const [dbRecords, setDbRecords] = useState<WorkRecord[]>([]);
  const [bastRow, setBastRow] = useState<Bast | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState<RowResult | null>(null);

  async function load() {
    setLoading(true);
    const { data: settingsData } = await supabase.from("settings").select("retention_months").single();
    const months = settingsData?.retention_months ?? 6;
    setRetentionMonths(months);

    // Pekerjaan baru yang dinilai: dari Rekap Pekerjaan (in_database=false) pada periode terpilih.
    const { data: newData, error: newErr } = await supabase
      .from("work_records")
      .select("*")
      .eq("mitra", mitra)
      .eq("in_database", false)
      .neq("kategori", "tambalan")
      .gte("work_date", periodeRange.start)
      .lte("work_date", periodeRange.end);
    if (newErr) console.error("Gagal memuat Rekap Pekerjaan:", newErr.message);
    setNewRecords((newData as WorkRecord[]) ?? []);

    // Basis retensi: dari Database (in_database=true), mundur (retentionMonths) bulan dari awal periode.
    const dbRangeStartPeriode = shiftPeriode(periodeRange, -(months + 1));
    const dbRangeStart = dbRangeStartPeriode.start;
    const dbRangeEndDate = new Date(periodeRange.start + "T00:00:00");
    dbRangeEndDate.setDate(dbRangeEndDate.getDate() - 1);
    const dbRangeEnd = dbRangeEndDate.toISOString().slice(0, 10);

    const { data: dbData, error: dbErr } = await supabase
      .from("work_records")
      .select("*")
      .eq("mitra", mitra)
      .eq("in_database", true)
      .neq("kategori", "tambalan")
      .gte("work_date", dbRangeStart)
      .lte("work_date", dbRangeEnd);
    if (dbErr) console.error("Gagal memuat Database:", dbErr.message);
    setDbRecords((dbData as WorkRecord[]) ?? []);

    const { data: bastData } = await supabase.from("bast").select("*").eq("mitra", mitra).eq("periode", periodeRange.start).maybeSingle();
    setBastRow((bastData as Bast) ?? null);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mitra, periodeRange.start, periodeRange.end]);

  const results: RowResult[] = useMemo(() => {
    return newRecords.map((r) => {
      const totalAreaM2 = rowArea(r);
      const correction = calculateRetentionCorrection({
        newKmStart: r.km_start,
        newKmFinish: r.km_finish,
        newLine: r.line,
        newDate: r.work_date,
        newLebar: r.lebar,
        newKeterangan: r.keterangan,
        newAreaNama: r.area_nama,
        databaseRecords: dbRecords,
        retentionMonths,
      });
      return { record: r, totalAreaM2, correction, bucket: bucketFor(r) };
    });
  }, [newRecords, dbRecords, retentionMonths]);

  const totalsPerBucket = useMemo(() => {
    const totals: Record<BastBucket, number> = {
      "Double Coat": 0, "Reseal 1 Coat": 0, "Reseal 2 Coat": 0, "Reseal Selected": 0,
      "Heavy Patches Upgrading": 0, "Heavy Patches Recycling": 0,
    };
    for (const res of results) if (res.bucket) totals[res.bucket] += res.correction.payableAreaM2;
    return totals;
  }, [results]);

  const isLocked = bastRow?.status === "Final";

  async function handleSaveDraft() {
    await supabase.from("bast").upsert({ mitra, periode: periodeRange.start, total_per_work_item: totalsPerBucket, status: "Draft" as const }, { onConflict: "mitra,periode" });
    load();
  }

  async function handleFinalize() {
    if (!confirm("Finalisasi BAST periode ini? Data tidak dapat diubah setelah difinalkan.")) return;
    await supabase
      .from("bast")
      .upsert({ mitra, periode: periodeRange.start, total_per_work_item: totalsPerBucket, status: "Final", locked_at: new Date().toISOString() }, { onConflict: "mitra,periode" });
    load();
  }

  const exportRows = results.map((res) => [
    formatDateID(res.record.work_date), res.record.km_start, res.record.km_finish, res.record.line,
    REKAP_KATEGORI_LABEL[res.record.kategori], res.bucket ?? "-", res.record.area_nama ?? "-", res.record.keterangan ?? "-",
    formatNumberID(res.totalAreaM2, 1), formatNumberID(res.correction.correctedAreaM2, 1), formatNumberID(res.correction.payableAreaM2, 1),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-graphite-900">BAST</h1>
          <p className="text-sm text-gray-500">
            Periode: <strong>{formatPeriodeLabel(periodeRange)}</strong>. Koreksi retensi {retentionMonths} bulan, dicek berdasarkan Keterangan + Area + Line yang sama.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <Field label="Pilih Tanggal (periode)">
            <Input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
          </Field>
          <ExportButtons
            filename={`bast-${mitra}-${periodeRange.start}`}
            title={`BAST ${mitra.toUpperCase()} - ${formatPeriodeLabel(periodeRange)}`}
            columns={["Tgl", "KM Start", "KM Finish", "Line", "Kategori", "Bucket BAST", "Area", "Keterangan", "Luas Sebelum (m2)", "Luas Dikoreksi (m2)", "Luas Dapat Dibayar (m2)"]}
            rows={exportRows}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {bastRow ? <Badge tone={bastRow.status === "Final" ? "green" : "amber"}>{bastRow.status}</Badge> : <Badge tone="neutral">Belum dibuat</Badge>}
        <Button variant="secondary" onClick={handleSaveDraft} disabled={isLocked}>Simpan Draft</Button>
        <Button onClick={handleFinalize} disabled={isLocked}>{isLocked ? "Sudah Final" : "Finalisasi"}</Button>
      </div>

      <div className="scroll-x rounded-lg border border-gray-200 bg-white">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tgl</th><th>KM Start</th><th>KM Finish</th><th>Line</th><th>Area</th><th>Keterangan</th><th>Bucket BAST</th>
              <th>Luas Sebelum (m²)</th><th>Luas Dikoreksi Retensi (m²)</th><th>Luas Dapat Dibayar (m²)</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className="py-6 text-center text-gray-400">Menghitung koreksi retensi...</td></tr>}
            {!loading && results.length === 0 && (
              <tr><td colSpan={11} className="py-8 text-center text-gray-400">Tidak ada pekerjaan baru (Rekap Pekerjaan) pada periode ini.</td></tr>
            )}
            {results.map((res) => (
              <tr key={res.record.id}>
                <td>{formatDateID(res.record.work_date)}</td>
                <td className="chainage">{res.record.km_start}</td>
                <td className="chainage">{res.record.km_finish}</td>
                <td>{res.record.line}</td>
                <td>{res.record.area_nama ?? "-"}</td>
                <td>{res.record.keterangan ?? "-"}</td>
                <td>{res.bucket ?? <span className="text-gray-400">tidak dihitung</span>}</td>
                <td>{formatNumberID(res.totalAreaM2, 1)}</td>
                <td className={res.correction.correctedAreaM2 > 0 ? "text-signal-red font-medium" : ""}>{formatNumberID(res.correction.correctedAreaM2, 1)}</td>
                <td className="font-medium">{formatNumberID(res.correction.payableAreaM2, 1)}</td>
                <td>
                  {res.correction.retainedSegments.length > 0 && (
                    <button className="text-signal-blue hover:underline" onClick={() => setDrillDown(res)}>Detail</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-graphite-900">Summary (Luasan Dapat Dibayar, Terkoreksi)</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {BAST_BUCKETS.map((b) => (
            <div key={b} className="rounded-md bg-asphalt-50 p-3">
              <div className="text-xs text-gray-500">{b}</div>
              <div className="mt-1 text-base font-semibold text-graphite-900">{formatNumberID(totalsPerBucket[b], 1)} m²</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-400">Tambalan tidak dibayar lewat BAST ini (titik tunggal, bukan volume rentang jalan).</p>
      </div>

      {drillDown && (
        <Modal title="Detail Koreksi Retensi" onClose={() => setDrillDown(null)} width="max-w-xl">
          <div className="space-y-3 text-sm">
            <p>
              Pekerjaan baru <span className="chainage font-medium">{drillDown.record.km_start}–{drillDown.record.km_finish}</span> Line{" "}
              {drillDown.record.line}, Area {drillDown.record.area_nama}, Keterangan {drillDown.record.keterangan}, pada{" "}
              {formatDateID(drillDown.record.work_date)} beririsan dengan area retensi berikut (dari Database, dengan Keterangan + Area + Line yang sama):
            </p>
            <div className="scroll-x rounded-md border border-gray-200">
              <table className="data-table">
                <thead>
                  <tr><th>Tgl Record Lama</th><th>KM Start</th><th>KM Finish</th><th>Kategori</th><th>Panjang Overlap (m)</th></tr>
                </thead>
                <tbody>
                  {drillDown.correction.retainedSegments.map((seg, i) => (
                    <tr key={i}>
                      <td>{formatDateID(seg.record.work_date)}</td>
                      <td className="chainage">{seg.record.km_start}</td>
                      <td className="chainage">{seg.record.km_finish}</td>
                      <td>{REKAP_KATEGORI_LABEL[seg.record.kategori]}</td>
                      <td>{formatNumberID(seg.overlap.end - seg.overlap.start, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500">
              Total overlap (setelah union, tanpa double counting): {formatNumberID(drillDown.correction.overlapLengthM, 1)} m —
              luas dikoreksi {formatNumberID(drillDown.correction.correctedAreaM2, 1)} m².
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
