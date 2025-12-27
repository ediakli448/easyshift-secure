import React, { useMemo } from "react";
import { addDays, format, parseISO } from "date-fns";

export function CalendarGrid({
  startDate,
  endDate,
  renderDay,
}: {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  renderDay: (d: string) => React.ReactNode;
}) {
  const days = useMemo(() => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const out: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      out.push(format(d, "yyyy-MM-dd"));
    }
    return out;
  }, [startDate, endDate]);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {days.map((d) => (
        <div key={d} className="rounded border bg-white p-3">
          <div className="mb-2 text-sm font-medium">{d}</div>
          {renderDay(d)}
        </div>
      ))}
    </div>
  );
}
