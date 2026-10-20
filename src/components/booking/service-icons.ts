// src/components/booking/service-icons.ts
//
// One icon per service category for the booking finder. Presentation only:
// categories and services still come from the Backend catalog. The keyword
// mapping is the same one the wizard used before the redesign, kept in one
// place so the category rail and the compact cards cannot drift apart.
import type { Component } from 'vue';
import { Droplets, Fan, Flame, Lock, Microwave, Pipette, Refrigerator, ShieldCheck, Snowflake, Toilet, Tv, Utensils, WashingMachine, Waves, Wind, Wrench, Zap } from 'lucide-vue-next';

export interface CategoryIconSource {
  iconKey?: string | null;
  code?: string | null;
  name?: string | null;
}

const codeIcons: Record<string, Component> = {
  CAT_AC: Wind,
  CAT_LAUNDRY: WashingMachine,
  CAT_FRIDGE: Refrigerator,
  CAT_RO: Droplets,
  CAT_HEATER: Flame,
  CAT_KITCHEN: Utensils,
  CAT_ELECTRIC: Zap,
  CAT_LIGHT_FAN: Fan,
  CAT_PIPE: Pipette,
  CAT_PUMP: Waves,
  CAT_SANITARY: Toilet,
  CAT_TV: Tv,
  CAT_LOCK: Lock,
};
const keyIcons: Record<string, Component> = {
  snowflake: Snowflake, wind: Wind, droplets: Droplets, zap: Zap,
  refrigerator: Refrigerator, 'washing-machine': WashingMachine, washingmachine: WashingMachine,
  flame: Flame, utensils: Utensils, lock: Lock, shield: ShieldCheck, wrench: Wrench,
};

export function categoryIcon(cat?: CategoryIconSource | null): Component {
  const explicitIcon = keyIcons[cat?.iconKey?.toLowerCase().trim() ?? ''];
  if (explicitIcon) return explicitIcon;
  const codeIcon = codeIcons[cat?.code?.toUpperCase() ?? ''];
  if (codeIcon) return codeIcon;
  const key = `${cat?.iconKey ?? ''} ${cat?.code ?? ''} ${cat?.name ?? ''}`.toLowerCase();
  if (/washing|laundry|máy giặt|may giat/.test(key)) return WashingMachine;
  if (/fridge|refriger|tủ lạnh|tu lanh/.test(key)) return Refrigerator;
  if (/wind|điều hòa|dieu hoa|máy lạnh|may lanh/.test(key)) return Wind;
  if (/flame|nóng lạnh|nong lanh|water.heater/.test(key)) return Flame;
  if (/microwave|vi sóng|vi song/.test(key)) return Microwave;
  if (/fan|quạt|quat/.test(key)) return Fan;
  if (/television|tivi|\btv\b/.test(key)) return Tv;
  if (key.includes('lanh') || key.includes('lạnh') || key.includes('điều hòa') || key.includes('refriger')) {
    return Snowflake;
  }
  if (key.includes('nước') || key.includes('nuoc') || key.includes('plumb') || key.includes('lavabo') || key.includes('siphon')) {
    return Droplets;
  }
  if (key.includes('điện') || key.includes('dien') || key.includes('electr') || key.includes('aptomat')) {
    return Zap;
  }
  if (key.includes('bếp') || key.includes('bep') || key.includes('kitchen') || key.includes('nấu')) {
    return Utensils;
  }
  if (key.includes('khóa') || key.includes('khoa') || key.includes('cửa') || key.includes('lock')) {
    return Lock;
  }
  return Wrench;
}
