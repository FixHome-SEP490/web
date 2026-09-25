# Chạy web bằng Docker

Viết cho người chưa từng dùng Docker.

## Ba lệnh cần nhớ

```
docker compose up -d      bật web lên chạy nền
docker compose logs -f    xem log, Ctrl+C để thoát khỏi màn hình log
docker compose down       tắt đi
```

Chạy trong thư mục repo web. Sau khi bật, mở `http://localhost:5173`.

**Backend là repo riêng, có compose riêng.** Bật backend trước, rồi mới bật cái
này. Không có backend thì trang vẫn hiện nhưng mọi lời gọi API đều lỗi.

## Sửa code có phải dựng lại không

Không. Container chạy máy chủ phát triển của Vite, sửa file trong `src/` là
trình duyệt tự cập nhật ngay, thường không cần tải lại trang. Đo thật trên máy
Windows: chạm vào một file `.vue` thì Vite bắn cập nhật trong **cùng một giây**.

Cơ chế: compose gắn thư mục `src` trên máy thật vào trong container, nên
container nhìn thấy đúng file bạn đang sửa.

Phải dựng lại image khi:

| Khi nào | Lệnh |
|---|---|
| Thêm hoặc gỡ thư viện (`package.json` đổi) | `docker compose up -d --build` |
| Sửa `Dockerfile` hoặc `vite.config.ts` | `docker compose up -d --build` |
| Sửa `.env` | `docker compose restart` |

## Chuyện biến VITE_ — chỗ dễ sai nhất

Vite **nướng các biến `VITE_*` vào mã nguồn ngay lúc build**, không phải lúc
chạy. Khác hẳn backend, nơi biến đọc lúc khởi động.

Ở chế độ phát triển thì không sao, vì compose gắn `.env` vào container dạng chỉ
đọc nên Vite đọc trực tiếp từ đĩa, sửa xong `docker compose restart` là xong.

Nhưng ở **tầng `runner`** dùng khi triển khai thật thì mỗi biến `VITE_*` phải
được khai làm `ARG` và `ENV` trong `Dockerfile`. Thiếu một dòng ở đó thì biến
mất tăm trong bản dựng, và **không có cách nào bù lại lúc chạy** — phải dựng lại
image.

Nên mỗi lần thêm một biến `VITE_*` mới vào `.env.example`, nhớ mở `Dockerfile`
thêm đúng hai dòng vào tầng `builder`:

```dockerfile
ARG VITE_TEN_BIEN_MOI
ENV VITE_TEN_BIEN_MOI=${VITE_TEN_BIEN_MOI}
```

Quên bước này là lỗi đã từng xảy ra thật: `VITE_GOOGLE_CLIENT_ID` không có trong
`Dockerfile`, nên nút đăng nhập Google chạy tốt khi gõ `npm run dev` nhưng biến
mất trong bản Docker.

## Vì sao phải có `--host 0.0.0.0`

Mặc định Vite chỉ lắng nghe trên `127.0.0.1` của **chính container**, nên trình
duyệt ngoài máy thật không vào được. Lệnh khởi động trong `Dockerfile` đã thêm
sẵn `--host 0.0.0.0`, đừng bỏ đi.

## Vì sao không gắn cả thư mục gốc vào container

Compose chỉ gắn `src`, `public` và `index.html`. Gắn cả thư mục gốc thì
`node_modules` cài trên Windows sẽ đè lên bản cài cho Linux trong container, mà
hai bên biên dịch khác nhau nên container sẽ hỏng ngay khi khởi động.

## Khi gặp lỗi

**Cổng 5173 đã bị chiếm** — có `npm run dev` nào đó đang chạy ngoài Docker. Tắt
nó đi.

**Trang trắng, console báo lỗi gọi API** — backend chưa bật, hoặc
`VITE_API_BASE_URL` trong `.env` trỏ sai. Giá trị đúng là
`http://localhost:3000/api/v1`, vì bên gọi API là **trình duyệt trên máy thật**
chứ không phải container, nên dùng `localhost` là đúng.

**Lỗi CORS** — `CORS_ORIGIN` trong `.env` của backend phải chứa
`http://localhost:5173`.

**Sửa code mà không thấy gì đổi** — kiểm file có nằm trong `src/` không, chỉ thư
mục đó được gắn vào container.
