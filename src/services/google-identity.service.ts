// src/services/google-identity.service.ts
//
// Nạp thư viện Google Identity Services và dựng nút đăng nhập chính chủ.
//
// Dùng nút do Google vẽ thay vì tự vẽ một cái giống giống, vì quy định thương
// hiệu của Google bắt buộc như vậy, và nút đó tự lo phần ngôn ngữ, trạng thái
// bấm, cùng khả năng truy cập bằng bàn phím.
//
// Trình duyệt chỉ nhận được ID token — một chuỗi đã ký mà chỉ backend mới kiểm
// được. Không có bí mật nào nằm ở đây; CLIENT_ID vốn là giá trị công khai.

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

/** Phần nhỏ của API Google mà ta thực sự dùng. */
interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with';
      shape?: 'rectangular' | 'pill';
      logo_alignment?: 'left' | 'center';
      width?: number;
      locale?: string;
    },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

export function getGoogleClientId(): string | undefined {
  const value = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Chưa điền CLIENT_ID thì giao diện phải ẩn nút đi, không hiện nút chết. */
export function isGoogleSignInConfigured(): boolean {
  return getGoogleClientId() !== undefined;
}

let loader: Promise<GoogleAccountsId> | null = null;

/**
 * Nạp script một lần duy nhất cho cả phiên làm việc.
 *
 * Giữ lại chính lời hứa đó chứ không chỉ một cờ boolean, để hai nút cùng xuất
 * hiện một lúc — trang đăng nhập và trang đăng ký chẳng hạn — không chèn hai
 * thẻ script.
 */
export function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  if (loader) return loader;

  loader = new Promise<GoogleAccountsId>((resolve, reject) => {
    const ready = window.google?.accounts?.id;
    if (ready) {
      resolve(ready);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SCRIPT_URL}"]`,
    );
    const script = existing ?? document.createElement('script');

    const onReady = () => {
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else reject(new Error('Thư viện Google đã tải nhưng thiếu accounts.id'));
    };
    const onFail = () => {
      // Cho phép thử lại ở lần bấm sau: mạng chập chờn hoặc bị chặn tạm thời
      // không nên khoá nút vĩnh viễn cho tới khi tải lại trang.
      loader = null;
      reject(new Error('Không tải được thư viện đăng nhập Google'));
    };

    script.addEventListener('load', onReady, { once: true });
    script.addEventListener('error', onFail, { once: true });

    if (!existing) {
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return loader;
}

/**
 * Vẽ nút Google vào phần tử cho trước và gọi `onCredential` với ID token.
 *
 * Lỗi lúc tải được ném ra cho phía gọi xử lý, vì chỉ màn hình mới biết nên hiện
 * thông báo ở đâu.
 */
export async function renderGoogleButton(
  parent: HTMLElement,
  onCredential: (idToken: string) => void,
  options: { text?: 'signin_with' | 'signup_with'; width?: number } = {},
): Promise<void> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error('Chưa cấu hình VITE_GOOGLE_CLIENT_ID');
  }

  const api = await loadGoogleIdentity();
  api.initialize({
    client_id: clientId,
    callback: (response) => {
      if (response.credential) onCredential(response.credential);
    },
    cancel_on_tap_outside: true,
  });
  api.renderButton(parent, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    shape: 'rectangular',
    logo_alignment: 'left',
    text: options.text ?? 'signin_with',
    width: options.width,
    locale: 'vi',
  });
}
