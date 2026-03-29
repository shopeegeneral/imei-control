// FAQ Data for Pay Per Piece System
const faqData = [
    {
        id: 1,
        category: "General",
        question: "Pay Per Piece Dashboard là gì?",
        answer: "Pay Per Piece Dashboard là hệ thống quản lý và phân tích năng suất làm việc của nhân viên kho. Hệ thống giúp theo dõi các hoạt động picking, sorting, checking, packing và cung cấp các báo cáo trực quan về hiệu suất làm việc."
    },
    {
        id: 2,
        category: "General",
        question: "Làm sao để tìm kiếm thông tin của tôi?",
        answer: "Vào mục Search trong menu, sau đó nhập ít nhất một trong các thông tin: Warehouse ID, Staff ID, Staff Number, Operator name, hoặc chọn khoảng thời gian (Start Date - End Date). Hệ thống sẽ hiển thị kết quả phù hợp với bộ lọc của bạn."
    },
    {
        id: 3,
        category: "Data & Metrics",
        question: "Productivity được tính như thế nào?",
        answer: "Productivity = Total Items / Total Hours. Ví dụ: nếu bạn xử lý 500 items trong 8 giờ làm việc thì productivity = 500/8 = 62.5 items/hour. Đây là chỉ số quan trọng để đánh giá hiệu suất làm việc."
    },
    {
        id: 4,
        category: "Data & Metrics",
        question: "Total Hours và Direct Hours khác nhau như thế nào?",
        answer: "Total Hours là tổng thời gian làm việc (bao gồm cả thời gian nghỉ giải lao, chờ việc). Direct Hours là thời gian làm việc trực tiếp với hàng hóa (picking, sorting, checking, packing). Indirect Hours = Total Hours - Direct Hours."
    },
    {
        id: 5,
        category: "Data & Metrics",
        question: "Các loại items bao gồm những gì?",
        answer: "Hệ thống theo dõi 4 loại items: Picked (hàng đã pick), Sorted (hàng đã phân loại), Checked (hàng đã kiểm tra), Packed (hàng đã đóng gói). Total Items = tổng của cả 4 loại này."
    },
    {
        id: 6,
        category: "General",
        question: "Tôi có thể xem dữ liệu theo khoảng thời gian không?",
        answer: "Có! Trong form Search, bạn chọn Start Date và End Date để lọc dữ liệu theo khoảng thời gian mong muốn. Ví dụ: từ 01/01/2026 đến 31/01/2026 để xem data tháng 1."
    },
    {
        id: 7,
        category: "Reports & Charts",
        question: "Biểu đồ Productivity Trend cho tôi biết gì?",
        answer: "Biểu đồ này hiển thị xu hướng năng suất làm việc của bạn theo từng ngày. Đường màu xanh dương thể hiện productivity (items/hour), giúp bạn nhìn thấy các ngày có năng suất cao hoặc thấp."
    },
    {
        id: 8,
        category: "Reports & Charts",
        question: "Hours Allocation Chart là gì?",
        answer: "Biểu đồ này cho thấy cách phân bổ thời gian làm việc của bạn cho các hoạt động khác nhau (picking, sorting, checking, packing). Giúp hiểu rõ bạn dành bao nhiêu thời gian cho mỗi công việc."
    },
    {
        id: 9,
        category: "Export & Reports",
        question: "Tôi có thể export dữ liệu không?",
        answer: "Có! Ở trang Results, click nút \"Export to CSV\" để tải về file Excel chứa toàn bộ dữ liệu chi tiết. File này có thể mở bằng Excel, Google Sheets hoặc các phần mềm tương tự."
    },
    {
        id: 10,
        category: "General",
        question: "Tôi muốn xóa bộ lọc và search lại thì làm sao?",
        answer: "Click nút \"Clear Filter\" để xóa toàn bộ các bộ lọc hiện tại và quay về trang search. Hoặc click nút \"Clear\" trong form search để reset các trường nhập liệu."
    },
    {
        id: 11,
        category: "Data & Metrics",
        question: "Dữ liệu được cập nhật khi nào?",
        answer: "Dữ liệu trong hệ thống được đồng bộ từ database PostgreSQL theo thời gian thực. Mỗi lần bạn search, hệ thống sẽ lấy dữ liệu mới nhất từ database."
    },
    {
        id: 12,
        category: "Troubleshooting",
        question: "Tôi không thấy dữ liệu của mình?",
        answer: "Kiểm tra lại các thông tin filter (Warehouse ID, Staff ID, ngày tháng) có chính xác không. Nếu vẫn không có kết quả, có thể dữ liệu chưa được nhập vào hệ thống. Liên hệ admin để kiểm tra."
    }
];

module.exports = faqData;
