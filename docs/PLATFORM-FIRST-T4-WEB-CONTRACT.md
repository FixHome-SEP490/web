# Platform-first T4 — hợp đồng Web cho gián đoạn có xác minh

Tài liệu này ghi lại phần Web của lượt T4: thợ ghi nhận **ý định không thể tiếp tục** sau khi đã
check-in hợp lệ, và khách thấy trạng thái gián đoạn đã được server xác minh để tự đặt lịch mới độc
lập hoặc **đặt lại có điền sẵn** qua đường nháp/ xác nhận đã có. Nguồn chân lý nghiệp vụ là Backend
T1 (`docs/PLATFORM-FIRST-T1-BACKEND-CONTRACT.md`) và T2
(`docs/PLATFORM-FIRST-T2-BACKEND-CONTRACT.md`) bên repo `backend`; Web chỉ hiển thị và gửi lệnh,
không tự suy ra hủy đơn, hoàn tiền hay đặt lại lịch.

## 1. Phạm vi và nguyên tắc

- T1 chỉ ghi nhận **ý định bị gián đoạn**. Đơn cũ **không bị hủy**, không đổi trạng thái terminal,
  không hoàn tiền, không đóng báo giá và không đụng sổ linh kiện.
- Phản hồi server là nguồn duy nhất để bật UI. Web **fail-closed**: thiếu trường, sai enum, sai
  `serviceOrderId`/`bookingId`/`visitGroupId` hoặc phiên bản lạ thì coi như chưa xác nhận.
- T2 dùng lại endpoint nháp/ xác nhận đã có (`interruption-draft`, `interruption-rebook`) cho nguồn
  T1 đã xác minh. Web **không** dùng lại báo giá/giá/ưu đãi cũ; biểu mẫu chỉ mang mô tả, thiết bị và
  thuộc tính mô tả sang, còn lịch và giá do khách chọn lại và Backend tính lại.
- Không có cổng duyệt Service Manager, không có lệnh hủy mới và không thay đổi luồng hoàn trả linh
  kiện hiện có. Trạng thái `legacyPartReturnState` luôn là `NOT_VERIFIED`.

## 2. API Web sử dụng

Base URL của `apiClient` là `/api/v1`; các đường dẫn dưới đây là phần sau base.

| Việc | Gọi | Ghi chú |
| --- | --- | --- |
| Ghi ý định dừng | `POST /service-orders/:id/cannot-continue` | Body typed, có `commandId` UUID v4 |
| Đọc nguồn gián đoạn cho khách | `GET /service-orders/:id/customer-continuation` | Chỉ đọc; không ghi |
| Đọc nháp đặt lại T2 | `GET /bookings/:id/interruption-draft` | Endpoint đã có, dùng lại bởi `InterruptionRebookForm` |
| Xác nhận đặt lại T2 | `POST /bookings/:id/interruption-rebook` | Lịch/địa chỉ/giá mới, idempotent theo nguồn |
| Tải ảnh chứng cứ | `POST /service-orders/:id/evidence` (`type=additional`) | Dùng lại `uploadFailedRepairEvidence` |

Mã nguồn: `src/api/platform-continuation.api.ts`, `src/api/interruption-rebook.api.ts`.

### 2.1 Lệnh `cannot-continue`

```json
{
  "commandId": "UUID v4",
  "reasonClass": "technician_skill_gap | non_technician_exception",
  "reasonCode": "skill_gap | device_too_old | severe_damage | no_compatible_part | manufacturer_warranty_or_workshop | dispute_or_other",
  "reason": "10–2000 ký tự sau khi trim",
  "photoEvidenceIds": ["UUID"]
}
```

- `technician_skill_gap` chỉ đi với `skill_gap`; `non_technician_exception` không được dùng
  `skill_gap`. `customer_absent` và `customer_cancelled` bị loại khỏi kiểu vì đó không phải lý do thợ
  không thể tiếp tục.
- Tối đa 3 ảnh, mỗi ảnh phải là UUID do server trả về; danh sách được chuẩn hóa chữ thường, sắp xếp
  và không trùng.
- `commandId` sinh một lần cho mỗi nội dung và được giữ trong bộ nhớ của trang cho đơn đó. Mở lại
  hộp thoại hay đổi máy trong cùng lượt thì gửi lại **đúng** `commandId`; đổi nội dung sau khi lệnh
  đã khóa thì không gửi được lệnh khác. Không lưu vào `localStorage`.
- Lỗi `400`/`422` cho phép sửa nội dung. Lỗi `4xx` khác khóa lệnh và yêu cầu tải lại công việc. Lỗi
  mạng, `408`, `5xx` hoặc không đọc được mã trạng thái là **không chắc chắn**: chỉ cho thử lại cùng
  nội dung, không gửi lệnh mới và không báo thành công.

