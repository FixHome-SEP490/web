<script setup lang="ts">
import { computed } from 'vue';
import {
  ArrowDown,
  ArrowUp,
  History,
  Lock,
  RotateCcw,
  SlidersHorizontal,
  User,
  Wrench,
  X,
} from 'lucide-vue-next';
import { FhButton, FhSkeleton } from '..';
import type { ReputationEvent, ReputationRow } from '../../api/reputation.api';
import { activeBanUntil, REPUTATION_SUSPEND_THRESHOLD } from '../../utils/reputation-rules';
import { vnDateTimeString } from '../../utils/vn-time';

const props = withDefaults(defineProps<{
  account: ReputationRow | null;
  events: ReputationEvent[];
  loading: boolean;
  error: string;
  canAdjust?: boolean;
}>(), {
  canAdjust: false,
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'retry'): void;
  (e: 'adjust', account: ReputationRow): void;
}>();

const KIND_LABELS: Record<ReputationEvent['kind'], string> = {
  violation: 'Trừ điểm',
  adjustment: 'Điều chỉnh thủ công',
  reset: 'Làm mới định kỳ',
};

const ROLE_LABELS: Record<ReputationRow['role'], string> = {
  customer: 'Khách hàng',
  technician: 'Kỹ thuật viên',
};

const sortedEvents = computed(() =>
  [...props.events].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
);

const runningBan = computed(() => (props.account ? activeBanUntil(props.account) : null));

function signedDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function eventIcon(event: ReputationEvent) {
  if (event.kind === 'reset') return RotateCcw;
  if (event.delta < 0) return ArrowDown;
  if (event.delta > 0) return ArrowUp;
  return SlidersHorizontal;
}

function eventNodeClass(event: ReputationEvent): string {
  if (event.delta < 0) return 'border-danger-200 bg-danger-50 text-danger-600';
  if (event.kind === 'reset') return 'border-brand-200 bg-brand-50 text-brand-600';
  return 'border-success-200 bg-success-50 text-success-600';
}

function isLockPenalty(penalty?: string | null): boolean {
  if (!penalty) return false;
  const p = penalty.toLowerCase();
  return p.includes('tạm khoá') || p.includes('tạm khóa') || p.includes('bị khoá') || p.includes('bị khóa');
}

function isUnlockPenalty(penalty?: string | null): boolean {
  if (!penalty) return false;
  const p = penalty.toLowerCase();
  return p.includes('gỡ tạm khoá') || p.includes('gỡ tạm khóa');
}

