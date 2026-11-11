<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, ChevronDown, Clock, Search, Wrench } from 'lucide-vue-next';
import { FhButton, FhEmptyState, FhMoney, FhSkeleton } from '../../components';
import { catalogApi, type ServiceItem } from '../../api/catalog.api';
import { getHttpStatus } from '../../api/client';
import { getPublicServicePricing } from '../../utils/public-service-pricing';
import { useSmoothScroll } from '../../composables/useSmoothScroll';
import { getServiceArtworkUrl } from '../../utils/service-presentation';

const route = useRoute();
const router = useRouter();
const service = ref<ServiceItem | null>(null);
const loading = ref(true);
const loadError = ref(false);
const notFound = ref(false);
let requestId = 0;

const reduceMotion = typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reduceMotion) useSmoothScroll();

type PublicPrice =
  | { kind: 'fixed'; amount: number; unit: string | null }
  | { kind: 'range'; min: number; max: number; reference: boolean }
  | { kind: 'survey-reference'; amount: number }
  | { kind: 'survey' }
  | { kind: 'unknown' };

function isCatalogAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

const pricing = computed<PublicPrice>(() => {
  const current = service.value;
  if (!current) return { kind: 'unknown' };

  const summary = current.priceSummary;
  if (summary) {
    if (summary.kind === 'fixed_range') {
      const min = summary.minLaborVnd;
      const max = summary.maxLaborVnd;
      if (!isCatalogAmount(min) || !isCatalogAmount(max) || max < min) return { kind: 'unknown' };
      return { kind: 'range', min, max, reference: false };
    }

    if (summary.kind === 'inspection_reference') {
      const reference = isCatalogAmount(summary.suggestedLaborVnd)
        ? summary.suggestedLaborVnd
        : isCatalogAmount(summary.minLaborVnd) ? summary.minLaborVnd : null;
      return reference === null ? { kind: 'survey' } : { kind: 'survey-reference', amount: reference };
    }

    if (summary.kind === 'inspection_only') return { kind: 'survey' };
    return { kind: 'unknown' };
  }

  const legacy = getPublicServicePricing(current);
  if (legacy.kind === 'fixed') return { kind: 'fixed', amount: legacy.amount, unit: current.unit ?? null };
  if (legacy.kind === 'inspection' && legacy.referenceRange) {
    return { kind: 'range', ...legacy.referenceRange, reference: true };
  }
  if (legacy.kind === 'inspection') return { kind: 'survey' };
  return { kind: 'unknown' };
});

const pricingLabel = computed(() => {
  switch (pricing.value.kind) {
    case 'fixed': return 'Giá niêm yết';
    case 'range': return pricing.value.reference ? 'Khoảng giá tham khảo' : 'Giá công theo thiết bị/phạm vi';
    case 'survey-reference': return 'Mức tham khảo';
    case 'survey': return 'Cần khảo sát';
    case 'unknown': return 'Giá chưa được cập nhật';
    default: return 'Giá chưa được cập nhật';
  }
});

const pricingNote = computed(() => {
  switch (pricing.value.kind) {
    case 'fixed': return 'Giá hiển thị theo dịch vụ đã chọn. Hạng mục ngoài phạm vi, nếu có, sẽ được báo riêng để bạn duyệt.';
    case 'range': return pricing.value.reference
      ? 'Đây là khoảng tham khảo. Kỹ thuật viên khảo sát và gửi báo giá để bạn duyệt.'
      : 'Tiền công phụ thuộc thiết bị và phạm vi. Kỹ thuật viên khảo sát và xác nhận chi phí với bạn trước khi sửa.';
    case 'survey-reference': return 'Đây là mức tham khảo. Kỹ thuật viên khảo sát, báo giá để bạn duyệt.';
    case 'survey': return 'Kỹ thuật viên khảo sát tình trạng thực tế và gửi báo giá để bạn duyệt.';
    case 'unknown': return 'Chưa có thông tin giá từ danh mục. Vui lòng xác nhận chi phí trước khi gửi yêu cầu.';
    default: return 'Chưa có thông tin giá từ danh mục. Vui lòng xác nhận chi phí trước khi gửi yêu cầu.';
  }
});

function conciseDescription(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  if (text.length <= 160) return text;
  const firstSentence = text.slice(0, 180).match(/^(.{50,180}?[.!?])(?:\s|$)/u)?.[1];
  if (firstSentence) return firstSentence;
  const end = text.lastIndexOf(' ', 157);
  return `${text.slice(0, end > 0 ? end : 157).trimEnd()}…`;
}

