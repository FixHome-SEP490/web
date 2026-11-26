<script setup lang="ts">
// Bước 3 của đăng ký: giấy tờ nghề theo nhóm dịch vụ. Giấy tờ mới được giữ tạm ở đây; trang gửi sau khi đã lưu kỹ năng.
import { ref } from 'vue';
import FhButton from '../FhButton.vue';
import PaperUploadForm from './PaperUploadForm.vue';
import type { SentSkillEvidence, SkillEvidenceDetailsInput } from '../../api/technician-profile.api';
import { coveredByExistingCategories, paperTypeLabel } from './skill-papers';

export interface PendingPaper {
  file: File;
  details: SkillEvidenceDetailsInput;
  categoryIds: string[];
}

const props = defineProps<{ categories: { id: string; name: string }[]; sent: SentSkillEvidence[] }>();
const pending = defineModel<PendingPaper[]>({ required: true });

const adding = ref(false);
const chosen = ref<string[]>([]);
const problem = ref('');

const add = (file: File, details: SkillEvidenceDetailsInput) => {
  if (!chosen.value.length) {
    problem.value = 'Chọn ít nhất một nhóm dịch vụ.';
    return;
  }
  const held = [
    ...props.sent,
    ...pending.value.map((p) => ({ ...p.details, categories: p.categoryIds.map((id) => ({ id, name: '' })) })),
  ] as SentSkillEvidence[];
  if (coveredByExistingCategories(held, details, chosen.value)) {
    problem.value = 'Bạn đã nộp giấy tờ này cho các nhóm đã chọn (cùng loại, cùng số hiệu). Không cần tải lại.';
    return;
  }
  pending.value = [...pending.value, { file, details, categoryIds: chosen.value }];
  problem.value = '';
  chosen.value = [];
  adding.value = false;
};

const names = (ids: string[]) => props.categories.filter((c) => ids.includes(c.id)).map((c) => c.name).join(', ');
</script>

<template>
  <section class="space-y-3 border-t border-ink-100 pt-4" data-testid="onboarding-papers">
    <div>
      <h4 class="text-sm font-bold text-ink-900">Giấy tờ nghề <span class="font-normal text-ink-400">(không bắt buộc)</span></h4>
      <p class="mt-1 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800">
        Tải bản chụp bằng cấp, chứng chỉ để FixHome xác nhận cấp độ. Bản công chứng mang lên trụ sở khi hẹn gặp.
      </p>
    </div>

    <ul v-if="sent.length || pending.length" class="space-y-1.5 text-sm">
      <li v-for="p in sent" :key="p.documentId" class="px-3 py-2 rounded-xl border border-ink-200 bg-white" data-testid="onboarding-paper-sent">
        {{ paperTypeLabel(p.evidenceType, p.fileName) }}
        <span class="text-xs text-ink-500">· {{ p.categories.map((c) => c.name).join(', ') }} · Đã gửi</span>
      </li>
      <li v-for="(p, i) in pending" :key="i" class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-brand-200 bg-brand-50" data-testid="onboarding-paper-pending">
        <span>{{ paperTypeLabel(p.details.evidenceType) }} <span class="text-xs text-ink-500">· {{ names(p.categoryIds) }} · Sẽ gửi khi lưu bước này</span></span>
        <button type="button" class="text-xs font-semibold text-danger-700" @click="pending = pending.filter((_, j) => j !== i)">Bỏ</button>
      </li>
    </ul>

    <FhButton v-if="!adding" variant="secondary" size="md" :disabled="!categories.length" data-testid="onboarding-paper-add" @click="adding = true">Thêm giấy tờ</FhButton>
    <div v-else class="space-y-3 p-4 rounded-2xl border border-ink-200">
      <p class="font-medium text-ink-700 text-sm">Áp dụng cho nhóm dịch vụ</p>
      <label v-for="c in categories" :key="c.id" class="flex items-center gap-2 text-sm">
        <input v-model="chosen" type="checkbox" :value="c.id" /> {{ c.name }}
      </label>
      <PaperUploadForm submit-label="Thêm vào hồ sơ" @submit="add" @cancel="adding = false" />
      <p v-if="problem" role="alert" class="text-sm text-danger-700" data-testid="onboarding-paper-problem">{{ problem }}</p>
    </div>
  </section>
</template>