function actorLabel(event: ReputationEvent): string | null {
  if (event.actorName) return event.actorName;
  if (event.actorUserId) return 'Quản lý xử lý';
  if (event.kind === 'reset') return 'Hệ thống tự động';
  return null;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fh-drawer">
      <div
        v-if="account"
        class="fixed inset-0 z-50 flex justify-end bg-ink-950/45 backdrop-blur-[1px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reputation-history-title"
        @click.self="emit('close')"
        @keydown.esc="emit('close')"
      >
        <section
          class="fh-drawer-panel relative flex h-full w-full max-w-lg flex-col border-l border-ink-200 bg-white shadow-(--shadow-e3)"
          data-testid="reputation-history-drawer"
        >
          <!-- Fixed Header -->
          <header class="shrink-0 border-b border-ink-200/80 bg-ink-25/80 px-6 py-4">
            <div class="flex items-start justify-between gap-3">
              <div class="flex min-w-0 items-start gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-brand-50 text-brand-600">
                  <History :size="20" :stroke-width="1.75" aria-hidden="true" />
                </div>
                <div class="min-w-0">
                  <h2 id="reputation-history-title" class="text-base font-bold text-ink-900">
                    Lịch sử điểm
                  </h2>
                  <p class="mt-0.5 truncate text-sm font-semibold text-ink-800">
                    {{ account.fullName }}
                  </p>
                  <div class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-500">
                    <span class="inline-flex items-center gap-1">
                      <component :is="account.role === 'technician' ? Wrench : User" :size="12" aria-hidden="true" />
                      {{ ROLE_LABELS[account.role] }}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Điểm hiện tại:
                      <strong
                        class="font-num font-semibold"
                        :class="account.reputationPoints < REPUTATION_SUSPEND_THRESHOLD ? 'text-danger-700' : 'text-ink-900'"
                      >{{ account.reputationPoints }}</strong><span class="font-num text-ink-400">/100</span>
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                class="cursor-pointer rounded-[var(--radius-sm)] p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                aria-label="Đóng"
                @click="emit('close')"
              >
                <X :size="18" aria-hidden="true" />
              </button>
            </div>

            <div
              v-if="account.status === 'locked' || runningBan"
              class="mt-3 flex items-center gap-2 rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-800"
            >
              <Lock :size="14" class="shrink-0 text-danger-600" aria-hidden="true" />
              <span v-if="account.status === 'locked'">Tài khoản đang bị khoá do hết điểm uy tín.</span>
              <span v-else-if="runningBan">
                Đang tạm khoá đến <strong class="font-num">{{ vnDateTimeString(runningBan) }}</strong>
              </span>
            </div>
          </header>

          <!-- Scrollable Timeline Body -->
          <div class="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            <div v-if="loading" class="space-y-4" aria-busy="true">
              <FhSkeleton height="44px" :count="4" />
            </div>

            <div v-else-if="error" class="rounded-[var(--radius-sm)] border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800" role="alert">
              <p>{{ error }}</p>
              <button
                type="button"
                class="mt-2 cursor-pointer text-xs font-semibold text-danger-700 underline hover:text-danger-900"
                @click="emit('retry')"
              >
                Thử lại
              </button>
            </div>

            <div v-else-if="sortedEvents.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
              <div class="flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-400">
                <History :size="20" aria-hidden="true" />
              </div>
              <p class="mt-3 text-sm font-medium text-ink-700">Chưa có biến động điểm</p>
              <p class="mt-1 text-xs text-ink-500">Tài khoản chưa ghi nhận lần cộng, trừ hay làm mới điểm nào.</p>
            </div>

            <ol v-else class="relative space-y-6" data-testid="reputation-events">
              <li
                v-for="(event, idx) in sortedEvents"
                :key="event.id"
                class="relative flex gap-3.5"
              >
                <!-- Light gray vertical connector line -->
                <span
                  v-if="idx < sortedEvents.length - 1"
                  class="absolute left-[15px] top-8 bottom-[-24px] w-px bg-ink-200"
                  aria-hidden="true"
                />

                <!-- Timeline node icon -->
                <div
                  class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
                  :class="eventNodeClass(event)"
                >
                  <component :is="eventIcon(event)" :size="15" :stroke-width="2" aria-hidden="true" />
                </div>

                <!-- Event details (unboxed, clean typography) -->
                <div class="min-w-0 flex-1 pt-0.5">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span class="text-sm font-semibold text-ink-900">
                          {{ KIND_LABELS[event.kind] ?? 'Thay đổi điểm' }}
                        </span>
                        <span
                          v-if="event.kind === 'adjustment'"
                          class="inline-flex items-center gap-1 text-xs text-ink-500"
                        >
                          <SlidersHorizontal :size="11" aria-hidden="true" />
                          Thủ công
                        </span>
                      </div>
                      <p class="mt-0.5 font-num text-xs text-ink-500">
                        {{ vnDateTimeString(event.createdAt) }}
                      </p>
                    </div>

                    <div class="shrink-0 text-right">
                      <div
                        class="font-num text-sm font-bold"
                        :class="event.delta < 0 ? 'text-danger-700' : 'text-success-700'"
                      >
                        {{ signedDelta(event.delta) }}
                      </div>
                      <div class="whitespace-nowrap font-num text-xs text-ink-500">
                        còn {{ event.pointsAfter }}
                      </div>
                    </div>
                  </div>

                  <p class="mt-1.5 break-words text-sm text-ink-700">
                    {{ event.reason }}
                  </p>

                  <!-- Suspension / unlock outcome -->
                  <p
                    v-if="event.penalty"
                    class="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium"
                    :class="isLockPenalty(event.penalty) ? 'text-warning-700' : isUnlockPenalty(event.penalty) ? 'text-success-700' : 'text-ink-600'"
                  >
                    <Lock v-if="isLockPenalty(event.penalty)" :size="12" class="shrink-0" aria-hidden="true" />
                    <span>{{ event.penalty }}</span>
                  </p>

                  <!-- Order reference / actor metadata when supported -->
                  <div
                    v-if="event.orderCode || event.serviceOrderId || actorLabel(event)"
                    class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500"
                  >
                    <span v-if="event.orderCode" class="font-num">
                      Đơn hàng: <strong class="font-medium text-ink-700">#{{ event.orderCode }}</strong>
                    </span>
                    <span v-else-if="event.serviceOrderId" class="font-num" :title="event.serviceOrderId">
                      Mã đơn: <strong class="font-medium text-ink-700">{{ event.serviceOrderId.slice(0, 8) }}</strong>
                    </span>
                    <span v-if="actorLabel(event)">
                      Thực hiện: <strong class="font-medium text-ink-700">{{ actorLabel(event) }}</strong>
                    </span>
                  </div>
                </div>
              </li>
            </ol>
          </div>

          <!-- Fixed Footer -->
          <footer class="flex shrink-0 items-center justify-between gap-3 border-t border-ink-200/80 bg-ink-25/80 px-6 py-3.5">
            <FhButton
              v-if="canAdjust"
              variant="secondary"
              size="sm"
              @click="emit('adjust', account)"
            >
              <SlidersHorizontal :size="14" aria-hidden="true" />
              Điều chỉnh điểm
            </FhButton>
            <div v-else />
            <FhButton variant="secondary" size="sm" @click="emit('close')">Đóng</FhButton>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
