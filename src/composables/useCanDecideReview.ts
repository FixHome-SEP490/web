import { computed } from 'vue';
import { useAuthStore } from '../stores/auth';

/** Onboarding and KYC decisions (approve, reject, mark a visit) are the Service Manager's; Admin only reads them. */
export function useCanDecideReview() {
  const auth = useAuthStore();
  return computed(() => auth.userRole === 'SERVICE_MANAGER');
}
