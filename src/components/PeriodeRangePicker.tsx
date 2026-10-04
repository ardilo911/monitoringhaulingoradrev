"use client";

import { Input, Field } from "./ui/Input";

export function PeriodeRangePicker({
  start,
  end,
  onChangeStart,
  onChangeEnd,
}: {
  start: string;
  end: string;
  onChangeStart: (v: string) => void;
  onChangeEnd: (v: string) => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <Field label="Tanggal Awal">
        <Input type="date" value={start} max={end || undefined} onChange={(e) => onChangeStart(e.target.value)} />
      </Field>
      <Field label="Tanggal Akhir">
        <Input type="date" value={end} min={start || undefined} onChange={(e) => onChangeEnd(e.target.value)} />
      </Field>
    </div>
  );
}
