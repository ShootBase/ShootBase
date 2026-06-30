"use client";

import * as React from "react";
import { Check, ChevronsUpDown, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { getCitiesFor, findLocation } from "@/lib/locations";
import { detectCountryCode, PREVIEW_COUNTRY_KEY } from "@/lib/country-detect";

type Props = {
  value: string;
  onChange: (city: string) => void;
  name?: string;
  required?: boolean;
  id?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Searchable UK city selector. Replaces free-text city inputs across the app
 * so all stored locations are standardised against the UK_CITIES dataset.
 */
export function CitySelect({
  value,
  onChange,
  name,
  required,
  id,
  placeholder = "Select your city",
  searchPlaceholder = "Start typing a city name...",
  className,
  disabled,
}: Props) {
  const [open, setOpen] = React.useState(false);
  // Re-render when the preview override changes (storage event from /ng, /gb).
  const [country, setCountry] = React.useState(() => detectCountryCode());
  React.useEffect(() => {
    const sync = () => setCountry(detectCountryCode());
    window.addEventListener("storage", (e) => {
      if (e.key === PREVIEW_COUNTRY_KEY) sync();
    });
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("focus", sync);
    };
  }, []);
  const cities = React.useMemo(() => getCitiesFor(country), [country]);
  const selected = findLocation(value, country);


  return (
    <>
      {/* Hidden input for native form submission (e.g. GET search forms) */}
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-expanded={open}
            aria-haspopup="listbox"
            className={cn(
              "w-full flex items-center justify-between gap-2 border border-ink/15 px-3 py-2.5 text-sm bg-white text-left focus:outline-none focus:border-gold disabled:opacity-50 disabled:cursor-not-allowed",
              !selected && "text-ink/40",
              className,
            )}
          >
            <span className="flex items-center gap-2 truncate">
              <MapPin className="h-4 w-4 shrink-0 text-ink/40" aria-hidden />
              <span className="truncate text-ink">
                {selected ? (
                  <>
                    {selected.city}
                    <span className="text-ink/50"> · {selected.region}</span>
                  </>
                ) : (
                  placeholder
                )}
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) p-0"
          align="start"
          collisionPadding={12}
          onTouchMove={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <Command
            filter={(value, search) => {
              // Match by city name and region (lowercased).
              if (!search) return 1;
              return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList
              className="max-h-[60vh] overflow-y-auto overscroll-contain"
              style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
            >
              <CommandEmpty>No cities found.</CommandEmpty>
              <CommandGroup>
                {cities.map((c) => {
                  const key = `${c.city} ${c.region} ${c.country}`;
                  return (
                    <CommandItem
                      key={c.city + c.region}
                      value={key}
                      onSelect={() => {
                        onChange(c.city);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selected?.city === c.city ? "opacity-100" : "opacity-0")} />
                      <span className="flex-1">{c.city}</span>
                      <span className="text-xs text-ink/50">{c.region}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
