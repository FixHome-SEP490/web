// src/components/booking/service-icons.ts
//
// One icon per service category for the booking finder. Presentation only:
// categories and services still come from the Backend catalog. The keyword
// mapping is the same one the wizard used before the redesign, kept in one
// place so the category rail and the compact cards cannot drift apart.
import type { Component } from 'vue';
import { Droplets, Lock, Snowflake, Utensils, Wrench, Zap } from 'lucide-vue-next';

export interface CategoryIconSource {
  iconKey?: string | null;
  code?: string | null;
  name?: string | null;
}

export function categoryIcon(cat?: CategoryIconSource | null): Component {
  const key = `${cat?.iconKey ?? ''} ${cat?.code ?? ''} ${cat?.name ?? ''}`.toLowerCase();
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
