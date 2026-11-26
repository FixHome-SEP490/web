<script setup lang="ts">
// Form tải một giấy tờ mới: chọn tệp, loại và các chi tiết hợp loại. Kiểm tại chỗ rồi báo lên; việc gửi lên máy chủ do nơi dùng làm.
import { computed, ref } from 'vue';
import FhButton from '../FhButton.vue';
import {
  PAPER_ACCEPT,
  PAPER_TYPES,
  emptyPaperForm,
  paperDetails,
  paperFields,
  paperFileProblem,
  paperFormProblem,
  paperTypeLabel,
} from './skill-papers';
import type { SkillEvidenceDetailsInput } from '../../api/technician-profile.api';

defineProps<{ busy?: boolean; submitLabel?: string }>();
const emit = defineEmits<{ (e: 'submit', file: File, details: SkillEvidenceDetailsInput): void; (e: 'cancel'): void }>();

const form = ref(emptyPaperForm());
const file = ref<File | null>(null);
const problem = ref('');
const fields = computed(() => paperFields(form.value.evidenceType));

const onFile = (event: Event) => {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
  problem.value = '';
};

const submit = () => {
  const details = paperDetails(form.value);
  const found = (file.value ? paperFileProblem(file.value) : 'Chọn tệp giấy tờ.') ?? paperFormProblem(form.value);
  if (found || !file.value || !details) {
    problem.value = found ?? 'Chọn tệp giấy tờ.';
    return;
  }
  problem.value = '';
  emit('submit', file.value, details);
};

const input = 'w-full h-11 px-3 bg-white border border-ink-200 rounded-xl focus:outline-none focus:border-brand-600';
</script>

<template>
  <form class="space-y-3 text-sm" data-testid="paper-form" @submit.prevent="submit">
    <div>
      <label class="block font-medium text-ink-700 mb-1">Loại giấy tờ</label>
      <select v-model="form.evidenceType" :class="input" data-testid="paper-type">
        <option :value="null" disabled>Chọn loại giấy tờ</option>
        <option v-for="t in PAPER_TYPES" :key="t" :value="t">{{ paperTypeLabel(t) }}</option>
      </select>
    </div>
    <div v-if="fields.includes('issuer')">
      <label class="block font-medium text-ink-700 mb-1">Cơ quan cấp / xác nhận</label>
      <input v-model="form.issuer" type="text" maxlength="200" :class="input" data-testid="paper-issuer" />
    </div>
    <div v-if="fields.includes('referenceNumber')">
      <label class="block font-medium text-ink-700 mb-1">Số hiệu</label>
      <input v-model="form.referenceNumber" type="text" maxlength="100" :class="input" data-testid="paper-number" />
    </div>
    <div v-if="fields.includes('issuedAt') || fields.includes('expiresAt')" class="grid grid-cols-2 gap-3">
      <div v-if="fields.includes('issuedAt')">
        <label class="block font-medium text-ink-700 mb-1">Ngày cấp</label>
        <input v-model="form.issuedAt" type="date" :class="input" data-testid="paper-issued" />
      </div>
      <div v-if="fields.includes('expiresAt')">
        <label class="block font-medium text-ink-700 mb-1">Ngày hết hạn</label>
        <input v-model="form.expiresAt" type="date" :class="input" data-testid="paper-expires" />
      </div>
    </div>
    <div v-if="fields.includes('claimedYears')">
      <label class="block font-medium text-ink-700 mb-1">Số năm kinh nghiệm</label>
      <input v-model="form.claimedYears" type="number" inputmode="numeric" min="0" max="60" :class="input" data-testid="paper-years" />
    </div>
    <div>
      <label class="block font-medium text-ink-700 mb-1">Tệp giấy tờ (ảnh JPG, PNG, WebP hoặc PDF, tối đa 10 MB)</label>
      <input type="file" :accept="PAPER_ACCEPT" class="block w-full text-sm" data-testid="paper-file" @change="onFile" />
    </div>
    <p v-if="problem" role="alert" class="text-danger-700" data-testid="paper-problem">{{ problem }}</p>
    <div class="flex gap-2">
      <FhButton type="submit" size="md" :loading="busy" data-testid="paper-submit">{{ submitLabel ?? 'Tải lên' }}</FhButton>
      <FhButton variant="ghost" size="md" :disabled="busy" @click="emit('cancel')">Hủy</FhButton>
    </div>
  </form>
</template>