const introDescription = computed(() => {
  const current = service.value;
  return conciseDescription(current?.description || current?.scopeDescription);
});

async function loadService() {
  const currentRequest = ++requestId;
  const slug = String(route.params.slug ?? '');
  loading.value = true;
  loadError.value = false;
  notFound.value = false;
  service.value = null;
  try {
    const result = await catalogApi.getService(slug);
    if (currentRequest === requestId) service.value = result;
  } catch (error) {
    if (currentRequest === requestId) {
      notFound.value = getHttpStatus(error) === 404;
      loadError.value = !notFound.value;
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
      <ArrowLeft :size="17" aria-hidden="true" /> Tất cả dịch vụ
    </button>

    <div v-if="loading" class="detail-layout detail-layout--loading" aria-label="Đang tải thông tin dịch vụ">
      <header class="detail-intro detail-loading__intro" aria-hidden="true">
        <FhSkeleton width="130px" height="16px" />
        <FhSkeleton width="min(72%, 520px)" height="46px" />
        <FhSkeleton width="min(58%, 390px)" height="18px" />
        <div class="detail-loading__facts"><FhSkeleton width="150px" height="20px" /><FhSkeleton width="170px" height="20px" /></div>
      </header>
      <aside class="booking-panel booking-panel--loading" aria-hidden="true">
        <FhSkeleton width="120px" height="16px" />
        <FhSkeleton width="115px" height="15px" />
        <FhSkeleton width="210px" height="37px" />
        <FhSkeleton width="100%" height="50px" rounded="md" />
      </aside>
      <div class="detail-information detail-information--loading" aria-hidden="true">
        <FhSkeleton width="190px" height="24px" />
        <FhSkeleton width="100%" height="16px" :count="3" />
      </div>
    </div>

    <FhEmptyState
      v-else-if="notFound"
      title="Không tìm thấy dịch vụ này"
      description="Dịch vụ có thể đã được gỡ khỏi danh mục."
    >
      <template #extra>
        <RouterLink class="detail-error-link" to="/services">Xem danh sách dịch vụ</RouterLink>
      </template>
    </FhEmptyState>

    <FhEmptyState
      v-else-if="loadError"
      title="Không thể tải thông tin dịch vụ"
      description="Kết nối đang gián đoạn. Vui lòng thử lại."
      action-text="Thử lại"
      @action="loadService"
    >
      <template #extra>
        <RouterLink class="detail-error-link" to="/services">Xem danh sách dịch vụ</RouterLink>
      </template>
    </FhEmptyState>

    <div v-else-if="service" class="detail-layout">
      <header class="detail-intro">
        <div class="detail-intro__layout">
          <div class="detail-intro__content">
            <div class="detail-eyebrow">
              <span class="detail-icon"><Wrench :size="17" :stroke-width="1.8" aria-hidden="true" /></span>
              <span>{{ service.category?.name ?? 'Dịch vụ tại nhà' }}</span>
            </div>
            <h1>{{ service.name }}</h1>
            <p v-if="introDescription" class="detail-lead">{{ introDescription }}</p>
            <div class="detail-facts" aria-label="Thông tin dịch vụ">
              <div v-if="service.estimatedMinutes > 0" class="detail-fact">
                <Clock :size="16" aria-hidden="true" />
                <span>Thời lượng dự kiến</span>
                <strong>~{{ service.estimatedMinutes }} phút</strong>
              </div>
              <div class="detail-fact detail-fact--status">
                <span class="detail-status-dot" :class="{ 'detail-status-dot--off': !service.isActive }" aria-hidden="true"></span>
                <span>{{ service.isActive ? 'Đang nhận yêu cầu' : 'Tạm ngưng nhận yêu cầu' }}</span>
              </div>
            </div>
          </div>

          <div class="detail-intro__artwork" aria-hidden="true">
            <div class="detail-artwork-card">
              <img
                :src="getServiceArtworkUrl(service)"
                :alt="service.name"
                class="detail-artwork-img"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </header>

      <aside class="booking-panel" aria-labelledby="booking-title">
        <div class="booking-panel__topline">
          <span class="booking-panel__icon">
            <img
              :src="getServiceArtworkUrl(service)"
              alt=""
              class="w-full h-full object-contain p-1"
              aria-hidden="true"
            />
          </span>
          <span class="booking-panel__category">Giá và đặt lịch</span>
        </div>
        <h2 id="booking-title" class="sr-only">Đặt dịch vụ này</h2>

        <div class="booking-price" :class="`booking-price--${pricing.kind}`" data-testid="service-price-summary" aria-live="polite">
          <span class="booking-price__label">{{ pricingLabel }}</span>
          <strong v-if="pricing.kind === 'fixed'" class="booking-price__amount">
            <FhMoney :amount="pricing.amount" />
            <small v-if="pricing.unit">/ {{ pricing.unit }}</small>
          </strong>
          <div v-else-if="pricing.kind === 'range'" class="booking-price__range">
            <FhMoney :amount="pricing.min" />
            <template v-if="pricing.max !== pricing.min">
              <span aria-hidden="true">–</span>
              <FhMoney :amount="pricing.max" />
            </template>
          </div>
          <strong v-else-if="pricing.kind === 'survey-reference'" class="booking-price__amount">
            <span class="booking-price__qualifier">Tham khảo</span>
            <FhMoney :amount="pricing.amount" />
          </strong>
          <strong v-else-if="pricing.kind === 'survey'" class="booking-price__survey">Báo giá sau khảo sát</strong>
          <strong v-else class="booking-price__unknown">Chưa có thông tin giá</strong>
          <p class="booking-price__note">{{ pricingNote }}</p>
        </div>

        <FhButton
          variant="primary"
          size="lg"
          block
          :disabled="!service.isActive"
          data-testid="detail-booking"
          @click="bookService"
        >
          {{ service.isActive ? 'Chọn dịch vụ' : 'Tạm ngưng' }} <ArrowRight :size="17" aria-hidden="true" />
        </FhButton>
        <p class="booking-panel__note">
          {{ service.isActive ? 'Bạn sẽ xem lại thông tin trước khi gửi yêu cầu.' : 'Dịch vụ này hiện chưa thể được chọn.' }}
        </p>
        <RouterLink class="booking-panel__browse" to="/services">
          <Search :size="15" aria-hidden="true" /> Xem dịch vụ khác
        </RouterLink>
      </aside>

      <section v-if="service.description || service.scopeDescription" class="detail-information" aria-labelledby="service-information-heading">
        <p class="detail-kicker">Thông tin dịch vụ</p>
        <h2 id="service-information-heading">Phạm vi và điều kiện</h2>
        <details class="service-details" data-testid="service-description-details">
          <summary>
            <span>Xem mô tả đầy đủ, điều kiện và bảo hành</span>
            <ChevronDown :size="18" aria-hidden="true" />
          </summary>
          <div class="service-details__content">
            <div v-if="service.scopeDescription" class="service-details__block">
              <h3>Phạm vi công việc</h3>
              <p>{{ service.scopeDescription }}</p>
            </div>
            <div v-if="service.description && service.description !== service.scopeDescription" class="service-details__block">
              <h3>{{ service.scopeDescription ? 'Mô tả dịch vụ' : 'Mô tả và điều kiện dịch vụ' }}</h3>
              <p>{{ service.description }}</p>
            </div>
          </div>
        </details>
      </section>
    </div>
  </div>
</template>

<style scoped>
.service-detail {
  --detail-ease: cubic-bezier(0.22, 1, 0.36, 1);
  width: min(calc(100% - 56px), 1560px);
  margin-inline: auto;
  padding: 24px 0 88px;
  color: var(--color-ink-900);
  animation: detail-enter 260ms var(--detail-ease) both;
}

.detail-breadcrumb { display: flex; min-width: 0; align-items: center; gap: 9px; color: var(--color-ink-600); font-size: 12px; }
.detail-breadcrumb a { color: inherit; text-decoration: none; }
.detail-breadcrumb a:hover { color: var(--color-brand-700); text-decoration: underline; text-underline-offset: 3px; }
.detail-breadcrumb__current { overflow: hidden; color: var(--color-ink-800); text-overflow: ellipsis; white-space: nowrap; }
.detail-back { display: inline-flex; min-height: 44px; align-items: center; gap: 8px; margin: 10px 0 23px; padding: 0 8px 0 0; border: 0; background: transparent; color: var(--color-ink-700); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.detail-back:hover { color: var(--color-brand-700); }
.detail-back:focus-visible, .detail-breadcrumb a:focus-visible, .booking-panel__browse:focus-visible, .detail-error-link:focus-visible, .service-details summary:focus-visible { outline: 2px solid var(--color-brand-600); outline-offset: 3px; border-radius: 4px; }

.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(310px, 360px); grid-template-areas: 'intro panel' 'information panel'; align-items: start; column-gap: clamp(44px, 6.2vw, 104px); row-gap: 34px; }
.detail-intro { grid-area: intro; min-width: 0; padding: 12px 0 28px; border-bottom: 1px solid var(--color-ink-200); }
.detail-intro__layout { display: flex; align-items: flex-start; justify-content: space-between; gap: 28px; }
.detail-intro__content { flex: 1; min-width: 0; }
.detail-intro__artwork { display: none; flex-shrink: 0; }
@media (min-width: 640px) {
  .detail-intro__artwork { display: flex; align-items: center; justify-content: center; }
  .detail-artwork-card {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 136px;
    height: 136px;
    border-radius: var(--radius-lg);
    background: linear-gradient(135deg, var(--color-brand-50) 0%, var(--color-ink-50) 100%);
    border: 1px solid var(--color-brand-100);
    padding: 12px;
    box-shadow: var(--shadow-e1);
  }
  .detail-artwork-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.08));
  }
}
@media (min-width: 1024px) {
  .detail-artwork-card { width: 160px; height: 160px; padding: 16px; }
}
.detail-eyebrow { display: flex; align-items: center; gap: 10px; color: var(--color-brand-800); font-size: 13px; font-weight: 600; }
.detail-icon { display: grid; width: 36px; height: 36px; flex: 0 0 auto; place-items: center; border: 1px solid var(--color-brand-100); border-radius: var(--radius-sm); background: var(--color-brand-50); color: var(--color-brand-700); }
.detail-intro h1 { max-width: 900px; margin: 20px 0 0; font-size: clamp(34px, 3.4vw, 52px); line-height: 1.12; letter-spacing: -0.04em; font-weight: 700; text-wrap: balance; overflow-wrap: anywhere; }
.detail-lead { max-width: 62ch; margin: 12px 0 0; color: var(--color-ink-600); font-size: 15px; line-height: 1.65; text-wrap: pretty; }
.detail-facts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; margin-top: 20px; }
.detail-fact { display: inline-flex; min-height: 34px; align-items: center; gap: 7px; color: var(--color-ink-600); font-size: 12px; }
.detail-fact svg { flex: 0 0 auto; color: var(--color-brand-700); }
.detail-fact strong { color: var(--color-ink-800); font-weight: 600; white-space: nowrap; }
.detail-status-dot { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: var(--color-success-600); }
.detail-status-dot--off { background: var(--color-ink-400); }

