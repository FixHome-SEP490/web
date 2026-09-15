<script setup lang="ts">
import { ref, computed } from 'vue';
import { Camera, CheckCircle2, ZoomIn, X, Clock, Image as ImageIcon } from 'lucide-vue-next';

export interface EvidenceItem {
  id?: string;
  type: 'BEFORE' | 'AFTER' | 'ADDITIONAL' | string;
  mediaUrl: string;
  note?: string;
  capturedAt?: string | Date;
  createdAt?: string | Date;
}

const props = defineProps<{
  evidence: EvidenceItem[];
  title?: string;
}>();

const activeTab = ref<'ALL' | 'BEFORE' | 'AFTER'>('ALL');
const zoomItem = ref<EvidenceItem | null>(null);

const beforePhotos = computed(() =>
  props.evidence.filter((e) => String(e.type).toUpperCase() === 'BEFORE'),
);

const afterPhotos = computed(() =>
  props.evidence.filter((e) => String(e.type).toUpperCase() === 'AFTER'),
);

const displayList = computed(() => {
  if (activeTab.value === 'BEFORE') return beforePhotos.value;
  if (activeTab.value === 'AFTER') return afterPhotos.value;
  return props.evidence;
});

const formatTime = (val?: string | Date) => {
  if (!val) return '';
  try {
    return new Date(val).toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return String(val);
  }
};
</script>

<template>
  <div class="space-y-4">
    <!-- Header & Tabs -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3">
      <div class="flex items-center gap-2">
        <Camera :size="18" class="text-brand-600 shrink-0" />
        <h3 class="text-sm font-bold text-ink-900">
          {{ title || 'Hình ảnh Bằng chứng Sửa chữa (Evidence Audit)' }}
        </h3>
        <span class="px-2 py-0.5 rounded-full text-[11px] font-bold font-num bg-brand-50 text-brand-700">
          {{ evidence.length }} ảnh
        </span>
      </div>

      <div class="flex items-center gap-1.5 p-1 bg-ink-100/70 rounded-lg text-xs font-semibold">
        <button
          type="button"
          class="px-2.5 py-1 rounded transition-colors"
          :class="activeTab === 'ALL' ? 'bg-white text-ink-900 shadow-xs' : 'text-ink-600 hover:text-ink-900'"
          @click="activeTab = 'ALL'"
        >
          Tất cả ({{ evidence.length }})
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded transition-colors"
          :class="activeTab === 'BEFORE' ? 'bg-white text-brand-700 font-bold shadow-xs' : 'text-ink-600 hover:text-ink-900'"
          @click="activeTab = 'BEFORE'"
        >
          Trước sửa ({{ beforePhotos.length }})
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded transition-colors"
          :class="activeTab === 'AFTER' ? 'bg-white text-success-700 font-bold shadow-xs' : 'text-ink-600 hover:text-ink-900'"
          @click="activeTab = 'AFTER'"
        >
          Sau sửa ({{ afterPhotos.length }})
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="displayList.length === 0"
      class="py-10 text-center rounded-lg border border-dashed border-ink-200 bg-ink-50/50 space-y-2"
    >
      <ImageIcon :size="32" class="mx-auto text-ink-300" />
      <p class="text-xs text-ink-500 font-medium">
        Chưa có hình ảnh bằng chứng nào được ghi nhận cho mục này.
      </p>
    </div>

    <!-- Photo Grid -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
      <div
        v-for="(item, idx) in displayList"
        :key="item.id || idx"
        class="group relative rounded-lg border border-ink-200 bg-white overflow-hidden shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col"
        @click="zoomItem = item"
      >
        <!-- Thumbnail -->
        <div class="aspect-4/3 w-full bg-ink-100 overflow-hidden relative">
          <img
            :src="item.mediaUrl"
            :alt="item.note || 'Evidence photo'"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
          <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span class="p-2 rounded-full bg-white/90 text-ink-900 shadow-sm">
              <ZoomIn :size="16" />
            </span>
          </div>

          <!-- Type Badge -->
          <div class="absolute top-2 left-2">
            <span
              v-if="String(item.type).toUpperCase() === 'BEFORE'"
              class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white shadow-xs"
            >
              BEFORE (Hiện trạng)
            </span>
            <span
              v-else-if="String(item.type).toUpperCase() === 'AFTER'"
              class="px-2 py-0.5 rounded text-[10px] font-bold bg-success-600 text-white shadow-xs flex items-center gap-1"
            >
              <CheckCircle2 :size="10" /> AFTER (Nghiệm thu)
            </span>
            <span
              v-else
              class="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-600 text-white shadow-xs"
            >
              PHÁT SINH
            </span>
          </div>
        </div>

        <!-- Meta -->
        <div class="p-2.5 flex-1 flex flex-col justify-between gap-1 text-[11px]">
          <p class="font-medium text-ink-800 line-clamp-2" :title="item.note">
            {{ item.note || 'Ảnh ghi nhận tại hiện trường' }}
          </p>
          <div class="text-[10px] text-ink-400 flex items-center gap-1 mt-1">
            <Clock :size="11" />
            <span>{{ formatTime(item.capturedAt || item.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Zoom Modal -->
    <div
      v-if="zoomItem"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
      @click.self="zoomItem = null"
    >
      <div class="bg-white rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl space-y-3 p-4 animate-in fade-in zoom-in-95 duration-150">
        <div class="flex items-center justify-between border-b border-ink-100 pb-2">
          <div class="flex items-center gap-2">
            <span
              class="px-2 py-0.5 rounded text-xs font-bold text-white"
              :class="String(zoomItem.type).toUpperCase() === 'BEFORE' ? 'bg-amber-500' : 'bg-success-600'"
            >
              {{ String(zoomItem.type).toUpperCase() === 'BEFORE' ? 'Hiện trạng trước sửa (BEFORE)' : 'Nghiệm thu sau sửa (AFTER)' }}
            </span>
            <span class="text-xs text-ink-500">
              {{ formatTime(zoomItem.capturedAt || zoomItem.createdAt) }}
            </span>
          </div>

          <button
            type="button"
            class="p-1.5 rounded-md text-ink-400 hover:text-ink-900 hover:bg-ink-100 transition-colors"
            @click="zoomItem = null"
          >
            <X :size="18" />
          </button>
        </div>

        <div class="rounded-lg overflow-hidden max-h-[70vh] bg-ink-950 flex items-center justify-center">
          <img
            :src="zoomItem.mediaUrl"
            :alt="zoomItem.note || 'Evidence detail'"
            class="max-h-[68vh] w-auto object-contain"
          />
        </div>

        <p v-if="zoomItem.note" class="text-xs text-ink-700 bg-ink-50 p-3 rounded-lg border border-ink-200">
          <strong>Ghi chú kỹ thuật:</strong> {{ zoomItem.note }}
        </p>
      </div>
    </div>
  </div>
</template>
