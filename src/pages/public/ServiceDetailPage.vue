<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, Clock, Search, Wrench } from 'lucide-vue-next';
import { FhButton, FhEmptyState, FhMoney, FhSkeleton } from '../../components';
import { catalogApi, type ServiceItem } from '../../api/catalog.api';
import { getPublicServicePricing } from '../../utils/public-service-pricing';
import { useSmoothScroll } from '../../composables/useSmoothScroll';

const route = useRoute();
const router = useRouter();
const service = ref<ServiceItem | null>(null);
const loading = ref(true);
const loadError = ref('');
const pricing = computed(() => service.value ? getPublicServicePricing(service.value) : { kind: 'unknown' as const });
let requestId = 0;

const reduceMotion = typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reduceMotion) useSmoothScroll();

async function loadService() {
  const currentRequest = ++requestId;
  const slug = String(route.params.slug ?? '');
  loading.value = true;
  loadError.value = '';
  service.value = null;
  try {
    const result = await catalogApi.getService(slug);
    if (currentRequest === requestId) service.value = result;
  } catch {
    if (currentRequest === requestId) {
      loadError.value = 'Không tìm thấy dịch vụ này hoặc chưa thể kết nối. Vui lòng thử lại.';
    }
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
}

watch(() => route.params.slug, () => void loadService(), { immediate: true });
onBeforeUnmount(() => { requestId += 1; });

function bookService() {
  if (!service.value?.isActive) return;
  void router.push({ path: '/app/bookings/new', query: { serviceId: service.value.id } });
}

function goBack() {
  if (window.history.state?.back) router.back();
  else void router.push({ name: 'services' });
}
</script>

<template>
  <div class="service-detail" :aria-busy="loading">
    <nav class="detail-breadcrumb" aria-label="Đường dẫn">
      <RouterLink to="/">Trang chủ</RouterLink>
      <span aria-hidden="true">/</span>
      <RouterLink to="/services">Dịch vụ</RouterLink>
      <span aria-hidden="true">/</span>
      <span class="detail-breadcrumb__current">{{ service?.name ?? 'Chi tiết dịch vụ' }}</span>
    </nav>

    <button type="button" class="detail-back" @click="goBack">
      <ArrowLeft :size="17" aria-hidden="true" /> Quay lại danh sách
    </button>

    <div v-if="loading" class="detail-loading" aria-label="Đang tải thông tin dịch vụ">
      <section class="detail-loading__copy">
        <FhSkeleton width="130px" height="18px" />
        <FhSkeleton width="76%" height="48px" />
        <FhSkeleton width="92%" height="18px" :count="3" />
        <FhSkeleton width="100%" height="180px" rounded="lg" />
      </section>
      <FhSkeleton class="detail-loading__price" height="330px" rounded="lg" />
    </div>

    <FhEmptyState
      v-else-if="loadError"
      title="Không tải được dịch vụ"
      :description="loadError"
      action-text="Thử lại"
      @action="loadService"
    >
      <template #extra>
        <RouterLink class="detail-error-link" to="/services">Quay lại danh sách dịch vụ</RouterLink>
      </template>
    </FhEmptyState>

    <div v-else-if="service" class="detail-layout">
      <div class="detail-content">
        <header class="detail-intro">
          <div class="detail-eyebrow">
            <span class="detail-icon"><Wrench :size="18" :stroke-width="1.8" aria-hidden="true" /></span>
            <span>{{ service.category?.name ?? 'Dịch vụ tại nhà' }}</span>
          </div>
          <h1>{{ service.name }}</h1>
          <p v-if="service.scopeDescription || service.description" class="detail-lead">
            {{ service.scopeDescription || service.description }}
          </p>
          <div class="detail-facts">
            <div v-if="service.estimatedMinutes > 0" class="detail-fact">
              <Clock :size="17" aria-hidden="true" />
              <span>Thời lượng dự kiến</span>
              <strong>~{{ service.estimatedMinutes }} phút</strong>
            </div>
            <div class="detail-fact detail-fact--status">
              <span class="detail-status-dot" :class="{ 'detail-status-dot--off': !service.isActive }" aria-hidden="true"></span>
              <span>{{ service.isActive ? 'Đang nhận yêu cầu' : 'Tạm ngưng nhận yêu cầu' }}</span>
            </div>
          </div>
        </header>

        <section v-if="service.description && service.scopeDescription && service.description !== service.scopeDescription" class="detail-section" aria-labelledby="scope-heading">
          <p class="detail-kicker">Phạm vi công việc</p>
          <h2 id="scope-heading">Dịch vụ bao gồm</h2>
          <p>{{ service.description }}</p>
        </section>

        <section class="detail-section detail-section--pricing" aria-labelledby="pricing-heading">
          <p class="detail-kicker">Thông tin chi phí</p>
          <h2 id="pricing-heading">Giá được xác định như thế nào?</h2>
          <p v-if="pricing.kind === 'fixed'">
            Đây là giá niêm yết cho dịch vụ<span v-if="service.unit"> theo {{ service.unit }}</span>. Phạm vi công việc cụ thể được thể hiện ở trên.
          </p>
          <p v-else-if="pricing.kind === 'inspection'">
            Kỹ thuật viên cần khảo sát tình trạng thực tế trước khi báo giá. Bạn sẽ xem và xác nhận chi phí trong quy trình đặt dịch vụ.
          </p>
          <p v-else>Thông tin giá đang được cập nhật. Vui lòng xem chi tiết cùng FixHome trước khi xác nhận dịch vụ.</p>
        </section>
      </div>

      <aside class="booking-panel" aria-labelledby="booking-title">
        <div class="booking-panel__topline">
          <span class="booking-panel__icon"><Wrench :size="21" :stroke-width="1.8" aria-hidden="true" /></span>
          <span class="booking-panel__category">{{ service.category?.name ?? 'FixHome' }}</span>
        </div>
        <h2 id="booking-title">{{ service.name }}</h2>

        <div class="booking-price" :class="`booking-price--${pricing.kind}`">
          <span class="booking-price__label">
            {{ pricing.kind === 'fixed' ? 'Giá niêm yết' : pricing.kind === 'inspection' ? 'Chi phí' : 'Giá dịch vụ' }}
          </span>
          <strong v-if="pricing.kind === 'fixed'" class="booking-price__amount">
            <FhMoney :amount="pricing.amount" /><small v-if="service.unit">/ {{ service.unit }}</small>
          </strong>
          <strong v-else-if="pricing.kind === 'inspection'" class="booking-price__inspection">Báo giá sau khảo sát</strong>
          <strong v-else class="booking-price__unknown">Thông tin giá đang được cập nhật</strong>
          <span v-if="pricing.kind === 'inspection' && pricing.referenceRange" class="booking-price__range">
            Khoảng tham khảo:
            <FhMoney :amount="pricing.referenceRange.min" /> – <FhMoney :amount="pricing.referenceRange.max" />
          </span>
        </div>

        <FhButton
          variant="primary"
          size="lg"
          block
          :disabled="!service.isActive"
          data-testid="detail-booking"
          @click="bookService"
        >
          Chọn dịch vụ <ArrowRight :size="17" aria-hidden="true" />
        </FhButton>
        <p class="booking-panel__note">
          {{ service.isActive ? 'Tiếp tục để chọn thời gian và hoàn tất yêu cầu.' : 'Dịch vụ này hiện chưa thể được chọn.' }}
        </p>
        <RouterLink class="booking-panel__browse" to="/services">
          <Search :size="15" aria-hidden="true" /> Xem dịch vụ khác
        </RouterLink>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.service-detail {
  --detail-ease: cubic-bezier(0.22, 1, 0.36, 1);
  width: min(100% - 48px, 1200px);
  margin: 0 auto;
  padding: 30px 0 100px;
  color: var(--color-ink-900);
  animation: detail-enter 380ms var(--detail-ease) both;
}
.detail-breadcrumb { display: flex; min-width: 0; align-items: center; gap: 10px; color: var(--color-ink-600); font-size: 12px; }
.detail-breadcrumb a { color: inherit; text-decoration: none; }
.detail-breadcrumb a:hover { color: var(--color-brand-700); text-decoration: underline; text-underline-offset: 3px; }
.detail-breadcrumb__current { overflow: hidden; color: var(--color-ink-800); text-overflow: ellipsis; white-space: nowrap; }
.detail-back { display: inline-flex; min-height: 44px; align-items: center; gap: 8px; margin: 18px 0 34px; padding: 0 10px 0 0; border: 0; background: transparent; color: var(--color-ink-700); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.detail-back:hover { color: var(--color-brand-700); }
.detail-back:focus-visible, .detail-breadcrumb a:focus-visible, .booking-panel__browse:focus-visible, .detail-error-link:focus-visible { outline: 2px solid var(--color-brand-600); outline-offset: 3px; border-radius: 3px; }
.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(310px, 390px); align-items: start; gap: clamp(42px, 8vw, 112px); }
.detail-content { min-width: 0; }
.detail-intro { padding: 13px 0 31px; border-bottom: 1px solid var(--color-ink-200); }
.detail-eyebrow { display: flex; align-items: center; gap: 11px; color: var(--color-brand-800); font-size: 13px; font-weight: 600; }
.detail-icon { display: grid; width: 39px; height: 39px; place-items: center; border: 1px solid var(--color-brand-100); border-radius: var(--radius-sm); background: var(--color-brand-50); color: var(--color-brand-700); }
.detail-intro h1 { max-width: 760px; margin: 24px 0 0; font-size: clamp(38px, 5vw, 58px); line-height: 1.08; letter-spacing: -0.045em; font-weight: 700; text-wrap: balance; }
.detail-lead { max-width: 66ch; margin: 18px 0 0; color: var(--color-ink-600); font-size: 16px; line-height: 1.7; text-wrap: pretty; }
.detail-facts { display: flex; flex-wrap: wrap; gap: 11px; margin-top: 28px; }
.detail-fact { display: inline-flex; min-height: 40px; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid var(--color-ink-200); border-radius: 999px; color: var(--color-ink-600); font-size: 12px; }
.detail-fact svg { color: var(--color-brand-700); }
.detail-fact strong { color: var(--color-ink-800); font-weight: 600; }
.detail-status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-success-600); }
.detail-status-dot--off { background: var(--color-ink-400); }
.detail-section { padding: 34px 0; border-bottom: 1px solid var(--color-ink-200); }
.detail-kicker { margin: 0 0 8px; color: var(--color-brand-700); font-size: 11px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; }
.detail-section h2 { margin: 0; font-size: 22px; line-height: 1.35; letter-spacing: -0.025em; font-weight: 600; }
.detail-section > p:last-child { max-width: 70ch; margin: 12px 0 0; color: var(--color-ink-600); font-size: 14px; line-height: 1.75; }
.detail-section--pricing { border-bottom: 0; }
.booking-panel { position: sticky; top: 104px; padding: 25px; border: 1px solid var(--color-ink-200); border-radius: var(--radius-lg); background: var(--color-ink-25); box-shadow: var(--shadow-e2); }
.booking-panel__topline { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.booking-panel__icon { display: grid; width: 46px; height: 46px; place-items: center; border: 1px solid var(--color-brand-100); border-radius: 14px; background: var(--color-brand-50); color: var(--color-brand-700); }
.booking-panel__category { color: var(--color-ink-600); font-size: 12px; text-align: right; }
.booking-panel h2 { margin: 19px 0 0; font-size: 19px; line-height: 1.4; letter-spacing: -0.02em; font-weight: 600; }
.booking-price { display: flex; min-height: 112px; flex-direction: column; justify-content: center; gap: 7px; margin: 20px 0 18px; padding: 18px 0; border-top: 1px solid var(--color-ink-200); border-bottom: 1px solid var(--color-ink-200); }
.booking-price__label { color: var(--color-ink-600); font-size: 12px; }
.booking-price__amount { display: flex; flex-wrap: wrap; align-items: baseline; gap: 5px; color: var(--color-ink-900); font-family: var(--font-num); font-size: 29px; line-height: 1.25; font-variant-numeric: tabular-nums; }
.booking-price__amount small { color: var(--color-ink-600); font-family: var(--font-sans); font-size: 12px; font-weight: 500; }
.booking-price__inspection { color: var(--color-ink-900); font-size: 19px; font-weight: 600; }
.booking-price__unknown { max-width: 28ch; color: var(--color-ink-700); font-size: 14px; line-height: 1.5; font-weight: 600; }
.booking-price__range { color: var(--color-ink-600); font-size: 12px; }
.booking-panel__note { margin: 12px 0 0; color: var(--color-ink-600); font-size: 12px; line-height: 1.55; text-align: center; }
.booking-panel__browse { display: flex; min-height: 44px; align-items: center; justify-content: center; gap: 7px; margin-top: 16px; color: var(--color-brand-700); font-size: 13px; font-weight: 600; text-decoration: none; }
.booking-panel__browse:hover { color: var(--color-brand-800); text-decoration: underline; text-underline-offset: 3px; }
.detail-loading { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 380px); gap: clamp(36px, 8vw, 100px); }
.detail-loading__copy { display: flex; flex-direction: column; gap: 22px; }
.detail-loading__price { min-height: 330px; }
.detail-error-link { display: inline-flex; min-height: 44px; align-items: center; color: var(--color-brand-700); font-size: 13px; font-weight: 600; }
@keyframes detail-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 820px) {
  .service-detail { width: min(100% - 40px, 720px); padding-top: 24px; }
  .detail-layout, .detail-loading { grid-template-columns: minmax(0, 1fr); gap: 26px; }
  .booking-panel { position: static; }
  .detail-back { margin-bottom: 23px; }
}
@media (max-width: 560px) {
  .service-detail { width: min(100% - 32px, 460px); padding: 17px 0 64px; }
  .detail-breadcrumb { gap: 7px; font-size: 11px; }
  .detail-back { margin-top: 13px; margin-bottom: 14px; }
  .detail-intro { padding-top: 8px; }
  .detail-intro h1 { margin-top: 20px; font-size: clamp(34px, 9vw, 42px); }
  .detail-lead { margin-top: 13px; font-size: 14px; }
  .detail-facts { gap: 8px; margin-top: 21px; }
  .detail-fact { min-height: 38px; padding-inline: 10px; font-size: 11px; }
  .detail-section { padding: 26px 0; }
  .detail-section h2 { font-size: 20px; }
  .booking-panel { padding: 20px; }
  .booking-price__amount { font-size: 26px; }
}
@media (prefers-reduced-motion: reduce) {
  .service-detail, .service-detail * { scroll-behavior: auto !important; animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
</style>
