import { computed, ref, watch, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { readRepairFailureSources } from '../api/failed-repair.api';

export type RepairFailureCheck = 'idle' | 'checking' | 'ordinary' | 'repair-failure' | 'error';
export type CustomerRebookAction = 'legacy' | 'repair-failure' | 'checking' | 'unavailable';

export function resolveCancelledRebookAction(status: string | null | undefined, check: RepairFailureCheck): CustomerRebookAction {
  const normalizedStatus = String(status ?? '').toUpperCase();
  if (normalizedStatus === 'COMPLETED') return 'legacy';
  if (normalizedStatus !== 'CANCELLED') return 'unavailable';
  if (check === 'repair-failure') return 'repair-failure';
  if (check === 'ordinary') return 'legacy';
  return check === 'checking' ? 'checking' : 'unavailable';
}

export function repairFailureWizardLocation(sourceBookingIds: string[]) {
  if (!sourceBookingIds.length || sourceBookingIds.some(id => !id.trim())
    || new Set(sourceBookingIds).size !== sourceBookingIds.length) {
    throw new Error('Repair-failure source bookings are invalid');
  }
  return { path: '/app/bookings/new', query: { repairFailure: sourceBookingIds.join(',') } };
}

/** Routes only from a server-verified failed-repair draft; unknown reads fail closed. */
export function useCustomerRebookRouting(
  bookingId: Ref<string | null | undefined>,
  status: Ref<string | null | undefined>,
  openLegacyDialog: () => void,
) {
  const router = useRouter();
  const check = ref<RepairFailureCheck>('idle');
  const sources = ref<string[]>([]);
  const retryCount = ref(0);
  let generation = 0;

  watch([bookingId, status, retryCount], async ([id, currentStatus]) => {
    const requestGeneration = ++generation;
    sources.value = [];
    if (!id || String(currentStatus ?? '').toUpperCase() !== 'CANCELLED') {
      check.value = 'idle';
      return;
    }
    check.value = 'checking';
    try {
      const result = await readRepairFailureSources(id);
      if (requestGeneration !== generation || id !== bookingId.value) return;
      if (result) {
        sources.value = result;
        check.value = 'repair-failure';
      } else {
        check.value = 'ordinary';
      }
    } catch {
      if (requestGeneration === generation && id === bookingId.value) check.value = 'error';
    }
  }, { immediate: true });

  const action = computed(() => resolveCancelledRebookAction(status.value, check.value));
  const open = () => {
    if (action.value === 'legacy') openLegacyDialog();
    else if (action.value === 'repair-failure') void router.push(repairFailureWizardLocation(sources.value));
  };
  const retry = () => { retryCount.value += 1; };
  return { action, check, retry, open };
}
