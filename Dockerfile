# Dockerfile cho FixHome Web (Vue 3 + Vite)
#
# Ba tầng, chọn tầng nào là do `target` trong docker-compose.yml quyết định:
#
#   dev     — chạy hằng ngày, có máy chủ phát triển của Vite nên sửa code là
#             trình duyệt tự cập nhật, không cần tải lại trang.
#   builder — tầng trung gian, dựng ra thư mục tĩnh.
#   runner  — bản gọn để triển khai thật, Nginx phục vụ file tĩnh.

# ─────────────────────────────────────────────────────────── tầng phát triển ──
FROM node:20-alpine AS dev

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Bind mount trên Windows không bắn sự kiện thay đổi file vào container, nên
# trình theo dõi của Vite phải tự hỏi lại đĩa theo chu kỳ.
ENV CHOKIDAR_USEPOLLING=true

EXPOSE 5173

# `--host 0.0.0.0` là bắt buộc. Mặc định Vite chỉ nghe trên 127.0.0.1 của chính
# container, nên trình duyệt ngoài máy thật sẽ không vào được.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# ──────────────────────────────────────────────────────────── tầng biên dịch ──
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite nướng các biến VITE_* vào mã nguồn NGAY LÚC BUILD, không phải lúc chạy.
# Nghĩa là thiếu một biến ở đây thì không có cách nào bù lại lúc khởi động
# container — phải dựng lại image. Thêm biến VITE_* mới thì nhớ khai thêm ở đây
# một dòng ARG và một dòng ENV.
ARG VITE_API_BASE_URL=http://localhost:3000/api/v1
ARG VITE_APP_TITLE=FixHome
ARG VITE_MAPTILER_KEY
ARG VITE_GOOGLE_CLIENT_ID

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_APP_TITLE=${VITE_APP_TITLE}
ENV VITE_MAPTILER_KEY=${VITE_MAPTILER_KEY}
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}

RUN npm run build

# ────────────────────────────────────────────────────────── tầng triển khai ──
FROM nginx:alpine AS runner

RUN rm -rf /usr/share/nginx/html/*

COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
