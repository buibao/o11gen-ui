# Audit nguyên tắc chuyển thiết kế Figma sang OutSystems 11

Ngày 23/11/2026 · Checkout `0e8bf20` · Phạm vi gồm skill, registry, harness TypeScript và fixture trình duyệt.

**Kết luận: tuân thủ một phần.** Harness giữ được thiết kế tham chiếu và đo được sai lệch giao diện. Mapping hiện xác nhận rằng một tên đích và các dependency đã khai báo có trong inventory. Các quyết định dùng token, chọn block phù hợp, áp dụng variant và binding lên đúng widget vẫn phụ thuộc vào người hoặc agent thực hiện.

## Những gì harness kiểm tra được

- Import kiểm tra ID của frame và kích thước PNG theo export scale. Manifest giữ cây node hiển thị, tọa độ tương đối, các trường Auto Layout, style, hiệu ứng, component properties và bound variables nếu đầu vào có cung cấp. [Mã import](../harness/design.ts)
- Registry dùng chung cho các lần map. Harness từ chối alias trùng, inventory khác module, node chưa nhận diện được, target hoặc dependency khai báo còn thiếu. [Mã mapping](../harness/mapping.ts)
- Ở runtime, Playwright kiểm tra deployment marker, so ảnh theo ngưỡng, đo bounding box, đọc computed style của selector trong plan và kiểm tra tràn ngang. Có thể kiểm tra tương tác nếu được bật và có bước tương ứng. Các phép đo này có giá trị khi đánh giá kết quả hiển thị. [Browser](../harness/browser.ts) · [So ảnh và schema của plan](../harness/visual.ts)

## Phát hiện theo mức ảnh hưởng

