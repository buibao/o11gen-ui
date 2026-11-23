# Repo cá nhân và cập nhật từ OutSystems

Repo cá nhân public: <https://github.com/buibao/o11gen-ui>.
Repo gốc: <https://github.com/OutSystems/outsystems11-mcp>.

Giữ nguyên lịch sử Git và giấy phép MIT của OutSystems để các thay đổi cá nhân
và bản cập nhật chính thức có chung lịch sử khi merge.

## Remote

| Remote | Fetch | Push |
| --- | --- | --- |
| `origin` | `https://github.com/buibao/o11gen-ui.git` | Repo cá nhân |
| `upstream` | `https://github.com/OutSystems/outsystems11-mcp.git` | Bị chặn bằng push URL `DISABLED` |

Nhánh `main` theo dõi `origin/main`. Đích push mặc định là `origin`.
Các cấu hình remote chỉ nằm trong `.git/config`, không đi theo lần clone mới.

## Lấy bản cập nhật

Trước tiên commit các thay đổi đang làm, rồi kiểm tra `git status --short` không
còn kết quả. Không merge khi vẫn còn thay đổi chưa lưu.

```powershell
git switch main
git pull --ff-only origin main
git fetch upstream
git log --oneline main..upstream/main
git diff --stat main...upstream/main
```

Nếu có cập nhật, tạo một nhánh sync mới (đổi ngày hoặc thêm hậu tố để tên chưa tồn tại):

```powershell
git switch -c sync/upstream-2026-11-23
git merge --no-ff upstream/main
```

Nếu có conflict, mở từng file và kết hợp phần mới của OutSystems với phần tùy
chỉnh cá nhân. Sau khi sửa, dùng `git add <file>` cho từng file đã kiểm tra, rồi
`git commit` để hoàn tất merge. Dùng `git merge --abort` nếu muốn hủy lần merge
đang xung đột. Tránh chọn toàn bộ `ours` hoặc `theirs`, vì có thể bỏ mất một bên.

Kiểm tra bản hợp nhất bằng fixture suite của harness:

```powershell
npm ci
npm test
git push -u origin sync/upstream-2026-11-23
```

Tạo Pull Request từ nhánh sync vào `main` **trong `buibao/o11gen-ui`**, kiểm tra
diff rồi merge PR. Sau đó cập nhật checkout:

```powershell
git switch main
git pull --ff-only origin main
```

Giữ kiểu merge thông thường cho nhánh sync để bảo toàn quan hệ với lịch sử
upstream; tránh squash/rebase PR sync. Nếu `main` đã chứa tất cả commit upstream,
không cần tạo nhánh hay merge.

## Clone trên máy khác

```powershell
git clone https://github.com/buibao/o11gen-ui.git
cd o11gen-ui
git remote add upstream https://github.com/OutSystems/outsystems11-mcp.git
git remote set-url --push upstream DISABLED
git config remote.pushDefault origin
git config push.default simple
git fetch upstream
```

Các file local như `harness.local.json`, `.env`, báo cáo và browser session được
gitignore loại khỏi commit. Cài lại dependency bằng `npm ci`; cấu hình local và
quyền của Service Studio được thiết lập riêng trên từng máy.
