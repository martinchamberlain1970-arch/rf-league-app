"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";

export type PlayerPickerOption = { id: string; name: string; club: string };

export default function CompetitionPlayerPicker({ label, value, options, disabled, placeholder = "Search players", onSelect }: {
  label: string;
  value: string;
  options: PlayerPickerOption[];
  disabled: boolean;
  placeholder?: string;
  onSelect: (playerId: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const selected = options.find((option) => option.id === value);
  const search = query.trim().toLowerCase();
  const results = options.filter(({ name, club }) => `${name} ${club}`.toLowerCase().includes(search));
  const optionId = (playerId: string) => `${id}-${playerId}`;

  function close() {
    setOpen(false);
    setQuery("");
    setHighlight(-1);
  }

  function choose(playerId: string) {
    onSelect(playerId);
    close();
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown"
        ? Math.min(highlight + 1, results.length - 1)
        : highlight <= 0 ? results.length - 1 : highlight - 1;
      setOpen(true);
      setHighlight(next);
      const player = results[next];
      if (player) requestAnimationFrame(() => document.getElementById(optionId(player.id))?.scrollIntoView({ block: "nearest" }));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const player = open ? results[highlight] ?? (results.length === 1 ? results[0] : null) : null;
      if (player) choose(player.id);
    }
  }

  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">{label}</label>
      <div className="flex rounded-lg border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-teal-500">
        <input
          id={id} ref={input} role="combobox" aria-autocomplete="list" aria-controls={open ? `${id}-list` : undefined}
          aria-expanded={open && !disabled}
          aria-activedescendant={open && results[highlight] ? optionId(results[highlight].id) : undefined}
          autoComplete="off" disabled={disabled} placeholder={placeholder}
          value={open ? query : selected?.name ?? ""}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onClick={() => setOpen(true)}
          onBlur={close}
          onChange={(event) => { setQuery(event.target.value); setHighlight(-1); setOpen(true); }}
          onKeyDown={handleKey}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2 text-sm outline-none disabled:bg-slate-100"
        />
        {selected ? <button type="button" aria-label={`Clear ${label.toLowerCase()}`} disabled={disabled}
          className="px-3 text-slate-600 hover:text-slate-900 disabled:opacity-50"
          onClick={() => { choose(""); input.current?.focus(); }}>×</button> : null}
      </div>
      {selected?.club ? <p className="mt-1 text-xs text-slate-600">{selected.club}</p> : null}
      {open && !disabled ? (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <ul id={`${id}-list`} role="listbox" aria-label={label} className="max-h-56 overflow-y-auto">
            {results.map(({ id: playerId, name, club }, index) => (
              <li key={playerId} id={optionId(playerId)} role="option" aria-selected={playerId === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(playerId)}
                className={`cursor-pointer px-3 py-2 text-sm hover:bg-teal-50 ${highlight === index ? "bg-teal-100" : ""}`}>
                <span className="block font-medium">{name}</span>
                {club ? <span className="block text-xs text-slate-600">{club}</span> : null}
              </li>
            ))}
          </ul>
          {!results.length ? <p role="status" className="px-3 py-2 text-sm text-slate-600">No matching players.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
