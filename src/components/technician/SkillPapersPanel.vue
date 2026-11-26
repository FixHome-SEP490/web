<script setup lang="ts">
// Giấy tờ của một kỹ năng trong tab Dịch vụ: lý do bị từ chối, giấy tờ đã có (bấm xem chi tiết), thêm bằng giấy tờ đã up hoặc tải mới, gửi lại xét duyệt.
import { computed, onMounted, ref } from 'vue';
import FhButton from '../FhButton.vue';
import EvidenceDetailDialog from './EvidenceDetailDialog.vue';
import PaperUploadForm from './PaperUploadForm.vue';
import { technicianProfileApi, type SentSkillEvidence, type SkillEvidenceDetailsInput } from '../../api/technician-profile.api';
import { userFacingError } from '../../utils/user-facing-error';
import { PAPER_STATUS, coveredByExisting, paperFacts, paperStatusOf, paperTypeLabel } from './skill-papers';

const props = defineProps<{ serviceId: string; status: string }>();
const emit = defineEmits<{ (e: 'changed'): void }>();

const papers = ref<SentSkillEvidence[]>([]);
const reason = ref<string | null>(null);
const mode = ref<'none' | 'choose' | 'new'>('none');
const picked = ref<string[]>([]);
const busy = ref(false);
const notice = ref<{ text: string; error: boolean } | null>(null);
const open = ref<SentSkillEvidence | null>(null);

const holds = (p: SentSkillEvidence) => (p.serviceIds ? p.serviceIds.includes(props.serviceId) : p.serviceId === props.serviceId);
const held = computed(() => papers.value.filter(holds));
const others = computed(() => papers.value.filter((p) => !holds(p)));
const verified = computed(() => props.status === 'verified');
const rejected = computed(() => props.status === 'rejected');
const title = (p: SentSkillEvidence) => paperTypeLabel(p.evidenceType, p.fileName);

const load = async () => {
  try {
    papers.value = await technicianProfileApi.getMySkillEvidence();
    if (rejected.value) {
      reason.value = (await technicianProfileApi.getSkillVerification(props.serviceId).catch(() => null))?.rejectionReason ?? 'Không có lý do chi tiết từ FixHome';
    }
  } catch {
    notice.value = { text: 'Chưa tải được giấy tờ. Vui lòng thử lại.', error: true };
  }
};
onMounted(load);

const run = async (fn: () => Promise<string>, fail: string) => {
  busy.value = true;
  notice.value = null;
  try {
    notice.value = { text: await fn(), error: false };
    mode.value = 'none';
    picked.value = [];
    await load();
    emit('changed');
  } catch (err) {
    notice.value = { text: userFacingError(err, fail), error: true };
  } finally {
    busy.value = false;
  }
};

const addPicked = () =>
  run(async () => {
    const { attached, skipped } = await technicianProfileApi.reuseSkillEvidence(props.serviceId, picked.value);
    const note = skipped ? ` ${skipped} giấy tờ đã có ở kỹ năng này nên được bỏ qua.` : '';
    return (rejected.value ? 'Đã thêm giấy tờ. Bấm "Gửi lại" để xét duyệt khi bạn sẵn sàng.' : `Đã thêm ${attached} giấy tờ.`) + note;
  }, 'Không thể thêm giấy tờ. Vui lòng thử lại.');

const upload = (file: File, details: SkillEvidenceDetailsInput) => {
  if (coveredByExisting(papers.value, details, [props.serviceId])) {
    notice.value = { text: 'Bạn đã có giấy tờ này ở kỹ năng này. Hãy chọn từ giấy tờ đã up thay vì tải lại.', error: true };
    return;
  }
  return run(async () => {
    const { storageObjectPath, uploadUrl } = await technicianProfileApi.requestSkillEvidenceUploadUrl(props.serviceId, file.type);
    await technicianProfileApi.uploadSkillEvidenceFile(uploadUrl, file.type, file);
    await technicianProfileApi.attachSkillEvidence(props.serviceId, { storageObjectPath, fileName: file.name, fileSize: file.size, mimeType: file.type, ...details });
    return rejected.value ? 'Đã thêm giấy tờ. Bấm "Gửi lại" để xét duyệt khi bạn sẵn sàng.' : 'Đã gửi giấy tờ. FixHome sẽ xem xét.';
  }, 'Không thể gửi giấy tờ. Vui lòng thử lại.');
};

