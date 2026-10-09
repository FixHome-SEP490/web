<script setup lang="ts">
// Admin: find a technician by name, email, phone, CCCD or id (never by
// address) and read everything about them (PO 08/10/2026).
import { ref } from 'vue';
import { Search, UserSearch } from 'lucide-vue-next';
import { FhButton, FhCard, FhEmptyState, FhMoney, FhSkeleton } from '../../../components';
import { adminTechniciansApi, type AdminTechnicianDetail, type AdminTechnicianRow } from '../../../api/admin-technicians.api';
import { userFacingError } from '../../../utils/user-facing-error';
import { vnDateString, vnDateTimeString } from '../../../utils/vn-time';

const search = ref('');
const rows = ref<AdminTechnicianRow[]>([]);
const total = ref(0);
const page = ref(1);
const totalPages = ref(0);
const searched = ref(false);
const loading = ref(false);
const error = ref('');

const detail = ref<AdminTechnicianDetail | null>(null);
const detailLoading = ref(false);
const detailError = ref('');

const KYC: Record<string, string> = { verified: 'Đã duyệt', pending: 'Chờ duyệt', rejected: 'Bị từ chối', in_review: 'Đang xét' };
const ACCOUNT: Record<string, string> = { active: 'Hoạt động', suspended: 'Tạm khoá', locked: 'Đã khoá', pending_verification: 'Chưa xác minh' };
const ORDER: Record<string, string> = { accepted: 'Đã nhận', en_route: 'Đang đi', under_repair: 'Đang sửa', completed: 'Hoàn tất', cancelled: 'Đã huỷ' };
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const label = (map: Record<string, string>, key: string | null | undefined) => (key ? map[key.toLowerCase()] ?? key : '—');

async function run(next = 1) {
  const text = search.value.trim();
  if (!text) {
    error.value = 'Nhập tên, email, số điện thoại, CCCD hoặc mã để tìm.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const result = await adminTechniciansApi.search({ search: text, page: next, pageSize: 20 });
    rows.value = result.data;
    total.value = result.meta.total;
    page.value = result.meta.page;
    totalPages.value = result.meta.totalPages;
    searched.value = true;
  } catch (err) {
    error.value = userFacingError(err, 'Chưa tìm được, thử lại sau.');
  } finally {
    loading.value = false;
  }
}

