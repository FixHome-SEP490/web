<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Calendar, Clock, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-vue-next';
import { FhCard, FhButton, FhSkeleton } from '../../components';
import {
  techniciansApi,
  type TechnicianScheduleItem,
  type TechnicianTimeOffItem,
} from '../../api/technicians.api';

const loading = ref(true);
const actionLoading = ref(false);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const daysMap = [
  { day: 1, label: 'Thứ Hai' },
  { day: 2, label: 'Thứ Ba' },
  { day: 3, label: 'Thứ Tư' },
  { day: 4, label: 'Thứ Năm' },
  { day: 5, label: 'Thứ Sáu' },
  { day: 6, label: 'Thứ Bảy' },
  { day: 0, label: 'Chủ Nhật' },
];

interface DayScheduleRow {
  dayOfWeek: number;
  label: string;
  active: boolean;
  startTime: string;
  endTime: string;
}

const weeklySchedule = ref<DayScheduleRow[]>([]);
const timeOffList = ref<TechnicianTimeOffItem[]>([]);
const isAvailable = ref(true);

// New time-off form
const newTimeOff = ref({
  startAt: '',
  endAt: '',
  reason: '',
});

const loadData = async () => {
  try {
    loading.value = true;
    const [profile, schedules, timeOffs] = await Promise.all([
      techniciansApi.getProfile(),
      techniciansApi.getSchedule(),
      techniciansApi.getTimeOff(),
    ]);

    isAvailable.value = profile.isAvailable;
    timeOffList.value = timeOffs;

    // Build weekly table
    weeklySchedule.value = daysMap.map((d) => {
      const match = schedules.find((s) => s.dayOfWeek === d.day);
      return {
        dayOfWeek: d.day,
        label: d.label,
        active: !!match,
        startTime: match ? match.startTime : '08:00',
        endTime: match ? match.endTime : '18:00',
      };
    });
  } catch (err) {
    message.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể tải cấu hình lịch làm việc.',
    };
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadData();
});

const handleSaveSchedule = async () => {
  try {
    actionLoading.value = true;
    message.value = null;

    const payload: TechnicianScheduleItem[] = weeklySchedule.value
      .filter((row) => row.active)
      .map((row) => ({
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
      }));

    await techniciansApi.updateSchedule(payload);
    message.value = { type: 'success', text: 'Đã lưu lịch làm việc tuần thành công!' };
  } catch (err) {
    message.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể lưu lịch làm việc.',
    };
  } finally {
    actionLoading.value = false;
  }
};

const handleToggleAvailability = async () => {
  try {
    actionLoading.value = true;
    message.value = null;
    isAvailable.value = !isAvailable.value;
    await techniciansApi.updateProfile({ isAvailable: isAvailable.value });
    message.value = {
      type: 'success',
      text: isAvailable.value ? 'Đã bật trạng thái sẵn sàng nhận việc!' : 'Đã tạm dừng nhận việc!',
    };
  } catch (err) {
    isAvailable.value = !isAvailable.value;
    message.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể đổi trạng thái nhận việc.',
    };
  } finally {
    actionLoading.value = false;
  }
};

const handleCreateTimeOff = async () => {
  if (!newTimeOff.value.startAt || !newTimeOff.value.endAt) {
    message.value = { type: 'error', text: 'Vui lòng chọn đầy đủ thời gian bắt đầu và kết thúc!' };
    return;
  }
  try {
    actionLoading.value = true;
    message.value = null;
    await techniciansApi.createTimeOff({
      startAt: new Date(newTimeOff.value.startAt).toISOString(),
      endAt: new Date(newTimeOff.value.endAt).toISOString(),
      reason: newTimeOff.value.reason || undefined,
    });
    newTimeOff.value = { startAt: '', endAt: '', reason: '' };
    timeOffList.value = await techniciansApi.getTimeOff();
    message.value = { type: 'success', text: 'Đã đăng ký khoảng thời gian nghỉ phép thành công!' };
  } catch (err) {
    message.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể đăng ký nghỉ phép.',
    };
  } finally {
    actionLoading.value = false;
  }
};