const resubmit = () =>
  run(async () => {
    await technicianProfileApi.resubmitSkill(props.serviceId);
    return 'Đã gửi lại. FixHome sẽ xem xét.';
  }, 'Không thể gửi lại. Vui lòng thử lại.');

const remove = () => {
  const doc = open.value;
  if (!doc) return;
  open.value = null;
  return run(async () => {
    await technicianProfileApi.deleteSkillEvidenceFromSkill(props.serviceId, doc.documentId);
    return 'Đã xóa giấy tờ khỏi kỹ năng này.';
  }, 'Không thể xóa giấy tờ. Vui lòng thử lại.');
};
</script>

<template>
  <div class="space-y-3 text-sm" data-testid="skill-papers">
    <p v-if="rejected" class="text-danger-700 text-pretty" data-testid="skill-papers-reason">Lý do từ chối: {{ reason ?? '…' }}</p>

    <ul v-if="held.length" class="space-y-1.5">
      <li v-for="p in held" :key="p.documentId">
        <button type="button" class="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-ink-200 bg-white text-left hover:bg-ink-50" :data-testid="`skill-paper-${p.documentId}`" @click="open = p">
          <span class="font-medium text-ink-900 truncate">{{ title(p) }}</span>
          <span class="text-xs text-ink-500 whitespace-nowrap">{{ PAPER_STATUS[paperStatusOf(p)].label }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="text-ink-500">Chưa có giấy tờ nào cho kỹ năng này.</p>

    <p v-if="notice" :role="notice.error ? 'alert' : 'status'" :class="notice.error ? 'text-danger-700' : 'text-success-700'" data-testid="skill-papers-notice">{{ notice.text }}</p>

    <template v-if="!verified">
      <div v-if="mode === 'none'" class="flex flex-wrap gap-2">
        <FhButton variant="secondary" size="sm" :disabled="busy" data-testid="skill-papers-add" @click="mode = others.length ? 'choose' : 'new'">Thêm giấy tờ</FhButton>
        <FhButton v-if="rejected" size="sm" :loading="busy" data-testid="skill-papers-resubmit" @click="resubmit">Gửi lại để xét duyệt</FhButton>
      </div>

      <div v-else-if="mode === 'choose'" class="space-y-2" data-testid="skill-papers-choose">
        <p class="font-medium text-ink-700">Chọn giấy tờ đã up</p>
        <label v-for="p in others" :key="p.documentId" class="flex items-center gap-2 px-3 py-2 rounded-xl border border-ink-200 bg-white">
          <input v-model="picked" type="checkbox" :value="p.documentId" :data-testid="`skill-papers-choice-${p.documentId}`" />
          <span class="truncate">{{ title(p) }}<template v-if="p.referenceNumber"> · {{ p.referenceNumber }}</template></span>
        </label>
        <div class="flex flex-wrap gap-2">
          <FhButton size="sm" :disabled="!picked.length" :loading="busy" data-testid="skill-papers-choose-add" @click="addPicked">Thêm giấy tờ đã chọn</FhButton>
          <FhButton variant="secondary" size="sm" :disabled="busy" data-testid="skill-papers-choose-new" @click="mode = 'new'">Tải giấy tờ mới</FhButton>
          <FhButton variant="ghost" size="sm" :disabled="busy" @click="mode = 'none'">Hủy</FhButton>
        </div>
      </div>

      <PaperUploadForm v-else :busy="busy" @submit="upload" @cancel="mode = 'none'" />
    </template>

    <EvidenceDetailDialog
      :open="!!open"
      :title="open ? title(open) : ''"
      :photo="open ? { serviceId, documentId: open.documentId, mimeType: open.mimeType } : null"
      :facts="open ? paperFacts(open) : []"
      :status="open ? PAPER_STATUS[paperStatusOf(open)] : null"
      :reason="open?.rejectionReason"
      :categories="open?.categories.map((c) => c.name)"
      :can-delete="!!open && !PAPER_STATUS[paperStatusOf(open)].lock && !verified"
      :deleting="busy"
      @close="open = null"
      @delete="remove"
    />
  </div>
</template>
