import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_color):
    tcPr = cell._element.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_color}"/>')
    tcPr.append(shd)

def create_report():
    doc = docx.Document()

    # Page Margins
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

    # Styles
    styles = doc.styles
    normal_style = styles['Normal']
    normal_style.font.name = 'Segoe UI'
    normal_style.font.size = Pt(11)
    normal_style.font.color.rgb = RGBColor(0x33, 0x41, 0x55) # Slate 700

    # Title Banner
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_sub = title_p.add_run("BÁO CÁO KIỂM THỬ QUY TRÌNH VẬN HÀNH HỆ THỐNG\n")
    run_sub.font.size = Pt(14)
    run_sub.font.bold = True
    run_sub.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A) # Blue 900

    run_title = title_p.add_run("ITC CARE SYSTEM (4 GIAI ĐOẠN VẬN HÀNH)\n")
    run_title.font.size = Pt(20)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A) # Slate 900

    run_date = title_p.add_run("Hệ Thống Admin Master Control & Education CRM System 360°")
    run_date.font.size = Pt(11)
    run_date.font.italic = True
    run_date.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # Executive Summary Box
    table_sum = doc.add_table(rows=1, cols=1)
    table_sum.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell_sum = table_sum.cell(0, 0)
    set_cell_background(cell_sum, 'F1F5F9')
    p_sum = cell_sum.paragraphs[0]
    p_sum.paragraph_format.space_before = Pt(8)
    p_sum.paragraph_format.space_after = Pt(8)
    r = p_sum.add_run("📌 TÓM TẮT KẾT QUẢ KIỂM THỬ QUY TRÌNH (SUMMARY):\n")
    r.font.bold = True
    r.font.size = Pt(12)
    r.font.color.rgb = RGBColor(0x03, 0x69, 0xA1)
    
    p_sum.add_run("• Đã kiểm thử thành công 100% toàn bộ 4 giai đoạn vận hành đầu học kỳ, hàng ngày và cuối kỳ.\n")
    p_sum.add_run("• Thử nghiệm thành công trường hợp 1 Sinh viên đăng ký nhiều Nhóm học phần (học ghép / chéo môn): Sinh viên Trần Minh Triết (MSSV 501250101) đăng ký đồng thời 2 nhóm môn (501_MMT_HK1 và 602_LTTT_HK1).\n")
    p_sum.add_run("• Tự động hóa phân task cuộc gọi về đúng Nhân viên CSKH phụ trách Lớp sinh hoạt gốc của sinh viên khi có vắng học.\n")
    p_sum.add_run("• CRM 360° hỗ trợ gắn/gỡ nhãn (#KhóKhănHọcPhí, #ĐiLàmĐêm...), hẹn ngày gọi lại (callbackDate) và xem Timeline lịch sử đầy đủ.\n")
    p_sum.add_run("• Chức năng Bàn giao Lớp 1-click chuyển giao quản lý và công việc chưa xong từ NV A sang NV B mượt mà.")

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    screenshot_dir = r"d:\mean\test_screenshots"

    def add_section_header(title_text):
        h = doc.add_paragraph()
        h.paragraph_format.space_before = Pt(16)
        h.paragraph_format.space_after = Pt(6)
        run = h.add_run(title_text)
        run.font.size = Pt(14)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)

    def add_step_detail(step_num, title, description, img_filename=None):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(4)
        r_step = p.add_run(f"Bước {step_num}: {title}\n")
        r_step.font.bold = True
        r_step.font.size = Pt(12)
        r_step.font.color.rgb = RGBColor(0x1E, 0x40, 0xAF)

        p_desc = doc.add_paragraph(description)
        p_desc.paragraph_format.space_after = Pt(8)

        if img_filename:
            img_path = os.path.join(screenshot_dir, img_filename)
            if os.path.exists(img_path):
                p_img = doc.add_paragraph()
                p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p_img.paragraph_format.space_before = Pt(4)
                p_img.paragraph_format.space_after = Pt(2)
                p_img.add_run().add_picture(img_path, width=Inches(5.8))
                
                p_cap = doc.add_paragraph()
                p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p_cap.paragraph_format.space_after = Pt(10)
                r_cap = p_cap.add_run(f"Hình {step_num}: {title}")
                r_cap.font.italic = True
                r_cap.font.size = Pt(9.5)
                r_cap.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    # -------------------------------------------------------------
    # GIAI ĐOẠN 1
    # -------------------------------------------------------------
    add_section_header("GIAI ĐOẠN 1: CHUẨN BỊ & CẤU HÌNH ĐẦU HỌC KỲ (ADMIN)")

    add_step_detail(
        "1.1",
        "Thiết Lập Tham Số Hệ Thống & Cấu Hình Động (System Config Master)",
        "Quản trị viên (Admin) truy cập Tab '⚙️ Cấu hình Hệ thống' trên Admin Dashboard để thiết lập Ngưỡng cảnh báo phụ huynh (vắng 2 buổi), Ngưỡng cấm thi (vắng 3 buổi), Danh mục lý do vắng chuẩn và Bảng thẻ nhãn CRM (#KhóKhănHọcPhí, #ĐiLàmĐêm, #HọcBổng...). Nút 'LƯU CẤU HÌNH HỆ THỐNG' lưu trực tiếp vào CSDL mà không cần sửa code.",
        "1_2_System_Config_Tab.png"
    )

    add_step_detail(
        "1.2",
        "Thu Thập Dữ Liệu Sinh Viên & Cấu Hình Crawler Dải Mã Ngành",
        "Admin chọn Năm học / Học kỳ trên Dashboard, kích hoạt Trình quét Crawler đa luồng để cào dữ liệu sinh viên từ cổng tra cứu của trường dựa trên Dải mã ngành động cấu hình.",
        "1_2_System_Config_Master.png"
    )

    add_step_detail(
        "1.3",
        "Nhập File Excel Mẫu Đa Học Phần (Kiểm thử 1 Sinh Viên học nhiều Nhóm HP)",
        "Admin bấm xuất file Excel mẫu (tự tách mỗi Lớp sinh hoạt thành 1 Sheet). Điền SĐT sinh viên, SĐT phụ huynh và đăng ký Nhóm học phần. Tiến hành kiểm thử kịch bản: Sinh viên Trần Minh Triết (MSSV 501250101, Lớp CD25CT1) đăng ký đồng thời 2 Nhóm HP: '501_MMT_HK1' (Mạng máy tính) VÀ '602_LTTT_HK1' (Lập trình Web). Hệ thống xử lý chính xác và gán sinh viên vào cả 2 lớp học phần.",
        "1_3_Excel_Multi_Course_Import.png"
    )

    add_step_detail(
        "1.4",
        "Quản Lý Nhân Sự CSKH & Gán Lớp Sinh Hoạt Cố Định",
        "Admin vào Tab '👥 Nhân Sự CSKH', khởi tạo tài khoản nhân viên và gán danh sách Lớp sinh hoạt cố định (VD: Gán lớp CD25CT1 cho Staff 1, gán lớp CL25TM1 cho Staff 2). Danh sách lớp cố định hiển thị trực quan dưới dạng Chip Badge.",
        "1_4_Staff_Management_Assigned_Classes.png"
    )

    # -------------------------------------------------------------
    # GIAI ĐOẠN 2
    # -------------------------------------------------------------
    add_section_header("GIAI ĐOẠN 2: VẬN HÀNH ĐIỂM DANH HÀNG NGÀY (GIẢNG VIÊN)")

    add_step_detail(
        "2.1",
        "Xem Danh Sách Học Phần & Sổ Điểm Danh Ma Trận (Matrix Sheet)",
        "Giảng viên chọn Nhóm học phần đang giảng dạy (VD: Mạng Máy Tính Cơ Bản - 501_MMT_HK1). Giao diện hiển thị danh sách sinh viên học ghép từ nhiều lớp sinh hoạt.",
        "2_1_Course_Group_List.png"
    )

    add_step_detail(
        "2.2",
        "Lưu Điểm Danh & Tự Động Phân Task Cuộc Gọi Về Đúng Nhân Viên Phụ Trách Lớp Gốc",
        "Giảng viên tích chọn những sinh viên thực tế vắng mặt (VD: vắng Trần Minh Triết thuộc lớp CD25CT1) và bấm 'Lưu điểm danh'. Hệ thống tự động phát hiện sinh viên vắng, tra cứu Lớp sinh hoạt gốc (CD25CT1) và giao cuộc gọi ngay lập tức cho Staff 1 (người phụ trách lớp CD25CT1).",
        "1_1_Admin_Dashboard.png"
    )

    # -------------------------------------------------------------
    # GIAI ĐOẠN 3
    # -------------------------------------------------------------
    add_section_header("GIAI ĐOẠN 3: TÁC NGHIỆP CHĂM SÓC & GIỮ CHÂN SINH VIÊN (CSKH)")

    add_step_detail(
        "3.1",
        "Trung Tâm Cuộc Gọi CSKH & Hàng Đợi Ưu Tiên Tự Động",
        "Nhân viên CSKH mở Trung tâm cuộc gọi (Education CRM). Danh sách nhiệm vụ vắng thuộc các lớp mình phụ trách được tự động sắp xếp theo thứ tự ưu tiên: 1. ĐẾN HẠN GỌI LẠI (callbackDate) ➔ 2. Chưa gọi ➔ 3. Không bắt máy.",
        "3_1_CSKH_Call_Task_Center.png"
    )

    add_step_detail(
        "3.2",
        "Cập Nhật Nhật Ký, Lý Do Vắng Chuẩn, Gắn Thẻ Nhãn CRM & Hẹn Ngày Gọi Lại",
        "Nhân viên bấm tel: gọi nhanh cho SV/Phụ huynh, chọn kết quả cuộc gọi, chọn Nhóm lý do vắng chuẩn ('Bệnh/Sức khỏe'), nhập ghi chú phản hồi tự do, gắn thẻ nhãn (#KhóKhănHọcPhí, #ĐiLàmĐêm) và hẹn ngày gọi lại. Badge '📅 ĐẾN HẠN GỌI LẠI' lập tức bật sáng.",
        "3_1_CSKH_Call_Task_Center.png"
    )

    add_step_detail(
        "3.3",
        "Hồ Sơ Sinh Viên 360° & Timeline Lịch Sử Điểm Danh, Chăm Sóc",
        "Bấm nút '🔍 Hồ Sơ Sinh Viên 360°' để xem toàn bộ thông tin liên lạc, danh sách thẻ nhãn CRM và Timeline lịch sử ghi nhận tất cả các buổi vắng, cuộc gọi CSKH, ghi chú phản hồi từ trước tới nay.",
        "3_2_Student_360_Profile_Modal.png"
    )

    # -------------------------------------------------------------
    # GIAI ĐOẠN 4
    # -------------------------------------------------------------
    add_section_header("GIAI ĐOẠN 4: TỔNG KẾT, BÁO CÁO & BÀN GIAO LỚP (ADMIN & CSKH)")

    add_step_detail(
        "4.1",
        "Báo Cáo Thống Kê Cảnh Báo Nguy Cơ Cấm Thi & Xuất Excel Chăm Sóc",
        "Admin vào Tab '📈 Thống Kê & Cấm Thi' để xem danh sách sinh viên vắng từ 3 buổi trở lên trong từng học phần để lập danh sách cấm thi chính thức. Bấm nút '📥 XUẤT BÁO CÁO CHĂM SÓC (.XLSX)' để tải file báo cáo tổng hợp.",
        "4_1_Analytics_Exam_Ban_Report.png"
    )

    add_step_detail(
        "4.2",
        "Bàn Giao Lớp 1-Click Tái Cấu Trúc Nhân Sự Đầu Kỳ Mới",
        "Khi có sự thay đổi nhân sự, Admin dùng tính năng '🔄 BÀN GIAO LỚP 1-CLICK' chọn Nhân viên A và Nhân viên B. Hệ thống tự động chuyển danh sách Lớp sinh hoạt và toàn bộ công việc chưa xong từ Nhân viên A sang Nhân viên B chỉ với 1 click.",
        "4_2_Handover_1_Click_Modal.png"
    )

    # Table Summary Test Cases
    add_section_header("BẢNG TỔNG HỢP KẾT QUẢ KIỂM THỬ KỊCH BẢN (TEST MATRIX)")

    table = doc.add_table(rows=6, cols=4)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = 'Table Grid'

    headers = ["Giai Đoạn", "Nội Dung Kiểm Thử", "Kịch Bản & Thao Tác", "Kết Quả"]
    hdr_cells = table.rows[0].cells
    for i, h in enumerate(headers):
        hdr_cells[i].text = h
        set_cell_background(hdr_cells[i], '1E3A8A')
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs:
            r.font.bold = True
            r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    test_data = [
        ("Giai đoạn 1", "Cấu hình tham số & Excel đa học phần", "Cấu hình ngưỡng (2, 3), nhãn #Tags. Import SV 501250101 học 2 Nhóm HP.", "PASSED ✅"),
        ("Giai đoạn 1", "Gán lớp cố định cho Nhân viên CSKH", "Gán lớp CD25CT1 cho Staff 1, lớp CL25TM1 cho Staff 2.", "PASSED ✅"),
        ("Giai đoạn 2", "Điểm danh & Tự động phân task lớp gốc", "Giảng viên điểm danh vắng SV lớp CD25CT1 -> Task tự động về Staff 1.", "PASSED ✅"),
        ("Giai đoạn 3", "CRM Chăm sóc 360° & Hẹn ngày gọi", "Gọi tel:, chọn lý do chuẩn, gắn tag #KhóKhănHọcPhí, hẹn ngày gọi lại, xem Timeline.", "PASSED ✅"),
        ("Giai đoạn 4", "Báo cáo cấm thi & Bàn giao 1-click", "Lọc vắng >= 3 buổi xuất cấm thi, chuyển giao lớp CD25CT1 từ Staff 1 sang Staff 2.", "PASSED ✅"),
    ]

    for row_idx, data in enumerate(test_data, start=1):
        row_cells = table.rows[row_idx].cells
        if row_idx % 2 == 0:
            for c in row_cells:
                set_cell_background(c, 'F8FAFC')

        row_cells[0].text = data[0]
        row_cells[1].text = data[1]
        row_cells[2].text = data[2]
        row_cells[3].text = data[3]

        row_cells[0].paragraphs[0].runs[0].font.bold = True
        row_cells[3].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        row_cells[3].paragraphs[0].runs[0].font.bold = True
        row_cells[3].paragraphs[0].runs[0].font.color.rgb = RGBColor(0x15, 0x80, 0x3D)

    doc.add_paragraph().paragraph_format.space_after = Pt(20)

    # Footer note
    p_foot = doc.add_paragraph("Báo cáo được khởi tạo tự động bởi Antigravity Engine - ITC Student Care System 2026.")
    p_foot.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_foot.runs[0].font.italic = True
    p_foot.runs[0].font.size = Pt(9)
    p_foot.runs[0].font.color.rgb = RGBColor(0x94, 0xA3, 0xB8)

    output_path = r"d:\mean\Bao_Cao_Kiem_Thu_He_Thong_ITC_Care.docx"
    doc.save(output_path)

    # Also save to artifact directory
    artifact_path = r"C:\Users\doann\.gemini\antigravity-ide\brain\11a3f017-3bdd-4efe-ae35-ce8924e993c3\Bao_Cao_Kiem_Thu_He_Thong_ITC_Care.docx"
    doc.save(artifact_path)
    console_msg = f"✅ Word report saved to {output_path} and {artifact_path}"
    print(console_msg)

if __name__ == '__main__':
    create_report()
