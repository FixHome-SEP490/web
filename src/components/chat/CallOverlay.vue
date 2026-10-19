<script setup lang="ts">
// src/components/chat/CallOverlay.vue
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { Phone, PhoneOff, PhoneCall, Mic, MicOff, Wrench, UserCheck, Volume1, Volume2 } from 'lucide-vue-next';
import { useCallStore } from '../../stores/call.store';

/**
 * The call screen. It sits above everything because a ringing phone that can be
 * scrolled away from is a missed call, and it is rendered once at app level so
 * a call survives moving between pages.
 */
const callStore = useCallStore();

/** The other person's voice. Hidden: there is nothing to look at. */
const remoteAudio = ref<HTMLAudioElement | null>(null);

watch(
  () => callStore.remoteStream,
  async (stream) => {
    const element = remoteAudio.value;
    if (!element) return;
    element.srcObject = stream;
    if (!stream) return;
    try {
      await element.play();
    } catch {
      // The browser only blocks autoplay without a gesture, and getting here
      // always took a click on "Gọi" or "Trả lời". Nothing useful to do.
    }
  },
);

/**
 * "Loa to" / "Loa nhỏ" (PO 18/10/2026). A browser cannot switch a phone to its
 * earpiece, so on the web the switch is the volume of the other person's voice:
 * full, or quiet for a call held close in a quiet room. Each call starts loud.
 */
const QUIET_VOLUME = 0.35;
const loudSpeaker = ref(true);
const applyVolume = () => {
  if (remoteAudio.value) remoteAudio.value.volume = loudSpeaker.value ? 1 : QUIET_VOLUME;
};
watch(loudSpeaker, applyVolume);
watch(
  () => callStore.status,
  (status, previous) => {
    // Back to idle, or a new call starting from idle: loud again.
    if (status === 'idle' || previous === 'idle') loudSpeaker.value = true;
    applyVolume();
  },
);
watch(() => callStore.remoteStream, applyVolume);

