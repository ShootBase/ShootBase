import { Globe2, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAdminCountry } from "@/lib/admin-country";

export function CountrySwitcher() {
  const { country, options, canSwitch, setCountry } = useAdminCountry();
  const qc = useQueryClient();

  useEffect(() => {
    const onChange = () => {
      void qc.invalidateQueries();
    };
    window.addEventListener("admin-country-change", onChange);
    return () => window.removeEventListener("admin-country-change", onChange);
  }, [qc]);

  if (!canSwitch) {
    if (!country) return null;
    return (
      <Badge variant="outline" className="hidden sm:inline-flex gap-1.5 font-normal shrink-0">
        <Globe2 className="h-3.5 w-3.5" />
        {country}
      </Badge>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
          <Globe2 className="h-4 w-4" />
          <span className="hidden sm:inline truncate max-w-[140px]">{country}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>View country</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((c) => (
          <DropdownMenuCheckboxItem
            key={c}
            checked={country === c}
            onCheckedChange={() => setCountry(c)}
          >
            {c}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
