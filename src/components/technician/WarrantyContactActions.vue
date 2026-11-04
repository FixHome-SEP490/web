<script setup lang="ts">
import { computed, ref } from 'vue';
import { MessageSquare, Phone } from 'lucide-vue-next';
import type { StaffWarrantyClaim } from '../../api/warranty-claims.api';
import { ordersApi } from '../../api/orders.api';
import { useChatStore } from '../../stores/chat.store';

const props = defineProps<{ claim: StaffWarrantyClaim }>();
const chatStore = useChatStore();
const opening = ref(false);

// The customer can be reached only once the technician has taken the claim.
const accepted = computed(() => props.claim.status !== 'submitted');

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';
// Same height as the action buttons next to them, so the row stays on one line.
const action = `h-10 min-w-10 justify-center px-2.5 sm:px-3.5 rounded-xl border border-ink-200 bg-white hover:bg-ink-50 text-sm font-medium text-ink-700 inline-flex items-center gap-2 whitespace-nowrap transition-colors ${focusRing}`;

async function openChat() {
  if (opening.value) return;
  opening.value = true;
  try {
    // An older backend does not send the booking with the claim: read it from the order.
    const bookingId = props.claim.order.bookingId || (await ordersApi.getOrder(props.claim.order.id)).bookingId;
    if (!bookingId) return;
    await chatStore.openConversationForBooking(bookingId);
    chatStore.toggleWidget(true);
  } catch {
    // The conversation is a convenience; the claim page works without it.
  } finally {
    opening.value = false;
  }
}
</script>

<template>
  <div v-if="accepted" class="flex flex-wrap items-center gap-2">
    <button type="button" :class="action" :disabled="opening" aria-label="Nhắn tin" @click.stop="openChat">
      <MessageSquare :size="16" class="text-ink-500" aria-hidden="true" /><span class="hidden sm:inline">Nhắn tin</span>
    </button>
    <a v-if="claim.order.customerPhone" :href="`tel:${claim.order.customerPhone}`" :class="action" aria-label="Gọi điện" @click.stop>
      <Phone :size="16" class="text-ink-500" aria-hidden="true" /><span class="hidden sm:inline">Gọi điện</span>
    </a>
  </div>
</template>