/** Escape declines a ringing call, hangs up a live one, or closes the end screen. */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !callStore.isActive) return;
  if (callStore.status === 'ended') {
    callStore.dismissEnded();
  } else if (callStore.status === 'incoming') {
    void callStore.declineCall();
  } else {
    void callStore.hangUp();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <audio ref="remoteAudio" autoplay class="hidden" />

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="callStore.isActive"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/60 backdrop-blur-sm px-4"
        role="dialog"
        aria-modal="true"
        :aria-label="callStore.status === 'incoming' ? 'Cuộc gọi đến' : 'Cuộc gọi thoại'"
      >
        <div
          class="w-full max-w-xs bg-white rounded-lg shadow-e3 px-6 py-8 flex flex-col items-center text-center"
        >
          <!-- Who is on the line -->
          <div
            class="w-20 h-20 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-2xl font-bold overflow-hidden"
            :class="callStore.status === 'incoming' || callStore.status === 'ringing' ? 'animate-pulse ring-4 ring-brand-200' : callStore.status === 'ended' ? 'opacity-70' : ''"
          >
            <img
              v-if="callStore.peer?.avatarUrl"
              :src="callStore.peer.avatarUrl"
              :alt="callStore.peerName"
              class="w-full h-full object-cover"
            />
            <span v-else>{{ callStore.peerName.charAt(0) }}</span>
          </div>

          <h2 class="mt-4 text-lg font-bold text-ink-900">
            {{ callStore.peerName }}
          </h2>

          <p
            v-if="callStore.peerRoleLabel"
            class="mt-0.5 text-xs text-ink-500 font-medium flex items-center gap-1"
          >
            <Wrench v-if="callStore.peer?.role === 'TECHNICIAN'" :size="11" />
            <UserCheck v-else :size="11" />
            {{ callStore.peerRoleLabel }}
          </p>

          <p
            class="mt-3 text-sm"
            :class="[
              callStore.status === 'connected' ? 'font-num tabular-nums text-ink-600' : '',
              callStore.status === 'ended' && callStore.endInfo?.failed ? 'font-semibold text-danger-600' : 'text-ink-600',
              callStore.status === 'ended' && !callStore.endInfo?.failed ? 'font-semibold text-ink-900' : '',
            ]"
            aria-live="polite"
            data-testid="call-status"
          >
            {{ callStore.statusLabel }}
          </p>
          <p
            v-if="callStore.status === 'ended' && callStore.endInfo?.detail"
            class="mt-1 text-xs text-ink-500"
            data-testid="call-end-detail"
          >
            {{ callStore.endInfo.detail }}
          </p>

          <!-- Answer or decline -->
          <div
            v-if="callStore.status === 'incoming'"
            class="mt-8 flex items-center justify-center gap-10"
          >
            <button
              type="button"
              class="w-14 h-14 rounded-full bg-danger-600 text-white flex items-center justify-center hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-danger-600 focus:ring-offset-2"
              aria-label="Từ chối cuộc gọi"
              @click="callStore.declineCall()"
            >
              <PhoneOff :size="22" />
            </button>
            <button
              type="button"
              class="w-14 h-14 rounded-full bg-success-600 text-white flex items-center justify-center hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-success-600 focus:ring-offset-2"
              aria-label="Trả lời cuộc gọi"
              @click="callStore.acceptCall()"
            >
              <Phone :size="22" />
            </button>
          </div>

          <!-- After the call: call again, or close -->
          <div
            v-else-if="callStore.status === 'ended'"
            class="mt-8 flex items-center justify-center gap-3"
          >
            <button
              type="button"
              class="h-10 px-4 rounded-full bg-ink-100 text-ink-700 text-sm font-semibold hover:bg-ink-200 focus:outline-none focus:ring-2 focus:ring-ink-400 focus:ring-offset-2"
              data-testid="call-dismiss"
              @click="callStore.dismissEnded()"
            >
              Đóng
            </button>
            <button
              v-if="callStore.endInfo?.canRedial"
              type="button"
              class="h-10 px-4 rounded-full bg-success-600 text-white text-sm font-semibold flex items-center gap-2 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-success-600 focus:ring-offset-2"
              data-testid="call-redial"
              @click="callStore.redial()"
            >
              <PhoneCall :size="16" />
              Gọi lại
            </button>
          </div>

          <!-- Mute and hang up -->
          <div v-else class="mt-8 flex items-center justify-center gap-10">
            <button
              type="button"
              class="w-14 h-14 rounded-full flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-ink-400 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed"
              :class="
                callStore.isMuted
                  ? 'bg-ink-900 text-white'
                  : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
              "
              :disabled="!callStore.isInCall"
              :aria-pressed="callStore.isMuted"
              :aria-label="callStore.isMuted ? 'Bật micro' : 'Tắt micro'"
              @click="callStore.toggleMute()"
            >
              <component :is="callStore.isMuted ? MicOff : Mic" :size="22" />
            </button>
            <button
              type="button"
              class="w-14 h-14 rounded-full flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-ink-400 focus:ring-offset-2"
              :class="loudSpeaker ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'"
              :aria-pressed="loudSpeaker"
              :aria-label="loudSpeaker ? 'Đang bật loa to, bấm để chuyển loa nhỏ' : 'Đang bật loa nhỏ, bấm để chuyển loa to'"
              data-testid="call-speaker-toggle"
              @click="loudSpeaker = !loudSpeaker"
            >
              <component :is="loudSpeaker ? Volume2 : Volume1" :size="22" />
            </button>
            <button
              type="button"
              class="w-14 h-14 rounded-full bg-danger-600 text-white flex items-center justify-center hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-danger-600 focus:ring-offset-2"
              aria-label="Kết thúc cuộc gọi"
              @click="callStore.hangUp()"
            >
              <PhoneOff :size="22" />
            </button>
          </div>
          <p v-if="callStore.status !== 'ended' && callStore.status !== 'incoming'" class="mt-3 text-xs text-ink-500" data-testid="call-speaker-label">
            {{ loudSpeaker ? 'Loa to' : 'Loa nhỏ' }}
          </p>

          <p v-if="callStore.isMuted" class="mt-4 text-xs text-ink-500">
            Micro đang tắt
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
