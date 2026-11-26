<script setup lang="ts">
// Chọn trụ sở và giờ lên gặp sau khi quản lý dịch vụ xác nhận danh tính (PO 09/11/2026); cùng luồng màn mobile.
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, MapPin, Phone } from 'lucide-vue-next';
import { FhButton, FhSkeleton } from '../../components';
import { technicianOfficeVisitApi, type MyOfficeVisit } from '../../api/technician-office-visit.api';
import { formatVisitTime } from '../../components/technician/onboarding-stage';
import { userFacingError } from '../../utils/user-facing-error';

const router = useRouter();
const TZ = 'Asia/Ho_Chi_Minh';
const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const dayLabel = (key: string) => key.split('-').reverse().join('/');
const timeOf = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

const data = ref<MyOfficeVisit | null>(null);
const loading = ref(true);
const error = ref('');
const officeId = ref<string | null>(null);
const day = ref('');
const slot = ref<string | null>(null);
const saving = ref(false);
const changing = ref(false);

const load = async () => {
  try {
    error.value = '';
    const res = await technicianOfficeVisitApi.getMine();
    data.value = res;
    officeId.value ??= res.offices.find((o) => o.recommended)?.id ?? res.offices[0]?.id ?? null;
  } catch (err) {
    error.value = userFacingError(err, 'Không tải được lịch hẹn.');
  } finally {
    loading.value = false;
  }
};
onMounted(load);

const office = computed(() => data.value?.offices.find((o) => o.id === officeId.value));
const free = computed(() => (office.value?.slots ?? []).filter((s) => s.remaining > 0));
const days = computed(() => [...new Set(free.value.map((s) => dayKey(s.startsAt)))]);
const slotsOfDay = computed(() => free.value.filter((s) => dayKey(s.startsAt) === day.value));

const pickOffice = (id: string) => {
  officeId.value = id;
  day.value = '';
  slot.value = null;
};

