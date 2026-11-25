<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-vue-next';
import { SKILL_EVIDENCE_TYPE_LABEL } from '../../api/admin-skill-verifications.api';
import type { ProfileReviewEvidence, ProfileReviewSkill } from '../../api/admin-office-visits.api';
import { consoleField } from './console-ui';
import { skillLevelLabel } from './console-labels';
import { evidenceRows } from './skill-evidence-rows';

const SKILL_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'];

interface SkillDecisionState {
  level: string;
  approved: boolean;
  reason: string;
}

const MIN_REASON = 5;

const props = defineProps<{
  skills: ProfileReviewSkill[];
  evidence: ProfileReviewEvidence[];
  decisions: Record<string, SkillDecisionState>;
  /** Admin only reads the review; the service manager decides. */
  readonly?: boolean;
  /** After a failed approval: mark the reasons still missing and open the groups that need them. */
  showReasonErrors?: boolean;
}>();

const emit = defineEmits<{
  (e: 'change', ids: string[], patch: Partial<SkillDecisionState>): void;
  /** The page shows the paper in its own viewer. */
  (e: 'preview', item: ProfileReviewEvidence): void;
}>();

// Skills folded by service category, in the order the backend sent them.
const groups = computed(() => {
  const byName = new Map<string, ProfileReviewSkill[]>();
  for (const skill of props.skills) byName.set(skill.categoryName, [...(byName.get(skill.categoryName) ?? []), skill]);
  return [...byName].map(([name, skills]) => {
    const ids = skills.map((s) => s.id);
    return { name, skills, ids, evidence: props.evidence.filter((e) => e.skillIds.some((id) => ids.includes(id))) };
  });
});

const approvedIn = (ids: string[]) => ids.filter((id) => props.decisions[id]?.approved).length;
const totalApproved = computed(() => approvedIn(props.skills.map((s) => s.id)));
const allApproved = computed(() => props.skills.length > 0 && totalApproved.value === props.skills.length);

/** The level every skill of the group shares, or '' when they differ. */
const sharedLevel = (ids: string[]) => {
  const levels = new Set(ids.map((id) => props.decisions[id]?.level));
  return levels.size === 1 ? [...levels][0] : '';
};

// A skill left unconfirmed needs a reason the technician can read.
const needsReason = (id: string) => !props.decisions[id]?.approved && (props.decisions[id]?.reason ?? '').trim().length < MIN_REASON;
const unapprovedIn = (ids: string[]) => ids.filter((id) => !props.decisions[id]?.approved);
const reasonMissingIn = (ids: string[]) => ids.some(needsReason);

const open = ref<string[]>([]);
const isOpen = (name: string, ids: string[]) => open.value.includes(name) || (!!props.showReasonErrors && reasonMissingIn(ids));
const toggle = (name: string) => {
  open.value = open.value.includes(name) ? open.value.filter((x) => x !== name) : [...open.value, name];
};

// A paper is named by its type; the full list above adds the issuer.
const paperType = (item: ProfileReviewEvidence) =>
  item.evidenceType ? (SKILL_EVIDENCE_TYPE_LABEL[item.evidenceType] ?? item.evidenceType) : item.fileName;
const paperTitle = (item: ProfileReviewEvidence) => [paperType(item), item.issuer].filter(Boolean).join(' · ');

const coveredGroups = (item: ProfileReviewEvidence) => groups.value.filter((g) => g.evidence.includes(item)).map((g) => g.name);

const detailOpen = ref<string[]>([]);
const toggleDetail = (id: string) => {
  detailOpen.value = detailOpen.value.includes(id) ? detailOpen.value.filter((x) => x !== id) : [...detailOpen.value, id];
};

const onLevel = (ids: string[], event: Event) => emit('change', ids, { level: (event.target as HTMLSelectElement).value });
const onReason = (ids: string[], event: Event) => emit('change', ids, { reason: (event.target as HTMLInputElement).value });
const onApproved = (ids: string[], event: Event) => emit('change', ids, { approved: (event.target as HTMLInputElement).checked });
</script>

