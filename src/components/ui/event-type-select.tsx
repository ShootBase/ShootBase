"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { EVENT_TYPES } from "@/lib/event-types";

type Props = {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export function EventTypeSelect({
  value,
  onChange,
  id,
  placeholder = "Select event type",
  className,
  disabled,
}: Props) {
  const [open, setOpen] = React.useState(false);

  return (
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
            !value && "text-ink/40",
            className,
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <Tag className="h-4 w-4 shrink-0 text-ink/40" aria-hidden />
            <span className="truncate text-ink">{value || placeholder}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Start typing an event type..." />
          <CommandList className="max-h-72">
            <CommandEmpty>No event types found.</CommandEmpty>
            <CommandGroup>
              {EVENT_TYPES.map((t) => (
                <CommandItem
                  key={t}
                  value={t}
                  onSelect={() => {
                    onChange(t);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === t ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1">{t}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
