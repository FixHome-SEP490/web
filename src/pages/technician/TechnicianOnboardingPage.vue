<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import {
  User,
  ShieldCheck,
  Wrench,
  MapPin,
  CheckCircle2,
  Clock,
  Camera,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Sparkles,
  CreditCard,
  FileCheck2,
  LogOut,
  RefreshCw,
  Search,
  Building2,
  Zap,
  Crosshair,
  Wallet,
} from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import { FhButton } from '../../components';
import { technicianOnboardingApi } from '../../api/technician-onboarding.api';
import {
  technicianVerificationApi,
  type KycDocumentType,
  type KycMimeType,
  type SubmitDocumentPayload,
} from '../../api/technician-verification.api';
import { catalogApi, type ServiceCategory, type ServiceItem } from '../../api/catalog.api';
import { walletApi, type WalletSummary } from '../../api/wallet.api';
import { geoApi, type PlaceSuggestion } from '../../api/geo.api';
import {
  vietnamProvincesApi,
  type Province,
  type District,
  type Ward,
} from '../../api/vietnam-provinces.api';
import {
  getDistrictCoordinates,
  getDistrictDistanceKm,
  type LatLng,
} from '../../utils/vietnam-geo-coordinates';
import type {
  Gender,
  OnboardingStatusResponse,
} from '../../types/technician-onboarding.types';
import { userFacingError } from '../../utils/user-facing-error';
import { parseDayKey, vnParts } from '../../utils/vn-time';

const router = useRouter();
const authStore = useAuthStore();

// Step indicator definition
const STEPS = [
  { id: 1, title: 'Thông tin cá nhân', desc: 'Định danh pháp lý', icon: User },
  { id: 2, title: 'Xác thực eKYC', desc: 'CCCD & Khuôn mặt', icon: ShieldCheck },
  { id: 3, title: 'Kỹ năng chuyên môn', desc: 'Dịch vụ & Tay nghề', icon: Wrench },
  { id: 4, title: 'Địa chỉ & Khu vực', desc: 'Vị trí nhận việc', icon: MapPin },
  { id: 5, title: 'Xác nhận & Gửi duyệt', desc: 'Phê duyệt hồ sơ', icon: FileCheck2 },
];

const currentStep = ref(1);
const loading = ref(true);
const saving = ref(false);
const statusData = ref<OnboardingStatusResponse | null>(null);
const wallet = ref<WalletSummary | null>(null);
const isReviewing = ref(false);

// ----------------- Step 1: Personal Info -----------------
const fullName = ref(authStore.user?.fullName || '');
const dateOfBirth = ref('');
const gender = ref<Gender>('male');
const citizenIdNumber = ref('');
const phoneNumber = ref(authStore.user?.phoneNumber || '');

const step1Errors = ref<Record<string, string>>({});

const validateAge = (dobString: string): boolean => {
  if (!dobString) return false;
  // The birth date is a calendar day; today is today in Vietnam.
  const dob = parseDayKey(dobString.slice(0, 10));
  if (!dob) return false;
  const today = vnParts();
  let age = today.year - dob.year;
  if (today.month < dob.month || (today.month === dob.month && today.day < dob.day)) {
    age--;
  }
  return age >= 18;
};

const validateStep1 = (): boolean => {
  const errs: Record<string, string> = {};
  if (!fullName.value.trim() || fullName.value.trim().length < 2) {
    errs.fullName = 'Họ và tên tối thiểu 2 ký tự';
  }
  if (!dateOfBirth.value) {
    errs.dateOfBirth = 'Vui lòng chọn ngày sinh';
  } else if (!validateAge(dateOfBirth.value)) {
    errs.dateOfBirth = 'Bạn phải đủ 18 tuổi trở lên để làm thợ';
  }
  if (!citizenIdNumber.value || !/^\d{12}$/.test(citizenIdNumber.value)) {
    errs.citizenIdNumber = 'Số CCCD phải gồm đúng 12 chữ số';
  }
  if (phoneNumber.value && !/^0[35789]\d{8}$/.test(phoneNumber.value)) {
    errs.phoneNumber = 'Số điện thoại không hợp lệ (10 số, đầu 03, 05, 07, 08, 09)';
  }
  step1Errors.value = errs;
  return Object.keys(errs).length === 0;
};

const getErrorMessage = (err: unknown, fallback: string): string => userFacingError(err, fallback);

// ----------------- Step 2: KYC Documents -----------------
interface KycSlot {
  key: 'front' | 'back' | 'face';
  documentType: KycDocumentType;
  label: string;
  hint: string;
  kind: 'image' | 'video';
  file: File | null;
  previewUrl: string | null;
  uploaded: boolean;
  storageObjectPath?: string;
  existingFileName?: string;
  fileSize?: number;
  mimeType?: string;
  optional?: boolean;
}

const slots = ref<KycSlot[]>([
  {
    key: 'front',
    documentType: 'citizen_id_front',
    label: 'CCCD – Mặt trước',
    hint: 'Chụp rõ 4 góc, không lóa sáng, thấy rõ số CCCD và ảnh',
    kind: 'image',
    file: null,
    previewUrl: null,
    uploaded: false,
  },
  {
    key: 'back',
    documentType: 'citizen_id_back',
    label: 'CCCD – Mặt sau',
    hint: 'Chụp rõ đặc điểm nhận dạng và ngày cấp',
    kind: 'image',
    file: null,
    previewUrl: null,
    uploaded: false,
  },
  {
    key: 'face',
    documentType: 'face_photo',
    label: 'Ảnh chân dung khuôn mặt',
    hint: 'Khuôn mặt rõ ràng, nhìn thẳng, không đeo kính râm hay khẩu trang',
    kind: 'image',
    file: null,
    previewUrl: null,
    uploaded: false,
  },
]);

const frontInput = ref<HTMLInputElement | null>(null);
const backInput = ref<HTMLInputElement | null>(null);
const faceInput = ref<HTMLInputElement | null>(null);

const triggerFileInput = (key: 'front' | 'back' | 'face') => {
  if (key === 'front') {
    frontInput.value?.click();
  } else if (key === 'back') {
    backInput.value?.click();
  } else if (key === 'face') {
    faceInput.value?.click();
  }
};

const showCameraModal = ref(false);
const cameraVideoEl = ref<HTMLVideoElement | null>(null);
let mediaStream: MediaStream | null = null;
const isCapturing = ref(false);

const openCamera = async () => {
  showCameraModal.value = true;
  await nextTick();
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    if (cameraVideoEl.value) {
      cameraVideoEl.value.srcObject = mediaStream;
      await cameraVideoEl.value.play();
    }
  } catch {
    toast.error('Không thể mở camera. Vui lòng cho phép quyền truy cập hoặc tải ảnh từ thiết bị.');
    closeCamera();
  }
};

const closeCamera = () => {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  showCameraModal.value = false;
  isCapturing.value = false;
};