.booking-panel { grid-area: panel; position: sticky; top: 96px; min-width: 0; padding: 21px; border: 1px solid var(--color-ink-200); border-radius: var(--radius-lg); background: var(--color-ink-25); box-shadow: var(--shadow-e1); }
.booking-panel__topline { display: flex; align-items: center; gap: 11px; color: var(--color-ink-600); font-size: 12px; font-weight: 500; }
.booking-panel__icon { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border: 1px solid var(--color-brand-100); border-radius: var(--radius-sm); background: var(--color-brand-50); color: var(--color-brand-700); }
.booking-price { display: flex; min-width: 0; flex-direction: column; align-items: flex-start; gap: 7px; margin: 17px 0 16px; padding: 16px 0 14px; border-top: 1px solid var(--color-ink-200); border-bottom: 1px solid var(--color-ink-200); }
.booking-price__label { color: var(--color-ink-600); font-size: 12px; font-weight: 500; }
.booking-price__amount { display: flex; max-width: 100%; flex-wrap: wrap; align-items: baseline; gap: 4px 7px; color: var(--color-ink-900); font-family: var(--font-num); font-size: clamp(24px, 2.3vw, 31px); line-height: 1.22; font-variant-numeric: tabular-nums; }
.booking-price__amount small { color: var(--color-ink-600); font-family: var(--font-sans); font-size: 12px; font-weight: 500; }
.booking-price__qualifier { color: var(--color-ink-600); font-family: var(--font-sans); font-size: 12px; font-weight: 500; }
.booking-price__range { display: flex; max-width: 100%; flex-wrap: wrap; align-items: baseline; gap: 3px 7px; color: var(--color-ink-900); font-family: var(--font-num); font-size: clamp(20px, 2vw, 27px); line-height: 1.3; font-variant-numeric: tabular-nums; }
.booking-price :deep(.font-num) { font-size: inherit; }
.booking-price__survey { color: var(--color-ink-900); font-size: 18px; line-height: 1.35; font-weight: 600; }
.booking-price__unknown { color: var(--color-ink-700); font-size: 15px; line-height: 1.4; font-weight: 600; }
.booking-price__note { margin: 1px 0 0; color: var(--color-ink-600); font-size: 12px; line-height: 1.55; }
.booking-panel__note { margin: 9px 0 0; color: var(--color-ink-600); font-size: 12px; line-height: 1.5; }
.booking-panel__browse { display: inline-flex; min-height: 44px; align-items: center; gap: 7px; margin-top: 4px; color: var(--color-brand-700); font-size: 13px; font-weight: 600; text-decoration: none; }
.booking-panel__browse:hover { color: var(--color-brand-800); text-decoration: underline; text-underline-offset: 3px; }

