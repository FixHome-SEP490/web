<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { FhButton, FhSkeleton, FhStatusPill } from '../../components';
import ConsolePageHeader from '../../components/console/ConsolePageHeader.vue';
import ConsoleLoadError from '../../components/console/ConsoleLoadError.vue';
import SupportCaseContext from '../../components/console/SupportCaseContext.vue';
import { supportCasesApi, type SupportCaseDetail } from '../../api/support-cases.api';
import {
  formatSupportDate,
  isCashCase,
  supportCaseStatusLabels,
  supportCaseTypeLabels,
} from './support-cases.utils';

const route = useRoute();
const router = useRouter();
const caseId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''));
const supportCase = ref<SupportCaseDetail | null>(null);
const loading = ref(true);
const error = ref(false);
let latestRequest = 0;

async function loadCase(id: string) {
  const requestId = ++latestRequest;
  supportCase.value = null;
  loading.value = true;
  error.value = false;
  try {
    supportCase.value = await supportCasesApi.getCase(id);
  } catch {
    if (requestId !== latestRequest) return;
    error.value = true;
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
}

watch(caseId, (id) => {
  if (id) void loadCase(id);
  else loading.value = false;
}, { immediate: true });
</script>

<template>
  <!-- Đối soát tiền mặt, chỉ đọc: kết quả ghi ở trang chi tiết yêu cầu (có bước xác nhận). -->
  <div class="mx-auto max-w-5xl space-y-6 pb-12">
    <div v-if="loading" class="space-y-4" aria-busy="true">
      <FhSkeleton height="14px" width="140px" />
      <FhSkeleton height="28px" width="320px" />
      <FhSkeleton height="96px" :count="2" rounded="md" />
    </div>

    <template v-else-if="error">
      <ConsolePageHeader title="Đối soát tiền mặt" back-to="/console/support" back-label="Yêu cầu hỗ trợ" />
      <ConsoleLoadError @retry="loadCase(caseId)" />
    </template>

    <template v-else-if="supportCase">
      <ConsolePageHeader :title="supportCaseTypeLabels[supportCase.caseType]" back-to="/console/support" back-label="Yêu cầu hỗ trợ">
        <template #badges>
          <FhStatusPill :status="supportCase.status" :label="supportCaseStatusLabels[supportCase.status]" />
        </template>
        <template #meta>
          <p class="mt-2 max-w-3xl text-sm text-ink-700 text-pretty">{{ supportCase.reason }}</p>
          <p class="mt-1 whitespace-nowrap font-num text-sm text-ink-500">Tạo lúc {{ formatSupportDate(supportCase.createdAt) }}</p>
        </template>
        <template #actions>
          <FhButton size="sm" @click="router.push(`/console/support/${encodeURIComponent(supportCase.id)}`)">
            Xử lý yêu cầu
          </FhButton>
        </template>
      </ConsolePageHeader>

      <p
        v-if="!isCashCase(supportCase.caseType)"
        class="rounded-[var(--radius-sm)] border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800"
        role="status"
      >
        Yêu cầu này không phải tranh chấp tiền mặt.
      </p>

      <SupportCaseContext
        v-if="supportCase.serviceOrder || supportCase.invoice || supportCase.cashSettlement || supportCase.booking"
        :support-case="supportCase"
      />
      <p v-else class="text-sm text-ink-500">Chưa có thông tin đơn, hoá đơn hay tiền mặt.</p>
    </template>
  </div>
</template>