const handleDeleteTimeOff = async (id: string) => {
  if (!confirm('Bạn có chắc muốn xoá lịch nghỉ này?')) return;
  try {
    actionLoading.value = true;
    message.value = null;
    await techniciansApi.deleteTimeOff(id);
    timeOffList.value = timeOffList.value.filter((t) => t.id !== id);
    message.value = { type: 'success', text: 'Đã xoá lịch nghỉ phép thành công!' };
  } catch (err) {
    message.value = {
      type: 'error',
      text: (err as Error)?.message || 'Không thể xoá lịch nghỉ.',
    };
  } finally {
    actionLoading.value = false;
  }
};
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
          <Calendar class="text-brand-600" :size="24" />
          Lịch Làm Việc & Nghỉ Phép
        </h1>
        <p class="text-xs text-ink-500 mt-1">
          Cài đặt khung giờ làm việc tiêu chuẩn trong tuần và đăng ký các ngày nghỉ phép để hệ thống tự động điều phối nhận việc.
        </p>
      </div>

      <!-- Quick Availability Toggle -->
      <div class="flex items-center gap-3 p-3 bg-white rounded-lg border border-ink-200">
        <span class="text-xs font-semibold text-ink-700">Trạng thái nhận việc:</span>
        <button
          type="button"
          class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
          :class="isAvailable ? 'bg-success-600' : 'bg-ink-300'"
          :disabled="actionLoading"
          @click="handleToggleAvailability"
        >
          <span
            aria-hidden="true"
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
            :class="isAvailable ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
        <span class="text-xs font-bold" :class="isAvailable ? 'text-success-700' : 'text-ink-500'">
          {{ isAvailable ? 'Đang nhận việc' : 'Tạm nghỉ' }}
        </span>
      </div>
    </div>

    <!-- Alert / Feedback Banner -->
    <div
      v-if="message"
      class="p-4 rounded-lg text-xs flex items-center gap-2"
      :class="message.type === 'success' ? 'bg-success-50 text-success-800 border border-success-200' : 'bg-danger-50 text-danger-800 border border-danger-200'"
    >
      <CheckCircle2 v-if="message.type === 'success'" :size="16" />
      <AlertCircle v-else :size="16" />
      <span>{{ message.text }}</span>
    </div>

    <div v-if="loading" class="space-y-4">
      <FhSkeleton height="280px" />
      <FhSkeleton height="200px" />
    </div>

    <div v-else class="space-y-6">
      <!-- Weekly Schedule Card -->
      <FhCard title="Lịch làm việc cố định hàng tuần">
        <div class="space-y-4 text-xs">
          <p class="text-ink-500">
            Hệ thống chỉ gửi lời mời ghép việc phù hợp trong các khung giờ bạn đã bật hoạt động dưới đây.
          </p>

          <div class="divide-y divide-ink-100">
            <div
              v-for="row in weeklySchedule"
              :key="row.dayOfWeek"
              class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div class="flex items-center gap-3 w-36">
                <input
                  :id="`day-${row.dayOfWeek}`"
                  v-model="row.active"
                  type="checkbox"
                  class="rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                />
                <label
                  :for="`day-${row.dayOfWeek}`"
                  class="font-semibold cursor-pointer"
                  :class="row.active ? 'text-ink-900' : 'text-ink-400 line-through'"
                >
                  {{ row.label }}
                </label>
              </div>

              <div v-if="row.active" class="flex items-center gap-2">
                <div class="flex items-center gap-1.5">
                  <Clock :size="14" class="text-ink-400" />
                  <input
                    v-model="row.startTime"
                    type="time"
                    class="h-8 px-2 border border-ink-200 rounded text-xs focus:outline-none focus:border-brand-600"
                  />
                </div>
                <span class="text-ink-400">đến</span>
                <div class="flex items-center gap-1.5">
                  <Clock :size="14" class="text-ink-400" />
                  <input
                    v-model="row.endTime"
                    type="time"
                    class="h-8 px-2 border border-ink-200 rounded text-xs focus:outline-none focus:border-brand-600"
                  />
                </div>
              </div>
              <div v-else class="text-ink-400 italic">
                Nghỉ làm
              </div>
            </div>
          </div>

          <div class="pt-4 border-t border-ink-100 flex justify-end">
            <FhButton variant="primary" size="md" :disabled="actionLoading" @click="handleSaveSchedule">
              Lưu lịch làm việc tuần
            </FhButton>
          </div>
        </div>
      </FhCard>

      <!-- Time-off Card -->
      <FhCard title="Nghỉ phép / Khung giờ bận đột xuất">
        <div class="space-y-5 text-xs">
          <p class="text-ink-500">
            Nếu bạn có việc đột xuất hoặc nghỉ phép, hãy thêm khoảng thời gian bên dưới. Hệ thống sẽ không gửi lời mời nhận việc trong thời gian này.
          </p>

          <!-- Form Add Time-off -->
          <div class="p-4 bg-ink-50/70 border border-ink-200 rounded-lg space-y-3">
            <h4 class="font-bold text-ink-900 flex items-center gap-1.5">
              <Plus :size="14" /> Đăng ký thời gian nghỉ
            </h4>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block font-semibold text-ink-700 mb-1">Thời gian bắt đầu:</label>
                <input
                  v-model="newTimeOff.startAt"
                  type="datetime-local"
                  class="w-full h-8 px-2 bg-white border border-ink-200 rounded text-xs focus:outline-none focus:border-brand-600"
                />
              </div>

              <div>
                <label class="block font-semibold text-ink-700 mb-1">Thời gian kết thúc:</label>
                <input
                  v-model="newTimeOff.endAt"
                  type="datetime-local"
                  class="w-full h-8 px-2 bg-white border border-ink-200 rounded text-xs focus:outline-none focus:border-brand-600"
                />
              </div>

              <div>
                <label class="block font-semibold text-ink-700 mb-1">Lý do (tuỳ chọn):</label>
                <input
                  v-model="newTimeOff.reason"
                  type="text"
                  placeholder="Ví dụ: Bận việc gia đình"
                  class="w-full h-8 px-2 bg-white border border-ink-200 rounded text-xs focus:outline-none focus:border-brand-600"
                />
              </div>
            </div>

            <div class="flex justify-end pt-1">
              <FhButton variant="primary" size="sm" :disabled="actionLoading" @click="handleCreateTimeOff">
                Đăng ký nghỉ phép
              </FhButton>
            </div>
          </div>

          <!-- Existing Time-off list -->
          <div>
            <h4 class="font-bold text-ink-900 mb-2">Danh sách các khoảng thời gian nghỉ đã đăng ký:</h4>
            <div v-if="timeOffList.length === 0" class="py-6 text-center text-ink-400 italic bg-white rounded border border-ink-100">
              Chưa có khoảng thời gian nghỉ phép nào.
            </div>

            <div v-else class="divide-y divide-ink-100 border border-ink-200 rounded-lg overflow-hidden bg-white">
              <div
                v-for="item in timeOffList"
                :key="item.id"
                class="p-3 flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div class="font-semibold text-ink-900 flex items-center gap-2">
                    <span>{{ new Date(item.startAt).toLocaleString('vi-VN') }}</span>
                    <span class="text-ink-400">→</span>
                    <span>{{ new Date(item.endAt).toLocaleString('vi-VN') }}</span>
                  </div>
                  <p v-if="item.reason" class="text-ink-500 text-[11px] mt-0.5">
                    Lý do: {{ item.reason }}
                  </p>
                </div>

                <FhButton
                  variant="secondary"
                  size="sm"
                  :disabled="actionLoading"
                  @click="handleDeleteTimeOff(item.id)"
                >
                  <Trash2 :size="13" class="text-danger-500" />
                </FhButton>
              </div>
            </div>
          </div>
        </div>
      </FhCard>
    </div>
  </div>
</template>