async function open(row: AdminTechnicianRow) {
  detail.value = null;
  detailError.value = '';
  detailLoading.value = true;
  try {
    detail.value = await adminTechniciansApi.detail(row.id);
  } catch (err) {
    detailError.value = userFacingError(err, 'Chưa tải được thông tin thợ.');
  } finally {
    detailLoading.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2"><UserSearch :size="24" class="text-ink-600" /> Tra cứu kỹ thuật viên</h1>
      <p class="text-xs text-ink-500 mt-1">Tìm theo tên (gõ không dấu cũng được), email, số điện thoại, CCCD hoặc mã tài khoản. Không tìm theo địa chỉ.</p>
    </div>

    <form class="flex gap-2" @submit.prevent="run(1)">
      <input
        v-model="search"
        type="search"
        maxlength="100"
        placeholder="Ví dụ: Nguyen Van A, 0912345678, 079..., tech1@..."
        aria-label="Tìm kỹ thuật viên"
        data-testid="tech-search"
        class="flex-1 rounded-[var(--radius-sm)] border border-ink-200 bg-white px-3 py-2 text-sm"
      />
      <FhButton type="submit" :loading="loading" data-testid="tech-search-submit"><Search :size="15" class="mr-1" /> Tìm</FhButton>
    </form>
    <p v-if="error" class="text-xs text-danger-700" role="alert">{{ error }}</p>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <FhCard>
        <div v-if="loading" class="p-4"><FhSkeleton height="36px" :count="4" /></div>
        <FhEmptyState v-else-if="!searched" title="Chưa tìm" description="Nhập thông tin để tra cứu kỹ thuật viên." />
        <FhEmptyState v-else-if="rows.length === 0" title="Không tìm thấy" description="Không có kỹ thuật viên nào khớp." />
        <template v-else>
          <p class="px-1 pb-2 text-xs text-ink-500">{{ total }} kết quả</p>
          <ul class="divide-y divide-ink-100" data-testid="tech-results">
            <li v-for="r in rows" :key="r.id">
              <button
                type="button"
                class="w-full text-left px-2 py-2.5 rounded-lg hover:bg-ink-50"
                :class="detail?.user.id === r.id ? 'bg-brand-50' : ''"
                :data-testid="`tech-row-${r.id}`"
                @click="open(r)"
              >
                <span class="block text-sm font-semibold text-ink-900">{{ r.fullName }}</span>
                <span class="block text-xs text-ink-500 break-all">{{ r.email }}<template v-if="r.phoneNumber"> · {{ r.phoneNumber }}</template></span>
                <span class="block text-xs text-ink-500">
                  KYC: {{ label(KYC, r.verificationStatus) }} · {{ label(ACCOUNT, r.status) }} · Điểm uy tín {{ r.reputationPoints }}
                </span>
              </button>
            </li>
          </ul>
          <div v-if="totalPages > 1" class="flex items-center justify-between pt-3 text-xs text-ink-500">
            <FhButton variant="secondary" size="sm" :disabled="page <= 1" @click="run(page - 1)">Trước</FhButton>
            <span>Trang {{ page }}/{{ totalPages }}</span>
            <FhButton variant="secondary" size="sm" :disabled="page >= totalPages" @click="run(page + 1)">Sau</FhButton>
          </div>
        </template>
      </FhCard>

      <FhCard>
        <div v-if="detailLoading" class="p-4"><FhSkeleton height="28px" :count="6" /></div>
        <p v-else-if="detailError" class="text-xs text-danger-700">{{ detailError }}</p>
        <FhEmptyState v-else-if="!detail" title="Chọn một kỹ thuật viên" description="Thông tin đầy đủ sẽ hiện ở đây." />
        <div v-else class="space-y-5 text-sm" data-testid="tech-detail">
          <section>
            <h2 class="text-lg font-bold text-ink-900">{{ detail.user.fullName }}</h2>
            <dl class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div><dt class="text-ink-500">Email</dt><dd class="text-ink-900 break-all">{{ detail.user.email }}</dd></div>
              <div><dt class="text-ink-500">Số điện thoại</dt><dd class="text-ink-900">{{ detail.user.phoneNumber || '—' }}</dd></div>
              <div><dt class="text-ink-500">CCCD</dt><dd class="text-ink-900 font-num">{{ detail.user.citizenIdNumber || '—' }}</dd></div>
              <div><dt class="text-ink-500">Ngày sinh</dt><dd class="text-ink-900">{{ detail.user.dateOfBirth ? vnDateString(detail.user.dateOfBirth) : '—' }}</dd></div>
              <div><dt class="text-ink-500">Tài khoản</dt><dd class="text-ink-900">{{ label(ACCOUNT, detail.user.status) }}, tạo {{ vnDateString(detail.user.createdAt) }}</dd></div>
              <div><dt class="text-ink-500">Mã tài khoản</dt><dd class="text-ink-900 font-mono break-all">{{ detail.user.id }}</dd></div>
              <div><dt class="text-ink-500">Điểm uy tín</dt><dd class="text-ink-900">{{ detail.user.reputationPoints }}/100</dd></div>
              <div><dt class="text-ink-500">Số dư ví</dt><dd class="text-ink-900"><FhMoney v-if="detail.walletBalance !== null" :amount="detail.walletBalance" /><template v-else>Chưa có ví</template></dd></div>
            </dl>
          </section>

          <section v-if="detail.profile">
            <h3 class="font-bold text-ink-900">Hồ sơ nghề</h3>
            <dl class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div><dt class="text-ink-500">KYC</dt><dd class="text-ink-900">{{ label(KYC, detail.profile.verificationStatus) }}<template v-if="detail.verification?.submittedAt">, nộp {{ vnDateString(detail.verification.submittedAt) }}</template></dd></div>
              <div><dt class="text-ink-500">Nhận việc</dt><dd class="text-ink-900">{{ detail.profile.isAvailable ? 'Đang bật' : 'Đang tắt' }}, bán kính {{ detail.profile.serviceRadiusKm }} km</dd></div>
              <div><dt class="text-ink-500">Đánh giá</dt><dd class="text-ink-900">{{ detail.profile.averageRating !== null ? `${detail.profile.averageRating.toFixed(1)} (${detail.profile.ratingCount})` : 'Chưa có đánh giá' }}</dd></div>
              <div><dt class="text-ink-500">Kinh nghiệm</dt><dd class="text-ink-900">{{ detail.profile.yearsExperience }} năm</dd></div>
              <div class="sm:col-span-2"><dt class="text-ink-500">Địa chỉ</dt><dd class="text-ink-900">{{ detail.profile.fullAddress || '—' }}</dd></div>
              <div v-if="detail.profile.workSuspendedUntil"><dt class="text-ink-500">Tạm khoá nhận việc</dt><dd class="text-danger-700">Tới {{ vnDateTimeString(detail.profile.workSuspendedUntil) }}</dd></div>
              <div><dt class="text-ink-500">Vị trí gần nhất</dt><dd class="text-ink-900">{{ detail.profile.lastLocationAt ? vnDateTimeString(detail.profile.lastLocationAt) : 'Chưa có' }}</dd></div>
            </dl>
          </section>

          <section>
            <h3 class="font-bold text-ink-900">Kỹ năng ({{ detail.skills.length }})</h3>
            <p v-if="!detail.skills.length" class="text-xs text-ink-500">Chưa có kỹ năng.</p>
            <ul v-else class="mt-1 max-h-40 overflow-y-auto text-xs divide-y divide-ink-100">
              <li v-for="s in detail.skills" :key="s.serviceName" class="flex justify-between gap-2 py-1">
                <span class="text-ink-800">{{ s.serviceName }}</span>
                <span class="text-ink-500 shrink-0"><template v-if="s.listedLaborPrice !== null"><FhMoney :amount="s.listedLaborPrice" /> · </template>{{ label(KYC, s.verificationStatus) }}</span>
              </li>
            </ul>
          </section>

          <section>
            <h3 class="font-bold text-ink-900">Lịch làm việc</h3>
            <p class="text-xs text-ink-700">
              <template v-if="detail.schedule.length">
                <span v-for="(d, i) in detail.schedule" :key="i">{{ WEEKDAYS[d.dayOfWeek] }} {{ d.startTime }}-{{ d.endTime }}<template v-if="i < detail.schedule.length - 1">, </template></span>
              </template>
              <template v-else>Chưa đặt lịch.</template>
            </p>
            <p class="text-xs text-ink-500">Khu vực: {{ detail.serviceAreas.length }} quận/huyện · Nghỉ sắp tới: {{ detail.upcomingTimeOff.length }}</p>
          </section>

          <section>
            <h3 class="font-bold text-ink-900">Đơn</h3>
            <p class="text-xs text-ink-700">
              <template v-if="Object.keys(detail.orderCounts).length">
                <span v-for="(n, s) in detail.orderCounts" :key="s" class="mr-2">{{ label(ORDER, String(s)) }}: {{ n }}</span>
              </template>
              <template v-else>Chưa có đơn.</template>
            </p>
            <ul v-if="detail.recentOrders.length" class="mt-1 text-xs divide-y divide-ink-100">
              <li v-for="o in detail.recentOrders" :key="o.id" class="flex justify-between gap-2 py-1">
                <router-link :to="`/console/orders/${o.id}`" class="font-mono text-brand-700 hover:underline">{{ o.code }}</router-link>
                <span class="text-ink-500">{{ label(ORDER, o.status) }} · {{ vnDateString(o.createdAt) }}</span>
              </li>
            </ul>
          </section>

          <section v-if="detail.reputationEvents.length">
            <h3 class="font-bold text-ink-900">Thay đổi điểm uy tín</h3>
            <ul class="mt-1 text-xs divide-y divide-ink-100">
              <li v-for="(e, i) in detail.reputationEvents" :key="i" class="flex justify-between gap-2 py-1">
                <span class="text-ink-700 break-words">{{ e.reason }}</span>
                <span class="shrink-0 font-num" :class="e.delta < 0 ? 'text-danger-700' : 'text-ink-700'">{{ e.delta > 0 ? '+' : '' }}{{ e.delta }}</span>
              </li>
            </ul>
          </section>
        </div>
      </FhCard>
    </div>
  </div>
</template>