| Mức | Phát hiện | Bằng chứng và hệ quả |
| --- | --- | --- |
| Cao | Card có thể được map trái với hướng dẫn Reactive của chính repo | Tài liệu Reactive ưu tiên composite block phù hợp mà module đã tham chiếu. Trong registry, Card luôn chọn Container và ghi Content/Card là fallback. Với inventory chứa Container, Content/Card và Content/CardSectioned, phép thử vẫn trả về Container và PASS. Một record card có thể mất cấu trúc placeholder và khả năng tái sử dụng của block. [Registry](../config/osui-registry.json) · [Quy tắc chọn block](../servicestudio-mcp-oml/reference/osui-verified-blocks.md#use-composite-osui-blocks-by-default-first-pass--not-a-later-polish-step) |
| Cao | Mapping không đối chiếu token, thuộc tính layout và variant/state | Manifest có chỗ lưu boundVariables và componentProperties. Danh mục variables chỉ biểu diễn một giá trị scalar hoặc null trên mỗi ID, thiếu cấu trúc cho collection, mode và chuỗi alias. Mapper chỉ lấy componentId trong properties của node. Hai Button khác state, fill, spacing và giá trị variable cho cùng kết quả mapping. Giá trị đích của từng thuộc tính không xuất hiện trong mapping.json. [Manifest](../harness/design.ts) · [Mapper](../harness/mapping.ts) |
| Cao | Gate chưa nối mapping từng node với widget, class và binding đọc lại từ OML | Ở lượt đầu, generate có thể PASS trước khi có plan. Trước merge, gate kiểm tra đúng màn hình/module, path, lỗi validation, hai hash khác nhau và cờ expectedChangesPresent. Nó không tự đối chiếu danh sách widget, parent, SourceBlock, input/placeholder hay class với mapping. Riêng Input + Label là một chuỗi mà người lập inventory phải xác minh cả hai thành viên trước khi ghi. [Gate theo lượt](../harness/run.ts) · [Gate model](../harness/gates.ts) · [Quy ước inventory](../setup-docs/harness-evidence.md) |
| Vừa | Quy tắc dùng CSS có trong skill, chưa được kiểm tra trên stylesheet | Skill yêu cầu tái sử dụng OSUI token, ưu tiên style sẵn có, giới hạn CSS tùy chỉnh và tránh inline style hoặc !important thiếu lý do. Browser chỉ so giá trị cuối của các thuộc tính trong plan. Ví dụ, padding viết trực tiếp và padding lấy từ token có thể cùng ra 8px. Gate hiện không kiểm scope của selector, nguồn token hay lý do dùng fallback. [Skill mapping](../.claude/skills/figma-inspect-map/SKILL.md) · [Computed style](../harness/browser.ts) |
| Vừa | Browser plan có thể đạt PASS dù dùng ID không tồn tại trong Figma | Schema nhận id dạng chuỗi. Coverage kiểm theo nhóm geometry, typography, color và assets trên cả viewport. Trong fixture có đủ ảnh, selector và assertions hợp lệ, chỉ đổi ID của Button thành một chuỗi ngoài manifest vẫn cho PASS. Vì vậy việc đối chiếu từng node quan trọng và các trạng thái như disabled/focus còn phụ thuộc vào chất lượng plan. [Schema](../harness/visual.ts) · [Thực thi plan](../harness/run.ts) |

## Các phép thử phân biệt đã chạy

`npm.cmd test` trên checkout này đã chạy thành công TypeScript, 30 unit test và 8 integration test. Các phép thử dưới đây được chạy bổ sung bằng dữ liệu tổng hợp để kiểm tra phạm vi của kết quả PASS.

| Dữ liệu fixture | Kết quả quan sát |
| --- | --- |
| Hai Button cùng ID và component, lần lượt Default/đỏ/spacing 8 và Disabled/xanh/spacing 24. Giá trị variable tương ứng cũng thay đổi. | Hai manifest khác nhau. Hai kết quả mapping giống hệt nhau, cùng PASS. |
| Card với Container và cả hai block Card trong inventory. | Chọn Container, PASS. |
| Text field với Input và Label được liệt kê riêng. Sau đó thay hai mục bằng chuỗi tổng hợp theo quy ước của repo. | Lần đầu BLOCKED vì thiếu chuỗi “Input + Label”. Lần sau PASS. Mapping chưa chứng minh quan hệ Label–Input hoặc biến mà Input sử dụng. |
| Fixture có đúng manifest, PNG, inventory và preflight. Chưa tạo file plan. | Gate generate đầu tiên PASS. |
| Fixture trên localhost, plan có đúng selector của Button nhưng dùng ID ngoài manifest. | Validator trình duyệt PASS. [Báo cáo fixture của lần audit](../reports/c202792e-2b5a-490e-9784-786b5e9c62bf/index.html) là artifact cục bộ được Git bỏ qua. |

## Thứ tự khắc phục đề xuất

1. Mở rộng **mapping hiện có** theo node ID. Ghi loại widget hoặc block, đường dẫn đích, variant, input/placeholder, class, token nguồn và token/theme đích. Với node có nhiều lựa chọn, dùng vai trò của component và inventory để chọn. Ghi lý do khi dùng Container hoặc CSS tùy chỉnh cho một component phức hợp.
2. Ở gate generate, yêu cầu plan cho những node và thuộc tính cần nghiệm thu. Ở gate merge, so mapping với dữ liệu readback có cấu trúc. Một Button disabled cần khớp binding điều khiển trạng thái. Một record card cần khớp block và các placeholder đã chọn. Với token, kiểm tra cả khai báo CSS hoặc class thực dùng và giá trị mong đợi theo mode.
3. Bổ sung các fixture phân biệt đúng với “trông giống”: Card có block phù hợp, Button đổi variant, token đổi mode, giá trị hardcode trùng token, Input thiếu liên kết Label, selector đúng nhưng node ID sai. Sau publish, đối chiếu ảnh và computed style ở các viewport/state đã có yêu cầu.

## Mức bằng chứng live

Ghi chú Liquid Glass của repo ghi nhận chín widget native, scoped theme CSS, merge và readback trên Demo_TH_Fabric / DesignReview. Lần đó dừng trước publish. Audit này dùng source và fixture cục bộ. Độ khớp của một màn hình O11 đã publish với Figma vẫn **chưa được xác minh**. [Ghi chú lần chạy](../exceptions/2026-11-23-liquid-glass/run-notes.md)
