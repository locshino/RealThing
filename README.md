# RealThing

> [!NOTE]
> **RealThing** là một bản rút gọn (lightweight fork) từ dự án gốc [**ThinkRail**](https://github.com/JetBrains/thinkrail). Phiên bản này lược bỏ toàn bộ các tính năng AI agent, assistant và mô hình bên ngoài; tập trung hoàn toàn vào **hiệu năng tối đa (performance)**, quy trình làm việc với **Git worktrees**, chỉnh sửa code mượt mà qua **Monaco Editor + Shiki**, kiểm tra diff đa phạm vi và terminal tích hợp.

RealThing is a modern, workspace-first developer workbench and IDE built around Git worktrees, high-performance file editing (Monaco + Shiki), multi-scope diff and change review, integrated PTY terminals, and lightweight manual checklists.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/readme-assets/workbench-dark.png">
  <img src=".github/readme-assets/workbench-light.png" alt="RealThing workbench: the Projects pane beside the left tool rail listing worktree workspaces, the editor and diff views in the center, and the Changes list on the right with their tools on the edge rail" width="900">
</picture>

*An isolated git-worktree workspace with its files, diffs, changes, and integrated terminal.*

---

## Why RealThing?

- **Zero AI Overhead**: Loại bỏ hoàn toàn các luồng xử lý AI, token billing và các tác vụ ngầm phức tạp. Khởi động tức thì, tiêu tốn ít RAM và CPU, mang lại trải nghiệm lập trình thuần túy, nhanh và ổn định.
- **Git Worktree Isolation**: Mỗi tác vụ/tính năng là một Git worktree độc lập với nhánh và thư mục làm việc riêng. Làm việc song song trên nhiều nhánh mà không bao giờ lo conflict uncommitted changes hay phải `git stash`.
- **High-Performance Editor & Review**: Trình soạn thảo Monaco Editor kết hợp cùng Shiki syntax highlighter, trình duyệt diff chi tiết từ cấp độ branch, commit cho đến từng hunk thay đổi với khả năng revert an toàn.
- **True PTY Terminals**: Terminal PTY thật (`bun-pty` + `@xterm/xterm`) gắn liền với từng workspace worktree, giữ nguyên phiên làm việc kể cả khi tải lại trang.
- **100% Local & Privacy-First**: Toàn bộ cấu hình và dữ liệu làm việc nằm hoàn toàn cục bộ trên máy tính của bạn tại thư mục `~/.realthing`.

---

## Features

- **Isolated workspaces**: Mở bất kỳ repo Git nào dưới dạng dự án và tạo các workspace mới dưới dạng `git worktree`. Quản lý song song nhiều nhánh, xem trước ahead/behind với remote `origin`, mở worktree trong IDE ngoài hoặc file manager bất cứ lúc nào.
- **Splittable workbench**: Giao diện chia màn hình linh hoạt gồm Monaco Editor, các bộ render phong phú (Markdown, JSON, CSV, notebooks, SVG, PDF, hình ảnh), cây thư mục với đánh dấu trạng thái Git trực quan.
- **Multi-scope Changes**: Xem và so sánh diff theo phạm vi toàn nhánh, uncommitted changes, hoặc theo từng commit riêng lẻ; hỗ trợ hoàn tác/revert theo từng file hoặc từng hunk.
- **Workspace plans**: Danh sách checklist công việc theo nhóm được lưu trữ trực tiếp trong từng workspace, giúp quản lý tiến độ mà không cần công cụ bên thứ ba.
- **Hai hình thức sử dụng (Desktop & Browser CLI)**: Khởi chạy dạng Desktop App hoặc chạy lệnh `realthing` trên terminal để mở giao diện ngay trên trình duyệt web cục bộ.
- **Tùy biến giao diện & Đa ngôn ngữ**: Tích hợp sẵn theme Dark, Light, Minimal, High Contrast và hỗ trợ tùy biến theme qua `~/.realthing/themes`. Hỗ trợ đổi ngôn ngữ giao diện (English, Japanese, Chinese, Spanish,...) qua `~/.realthing/locales`.

---

## Quick Start & Development

Dự án yêu cầu runtime [**Bun**](https://bun.sh/) (phiên bản khuyến nghị `>= 1.4.0`).

### 1. Clone repository & Cài đặt dependencies

```bash
git clone https://github.com/locshino/realthing.git
cd realthing
bun install
```

### 2. Chạy môi trường Development

Khởi động cùng lúc cả backend host và web frontend:

```bash
bun run dev
```

Hoặc chạy riêng lẻ từng package:

```bash
bun run dev:server    # Chạy host server (@realthing/server)
bun run dev:web       # Chạy Vite dev server cho web UI (@realthing/web)
```

### 3. Build & Trải nghiệm Standalone CLI

Build gói giao diện web và đóng gói file nhị phân độc lập:

```bash
# 1. Build bundle web
bun run build:web

# 2. Khởi chạy thử trực tiếp CLI host
bun apps/cli/src/index.ts

# 3. Hoặc biên dịch thành file binary duy nhất (single-file executable)
bun run build:binary
./apps/cli/dist/realthing ~/path/to/your/project
```

### 4. Đóng gói ứng dụng Desktop (Electrobun)

```bash
bun run desktop:dev      # Build và mở ứng dụng desktop
bun run desktop:build    # Build package native desktop
```

---

## Architecture

RealThing được kiến trúc thành 3 vòng độc lập (Three Rings Architecture):

* **Host (`packages/server` + `packages/shared`)**: Chạy trên Bun/Node.js, quản lý tiến trình hệ thống, file watcher, Git engine, PTY terminals và lưu trữ trạng thái tại `~/.realthing`.
* **The Wire (`packages/contracts`)**: Bộ giao thức kết nối RPC và WebSocket 2 chiều có kiểm soát kiểu dữ liệu nghiêm ngặt (schema-validated).
* **UI Client (`apps/web`)**: Ứng dụng web React 19 + Tailwind CSS v4 + Monaco Editor, độc lập với server và giao tiếp hoàn toàn qua WebSocket.

---

## License

Mã nguồn được phân phối theo giấy phép [**Apache License 2.0**](LICENSE).
Tôn trọng và kế thừa bản quyền từ dự án gốc ThinkRail.