const takeFacePhoto = () => {
  if (!cameraVideoEl.value) return;
  isCapturing.value = true;
  try {
    const video = cameraVideoEl.value;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('Không thể chụp ảnh từ camera');
        isCapturing.value = false;
        return;
      }
      const file = new File([blob], `face_photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const slot = slots.value.find((s) => s.key === 'face');
      if (slot) {
        slot.file = file;
        slot.previewUrl = URL.createObjectURL(blob);
        slot.uploaded = false;
        slot.storageObjectPath = undefined;
      }
      toast.success('Đã chụp ảnh chân dung thành công!');
      closeCamera();
    }, 'image/jpeg', 0.92);
  } catch {
    toast.error('Lỗi khi chụp ảnh');
    isCapturing.value = false;
  }
};

const handleFileSelect = (slotKey: 'front' | 'back' | 'face', event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    toast.error('Kích thước tập tin tối đa 10MB');
    input.value = '';
    return;
  }

  const slot = slots.value.find((s) => s.key === slotKey);
  if (!slot) return;

  slot.file = file;
  slot.previewUrl = URL.createObjectURL(file);
  slot.uploaded = false;
  slot.storageObjectPath = undefined;
};

const getKycUploadMeta = (
  file: File,
  documentType: KycDocumentType,
): { mimeType: KycMimeType; fileName: string } => {
  let mimeType: KycMimeType = 'image/jpeg';
  if (file.type === 'image/png') {
    mimeType = 'image/png';
  } else if (file.type === 'image/webp') {
    mimeType = 'image/webp';
  } else {
    mimeType = 'image/jpeg';
  }

  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `${documentType}_${Date.now()}.${ext}`;

  return { mimeType, fileName };
};

const uploadKycDocuments = async (): Promise<boolean> => {
  for (const slot of slots.value) {
    if (!slot.file && !slot.uploaded && !slot.optional) {
      toast.error(`Vui lòng tải lên ${slot.label}`);
      return false;
    }
  }

  const hasNewFiles = slots.value.some((s) => !!s.file);
  if (!hasNewFiles) {
    return true;
  }

  saving.value = true;
  try {
    const uploadPayloads: SubmitDocumentPayload[] = [];

    for (const slot of slots.value) {
      if (slot.file) {
        const { mimeType, fileName } = getKycUploadMeta(slot.file, slot.documentType);

        // Request short-lived signed upload URL from backend
        const slotInfo = await technicianVerificationApi.requestUploadUrl(mimeType);

        // Upload file directly to Supabase Storage signed URL
        await technicianVerificationApi.uploadToSignedUrl(slotInfo.uploadUrl, mimeType, slot.file);

        slot.storageObjectPath = slotInfo.storageObjectPath;
        slot.uploaded = true;
        slot.existingFileName = fileName;
        slot.fileSize = slot.file.size;
        slot.mimeType = mimeType;

        uploadPayloads.push({
          documentType: slot.documentType,
          storageObjectPath: slotInfo.storageObjectPath,
          fileName,
          fileSize: slot.file.size,
          mimeType,
        });
      } else if (slot.uploaded && slot.storageObjectPath) {
        uploadPayloads.push({
          documentType: slot.documentType,
          storageObjectPath: slot.storageObjectPath,
          fileName: slot.existingFileName || `${slot.documentType}.jpg`,
          fileSize: slot.fileSize || 500000,
          mimeType: (slot.mimeType as KycMimeType) || 'image/jpeg',
        });
      }
    }

    try {
      await technicianVerificationApi.submit(uploadPayloads);
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } };
      if (error?.response?.status === 409) {
        toast.info('Hồ sơ eKYC của bạn đã được gửi trước đó và đang chờ duyệt.');
        return true;
      }
      throw err;
    }

    toast.success('Đã tải lên và xác thực hồ sơ KYC thành công!');
    return true;
  } catch (err: unknown) {
    const errorMsg = getErrorMessage(err, 'Tải ảnh xác thực KYC thất bại. Vui lòng thử lại.');
    toast.error(errorMsg);
    return false;
  } finally {
    saving.value = false;
  }
};

// ----------------- Step 3: Skills Selection -----------------
const categories = ref<ServiceCategory[]>([]);
const allServices = ref<ServiceItem[]>([]);
const selectedServiceIds = ref<string[]>([]);
const yearsExperience = ref<number>(2);
const bio = ref<string>('');
const skillSearch = ref<string>('');

const filteredServices = computed(() => {
  if (!skillSearch.value.trim()) return allServices.value;
  const q = skillSearch.value.toLowerCase();
  return allServices.value.filter(
    (s) => s.name.toLowerCase().includes(q) || s.category?.name.toLowerCase().includes(q),
  );
});

const groupedServices = computed(() => {
  const map = new Map<string, { category: ServiceCategory; services: ServiceItem[] }>();
  for (const s of filteredServices.value) {
    const catId = s.categoryId || 'other';
    const cat = s.category || { id: catId, name: 'Khác', code: 'OTHER', sortOrder: 99, isActive: true };
    if (!map.has(catId)) {
      map.set(catId, { category: cat, services: [] });
    }
    map.get(catId)!.services.push(s);
  }
  return Array.from(map.values());
});

const toggleService = (serviceId: string) => {
  const idx = selectedServiceIds.value.indexOf(serviceId);
  if (idx >= 0) {
    selectedServiceIds.value.splice(idx, 1);
  } else {
    selectedServiceIds.value.push(serviceId);
  }
};

// ----------------- Step 4: Address, Service Radius & Service Areas -----------------
const fullAddress = ref('');
const addressSuggestions = ref<PlaceSuggestion[]>([]);
const selectedLat = ref<number | undefined>(undefined);
const selectedLng = ref<number | undefined>(undefined);
const serviceRadiusKm = ref<number>(15);

// Dual input mode: 'search' (MapTiler autocomplete) vs 'structured' (Administrative dropdowns)
const addressInputMode = ref<'search' | 'structured'>('search');

// Structured cascading fields
const structuredProvinceCode = ref<number | null>(79); // Default TP. Hồ Chí Minh
const structuredDistrictCode = ref<number | null>(null);
const structuredWardCode = ref<number | null>(null);
const structuredStreet = ref<string>('');
const structuredWards = ref<Ward[]>([]);
const loadingWards = ref<boolean>(false);

// Detected home location info
const detectedProvinceName = ref<string>('');
const detectedProvinceCode = ref<number | null>(null);
const detectedDistrictName = ref<string>('');
const detectedDistrictCode = ref<number | null>(null);

// Official Vietnam administrative divisions from provinces.open-api.vn
const provinces = ref<Province[]>([]);
const selectedProvinceCode = ref<number>(79); // Default to TP. Hồ Chí Minh (79)
const districtSearch = ref<string>('');
const districtFilterTab = ref<'all' | 'in_radius' | 'selected'>('all');
const selectedAreaKeys = ref<string[]>([]); // Format: `${provinceCode}:${districtCode}`

const addressSearchTimeout = ref<ReturnType<typeof setTimeout> | null>(null);

// Normalize Vietnamese string for robust matching
const normalizeVnText = (str: string): string => {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/thành phố|tp\.|tp|tỉnh|quận|huyện|thị xã|tx\.|thị trấn|tt\.|phường|xã/g, '')
    .trim();
};

// Automatic detection of Province/City and District from address string or suggestion
const detectAdministrativeUnits = (
  addressText: string,
  suggestion?: PlaceSuggestion,
  lat?: number,
  lng?: number,
) => {
  if (!provinces.value || provinces.value.length === 0) return;

  let matchedProv: Province | undefined;
  let matchedDist: District | undefined;

  // 1. Check suggestion's province field
  if (suggestion?.province) {
    const sProvNorm = normalizeVnText(suggestion.province);
    matchedProv = provinces.value.find((p) => {
      const pNorm = normalizeVnText(p.name);
      return pNorm === sProvNorm || pNorm.includes(sProvNorm) || sProvNorm.includes(pNorm);
    });
  }

  // 2. Check address string for province name
  if (!matchedProv && addressText) {
    const textNorm = normalizeVnText(addressText);
    const sorted = [...provinces.value].sort((a, b) => b.name.length - a.name.length);
    matchedProv = sorted.find((p) => {
      const pNorm = normalizeVnText(p.name);
      return (
        pNorm.length > 2 &&
        (textNorm.includes(pNorm) || (p.codename && addressText.toLowerCase().includes(p.codename.replace(/_/g, ' '))))
      );
    });
  }

  if (matchedProv) {
    const provChanged = selectedProvinceCode.value !== matchedProv.code;
    detectedProvinceName.value = matchedProv.name;
    detectedProvinceCode.value = matchedProv.code;
    selectedProvinceCode.value = matchedProv.code;
    structuredProvinceCode.value = matchedProv.code;

    if (provChanged) {
      selectedAreaKeys.value = selectedAreaKeys.value.filter((k) =>
        k.startsWith(`${matchedProv!.code}:`),
      );
    }

    // Match district within the province
    if (matchedProv.districts && matchedProv.districts.length > 0) {
      if (suggestion?.district) {
        const sDistNorm = normalizeVnText(suggestion.district);
        matchedDist = matchedProv.districts.find((d) => {
          const dNorm = normalizeVnText(d.name);
          return dNorm === sDistNorm || dNorm.includes(sDistNorm) || sDistNorm.includes(dNorm);
        });
      }

      if (!matchedDist && addressText) {
        const textNorm = normalizeVnText(addressText);
        const sortedD = [...matchedProv.districts].sort((a, b) => b.name.length - a.name.length);
        matchedDist = sortedD.find((d) => {
          const dNorm = normalizeVnText(d.name);
          return (
            dNorm.length > 1 &&
            (textNorm.includes(dNorm) || (d.codename && addressText.toLowerCase().includes(d.codename.replace(/_/g, ' '))))
          );
        });
      }

      // If text matching district wasn't definitive, but we have lat/lng, find nearest district centroid
      if (!matchedDist && lat && lng) {
        let minDist = Infinity;
        let closest: District | undefined;
        for (const d of matchedProv.districts) {
          const dist = getDistrictDistanceKm({ lat, lng }, matchedProv.code, d.code);
          if (dist !== null && dist < minDist) {
            minDist = dist;
            closest = d;
          }
        }
        if (closest && minDist < 40) {
          matchedDist = closest;
        }
      }

      if (matchedDist) {
        detectedDistrictName.value = matchedDist.name;
        detectedDistrictCode.value = matchedDist.code;
        structuredDistrictCode.value = matchedDist.code;
      }
    }
  }
};

const onAddressInput = () => {
  if (addressSearchTimeout.value) clearTimeout(addressSearchTimeout.value);
  if (!fullAddress.value.trim() || fullAddress.value.length < 3) {
    addressSuggestions.value = [];
    return;
  }
  addressSearchTimeout.value = setTimeout(async () => {
    try {
      const results = await geoApi.autocomplete(fullAddress.value);
      addressSuggestions.value = results;
      if (!selectedLat.value && results.length > 0) {
        detectAdministrativeUnits(fullAddress.value, results[0], results[0].lat, results[0].lng);
      } else {
        detectAdministrativeUnits(fullAddress.value);
      }
    } catch {
      addressSuggestions.value = [];
    }
  }, 350);
};

const selectAddressSuggestion = (s: PlaceSuggestion) => {
  fullAddress.value = s.description;
  selectedLat.value = s.lat;
  selectedLng.value = s.lng;
  addressSuggestions.value = [];

  detectAdministrativeUnits(s.description, s, s.lat, s.lng);
  toast.success('Đã xác định tọa độ và khu vực của bạn');

  nextTick(() => {
    autoSelectDistrictsWithinRadius(false);
  });
};

// Structured address handlers
const onStructuredProvinceChange = async () => {
  structuredDistrictCode.value = null;
  structuredWardCode.value = null;
  structuredWards.value = [];
  if (structuredProvinceCode.value) {
    selectedProvinceCode.value = structuredProvinceCode.value;
    const p = provinces.value.find((prov) => prov.code === structuredProvinceCode.value);
    if (p) {
      detectedProvinceName.value = p.name;
      detectedProvinceCode.value = p.code;
      detectedDistrictName.value = '';
      detectedDistrictCode.value = null;
    }
    // Only keep selected areas belonging to this province
    selectedAreaKeys.value = selectedAreaKeys.value.filter((k) =>
      k.startsWith(`${structuredProvinceCode.value}:`),
    );
  }
  syncAddressFromStructured();
};

const onStructuredDistrictChange = async () => {
  structuredWardCode.value = null;
  structuredWards.value = [];
  if (!structuredDistrictCode.value) {
    syncAddressFromStructured();
    return;
  }

  const p = provinces.value.find((prov) => prov.code === structuredProvinceCode.value);
  const d = p?.districts?.find((dist) => dist.code === structuredDistrictCode.value);
  if (d) {
    detectedDistrictName.value = d.name;
    detectedDistrictCode.value = d.code;

    const coords = getDistrictCoordinates(structuredProvinceCode.value!, d.code);
    if (coords) {
      selectedLat.value = coords.lat;
      selectedLng.value = coords.lng;
    }
  }

  loadingWards.value = true;
  try {
    const districtDetail = await vietnamProvincesApi.getDistrict(structuredDistrictCode.value, 2);
    structuredWards.value = districtDetail.wards || [];
  } catch (err) {
    console.warn('Could not load wards for district:', err);
    structuredWards.value = [];
  } finally {
    loadingWards.value = false;
  }

  syncAddressFromStructured();
  nextTick(() => {
    autoSelectDistrictsWithinRadius(false);
  });
};

const onStructuredWardChange = () => {
  syncAddressFromStructured();
};

const syncAddressFromStructured = () => {
  const prov = provinces.value.find((p) => p.code === structuredProvinceCode.value);
  const dist = prov?.districts?.find((d) => d.code === structuredDistrictCode.value);
  const ward = structuredWards.value.find((w) => w.code === structuredWardCode.value);

  const parts: string[] = [];
  if (structuredStreet.value.trim()) parts.push(structuredStreet.value.trim());
  if (ward) parts.push(ward.name);
  if (dist) parts.push(dist.name);
  if (prov) parts.push(prov.name);

  fullAddress.value = parts.join(', ');

  if (fullAddress.value.length > 5) {
    geoApi.autocomplete(fullAddress.value).then((results) => {
      if (results && results.length > 0) {
        selectedLat.value = results[0].lat;
        selectedLng.value = results[0].lng;
      }
    }).catch(() => {});
  }
};

const availableStructuredDistricts = computed<District[]>(() => {
  if (!structuredProvinceCode.value || !provinces.value) return [];
  const prov = provinces.value.find((p) => p.code === structuredProvinceCode.value);
  return prov?.districts || [];
});

const sortedProvinces = computed(() => {
  if (!provinces.value || provinces.value.length === 0) return [];
  const priorityCodes = [79, 1, 48, 74, 75, 31, 92]; // HCM, Hà Nội, Đà Nẵng, Bình Dương, Đồng Nai, Hải Phòng, Cần Thơ
  return [...provinces.value].sort((a, b) => {
    const aIdx = priorityCodes.indexOf(a.code);
    const bIdx = priorityCodes.indexOf(b.code);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.name.localeCompare(b.name, 'vi');
  });
});

const activeProvince = computed<Province | undefined>(() => {
  if (!provinces.value || provinces.value.length === 0) return undefined;
  if (detectedProvinceCode.value) {
    const matched = provinces.value.find((p) => p.code === detectedProvinceCode.value);
    if (matched) return matched;
  }
  return (
    provinces.value.find((p) => p.code === selectedProvinceCode.value) ||
    provinces.value.find((p) => p.code === 1) ||
    provinces.value.find((p) => p.code === 79) ||
    provinces.value[0]
  );
});

// User coordinates
const userCoordinates = computed<LatLng | null>(() => {
  if (selectedLat.value && selectedLng.value) {
    return { lat: selectedLat.value, lng: selectedLng.value };
  }
  if (selectedProvinceCode.value && detectedDistrictCode.value) {
    return getDistrictCoordinates(selectedProvinceCode.value, detectedDistrictCode.value);
  }
  return null;
});

// Districts with real-time distance and radius eligibility
const districtsWithDistance = computed(() => {
  if (!activeProvince.value?.districts) return [];
  const origin = userCoordinates.value;
  const pCode = activeProvince.value.code;

  return activeProvince.value.districts.map((d) => {
    const distanceKm = getDistrictDistanceKm(origin, pCode, d.code);
    const isWithinRadius = distanceKm !== null ? distanceKm <= serviceRadiusKm.value : true;
    const isSelected = isDistrictSelected(pCode, d.code);
    return {
      ...d,
      distanceKm,
      isWithinRadius,
      isSelected,
    };
  });
});

// Districts in active province within radius
const inRadiusDistricts = computed(() => {
  return districtsWithDistance.value.filter((d) => d.isWithinRadius && d.distanceKm !== null);
});

// Filtered and searched districts for display in grid
const displayedDistricts = computed(() => {
  let list = districtsWithDistance.value;

  if (districtFilterTab.value === 'in_radius') {
    list = list.filter((d) => d.isWithinRadius);
  } else if (districtFilterTab.value === 'selected') {
    list = list.filter((d) => d.isSelected);
  }

  if (districtSearch.value.trim()) {
    const q = districtSearch.value.toLowerCase().trim();
    list = list.filter(
      (d) => d.name.toLowerCase().includes(q) || d.codename.toLowerCase().includes(q),
    );
  }

  // Sort nearest first if distance available
  return [...list].sort((a, b) => {
    if (a.distanceKm !== null && b.distanceKm !== null) {
      return a.distanceKm - b.distanceKm;
    }
    if (a.distanceKm !== null) return -1;
    if (b.distanceKm !== null) return 1;
    return a.name.localeCompare(b.name, 'vi');
  });
});

const isDistrictSelected = (provinceCode: number | string, districtCode: number | string) => {
  return selectedAreaKeys.value.includes(`${provinceCode}:${districtCode}`);
};

const toggleDistrict = (provinceCode: number | string, districtCode: number | string) => {
  const key = `${provinceCode}:${districtCode}`;
  const idx = selectedAreaKeys.value.indexOf(key);
  if (idx >= 0) {
    selectedAreaKeys.value.splice(idx, 1);
  } else {
    selectedAreaKeys.value.push(key);
  }
};

const toggleAllInActiveProvince = () => {
  if (!activeProvince.value?.districts) return;
  const pCode = activeProvince.value.code;
  const allDistricts = activeProvince.value.districts;
  const allSelected = allDistricts.every((d) => isDistrictSelected(pCode, d.code));

  if (allSelected) {
    const toRemove = new Set(allDistricts.map((d) => `${pCode}:${d.code}`));
    selectedAreaKeys.value = selectedAreaKeys.value.filter((k) => !toRemove.has(k));
  } else {
    allDistricts.forEach((d) => {
      const k = `${pCode}:${d.code}`;
      if (!selectedAreaKeys.value.includes(k)) {
        selectedAreaKeys.value.push(k);
      }
    });
  }
};

// 1-Click: Auto-select all districts within service radius
const autoSelectDistrictsWithinRadius = (notify = true) => {
  if (!activeProvince.value?.districts) return;
  const pCode = activeProvince.value.code;
  const inRadius = districtsWithDistance.value.filter((d) => d.isWithinRadius);

  if (inRadius.length === 0) {
    if (notify) toast.info('Không tìm thấy quận/huyện nào trong bán kính này');
    return;
  }

  inRadius.forEach((d) => {
    const key = `${pCode}:${d.code}`;
    if (!selectedAreaKeys.value.includes(key)) {
      selectedAreaKeys.value.push(key);
    }
  });

  if (notify) {
    toast.success(`Đã tự động chọn ${inRadius.length} quận/huyện trong bán kính ${serviceRadiusKm.value} km`);
  }
};

const countSelectedInProvince = (provinceCode: number | string): number => {
  return selectedAreaKeys.value.filter((k) => k.startsWith(`${provinceCode}:`)).length;
};

const selectedAreaLabels = computed(() => {
  if (!provinces.value || provinces.value.length === 0) return [];
  const list: { provinceName: string; districtName: string }[] = [];
  for (const k of selectedAreaKeys.value) {
    const [pCode, dCode] = k.split(':');
    const prov = provinces.value.find((p) => String(p.code) === pCode);
    const dist = prov?.districts?.find((d) => String(d.code) === dCode);
    if (dist && prov) {
      list.push({ provinceName: prov.name, districtName: dist.name });
    }
  }
  return list;
});

// ----------------- Step 5: Summary & Submission -----------------
const isApproved = computed(
  () =>
    statusData.value?.onboardingStatus === 'approved' ||
    statusData.value?.verificationStatus === 'verified',
);
const isRejected = computed(
  () =>
    (statusData.value?.onboardingStatus === 'rejected' ||
      statusData.value?.verificationStatus === 'rejected') &&
    statusData.value?.onboardingStatus !== 'submitted',
);
const isSubmitted = computed(
  () =>
    statusData.value?.onboardingStatus === 'submitted' &&
    !isApproved.value,
);

const handleReviewSubmitted = () => {
  isReviewing.value = true;
  currentStep.value = 1;
};

const handleEditRejected = () => {
  isReviewing.value = true;
  currentStep.value = 1;
};

const handleReturnToStatus = () => {
  isReviewing.value = false;
};

const loadInitialData = async () => {
  loading.value = true;
  try {
    const [statusRes, catRes, servicesRes, vnProvincesRes, myVerificationRes, myWalletRes] = await Promise.all([
      technicianOnboardingApi.getStatus().catch(() => null),
      catalogApi.getCategories(true).catch(() => []),
      catalogApi.getServices({ limit: 100 }).catch(() => ({ data: [] })),
      vietnamProvincesApi.getProvincesWithDistricts().catch(() => []),
      technicianVerificationApi.getMyVerification().catch(() => null),
      walletApi.getMyWallet().catch(() => null),
    ]);

    wallet.value = myWalletRes;

    categories.value = catRes;
    allServices.value = servicesRes.data;
    provinces.value = vnProvincesRes;

    if (myVerificationRes?.documents && myVerificationRes.documents.length > 0) {
      for (const doc of myVerificationRes.documents) {
        const docTypeLower = doc.documentType.toLowerCase();
        const slot = slots.value.find((s) => s.documentType.toLowerCase() === docTypeLower);
        if (slot) {
          slot.uploaded = true;
          if (doc.storageObjectPath) slot.storageObjectPath = doc.storageObjectPath;
          if (doc.fileName) slot.existingFileName = doc.fileName;
          if (doc.id) {
            technicianVerificationApi
              .getDocumentAccess(doc.id)
              .then((url) => {
                if (url && !slot.previewUrl) slot.previewUrl = url;
              })
              .catch(() => {});
          }
        }
      }
    }

    if (statusRes) {
      statusData.value = statusRes;
      if (statusRes.onboardingStatus === 'not_started') {
        currentStep.value = 1;
      } else {
        currentStep.value = Math.min(5, Math.max(1, statusRes.currentStep));
      }

      if (statusRes.fullName) {
        fullName.value = statusRes.fullName;
      }
      if (statusRes.dateOfBirth) {
        dateOfBirth.value = statusRes.dateOfBirth;
      }
      if (statusRes.gender) {
        gender.value = statusRes.gender;
      }
      if (statusRes.citizenIdNumber) {
        citizenIdNumber.value = statusRes.citizenIdNumber;
      }
      if (statusRes.phoneNumber) {
        phoneNumber.value = statusRes.phoneNumber;
      }
      if (statusRes.yearsExperience !== undefined && statusRes.yearsExperience !== null) {
        yearsExperience.value = statusRes.yearsExperience;
      }
      if (statusRes.bio) {
        bio.value = statusRes.bio;
      }
      if (statusRes.selectedServiceIds && statusRes.selectedServiceIds.length > 0) {
        selectedServiceIds.value = statusRes.selectedServiceIds;
      }

      if (statusRes.kycSubmitted) {
        slots.value.forEach((s) => (s.uploaded = true));
      }

      if (statusRes.fullAddress) {
        fullAddress.value = statusRes.fullAddress;
      }
      if (statusRes.latitude !== undefined) {
        selectedLat.value = statusRes.latitude;
      }
      if (statusRes.longitude !== undefined) {
        selectedLng.value = statusRes.longitude;
      }
      if (statusRes.serviceRadiusKm) {
        serviceRadiusKm.value = statusRes.serviceRadiusKm;
      }
      if (statusRes.serviceAreas && statusRes.serviceAreas.length > 0) {
        selectedAreaKeys.value = statusRes.serviceAreas.map(
          (a) => `${a.provinceCode}:${a.districtCode}`,
        );
        const firstArea = statusRes.serviceAreas[0];
        if (firstArea?.provinceCode) {
          selectedProvinceCode.value = Number(firstArea.provinceCode);
        }
      }

      if (statusRes.fullAddress) {
        detectAdministrativeUnits(statusRes.fullAddress, undefined, statusRes.latitude, statusRes.longitude);
      }
    }
  } catch {
    toast.error('Không thể tải thông tin hồ sơ onboarding');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadInitialData();
});

onUnmounted(() => {
  closeCamera();
});

// Step Handlers
const handleSaveStep1 = async () => {
  if (!validateStep1()) {
    toast.error('Vui lòng kiểm tra lại thông tin cá nhân.');
    return;
  }

  saving.value = true;
  try {
    const updated = await technicianOnboardingApi.savePersonalInfo({
      fullName: fullName.value.trim(),
      dateOfBirth: dateOfBirth.value,
      gender: gender.value,
      citizenIdNumber: citizenIdNumber.value.trim(),
      phoneNumber: phoneNumber.value.trim() || undefined,
    });
    statusData.value = updated;
    currentStep.value = 2;
    toast.success('Đã lưu thông tin cá nhân thành công');
  } catch (err: unknown) {
    const msg = getErrorMessage(err, 'Lỗi khi lưu thông tin cá nhân');
    toast.error(msg);
  } finally {
    saving.value = false;
  }
};

const handleSaveStep2 = async () => {
  const success = await uploadKycDocuments();
  if (success) {
    currentStep.value = 3;
  }
};

const handleSaveStep3 = async () => {
  if (selectedServiceIds.value.length === 0) {
    toast.error('Vui lòng chọn ít nhất 1 kỹ năng dịch vụ chuyên môn');
    return;
  }

  saving.value = true;
  try {
    const updated = await technicianOnboardingApi.saveSkills({
      serviceIds: selectedServiceIds.value,
      yearsExperience: Number(yearsExperience.value),
      bio: bio.value.trim() || undefined,
    });
    statusData.value = updated;
    currentStep.value = 4;
    toast.success('Đã lưu kỹ năng chuyên môn thành công');
  } catch (err: unknown) {
    const msg = getErrorMessage(err, 'Lỗi khi lưu kỹ năng');
    toast.error(msg);
  } finally {
    saving.value = false;
  }
};

const handleSaveStep4 = async () => {
  if (!fullAddress.value.trim() || fullAddress.value.length < 5) {
    toast.error('Vui lòng nhập địa chỉ cụ thể của bạn');
    return;
  }
  if (selectedAreaKeys.value.length === 0) {
    toast.error('Vui lòng chọn ít nhất 1 khu vực / quận huyện bạn có thể phục vụ');
    return;
  }

  const serviceAreas = selectedAreaKeys.value.map((k) => {
    const [provinceCode, districtCode] = k.split(':');
    return { provinceCode, districtCode };
  });

  saving.value = true;
  try {
    const updated = await technicianOnboardingApi.saveAddress({
      fullAddress: fullAddress.value.trim(),
      latitude: selectedLat.value,
      longitude: selectedLng.value,
      serviceAreas,
      serviceRadiusKm: Number(serviceRadiusKm.value),
    });
    statusData.value = updated;
    currentStep.value = 5;
    toast.success('Đã lưu địa chỉ và khu vực phục vụ');
  } catch (err: unknown) {
    const msg = getErrorMessage(err, 'Lỗi khi lưu địa chỉ');
    toast.error(msg);
  } finally {
    saving.value = false;
  }
};

const handleFinalSubmit = async () => {
  saving.value = true;
  try {
    const res = await technicianOnboardingApi.submit();
    statusData.value = res;
    isReviewing.value = false;
    toast.success('Hồ sơ của bạn đã được gửi phê duyệt thành công!');
  } catch (err: unknown) {
    const msg = getErrorMessage(err, 'Không thể nộp hồ sơ. Vui lòng kiểm tra lại các bước.');
    toast.error(msg);
  } finally {
    saving.value = false;
  }
};

const handleLogout = async () => {
  await authStore.logout();
  router.push('/login');
};
</script>

<template>
  <div class="min-h-screen bg-ink-50 flex flex-col font-sans pb-16">
    <!-- Top Nav Header -->
    <header class="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-ink-200">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <router-link to="/" class="flex items-center gap-2.5">
          <img :src="'/logo.png'" alt="FixHome" class="w-8 h-8 object-contain rounded-lg" />
          <div class="flex flex-col">
            <span class="text-base font-bold tracking-tight">
              <span class="text-brand-600">Fix</span><span class="text-success-600">Home</span>
            </span>
            <span class="text-[9px] font-bold text-ink-500">Đối tác thợ</span>
          </div>
        </router-link>

        <div class="flex items-center gap-3">
          <span class="hidden sm:inline text-xs text-ink-500">
            Tài khoản: <strong class="text-ink-800">{{ authStore.user?.email }}</strong>
          </span>
          <button
            type="button"
            @click="handleLogout"
            class="text-xs text-ink-600 hover:text-danger-600 font-semibold flex items-center gap-1.5 py-1.5 px-3 rounded-lg hover:bg-danger-50 transition-colors"
          >
            <LogOut :size="14" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Container -->
    <main class="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
      <!-- Loading Skeleton -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-20 text-ink-400 gap-3">
        <RefreshCw :size="32" class="animate-spin text-brand-600" />
        <span class="text-sm font-medium">Đang tải hồ sơ kỹ thuật viên...</span>
      </div>

      <!-- Approved State Screen -->
      <div
        v-else-if="isApproved"
        class="bg-white rounded-3xl p-8 sm:p-12 border border-success-200 shadow-sm text-center max-w-2xl mx-auto space-y-6 my-8"
      >
        <div class="w-20 h-20 rounded-full bg-success-100 text-success-600 flex items-center justify-center mx-auto shadow-inner">
          <CheckCircle2 :size="42" />
        </div>
        <div class="space-y-2">
          <h2 class="text-2xl sm:text-3xl font-black text-slate-900">Hồ sơ đã được phê duyệt!</h2>
          <p class="text-slate-600 text-sm max-w-md mx-auto">
            Chúc mừng bạn đã chính thức trở thành Đối tác Kỹ thuật viên của FixHome.
          </p>
        </div>

        <!-- Wallet Top-Up Notice / Status -->
        <div
          class="p-5 rounded-2xl border text-left space-y-3"
          :class="wallet?.eligibleForJobs ? 'bg-emerald-50/80 border-emerald-200' : 'bg-amber-50/80 border-amber-200'"
        >
          <div class="flex items-start gap-3">
            <div
              class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
              :class="wallet?.eligibleForJobs ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"
            >
              <Wallet :size="20" />
            </div>
            <div class="space-y-1">
              <h4
                class="text-sm font-bold"
                :class="wallet?.eligibleForJobs ? 'text-emerald-950' : 'text-amber-950'"
              >
                {{ wallet?.eligibleForJobs ? 'Ví tài khoản đã sẵn sàng nhận việc' : 'Thông báo số dư ví ban đầu & Điều kiện nhận đơn' }}
              </h4>
              <p
                class="text-xs leading-relaxed"
                :class="wallet?.eligibleForJobs ? 'text-emerald-900' : 'text-amber-900'"
              >
                <span v-if="wallet?.eligibleForJobs">
                  Ví ký quỹ của bạn đã đạt mức tối thiểu và đủ điều kiện nhận đơn sửa chữa mới từ khách hàng.
                </span>
                <span v-else>
                  Tài khoản mới tạo có số dư ví là <strong class="font-num">{{ (wallet?.balance ?? 0).toLocaleString('vi-VN') }} ₫</strong>. Theo quy định hệ thống, bạn cần nạp tối thiểu <strong class="font-num">{{ (wallet?.minimumBalance ?? 200000).toLocaleString('vi-VN') }} ₫</strong> vào ví ký quỹ để kích hoạt quyền nhận việc và nhận lời mời đơn sửa chữa mới.
                </span>
              </p>
            </div>
          </div>
          <div
            class="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-2.5 border-t text-xs gap-1.5 font-medium"
            :class="wallet?.eligibleForJobs ? 'border-emerald-200/60 text-emerald-900' : 'border-amber-200/60 text-amber-900'"
          >
            <span>Số dư ví hiện tại: <strong class="text-slate-900 font-num">{{ (wallet?.balance ?? 0).toLocaleString('vi-VN') }} ₫</strong></span>
            <span>Mức ký quỹ tối thiểu: <strong class="text-brand-600 font-num font-bold">{{ (wallet?.minimumBalance ?? 200000).toLocaleString('vi-VN') }} ₫</strong></span>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <FhButton variant="primary" size="lg" class="w-full sm:w-auto" @click="router.push('/tech/wallet')">
            <Wallet :size="16" class="mr-2" />
            <span>Nạp tiền vào ví ngay</span>
          </FhButton>
          <FhButton variant="secondary" size="lg" class="w-full sm:w-auto" @click="router.push('/tech')">
            <span>Vào Bàn làm việc Kỹ thuật viên</span>
            <ArrowRight :size="16" class="ml-2" />
          </FhButton>
        </div>
      </div>

      <!-- Pending / Submitted Screen -->
      <div
        v-else-if="isSubmitted && !isReviewing"
        class="bg-white rounded-3xl p-8 sm:p-12 border border-warning-200 shadow-sm text-center max-w-2xl mx-auto space-y-6 my-8"
      >
        <div class="w-20 h-20 rounded-full bg-warning-100 text-warning-600 flex items-center justify-center mx-auto shadow-inner animate-pulse">
          <Clock :size="42" />
        </div>
        <div class="space-y-2">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-warning-100 text-warning-800 text-xs font-bold">
            <Clock :size="13" /> Đang chờ ban quản trị phê duyệt
          </div>
          <h2 class="text-2xl sm:text-3xl font-bold text-ink-900">Hồ sơ thợ đã được tiếp nhận!</h2>
          <p class="text-ink-600 text-sm max-w-md mx-auto leading-relaxed">
            Hồ sơ xác thực căn cước công dân, video khuôn mặt, kỹ năng chuyên môn và địa chỉ của bạn đã được lưu an toàn.
            Ban kiểm duyệt FixHome sẽ xem xét và kích hoạt tài khoản trong vòng <strong>24 giờ làm việc</strong>.
          </p>
        </div>

        <div class="p-4 rounded-2xl bg-ink-50 border border-ink-200 text-left text-xs space-y-2 text-ink-600">
          <div class="flex items-center justify-between">
            <span class="font-medium text-ink-500">Mã thợ:</span>
            <span class="font-mono font-bold text-ink-800">{{ authStore.user?.id.slice(0, 8) }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="font-medium text-ink-500">Họ và tên:</span>
            <span class="font-bold text-ink-800">{{ authStore.user?.fullName }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="font-medium text-slate-500">Trạng thái:</span>
            <span class="font-bold text-amber-600">Đang chờ xét duyệt</span>
          </div>
        </div>

        <div class="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          <FhButton variant="secondary" size="md" @click="handleReviewSubmitted">
            <span>Xem lại thông tin đã gửi</span>
          </FhButton>
          <FhButton variant="primary" size="md" @click="loadInitialData">
            <RefreshCw :size="14" class="mr-1.5" />
            <span>Kiểm tra lại trạng thái</span>
          </FhButton>
        </div>
      </div>

      <!-- Rejected Screen -->
      <div
        v-else-if="isRejected && !isReviewing"
        class="bg-white rounded-3xl p-8 sm:p-12 border border-danger-200 shadow-sm text-center max-w-2xl mx-auto space-y-6 my-8"
      >
        <div class="w-20 h-20 rounded-full bg-danger-100 text-danger-600 flex items-center justify-center mx-auto shadow-inner">
          <AlertCircle :size="42" />
        </div>
        <div class="space-y-2">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-danger-100 text-danger-800 text-xs font-bold">
            <AlertCircle :size="13" /> Hồ sơ cần bổ sung / chỉnh sửa
          </div>
          <h2 class="text-2xl sm:text-3xl font-bold text-ink-900">Hồ sơ chưa đạt yêu cầu</h2>
          <p class="text-ink-600 text-sm max-w-md mx-auto leading-relaxed">
            {{ statusData?.rejectionReason || 'Hồ sơ xác thực danh tính hoặc thông tin thợ chưa đạt tiêu chuẩn. Vui lòng kiểm tra lại ảnh chụp CCCD, video khuôn mặt và thông tin liên quan.' }}
          </p>
        </div>
        <FhButton variant="primary" size="lg" class="w-full sm:w-auto" @click="handleEditRejected">
          <span>Chỉnh sửa lại hồ sơ</span>
          <ArrowRight :size="16" class="ml-2" />
        </FhButton>
      </div>

      <!-- Active Wizard Form -->
      <div v-else class="space-y-8">
        <!-- Reviewing / Editing Banner -->
        <div
          v-if="isReviewing"
          class="rounded-2xl p-4 border flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs"
          :class="isRejected ? 'bg-danger-50 border-danger-200 text-danger-900' : 'bg-warning-50 border-warning-200 text-warning-900'"
        >
          <div class="flex items-center gap-2.5 text-xs">
            <AlertCircle v-if="isRejected" :size="18" class="text-danger-600 shrink-0" />
            <Clock v-else :size="18" class="text-warning-600 shrink-0" />
            <div>
              <span v-if="isRejected" class="font-bold">
                Hồ sơ cần cập nhật lại: {{ statusData?.rejectionReason || 'Vui lòng bổ sung đầy đủ thông tin.' }}
              </span>
              <span v-else class="font-bold">
                Bạn đang ở chế độ xem lại hồ sơ đã nộp chờ phê duyệt.
              </span>
            </div>
          </div>
          <button
            type="button"
            @click="handleReturnToStatus"
            class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0"
            :class="isRejected ? 'bg-danger-600 hover:bg-danger-700 text-white' : 'bg-warning-600 hover:bg-warning-700 text-white'"
          >
            Quay lại màn hình trạng thái
          </button>
        </div>

        <!-- Wizard Title & Subtitle -->
        <div class="text-center space-y-2">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-bold">
            <Sparkles :size="13" /> Đăng ký trở thành đối tác FixHome
          </div>
          <h1 class="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight">
            Xác minh & Hoàn tất Hồ sơ Kỹ thuật viên
          </h1>
          <p class="text-sm text-ink-500 max-w-xl mx-auto">
            Vui lòng điền đầy đủ thông tin định danh, kỹ năng chuyên môn và địa chỉ hoạt động để bắt đầu tiếp nhận các đơn sửa chữa tại nhà từ khách hàng.
          </p>
        </div>

        <!-- 5-Step Stepper Progress Bar -->
        <div class="bg-white rounded-2xl p-4 sm:p-5 border border-ink-200 shadow-2xs">
          <div class="grid grid-cols-5 gap-2 sm:gap-4 relative">
            <div
              v-for="step in STEPS"
              :key="step.id"
              class="flex flex-col items-center text-center cursor-pointer group"
              @click="(isReviewing || isRejected || currentStep >= step.id) ? (currentStep = step.id) : null"
            >
              <div
                class="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center transition-all font-bold text-xs sm:text-sm mb-1.5 shadow-2xs"
                :class="[
                  currentStep === step.id
                    ? 'bg-brand-600 text-white ring-4 ring-brand-100 font-black scale-105'
                    : currentStep > step.id || (isReviewing && currentStep !== step.id)
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'
                ]"
              >
                <Check v-if="currentStep > step.id || (isReviewing && currentStep !== step.id)" :size="18" />
                <component v-else :is="step.icon" :size="18" />
              </div>
              <span
                class="text-[10px] sm:text-xs font-bold transition-colors line-clamp-1"
                :class="currentStep === step.id ? 'text-brand-700' : 'text-ink-600'"
              >
                {{ step.title }}
              </span>
              <span class="hidden md:inline text-[9px] text-ink-400 font-medium">
                {{ step.desc }}
              </span>
            </div>
          </div>
        </div>

        <!-- STEP 1: Personal Info -->
        <div v-if="currentStep === 1" class="bg-white rounded-3xl p-6 sm:p-8 border border-ink-200 shadow-sm space-y-6">
          <div class="border-b border-ink-100 pb-4">
            <h3 class="text-lg font-bold text-ink-900 flex items-center gap-2">
              <User :size="20" class="text-brand-600" />
              Bước 1: Thông tin cá nhân & Số CCCD
            </h3>
            <p class="text-xs text-ink-500 mt-1">
              Thông tin này dùng để đối soát danh tính người thật theo quy định pháp luật.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <!-- Full Name -->
            <div class="sm:col-span-2">
              <label class="block text-xs font-bold text-ink-800 mb-1.5">
                Họ và tên đầy đủ (Theo CCCD) <span class="text-danger-500">*</span>
              </label>
              <input
                v-model="fullName"
                type="text"
                placeholder="Nguyễn Văn A"
                class="w-full h-11 px-4 text-sm bg-ink-50 border border-ink-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span v-if="step1Errors.fullName" class="text-xs text-danger-500 mt-1 block">{{ step1Errors.fullName }}</span>
            </div>

            <!-- Date of Birth -->
            <div>
              <label class="block text-xs font-bold text-ink-800 mb-1.5">
                Ngày tháng năm sinh (Đủ 18 tuổi) <span class="text-danger-500">*</span>
              </label>
              <input
                v-model="dateOfBirth"
                type="date"
                class="w-full h-11 px-4 text-sm bg-ink-50 border border-ink-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span v-if="step1Errors.dateOfBirth" class="text-xs text-danger-500 mt-1 block">{{ step1Errors.dateOfBirth }}</span>
            </div>

            <!-- Gender -->
            <div>
              <label class="block text-xs font-bold text-ink-800 mb-1.5">
                Giới tính <span class="text-danger-500">*</span>
              </label>
              <select
                v-model="gender"
                class="w-full h-11 px-4 text-sm bg-ink-50 border border-ink-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="male">Nam</option>
                <option value="female">Nữ</option>
                <option value="other">Khác</option>
              </select>
            </div>

            <!-- CCCD Number -->
            <div>
              <label class="block text-xs font-bold text-ink-800 mb-1.5">
                Số CCCD / Định danh cá nhân (12 số) <span class="text-danger-500">*</span>
              </label>
              <input
                v-model="citizenIdNumber"
                type="text"
                maxlength="12"
                placeholder="001234567890"
                class="w-full h-11 px-4 text-sm bg-ink-50 border border-ink-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span v-if="step1Errors.citizenIdNumber" class="text-xs text-danger-500 mt-1 block">{{ step1Errors.citizenIdNumber }}</span>
            </div>

            <!-- Phone Number -->
            <div>
              <label class="block text-xs font-bold text-ink-800 mb-1.5">
                Số điện thoại liên hệ
              </label>
              <input
                v-model="phoneNumber"
                type="text"
                maxlength="10"
                placeholder="0912345678"
                class="w-full h-11 px-4 text-sm bg-ink-50 border border-ink-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span v-if="step1Errors.phoneNumber" class="text-xs text-danger-500 mt-1 block">{{ step1Errors.phoneNumber }}</span>
            </div>
          </div>

          <div class="flex justify-end pt-4 border-t border-ink-100">
            <FhButton variant="primary" size="lg" :loading="saving" @click="handleSaveStep1">
              <span>Tiếp tục: Bước 2</span>
              <ArrowRight :size="16" class="ml-2" />
            </FhButton>
          </div>
        </div>

        <!-- STEP 2: eKYC Documents -->
        <div v-if="currentStep === 2" class="bg-white rounded-3xl p-6 sm:p-8 border border-ink-200 shadow-sm space-y-6">
          <div class="border-b border-ink-100 pb-4">
            <h3 class="text-lg font-bold text-ink-900 flex items-center gap-2">
              <ShieldCheck :size="20" class="text-brand-600" />
              Bước 2: Xác thực CCCD & Video khuôn mặt (eKYC)
            </h3>
            <p class="text-xs text-ink-500 mt-1">
              Vui lòng chụp ảnh 2 mặt CCCD và video khuôn mặt để hệ thống tự động nhận diện và đảm bảo tính chính chủ.
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Front CCCD Slot -->
            <div
              class="flex flex-col rounded-2xl border-2 border-dashed border-ink-200 p-4 bg-ink-50/50 hover:bg-ink-50 transition-all text-center relative group"
              :class="!slots[0].previewUrl ? 'cursor-pointer hover:border-brand-400' : ''"
              @click="!slots[0].previewUrl ? triggerFileInput('front') : null"
            >
              <input
                type="file"
                accept="image/*"
                class="hidden"
                ref="frontInput"
                @change="(e) => handleFileSelect('front', e)"
              />
              <div v-if="slots[0].previewUrl" class="space-y-3">
                <img :src="slots[0].previewUrl" alt="Mặt trước" class="w-full h-40 object-cover rounded-xl border border-ink-200" />
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold text-success-600 flex items-center gap-1">
                    <CheckCircle2 :size="14" /> Đã chọn ảnh
                  </span>
                  <button type="button" @click.stop="triggerFileInput('front')" class="text-brand-600 hover:underline font-semibold">
                    Đổi ảnh
                  </button>
                </div>
              </div>
              <div v-else class="flex flex-col items-center justify-center py-8">
                <div class="w-12 h-12 rounded-2xl bg-white border border-ink-200 shadow-2xs flex items-center justify-center text-brand-600 mb-3 group-hover:scale-105 transition-transform">
                  <CreditCard :size="22" />
                </div>
                <strong class="text-xs font-bold text-ink-800">CCCD – Mặt trước</strong>
                <p class="text-[11px] text-ink-400 mt-1 px-2 leading-tight">Bấm để chọn ảnh có sẵn hoặc chụp mới</p>
              </div>
            </div>

            <!-- Back CCCD Slot -->
            <div
              class="flex flex-col rounded-2xl border-2 border-dashed border-ink-200 p-4 bg-ink-50/50 hover:bg-ink-50 transition-all text-center relative group"
              :class="!slots[1].previewUrl ? 'cursor-pointer hover:border-brand-400' : ''"
              @click="!slots[1].previewUrl ? triggerFileInput('back') : null"
            >
              <input
                type="file"
                accept="image/*"
                class="hidden"
                ref="backInput"
                @change="(e) => handleFileSelect('back', e)"
              />
              <div v-if="slots[1].previewUrl" class="space-y-3">
                <img :src="slots[1].previewUrl" alt="Mặt sau" class="w-full h-40 object-cover rounded-xl border border-ink-200" />
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold text-success-600 flex items-center gap-1">
                    <CheckCircle2 :size="14" /> Đã chọn ảnh
                  </span>
                  <button type="button" @click.stop="triggerFileInput('back')" class="text-brand-600 hover:underline font-semibold">
                    Đổi ảnh
                  </button>
                </div>
              </div>
              <div v-else class="flex flex-col items-center justify-center py-8">
                <div class="w-12 h-12 rounded-2xl bg-white border border-ink-200 shadow-2xs flex items-center justify-center text-brand-600 mb-3 group-hover:scale-105 transition-transform">
                  <CreditCard :size="22" />
                </div>
                <strong class="text-xs font-bold text-ink-800">CCCD – Mặt sau</strong>
                <p class="text-[11px] text-ink-400 mt-1 px-2 leading-tight">Bấm để chọn ảnh có sẵn hoặc chụp mới</p>
              </div>
            </div>

            <!-- Face Photo Slot -->
            <div
              class="flex flex-col rounded-2xl border-2 border-dashed border-ink-200 p-4 bg-ink-50/50 hover:bg-ink-50 transition-all text-center relative group"
              :class="!slots[2].previewUrl ? 'cursor-pointer hover:border-brand-400' : ''"
              @click="!slots[2].previewUrl ? triggerFileInput('face') : null"
            >
              <input
                type="file"
                accept="image/*"
                class="hidden"
                ref="faceInput"
                @change="(e) => handleFileSelect('face', e)"
              />
              <div v-if="slots[2].previewUrl" class="space-y-3">
                <img :src="slots[2].previewUrl" alt="Ảnh chân dung" class="w-full h-40 object-cover rounded-xl border border-ink-200" />
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold text-success-600 flex items-center gap-1">
                    <CheckCircle2 :size="14" /> Đã chọn ảnh
                  </span>
                  <div class="flex items-center gap-2">
                    <button type="button" @click.stop="openCamera" class="text-brand-600 hover:underline font-semibold">
                      Chụp lại
                    </button>
                    <button type="button" @click.stop="triggerFileInput('face')" class="text-ink-500 hover:underline">
                      Đổi ảnh
                    </button>
                  </div>
                </div>
              </div>
              <div v-else class="flex flex-col items-center justify-center py-6">
                <div class="w-12 h-12 rounded-2xl bg-white border border-ink-200 shadow-2xs flex items-center justify-center text-brand-600 mb-2">
                  <Camera :size="22" />
                </div>
                <strong class="text-xs font-bold text-ink-800">Ảnh chân dung khuôn mặt</strong>
                <p class="text-[11px] text-ink-400 mt-1 px-2 mb-3 leading-tight">
                  Chụp ảnh chân dung rõ nét, nhìn thẳng, không đeo khẩu trang
                </p>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    @click.stop="openCamera"
                    class="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-bold shadow-2xs hover:bg-brand-700 transition-colors flex items-center gap-1"
                  >
                    <Camera :size="13" />
                    <span>Mở Camera</span>
                  </button>
                  <button
                    type="button"
                    @click.stop="triggerFileInput('face')"
                    class="px-3 py-1.5 rounded-lg bg-white border border-ink-200 text-ink-700 text-xs font-semibold hover:bg-ink-50 transition-colors"
                  >
                    Tải ảnh
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-between items-center pt-4 border-t border-ink-100">
            <FhButton variant="secondary" size="md" @click="currentStep = 1">
              <ArrowLeft :size="16" class="mr-2" />
              <span>Quay lại</span>
            </FhButton>
            <FhButton variant="primary" size="lg" :loading="saving" @click="handleSaveStep2">
              <span>Lưu & Tiếp tục: Bước 3</span>
              <ArrowRight :size="16" class="ml-2" />
            </FhButton>
          </div>
        </div>

        <!-- STEP 3: Specialized Skills -->
        <div v-if="currentStep === 3" class="bg-white rounded-3xl p-6 sm:p-8 border border-ink-200 shadow-sm space-y-6">
          <div class="border-b border-ink-100 pb-4">
            <h3 class="text-lg font-bold text-ink-900 flex items-center gap-2">
              <Wrench :size="20" class="text-brand-600" />
              Bước 3: Chọn kỹ năng chuyên môn & Kinh nghiệm
            </h3>
            <p class="text-xs text-ink-500 mt-1">
              Khách hàng đặt dịch vụ sẽ được kết nối với các thợ có kỹ năng tương ứng. Chọn ít nhất 1 dịch vụ.
            </p>
          </div>

          <!-- Search & Experience -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="sm:col-span-2">
              <label class="block text-xs font-bold text-ink-800 mb-1.5">Tìm kiếm dịch vụ</label>
              <input
                v-model="skillSearch"
                type="text"
                placeholder="Ví dụ: Máy lạnh, máy giặt, đường ống nước, tủ lạnh..."
                class="w-full h-11 px-4 text-sm bg-ink-50 border border-ink-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label class="block text-xs font-bold text-ink-800 mb-1.5">Số năm kinh nghiệm</label>
              <input
                v-model.number="yearsExperience"
                type="number"
                min="0"
                max="50"
                class="w-full h-11 px-4 text-sm bg-ink-50 border border-ink-200 rounded-xl font-bold font-num focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <!-- Services Grid by Category -->
          <div class="space-y-5 max-h-[380px] overflow-y-auto pr-2 border border-ink-100 rounded-2xl p-4 bg-ink-50/50">
            <div v-for="group in groupedServices" :key="group.category.id" class="space-y-2">
              <h4 class="text-xs font-bold text-ink-500 flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
                {{ group.category.name }}
              </h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                <div
                  v-for="svc in group.services"
                  :key="svc.id"
                  @click="toggleService(svc.id)"
                  :class="[
                    'p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-start justify-between gap-2',
                    selectedServiceIds.includes(svc.id)
                      ? 'bg-brand-50 border-brand-500 text-brand-900 font-bold shadow-2xs'
                      : 'bg-white border-ink-200 hover:border-brand-200 text-ink-700'
                  ]"
                >
                  <div>
                    <span class="block font-semibold">{{ svc.name }}</span>
                    <span class="text-[10px] text-ink-400 mt-0.5 block font-normal">
                      {{ svc.estimatedMinutes ? `~${svc.estimatedMinutes} phút` : 'Theo thực tế' }}
                    </span>
                  </div>
                  <div
                    class="w-4 h-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors"
                    :class="selectedServiceIds.includes(svc.id) ? 'bg-brand-600 border-brand-600 text-white' : 'border-ink-300 bg-white'"
                  >
                    <Check v-if="selectedServiceIds.includes(svc.id)" :size="12" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="text-xs text-ink-500">
            Đã chọn: <strong class="text-brand-700 font-num">{{ selectedServiceIds.length }}</strong> kỹ năng dịch vụ
          </div>

          <!-- Bio / Introduction -->
          <div>
            <label class="block text-xs font-bold text-ink-800 mb-1.5">
              Giới thiệu bản thân & kinh nghiệm nổi bật
            </label>
            <textarea
              v-model="bio"
              rows="3"
              placeholder="Ví dụ: Thợ sửa điện lạnh chuyên nghiệp với 5 năm kinh nghiệm, có chứng chỉ nghề, tận tâm, có mặt nhanh chóng..."
              class="w-full p-3 text-sm bg-ink-50 border border-ink-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            ></textarea>
          </div>

          <div class="flex justify-between items-center pt-4 border-t border-ink-100">
            <FhButton variant="secondary" size="md" @click="currentStep = 2">
              <ArrowLeft :size="16" class="mr-2" />
              <span>Quay lại</span>
            </FhButton>
            <FhButton variant="primary" size="lg" :loading="saving" @click="handleSaveStep3">
              <span>Lưu & Tiếp tục: Bước 4</span>
              <ArrowRight :size="16" class="ml-2" />
            </FhButton>
          </div>
        </div>

        <!-- STEP 4: Address & Service Areas -->
        <div v-if="currentStep === 4" class="bg-white rounded-3xl p-6 sm:p-8 border border-ink-200 shadow-sm space-y-6">
          <!-- Step Header -->
          <div class="border-b border-ink-100 pb-4">
            <h3 class="text-lg font-bold text-ink-900 flex items-center gap-2">
              <MapPin :size="20" class="text-brand-600" />
              Bước 4: Địa chỉ cụ thể & Khu vực nhận việc
            </h3>
            <p class="text-xs text-ink-500 mt-1">
              Nhập địa chỉ nhà của bạn để hệ thống tự động xác định Tỉnh/Thành, Quận/Huyện, tính cự ly di chuyển và gợi ý các khu vực nhận việc tối ưu nhất.
            </p>
          </div>

          <!-- Section 1: Address Input (Dual-mode: Smart Search & Cascading Dropdown) -->
          <div class="space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label class="block text-xs font-bold text-ink-800">
                Địa chỉ cụ thể của bạn (Số nhà, Đường, Phường, Quận, Thành phố) <span class="text-danger-500">*</span>
              </label>

              <!-- Mode Switcher Tabs -->
              <div class="flex items-center p-0.5 bg-ink-100 rounded-xl text-xs font-medium self-start sm:self-auto">
                <button
                  type="button"
                  @click="addressInputMode = 'search'"
                  :class="[
                    'px-3 py-1 rounded-lg transition-all flex items-center gap-1.5',
                    addressInputMode === 'search'
                      ? 'bg-white text-brand-700 font-bold shadow-2xs'
                      : 'text-ink-600 hover:text-ink-900'
                  ]"
                >
                  <Search :size="13" />
                  <span>Tìm kiếm nhanh</span>
                </button>
                <button
                  type="button"
                  @click="addressInputMode = 'structured'"
                  :class="[
                    'px-3 py-1 rounded-lg transition-all flex items-center gap-1.5',
                    addressInputMode === 'structured'
                      ? 'bg-white text-brand-700 font-bold shadow-2xs'
                      : 'text-ink-600 hover:text-ink-900'
                  ]"
                >
                  <Building2 :size="13" />
                  <span>Chọn theo Tỉnh / Quận / Phường</span>
                </button>
              </div>
            </div>

            <!-- Mode 1: Smart Search with MapTiler Autocomplete -->
            <div v-if="addressInputMode === 'search'" class="relative">
              <div class="relative">
                <input
                  v-model="fullAddress"
                  @input="onAddressInput"
                  type="text"
                  placeholder="Ví dụ: 123 Nguyễn Thị Minh Khai, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh"
                  class="w-full h-11 pl-10 pr-10 text-sm bg-ink-50 border border-ink-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
                />
                <MapPin :size="18" class="absolute left-3.5 top-3 text-brand-600" />
                <button
                  v-if="fullAddress"
                  type="button"
                  @click="fullAddress = ''; addressSuggestions = []; selectedLat = undefined; selectedLng = undefined;"
                  class="absolute right-3 top-3 text-ink-400 hover:text-ink-600"
                >
                  <X :size="16" />
                </button>
              </div>

              <!-- Autocomplete suggestions dropdown -->
              <div
                v-if="addressSuggestions.length > 0"
                class="absolute z-30 left-0 right-0 mt-1 bg-white rounded-2xl border border-ink-200 shadow-xl max-h-56 overflow-y-auto divide-y divide-ink-100"
              >
                <div
                  v-for="s in addressSuggestions"
                  :key="s.placeId"
                  @click="selectAddressSuggestion(s)"
                  class="p-3 hover:bg-brand-50/70 text-xs text-ink-700 cursor-pointer flex items-start gap-2.5 transition-colors"
                >
                  <MapPin :size="15" class="text-brand-600 shrink-0 mt-0.5" />
                  <div class="flex-1">
                    <span class="font-medium text-ink-800">{{ s.description }}</span>
                    <span v-if="s.district || s.province" class="block text-[10px] text-ink-400 mt-0.5">
                      {{ [s.ward, s.district, s.province].filter(Boolean).join(' • ') }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Mode 2: Cascading Administrative Selectors (Tỉnh -> Quận -> Phường -> Số nhà) -->
            <div v-else class="space-y-2.5 bg-ink-50/70 rounded-2xl p-4 border border-ink-200">
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <!-- Tỉnh / Thành phố -->
                <div>
                  <label class="block text-[11px] font-bold text-ink-600 mb-1">Tỉnh / Thành phố</label>
                  <select
                    v-model.number="structuredProvinceCode"
                    @change="onStructuredProvinceChange"
                    class="w-full h-10 px-3 text-xs font-semibold bg-white border border-ink-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                  >
                    <option v-for="prov in sortedProvinces" :key="prov.code" :value="prov.code">
                      {{ prov.name }}
                    </option>
                  </select>
                </div>

                <!-- Quận / Huyện -->
                <div>
                  <label class="block text-[11px] font-bold text-ink-600 mb-1">Quận / Huyện</label>
                  <select
                    v-model.number="structuredDistrictCode"
                    @change="onStructuredDistrictChange"
                    class="w-full h-10 px-3 text-xs font-semibold bg-white border border-ink-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                  >
                    <option :value="null">-- Chọn Quận/Huyện --</option>
                    <option v-for="dist in availableStructuredDistricts" :key="dist.code" :value="dist.code">
                      {{ dist.name }}
                    </option>
                  </select>
                </div>

                <!-- Phường / Xã -->
                <div>
                  <label class="block text-[11px] font-bold text-ink-600 mb-1 flex items-center justify-between">
                    <span>Phường / Xã</span>
                    <span v-if="loadingWards" class="text-[10px] text-brand-600 font-normal">Đang tải...</span>
                  </label>
                  <select
                    v-model.number="structuredWardCode"
                    @change="onStructuredWardChange"
                    :disabled="!structuredDistrictCode || loadingWards"
                    class="w-full h-10 px-3 text-xs font-semibold bg-white border border-ink-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer disabled:bg-ink-100 disabled:text-ink-400"
                  >
                    <option :value="null">-- Chọn Phường/Xã --</option>
                    <option v-for="ward in structuredWards" :key="ward.code" :value="ward.code">
                      {{ ward.name }}
                    </option>
                  </select>
                </div>

                <!-- Số nhà, tên đường -->
                <div>
                  <label class="block text-[11px] font-bold text-ink-600 mb-1">Số nhà, tên đường</label>
                  <input
                    v-model="structuredStreet"
                    @input="syncAddressFromStructured"
                    type="text"
                    placeholder="Ví dụ: 123 Nguyễn Thị Minh Khai"
                    class="w-full h-10 px-3 text-xs bg-white border border-ink-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <!-- Generated address preview -->
              <div v-if="fullAddress" class="text-[11px] text-ink-500 pt-1 flex items-center gap-1.5">
                <span class="font-medium text-ink-600">Địa chỉ hợp nhất:</span>
                <span class="font-semibold text-ink-800">{{ fullAddress }}</span>
              </div>
            </div>

            <!-- Detected Location Confirmation Card -->
            <div
              v-if="detectedProvinceName || (selectedLat && selectedLng) || fullAddress"
              class="p-3.5 rounded-2xl bg-brand-50/50 border border-brand-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="inline-flex items-center gap-1 text-[11px] font-bold text-success-700 bg-success-100/70 px-2 py-0.5 rounded-md">
                    <CheckCircle2 :size="12" /> Đã xác định vị trí nhà thợ
                  </span>
                  <span v-if="detectedProvinceName" class="font-semibold text-brand-900">
                    {{ detectedProvinceName }}
                  </span>
                  <span v-if="detectedDistrictName" class="font-semibold text-ink-700">
                    · {{ detectedDistrictName }}
                  </span>
                </div>
                <p class="text-[11px] text-ink-600 truncate max-w-xl">
                  {{ fullAddress || 'Chưa có thông tin địa chỉ cụ thể' }}
                </p>
              </div>

              <!-- GPS coordinates chip -->
              <div v-if="selectedLat && selectedLng" class="shrink-0 flex items-center gap-1 text-[11px] font-mono text-ink-600 bg-white px-2.5 py-1 rounded-lg border border-ink-200 shadow-2xs">
                <Crosshair :size="12" class="text-brand-600" />
                <span>{{ selectedLat.toFixed(4) }}, {{ selectedLng.toFixed(4) }}</span>
              </div>
            </div>
          </div>

          <!-- Section 2: Service Radius Slider & Presets -->
          <div class="space-y-3 bg-ink-50/80 rounded-2xl p-4 sm:p-5 border border-ink-200">
            <div class="flex items-center justify-between">
              <div>
                <span class="font-bold text-xs sm:text-sm text-ink-800">Bán kính nhận việc tối đa:</span>
                <p class="text-[11px] text-ink-500 mt-0.5">
                  Phạm vi di chuyển tối đa từ vị trí nhà bạn để tiếp nhận các đơn sửa chữa.
                </p>
              </div>
              <div class="text-right">
                <span class="inline-block font-bold text-brand-700 font-num text-base sm:text-lg bg-brand-50 px-3 py-1 rounded-xl border border-brand-200">
                  {{ serviceRadiusKm }} km
                </span>
              </div>
            </div>

            <input
              v-model.number="serviceRadiusKm"
              type="range"
              min="3"
              max="50"
              step="1"
              class="w-full accent-brand-600 cursor-pointer"
            />

            <!-- Radius Presets -->
            <div class="flex items-center justify-between gap-1 pt-1">
              <button
                v-for="preset in [
                  { km: 5, label: '5 km (Gần)' },
                  { km: 10, label: '10 km' },
                  { km: 15, label: '15 km (Khuyên dùng)' },
                  { km: 25, label: '25 km (Rộng)' },
                  { km: 40, label: '40 km (Toàn thành)' },
                ]"
                :key="preset.km"
                type="button"
                @click="serviceRadiusKm = preset.km"
                :class="[
                  'px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-semibold transition-all',
                  serviceRadiusKm === preset.km
                    ? 'bg-brand-600 text-white shadow-2xs scale-105'
                    : 'bg-white border border-ink-200 text-ink-600 hover:bg-ink-100'
                ]"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>

          <!-- Section 3: Smart Radius Recommendation Action Banner -->
          <div
            v-if="inRadiusDistricts.length > 0"
            class="rounded-2xl p-4 bg-warning-50 border border-warning-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-warning-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Zap :size="18" />
              </div>
              <div>
                <h4 class="text-xs font-bold text-ink-900 flex items-center gap-1.5">
                  Gợi ý tự động theo bán kính {{ serviceRadiusKm }} km
                </h4>
                <p class="text-[11px] text-ink-600 mt-0.5">
                  Phát hiện <strong class="text-brand-700 font-num">{{ inRadiusDistricts.length }}</strong> quận/huyện tại
                  <span class="font-semibold text-ink-800">{{ activeProvince?.name }}</span>
                  cách vị trí nhà bạn ≤ {{ serviceRadiusKm }} km.
                </p>
              </div>
            </div>

            <button
              type="button"
              @click="autoSelectDistrictsWithinRadius(true)"
              class="px-4 py-2 rounded-xl bg-warning-500 hover:bg-warning-600 text-white text-xs font-bold shadow-xs transition-colors shrink-0 flex items-center justify-center gap-1.5 self-start sm:self-auto"
            >
              <Zap :size="14" />
              <span>Chọn tất cả {{ inRadiusDistricts.length }} quận trong bán kính</span>
            </button>
          </div>

          <!-- Section 4: District Selection Grid with Distance Indicators -->
          <div class="space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink-100 pb-3">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <label class="text-xs font-bold text-ink-800">
                    Khu vực quận / huyện tiếp nhận đơn <span class="text-danger-500">*</span>
                  </label>
                  <span class="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 bg-brand-50 border border-brand-200 px-2.5 py-0.5 rounded-full">
                    <MapPin :size="12" class="text-brand-600" />
                    {{ activeProvince?.name || 'Khu vực của bạn' }}
                  </span>
                </div>
                <p class="text-[11px] text-ink-500 mt-1">
                  Chỉ hiển thị các khu vực thuộc <strong>{{ activeProvince?.name || 'Tỉnh/TP đã chọn' }}</strong> trong bán kính di chuyển tính từ địa chỉ nhà bạn.
                </p>
              </div>

              <!-- Quick selected counter -->
              <div class="shrink-0 flex items-center gap-2">
                <span class="text-xs font-semibold text-ink-700 bg-ink-50 border border-ink-200 px-3 py-1.5 rounded-xl">
                  Đã chọn: <strong class="text-brand-700 font-num text-sm font-bold">{{ countSelectedInProvince(activeProvince?.code || 0) }}</strong> / {{ activeProvince?.districts?.length || 0 }} quận/huyện
                </span>
              </div>
            </div>

            <!-- District Filter Tabs & Search & Bulk Actions -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
              <!-- Filter Tabs -->
              <div class="flex items-center p-0.5 bg-ink-100 rounded-xl text-xs font-medium self-start sm:self-auto">
                <button
                  type="button"
                  @click="districtFilterTab = 'all'"
                  :class="[
                    'px-2.5 py-1 rounded-lg transition-all',
                    districtFilterTab === 'all'
                      ? 'bg-white text-brand-700 font-bold shadow-2xs'
                      : 'text-ink-600 hover:text-ink-900'
                  ]"
                >
                  Tất cả ({{ activeProvince?.districts?.length || 0 }})
                </button>
                <button
                  type="button"
                  @click="districtFilterTab = 'in_radius'"
                  :class="[
                    'px-2.5 py-1 rounded-lg transition-all flex items-center gap-1',
                    districtFilterTab === 'in_radius'
                      ? 'bg-white text-brand-700 font-bold shadow-2xs'
                      : 'text-ink-600 hover:text-ink-900'
                  ]"
                >
                  <Zap :size="12" class="text-warning-500" />
                  <span>Trong {{ serviceRadiusKm }} km ({{ inRadiusDistricts.length }})</span>
                </button>
                <button
                  type="button"
                  @click="districtFilterTab = 'selected'"
                  :class="[
                    'px-2.5 py-1 rounded-lg transition-all',
                    districtFilterTab === 'selected'
                      ? 'bg-white text-brand-700 font-bold shadow-2xs'
                      : 'text-ink-600 hover:text-ink-900'
                  ]"
                >
                  Đã chọn ({{ countSelectedInProvince(activeProvince?.code || 0) }})
                </button>
              </div>

              <!-- Search input -->
              <div class="relative flex-1 max-w-xs">
                <input
                  v-model="districtSearch"
                  type="text"
                  :placeholder="`Tìm quận/huyện tại ${activeProvince?.name || 'tỉnh'}...`"
                  class="w-full h-8 pl-7 pr-3 text-xs bg-ink-50 border border-ink-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <Search :size="13" class="absolute left-2 top-2 text-ink-400" />
              </div>

              <!-- Toggle All Button -->
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  @click="toggleAllInActiveProvince"
                  class="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                >
                  Chọn / Bỏ tất cả
                </button>
              </div>
            </div>

            <!-- Districts Grid with Distance Tags -->
            <div class="border border-ink-200 rounded-2xl p-3.5 bg-ink-50/50 max-h-80 overflow-y-auto">
              <div v-if="displayedDistricts.length > 0" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                <div
                  v-for="dist in displayedDistricts"
                  :key="dist.code"
                  @click="toggleDistrict(activeProvince!.code, dist.code)"
                  :class="[
                    'p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between gap-2 select-none',
                    isDistrictSelected(activeProvince!.code, dist.code)
                      ? 'bg-brand-50/90 border-brand-500 text-brand-900 font-bold shadow-2xs ring-1 ring-brand-500/20'
                      : dist.isWithinRadius
                        ? 'bg-white border-warning-200/80 hover:border-brand-300 text-ink-800'
                        : 'bg-white border-ink-200 hover:border-ink-300 text-ink-600'
                  ]"
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1">
                      <span class="truncate">{{ dist.name }}</span>
                    </div>

                    <!-- Distance tag -->
                    <div class="mt-1 flex items-center gap-1">
                      <span
                        v-if="dist.distanceKm !== null"
                        :class="[
                          'inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[10px] font-medium font-num',
                          dist.isWithinRadius
                            ? 'bg-success-100/80 text-success-800 font-bold'
                            : 'bg-ink-100 text-ink-500'
                        ]"
                      >
                        <Zap v-if="dist.isWithinRadius" :size="9" class="text-warning-500" />
                        <span>~{{ dist.distanceKm }} km</span>
                        <span v-if="dist.isWithinRadius" class="hidden xl:inline text-[9px] font-normal ml-0.5">(phù hợp)</span>
                      </span>
                      <span v-else class="text-[10px] text-ink-400">
                        Chưa đo cự ly
                      </span>
                    </div>
                  </div>

                  <!-- Checkbox indicator -->
                  <div
                    class="w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors"
                    :class="
                      isDistrictSelected(activeProvince!.code, dist.code)
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'border-ink-300 bg-white'
                    "
                  >
                    <Check v-if="isDistrictSelected(activeProvince!.code, dist.code)" :size="13" />
                  </div>
                </div>
              </div>

              <!-- Empty state -->
              <div v-else class="py-10 text-center text-xs text-ink-400 space-y-1">
                <p>Không tìm thấy quận/huyện nào phù hợp với bộ lọc</p>
                <button
                  type="button"
                  @click="districtFilterTab = 'all'; districtSearch = '';"
                  class="text-brand-600 font-semibold hover:underline"
                >
                  Đặt lại bộ lọc
                </button>
              </div>
            </div>

            <!-- Footer Counter & Selected summary -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-ink-500 pt-1">
              <div>
                Đã chọn: <strong class="text-brand-700 font-num text-sm font-bold">{{ countSelectedInProvince(activeProvince?.code || 0) }}</strong> / {{ activeProvince?.districts?.length || 0 }} quận/huyện tiếp nhận việc tại {{ activeProvince?.name }}
              </div>
              <div v-if="inRadiusDistricts.length > 0" class="text-[11px] text-success-700 font-medium">
                Có {{ inRadiusDistricts.length }} quận/huyện nằm trong bán kính {{ serviceRadiusKm }} km
              </div>
            </div>
          </div>

          <div class="flex justify-between items-center pt-4 border-t border-ink-100">
            <FhButton variant="secondary" size="md" @click="currentStep = 3">
              <ArrowLeft :size="16" class="mr-2" />
              <span>Quay lại</span>
            </FhButton>
            <FhButton variant="primary" size="lg" :loading="saving" @click="handleSaveStep4">
              <span>Lưu & Tiếp tục: Bước 5</span>
              <ArrowRight :size="16" class="ml-2" />
            </FhButton>
          </div>
        </div>

        <!-- STEP 5: Review & Submit -->
        <div v-if="currentStep === 5" class="bg-white rounded-3xl p-6 sm:p-8 border border-ink-200 shadow-sm space-y-6">
          <div class="border-b border-ink-100 pb-4">
            <h3 class="text-lg font-bold text-ink-900 flex items-center gap-2">
              <FileCheck2 :size="20" class="text-brand-600" />
              Bước 5: Xem lại & Gửi hồ sơ phê duyệt
            </h3>
            <p class="text-xs text-ink-500 mt-1">
              Kiểm tra kỹ các thông tin trước khi nộp để ban quản lý phê duyệt nhanh nhất.
            </p>
          </div>

          <!-- Bento Grid Preview -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Box 1: Info -->
            <div class="p-4 rounded-2xl bg-ink-50 border border-ink-200 space-y-2">
              <div class="flex items-center justify-between text-xs font-bold text-ink-700 border-b border-ink-200/60 pb-2">
                <span class="flex items-center gap-1.5"><User :size="14" class="text-brand-600" /> Thông tin cá nhân</span>
                <button type="button" @click="currentStep = 1" class="text-brand-600 hover:underline">Sửa</button>
              </div>
              <div class="text-xs space-y-1 text-ink-600">
                <p>Họ tên: <strong class="text-ink-900">{{ fullName }}</strong></p>
                <p>Ngày sinh: <strong class="text-ink-900">{{ dateOfBirth }}</strong></p>
                <p>Giới tính: <strong class="text-ink-900">{{ gender === 'male' ? 'Nam' : gender === 'female' ? 'Nữ' : 'Khác' }}</strong></p>
                <p>Số CCCD: <strong class="text-ink-900 font-mono">{{ citizenIdNumber }}</strong></p>
                <p>Số ĐT: <strong class="text-ink-900 font-mono">{{ phoneNumber || 'Chưa cập nhật' }}</strong></p>
              </div>
            </div>

            <!-- Box 2: KYC -->
            <div class="p-4 rounded-2xl bg-ink-50 border border-ink-200 space-y-2">
              <div class="flex items-center justify-between text-xs font-bold text-ink-700 border-b border-ink-200/60 pb-2">
                <span class="flex items-center gap-1.5"><ShieldCheck :size="14" class="text-brand-600" /> Hồ sơ eKYC</span>
                <button type="button" @click="currentStep = 2" class="text-brand-600 hover:underline">Sửa</button>
              </div>
              <div class="text-xs space-y-1 text-success-600 font-semibold">
                <p class="flex items-center gap-1.5"><CheckCircle2 :size="13" /> Mặt trước CCCD: Đã sẵn sàng</p>
                <p class="flex items-center gap-1.5"><CheckCircle2 :size="13" /> Mặt sau CCCD: Đã sẵn sàng</p>
                <p class="flex items-center gap-1.5"><CheckCircle2 :size="13" /> Ảnh chân dung khuôn mặt: Đã sẵn sàng</p>
              </div>
            </div>

            <!-- Box 3: Skills -->
            <div class="p-4 rounded-2xl bg-ink-50 border border-ink-200 space-y-2">
              <div class="flex items-center justify-between text-xs font-bold text-ink-700 border-b border-ink-200/60 pb-2">
                <span class="flex items-center gap-1.5"><Wrench :size="14" class="text-brand-600" /> Chuyên môn & Kinh nghiệm</span>
                <button type="button" @click="currentStep = 3" class="text-brand-600 hover:underline">Sửa</button>
              </div>
              <div class="text-xs space-y-1 text-ink-600">
                <p>Kinh nghiệm: <strong class="text-ink-900">{{ yearsExperience }} năm</strong></p>
                <p>Số kỹ năng đã đăng ký: <strong class="text-brand-700 font-bold">{{ selectedServiceIds.length }} dịch vụ</strong></p>
                <p v-if="bio" class="italic text-[11px] text-ink-500 line-clamp-2">"{{ bio }}"</p>
              </div>
            </div>

            <!-- Box 4: Address -->
            <div class="p-4 rounded-2xl bg-ink-50 border border-ink-200 space-y-2">
              <div class="flex items-center justify-between text-xs font-bold text-ink-700 border-b border-ink-200/60 pb-2">
                <span class="flex items-center gap-1.5"><MapPin :size="14" class="text-brand-600" /> Địa chỉ & Khu vực</span>
                <button type="button" @click="currentStep = 4" class="text-brand-600 hover:underline">Sửa</button>
              </div>
              <div class="text-xs space-y-1 text-ink-600">
                <p class="truncate">Địa chỉ thợ: <strong class="text-ink-900">{{ fullAddress }}</strong></p>
                <p>Bán kính phục vụ: <strong class="text-ink-900">{{ serviceRadiusKm }} km</strong></p>
                <p>Số quận/huyện tiếp nhận: <strong class="text-brand-700 font-bold">{{ selectedAreaKeys.length }} khu vực</strong></p>
                <div v-if="selectedAreaLabels.length > 0" class="flex flex-wrap gap-1 pt-1 max-h-24 overflow-y-auto">
                  <span
                    v-for="(area, idx) in selectedAreaLabels"
                    :key="idx"
                    class="px-2 py-0.5 rounded-md bg-white border border-ink-200 text-[10px] text-ink-700 font-medium"
                  >
                    {{ area.districtName }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Commitment notice -->
          <div class="p-4 rounded-2xl bg-brand-50/60 border border-brand-200 text-brand-950 text-xs flex items-start gap-3">
            <ShieldCheck :size="18" class="text-brand-600 shrink-0 mt-0.5" />
            <div class="leading-relaxed">
              <strong>Cam kết dịch vụ FixHome:</strong>
              <p class="text-[11px] text-brand-800 mt-0.5">
                Tôi cam kết thông tin và tài liệu cung cấp là chính xác, tuân thủ đúng quy chế bảo hành, bảng giá niêm yết và quy tắc ứng xử văn minh với khách hàng.
              </p>
            </div>
          </div>

          <div class="flex justify-between items-center pt-4 border-t border-ink-100">
            <FhButton variant="secondary" size="md" @click="currentStep = 4">
              <ArrowLeft :size="16" class="mr-2" />
              <span>Quay lại</span>
            </FhButton>
            <FhButton
              v-if="!isSubmitted || isRejected || isReviewing"
              variant="primary"
              size="lg"
              :loading="saving"
              @click="handleFinalSubmit"
            >
              <CheckCircle2 :size="16" class="mr-2" />
              <span>{{ (isRejected || isReviewing) ? 'Gửi lại hồ sơ xét duyệt' : 'Gửi hồ sơ xét duyệt' }}</span>
            </FhButton>
            <FhButton
              v-else
              variant="primary"
              size="lg"
              @click="handleReturnToStatus"
            >
              <CheckCircle2 :size="16" class="mr-2" />
              <span>Quay lại màn hình chờ duyệt</span>
            </FhButton>
          </div>
        </div>
      </div>
    </main>

    <!-- Camera Modal for Live Face Photo -->
    <div
      v-if="showCameraModal"
      class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
    >
      <div class="bg-white rounded-3xl overflow-hidden max-w-md w-full shadow-2xl space-y-4 p-5 text-center">
        <div class="flex items-center justify-between border-b border-ink-100 pb-3">
          <h3 class="text-sm font-bold text-ink-900">Chụp ảnh chân dung khuôn mặt</h3>
          <button type="button" @click="closeCamera" class="text-ink-400 hover:text-ink-600">
            <X :size="18" />
          </button>
        </div>

        <div class="relative bg-ink-900 rounded-2xl overflow-hidden aspect-4/3 flex items-center justify-center">
          <video ref="cameraVideoEl" class="w-full h-full object-cover" autoplay playsinline muted></video>
          <!-- Face Guide Oval -->
          <div class="absolute inset-8 border-2 border-dashed border-white/60 rounded-full pointer-events-none flex items-center justify-center">
            <span class="text-[11px] text-white/80 font-bold bg-black/40 px-2 py-0.5 rounded-full">
              Đặt khuôn mặt vào đây
            </span>
          </div>
        </div>

        <p class="text-xs text-ink-500 leading-tight">
          Giữ camera nhìn thẳng, đảm bảo đủ ánh sáng và không che mặt, sau đó nhấn "Chụp ảnh ngay".
        </p>

        <div class="flex items-center justify-center gap-3 pt-2">
          <FhButton variant="secondary" size="md" @click="closeCamera">Hủy</FhButton>
          <FhButton
            variant="primary"
            size="md"
            :loading="isCapturing"
            @click="takeFacePhoto"
          >
            <Camera :size="16" class="mr-1.5" />
            <span>{{ isCapturing ? 'Đang chụp...' : 'Chụp ảnh ngay' }}</span>
          </FhButton>
        </div>
      </div>
    </div>
  </div>
</template>
