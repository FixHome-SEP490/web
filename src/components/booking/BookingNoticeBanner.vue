<script setup lang="ts">
import { computed } from 'vue';
import { AlertTriangle, AlertCircle, CheckCircle2, Info, ArrowRight, X } from 'lucide-vue-next';

export type BannerVariant = 'warning' | 'error' | 'success' | 'info';

export interface BannerAction {
  label: string;
  onClick?: () => void;
  to?: string;
}

const props = withDefaults(
  defineProps<{
    variant?: BannerVariant;
    title: string;
    description?: string;
    primaryCta?: BannerAction;
    secondaryCta?: BannerAction;
    dismissible?: boolean;
    dataTestid?: string;
  }>(),
  {
    variant: 'warning',
    description: '',
    primaryCta: undefined,
    secondaryCta: undefined,
    dismissible: false,
    dataTestid: 'booking-notice-banner',
  },
);

const emit = defineEmits<{
  (e: 'dismiss'): void;
}>();

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'error':
      return {
        card: 'border border-danger-200 bg-danger-50 text-danger-900',
        iconBg: 'bg-danger-100 text-danger-600',
        divider: 'bg-danger-200',
        title: 'text-danger-900',
        description: 'text-danger-800',
        primaryBtn: 'bg-danger-600 hover:bg-danger-700 text-white',
        secondaryBtn: 'text-brand-600 hover:text-brand-700',
      };
    case 'success':
      return {
        card: 'border border-success-200 bg-success-50 text-success-900',
        iconBg: 'bg-success-100 text-success-600',
        divider: 'bg-success-200',
        title: 'text-success-900',
        description: 'text-success-800',
        primaryBtn: 'bg-success-600 hover:bg-success-700 text-white',
        secondaryBtn: 'text-brand-600 hover:text-brand-700',
      };
    case 'info':
      return {
        card: 'border border-brand-200 bg-info-50 text-brand-900',
        iconBg: 'bg-brand-100 text-info-600',
        divider: 'bg-brand-200',
        title: 'text-brand-900',
        description: 'text-brand-800',
        primaryBtn: 'bg-brand-600 hover:bg-brand-700 text-white',
        secondaryBtn: 'text-brand-600 hover:text-brand-700',
      };
    case 'warning':
    default:
      return {
        card: 'border border-[#FED7AA] bg-[#FFF9F2] text-stone-900',
        iconBg: 'bg-[#FFEDD5] text-[#EA580C]',
        divider: 'bg-[#FED7AA]',
        title: 'text-[#431407]',
        description: 'text-[#78350F]',
        primaryBtn: 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-xs',
        secondaryBtn: 'text-brand-600 hover:text-brand-700',
      };
  }
});

function handlePrimaryClick() {
  if (props.primaryCta?.onClick) {
    props.primaryCta.onClick();
  }
}

function handleSecondaryClick() {
  if (props.secondaryCta?.onClick) {
    props.secondaryCta.onClick();
  }
}
</script>

<template>
  <div
    role="alert"
    :data-testid="dataTestid"
    class="relative w-full rounded-2xl p-4 sm:p-5 shadow-xs transition-all duration-200"
    :class="variantClasses.card"
  >
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <!-- Left side: Icon + Divider + Text -->
      <div class="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
        <!-- Icon Badge -->
        <div
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          :class="variantClasses.iconBg"
          aria-hidden="true"
        >
          <slot name="icon">
            <AlertTriangle v-if="variant === 'warning'" :size="24" class="stroke-[2.2]" />
            <AlertCircle v-else-if="variant === 'error'" :size="24" class="stroke-[2.2]" />
            <CheckCircle2 v-else-if="variant === 'success'" :size="24" class="stroke-[2.2]" />
            <Info v-else :size="24" class="stroke-[2.2]" />
          </slot>
        </div>

        <!-- Vertical Divider (Desktop) -->
        <div
          class="hidden sm:block h-11 w-px shrink-0"
          :class="variantClasses.divider"
          aria-hidden="true"
        />

        <!-- Title & Description -->
        <div class="min-w-0 flex-1 space-y-1">
          <h3
            class="text-base sm:text-[17px] font-bold leading-snug tracking-tight text-pretty"
            :class="variantClasses.title"
            data-testid="banner-title"
          >
            {{ title }}
          </h3>
          <p
            v-if="description"
            class="text-xs sm:text-sm leading-relaxed text-pretty"
            :class="variantClasses.description"
            data-testid="banner-description"
          >
            {{ description }}
          </p>
          <slot />
        </div>
      </div>

      <!-- Right side: Actions -->
      <div
        v-if="primaryCta || secondaryCta || dismissible"
        class="flex flex-wrap items-center justify-end sm:justify-start gap-3 sm:gap-4 shrink-0 pt-1 sm:pt-0"
      >
        <!-- Secondary CTA ("Để sau") -->
        <template v-if="secondaryCta">
          <router-link
            v-if="secondaryCta.to"
            :to="secondaryCta.to"
            class="inline-flex min-h-10 items-center text-xs sm:text-sm font-semibold underline underline-offset-2 transition-colors cursor-pointer"
            :class="variantClasses.secondaryBtn"
            data-testid="banner-secondary-cta"
            @click="handleSecondaryClick"
          >
            {{ secondaryCta.label }}
          </router-link>
          <button
            v-else
            type="button"
            class="inline-flex min-h-10 items-center text-xs sm:text-sm font-semibold underline underline-offset-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg px-1"
            :class="variantClasses.secondaryBtn"
            data-testid="banner-secondary-cta"
            @click="handleSecondaryClick"
          >
            {{ secondaryCta.label }}
          </button>
        </template>

        <!-- Primary CTA ("Xem yêu cầu đang chờ →") -->
        <template v-if="primaryCta">
          <router-link
            v-if="primaryCta.to"
            :to="primaryCta.to"
            class="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] cursor-pointer"
            :class="variantClasses.primaryBtn"
            data-testid="banner-primary-cta"
            @click="handlePrimaryClick"
          >
            <span>{{ primaryCta.label }}</span>
            <ArrowRight :size="16" aria-hidden="true" />
          </router-link>
          <button
            v-else
            type="button"
            class="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            :class="variantClasses.primaryBtn"
            data-testid="banner-primary-cta"
            @click="handlePrimaryClick"
          >
            <span>{{ primaryCta.label }}</span>
            <ArrowRight :size="16" aria-hidden="true" />
          </button>
        </template>

        <!-- Close / Dismiss Icon Button -->
        <button
          v-if="dismissible"
          type="button"
          class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-black/5 hover:text-ink-800 transition-colors"
          aria-label="Đóng thông báo"
          data-testid="banner-dismiss"
          @click="emit('dismiss')"
        >
          <X :size="18" />
        </button>
      </div>
    </div>
  </div>
</template>
