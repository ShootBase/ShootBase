// Nigerian states and major cities. Used when active country is NG.
// Same shape as UK_CITIES so CitySelect / findCity helpers work uniformly.

export type NgCity = {
  city: string;
  region: string; // state
  country: "Nigeria";
  nearby?: string[];
};

// Major cities mapped to their state. The state itself is included as a city
// entry so users can select either "Lagos" (city) or the wider state region.
export const NG_CITIES: NgCity[] = [
  { city: "Lagos", region: "Lagos", country: "Nigeria", nearby: ["Ikeja", "Lekki", "Ikorodu", "Badagry", "Epe"] },
  { city: "Ikeja", region: "Lagos", country: "Nigeria", nearby: ["Lagos"] },
  { city: "Lekki", region: "Lagos", country: "Nigeria", nearby: ["Lagos"] },
  { city: "Ikorodu", region: "Lagos", country: "Nigeria", nearby: ["Lagos"] },
  { city: "Badagry", region: "Lagos", country: "Nigeria", nearby: ["Lagos"] },
  { city: "Epe", region: "Lagos", country: "Nigeria", nearby: ["Lagos"] },

  { city: "Abuja", region: "FCT", country: "Nigeria", nearby: ["Gwagwalada", "Kuje"] },
  { city: "Gwagwalada", region: "FCT", country: "Nigeria", nearby: ["Abuja"] },
  { city: "Kuje", region: "FCT", country: "Nigeria", nearby: ["Abuja"] },

  { city: "Port Harcourt", region: "Rivers", country: "Nigeria", nearby: ["Obio-Akpor"] },
  { city: "Obio-Akpor", region: "Rivers", country: "Nigeria", nearby: ["Port Harcourt"] },

  { city: "Ibadan", region: "Oyo", country: "Nigeria", nearby: ["Ogbomosho"] },
  { city: "Ogbomosho", region: "Oyo", country: "Nigeria", nearby: ["Ibadan"] },

  { city: "Kano", region: "Kano", country: "Nigeria" },

  { city: "Abeokuta", region: "Ogun", country: "Nigeria", nearby: ["Sagamu"] },
  { city: "Sagamu", region: "Ogun", country: "Nigeria", nearby: ["Abeokuta"] },

  { city: "Kaduna", region: "Kaduna", country: "Nigeria", nearby: ["Zaria"] },
  { city: "Zaria", region: "Kaduna", country: "Nigeria", nearby: ["Kaduna"] },

  { city: "Enugu", region: "Enugu", country: "Nigeria", nearby: ["Nsukka"] },
  { city: "Nsukka", region: "Enugu", country: "Nigeria", nearby: ["Enugu"] },

  { city: "Onitsha", region: "Anambra", country: "Nigeria", nearby: ["Awka", "Nnewi"] },
  { city: "Awka", region: "Anambra", country: "Nigeria", nearby: ["Onitsha"] },
  { city: "Nnewi", region: "Anambra", country: "Nigeria", nearby: ["Onitsha"] },

  { city: "Warri", region: "Delta", country: "Nigeria", nearby: ["Asaba", "Sapele"] },
  { city: "Asaba", region: "Delta", country: "Nigeria", nearby: ["Warri", "Onitsha"] },
  { city: "Sapele", region: "Delta", country: "Nigeria", nearby: ["Warri"] },

  { city: "Benin City", region: "Edo", country: "Nigeria" },

  { city: "Owerri", region: "Imo", country: "Nigeria" },

  { city: "Aba", region: "Abia", country: "Nigeria", nearby: ["Umuahia"] },
  { city: "Umuahia", region: "Abia", country: "Nigeria", nearby: ["Aba"] },

  { city: "Uyo", region: "Akwa Ibom", country: "Nigeria" },
  { city: "Calabar", region: "Cross River", country: "Nigeria" },
  { city: "Ilorin", region: "Kwara", country: "Nigeria" },
  { city: "Osogbo", region: "Osun", country: "Nigeria" },
  { city: "Ile-Ife", region: "Osun", country: "Nigeria" },
  { city: "Akure", region: "Ondo", country: "Nigeria" },
  { city: "Jos", region: "Plateau", country: "Nigeria" },
  { city: "Makurdi", region: "Benue", country: "Nigeria" },
  { city: "Lokoja", region: "Kogi", country: "Nigeria" },
  { city: "Minna", region: "Niger", country: "Nigeria" },
  { city: "Lafia", region: "Nasarawa", country: "Nigeria" },
  { city: "Bauchi", region: "Bauchi", country: "Nigeria" },
  { city: "Maiduguri", region: "Borno", country: "Nigeria" },
  { city: "Yola", region: "Adamawa", country: "Nigeria" },
  { city: "Jalingo", region: "Taraba", country: "Nigeria" },
  { city: "Damaturu", region: "Yobe", country: "Nigeria" },
  { city: "Dutse", region: "Jigawa", country: "Nigeria" },
  { city: "Katsina", region: "Katsina", country: "Nigeria" },
  { city: "Birnin Kebbi", region: "Kebbi", country: "Nigeria" },
  { city: "Sokoto", region: "Sokoto", country: "Nigeria" },
  { city: "Gusau", region: "Zamfara", country: "Nigeria" },
  { city: "Gombe", region: "Gombe", country: "Nigeria" },
  { city: "Yenagoa", region: "Bayelsa", country: "Nigeria" },
  { city: "Abakaliki", region: "Ebonyi", country: "Nigeria" },
  { city: "Ado-Ekiti", region: "Ekiti", country: "Nigeria" },
];

const INDEX = new Map(NG_CITIES.map((c) => [c.city.toLowerCase(), c]));
export function findNgCity(name: string | null | undefined): NgCity | undefined {
  if (!name) return undefined;
  return INDEX.get(name.trim().toLowerCase());
}