.detail-information { grid-area: information; min-width: 0; }
.detail-kicker { margin: 0 0 7px; color: var(--color-brand-700); font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.detail-information > h2 { margin: 0 0 16px; font-size: 22px; line-height: 1.35; letter-spacing: -0.025em; font-weight: 600; }
.service-details { border-top: 1px solid var(--color-ink-200); border-bottom: 1px solid var(--color-ink-200); }
.service-details summary { display: flex; min-height: 56px; align-items: center; justify-content: space-between; gap: 16px; color: var(--color-ink-800); font-size: 14px; font-weight: 600; cursor: pointer; list-style: none; }
.service-details summary::-webkit-details-marker { display: none; }
.service-details summary svg { flex: 0 0 auto; color: var(--color-brand-700); transition: transform 160ms ease-out; }
.service-details[open] summary svg { transform: rotate(180deg); }
.service-details__content { display: grid; gap: 18px; padding: 1px 0 20px; }
.service-details__block h3 { margin: 0 0 6px; color: var(--color-ink-800); font-size: 13px; font-weight: 600; }
.service-details__block p { max-width: 72ch; margin: 0; color: var(--color-ink-600); font-size: 14px; line-height: 1.7; white-space: pre-line; }
.detail-error-link { display: inline-flex; min-height: 44px; align-items: center; color: var(--color-brand-700); font-size: 13px; font-weight: 600; }

.detail-layout--loading { min-height: 390px; }
.detail-loading__intro { display: flex; flex-direction: column; align-items: flex-start; gap: 19px; }
.detail-loading__facts { display: flex; flex-wrap: wrap; gap: 10px 22px; padding-top: 2px; }
.booking-panel--loading { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; }
.booking-panel--loading :deep(:last-child) { align-self: stretch; }
.detail-information--loading { display: grid; gap: 14px; }

@keyframes detail-enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

@media (min-width: 1440px) {
  .service-detail { width: min(calc(100% - 24px), 1560px); }
}

@media (max-width: 900px) {
  .service-detail { width: min(calc(100% - 40px), 760px); padding-top: 22px; }
  .detail-layout { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'intro' 'panel' 'information'; gap: 24px; }
  .detail-intro { padding-bottom: 22px; }
  .booking-panel { position: static; padding: 20px; }
  .booking-price { margin: 14px 0 15px; padding: 13px 0; }
  .booking-panel__browse { margin-top: 1px; }
}

@media (max-width: 560px) {
  .service-detail { width: calc(100% - 32px); padding: 15px 0 64px; }
  .detail-breadcrumb { gap: 7px; font-size: 11px; }
  .detail-back { min-height: 44px; margin: 6px 0 13px; }
  .detail-layout { gap: 18px; }
  .detail-intro { padding: 4px 0 18px; }
  .detail-eyebrow { gap: 9px; font-size: 12px; }
  .detail-icon { width: 32px; height: 32px; }
  .detail-intro h1 { margin-top: 15px; font-size: clamp(30px, 8.5vw, 38px); line-height: 1.15; }
  .detail-lead { margin-top: 9px; font-size: 14px; line-height: 1.6; }
  .detail-facts { gap: 4px 16px; margin-top: 13px; }
  .detail-fact { min-height: 32px; font-size: 11px; }
  .booking-panel { padding: 17px; border-radius: var(--radius-md); }
  .booking-panel__icon { width: 34px; height: 34px; }
  .booking-price__amount { font-size: clamp(24px, 7vw, 28px); }
  .booking-price__range { font-size: clamp(19px, 5.6vw, 23px); }
  .booking-panel__note { margin-top: 8px; }
  .booking-panel__browse { margin-top: 3px; }
  .detail-information > h2 { font-size: 20px; }
}

@media (max-height: 720px) and (min-width: 901px) {
  .booking-panel { position: static; }
}

@media (prefers-reduced-motion: reduce) {
  .service-detail, .service-detail * { scroll-behavior: auto !important; animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
</style>