### 2.2 Phản hồi dùng chung cho POST và GET

```json
{
  "version": 1,
  "incidentId": "UUID",
  "serviceOutcome": "VERIFIED_INTERRUPTION_RECORDED",
  "serviceOrderStatus": "en_route | under_repair",
  "terminalTransitionApplied": false,
  "oldObligations": {
    "reviewRequired": true,
    "quotePreserved": true,
    "moneyPreserved": true,
    "partsPreserved": true,
    "physicalReturnAcceptance": "MANUAL_SERVICE_MANAGER_ONLY",
    "legacyPartReturnState": "NOT_VERIFIED"
  },
  "customerContinuation": {
    "eligible": true,
    "independentNewBookingAllowed": true,
    "prefilledRebookAvailable": true,
    "draftPath": "/api/v1/bookings/UUID/interruption-draft",
    "confirmationPath": "/api/v1/bookings/UUID/interruption-rebook",
    "targetKind": "booking | visit_group",
    "sourceCount": 1,
    "requiresNewSchedule": true,
    "requiresPricingRevalidation": true,
    "requiresCustomerConfirmation": true,
    "source": {
      "serviceOrderId": "UUID",
      "bookingId": "UUID",
      "incidentId": "UUID",
      "visitGroupId": "UUID | null"
    }
  }
}
```

Kiểm tra ở `readResult` (fail-closed):

- `version === 1`, `terminalTransitionApplied === false`, `serviceOrderStatus` thuộc enum đã biết.
- `oldObligations`: ba cờ giữ nguyên phải là `true`, `physicalReturnAcceptance` phải là
  `MANUAL_SERVICE_MANAGER_ONLY`, `legacyPartReturnState` phải là `NOT_VERIFIED`.
- `customerContinuation`: ba cờ `requires*` phải là `true`; `eligible`,
  `independentNewBookingAllowed`, `prefilledRebookAvailable` phải là boolean.
- Khi `eligible = true`: `incidentId` là UUID, `serviceOutcome` là
  `VERIFIED_INTERRUPTION_RECORDED`, đơn vẫn `en_route`/`under_repair`, `reviewRequired = true`, và
  `source` phải khớp chính xác đơn/booking/lượt đang mở.
- Khi `eligible = false`: không được có `incidentId`, `serviceOutcome`, `source`, không được bật
  `independentNewBookingAllowed`/`prefilledRebookAvailable` và `reviewRequired` phải là `false`.
- Khi `prefilledRebookAvailable = true` (T2): `sourceCount` là số nguyên `1..3`, `targetKind` phải là
  `booking` khi một nguồn và `visit_group` khi nhiều nguồn, `draftPath`/`confirmationPath` phải đúng
  chính xác booking đang xem (`/api/v1/bookings/<bookingId>/...`). Thiếu một trường hoặc có URL ngoài
  thì fail-closed.
- Khi `prefilledRebookAvailable = false`: bốn trường T2 phải vắng mặt; T1 vẫn hợp lệ khi không có chúng.
- Web chỉ dùng lại các trường đã duyệt; không mở URL hay đường dẫn nháp do server trả về. CTA điền
  sẵn chỉ điều hướng bằng `source.bookingId` đã đối chiếu, không dùng `draftPath`/`confirmationPath`.

## 3. Hành vi theo vai trò và giai đoạn

### 3.1 Kỹ thuật viên — `src/pages/technician/TechnicianJobDetailPage.vue`

- Mục “Không thể tiếp tục công việc” chỉ hiện sau check-in hợp lệ và khi đơn ở `EN_ROUTE` hoặc
  `UNDER_REPAIR`, chưa xin hoàn thành và không có thao tác đang chạy. Trước check-in mục này ẩn.
- “Báo cáo hỗ trợ · kỹ năng” và “Báo cáo hỗ trợ · ngoại lệ” ở lại là hành động **chỉ báo cáo**:
  công việc tiếp tục, không dừng và không hủy đơn.
- “Không sửa được máy này” giữ nguyên là tuyến khách quan (`/repair-failed`) với hợp đồng riêng.
- Sau khi ghi nhận thành công, trang giữ kết quả trong bộ nhớ theo đơn, hiện bước “Đã ghi nhận gián
  đoạn” nhắc khai số linh kiện thực trả để quản lý dịch vụ kiểm đếm và nhận thực tế, và ẩn cả ba
  hành động dừng/báo cáo cho tới khi tải lại. Server vẫn là nguồn chân lý khi tải lại trang.
- Hộp thoại không đóng khi đang gửi hoặc đang tải ảnh; khóa điều khiển sau lỗi không chắc chắn; lỗi
  được đọc qua `userFacingError`, không hiện mã lỗi thô.