<template>
  <div class="space-y-3" data-testid="profile-skill-groups">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-ink-700" aria-live="polite">
        Đã xác nhận <span class="font-num font-semibold">{{ totalApproved }}/{{ skills.length }}</span> kỹ năng trong
        <span class="font-num font-semibold">{{ groups.length }}</span> nhóm
      </p>
      <button
        v-if="!readonly && skills.length > 0"
        type="button"
        class="cursor-pointer text-sm font-semibold text-brand-700 hover:underline"
        data-testid="skills-approve-all"
        @click="emit('change', skills.map((s) => s.id), { approved: !allApproved })"
      >
        {{ allApproved ? 'Bỏ chọn tất cả' : 'Xác nhận tất cả' }}
      </button>
    </div>

    <section v-if="evidence.length > 0" class="space-y-2 rounded-[var(--radius-md)] border border-ink-200 bg-ink-25/50 p-3" data-testid="profile-papers">
      <h5 class="text-xs font-semibold uppercase tracking-wide text-ink-500">Giấy tờ thợ nộp ({{ evidence.length }})</h5>
      <div v-for="item in evidence" :key="item.documentId" class="rounded-[var(--radius-sm)] border border-ink-100 bg-white px-3 py-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="text-sm font-medium text-ink-900">{{ paperTitle(item) }}</div>
            <div class="text-xs text-ink-500">Áp dụng cho: {{ coveredGroups(item).join(', ') }}</div>
          </div>
          <div class="flex shrink-0 items-center gap-3 text-xs font-semibold text-brand-700">
            <button type="button" class="cursor-pointer hover:underline" :aria-expanded="detailOpen.includes(item.documentId)" @click="toggleDetail(item.documentId)">
              {{ detailOpen.includes(item.documentId) ? 'Ẩn chi tiết' : 'Chi tiết' }}
            </button>
            <button type="button" class="inline-flex cursor-pointer items-center gap-1 hover:underline" data-testid="evidence-view" @click="emit('preview', item)">
              <ExternalLink :size="13" aria-hidden="true" /> Xem giấy tờ
            </button>
          </div>
        </div>
        <dl v-if="detailOpen.includes(item.documentId)" class="mt-1 divide-y divide-ink-100 text-xs">
          <div v-for="[label, value] in evidenceRows(item)" :key="label" class="flex justify-between gap-3 py-1.5">
            <dt class="shrink-0 text-ink-500">{{ label }}</dt>
            <dd class="text-right font-medium text-ink-800 break-words">{{ value }}</dd>
          </div>
        </dl>
      </div>
    </section>

    <p v-if="skills.length === 0" class="rounded-[var(--radius-md)] border border-ink-200 px-4 py-3 text-sm text-ink-400">Thợ chưa chọn kỹ năng.</p>

    <section
      v-for="group in groups"
      :key="group.name"
      class="rounded-[var(--radius-md)] border border-ink-200 bg-white"
      :data-testid="`skill-group-${group.name}`"
    >
      <div class="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
          :aria-expanded="isOpen(group.name, group.ids)"
          :data-testid="`skill-group-toggle-${group.name}`"
          @click="toggle(group.name)"
        >
          <component :is="isOpen(group.name, group.ids) ? ChevronUp : ChevronDown" :size="18" class="shrink-0 text-ink-500" aria-hidden="true" />
          <span class="min-w-0">
            <span class="block font-medium text-ink-900">{{ group.name }}</span>
            <span class="block text-xs text-ink-500">{{ approvedIn(group.ids) }}/{{ group.ids.length }} dịch vụ được xác nhận</span>
          </span>
        </button>
        <select
          :value="sharedLevel(group.ids)"
          :disabled="readonly"
          :class="consoleField"
          :aria-label="`Cấp độ xác nhận cho cả nhóm ${group.name}`"
          :data-testid="`skill-group-level-${group.name}`"
          @change="onLevel(group.ids, $event)"
        >
          <option value="" disabled>Nhiều cấp độ</option>
          <option v-for="level in SKILL_LEVELS" :key="level" :value="level">{{ skillLevelLabel(level) }}</option>
        </select>
        <label class="flex cursor-pointer items-center gap-1.5 text-sm text-ink-700">
          <input
            type="checkbox"
            class="h-4 w-4 accent-brand-600"
            :checked="approvedIn(group.ids) === group.ids.length"
            :indeterminate="approvedIn(group.ids) > 0 && approvedIn(group.ids) < group.ids.length"
            :disabled="readonly"
            :data-testid="`skill-group-approve-${group.name}`"
            @change="onApproved(group.ids, $event)"
          />
          Xác nhận cả nhóm
        </label>
      </div>

      <div v-if="isOpen(group.name, group.ids)" class="space-y-3 border-t border-ink-100 px-4 py-3">
        <div v-if="!readonly && unapprovedIn(group.ids).length > 0" class="space-y-1">
          <label class="text-xs font-medium text-ink-600" :for="`skill-group-reason-${group.name}`">Lý do chung cho các dịch vụ chưa xác nhận trong nhóm</label>
          <input
            :id="`skill-group-reason-${group.name}`"
            type="text"
            maxlength="500"
            placeholder="Ví dụ: bằng chưa đủ căn cứ cho nhóm này"
            :class="consoleField"
            :data-testid="`skill-group-reason-${group.name}`"
            @input="onReason(unapprovedIn(group.ids), $event)"
          />
        </div>

        <ul class="divide-y divide-ink-100 rounded-[var(--radius-sm)] border border-ink-100">
          <li v-for="skill in group.skills" :key="skill.id" class="flex flex-wrap items-center gap-3 px-3 py-2">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-ink-900">{{ skill.serviceName }}</div>
              <div class="text-xs text-ink-500">Tự khai: {{ skillLevelLabel(skill.declaredLevel) }}</div>
            </div>
            <select
              :value="decisions[skill.id]?.level"
              :disabled="readonly"
              :class="consoleField"
              :aria-label="`Cấp độ xác nhận cho ${skill.serviceName}`"
              @change="onLevel([skill.id], $event)"
            >
              <option v-for="level in SKILL_LEVELS" :key="level" :value="level">{{ skillLevelLabel(level) }}</option>
            </select>
            <label class="flex cursor-pointer items-center gap-1.5 text-sm text-ink-700">
              <input
                type="checkbox"
                class="h-4 w-4 accent-brand-600"
                :checked="decisions[skill.id]?.approved"
                :disabled="readonly"
                :data-testid="`skill-approve-${skill.id}`"
                @change="onApproved([skill.id], $event)"
              />
              Xác nhận
            </label>
            <div v-if="!decisions[skill.id]?.approved" class="w-full space-y-1">
              <input
                type="text"
                maxlength="500"
                :value="decisions[skill.id]?.reason"
                :disabled="readonly"
                placeholder="Lý do chưa xác nhận (thợ sẽ đọc được)"
                :aria-label="`Lý do chưa xác nhận ${skill.serviceName}`"
                :aria-invalid="showReasonErrors && needsReason(skill.id)"
                :class="[consoleField, showReasonErrors && needsReason(skill.id) && 'border-danger-500']"
                :data-testid="`skill-reason-${skill.id}`"
                @input="onReason([skill.id], $event)"
              />
            </div>
          </li>
        </ul>

        <p v-if="group.evidence.length === 0" class="text-xs text-ink-500">Thợ chưa nộp giấy tờ cho nhóm này.</p>
        <p v-else class="flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
          Giấy tờ:
          <button
            v-for="item in group.evidence"
            :key="item.documentId"
            type="button"
            class="cursor-pointer rounded-full bg-brand-50 px-2.5 py-0.5 font-medium text-brand-700 hover:bg-brand-100"
            @click="emit('preview', item)"
          >
            {{ paperType(item) }}
          </button>
        </p>
      </div>
    </section>
  </div>
</template>
