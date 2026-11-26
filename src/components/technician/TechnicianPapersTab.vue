<script setup lang="ts">
// Tab "Giấy tờ": mọi giấy tờ thợ đã nộp theo trạng thái, thêm giấy tờ cho các nhóm dịch vụ, xóa, gửi lại các kỹ năng bị từ chối.
import { computed, onMounted, ref } from 'vue';
import FhButton from '../FhButton.vue';
import EvidenceDetailDialog from './EvidenceDetailDialog.vue';
import PaperUploadForm from './PaperUploadForm.vue';
import { technicianProfileApi, type SentSkillEvidence, type SkillEvidenceDetailsInput } from '../../api/technician-profile.api';
import { catalogApi, type ServiceCategory } from '../../api/catalog.api';
import { userFacingError } from '../../utils/user-facing-error';
import { PAPER_GROUP_TITLE, PAPER_STATUS, coveredByExistingCategories, groupPapersByStatus, paperFacts, paperStatusOf, paperTypeLabel } from './skill-papers';

const papers = ref<SentSkillEvidence[]>([]);
const categories = ref<ServiceCategory[]>([]);
const rejectedServiceIds = ref<string[]>([]);
const loading = ref(true);
const adding = ref(false);
const chosen = ref<string[]>([]);
const busy = ref(false);
const notice = ref<{ text: string; error: boolean } | null>(null);
const open = ref<SentSkillEvidence | null>(null);

const groups = computed(() => groupPapersByStatus(papers.value));
const title = (p: SentSkillEvidence) => paperTypeLabel(p.evidenceType, p.fileName);

const load = async () => {
  try {
    const [sent, cats, offerings] = await Promise.all([
      technicianProfileApi.getMySkillEvidence(),
      catalogApi.getCategories().catch(() => []),
      technicianProfileApi.getMyServices(),
    ]);
    papers.value = sent;
    categories.value = cats;
    rejectedServiceIds.value = offerings.filter((o) => o.isActive && o.verificationStatus === 'rejected').map((o) => o.serviceId);
  } catch {
    notice.value = { text: 'Chưa tải được giấy tờ. Vui lòng thử lại.', error: true };
  } finally {
    loading.value = false;
  }
};
onMounted(load);

const run = async (fn: () => Promise<string>, fail: string) => {
  busy.value = true;
  notice.value = null;
  try {
    notice.value = { text: await fn(), error: false };
    adding.value = false;
    chosen.value = [];
    await load();
  } catch (err) {
    notice.value = { text: userFacingError(err, fail), error: true };
  } finally {
    busy.value = false;
  }
};

const upload = (file: File, details: SkillEvidenceDetailsInput) => {
  if (!chosen.value.length) {
    notice.value = { text: 'Chọn ít nhất một nhóm dịch vụ.', error: true };
    return;
  }
  if (coveredByExistingCategories(papers.value, details, chosen.value)) {
    notice.value = { text: 'Bạn đã nộp giấy tờ này cho các nhóm đã chọn (cùng loại, cùng số hiệu). Không cần tải lại.', error: true };
    return;
  }
  return run(async () => {
    const { storageObjectPath, uploadUrl } = await technicianProfileApi.requestCategoryEvidenceUploadUrl(file.type);
    await technicianProfileApi.uploadSkillEvidenceFile(uploadUrl, file.type, file);
    const { attachedSkills } = await technicianProfileApi.attachCategoryEvidence(chosen.value, { storageObjectPath, fileName: file.name, fileSize: file.size, mimeType: file.type, ...details });
    return `Đã gắn giấy tờ cho ${attachedSkills} kỹ năng.`;
  }, 'Không thể gửi giấy tờ. Vui lòng thử lại.');
};

const resubmitAll = () =>
  run(async () => {
    for (const id of rejectedServiceIds.value) await technicianProfileApi.resubmitSkill(id);
    return 'Đã gửi lại. FixHome sẽ xem xét.';
  }, 'Không thể gửi lại. Vui lòng thử lại.');

const remove = () => {
  const doc = open.value;
  if (!doc) return;
  open.value = null;
  return run(async () => {
    await technicianProfileApi.deleteSkillEvidence(doc.documentId);
    return 'Đã xóa giấy tờ.';
  }, 'Không thể xóa giấy tờ. Vui lòng thử lại.');
};
</script>

<template>
  <div class="space-y-5" data-testid="papers-tab">
    <p v-if="notice" :role="notice.error ? 'alert' : 'status'" class="text-sm" :class="notice.error ? 'text-danger-700' : 'text-success-700'" data-testid="papers-notice">{{ notice.text }}</p>

    <div class="flex flex-wrap gap-2">
      <FhButton v-if="!adding" variant="secondary" size="md" data-testid="papers-add" @click="adding = true">Thêm giấy tờ</FhButton>
      <FhButton v-if="rejectedServiceIds.length" size="md" :loading="busy" data-testid="papers-resubmit" @click="resubmitAll">Gửi lại các kỹ năng bị từ chối</FhButton>
    </div>

    <div v-if="adding" class="p-4 rounded-2xl bg-white border border-ink-200/80 space-y-3" data-testid="papers-add-panel">
      <p class="font-medium text-ink-700 text-sm">Áp dụng cho nhóm dịch vụ</p>
      <label v-for="c in categories" :key="c.id" class="flex items-center gap-2 text-sm">
        <input v-model="chosen" type="checkbox" :value="c.id" :data-testid="`papers-cat-${c.id}`" />
        {{ c.name }}
      </label>
      <PaperUploadForm :busy="busy" @submit="upload" @cancel="adding = false" />
    </div>

    <p v-if="loading" class="text-sm text-ink-500" aria-busy="true">Đang tải…</p>
    <p v-else-if="!groups.length" class="text-sm text-ink-500">Bạn chưa nộp giấy tờ nào.</p>
    <section v-for="g in groups" :key="g.status" class="space-y-2" :data-testid="`papers-group-${g.status}`">
      <h3 class="text-sm font-semibold text-ink-700">{{ PAPER_GROUP_TITLE[g.status] }}</h3>
      <ul class="space-y-1.5">
        <li v-for="p in g.items" :key="p.documentId">
          <button type="button" class="w-full text-left px-3 py-2.5 rounded-xl border border-ink-200 bg-white hover:bg-ink-50" :data-testid="`paper-${p.documentId}`" @click="open = p">
            <span class="block font-medium text-ink-900 text-sm truncate">{{ title(p) }}</span>
            <span class="block text-xs text-ink-500 truncate">{{ p.categories.map((c) => c.name).join(', ') || p.fileName }}</span>
          </button>
        </li>
      </ul>
    </section>

    <EvidenceDetailDialog
      :open="!!open"
      :title="open ? title(open) : ''"
      :photo="open ? { serviceId: open.serviceId, documentId: open.documentId, mimeType: open.mimeType } : null"
      :facts="open ? paperFacts(open) : []"
      :status="open ? PAPER_STATUS[paperStatusOf(open)] : null"
      :reason="open?.rejectionReason"
      :categories="open?.categories.map((c) => c.name)"
      :can-delete="!!open && !PAPER_STATUS[paperStatusOf(open)].lock"
      :deleting="busy"
      @close="open = null"
      @delete="remove"
    />
  </div>
</template>