const book = async () => {
  if (!officeId.value || !slot.value) return;
  saving.value = true;
  error.value = '';
  try {
    await technicianOfficeVisitApi.book(officeId.value, slot.value);
    slot.value = null;
    day.value = '';
    changing.value = false;
    await load();
  } catch (err) {
    error.value = userFacingError(err, 'Không đặt được lịch. Vui lòng chọn giờ khác.');
    await load();
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-transparent pb-16">
    <header class="bg-white/95 border-b border-ink-200">
      <div class="max-w-2xl mx-auto px-4 h-16 flex items-center gap-3">
        <button type="button" class="p-2 -ml-2 rounded-lg hover:bg-ink-100" aria-label="Quay lại hồ sơ" data-testid="visit-back" @click="router.push('/tech/onboarding')">
          <ArrowLeft :size="20" />
        </button>
        <h1 class="text-lg font-bold text-ink-900">Lịch lên trụ sở</h1>
      </div>
    </header>

    <main class="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <FhSkeleton v-if="loading" height="64px" :count="3" aria-busy="true" />
      <p v-else-if="!data" role="alert" class="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">{{ error || 'Không tải được lịch hẹn.' }}</p>

      <div v-else-if="data.blocked" class="space-y-3" data-testid="visit-blocked">
        <p role="alert" class="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          Bạn đã vắng {{ data.missedVisits }} lần hẹn nên tạm thời không đặt thêm được. Vui lòng liên hệ quản lý dịch vụ để được hỗ trợ.
        </p>
        <a v-if="data.supportPhone" :href="`tel:${data.supportPhone}`" class="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-ink-200 bg-white font-semibold text-sm">
          <Phone :size="16" /> Gọi {{ data.supportPhone }}
        </a>
      </div>

      <div v-else-if="data.current && !changing" class="space-y-3" data-testid="visit-current">
        <div class="rounded-2xl border border-ink-200 bg-white p-4 space-y-1">
          <p class="font-bold text-ink-900">Bạn đã đặt lịch</p>
          <p class="font-semibold text-ink-900" data-testid="visit-current-time">{{ formatVisitTime(data.current.scheduledAt) }}</p>
          <p class="text-sm text-ink-800">{{ data.current.officeName }}</p>
          <p class="text-sm text-ink-500">{{ data.current.officeAddress }}</p>
        </div>
        <p class="rounded-xl border border-ink-200 bg-info-50 px-4 py-3 text-sm text-info-600">Vui lòng mang bản công chứng bằng cấp và CCCD gốc để FixHome duyệt hồ sơ.</p>
        <div class="flex flex-wrap gap-2">
          <a v-if="data.current.officePhone" :href="`tel:${data.current.officePhone}`" class="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-ink-200 bg-white font-semibold text-sm"><Phone :size="16" /> Gọi trụ sở</a>
          <FhButton variant="secondary" size="md" data-testid="visit-change" @click="changing = true">Đổi giờ hẹn</FhButton>
        </div>
      </div>

      <p v-else-if="!data.offices.length" class="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">Hiện chưa có trụ sở nào nhận hồ sơ. Vui lòng quay lại sau.</p>

      <div v-else class="space-y-5" data-testid="visit-form">
        <p class="rounded-xl border border-ink-200 bg-info-50 px-4 py-3 text-sm text-info-600">
          Danh tính của bạn đã được xác nhận. Hãy chọn trụ sở và giờ lên gặp, nhớ mang bản công chứng bằng cấp.
          <template v-if="data.missedVisits > 0"> Bạn đã vắng {{ data.missedVisits }}/{{ data.maxMissedVisits }} lần.</template>
        </p>

        <section class="space-y-2" role="radiogroup" aria-label="Trụ sở">
          <h2 class="font-bold text-ink-900">1. Chọn trụ sở</h2>
          <button
            v-for="o in data.offices" :key="o.id" type="button" role="radio" :aria-checked="o.id === officeId"
            class="w-full text-left rounded-2xl border bg-white p-4 space-y-1"
            :class="o.id === officeId ? 'border-brand-600 ring-2 ring-brand-200' : 'border-ink-200'"
            :data-testid="`visit-office-${o.id}`" @click="pickOffice(o.id)"
          >
            <span class="block font-semibold text-ink-900">{{ o.name }}<span v-if="o.recommended" class="font-normal text-brand-700"> · Gần nhất</span></span>
            <span class="flex items-center gap-1.5 text-sm text-ink-500"><MapPin :size="14" /> {{ o.address }}</span>
            <span v-if="o.distanceKm != null" class="block text-sm text-ink-500">Cách bạn khoảng {{ o.distanceKm.toFixed(1) }} km</span>
          </button>
        </section>

        <section class="space-y-2">
          <h2 class="font-bold text-ink-900">2. Chọn ngày và giờ</h2>
          <p v-if="!days.length" class="text-sm text-ink-500">Trụ sở này chưa còn giờ trống.</p>
          <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Ngày hẹn">
            <button v-for="d in days" :key="d" type="button" role="radio" :aria-checked="d === day" class="h-11 px-4 rounded-xl border text-sm font-semibold"
              :class="d === day ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-ink-200 text-ink-800'" :data-testid="`visit-day-${d}`" @click="day = d; slot = null">{{ dayLabel(d) }}</button>
          </div>
          <div v-if="day" class="flex flex-wrap gap-2" role="radiogroup" aria-label="Giờ hẹn">
            <button v-for="s in slotsOfDay" :key="s.startsAt" type="button" role="radio" :aria-checked="s.startsAt === slot" class="h-11 min-w-[72px] px-3 rounded-full border text-sm font-semibold"
              :class="s.startsAt === slot ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-ink-200 text-ink-800'" :data-testid="`visit-slot-${s.startsAt}`" @click="slot = s.startsAt">{{ timeOf(s.startsAt) }}</button>
          </div>
        </section>

        <p v-if="error" role="alert" class="text-sm text-danger-700">{{ error }}</p>
        <FhButton variant="primary" size="lg" class="w-full" :disabled="!slot" :loading="saving" data-testid="visit-confirm" @click="book">Xác nhận lịch hẹn</FhButton>
      </div>
    </main>
  </div>
</template>
