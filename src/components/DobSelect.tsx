"use client";

import { useEffect, useMemo, useState } from "react";

type DobSelectProps = {
  value: string;
  onChange: (nextValue: string) => void;
  required?: boolean;
  className?: string;
};

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function parseDob(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { year: "", month: "", day: "" };
  return { year: match[1], month: match[2], day: match[3] };
}

export default function DobSelect({
  value,
  onChange,
  required = false,
  className = "",
}: DobSelectProps) {
  const parsed = parseDob(value);
  const [year, setYear] = useState(parsed.year);
  const [month, setMonth] = useState(parsed.month);
  const [day, setDay] = useState(parsed.day);

  useEffect(() => {
    const next = parseDob(value);
    setYear(next.year);
    setMonth(next.month);
    setDay(next.day);
  }, [value]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: currentYear - 1899 }, (_, index) =>
      String(currentYear - index)
    );
  }, []);

  const dayOptions = useMemo(() => {
    const numericYear = Number(year);
    const numericMonth = Number(month);
    const total =
      numericYear > 0 && numericMonth > 0
        ? daysInMonth(numericYear, numericMonth)
        : 31;
    return Array.from({ length: total }, (_, index) =>
      String(index + 1).padStart(2, "0")
    );
  }, [month, year]);

  useEffect(() => {
    if (!year || !month || !day) {
      onChange("");
      return;
    }
    const numericDay = Number(day);
    const numericMonth = Number(month);
    const numericYear = Number(year);
    if (
      numericYear < 1900 ||
      numericMonth < 1 ||
      numericMonth > 12 ||
      numericDay < 1 ||
      numericDay > daysInMonth(numericYear, numericMonth)
    ) {
      onChange("");
      return;
    }
    onChange(`${year}-${month}-${day}`);
  }, [day, month, onChange, year]);

  useEffect(() => {
    if (!day) return;
    if (!dayOptions.includes(day)) {
      setDay("");
    }
  }, [day, dayOptions]);

  const selectClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900";

  return (
    <div className={`grid gap-2 sm:grid-cols-3 ${className}`.trim()}>
      <select
        required={required}
        value={day}
        onChange={(e) => setDay(e.target.value)}
        className={selectClass}
      >
        <option value="">Day</option>
        {dayOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select
        required={required}
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className={selectClass}
      >
        <option value="">Month</option>
        {MONTHS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        required={required}
        value={year}
        onChange={(e) => setYear(e.target.value)}
        className={selectClass}
      >
        <option value="">Year</option>
        {years.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