### 3.2 Khách hàng — `src/pages/customer/CustomerOrderDetailPage.vue`

- `CustomerContinuationPanel` chỉ được mount khi đơn đang `EN_ROUTE` hoặc `UNDER_REPAIR`, nên đơn
  terminal không phát sinh lượt đọc vô ích.
- Panel đọc `customer-continuation` khi mở, khi đổi thiết bị/đơn/lượt, khi có sự kiện realtime của
  đơn, khi resync socket, khi quay lại tab và khi mạng trở lại.
- Chỉ hiện nội dung khi `eligible = true`: nói rõ đơn cũ **chưa bị hủy**, báo giá/tiền/nghĩa vụ linh
  kiện được giữ để đối soát, khai trả linh kiện chưa phải xác nhận kho đã nhận, và đặt lịch mới độc
  lập không chuyển tiền hay ưu đãi cũ.
- Nút “Đặt lịch mới” chỉ hiện và chỉ điều hướng khi server trả `independentNewBookingAllowed = true`;
  đích là `/app/bookings/new` (booking mới, không mang dữ liệu đơn cũ).
- Nút “Đặt lại dịch vụ” chỉ hiện khi `eligible = true`, `prefilledRebookAvailable = true`, metadata T2
  hợp lệ và `source.bookingId`/`source.serviceOrderId` trùng đúng booking/đơn đang xem. Nút điều
  hướng tới `/app/bookings/new?interruptionRebook=<source.bookingId>` để dùng `InterruptionRebookForm`
  đã có; không mở `draftPath`/`confirmationPath` do server trả về và không tự tạo booking.
- Khi điền sẵn không khả dụng, UI ghi ngắn “Đặt lại với thông tin điền sẵn chưa sẵn sàng.” và vẫn giữ
  nút đặt lịch mới độc lập nếu server cho phép. Khi điền sẵn khả dụng, nút độc lập vẫn còn.
- Biểu mẫu đặt lại chỉ mang mô tả/thiết bị/thuộc tính mô tả; khách chọn lịch, địa chỉ và phạm vi/giá
  mới. Với nguồn T2 tại nhà, biểu mẫu ghi rõ đơn cũ **chưa bị hủy** và giữ báo giá, thanh toán, ưu
  đãi cùng nghĩa vụ linh kiện để đối soát; không hiện hay cấp voucher.
- Lỗi đọc hiện thông báo giữ nguyên dữ liệu đơn cũ và nút “Thử lại”; không hiện số tiền 0 giả, không
  hiện CTA. Phản hồi đến muộn của thiết bị trước bị bỏ qua bằng số thế hệ và khóa phạm vi.

## 4. Không làm trong lượt này

- Không thêm endpoint, migration hay hợp đồng mới; chỉ dùng `interruption-draft`/`interruption-rebook`
  đã có theo T2.
- Không dùng lại báo giá, giá, voucher hay lịch cũ; không tạo booking giả và không cấp voucher.
- Không thêm cổng duyệt Service Manager, không đổi quyền, enum hay hợp đồng Backend/Mobile.
- Không đổi bố cục rộng của trang công việc/chi tiết đơn ngoài việc gắn hai thành phần mới.

## 5. Kiểm chứng

- `tests/platform-first-continuation-api.spec.ts`, `tests/platform-first-technician-dialog.spec.ts`,
  `tests/platform-first-technician-page.spec.ts`, `tests/platform-first-customer.spec.ts`: phủ payload
  typed, `commandId` ổn định, khóa/thử lại, fail-closed, gating theo vai trò/giai đoạn và không gọi
  `/cancel` hay `/repair-failed` từ luồng mới.
- `tests/platform-first-continuation-api.spec.ts` bổ sung T2: metadata đúng cho một/nhiều nguồn, sai
  path/URL ngoài, sai `targetKind`/`sourceCount`, thiếu metadata khi bật, metadata khi tắt và nguồn
  ngoài booking/đơn đang xem.
- `tests/platform-first-customer.spec.ts` bổ sung CTA “Đặt lại dịch vụ” và đúng query
  `interruptionRebook=<bookingId>`; `tests/interruption-rebook-api.spec.ts` phủ nguồn T2 đang hoạt
  động (booking `MATCHED`, đơn `EN_ROUTE`/`UNDER_REPAIR`) và từ chối case/booking không khớp.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` và `git diff --check` là cổng bắt
  buộc; kết quả của lần chạy gần nhất được ghi ở `docs/CONTEXT.md` mục 9.
- Browser thật với tài khoản thợ/khách, Backend DEV, Socket.IO thật và parity Mobile: **CHƯA KIỂM
  CHỨNG**. Không có E2E đăng nhập hay bằng chứng runtime trong lượt này.
